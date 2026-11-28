# Tests

Every engine test lives in a folder under `tests/`, never directly in it. A test goes in one of two kinds of folder:

- **Code folders** mirror `src/` and use exactly its folder names: a test of one area's procedure goes in `tests/state/<area>/` or `tests/effects/<area>/`, a test of the legal-move list in `tests/legality/`, and so on. A test that covers one area goes in that area's folder.
- **Check folders** hold one kind of check that runs across the whole engine: the CR examples, the official rulings, the blanked-card sweeps, the per-pack card tests, the seeded playouts, the repository checks. A test of a whole procedure across several areas goes in the check folder for its kind.

`tests/repo/test-placement.test.ts` fails on a test file directly in `tests/` or outside `tests/`, on a folder this table leaves out or a row for a folder that is gone, and on a code folder that names no `src/` folder. `npm test` runs `tests/**/*.test.ts` except `tests/jnet/`, which `npm run test:jnet` runs.

Run one folder with `npm test -- tests/<folder>/`, or one file with `npm test -- tests/<folder>/<file>.test.ts`.

## Code folders

| Folder | What goes in it |
| --- | --- |
| `tests/actions/` | Tests for `src/actions/`: how an action is applied (click abilities are actions, playing an operation from an ability is not the basic action) |
| `tests/api/` | Tests for `src/api/`: the library API (`createGame`, `queryLegality`, `applyIntent`, `getPublicView`) and the scripted short game |
| `tests/cards/` | Tests for `src/cards/`: the card data model, every card's printed abilities running, format counts, the supported-pool invariant |
| `tests/cr/` | Tests for `src/cr/`: the pinned Comprehensive Rules data loads and every timing step names a rule in it |
| `tests/debug/` | Tests for `src/debug/`: the state invariant checker and the shape of its baseline |
| `tests/effects/` | Tests for the top of `src/effects/`: the Effect IR shape, kind names, kind liveness, the kind reference, kind outcome coverage, ability records and hooks. `kind-coverage.ts` holds the outcome helpers the kind tests share |
| `tests/effects/continuous/` | Tests for `src/effects/continuous/`: ice and icebreaker strength and their layering order (CR 9.12.1a) |
| `tests/effects/keywordsAndCredits/` | Tests for `src/effects/keywordsAndCredits/`: credit gains and credit tallies |
| `tests/effects/swap/` | Tests for `src/effects/swap/`: swapping cards (CR 8.8) |
| `tests/effects/triggers/` | Tests for `src/effects/triggers/`: `choose_card` and the choices a player, not the engine, makes |
| `tests/effects/visibility/` | Tests for `src/effects/visibility/`: looking at, searching for and revealing cards |
| `tests/legality/` | Tests for `src/legality/`: `queryLegality`, basic action and advance legality, priority, refused intents, instruction checkpoints (CR 9.11.1), uniqueness, the agenda-point draw, and legality agreement |
| `tests/state/` | Tests for the top of `src/state/`: the seeded random stream, the procedure write guard (`direct-writes.ts` is its scanner), shared rule modules |
| `tests/state/access/` | Tests for `src/state/access/`: accessing cards (CR ch. 7), Archives, accessing outside a run |
| `tests/state/cardFlags/` | Tests for `src/state/cardFlags/`: static declarations and the card flag inventory |
| `tests/state/continuous/` | Tests for `src/state/continuous/`: continuous effects (CR 9.12), blanking, lingering effects, currents, cost and subtype layers |
| `tests/state/counters/` | Tests for `src/state/counters/`: placing counters, Dividends |
| `tests/state/damageAndPrevention/` | Tests for `src/state/damageAndPrevention/`: damage, its interrupts and prevention (CR 10.4) |
| `tests/state/hostingAndTrash/` | Tests for `src/state/hostingAndTrash/`: hosting and trashing (CR 1.13, 1.19), who carries out a trash |
| `tests/state/install/` | Tests for `src/state/install/`: installing cards (CR 8.5), ice position on install, memory |
| `tests/state/keywordsAndCredits/` | Tests for `src/state/keywordsAndCredits/`: costs (nested costs, lose a click, forfeit, cards a cost takes), hosted and stealth credits, bad publicity |
| `tests/state/run/` | Tests for `src/state/run/`: run flow (CR ch. 6), its phases and windows, approach, encounter, bypass, success and run end |
| `tests/state/searchAndDeck/` | Tests for `src/state/searchAndDeck/`: searching and what a seat sees of a hidden zone during a search |
| `tests/state/setupAndEnd/` | Tests for `src/state/setupAndEnd/`: the mulligan and identity faces |
| `tests/state/triggers/` | Tests for `src/state/triggers/`: pending abilities, stored triggers, reaction windows, replacements (CR 9.9) |
| `tests/state/turnAndActions/` | Tests for `src/state/turnAndActions/`: basic actions, breaking subroutines, traces, MirrorMorph's action count |
| `tests/state/types/` | Tests for `src/state/types/`: which file each `CardInstance` field sits in |
| `tests/state/uninstallAndPosition/` | Tests for `src/state/uninstallAndPosition/`: uninstalling, ice positions, the Runner's position in a run |
| `tests/state/visibility/` | Tests for `src/state/visibility/`: what each seat may see (CR 1.21, 10.2), public views |
| `tests/timing/` | Tests for `src/timing/`: the step graph and its layout, the pinned timing charts and appendix (`timing-chart.ts` holds them), paid-ability and action-phase windows, the timing re-audits |

## Check folders

| Folder | What goes in it |
| --- | --- |
| `tests/ability-fire/` | Ability fire coverage (CR audit tool 1.18): which ability records resolve, and the recorder the setup hook uses |
| `tests/baselines/` | Baselines the tests compare against, most of them shrink only |
| `tests/baselines/legality-agreement/` | The legality agreement baseline for each playout format |
| `tests/blanked/` | Blanked cards: each test checks a group of cards does nothing while blanked (CR 9.12.1d) |
| `tests/confidence/` | Confidence checks across many cards: "cannot" legality, cross-pack stress, fail-closed probes, interaction smoke, regression goldens |
| `tests/cr-citations/` | CR citation checks (CR audit tools 1.5, 1.13, 1.17, 1.19): the cite map, citation topics, cited rule text, section owners (`cr-section-owners.json`) and subrule coverage. `cr-citations.ts` and `cr-owners.ts` are the scanners they share |
| `tests/cr-examples/` | The Comprehensive Rules examples, one file per chapter, and the check that every example is covered (CR audit tool 1.6) |
| `tests/fixtures/` | Fixtures the tests read: playout seeds and the direct-writes sample |
| `tests/fixtures/game-exports/` | Matches exported from the game's debug page, replayed by `tests/game-export/` |
| `tests/fixtures/goldens/` | Regression transcripts for `tests/confidence/confidence-regression-goldens.test.ts` |
| `tests/game-export/` | Replays the game exports in `tests/fixtures/game-exports/`; `loader.ts` reads them |
| `tests/generated/` | Tables the checks write and compare (coverage tables, owner and review lists). Do not edit by hand |
| `tests/jnet/` | Ported jinteki.net scenarios, quarantined: `npm run test:jnet` runs them and `npm test` does not. `manifest.json` records each one's status |
| `tests/jnet-scenarios/` | jinteki.net scenarios rewritten as engine tests, their board helpers (`jnet-boards.ts`), and the check on `tests/jnet/manifest.json` |
| `tests/packs/` | Card tests by pack or release wave, one file per pack, named after it |
| `tests/playout/` | Seeded playouts of every format (CR audit tool 1.3), their harness, legality agreement in the playouts, the playout blockers, and the timing walk (CR audit tool 1.15) |
| `tests/printed/` | Printed text: the printed-text sweep record and its fixes (PF-S1 to PF-S3), the kind and phrase check (CR audit tool 1.12), printed procedures |
| `tests/repo/` | Checks on the repository itself: the README layout map, test placement, the `src/` file size limit, the CR term denylist, the mutation-test areas |
| `tests/rulings/` | Official rulings as tests (CR audit tool 1.14), one file per card type, and the board helpers they and other tests share (`rulings-helpers.ts`) |
| `tests/second-reader/` | The second reader (CR audit tool 1.16): blind readings of CR examples, rulings and jnet runs, with drivers that play them |
| `tests/setup/` | Vitest setup files that run around every test: the ability fire recorder, the state invariants, and (when asked) legality agreement |
