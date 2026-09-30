/**
 * Midnight Sun Vladisibirsk City Grid:
 * once/turn spend click + 2 advancements → place 2 on another advanceable
 * card in the same server root (place_advancements.sameServerRootAsSource).
 * Region-per-server limit already enforced on install.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  queryLegality,
  validateEffectTree,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.125.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function vladPlace(): ReturnType<typeof fx.placeAdvancements> {
  return fx.placeAdvancements(2, false, {
    sameServerRootAsSource: true,
    excludeSelf: true,
  });
}

describe("MS Vladisibirsk same-server place_advancements", () => {
  it("validates sameServerRootAsSource tree", () => {
    expect(validateEffectTree(vladPlace())).toBeNull();
  });

  it("places on another advanceable root card in the same server only", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const vlad = instantiateCard(
      "vladisibirsk-city-grid",
      "vlad-1",
      `server:${remote}:root`,
    );
    vlad.rezzed = true;
    vlad.advancementTokens = 2;
    s.cards["vlad-1"] = vlad;
    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-1",
      `server:${remote}:root`,
    );
    agenda.advancementTokens = 0;
    s.cards["ag-1"] = agenda;
    // Other server agenda should not receive tokens.
    const remote2 = "remote-2" as ServerId;
    s.servers[remote2] = { id: remote2, kind: "remote", ice: [], root: [] };
    const other = instantiateCard(
      "hostile-takeover",
      "ag-2",
      `server:${remote2}:root`,
    );
    other.advancementTokens = 0;
    s.cards["ag-2"] = other;
    s.servers[remote].root = ["vlad-1", "ag-1"];
    s.servers[remote2].root = ["ag-2"];

    const r = evalEffect({ state: s, sourceId: "vlad-1" }, vladPlace());
    expect(r.ok).toBe(true);
    expect(s.cards["ag-1"].advancementTokens).toBe(2);
    expect(s.cards["ag-2"].advancementTokens).toBe(0);
    expect(s.cards["vlad-1"].advancementTokens).toBe(2); // cost not paid here
  });

  it("paid ability spends 2 advancements and places 2 on sibling root", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const remote = "remote-1" as ServerId;
    s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
    const vlad = instantiateCard(
      "vladisibirsk-city-grid",
      "vlad-1",
      `server:${remote}:root`,
    );
    vlad.rezzed = true;
    vlad.faceup = true;
    vlad.advancementTokens = 2;
    vlad.unsupported = [];
    vlad.paidAbilities = [
      {
        id: "vlad-move",
        label: "Remove 2 advancements: place 2 on another root card",
        clickCost: 1,
        creditCost: 0,
        cost: { clicks: 1, advancementTokens: 2 },
        oncePerTurn: true,
        windows: ["corp_action_paw"],
        effect: vladPlace(),
      },
    ];
    s.cards["vlad-1"] = vlad;
    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-1",
      `server:${remote}:root`,
    );
    agenda.advancementTokens = 1;
    s.cards["ag-1"] = agenda;
    s.servers[remote].root = ["vlad-1", "ag-1"];
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";

    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.cardId === "vlad-1" &&
          e.action.abilityId === "vlad-move",
      ),
    ).toBe(true);
    s = must(s, {
      type: "use_paid_ability",
      cardId: "vlad-1",
      abilityId: "vlad-move",
    });
    expect(s.cards["vlad-1"].advancementTokens).toBe(0);
    expect(s.cards["ag-1"].advancementTokens).toBe(3);
    expect(s.corp.clicks).toBe(2);
  });

  it("Vladisibirsk card wiring is fully clear on pin v0.48.0", () => {
    const def = getCardDef("vladisibirsk-city-grid");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.paidAbilities?.[0]?.cost?.advancementTokens).toBe(2);
  });
});
