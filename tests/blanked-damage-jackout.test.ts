/**
 * Blanked sources do not apply Chronos / Ribs / Ancestral Imager / DBS /
 * current-event locks (CR 9.12.1d).
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
import {
  ancestralImagerJackOutDamage,
  dailyBusinessShowSource,
} from "../src/actions/run.js";
import {
  dealDamage,
  titaniumRibsChoosesGripTrash,
} from "../src/state/damage.js";
import { runnerCannotPlayCurrentEvents } from "../src/state/currents.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

describe("blanked damage / jack-out / DBS (CR 9.12.1d)", () => {
  it("drops Chronos first-net-damage choice while blanked", () => {
    const board = (blanked: boolean) => {
      const s = structuredClone(createInitialState());
      const chronos = instantiateCard(
        "chronos-protocol-selective-mind-mapping",
        s.corp.identityId,
        "corp:identity",
      );
      if (blanked) suppressAbilities(s, chronos.id);
      s.cards[s.corp.identityId] = chronos;
      for (const id of ["r1", "r2"] as const) {
        s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      }
      s.runner.hand = ["r1", "r2"];
      dealDamage(s, "net", 2, s.corp.identityId);
      return s;
    };
    expect(board(false).pendingChoice?.sourceId).toBeTruthy();
    expect(board(true).pendingChoice).toBeNull();
  });

  it("drops Titanium Ribs grip-choice while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ribs = instantiateCard("titanium-ribs", "tr-1", "runner:installed");
    s.cards["tr-1"] = ribs;
    s.runner.installed = ["tr-1"];

    expect(titaniumRibsChoosesGripTrash(s)).toBe(true);
    suppressAbilities(s, ribs.id);
    expect(titaniumRibsChoosesGripTrash(s)).toBe(false);
  });

  it("drops Ancestral Imager jack-out net damage while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ai = instantiateCard("ancestral-imager", "ai-1", "corp:score-area");
    s.cards["ai-1"] = ai;
    s.corp.scoreArea = ["ai-1"];

    expect(ancestralImagerJackOutDamage(s).length).toBeGreaterThan(0);
    suppressAbilities(s, ai.id);
    expect(ancestralImagerJackOutDamage(s)).toEqual([]);
  });

  it("drops Daily Business Show while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const dbs = instantiateCard("daily-business-show", "dbs-1", "server:hq:root");
    dbs.rezzed = true;
    s.cards["dbs-1"] = dbs;
    s.servers.hq.root = ["dbs-1"];

    expect(dailyBusinessShowSource(s)).toBe("dbs-1");
    suppressAbilities(s, dbs.id);
    expect(dailyBusinessShowSource(s)).toBeNull();
  });

  it("drops TGTBT-class current-event lock while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    // Fixture continuous field on a rezzed root card.
    const lock = instantiateCard("pad-campaign", "lock-1", "server:hq:root");
    lock.rezzed = true;
    lock.runnerCannotPlayCurrentEvents = true;
    s.cards["lock-1"] = lock;
    s.servers.hq.root = ["lock-1"];

    expect(runnerCannotPlayCurrentEvents(s)).toBe(true);
    suppressAbilities(s, lock.id);
    expect(runnerCannotPlayCurrentEvents(s)).toBe(false);
  });

  it("drops Defective Brainchips first-core bump while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const chips = instantiateCard(
      "defective-brainchips",
      "dbc-1",
      "corp:play-area",
    );
    chips.increaseFirstCoreDamagePerTurn = 2;
    s.cards["dbc-1"] = chips;
    s.corp.playArea = ["dbc-1"];
    s.runner.coreDamage = 0;
    s.runner.hand = [];

    dealDamage(s, "core", 1, "dbc-1");
    expect(s.runner.coreDamage).toBe(3);

    const blanked = structuredClone(createInitialState());
    const chips2 = instantiateCard(
      "defective-brainchips",
      "dbc-1",
      "corp:play-area",
    );
    chips2.increaseFirstCoreDamagePerTurn = 2;
    suppressAbilities(blanked, chips2.id);
    blanked.cards["dbc-1"] = chips2;
    blanked.corp.playArea = ["dbc-1"];
    blanked.runner.coreDamage = 0;
    blanked.runner.hand = [];
    dealDamage(blanked, "core", 1, "dbc-1");
    expect(blanked.runner.coreDamage).toBe(1);
  });
});
