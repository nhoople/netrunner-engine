/**
 * Pending ability instances, checkpoint diffs, reaction windows, lingering
 * registry, and damage expected-effects (CR 9.6 / 9.9.2 / 9.10 / 10.3).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  CR,
  addLingeringEffect,
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  captureCheckpointFacts,
  cardsDataPresent,
  commitCheckpointSnapshot,
  createInitialState,
  createPendingAbilityInstance,
  crDataPresent,
  diffAgainstPreviousCheckpoint,
  expireLingeringEffects,
  instantiateCard,
  markPendingAbilityImminent,
  occurCheckpoint,
  pendingAbilitiesWithStatus,
} from "../src/index.js";
import { dealDamage, preventPendingDamage } from "../src/state/damage.js";
import { resetPendingAbilitySeqForTests } from "../src/state/pendingAbilities.js";
import { resetLingeringSeqForTests } from "../src/state/lingeringEffects.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.13");
});

describe("checkpoint snapshot / diff (CR 10.3.1a / 9.6.6a)", () => {
  it("records facts at a checkpoint and diffs the next change", () => {
    const s = createInitialState();
    expect(s.previousCheckpointSnapshot).toBeNull();

    occurCheckpoint(
      s,
      "instruction",
      "test",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.previousCheckpointSnapshot).not.toBeNull();
    expect(s.previousCheckpointSnapshot?.facts.corpCredits).toBe(s.corp.credits);

    const before = s.corp.credits;
    s.corp.credits += 3;
    const diff = diffAgainstPreviousCheckpoint(s);
    expect(diff.corpCreditsDelta).toBe(3);
    expect(diff.runnerCreditsDelta).toBe(0);

    commitCheckpointSnapshot(s, "manual");
    expect(s.previousCheckpointSnapshot?.facts.corpCredits).toBe(before + 3);
    expect(diffAgainstPreviousCheckpoint(s).corpCreditsDelta).toBe(0);
  });

  it("reports zone changes against the previous snapshot (CR 9.6.6a)", () => {
    const s = createInitialState();
    commitCheckpointSnapshot(s, null);
    const facts = captureCheckpointFacts(s);
    expect(Object.keys(facts.cardZones).length).toBeGreaterThan(0);

    const cardId = Object.keys(s.cards)[0]!;
    const prevZone = s.cards[cardId]!.zone;
    s.cards[cardId]!.zone = "removed-from-game";
    const diff = diffAgainstPreviousCheckpoint(s);
    expect(diff.zoneChangedIds).toContain(cardId);
    s.cards[cardId]!.zone = prevZone;
  });
});

describe("pending ability instances (CR 9.6.2 / 9.6.12)", () => {
  it("creates pending instances and marks them independent when imminent", () => {
    resetPendingAbilitySeqForTests();
    const s = createInitialState();
    const inst = createPendingAbilityInstance(s, {
      abilityKey: "test:conditional",
      sourceId: s.runner.identityId,
      controller: "runner",
      mandatory: false,
    });
    expect(inst.status).toBe("pending");
    expect(inst.independentOfSource).toBe(false);
    expect(pendingAbilitiesWithStatus(s)).toHaveLength(1);

    markPendingAbilityImminent(s, inst.id);
    expect(inst.status).toBe("imminent");
    expect(inst.independentOfSource).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes(CR.conditionalAbilityIndependent.number),
      ),
    ).toBe(true);
  });

  it("opens a reaction window with a fixed pending set (CR 9.2.8a / 10.3.2)", () => {
    resetPendingAbilitySeqForTests();
    const s = createInitialState();
    const a = createPendingAbilityInstance(s, {
      abilityKey: "test:a",
      sourceId: s.corp.identityId,
      controller: "corp",
      mandatory: true,
    });
    const b = createPendingAbilityInstance(s, {
      abilityKey: "test:b",
      sourceId: s.runner.identityId,
      controller: "runner",
      mandatory: false,
    });

    occurCheckpoint(
      s,
      "instruction",
      "with pending",
      [CR.checkpointConditionalAbilities],
      "test",
    );

    expect(
      s.log.some((line) =>
        line.includes(`Reaction window (CR ${CR.checkpointReaction.number})`),
      ),
    ).toBe(true);
    expect(
      s.log.some((line) => line.includes(CR.reactionWindowFixedSet.number)),
    ).toBe(true);
    expect(s.reactionStack).toHaveLength(0);
    expect(s.pendingAbilities.find((p) => p.id === a.id)).toBeUndefined();
    expect(s.pendingAbilities.find((p) => p.id === b.id)).toBeUndefined();
  });
});

describe("lingering effect registry (CR 9.10.1)", () => {
  it("creates independent lingerings and removes them at 10.3.1b", () => {
    resetLingeringSeqForTests();
    const s = createInitialState();
    const effect = addLingeringEffect(s, {
      createdBy: s.runner.identityId,
      duration: { kind: "until_checkpoint" },
      kind: "test-boost",
      payload: { amount: 1 },
    });
    expect(effect.independent).toBe(true);
    expect(s.lingeringEffects).toHaveLength(1);
    expect(
      s.log.some((line) => line.includes(CR.lingeringEffect.number)),
    ).toBe(true);

    expireLingeringEffects(s, { untilCheckpoint: true });
    expect(s.lingeringEffects).toHaveLength(0);
  });

  it("expires turn-duration lingerings only for the ended side", () => {
    resetLingeringSeqForTests();
    const s = createInitialState();
    addLingeringEffect(s, {
      createdBy: s.corp.identityId,
      duration: { kind: "turn", side: "corp" },
      kind: "corp-turn",
    });
    addLingeringEffect(s, {
      createdBy: s.runner.identityId,
      duration: { kind: "turn", side: "runner" },
      kind: "runner-turn",
    });
    expireLingeringEffects(s, { turn: "corp" });
    expect(s.lingeringEffects.map((e) => e.kind)).toEqual(["runner-turn"]);
  });
});

describe("draw on-draw pending (CR 8.4.5a / 10.3.1a / 10.3.2)", () => {
  it("marks Find the Truth pending at the draw checkpoint, then reveals in the reaction window", () => {
    let s = createInitialState();
    const truth = instantiateCard("find-the-truth", "ftt-1", "runner:installed");
    s.cards["ftt-1"] = truth;
    s.runner.installed.push("ftt-1");
    const topId = s.runner.deck[0]!;
    const title = s.cards[topId]!.title;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";
    s.runner.clicks = 1;

    const r = applyAction(s, { type: "basic_draw" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;

    const checked = s.log.findIndex((line) =>
      line.includes("Conditional abilities checked"),
    );
    expect(checked).toBeGreaterThanOrEqual(0);
    expect(s.log[checked]).toContain("marked pending");
    expect(s.log[checked]).toContain(CR.pendingInstances.number);

    const window = s.log.findIndex((line) =>
      line.includes(`Reaction window (CR ${CR.checkpointReaction.number})`),
    );
    const reveal = s.log.findIndex((line) =>
      line.includes(`Find the Truth — reveal drawn card: ${title}`),
    );
    expect(window).toBeGreaterThanOrEqual(0);
    expect(reveal).toBeGreaterThan(window);
    expect(s.pendingAbilities).toHaveLength(0);
  });
});

describe("damage expected effects (CR 9.9.2)", () => {
  it("tracks expected damage and updates it when prevented", () => {
    const s = createInitialState();
    const result = dealDamage(s, "net", 2, s.corp.identityId, {
      interactive: true,
    });
    expect(result).toBe("pending");
    expect(s.pendingDamage?.expectedEffects?.damage).toEqual({
      type: "net",
      amount: 2,
    });

    preventPendingDamage(s, 1);
    expect(s.pendingDamage?.remaining).toBe(1);
    expect(s.pendingDamage?.expectedEffects?.damage?.amount).toBe(1);
  });
});
