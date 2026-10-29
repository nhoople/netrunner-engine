# Interaction smoke samples (set-complete)

Light **cross-card** checks when a pack hits set-complete / `pool.json` → `supported`. These are not a full rules suite and not a CR→AST compiler — sample pairs that stress interactions easy to miss in per-card IR clears.

Use with the set-complete section of [`cr-adherence-gate.md`](cr-adherence-gate.md). Record results on the set-complete PR.

**Status:** Required at set-complete for each **new** pack. Gateway→VP corpus pass shipped in engine [#193](https://github.com/nhoople/netrunner-engine/pull/193). Magnum Opus light smoke was recorded at set-complete `v1.142.0`. Re-sample with wave-local roles when the next pack gates (project idle; cards `v1.147.13`, engine `v1.147.146`).

---

## How to run

1. Pick **at least three** rows from the reusable list below that the new wave can exercise (substitute wave cards for the role columns when Gateway/SU21 stand-ins do not apply).
2. For each: scripted engine test **or** short manual CLI/demo notes — happy path + one failure/prevent path when the row implies it.
3. Fail closed: if the interaction is in printed text for a cleared card but the engine cannot model it, keep/restore `unsupported` (or allowlisted deferral) — do not mark the wave `supported` with silent wrong play.

Recording (copy into gate notes):

```text
Interaction smoke — <pack> / <milestone tag>
Pairs:
  - <row name>: <card A> × <card B> — pass | fail | deferred (<cite>)
Verdict: ok | blocked
```

---

## Reusable sample matrix

| Stress class | Role A (example) | Role B (example) | What to verify |
|--------------|------------------|------------------|----------------|
| **prevent × cost** | Damage/tag prevent (e.g. Plascrete-class meat prevent) | Nested / paid cost that spends the same resource | Prevent window fires before payment settles; costs that CR treats as unpayable when prevention would block payment stay illegal (**1.16.1b**, **9.9.5**) |
| **blank × host** | Blanking / conditional blank (e.g. Hush-class) | Hosted conditional ice/asset (e.g. Magnet-class, Mayfly) | Blanked card loses abilities the host/IR expects; no zombie triggers; re-enable restores |
| **interrupt chain** | Interrupt PAW ability (prevent/avoid) | Second interrupt or priority ability in the same window | Drain order / priority windows match appendix timing; no double-spend; passing the window is explicit |
| **cannot × basic action** | “Cannot” constraint (jack out, run, rez, …) | Matching basic/paid action | Action absent from legality; cite surfaces; no silent ignore of **1.2.2** |
| **success ternary** | Crisium-class / runs-cannot-be-successful | On-successful-run / on-unsuccessful-run card | Reaching Success without being declared successful ≠ unsuccessful (**6.8.4a**) |
| **trojan / host ice** | Trojan program on ice | Ice trash / derez / swap | Hosted program follows CR host rules; no orphan counters; cites via shared procedures |
| **trace × paid window** | Trace subroutine / ability | Runner/Corp spend in the trace PAW | Bid/spend order and strength calculation match shared trace module |
| **access mid-window** | Mid-access paid ability | Trash-on-access / steal | Access-a-card steps not skipped; abilities only in windows the graph exposes |

Swap in wave-local cards that fill the same **role**. Three diverse rows beat six near-duplicates.

---

## Related

- Per-slice gate: [`cr-adherence-gate.md`](cr-adherence-gate.md)
- Pin bumps: [`cr-pin-bump-checklist.md`](cr-pin-bump-checklist.md)
- Engine confidence suite: `tests/confidence-*.test.ts` (merged [#193](https://github.com/nhoople/netrunner-engine/pull/193))
