/**
 * Shared outcome helpers for effect-kind tests (CR audit Phase 2, guard 2).
 *
 * A test that covers an effect kind registers it with `coversKind("x")` and
 * asserts what the kind did with `expectStateDelta(before, after, {...})` in
 * the same `it()`. tests/kind-effect-coverage.test.ts reads those calls from
 * the source: a kind counts as covered only when an `it()` both registers it
 * and asserts a state change. Mentioning the kind's name no longer counts.
 *
 *   const before = snapshot(s);
 *   coversKind("corp_lose_two_if_can");
 *   runKind(s, "fester-1", "corp_lose_two_if_can");
 *   expectStateDelta(before, s, { "corp.credits": -2 });
 */
import { expect } from "vitest";
import { KNOWN_PRIMITIVE_KINDS } from "../src/effects/ir.js";
import type { GameState } from "../src/state/types.js";

/** Records that this `it()` covers `kind`. Fails on a kind the IR does not know. */
export function coversKind(kind: string): void {
  expect(
    KNOWN_PRIMITIVE_KINDS.has(kind),
    `coversKind: unknown kind ${kind}`,
  ).toBe(true);
}

/** A deep copy of the state to compare against after the effect. */
export function snapshot(state: GameState): GameState {
  return structuredClone(state);
}

/**
 * Expected change at a dotted path (`corp.credits`, `cards.x.zone`,
 * `servers.hq.ice`):
 *   - a number: the numeric delta, after − before (never 0);
 *   - `{ to }`: the value after (it must differ from the value before);
 *   - `{ from, to }`: both values.
 */
export type Delta = number | { to: unknown } | { from: unknown; to: unknown };

function at(root: unknown, path: string): unknown {
  let v: unknown = root;
  for (const key of path.split(".")) {
    if (v === null || v === undefined) return undefined;
    v = (v as Record<string, unknown>)[key];
  }
  return v;
}

/**
 * Asserts each listed path changed as expected between `before` and `after`.
 * Every entry must be a real change, so a kind that does nothing fails.
 */
export function expectStateDelta(
  before: GameState,
  after: GameState,
  expected: Record<string, Delta>,
): void {
  const entries = Object.entries(expected);
  expect(
    entries.length,
    "expectStateDelta needs at least one path",
  ).toBeGreaterThan(0);
  for (const [path, delta] of entries) {
    const was = at(before, path);
    const now = at(after, path);
    if (typeof delta === "number") {
      expect(delta, `${path}: a delta of 0 is not a state change`).not.toBe(0);
      expect(typeof was, `${path} before`).toBe("number");
      expect(typeof now, `${path} after`).toBe("number");
      expect(
        (now as number) - (was as number),
        `${path}: ${String(was)} → ${String(now)}`,
      ).toBe(delta);
    } else {
      if ("from" in delta) expect(was, `${path} before`).toEqual(delta.from);
      expect(now, `${path} after`).toEqual(delta.to);
      expect(now, `${path}: unchanged`).not.toEqual(was);
    }
  }
}
