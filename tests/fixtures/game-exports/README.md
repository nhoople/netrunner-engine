# Game exports

Matches exported from the netrunner-game debug page ("Export as an engine test"). Each
`*.json` holds the opening state, every engine action the host applied (including
priority windows it passed without a log line), the invariant failures by step, and
the final state's hash. `tests/game-export/game-exports.test.ts` replays each one with
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

## Re-derived steps

`tithe-run-hq.json` was exported when the engine passed for a player with no window act
(engine v1.147.252). The engine now gives the second player priority in every window
(CR 9.2.7a), so the steps include the passes the host makes for such a player, each with
`logSeq: null`. They were derived by replaying the export with the test driver
`src/demo/passIdle.ts`. The final state differs from the original in one checkpoint id:
the jack-out choice (CR 6.9.4c) no longer gives the Corp priority, so the checkpoint
before it (CR 10.3.3) does not occur.

Engine PF-S1 (the printed-text sweep S1 fixes) added three turn fields
(`firstInstalledCorpCardTrashUsedThisTurn`, `firstInstalledCorpCardTrashMetPending`,
`advancedSincePreviousCheckpoint`). The replayed state with those three fields removed
hashes to the old final hash, so only the hash was updated.

Engine RF-1 (the timing re-audit fixes) added the cost checkpoint after a basic action's
click and after an install cost (CR 10.3.4, 8.5.16d). The replayed state differs from the
one before only in the log, the id counters, and the checkpoint snapshot (every other
field is equal), so only the hash was updated.

Engine FX-small decides whether the run stops when the Runner approaches the server
(CR 6.9.4g) from open information: it stops whenever an unrezzed ice is installed, so
the Runner cannot tell a facedown Formicary from other ice (CR 10.2.2b). The fixture's
unrezzed Palisade on remote-1 now stops the HQ run there, so two passes with
`logSeq: null` (the Corp's, then the Runner's) were added before the access. The
replayed state differs from the one before only in the id counters and the checkpoint
snapshot's id (the stop's priority window, its closing checkpoint, and the checkpoint
outside the movement phase, CR 10.3.6), so only the hash was updated.

Engine PF-S3c records two new turn facts: that the Runner took the basic run action
(Enhanced Login Protocol counts only that, not a run event) and that the Runner has
encountered a piece of ice this turn (Scrubbed's first ice each turn). The fixture's HQ run
sets both, so the replayed state differs from the one before only in those two fields;
only the hash was updated.
