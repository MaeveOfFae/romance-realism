import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_CONFIG, normalizeConfig} from "../src/config_schema";

test("normalizeConfig: null -> defaults", () => {
    assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
});

test("normalizeConfig: clamps numeric ranges", () => {
    const normalized = normalizeConfig({strictness: 999, memory_depth: -5, ui_max_notes: 999, max_ui_notes_per_20: -5});
    assert.equal(normalized.strictness, 3);
    assert.equal(normalized.memory_depth, 5);
    assert.equal(normalized.ui_max_notes, 50);
    assert.equal(normalized.max_ui_notes_per_20, null);
});

test("normalizeConfig: floors numeric values", () => {
    const normalized = normalizeConfig({strictness: 2.9, memory_depth: 10.1, ui_max_notes: 9.9, max_ui_notes_per_20: 5.7});
    assert.equal(normalized.strictness, 2);
    assert.equal(normalized.memory_depth, 10);
    assert.equal(normalized.ui_max_notes, 9);
    assert.equal(normalized.max_ui_notes_per_20, 5);
});
