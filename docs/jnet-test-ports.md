# Ported jnet scenario tests

**Source:** [mtgred/netrunner](https://github.com/mtgred/netrunner) (jnet), pinned at commit `bc9e2fca073a5b21d247e72877804118e81d5472` when this policy was written. Update that pin deliberately when a later batch uses a newer upstream commit.
**License:** MIT. Adapted material carries the upstream attribution in `tests/jnet/NOTICE.md`, created with the first ported batch.
**Authority:** pinned Comprehensive Rules `v26.03` and current printed card text. Card text wins on a direct contradiction (CR 1.2.1). A jnet expectation is scenario input, and each port verifies the expected board against that authority before landing.
**Status:** the first batch ports `game.cards.basic-test` (19 scenarios) under `tests/jnet/`, with its notice, manifest, and helper layer, running quarantined through `npm run test:jnet`. That batch also exposed an engine defect: an upgrade install declaring a new remote as its destination was refused, where CR 4.6.8b creates the remote on that declaration. The fix carries a promoted native test in `tests/basic-action-legality.test.ts`.

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
- `promoted` — the scenario also lives as a native test, and the entry names the native file and title.

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
- [ ] One upstream file per batch, on a `cursor/jnet-port-<name>` branch.
- [ ] Every title follows the naming rules above, with a `// jnet:` provenance comment.
- [ ] Every considered scenario has a manifest status.
- [ ] Engine defects split into their own change with a promoted native test.
- [ ] `npm run test:jnet` green for the batch, with the native suite still green.
