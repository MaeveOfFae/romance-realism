![](demo.GIF)

# Romance Realism Pack

Background-only realism guardrails for slow-burn romance roleplay. This Stage runs silently alongside a chat to provide non-intrusive, user-visible system notes that help keep long-form roleplay emotionally consistent and slow-burning without rewriting or blocking user content.

**Key goals**

- Detect abrupt emotional shifts and suggest transitional cues.
- Track scene carryover (location, time-of-day, lingering mood, unresolved beats).
- Monitor slow-burn relationship phases and flag skipped escalation steps.
- Log emotional "scars" (conflicts, confessions, rejections) in an append-only memory.
- Surface subtext and pause/hesitation signals as concise system notes for authorship visibility.

**Safety guarantees**
- Never rewrites or censors messages.
- No external network calls.
- No UI rendering — this stage is background-only (returns `null` from `render`).

## Files of interest
- `src/Stage.tsx` — stage implementation and lifecycle hooks (`load`, `beforePrompt`, `afterResponse`, `setState`).
- `src/config_schema.ts` — null-safe config schema and `normalizeConfig` helper.
- `src/TestRunner.tsx` — local development runner used in dev mode.

## Config
The stage accepts a small, null-safe config object. Missing values fall back to sensible defaults.

- `enabled` (boolean) — default `true`. Turn the pack on/off.
- `strictness` (integer, 1–3) — default `2`. Controls annotation frequency and sensitivity.
- `memory_depth` (integer, 5–30) — default `15`. Caps the size of the emotional scar memory.

Use `normalizeConfig` from `src/config_schema.ts` when reading config to ensure values are clamped and safe.

## Developer notes

- The Stage is background-only and must not render UI. Keep `render()` returning `null`.
- Lifecycle responsibilities:
- `load()` initializes any async resources (returns `success: true` by default).
- `beforePrompt()` attaches a concise scene summary as a system message when available.
- `afterResponse()` runs analysis hooks: emotion snapshot, delta evaluation, scene capture, escalation signals, memory scar logging.
- `setState()` restores message-level persisted state after branch navigation.
- All heuristics are intentionally lightweight and heuristic-first for easy unit testing and iteration.

## Testing
- Add unit tests for `extractEmotionSnapshot`, `evaluateEmotionalDelta`, and `detectEscalationSignals`.
- Functional tests to cover: emotional whiplash detection, scene persistence, phase advancement enforcement, memory-scar recall, and silence interpretation.

### Run locally
Install dependencies and run the dev runner (project is a stage template):

```bash
yarn install
yarn dev
```

`src/TestRunner.tsx` will be used during development to simulate chat interactions.

## Packaging & publishing
- Update `chub_meta.yaml` with stage metadata (name `romance-realism-pack`, tags `romance`, `realism`, `slow-burn`, `roleplay`, scope `chat`).
- Use the repository's GitHub Actions workflow to publish; set `CHUB_AUTH_TOKEN` in repository secrets.

## Contributing
- Keep fixes focused and test-driven. Avoid adding external network calls or UI components.
