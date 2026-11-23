/**
 * Every icebreaker raises its strength as printed, and starts at its printed
 * strength (CR audit program, fix-now session FX-pump).
 *
 * CR 3.9.5b: "Paid abilities on an icebreaker that modify that icebreaker's
 * strength implicitly have a duration of 'for the remainder of the current
 * encounter'." 34 supported icebreakers stated their "N[credit]: +M
 * strength" only in the breaker declaration (`pumpCredits`,
 * `pumpStrength`), which nothing read, so they could not pump. The engine
 * now builds that paid ability from those fields at load
 * (`declaredPumpAbility` in `src/cards/load.ts`), through `pump_strength`.
 *
 * CR 3.9.4a, 1.2.1: an icebreaker's strength is its printed strength. Nine
 * programs declared a lower `breaker.strength`, and `effectiveBreakerStrength`
 * read that first; it now reads the printed strength.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveBreakerStrength,
  instantiateCard,
  legalActions,
  loadCardCatalog,
} from "../src/index.js";
import type { GameState } from "../src/index.js";
import type { Action, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.29");
  loadCardCatalog(true);
});

function put(s: GameState, defId: string, id: string, zone: string) {
  const card = instantiateCard(defId, id, zone as never);
  s.cards[id] = card;
  return card;
}

function installRunner(s: GameState, defId: string, id: string) {
  const card = put(s, defId, id, "runner:installed");
  card.faceup = true;
  s.runner.installed.push(id);
  return card;
}

/**
 * The Runner's turn, encountering rezzed `iceDef` protecting HQ, in the
 * encounter's paid ability window (CR 6.9.3b).
 */
function encountering(iceDef: string, iceId = "ice-1"): GameState {
  const s = createInitialState();
  for (const card of Object.values(s.cards)) {
    if (card.side === "runner") card.rezzed = false;
  }
  s.activeSide = "runner";
  s.runner.clicks = 3;
  s.runner.credits = 10;
  s.priorityStack = [];
  const ice = put(s, iceDef, iceId, "server:hq:ice");
  ice.rezzed = true;
  ice.faceup = true;
  s.servers.hq.ice = [iceId];
  s.run = {
    attackedServerId: "hq",
    phase: "encounter",
    position: 0,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: null,
    encounter: {
      iceId,
      broken: (ice.subroutines ?? []).map(() => false),
    },
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
  };
  s.timingKey = "run.encounterPaw";
  return s;
}

function use(cardId: string, abilityId: string): Action {
  return { type: "use_paid_ability", cardId, abilityId } as Action;
}

function offered(s: GameState, action: Action): boolean {
  const key = JSON.stringify(action);
  return legalActions(s).some((a) => JSON.stringify(a) === key);
}

function must(s: GameState, action: Action): GameState {
  const r = applyAction(s, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

/**
 * The icebreakers whose pump is only a card field, with their printed
 * strength and printed pump: FX-pump's 34, and Overmind, whose 1[credit]
 * pump PF-S3b added to its card data.
 */
const PRINTED: Array<{
  id: string;
  title: string;
  strength: number;
  credits: number;
  plus: number;
  /** The test's name, written out so the printed-sweep record can find it. */
  test: string;
}> = [
  {
    id: "aghora",
    title: "Aghora",
    strength: 2,
    credits: 1,
    plus: 1,
    test: "Aghora starts at strength 2 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "alias",
    title: "Alias",
    strength: 1,
    credits: 2,
    plus: 3,
    test: "Alias starts at strength 1 and pays 2 credits for +3 strength (CR 3.9.5b)",
  },
  {
    id: "alpha",
    title: "Alpha",
    strength: 1,
    credits: 1,
    plus: 1,
    test: "Alpha starts at strength 1 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "amina",
    title: "Amina",
    strength: 3,
    credits: 2,
    plus: 3,
    test: "Amina starts at strength 3 and pays 2 credits for +3 strength (CR 3.9.5b)",
  },
  {
    id: "ankusa",
    title: "Ankusa",
    strength: 0,
    credits: 1,
    plus: 1,
    test: "Ankusa starts at strength 0 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "brahman",
    title: "Brahman",
    strength: 3,
    credits: 2,
    plus: 1,
    test: "Brahman starts at strength 3 and pays 2 credits for +1 strength (CR 3.9.5b)",
  },
  {
    id: "breach",
    title: "Breach",
    strength: 2,
    credits: 2,
    plus: 4,
    test: "Breach starts at strength 2 and pays 2 credits for +4 strength (CR 3.9.5b)",
  },
  {
    id: "cyber-cypher",
    title: "Cyber-Cypher",
    strength: 4,
    credits: 1,
    plus: 1,
    test: "Cyber-Cypher starts at strength 4 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "dagger",
    title: "Dagger",
    strength: 0,
    credits: 1,
    plus: 5,
    test: "Dagger starts at strength 0 and pays 1 credit for +5 strength (CR 3.9.5b)",
  },
  {
    id: "eater",
    title: "Eater",
    strength: 2,
    credits: 1,
    plus: 1,
    test: "Eater starts at strength 2 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "engolo",
    title: "Engolo",
    strength: 2,
    credits: 2,
    plus: 4,
    test: "Engolo starts at strength 2 and pays 2 credits for +4 strength (CR 3.9.5b)",
  },
  {
    id: "flashbang",
    title: "Flashbang",
    strength: 0,
    credits: 1,
    plus: 1,
    test: "Flashbang starts at strength 0 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "garrote",
    title: "Garrote",
    strength: 2,
    credits: 1,
    plus: 1,
    test: "Garrote starts at strength 2 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "gingerbread",
    title: "Gingerbread",
    strength: 2,
    credits: 2,
    plus: 3,
    test: "Gingerbread starts at strength 2 and pays 2 credits for +3 strength (CR 3.9.5b)",
  },
  {
    id: "god-of-war",
    title: "God of War",
    strength: 0,
    credits: 2,
    plus: 1,
    test: "God of War starts at strength 0 and pays 2 credits for +1 strength (CR 3.9.5b)",
  },
  {
    id: "golden",
    title: "Golden",
    strength: 1,
    credits: 2,
    plus: 4,
    test: "Golden starts at strength 1 and pays 2 credits for +4 strength (CR 3.9.5b)",
  },
  {
    id: "gs-sherman-m3",
    title: "GS Sherman M3",
    strength: 1,
    credits: 2,
    plus: 3,
    test: "GS Sherman M3 starts at strength 1 and pays 2 credits for +3 strength (CR 3.9.5b)",
  },
  {
    id: "gs-shrike-m2",
    title: "GS Shrike M2",
    strength: 1,
    credits: 2,
    plus: 3,
    test: "GS Shrike M2 starts at strength 1 and pays 2 credits for +3 strength (CR 3.9.5b)",
  },
  {
    id: "gs-striker-m1",
    title: "GS Striker M1",
    strength: 1,
    credits: 2,
    plus: 3,
    test: "GS Striker M1 starts at strength 1 and pays 2 credits for +3 strength (CR 3.9.5b)",
  },
  {
    id: "inversificator",
    title: "Inversificator",
    strength: 2,
    credits: 1,
    plus: 1,
    test: "Inversificator starts at strength 2 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "laamb",
    title: "Laamb",
    strength: 2,
    credits: 3,
    plus: 6,
    test: "Laamb starts at strength 2 and pays 3 credits for +6 strength (CR 3.9.5b)",
  },
  {
    id: "mass-driver",
    title: "Mass-Driver",
    strength: 1,
    credits: 1,
    plus: 1,
    test: "Mass-Driver starts at strength 1 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "mongoose",
    title: "Mongoose",
    strength: 1,
    credits: 2,
    plus: 2,
    test: "Mongoose starts at strength 1 and pays 2 credits for +2 strength (CR 3.9.5b)",
  },
  {
    id: "nanotk",
    title: "NanoTK",
    strength: 1,
    credits: 3,
    plus: 2,
    test: "NanoTK starts at strength 1 and pays 3 credits for +2 strength (CR 3.9.5b)",
  },
  {
    id: "omega",
    title: "Omega",
    strength: 1,
    credits: 1,
    plus: 1,
    test: "Omega starts at strength 1 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "overmind",
    title: "Overmind",
    strength: 0,
    credits: 1,
    plus: 1,
    test: "Overmind starts at strength 0 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "passport",
    title: "Passport",
    strength: 2,
    credits: 2,
    plus: 2,
    test: "Passport starts at strength 2 and pays 2 credits for +2 strength (CR 3.9.5b)",
  },
  {
    id: "peregrine",
    title: "Peregrine",
    strength: 2,
    credits: 3,
    plus: 3,
    test: "Peregrine starts at strength 2 and pays 3 credits for +3 strength (CR 3.9.5b)",
  },
  {
    id: "persephone",
    title: "Persephone",
    strength: 1,
    credits: 1,
    plus: 1,
    test: "Persephone starts at strength 1 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "puffer",
    title: "Puffer",
    strength: 2,
    credits: 2,
    plus: 1,
    test: "Puffer starts at strength 2 and pays 2 credits for +1 strength (CR 3.9.5b)",
  },
  {
    id: "sadyojata",
    title: "Sadyojata",
    strength: 2,
    credits: 1,
    plus: 1,
    test: "Sadyojata starts at strength 2 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "saker",
    title: "Saker",
    strength: 1,
    credits: 2,
    plus: 2,
    test: "Saker starts at strength 1 and pays 2 credits for +2 strength (CR 3.9.5b)",
  },
  {
    id: "sharpshooter",
    title: "Sharpshooter",
    strength: 3,
    credits: 1,
    plus: 2,
    test: "Sharpshooter starts at strength 3 and pays 1 credit for +2 strength (CR 3.9.5b)",
  },
  {
    id: "torch",
    title: "Torch",
    strength: 4,
    credits: 1,
    plus: 1,
    test: "Torch starts at strength 4 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
  {
    id: "vamadeva",
    title: "Vamadeva",
    strength: 2,
    credits: 1,
    plus: 1,
    test: "Vamadeva starts at strength 2 and pays 1 credit for +1 strength (CR 3.9.5b)",
  },
];

/** Printed pumps the card data cannot state yet (paired cut A). */
const DATA_DIFFERS = new Set<string>();

/** Pumps with a printed limit, tested on their own below. */
const OWN_TEST = new Set(["dagger", "cyber-cypher"]);

/**
 * Pump an installed breaker once in an encounter with a strength-99 ice and
 * report what it cost and what it gave. Strength 99 shows a pump is not an
 * interface ability (CR 3.9.5e): it is used below the ice's strength.
 */
function pumpOnce(defId: string) {
  const s = encountering("wall-of-static");
  s.cards["ice-1"]!.strength = 99;
  installRunner(s, defId, "brk-1");
  const before = effectiveBreakerStrength(s, "brk-1");
  const action = use("brk-1", `${defId}-pump`);
  const wasOffered = offered(s, action);
  const r = applyAction(s, action);
  if (!r.ok) return { wasOffered, ok: false as const, error: r.error };
  return {
    wasOffered,
    ok: true as const,
    paid: 10 - r.state.runner.credits,
    gained: effectiveBreakerStrength(r.state, "brk-1") - before,
  };
}

describe("every icebreaker starts at its printed strength and pumps as printed (CR 3.9.5b, 3.9.4a)", () => {
  for (const c of PRINTED) {
    if (DATA_DIFFERS.has(c.id) || OWN_TEST.has(c.id)) continue;
    it(c.test, () => {
      expect(c.test).toBe(
        `${c.title} starts at strength ${c.strength} and pays ${c.credits} credit${c.credits === 1 ? "" : "s"} for +${c.plus} strength (CR 3.9.5b)`,
      );
      const s = createInitialState();
      s.run = null;
      installRunner(s, c.id, "brk-1");
      expect(effectiveBreakerStrength(s, "brk-1")).toBe(c.strength);
      expect(pumpOnce(c.id)).toEqual({
        wasOffered: true,
        ok: true,
        paid: c.credits,
        gained: c.plus,
      });
    });
  }

  it("Breach starts at strength 2 and its built pump pays 2 credits (CR 3.9.4a, 3.9.5b)", () => {
    const s = createInitialState();
    installRunner(s, "breach", "brk-1");
    expect(effectiveBreakerStrength(s, "brk-1")).toBe(2);
    const r = pumpOnce("breach");
    expect(r.ok && r.paid).toBe(2);
  });

  it("Breach pays 2 credits for +4 strength as printed (CR 1.2.1, 3.9.5b)", () => {
    const r = pumpOnce("breach");
    expect(r.ok && r.gained).toBe(4);
  });

  it("the nine programs whose breaker declaration was below their printed strength start at the printed strength: Torch 4, Sharpshooter 3, Leviathan 3, Garrote 2, Passport 2, Gingerbread 2, Omega 1, Alpha 1, Cyber-Cypher 4 (CR 3.9.4a, 1.2.1)", () => {
    const want: Record<string, number> = {
      torch: 4,
      sharpshooter: 3,
      leviathan: 3,
      garrote: 2,
      passport: 2,
      gingerbread: 2,
      omega: 1,
      alpha: 1,
      "cyber-cypher": 4,
    };
    const s = createInitialState();
    s.run = null;
    const got: Record<string, number> = {};
    for (const id of Object.keys(want)) {
      installRunner(s, id, `brk-${id}`);
      got[id] = effectiveBreakerStrength(s, `brk-${id}`);
    }
    expect(got).toEqual(want);
  });

  it("the pump lasts for the encounter: Gingerbread's +3 is gone when the encounter ends (CR 3.9.5b)", () => {
    let s = encountering("wall-of-static");
    installRunner(s, "gingerbread", "gb-1");
    s = must(s, use("gb-1", "gingerbread-pump"));
    expect(effectiveBreakerStrength(s, "gb-1")).toBe(5);
    const boosts = s.lingeringEffects.filter(
      (e) =>
        !e.expired &&
        (e.payload as { breakerId?: string } | undefined)?.breakerId === "gb-1",
    );
    expect(boosts.map((e) => e.kind)).toEqual(["breaker_strength_encounter"]);
  });

  it("a breaker with its own pump ability keeps it and gets no second one: Corroder has one pump, Blackat keeps its stealth pump (CR 3.9.5b)", () => {
    const s = createInitialState();
    const corroder = installRunner(s, "corroder", "cor-1");
    const blackat = installRunner(s, "blackat", "bc-1");
    const pumps = (abs: typeof corroder.paidAbilities) =>
      (abs ?? [])
        .filter((a) => /"kind":"[a-z_]*pump/.test(JSON.stringify(a.effect)))
        .map((a) => a.id);
    expect(pumps(corroder.paidAbilities)).toEqual(["corroder-pump"]);
    expect(pumps(blackat.paidAbilities)).not.toContain("blackat-pump-1");
    expect(pumps(blackat.paidAbilities)).toHaveLength(1);
  });
});

describe("pumps with a printed limit are not wider than printed (CR 1.2.1)", () => {
  it("Dagger pays 1 credit for +5 strength only with credits from stealth cards (CR 1.2.1, 3.9.5b)", () => {
    // Ordinary credits in the pool cannot pay.
    let s = encountering("wall-of-static");
    installRunner(s, "dagger", "dag-1");
    expect(offered(s, use("dag-1", "dagger-pump"))).toBe(false);
    expect(applyAction(s, use("dag-1", "dagger-pump")).ok).toBe(false);
    expect(effectiveBreakerStrength(s, "dag-1")).toBe(0);
    expect(s.runner.credits).toBe(10);

    // Cloak (stealth) has a recurring credit that can pay.
    s = encountering("wall-of-static");
    installRunner(s, "dagger", "dag-1");
    const cloak = installRunner(s, "cloak", "cloak-1");
    cloak.recurringCredits = 1;
    expect(offered(s, use("dag-1", "dagger-pump"))).toBe(true);
    s = must(s, use("dag-1", "dagger-pump"));
    expect(effectiveBreakerStrength(s, "dag-1")).toBe(5);
    expect(s.runner.credits).toBe(10);
    expect(s.cards["cloak-1"]!.recurringCredits ?? 0).toBe(0);
  });

  it("Cyber-Cypher starts at strength 4 and pays 1 credit for +1 strength only during runs on its chosen server (CR 1.2.1, 3.9.5b)", () => {
    let s = encountering("wall-of-static");
    s.cards["ice-1"]!.strength = 99;
    const cc = installRunner(s, "cyber-cypher", "cc-1");
    expect(effectiveBreakerStrength(s, "cc-1")).toBe(4);

    cc.chosenServerId = "rd" as ServerId;
    expect(offered(s, use("cc-1", "cyber-cypher-pump"))).toBe(false);
    const refused = applyAction(s, use("cc-1", "cyber-cypher-pump"));
    expect(refused.ok).toBe(false);
    expect(s.runner.credits).toBe(10);

    cc.chosenServerId = "hq" as ServerId;
    expect(offered(s, use("cc-1", "cyber-cypher-pump"))).toBe(true);
    s = must(s, use("cc-1", "cyber-cypher-pump"));
    expect(effectiveBreakerStrength(s, "cc-1")).toBe(5);
    expect(s.runner.credits).toBe(9);
  });
});

describe("the card data's pump fields say what the card prints", () => {
  /**
   * For every icebreaker whose pump the engine builds from its fields, read
   * the printed "N[credit]: +M strength." line and compare. A new card whose
   * fields disagree with its print fails here. Breach's +4 was fixed in
   * PF-S3b's paired cards release.
   */
  it("every built pump costs and gives what the card prints (CR 1.2.1)", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const dir = join(root, "vendor/cards-data/runner");
    const differs: string[] = [];
    const built: string[] = [];
    for (const sub of readdirSync(dir)) {
      for (const f of readdirSync(join(dir, sub))) {
        if (!f.endsWith(".json")) continue;
        const def = JSON.parse(readFileSync(join(dir, sub, f), "utf8")) as {
          id: string;
        };
        let card;
        try {
          card = instantiateCard(def.id, "x", "runner:installed" as never);
        } catch {
          continue;
        }
        // Built pumps only: the card's own records do not have this id.
        if (getAbilityIds(def).includes(`${def.id}-pump`)) continue;
        const pump = (card.paidAbilities ?? []).find(
          (a) => a.id === `${def.id}-pump`,
        );
        if (!pump) continue;
        built.push(def.id);
        const printed = JSON.parse(
          readFileSync(join(root, "vendor/cards-data/printed", f), "utf8"),
        ) as { text?: string };
        const text = (printed.text ?? "").replace(/<[^>]+>/g, "");
        const m = /(\d+)\[credit\]:\s*\+(\d+) strength/.exec(text);
        const amount = (pump.effect as { action?: { amount?: number } }).action
          ?.amount;
        if (
          !m ||
          Number(m[1]) !== pump.cost?.credits ||
          Number(m[2]) !== amount
        ) {
          differs.push(def.id);
        }
      }
    }
    expect(built.sort()).toEqual(PRINTED.map((c) => c.id).sort());
    expect(differs).toEqual([...DATA_DIFFERS]);
  });
});

function getAbilityIds(def: unknown): string[] {
  const abilities = (def as { abilities?: Array<{ id?: string }> }).abilities;
  return (abilities ?? []).map((a) => a.id ?? "").filter(Boolean);
}

describe("a played run: a pumped breaker breaks ice it could not before (CR 3.9.5g, 3.9.5b)", () => {
  it("GS Striker M1 at strength 1 cannot break a strength-2 Enigma; after paying 2 credits for +3 strength it breaks both subroutines and the Runner passes the ice (CR 3.9.5g, 3.9.5b)", () => {
    let s = createInitialState();
    for (const card of Object.values(s.cards)) {
      if (card.side === "runner") card.rezzed = false;
    }
    const enigma = put(s, "enigma", "en-1", "server:hq:ice");
    enigma.rezzed = true;
    enigma.faceup = true;
    s.servers.hq.ice = ["en-1"];
    installRunner(s, "gs-striker-m1", "gs-1");
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    s.runner.credits = 10;
    s.priorityStack = [];

    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    // Approach, then encounter (CR 6.9.2, 6.9.3).
    for (let i = 0; i < 6 && s.run?.phase !== "encounter"; i++) {
      s = must(s, { type: "pass_window" });
    }
    expect(s.run?.encounter?.iceId).toBe("en-1");
    expect(effectiveBreakerStrength(s, "gs-1")).toBe(1);

    const breakFirst: Action = {
      type: "break_subroutine",
      breakerId: "gs-1",
      subIndex: 0,
    };
    expect(offered(s, breakFirst)).toBe(false);
    expect(applyAction(s, breakFirst).ok).toBe(false);

    expect(offered(s, use("gs-1", "gs-striker-m1-pump"))).toBe(true);
    s = must(s, use("gs-1", "gs-striker-m1-pump"));
    expect(effectiveBreakerStrength(s, "gs-1")).toBe(4);
    expect(s.runner.credits).toBe(8);

    expect(offered(s, breakFirst)).toBe(true);
    s = must(s, breakFirst);
    // "2[credit]: Break any number of code gate subroutines": the second
    // break in the same use is free.
    s = must(s, { type: "break_subroutine", breakerId: "gs-1", subIndex: 1 });
    expect(s.run!.encounter!.broken).toEqual([true, true]);
    expect(s.runner.credits).toBe(6);
    expect(s.runner.clicks).toBe(3);

    // Both players pass: the encounter ends with no subroutine resolved
    // (Enigma's first would cost a click), and the pump ends with it.
    for (let i = 0; i < 4 && s.run?.encounter; i++) {
      s = must(s, { type: "pass_window" });
    }
    expect(s.run?.encounter ?? null).toBeNull();
    expect(s.runner.clicks).toBe(3);
    expect(effectiveBreakerStrength(s, "gs-1")).toBe(1);
  });
});
