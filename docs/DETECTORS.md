# Adding a detector

This project is intentionally split into:

- `src/analysis_helpers.ts`: pure-ish, unit-testable heuristics (regex + light scoring).
- `src/Stage.tsx`: orchestration (when to run detectors, throttling, UI vs prompt injection selection).
- `src/config_schema.ts`: all config fields surfaced + normalized/clamped.

## Checklist

1. Add the detector logic in `src/analysis_helpers.ts`.
   - Prefer returning structured data: `{note, score, reasons}`.
   - Use negation-aware helpers (`hasAffirmedMatch`, `scoreRegexWithNegation`) to avoid false positives like “not angry”.
2. Add a config toggle in `src/config_schema.ts`.
   - Use boolean-like values (`true/false` or `0/1`) like the existing `note_*` toggles.
   - Add it to `DEFAULT_CONFIG` and to the allowlist in `normalizeConfig` so it isn't “hidden”.
3. Wire it in `src/Stage.tsx`.
   - Create a stable candidate id (e.g. `conflict_repair`, `proximity_skip`).
   - Call `addCandidate({ id, text, score, critical?, debug? })`.
   - Let selection/throttling happen in the existing UI/prompt selection blocks rather than inside the detector.
4. Add tests.
   - Helper-level unit tests in `tests/stage-helpers.test.ts` (or a new focused test file).
   - Stage lifecycle integration tests in `tests/stage-lifecycle.test.ts` if it affects `beforePrompt`/`afterResponse` behavior.
5. Update docs.
   - Add a short bullet to `README.md` if the detector is user-facing.

## Debugging

- Set `ui_debug_scoring: 1` to expose scored candidates in the in-iframe “Explain scoring” panel.
- Candidate `debug` fields should be JSON-serializable where possible.

