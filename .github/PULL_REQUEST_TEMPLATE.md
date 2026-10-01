## Summary

<!-- What changed and why (1–3 bullets). -->

## CR adherence gate (required for Effect IR / card wiring)

For any PR that adds Effect IR, wires host behavior for a card, or marks cards fully mapped: fill the recording template below (full checklist: Netrunner Core Project `docs/cr-adherence-gate.md`; see also [`CONTRIBUTING.md`](../CONTRIBUTING.md)). Do **not** delete this section.

Pure docs / CI / chore / non-IR refactors: leave the template and write `Verdict: n/a — <one-line reason>` (e.g. `n/a — CI/process only`).

```text
CR gate (v26.03) — <pack>
Cards: <ids>
Timing windows: <list or n/a>
Defined terms / keywords: <list>
Cannot / prevent interactions: <none | cites>
Cite additions: <CR.* keys or none>
Fail-closed / unsupported left: <none | bullets>
Verdict: clear | clear-with-debt | blocked | n/a — <reason>
```

### Checklist

- [ ] Effect IR / card wiring: CR gate filled above (or `n/a` with reason)
- [ ] New `CR.*` cites (if any) pass bidirectional index check (`tests/cr-cite-map.test.ts`)
- [ ] New timing graph steps (if any) use stepIds present in pinned `timing-structures.json` (`tests/engine.test.ts`)
- [ ] Supported-wave pool invariant still holds (`tests/pool-supported-invariant.test.ts`)
