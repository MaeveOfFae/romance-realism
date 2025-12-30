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

export function extractEmotionSnapshot(text: string): EmotionSnapshot {
    if (!text || text.trim().length === 0) return {tone: 'neutral', intensity: 'low'};
    if (/!|\b(am|so|very)\b/i.test(text)) return {tone: 'excited', intensity: 'medium'};
    if (/sad|tear|cry|sorry|regret/i.test(text)) return {tone: 'sad', intensity: 'medium'};
    if (/love|like|cherish|admire/i.test(text)) return {tone: 'affection', intensity: 'medium'};
    return {tone: 'neutral', intensity: 'low'};
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

    const detected = (intensityJump >= 2) || (toneChanged && steadyPrev && Math.abs(intensityJump) >= 1);
    const summary = `from [${prevTones.join(', ')}] (${avgPrevIntensity}) to ${current.tone} (${curIntensity})`;
    return {detected, summary};
}

export function detectEscalationSignals(content: string, snapshot: EmotionSnapshot) {
    const signals: Array<{type: string; suggestedPhase: string; text: string}> = [];
    if (!content || content.trim().length === 0) return signals;

    if (/I\s+(feel|felt|confess|admit|can't help)/i.test(content) || /confess(ed)?/i.test(content)) {
        signals.push({type: 'emotional_disclosure', suggestedPhase: 'Familiar', text: content.slice(0, 200)});
    }

    if (/I need you|I can't live|depend on you|rely on you|can't (?:do|be)/i.test(content)) {
        signals.push({type: 'dependency', suggestedPhase: 'Charged', text: content.slice(0, 200)});
    }

    if (/hug|kiss|hold|embrace|press(es|ed)?|near|closer|close to/i.test(content)) {
        signals.push({type: 'physical_closeness', suggestedPhase: 'Charged', text: content.slice(0, 200)});
    }

    if (/kiss(ed)? on the lips|making love|sex|fellatio|intercourse|nude|strip/i.test(content)) {
        signals.push({type: 'physical_intimacy', suggestedPhase: 'Intimate', text: content.slice(0, 200)});
    }

    if (snapshot.tone === 'affection' && snapshot.intensity === 'high') {
        signals.push({type: 'affection_high', suggestedPhase: 'Charged', text: 'high-affection'});
    }

    return signals;
}

// -----------------------------
// Romance realism heuristics
// -----------------------------

export function detectMemoryEvents(content: string): string[] {
    if (!content) return [];
    const hits: string[] = [];
    if (/confess(ed)?|admit(s|ted)?/i.test(content)) hits.push('confession');
    if (/betray(s|ed)?|lie(?:s|d)? to/i.test(content)) hits.push('betrayal');
    if (/reject(s|ed)?|turns you down|pushes you away/i.test(content)) hits.push('rejection');
    if (/argue|fight|conflict|shout at/i.test(content)) hits.push('conflict');
    return hits;
}

export function detectSubtext(content: string): string[] {
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
    if (/across the room|far away|distant/i.test(content)) next = "Distant";
    if (/steps closer|sits beside|next to|nearby|close by/i.test(content)) next = "Nearby";
    if (/touch|hand in hand|holds|brushes|resting on/i.test(content)) next = "Touching";
    if (/embrace tightly|presses against|kiss(?:ing)?|intimate|caress/i.test(content)) next = "Intimate";

    const curIndex = order.indexOf(cur);
    const nextIndex = order.indexOf(next);
    const skipped = nextIndex > curIndex + 1;
    const changed = next !== cur;
    return {next, skipped, changed};
}

export function detectConsentIssues(content: string): string[] {
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
    const locMatch = content.match(/(?:at|in|on) the ([A-Za-z0-9'\- ]{3,40})/i);
    if (locMatch) scene.location = locMatch[1].trim();

    const tod = /\b(morning|afternoon|evening|night|noon|midnight|dawn|dusk)\b/i.exec(content);
    if (tod) scene.timeOfDay = tod[1].toLowerCase();

    if (snapshot && snapshot.tone && snapshot.tone !== 'neutral') scene.lingeringEmotion = snapshot.tone;

    const unresolvedPatterns = /(?:still|remain|unresolved|unfinished|left hanging|pending)/i;
    if (unresolvedPatterns.test(content)) {
        scene.unresolvedBeats = (scene.unresolvedBeats || []).concat([content.trim()]).slice(-10);
    }
    return scene;
}
