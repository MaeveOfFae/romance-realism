import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_CONFIG, normalizeConfig} from "../src/config_schema";

test("normalizeConfig: null -> defaults", () => {
    assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
});

test("normalizeConfig: clamps numeric ranges", () => {
    const normalized = normalizeConfig({strictness: 999, memory_depth: -5});
    assert.equal(normalized.strictness, 3);
    assert.equal(normalized.memory_depth, 5);
});

test("normalizeConfig: floors numeric values", () => {
    const normalized = normalizeConfig({strictness: 2.9, memory_depth: 10.1});
    assert.equal(normalized.strictness, 2);
    assert.equal(normalized.memory_depth, 10);
});

