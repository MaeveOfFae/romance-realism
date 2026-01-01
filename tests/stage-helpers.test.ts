import test from "node:test";
import assert from "node:assert/strict";
import {
    detectConsentIssues,
    detectEscalationSignals,
    detectMemoryEvents,
    evaluateEmotionalDelta,
    evaluateProximityTransition,
    extractEmotionSnapshot,
    scoreSilenceOrPause,
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

test("extractEmotionSnapshot: negation avoids angry classification", () => {
    const snapshot = extractEmotionSnapshot("I'm not angry.");
    assert.notEqual(snapshot.tone, "angry");
});

test("extractEmotionSnapshot: 'tear' verb does not imply sadness", () => {
    const snapshot = extractEmotionSnapshot("He tears his gaze away.");
    assert.notEqual(snapshot.tone, "sad");
});

test("extractEmotionSnapshot: 'regret nothing' does not imply sadness", () => {
    const snapshot = extractEmotionSnapshot("I regret nothing.");
    assert.notEqual(snapshot.tone, "sad");
});

test("extractEmotionSnapshot: extra term tuning expands coverage", () => {
    const snapshot = extractEmotionSnapshot("He feels wistful about it.", {extraTerms: {sad: ["wistful"]}});
    assert.equal(snapshot.tone, "sad");
    assert.equal(snapshot.intensity, "low");
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

test("extractEmotionSnapshot: sigh defaults to tense, not sad", () => {
    const snapshot = extractEmotionSnapshot("He sighs.");
    assert.equal(snapshot.tone, "tense");
    assert.equal(snapshot.intensity, "low");
});

test("extractEmotionSnapshot: smile alone stays low intensity", () => {
    const snapshot = extractEmotionSnapshot("He smiles.");
    assert.deepEqual(snapshot, {tone: "affection", intensity: "low"});
});

test("evaluateProximityTransition: detects skipped steps", () => {
    const res = evaluateProximityTransition("She takes your hand.", "Distant");
    assert.equal(res.from, "Distant");
    assert.equal(res.next, "Touching");
    assert.equal(res.skipped, true);
    assert.equal(res.changed, true);
    assert.equal(res.score >= 1, true);
    assert.equal(res.missing.includes("Nearby"), true);
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
    assert.equal(res.from, "Distant");
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

test("scoreSilenceOrPause: ignores action-only roleplay replies", () => {
    const res = scoreSilenceOrPause("*nods*");
    assert.equal(res.note, null);
});

test("detectEscalationSignals: avoids negated intimacy cues", () => {
    const signals = detectEscalationSignals(
        "He doesn't kiss you. He keeps his distance.",
        {tone: "neutral", intensity: "low"},
    );
    assert.equal(signals.some((s) => s.type === "physical_intimacy"), false);
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

test("updateSceneFromMessage: ignores body parts as location", () => {
    const scene1 = updateSceneFromMessage(null, "Warmth flickers in his eyes.", {tone: "neutral", intensity: "low"});
    assert.equal(scene1.location ?? null, null);

    const scene2 = updateSceneFromMessage(null, "A tremor lingers in her voice.", {tone: "neutral", intensity: "low"});
    assert.equal(scene2.location ?? null, null);
});

test("updateSceneFromMessage: trims verbish 'the air feels tense' captures", () => {
    const scene = updateSceneFromMessage(null, "In the air feels tense tonight.", {tone: "neutral", intensity: "low"});
    assert.equal(scene.location ?? null, null);
});

test("updateSceneFromMessage: keeps location when phrased as 'in the kitchen is'", () => {
    const scene = updateSceneFromMessage(null, "In the kitchen is a small table set for two.", {tone: "neutral", intensity: "low"});
    assert.equal(scene.location, "kitchen");
});

test("updateSceneFromMessage: tuned place heads enable safe no-article locations", () => {
    const scene = updateSceneFromMessage(
        null,
        "At gazebo, they finally talk.",
        {tone: "neutral", intensity: "low"},
        {locationPlaceHeads: ["gazebo"]},
    );
    assert.equal(scene.location, "gazebo");
});

test("updateSceneFromMessage: does not treat 'still' alone as an unresolved beat", () => {
    const scene = updateSceneFromMessage(null, "He is still smiling softly.", {tone: "affection", intensity: "low"});
    assert.ok(!scene.unresolvedBeats || scene.unresolvedBeats.length === 0);
});

test("updateSceneFromMessage: can resolve only the latest unresolved beat", () => {
    const s1 = updateSceneFromMessage(null, "An awkward silence lingers between them, unfinished and unspoken.", {tone: "tense", intensity: "low"});
    const s2 = updateSceneFromMessage(s1, "Their argument remains unresolved, hanging between them.", {tone: "tense", intensity: "low"});
    assert.ok(Array.isArray(s2.unresolvedBeats));
    assert.equal(s2.unresolvedBeats!.length, 2);

    const s3 = updateSceneFromMessage(s2, "They clear the air and talk it through.", {tone: "neutral", intensity: "low"});
    assert.ok(Array.isArray(s3.unresolvedBeats));
    assert.equal(s3.unresolvedBeats!.length, 1);
});
