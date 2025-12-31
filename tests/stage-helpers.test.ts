import test from "node:test";
import assert from "node:assert/strict";
import {
    detectConsentIssues,
    detectEscalationSignals,
    detectMemoryEvents,
    evaluateEmotionalDelta,
    evaluateProximityTransition,
    extractEmotionSnapshot,
    updateSceneFromMessage,
} from "../src/analysis_helpers";

test("extractEmotionSnapshot: empty -> neutral/low", () => {
    const snapshot = extractEmotionSnapshot("");
    assert.deepEqual(snapshot, {tone: "neutral", intensity: "low"});
});

test("extractEmotionSnapshot: sad keyword -> sad/medium", () => {
    const snapshot = extractEmotionSnapshot("I regret this.");
    assert.deepEqual(snapshot, {tone: "sad", intensity: "medium"});
});

test("extractEmotionSnapshot: affection keyword -> affection/medium", () => {
    const snapshot = extractEmotionSnapshot("I love you");
    assert.deepEqual(snapshot, {tone: "affection", intensity: "medium"});
});

test("evaluateEmotionalDelta: detects tone + intensity change after steady window", () => {
    const current = {tone: "sad", intensity: "medium"} as const;
    const recent = Array.from({length: 5}, () => ({tone: "neutral", intensity: "low"} as const));
    const delta = evaluateEmotionalDelta(current, recent);
    assert.equal(delta.detected, true);
});

test("evaluateEmotionalDelta: detects abrupt intensity drop after steady high window", () => {
    const current = {tone: "neutral", intensity: "low"} as const;
    const recent = Array.from({length: 5}, () => ({tone: "angry", intensity: "high"} as const));
    const delta = evaluateEmotionalDelta(current, recent);
    assert.equal(delta.detected, true);
});

test("evaluateEmotionalDelta: transition cue can suppress borderline delta", () => {
    const current = {tone: "sad", intensity: "medium"} as const;
    const recent = Array.from({length: 5}, () => ({tone: "neutral", intensity: "low"} as const));
    const withoutCue = evaluateEmotionalDelta(current, recent, "I regret this.");
    assert.equal(withoutCue.detected, true);

    const withCue = evaluateEmotionalDelta(current, recent, "After a long pause, I regret this.");
    assert.equal(withCue.detected, false);
});

test("detectEscalationSignals: returns expected signal types", () => {
    const signals = detectEscalationSignals(
        "I confess I need you. She hugs him close.",
        {tone: "neutral", intensity: "low"},
    );

    const types = new Set(signals.map((s: any) => s.type));
    assert.equal(types.has("emotional_disclosure"), true);
    assert.equal(types.has("dependency"), true);
    assert.equal(types.has("physical_closeness"), true);
});

test("detectEscalationSignals: avoids time-context false positives", () => {
    const signals = detectEscalationSignals(
        "It was close to midnight when they arrived.",
        {tone: "neutral", intensity: "low"},
    );
    assert.equal(signals.some((s) => s.type === "physical_closeness"), false);
});

test("extractEmotionSnapshot: detects high intensity cues", () => {
    const snapshot = extractEmotionSnapshot("I love you!!! I'm shaking.");
    assert.equal(snapshot.tone, "affection");
    assert.equal(snapshot.intensity, "high");
});

test("evaluateProximityTransition: detects skipped steps", () => {
    const res = evaluateProximityTransition("She takes your hand.", "Distant");
    assert.equal(res.next, "Touching");
    assert.equal(res.skipped, true);
    assert.equal(res.changed, true);
    assert.equal(res.score >= 1, true);
});

test("detectConsentIssues: flags coercion patterns", () => {
    const issues = detectConsentIssues("He pins you down and forces you to kiss him.");
    assert.equal(issues.includes("coercive physical action"), true);
    assert.equal(issues.includes("forces decisions/consent onto the user"), true);
});

test("detectConsentIssues: avoids interrogative 'do you feel' phrasing", () => {
    const issues = detectConsentIssues("Do you feel okay?");
    assert.equal(issues.includes("assigns emotions to the user"), false);
});

test("detectConsentIssues: avoids vague 'you realize' phrasing", () => {
    const issues = detectConsentIssues("You realize it's late.");
    assert.equal(issues.includes("describes internal monologue for the user"), false);
});

test("evaluateProximityTransition: avoids adjective 'touching moment' false positive", () => {
    const res = evaluateProximityTransition("It was a touching moment.", "Distant");
    assert.equal(res.next, "Distant");
    assert.equal(res.changed, false);
    assert.equal(res.skipped, false);
});

test("evaluateProximityTransition: does not mark skipped when intermediate evidence exists", () => {
    const res = evaluateProximityTransition("He steps closer and takes your hand.", "Distant");
    assert.equal(res.next, "Touching");
    assert.equal(res.skipped, false);
    assert.equal(res.evidence.includes("Nearby"), true);
});

test("detectMemoryEvents: can emit multiple unique events", () => {
    const events = detectMemoryEvents("He comes clean. He lied to you.");
    assert.equal(events.includes("confession"), true);
    assert.equal(events.includes("betrayal"), true);
});

test("updateSceneFromMessage: detects time-of-day variants", () => {
    const scene = updateSceneFromMessage(null, "It was late night when they arrived.", {tone: "neutral", intensity: "low"});
    assert.equal(scene.timeOfDay, "late night");
});

test("updateSceneFromMessage: avoids vague location extraction", () => {
    const scene = updateSceneFromMessage(null, "In the end, you both leave.", {tone: "neutral", intensity: "low"});
    assert.equal(scene.location ?? null, null);
});
