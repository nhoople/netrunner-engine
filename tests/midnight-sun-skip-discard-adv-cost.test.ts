/**
 * Midnight Sun cluster: Midnight-3 Arcology skip_discard_this_turn;
 * Drago Ivanov cost.advancementTokens; Azef Protocol scoreAdditionalCost /
 * must_trash_installed; Pravdivost onFirstSuccessfulRunThisTurn.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  fx,
  getCardDef,
  instantiateCard,
  queryLegality,
  validateEffectTree,
} from "../src/index.js";
import { canPayCost, payCost } from "../src/state/costs.js";
import type { Effect } from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v0.35.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function midnight3OnScore(): Effect {
  return fx.seq(
    fx.draw("corp", 3),
    fx.choose("corp", [
      {
        id: "skip-discard",
        label: "Skip discard step this turn",
        effect: fx.skipDiscardThisTurn(),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.gainCredits("corp", 0),
      },
    ]),
  );
}

function azefScoreCost(): Effect {
  return fx.mustTrashInstalled({ excludeSelf: true });
}

function pravdivostEffect(): Effect {
  return fx.choose("corp", [
    {
      id: "place-adv",
      label: "Place 1 advancement on an advanceable card",
      effect: fx.placeAdvancements(1),
    },
    {
      id: "decline",
      label: "Decline",
      effect: fx.gainCredits("corp", 0),
    },
  ]);
}

describe("MS skip_discard_this_turn (Midnight-3)", () => {
  it("validates skip_discard_this_turn + choose tree", () => {
    expect(validateEffectTree(midnight3OnScore())).toBeNull();
  });

  it("onScore may skip discard; discard_to_hand_size keeps oversize hand", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = instantiateCard(
      "midnight-3-arcology",
      "m3-1",
      "server:remote-1:root",
    );
    agenda.unsupported = [];
    agenda.onScore = midnight3OnScore();
    agenda.advancementTokens = agenda.advancementRequirement ?? 4;
    s.cards["m3-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["m3-1"],
    };
    s.corp.deck = ["d1", "d2", "d3", "d4", "d5"];
    for (const id of s.corp.deck) {
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:rd");
    }
    s.corp.hand = ["h1", "h2", "h3", "h4", "h5"];
    for (const id of s.corp.hand) {
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
    }
    s.corp.maxHandSize = 5;
    s.corp.clicks = 3;
    s.corp.credits = 10;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const id = s.cards[s.corp.identityId];
    if (id) delete id.onAgendaScored;

    s = must(s, { type: "score_agenda", cardId: "m3-1" });
    expect(s.corp.score).toContain("m3-1");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["skip-discard", "decline"]),
    );
    s = must(s, { type: "choose_option", optionId: "skip-discard" });
    expect(s.turn.skipDiscardThisTurn).toBe(true);
    expect(s.corp.hand.length).toBe(8);

    s.timingKey = "corp.discard";
    s = must(s, { type: "discard_to_hand_size" });
    expect(s.corp.hand.length).toBe(8);
    expect(s.turn.skipDiscardThisTurn).toBe(false);
    expect(s.log.some((l) => l.includes("skips discard"))).toBe(true);
  });

  it("without skip, discard trims to max hand size", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.corp.hand = ["h1", "h2", "h3", "h4", "h5", "h6", "h7"];
    for (const id of s.corp.hand) {
      s.cards[id] = instantiateCard("hedge-fund", id, "corp:hq");
    }
    s.corp.maxHandSize = 5;
    s.turn.skipDiscardThisTurn = false;
    s.activeSide = "corp";
    s.timingKey = "corp.discard";
    s = must(s, { type: "discard_to_hand_size" });
    expect(s.corp.hand.length).toBe(5);
  });
});

describe("MS cost.advancementTokens (Drago)", () => {
  it("canPayCost / payCost spend hosted advancements", () => {
    const s = createInitialState();
    const card = instantiateCard(
      "drago-ivanov",
      "drago-1",
      "server:remote-1:root",
    );
    card.advancementTokens = 3;
    s.cards["drago-1"] = card;
    expect(canPayCost(s, "corp", { advancementTokens: 2 }, card)).toBe(true);
    expect(canPayCost(s, "corp", { advancementTokens: 4 }, card)).toBe(false);
    payCost(s, "corp", { advancementTokens: 2 }, "test", card);
    expect(card.advancementTokens).toBe(1);
    expect(s.log.some((l) => l.includes("advancement"))).toBe(true);
  });

  it("paid ability spends 2 advancements and gives a tag", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const drago = instantiateCard(
      "drago-ivanov",
      "drago-1",
      `server:${remote}:root`,
    );
    drago.rezzed = true;
    drago.faceup = true;
    drago.unsupported = [];
    drago.advancementTokens = 2;
    drago.paidAbilities = [
      {
        id: "drago-tag",
        label: "Remove 2 advancements: give Runner 1 tag",
        clickCost: 1,
        creditCost: 0,
        cost: { clicks: 1, advancementTokens: 2 },
        windows: ["corp_action_paw"],
        effect: fx.giveTags(1),
      },
    ];
    s.cards["drago-1"] = drago;
    s.servers[remote].root = ["drago-1"];
    s.corp.clicks = 3;
    s.corp.credits = 5;
    s.runner.tags = 0;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";

    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.cardId === "drago-1" &&
          e.action.abilityId === "drago-tag",
      ),
    ).toBe(true);

    s = must(s, {
      type: "use_paid_ability",
      cardId: "drago-1",
      abilityId: "drago-tag",
    });
    expect(s.cards["drago-1"].advancementTokens).toBe(0);
    expect(s.runner.tags).toBe(1);
    expect(s.corp.clicks).toBe(2);
  });
});

describe("MS scoreAdditionalCost must_trash (Azef)", () => {
  it("validates must_trash_installed", () => {
    expect(validateEffectTree(azefScoreCost())).toBeNull();
  });

  it("requires trash of another installed card before scoring", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = instantiateCard(
      "azef-protocol",
      "azef-1",
      "server:remote-1:root",
    );
    agenda.unsupported = [];
    agenda.scoreAdditionalCost = azefScoreCost();
    agenda.onScore = fx.meatDamage(2);
    agenda.advancementTokens = agenda.advancementRequirement ?? 3;
    s.cards["azef-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["azef-1"],
    };
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    s.corp.clicks = 3;
    s.corp.credits = 10;
    s.runner.hand = ["rh1", "rh2", "rh3"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const id = s.cards[s.corp.identityId];
    if (id) delete id.onAgendaScored;

    s = must(s, { type: "score_agenda", cardId: "azef-1" });
    expect(s.corp.score).not.toContain("azef-1");
    expect(s.pendingScoreAgendaId).toBe("azef-1");
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual(["trash:ice-1"]);

    s = must(s, { type: "choose_option", optionId: "trash:ice-1" });
    expect(s.corp.score).toContain("azef-1");
    expect(s.pendingScoreAgendaId).toBeNull();
    expect(s.servers.hq.ice).not.toContain("ice-1");
    expect(s.corp.discard).toContain("ice-1");
    expect(s.runner.hand.length).toBeLessThan(3);
  });

  it("cannot score Azef with no other installed cards", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = instantiateCard(
      "azef-protocol",
      "azef-1",
      "server:remote-1:root",
    );
    agenda.scoreAdditionalCost = azefScoreCost();
    agenda.advancementTokens = 3;
    s.cards["azef-1"] = agenda;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["azef-1"],
    };
    s.servers.hq.ice = [];
    s.servers.rd.ice = [];
    s.servers.archives.ice = [];
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) => e.action.type === "score_agenda" && e.action.cardId === "azef-1",
      ),
    ).toBe(false);
  });
});

describe("MS onFirstSuccessfulRunThisTurn (Pravdivost)", () => {
  it("validates may-place choose tree", () => {
    expect(validateEffectTree(pravdivostEffect())).toBeNull();
  });

  it("fires once on first successful run; may place advancement", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const id = s.cards[s.corp.identityId];
    id.onFirstSuccessfulRunThisTurn = pravdivostEffect();
    id.unsupported = [];

    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const asset = instantiateCard(
      "pad-campaign",
      "adv-1",
      `server:${remote}:root`,
    );
    asset.canAdvance = true;
    asset.rezzed = true;
    asset.advancementTokens = 0;
    s.cards["adv-1"] = asset;
    s.servers[remote].root = ["adv-1"];

    s.servers.hq.ice = [];
    s.servers.hq.root = [];
    s.corp.hand = [];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    expect(s.turn.successfulRunThisTurn).toBe(true);
    expect(s.pendingChoice?.options.map((o) => o.id) ?? []).toEqual(
      expect.arrayContaining(["place-adv", "decline"]),
    );
    s = must(s, { type: "choose_option", optionId: "place-adv" });
    expect(s.cards["adv-1"].advancementTokens).toBe(1);
  });
});

describe("MS card wiring (v0.32.0+)", () => {
  it("Midnight-3 / Drago / Azef / Pravdivost are fully clear", () => {
    const m3 = getCardDef("midnight-3-arcology");
    expect(m3.unsupported ?? []).toEqual([]);
    expect(m3.onScore).toBeTruthy();

    const drago = getCardDef("drago-ivanov");
    expect(drago.unsupported ?? []).toEqual([]);
    expect(drago.paidAbilities?.[0]?.cost?.advancementTokens).toBe(2);

    const azef = getCardDef("azef-protocol");
    expect(azef.unsupported ?? []).toEqual([]);
    expect(azef.scoreAdditionalCost).toBeTruthy();

    const prav = getCardDef("pravdivost-consulting-political-solutions");
    expect(prav.unsupported ?? []).toEqual([]);
    expect(prav.onFirstSuccessfulRunThisTurn).toBeTruthy();
  });
});
