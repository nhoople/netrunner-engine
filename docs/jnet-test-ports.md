# Ported jnet scenario tests

**Source:** [mtgred/netrunner](https://github.com/mtgred/netrunner) (jnet), pinned at commit `bc9e2fca073a5b21d247e72877804118e81d5472` when this policy was written. Update that pin deliberately when a later batch uses a newer upstream commit.
**License:** MIT. Adapted material carries the upstream attribution in `tests/jnet/NOTICE.md`, created with the first ported batch.
**Authority:** pinned Comprehensive Rules `v26.03` and current printed card text. Card text wins on a direct contradiction (CR 1.2.1). A jnet expectation is scenario input, and each port verifies the expected board against that authority before landing.

## Status

<!-- BEGIN GENERATED STATUS: regenerate with `node scripts/jnet-status.mjs --write`; do not edit between the markers. -->
30 upstream files considered, 199 scenarios recorded: 20 ported, 17 adapted, 3 promoted, 159 deferred, 0 disagreement. The ports run quarantined through `npm run test:jnet`; the native suite stays the required gate.

### Running in the quarantine

| Upstream file | Ported | Adapted | Promoted |
| --- | ---: | ---: | ---: |
| `test/clj/game/cards/basic_test.clj` | 17 | 1 | 1 |
| `test/clj/game/core/access_test.clj` | 0 | 4 | 0 |
| `test/clj/game/core/engine_test.clj` | 1 | 0 | 1 |
| `test/clj/game/core/costs_test.clj` | 1 | 1 | 0 |
| `test/clj/game/core/actions_test.clj` | 0 | 1 | 0 |
| `test/clj/game/core/charge_test.clj` | 0 | 1 | 0 |
| `test/clj/game/core/ice_test.clj` | 0 | 1 | 0 |
| `test/clj/game/core/init_game_test.clj` | 0 | 1 | 0 |
| `test/clj/game/core/installing_test.clj` | 0 | 0 | 1 |
| `test/clj/game/core/set_up_test.clj` | 0 | 1 | 0 |
| `test/clj/game/core/rezzing_test.clj` | 0 | 1 | 0 |
| `test/clj/game/core/rules_test.clj` | 1 | 3 | 0 |
| `test/clj/game/core/runs_test.clj` | 0 | 2 | 0 |

### Promoted into the native suite

Scenarios whose ports exposed engine defects, each fixed in its own change with a native regression test:

- "installing an upgrade in a new remote creates that server (CR 4.6.8b)" in `tests/legality/basic-action-legality.test.ts` (upstream `game.cards.basic-test/corp-basic-actions-install-upgrade`)
- "playing a Runner current trashes the Corp current (CR 3.5.1b)" in `tests/state/continuous/currents.test.ts` (upstream `game.core.engine-test/trash-currents-test`)
- "Houdini pumps twice on Mantle's recurring credits and reaches 10 strength (CR 1.10.5a)" in `tests/state/keywordsAndCredits/stealth-costs.test.ts` (upstream `game.core.costs-test/pump-and-break`)
- "trashes Endless Hunger so Corroder can install when MU is full (CR 8.5.6c)" in `tests/state/install/program-install-memory.test.ts` (upstream `game.core.installing-test/trash-existing-programs-test`)

### Waiting on the cards data

- `game.core.costs-test/pump-and-break` — The three Hive full-break blocks wait on the pinned catalog, which lists 4 of Hive's 5 printed End the run subroutines.
- `game.core.costs-test/expend-costs-reveal-the-discarded-card` — Reveal-and-trash expend costs carry no reveal, so Hyoubu Institute's first-reveal trigger cannot fire (also Tree Line and Descent).
- `game.core.actions-test/undo-click-with-bioroid-cost` — The bioroid Runner click-break is keyed off the subtype alone, so Wotan, Loki, and Fairchild offer a break their printed text does not have; gating it needs a catalog declaration.

### Deferred

Not ported. Each deferred scenario is being classified against the pinned CR (CR audit tool 1.8): `no-board` asserts jnet internals, UI, chat commands, log wording, or jnet's own source, so there is no rules reading to compare; `agrees` means this engine already matches jnet and the CR; `engine-bug` means the CR settles the point and this engine is wrong. Full reasons and notes are in `tests/jnet/manifest.json`.

| Upstream file | Deferred | No board | Agrees | Engine bug | Not yet classified |
| --- | ---: | ---: | ---: | ---: | ---: |
| `test/clj/game/core/access_test.clj` | 8 | 8 | 0 | 0 | 0 |
| `test/clj/game/core/engine_test.clj` | 6 | 3 | 2 | 1 | 0 |
| `test/clj/game/core/costs_test.clj` | 3 | 2 | 0 | 1 | 0 |
| `test/clj/game/core/actions_test.clj` | 7 | 7 | 0 | 0 | 0 |
| `test/clj/game/core/agendas_test.clj` | 1 | 1 | 0 | 0 | 0 |
| `test/clj/game/core/abilities_test.clj` | 5 | 5 | 0 | 0 | 0 |
| `test/clj/game/core/async_test.clj` | 8 | 8 | 0 | 0 | 0 |
| `test/clj/game/core/board_test.clj` | 1 | 1 | 0 | 0 | 0 |
| `test/clj/game/core/card_test.clj` | 3 | 3 | 0 | 0 | 0 |
| `test/clj/game/core/change_vals_test.clj` | 1 | 1 | 0 | 0 | 0 |
| `test/clj/game/core/effects_test.clj` | 3 | 3 | 0 | 0 | 0 |
| `test/clj/game/core/flags_test.clj` | 1 | 1 | 0 | 0 | 0 |
| `test/clj/game/core/ice_test.clj` | 1 | 1 | 0 | 0 | 0 |
| `test/clj/game/core/rezzing_test.clj` | 1 | 1 | 0 | 0 | 0 |
| `test/clj/game/core/mark_test.clj` | 1 | 1 | 0 | 0 | 0 |
| `test/clj/game/core/memory_test.clj` | 15 | 15 | 0 | 0 | 0 |
| `test/clj/game/core/optional_test.clj` | 1 | 1 | 0 | 0 | 0 |
| `test/clj/game/core/revealing_test.clj` | 1 | 1 | 0 | 0 | 0 |
| `test/clj/game/core/sabotage_test.clj` | 1 | 1 | 0 | 0 | 0 |
| `test/clj/game/core/say_test.clj` | 3 | 3 | 0 | 0 | 0 |
| `test/clj/game/core/stats_test.clj` | 4 | 4 | 0 | 0 | 0 |
| `test/clj/game/core/subtypes_test.clj` | 3 | 3 | 0 | 0 | 0 |
| `test/clj/game/core/rules_test.clj` | 32 | 11 | 12 | 9 | 0 |
| `test/clj/game/core/runs_test.clj` | 36 | 11 | 17 | 8 | 0 |
| `test/clj/game/core/scenarios_test.clj` | 13 | 2 | 5 | 6 | 0 |

### Disagreements (for a human decision)

jnet and this engine differ on a point the CR leaves silent or unclear. The engine is not changed to match jnet; each entry waits for a decision.

None found among the classified scenarios so far.

### Engine bugs found by classification

The CR settles these and the engine is wrong. Each is listed under the Phase 3 area that owns the fix.

- **1. Hosting and trash**
  - `game.core.rules-test/clearing-currents` (CR 3.5.1b, 3.7.1b, 8.6.6c; probe) — jnet's outcome holds (no Hostile Infrastructure damage when a current is cleared), but every played current is also pushed to its discard pile while staying in the play area: trashActiveCurrentsBeforePlay trashes the new current itself. Already in tests/baselines/invariants.json as MULTIPLE_ZONES on tests/state/continuous/currents.test.ts.
  - `game.core.scenarios-test/maxx-annicam-buffer-drive-one-card-in-stack` (CR 1.2.1, 9.2.8d; probe) — The ordering is right (ported, passing: Buffer Drive first, then Aniccam draws the card). Labor Rights, which jnet uses to build the board, is trashed instead of removed from the game, so Aniccam draws off it (fix-now: a supported card wrong in normal use). The defect is against Labor Rights' printed text (CR 1.2.1); CR 9.2.8d is the ordering that agrees.
- **2. Uninstall and run position**
  - `game.core.rules-test/events-after-derez` (CR 4.1.2b, 9.1.7; probe) — Saker's '2 credits, add this program to your grip' cost leaves Saker listed in the rig as well as the grip (MULTIPLE_ZONES). The Kakugo assertion itself is not reached.
  - `game.core.runs-test/run-timing-trashing-a-solo-ice-on-an-empty-server-4940` (CR 4.6.8e; probe) — When Knifed trashes the only card in a remote, the remote ceases to exist and passing the vacated position reads the deleted server and throws (RUN_SERVER_MISSING). CR 4.6.8e ends the run after the open paid ability window. Already in the CR audit findings under area 2 (the remote-deleted-mid-run crash); this board reproduces it with Knifed.
  - `game.core.runs-test/run-timing-redirection-updates-current-ice-5047` (CR 6.2.8b; probe) — Adapted with Susanoo-no-Mikoto in place of jnet's redirect helper. redirect_susanoo_to_archives sets only the attacked server, so the Runner passes Archives' outermost ice instead of approaching it and the run succeeds. CR 6.2.8b moves the Runner to that ice's position and the Approach Ice Phase. Same defect as the Proprionegation row already filed under area 2, on another kind.
- **4. Visibility**
  - `game.core.costs-test/expend-costs-reveal-the-discarded-card` (CR 1.16, 1.21.3; probe) — Slash and Burn Agriculture's 'reveal and trash this agenda from HQ' cost trashes without revealing, so Hyoubu Institute's first-reveal gain never happens. Waits on the cards data (blockedBy).
- **5. Corp install**
  - `game.core.rules-test/trash-corp-hosted` (CR 1.13.6a, 8.5.16b; probe) — Full Immersion RecStudio 'can host up to 2 assets and/or agendas' with no hosting ability, so CR 1.13.6a makes it an install destination for them. The engine offers no Corp install onto a host card ('Corp cannot install to runner'), so the board cannot be built.
- **6. Runner install**
  - `game.core.rules-test/purge-nested` (CR 1.13.5, 10.1.2; probe) — Purging Imp hosted on Djinn works (ported, passing). The engine refuses to host Djinn on Leprechaun ('Cannot host a daemon on a daemon'); Leprechaun 'can host up to 2 programs' and neither card text nor the CR forbids a daemon (CR 1.2.1, 1.13.5).
  - `game.core.scenarios-test/masterwork-overinstall-boomerang-complex-case` (CR 10.3.1d, 4.1.2b; probe) — The second (unique) Boomerang installed by Masterwork trashes the first, as it should, but never asks for its ice (chosenIceId stays unset). Also, The Class Act's 'add 1 to the bottom of your stack' leaves an Easy Mark in runner:stack but out of the stack list (NO_ZONE); filed under area 13.
- **8. Access**
  - `game.core.runs-test/multi-access-correct-handling-of-multi-accesses-with-shuffle-in-between-accesses` (CR 7.4.7, 7.4.7a.ex1; probe) — Probe: stealing Bacterial Programming during a 4-card R&D breach parks the breach at access.stealAgenda with no candidate; legalActions offers finish_breach and applyAction refuses it. This happens even when its ability is declined. The CR 7.4.7a.ex1 test fakes the returned card with a new id, so it doesn't catch this.
  - `game.core.runs-test/multi-access-reordering-cards-during-multi-access` (CR 1.12.3, 7.4.7a; code) — Cards the Corp rearranges in R&D are new objects (CR 1.12.3, 7.4.7a.ex1), so an already-accessed card can be accessed again. refreshRdDeckCandidate keys eligibility on card id, and ids don't change on a rearrange, so the engine skips it.
- **9. Damage**
  - `game.core.rules-test/runner-forced-to-discard-below-hand-size-ends-the-game` (CR 1.7.2b; code) — src/state/damageAndPrevention/damage.ts flatlines the Runner as soon as core damage drops max hand size below 0. CR 1.7.2b flatlines only at the beginning of the discard step, and no discard-step check exists, so a hand size made negative by anything else never flatlines.
- **10. Card flags and declarations**
  - `game.core.runs-test/multi-access-correct-handling-of-multi-accesses-with-draws-in-between-accesses` (CR 1.2.1 (card text), 9.3.7c; probe) — Probe: Sportsmetal never triggers when an agenda is stolen. src/actions/score.ts calls fireOnAgendaScoredOrStolen with the Runner identity, the rig, and installed Corp cards, never the Corp identity. The native test checks only the card's shape. The board's own expectations (candidates after draws) follow refreshRdDeckCandidate and look right.
- **11. Turn structure, actions, breaking and psi**
  - `game.core.runs-test/forced-encounters-forced-encounters-during-run` (CR 6.5.9a, 6.8.4a; probe) — Access resumes after Ganked!'s forced encounter, and End the run in it ends the run and the breach (ported, passing). Wrong: the forced encounter runs an Approach Ice step and a pass-ice step and moves the Runner to the ice's position (CR 6.5.9a), and ending the run from it declares an already successful run unsuccessful (CR 6.8.4a). The stacked Konjin block is also blocked by the Konjin bug under forced-encounters-forced-encounters-redirection.
  - `game.core.runs-test/forced-encounters-forced-encounters-redirection` (CR 6.5.9a, 6.5.9d, 10.14; probe) — With matching Konjin bids the Konjin encounter restarts and another psi game starts each time (fix-now: Konjin is marked 'matches' in the printed sweep). Konjin's forced encounters are not marked as forced, so they run approach and pass-ice steps and trip ENCOUNTER_ICE_MISMATCH. The Bullfrog and Cell Portal end states otherwise follow CR 6.5.9d; Cell Portal also hits the move_runner_to_outermost_attacked row already filed under area 2.
  - `game.core.scenarios-test/hernando-cortez-vovo-combine-not-well` (CR 1.16.2a, 1.16.10; probe) — The engine adds Hernando Cortez's additional cost to the rez cost before Vovô lowers it ('base 1+2-2'), so the Corp pays 1. CR 1.16.10 keeps an additional cost separate: 0 + 2 = 2.
- **14. Run flow**
  - `game.core.runs-test/forced-encounters-forced-encounters-outside-of-run` (CR 6.1.4b, 6.5.9a; probe) — With Quest Completed fixed (engine #957), the forced encounter outside a run is reached, and the third Little Engine subroutine does not resolve. Wrong: the out-of-run access is modelled as a run on the remote, so ending the forced encounter declares an unsuccessful run; CR 6.1.4b resolves no other Run Ends step. Open reading for the Flip Switch block: CR 6.1.5 describes jacking out as ending a run; jnet lets Flip Switch's jack out end a forced encounter with no run, which CR 6.1.4b supports only by analogy.
  - `game.core.scenarios-test/hb-glacier` (CR 6.1.4, 10.14; probe) — Condensed port of the cross-card points: Breaker Bay Grid, HB, Desperado, Lamprey and Turing match (passing). Caprice Nisei behind an unrezzed Turing: after its psi game ends the run, the run goes on, the pass-ice step runs again and Caprice starts another psi game until a player runs out of credits (fix-now candidate).
- **15. Keywords and credits**
  - `game.core.rules-test/run-bad-publicity-credits` (CR 10.6.2, 10.6.3a; probe) — The fund holds the credit, but trash_accessed pays the trash cost from the credit pool only; spendRunnerCredits draws from the fund, the access trash path does not. CR 10.6.2 lets the Runner spend the fund during runs. Same family as run-psi-bad-publicity-credits.
  - `game.core.scenarios-test/mantle-cupellation-interaction-zero-credits` (CR 1.10.5; probe) — With an empty credit pool, Cupellation's access ability (access_host_non_agenda_faceup) is not offered, though Mantle lets the Runner 'spend hosted credits to use hardware and programs'. With credits in the pool it is offered.
  - `game.core.scenarios-test/esa-v-thule-hidden-info-known` (CR 10.12.2, 10.12.2a; probe) — Sabotaged cards go to Archives facedown (ported, passing). The engine makes the Corp pick the cards from HQ one by one with no way to take fewer from HQ and the rest from the top of R&D (CR 10.12.2), so the accessed Vanilla on top of R&D cannot be sabotaged. jnet keeps the accessed Vanilla faceup; CR 10.12.2a puts it facedown.
- **none (psi games and bad publicity)**
  - `game.core.rules-test/run-psi-bad-publicity-credits` (CR 10.6.2, 10.14.3; code) — runnerPsiSpendable counts the credit pool and hosted run credits but not the bad publicity fund, and spendRunnerPsiBid never draws from it. CR 10.6.2 lets the Runner spend the fund during runs, and 10.14.3 lets them bid what they can spend.
- **none (turn structure)**
  - `game.core.rules-test/no-scoring-after-terminal` (CR 5.4.3a, 5.6.2; probe) — Probe: after a terminal IPO the engine sets clicks to 0 and returns to the 5.6.2a (S) window, where score_agenda is legal. CR 5.4.3a skips the remaining action-phase steps, and the discard phase (5.6.3b) has no (S) window.
- **RA-1 timing re-audit**
  - `game.core.engine-test/trash-previous-consoles-test` (CR 8.1.4a, 10.3.1d; probe) — Hunting Grounds installs three Box-E facedown, and the 10.3.1d checkpoint reads their console subtype, trashing two of them and Mirror at once. Facedown installed Runner cards have no characteristics (CR 8.1.4a).
  - `game.core.rules-test/simultaneous-trash-effects` (CR 9.2.8d, 9.6.9c, 9.9.4; probe) — When Apocalypse trashes the Corp's cards, Marilyn Campaign's optional 'you may shuffle it into R&D' interrupt is applied without asking the Corp, and Hostile Infrastructure resolves before Calvin B4L3Y with no choice of order (CR 9.2.8d). Not checked: the log shows Hostile Infrastructure doing 1 net damage for the 3 Corp cards trashed; whether it should trigger once per card was not settled here.

### Not yet classified

Every deferred scenario is classified.
<!-- END GENERATED STATUS -->

## Purpose

The jnet test suite contains thousands of card and interaction scenarios, including regressions tied to upstream issue numbers. Porting selected scenarios gives this engine a second set of boards for interactions that the catalog sweeps and per-pack tests may leave unexamined. The native suite remains the permanent regression record for engine behavior.

## Segregation

Every ported file lives under `tests/jnet/`:

```text
tests/jnet/
  NOTICE.md
  manifest.json
  helpers.ts
  cards-operations.test.ts
  cards-ice.test.ts
  core-runs.test.ts
  core-rules.test.ts
```

- Helpers used by ports live in `tests/jnet/helpers.ts`.
- Native tests build on the existing suite helpers and stay independent of the port helper layer.
- Production code changes land in their own change with a native regression test. A port can expose the defect, and the promoted native test records the fix.
- Each upstream file arrives as its own batch, pull request, and squash-merged commit. That commit is the revert unit for the batch.

## Naming

### Files

Mirror the upstream file name, flattened into `tests/jnet/`:

| Upstream file | Ported file |
|---|---|
| `test/clj/game/cards/operations_test.clj` | `tests/jnet/cards-operations.test.ts` |
| `test/clj/game/cards/ice_test.clj` | `tests/jnet/cards-ice.test.ts` |
| `test/clj/game/core/runs_test.clj` | `tests/jnet/core-runs.test.ts` |
| `test/clj/game/core/rules_test.clj` | `tests/jnet/core-rules.test.ts` |

### Describe blocks

Each file uses one describe label carrying the segregation marker:

```ts
describe("jnet ports — operations", () => {
  // ...
});
```

The marker makes the ports searchable as a group, and the dedicated runner described below executes them together.

### Test titles

Titles follow the native suite style: present tense, cards named, and the observable board result stated. Upstream `deftest` slugs and issue numbers stay in the provenance comment and manifest, keeping titles readable as behavior statements.

| Upstream `deftest` | Ported title |
|---|---|
| `twenty-four-seven-news-cycle-posted-bounty-interaction-issue-1043` | 24/7 News Cycle forfeiting a scored Posted Bounty gives the Runner 1 tag and the Corp 1 bad publicity |
| `twenty-four-seven-news-cycle-breaking-news-interaction` | 24/7 News Cycle forfeits a scored Breaking News and gives the Runner 2 tags |
| `accelerated-diagnostics` | Accelerated Diagnostics plays the chosen operations in order |

Add a `(CR <example id>)` suffix only when the board plays that Comprehensive Rules example, following the native CR example title convention.

### Provenance

Each ported test carries a comment directly above it with the fully qualified upstream name:

```ts
// jnet: game.cards.operations-test/twenty-four-seven-news-cycle-posted-bounty-interaction-issue-1043
```

The manifest uses that same identifier as its key. Titles may be reworded for clarity while the identifier keeps the link to the source stable.

## Manifest

`tests/jnet/manifest.json` is created with the first batch and holds one entry per considered scenario:

```json
{
  "game.cards.operations-test/twenty-four-seven-news-cycle-posted-bounty-interaction-issue-1043": {
    "upstreamFile": "test/clj/game/cards/operations_test.clj",
    "upstreamCommit": "bc9e2fca073a5b21d247e72877804118e81d5472",
    "localFile": "tests/jnet/cards-operations.test.ts",
    "title": "24/7 News Cycle forfeiting a scored Posted Bounty gives the Runner 1 tag and the Corp 1 bad publicity",
    "status": "ported"
  }
}
```

Statuses:

- `ported` — the test runs in `tests/jnet/` with the expected board verified.
- `adapted` — the scenario runs with a documented setup or expectation adjustment, and the entry records the reason.
- `skipped-divergence` — the upstream expectation follows an older printing, an older ruling, or jnet behavior that the pinned CR and current card text supersede, and the entry records the citation.
- `deferred` — the scenario is recorded for a later batch with no expectation judgment yet, and the entry records why it waits. Scenarios that drive jnet-internal helpers (such as `access-bonus` or `num-cards-to-access`) with no card-sourced equivalent land here.
- `promoted` — the scenario also lives as a native test, and the entry names the native file and title.
- `disagreement` — jnet's expectation and this engine's behavior differ on a point the pinned CR is silent or unclear about. The entry records the closest CR cite in `crCite` and the two readings in `disagreementNote`. The engine is not changed to match jnet: each one waits for a human decision.

Deferred entries also carry a `classification` from CR audit tool 1.8:

- `no-board` — the scenario asserts jnet internals, UI settings, chat commands, log wording, or jnet's own source, so there is no rules reading to compare.
- `agrees` — this engine already matches jnet's expectation and the CR.
- `engine-bug` — the CR settles the point and this engine is wrong. `engineBugArea` names the Phase 3 area that owns the fix. The fix lands in that area's session, not here.

`agrees` and `engine-bug` entries also record `crCite`, `classificationNote`, and `classificationBasis`: `probe` when the board was run against the engine, or `code` when the finding comes from reading the engine source. `tests/jnet-scenarios/jnet-manifest.test.ts` checks these fields and that the Status section is current.

CI runs `npm run test:jnet` as its own `jnet` job with `continue-on-error`. It reports but never fails the workflow, and it is not part of the required `test` check.

An entry may also carry `blockedBy` (what the scenario waits on; today only `cards-data`) with a one-line `blockedNote`. The Status section at the top of this document is generated from the manifest by `scripts/jnet-status.mjs` and groups entries by these fields, so regenerate it rather than editing it.

## Porting procedure

1. Resolve each card title to the slug in the pinned cards catalog and build the board with `instantiateCard`.
2. Translate setup helpers (`new-game`, `starting-hand`, `play-from-hand`) into board arrangement plus intents applied through `applyIntent`.
3. Translate `click-prompt` and `click-card` into the matching `pendingChoice` option, selected with `choose_option` by option identity.
4. Re-express direct jnet engine calls such as `core/steal` and `core/gain` through legal intents or explicit board arrangement, so the port exercises this engine's windows and legality.
5. Assert the same observable board: zones, credits, clicks, tags, counters, score areas, and agenda points.
6. Verify each expectation against CR `v26.03` and the current printed text before recording it as passing.
7. Record the outcome in the manifest with one of the statuses above.

Classify every disagreement before changing code:

- **Translation error** — the port built a different board or chose a different prompt. Fix the port.
- **Upstream divergence** — the expectation tracks an older printing, ruling, or jnet-specific behavior. Record `skipped-divergence` or `adapted` with the governing citation.
- **Engine defect** — the pinned CR and card text agree with the ported expectation. Fix the engine in its own change and promote the scenario into a native test.

## Running the ports

The pilot phase runs quarantined. The first batch creates the dedicated Vitest config, the `test:jnet` script, and the exclusion that keeps the folder out of the default include:

- `npm test` keeps the native suite as the required gate.
- `npm run test:jnet` runs only `tests/jnet/` through the dedicated config.

Promotion to the default suite is a deliberate later step: remove the quarantine exclusion so the standard `tests/**/*.test.ts` include picks the folder up, and record that change in the batch that makes it. Lint already covers the folder through `eslint .`.

## Removal and revert

Three escalating steps, cheapest first:

1. **Stop running them.** Restore the quarantine exclusion or remove the folder from the dedicated config.
2. **Delete them.** Remove `tests/jnet/` and this policy's runner wiring in one commit. Native tests and promoted scenarios stay in place.
3. **Revert a batch.** Revert that batch's squash-merged commit, or use the pull request revert, to restore the exact prior state for one upstream file at a time.

Promoted native tests remain after any of these steps, so removing the ports keeps the regression coverage for every engine fix they produced.

## Batch checklist

- [ ] Upstream commit pin recorded in the manifest entries.
- [ ] `tests/jnet/NOTICE.md` present with the MIT notice (first batch).
- [ ] One upstream file per batch, on a `claude/jnet-port-<name>` branch.
- [ ] Every title follows the naming rules above, with a `// jnet:` provenance comment.
- [ ] Every considered scenario has a manifest status.
- [ ] Status section regenerated (`node scripts/jnet-status.mjs --write`).
- [ ] Engine defects split into their own change with a promoted native test.
- [ ] `npm run test:jnet` green for the batch, with the native suite still green.
