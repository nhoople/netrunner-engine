/**
 * FX-legal-moves: the legal-action list (`queryLegality`) offers exactly the
 * moves `applyAction` accepts. The match host takes only listed moves, so a
 * move apply accepts but the list leaves out can never be made at the
 * table, and a listed move apply refuses stalls it.
 *
 * The seeded playouts run the full check (tests/playout/legality-agreement-*.test.ts);
 * these are the positions it was built on, and the moves it found.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  cardsDataPresent,
  crDataPresent,
  legalActions,
  queryLegality,
} from "../../src/index.js";
import type { GameState } from "../../src/state/types/game.js";
import { legalityDisagreements } from "../../src/debug/legalityAgreement.js";
import {
  corpTurn,
  drive,
  fresh,
  installIce,
  installRoot,
  installRunner,
  must,
  runnerTurn,
  setIdentity,
  stackRd,
  toHand,
  serverOf,
} from "../rulings/rulings-helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
});

/** The Runner accessing a lone agenda in a remote server, at the steal step. */
function accessingAgenda(defId: string): GameState {
  let s = runnerTurn(fresh());
  installRoot(s, defId, "ag-1", false);
  s = must(s, { type: "basic_run", serverId: serverOf(s, "ag-1") });
  return drive(s, (x) => x.timingKey === "access.stealAgenda");
}

describe("interrupts while the other player holds priority (CR 9.2.9c, 9.9.4d)", () => {
  it("the Runner may use Decoy against a tag the Corp gives on its own turn, and the list and apply agree there", () => {
    let s = corpTurn(fresh(), 5);
    s.turn.successfulRunLastTurn = true;
    s.runner.credits = 0;
    toHand(s, "corp", "public-trail", "pt-1");
    installRunner(s, "decoy", "decoy-1");
    s = must(s, { type: "play_operation", cardId: "pt-1" });
    expect(s.pendingTags?.remaining).toBe(1);
    // The engine has already moved to the Corp's paid ability window, where
    // the Corp holds priority (filed: the operation has not finished
    // resolving, CR 5.6.2b). That priority must not hide the interrupt.
    expect(s.timingKey).toBe("corp.actionPaw");
    expect(legalActions(s)).toContainEqual({
      type: "use_paid_ability",
      cardId: "decoy-1",
      abilityId: "decoy-prevent-tag",
    });
    expect(legalityDisagreements(s)).toEqual([]);
  });
});

describe("prevention while damage is pending (CR 9.9.4d, 9.2.9c)", () => {
  it("while Ronin's net damage is pending on the Corp's turn, Net Shield's prevention is a legal move for the Runner", () => {
    let s = corpTurn(fresh());
    installRoot(s, "ronin", "ronin-1", true).advancementCounters = 4;
    installRunner(s, "net-shield", "ns-1");
    for (const n of [1, 2, 3, 4]) toHand(s, "runner", "sure-gamble", `g-${n}`);
    s = must(s, {
      type: "use_paid_ability",
      cardId: "ronin-1",
      abilityId: "ronin-damage",
    });
    expect(s.pendingDamage).toMatchObject({ type: "net", remaining: 3 });
    const prevent = queryLegality(s).legal.find(
      (e) => e.action.type === "use_paid_ability" && e.action.cardId === "ns-1",
    );
    // The host takes a move only from the seat the list names.
    expect(prevent?.actor).toBe("runner");
    s = must(s, prevent!.action);
    expect(s.pendingDamage?.remaining).toBe(2);
    expect(legalityDisagreements(s)).toEqual([]);
  });
});

describe("rez costs (CR 1.16.2a)", () => {
  it("a rez is offered at the cost apply charges: Asteroid Belt with 4 advancement counters costs 0, and the list and apply agree there", () => {
    let s = runnerTurn(fresh());
    s.servers.hq.ice = [];
    installIce(s, "asteroid-belt", "ab-1", "hq", false).advancementCounters = 4;
    s.corp.credits = 0;
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => x.timingKey === "run.approachPaw");
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.approachPaw");
    expect(legalActions(s)).toContainEqual({ type: "rez_ice", cardId: "ab-1" });
    expect(legalityDisagreements(s)).toEqual([]);
  });

  it("a rez the Corp cannot afford is neither offered nor accepted: Enigma with 0 credits", () => {
    let s = runnerTurn(fresh());
    s.servers.hq.ice = [];
    installIce(s, "enigma", "en-1", "hq", false);
    s.corp.credits = 0;
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => x.timingKey === "run.approachPaw");
    s = must(s, { type: "pass_window" });
    const rez = { type: "rez_ice", cardId: "en-1" } as const;
    expect(legalActions(s)).not.toContainEqual(rez);
    expect(applyAction(s, rez).ok).toBe(false);
  });
});

describe("Rime: rezzed like a non-ice card (CR 1.2.1, 8.1.2b)", () => {
  it("during a run on its server, the Corp may rez Rime in the run's opening paid ability window, and the list and apply agree there", () => {
    let s = runnerTurn(fresh());
    s.servers.hq.ice = [];
    installIce(s, "rime", "rime-1", "hq", false);
    s = must(s, { type: "basic_run", serverId: "hq" });
    s = drive(s, (x) => x.timingKey === "run.initiatePaw");
    s = must(s, { type: "pass_window" });
    expect(s.timingKey).toBe("run.initiatePaw");
    const rez = { type: "rez_ice", cardId: "rime-1" } as const;
    expect(legalActions(s)).toContainEqual(rez);
    expect(must(s, rez).cards["rime-1"]!.rezzed).toBe(true);
    expect(legalityDisagreements(s)).toEqual([]);
  });
});

describe("actions only at the take-action step (CR 5.6.2a, 5.6.2b)", () => {
  it("the Corp cannot play an operation in the paid ability window after an action: apply refuses it, as the list does", () => {
    let s = corpTurn(fresh());
    toHand(s, "corp", "hedge-fund", "hf-1");
    s = must(s, { type: "basic_gain_credit" });
    expect(s.timingKey).toBe("corp.actionPaw");
    const play = { type: "play_operation", cardId: "hf-1" } as const;
    expect(legalActions(s)).not.toContainEqual(play);
    const refused = applyAction(s, play);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.error).toContain("take-action step");
  });
});

describe("access (CR 7.1.5a, 7.1.6)", () => {
  it("the Runner cannot trash an accessed agenda, which has no trash cost (CR 7.1.5a)", () => {
    const s = accessingAgenda("hostile-takeover");
    const trash = { type: "trash_accessed", cardId: "ag-1" } as const;
    expect(legalActions(s)).not.toContainEqual(trash);
    const refused = applyAction(s, trash);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.error).toContain("no trash cost");
  });

  it("the Runner must steal an accessed agenda with no additional cost: declining it is refused (CR 7.1.6)", () => {
    const s = accessingAgenda("hostile-takeover");
    expect(legalActions(s)).toEqual([{ type: "steal_agenda", cardId: "ag-1" }]);
    expect(applyAction(s, { type: "finish_access" }).ok).toBe(false);
    expect(legalityDisagreements(s)).toEqual([]);
  });
});

describe("abilities of inactive cards (CR 9.1.7)", () => {
  it("the Corp cannot use a paid ability of a card in R&D: Spin Doctor's", () => {
    let s = corpTurn(fresh());
    stackRd(s, [["spin-doctor", "sd-1"]]);
    s = must(s, { type: "basic_gain_credit" });
    const use = {
      type: "use_paid_ability",
      cardId: "sd-1",
      abilityId: "spin-doctor-rfg",
    } as const;
    expect(legalActions(s)).not.toContainEqual(use);
    const refused = applyAction(s, use);
    expect(refused.ok).toBe(false);
    expect(s.cards["sd-1"]!.zone).toBe("corp:rd");
  });
});

describe("Corp install destinations (CR 1.2.1, 8.5)", () => {
  it("Research Station is offered only in the root of HQ, as its text says and apply enforces", () => {
    const s = corpTurn(fresh());
    toHand(s, "corp", "research-station", "rs-1");
    const installs = legalActions(s).filter(
      (a) => a.type === "basic_install" && a.cardId === "rs-1",
    );
    expect(installs.length).toBeGreaterThan(0);
    for (const a of installs) {
      expect(a.type === "basic_install" && a.destination).toMatchObject({
        kind: "remote_root",
        serverId: "hq",
      });
    }
    expect(
      applyAction(s, {
        type: "basic_install",
        cardId: "rs-1",
        destination: { kind: "new_remote" },
      }).ok,
    ).toBe(false);
  });
});

describe("the agreement check itself", () => {
  it("catches a list that leaves out a move apply takes (Decoy, as before the fix) and a listed move apply refuses", () => {
    let s = corpTurn(fresh(), 5);
    s.turn.successfulRunLastTurn = true;
    s.runner.credits = 0;
    toHand(s, "corp", "public-trail", "pt-1");
    installRunner(s, "decoy", "decoy-1");
    s = must(s, { type: "play_operation", cardId: "pt-1" });
    const brokenList = [
      { type: "accept_tags" } as const,
      { type: "basic_gain_credit" } as const,
    ];
    const found = legalityDisagreements(s, brokenList);
    expect(found).toContainEqual(
      expect.objectContaining({
        code: "ACCEPTED_UNLISTED",
        action: {
          type: "use_paid_ability",
          cardId: "decoy-1",
          abilityId: "decoy-prevent-tag",
        },
        defId: "decoy",
      }),
    );
    expect(found).toContainEqual(
      expect.objectContaining({
        code: "LISTED_REFUSED",
        action: { type: "basic_gain_credit" },
      }),
    );
  });
});

describe("more moves the agreement survey found (FX-legal-moves)", () => {
  it("Petty Cash cannot be played after the Corp has finished an action: apply refuses it, as the list does (CR 9.3.3b)", () => {
    let s = corpTurn(fresh());
    toHand(s, "corp", "petty-cash", "pc-1");
    s = must(s, { type: "basic_gain_credit" });
    s = drive(s, (x) => x.timingKey === "corp.takeAction");
    const play = { type: "play_operation", cardId: "pc-1" } as const;
    expect(legalActions(s)).not.toContainEqual(play);
    expect(applyAction(s, play).ok).toBe(false);
  });

  it("Spin Doctor's ability cannot be used again once it has removed itself from the game (CR 1.8.3a, 9.1.7)", () => {
    let s = corpTurn(fresh());
    installRoot(s, "spin-doctor", "sd-1", true);
    s = must(s, { type: "basic_gain_credit" });
    const use = {
      type: "use_paid_ability",
      cardId: "sd-1",
      abilityId: "spin-doctor-rfg",
    } as const;
    s = must(s, use);
    expect(s.cards["sd-1"]!.zone).toBe("removed-from-game");
    expect(legalActions(s)).not.toContainEqual(use);
    expect(applyAction(s, use).ok).toBe(false);
  });

  it("ZATO City Grid is offered only in a remote server, as its text says and apply enforces (CR 8.5.12)", () => {
    const s = corpTurn(fresh());
    toHand(s, "corp", "zato-city-grid", "zato-1");
    const central = {
      type: "basic_install",
      cardId: "zato-1",
      destination: { kind: "remote_root", serverId: "hq" },
    } as const;
    expect(legalActions(s)).not.toContainEqual(central);
    expect(applyAction(s, central).ok).toBe(false);
    expect(legalActions(s)).toContainEqual({
      type: "basic_install",
      cardId: "zato-1",
      destination: { kind: "new_remote" },
    });
  });

  it("damage only interrupts may prevent cannot be prevented by a plain prevention move: Ronin's net damage (CR 9.9.4d)", () => {
    let s = corpTurn(fresh());
    installRoot(s, "ronin", "ronin-1", true).advancementCounters = 4;
    installRunner(s, "net-shield", "ns-1");
    for (const n of [1, 2, 3, 4]) toHand(s, "runner", "sure-gamble", `g-${n}`);
    s = must(s, {
      type: "use_paid_ability",
      cardId: "ronin-1",
      abilityId: "ronin-damage",
    });
    const plain = { type: "prevent_damage", amount: 1 } as const;
    expect(legalActions(s)).not.toContainEqual(plain);
    expect(applyAction(s, plain).ok).toBe(false);
  });

  it("an identity's once-per-turn paid ability is refused a second time however it is named: AgInfusion (CR 9.2.7b, 9.3.6g)", () => {
    let s = corpTurn(fresh());
    setIdentity(s, "corp", "aginfusion-new-miracles-for-a-new-world");
    s = must(s, { type: "basic_gain_credit" });
    s = must(s, {
      type: "use_paid_ability",
      cardId: s.corp.identityId,
      abilityId: "aginfusion-redirect",
    });
    const again = {
      type: "use_identity_ability",
      abilityId: "aginfusion-redirect",
    } as const;
    expect(applyAction(s, again).ok).toBe(false);
    expect(legalityDisagreements(s)).toEqual([]);
  });
});
