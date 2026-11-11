/**
 * Every random procedure (mulligan shuffle CR 1.6.6a, search reshuffle
 * CR 8.7.3, random damage trash CR 10.4.2a) draws from the game's own
 * seeded stream, so a state plus its intents always gives the same game.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialState,
  dealDamage,
  instantiateCard,
  random,
  seedRng,
  shuffleInPlace,
} from "../src/index.js";
import type { GameState } from "../src/index.js";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

function corpMulliganHand(seed: number): string[] {
  const s = createInitialState({ seed });
  expect(s.timingKey).toBe("opening.corpMulligan");
  const r = applyAction(s, { type: "mulligan" });
  if (!r.ok) throw new Error(r.error);
  return r.state.corp.hand;
}

function gripOf(s: GameState, n: number): void {
  s.runner.hand = [];
  for (let i = 0; i < n; i++) {
    const id = `grip-${i}`;
    s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    s.runner.hand.push(id);
  }
}

describe("seeded random stream", () => {
  it("no engine source calls Math.random", () => {
    const offenders = sourceFiles(join(import.meta.dirname, "../src")).filter(
      (path) =>
        readFileSync(path, "utf8")
          .split("\n")
          .some((line) => /Math\.random\s*\(/.test(line)),
    );
    expect(offenders).toEqual([]);
  });

  it("the same seed gives the same mulligan hand (CR 1.6.6a)", () => {
    expect(corpMulliganHand(1234)).toEqual(corpMulliganHand(1234));
    expect(corpMulliganHand(99)).toEqual(corpMulliganHand(99));
  });

  it("different seeds give different shuffles", () => {
    const deck = Array.from({ length: 40 }, (_, i) => `c${i}`);
    const a = createInitialState({ seed: 1 });
    const b = createInitialState({ seed: 2 });
    const da = [...deck];
    const db = [...deck];
    shuffleInPlace(a, da);
    shuffleInPlace(b, db);
    expect([...da].sort()).toEqual([...deck].sort());
    expect(da).not.toEqual(db);
    expect(da).not.toEqual(deck);
  });

  it("replaying an intent on the same state gives the same result", () => {
    const s = createInitialState({ seed: 77 });
    const before = s.rngState;
    const first = applyAction(s, { type: "mulligan" });
    const second = applyAction(s, { type: "mulligan" });
    if (!first.ok || !second.ok) throw new Error("mulligan refused");
    expect(s.rngState).toBe(before);
    expect(first.state.rngState).not.toBe(before);
    expect(second.state.corp.hand).toEqual(first.state.corp.hand);
    expect(second.state.corp.deck).toEqual(first.state.corp.deck);
    expect(second.state.rngState).toBe(first.state.rngState);
  });

  it("the stream position survives a JSON round trip of the state", () => {
    const s = createInitialState({ seed: 5 });
    random(s);
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    expect(random(copy)).toBe(random(s));
  });

  it("one game's draws do not move another game's stream", () => {
    const a = createInitialState({ seed: 11 });
    const b = createInitialState({ seed: 11 });
    for (let i = 0; i < 25; i++) random(a);
    const fresh = createInitialState({ seed: 11 });
    expect(random(b)).toBe(random(fresh));
  });

  it("random damage trashes repeat for a seed (CR 10.4.2a, 10.4.3)", () => {
    const trashed = (seed: number): string[] => {
      const s = createInitialState();
      gripOf(s, 6);
      seedRng(s, seed);
      dealDamage(s, "net", 3, "src");
      return [...s.runner.discardPile];
    };
    expect(trashed(31)).toEqual(trashed(31));
    expect(trashed(31)).toHaveLength(3);
  });
});
