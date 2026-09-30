/**
 * Downfall v1.49.0 B-slice: Vulnerability Audit / Calvin B4L3Y /
 * Remastered Edition / Roughneck Repair Squad / The Artist.
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
  loadCardCatalog,
  loadCardPool,
  queryLegality,
  validateEffectTree,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";

const CLEAR = [
  "vulnerability-audit",
  "calvin-b4l3y",
  "remastered-edition",
  "roughneck-repair-squad",
  "the-artist",
] as const;

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.134.0");
});

function corpWithVulnerabilityAudit(): GameState {
  let s = createInitialState();
  s = structuredClone(s);
  const ag = instantiateCard(
    "vulnerability-audit",
    "va-1",
    "server:remote-1:root",
  );
  ag.advancementTokens = 4;
  s.cards["va-1"] = ag;
  s.servers["remote-1"] = {
    id: "remote-1",
    kind: "remote",
    ice: [],
    root: ["va-1"],
  };
  s.nextRemoteNumber = 2;
  s.activeSide = "corp";
  s.timingKey = "corp.actionPaw";
  s.corp.clicks = 3;
  return s;
}

describe("Downfall v1.49.0 B-slice", () => {
  it("declares downfall supported with at least 15 clears", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["downfall"].status).toBe("supported");
    expect(pool.waves["downfall"].cards).toHaveLength(65);
    let clear = 0;
    for (const id of pool.waves["downfall"].cards) {
      if ((getCardDef(id).unsupported ?? []).length === 0) clear++;
    }
    expect(clear).toBeGreaterThanOrEqual(15);
  });

  it("loads five new clear B-slice cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of CLEAR) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? [], id).toEqual([]);
      expect(def.wave).toBe("downfall");
    }
  });

  it("Vulnerability Audit cannot score if installed this turn", () => {
    const def = getCardDef("vulnerability-audit");
    expect(def.type).toBe("agenda");
    expect(def.advancementRequirement).toBe(4);
    expect(def.agendaPoints).toBe(3);
    expect(def.cannotScoreIfInstalledThisTurn).toBe(true);

    const s = corpWithVulnerabilityAudit();
    s.turn.installedThisTurn = ["va-1"];

    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "score_agenda" && e.action.cardId === "va-1",
      ),
    ).toBe(false);
    const blocked = applyAction(s, { type: "score_agenda", cardId: "va-1" });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toMatch(/installed this turn/i);

    // Same agenda is scorable once it is no longer "installed this turn".
    s.turn.installedThisTurn = [];
    expect(
      queryLegality(s).legal.some(
        (e) => e.action.type === "score_agenda" && e.action.cardId === "va-1",
      ),
    ).toBe(true);
    const ok = applyAction(s, { type: "score_agenda", cardId: "va-1" });
    expect(ok.ok).toBe(true);
  });

  it("Calvin B4L3Y is Nanoetching twin with draw 2", () => {
    const def = getCardDef("calvin-b4l3y");
    expect(def.paidAbilities).toHaveLength(1);
    const ab = def.paidAbilities![0]!;
    expect(ab.oncePerTurn).toBe(true);
    expect(ab.clickCost).toBe(1);
    expect(ab.windows).toContain("corp_action_paw");
    expect(ab.effect).toEqual(fx.draw("corp", 2));
    expect(validateEffectTree(ab.effect)).toBeNull();
    expect(def.onTrash).toEqual(
      fx.choose("corp", [
        {
          id: "draw",
          label: "Draw 2 cards",
          effect: fx.draw("corp", 2),
        },
        {
          id: "decline",
          label: "Decline",
          effect: fx.gainCredits("corp", 0),
        },
      ]),
    );
    expect(validateEffectTree(def.onTrash!)).toBeNull();
  });

  it("Remastered Edition places agenda counter on score and spends for advancements", () => {
    const def = getCardDef("remastered-edition");
    expect(def.onScore).toEqual(
      fx.do({ kind: "add_agenda_counter", amount: 1 }),
    );
    expect(validateEffectTree(def.onScore!)).toBeNull();
    expect(def.paidAbilities).toHaveLength(1);
    const ab = def.paidAbilities![0]!;
    expect(ab.cost).toEqual({ agendaCounters: 1 });
    expect(ab.windows).toContain("corp_action_paw");
    expect(ab.effect).toEqual(
      fx.do({ kind: "place_advancements", amount: 1 }),
    );
    expect(validateEffectTree(ab.effect)).toBeNull();
  });

  it("Roughneck Repair Squad gains 6¢ for 3 clicks and may remove BP", () => {
    const def = getCardDef("roughneck-repair-squad");
    expect(def.paidAbilities).toHaveLength(1);
    const ab = def.paidAbilities![0]!;
    expect(ab.clickCost).toBe(3);
    expect(ab.windows).toContain("corp_action_paw");
    expect(ab.effect).toEqual(
      fx.seq(
        fx.gainCredits("corp", 6),
        fx.choose("corp", [
          {
            id: "remove-bp",
            label: "Remove 1 bad publicity",
            effect: fx.do({ kind: "remove_bad_publicity", amount: 1 }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
        ]),
      ),
    );
    expect(validateEffectTree(ab.effect)).toBeNull();
  });

  it("The Artist has dual once-per-turn paid abilities", () => {
    const def = getCardDef("the-artist");
    expect(def.paidAbilities).toHaveLength(2);
    const [gain, install] = def.paidAbilities!;
    expect(gain!.oncePerTurn).toBe(true);
    expect(gain!.clickCost).toBe(1);
    expect(gain!.effect).toEqual(fx.gainCredits("runner", 2));
    expect(validateEffectTree(gain!.effect)).toBeNull();
    expect(install!.oncePerTurn).toBe(true);
    expect(install!.clickCost).toBe(1);
    expect(install!.effect).toEqual(
      fx.do({
        kind: "install_from_grip_discount",
        types: ["program", "hardware"],
        discount: 1,
      }),
    );
    expect(validateEffectTree(install!.effect)).toBeNull();
  });
});
