# Netrunner engine

Hand-authored TypeScript **rules engine library** for Android: Netrunner. It is **not** a Comprehensive Rules → AST compiler and not a networked game client.

**Repo:** [github.com/nhoople/netrunner-engine](https://github.com/nhoople/netrunner-engine)

Depends on:

- [netrunner-comprehensive-rules-data](https://github.com/nhoople/netrunner-comprehensive-rules-data) pinned to tag **`v26.03`**
- [netrunner-cards-data](https://github.com/nhoople/netrunner-cards-data) pinned to tag **`v0.1.0`**

## Requirements

- Node.js 20+

## Setup

```bash
npm install
npm run prepare-data         # fetch-cr + fetch-cards into vendor/
# or separately:
npm run fetch-cr             # pinned CR JSON → vendor/cr-data/
npm run fetch-cards          # pinned card JSON → vendor/cards-data/
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

If the cards-data GitHub repo is not yet published, `fetch-cards` falls back to a local checkout at `../netrunner-cards-data` or `$CARDS_DATA_ROOT`.

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

## Card pin (`v0.1.0`)

Cards remain **pure data**. Definitions live in the sibling consumer repo [netrunner-cards-data](https://github.com/nhoople/netrunner-cards-data); this engine keeps loader / Effect IR / eval.

| Mechanism | Location |
|-----------|----------|
| Declared pin | [`data/cards-pin.json`](data/cards-pin.json) — tag, repo, archive URL, required paths |
| Fetch script | [`scripts/fetch-cards-data.mjs`](scripts/fetch-cards-data.mjs) — `npm run fetch-cards` |
| Vendored files | `vendor/cards-data/` (`schema.json`, `pool.json`, wave dirs, `PIN.json`) |

`vendor/cards-data/` is gitignored; a clean checkout needs `npm run fetch-cards` (or `npm run prepare-data`) before tests. The loader validates Effect IR and **fails closed** on unknown nodes. `pool.json` declares the supported corpus and **corpus order: System Gateway → System Update 2021 → later releases**. Partial cards mark unimplemented clauses in an `unsupported` array.

| Wave | Count | Focus |
|------|------:|-------|
| stubs | 6 | Barrier ice + Crowbar fracter (demos) |
| wave1 | 8 | IDs, Hedge Fund / Easy Mark, PAD, Data Raven, Priority Requisition, Aesop's |
| wave2 | 13 | Code gates + sentries + Heimdall, Gordian/Ninja, Sure Gamble / Diesel / Beanstalk, Hostile Takeover (`onScore`), Armitage |
| system-gateway | 77 | Null Signal System Gateway (NRDB `sg`); reprints Sure Gamble + Hedge Fund reuse earlier defs |
| system-update-2021 | 82 | Null Signal System Update 2021 (NRDB `su21`); classic reprints immediately after Gateway |

## Effect IR

Hand-authored AST evaluated by `evalEffect` — **not** compiling `nodes.json`.

```text
Effect ::= seq [Effect…]
         | do Primitive
         | if Cond then Effect [else Effect]
         | prevent jack_out
         | choose {chooser, options[]}

Primitive ::= end_the_run
            | gain_credits | lose_credits {side, amount}
            | lose_clicks | gain_clicks {side, amount}
            | pump_strength {amount, duration?: encounter|run}
            | fortify_ice | weaken_ice {amount}
            | net_damage | meat_damage | brain_damage {amount}
            | give_tags {amount}
            | trash_program | trash_resource {pick: first|choose}
            | take_hosted_credits | place_hosted_credits {amount}
         | add_virus_counter | gain_credits_per_virus
         | increase_hand_size {side, amount}
         | remove_tags | lose_credits_per_advancement | bypass_current_ice
         | remove_power_counter
         | trace {strength, onSuccess, onFailure?}
         | draw {side, amount}
         | add_agenda_counter {amount}
```

Card hooks that carry Effect trees: `subroutines[].effect`, `paidAbilities[].effect`, `onRez`, `onPlay`, `onScore`, `onSteal`, `onEncounter`, `onTurnBegin`, `onInstall`.
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
- Full card pool or NetrunnerDB behavior import
- Compiling `nodes.json` into executable behavior
- Perfect fidelity for every card clause (see each card’s `unsupported` notes)
- Starting a later Null Signal expansion before System Update 2021 is complete

## Layout

```
data/
  cr-pin.json      # CR tag pin
  cards-pin.json   # cards-data tag pin
vendor/
  cr-data/         # npm run fetch-cr
  cards-data/      # npm run fetch-cards (gitignored)
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
  system-gateway.test.ts
  system-update-2021.test.ts
  …
```
