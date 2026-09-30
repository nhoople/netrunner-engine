/**
 * Parhelion dynamic advancement-requirement reduction:
 * Freedom of Information (−1 / tag), Ontological Dependence (−1 / core damage),
 * Regulatory Capture (−1 / bad publicity, max 4 counted).
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  effectiveAdvancementRequirement,
  getCardDef,
  instantiateCard,
  queryLegality,
} from "../src/index.js";
import { canScoreAgenda } from "../src/state/scoring.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.127.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function installAgenda(
  s: ReturnType<typeof createInitialState>,
  defId: string,
  instanceId: string,
  tokens: number,
) {
  const remote = "remote-1" as ServerId;
  s.servers[remote] = { id: remote, kind: "remote", ice: [], root: [] };
  const agenda = instantiateCard(defId, instanceId, `server:${remote}:root`);
  agenda.advancementTokens = tokens;
  agenda.unsupported = [];
  s.cards[instanceId] = agenda;
  s.servers[remote].root = [instanceId];
  return agenda;
}

describe("PH Freedom of Information (−1 adv req per tag)", () => {
  it("effective requirement drops with tags; canScore when tokens meet it", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = installAgenda(s, "freedom-of-information", "foi-1", 2);
    agenda.advancementRequirement = 4;
    agenda.advancementRequirementReductionPerTag = 1;
    s.runner.tags = 0;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(4);
    expect(canScoreAgenda(s, agenda)).toBe(false);

    s.runner.tags = 2;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(2);
    expect(canScoreAgenda(s, agenda)).toBe(true);

    s.runner.tags = 10;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(0);
  });

  it("scores via host when tags reduce requirement", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = installAgenda(s, "freedom-of-information", "foi-1", 2);
    agenda.advancementRequirement = 4;
    agenda.advancementRequirementReductionPerTag = 1;
    s.runner.tags = 2;
    s.corp.clicks = 3;
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    const id = s.cards[s.corp.identityId];
    if (id) delete id.onAgendaScored;

    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) => e.action.type === "score_agenda" && e.action.cardId === "foi-1",
      ),
    ).toBe(true);
    s = must(s, { type: "score_agenda", cardId: "foi-1" });
    expect(s.corp.score).toContain("foi-1");
  });
});

describe("PH Ontological Dependence (−1 adv req per core damage)", () => {
  it("uses runner.brainDamage as the this-game core-damage counter", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = installAgenda(s, "ontological-dependence", "od-1", 2);
    agenda.advancementRequirement = 4;
    agenda.advancementRequirementReductionPerCoreDamageThisGame = 1;
    s.runner.brainDamage = 0;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(4);
    expect(canScoreAgenda(s, agenda)).toBe(false);

    s.runner.brainDamage = 2;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(2);
    expect(canScoreAgenda(s, agenda)).toBe(true);
  });
});

describe("PH Regulatory Capture (−1 adv req per BP, max 4)", () => {
  it("caps bad publicity counted at max", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const agenda = installAgenda(s, "regulatory-capture", "rc-1", 2);
    agenda.advancementRequirement = 6;
    agenda.advancementRequirementReductionPerBadPublicity = {
      per: 1,
      max: 4,
    };
    s.corp.badPublicity = 0;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(6);
    expect(canScoreAgenda(s, agenda)).toBe(false);

    s.corp.badPublicity = 4;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(2);
    expect(canScoreAgenda(s, agenda)).toBe(true);

    s.corp.badPublicity = 9;
    expect(effectiveAdvancementRequirement(s, agenda)).toBe(2);
  });
});

describe("PH adv-req reduction card wiring (pin v0.48.0)", () => {
  it("wires FoI / OD / RC with empty unsupported", () => {
    const foi = getCardDef("freedom-of-information");
    expect(foi.unsupported).toEqual([]);
    expect(foi.advancementRequirementReductionPerTag).toBe(1);
    expect(foi.advancementRequirement).toBe(4);
    expect(foi.agendaPoints).toBe(2);

    const od = getCardDef("ontological-dependence");
    expect(od.unsupported).toEqual([]);
    expect(od.advancementRequirementReductionPerCoreDamageThisGame).toBe(1);
    expect(od.advancementRequirement).toBe(4);

    const rc = getCardDef("regulatory-capture");
    expect(rc.unsupported).toEqual([]);
    expect(rc.advancementRequirementReductionPerBadPublicity).toEqual({
      per: 1,
      max: 4,
    });
    expect(rc.advancementRequirement).toBe(6);
  });
});
