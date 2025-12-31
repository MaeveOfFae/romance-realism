import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_CONFIG, normalizeConfig} from "../src/config_schema";

test("normalizeConfig: null -> defaults", () => {
    assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
});

test("normalizeConfig: clamps numeric ranges", () => {
    const normalized = normalizeConfig({strictness: 999, memory_depth: -5, ui_max_notes: 999, max_notes_per_20: -5});
    assert.equal(normalized.strictness, 3);
    assert.equal(normalized.memory_depth, 5);
    assert.equal(normalized.ui_max_notes, 50);
    assert.equal(normalized.max_notes_per_20, null);
});

test("normalizeConfig: floors numeric values", () => {
    const normalized = normalizeConfig({strictness: 2.9, memory_depth: 10.1, ui_max_notes: 9.9, max_notes_per_20: 5.7});
    assert.equal(normalized.strictness, 2);
    assert.equal(normalized.memory_depth, 10);
    assert.equal(normalized.ui_max_notes, 9);
    assert.equal(normalized.max_notes_per_20, 5);
});

test("normalizeConfig: supports legacy max_ui_notes_per_20 alias", () => {
    const normalized = normalizeConfig({max_ui_notes_per_20: 7});
    assert.equal(normalized.max_notes_per_20, 7);
});

test("normalizeConfig: accepts 0/1 for boolean-like toggles", () => {
    const normalized = normalizeConfig({ui_enabled: 0, ui_show_status: 0, note_emotion_delta: 0});
    assert.equal(normalized.ui_enabled, false);
    assert.equal(normalized.ui_show_status, false);
    assert.equal(normalized.note_emotion_delta, false);
});

test("normalizeConfig: clamps tuning + debug fields", () => {
    const normalized = normalizeConfig({
        ui_debug_scoring: 1,
        ui_debug_max_candidates: 999,
        tune_phase_weight_threshold: 999,
        tune_delta_score_threshold: -999,
        tune_ui_note_parts: 999,
    });
    assert.equal(normalized.ui_debug_scoring, true);
    assert.equal(normalized.ui_debug_max_candidates, 50);
    assert.equal(normalized.tune_phase_weight_threshold, 20);
    assert.equal(normalized.tune_delta_score_threshold, 0);
    assert.equal(normalized.tune_ui_note_parts, 6);
});

test("normalizeConfig: clamps prompt injection fields", () => {
    const normalized = normalizeConfig({
        prompt_injection_enabled: 0,
        prompt_injection_include_scene: 0,
        prompt_injection_max_parts: 999,
        prompt_injection_max_chars: 1,
    });
    assert.equal(normalized.prompt_injection_enabled, false);
    assert.equal(normalized.prompt_injection_include_scene, false);
    assert.equal(normalized.prompt_injection_max_parts, 6);
    assert.equal(normalized.prompt_injection_max_chars, 100);
});

test("normalizeConfig: clamps unresolved beat fields", () => {
    const normalized = normalizeConfig({
        scene_unresolved_beats_enabled: 0,
        note_unresolved_beats: 0,
        unresolved_beats_max_history: 999,
        unresolved_beats_snippet_max_chars: 1,
        tune_unresolved_beat_score_threshold: 999,
        tune_unresolved_beat_cooldown_turns: -999,
    });
    assert.equal(normalized.scene_unresolved_beats_enabled, false);
    assert.equal(normalized.note_unresolved_beats, false);
    assert.equal(normalized.unresolved_beats_max_history, 20);
    assert.equal(normalized.unresolved_beats_snippet_max_chars, 40);
    assert.equal(normalized.tune_unresolved_beat_score_threshold, 20);
    assert.equal(normalized.tune_unresolved_beat_cooldown_turns, 0);
});
