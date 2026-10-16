# Comprehensive Rules glossary (engine)

**Pin:** CR data tag **`v26.03`**.  
**Machine map:** [`data/cr-term-map.json`](../data/cr-term-map.json) (every unique term/subtype from `terms.json`).  
**Rebuild map:** `node scripts/build-cr-term-map.mjs` (preserves hand-maintained statuses).

Card text still wins on direct contradiction (**CR 1.2.1**). Status `card-text` means the term appears on cards and is not an engine rename target.

## Status values

| Status | Meaning |
|--------|---------|
| `aligned` | CR name used where modeled — including Effect IR kinds / intents named for the procedure (no separate TypeScript type required) |
| `alias` | True CR synonym of another aligned name (none currently) |
| `ui-only` | Display / host concept only |
| `unmodeled` | CR term exists; no dedicated engine id yet (backlog) |
| `card-text` | Card / subtype vocabulary |
| `na` | Not applicable to this host |

## Zones (CR chapter 4)

| CR zone | Cite | Corp | Runner | Shared bag / code |
|---------|------|------|--------|-------------------|
| Deck | 4.2 | R&D (`corp:rd`) | stack (`runner:stack`) | `PlayerState.deck` |
| Hand | 4.3 | HQ (`corp:hq`) | grip (`runner:grip`) | `PlayerState.hand` |
| Discard pile | 4.4 | Archives (`corp:archives`) | heap (`runner:heap`) | `PlayerState.discardPile` |
| Score area | 4.5 | `corp:score` | `runner:score` | `PlayerState.scoreArea` |
| Play area | 4.6 | partitions below | partitions below | `isPlayAreaZone` |
| Bank | 4.7 | — | — | credits/counters (no card ZoneId) |
| Set aside | 4.8 | `corp:set-aside` | `runner:set-aside` | bags / ZoneIds |
| Removed from the game | 4.9 | `removed-from-game` | same | |

Helpers: [`src/state/zones.ts`](../src/state/zones.ts).

### Play area partitions

CR **4.6** is one zone. The engine stores it as partitions (indexes), not separate CR zones:

- `server:${id}:root` / `server:${id}:ice` — Corp ice and root
- `runner:installed` — Runner installed programs/hardware/resources
- `corp:play-area` / `runner:play-area` + `PlayerState.playArea` — ops/events/currents/lockdowns in play (**8.6.x**)
- `hosted:${hostId}` + `hostedCardIds` — hosted cards are still in the play area (**4.6.5g** / **4.6.5h**)

Helpers: `isPlayAreaZone`, `isInPlayArea`, `playAreaCardIds`, `lingeringPlayAreaIds`, `enterLingeringPlayArea`.  
`getPublicView` exposes lingering `playArea`, nested `hostedCards`, shared `setAside` (**4.8**), and `badPublicityFund` (**10.6.2**). Do not reintroduce `runner:rig`.

## Timing windows

| CR term | Cite | Code |
|---------|------|------|
| Priority window | 9.2.4 | `pass_window`, etc. |
| Action window | 9.2.6 | take-action steps (no pass) |
| Paid ability window (PAW) | 9.2.7 | `PaidAbilityWindow` / `*.actionPaw` |
| Reaction window | 9.2.8 | reaction close helpers |
| Interrupt window | 9.2.9 | `InterruptWindow` (`*_interrupt`, not `*_interrupt_paw`) |
| Mid-access ability window | 9.2.10 | `access.midAccess`; pass via `finish_access` |

**Pass** (**9.2.4b**, **9.2.10**): player-facing label is **Pass**, not “Continue” / “Finish accessing”.

Action window ≠ PAW. Convenience aliases must be named `actionPaw`, not `actionWindow`.

## Counters, damage, link, access

| CR term | Cite | Code | Banned |
|---------|------|------|--------|
| Advancement counters | 1.9.5f | `advancementCounters`, `source_advancement_counters` | `advancementTokens`, `source_advancement_tokens` |
| Random access limit | 7.3.5 | `run.randomAccessLimit` | `accessRemaining` |
| Core damage | 10.4.2b | `PlayerState.coreDamage` | `PlayerState.brainDamage` |
| Brain (alias of core) | 10.4.2c | `DamageType "brain"` | — |
| Link value | 10.7.1 | `PlayerState.link` (UI: Link value) | — |
| Link strength | 10.8.3 | trace path | — |
| Agenda points | 1.17 | score totals / UI | stat label “Score” for points |

## Ability flags (CR 9.3.6)

Printed on each ability as `flag` / `flagRule` (`AbilityFlag` on `AbilityRecord` and `PaidAbility`). Words: `access`, `interface`, `interrupt`, `persistent`, `once_per_turn`, and `{ threat: N }`. Paid checks read `flag` only; load folds legacy `oncePerTurn` / `requiresThreat` into `flag`. `CardInstance.persistent` is derived from the ability flag at load — not a card-declaration field. Trigger cost (**1.16.9**) is `PaidAbility.cost`.

## Dividends (CR 10.13)

Effect IR `dividends` with `{ n }` places **N** agenda counters for each hosted advancement past the advancement requirement at score begin (**10.13.1**, **10.13.2**). `scoreAgenda` snapshots counters and the effective requirement, then clears advancements when the agenda moves to the score area. Printed “past N” overadvance (not Dividends) uses `place_agenda_counters_past` `{ past, per? }` (e.g. Project Beale).

## Denylist

CI: [`tests/cr-term-denylist.test.ts`](../tests/cr-term-denylist.test.ts) fails if banned aliases from `cr-term-map.json` reappear in `src/`.

Cards pin **`v1.147.4+`** ships CR interrupt windows, advancement counters, Elevation `dividends`, and Beale-style `place_agenda_counters_past`. Older card tags are unsupported by this pin.

## Full inventory

See `data/cr-term-map.json` for every unique CR term/subtype (~242). Procedure verbs (*gains*, *using*, *take*, …) are `aligned` when Effect IR or intents already name that procedure. Status `card-text` is printed/subtype language, not an engine rename target.

### Remaining `unmodeled`

None. `tests/cr-term-denylist.test.ts` asserts the unmodeled list stays empty.

### Remaining `alias`

None. **CR 1.9.1a** makes *counter* and *token* interchangeable; named types use `*Counters` / `source_*_counters` in code.
