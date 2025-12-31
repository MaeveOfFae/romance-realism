# Romance Realism

TL;DR - Keeps track of mundane shit hopefully so that the characters can say... remember where they are standing.

Background-only realism guardrails for slow-burn romance roleplay. This Stage runs silently alongside a chat and shows non-intrusive notes inside the stage UI (never injected into the chat log) and can optionally inject one-shot guidance into the *next* LLM system prompt (still not written into the chat transcript) to keep long-form roleplay emotionally consistent and slow-burning without rewriting or blocking user content.

Key goals:

- Detect abrupt emotional shifts and suggest transitional cues.
- Track scene carryover (location, time-of-day, lingering mood, unresolved beats).
- Monitor slow-burn relationship phases and flag skipped escalation steps.
- Log emotional "scars" (conflicts, confessions, rejections) in an append-only memory.
- Surface subtext and pause/hesitation signals as concise notes for authorship visibility.

## Romance Realism Pack

Background-only guardrails for slow-burn romance roleplay. The Stage runs beside a chat, surfaces concise system notes in its own UI, and never rewrites or blocks user text. It keeps tone, pacing, proximity, and continuity coherent so long-form scenes stay consistent.

## Highlights

- Scene carryover capture and compact summaries — completed
- Optional one-shot system-prompt injection (never written into chat transcript) — completed
Notes stay in the stage UI; nothing is injected into the chat transcript, and prompt injection (when enabled) is system-prompt-only and one-shot.

## Project layout

- `src/Stage.tsx` — lifecycle (`load`, `beforePrompt`, `afterResponse`, `setState`) and orchestration.
- `src/analysis_helpers.ts` — unit-testable heuristics (emotion snapshot, delta eval, escalation signals, realism detectors).
- `src/config_schema.ts` — null-safe config and `normalizeConfig` helper.
- `src/TestRunner.tsx` — local dev runner.
- `src/DeveloperUI.tsx` — read-only overlay (dev only).
- `src/Playground.tsx` — interactive showcase for the heuristics.
- `public/chub_meta.yaml` — stage metadata.
- `docs/DETECTORS.md` — how to add detectors.
- `CONTRIBUTING.md` — contributor workflow and commands.
- `tests/*.test.ts` — unit tests compiled to `.test-dist/` by `yarn test`.

## Configuration

Always run configs through `normalizeConfig`:

Booleans accept `true/false` (or `0/1`).

Core:

- `enabled` — boolean (default `true`).
- `strictness` — 1–3 (default `2`); throttles how chatty notes are (`3` is most visible).
- `memory_depth` — 5–30 (default `15`); cap for the memory-scar log.

UI:

- `ui_enabled` — boolean (default `true`); show the in-iframe notes UI.
- `ui_max_notes` — 1–50 (default `10`); max notes kept in the feed.
- `ui_show_status` — boolean (default `true`); show turn/time status header.
- `ui_show_timestamps` — boolean (default `true`); show timestamps per note.
- `max_notes_per_20` — `-1` (auto) or 0–20; override strictness note quota per ~20 turns (applies to UI notes + prompt injection). Legacy alias: `max_ui_notes_per_20`.
- `tune_ui_note_parts` — `null` (strictness default) or 1–6; max merged note parts per emitted note.
Prompt injection:

- `prompt_injection_enabled` — boolean (default `true`); injects selected guidance into the next message's system prompt (never into chat transcript).
- `prompt_injection_include_scene` — boolean (default `true`); include a compact scene summary when available.
- `prompt_injection_max_parts` — 1–6 (default `3`); max guidance bullets injected per turn.
- `prompt_injection_max_chars` — 100–4000 (default `900`); cap for the injected system message.

Notes (per-detector toggles):

- `note_scene_summary` (default `true`)
- `note_emotion_delta` (default `true`)
- `note_phase` (default `true`)
- `note_proximity` (default `true`)
- `note_consent` (default `true`)
- `note_subtext` (default `true`)
- `note_silence` (default `true`)
- `note_drift` (default `true`)
- `note_scar_recall` (default `true`)
- `note_unresolved_beats` (default `true`) — remind when an unresolved beat exists and the scene is softening/escalating.

Story beats:

- `scene_unresolved_beats_enabled` (default `true`) — track unresolved beats in scene state.
- `unresolved_beats_max_history` — 0–20 (default `10`); max stored beat snippets.
- `unresolved_beats_snippet_max_chars` — 40–240 (default `160`); max chars per snippet.
- `tune_unresolved_beat_score_threshold` — `null` (strictness default) or 1–20; reminder sensitivity.
- `tune_unresolved_beat_cooldown_turns` — `null` (strictness default) or 0–50; minimum turns between reminders for the same beat.

Tuning:

- `tune_phase_weight_threshold` — `null` (strictness default) or 1–20; override weighted phase threshold.
- `tune_delta_score_threshold` — `null` (strictness default) or 0–20; override whiplash score threshold.

Debug:

- `ui_debug_scoring` — boolean (default `false`); enables “Explain scoring” in the notes UI.
- `ui_debug_max_candidates` — 1–50 (default `12`); candidate rows shown in the debug panel.

## Requirements

- Node `21.7.1` (per `package.json` engines)
- Yarn (recommended)

## Install & run

```bash
yarn install

# Dev mode (TestRunner + Playground)
yarn dev

# Lint
yarn lint

# Type-check
yarn tsc --noEmit

# Run tests (compile to .test-dist then run node:test)
yarn test

# Run tests (CI-style; uses cached .test-dist when available)
yarn test:ci

# Production build
yarn build
```

## Testing

- `tests/config_schema.test.ts` — config normalization/clamping.
- `tests/stage-helpers.test.ts` — emotion snapshot, delta, escalation signals.

Manual sanity checks: whiplash spikes, scene persistence across `setState`/swipe, phase/proximity skips, memory-scar logging/recall, silence vs. disengagement classification.

## Roadmap

- Add CI (type-check, build, tests).
- Add functional tests around lifecycle and state persistence.
- Tune heuristics/thresholds; consider exposing more config.
- Document how to add new detectors and tests.
- Proximity realism gate (Distant, Nearby, Touching, Intimate) with skipped-step warnings — completed
- Consent & agency checks (assigned emotions to user, forced consent, internal monologue detection) — completed
- Memory scar system (confession, betrayal, rejection, conflict logging; append-only; recall) — completed
- Subtext highlight layer (hesitation, avoidance, guarded interest, fear of rejection) — completed
- Silence & pause interpreter (short/non-committal replies, explicit pauses) — completed
- Relationship drift detector (stagnation detection + suggestions) — completed

Estimated completeness: core feature set implemented ~95% — remaining work is testing, heuristic tuning, developer docs, and optional UX/config improvements.

## Files of interest

- `src/Stage.tsx` — stage implementation and lifecycle hooks (`load`, `beforePrompt`, `afterResponse`, `setState`). Orchestration and state wiring live here.
- `src/analysis_helpers.ts` — extracted, unit-testable heuristic helpers (emotion snapshot, delta evaluation, escalation signals, realism detectors).
- `src/config_schema.ts` — null-safe config schema and `normalizeConfig` helper.
- `public/chub_meta.yaml` — stage metadata (name, tagline, tags, visibility, position).
- `src/TestRunner.tsx` — local development runner used in dev mode.
- `src/DeveloperUI.tsx` — read-only developer overlay panel (dev runner only).
- `tests/*.test.ts` — unit tests (compiled to `.test-dist/` by `yarn test`).
- `tsconfig.test.json` — TypeScript config for compiling tests to `.test-dist/`.

## Developer notes & change summary

The Stage does not inject system messages into the chat log. Guidance is shown inside the stage UI, and (when enabled) injected one-shot into the next system prompt only.

Key lifecycle wiring:

- `load()` initializes the stage and returns `success: true`.
- `beforePrompt()` may record a concise scene summary (UI) and may inject queued notes into the next system prompt (one-shot).
- `afterResponse()` performs all analyses, augments message-level state (`messageState`), emits UI notes, and queues prompt injection notes.
- `setState()` restores persisted message-level state on branch navigation.

Recent changes (high level):

- Added robust, typed config normalization to `src/config_schema.ts`.
- Implemented weighted, negation-aware emotion snapshot extraction and delta evaluation (now in `src/analysis_helpers.ts`).
- Implemented scene capture & summarization.
- Implemented phase tracking and escalation signals with warnings.
- Implemented proximity gating and skipped-step warnings.
- Implemented consent/agency pattern detection and annotation.
- Implemented structured memory scar logging and a single recall mechanism.
- Implemented subtext extraction and silence/pause interpreter.
- Implemented relationship drift detection with strictness-based throttling.
- Added one-shot system-prompt injection (configurable; never written into chat transcript).
- Added a read-only developer overlay (toggle in dev runner settings).
- Added unit tests and a `yarn test` script (Node `node:test`, compiled to `.test-dist/`).

All heuristics are intentionally lightweight regex/heuristic-based, emit weighted signals, and are organized for easy unit testing and iterative refinement.

## Testing & QA

Unit tests:

- `tests/config_schema.test.ts` covers config normalization and clamping.
- `tests/stage-helpers.test.ts` covers emotion snapshot, emotional delta, and escalation signal extraction.

Recommended functional tests:

- Emotional whiplash scenarios
- Scene persistence across `setState`/swipe
- Phase advancement and skip warnings
- Memory-scar logging and recall
- Silence vs disengagement classification

### Quick local checks

Type-check and build:

```bash
yarn tsc --noEmit
yarn build
```

Run unit tests:

```bash
yarn test
```

Run dev mode (uses `src/TestRunner.tsx`):

```bash
yarn install
yarn dev
```

Note: `package.json` currently specifies Node `21.7.1` in `engines`. Use an appropriate Node version manager (nvm/asdf) if your system differs.

## Packaging & release

- `public/chub_meta.yaml` has been updated with metadata: `project_name: "Romance Realism Pack"`, `tagline`, `visibility: PUBLIC`, `position: ADJACENT`, and tags (`romance`, `realism`, `slow-burn`, `roleplay`).
- Before publishing: add unit tests, confirm `yarn build`, update version and changelog, and add release notes.

## Next recommended tasks

1. Add CI (type-check, build, tests).
2. Add functional tests around Stage lifecycle and state persistence.
3. Tune heuristics and thresholds; expose more config knobs if desired.
4. Document how to add new detectors + tests.
