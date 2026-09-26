import { describe, expect, it, beforeAll } from "vitest";
import {
  applyIntent,
  createInitialState,
  fx,
  getCardDef,
  instantiateCard,
  loadCardCatalog,
  loadCardPool,
  setupEmptyRemoteWithIce,
  assertPinnedTag,
  crDataPresent,
} from "../src/index.js";
import type { Action, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

function must(state: GameState, action: Action): GameState {
  const r = applyIntent(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

describe("Gateway harden pass 2", () => {
  it("closes essentially all Gateway unsupported notes", () => {
    const pool = loadCardPool(true).waves["system-gateway"].cards;
    let full = 0;
    let partial = 0;
    for (const id of pool) {
      const notes = getCardDef(id).unsupported ?? [];
      if (notes.length === 0) full += 1;
      else partial += 1;
    }
    expect(full + partial).toBe(77);
    expect(full).toBe(77);
    expect(partial).toBe(0);
  });

  it("Jailbreak runs R&D with bonus access and draws on success", () => {
    expect(getCardDef("jailbreak").runEvent?.servers).toBe("hq_rd");
    expect(getCardDef("jailbreak").runEvent?.bonusAccess).toBe(1);
    let s = createInitialState();
    const ev = instantiateCard("jailbreak", "jb-1", "runner:grip");
    s = structuredClone(s);
    s.cards["jb-1"] = ev;
    s.runner.hand = ["jb-1"];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    // Empty R&D → successful run with no access candidates
    s.corp.deck = [];
    s = must(s, { type: "play_event", cardId: "jb-1", serverId: "rd" });
    expect(s.run).toBeNull();
    expect(s.turn.successfulRunThisTurn).toBe(true);
    expect(s.runner.hand.length).toBe(1); // drew 1 after playing
    expect(s.log.some((l) => /draws 1/i.test(l) || l.includes("draw"))).toBe(
      true,
    );
  });

  it("Tread Lightly and Overclock runEvent fields load", () => {
    expect(getCardDef("tread-lightly").runEvent?.iceRezCostIncrease).toBe(3);
    expect(getCardDef("overclock").runEvent?.placeEventCredits).toBe(5);
  });

  it("Tread Lightly rez pays base+3", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    const ev = instantiateCard("tread-lightly", "tl-2", "runner:grip");
    s = structuredClone(s);
    s.cards["tl-2"] = ev;
    s.runner.hand = ["tl-2"];
    s.runner.credits = 5;
    s.runner.clicks = 4;
    s.corp.credits = 20;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, {
      type: "play_event",
      cardId: "tl-2",
      serverId: remote.id as ServerId,
    });
    const base = s.cards[iceId].rezCost ?? 0;
    const before = s.corp.credits;
    s = must(s, { type: "rez_ice", cardId: iceId });
    expect(s.corp.credits).toBe(before - (base + 3));
  });

  it("Manegarm forces approach tax choice", () => {
    let s = createInitialState();
    s = structuredClone(s);
    const up = instantiateCard("manegarm-skunkworks", "ms-1", "server:hq:root");
    up.rezzed = true;
    s.cards["ms-1"] = up;
    s.servers.hq.root.push("ms-1");
    s.runner.clicks = 4;
    s.runner.credits = 10;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, { type: "basic_run", serverId: "hq" });
    expect(s.pendingChoice?.sourceId).toBe("ms-1");
    s = must(s, { type: "choose_option", optionId: "pay-credits" });
    expect(s.runner.credits).toBe(5);
  });

  it("Botulus installs on ice and breaks host sub with virus", () => {
    let s = setupEmptyRemoteWithIce();
    const remote = Object.values(s.servers).find((x) => x.kind === "remote")!;
    const iceId = remote.ice[0]!;
    const bot = instantiateCard("botulus", "bot-1", "runner:grip");
    s = structuredClone(s);
    s.cards["bot-1"] = bot;
    s.runner.hand = ["bot-1"];
    s.runner.credits = 10;
    s.runner.clicks = 4;
    s.corp.credits = 20;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s = must(s, {
      type: "basic_install",
      cardId: "bot-1",
      destination: { kind: "host_ice", iceId },
    });
    expect(s.cards["bot-1"].hostId).toBe(iceId);
    expect(s.cards["bot-1"].virusCounters).toBeGreaterThanOrEqual(1);
    s = must(s, { type: "pass_window" });
    s = must(s, { type: "basic_run", serverId: remote.id as ServerId });
    s = must(s, { type: "rez_ice", cardId: iceId });
    s = must(s, { type: "pass_window" });
    // Encounter PAW — break with Botulus
    const beforeVirus = s.cards["bot-1"].virusCounters ?? 0;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "bot-1",
      abilityId: "break-host",
    });
    expect(s.cards["bot-1"].virusCounters).toBe(beforeVirus - 1);
    expect(s.run?.encounter?.broken.some(Boolean)).toBe(true);
  });

  it("Ansel trash-any / lock and Bran inward install fields load", () => {
    expect(getCardDef("ansel-1-0").subroutines?.[0]?.effect).toEqual(
      fx.trashInstalledRunner("choose"),
    );
    expect(getCardDef("ansel-1-0").subroutines?.[2]?.effect).toEqual(
      fx.forbidStealTrashThisRun(),
    );
    expect(getCardDef("bran-1-0").subroutines?.[0]?.effect).toEqual(
      fx.installIceInwardFree(),
    );
    expect(getCardDef("karuna").subroutines?.[0]?.effect).toEqual(
      fx.seq(fx.netDamage(2), fx.offerJackOut()),
    );
  });

  it("Red Team and Conduit expose startsRun abilities", () => {
    expect(getCardDef("red-team").paidAbilities?.[0]?.startsRun?.servers).toBe(
      "central",
    );
    expect(
      getCardDef("conduit").paidAbilities?.[0]?.startsRun?.bonusAccessFromVirus,
    ).toBe(true);
  });
});
