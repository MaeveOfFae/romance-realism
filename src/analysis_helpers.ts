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

function isNegatedAt(text: string, matchIndex: number, windowChars: number = 24): boolean {
    if (!text || matchIndex <= 0) return false;
    const start = Math.max(0, matchIndex - windowChars);
    const prefix = text.slice(start, matchIndex);
    // If there's a hard boundary punctuation close-by, treat as not negating this match.
    if (/[.!?;,]/.test(prefix)) return false;
    return /\b(?:not|never|no|hardly|scarcely|without|isn'?t|aren'?t|don'?t|didn'?t|won'?t|can'?t|couldn'?t)\b/i.test(prefix);
}

function scoreRegexWithNegation(text: string, re: RegExp, weight: number, label: string): {score: number; reasons: WeightedHit[]} {
    if (!text) return {score: 0, reasons: []};
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const global = new RegExp(re.source, flags);
    let m: RegExpExecArray | null;
    let score = 0;
    let count = 0;
    const maxCount = 6;
    while ((m = global.exec(text)) != null) {
        if (m.index == null) continue;
        if (isNegatedAt(text, m.index)) continue;
        score += weight;
        count += 1;
        if (count >= maxCount) break;
    }
    return {score, reasons: score !== 0 ? [{label, weight: score}] : []};
}

function hasAffirmedMatch(text: string, re: RegExp): boolean {
    if (!text) return false;
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const global = new RegExp(re.source, flags);
    let m: RegExpExecArray | null;
    while ((m = global.exec(text)) != null) {
        if (m.index == null) continue;
        if (isNegatedAt(text, m.index)) continue;
        return true;
    }
    return false;
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

export function scoreEmotionSnapshot(text: string): {
    snapshot: EmotionSnapshot;
    toneScores: Array<{tone: string; score: number; reasons: WeightedHit[]}>;
} {
    if (!text || text.trim().length === 0) {
        return {snapshot: {tone: "neutral", intensity: "low"}, toneScores: []};
    }
    const t = text;
    const intensity = extractIntensity(t);

    const toneScore = (tone: string, parts: Array<{label: string; re: RegExp; weight: number}>) => {
        const reasons: WeightedHit[] = [];
        let score = 0;
        for (const p of parts) {
            const hit = scoreRegexWithNegation(t, p.re, p.weight, p.label);
            score += hit.score;
            if (hit.reasons.length) reasons.push(...hit.reasons);
        }
        return {tone, score, reasons};
    };

    const sadness = toneScore("sad", [
        {label: "sad_words", re: /\b(sad|sorrow|tear(?:s|ful)?|cry(?:ing)?|sob(?:bing)?|regret(?:s|ted)?|heartbroken|grief|mourn(?:s|ing)?)\b/i, weight: 2},
        {label: "apology", re: /\b(apolog(?:y|ize|ise)|sorry)\b/i, weight: 1},
        {label: "hurt", re: /\b(hurt|aching|broken|heavy in (?:his|her|their|your) chest)\b/i, weight: 1},
        {label: "sigh", re: /\b(sighs?|voice cracks?|wipes? (?:a|his|her|their) tears?)\b/i, weight: 1},
    ]);

    const anger = toneScore("angry", [
        {label: "anger_words", re: /\b(angry|furious|enraged|livid|mad|rage)\b/i, weight: 2},
        {label: "aggressive_verbs", re: /\b(snaps?|snarls?|glares?|seeth(?:es|ing)|growls?)\b/i, weight: 2},
        {label: "shouting", re: /\b(shouts?|yells?|screams?)\b/i, weight: 2},
        {label: "dare", re: /\bhow dare you\b/i, weight: 2},
    ]);

    const anxiety = toneScore("anxious", [
        {label: "anxiety_words", re: /\b(anxious|nervous|worried|uneasy|afraid|scared|fear(?:ful)?|panic(?:s|king)?|dread)\b/i, weight: 2},
        {label: "tremble", re: /\b(trembl(?:e|es|ing)|shak(?:e|es|ing)|fidgets?|wrings? (?:his|her|their) hands)\b/i, weight: 1},
        {label: "racing", re: /\b(heart races|can'?t breathe|short of breath)\b/i, weight: 1},
    ]);

    const affection = toneScore("affection", [
        {label: "love_words", re: /\b(love|adore|cherish|treasure|fond)\b/i, weight: 2},
        {label: "care_miss", re: /\b(miss you|care about you)\b/i, weight: 2},
        {label: "tender", re: /\b(affectionately|tenderly|softly|warmly|gentle|with a soft smile)\b/i, weight: 1},
        {label: "smile", re: /\b(smiles?|grins?)\b/i, weight: 1},
    ]);

    const embarrassment = toneScore("embarrassed", [
        {label: "blush", re: /\b(blush(?:es|ed|ing)?|flustered|embarrass(?:ed|ing)|self-conscious|flush(?:es|ed)?)\b/i, weight: 2},
        {label: "awkward_tells", re: /\b(looks away|averts (?:his|her|their) gaze|clears? (?:his|her|their) throat|stammers?)\b/i, weight: 1},
    ]);

    const jealousy = toneScore("jealous", [
        {label: "jealous_words", re: /\b(jealous|possessive|envious|envy)\b/i, weight: 2},
        {label: "tightens", re: /\b(something tightens|a sting of jealousy|can'?t stand the thought)\b/i, weight: 1},
    ]);

    const excitement = toneScore("excited", [
        {label: "excited_words", re: /\b(excited|thrilled|giddy|eager|delighted|can'?t wait)\b/i, weight: 2},
        {label: "laugh", re: /\b(laughs?|chuckles?)\b/i, weight: 1},
        {label: "bright", re: /\b(eyes light up|can'?t help but smile)\b/i, weight: 1},
    ]);

    const tense = toneScore("tense", [
        {label: "tense_words", re: /\b(tense|awkward|stiff|rigid|strained|uneasy)\b/i, weight: 2},
        {label: "silence", re: /\b(an awkward silence|a beat of silence)\b/i, weight: 1},
        {label: "hesitation", re: /\b(pauses?|hesitates?|swallows?)\b/i, weight: 1},
    ]);

    const toneScores = [affection, anger, anxiety, sadness, embarrassment, jealousy, excitement, tense]
        .sort((a, b) => b.score - a.score);

    const best = toneScores[0];
    const tone = best && best.score > 0 ? best.tone : "neutral";

    // Preserve original behavior: explicit sadness/affection keywords imply at least medium intensity.
    const forcedMedium = tone === "sad" || tone === "affection";
    const adjustedIntensity: EmotionIntensity = forcedMedium && intensity === "low" ? "medium" : intensity;

    return {snapshot: {tone, intensity: adjustedIntensity}, toneScores};
}

export function extractEmotionSnapshot(text: string): EmotionSnapshot {
    return scoreEmotionSnapshot(text).snapshot;
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
    const absIntensityJump = Math.abs(intensityJump);
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
    if (absIntensityJump >= 1) {
        const label = intensityJump >= 0 ? "intensity_spike" : "intensity_drop";
        pushWeighted(reasons, label, Math.min(3, absIntensityJump) * 2);
    }

    // Suppress whiplash when explicit transition cues are present.
    const transitionCues =
        /\b(after a (?:long )?pause|takes a breath|breathes (?:in|out)|softens|voice (?:softens|quiets|drops)|steadying|gently|carefully|hesitates|swallows|manages a smile)\b/i;
    const hasTransitionCue = typeof content === "string" && transitionCues.test(content);
    if (hasTransitionCue) pushWeighted(reasons, "transition_cue_present", -2);

    const score = sumWeights(reasons);
    // Default detection threshold; callers can also use `score` to tune by strictness.
    const detected = score >= 3 && (
        (absIntensityJump >= 2) ||
        (polarityFlip && steadyPrev && curIntensity >= 1) ||
        (toneChanged && steadyPrev && absIntensityJump >= 1)
    );
    const intensityWord = (n: number) => (n <= 0 ? "low" : n === 1 ? "medium" : "high");
    const prevToneLabel = lastTone && lastTone.length > 0 ? lastTone : "neutral";
    const summary = `${prevToneLabel}/${intensityWord(avgPrevIntensity)} → ${current.tone}/${intensityWord(curIntensity)}${prevTones.length > 1 ? ` (recent tones: ${prevTones.join(", ")})` : ""}`;
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

    if (hasAffirmedMatch(t, /\b(I\s+(?:feel|felt|confess|admit|can'?t help)\b|\bconfess(?:ed)?\b|\bcome(?:s|ing)? clean\b|\bthe truth is\b)/i)) {
        pushUnique({type: 'emotional_disclosure', suggestedPhase: 'Familiar', text: t.slice(0, 200), weight: 1});
    }

    if (hasAffirmedMatch(t, /\b(I need you|don'?t leave|please stay|I can'?t live|depend on you|rely on you|I can'?t (?:do|be) (?:this|without you))\b/i)) {
        pushUnique({type: 'dependency', suggestedPhase: 'Charged', text: t.slice(0, 200), weight: 2});
    }

    if (hasAffirmedMatch(t, /\b(hugs?|embrace(?:s|d)?|cuddl(?:e|es|ed|ing)|wraps? (?:an?|their) arm|takes? (?:your|his|her|their) hand|interlaces fingers|holds hands|leans? in|moves? closer|closes the distance|press(?:es|ed)? against|rests? (?:a|his|her|their) hand (?:on|against) (?:your|his|her|their) (?:arm|shoulder|waist|back))\b/i)) {
        pushUnique({type: 'physical_closeness', suggestedPhase: 'Charged', text: t.slice(0, 200), weight: 1});
    }

    if (hasAffirmedMatch(t, /\b(kiss(?:es|ed|ing)?(?:\s+(?:you|me|him|her|them))?\s+on the lips|making love|have sex|sex\b|intercourse|nude|strip(?:s|ped|ping)?|undress(?:es|ed)?|moan(?:s|ed|ing)?|orgasm)\b/i)) {
        pushUnique({type: 'physical_intimacy', suggestedPhase: 'Intimate', text: t.slice(0, 200), weight: 3});
    }

    if (hasAffirmedMatch(t, /\b(you'?re (?:beautiful|pretty|gorgeous|handsome)|can'?t stop looking at you|you look (?:good|amazing)|so cute|so hot|you smell (?:good|nice))\b/i)) {
        pushUnique({type: 'attraction_language', suggestedPhase: 'Familiar', text: t.slice(0, 200), weight: 1});
    }

    if (hasAffirmedMatch(t, /\b(I love you|in love|falling for you|can'?t stop thinking about you)\b/i)) {
        pushUnique({type: 'love_confession', suggestedPhase: 'Charged', text: t.slice(0, 200), weight: 3});
    }

    if (hasAffirmedMatch(t, /\b(date\b|girlfriend\b|boyfriend\b|partner\b|exclusive\b|relationship\b)\b/i)) {
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
        hasAffirmedMatch(t, /\b(confess(?:ed)?|admit(?:s|ted)?|come(?:s|ing)? clean|the truth is)\b/i) ||
        hasAffirmedMatch(t, /\b(I (?:need|have) to be honest|I have to tell you something|I should tell you|I owe you the truth)\b/i)
    ) {
        hits.add('confession');
    }

    if (
        hasAffirmedMatch(t, /\b(betray(?:s|ed)?|cheat(?:s|ed|ing)?|deceiv(?:e|es|ed)|gaslight(?:s|ed|ing)?)\b/i) ||
        hasAffirmedMatch(t, /\b(lie(?:s|d)? to you|lied to you|lying to you)\b/i) ||
        hasAffirmedMatch(t, /\b(hid(?:es|ing)? it|kept it from you|kept this from you|went behind your back|broke your trust)\b/i)
    ) {
        hits.add('betrayal');
    }

    if (
        hasAffirmedMatch(t, /\b(reject(?:s|ed)?|turns you down|pushes you away|not interested|breaks up|says no)\b/i) ||
        hasAffirmedMatch(t, /\b(let'?s just be friends|I don'?t feel that way|not like that|I can'?t be with you|we shouldn'?t)\b/i)
    ) {
        hits.add('rejection');
    }

    if (
        hasAffirmedMatch(t, /\b(argue(?:s|d)?|fight(?:s|ing)?|conflict|shout(?:s|ed|ing)?|yell(?:s|ed|ing)?|storm(?:s|ed)? off|slams? the door|snaps? at)\b/i) ||
        hasAffirmedMatch(t, /\b(gives the silent treatment|won'?t talk to|refuses to speak)\b/i)
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

    if (
        hasAffirmedMatch(t, /\b(um|uh|er)\b/i) ||
        hasAffirmedMatch(t, /\.\.\./) ||
        hasAffirmedMatch(t, /\b(hesitates|pauses)\b/i) ||
        hasAffirmedMatch(t, /\b(not sure|maybe|i guess|i suppose)\b/i)
    ) {
        notes.add('hesitation/uncertainty');
        pushWeighted(reasons, 'hesitation/uncertainty', 1);
    }

    if (
        hasAffirmedMatch(t, /\b(changes the subject|deflects|dodges the question|avoids eye contact|looks away|shrugs it off|doesn'?t answer)\b/i) ||
        hasAffirmedMatch(t, /\b(anyway|besides|doesn'?t matter|let'?s not)\b/i)
    ) {
        notes.add('avoidance');
        pushWeighted(reasons, 'avoidance', 2);
    }

    if (hasAffirmedMatch(t, /\b(careful not to|holding back|guarded|keeps distance emotionally|measured tone|doesn'?t say it outright)\b/i)) {
        notes.add('guarded interest');
        pushWeighted(reasons, 'guarded interest', 1);
    }

    if (hasAffirmedMatch(t, /\b(afraid to ask|fear of rejection|worried you'?ll say no|doesn'?t want to scare you off)\b/i)) {
        notes.add('fear of rejection');
        pushWeighted(reasons, 'fear of rejection', 2);
    }

    if (hasAffirmedMatch(t, /\b(swallow(?:s|ed)?|fidgets?|chews? (?:their|his|her|their) lip|voice (?:drops|quiet|small)|hands? (?:shake|tremble))\b/i)) {
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
    const templates: Record<string, string> = {
        confession: 'Recall: a confession is still in the air. Keep stakes and vulnerability consistent.',
        betrayal: 'Recall: a betrayal/lie still hangs between them. Trust tension should persist until repaired.',
        rejection: 'Recall: rejection still stings. Avoid sudden comfort without a repair beat.',
        conflict: 'Recall: conflict remains unresolved. Consider apology/clarification before softening too far.',
    };
    return {
        note: templates[scar.event] || `Recall: unresolved ${scar.event} persists. Keep continuity in tone and stakes.`,
        nextIdx: targetIdx,
    };
}

export function detectDrift(params: {
    recentEmotions: EmotionSnapshot[];
    phaseHistory: PhaseHistoryEntry[];
    strictness: number;
    turnIndex: number;
    driftNotes: number[];
    recentSignalWeight?: number;
    proximityChanged?: boolean;
}): string | null {
    const driftWindow = params.strictness === 3 ? 8 : params.strictness === 1 ? 15 : 12;
    const recentDriftNotes = (params.driftNotes || []).filter((t) => params.turnIndex - t < driftWindow);
    if (recentDriftNotes.length > 0) return null;

    const lastPhases = (params.phaseHistory || []).slice(-3);
    const phaseStable = lastPhases.length >= 2 && new Set(lastPhases.map((p) => p.phase)).size === 1;

    const emos = (params.recentEmotions || []).slice(-5);
    const toneSet = new Set(emos.map((e) => e.tone));
    const emotionalStagnant = emos.length >= 3 && toneSet.size <= 1;
    const signalWeight = typeof params.recentSignalWeight === 'number' ? params.recentSignalWeight : 0;
    const noMomentum = signalWeight <= 0 && params.proximityChanged !== true;

    if (phaseStable && emotionalStagnant && noMomentum) {
        return 'Drift detected: phase/emotion are flat. Consider a new beat (question, reveal, micro-conflict, or setting shift).';
    }
    return null;
}

export function detectSilenceOrPause(content: string): string | null {
    return scoreSilenceOrPause(content).note;
}

export function scoreSilenceOrPause(content: string): {note: string | null; score: number; reasons: WeightedHit[]} {
    if (content == null) return {note: null, score: 0, reasons: []};
    const trimmed = content.trim();
    // Common roleplay "action-only" replies shouldn't be treated as disengagement.
    if (/^(?:\*[^*]{1,120}\*|\([^)]{1,120}\)|\[[^\]]{1,120}\])$/.test(trimmed)) {
        return {note: null, score: 0, reasons: []};
    }
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

    if (/\.\.\.|\bpauses\b|\bhesitates\b|\bfalls silent\b/i.test(trimmed)) {
        return {note: 'Pause noted: consider leaning into hesitation or giving space.', score: 2, reasons: [{label: 'pause', weight: 2}]};
    }

    return {note: null, score: 0, reasons: []};
}

export function evaluateProximityTransition(
    content: string,
    current: Proximity | null | undefined,
): {from: Proximity; next: Proximity; skipped: boolean; changed: boolean; score: number; evidence: Proximity[]; missing: Proximity[]} {
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
    const missing = skipped ? intermediate : [];
    return {from: cur, next, skipped, changed, score, evidence: uniqEvidence, missing};
}

export function detectConsentIssues(content: string): string[] {
    if (!content) return [];
    const issues = new Set<string>();
    const t = content;
    const narrative = stripQuotedDialogue(t);
    // Anchor "you feel/think..." assertions to sentence boundaries to avoid interrogatives like "Do you feel...?"
    const boundary = /(^|[.!?]\s+|;\s+|:\s+)\s*/i;
    if (new RegExp(`${boundary.source}you\\s+(?:feel|felt|are overcome|can'?t help but feel|can'?t resist)\\b`, "i").test(narrative)) {
        issues.add('assigns emotions to the user');
    }

    if (!/\bif you must\b/i.test(narrative) && /\b(you must|you have no choice|without your consent|against your will|ignoring your protest|forces you|doesn'?t let you|won'?t let you)\b/i.test(narrative)) {
        issues.add('forces decisions/consent onto the user');
    }

    if (/\b(grabs you|pins you|holds you down|forces a kiss|pushes you onto|gropes you)\b/i.test(narrative)) {
        issues.add('coercive physical action');
    }

    if (/\b(inside your mind|your thoughts say|your inner voice)\b/i.test(narrative) || new RegExp(`${boundary.source}you\\s+(?:think to yourself|think|wonder|remember)\\b`, "i").test(narrative)) {
        issues.add('describes internal monologue for the user');
    }

    if (/\b(your body (?:betrays|responds)|a shiver runs through you)\b/i.test(narrative)) {
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
    if (scene.location) parts.push(`loc: ${scene.location}`);
    if (scene.timeOfDay) parts.push(`time: ${scene.timeOfDay}`);
    if (scene.lingeringEmotion) parts.push(`mood: ${scene.lingeringEmotion}`);
    if (Array.isArray(scene.unresolvedBeats) && scene.unresolvedBeats.length > 0) parts.push(`beats: ${scene.unresolvedBeats.length}`);
    return parts.length > 0 ? parts.join(' · ') : null;
}

export function updateSceneFromMessage(prev: SceneState | null | undefined, content: string, snapshot: EmotionSnapshot): SceneState {
    const scene: SceneState = Object.assign({}, prev || {});
    const t = content;
    const narrative = stripQuotedDialogue(t);
    const locMatch = narrative.match(/\b(?:at|in|inside|into|on|by)\s+(?:the|a|an|my|your|his|her|their)\s+([A-Za-z0-9'’\- ]{3,60})\b/i);
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
            "arms",
            "hands",
            "lap",
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
    // Explicit home/place phrases without articles.
    if (!scene.location) {
        const home = /\b(at home|at (?:his|her|their|my|your) place)\b/i.exec(narrative);
        if (home) scene.location = home[1].toLowerCase();
    }

    const tod = /\b(early morning|this morning|morning|afternoon|evening|late night|last night|night|noon|midnight|dawn|dusk|tonight)\b/i.exec(narrative);
    if (tod) scene.timeOfDay = tod[1].toLowerCase().replace(/\s+/g, " ");

    if (snapshot && snapshot.tone && snapshot.tone !== 'neutral') scene.lingeringEmotion = snapshot.tone;

    const unresolvedPatterns = /\b(?:still|remain|unresolved|unfinished|left hanging|pending|unspoken|between them)\b/i;
    if (unresolvedPatterns.test(t)) {
        scene.unresolvedBeats = (scene.unresolvedBeats || []).concat([t.trim().slice(0, 160)]).slice(-10);
    }
    return scene;
}
