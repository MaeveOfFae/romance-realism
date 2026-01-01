# Romance Realism

Invisible, background guardrails for slow-burn romance roleplay. Runs beside the chat, shows concise notes in the stage UI, and can optionally inject one-shot guidance into the next system prompt (never into the transcript).

## What it does

- Keeps tone, pacing, proximity, and scene carryover coherent (location, time-of-day, lingering mood, unresolved beats).
- Detects abrupt emotional shifts and suggests transitional cues.
- Tracks relationship phases and proximity; warns when escalation skips setup.
- Logs emotional "scars" (conflicts, confessions, rejections) and can recall them later.
- Surfaces consent/agency issues, subtext, hesitation/silence, drift, and unresolved beats.

## Guarantees

- Never rewrites or blocks user text; notes live only in the stage UI.
- Prompt injection (when enabled) is one-shot, system-prompt-only, and off the transcript.
- Heuristics are lightweight regex-based and unit-testable; configs are null-safe via `normalizeConfig`.

## Quick start

Prereqs: Node 21.7.1, Yarn.

```bash
yarn install
# Dev mode (TestRunner + Playground)
yarn dev
# Lint / type-check
yarn lint
yarn tsc --noEmit
# Tests (compile to .test-dist then run node:test)
yarn test
# Tests (CI-style; reuses cached .test-dist when available)
yarn test:ci
# Production build
yarn build
```

## Lifecycle at a glance

- `load()` sets up defaults and returns success + initial state.
- `beforePrompt()` may emit a compact scene summary to the UI and inject pending notes (one-shot system message) when enabled.
- `afterResponse()` runs all detectors, updates message/chat state, emits UI notes, and queues the next prompt injection.
- `setState()` restores persisted message-level state on branch navigation and re-applies caps.

## Configuration (normalize everything)

- Core: `enabled`, `strictness` (1-3), `memory_depth` (5-30).
- UI: `ui_enabled`, `ui_max_notes`, `ui_show_status`, `ui_show_timestamps`, `max_notes_per_20` (or legacy `max_ui_notes_per_20`), `tune_ui_note_parts`.
- Prompt injection: `prompt_injection_enabled`, `prompt_injection_include_scene`, `prompt_injection_max_parts`, `prompt_injection_max_chars`.
- Per-detector toggles: `note_scene_summary`, `note_emotion_delta`, `note_phase`, `note_proximity`, `note_consent`, `note_subtext`, `note_silence`, `note_drift`, `note_scar_recall`, `note_unresolved_beats`.
- Story beats: `scene_unresolved_beats_enabled`, `unresolved_beats_max_history`, `unresolved_beats_snippet_max_chars`, `tune_unresolved_beat_score_threshold`, `tune_unresolved_beat_cooldown_turns`.
- Tuning overrides: `tune_phase_weight_threshold`, `tune_delta_score_threshold`, `tune_ui_note_parts`.
- Lexicon tuning: `tune_emotion_extra`, `tune_scene_location_place_heads`, `tune_scene_location_stopwords`.
- Debug: `ui_debug_scoring`, `ui_debug_max_candidates`.

## Signals and detectors

- Emotion snapshot and delta (whiplash detection, negation-aware keywords).
- Escalation signals, phase tracking, and proximity gating (skip warnings).
- Consent/agency checks (assigned emotions, forced decisions, coercive action, internal monologue, involuntary body responses).
- Subtext, hesitation/silence interpreter, and relationship drift detection.
- Memory scars (log + recall) and unresolved beat capture/reminders.
- Scene capture and summarization (location/time/mood/beats).

## Project layout

- `src/Stage.tsx` — lifecycle (`load`, `beforePrompt`, `afterResponse`, `setState`) and orchestration.
- `src/analysis_helpers.ts` — unit-testable heuristics (emotion snapshot, delta eval, escalation signals, realism detectors).
- `src/config_schema.ts` — null-safe config and `normalizeConfig` helper.
- `src/TestRunner.tsx` — local dev runner.
- `src/DeveloperUI.tsx` — read-only overlay (dev only).
- `src/Playground.tsx` — interactive heuristics showcase.
- `public/chub_meta.yaml` — stage metadata.
- `docs/DETECTORS.md` — how to add detectors.
- `CONTRIBUTING.md` — contributor workflow and commands.
- `tests/*.test.ts` — unit tests compiled to `.test-dist/` by `yarn test`.

## Testing and QA

Unit tests:

- `tests/config_schema.test.ts` — config normalization/clamping.
- `tests/stage-helpers.test.ts` — emotion snapshot, delta, escalation signals.
- `tests/stage-lifecycle.test.ts` — load/beforePrompt/afterResponse wiring, scene persistence, whiplash and phase/proximity gates, scar logging/recall, action-only silence handling, unresolved-beat reminders.
- `tests/prompt-quota.test.ts` — global note quota enforcement and critical-note bypass behavior.

Manual sanity checks: whiplash spikes, scene persistence across `setState`/swipe, phase/proximity skips, memory-scar logging/recall, silence vs disengagement classification.

Quick local checks:

```bash
yarn tsc --noEmit
yarn build
yarn test
```

## Packaging and release

- `public/chub_meta.yaml` is populated (project name, tagline, visibility, position, tags).
- Before publishing: ensure `yarn build` passes, update version + changelog, add release notes.

## Roadmap / next steps

- Add CI (type-check, build, tests).
- Add functional tests around lifecycle and state persistence.
- Tune heuristics/thresholds; expose more config where useful.
- Document how to add new detectors and tests.
- Maintain proximity realism gate, consent checks, memory scars, subtext layer, silence interpreter, and drift detector (all implemented).

Estimated completeness: ~95% of core feature set; remaining work is testing, heuristic tuning, developer docs, and UX/config polish.
