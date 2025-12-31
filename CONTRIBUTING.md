# Contributing

## Prereqs

- Node `21.7.1` is the primary dev target (see `package.json` `engines`).
- CI also runs on Node LTS.
- Yarn classic (v1) recommended.

## Common commands

- Install: `yarn install`
- Dev runner (TestRunner + Playground): `yarn dev`
- Lint: `yarn lint`
- Type-check: `yarn tsc --noEmit`
- Tests (clean compile): `yarn test`
- Tests (CI / cached `.test-dist`): `yarn test:ci`
- Build stage bundle: `yarn build`
- Verify `public/chub_meta.yaml` copied into `dist/`: `yarn verify:meta`
- Build library bundle + `.d.ts` (overwrites `dist/`): `yarn build --mode lib`
- Verify library outputs expected by `package.json` exports: `yarn verify:lib-dist`

## Adding a new detector

See `docs/DETECTORS.md`.

## Notes

- Keep heuristics in `src/analysis_helpers.ts` whenever possible (unit-testable, no Stage wiring).
- Add a config toggle in `src/config_schema.ts` for any new detector that emits guidance.
- Add tests in `tests/` for both helper-level behavior and Stage lifecycle integration when relevant.
- Avoid writing guidance into the chat transcript; prefer stage UI notes and one-shot `systemMessage` injection.
