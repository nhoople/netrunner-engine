/**
 * Ability fire coverage (CR audit tool 1.18).
 *
 * The seeded playouts (tool 1.3) record each CR 9.3 ability record that
 * resolves (tests/ability-fire/recorder.ts), and each playout format checks
 * what it fired against `tests/generated/ability-fire-coverage.json`. This
 * file checks the rest: the generated file lists, per supported card, every
 * ability no playout fired, and the shrink-only baseline
 * `tests/baselines/ability-fire.json` holds exactly those, under the area
 * each is filed under. Each area's evidence step reads its list and adds a
 * hand-built test for each ability; the generated file says how many
 * hand-built tests already resolve it.
 *
 * Regenerate with `npx tsx scripts/update-ability-fire.ts`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyIntent,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  queryLegality,
} from "../src/index.js";
import type { Action } from "../src/state/types/actions.js";
import type { GameState } from "../src/state/types/game.js";
import {
  canonical,
  ruleForName,
  supportedAbilities,
  type Ability,
} from "./ability-fire/abilities.js";
import {
  REGENERATE,
  readBaseline,
  readGenerated,
} from "./ability-fire/coverage.js";
import { setSink } from "./ability-fire/recorder.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
});

function neverFiredInPlayouts(): Ability[] {
  const fired = new Set(
    Object.values(readGenerated().playouts).flatMap((p) => p.fired),
  );
  return supportedAbilities().filter((a) => !fired.has(a.key));
}

/** What `fn` resolves, by ability key. */
function recording(fn: () => void): Set<string> {
  const fired = new Set<string>();
  const previous = setSink((key) => fired.add(key));
  try {
    fn();
  } finally {
    setSink(previous);
  }
  return fired;
}

function corpToAct(cards: Record<string, string>): GameState {
  const s = structuredClone(createInitialState());
  // The demo state marks a Runner program rezzed; Runner cards are never
  // rezzed (CR 8.1.4f), and this test is not about that.
  for (const card of Object.values(s.cards))
    if (card.side === "runner") card.rezzed = false;
  for (const [id, defId] of Object.entries(cards)) {
    s.cards[id] = instantiateCard(defId, id, "corp:hq");
    s.corp.hand.push(id);
  }
  s.corp.credits = 10;
  s.corp.clicks = 3;
  s.activeSide = "corp";
  s.timingKey = "corp.takeAction";
  return s;
}

function must(state: GameState, action: Action): GameState {
  const r = applyIntent(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("ability fire coverage (CR audit tool 1.18)", () => {
  it("records the play ability of an operation the Corp plays, and nothing for a card left in HQ", () => {
    const s = corpToAct({
      "hf-1": "hedge-fund",
      "bf-1": "beanstalk-royalties",
    });
    const fired = recording(() => {
      must(s, { type: "play_operation", cardId: "hf-1" });
    });
    expect([...fired]).toEqual(["hedge-fund#0"]);
  });

  it("records nothing while the legal actions are worked out", () => {
    const s = corpToAct({ "hf-1": "hedge-fund" });
    const fired = recording(() => {
      queryLegality(s);
    });
    expect([...fired]).toEqual([]);
  });

  it("files each ability under an area of the CR section owner table", () => {
    expect(ruleForName("net_damage")).toBe("10.4");
    expect(ruleForName("end_the_run")).toBe("6.1");
    expect(ruleForName("may_install_from_grip")).toBe("8.5.4");
    expect(ruleForName("may_install_from_hq_paying_costs")).toBe("8.5");
    expect(ruleForName("unless")).toBeNull();
    for (const ability of supportedAbilities()) {
      expect(ability.area, ability.key).toMatch(
        /^(?:area (?:[1-9]|1[0-6])|fidelity|standardization|reference)$/,
      );
    }
  });

  it("lists, per supported card, every ability no seeded playout fired", () => {
    const generated = readGenerated();
    const expected: Record<string, string[]> = {};
    for (const a of neverFiredInPlayouts())
      (expected[a.cardId] ??= []).push(`${a.key} ${a.class} ${a.area}`);
    const listed: Record<string, string[]> = {};
    for (const [card, entries] of Object.entries(generated.neverFired))
      listed[card] = entries.map((e) => `${e.ability} ${e.class} ${e.area}`);
    expect(listed, `stale: ${REGENERATE}`).toEqual(expected);
    expect(generated.summary.abilities, `stale: ${REGENERATE}`).toBe(
      supportedAbilities().length,
    );
  });

  it("every ability that never fires in the seeded playouts is listed in the baseline under its area", () => {
    const baseline = readBaseline();
    const missing: string[] = [];
    for (const a of neverFiredInPlayouts()) {
      if (!baseline.neverFired[a.area]?.includes(a.key))
        missing.push(`${a.area}: ${a.key} (${a.class} ${a.name ?? ""})`);
    }
    expect(
      missing,
      `abilities that no longer fire in the playouts and are not in tests/baselines/ability-fire.json. ` +
        `If the playouts now take other paths, add them with ${REGENERATE} --allow-new and say so in the PR; ` +
        `if one broke, that is a finding for its area`,
    ).toEqual([]);
  });

  it("the baseline lists only abilities that still never fire in the seeded playouts", () => {
    const never = new Map(neverFiredInPlayouts().map((a) => [a.key, a.area]));
    const stale: string[] = [];
    for (const [area, keys] of Object.entries(readBaseline().neverFired)) {
      for (const key of keys) {
        if (never.get(key) !== area) stale.push(`${area}: ${key}`);
      }
    }
    expect(
      stale,
      `entries that now fire, or moved area: shrink with ${REGENERATE}`,
    ).toEqual([]);
  });

  it("keys each ability by a card and index that name a record with instructions", () => {
    for (const a of supportedAbilities()) {
      expect(a.key).toBe(`${a.cardId}#${a.index}`);
      expect(canonical(a.instructions).length, a.key).toBeGreaterThan(2);
    }
  });
});
