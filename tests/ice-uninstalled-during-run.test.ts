/**
 * Ice that leaves play during a run (CR 6.2.4, 6.2.6, 6.2.7, 8.5.10).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
} from "../src/index.js";
import {
  maybeTrashHostsAtStrengthLte,
  trashCorpCardToArchives,
} from "../src/effects/corpTrash.js";
import { iceAtRunnerPosition } from "../src/state/runPosition.js";
import { removeCardFromCurrentZone } from "../src/state/scoring.js";
import type { Action, GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.23");
});

function must(s: GameState, action: Action): GameState {
  const r = applyAction(s, action);
  if (!r.ok) throw new Error(`${action.type}: ${r.error}`);
  return r.state;
}

const pass = (s: GameState): GameState => must(s, { type: "pass_window" });

/** HQ protected by Ice Wall (outermost), Enigma, Ice Wall (innermost). */
function runOnHq(rezzed: { a?: boolean; b?: boolean; c?: boolean } = {}): GameState {
  const s = createInitialState();
  for (const [id, def] of [
    ["a", "ice-wall"],
    ["b", "enigma"],
    ["c", "ice-wall"],
  ] as const) {
    const ice = instantiateCard(def, id, "server:hq:ice");
    const up = rezzed[id] ?? true;
    ice.rezzed = up;
    ice.faceup = up;
    s.cards[id] = ice;
  }
  s.servers["hq"]!.ice = ["a", "b", "c"];
  s.runner.credits = 20;
  s.runner.clicks = 4;
  s.corp.credits = 20;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  return must(s, { type: "basic_run", serverId: "hq" });
}

function encountering(s: GameState, iceId: string): GameState {
  let t = s;
  for (let i = 0; i < 12 && t.run?.encounter?.iceId !== iceId; i += 1) t = pass(t);
  expect(t.run?.encounter?.iceId).toBe(iceId);
  expect(t.timingKey).toBe("run.encounterPaw");
  return t;
}

const logged = (s: GameState): string => s.log.join("\n");

describe("ice uninstalled while it is encountered (CR 8.5.10, 6.2.7c)", () => {
  it("ends the encounter once the window is completed; no subroutine resolves", () => {
    const s = encountering(runOnHq(), "a");
    trashCorpCardToArchives(s, "a", "runner");
    // The open paid ability window is completed first.
    expect(s.timingKey).toBe("run.encounterPaw");
    expect(s.run?.encounter?.iceUninstalled).toBe(true);
    expect(iceAtRunnerPosition(s)).toBeNull();
    const t = pass(s);
    expect(t.run).toBeTruthy();
    expect(t.run?.endedTheRun ?? false).toBe(false);
    expect(logged(t)).not.toContain('Resolve subroutine "End the run."');
    expect(logged(t)).toContain("8.5.10");
    // The Runner passes the position, not a piece of ice.
    // The Runner may then jack out (CR 6.9.4c).
    expect(t.run?.phase).toBe("movement");
    expect(t.timingKey).toBe("run.jackOutWindow");
    expect(t.run?.passedIceIds ?? []).toEqual([]);
    expect(t.run?.encounter).toBeNull();
  });

  it("the run continues with an approach of the next ice inward", () => {
    let s = encountering(runOnHq(), "a");
    trashCorpCardToArchives(s, "a", "runner");
    s = pass(s);
    expect(s.timingKey).toBe("run.jackOutWindow");
    s = must(s, { type: "continue_run" });
    for (let i = 0; i < 4 && s.timingKey !== "run.approachPaw"; i += 1) s = pass(s);
    expect(s.timingKey).toBe("run.approachPaw");
    expect(s.run?.positionVacated ?? false).toBe(false);
    expect(iceAtRunnerPosition(s)).toBe("b");
    expect(logged(s)).toContain("Approach ice Enigma");
  });

  it("the innermost ice leaving sends the Runner on to the server", () => {
    let s = encountering(runOnHq(), "a");
    // Reach the innermost ice by breaking nothing on a server of one ice.
    s.servers["hq"]!.ice = ["a"];
    s.cards["b"]!.zone = "corp:archives";
    s.cards["c"]!.zone = "corp:archives";
    trashCorpCardToArchives(s, "a", "runner");
    s = pass(s);
    expect(s.run?.passedAllIce).toBe(true);
    s = must(s, { type: "continue_run" });
    expect(s.run?.position ?? null).toBeNull();
    expect(logged(s)).not.toContain("Approach ice Enigma");
  });

  it("Parasite trashing the encountered ice ends the encounter", () => {
    const s = encountering(runOnHq(), "a");
    const parasite = instantiateCard("parasite", "par", "runner:installed");
    parasite.hostId = "a";
    parasite.virusCounters = 1;
    s.cards["par"] = parasite;
    s.runner.installed = ["par"];
    s.cards["a"]!.hostedCardIds = ["par"];
    maybeTrashHostsAtStrengthLte(s);
    expect(s.cards["a"]?.zone).toBe("corp:archives");
    const t = pass(s);
    expect(t.timingKey).toBe("run.jackOutWindow");
    expect(t.run?.endedTheRun ?? false).toBe(false);
  });

  it("ice whose subroutine trashes it stops resolving subroutines", () => {
    const s = encountering(runOnHq({ a: false }), "b");
    // Enigma's first subroutine is replaced by one that trashes Enigma.
    s.cards["b"]!.subroutines![0]!.effect = fx.do({ kind: "trash_self" });
    const t = pass(s);
    expect(t.cards["b"]?.zone).toBe("corp:archives");
    expect(t.run?.endedTheRun ?? false).toBe(false);
    expect(logged(t)).not.toContain('Resolve subroutine "End the run."');
    expect(t.timingKey).toBe("run.jackOutWindow");
    expect(t.run?.passedIceIds).toEqual(["a"]);
  });
});

describe("ice uninstalled while it is approached (CR 8.5.10, 6.2.7a)", () => {
  it("ends the approach once the window is completed; the Runner does not encounter the next ice unapproached", () => {
    const s = runOnHq();
    expect(s.timingKey).toBe("run.approachPaw");
    trashCorpCardToArchives(s, "a", "runner");
    expect(s.timingKey).toBe("run.approachPaw");
    expect(s.run?.approachedIceUninstalled).toBe(true);
    let t = pass(s);
    expect(t.timingKey).toBe("run.jackOutWindow");
    expect(t.run?.encounter ?? null).toBeNull();
    expect(t.run?.passedIceIds ?? []).toEqual([]);
    expect(logged(t)).toContain("6.2.7a");
    t = must(t, { type: "continue_run" });
    for (let i = 0; i < 4 && t.timingKey !== "run.approachPaw"; i += 1) t = pass(t);
    expect(iceAtRunnerPosition(t)).toBe("b");
    expect(logged(t)).toContain("Approach ice Enigma");
  });

  it("the Corp cannot rez the next ice inward as the approached ice", () => {
    const s = runOnHq({ b: false });
    trashCorpCardToArchives(s, "a", "runner");
    const rez = applyAction(s, { type: "rez_ice", cardId: "b" });
    expect(rez.ok).toBe(false);
  });

  it("ice returned to HQ is uninstalled too", () => {
    const s = runOnHq();
    removeCardFromCurrentZone(s, "a");
    s.corp.hand.push("a");
    s.cards["a"]!.zone = "corp:hq";
    // A card returned to HQ is a new object, not rezzed (CR 1.12.1, 8.1.1).
    s.cards["a"]!.rezzed = false;
    expect(s.run?.approachedIceUninstalled).toBe(true);
    expect(pass(s).timingKey).toBe("run.jackOutWindow");
  });
});

describe("the Runner's position is an element, not an index (CR 6.2.4, 6.2.6)", () => {
  it("ice outward of the Runner leaving does not move them", () => {
    const s = encountering(runOnHq({ a: false }), "b");
    expect(s.run?.position).toBe(1);
    trashCorpCardToArchives(s, "a", "corp");
    expect(s.servers["hq"]!.ice).toEqual(["b", "c"]);
    expect(iceAtRunnerPosition(s)).toBe("b");
    expect(s.run?.encounter?.iceUninstalled ?? false).toBe(false);
  });

  it("ice inward of the Runner leaving changes what they will approach (CR 6.2.6b)", () => {
    const s = encountering(runOnHq({ a: false }), "b");
    trashCorpCardToArchives(s, "c", "corp");
    expect(iceAtRunnerPosition(s)).toBe("b");
    expect(s.run?.positionVacated ?? false).toBe(false);
  });

  it("the outermost ice leaving in the Initiation Phase leaves the step unchanged (CR 6.2.7e)", () => {
    const s = createInitialState();
    for (const [id, def] of [
      ["a", "ice-wall"],
      ["b", "enigma"],
    ] as const) {
      const ice = instantiateCard(def, id, "server:hq:ice");
      ice.rezzed = true;
      ice.faceup = true;
      s.cards[id] = ice;
    }
    s.servers["hq"]!.ice = ["a", "b"];
    s.run = {
      ...runOnHq().run!,
      phase: "initiation",
      position: 0,
      encounter: null,
    };
    s.activeSide = "runner";
    trashCorpCardToArchives(s, "a", "runner");
    expect(s.run.positionVacated).toBe(true);
    expect(s.run.approachedIceUninstalled ?? false).toBe(false);
    expect(iceAtRunnerPosition(s)).toBeNull();
    // Nothing more outward exists, so the next ice inward keeps index 0.
    expect(s.servers["hq"]!.ice[s.run.position!]).toBe("b");
  });

  it("a second removal inward of an emptied position leaves it emptied", () => {
    const s = encountering(runOnHq(), "a");
    trashCorpCardToArchives(s, "a", "runner");
    trashCorpCardToArchives(s, "b", "runner");
    expect(s.run?.positionVacated).toBe(true);
    expect(s.servers["hq"]!.ice).toEqual(["c"]);
    expect(s.run?.position).toBe(0);
  });
});

describe("ice derezzed while it is encountered (CR 6.2.7c)", () => {
  it("ends the encounter; the Runner passes the ice", () => {
    const s = encountering(runOnHq(), "a");
    s.cards["a"]!.rezzed = false;
    const t = pass(s);
    expect(t.run?.endedTheRun ?? false).toBe(false);
    expect(logged(t)).not.toContain('Resolve subroutine "End the run."');
    expect(logged(t)).toContain("6.2.7c");
    expect(t.timingKey).toBe("run.jackOutWindow");
    expect(t.run?.passedIceIds).toEqual(["a"]);
  });
});

describe("hand-written ice trashes go through the trash procedure (CR 1.14.5)", () => {
  it("Universal Connectivity Fee trashes itself and the encounter ends", () => {
    const s = encountering(runOnHq(), "a");
    s.runner.tags = 1;
    const r = evalEffect(
      { state: s, sourceId: "a" },
      fx.do({ kind: "universal_connectivity_fee_sub" }),
    );
    expect(r.ok).toBe(true);
    expect(s.cards["a"]?.zone).toBe("corp:archives");
    expect(s.cards["a"]?.rezzed).toBe(false);
    expect(s.servers["hq"]!.ice).toEqual(["b", "c"]);
    expect(s.run?.encounter?.iceUninstalled).toBe(true);
  });
});

describe("moving the Runner clears an emptied position", () => {
  it("every assignment to the run position goes through setRunnerPosition", () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".ts")) files.push(path);
      }
    };
    walk(join(__dirname, "..", "src"));
    const direct: string[] = [];
    for (const file of files) {
      if (file.endsWith(join("state", "runPosition.ts"))) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (!/\b(run|runState)!?\.position = /.test(line)) return;
          // The install keeps the Runner on the same element (CR 6.2.6).
          if (line.includes("state.run.position = at;")) return;
          direct.push(`${file}:${index + 1}`);
        });
    }
    expect(direct).toEqual([]);
  });
});
