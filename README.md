# Netrunner engine

Hand-authored TypeScript **rules engine library** for Android: Netrunner. It is **not** a Comprehensive Rules → AST compiler and not a networked game client.

**Repo:** [github.com/nhoople/netrunner-engine](https://github.com/nhoople/netrunner-engine)

Depends on [netrunner-comprehensive-rules-data](https://github.com/nhoople/netrunner-comprehensive-rules-data) pinned to tag **`v26.03`**.

## Requirements

- Node.js 20+

## Setup

```bash
npm install
npm run fetch-cr   # downloads pinned CR JSON into vendor/cr-data/
npm test
npm run demo                 # decline-rez empty remote slice
npm run demo:ice-break       # rez + Crowbar break → success
npm run demo:ice-etr         # rez + unbroken ETR → unsuccessful
npm run demo:pump-break      # Bastion + pump Crowbar → break both subs
npm run demo:multi-sub-etr   # Bastion unbroken: gain ¢ then ETR
npm run demo:fortify-pump    # approach fortify + encounter pumps
npm run demo:pulse-needle    # net damage + tag via effect IR
npm run demo:scrap-code      # trash program + ETR via effect IR
npm run cli                  # interactive action stepper
```

## Library API (headless)

Pure functions only — no sockets, HTTP, or UI in this package:

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
const result = applyIntent(state, legal.legal[0]!.action);
if (result.ok) state = result.state;
const view = getPublicView(state, "runner");
```

CLI/demos are development hosts only. A future online Project can consume this API without rewriting rules.

## CR pin (`v26.03`)

| Mechanism | Location |
|-----------|----------|
| Declared pin | [`data/cr-pin.json`](data/cr-pin.json) — tag, repo, raw GitHub base URL, file list |
| Fetch script | [`scripts/fetch-cr-data.mjs`](scripts/fetch-cr-data.mjs) — `npm run fetch-cr` |
| Vendored files | `vendor/cr-data/` (`index.json`, `timing-structures.json`, `nodes.json`, `PIN.json`) |

`nodes.json` is listed in the pin and fetched with the rest; it is gitignored (large) so a clean checkout needs `npm run fetch-cr` before tests. Engine host code cites CR **numbers** and stable **ids**. Tests resolve numbers through the pinned `index.json`, require every pin-listed vendor file (including `nodes.json`), and check graph `stepId`s against `timing-structures.json`.

CR data is authority for **citations and timing IDs**, not executable card behavior. The engine does **not** compile `nodes.json` into effects.

## Card data (`data/cards/`)

Cards are **pure data**. Definitions live under `data/cards/` (`schema.json`, `pool.json`, `stubs/`, `wave1/`). The loader validates Effect IR and **fails closed** on unknown nodes. `pool.json` declares the supported corpus; wave1 cards mark unimplemented clauses in an `unsupported` array.

```bash
# Card defs are loaded at runtime from data/cards/ — no TS stub constants required for new ice/breakers once IR covers them.
```

## Effect IR

Hand-authored AST evaluated by `evalEffect` — **not** compiling `nodes.json`.

```text
Effect ::= seq [Effect…]
         | do Primitive
         | if Cond then Effect [else Effect]
         | prevent jack_out

Primitive ::= end_the_run
            | gain_credits {side, amount}
            | pump_strength {amount}
            | fortify_ice {amount}
            | net_damage | meat_damage | brain_damage {amount}
            | give_tags {amount}
            | trash_program {pick: first}
            | trace {strength, onSuccess, onFailure?}
            | draw {side, amount}
```

## What the engine does

- Nested priority / paid-ability windows (CR 9.2.4 / 9.2.4d)
- Timing step graph (11.2–11.5) with appendix labels
- Basic actions, operations/events, identity click abilities
- Advance / score / steal agendas; win by agenda points or flatline
- Central breach access (HQ / R&D / Archives candidates)
- Run ice: rez, break, multi-sub resolve, jack-out
- Damage types + prevention hooks; traces; recurring credits / cost model
- `queryLegality` / `explainAction`, checkpoints, cannot effects

## What it does not do

- UI / multiplayer / networking (out of scope for this Project)
- Full card pool or NetrunnerDB behavior import
- Compiling `nodes.json` into executable behavior
- Perfect fidelity for every card clause (see each card’s `unsupported` notes)

## Layout

```
data/
  cr-pin.json
  cards/           # schema, pool, stub + wave1 JSON
src/
  api/library.ts   # createGame / applyIntent / getPublicView
  effects/         # IR types + evaluator
  cards/           # load + short-game setup + stub helpers
  timing/
  legality/
  actions/apply.ts
  demo/verticalSlice.ts
tests/
  short-game.test.ts
  card-data.test.ts
  …
```
