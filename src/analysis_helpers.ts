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

export type EmotionTuning = {
    extraTerms?: Record<string, string[]> | null;
};

export type SceneTuning = {
    locationPlaceHeads?: string[] | null;
    locationStopwords?: string[] | null;
};

function countMatches(text: string, re: RegExp): number {
    const m = text.match(re);
    return m ? m.length : 0;
}

type WeightedHit = {label: string; weight: number};

function escapeRegExp(s: string): string {
    return (s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileLooseTermsRegex(terms: string[] | null | undefined): RegExp | null {
    if (!Array.isArray(terms) || terms.length === 0) return null;
    const cleaned = Array.from(new Set(terms.map((t) => String(t || "").trim()).filter(Boolean))).slice(0, 80);
    if (cleaned.length === 0) return null;
    const parts = cleaned.map((t) => {
        const esc = escapeRegExp(t).replace(/\s+/g, "\\s+");
        return /\s/.test(t) ? esc : `\\b${esc}\\b`;
    });
    return new RegExp(`(?:${parts.join("|")})`, "i");
}

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

export function scoreEmotionSnapshot(text: string, tuning?: EmotionTuning): {
    snapshot: EmotionSnapshot;
    toneScores: Array<{tone: string; score: number; reasons: WeightedHit[]}>;
} {
    if (!text || text.trim().length === 0) {
        return {snapshot: {tone: "neutral", intensity: "low"}, toneScores: []};
    }
    const t = text;
    const intensity = extractIntensity(t);

    const extraTermsByTone = tuning?.extraTerms || null;
    const extraCache = new Map<string, RegExp | null>();
    const getExtraRegex = (tone: string): RegExp | null => {
        if (extraCache.has(tone)) return extraCache.get(tone) ?? null;
        const re = compileLooseTermsRegex(extraTermsByTone && (extraTermsByTone as any)[tone]);
        extraCache.set(tone, re);
        return re;
    };

    const toneScore = (tone: string, parts: Array<{label: string; re: RegExp; weight: number}>) => {
        const reasons: WeightedHit[] = [];
        let score = 0;
        for (const p of parts) {
            const hit = scoreRegexWithNegation(t, p.re, p.weight, p.label);
            score += hit.score;
            if (hit.reasons.length) reasons.push(...hit.reasons);
        }
        const extraRe = getExtraRegex(tone);
        if (extraRe) {
            const hit = scoreRegexWithNegation(t, extraRe, 2, "extra_terms");
            score += hit.score;
            if (hit.reasons.length) reasons.push(...hit.reasons);
        }
        return {tone, score, reasons};
    };

    const sadness = toneScore("sad", [
        // Avoid common false positives:
        // - "tear your gaze away" (tear as a verb) should not count as sadness
        // - "regret nothing" should not count as sadness
        {label: "sad_words", re: /\b(sad|sorrow|tearful|teary|cry(?:ing)?|sob(?:bing)?|regret(?:s|ted)?(?!\s+(?:nothing|none)\b)|heartbroken|grief|mourn(?:s|ing)?)\b/i, weight: 2},
        {label: "tears_noun", re: /\b(?:his|her|their|my|your|the)\s+tears\b|\btears?\s+(?:well(?:s|ing)?\s+up|spill(?:s|ing)?|stream(?:s|ing)?|roll(?:s|ing)?(?:\s+down)?|fall(?:s|ing)?|in\s+(?:his|her|their|my|your)\s+eyes)\b/i, weight: 2},
        {label: "apology", re: /\b(apolog(?:y|ize|ise)|sorry)\b/i, weight: 1},
        {label: "hurt", re: /\b(hurt|aching|broken|heavy in (?:his|her|their|your) chest)\b/i, weight: 1},
        {label: "tears_voice", re: /\b(voice cracks?|wipes? (?:a|his|her|their) tears?)\b/i, weight: 2},
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
        {label: "tender", re: /\b(affectionately|tenderly|tender|affectionate|gentle|with a soft smile|smiles? softly|softly (?:says|whispers?|murmurs?)|warmly (?:smiles?|greets?))\b/i, weight: 1},
        {label: "smile", re: /\b(smile(?:s|d|ing)?|grin(?:s|ned|ning)?)\b/i, weight: 1},
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
        {label: "sigh", re: /\b(sighs?|exhales?|lets out (?:a|an) (?:slow )?breath)\b/i, weight: 1},
    ]);

    const toneScores = [affection, anger, anxiety, sadness, embarrassment, jealousy, excitement, tense]
        .sort((a, b) => b.score - a.score);

    const best = toneScores[0];
    const bestTone = best && best.score > 0 ? best.tone : "neutral";
    const minScoreByTone: Record<string, number> = {
        sad: 2,
        angry: 2,
        anxious: 2,
        embarrassed: 2,
        jealous: 2,
        excited: 2,
        affection: 1,
        tense: 1,
    };
    const minScore = minScoreByTone[bestTone] ?? 1;
    const tone = best && best.score >= minScore ? bestTone : "neutral";

    // Preserve original behavior: *explicit* sadness/affection keywords imply at least medium intensity.
    const forceMediumLabels = new Set<string>(["sad_words", "love_words", "care_miss"]);
    const forcedMedium = (tone === "sad" || tone === "affection") && best && best.reasons.some((r) => forceMediumLabels.has(r.label));
    const adjustedIntensity: EmotionIntensity = forcedMedium && intensity === "low" ? "medium" : intensity;

    return {snapshot: {tone, intensity: adjustedIntensity}, toneScores};
}

export function extractEmotionSnapshot(text: string, tuning?: EmotionTuning): EmotionSnapshot {
    return scoreEmotionSnapshot(text, tuning).snapshot;
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
    unresolvedBeats?: UnresolvedBeat[];
    resolvedBeats?: UnresolvedBeat[];
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

export type UnresolvedBeat = {
    id: string;
    snippet: string;
    createdAt: number;
    lastSeenAt: number;
};

function normalizeBeatSnippet(s: string): string {
    return (s || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/["'“”‘’]/g, "")
        .trim();
}

function stableHashId(input: string): string {
    // Small non-crypto hash for stable ids.
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `b_${(h >>> 0).toString(36)}`;
}

function coerceBeats(beats: unknown, now: number): UnresolvedBeat[] {
    if (!Array.isArray(beats)) return [];
    const out: UnresolvedBeat[] = [];
    for (const b of beats) {
        if (b && typeof b === "object" && typeof (b as any).snippet === "string") {
            const snippet = String((b as any).snippet).trim();
            if (!snippet) continue;
            const norm = normalizeBeatSnippet(snippet);
            const id = typeof (b as any).id === "string" && (b as any).id.length > 0 ? (b as any).id : stableHashId(norm);
            const createdAt = typeof (b as any).createdAt === "number" && Number.isFinite((b as any).createdAt) ? (b as any).createdAt : now;
            const lastSeenAt = typeof (b as any).lastSeenAt === "number" && Number.isFinite((b as any).lastSeenAt) ? (b as any).lastSeenAt : createdAt;
            out.push({id, snippet, createdAt, lastSeenAt});
            continue;
        }
        if (typeof b === "string") {
            const snippet = b.trim();
            if (!snippet) continue;
            const norm = normalizeBeatSnippet(snippet);
            out.push({id: stableHashId(norm), snippet, createdAt: now, lastSeenAt: now});
        }
    }
    return out;
}

function extractUnresolvedBeatSnippet(narrative: string): string | null {
    const t = (narrative || "").trim();
    if (!t) return null;

    // Strong explicit unresolved markers.
    const strong =
        /\b(unresolved|unfinished|left hanging|still unspoken|unspoken|pending|between them|left unsaid)\b/i;

    // We intentionally do NOT treat the word "still" alone as an unresolved-beat signal (too many false positives).
    const stillWithTension =
        /\bstill\s+(?:can'?t|won'?t|doesn'?t|hasn'?t|haven'?t|refuses? to|won'?t)\s+(?:say|talk|answer|forgive|trust|look at)\b/i;

    const lingeringTension =
        /\b(?:remains?|lingers?)\s+(?:awkward|tense|uncomfortable|unresolved|between them)\b/i;

    const hasSignal = strong.test(t) || stillWithTension.test(t) || lingeringTension.test(t);
    if (!hasSignal) return null;

    // Try to capture the sentence containing the marker for a concise snippet.
    const sentences = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    const pick = sentences.find((s) => strong.test(s) || stillWithTension.test(s) || lingeringTension.test(s)) || sentences[0] || t;
    return pick.replace(/\s+/g, " ").trim();
}

function hasResolutionCue(narrative: string): boolean {
    const t = (narrative || "");
    // Require fairly explicit repair language before clearing beats.
    const repair =
        /\b(talk(?:s|ed)? it through|clear(?:s|ed)? the air|make(?:s|made)? up|reconcile(?:s|d)?|reach(?:es|ed)? an understanding|settle(?:s|d)? it|resolved|resolution)\b/i;
    const apologyAndForgive =
        /\b(apolog(?:y|ize|ise|izes|ised|ized))\b/i.test(t) && /\b(forgive(?:s|n)?|forgiven|forgives)\b/i.test(t);
    return repair.test(t) || apologyAndForgive;
}

function extractKeywords(text: string): string[] {
    const stop = new Set([
        "the", "a", "an", "and", "or", "but", "so", "to", "of", "in", "on", "at", "for", "with", "by",
        "is", "are", "was", "were", "be", "been", "being",
        "i", "you", "he", "she", "they", "we", "it", "him", "her", "them", "us",
        "his", "her", "their", "your", "my", "our",
        "this", "that", "these", "those",
        "as", "from", "into", "over", "under", "between",
        "still", "just", "really", "very",
    ]);
    return (text || "")
        .toLowerCase()
        .replace(/["'“”‘’]/g, "")
        .split(/[^a-z0-9]+/g)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !stop.has(w));
}

function resolveMatchingBeats(beats: UnresolvedBeat[], narrative: string, now: number): {unresolved: UnresolvedBeat[]; resolved: UnresolvedBeat[]} {
    if (!Array.isArray(beats) || beats.length === 0) return {unresolved: [], resolved: []};
    const narrativeKeys = new Set(extractKeywords(narrative));
    const resolved: UnresolvedBeat[] = [];
    const unresolved: UnresolvedBeat[] = [];

    for (const b of beats) {
        const beatKeys = extractKeywords(b.snippet);
        const shared = beatKeys.filter((k) => narrativeKeys.has(k));
        const qualifies = shared.length >= 2;
        if (qualifies) resolved.push({...b, lastSeenAt: now});
        else unresolved.push(b);
    }

    // If we saw a strong resolution cue but couldn't match a topic, resolve only the latest beat.
    if (resolved.length === 0 && unresolved.length > 0) {
        const latest = unresolved[unresolved.length - 1];
        resolved.push({...latest, lastSeenAt: now});
        unresolved.pop();
    }

    return {unresolved, resolved};
}

const DEFAULT_LOCATION_PLACE_HEADS = [
    "apartment",
    "attic",
    "backyard",
    "balcony",
    "bar",
    "basement",
    "bathroom",
    "beach",
    "bed",
    "bedroom",
    "booth",
    "bridge",
    "bus",
    "cabin",
    "cafe",
    "car",
    "chapel",
    "church",
    "cinema",
    "clinic",
    "closet",
    "coffee shop",
    "counter",
    "courtyard",
    "diner",
    "dining room",
    "dock",
    "door",
    "doorway",
    "driveway",
    "elevator",
    "entrance",
    "farm",
    "field",
    "fireplace",
    "forest",
    "front yard",
    "gallery",
    "garage",
    "garden",
    "gym",
    "hall",
    "hallway",
    "home",
    "hospital",
    "hotel",
    "house",
    "inn",
    "kitchen",
    "lake",
    "library",
    "lobby",
    "market",
    "museum",
    "office",
    "park",
    "path",
    "pier",
    "place",
    "platform",
    "porch",
    "pub",
    "restaurant",
    "restroom",
    "river",
    "road",
    "rooftop",
    "room",
    "school",
    "shore",
    "shop",
    "sidewalk",
    "sofa",
    "station",
    "stairs",
    "stairwell",
    "store",
    "street",
    "studio",
    "table",
    "taxi",
    "temple",
    "terminal",
    "theater",
    "trail",
    "train",
    "yard",
    "window",
    "woods",
];

const DEFAULT_LOCATION_STOPWORDS = [
    "end",
    "beginning",
    "middle",
    "moment",
    "meantime",
    "world",
    "way",
    "time",
    "air",
    "silence",
    "distance",
    "space",
    "warmth",
    "tension",
    "shadow",
    "darkness",
    "lightness",
    "morning",
    "afternoon",
    "evening",
    "night",
    "dark",
    "light",
    // Body/face parts (common false positives like "in his eyes")
    "arms",
    "hands",
    "lap",
    "eyes",
    "gaze",
    "voice",
    "breath",
    "chest",
    "heart",
    "mind",
    "head",
    "face",
    "lips",
    "mouth",
    "throat",
    "skin",
    "hair",
    "cheeks",
];

function compileAlternationPattern(terms: string[]): string | null {
    const cleaned = Array.from(new Set((terms || []).map((t) => String(t || "").trim()).filter(Boolean))).slice(0, 250);
    if (cleaned.length === 0) return null;
    return cleaned.map((t) => escapeRegExp(t).replace(/\s+/g, "\\s+")).join("|");
}

export function updateSceneFromMessage(
    prev: SceneState | null | undefined,
    content: string,
    snapshot: EmotionSnapshot,
    tuning?: SceneTuning,
): SceneState {
    const now = Date.now();
    const scene: SceneState = Object.assign({}, prev || {});
    const t = content;
    const narrative = stripQuotedDialogue(t);

    const placeHeads = new Set<string>(DEFAULT_LOCATION_PLACE_HEADS);
    for (const p of (tuning?.locationPlaceHeads || [])) {
        const s = String(p || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (s) placeHeads.add(s);
    }
    const stopwords = new Set<string>(DEFAULT_LOCATION_STOPWORDS);
    for (const w of (tuning?.locationStopwords || [])) {
        const s = String(w || "").toLowerCase().replace(/\s+/g, " ").trim();
        if (s) stopwords.add(s);
    }

    const preps = "(?:at|in|inside|into|on|by|near|beside|behind|under|over|outside|within|across|around|through)";
    const candidates: string[] = [];
    const addCandidate = (c: string) => {
        const s = String(c || "").trim();
        if (!s) return;
        candidates.push(s);
    };

    const trimVerbish = (raw: string): string => {
        let c = String(raw || "").trim();
        if (!c) return c;
        const verbish = /\b(?:feels?|seems?|looks?|sounds?|is|are|was|were|become(?:s)?|remain(?:s)?|lingers?)\b/i.exec(c);
        if (verbish && typeof verbish.index === "number" && verbish.index > 0) c = c.slice(0, verbish.index).trim();
        return c;
    };

    const articleLocRe = new RegExp(`\\b${preps}\\s+(?:the|a|an|my|your|his|her|their)\\s+([A-Za-z0-9'’\\- ]{2,60})\\b`, "ig");
    for (const m of narrative.matchAll(articleLocRe)) {
        addCandidate(trimVerbish(m[1] || ""));
    }

    const possessiveLocRe = new RegExp(`\\b(?:at|in|inside|into|on|by)\\s+([A-Za-z][A-Za-z'’\\-]+(?:'s|’s)\\s+[A-Za-z0-9'’\\- ]{2,60})\\b`, "ig");
    for (const m of narrative.matchAll(possessiveLocRe)) {
        addCandidate(trimVerbish(m[1] || ""));
    }

    // Safe no-article matching for known place heads (including user-tuned ones).
    const placePattern = compileAlternationPattern(Array.from(placeHeads));
    if (placePattern) {
        const exactPlaceRe = new RegExp(`\\b${preps}\\s+(?:the\\s+|a\\s+|an\\s+)?(${placePattern})\\b`, "ig");
        for (const m of narrative.matchAll(exactPlaceRe)) {
            addCandidate(m[1] || "");
        }
    }

    const scoreCandidate = (raw: string): {candidate: string; score: number} => {
        const candidate = (raw || "").trim();
        const normalized = candidate.toLowerCase().replace(/\s+/g, " ").trim();
        const head = (normalized.split(" ").filter(Boolean).slice(-1)[0] || normalized).trim();
        if (!normalized) return {candidate, score: -999};
        if (stopwords.has(normalized) || stopwords.has(head)) return {candidate, score: -999};
        if (/^(end|the end|the beginning|the moment|the meantime)$/.test(normalized)) return {candidate, score: -999};

        let score = 0;
        if (placeHeads.has(normalized)) score += 4;
        if (placeHeads.has(head)) score += 3;
        if (normalized.includes("'s ") || normalized.includes("’s ")) score += 1;
        const wordCount = normalized.split(" ").filter(Boolean).length;
        if (wordCount <= 4) score += 1;
        if (candidate.length <= 32) score += 1;
        return {candidate, score};
    };

    let best: {candidate: string; score: number} | null = null;
    for (const c of candidates) {
        const scored = scoreCandidate(c);
        if (!best || scored.score > best.score) best = scored;
    }
    if (best && best.score >= 3) {
        scene.location = best.candidate;
    }

    // Explicit home/place phrases without articles.
    if (!scene.location) {
        const home = /\b(at home|at (?:his|her|their|my|your) place)\b/i.exec(narrative);
        if (home) scene.location = home[1].toLowerCase();
    }

    const tod = /\b(early morning|this morning|morning|afternoon|evening|late night|last night|night|noon|midnight|dawn|dusk|tonight)\b/i.exec(narrative);
    if (tod) scene.timeOfDay = tod[1].toLowerCase().replace(/\s+/g, " ");

    if (snapshot && snapshot.tone && snapshot.tone !== 'neutral') scene.lingeringEmotion = snapshot.tone;

    scene.unresolvedBeats = coerceBeats(scene.unresolvedBeats, now);
    scene.resolvedBeats = coerceBeats(scene.resolvedBeats, now);

    if (hasResolutionCue(narrative)) {
        const resolved = resolveMatchingBeats(scene.unresolvedBeats || [], narrative, now);
        scene.unresolvedBeats = resolved.unresolved;
        scene.resolvedBeats = (scene.resolvedBeats || []).concat(resolved.resolved).slice(-20);
    } else {
        const beat = extractUnresolvedBeatSnippet(narrative);
        if (beat) {
            const normalized = normalizeBeatSnippet(beat);
            const existing = new Set((scene.unresolvedBeats || []).map((b) => normalizeBeatSnippet(b.snippet)));
            if (!existing.has(normalized)) {
                const id = stableHashId(normalized);
                scene.unresolvedBeats = (scene.unresolvedBeats || []).concat([{id, snippet: beat, createdAt: now, lastSeenAt: now}]);
            } else {
                scene.unresolvedBeats = (scene.unresolvedBeats || []).map((b) => {
                    if (normalizeBeatSnippet(b.snippet) !== normalized) return b;
                    return {...b, lastSeenAt: now};
                });
            }
        }
    }
    return scene;
}

export function scoreUnresolvedBeatReminder(params: {
    scene: SceneState | null | undefined;
    content: string;
    snapshot: EmotionSnapshot;
    priorEmotions?: EmotionSnapshot[];
    memoryScars?: MemoryScar[];
}): {note: string | null; score: number; reasons: WeightedHit[]; beatId: string | null} {
    const scene = params.scene;
    const beats = scene && Array.isArray(scene.unresolvedBeats) ? scene.unresolvedBeats : [];
    if (!beats || beats.length === 0) return {note: null, score: 0, reasons: [], beatId: null};

    const lastBeat = beats[beats.length - 1];
    const beatId = lastBeat && typeof lastBeat.id === "string" ? lastBeat.id : null;
    const t = params.content || "";
    const narrative = stripQuotedDialogue(t);

    // If the current message contains explicit repair language, don't nag.
    if (hasResolutionCue(narrative)) return {note: null, score: 0, reasons: [{label: "resolution_cue", weight: -5}], beatId};

    const reasons: WeightedHit[] = [];

    const timeSkip = /\b(later|the next day|next morning|hours later|days later|weeks later|afterward|after that)\b/i.test(narrative);
    if (timeSkip) pushWeighted(reasons, "time_skip", 3);

    const comfortOrEscalation =
        /\b(kiss(?:es|ed|ing)?|hugs?|embrace(?:s|d)?|smiles? softly|laughs?|relaxes?|softens|tenderly|warmly)\b/i.test(narrative);
    if (comfortOrEscalation) pushWeighted(reasons, "softening_or_escalation", 2);

    const intimate = /\b(kiss(?:es|ed|ing)?|making love|have sex|sex\b|undress|nude|orgasm)\b/i.test(narrative);
    if (intimate) pushWeighted(reasons, "intimacy", 3);

    const curTone = params.snapshot?.tone || "neutral";
    if (["affection", "excited"].includes(curTone)) pushWeighted(reasons, "positive_tone", 1);

    const prev = (params.priorEmotions || []).slice(-2);
    const prevTone = prev.length > 0 ? prev[prev.length - 1].tone : "neutral";
    const prevNegative = ["sad", "angry", "anxious", "jealous", "tense"].includes(prevTone);
    const curPositive = ["affection", "excited"].includes(curTone);
    if (prevNegative && curPositive) pushWeighted(reasons, "neg_to_pos_shift", 2);

    const scars = params.memoryScars || [];
    const lastScar = scars.length > 0 ? scars[scars.length - 1].event : null;
    if (lastScar && ["conflict", "betrayal", "rejection"].includes(lastScar)) {
        pushWeighted(reasons, `recent_scar_${lastScar}`, 1);
    }

    const score = sumWeights(reasons);
    if (score <= 0) return {note: null, score, reasons, beatId};

    const snippet = lastBeat && lastBeat.snippet.length > 0 ? `“${lastBeat.snippet}”` : "(unresolved beat)";
    const note = `Unresolved beat reminder: ${snippet} Consider addressing it before escalating/softening too far.`;
    return {note, score, reasons, beatId};
}
