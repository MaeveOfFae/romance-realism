import React, {useEffect, useMemo, useState, type ReactElement} from "react";
import {createPortal} from "react-dom";
import {StageBase, StageResponse, InitialData, Message} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {DEFAULT_CONFIG, normalizeConfig, NormalizedConfig} from "./config_schema";
import type {EmotionSnapshot} from "./analysis_helpers";
import {detectEscalationSignals, evaluateEmotionalDelta, extractEmotionSnapshot} from "./analysis_helpers";

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
    proximity?: "Distant" | "Nearby" | "Touching" | "Intimate";
    phase?: "Neutral" | "Familiar" | "Charged" | "Intimate";
    proximityHistory?: Array<{state: MessageStateType["proximity"]; at: number}>;
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
            const effectiveConfig = (this as any)._effectiveConfig || this.defaultConfig;
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
            let systemMessage: string | null = null;
            // Only emit user-visible system messages at the highest strictness to avoid cluttering the chat log.
            if (strictnessLevel >= 3 && currentChatState && currentChatState.scene) {
                const summary = this.summarizeScene(currentChatState.scene);
                if (summary) systemMessage = `Scene summary: ${summary}`;
            }

            const messageState: MessageStateType = {...this.myInternalState};
            return {
                stageDirections: null,
                messageState,
                state: messageState,
                modifiedMessage: null,
                systemMessage,
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
            const effectiveConfig = (this as any)._effectiveConfig || this.defaultConfig;
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

        // Global system note throttle to prevent "catching" every bot message with annotations.
        const systemNoteHistory: number[] = Array.isArray((this.myInternalState as any).systemNoteHistory)
            ? (this.myInternalState as any).systemNoteHistory
            : [];
        const recentSystemNotes = systemNoteHistory.filter((idx) => idx > turnIndex - 20);
        const allowedSystemNotesPer20 = ({1: 0, 2: 0, 3: 6} as Record<number, number>)[strictnessLevel] ?? 0;
        const canEmitNonCriticalSystemMessage = strictnessLevel >= 3 && recentSystemNotes.length < allowedSystemNotesPer20;
        let criticalSystemNote = false;

        // Run lightweight analysis hooks (placeholders) that will be expanded later.
        const snapshot: EmotionSnapshot = extractEmotionSnapshot(content);
        const priorEmotions = (this.myInternalState.lastEmotions || []);

        // Memory scar system: detect key emotional events and log them
        const scarEvents = this.detectMemoryEvents(content);
        if (scarEvents.length > 0) {
            const now = Date.now();
            const depth = ((this as any)._effectiveConfig?.memory_depth) || this.defaultConfig.memory_depth;
            this.myInternalState.memoryScars = (this.myInternalState.memoryScars || []).concat(
                scarEvents.map(e => ({event: e, text: content.slice(0, 500), at: now}))
            ).slice(-depth);
        }

        // Scene capture: update scene context heuristically from the bot message
        const prevChatState: ChatStateType | null = (this as any)._chatState || {scene: null};
        const updatedScene = this.updateSceneFromMessage(prevChatState?.scene || null, content, snapshot);
        const updatedChatState: ChatStateType = {...(prevChatState || {}), scene: updatedScene};
        // persist in internal holder
        (this as any)._chatState = updatedChatState;

        // Proximity realism gate
        const proximityResult = this.detectProximityTransitions(content);
        let proximityWarning: string | null = null;
        if (proximityResult.skipped) {
            proximityWarning = `System note: proximity jumped to ${proximityResult.next}. Consider describing intermediate steps.`;
        }

        // ----------
        // Escalation / phase logic
        // ----------
        // detect escalation signals in this bot message
        const signals = detectEscalationSignals(content, snapshot);
        this.myInternalState.signalHistory = (this.myInternalState.signalHistory || []).concat(signals).slice(-20);

        // aggregate recent signals across last N turns (simple count)
        const recentSignals = (this.myInternalState.signalHistory || []).slice(-5);
        const phaseOrder = ["Neutral", "Familiar", "Charged", "Intimate"] as const;
        const currentPhase = (this.myInternalState.phase as any) || "Neutral";
        const currentIndex = Math.max(0, phaseOrder.indexOf(currentPhase as any));

        // Count suggested phases from recent signals
        const suggestedCounts: {[k: string]: number} = {};
        for (const s of recentSignals) {
            suggestedCounts[s.suggestedPhase] = (suggestedCounts[s.suggestedPhase] || 0) + 1;
        }

        // Find the highest suggested phase that has >= threshold signals
        const threshold = 2; // require multiple signals across turns
        let targetPhase: typeof phaseOrder[number] | null = null;
        for (let i = phaseOrder.length - 1; i >= 0; i--) {
            const p = phaseOrder[i];
            if ((suggestedCounts[p] || 0) >= threshold) {
                targetPhase = p;
                break;
            }
        }

        let escalationWarning: string | null = null;
        if (targetPhase) {
            const targetIdx = phaseOrder.indexOf(targetPhase);
            if (targetIdx > currentIndex + 1) {
                // skipped at least one phase -> annotate warning
                escalationWarning = `System note: relationship signals suggest ${targetPhase} but current phase is ${currentPhase}. Consider intermediate steps.`;
            } else if (targetIdx === currentIndex + 1) {
                // advance one phase
                this.myInternalState.phase = targetPhase;
                this.myInternalState.phaseHistory = (this.myInternalState.phaseHistory || []).concat([{phase: targetPhase, at: Date.now()}]).slice(-50);
            }
        }

        // Emotional delta evaluation: detect whiplash and optionally attach a user-visible system note.
        let systemMessage: string | null = null;
        const delta = evaluateEmotionalDelta(snapshot, priorEmotions);
        if (delta.detected && effectiveConfig.enabled && canEmitNonCriticalSystemMessage) {
            // annotation frequency control: strictness 1..3 -> allowed annotations per window
            const allowedByStrictness = ({1: 1, 2: 2, 3: 3} as Record<number, number>)[strictnessLevel] || 2;
            this.myInternalState.lastAnnotations = this.myInternalState.lastAnnotations || [];
            // count recent annotations in last 20 messages (approx)
            const recentCount = this.myInternalState.lastAnnotations.filter((idx: number) => idx > turnIndex - 20).length;
            if (recentCount < allowedByStrictness) {
                systemMessage = `System note: abrupt emotional shift detected (${delta.summary}). Consider adding a transitional cue.`;
                this.myInternalState.lastAnnotations.push(turnIndex);
                // cap size of annotations history
                this.myInternalState.lastAnnotations = this.myInternalState.lastAnnotations.slice(-20);
            }
        }

        // append to lastEmotions keeping small buffer after detection
        this.myInternalState.lastEmotions = priorEmotions.concat(snapshot).slice(-5);

        // Merge escalation warning into systemMessage (do not overwrite existing note if present)
        if (escalationWarning && (canEmitNonCriticalSystemMessage || criticalSystemNote || systemMessage != null)) {
            systemMessage = systemMessage ? `${systemMessage} — ${escalationWarning}` : escalationWarning;
        }

        if (proximityWarning && (canEmitNonCriticalSystemMessage || criticalSystemNote || systemMessage != null)) {
            systemMessage = systemMessage ? `${systemMessage} — ${proximityWarning}` : proximityWarning;
        }

        const consentIssues = this.detectConsentIssues(content);
        if (consentIssues.length > 0) {
            criticalSystemNote = true;
            this.myInternalState.consentAlerts = (this.myInternalState.consentAlerts || []).concat([Date.now()]).slice(-50);
            const consentNote = `Consent/agency alert: ${consentIssues.join('; ')}`;
            systemMessage = systemMessage ? `${systemMessage} — ${consentNote}` : consentNote;
        }

        // Subtext highlights (hesitation, avoidance, guarded interest, fear of rejection)
        if (strictnessLevel >= 2 && (canEmitNonCriticalSystemMessage || criticalSystemNote || systemMessage != null)) {
            const subtextNotes = this.detectSubtext(content);
            if (subtextNotes.length > 0) {
                const note = `Subtext: ${subtextNotes.join('; ')}`;
                systemMessage = systemMessage ? `${systemMessage} — ${note}` : note;
            }
        }

        // Silence & pause interpreter
        if (strictnessLevel >= 3 && (canEmitNonCriticalSystemMessage || criticalSystemNote || systemMessage != null)) {
            const silenceNote = this.detectSilenceOrPause(content);
            if (silenceNote) {
                this.myInternalState.silenceHistory = (this.myInternalState.silenceHistory || []).concat([Date.now()]).slice(-50);
                systemMessage = systemMessage ? `${systemMessage} — ${silenceNote}` : silenceNote;
            }
        }

        // Relationship drift detector
        if (strictnessLevel >= 3 && (canEmitNonCriticalSystemMessage || criticalSystemNote || systemMessage != null)) {
            const driftNote = this.detectDrift(priorEmotions, this.myInternalState.phaseHistory || [], effectiveConfig);
            if (driftNote) {
                this.myInternalState.driftNotes = (this.myInternalState.driftNotes || []).concat([turnIndex]).slice(-50);
                systemMessage = systemMessage ? `${systemMessage} — ${driftNote}` : driftNote;
            }
        }

        // Scar recall (avoid spamming: only recall newest scar once)
        if (strictnessLevel >= 3 && (canEmitNonCriticalSystemMessage || criticalSystemNote || systemMessage != null)) {
            const recall = this.recallMemoryScar();
            if (recall) {
                systemMessage = systemMessage ? `${systemMessage} — ${recall}` : recall;
            }
        }

        if (systemMessage != null) {
            // keep a small buffer of recent notes for the in-iframe dropdown
            this.myInternalState.overlayNotes = (this.myInternalState.overlayNotes || [])
                .concat([{text: systemMessage, at: Date.now()}])
                .slice(-10);
            (this.myInternalState as any).systemNoteHistory = recentSystemNotes.concat([turnIndex]).slice(-100);
        }

            return {
                stageDirections: null,
                messageState: this.myInternalState,
                state: this.myInternalState,
                modifiedMessage: null,
                error: null,
                systemMessage,
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

    // -----------------
    // Helper utilities
    // -----------------
    private detectMemoryEvents(content: string): string[] {
        if (!content) return [];
        const hits: string[] = [];
        if (/confess(ed)?|admit(s|ted)?/i.test(content)) hits.push('confession');
        if (/betray(s|ed)?|lie(?:s|d)? to/i.test(content)) hits.push('betrayal');
        if (/reject(s|ed)?|turns you down|pushes you away/i.test(content)) hits.push('rejection');
        if (/argue|fight|conflict|shout at/i.test(content)) hits.push('conflict');
        return hits;
    }

    private detectSubtext(content: string): string[] {
        if (!content) return [];
        const notes: string[] = [];

        if (/(um\b|uh\b|ellipses|\.\.\.|hesitates|pauses)/i.test(content) || /(not sure|maybe|i guess)/i.test(content)) {
            notes.push('hesitation/uncertainty');
        }

        if (/(changes the subject|deflects|avoids eye contact|looks away|shrugs it off)/i.test(content)) {
            notes.push('avoidance');
        }

        if (/(careful not to|holding back|guarded|keeps distance emotionally)/i.test(content)) {
            notes.push('guarded interest');
        }

        if (/(afraid to ask|fear of rejection|worried you'll say no|doesn't want to scare you off)/i.test(content)) {
            notes.push('fear of rejection');
        }

        return notes;
    }

    private recallMemoryScar(): string | null {
        const scars = this.myInternalState.memoryScars || [];
        if (scars.length === 0) return null;
        const lastIdx = this.myInternalState.lastScarRecallIdx ?? -1;
        const targetIdx = scars.length - 1;
        if (targetIdx === lastIdx) return null;
        this.myInternalState.lastScarRecallIdx = targetIdx;
        const scar = scars[targetIdx];
        return `Recall: unresolved ${scar.event} persists. Keep continuity in tone and stakes.`;
    }

    private detectDrift(recentEmotions: EmotionSnapshot[], phaseHistory: Array<{phase: string; at: number}>, cfg: NormalizedConfig): string | null {
        const driftWindow = cfg.strictness === 3 ? 8 : cfg.strictness === 1 ? 15 : 12;
        const recentDriftNotes = (this.myInternalState.driftNotes || []).filter(
            (t: number) => (this.myInternalState.turnIndex || 0) - t < driftWindow,
        );
        if (recentDriftNotes.length > 0) return null;

        const lastPhases = (phaseHistory || []).slice(-3);
        const phaseStable = lastPhases.length >= 2 && new Set(lastPhases.map(p => p.phase)).size === 1;

        const emos = recentEmotions.slice(-5);
        const toneSet = new Set(emos.map(e => e.tone));
        const emotionalStagnant = emos.length >= 3 && toneSet.size <= 1;

        if (phaseStable && emotionalStagnant) {
            return 'Drift detected: relationship and emotion have stagnated. Suggest gentle narrative pressure or new beat.';
        }
        return null;
    }

    private detectSilenceOrPause(content: string): string | null {
        if (content == null) return null;
        const trimmed = content.trim();
        if (trimmed.length === 0) return 'Silence detected: consider clarifying hesitation or disengagement.';

        const short = trimmed.length < 25;
        const nonCommittal = /(maybe|i guess|not sure|could be|i dunno|perhaps)/i.test(trimmed);
        const curt = /^(ok|okay|sure|fine|whatever|yeah)\.?$/i.test(trimmed);

        if (short && (nonCommittal || curt)) {
            return 'Brief/non-committal reply: may signal hesitation or disengagement.';
        }

        if (/\.\.\.|\bpauses\b|\bhesitates\b/i.test(trimmed)) {
            return 'Pause noted: consider leaning into hesitation or giving space.';
        }

        return null;
    }
    private detectProximityTransitions(content: string): {next: MessageStateType["proximity"], skipped: boolean} {
        const order: MessageStateType["proximity"][] = ["Distant", "Nearby", "Touching", "Intimate"];
        const current = this.myInternalState.proximity || "Distant";
        let next: MessageStateType["proximity"] = current;
        if (/across the room|far away|distant/i.test(content)) next = "Distant";
        if (/steps closer|sits beside|next to|nearby|close by/i.test(content)) next = "Nearby";
        if (/touch|hand in hand|holds|brushes|resting on/i.test(content)) next = "Touching";
        if (/embrace tightly|presses against|kiss(?:ing)?|intimate|caress/i.test(content)) next = "Intimate";

        const curIndex = order.indexOf(current);
        const nextIndex = order.indexOf(next);
        const skipped = nextIndex > curIndex + 1;
        if (nextIndex >= 0 && next !== current) {
            this.myInternalState.proximity = next;
            this.myInternalState.proximityHistory = (this.myInternalState.proximityHistory || []).concat([{state: next, at: Date.now()}]).slice(-50);
        }
        return {next, skipped};
    }

    private detectConsentIssues(content: string): string[] {
        if (!content) return [];
        const issues: string[] = [];

        if (/you (?:feel|felt|are overcome|can't help but feel)/i.test(content)) {
            issues.push('assigns emotions to the user');
        }

        if (/(you must|you have no choice|without your consent|ignoring your protest|forces you)/i.test(content)) {
            issues.push('forces decisions/consent onto the user');
        }

        if (/(inside your mind|your thoughts say|your inner voice|you think to yourself)/i.test(content)) {
            issues.push('describes internal monologue for the user');
        }

        return issues;
    }

    // Scene helpers
    private summarizeScene(scene: ChatStateType["scene"] | null): string | null {
        if (!scene) return null;
        const parts: string[] = [];
        if (scene.location) parts.push(`${scene.location}`);
        if (scene.timeOfDay) parts.push(`${scene.timeOfDay}`);
        if (scene.lingeringEmotion) parts.push(`mood: ${scene.lingeringEmotion}`);
        if (Array.isArray(scene.unresolvedBeats) && scene.unresolvedBeats.length > 0) parts.push(`${scene.unresolvedBeats.length} unresolved beats`);
        return parts.length > 0 ? parts.join(' · ') : null;
    }

    private updateSceneFromMessage(prev: ChatStateType["scene"] | null, content: string, snapshot: EmotionSnapshot) {
        const scene = Object.assign({}, prev || {});
        // location heuristics
        const locMatch = content.match(/(?:at|in|on) the ([A-Za-z0-9'\- ]{3,40})/i);
        if (locMatch) scene.location = locMatch[1].trim();
        // time of day heuristics
        const tod = /\b(morning|afternoon|evening|night|noon|midnight|dawn|dusk)\b/i.exec(content);
        if (tod) scene.timeOfDay = tod[1].toLowerCase();
        // lingering emotion from snapshot
        if (snapshot && snapshot.tone && snapshot.tone !== 'neutral') scene.lingeringEmotion = snapshot.tone;
        // unresolved beats: detect phrases suggesting unfinished business
        const unresolvedPatterns = /(?:still|remain|unresolved|unfinished|left hanging|pending)/i;
        if (unresolvedPatterns.test(content)) {
            scene.unresolvedBeats = (scene.unresolvedBeats || []).concat([content.trim()]).slice(-10);
        }
        return scene;
    }

}

// Lightweight, non-intrusive dropdown to surface recent system notes inside the iframe.
// Polls the stage instance for recent overlay notes and renders a toggleable list.
function NoticeOverlay({stageRef}: {stageRef: any}) {
    const [open, setOpen] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const id = window.setInterval(() => setTick((t) => t + 1), 1000);
        return () => window.clearInterval(id);
    }, []);

    const notes = (stageRef?.myInternalState?.overlayNotes as Array<{text: string; at: number}> | undefined) || [];
    const latest = useMemo(() => [...notes].slice(-5).reverse(), [notes, tick]);
    const hasNotes = latest.length > 0;

    const body = typeof document !== 'undefined' ? document.body : null;
    if (!body) return <></>;

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
                {`Realism notes${hasNotes ? ` (${notes.length})` : ''}`}
            </button>
            {open && (
                <div
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
                    {!hasNotes && (
                        <div style={{fontSize: '12px', color: '#666'}}>
                            No notes yet. Notes will appear when the stage emits guidance.
                        </div>
                    )}
                    {latest.map((n, idx) => (
                        <div key={`${n.at}-${idx}`} style={{marginBottom: idx === latest.length - 1 ? 0 : '10px'}}>
                            <div style={{fontWeight: 600, fontSize: '11px', color: '#555'}}>
                                Note • {new Date(n.at).toLocaleTimeString()}
                            </div>
                            <div style={{marginTop: '2px', whiteSpace: 'pre-wrap'}}>{n.text}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return createPortal(overlay, body);
}
