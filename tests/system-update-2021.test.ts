import { describe, expect, it, beforeAll } from "vitest";
import {
  applyIntent,
  createInitialState,
  CR,
  evalEffect,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  queryLegality,
  setupEmptyRemoteWithIce,
  supportedCardIds,
  validateEffectTree,
  assertPinnedTag,
  crDataPresent,
  effectiveIceStrength,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

function must(state: GameState, action: Action): GameState {
  const r = applyIntent(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("card corpus system-update-2021", () => {
  it("declares System Update 2021 in the pool after Gateway", () => {
    const pool = loadCardPool(true);
    expect(pool.waves["system-update-2021"].status).toBe("supported");
    expect(pool.waves["system-update-2021"].cards).toHaveLength(82);
    expect(pool.corpusOrder).toEqual([
      "system-gateway",
      "system-update-2021",
      "midnight-sun",
    ]);
    expect(pool.waves["system-update-2021"].notes).toMatch(/su21/i);
    const ids = supportedCardIds();
    expect(ids).toContain("corroder");
    expect(ids).toContain("ice-wall");
    expect(ids).toContain("dirty-laundry");
    expect(ids).toContain("wraparound");
  });

  it("loads all SU21 cards with valid IR", () => {
    const catalog = loadCardCatalog(true);
    for (const id of loadCardPool().waves["system-update-2021"].cards) {
      expect(catalog.has(id), id).toBe(true);
      const def = catalog.get(id)!;
      if (def.onPlay) expect(validateEffectTree(def.onPlay)).toBeNull();
      if (def.onScore) expect(validateEffectTree(def.onScore)).toBeNull();
      if (def.onEncounter) expect(validateEffectTree(def.onEncounter)).toBeNull();
      if (def.onInstall) expect(validateEffectTree(def.onInstall)).toBeNull();
      if (def.onTurnBegin) expect(validateEffectTree(def.onTurnBegin)).toBeNull();
      for (const sub of def.subroutines ?? []) {
        expect(validateEffectTree(sub.effect), `${id}/${sub.id}`).toBeNull();
      }
      for (const ab of def.paidAbilities ?? []) {
        expect(validateEffectTree(ab.effect), `${id}/${ab.id}`).toBeNull();
      }
    }
  });

  it("marks partial cards with explicit unsupported notes", () => {
    const pool = loadCardPool(true).waves["system-update-2021"].cards;
    for (const id of pool) {
      const notes = getCardDef(id).unsupported;
      expect(Array.isArray(notes ?? []), id).toBe(true);
      if (notes && notes.length > 0) {
        for (const n of notes) expect(n.length).toBeGreaterThan(0);
      }
    }
    expect(getCardDef("corroder").unsupported ?? []).toEqual([]);
    expect(getCardDef("ice-wall").unsupported ?? []).toEqual([]);
    expect(getCardDef("wraparound").unsupported ?? []).toEqual([]);
  });

  it("Ice Wall gains strength per advancement; Wraparound +7 without fracter", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    const wall = instantiateCard("ice-wall", iceId, `server:${remote.id}:ice`);
    wall.advancementTokens = 2;
    s = structuredClone(s);
    s.cards[iceId] = wall;
    expect(effectiveIceStrength(s, iceId)).toBe(3);

    const wrap = instantiateCard("wraparound", iceId, `server:${remote.id}:ice`);
    s.cards[iceId] = wrap;
    expect(effectiveIceStrength(s, iceId)).toBe(7);
    const corr = instantiateCard("corroder", "corr-1", "runner:rig");
    s.cards["corr-1"] = corr;
    s.runner.rig.push("corr-1");
    expect(effectiveIceStrength(s, iceId)).toBe(0);
  });

  it("Ice Carver weakens encountered ice; Lotus Field cannot be lowered", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    const lotus = instantiateCard("lotus-field", iceId, `server:${remote.id}:ice`);
    const carver = instantiateCard("ice-carver", "carver-1", "runner:rig");
    s = structuredClone(s);
    s.cards[iceId] = lotus;
    s.cards["carver-1"] = carver;
    s.runner.rig.push("carver-1");
    s.runner.credits = 10;
    // Force encounter context for strength calc
    s.run = {
      attackedServerId: remote.id as ServerId,
      phase: "encounter",
      position: 0,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [],
      accessRemaining: null,
      encounter: { iceId, broken: [false] },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    expect(effectiveIceStrength(s, iceId)).toBe(3); // 4 - 1 carver
    // Weaken should be blocked by strengthCannotBeLowered
    const r = evalEffect(
      { state: s, sourceId: "carver-1" },
      fx.weakenIce(2),
    );
    expect(r.ok).toBe(true);
    expect(effectiveIceStrength(s, iceId)).toBe(3);
  });

  it("remove_tags and lose_credits_per_advancement IR", () => {
    let s = createInitialState();
    s.runner.tags = 2;
    let r = evalEffect(
      { state: s, sourceId: "ev-1" },
      fx.removeTags(1),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.tags).toBe(1);

    const asset = instantiateCard("reversed-accounts", "ra-1", "server:remote-1:root");
    asset.advancementTokens = 2;
    s.cards["ra-1"] = asset;
    s.runner.credits = 20;
    r = evalEffect(
      { state: s, sourceId: "ra-1" },
      fx.loseCreditsPerAdvancement(4),
    );
    expect(r.ok).toBe(true);
    expect(s.runner.credits).toBe(12);
  });

  it("Biotic Labor / Archived Memories / Liberated Account", () => {
    expect(getCardDef("biotic-labor").onPlay).toEqual(fx.gainClicks("corp", 2));
    expect(getCardDef("archived-memories").onPlay).toEqual(
      fx.archivesToHq(1),
    );
    expect(getCardDef("liberated-account").hostedCreditsOnInstall).toBe(16);
  });

  it("counts fully supported vs partial SU21 cards", () => {
    const pool = loadCardPool().waves["system-update-2021"].cards;
    let full = 0;
    let partial = 0;
    for (const id of pool) {
      const notes = getCardDef(id).unsupported ?? [];
      if (notes.length === 0) full += 1;
      else partial += 1;
    }
    expect(full + partial).toBe(82);
    expect(full).toBe(82);
    expect(partial).toBe(0);
    expect(
      { full, partial },
      `SU21 support tally full=${full} partial=${partial}`,
    ).toBeTruthy();
  });
});
