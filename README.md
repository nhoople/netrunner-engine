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
npm run demo              # decline-rez empty remote slice
npm run demo:ice-break    # rez + Crowbar break → success
npm run demo:ice-etr      # rez + unbroken ETR → unsuccessful
npm run cli               # interactive action stepper
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

Paid-ability windows exist as labeled nodes. During a run, **approach PAW** (11.4_2_b) allows Corp to `rez_ice` or pass; **encounter PAW** (11.4_3_b) allows `break_subroutine` or pass (unbroken subs resolve, including End the run); **jack-out** (11.4_4_c) allows `jack_out` or continue. Stub cards: **Static Wall** (barrier, 1× ETR) and **Crowbar** (fracter).

## What v0 does not do

- UI / multiplayer / networking
- Full card pool or NetrunnerDB integration
- Compiling `nodes.json` into executable behavior
- Strength pumping, multi-sub ice beyond the stub, traces, damage, tags, agenda scoring
- Full nested priority-pass loops (only open/close checkpoint stubs on PAW close / cost pay)
- Complete discard choices, mulligans, or win conditions
- Generic paid abilities outside the hardcoded rez/break hooks

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
  cards/stubs.ts          # Static Wall, Lockdown Wall, Crowbar
  legality/               # queryLegality, explainAction, checkpoints
  actions/apply.ts        # pure apply + legality
  demo/verticalSlice.ts
  cr/load.ts
  cli.ts
  index.ts
tests/engine.test.ts
```

## Library sketch

```ts
import {
  createInitialState,
  applyAction,
  queryLegality,
  explainAction,
  CR,
} from "netrunner-engine";

let state = createInitialState();
state = applyAction(state, { type: "pass_window" }).state!;
const view = queryLegality(state);
// view.window.stepId, view.priority, view.legal[{ action, actor, cites }]
const why = explainAction(state, { type: "basic_gain_credit" });
// why.legal === false → cites include 5.4.1 / 5.2.4 outside action step
```

### Legality + checkpoints API

| Function | Role |
|----------|------|
| `queryLegality(state)` | Snapshot: current window, priority holder, legal actions with actors/cites, open checkpoints, restrictions |
| `legalActions(state)` | Flat `Action[]` (CLI / demos) |
| `explainAction(state, action)` | Legal/illegal + reason + CR cites |
| `isActionLegal(state, action)` | Boolean |
| Cost / priority checkpoints | Opened around rez/break spend (`1.16.3`) and when PAWs close (`9.2.4` / `9.11.1b`) |
| Cannot | `restrictions` + `run.cannotJackOut` (e.g. Lockdown Wall) cite `1.2.2` |
