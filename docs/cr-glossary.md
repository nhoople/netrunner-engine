# Comprehensive Rules glossary (engine)

**Pin:** CR data tag **`v26.03`**.  
**Machine map:** [`data/cr-term-map.json`](../data/cr-term-map.json) (every unique term/subtype from `terms.json`).  
**Rebuild map:** `node scripts/build-cr-term-map.mjs` (preserves hand-maintained statuses).

Card text still wins on direct contradiction (**CR 1.2.1**). Status `card-text` means the term appears on cards and is not an engine rename target.

## Status values

| Status | Meaning |
|--------|---------|
| `aligned` | CR name used in code/UI where modeled |
| `alias` | CR-allowed synonym or encoding note |
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

CR **4.6** is one zone. The engine stores it as:

- `server:${id}:root` / `server:${id}:ice` — Corp ice and root
- `runner:installed` — Runner installed programs/hardware/resources
- `corp:play-area` / `runner:play-area` — ops/events/currents/lockdowns in play (**8.6.x**)

These are **not** separate CR zones. Do not reintroduce `runner:rig`.

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
| Advancement counters | 1.9.5f | `advancementCounters` | `advancementTokens` |
| Random access limit | 7.3.5 | `run.randomAccessLimit` | `accessRemaining` |
| Core damage | 10.4.2b | `PlayerState.coreDamage` | `PlayerState.brainDamage` |
| Brain (alias of core) | 10.4.2c | `DamageType "brain"` | — |
| Link value | 10.7.1 | `PlayerState.link` (UI: Link value) | — |
| Link strength | 10.8.3 | trace path | — |
| Agenda points | 1.17 | score totals / UI | stat label “Score” for points |

## Ability flags (CR 9.3.6)

Encoded today via `windows`, `oncePerTurn`, `persistent`, `requiresThreat`, breaker gates, etc. Status `alias` until a first-class `flags[]` exists. Trigger cost (**1.16.9**) is `PaidAbility.cost`.

## Denylist

CI: [`tests/cr-term-denylist.test.ts`](../tests/cr-term-denylist.test.ts) fails if banned aliases from `cr-term-map.json` reappear in `src/` (except the catalog synonym map in `src/cards/load.ts`).

Cards pin **`v1.147.1+`** ships CR interrupt window and advancement counter names. Older card tags are unsupported by this pin.

## Full inventory

See `data/cr-term-map.json` for every unique CR term/subtype (~242). Most vocabulary the engine models is `aligned` or `alias`. Status `card-text` is printed/subtype language, not an engine rename target.

### Remaining `unmodeled`

| Term | Cite | Notes |
|------|------|-------|
| Dividends | **10.13** | No named Dividends primitive yet; excess advancement → agenda counters is done via card Effect IR |

Keep that list empty except intentional gaps. `tests/cr-term-denylist.test.ts` asserts the only `unmodeled` term is Dividends.
