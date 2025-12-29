![](demo.GIF)

# Romance Realism

Background-only realism guardrails for slow-burn romance roleplay. This Stage runs silently alongside a chat to provide non-intrusive, user-visible system notes that help keep long-form roleplay emotionally consistent and slow-burning without rewriting or blocking user content.

**Key goals**

- Detect abrupt emotional shifts and suggest transitional cues.
- Track scene carryover (location, time-of-day, lingering mood, unresolved beats).
- Monitor slow-burn relationship phases and flag skipped escalation steps.
- Log emotional "scars" (conflicts, confessions, rejections) in an append-only memory.
- Surface subtext and pause/hesitation signals as concise system notes for authorship visibility.

**Safety guarantees**

## Romance Realism Pack

Background-only realism guardrails for slow-burn romance roleplay. This Stage runs quietly alongside a chat and emits concise, user-visible system notes to help keep long-form roleplay emotionally coherent and slow-burning without rewriting or blocking user content.

Summary of implemented features (status):
- Stage skeleton & lifecycle wiring — completed
- Config schema & null-safety (`enabled`, `strictness`, `memory_depth`) — completed
- Emotion snapshot (tone + intensity) and delta / whiplash detection — completed
- System annotations for whiplash — completed
- Scene carryover capture and prompt summary — completed
- Relationship phase tracking (Neutral → Familiar → Charged → Intimate) with multi-signal advancement and skip warnings — completed
- Proximity realism gate (Distant, Nearby, Touching, Intimate) with skipped-step warnings — completed
- Consent & agency checks (assigned emotions to user, forced consent, internal monologue detection) — completed
- Memory scar system (confession, betrayal, rejection, conflict logging; append-only; recall) — completed
- Subtext highlight layer (hesitation, avoidance, guarded interest, fear of rejection) — completed
- Silence & pause interpreter (short/non-committal replies, explicit pauses) — completed
- Relationship drift detector (stagnation detection + suggestions) — completed

Estimated completeness: core feature set implemented ~95% — remaining work is testing, heuristic tuning, developer docs, and optional UX/config improvements.

## Files of interest

- `src/Stage.tsx` — stage implementation and lifecycle hooks (`load`, `beforePrompt`, `afterResponse`, `setState`). All heuristics and state models live here.
- `src/config_schema.ts` — null-safe config schema and `normalizeConfig` helper.
- `public/chub_meta.yaml` — stage metadata (name, tagline, tags, visibility, position).
- `src/TestRunner.tsx` — local development runner used in dev mode.

## Config

The stage accepts a small, null-safe config object. Missing values fall back to defaults.

- `enabled` (boolean) — default `true`. Toggle the pack on/off.
- `strictness` (integer, 1–3) — default `2`. Controls annotation frequency/throttling and some detector windows.
- `memory_depth` (integer, 5–30) — default `15`. Caps the size of the memory scars log.

Use `normalizeConfig` from `src/config_schema.ts` when reading config to ensure values are clamped and safe.

## Developer notes & change summary

- The Stage is background-only and must not render visible UI — `render()` returns an empty fragment.
- Key lifecycle wiring:
	- `load()` initializes the stage and returns `success: true`.
	- `beforePrompt()` attaches a concise scene summary as a system message when scene context exists.
	- `afterResponse()` performs all analyses and augments message-level state (`messageState`) and may add a `systemMessage` shown to authors.
	- `setState()` restores persisted message-level state on branch navigation.

Recent changes (high level):

- Added robust, typed config normalization to `src/config_schema.ts`.
- Implemented emotion snapshot extraction and delta evaluation.
- Implemented scene capture & summarization.
- Implemented phase tracking and escalation signals with warnings.
- Implemented proximity gating and skipped-step warnings.
- Implemented consent/agency pattern detection and annotation.
- Implemented structured memory scar logging and a single recall mechanism.
- Implemented subtext extraction and silence/pause interpreter.
- Implemented relationship drift detection with strictness-based throttling.

All heuristics are intentionally lightweight regex/heuristic-based and organized for easy unit testing and iterative refinement.

## Testing & QA

- Recommended unit tests:
	- `extractEmotionSnapshot` — verify tone/intensity classification
	- `evaluateEmotionalDelta` — whiplash detection logic
	- `detectEscalationSignals` — multiple signal types and phase suggestions
	- `detectProximityTransitions` — transition and skip detection
	- `detectConsentIssues`, `detectMemoryEvents`, `detectSubtext`, `detectSilenceOrPause`, `detectDrift`
- Recommended functional tests:
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

Run dev mode (uses `src/TestRunner.tsx`):

```bash
yarn install
yarn dev
```

Note: `package.json` currently specifies Node `21.7.1` in `engines`. Use an appropriate Node version manager (nvm/asdf) if your system differs.

## Packaging & release

- `public/chub_meta.yaml` has been updated with metadata: `project_name: "Romance Realism Pack"`, `tagline`, `visibility: PUBLIC`, `position: NONE`, and tags (`romance`, `realism`, `slow-burn`, `roleplay`).
- Before publishing: add unit tests, confirm `yarn build`, update version and changelog, and add release notes.

## Next recommended tasks

1. Add unit tests and CI (type-check, lint, tests).
2. Tune heuristics and thresholds; expose more config knobs if desired.
3. Add a `--dry-run` or verbose debug mode to surface all suppressed annotations for authors.
4. Finalize documentation for contributors describing how to add new detectors and tests.
