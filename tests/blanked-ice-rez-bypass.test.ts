/**
 * Blanked ice drops on-bypass pending marks (CR 9.12.1d).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  occurCheckpoint,
} from "../src/index.js";
import { CR } from "../src/timing/labels.js";
import { abilitiesSuppressed } from "../src/state/abilities.js";
import { fireOnBypassTriggers } from "../src/state/iceRezHooks.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.14");
});

describe("blanked ice rez / bypass (CR 9.12.1d)", () => {
  it("drops Lethe on-bypass pending while blanked", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const lethe = instantiateCard("lethe", "lethe-1", "server:hq:ice");
    lethe.rezzed = true;
    s.cards["lethe-1"] = lethe;
    s.servers.hq.ice = ["lethe-1"];

    fireOnBypassTriggers(s, "lethe-1");
    occurCheckpoint(
      s,
      "instruction",
      "bypass",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(
      s.log.some(
        (line) => line.includes("Lethe") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    s = createInitialState();
    s = structuredClone(s);
    const lethe2 = instantiateCard("lethe", "lethe-2", "server:hq:ice");
    lethe2.rezzed = true;
    lethe2.abilitiesBlanked = true;
    s.cards["lethe-2"] = lethe2;
    s.servers.hq.ice = ["lethe-2"];
    expect(abilitiesSuppressed(s, "lethe-2")).toBe(true);
    fireOnBypassTriggers(s, "lethe-2");
    occurCheckpoint(
      s,
      "instruction",
      "bypass blanked",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(
      s.log.some(
        (line) => line.includes("Lethe") && line.includes("becomes pending"),
      ),
    ).toBe(false);
  });
});
