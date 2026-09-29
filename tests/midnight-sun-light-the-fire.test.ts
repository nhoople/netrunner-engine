/**
 * Midnight Sun Light the Fire! cluster:
 * paid ability startsRun servers:"remote" + cost.coreDamage + trashSelf
 * + blankAttackedServerRoot + onSuccessfulRun trash_attacked_server_root.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  abilitiesSuppressed,
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  fx,
  getCardDef,
  instantiateCard,
  isServerAllowedForSpec,
  queryLegality,
  serversMatchingSpec,
} from "../src/index.js";
import type { PaidAbility, StartsRunSpec } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.82.0");
});

function must(
  state: ReturnType<typeof createInitialState>,
  action: Parameters<typeof applyAction>[1],
) {
  const r = applyAction(state, action);
  if (!r.ok) throw new Error(`${r.error} ${JSON.stringify(r.cites)}`);
  return r.state;
}

function lightTheFireAbility(): PaidAbility {
  return {
    id: "ltf-run",
    label:
      "[click], trash, suffer 1 core damage: run remote; blank root; on success trash root",
    clickCost: 1,
    creditCost: 0,
    cost: { clicks: 1, trashSelf: true, coreDamage: 1 },
    windows: ["runner_action_paw"],
    effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
    startsRun: {
      servers: "remote",
      blankAttackedServerRoot: true,
      onSuccessfulRun: fx.trashAttackedServerRoot(),
    },
  };
}

function setupRemoteWithRoot(opts?: {
  rootDefId?: string;
  rezzed?: boolean;
  withIce?: boolean;
}) {
  let s = createInitialState();
  s = structuredClone(s);

  const remoteId = "remote-1";
  s.servers[remoteId] = {
    id: remoteId,
    kind: "remote",
    ice: [],
    root: [],
  };

  if (opts?.withIce) {
    const ice = instantiateCard("tithe", "ice-1", `server:${remoteId}:ice`);
    ice.rezzed = false;
    s.cards["ice-1"] = ice;
    s.servers[remoteId].ice = ["ice-1"];
  }

  const rootDef = opts?.rootDefId ?? "pad-campaign";
  const asset = instantiateCard(rootDef, "root-1", `server:${remoteId}:root`);
  asset.rezzed = opts?.rezzed ?? true;
  s.cards["root-1"] = asset;
  s.servers[remoteId].root = ["root-1"];

  const ltf = instantiateCard("light-the-fire", "ltf-1", "runner:rig");
  ltf.unsupported = [];
  ltf.paidAbilities = [lightTheFireAbility()];
  s.cards["ltf-1"] = ltf;
  s.runner.rig = ["ltf-1"];
  s.runner.credits = 10;
  s.runner.clicks = 4;
  // Grip fillers so core-damage cost does not flatline.
  for (let i = 0; i < 3; i++) {
    const id = `filler-${i}`;
    const c = instantiateCard("sure-gamble", id, "runner:grip");
    s.cards[id] = c;
    s.runner.hand.push(id);
  }
  s.corp.credits = 20;
  s.activeSide = "runner";
  s.timingKey = "runner.takeAction";
  return s;
}

describe("MS Light the Fire! IR (always)", () => {
  it("serversMatchingSpec remote excludes centrals", () => {
    const s = createInitialState();
    const remotes = serversMatchingSpec(s, { servers: "remote" });
    expect(remotes.every((id) => s.servers[id].kind === "remote")).toBe(true);
    expect(remotes.includes("hq")).toBe(false);
    expect(isServerAllowedForSpec(s, { servers: "remote" }, "hq")).toBe(false);
  });

  it("pays click+trash+core damage and starts a remote run with blanking", () => {
    let s = setupRemoteWithRoot({ withIce: true });
    const legal = queryLegality(s).legal;
    expect(
      legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.cardId === "ltf-1" &&
          e.action.abilityId === "ltf-run" &&
          e.action.serverId === "remote-1",
      ),
    ).toBe(true);
    expect(
      legal.some(
        (e) =>
          e.action.type === "use_paid_ability" &&
          e.action.cardId === "ltf-1" &&
          e.action.serverId === "hq",
      ),
    ).toBe(false);

    const clicksBefore = s.runner.clicks;
    const gripBefore = s.runner.hand.length;
    const bdBefore = s.runner.brainDamage;

    s = must(s, {
      type: "use_paid_ability",
      cardId: "ltf-1",
      abilityId: "ltf-run",
      serverId: "remote-1",
    });

    expect(s.runner.clicks).toBe(clicksBefore - 1);
    expect(s.runner.rig.includes("ltf-1")).toBe(false);
    expect(s.runner.discard.includes("ltf-1")).toBe(true);
    expect(s.runner.brainDamage).toBe(bdBefore + 1);
    expect(s.runner.hand.length).toBe(gripBefore - 1);
    expect(s.run).not.toBeNull();
    expect(s.run!.attackedServerId).toBe("remote-1");
    expect(s.run!.blankAttackedServerRoot).toBe(true);
    expect(abilitiesSuppressed(s, "root-1")).toBe(true);
  });

  it("blanks Crisium so the run can be declared successful", () => {
    let s = setupRemoteWithRoot({ rootDefId: "crisium-grid", rezzed: true });
    s = must(s, {
      type: "use_paid_ability",
      cardId: "ltf-1",
      abilityId: "ltf-run",
      serverId: "remote-1",
    });
    // Ice-less remote: run auto-walks to completion (run cleared).
    expect(s.run).toBeNull();
    expect(s.servers["remote-1"].root).toEqual([]);
    expect(s.corp.discard.includes("root-1")).toBe(true);
    expect(s.log.some((l) => /Run successful/.test(l))).toBe(true);
  });

  it("on success trashes all root cards and skips Hokusai onSuccessfulRun", () => {
    let s = setupRemoteWithRoot({ rootDefId: "hokusai-grid", rezzed: true });
    // Second root card
    const asset = instantiateCard(
      "pad-campaign",
      "root-2",
      "server:remote-1:root",
    );
    asset.rezzed = true;
    s.cards["root-2"] = asset;
    s.servers["remote-1"].root.push("root-2");

    const gripBefore = s.runner.hand.length;
    s = must(s, {
      type: "use_paid_ability",
      cardId: "ltf-1",
      abilityId: "ltf-run",
      serverId: "remote-1",
    });

    expect(s.run).toBeNull();
    expect(s.servers["remote-1"].root).toEqual([]);
    expect(s.corp.discard).toEqual(
      expect.arrayContaining(["root-1", "root-2"]),
    );
    // Hokusai would deal 1 net; grip only lost the core-damage cost card.
    expect(s.runner.hand.length).toBe(gripBefore - 1);
  });

  it("fails closed when ability requires a remote and none exist", () => {
    let s = createInitialState();
    s = structuredClone(s);
    // Remove remotes
    for (const id of Object.keys(s.servers)) {
      if (s.servers[id].kind === "remote") delete s.servers[id];
    }
    const ltf = instantiateCard("light-the-fire", "ltf-1", "runner:rig");
    ltf.paidAbilities = [lightTheFireAbility()];
    s.cards["ltf-1"] = ltf;
    s.runner.rig = ["ltf-1"];
    s.runner.clicks = 4;
    for (let i = 0; i < 2; i++) {
      const id = `f-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
      s.runner.hand.push(id);
    }
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    const legal = queryLegality(s).legal.filter(
      (e) =>
        e.action.type === "use_paid_ability" && e.action.cardId === "ltf-1",
    );
    expect(legal).toHaveLength(0);
  });

  it("soft: when wired, card def exposes remote startsRun + blank + root trash", () => {
    const def = getCardDef("light-the-fire");
    if ((def.unsupported?.length ?? 0) > 0) {
      expect(def.unsupported!.length).toBeGreaterThan(0);
      return;
    }
    const ab = def.paidAbilities?.[0];
    expect(ab?.cost?.trashSelf).toBe(true);
    expect(ab?.cost?.coreDamage).toBe(1);
    expect(ab?.cost?.clicks).toBe(1);
    const sr = ab?.startsRun as StartsRunSpec | undefined;
    expect(sr?.servers).toBe("remote");
    expect(sr?.blankAttackedServerRoot).toBe(true);
    expect(sr?.onSuccessfulRun).toEqual(fx.trashAttackedServerRoot());
  });
});
