# Game exports

Matches exported from the netrunner-game debug page ("Export as an engine test"). Each
`*.json` holds the opening state, every engine action the host applied (including
priority windows it passed without a log line), the invariant failures by step, and
the final state's hash. `tests/game-exports.test.ts` replays each one with
`applyAction` then `autoWalk` per step and expects the same failures and final state.
The loader is `tests/game-export/loader.ts`.

Failures use the playout seed fixtures' shape (`tests/fixtures/playout-seeds.json`):
`{ code, step, detail }`, keyed on `code@step`, with step -1 for the opening.

## Adding one

Download the fixture from the match's debug page, give it a name that says what it
checks, and add it here. A fixture that records an invariant problem also needs that
problem in `tests/baselines/invariants.json` for this test (see
`tests/setup/invariants.ts`).

## Files

| Fixture | What it checks |
|---|---|
| `tithe-run-hq.json` | Scenario: Runner runs HQ past a rezzed Tithe. Both subroutines fire (1 net damage trashes the only grip card; the Corp gains 1¢), then the Runner accesses HQ |
