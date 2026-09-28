/**
 * Elevation v1.01.0 kickoff: Clean Getaway / Rent Rioters / Anthill Excavation Contract.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
  createGame,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.12.0");
});

describe("Elevation v1.01.0 kickoff", () => {
  it("declares elevation supported with 82 cards", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["elevation"].status).toBe("supported");
    expect(pool.waves["elevation"].cards).toHaveLength(82);
    expect(pool.corpusOrder.at(-1)).toBe("elevation");
  });

  it("loads three clear kickoff cards", () => {
    const catalog = loadCardCatalog(true);
    for (const id of [
      "clean-getaway",
      "rent-rioters",
      "anthill-excavation-contract",
    ]) {
      const def = catalog.get(id)!;
      expect(def.unsupported ?? []).toEqual([]);
      expect(def.wave).toBe("elevation");
    }
  });

  it("Clean Getaway runs any server for 6¢ on success", () => {
    const def = getCardDef("clean-getaway");
    expect(def.runEvent).toEqual({
      servers: "any",
      onSuccessfulRun: fx.gainCredits("runner", 6),
    });
  });

  it("Rent Rioters is 3 clicks + trash for 9¢", () => {
    const def = getCardDef("rent-rioters");
    expect(def.paidAbilities).toHaveLength(1);
    const ab = def.paidAbilities![0]!;
    expect(ab.clickCost).toBe(3);
    expect(ab.cost).toEqual({ clicks: 3, trashSelf: true });
    expect(ab.effect).toEqual(fx.gainCredits("runner", 9));
  });

  it("Anthill Excavation loads 8¢ on rez and takes 4¢ + draw on turn begin", () => {
    const def = getCardDef("anthill-excavation-contract");
    expect(def.onRez).toEqual(
      fx.do({ kind: "place_hosted_credits", amount: 8 }),
    );
    expect(def.onTurnBegin).toEqual(
      fx.seq(
        fx.do({ kind: "take_hosted_credits", amount: 4 }),
        fx.draw("corp", 1),
      ),
    );

    const state = createGame({ seed: 1 });
    const asset = instantiateCard(
      "anthill-excavation-contract",
      "anthill1",
      "server:remote-1:root",
    );
    state.cards[asset.id] = asset;
    state.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [asset.id],
    };
    asset.rezzed = true;
    const place = evalEffect(
      { state, sourceId: asset.id },
      fx.do({ kind: "place_hosted_credits", amount: 8 }),
    );
    expect(place.ok).toBe(true);
    expect(asset.hostedCredits).toBe(8);
    const before = state.corp.credits;
    const take = evalEffect(
      { state, sourceId: asset.id },
      fx.do({ kind: "take_hosted_credits", amount: 4 }),
    );
    expect(take.ok).toBe(true);
    expect(state.corp.credits).toBe(before + 4);
    expect(asset.hostedCredits).toBe(4);
  });
});
