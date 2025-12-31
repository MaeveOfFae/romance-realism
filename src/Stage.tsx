import React, {useEffect, useMemo, useRef, useState, type ReactElement} from "react";
import {createPortal} from "react-dom";
import {StageBase, StageResponse, InitialData, Message} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {DEFAULT_CONFIG, normalizeConfig, NormalizedConfig} from "./config_schema";
import {
    detectConsentIssues,
    detectDrift,
    detectEscalationSignals,
    detectMemoryEvents,
    evaluateEmotionalDelta,
    evaluateProximityTransition,
    extractEmotionSnapshot,
    recallMemoryScar,
    scoreSilenceOrPause,
    scoreSubtext,
    summarizeScene,
    updateSceneFromMessage,
    type EmotionSnapshot,
    type PhaseHistoryEntry,
    type Proximity,
    type ProximityHistoryEntry,
} from "./analysis_helpers";

/***
 The type that this stage persists message-level state in.
 This is primarily for readability, and not enforced.

 @description This type is saved in the database after each message,
  which makes it ideal for storing things like positions and statuses,
  but not for things like history, which is best managed ephemerally
  in the internal state of the Stage class itself.
 ***/
type MessageStateType = {
    lastEmotions?: EmotionSnapshot[]; // bounded array of recent message emotions
    memoryScars?: Array<{event: string; text: string; at: number}>; // append-only emotional events
    lastScarRecallIdx?: number;
    proximity?: Proximity;
    phase?: "Neutral" | "Familiar" | "Charged" | "Intimate";
    proximityHistory?: ProximityHistoryEntry[];
    consentAlerts?: number[];
    silenceHistory?: number[];
    driftNotes?: number[];
    overlayNotes?: Array<{text: string; at: number}>;
    [key: string]: any;
};

/***
 The type of the stage-specific configuration of this stage.

 @description This is for things you want people to be able to configure,
  like background color.
 ***/
type ConfigType = {
    enabled?: boolean;
    strictness?: number; // 1..3
    memory_depth?: number; // 5..30
    [key: string]: any;
};

/***
 The type that this stage persists chat initialization state in.
 If there is any 'constant once initialized' static state unique to a chat,
 like procedurally generated terrain that is only created ONCE and ONLY ONCE per chat,
 it belongs here.
 ***/
type InitStateType = {
    createdAt?: string;
    initialScene?: {
        location?: string;
        timeOfDay?: string;
        lingeringEmotion?: string;
        unresolvedBeats?: string[];
    } | null;
    [key: string]: any;
};

/***
 The type that this stage persists dynamic chat-level state in.
 This is for any state information unique to a chat,
    that applies to ALL branches and paths such as clearing fog-of-war.
 It is usually unlikely you will need this, and if it is used for message-level
    data like player health then it will enter an inconsistent state whenever
    they change branches or jump nodes. Use MessageStateType for that.
 ***/
type ChatStateType = {
    scene?: InitStateType["initialScene"] | null;
    history?: any;
    [key: string]: any;
};

/***
 A simple example class that implements the interfaces necessary for a Stage.
 If you want to rename it, be sure to modify App.js as well.
 @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/stage.ts
 ***/
export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    /***
     A very simple example internal state. Can be anything.
     This is ephemeral in the sense that it isn't persisted to a database,
     but exists as long as the instance does, i.e., the chat page is open.
     ***/
    myInternalState: MessageStateType;
    defaultConfig: NormalizedConfig = {...DEFAULT_CONFIG};

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        /***
         This is the first thing called in the stage,
         to create an instance of it.
         The definition of InitialData is at @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/initial.ts
         Character at @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/character.ts
         User at @link https://github.com/CharHubAI/chub-stages-ts/blob/main/src/types/user.ts
         ***/
        super(data);
        const {
            characters,
            users,
            config,
            messageState,
            chatState
        } = data;
        // Null-safe config handling
        const mergedConfig: NormalizedConfig = normalizeConfig(config);

        // Initialize internal message state with safe defaults and any persisted state
        this.myInternalState = messageState != null ? messageState : {
            lastEmotions: [],
            memoryScars: [],
            proximity: "Distant",
            phase: "Neutral",
            overlayNotes: [],
        };
        this.myInternalState['numUsers'] = users ? Object.keys(users).length : 0;
        this.myInternalState['numChars'] = characters ? Object.keys(characters).length : 0;
        // store merged config for use by analysis methods
        (this as any)._effectiveConfig = mergedConfig;
        // initialize chatState holder
        (this as any)._chatState = chatState || {scene: null};
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {
        /***
         This is called immediately after the constructor, in case there is some asynchronous code you need to
         run on instantiation.
         ***/
        return {
            /*** @type boolean @default null
             @description The 'success' boolean returned should be false IFF (if and only if), some condition is met that means
              the stage shouldn't be run at all and the iFrame can be closed/removed.
              For example, if a stage displays expressions and no characters have an expression pack,
              there is no reason to run the stage, so it would return false here. ***/
            success: true,
            /*** @type null | string @description an error message to show
             briefly at the top of the screen, if any. ***/
            error: null,
            initState: null,
            chatState: null,
            // Provide an initial state so hosts have a registry entry even before the first message.
            messageState: {...this.myInternalState},
            state: {...this.myInternalState},
        } as any;
    }

    async setState(state: MessageStateType): Promise<void> {
        /***
         This can be called at any time, typically after a jump to a different place in the chat tree
         or a swipe. Note how neither InitState nor ChatState are given here. They are not for
         state that is affected by swiping.
         ***/
        if (state != null) {
            // Restore message-level persisted state on swipe/jump
            this.myInternalState = {...this.myInternalState, ...state};
            if (!Array.isArray(this.myInternalState.overlayNotes)) this.myInternalState.overlayNotes = [];
            const effectiveConfig = normalizeConfig((this as any).config);
            (this as any)._effectiveConfig = effectiveConfig;
            const maxNotes = typeof effectiveConfig.ui_max_notes === 'number' ? effectiveConfig.ui_max_notes : this.defaultConfig.ui_max_notes;
            if (Array.isArray(this.myInternalState.overlayNotes)) {
                this.myInternalState.overlayNotes = this.myInternalState.overlayNotes.slice(-maxNotes);
            }
            // enforce caps (memory depth)
            const depth = ((this as any)._effectiveConfig?.memory_depth) || this.defaultConfig.memory_depth;
            if (Array.isArray(this.myInternalState.memoryScars)) {
                this.myInternalState.memoryScars = this.myInternalState.memoryScars.slice(-depth);
            }
            if (Array.isArray(this.myInternalState.lastEmotions)) {
                this.myInternalState.lastEmotions = this.myInternalState.lastEmotions.slice(-5);
            }
        }
    }

    async beforePrompt(_userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        try {
            /***
             This is called after someone presses 'send', but before anything is sent to the LLM.
             ***/
            const effectiveConfig = normalizeConfig((this as any).config);
            (this as any)._effectiveConfig = effectiveConfig;
            const strictnessLevel = typeof effectiveConfig.strictness === 'number'
                ? Math.floor(effectiveConfig.strictness)
                : 2;
            if (!effectiveConfig.enabled) {
                const currentChatState: ChatStateType | null = (this as any)._chatState || null;
                return {
                    stageDirections: null,
                    messageState: {...this.myInternalState},
                    modifiedMessage: null,
                    systemMessage: null,
                    error: null,
                    chatState: currentChatState || null,
                };
            }
            // Scene Carryover Anchor: attach concise system summary when scene is present
            const currentChatState: ChatStateType | null = (this as any)._chatState || null;
            // Notes should only render inside the stage UI (never injected into chat messages).
            this.myInternalState.lastBeforePromptAt = Date.now();
            if (effectiveConfig.ui_enabled && effectiveConfig.note_scene_summary && strictnessLevel >= 2 && currentChatState && currentChatState.scene) {
                const summary = summarizeScene(currentChatState.scene);
                if (summary) {
                    const note = `Scene summary: ${summary}`;
                    if ((this.myInternalState as any).lastSceneSummary !== note) {
                        const maxNotes = typeof effectiveConfig.ui_max_notes === 'number' ? effectiveConfig.ui_max_notes : this.defaultConfig.ui_max_notes;
                        this.myInternalState.overlayNotes = (this.myInternalState.overlayNotes || [])
                            .concat([{text: note, at: Date.now()}])
                            .slice(-maxNotes);
                        (this.myInternalState as any).lastSceneSummary = note;
                    }
                }
            }

            const messageState: MessageStateType = {...this.myInternalState};
            return {
                stageDirections: null,
                messageState,
                state: messageState,
                modifiedMessage: null,
                systemMessage: null,
                error: null,
                chatState: currentChatState || null,
            } as any;
        } catch (e) {
            console.error('Stage beforePrompt error:', e);
            return {
                stageDirections: null,
                messageState: {...this.myInternalState},
                state: {...this.myInternalState},
                modifiedMessage: null,
                systemMessage: null,
                // Do not surface an error to avoid blocking chat; log only.
                error: null,
                chatState: (this as any)._chatState || null,
            } as any;
        }
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        try {
            /***
             This is called immediately after a response from the LLM.
             ***/
            const content = typeof (botMessage as any)?.content === 'string' ? (botMessage as any).content : '';
            const effectiveConfig = normalizeConfig((this as any).config);
            (this as any)._effectiveConfig = effectiveConfig;
            const strictnessLevel = typeof effectiveConfig.strictness === 'number'
                ? Math.floor(effectiveConfig.strictness)
                : 2;
            if (!effectiveConfig.enabled) {
                return {
                    stageDirections: null,
                    messageState: this.myInternalState,
                    modifiedMessage: null,
                    error: null,
                    systemMessage: null,
                    chatState: (this as any)._chatState || null
                };
            }
            const turnIndex = (this.myInternalState.turnIndex || 0) + 1;
            this.myInternalState.turnIndex = turnIndex;
            this.myInternalState.lastAfterResponseAt = Date.now();

        // Global system note throttle to prevent "catching" every bot message with annotations.
        const systemNoteHistory: number[] = Array.isArray((this.myInternalState as any).systemNoteHistory)
            ? (this.myInternalState as any).systemNoteHistory
            : [];
        const recentSystemNotes = systemNoteHistory.filter((idx) => idx > turnIndex - 20);
        const allowedUiNotesPer20 = typeof effectiveConfig.max_ui_notes_per_20 === 'number'
            ? effectiveConfig.max_ui_notes_per_20
            : (({1: 0, 2: 2, 3: 6} as Record<number, number>)[strictnessLevel] ?? 0);
        const canEmitUiNote = Boolean(effectiveConfig.ui_enabled) && recentSystemNotes.length < allowedUiNotesPer20;
        let criticalSystemNote = false;

        type NoteCandidate = {id: string; text: string; score: number; critical?: boolean};
        const candidates: NoteCandidate[] = [];
        const addCandidate = (c: NoteCandidate) => {
            if (!c || !c.text) return;
            candidates.push(c);
            if (c.critical) criticalSystemNote = true;
        };

        // Run lightweight analysis hooks (placeholders) that will be expanded later.
        const snapshot: EmotionSnapshot = extractEmotionSnapshot(content);
        const priorEmotions = (this.myInternalState.lastEmotions || []);

        // Memory scar system: detect key emotional events and log them
        const scarEvents = detectMemoryEvents(content);
        if (scarEvents.length > 0) {
            const now = Date.now();
            const depth = ((this as any)._effectiveConfig?.memory_depth) || this.defaultConfig.memory_depth;
            this.myInternalState.memoryScars = (this.myInternalState.memoryScars || []).concat(
                scarEvents.map(e => ({event: e, text: content.slice(0, 500), at: now}))
            ).slice(-depth);
        }

        // Scene capture: update scene context heuristically from the bot message
        const prevChatState: ChatStateType | null = (this as any)._chatState || {scene: null};
        const updatedScene = updateSceneFromMessage(prevChatState?.scene || null, content, snapshot);
        const updatedChatState: ChatStateType = {...(prevChatState || {}), scene: updatedScene};
        // persist in internal holder
        (this as any)._chatState = updatedChatState;

        // Proximity realism gate
        const proximityResult = evaluateProximityTransition(content, this.myInternalState.proximity);
        let proximityWarning: string | null = null;
        if (proximityResult.skipped) {
            proximityWarning = `System note: proximity jumped to ${proximityResult.next}. Consider describing intermediate steps.`;
        }
        if (proximityResult.changed) {
            const now = Date.now();
            this.myInternalState.proximity = proximityResult.next;
            this.myInternalState.proximityHistory = (this.myInternalState.proximityHistory || []).concat([{state: proximityResult.next, at: now}]).slice(-50);
        }

        // ----------
        // Escalation / phase logic
        // ----------
        // detect escalation signals in this bot message
        const signals = detectEscalationSignals(content, snapshot);
        this.myInternalState.signalHistory = (this.myInternalState.signalHistory || []).concat(signals).slice(-20);

        // Aggregate recent signals across last N turns (weighted)
        const recentSignals = (this.myInternalState.signalHistory || []).slice(-5);
        const phaseOrder = ["Neutral", "Familiar", "Charged", "Intimate"] as const;
        const currentPhase = (this.myInternalState.phase as any) || "Neutral";
        const currentIndex = Math.max(0, phaseOrder.indexOf(currentPhase as any));

        const suggestedWeights: {[k: string]: number} = {};
        for (const s of recentSignals) {
            const w = typeof (s as any).weight === 'number' && Number.isFinite((s as any).weight) ? (s as any).weight : 1;
            suggestedWeights[s.suggestedPhase] = (suggestedWeights[s.suggestedPhase] || 0) + w;
        }

        // Find the highest suggested phase that has enough weight. Strictness 3 is more permissive.
        const phaseThresholdByStrictness = ({1: 6, 2: 4, 3: 3} as Record<number, number>)[strictnessLevel] ?? 4;
        let targetPhase: typeof phaseOrder[number] | null = null;
        for (let i = phaseOrder.length - 1; i >= 0; i--) {
            const p = phaseOrder[i];
            if ((suggestedWeights[p] || 0) >= phaseThresholdByStrictness) {
                targetPhase = p;
                break;
            }
        }

        let escalationWarning: string | null = null;
        if (targetPhase) {
            const targetIdx = phaseOrder.indexOf(targetPhase);
            if (targetIdx > currentIndex) {
                // Always advance at most one phase per message to avoid jerky jumps, but warn on big gaps.
                const nextIdx = Math.min(currentIndex + 1, targetIdx);
                const nextPhase = phaseOrder[nextIdx];
                if (nextPhase !== currentPhase) {
                    this.myInternalState.phase = nextPhase;
                    this.myInternalState.phaseHistory = (this.myInternalState.phaseHistory || []).concat([{phase: nextPhase, at: Date.now()}]).slice(-50);
                }
                if (targetIdx > currentIndex + 1) {
                    escalationWarning = `relationship signals suggest ${targetPhase} but phase is ${currentPhase}. Consider intermediate beats.`;
                }
            }
        }

        // Emotional delta evaluation: detect whiplash and optionally attach a user-visible system note.
        let uiNote: string | null = null;
        const delta = evaluateEmotionalDelta(snapshot, priorEmotions, content);
        const deltaScore = typeof (delta as any).score === 'number' ? (delta as any).score : 0;
        const deltaThresholdByStrictness = ({1: 5, 2: 3, 3: 2} as Record<number, number>)[strictnessLevel] ?? 3;
        if (effectiveConfig.note_emotion_delta && effectiveConfig.enabled && strictnessLevel >= 2 && canEmitUiNote && delta.detected && deltaScore >= deltaThresholdByStrictness) {
            // annotation frequency control: strictness 1..3 -> allowed annotations per window
            const allowedByStrictness = ({1: 1, 2: 2, 3: 3} as Record<number, number>)[strictnessLevel] || 2;
            this.myInternalState.lastAnnotations = this.myInternalState.lastAnnotations || [];
            // count recent annotations in last 20 messages (approx)
            const recentCount = this.myInternalState.lastAnnotations.filter((idx: number) => idx > turnIndex - 20).length;
            if (recentCount < allowedByStrictness) {
                addCandidate({
                    id: 'emotion_delta',
                    text: `abrupt emotional shift detected (${delta.summary}). Consider adding a transitional cue.`,
                    score: deltaScore,
                });
                this.myInternalState.lastAnnotations.push(turnIndex);
                // cap size of annotations history
                this.myInternalState.lastAnnotations = this.myInternalState.lastAnnotations.slice(-20);
            }
        }

        // append to lastEmotions keeping small buffer after detection
        this.myInternalState.lastEmotions = priorEmotions.concat(snapshot).slice(-5);

        // Merge escalation warning into systemMessage (do not overwrite existing note if present)
        if (effectiveConfig.note_phase && escalationWarning) {
            addCandidate({id: 'phase_skip', text: escalationWarning, score: 3});
        }

        if (effectiveConfig.note_proximity && proximityWarning) {
            addCandidate({id: 'proximity_skip', text: proximityWarning.replace(/^System note:\s*/i, ''), score: 3});
        }

        const consentIssues = detectConsentIssues(content);
        if (effectiveConfig.note_consent && consentIssues.length > 0) {
            this.myInternalState.consentAlerts = (this.myInternalState.consentAlerts || []).concat([Date.now()]).slice(-50);
            const weights: Record<string, number> = {
                'assigns emotions to the user': 2,
                'forces decisions/consent onto the user': 6,
                'coercive physical action': 7,
                'describes internal monologue for the user': 2,
                'describes involuntary bodily response for the user': 2,
            };
            const consentScore = consentIssues.reduce((acc, issue) => acc + (weights[issue] ?? 2), 0);
            const isCritical = consentIssues.some((i) => i === 'coercive physical action' || i === 'forces decisions/consent onto the user');
            addCandidate({
                id: 'consent',
                text: `Consent/agency alert: ${consentIssues.join('; ')}`,
                score: consentScore,
                critical: isCritical,
            });
        }

        // Subtext highlights (hesitation, avoidance, guarded interest, fear of rejection)
        if (effectiveConfig.note_subtext && strictnessLevel >= 2) {
            const subtext = scoreSubtext(content);
            const subtextThresholdByStrictness = ({1: 99, 2: 2, 3: 1} as Record<number, number>)[strictnessLevel] ?? 2;
            if (subtext.notes.length > 0 && subtext.score >= subtextThresholdByStrictness) {
                addCandidate({id: 'subtext', text: `Subtext: ${subtext.notes.join('; ')}`, score: subtext.score});
            }
        }

        // Silence & pause interpreter
        if (effectiveConfig.note_silence && strictnessLevel >= 3) {
            const silence = scoreSilenceOrPause(content);
            if (silence.note) {
                this.myInternalState.silenceHistory = (this.myInternalState.silenceHistory || []).concat([Date.now()]).slice(-50);
                addCandidate({id: 'silence', text: silence.note, score: silence.score});
            }
        }

        // Relationship drift detector
        if (effectiveConfig.note_drift && strictnessLevel >= 3) {
            const driftNote = detectDrift({
                recentEmotions: priorEmotions,
                phaseHistory: (this.myInternalState.phaseHistory || []) as PhaseHistoryEntry[],
                strictness: strictnessLevel,
                turnIndex,
                driftNotes: (this.myInternalState.driftNotes || []) as number[],
            });
            if (driftNote) {
                this.myInternalState.driftNotes = (this.myInternalState.driftNotes || []).concat([turnIndex]).slice(-50);
                addCandidate({id: 'drift', text: driftNote, score: 2});
            }
        }

        // Scar recall (avoid spamming: only recall newest scar once)
        if (effectiveConfig.note_scar_recall && strictnessLevel >= 3) {
            const recall = recallMemoryScar(this.myInternalState.memoryScars || [], this.myInternalState.lastScarRecallIdx);
            if (recall.note) {
                this.myInternalState.lastScarRecallIdx = recall.nextIdx;
                addCandidate({id: 'scar_recall', text: recall.note, score: 1});
            }
        }

        if (effectiveConfig.ui_enabled) {
            const maxParts = strictnessLevel >= 3 ? 4 : 2;
            const selected = candidates
                // Critical notes can bypass the UI throttle; others respect it.
                .filter((c) => c.critical || canEmitUiNote)
                .sort((a, b) => (Number(Boolean(b.critical)) * 100 + b.score) - (Number(Boolean(a.critical)) * 100 + a.score))
                .slice(0, maxParts);
            if (selected.length > 0) {
                const parts = selected.map((c) => c.text.replace(/^System note:\s*/i, ''));
                uiNote = `System note: ${parts.join(' — ')}`;
            }
        }

        if (effectiveConfig.ui_enabled && uiNote != null) {
            const maxNotes = typeof effectiveConfig.ui_max_notes === 'number' ? effectiveConfig.ui_max_notes : this.defaultConfig.ui_max_notes;
            // keep a small buffer of recent notes for the in-iframe dropdown
            this.myInternalState.overlayNotes = (this.myInternalState.overlayNotes || [])
                .concat([{text: uiNote, at: Date.now()}])
                .slice(-maxNotes);
            (this.myInternalState as any).systemNoteHistory = recentSystemNotes.concat([turnIndex]).slice(-100);
        }

            return {
                stageDirections: null,
                messageState: this.myInternalState,
                state: this.myInternalState,
                modifiedMessage: null,
                error: null,
                // Never inject notes into the chat log; show them only in the stage UI.
                systemMessage: null,
                chatState: updatedChatState
            } as any;
        } catch (e) {
            console.error('Stage afterResponse error:', e);
            return {
                stageDirections: null,
                messageState: this.myInternalState,
                state: this.myInternalState,
                modifiedMessage: null,
                systemMessage: null,
                // Do not surface an error to avoid blocking chat; log only.
                error: null,
                chatState: (this as any)._chatState || null,
            } as any;
        }
    }


    render(): ReactElement {
        /***
         There should be no "work" done here. Just returning the React element to display.
         If you're unfamiliar with React and prefer video, I've heard good things about
         @link https://scrimba.com/learn/learnreact but haven't personally watched/used it.

         For creating 3D and game components, react-three-fiber
           @link https://docs.pmnd.rs/react-three-fiber/getting-started/introduction
           and the associated ecosystem of libraries are quite good and intuitive.

         Cuberun is a good example of a game built with them.
           @link https://github.com/akarlsten/cuberun (Source)
           @link https://cuberun.adamkarlsten.com/ (Demo)
         ***/
        return <NoticeOverlay stageRef={this} />;
    }

}

// Lightweight, non-intrusive dropdown to surface recent system notes inside the iframe.
// Polls the stage instance for recent overlay notes and renders a toggleable list.
function NoticeOverlay({stageRef}: {stageRef: any}) {
    const [open, setOpen] = useState(false);
    const [tick, setTick] = useState(0);
    const feedRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const id = window.setInterval(() => setTick((t) => t + 1), 1000);
        return () => window.clearInterval(id);
    }, []);

    const cfg = (stageRef as any)?._effectiveConfig || (stageRef as any)?.defaultConfig || {};
    const uiEnabled = !(cfg && cfg.ui_enabled === false);

    const notes = (stageRef?.myInternalState?.overlayNotes as Array<{text: string; at: number}> | undefined) || [];
    const turnIndex = stageRef?.myInternalState?.turnIndex as number | undefined;
    const lastAfterResponseAt = stageRef?.myInternalState?.lastAfterResponseAt as number | undefined;
    const maxNotes = typeof cfg.ui_max_notes === 'number' ? Math.max(1, Math.min(50, Math.floor(cfg.ui_max_notes))) : 10;
    const latest = useMemo(() => [...notes].slice(-maxNotes), [notes, tick, maxNotes]);
    const hasNotes = latest.length > 0;

    useEffect(() => {
        if (!open) return;
        const el = feedRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [open, notes.length]);

    const body = typeof document !== 'undefined' ? document.body : null;
    if (!body) return <></>;
    if (!uiEnabled) return <></>;

    const overlay = (
        <div style={{
            position: 'fixed',
            bottom: '12px',
            right: '12px',
            zIndex: 2147483647,
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#111',
            pointerEvents: 'auto',
        }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={{
                    background: '#f4f4f4',
                    border: '1px solid #d0d0d0',
                    borderRadius: '16px',
                    padding: '6px 10px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    pointerEvents: 'auto',
                }}
                aria-expanded={open}
                aria-label="Show romance realism notes"
            >
                {`Realism notes${hasNotes ? ` (${notes.length})` : ''}${typeof turnIndex === 'number' ? ` · t${turnIndex}` : ''}`}
            </button>
            {open && (
                <div
                    ref={feedRef}
                    style={{
                        marginTop: '6px',
                        width: '260px',
                        maxHeight: '240px',
                        overflowY: 'auto',
                        background: '#fff',
                        border: '1px solid #d0d0d0',
                        borderRadius: '12px',
                        boxShadow: '0 8px 18px rgba(0,0,0,0.16)',
                        padding: '10px',
                        fontSize: '12px',
                        lineHeight: 1.4,
                        pointerEvents: 'auto',
                    }}
                >
                    {cfg.ui_show_status !== false && (
                        <div style={{fontSize: '11px', fontWeight: 600, color: '#555', marginBottom: '8px'}}>
                            {`Status • ${typeof turnIndex === 'number' ? `turn ${turnIndex}` : 'no turns yet'}${typeof lastAfterResponseAt === 'number' ? ` • last response ${new Date(lastAfterResponseAt).toLocaleTimeString()}` : ''}`}
                        </div>
                    )}
                    {!hasNotes && (
                        <div style={{fontSize: '12px', color: '#666'}}>
                            No notes yet. Notes will appear when the stage emits guidance.
                        </div>
                    )}
                    {latest.map((n, idx) => (
                        <div key={`${n.at}-${idx}`} style={{marginBottom: idx === latest.length - 1 ? 0 : '10px'}}>
                            {cfg.ui_show_timestamps !== false && (
                                <div style={{fontWeight: 600, fontSize: '11px', color: '#555'}}>
                                    Note • {new Date(n.at).toLocaleTimeString()}
                                </div>
                            )}
                            <div style={{marginTop: '2px', whiteSpace: 'pre-wrap'}}>{n.text}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return createPortal(overlay, body);
}
