import test from "node:test";
import assert from "node:assert/strict";
import {Stage} from "../src/Stage";

function makeStage(config: any = {}, messageState: any = null, chatState: any = null) {
    return new Stage({
        characters: {},
        users: {},
        config,
        messageState,
        chatState: chatState ?? {scene: null},
        initState: null,
    } as any);
}

test("prompt injection: max_notes_per_20=0 blocks non-critical notes", async () => {
    const stage = makeStage({
        strictness: 3,
        ui_enabled: 0,
        prompt_injection_enabled: 1,
        prompt_injection_include_scene: 0,
        max_notes_per_20: 0,
    });

    await stage.afterResponse({content: "Um... anyway, doesn't matter."} as any);
    assert.equal(stage.myInternalState.pendingPromptNotes, null);
});

test("prompt injection: critical consent notes bypass max_notes_per_20=0 (and do not consume quota)", async () => {
    const stage = makeStage({
        strictness: 3,
        ui_enabled: 0,
        prompt_injection_enabled: 1,
        prompt_injection_include_scene: 0,
        max_notes_per_20: 0,
    });

    await stage.afterResponse({content: "He grabs you and forces a kiss, ignoring your protest."} as any);
    assert.ok(stage.myInternalState.pendingPromptNotes);

    const quotaHistory = (stage.myInternalState as any).noteQuotaHistory || (stage.myInternalState as any).systemNoteHistory || [];
    assert.equal(Array.isArray(quotaHistory) ? quotaHistory.length : 0, 0);

    const res = await stage.beforePrompt({content: "next"} as any);
    assert.match(res.systemMessage as string, /Consent\/agency alert/i);
});

test("prompt injection quota: strictness 2 allows 2 non-critical notes per ~20 turns", async () => {
    const stage = makeStage({
        strictness: 2,
        ui_enabled: 0,
        prompt_injection_enabled: 1,
        prompt_injection_include_scene: 0,
    });

    await stage.afterResponse({content: "Um... anyway, doesn't matter."} as any);
    assert.ok(stage.myInternalState.pendingPromptNotes);
    assert.equal(((stage.myInternalState as any).noteQuotaHistory || []).length, 1);

    await stage.afterResponse({content: "Uh... anyway, besides, doesn't matter."} as any);
    assert.ok(stage.myInternalState.pendingPromptNotes);
    assert.equal(((stage.myInternalState as any).noteQuotaHistory || []).length, 2);

    await stage.afterResponse({content: "Er... anyway."} as any);
    assert.equal(stage.myInternalState.pendingPromptNotes, null);
    assert.equal(((stage.myInternalState as any).noteQuotaHistory || []).length, 2);
});

