/**
 * The playout harness itself (CR audit tool 1.3): the decks it builds are
 * legal (CR 1.4), a seed replays the same match, and the fixture comparison
 * is shrink-only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  cardsDataPresent,
  crDataPresent,
  loadCardCatalog,
} from "../../src/index.js";
import {
  FORMATS,
  compareWithSeeds,
  deckProblems,
  decksFor,
  formatPool,
  learnToPlayDecks,
  playout,
  playoutSeedList,
  readSeeds,
  readWeeklySeeds,
  weeklyCheck,
  type Format,
} from "./harness.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
});

const RANDOM_FORMATS = FORMATS.filter((f) => !f.startsWith("learn_to_play"));

describe("playout decks", () => {
  it("deals the Learn to play lists netrunner-game deals", () => {
    const starter = learnToPlayDecks("starter");
    const expanded = learnToPlayDecks("expanded");
    expect(starter.corp.cards).toHaveLength(34);
    expect(starter.runner.cards).toHaveLength(30);
    expect(expanded.corp.cards).toHaveLength(44);
    expect(expanded.runner.cards).toHaveLength(40);
    const catalog = loadCardCatalog();
    for (const deck of [
      starter.corp,
      starter.runner,
      expanded.corp,
      expanded.runner,
    ]) {
      for (const id of [deck.identityId, ...deck.cards])
        expect(catalog.has(id), id).toBe(true);
    }
  });

  it.each(RANDOM_FORMATS)("builds legal %s decks (CR 1.4, 1.4.8)", (format) => {
    const pool = formatPool(format);
    for (let seed = 1; seed <= 25; seed++) {
      const decks = decksFor(format as Format, seed);
      expect(deckProblems(pool, decks.corp), `corp seed ${seed}`).toEqual([]);
      expect(deckProblems(pool, decks.runner), `runner seed ${seed}`).toEqual(
        [],
      );
    }
  });

  it("keeps banned cards and the Gateway starter identities out (CR 1.4.1a, 1.4.8)", () => {
    const startup = formatPool("startup");
    expect(startup.restriction?.banned).toContain("offworld-office");
    expect(startup.cards).not.toContain("offworld-office");
    const deck = {
      identityId: "the-syndicate-profit-over-principle",
      cards: learnToPlayDecks("starter").corp.cards,
    };
    expect(
      deckProblems(startup, deck).some((p) => p.includes("CR 1.4.1a")),
    ).toBe(true);
  });

  it("flags a deck under the minimum, over influence or over a copy limit (CR 1.4.3, 1.4.5, 1.4.7)", () => {
    const pool = formatPool("startup");
    const { corp } = decksFor("startup", 1);
    expect(
      deckProblems(pool, { ...corp, cards: corp.cards.slice(1) }).join(),
    ).toContain("CR 1.4.3");
    const fourth = corp.cards.find(
      (id) => corp.cards.filter((c) => c === id).length === 3,
    );
    if (fourth)
      expect(
        deckProblems(pool, { ...corp, cards: [...corp.cards, fourth] }).join(),
      ).toContain("CR 1.4.7");
  });

  it("counts neutral influence and not in-faction influence (CR 1.4.5)", () => {
    const pool = formatPool("startup");
    const { runner } = decksFor("startup", 1);
    // Neutral cards are out-of-faction: 3 each of Lucky Find, Baba Yaga and
    // Ashen Epilogue (2 influence each) is 18, over any 15-influence runner.
    const neutral = ["lucky-find", "baba-yaga", "ashen-epilogue"].flatMap(
      (id) => [id, id, id],
    );
    const deck = {
      ...runner,
      cards: [...neutral, ...runner.cards.slice(neutral.length)],
    };
    const before = deckProblems(pool, runner).length;
    expect(before).toBe(0);
    expect(deckProblems(pool, deck).join()).toMatch(
      /influence \d+ is over the limit \(CR 1\.4\.5\)/,
    );
  });

  it("varies the decks with the seed", () => {
    const ids = new Set<string>();
    for (let seed = 1; seed <= 10; seed++)
      ids.add(decksFor("startup", seed).corp.cards.join());
    expect(ids.size).toBeGreaterThan(5);
  });
});

describe("playout replay", () => {
  it("replays the same match from the same seed", () => {
    expect(playout("startup", 7, 30)).toEqual(playout("startup", 7, 30));
  });

  it("fails on a new failure and on an entry that no longer happens", () => {
    const result = {
      format: "startup" as const,
      seed: 99,
      steps: 10,
      finished: false,
      failures: [{ code: "REFUSED", step: 4, detail: "x" }],
    };
    expect(compareWithSeeds(result, [])).toHaveLength(1);
    const entry = {
      format: "startup" as const,
      deckSeed: 99,
      code: "REFUSED",
      step: 4,
      recorded: "2026-11-13",
      detail: "x",
    };
    expect(compareWithSeeds(result, [entry])).toEqual([]);
    expect(compareWithSeeds({ ...result, failures: [] }, [entry])).toHaveLength(
      1,
    );
  });

  it("the weekly run fails only on a format, seed and code no list holds, and on a weekly entry that no longer happens", () => {
    const result = (seed: number, ...codes: [string, number][]) => ({
      format: "startup" as const,
      seed,
      steps: 200,
      finished: false,
      failures: codes.map(([code, step]) => ({ code, step, detail: "d" })),
    });
    const entry = (deckSeed: number, code: string, step: number) => ({
      format: "startup" as const,
      deckSeed,
      code,
      step,
      recorded: "2026-11-28",
      detail: "d",
    });
    // Unlisted anywhere: fails.
    expect(weeklyCheck([result(60, ["REFUSED", 9])], [], [], 200)).toEqual({
      unlisted: ["startup seed 60: REFUSED@9 d"],
      gone: [],
    });
    // Listed in the weekly list or the CI fixture, at any step: known.
    expect(
      weeklyCheck(
        [result(60, ["REFUSED", 9])],
        [],
        [entry(60, "REFUSED", 40)],
        200,
      ),
    ).toEqual({ unlisted: [], gone: [] });
    expect(
      weeklyCheck(
        [result(60, ["REFUSED", 9])],
        [entry(60, "REFUSED", 9)],
        [],
        200,
      ),
    ).toEqual({ unlisted: [], gone: [] });
    // Another code, seed or format is not the same failure.
    expect(
      weeklyCheck(
        [result(60, ["NO_ZONE", 9])],
        [],
        [entry(60, "REFUSED", 9)],
        200,
      ).unlisted,
    ).toHaveLength(1);
    expect(
      weeklyCheck(
        [result(61, ["REFUSED", 9])],
        [],
        [entry(60, "REFUSED", 9)],
        200,
      ).unlisted,
    ).toHaveLength(1);
    expect(
      weeklyCheck(
        [{ ...result(60, ["REFUSED", 9]), format: "core" as const }],
        [],
        [entry(60, "REFUSED", 9)],
        200,
      ).unlisted,
    ).toHaveLength(1);
    // A weekly entry whose seed played 200 steps without its code is gone.
    expect(
      weeklyCheck([result(60)], [], [entry(60, "REFUSED", 9)], 200).gone,
    ).toEqual(["startup seed 60: REFUSED"]);
    // Not gone when its seed was not played, or the run was shorter.
    expect(
      weeklyCheck([result(61)], [], [entry(60, "REFUSED", 9)], 200).gone,
    ).toEqual([]);
    expect(
      weeklyCheck([result(60)], [], [entry(60, "REFUSED", 9)], 100).gone,
    ).toEqual([]);
  });

  it("the weekly list holds only seeds CI does not play, once per format, seed and code", () => {
    const weekly = readWeeklySeeds();
    const ci = readSeeds();
    expect(weekly.steps).toBe(ci.steps);
    const keys = new Set<string>();
    for (const e of weekly.entries) {
      expect(FORMATS).toContain(e.format);
      expect(playoutSeedList(e.format, ci)).not.toContain(e.deckSeed);
      expect(e.recorded).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const key = `${e.format}#${e.deckSeed}#${e.code}`;
      expect(keys.has(key), key).toBe(false);
      keys.add(key);
    }
  });

  it("records every fixture entry with a known format, a date and a step in budget", () => {
    const seeds = readSeeds();
    for (const entry of seeds.entries) {
      expect(FORMATS).toContain(entry.format);
      expect(entry.recorded).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.step).toBeLessThan(seeds.steps);
    }
  });
});
