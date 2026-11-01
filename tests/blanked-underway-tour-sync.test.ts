/**
 * Blanked sources do not apply Underway Grid / Guard bypass-expose locks,
 * Tour Guide ETR-per-asset, or SYNC remove-tag tax (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
} from "../src/index.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { basicRemoveTagCreditCost } from "../src/state/costs.js";
import { exposeLegalTargets } from "../src/state/expose.js";
import { syncAllTourGuideSubs } from "../src/effects/sansanUotPrimitives.js";
import type { GameState, ServerId } from "../src/index.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.16");
});

/** Mirror of graph iceBypassBlockedByServerUpgrade for unit checks. */
function bypassBlocked(state: GameState, iceId: string): boolean {
  const ice = state.cards[iceId];
  if (ice?.cannotBeBypassed && !abilitiesSuppressed(state, iceId)) return true;
  for (const server of Object.values(state.servers)) {
    if (!server.ice.includes(iceId)) continue;
    return [...server.root, ...server.ice].some((id) => {
      if (abilitiesSuppressed(state, id)) return false;
      const card = state.cards[id];
      return Boolean(card?.rezzed && card.iceCannotBeBypassedThisServer);
    });
  }
  return false;
}

describe("blanked Underway / Tour Guide / SYNC (CR 9.12.1d)", () => {
  it("drops Underway Grid bypass lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    const ug = instantiateCard("underway-grid", "ug-1", "server:hq:root");
    ug.rezzed = true;
    s.cards["ug-1"] = ug;
    s.servers.hq.root = ["ug-1"];

    expect(bypassBlocked(s, "iw-1")).toBe(true);
    suppressAbilities(s, ug.id);
    expect(bypassBlocked(s, "iw-1")).toBe(false);
  });

  it("drops Guard self-bypass lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const guard = instantiateCard("guard", "g-1", "server:hq:ice");
    guard.rezzed = true;
    s.cards["g-1"] = guard;
    s.servers.hq.ice = ["g-1"];

    expect(bypassBlocked(s, "g-1")).toBe(true);
    suppressAbilities(s, guard.id);
    expect(bypassBlocked(s, "g-1")).toBe(false);
  });

  it("drops Underway Grid expose lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    // unrezzed ice is an expose target
    s.cards["iw-1"] = ice;
    s.servers.hq.ice = ["iw-1"];
    const ug = instantiateCard("underway-grid", "ug-1", "server:hq:root");
    ug.rezzed = true;
    s.cards["ug-1"] = ug;
    s.servers.hq.root = ["ug-1"];

    expect(exposeLegalTargets(s)).not.toContain("iw-1");
    suppressAbilities(s, ug.id);
    expect(exposeLegalTargets(s)).toContain("iw-1");
  });

  it("drops Tour Guide ETR-per-asset while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const tg = instantiateCard("tour-guide", "tg-1", "server:hq:ice");
    tg.rezzed = true;
    s.cards["tg-1"] = tg;
    s.servers.hq.ice = ["tg-1"];
    const asset = instantiateCard("pad-campaign", "pc-1", "server:remote-1:root");
    asset.rezzed = true;
    s.cards["pc-1"] = asset;
    s.servers["remote-1"] = {
      id: "remote-1" as ServerId,
      kind: "remote",
      root: ["pc-1"],
      ice: [],
    };

    syncAllTourGuideSubs(s);
    const withAssets = (tg.subroutines ?? []).length;
    expect(withAssets).toBeGreaterThan((tg.baseSubroutines ?? []).length || 0);

    suppressAbilities(s, tg.id);
    syncAllTourGuideSubs(s);
    expect((tg.subroutines ?? []).length).toBe((tg.baseSubroutines ?? []).length);
  });

  it("drops SYNC remove-tag surcharge while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    // Replace Corp identity with SYNC (or fixture the field).
    const sync = instantiateCard(
      "sync-everything-everywhere",
      "sync-1",
      "corp:identity",
    );
    s.cards["sync-1"] = sync;
    s.corp.identityId = "sync-1";
    sync.identityFlipped = false;

    expect(basicRemoveTagCreditCost(s)).toBeGreaterThan(2);
    suppressAbilities(s, sync.id);
    expect(basicRemoveTagCreditCost(s)).toBe(2);
  });
});
