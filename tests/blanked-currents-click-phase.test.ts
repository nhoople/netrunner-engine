/**
 * Blanked sources drop Heinlein Grid click-loss credit wipe (CR 9.12.1d).
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
import { noteRunnerClickLose } from "../src/state/clickHooks.js";
import { suppressAbilities } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.18");
});

describe("blanked currents / click / phase (CR 9.12.1d)", () => {
  it("drops Heinlein Grid credit wipe while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const hein = instantiateCard("heinlein-grid", "hg-1", "server:hq:root");
    hein.rezzed = true;
    s.cards["hg-1"] = hein;
    s.servers.hq.root = ["hg-1"];
    s.runner.credits = 8;
    s.run = {
      id: "run-1",
      attackedServerId: "hq",
      phase: "approach_ice",
      position: 0,
      icePassed: 0,
      successful: false,
      breached: false,
    } as typeof s.run;

    noteRunnerClickLose(s);
    expect(s.runner.credits).toBe(0);

    s.runner.credits = 8;
    suppressAbilities(s, hein.id);
    expect(abilitiesSuppressed(s, "hg-1")).toBe(true);
    noteRunnerClickLose(s);
    expect(s.runner.credits).toBe(8);
  });
});
