import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {DEFAULT_CONFIG, normalizeConfig, NormalizedConfig} from "./config_schema";

/***
 The type that this stage persists message-level state in.
 This is primarily for readability, and not enforced.

 @description This type is saved in the database after each message,
  which makes it ideal for storing things like positions and statuses,
  but not for things like history, which is best managed ephemerally
  in the internal state of the Stage class itself.
 ***/
type EmotionIntensity = "low" | "medium" | "high";

type EmotionSnapshot = {
    tone: string; // coarse label, e.g. "sad", "joy", "neutral"
    intensity: EmotionIntensity;
};

type MessageStateType = {
    lastEmotions?: EmotionSnapshot[]; // bounded array of recent message emotions
    memoryScars?: string[]; // append-only emotional events
    proximity?: "Distant" | "Nearby" | "Touching" | "Intimate";
    phase?: "Neutral" | "Familiar" | "Charged" | "Intimate";
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
            environment,
            initState,
            chatState
        } = data;
        // Null-safe config handling
        const mergedConfig: NormalizedConfig = normalizeConfig(config);

        // Initialize internal message state with safe defaults and any persisted state
        this.myInternalState = messageState != null ? messageState : {
            lastEmotions: [],
            memoryScars: [],
            proximity: "Distant",
            phase: "Neutral"
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
        };
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

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        /***
         This is called after someone presses 'send', but before anything is sent to the LLM.
         ***/
        const {content, anonymizedId, isBot} = userMessage;
        const effectiveConfig = (this as any)._effectiveConfig || this.defaultConfig;
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
        if (currentChatState && currentChatState.scene) {
            const summary = this.summarizeScene(currentChatState.scene);
            if (summary) systemMessage = `Scene summary: ${summary}`;
        }

        const messageState: MessageStateType = {...this.myInternalState};
        return {
            stageDirections: null,
            messageState,
            modifiedMessage: null,
            systemMessage,
            error: null,
            chatState: currentChatState || null,
        };
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        /***
         This is called immediately after a response from the LLM.
         ***/
        const {content, anonymizedId, isBot} = botMessage;
        const effectiveConfig = (this as any)._effectiveConfig || this.defaultConfig;
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
        // Run lightweight analysis hooks (placeholders) that will be expanded later.
        const snapshot: EmotionSnapshot = this.extractEmotionSnapshot(content);
        const priorEmotions = (this.myInternalState.lastEmotions || []);

        // Example: detect a 'scar' keyword and append to memoryScars (append-only, trimmed by memory_depth)
        if (/confess|betray|reject|rejects|rejected/i.test(content)) {
            this.myInternalState.memoryScars = (this.myInternalState.memoryScars || []).concat([content]);
            const depth = ((this as any)._effectiveConfig?.memory_depth) || this.defaultConfig.memory_depth;
            this.myInternalState.memoryScars = this.myInternalState.memoryScars.slice(-depth);
        }

        // Scene capture: update scene context heuristically from the bot message
        const prevChatState: ChatStateType | null = (this as any)._chatState || {scene: null};
        const updatedScene = this.updateSceneFromMessage(prevChatState?.scene || null, content, snapshot);
        const updatedChatState: ChatStateType = {...(prevChatState || {}), scene: updatedScene};
        // persist in internal holder
        (this as any)._chatState = updatedChatState;

        // ----------
        // Escalation / phase logic
        // ----------
        // detect escalation signals in this bot message
        const signals = this.detectEscalationSignals(content, snapshot);
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
        const delta = this.evaluateEmotionalDelta(snapshot, priorEmotions);
        if (delta.detected && effectiveConfig.enabled) {
            // annotation frequency control: strictness 1..3 -> allowed annotations per window
            const s = typeof effectiveConfig.strictness === 'number' ? Math.floor(effectiveConfig.strictness) : 2;
            const allowedByStrictness = ({1: 1, 2: 2, 3: 3} as Record<number, number>)[s] || 2;
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
        if (escalationWarning) {
            systemMessage = systemMessage ? `${systemMessage} — ${escalationWarning}` : escalationWarning;
        }

        return {
            stageDirections: null,
            messageState: this.myInternalState,
            modifiedMessage: null,
            error: null,
            systemMessage,
            chatState: updatedChatState
        };
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
        // This stage is background-only and must not render UI.
        // Return an empty fragment to satisfy the base type while producing no visible UI.
        return <></>;
    }

    // -----------------
    // Helper utilities
    // -----------------
    private extractEmotionSnapshot(text: string): EmotionSnapshot {
        // Very coarse placeholder: real implementation will use heuristic parsing
        if (!text || text.trim().length === 0) return {tone: 'neutral', intensity: 'low'};
        if (/!|\b(am|so|very)\b/i.test(text)) return {tone: 'excited', intensity: 'medium'};
        if (/sad|tear|cry|sorry|regret/i.test(text)) return {tone: 'sad', intensity: 'medium'};
        if (/love|like|cherish|admire/i.test(text)) return {tone: 'affection', intensity: 'medium'};
        return {tone: 'neutral', intensity: 'low'};
    }

    private evaluateEmotionalDelta(current: EmotionSnapshot, recent: EmotionSnapshot[]) {
        // Compare `current` to the recent window (last 3-5). Return a small object describing detection.
        const window = recent.slice(-5);
        if (!window || window.length === 0) return {detected: false, summary: ''};

        // Compute simple metrics: most recent tone, average intensity score
        const intensityScore = (s: EmotionSnapshot) => ({low: 0, medium: 1, high: 2}[s.intensity] ?? 0);
        const avgPrevIntensity = Math.round(window.reduce((a, b) => a + intensityScore(b), 0) / window.length);
        const prevTones = Array.from(new Set(window.map(s => s.tone))).slice(-3);

        const curIntensity = intensityScore(current);
        const toneChanged = prevTones.length === 0 ? false : (prevTones[prevTones.length - 1] !== current.tone);

        // Heuristic: large intensity jump (low->high) OR tone change from several-turn steady state
        const intensityJump = curIntensity - avgPrevIntensity;
        const steadyPrev = prevTones.length >= 2 && prevTones.every(t => t === prevTones[0]);

        const detected = (intensityJump >= 2) || (toneChanged && steadyPrev && Math.abs(intensityJump) >= 1);
        const summary = `from [${prevTones.join(', ')}] (${avgPrevIntensity}) to ${current.tone} (${curIntensity})`;
        return {detected, summary};
    }

    // Detect escalation signals from message content + snapshot. Returns an array of signals with suggested phase.
    private detectEscalationSignals(content: string, snapshot: EmotionSnapshot) {
        const signals: Array<{type: string; suggestedPhase: string; text: string}> = [];
        if (!content || content.trim().length === 0) return signals;

        // Emotional disclosure markers -> Familiar
        if (/I\s+(feel|felt|confess|admit|can't help)/i.test(content) || /confess(ed)?/i.test(content)) {
            signals.push({type: 'emotional_disclosure', suggestedPhase: 'Familiar', text: content.slice(0, 200)});
        }

        // Dependency / need language -> Charged
        if (/I need you|I can't live|depend on you|rely on you|can't (?:do|be)/i.test(content)) {
            signals.push({type: 'dependency', suggestedPhase: 'Charged', text: content.slice(0, 200)});
        }

        // Physical closeness markers -> Charged
        if (/hug|kiss|hold|embrace|press(es|ed)?|near|closer|close to/i.test(content)) {
            signals.push({type: 'physical_closeness', suggestedPhase: 'Charged', text: content.slice(0, 200)});
        }

        // Intimacy markers -> Intimate
        if (/kiss(ed)? on the lips|making love|sex|fellatio|intercourse|nude|strip/i.test(content)) {
            signals.push({type: 'physical_intimacy', suggestedPhase: 'Intimate', text: content.slice(0, 200)});
        }

        // Snapshot-based intensity can boost suggestions (e.g., high intensity affection)
        if (snapshot.tone === 'affection' && snapshot.intensity === 'high') {
            signals.push({type: 'affection_high', suggestedPhase: 'Charged', text: 'high-affection'});
        }

        return signals;
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
