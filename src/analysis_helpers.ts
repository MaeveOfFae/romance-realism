export type EmotionIntensity = "low" | "medium" | "high";

export type EmotionSnapshot = {
    tone: string;
    intensity: EmotionIntensity;
};

export type RelationshipPhase = "Neutral" | "Familiar" | "Charged" | "Intimate";
export type Proximity = "Distant" | "Nearby" | "Touching" | "Intimate";

export type MemoryScar = {event: string; text: string; at: number};
export type PhaseHistoryEntry = {phase: RelationshipPhase; at: number};
export type ProximityHistoryEntry = {state: Proximity; at: number};

function countMatches(text: string, re: RegExp): number {
    const m = text.match(re);
    return m ? m.length : 0;
}

function scoreFromPatterns(text: string, patterns: RegExp[], weight: number = 1): number {
    let score = 0;
    for (const re of patterns) if (re.test(text)) score += weight;
    return score;
}

type WeightedHit = {label: string; weight: number};

function stripQuotedDialogue(text: string): string {
    if (!text) return "";
    // Remove double-quoted dialogue spans to reduce false positives in scene extraction.
    // Keep this lightweight; do not attempt full NLP parsing.
    return text.replace(/"[^"]*"/g, " ");
}

function pushWeighted(hits: WeightedHit[], label: string, weight: number) {
    hits.push({label, weight});
}

function sumWeights(hits: WeightedHit[]): number {
    return hits.reduce((acc, h) => acc + (Number.isFinite(h.weight) ? h.weight : 0), 0);
}

function extractIntensity(text: string): EmotionIntensity {
    const t = text || "";
    let score = 0;

    const exclamations = countMatches(t, /!/g);
    const questions = countMatches(t, /\?/g);
    const allCapsWords = countMatches(t, /\b[A-Z]{3,}\b/g);
    const elongated = countMatches(t, /([a-z])\1{2,}/gi); // "soooo", "noooo"

    if (exclamations >= 1) score += 1;
    if (exclamations >= 3) score += 1;
    if (questions >= 3) score += 1;
    if (allCapsWords >= 2) score += 1;
    if (elongated >= 1) score += 1;

    if (/\b(very|really|so|extremely|absolutely|completely|totally|utterly|incredibly)\b/i.test(t)) score += 1;

    // "high stakes" / highly emotional cues
    if (/\b(furious|devastated|heartbroken|terrified|desperate|sobbing|screaming|shaking|trembling|panicking)\b/i.test(t)) {
        score += 2;
    }

    if (score >= 3) return "high";
    if (score >= 1) return "medium";
    return "low";
}

export function extractEmotionSnapshot(text: string): EmotionSnapshot {
    if (!text || text.trim().length === 0) return {tone: 'neutral', intensity: 'low'};

    const t = text;
    const intensity = extractIntensity(t);

    const sadness = scoreFromPatterns(t, [
        /\b(sad|sorrow|tear(?:s|ful)?|cry(?:ing)?|sob(?:bing)?|regret(?:s|ted)?|heartbroken|grief)\b/i,
        /\b(apolog(?:y|ize|ise)|sorry)\b/i,
        /\b(hurt|aching|broken)\b/i,
    ]);

    const anger = scoreFromPatterns(t, [
        /\b(angry|furious|enraged|livid|mad|rage)\b/i,
        /\b(snaps?|snarls?|glares?|seeth(?:es|ing))\b/i,
        /\b(shouts?|yells?|screams?)\b/i,
        /\bhow dare you\b/i,
    ]);

    const anxiety = scoreFromPatterns(t, [
        /\b(anxious|nervous|worried|uneasy|afraid|scared|fear(?:ful)?|panic(?:s|king)?)\b/i,
        /\b(trembl(?:e|es|ing)|shak(?:e|es|ing))\b/i,
    ]);

    const affection = scoreFromPatterns(t, [
        /\b(love|adore|cherish|admire)\b/i,
        /\b(miss you|care about you)\b/i,
        /\b(affectionately|tenderly|softly)\b/i,
    ]);

    const embarrassment = scoreFromPatterns(t, [
        /\b(blush(?:es|ed|ing)?|flustered|embarrass(?:ed|ing)|self-conscious)\b/i,
    ]);

    const jealousy = scoreFromPatterns(t, [
        /\b(jealous|possessive|envious|envy)\b/i,
    ]);

    const excitement = scoreFromPatterns(t, [
        /\b(excited|thrilled|giddy|eager|can'?t wait)\b/i,
    ]) + (countMatches(t, /!/g) >= 2 ? 1 : 0);

    const tense = scoreFromPatterns(t, [
        /\b(tense|awkward|stiff|rigid|strained)\b/i,
    ]);

    const toneScores: Array<{tone: string; score: number}> = [
        {tone: "affection", score: affection},
        {tone: "angry", score: anger},
        {tone: "anxious", score: anxiety},
        {tone: "sad", score: sadness},
        {tone: "embarrassed", score: embarrassment},
        {tone: "jealous", score: jealousy},
        {tone: "excited", score: excitement},
        {tone: "tense", score: tense},
    ].sort((a, b) => b.score - a.score);

    const best = toneScores[0];
    const tone = best && best.score > 0 ? best.tone : "neutral";

    // Preserve original behavior: explicit sadness/affection keywords imply at least medium intensity.
    const forcedMedium = tone === "sad" || tone === "affection";
    const adjustedIntensity: EmotionIntensity = forcedMedium && intensity === "low" ? "medium" : intensity;

    return {tone, intensity: adjustedIntensity};
}

export function evaluateEmotionalDelta(current: EmotionSnapshot, recent: EmotionSnapshot[], content?: string) {
    const window = recent.slice(-5);
    if (!window || window.length === 0) return {detected: false, summary: '', score: 0, reasons: [] as WeightedHit[]};

    const intensityScore = (s: EmotionSnapshot) => ({low: 0, medium: 1, high: 2}[s.intensity] ?? 0);
    const avgPrevIntensity = Math.round(window.reduce((a, b) => a + intensityScore(b), 0) / window.length);
    const recentTones = window.map((s) => s.tone);
    const lastTone = recentTones[recentTones.length - 1] ?? '';
    const prevTones = Array.from(new Set(recentTones)).slice(-3);

    const curIntensity = intensityScore(current);
    const toneChanged = lastTone.length === 0 ? false : (lastTone !== current.tone);

    const intensityJump = curIntensity - avgPrevIntensity;
    const steadyPrev = recentTones.length >= 3 && recentTones.every(t => t === lastTone);

    const polarity = (tone: string): "pos" | "neg" | "neutral" => {
        if (["affection", "excited"].includes(tone)) return "pos";
        if (["sad", "angry", "anxious", "jealous", "tense"].includes(tone)) return "neg";
        return "neutral";
    };
    const prevPolarity = polarity(lastTone);
    const curPolarity = polarity(current.tone);
    const polarityFlip = prevPolarity !== curPolarity && prevPolarity !== "neutral" && curPolarity !== "neutral";

    const reasons: WeightedHit[] = [];
    if (steadyPrev) pushWeighted(reasons, "steady_previous_window", 1);
    if (toneChanged) pushWeighted(reasons, "tone_changed", 1);
    if (polarityFlip) pushWeighted(reasons, "polarity_flip", 2);
    if (intensityJump >= 1) pushWeighted(reasons, "intensity_jump", Math.min(3, Math.max(1, intensityJump)) * 2);

    // Suppress whiplash when explicit transition cues are present.
    const transitionCues =
        /\b(after a (?:long )?pause|takes a breath|breathes (?:in|out)|softens|voice (?:softens|quiets|drops)|steadying|gently|carefully|hesitates|swallows|manages a smile)\b/i;
    const hasTransitionCue = typeof content === "string" && transitionCues.test(content);
    if (hasTransitionCue) pushWeighted(reasons, "transition_cue_present", -2);

    const score = sumWeights(reasons);
    // Default detection threshold; callers can also use `score` to tune by strictness.
    const detected = score >= 3 && (
        (intensityJump >= 2) ||
        (polarityFlip && steadyPrev && curIntensity >= 1) ||
        (toneChanged && steadyPrev && Math.abs(intensityJump) >= 1)
    );
    const summary = `from [${prevTones.join(', ')}] (${avgPrevIntensity}) to ${current.tone} (${curIntensity})`;
    return {detected, summary, score, reasons};
}

export function detectEscalationSignals(content: string, snapshot: EmotionSnapshot) {
    const signals: Array<{type: string; suggestedPhase: RelationshipPhase; text: string; weight: number}> = [];
    if (!content || content.trim().length === 0) return signals;
    const t = content;

    const pushUnique = (signal: {type: string; suggestedPhase: RelationshipPhase; text: string; weight: number}) => {
        if (signals.some((s) => s.type === signal.type)) return;
        signals.push(signal);
    };

    if (/\b(I\s+(?:feel|felt|confess|admit|can'?t help)\b|\bconfess(?:ed)?\b|\bcome(?:s|ing)? clean\b|\bthe truth is\b)/i.test(t)) {
        pushUnique({type: 'emotional_disclosure', suggestedPhase: 'Familiar', text: t.slice(0, 200), weight: 1});
    }

    if (/\b(I need you|don'?t leave|please stay|I can'?t live|depend on you|rely on you|I can'?t (?:do|be) (?:this|without you))\b/i.test(t)) {
        pushUnique({type: 'dependency', suggestedPhase: 'Charged', text: t.slice(0, 200), weight: 2});
    }

    if (/\b(hugs?|embrace(?:s|d)?|cuddl(?:e|es|ed|ing)|wraps? (?:an?|their) arm|takes? (?:your|his|her|their) hand|interlaces fingers|holds hands|leans? in|moves? closer|closes the distance|press(?:es|ed)? against|rests? (?:a|his|her|their) hand (?:on|against) (?:your|his|her|their) (?:arm|shoulder|waist|back))\b/i.test(t)) {
        pushUnique({type: 'physical_closeness', suggestedPhase: 'Charged', text: t.slice(0, 200), weight: 1});
    }

    if (/\b(kiss(?:es|ed|ing)? on the lips|making love|have sex|sex\b|intercourse|nude|strip(?:s|ped|ping)?|undress(?:es|ed)?|moan(?:s|ed|ing)?|orgasm)\b/i.test(t)) {
        pushUnique({type: 'physical_intimacy', suggestedPhase: 'Intimate', text: t.slice(0, 200), weight: 3});
    }

    if (/\b(you'?re (?:beautiful|pretty|gorgeous|handsome)|can'?t stop looking at you|you look (?:good|amazing)|so cute|so hot|you smell (?:good|nice))\b/i.test(t)) {
        pushUnique({type: 'attraction_language', suggestedPhase: 'Familiar', text: t.slice(0, 200), weight: 1});
    }

    if (/\b(I love you|in love|falling for you|can'?t stop thinking about you)\b/i.test(t)) {
        pushUnique({type: 'love_confession', suggestedPhase: 'Charged', text: t.slice(0, 200), weight: 3});
    }

    if (/\b(date\b|girlfriend\b|boyfriend\b|partner\b|exclusive\b|relationship\b)\b/i.test(t)) {
        pushUnique({type: 'commitment_language', suggestedPhase: 'Charged', text: t.slice(0, 200), weight: 2});
    }

    if (snapshot.tone === 'affection' && snapshot.intensity === 'high') {
        pushUnique({type: 'affection_high', suggestedPhase: 'Charged', text: 'high-affection', weight: 1});
    }

    return signals;
}

// -----------------------------
// Romance realism heuristics
// -----------------------------

export function detectMemoryEvents(content: string): string[] {
    if (!content) return [];
    const t = content;
    const hits = new Set<string>();

    if (
        /\b(confess(?:ed)?|admit(?:s|ted)?|come(?:s|ing)? clean|the truth is)\b/i.test(t) ||
        /\b(I (?:need|have) to be honest|I have to tell you something|I should tell you|I owe you the truth)\b/i.test(t)
    ) {
        hits.add('confession');
    }

    if (
        /\b(betray(?:s|ed)?|cheat(?:s|ed|ing)?|deceiv(?:e|es|ed)|gaslight(?:s|ed|ing)?|lie(?:s|d)? to)\b/i.test(t) ||
        /\b(hid(?:es|ing)? it|kept it from you|kept this from you|went behind your back)\b/i.test(t)
    ) {
        hits.add('betrayal');
    }

    if (
        /\b(reject(?:s|ed)?|turns you down|pushes you away|not interested|breaks up|says no)\b/i.test(t) ||
        /\b(let'?s just be friends|I don'?t feel that way|not like that|I can'?t be with you|we shouldn'?t)\b/i.test(t)
    ) {
        hits.add('rejection');
    }

    if (
        /\b(argue(?:s|d)?|fight(?:s|ing)?|conflict|shout(?:s|ed|ing)?|yell(?:s|ed|ing)?|storm(?:s|ed)? off|slams? the door|snaps? at)\b/i.test(t) ||
        /\b(gives the silent treatment|won'?t talk to|refuses to speak)\b/i.test(t)
    ) {
        hits.add('conflict');
    }

    return Array.from(hits);
}

export function detectSubtext(content: string): string[] {
    return scoreSubtext(content).notes;
}

export function scoreSubtext(content: string): {notes: string[]; score: number; reasons: WeightedHit[]} {
    if (!content) return {notes: [], score: 0, reasons: []};
    const notes = new Set<string>();
    const reasons: WeightedHit[] = [];
    const t = content;

    if (/\b(um|uh|er)\b/i.test(t) || /\.\.\./.test(t) || /\b(hesitates|pauses)\b/i.test(t) || /\b(not sure|maybe|i guess)\b/i.test(t)) {
        notes.add('hesitation/uncertainty');
        pushWeighted(reasons, 'hesitation/uncertainty', 1);
    }

    if (/\b(changes the subject|deflects|dodges the question|avoids eye contact|looks away|shrugs it off)\b/i.test(t)) {
        notes.add('avoidance');
        pushWeighted(reasons, 'avoidance', 2);
    }

    if (/\b(careful not to|holding back|guarded|keeps distance emotionally|measured tone|doesn'?t say it outright)\b/i.test(t)) {
        notes.add('guarded interest');
        pushWeighted(reasons, 'guarded interest', 1);
    }

    if (/\b(afraid to ask|fear of rejection|worried you'?ll say no|doesn'?t want to scare you off)\b/i.test(t)) {
        notes.add('fear of rejection');
        pushWeighted(reasons, 'fear of rejection', 2);
    }

    if (/\b(swallow(?:s|ed)?|fidgets?|chews? (?:their|his|her|their) lip|voice (?:drops|quiet|small))\b/i.test(t)) {
        notes.add('nervous tell');
        pushWeighted(reasons, 'nervous tell', 1);
    }

    return {notes: Array.from(notes), score: sumWeights(reasons), reasons};
}

export function recallMemoryScar(scars: MemoryScar[], lastScarRecallIdx: number | null | undefined) {
    if (!Array.isArray(scars) || scars.length === 0) return {note: null as string | null, nextIdx: lastScarRecallIdx ?? -1};
    const priorIdx = lastScarRecallIdx ?? -1;
    const targetIdx = scars.length - 1;
    if (targetIdx === priorIdx) return {note: null as string | null, nextIdx: priorIdx};
    const scar = scars[targetIdx];
    return {
        note: `Recall: unresolved ${scar.event} persists. Keep continuity in tone and stakes.`,
        nextIdx: targetIdx,
    };
}

export function detectDrift(params: {
    recentEmotions: EmotionSnapshot[];
    phaseHistory: PhaseHistoryEntry[];
    strictness: number;
    turnIndex: number;
    driftNotes: number[];
}): string | null {
    const driftWindow = params.strictness === 3 ? 8 : params.strictness === 1 ? 15 : 12;
    const recentDriftNotes = (params.driftNotes || []).filter((t) => params.turnIndex - t < driftWindow);
    if (recentDriftNotes.length > 0) return null;

    const lastPhases = (params.phaseHistory || []).slice(-3);
    const phaseStable = lastPhases.length >= 2 && new Set(lastPhases.map((p) => p.phase)).size === 1;

    const emos = (params.recentEmotions || []).slice(-5);
    const toneSet = new Set(emos.map((e) => e.tone));
    const emotionalStagnant = emos.length >= 3 && toneSet.size <= 1;

    if (phaseStable && emotionalStagnant) {
        return 'Drift detected: relationship and emotion have stagnated. Suggest gentle narrative pressure or new beat.';
    }
    return null;
}

export function detectSilenceOrPause(content: string): string | null {
    return scoreSilenceOrPause(content).note;
}

export function scoreSilenceOrPause(content: string): {note: string | null; score: number; reasons: WeightedHit[]} {
    if (content == null) return {note: null, score: 0, reasons: []};
    const trimmed = content.trim();
    if (trimmed.length === 0) {
        return {note: 'Silence detected: consider clarifying hesitation or disengagement.', score: 3, reasons: [{label: 'silence', weight: 3}]};
    }

    const short = trimmed.length < 25;
    const nonCommittal = /(maybe|i guess|not sure|could be|i dunno|perhaps)/i.test(trimmed);
    const curt = /^(ok|okay|sure|fine|whatever|yeah)\.?$/i.test(trimmed);

    if (short && (nonCommittal || curt)) {
        const reasons: WeightedHit[] = [];
        pushWeighted(reasons, 'brief_reply', 1);
        if (nonCommittal) pushWeighted(reasons, 'non_committal', 1);
        if (curt) pushWeighted(reasons, 'curt', 1);
        return {note: 'Brief/non-committal reply: may signal hesitation or disengagement.', score: sumWeights(reasons), reasons};
    }

    if (/\.\.\.|\bpauses\b|\bhesitates\b/i.test(trimmed)) {
        return {note: 'Pause noted: consider leaning into hesitation or giving space.', score: 2, reasons: [{label: 'pause', weight: 2}]};
    }

    return {note: null, score: 0, reasons: []};
}

export function evaluateProximityTransition(
    content: string,
    current: Proximity | null | undefined,
): {next: Proximity; skipped: boolean; changed: boolean; score: number; evidence: Proximity[]} {
    const order: Proximity[] = ["Distant", "Nearby", "Touching", "Intimate"];
    const cur = current || "Distant";
    const t = content || "";

    // Collect all proximity evidence present in the message.
    const evidence: Proximity[] = [];
    const addEvidence = (p: Proximity, re: RegExp) => {
        if (re.test(t)) evidence.push(p);
    };

    addEvidence("Distant", /\b(across the room|keeps (?:his|her|their) distance|stands back|far away)\b/i);
    addEvidence("Nearby", /\b(steps closer|approaches?|closes the distance|sits beside|next to|nearby|close by|leans closer)\b/i);
    // Avoid adjective false positives like "a touching moment" by requiring an object/target for touch.
    addEvidence("Touching", /\b(hand in hand|holds?|takes? (?:your|his|her|their) hand|interlaces fingers|brush(?:es|ed)? (?:your|his|her|their)?\s*(?:hand|fingers|arm)|rests? (?:a|his|her|their) hand (?:on|against)|hand on|caress(?:es|ed)?|touch(?:es|ed|ing)?\s+(?:you|him|her|them|your|his|her|their))\b/i);
    addEvidence("Intimate", /\b(embrace(?:s|d)? tightly|press(?:es|ed)? against|kiss(?:es|ed|ing)?|straddles|in (?:his|her|their) lap)\b/i);

    const uniqEvidence = Array.from(new Set(evidence));
    const highest = (p: Proximity[]) => p.reduce((acc, curP) => (order.indexOf(curP) > order.indexOf(acc) ? curP : acc), "Distant" as Proximity);
    const next = uniqEvidence.length > 0 ? highest(uniqEvidence) : cur;

    const curIndex = order.indexOf(cur);
    const nextIndex = order.indexOf(next);
    const intermediate = order.slice(curIndex + 1, nextIndex);
    const hasIntermediateEvidence = intermediate.some((p) => uniqEvidence.includes(p));
    const skipped = nextIndex > curIndex + 1 && !hasIntermediateEvidence;
    const changed = next !== cur;
    const score = skipped ? 3 : changed ? 1 : 0;
    return {next, skipped, changed, score, evidence: uniqEvidence};
}

export function detectConsentIssues(content: string): string[] {
    if (!content) return [];
    const issues = new Set<string>();
    const t = content;
    // Anchor "you feel/think..." assertions to sentence boundaries to avoid interrogatives like "Do you feel...?"
    const boundary = /(^|[.!?]\s+|;\s+|:\s+)\s*/i;
    if (new RegExp(`${boundary.source}you\\s+(?:feel|felt|are overcome|can'?t help but feel|can'?t resist)\\b`, "i").test(t)) {
        issues.add('assigns emotions to the user');
    }

    if (/\b(you must|you have no choice|without your consent|against your will|ignoring your protest|forces you|doesn'?t let you|won'?t let you)\b/i.test(t)) {
        issues.add('forces decisions/consent onto the user');
    }

    if (/\b(grabs you|pins you|holds you down|forces a kiss|pushes you onto|gropes you)\b/i.test(t)) {
        issues.add('coercive physical action');
    }

    if (/\b(inside your mind|your thoughts say|your inner voice)\b/i.test(t) || new RegExp(`${boundary.source}you\\s+(?:think to yourself|think|wonder|remember)\\b`, "i").test(t)) {
        issues.add('describes internal monologue for the user');
    }

    if (/\b(your body (?:betrays|responds)|a shiver runs through you)\b/i.test(t)) {
        issues.add('describes involuntary bodily response for the user');
    }

    return Array.from(issues);
}

export type SceneState = {
    location?: string;
    timeOfDay?: string;
    lingeringEmotion?: string;
    unresolvedBeats?: string[];
};

export function summarizeScene(scene: SceneState | null | undefined): string | null {
    if (!scene) return null;
    const parts: string[] = [];
    if (scene.location) parts.push(`${scene.location}`);
    if (scene.timeOfDay) parts.push(`${scene.timeOfDay}`);
    if (scene.lingeringEmotion) parts.push(`mood: ${scene.lingeringEmotion}`);
    if (Array.isArray(scene.unresolvedBeats) && scene.unresolvedBeats.length > 0) parts.push(`${scene.unresolvedBeats.length} unresolved beats`);
    return parts.length > 0 ? parts.join(' · ') : null;
}

export function updateSceneFromMessage(prev: SceneState | null | undefined, content: string, snapshot: EmotionSnapshot): SceneState {
    const scene: SceneState = Object.assign({}, prev || {});
    const t = content;
    const narrative = stripQuotedDialogue(t);
    const locMatch = narrative.match(/\b(?:at|in|inside|into|on|by)\s+(?:the|a|an)\s+([A-Za-z0-9'’\- ]{3,60})\b/i);
    if (locMatch) {
        const candidate = locMatch[1].trim();
        const normalized = candidate.toLowerCase().replace(/\s+/g, " ").trim();
        const stop = new Set([
            "end",
            "beginning",
            "middle",
            "moment",
            "meantime",
            "world",
            "way",
            "time",
            "morning",
            "afternoon",
            "evening",
            "night",
            "dark",
            "light",
        ]);
        if (!stop.has(normalized) && !/^(end|the end|the beginning|the moment|the meantime)$/.test(normalized)) {
            scene.location = candidate;
        }
    }

    const tod = /\b(early morning|morning|afternoon|evening|late night|night|noon|midnight|dawn|dusk|tonight)\b/i.exec(narrative);
    if (tod) scene.timeOfDay = tod[1].toLowerCase().replace(/\s+/g, " ");

    if (snapshot && snapshot.tone && snapshot.tone !== 'neutral') scene.lingeringEmotion = snapshot.tone;

    const unresolvedPatterns = /\b(?:still|remain|unresolved|unfinished|left hanging|pending|unspoken|between them)\b/i;
    if (unresolvedPatterns.test(t)) {
        scene.unresolvedBeats = (scene.unresolvedBeats || []).concat([t.trim()]).slice(-10);
    }
    return scene;
}
