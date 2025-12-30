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

export function evaluateEmotionalDelta(current: EmotionSnapshot, recent: EmotionSnapshot[]) {
    const window = recent.slice(-5);
    if (!window || window.length === 0) return {detected: false, summary: ''};

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

    const detected =
        (intensityJump >= 2) ||
        (polarityFlip && steadyPrev && curIntensity >= 1) ||
        (toneChanged && steadyPrev && Math.abs(intensityJump) >= 1);
    const summary = `from [${prevTones.join(', ')}] (${avgPrevIntensity}) to ${current.tone} (${curIntensity})`;
    return {detected, summary};
}

export function detectEscalationSignals(content: string, snapshot: EmotionSnapshot) {
    const signals: Array<{type: string; suggestedPhase: RelationshipPhase; text: string}> = [];
    if (!content || content.trim().length === 0) return signals;
    const t = content;

    const pushUnique = (signal: {type: string; suggestedPhase: RelationshipPhase; text: string}) => {
        if (signals.some((s) => s.type === signal.type)) return;
        signals.push(signal);
    };

    if (/\b(I\s+(?:feel|felt|confess|admit|can'?t help)\b|\bconfess(?:ed)?\b|\bcome(?:s|ing)? clean\b|\bthe truth is\b)/i.test(t)) {
        pushUnique({type: 'emotional_disclosure', suggestedPhase: 'Familiar', text: t.slice(0, 200)});
    }

    if (/\b(I need you|don'?t leave|please stay|I can'?t live|depend on you|rely on you|I can'?t (?:do|be) (?:this|without you))\b/i.test(t)) {
        pushUnique({type: 'dependency', suggestedPhase: 'Charged', text: t.slice(0, 200)});
    }

    if (/\b(hugs?|kiss(?:es|ed|ing)?|hold(?:s|ing)?|embrace(?:s|d)?|press(?:es|ed)?|wraps? (?:an?|their) arm|takes? (?:your|his|her|their) hand|interlaces fingers|leans? in|moves? closer|close to)\b/i.test(t)) {
        pushUnique({type: 'physical_closeness', suggestedPhase: 'Charged', text: t.slice(0, 200)});
    }

    if (/\b(kiss(?:es|ed|ing)? on the lips|making love|have sex|sex\b|intercourse|nude|strip(?:s|ped|ping)?|undress(?:es|ed)?|moan(?:s|ed|ing)?|orgasm)\b/i.test(t)) {
        pushUnique({type: 'physical_intimacy', suggestedPhase: 'Intimate', text: t.slice(0, 200)});
    }

    if (/\b(I love you|in love|falling for you|can'?t stop thinking about you)\b/i.test(t)) {
        pushUnique({type: 'love_confession', suggestedPhase: 'Charged', text: t.slice(0, 200)});
    }

    if (/\b(date\b|girlfriend\b|boyfriend\b|partner\b|exclusive\b|relationship\b)\b/i.test(t)) {
        pushUnique({type: 'commitment_language', suggestedPhase: 'Charged', text: t.slice(0, 200)});
    }

    if (snapshot.tone === 'affection' && snapshot.intensity === 'high') {
        pushUnique({type: 'affection_high', suggestedPhase: 'Charged', text: 'high-affection'});
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

    if (/\b(confess(?:ed)?|admit(?:s|ted)?|come(?:s|ing)? clean|the truth is)\b/i.test(t)) hits.add('confession');
    if (/\b(betray(?:s|ed)?|cheat(?:s|ed|ing)?|deceiv(?:e|es|ed)|gaslight(?:s|ed|ing)?|lie(?:s|d)? to)\b/i.test(t)) hits.add('betrayal');
    if (/\b(reject(?:s|ed)?|turns you down|pushes you away|not interested|breaks up|says no)\b/i.test(t)) hits.add('rejection');
    if (/\b(argue(?:s|d)?|fight(?:s|ing)?|conflict|shout(?:s|ed|ing)?|yell(?:s|ed|ing)?|storm(?:s|ed)? off|slams? the door|snaps? at)\b/i.test(t)) hits.add('conflict');

    return Array.from(hits);
}

export function detectSubtext(content: string): string[] {
    if (!content) return [];
    const notes = new Set<string>();
    const t = content;

    if (/\b(um|uh|er)\b/i.test(t) || /\.\.\./.test(t) || /\b(hesitates|pauses)\b/i.test(t) || /\b(not sure|maybe|i guess)\b/i.test(t)) {
        notes.add('hesitation/uncertainty');
    }

    if (/\b(changes the subject|deflects|dodges the question|avoids eye contact|looks away|shrugs it off)\b/i.test(t)) {
        notes.add('avoidance');
    }

    if (/\b(careful not to|holding back|guarded|keeps distance emotionally|measured tone|doesn'?t say it outright)\b/i.test(t)) {
        notes.add('guarded interest');
    }

    if (/\b(afraid to ask|fear of rejection|worried you'?ll say no|doesn'?t want to scare you off)\b/i.test(t)) {
        notes.add('fear of rejection');
    }

    if (/\b(swallow(?:s|ed)?|fidgets?|chews? (?:their|his|her) lip|voice (?:drops|quiet|small))\b/i.test(t)) {
        notes.add('nervous tell');
    }

    return Array.from(notes);
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

export function evaluateProximityTransition(content: string, current: Proximity | null | undefined): {next: Proximity; skipped: boolean; changed: boolean} {
    const order: Proximity[] = ["Distant", "Nearby", "Touching", "Intimate"];
    const cur = current || "Distant";
    let next: Proximity = cur;
    const t = content;
    if (/\b(across the room|keeps (?:his|her|their) distance|stands back|far away|distant)\b/i.test(t)) next = "Distant";
    if (/\b(steps closer|approaches?|closes the distance|sits beside|next to|nearby|close by|leans closer)\b/i.test(t)) next = "Nearby";
    if (/\b(touch(?:es|ing)?|hand in hand|holds?|takes? (?:your|his|her|their) hand|interlaces fingers|brush(?:es|ed)?|rests? (?:a|his|her|their) hand|hand on|fingers?\b|caress(?:es|ed)?)\b/i.test(t)) next = "Touching";
    if (/\b(embrace(?:s|d)? tightly|press(?:es|ed)? against|kiss(?:es|ed|ing)?|straddles|in (?:his|her|their) lap)\b/i.test(t)) next = "Intimate";

    const curIndex = order.indexOf(cur);
    const nextIndex = order.indexOf(next);
    const skipped = nextIndex > curIndex + 1;
    const changed = next !== cur;
    return {next, skipped, changed};
}

export function detectConsentIssues(content: string): string[] {
    if (!content) return [];
    const issues = new Set<string>();
    const t = content;

    if (/\byou (?:feel|felt|are overcome|can'?t help but feel|can'?t resist)\b/i.test(t)) {
        issues.add('assigns emotions to the user');
    }

    if (/\b(you must|you have no choice|without your consent|against your will|ignoring your protest|forces you|doesn'?t let you|won'?t let you)\b/i.test(t)) {
        issues.add('forces decisions/consent onto the user');
    }

    if (/\b(grabs you|pins you|holds you down|forces a kiss|pushes you onto|gropes you)\b/i.test(t)) {
        issues.add('coercive physical action');
    }

    if (/\b(inside your mind|your thoughts say|your inner voice|you think to yourself|you realize|you decide)\b/i.test(t)) {
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
    const locMatch = t.match(/\b(?:at|in|inside|into|on|by)\s+(?:the|a|an)\s+([A-Za-z0-9'’\- ]{3,60})\b/i);
    if (locMatch) scene.location = locMatch[1].trim();

    const tod = /\b(early morning|morning|afternoon|evening|late night|night|noon|midnight|dawn|dusk|tonight)\b/i.exec(t);
    if (tod) scene.timeOfDay = tod[1].toLowerCase().replace(/\s+/g, " ");

    if (snapshot && snapshot.tone && snapshot.tone !== 'neutral') scene.lingeringEmotion = snapshot.tone;

    const unresolvedPatterns = /\b(?:still|remain|unresolved|unfinished|left hanging|pending|unspoken|between them)\b/i;
    if (unresolvedPatterns.test(t)) {
        scene.unresolvedBeats = (scene.unresolvedBeats || []).concat([t.trim()]).slice(-10);
    }
    return scene;
}
