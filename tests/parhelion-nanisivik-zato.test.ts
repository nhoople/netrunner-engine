/**
 * Parhelion v0.67: Nanisivik Grid + ZATO City Grid.
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
  assertCardsPinnedTag("v1.71.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function passUntil(
  state: ReturnType<typeof createInitialState>,
  pred: (s: ReturnType<typeof createInitialState>) => boolean,
  max = 24,
) {
  let s = state;
  for (let i = 0; i < max && !pred(s); i++) {
    if (s.pendingChoice) break;
    const r = applyAction(s, { type: "pass_window" });
    if (!r.ok) break;
    s = r.state;
  }
  return s;
}

describe("PH Nanisivik Grid", () => {
  it("wires onApproachServer may-flip-archives-ice IR", () => {
    const def = getCardDef("nanisivik-grid");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.subtypes).toContain("region");
    expect(validateEffectTree(def.onApproachServer!)).toBeNull();
    expect(
      validateEffectTree(fx.mayFlipArchivesIceResolveSubroutine()),
    ).toBeNull();
  });

  it("may_flip opens Corp choice; flip resolves Archives ice sub", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const ice = instantiateCard("ice-wall", "arch-ice", "corp:archives");
    ice.faceup = false;
    ice.subroutines = [
      {
        id: "net",
        text: "Do 1 net damage.",
        effect: fx.netDamage(1),
      },
    ];
    s.cards["arch-ice"] = ice;
    s.corp.discard = ["arch-ice"];
    const grid = instantiateCard("nanisivik-grid", "nan-1", "server:hq:root");
    grid.rezzed = true;
    s.cards["nan-1"] = grid;

    const r = evalEffect(
      { state: s, sourceId: "nan-1" },
      fx.mayFlipArchivesIceResolveSubroutine(),
    );
    expect(r.ok).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    const flip = s.pendingChoice!.options.find((o) => o.id.startsWith("flip:"));
    expect(flip).toBeTruthy();
    s = must(s, { type: "choose_option", optionId: flip!.id });
    expect(s.cards["arch-ice"]!.faceup).toBe(true);
    expect(s.log.some((l) => l.includes("Turn Ice Wall faceup"))).toBe(true);
  });

  it("fires on approach of the protected server during a run", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 1;
    s.runner.credits = 5;

    const ice = instantiateCard("ice-wall", "arch-ice", "corp:archives");
    ice.faceup = false;
    ice.subroutines = [
      {
        id: "etr",
        text: "End the run.",
        effect: fx.etr(),
      },
    ];
    s.cards["arch-ice"] = ice;
    s.corp.discard = ["arch-ice"];

    const grid = instantiateCard("nanisivik-grid", "nan-1", "server:hq:root");
    grid.rezzed = true;
    grid.faceup = true;
    s.cards["nan-1"] = grid;
    s.servers.hq.root = ["nan-1"];
    s.servers.hq.ice = [];

    s = must(s, { type: "basic_run", serverId: "hq" as ServerId });
    s = passUntil(s, (st) => !!st.pendingChoice || !!st.run?.endedTheRun);
    expect(s.pendingChoice?.chooser).toBe("corp");
    const flip = s.pendingChoice!.options.find((o) => o.id.startsWith("flip:"));
    s = must(s, { type: "choose_option", optionId: flip!.id });
    expect(s.cards["arch-ice"]!.faceup).toBe(true);
    expect(
      s.run?.endedTheRun === true ||
        s.run === null ||
        s.log.some((l) => /end the run/i.test(l)),
    ).toBe(true);
  });
});

describe("PH ZATO City Grid", () => {
  it("wires remoteOnly + iceGainsTrashToResolveChosenSubOnEncounter", () => {
    const def = getCardDef("zato-city-grid");
    expect(def.unsupported ?? []).toEqual([]);
    expect(def.remoteOnly).toBe(true);
    expect(def.iceGainsTrashToResolveChosenSubOnEncounter).toBe(true);
    expect(def.subtypes).toContain("region");
    expect(
      validateEffectTree(fx.trashEncounterIceResolveSubroutine(0)),
    ).toBeNull();
  });

  it("offers trash-to-resolve on encounter; trash resolves sub", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 1;
    s.runner.credits = 5;

    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["ice-1"],
      root: ["zato-1"],
    };
    const ice = instantiateCard("ice-wall", "ice-1", "server:remote-1:ice");
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
    const zato = instantiateCard(
      "zato-city-grid",
      "zato-1",
      "server:remote-1:root",
    );
    zato.rezzed = true;
    zato.faceup = true;
    s.cards["zato-1"] = zato;

    s = must(s, { type: "basic_run", serverId: "remote-1" as ServerId });
    s = passUntil(s, (st) => !!st.pendingChoice || !!st.run?.endedTheRun);
    expect(s.pendingChoice?.chooser).toBe("corp");
    const trashOpt = s.pendingChoice!.options.find((o) =>
      o.id.startsWith("zato:"),
    );
    expect(trashOpt).toBeTruthy();
    s = must(s, { type: "choose_option", optionId: trashOpt!.id });
    expect(s.corp.discard).toContain("ice-1");
    expect(s.servers["remote-1"]!.ice).not.toContain("ice-1");
    expect(
      s.run?.endedTheRun === true ||
        s.run === null ||
        s.log.some((l) => /Trash Ice Wall; resolve/i.test(l)),
    ).toBe(true);
  });

  it("rejects remoteOnly install when server is not remote", () => {
    let s = createInitialState();
    s = structuredClone(s);
    s.activeSide = "corp";
    s.timingKey = "corp.takeAction";
    s.corp.clicks = 1;
    s.corp.credits = 10;
    const zato = instantiateCard("zato-city-grid", "zato-hq", "corp:hq");
    s.cards["zato-hq"] = zato;
    s.corp.hand = ["zato-hq"];
    const r = applyAction(s, {
      type: "basic_install",
      cardId: "zato-hq",
      destination: { kind: "remote_root", serverId: "hq" as ServerId },
    });
    expect(r.ok).toBe(false);
  });
});
