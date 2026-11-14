/**
 * Ice an ability installs or moves goes to the outermost position unless
 * its text names another (CR 6.2.2a). Index 0 is outermost.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  fx,
  instantiateCard,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.23");
});

/** Remote 1 protected by two Ice Walls: "outer" then "inner". */
function table(): GameState {
  const s = createInitialState();
  s.corp.credits = 30;
  s.corp.hand = [];
  s.corp.discardPile = [];
  s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: [] };
  for (const id of ["outer", "inner"]) {
    const ice = instantiateCard("ice-wall", id, "server:remote-1:ice");
    ice.rezzed = true;
    ice.faceup = true;
    s.cards[id] = ice;
    s.servers["remote-1"]!.ice.push(id);
  }
  return s;
}

function put(s: GameState, defId: string, id: string, zone: string): void {
  s.cards[id] = instantiateCard(defId, id, zone);
}

function run(s: GameState, sourceId: string, kind: string, extra: object): void {
  const r = evalEffect({ state: s, sourceId }, fx.do({ kind, ...extra }));
  if (!r.ok) throw new Error(`${kind}: ${r.error ?? "failed"}`);
}

describe("ability installs put ice outermost (CR 6.2.2a)", () => {
  it("Asa Group", () => {
    const s = table();
    put(s, "enigma", "new", "corp:hq");
    s.corp.hand = ["new"];
    run(s, s.corp.identityId, "install_asa_resolve", {
      cardId: "new",
      serverId: "remote-1",
      asIce: true,
    });
    expect(s.servers["remote-1"]!.ice).toEqual(["new", "outer", "inner"]);
  });

  it("Restore", () => {
    const s = table();
    put(s, "restore", "restore-1", "corp:play");
    put(s, "enigma", "new", "corp:archives");
    s.corp.discardPile = ["new"];
    run(s, "restore-1", "install_rez_resolve", { cardId: "new", serverId: "remote-1" });
    expect(s.servers["remote-1"]!.ice).toEqual(["new", "outer", "inner"]);
    expect(s.cards["new"]?.rezzed).toBe(true);
  });

  it("Remote Enforcement", () => {
    const s = table();
    put(s, "remote-enforcement", "re-1", "corp:score");
    put(s, "enigma", "new", "corp:rd");
    s.corp.deck = ["new"];
    run(s, "re-1", "install_remote_enforcement", { iceId: "new", serverId: "remote-1" });
    expect(s.servers["remote-1"]!.ice).toEqual(["new", "outer", "inner"]);
  });

  it("Jinja City Grid", () => {
    const s = table();
    put(s, "jinja-city-grid", "jinja-1", "server:remote-1:root");
    s.servers["remote-1"]!.root = ["jinja-1"];
    put(s, "enigma", "new", "corp:hq");
    s.corp.hand = ["new"];
    run(s, "jinja-1", "install_jinja_drawn_ice", { cardId: "new", serverId: "remote-1" });
    expect(s.servers["remote-1"]!.ice).toEqual(["new", "outer", "inner"]);
  });

  it("Builder moves to the outermost position, as printed", () => {
    const s = table();
    put(s, "builder", "builder-1", "server:hq:ice");
    s.servers["hq"]!.ice = ["builder-1"];
    run(s, "builder-1", "move_to_server", { serverId: "remote-1" });
    expect(s.servers["hq"]!.ice).toEqual([]);
    expect(s.servers["remote-1"]!.ice).toEqual(["builder-1", "outer", "inner"]);
  });

  it("the Runner keeps their position when ice is added outward of them (CR 6.2.6a)", () => {
    const s = table();
    put(s, "jinja-city-grid", "jinja-1", "server:remote-1:root");
    s.servers["remote-1"]!.root = ["jinja-1"];
    put(s, "enigma", "new", "corp:hq");
    s.corp.hand = ["new"];
    s.run = {
      attackedServerId: "remote-1",
      phase: "encounter",
      position: 1,
      encounter: { iceId: "inner", broken: [false] },
    } as GameState["run"];
    run(s, "jinja-1", "install_jinja_drawn_ice", { cardId: "new", serverId: "remote-1" });
    expect(s.servers["remote-1"]!.ice[s.run!.position!]).toBe("inner");
  });
});
