import test from "node:test";
import assert from "node:assert/strict";
import {detectEscalationSignals, evaluateEmotionalDelta, extractEmotionSnapshot} from "../src/analysis_helpers";

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
