/**
 * Blanked Apex / Vulnerability Audit / Gene Conditioning Shoppe drop their
 * continuous locks and genetics second-trigger (CR 9.12.1d).
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
import { installBlockReason } from "../src/state/staticFlags.js";
import { scoreAgendaAction } from "../src/actions/score.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("blanked steal/score/install locks (CR 9.12.1d)", () => {
  it("drops Apex non-virtual resource install lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const apex = instantiateCard(
      "apex-invasive-predator",
      "apex-1",
      "runner:identity",
    );
    s.cards["apex-1"] = apex;
    s.runner.identityId = "apex-1";
    const arm = instantiateCard("armitage-codebusting", "arm-1", "runner:grip");
    s.cards["arm-1"] = arm;
    s.runner.hand = ["arm-1"];

    expect(installBlockReason(s, arm)).toMatch(/cannot install non-virtual/i);

    apex.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "apex-1")).toBe(true);
    expect(installBlockReason(s, arm)).toBeNull();
  });

  it("drops Vulnerability Audit same-turn score lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const va = instantiateCard(
      "vulnerability-audit",
      "va-1",
      "server:remote-1:root",
    );
    va.advancementCounters = 4;
    s.cards["va-1"] = va;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      root: ["va-1"],
      ice: [],
    } as (typeof s.servers)["hq"];
    s.turn.installedThisTurn = ["va-1"];
    s.activeSide = "corp";
    s.corp.clicks = 1;
    // Corp action PAW is an (S) window.
    s.timingKey = "corp.actionPaw";

    const blocked = scoreAgendaAction(s, "va-1");
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/installed this turn/i);

    va.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "va-1")).toBe(true);
    const allowed = scoreAgendaAction(s, "va-1");
    expect(allowed.ok).toBe(true);
  });

  it("drops Gene Conditioning Shoppe second-trigger while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const gene = instantiateCard(
      "gene-conditioning-shoppe",
      "gcs-1",
      "runner:installed",
    );
    s.cards["gcs-1"] = gene;
    s.runner.installed = ["gcs-1"];

    let threshold = 1;
    for (const id of s.runner.installed) {
      if (abilitiesSuppressed(s, id)) continue;
      if (s.cards[id]?.geneticsAlsoTriggerSecondTime) threshold = 2;
    }
    expect(threshold).toBe(2);

    gene.abilitiesBlanked = true;
    expect(abilitiesSuppressed(s, "gcs-1")).toBe(true);
    threshold = 1;
    for (const id of s.runner.installed) {
      if (abilitiesSuppressed(s, id)) continue;
      if (s.cards[id]?.geneticsAlsoTriggerSecondTime) threshold = 2;
    }
    expect(threshold).toBe(1);
  });
});
