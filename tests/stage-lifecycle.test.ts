import test from "node:test";
import assert from "node:assert/strict";
import {Stage} from "../src/Stage";
import {transcripts} from "./fixtures/transcripts";

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

test("Stage.load: returns success and initial state", async () => {
    const stage = makeStage({ui_enabled: 0});
    const res = await stage.load();
    assert.equal(res.success, true);
    assert.ok(res.messageState);
});

test("Stage.beforePrompt: injects pendingPromptNotes one-shot (system prompt only)", async () => {
    const stage = makeStage({
        strictness: 3,
        ui_enabled: 0,
        prompt_injection_enabled: 1,
        prompt_injection_include_scene: 0,
    });

    stage.myInternalState.pendingPromptNotes = {at: Date.now(), fromTurn: 1, parts: ["Keep continuity consistent."]};
    const first = await stage.beforePrompt({content: "hello"} as any);
    assert.equal(typeof first.systemMessage, "string");
    assert.match(first.systemMessage as string, /INTERNAL REALISM NOTES/i);
    assert.match(first.systemMessage as string, /Keep continuity consistent\./);
    assert.equal(stage.myInternalState.pendingPromptNotes, null);

    const second = await stage.beforePrompt({content: "hello again"} as any);
    assert.equal(second.systemMessage, null);
});

test("Stage.afterResponse: updates scene and survives setState (swipe/jump)", async () => {
    const stage = makeStage({strictness: 3, ui_enabled: 0});
    await stage.afterResponse({content: transcripts.scene_persistence.botTurns[0]} as any);

    const chatState = (stage as any)._chatState;
    assert.equal(chatState?.scene?.location, "kitchen");
    assert.equal(chatState?.scene?.timeOfDay, "night");

    const persisted = {...stage.myInternalState};
    await stage.setState(persisted);
    const chatStateAfter = (stage as any)._chatState;
    assert.equal(chatStateAfter?.scene?.location, "kitchen");
});

test("Stage.afterResponse: whiplash spikes queue prompt injection and respect max chars", async () => {
    const stage = makeStage({
        strictness: 3,
        ui_enabled: 0,
        prompt_injection_enabled: 1,
        prompt_injection_include_scene: 0,
        prompt_injection_max_chars: 160,
    });

    for (const turn of transcripts.whiplash_spike.botTurns) {
        await stage.afterResponse({content: turn} as any);
    }

    assert.ok(stage.myInternalState.pendingPromptNotes);
    const res = await stage.beforePrompt({content: "continue"} as any);
    assert.equal(typeof res.systemMessage, "string");
    assert.ok((res.systemMessage as string).length <= 160);
    assert.match(res.systemMessage as string, /abrupt emotional shift detected/i);
});

test("Stage.afterResponse: phase/proximity skips queue guidance", async () => {
    const stage = makeStage({
        strictness: 3,
        ui_enabled: 0,
        prompt_injection_enabled: 1,
        prompt_injection_include_scene: 0,
    });

    await stage.afterResponse({content: transcripts.phase_and_proximity_skip.botTurns[0]} as any);
    assert.ok(stage.myInternalState.pendingPromptNotes);
    const res = await stage.beforePrompt({content: "next"} as any);
    assert.equal(typeof res.systemMessage, "string");
    assert.match(res.systemMessage as string, /proximity jumped/i);
    assert.match(res.systemMessage as string, /relationship signals suggest/i);
});

test("Stage.afterResponse: scars log and recall emits a recall note", async () => {
    const stage = makeStage({
        strictness: 3,
        ui_enabled: 0,
        prompt_injection_enabled: 1,
        prompt_injection_include_scene: 0,
        note_scar_recall: 1,
    });

    await stage.afterResponse({content: transcripts.scar_logging_and_recall.botTurns[0]} as any);
    assert.ok(Array.isArray(stage.myInternalState.memoryScars));
    assert.ok(stage.myInternalState.memoryScars!.some((s: any) => s.event === "betrayal"));
    assert.ok(stage.myInternalState.pendingPromptNotes);
    const res = await stage.beforePrompt({content: "next"} as any);
    assert.match(res.systemMessage as string, /Recall:/i);
});

test("Stage.afterResponse: action-only replies are not treated as silence", async () => {
    const stage = makeStage({
        strictness: 3,
        ui_enabled: 0,
        prompt_injection_enabled: 1,
        prompt_injection_include_scene: 0,
        prompt_injection_max_parts: 6,
    });

    await stage.afterResponse({content: transcripts.silence_vs_action_only.botTurns[0]} as any);
    assert.equal(stage.myInternalState.pendingPromptNotes, null);

    await stage.afterResponse({content: transcripts.silence_vs_action_only.botTurns[1]} as any);
    assert.ok(stage.myInternalState.pendingPromptNotes);
    const res = await stage.beforePrompt({content: "next"} as any);
    assert.match(res.systemMessage as string, /Pause noted/i);
});

test("Stage.afterResponse: unresolved beats are captured and can be surfaced as reminders", async () => {
    const stage = makeStage({
        strictness: 3,
        ui_enabled: 1,
        prompt_injection_enabled: 1,
        prompt_injection_include_scene: 0,
        note_unresolved_beats: 1,
        scene_unresolved_beats_enabled: 1,
    });

    await stage.afterResponse({content: transcripts.unresolved_beats_reminder.botTurns[0]} as any);
    const chatState = (stage as any)._chatState;
    assert.ok(Array.isArray(chatState?.scene?.unresolvedBeats));
    assert.ok(chatState.scene.unresolvedBeats.length >= 1);
    assert.equal(typeof chatState.scene.unresolvedBeats[0]?.snippet, "string");

    await stage.afterResponse({content: transcripts.unresolved_beats_reminder.botTurns[1]} as any);
    assert.ok(stage.myInternalState.pendingPromptNotes);
    const res = await stage.beforePrompt({content: "next"} as any);
    assert.match(res.systemMessage as string, /Unresolved beat reminder/i);
});
