# CR pin bump checklist

Use when Null Signal Games publishes a new Comprehensive Rules version and Netrunner Core needs to move the engine pin (today: **`v26.03`** → next tag).

**Not in scope:** compiling CR prose / `nodes.json` into Effect IR. IR stays hand-authored; the pin supplies citations, defined-term IDs, timing structures, and examples.

Authority links: engine `data/cr-pin.json` + `npm run fetch-cr`; gate [`cr-adherence-gate.md`](cr-adherence-gate.md).

---

## Steps

1. **Confirm the NSG release** — note the public CR version / tag name on [netrunner-comprehensive-rules-data](https://github.com/nhoople/netrunner-comprehensive-rules-data) (or the upstream Null Signal source the consumer repo tracks).
2. **Re-fetch / bump the pin** — update engine `data/cr-pin.json` (`tag`, `rawBase` / archive URL, `files` if the file set changed). Run `npm run fetch-cr` and commit vendored pin metadata as the repo expects (`vendor/cr-data/PIN.json` story in engine README).
3. **Cite-map** — run `tests/cr-cite-map.test.ts` (default `npm test`). Fix every stale `CR.*` `number`/`id` pair in `src/timing/labels.ts` so both directions resolve in pinned `index.json`. Prefer updating labels over deleting cites that behavior still needs.
4. **Timing structures** — run the “every graph stepId exists in pinned timing-structures.json” check in `tests/engine.test.ts`. If NSG renamed/removed a step id the graph still uses, either retarget the graph step or implement the new structure deliberately — do not leave dangling `stepId`s.
5. **Skim changed examples** — diff pinned `nodes.json` / example-bearing nodes for rules the engine models (prevent/avoid, costs, run success/unsuccessful, damage order, traces, access). Open follow-ups for **mismatch**-class findings; do not silently change host behavior without a tracked slice.
6. **Gate + docs** — update the pin string in [`cr-adherence-gate.md`](cr-adherence-gate.md), the local project roadmap, the pin table in [nhoople/netrunner](https://github.com/nhoople/netrunner), and PR templates’ `CR gate (v…)` line. Record any corpus follow-ups on the pin-bump PR.
7. **Engine CI green** — `npm ci && npm run prepare-data && npm test` on the pin-bump PR. Cite-map + timing-id checks are part of the default `test` job; they must hard-fail on stale pins.

---

## Recording template (pin-bump PR)

```text
CR pin bump — <old> → <new>
Cite-map: green | failures fixed in labels.ts (<keys>)
Timing stepIds: green | retargeted (<keys>)
Examples skimmed: <sections / none material>
Follow-ups opened: <none | links>
Docs updated: gate + roadmap + netrunner map + PR templates
```
