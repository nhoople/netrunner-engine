# Netrunner engine

Part of [nhoople/netrunner](https://github.com/nhoople/netrunner). These repositories stay separate and are consumed by release tag.

Hand-authored TypeScript **rules engine library** for Android: Netrunner. It is **not** a Comprehensive Rules → AST compiler and not a networked game client.

**Repo:** [github.com/nhoople/netrunner-engine](https://github.com/nhoople/netrunner-engine)

Depends on:

- [netrunner-comprehensive-rules-data](https://github.com/nhoople/netrunner-comprehensive-rules-data), pinned by release tag in [`data/cr-pin.json`](data/cr-pin.json)
- [netrunner-cards-data](https://github.com/nhoople/netrunner-cards-data), pinned by release tag in [`data/cards-pin.json`](data/cards-pin.json)

The versions that go together are in the project [pin table](https://github.com/nhoople/netrunner#readme).

### Cards ↔ engine pairing

A set-complete shares one semver on cards-data and this engine; between set-completes the engine ships maintenance releases on its own. Pin a **release tag**, not `master`. The current pair is in the project [pin table](https://github.com/nhoople/netrunner#readme).

Prior set-complete / maintenance tags: [cards Releases](https://github.com/nhoople/netrunner-cards-data/releases) · [engine Releases](https://github.com/nhoople/netrunner-engine/releases).

Declared pin: [`data/cards-pin.json`](data/cards-pin.json) (`npm run fetch-cards`). GitHub Releases are cut at **set-complete** (wave pool status → `supported`, advertised host floor) or by **explicit manual** release. Pack IR/wiring work lands as PR merges; pin consumers to a release tag, not `master`. Intermediate progress tags may still exist on GitHub history — prefer the **Current** floor tag above. Maintenance / quality tags (e.g. `v1.34.0`) still publish when consumers should pin past a prior milestone.

## Requirements

- Node.js 26+

## Setup (consumers & contributors)

Pin story for a clean checkout:

1. **Declare** pins in [`data/cr-pin.json`](data/cr-pin.json) (CR tag) and [`data/cards-pin.json`](data/cards-pin.json) (cards-data tag) — always a **release tag**, never `master`.
2. **Fetch** into gitignored `vendor/` (CI and local tests both need this).
3. **Run** tests or development hosts that call the library API.

```bash
npm install
npm run prepare-data         # npm run fetch-cr && npm run fetch-cards → vendor/
# or separately:
npm run fetch-cr             # pinned CR JSON → vendor/cr-data/
npm run fetch-cards          # pinned card JSON → vendor/cards-data/
npm run lint                 # eslint (recommended ruleset)
npm run typecheck            # tsc --noEmit
npm test                     # vitest; needs both vendor trees
```

CI runs `lint`, `typecheck`, and `test` on every PR. Fix only what those surface — no separate Prettier pass.

If the cards-data GitHub tag is not yet published, `fetch-cards` falls back to a local checkout at `../netrunner-cards-data`, `/home/ubuntu/repos/netrunner-cards-data`, or `$CARDS_DATA_ROOT`.

### Development hosts (CLI / demos)

Hosts are thin scripts over `createGame` / `queryLegality` / `applyIntent` / `getPublicView`. They are **not** a game client (no UI/network).

```bash
npm run cli:help             # usage + pin/fetch reminder
npm run demo:library         # host loop: createGame → legality → applyIntent → getPublicView
npm run demo                 # decline-rez empty remote (stopAfterFirstCycle)
npm run demo:ice-break       # rez Ice Wall + Marjanah break → success
npm run demo:ice-etr         # rez + unbroken ETR → unsuccessful
npm run demo:pump-break      # Palisade (remote) + pump Marjanah → break
npm run demo:multi-sub-etr   # Hortum unbroken: gain ¢ then ETR
npm run demo:fortify-pump    # Palisade remote strength + pump past it
npm run demo:tithe           # Tithe: net damage + Corp gains ¢
npm run demo:rototurret      # Rototurret: trash program + ETR
npm run cli                  # interactive stepper (number / state / view / quit)
```

## Library API (headless)

Pure functions only — no sockets, HTTP, or UI in this package. This is the stable surface a future online Project should consume:

| Function | Role |
|----------|------|
| `createGame(options?)` | New game (`stopAfterFirstCycle: false` by default) |
| `queryLegality(state)` | Legal intents + window / priority / cites |
| `applyIntent(state, intent)` | Apply one intent; returns new state or cited error |
| `getPublicView(state, side)` | Side-filtered public snapshot for hosts |

```ts
import {
  createGame,
  queryLegality,
  applyIntent,
  getPublicView,
} from "netrunner-engine";

let state = createGame({ agendaPointsToWin: 7 });
const legal = queryLegality(state);
// Prefer picking from legality.legal (each entry has actor + CR cites).
const result = applyIntent(state, legal.legal[0]!.action);
if (result.ok) state = result.state;
const view = getPublicView(state, "runner");
```

`createInitialState` / `applyAction` / `legalActions` remain exported for older demos and tests; new hosts should prefer the four functions above. Run `npm run demo:library` for a printed example of that loop.

## Contributing

The pull request process, the CR adherence gate, and the CI checks are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## CR pin

| Mechanism | Location |
|-----------|----------|
| Declared pin | [`data/cr-pin.json`](data/cr-pin.json) — tag, repo, raw GitHub base URL, file list |
| Fetch script | [`scripts/fetch-cr-data.mjs`](scripts/fetch-cr-data.mjs) — `npm run fetch-cr` |
| Vendored files | `vendor/cr-data/` (`index.json`, `timing-structures.json`, `nodes.json`, `PIN.json`) |

`nodes.json` is listed in the pin and fetched with the rest; it is gitignored (large) so a clean checkout needs `npm run fetch-cr` before tests. Engine host code cites CR **numbers** and stable **ids**. Tests resolve numbers through the pinned `index.json`, require every pin-listed vendor file (including `nodes.json`), and check graph `stepId`s against `timing-structures.json`.

CR data is authority for **citations and timing IDs**, not executable card behavior. The engine does **not** compile `nodes.json` into effects. When Null Signal ships a new CR, follow [`docs/cr-pin-bump-checklist.md`](docs/cr-pin-bump-checklist.md).

## Card pin

Cards remain **pure data**. Definitions live in the sibling consumer repo [netrunner-cards-data](https://github.com/nhoople/netrunner-cards-data); this engine keeps loader / Effect IR / eval.

| Mechanism | Location |
|-----------|----------|
| Declared pin | [`data/cards-pin.json`](data/cards-pin.json) — tag, repo, archive URL, required paths |
| Fetch script | [`scripts/fetch-cards-data.mjs`](scripts/fetch-cards-data.mjs) — `npm run fetch-cards` |
| Vendored files | `vendor/cards-data/` (`schema.json`, `pool.json`, `corp/`, `runner/`, `PIN.json`) |

`vendor/cards-data/` is gitignored; a clean checkout needs `npm run fetch-cards` (or `npm run prepare-data`) before tests. The loader validates Effect IR and **fails closed** on unknown nodes. `pool.json` declares the supported corpus and **corpus order through Magnum Opus** (the pinned cards; `mor` absorbed) then SC19 → Downfall → Uprising → Gateway → SU21 → Midnight Sun → Parhelion → TAI → RWR → Elevation → Vantage Point. Partial cards mark unimplemented clauses in an `unsupported` array.

**Authoritative corpus:** pinned cards `pool.json` — **68/68** waves `supported` (see `corpusOrder` + wave `status` / card counts). Do not treat any shorter README wave list as complete.

## Effect IR

Card abilities are a hand-authored effect language evaluated by `evalEffect`, not compiled from the Comprehensive Rules text. The grammar is in [`docs/effect-ir.md`](docs/effect-ir.md).

## What the engine does

- Nested priority / paid-ability windows (CR 9.2.4 / 9.2.4d)
- Timing step graph (11.2–11.5) with appendix labels
- Basic actions, operations/events, identity click abilities
- Advance / score / steal agendas; win by agenda points or flatline
- Central breach access (HQ / R&D / Archives candidates)
- Run ice: rez, break (multi-break / AI `*`), multi-sub resolve, jack-out
- Damage types + prevention hooks; traces; recurring / hosted / virus costs
- Effect choices (`choose` / `choose_option`)
- `queryLegality` / `explainAction`, checkpoints, cannot effects

## What it does not do

- UI / multiplayer / networking (out of scope for this Project)
- Full NetrunnerDB / every NSG expansion beyond the declared `pool.json` corpus (Gateway → Vantage Point today)
- Compiling `nodes.json` or Comprehensive Rules prose into executable behavior. Effect IR is hand-authored. Example boards in `tests/cr-examples-chN.test.ts` prove the outcomes those examples name. A catalog sweep proves an ability ran on its step, a missing window, cost, encounter, or target was refused, a score or steal moved the agenda (CR 1.17.6, CR 1.17.7), and a one-instruction subroutine changed the board by its printed number (`tests/printed-board.test.ts`). A play ability such as Hedge Fund resolves from its instruction and does not need that sentence stored.
- Deckbuilding during a game. `deckbuildingReport` checks extra copies, influence after a reduction, minimum deck size (CR 1.4.3), the identity's influence limit (CR 1.4.5), and the Corp agenda band (CR 1.4.6) before a match exists. CR 3.1.2: those limits do not apply once the game has started. Format bans stay with the host.
- Perfect fidelity for every printed clause outside the supported mapping (partial cards use explicit `unsupported` notes; supported waves must keep those empty unless allowlisted)
- Full **9.12** continuous-effect compiler. Blanking order (CR 9.12.1d / 9.12.1e) covers Standard. A gained subtype that feeds a further grant is the continuous subtype layer (Mother Goddess, Egret, Warden Fatuma).

## Layout

```
data/
  cr-pin.json      # CR tag pin
  cards-pin.json   # cards-data tag pin
vendor/
  cr-data/         # npm run fetch-cr
  cards-data/      # npm run fetch-cards (gitignored)
src/
  api/library.ts          # createGame / applyIntent / getPublicView
  effects/eval.ts         # effect evaluator; the kind switch is effects/kinds/
  effects/kinds/          # one file per procedure in the kind switch
  effects/primitives/     # printed procedures grouped by verb, not by pack
  effects/*Primitives.ts  # shared rules (credits, damage, tags, runs, counters, …)
  cards/                  # load + short-game setup + runtime helpers
  timing/
  legality/candidates.ts  # collectCandidateActions coordinator
  legality/candidate*.ts  # pending interrupts, run windows, click actions
  actions/apply.ts        # applyAction and choice dispatch
  actions/                # install, run, rez, break, play, score, access, phase
  demo/verticalSlice.ts
tests/
  confidence-*.test.ts          # interaction smoke / cross-pack / cannot / goldens / fail-closed
  fixtures/goldens/             # regression transcripts (see README there)
  cr-*.test.ts                  # CR adherence lock-ins
  short-game.test.ts
  system-gateway.test.ts
  …
```
