/**
 * A credit tally is one gain_credits (CR 9.12.2b, 9.12.2c).
 * A type search of R&D is one kind.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertPinnedTag,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

describe("credit tallies", () => {
  it("gains 2¢ per tag as one gain_credits", () => {
    const effect = {
      op: "do" as const,
      action: {
        kind: "gain_credits" as const,
        side: "corp" as const,
        amount: 0,
        tally: { count: "runner_tags" as const, per: 2, side: "corp" as const },
      },
    };
    expect(validateEffectTree(effect)).toBeNull();
    const s = structuredClone(createInitialState());
    s.runner.tags = 3;
    const before = s.corp.credits;
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      effect,
    );
    expect(r.ok).toBe(true);
    expect(s.corp.credits).toBe(before + 6);
    expect(s.log.some((l) => l.includes("gains 6¢"))).toBe(true);
  });

  it("loses 4¢ per advancement token as one lose_credits", () => {
    const s = structuredClone(createInitialState());
    const asset = instantiateCard(
      "reversed-accounts",
      "ra-1",
      "server:remote-1:root",
    );
    asset.advancementTokens = 2;
    s.cards["ra-1"] = asset;
    s.runner.credits = 20;
    const effect = {
      op: "do" as const,
      action: {
        kind: "lose_credits" as const,
        side: "runner" as const,
        amount: 0,
        tally: {
          count: "source_advancement_tokens" as const,
          per: 4,
          side: "runner" as const,
        },
      },
    };
    expect(validateEffectTree(effect)).toBeNull();
    const r = evalEffect({ state: s, sourceId: "ra-1" }, effect);
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(12);
    expect(s.log.some((l) => l.includes("loses 8¢"))).toBe(true);
  });

  it("does not lose when the tally is 0", () => {
    const s = structuredClone(createInitialState());
    const asset = instantiateCard(
      "reversed-accounts",
      "ra-1",
      "server:remote-1:root",
    );
    asset.advancementTokens = 0;
    s.cards["ra-1"] = asset;
    const before = s.runner.credits;
    evalEffect(
      { state: s, sourceId: "ra-1" },
      {
        op: "do",
        action: {
          kind: "lose_credits",
          side: "runner",
          amount: 0,
          tally: {
            count: "source_advancement_tokens",
            per: 4,
            side: "runner",
          },
        },
      },
    );
    expect(s.runner.credits).toBe(before);
    expect(s.log.some((l) => l.includes("loses"))).toBe(false);
  });

  it("does not gain when the tally is 0", () => {
    const s = structuredClone(createInitialState());
    s.runner.tags = 0;
    const before = s.corp.credits;
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      {
        op: "do",
        action: {
          kind: "gain_credits",
          side: "corp",
          amount: 0,
          tally: { count: "runner_tags", per: 2, side: "corp" },
        },
      },
    );
    expect(s.corp.credits).toBe(before);
    expect(s.log.some((l) => l.includes("gains"))).toBe(false);
  });
});

describe("damage, tag, and draw tallies", () => {
  it("deals 2 net damage plus 1 per advancement as one net_damage", () => {
    const s = structuredClone(createInitialState());
    const asset = instantiateCard("urtica-cipher", "u-1", "server:remote-1:root");
    asset.advancementTokens = 3;
    s.cards["u-1"] = asset;
    s.runner.hand = [];
    for (const id of ["g1", "g2", "g3", "g4", "g5"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const effect = {
      op: "do" as const,
      action: {
        kind: "net_damage" as const,
        amount: 0,
        tally: {
          count: "source_advancement_tokens" as const,
          per: 1,
          side: "source" as const,
          base: 2,
        },
      },
    };
    expect(validateEffectTree(effect)).toBeNull();
    const r = evalEffect({ state: s, sourceId: "u-1" }, effect);
    expect(r.ok).toBe(true);
    expect(s.runner.hand.length).toBe(0);
  });

  it("does not deal damage when the tally is 0", () => {
    const s = structuredClone(createInitialState());
    const asset = instantiateCard("gene-splicer", "g-1", "server:remote-1:root");
    asset.advancementTokens = 0;
    s.cards["g-1"] = asset;
    s.runner.hand = ["grip-1"];
    s.cards["grip-1"] = instantiateCard("sure-gamble", "grip-1", "runner:grip");
    evalEffect(
      { state: s, sourceId: "g-1" },
      {
        op: "do",
        action: {
          kind: "net_damage",
          amount: 0,
          tally: {
            count: "source_advancement_tokens",
            per: 1,
            side: "source",
          },
        },
      },
    );
    expect(s.runner.hand).toEqual(["grip-1"]);
    expect(s.log.some((l) => l.includes("damage"))).toBe(false);
  });

  it("gives 1 tag plus 1 per advancement", () => {
    const s = structuredClone(createInitialState());
    const asset = instantiateCard(
      "chekist-scion",
      "c-1",
      "server:remote-1:root",
    );
    asset.advancementTokens = 2;
    s.cards["c-1"] = asset;
    const r = evalEffect(
      { state: s, sourceId: "c-1" },
      {
        op: "do",
        action: {
          kind: "give_tags",
          amount: 0,
          tally: {
            count: "source_advancement_tokens",
            per: 1,
            side: "source",
            base: 1,
          },
        },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.runner.tags).toBe(3);
  });

  it("draws 1 card per click remaining as one draw", () => {
    const s = structuredClone(createInitialState());
    s.runner.clicks = 3;
    s.runner.deck = [];
    s.runner.hand = [];
    for (const id of ["d1", "d2", "d3"]) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
      s.runner.deck.push(id);
    }
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      {
        op: "do",
        action: {
          kind: "draw",
          side: "runner",
          amount: 0,
          tally: { count: "clicks_remaining", per: 1, side: "runner" },
        },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.runner.hand).toEqual(["d1", "d2", "d3"]);
    expect(s.log.filter((l) => l.includes("draws"))).toHaveLength(1);
  });

});

describe("unless costs", () => {
  it("validates end the run unless the runner takes a tag", () => {
    expect(
      validateEffectTree({
        op: "do",
        action: {
          kind: "unless",
          payer: "runner",
          cost: { op: "do", action: { kind: "give_tags", amount: 1 } },
          instruction: { op: "do", action: { kind: "end_the_run" } },
        },
      }),
    ).toBeNull();
  });
});

describe("search R&D by card type", () => {
  it("reveals the first ice, adds it to HQ, and reverses the rest", () => {
    const s = structuredClone(createInitialState());
    const ice = instantiateCard("ice-wall", "ice-1", "corp:rd");
    const op = instantiateCard("hedge-fund", "op-1", "corp:rd");
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:rd");
    s.cards["ice-1"] = ice;
    s.cards["op-1"] = op;
    s.cards["ag-1"] = agenda;
    s.corp.deck = ["ice-1", "op-1", "ag-1"];
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      {
        op: "do",
        action: { kind: "search_rd_type_to_hq", cardType: "ice" },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.corp.hand).toContain("ice-1");
    expect(s.cards["ice-1"]!.faceup).toBe(true);
    expect(s.corp.deck).toEqual(["ag-1", "op-1"]);
  });

  it("leaves R&D in place when ice is missing", () => {
    const s = structuredClone(createInitialState());
    const op = instantiateCard("hedge-fund", "op-1", "corp:rd");
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:rd");
    s.cards["op-1"] = op;
    s.cards["ag-1"] = agenda;
    s.corp.deck = ["op-1", "ag-1"];
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      {
        op: "do",
        action: { kind: "search_rd_type_to_hq", cardType: "ice" },
      },
    );
    expect(s.corp.deck).toEqual(["op-1", "ag-1"]);
  });

  it("reverses R&D when an asset search misses", () => {
    const effect = {
      op: "do" as const,
      action: {
        kind: "search_rd_type_to_hq" as const,
        cardType: "asset" as const,
        shuffleIfNone: true,
      },
    };
    expect(validateEffectTree(effect)).toBeNull();
    const s = structuredClone(createInitialState());
    const op = instantiateCard("hedge-fund", "op-1", "corp:rd");
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:rd");
    s.cards["op-1"] = op;
    s.cards["ag-1"] = agenda;
    s.corp.deck = ["op-1", "ag-1"];
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      effect,
    );
    expect(s.corp.deck).toEqual(["ag-1", "op-1"]);
  });

  it("names the agenda in the reveal log", () => {
    const s = structuredClone(createInitialState());
    const agenda = instantiateCard("hostile-takeover", "ag-1", "corp:rd");
    s.cards["ag-1"] = agenda;
    s.corp.deck = ["ag-1"];
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      {
        op: "do",
        action: { kind: "search_rd_type_to_hq", cardType: "agenda" },
      },
    );
    expect(
      s.log.some((l) => l.includes("reveal agenda Hostile Takeover")),
    ).toBe(true);
  });
});

describe("click, bad publicity, passed ice, and heap tallies", () => {
  it("gains 1 click per scored agenda as one gain_clicks", () => {
    const effect = {
      op: "do" as const,
      action: {
        kind: "gain_clicks" as const,
        side: "corp" as const,
        amount: 0,
        tally: { count: "runner_score" as const, per: 1, side: "corp" as const },
      },
    };
    expect(validateEffectTree(effect)).toBeNull();
    const s = structuredClone(createInitialState());
    for (const id of ["a1", "a2"]) {
      s.cards[id] = instantiateCard("hostile-takeover", id, "runner:score");
      s.runner.score.push(id);
    }
    const before = s.corp.clicks;
    const r = evalEffect({ state: s, sourceId: s.corp.identityId }, effect);
    expect(r.ok).toBe(true);
    expect(s.corp.clicks).toBe(before + 2);
    expect(s.log.some((l) => l.includes("gains 2 click"))).toBe(true);
  });

  it("does not gain clicks when the Runner has scored nothing", () => {
    const s = structuredClone(createInitialState());
    const before = s.corp.clicks;
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      {
        op: "do",
        action: {
          kind: "gain_clicks",
          side: "corp",
          amount: 0,
          tally: { count: "runner_score", per: 1, side: "corp" },
        },
      },
    );
    expect(s.corp.clicks).toBe(before);
    expect(s.log.some((l) => l.includes("click"))).toBe(false);
  });

  it("removes bad publicity equal to advancements, capped at what the Corp has", () => {
    const s = structuredClone(createInitialState());
    const asset = instantiateCard("expose", "ex-1", "server:remote-1:root");
    asset.advancementTokens = 3;
    s.cards["ex-1"] = asset;
    s.corp.badPublicity = 1;
    const r = evalEffect(
      { state: s, sourceId: "ex-1" },
      {
        op: "do",
        action: {
          kind: "remove_bad_publicity",
          amount: 0,
          tally: {
            count: "source_advancement_tokens",
            per: 1,
            side: "source",
          },
        },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.corp.badPublicity).toBe(0);
    expect(s.log.some((l) => l.includes("removes 1 bad publicity"))).toBe(true);
  });

  it("does not remove bad publicity when the source has no advancements", () => {
    const s = structuredClone(createInitialState());
    const asset = instantiateCard("expose", "ex-1", "server:remote-1:root");
    s.cards["ex-1"] = asset;
    s.corp.badPublicity = 2;
    evalEffect(
      { state: s, sourceId: "ex-1" },
      {
        op: "do",
        action: {
          kind: "remove_bad_publicity",
          amount: 0,
          tally: {
            count: "source_advancement_tokens",
            per: 1,
            side: "source",
          },
        },
      },
    );
    expect(s.corp.badPublicity).toBe(2);
    expect(s.log.some((l) => l.includes("bad publicity"))).toBe(false);
  });

  it("gains 6¢ plus 1¢ per passed ice as one gain_credits", () => {
    const s = structuredClone(createInitialState());
    s.run = {
      attackedServerId: "hq",
      phase: "movement",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      agendasStolenThisRun: 0,
      iceEncounteredCount: 0,
      bypassedIceIds: [],
      passedIceIds: ["ice-1", "ice-2"],
    };
    const before = s.runner.credits;
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      {
        op: "do",
        action: {
          kind: "gain_credits",
          side: "runner",
          amount: 0,
          tally: { count: "passed_ice", per: 1, side: "runner", base: 6 },
        },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(before + 8);
    expect(s.log.some((l) => l.includes("gains 8"))).toBe(true);
  });

  it("gains 1¢ per double in the heap, and nothing when there are none", () => {
    const effect = {
      op: "do" as const,
      action: {
        kind: "gain_credits" as const,
        side: "runner" as const,
        amount: 0,
        tally: {
          count: "runner_heap_subtype" as const,
          per: 1,
          side: "runner" as const,
          subtype: "double",
        },
      },
    };
    expect(validateEffectTree(effect)).toBeNull();
    const s = structuredClone(createInitialState());
    for (const id of ["d1", "d2"]) {
      const card = instantiateCard("sure-gamble", id, "runner:heap");
      card.subtypes = ["double"];
      s.cards[id] = card;
      s.runner.discard.push(id);
    }
    const before = s.runner.credits;
    evalEffect({ state: s, sourceId: s.runner.identityId }, effect);
    expect(s.runner.credits).toBe(before + 2);

    const empty = structuredClone(createInitialState());
    const emptyBefore = empty.runner.credits;
    evalEffect({ state: empty, sourceId: empty.runner.identityId }, effect);
    expect(empty.runner.credits).toBe(emptyBefore);
    expect(empty.log.some((l) => l.includes("gains"))).toBe(false);
  });

});

describe("Vicsek net damage and tags", () => {
  function grip(s: ReturnType<typeof createInitialState>, ids: string[]) {
    s.runner.hand = [];
    for (const id of ids) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
  }

  it("deals net damage then gives tags, each equal to the Runner's tags", () => {
    const effect = fx.netDamageAndTagsEqualRunnerTags();
    expect(validateEffectTree(effect)).toBeNull();
    const s = structuredClone(createInitialState());
    s.runner.tags = 2;
    grip(s, ["g1", "g2"]);
    const r = evalEffect({ state: s, sourceId: s.corp.identityId }, effect);
    expect(r.ok).toBe(true);
    expect(s.runner.hand).toEqual([]);
    expect(s.runner.tags).toBe(4);
    const damageAt = s.log.findIndex((l) => l.includes("net damage 2"));
    const tagsAt = s.log.findIndex((l) => l.includes("receives 2 tag"));
    expect(damageAt).toBeGreaterThanOrEqual(0);
    expect(tagsAt).toBeGreaterThan(damageAt);
  });

  it("does nothing when the Runner has no tags", () => {
    const s = structuredClone(createInitialState());
    s.runner.tags = 0;
    grip(s, ["g1"]);
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      fx.netDamageAndTagsEqualRunnerTags(),
    );
    expect(s.runner.hand).toEqual(["g1"]);
    expect(s.runner.tags).toBe(0);
    expect(s.log.some((l) => l.includes("damage") || l.includes("tag"))).toBe(
      false,
    );
  });

});

describe("remove every tag", () => {
  it("removes the Runner's tags as one remove_tags", () => {
    const effect = fx.removeAllTags();
    expect(validateEffectTree(effect)).toBeNull();
    const s = structuredClone(createInitialState());
    s.runner.tags = 4;
    const r = evalEffect({ state: s, sourceId: s.runner.identityId }, effect);
    expect(r.ok).toBe(true);
    expect(s.runner.tags).toBe(0);
    expect(s.log.some((l) => l.includes("Remove 4 tag"))).toBe(true);
  });

  it("does not remove tags when the Runner has none", () => {
    const s = structuredClone(createInitialState());
    s.runner.tags = 0;
    evalEffect(
      { state: s, sourceId: s.runner.identityId },
      fx.removeAllTags(),
    );
    expect(s.runner.tags).toBe(0);
    expect(s.log.some((l) => l.includes("Remove"))).toBe(false);
  });

  it("removes every tag and then gives 3", () => {
    const s = structuredClone(createInitialState());
    s.runner.tags = 2;
    evalEffect(
      { state: s, sourceId: s.corp.identityId },
      {
        op: "seq",
        effects: [
          fx.removeAllTags(),
          { op: "do", action: { kind: "give_tags", amount: 3 } },
        ],
      },
    );
    expect(s.runner.tags).toBe(3);
  });

});
