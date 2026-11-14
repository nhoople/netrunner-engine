# Mutation scores

Mutation testing (CR audit tool 1.9) shows whether the tests check the engine's outcome or only the shape of its code. Stryker changes one piece of a helper at a time, such as flipping a condition or dropping a call, and runs that area's tests. A mutant that survives is a change no test noticed.

Runs are local only, not in CI. Each Phase 3 area records its score here when it starts (the per-area recipe, step 2) and again when it closes. An area's exit criteria ask for no surviving mutants in the helper's CR-cited branches.

## Running an area

```bash
npm run mutate:swap
```

There is one script per area: `mutate:hosting-trash`, `mutate:uninstall`, `mutate:swap`, `mutate:visibility`, `mutate:corp-install`, `mutate:runner-install`, `mutate:rez`, `mutate:access`, `mutate:damage`, `mutate:card-flags`.

- `stryker/areas.mjs` sets each area's scope. `mutate` lists the helper files to change. The tests are the files that match the area's globs, plus any test whose text matches its `grep` pattern (CR cites, helper names, card titles).
- `stryker/<area>.config.mjs` builds the Stryker config. Stryker uses the vitest runner with `stryker/vitest.config.mjs`, which narrows the suite to that area's tests and keeps the invariant hook.
- Tests that scan source text (kind liveness, the flag inventory, effect IR names, and similar sweeps) are left out of every area. Stryker rewrites the files it mutates, so those tests fail its first clean run, and they can't kill a behavioral mutant anyway.
- Reports go to `reports/mutation/<area>.html` and `.json` (gitignored). Read the HTML report for the full list of survivors.
- When an area moves its procedure into `src/state/procedures/`, add that module to the area's `mutate` list. `tests/mutation-areas.test.ts` fails if a listed file goes missing.

A score is killed ÷ (killed + survived + no coverage). "Covered" leaves out the mutants that no selected test reaches.

## Scores

| Area | Date | Engine | Mutants | Killed | Survived | No coverage | Score | Covered score |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 3. Swap | 2026-11-13 | v1.147.252 | 1335 | 429 | 279 | 627 | 32.13% | 60.59% |

## 3. Swap (baseline, 2026-11-13)

Files mutated: `src/effects/kinds/swapKinds.ts` and `src/effects/primitives/swapNetBreach.ts`. The run selected 14 test files and 1224 tests; the full run took about 2 minutes on 4 workers.

| File | Score | Covered | Killed | Survived | No coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| `swapKinds.ts` | 33.11% | 60.42% | 345 | 226 | 471 |
| `swapNetBreach.ts` | 28.67% | 61.31% | 84 | 53 | 156 |

`swapNetBreach.ts` mixes in kinds from other areas (Net-Ready Eyes, Analog Dreamers, `trash_rezzed_copy`, `shuffle_into_rd`). Area 3 should split out the swap kinds and leave the rest to their own areas, so this score measures only swaps.

### Surviving mutants in CR-cited branches

These are the ones the exit criteria count. Each line is a change no test noticed.

- **`trashHostedOnSwapOut` (CR 8.8.4b), 17 survivors.** Removing the call to `releaseHostedCardsOnTrash` survives, so no test checks that a card swapped out of play trashes what it hosted. Clearing hosted advancement, virus, power, and credit counters also survives: `hostedCounters > 0` can become `>= 0` or `true`, and `+` can become `-`. So does dropping the checkpoint baseline (`!state.previousCheckpointSnapshot` → `true`).
- **`occurSwapCheckpoint` (CR 8.8.4b), 31 survivors.** The swap's install trigger can be left `pending` and the first-remote-install flag left unset, and no test fails. The identity first-remote-install hook (`onFirstRemoteInstallThisTurn`) and the pending-ability cleanup filter can each become `true` or `false`.
- **`canSwapIntoPlaceOf` (CR 3.3.1, 8.5.2b, 8.5.2c, 8.5.12, 3.6.5), 17 survivors.** Turning each server-legality gate off survives: named-server limits, `remoteOnly`, the region and one-per-server limit for upgrades, the agenda-or-asset type check, and the "no other agenda or asset in the root" check. No test tries an illegal swap.

### Surviving mutants by kind

| Kind or helper | Survived | No coverage |
| --- | ---: | ---: |
| `swap_yagi_hq_with_attacked_pick` | 27 | 13 |
| `swap_approached_ice_with_hq_or_archives` | 25 | 13 |
| `may_swap_approached_ice_with_hq` | 21 | 4 |
| `swap_approached_ice_with_hq` | 19 | 10 |
| `may_swap_ice_with_other_installed` | 19 | 9 |
| `swap_ice_with_hq` | 16 | 16 |
| `swap_turntable_resolve` | 16 | 5 |
| `swap_yagi_hq_with_attacked_root_or_ice` | 14 | 16 |
| `swap_two_installed_ice` | 13 | 6 |
| `swap_stolen_with_corp_scored` | 8 | 8 |
| `swap_pick` | 1 | 91 |
| `swap_this_root_with_other_root_or_hq` | 1 | 73 |
| `swap_source_ice_with_other` | 1 | 51 |
| `may_swap_protecting_attacked_ice_with_other_installed` | 1 | 49 |
| `swap_two_ice` | 1 | 40 |
| `swap_protecting_attacked_ice_with` | 1 | 39 |
| `swap_protecting_attacked_ice_pick_other` | 1 | 36 |

The kinds with high no-coverage counts (`swap_pick`, `swap_this_root_with_other_root_or_hq`, `swap_source_ice_with_other`, the `*_protecting_attacked_ice_*` family, `swap_two_ice`) are reached by no test in the area. Some are exercised by tests outside the selection. Widen the area's `grep` before writing new tests for them. Survivors that are only log strings or `StringLiteral` swaps in messages (44 in `swapKinds.ts`) don't need tests.
