# Netrunner engine (v0)

Hand-authored TypeScript rules engine scaffold for Android: Netrunner. It is **not** a Comprehensive Rules → AST compiler and not a card-effect DSL.

Depends on [netrunner-comprehensive-rules-data](https://github.com/nhoople/netrunner-comprehensive-rules-data) pinned to tag **`v26.03`**.

## Requirements

- Node.js 20+

## Setup

```bash
npm install
npm run fetch-cr   # downloads pinned CR JSON into vendor/cr-data/
npm test
npm run demo       # vertical-slice stepper output
npm run cli        # interactive action stepper
```

## CR pin (`v26.03`)

| Mechanism | Location |
|-----------|----------|
| Declared pin | [`data/cr-pin.json`](data/cr-pin.json) — tag, repo, raw GitHub base URL, file list |
| Fetch script | [`scripts/fetch-cr-data.mjs`](scripts/fetch-cr-data.mjs) — `npm run fetch-cr` |
| Vendored files | `vendor/cr-data/` (`index.json`, `timing-structures.json`, `nodes.json`, `PIN.json`) |

Raw URL form (same pin):

`https://raw.githubusercontent.com/nhoople/netrunner-comprehensive-rules-data/v26.03/data/index.json`

Optional alternative: add the data repo as a git submodule at the same tag. This tree uses the vendored fetch so installs stay simple.

Engine host code cites CR **numbers** and stable **ids** (e.g. `5.2.6b` / `rule_corp_basic_action_credit`). Tests resolve numbers through the pinned `index.json`.

## What v0 does

- Game state: clicks, credits, zones/hand/deck, central + remote servers, ice/root skeleton
- **Explicit timing step graph** (`src/timing/graph.ts`) for Corp turn (11.2), Runner turn (11.3), run (11.4), and breach (11.5) — each node labeled with appendix `stepId` / `stepNumber` from pinned `timing-structures.json`
- Cursor is a graph key (`timingKey`); `pass` / `auto` / `branch` / `action` / `discard` / `access` kinds drive advances
- Action legality is gated by the current graph window (e.g. basic actions only at `*.takeAction`)
- Pure `applyAction(state, action)` / `legalActions(state)` API
- CLI stepper + demo vertical slice: **credit/draw → install (ice creates empty remote) → run → access/breach → end**
- Tests that cite CR numbers/ids for key legality and graph transitions

## Timing model

```text
corp.gainClicks → (auto PAW/recurring/begin) → corp.mandatoryDraw
  → corp.actionPaw → corp.checkClicks ⇄ corp.takeAction
  → corp.actionPhaseEnd → corp.discard → … → corp.turnComplete
→ runner.gainClicks → (auto) → runner.actionPaw ⇄ runner.takeAction → …
→ on basic_run: walk run.* graph (approach unrezzed ice → success → breach.*)
```

Paid-ability windows exist as labeled nodes but are no-ops in v0 (pass/auto). Rezzed-ice encounter / rez during 11.4_2_b is intentionally out of scope.

## What v0 does not do

- UI / multiplayer / networking
- Full card pool or NetrunnerDB integration
- Compiling `nodes.json` into executable behavior
- Paid ability windows, traces, damage, tags, agendas scoring, breaker strength, rezzed-ice encounters
- Complete discard choices, mulligans, or win conditions

## Layout

```
data/cr-pin.json          # pin declaration
scripts/fetch-cr-data.mjs
vendor/cr-data/           # fetched CR JSON (gitignored contents optional; PIN checked in via fetch)
src/
  state/                  # types + initial state
  timing/
    graph.ts              # explicit step graph (CR appendix labels)
    machine.ts            # enter / auto-walk / legality helpers
    labels.ts             # CR cite constants + re-exports
  actions/apply.ts        # pure apply + legality
  demo/verticalSlice.ts
  cr/load.ts
  cli.ts
  index.ts
tests/engine.test.ts
```

## Library sketch

```ts
import { createInitialState, applyAction, legalActions, CR } from "netrunner-engine";

let state = createInitialState();
state = applyAction(state, { type: "pass_window" }).state!;
const legal = legalActions(state);
// CR.corpBasicCredit.number === "5.2.6b"
```
