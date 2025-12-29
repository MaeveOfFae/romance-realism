export type EmotionIntensity = "low" | "medium" | "high";

export type EmotionSnapshot = {
    tone: string;
    intensity: EmotionIntensity;
};

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
