# Comprehensive Rules adherence gate

**Pin:** [netrunner-comprehensive-rules-data](https://github.com/nhoople/netrunner-comprehensive-rules-data) tag **`v26.03`** (engine `data/cr-pin.json`).  
**Authority:** CR for citations, defined terms, timing IDs, and procedure shape. Card text still wins on direct contradiction (**CR 1.2.1**).  
**Not in scope:** compiling `nodes.json` / CR prose into Effect IR. IR stays hand-authored; this gate is a **review + fail-closed** checklist before marking cards clear.

Use this gate on every **new card / IR slice** going forward, and again at **set-complete**.

---

## Why this gate exists

Prior waves gated on **card-text → Effect IR + engine tests**. That catches wrong IR and missing primitives, but can still ship:

- procedures that ignore pinned appendix timing (e.g. prevent windows, BP fund, access-a-card),
- ternary success/unsuccessful mistakes called out by CR examples,
- stale cite `id`s that no longer match `index.json`,
- silent approximations (damage order, trace spend, basic remove-tag).

The CR gate does **not** replace IR/tests. It sits **beside** them: same slice cannot be marked clear until both pass.

---

## Per-card / per-slice checklist

Run for each card (or tightly related group) in the slice. Record outcomes in the PR / gate notes (short bullets are enough).

### 0. Pins & inputs

- [ ] Engine CR pin is **`v26.03`**; `npm run fetch-cr` (or vendored pin) matches.
- [ ] Cards-data + engine tags for the slice are the ones under review.
- [ ] Printed text (NSG cards-json / card JSON fields) is the mapping source; CR examples in `data/cards.json` for this card are consulted when present.

### 1. Timing windows

- [ ] Triggers map to a real window the engine models (`paid_ability`, encounter/approach/movement PAWs, interrupt PAWs, phase-begin/end, mid-access, etc.).
- [ ] If the card needs a window the graph **does not** expose (e.g. discrete `11.6_*` access steps, damage interrupt for net/meat), either **implement the window** or leave an explicit `unsupported` note — **do not** auto-resolve as if the window existed.
- [ ] Nested / interrupt costs that CR treats as unpayable when prevention would block payment (**1.16.1b**) are not silently rewritten as free choices unless that matches printed modal text.

### 2. Defined terms & keyword procedures

- [ ] Keywords the card uses (charge, mark, sabotage, ambush, trojan, …) go through the shared engine procedures cited in `src/timing/labels.ts` (e.g. **10.10**, **10.11**, **10.12**), not one-off approximations.
- [ ] Damage / tags / traces / install / rez / advance / trash / score / steal use the shared modules and CR cites, not card-local forks.
- [ ] “Cannot”, “prevent”, “avoid”, “ignore”, “instead” are checked against **1.2.2** (cannot precedence) and **9.9.5** (prevent/avoid).

### 3. Costs, install, rez

- [ ] Play / rez / install / additional / nested costs follow **1.16** (calculation order, checkpoints, alternate payments).
- [ ] Ice rez during runs respects **6.4.3**; install destinations respect **8.5.x**.

### 4. Run structure (when the card touches a run)

- [ ] Approach → encounter → movement → success → breach → run ends align with appendix **11.4** / **11.5** as implemented in `timing/graph.ts`.
- [ ] Success vs unsuccessful is ternary-aware: reaching Success Phase without being declared successful is **not** unsuccessful (**6.8.4a**). Cards like Crisium-class (`runsCannotBeSuccessful`) must not set an “unsuccessful” outcome solely because success was blocked.
- [ ] ETR / jack-out / bypass / redirect use existing run helpers + cites (**6.1.4**, **6.1.5**, **6.5.8**, …).

### 5. Citations

- [ ] New host behaviors add or reuse entries in `src/timing/labels.ts` (`CR.*` with **both** `number` and stable `id`).
- [ ] Every new `number`/`id` pair resolves bidirectionally in pinned `index.json` (`numbers[n] === id` and `ids[id] === n`).
- [ ] Prefer `CR.foo` over inline `{ number, id }` cites; if inline is unavoidable, still validate against the pin.
- [ ] Tests that assert legality/errors should include the relevant cite numbers where the API already surfaces them.

### 6. Fail-closed rules

| Situation | Required action |
|-----------|-----------------|
| CR ambiguous for the mapped interaction | Keep clause in `unsupported` (or do not clear the card); note the CR node(s) and the open question |
| Engine lacks the needed window/primitive | Same — **no** silent auto-resolve that invents a procedure |
| Card text contradicts general CR | Prefer card text (**1.2.1**); cite both the card and **1.2.1** in notes/tests |
| Only a subset of printed text is mapped | Explicit `unsupported` entries for the rest — never empty-IR + host hardcode without a tracked follow-up |

Fail-closed means: **wrong play is worse than “not yet playable.”** Pool `supported` / clear status requires the gate, not only green unit tests. Waves marked `supported` must keep every card’s `unsupported` empty unless the card is listed with a reason in cards-data `data/supported-unsupported-allowlist.json` (CI: cards `validate-cards.py`, engine `tests/pool-supported-invariant.test.ts`).

### 7. Slice exit (before bumping semver / clearing cards)

- [ ] IR validates; unknown nodes still fail closed.
- [ ] Engine tests cover the new behaviors (happy path + at least one cannot/prevent/cost-fail path when relevant).
- [ ] This CR checklist completed for each cleared card; residual debt listed as `unsupported` or follow-up backlog items with CR cites.
- [ ] No new stale cite ids — default engine CI `npm test` includes `tests/cr-cite-map.test.ts` (bidirectional `CR.*` ↔ pin) and the timing `stepId` check in `tests/engine.test.ts`.
- [ ] PR includes the **Recording template** below (engine and cards-data `.github/PULL_REQUEST_TEMPLATE.md` require it for IR/clear slices).

---

## Set-complete addition

When a pack hits 100% clear / `pool.json` → `supported`, also:

- **CR adherence pass** — sample high-risk cards in the wave against this gate; fix or explicitly defer any **mismatch**-class findings; summarize on the set-complete PR.
- **Interaction smoke** — run a light cross-card sample from [`interaction-smoke-samples.md`](interaction-smoke-samples.md) (prevent×cost, blank×host, interrupt chains, etc.); record outcomes in the set-complete summary. Gateway→VP one-time corpus pass already merged ([engine#193](https://github.com/nhoople/netrunner-engine/pull/193)); re-run for each **new** set-complete wave.

Full retrospective audits of the whole corpus are optional between waves; the **per-slice** gate is mandatory for new clears.

---

## Recording template (copy into PR / internal gate notes)

```text
CR gate (v26.03) — <pack> / <slice tag>
Cards: <ids>
Timing windows: <list or n/a>
Defined terms / keywords: <list>
Cannot / prevent interactions: <none | cites>
Cite additions: <CR.* keys or none>
Fail-closed / unsupported left: <none | bullets>
Verdict: clear | clear-with-debt | blocked | n/a — <reason>
```

Repo PR templates (hard to skip):

- [netrunner-engine `.github/PULL_REQUEST_TEMPLATE.md`](https://github.com/nhoople/netrunner-engine/blob/master/.github/PULL_REQUEST_TEMPLATE.md)
- [netrunner-cards-data `.github/PULL_REQUEST_TEMPLATE.md`](https://github.com/nhoople/netrunner-cards-data/blob/master/.github/PULL_REQUEST_TEMPLATE.md)

---

## Related

- Interaction smoke samples: [`interaction-smoke-samples.md`](interaction-smoke-samples.md)
- CR pin bump: [`cr-pin-bump-checklist.md`](cr-pin-bump-checklist.md)
- Engine: `src/timing/labels.ts`, `src/timing/graph.ts`, `data/cr-pin.json`
