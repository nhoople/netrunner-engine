/**
 * Parhelion v0.68: Tsakhia "Bankhar" Gantulga.
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
  validateEffectTree,
} from "../src/index.js";
import type { ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.57.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}


describe("PH Tsakhia Bankhar Gantulga", () => {
  it("wires may_choose_server + firstEncounterSubsBecomeNetDamage", () => {
    const def = getCardDef("tsakhia-bankhar-gantulga");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.firstEncounterSubsBecomeNetDamage).toBe(1);
    expect(validateEffectTree(def.onTurnBegin!)).toBeNull();
    expect(validateEffectTree(fx.mayChooseServer())).toBeNull();
  });

  it("may_choose_server names HQ on the source", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const g = instantiateCard(
      "tsakhia-bankhar-gantulga",
      "gan-1",
      "runner:rig",
    );
    s.cards["gan-1"] = g;
    s.runner.rig = ["gan-1"];
    const r = evalEffect({ state: s, sourceId: "gan-1" }, fx.mayChooseServer());
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("runner");
    s = must(s, { type: "choose_option", optionId: "server:hq" });
    expect(s.cards["gan-1"]!.namedServerId).toBe("hq");
  });

  it("replaces first HQ encounter subs with net damage", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 1;
    s.runner.credits = 5;
    // Fill grip so net damage has cards to trash.
    for (let i = 0; i < 3; i++) {
      const id = `grip-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    const g = instantiateCard(
      "tsakhia-bankhar-gantulga",
      "gan-1",
      "runner:rig",
    );
    g.namedServerId = "hq";
    g.firstEncounterSubsBecomeNetDamage = 1;
    s.cards["gan-1"] = g;
    s.runner.rig = ["gan-1"];

    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    ice.rezzed = true;
    ice.faceup = true;
    ice.subroutines = [
      {
        id: "etr",
        text: "End the run.",
        effect: fx.etr(),
      },
    ];
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];

    const gripBefore = s.runner.hand.length;
    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    // Pass approach → encounter → pass encounter (let sub resolve).
    for (let i = 0; i < 16 && s.run; i++) {
      if (s.pendingChoice) {
        s = must(s, {
          type: "choose_option",
          optionId: s.pendingChoice.options[0]!.id,
        });
        continue;
      }
      const r = applyAction(s, { type: "pass_window" });
      if (!r.ok) break;
      s = r.state;
    }
    expect(
      s.log.some((l) => l.includes("as Do 1 net damage")),
    ).toBe(true);
    // Net damage trashed a grip card; ETR did NOT fire (replaced).
    expect(s.runner.hand.length).toBe(gripBefore - 1);
    expect(s.log.some((l) => /End the run \(CR/.test(l))).toBe(false);
  });
});
