# Romance Realism

TL;DR - Keeps track of mundane shit hopefully so that the characters can say... remember where they are standing.

Background-only realism guardrails for slow-burn romance roleplay. This Stage runs silently alongside a chat and shows non-intrusive notes inside the stage UI (never injected into the chat log) to help keep long-form roleplay emotionally consistent and slow-burning without rewriting or blocking user content.

Key goals:

- Detect abrupt emotional shifts and suggest transitional cues.
- Track scene carryover (location, time-of-day, lingering mood, unresolved beats).
- Monitor slow-burn relationship phases and flag skipped escalation steps.
- Log emotional "scars" (conflicts, confessions, rejections) in an append-only memory.
- Surface subtext and pause/hesitation signals as concise notes for authorship visibility.

## Romance Realism Pack

Background-only guardrails for slow-burn romance roleplay. The Stage runs beside a chat, surfaces concise system notes in its own UI, and never rewrites or blocks user text. It keeps tone, pacing, proximity, and continuity coherent so long-form scenes stay consistent.

## Highlights

- Scene carryover capture and prompt summary — completed
Notes stay in the stage UI; nothing is injected into the chat transcript or used to block messages.

## Project layout

- `src/Stage.tsx` — lifecycle (`load`, `beforePrompt`, `afterResponse`, `setState`) and orchestration.
- `src/analysis_helpers.ts` — unit-testable heuristics (emotion snapshot, delta eval, escalation signals, realism detectors).
- `src/config_schema.ts` — null-safe config and `normalizeConfig` helper.
- `src/TestRunner.tsx` — local dev runner.
- `src/DeveloperUI.tsx` — read-only overlay (dev only).
- `src/Playground.tsx` — interactive showcase for the heuristics.
- `public/chub_meta.yaml` — stage metadata.
- `tests/*.test.ts` — unit tests compiled to `.test-dist/` by `yarn test`.

## Configuration

Always run configs through `normalizeConfig`:

- `enabled` — boolean (default `true`).
- `strictness` — 1–3 (default `2`); throttles how chatty notes are (`3` is most visible).
- `memory_depth` — 5–30 (default `15`); cap for the memory-scar log.

## Requirements

- Node `21.7.1` (per `package.json` engines)
- Yarn (recommended)

## Install & run

```bash
yarn install

# Dev mode (TestRunner + Playground)
yarn dev

# Type-check
yarn tsc --noEmit

# Run tests (compile to .test-dist then run node:test)
yarn test

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

## Config

The stage accepts a small, null-safe config object. Missing values fall back to defaults.

- `enabled` (boolean) — default `true`. Toggle the pack on/off.
- `strictness` (integer, 1–3) — default `2`. Controls note frequency/throttling and some detector windows (use `3` to show more UI notes; `1–2` are intentionally quiet).
- `memory_depth` (integer, 5–30) — default `15`. Caps the size of the memory scars log.

Use `normalizeConfig` from `src/config_schema.ts` when reading config to ensure values are clamped and safe.

## Developer notes & change summary

The Stage does not inject system messages into the chat log. Any guidance is shown only inside the stage UI.

Key lifecycle wiring:

- `load()` initializes the stage and returns `success: true`.
- `beforePrompt()` may record a concise scene summary as a stage UI note when scene context exists.
- `afterResponse()` performs all analyses and augments message-level state (`messageState`) and may add a stage UI note.
- `setState()` restores persisted message-level state on branch navigation.

Recent changes (high level):

- Added robust, typed config normalization to `src/config_schema.ts`.
- Implemented emotion snapshot extraction and delta evaluation (now in `src/analysis_helpers.ts`).
- Implemented scene capture & summarization.
- Implemented phase tracking and escalation signals with warnings.
- Implemented proximity gating and skipped-step warnings.
- Implemented consent/agency pattern detection and annotation.
- Implemented structured memory scar logging and a single recall mechanism.
- Implemented subtext extraction and silence/pause interpreter.
- Implemented relationship drift detection with strictness-based throttling.
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

- `public/chub_meta.yaml` has been updated with metadata: `project_name: "Romance Realism Pack"`, `tagline`, `visibility: PUBLIC`, `position: NONE`, and tags (`romance`, `realism`, `slow-burn`, `roleplay`).
- Before publishing: add unit tests, confirm `yarn build`, update version and changelog, and add release notes.
