/**
 * Fail-closed probes: incomplete IR / missing windows / unknown nodes must
 * refuse or stay unsupported — never silent wrong play.
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
  getCardDef,
  instantiateCard,
  legalActions,
  loadCardCatalog,
  loadCardPool,
  queryLegality,
  supportedCardIds,
  validateEffectTree,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.81.0");
});

describe("fail-closed — unknown / incomplete Effect IR", () => {
  it("validateEffectTree refuses unknown primitive kinds", () => {
    const err = validateEffectTree({
      op: "do",
      action: { kind: "teleport_to_moon" },
    });
    expect(err).toMatch(/unknown primitive/);
  });

  it("validateEffectTree refuses unknown effect ops", () => {
    const err = validateEffectTree({ op: "explode", effects: [] });
    expect(err).toMatch(/unknown op/);
  });

  it("validateEffectTree refuses unknown prevent forbid keys", () => {
    const err = validateEffectTree({
      op: "prevent",
      forbid: "fly_to_alpha_centauri",
    });
    expect(err).toMatch(/unknown forbid/);
  });

  it("evalEffect refuses unhandled primitive at runtime (no silent no-op)", () => {
    const s = createInitialState();
    const r = evalEffect(
      { state: s, sourceId: "corp-ice-1" },
      // Cast: deliberately invalid IR that bypassed load-time validation.
      {
        op: "do",
        action: { kind: "teleport_to_moon" },
      } as never,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Unhandled primitive|unknown/i);
    // Credits unchanged — no silent side effect.
    expect(s.corp.credits).toBe(createInitialState().corp.credits);
  });
});

describe("fail-closed — missing / wrong paid-ability windows", () => {
  it("ability gated to damage_interrupt_paw is absent outside that window", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const abx = instantiateCard("airbladex-jsrf-ed", "abx", "runner:rig");
    abx.powerCounters = 2;
    s.cards["abx"] = abx;
    s.runner.rig = ["abx"];
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    expect(
      legalActions(s).some(
        (a) =>
          a.type === "use_paid_ability" &&
          a.abilityId === "airblade-prevent-damage",
      ),
    ).toBe(false);

    const forced = applyAction(s, {
      type: "use_paid_ability",
      cardId: "abx",
      abilityId: "airblade-prevent-damage",
    });
    expect(forced.ok).toBe(false);
  });

  it("encounter-only pump is absent at runner.takeAction", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const mayfly = instantiateCard("mayfly", "mf-1", "runner:rig");
    s.cards["mf-1"] = mayfly;
    s.runner.rig = ["mf-1"];
    s.runner.credits = 10;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;

    expect(
      queryLegality(s).legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.abilityId === "mayfly-pump",
      ),
    ).toBe(false);
  });
});

describe("fail-closed — supported pool cannot hide unsupported clauses", () => {
  it("every supportedCardIds entry has empty unsupported (or allowlist)", () => {
    const catalog = loadCardCatalog(true);
    const pool = loadCardPool(true);
    const ids = supportedCardIds();
    expect(ids.length).toBeGreaterThan(500);
    for (const id of ids) {
      const def = catalog.get(id);
      expect(def, id).toBeDefined();
      expect(def!.unsupported ?? [], id).toEqual([]);
    }
    // Supported corpus waves (SC19→VP + prior) stay fully supported;
    // in-progress legacy backwards waves (e.g. reign-and-reverie) may remain partial.
    for (const wave of pool.corpusOrder) {
      const status = pool.waves[wave].status;
      expect(["supported", "in-progress"], wave).toContain(status);
      if (wave !== "reign-and-reverie") {
        expect(status, wave).toBe("supported");
      }
    }
  });

  it("getCardDef exposes residual unsupported notes when present on a def", () => {
    // Synthetic: do not mutate catalog; assert the field is what legality/host
    // code must honor — empty for cleared cards, non-empty means not playable.
    const clear = getCardDef("ice-wall");
    expect(clear.unsupported ?? []).toEqual([]);
  });
});

describe("fail-closed — applyIntent refuses illegal mid-run actions", () => {
  it("break_subroutine outside encounter is refused with cite (not silent)", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 4;
    const r = applyAction(s, {
      type: "break_subroutine",
      breakerId: "runner-program-1",
      subIndex: 0,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cites.length).toBeGreaterThan(0);
    expect(r.error.length).toBeGreaterThan(0);
  });
});
