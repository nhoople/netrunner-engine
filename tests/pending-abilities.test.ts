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
  autoWalk,
  cancelPendingIfSourceInactive,
  createPendingAbilityInstance,
  crDataPresent,
  diffAgainstPreviousCheckpoint,
  enterStep,
  evalEffect,
  evaluateTriggerPredicate,
  expireLingeringEffects,
  fx,
  instantiateCard,
  markPendingAbilityImminent,
  moveRunnerCardToHeap,
  occurCheckpoint,
  openPendingTags,
  pendingAbilitiesWithStatus,
  PREDICATE_ADVANCEMENT_FROM_ZERO,
  PREDICATE_ENTERED_BREACHED_ROOT,
  PREDICATE_ENTERED_DRAW_SET_ASIDE,
  PREDICATE_ENTERED_REMOTE_INSTALL,
  PREDICATE_EXPOSED_SINCE_PREVIOUS,
  PREDICATE_RUNNER_TAGS_FROM_ZERO,
  preventPendingTags,
} from "../src/index.js";
import { trashCorpCardToArchives } from "../src/effects/corpTrash.js";
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

  it("diffs advancement-from-zero for Built to Last (CR 9.6.6a)", () => {
    const s = createInitialState();
    const agenda = instantiateCard(
      "hostile-takeover",
      "ht-1",
      "server:hq:root",
    );
    s.cards["ht-1"] = agenda;
    s.servers.hq.root = ["ht-1"];
    commitCheckpointSnapshot(s, "before-advance");
    expect(s.previousCheckpointSnapshot?.facts.cardAdvancementCounters["ht-1"]).toBe(
      0,
    );

    agenda.advancementCounters = 2;
    const diff = diffAgainstPreviousCheckpoint(s);
    expect(diff.advancementIncreasedFromZeroIds).toContain("ht-1");

    commitCheckpointSnapshot(s, "after-advance");
    agenda.advancementCounters = 3;
    expect(
      diffAgainstPreviousCheckpoint(s).advancementIncreasedFromZeroIds,
    ).not.toContain("ht-1");
  });

  it("marks Sebastião when the Runner had no tags at the previous checkpoint (CR 9.6.6a)", () => {
    resetPendingAbilitySeqForTests();
    const s = createInitialState();
    const id = instantiateCard(
      "sebastiao-souza-pessoa-activist-organizer",
      s.runner.identityId,
      s.cards[s.runner.identityId]!.zone,
    );
    s.cards[s.runner.identityId] = id;
    const conn = instantiateCard("aaron-marron", "conn-1", "runner:grip");
    s.cards["conn-1"] = conn;
    s.runner.hand = ["conn-1"];
    s.runner.credits = 10;
    s.runner.tags = 0;
    commitCheckpointSnapshot(s, "untagged");
    s.runner.tags = 2;

    occurCheckpoint(
      s,
      "instruction",
      "sebastiao had-no-tags",
      [CR.checkpointConditionalAbilities],
      "test",
    );

    expect(
      s.log.some(
        (line) =>
          line.includes("had no tags") &&
          line.includes(CR.hadPreviousCheckpoint.number),
      ),
    ).toBe(true);
    // Optional install opens a choice in the checkpoint reaction window.
    expect(s.pendingChoice).toBeTruthy();
  });

  it("does not mark Sebastião when previous checkpoint had tags (CR 9.6.6a)", () => {
    resetPendingAbilitySeqForTests();
    const s = createInitialState();
    const id = instantiateCard(
      "sebastiao-souza-pessoa-activist-organizer",
      s.runner.identityId,
      s.cards[s.runner.identityId]!.zone,
    );
    s.cards[s.runner.identityId] = id;
    // Previous checkpoint: tagged. Mid-interval untagged then re-tagged would
    // fool a tagsBefore hook, but "had" looks at the prior 10.3.1a.
    s.runner.tags = 1;
    commitCheckpointSnapshot(s, "tagged");
    s.runner.tags = 0;
    s.runner.tags = 1;

    occurCheckpoint(
      s,
      "instruction",
      "sebastiao mid-interval flicker",
      [CR.checkpointConditionalAbilities],
      "test",
    );

    expect(
      s.log.some((line) => line.includes("had no tags")),
    ).toBe(false);
    expect(
      s.pendingAbilities.some(
        (p) => p.abilityKey === "on-take-tags-when-untagged",
      ),
    ).toBe(false);
  });

  it("evaluates had-family trigger predicates as data (CR 9.6.6a)", () => {
    const s = createInitialState();
    const agenda = instantiateCard(
      "hostile-takeover",
      "ht-pred",
      "server:hq:root",
    );
    s.cards["ht-pred"] = agenda;
    s.servers.hq.root = ["ht-pred"];
    commitCheckpointSnapshot(s, "baseline");

    agenda.advancementCounters = 1;
    s.runner.tags = 2;
    const diff = diffAgainstPreviousCheckpoint(s);

    const adv = evaluateTriggerPredicate(
      s,
      diff,
      PREDICATE_ADVANCEMENT_FROM_ZERO,
    );
    expect(adv).toEqual({
      kind: "advancement_increased_from_zero",
      cardIds: ["ht-pred"],
    });

    const tags = evaluateTriggerPredicate(
      s,
      diff,
      PREDICATE_RUNNER_TAGS_FROM_ZERO,
    );
    expect(tags).toEqual({
      kind: "runner_tags_increased_from_zero",
      matched: true,
    });

    // Previous baseline had tags → predicate fails even if delta is positive.
    s.runner.tags = 1;
    commitCheckpointSnapshot(s, "tagged-baseline");
    s.runner.tags = 3;
    const taggedDiff = diffAgainstPreviousCheckpoint(s);
    expect(
      evaluateTriggerPredicate(s, taggedDiff, PREDICATE_RUNNER_TAGS_FROM_ZERO),
    ).toEqual({ kind: "runner_tags_increased_from_zero", matched: false });
  });

  it("evaluates expose and draw-set-aside predicates (CR 9.6.4b / 8.4.5a)", () => {
    const s = createInitialState();
    commitCheckpointSnapshot(s, "baseline");
    s.turn.exposureCounts = { ...(s.turn.exposureCounts ?? {}), "exp-1": 2 };
    const exposeDiff = diffAgainstPreviousCheckpoint(s);
    expect(
      evaluateTriggerPredicate(s, exposeDiff, PREDICATE_EXPOSED_SINCE_PREVIOUS),
    ).toEqual({
      kind: "exposed_since_previous",
      cardIds: ["exp-1", "exp-1"],
    });

    const drawn = instantiateCard("sure-gamble", "draw-1", "runner:set-aside");
    drawn.setAsideGroupId = "draw";
    s.cards["draw-1"] = drawn;
    // Zone change vs previous snapshot (card was not present / not set-aside).
    const drawDiff = diffAgainstPreviousCheckpoint(s);
    expect(
      evaluateTriggerPredicate(s, drawDiff, PREDICATE_ENTERED_DRAW_SET_ASIDE),
    ).toEqual({
      kind: "entered_draw_set_aside",
      side: "runner",
      cardIds: ["draw-1"],
    });
  });

  it("evaluates remote-install and breached-root predicates (CR 8.8.4b / 10.3.1j)", () => {
    const s = createInitialState();
    commitCheckpointSnapshot(s, "baseline");
    const asset = instantiateCard(
      "pad-campaign",
      "remote-asset-1",
      "server:remote-1:root",
    );
    s.cards["remote-asset-1"] = asset;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["remote-asset-1"],
    };
    const remoteDiff = diffAgainstPreviousCheckpoint(s);
    expect(
      evaluateTriggerPredicate(
        s,
        remoteDiff,
        PREDICATE_ENTERED_REMOTE_INSTALL,
      ),
    ).toEqual({
      kind: "entered_remote_install",
      entries: [{ cardId: "remote-asset-1", serverId: "remote-1" }],
    });

    // Outside breach structure → empty breached-root match.
    expect(
      evaluateTriggerPredicate(
        s,
        remoteDiff,
        PREDICATE_ENTERED_BREACHED_ROOT,
      ),
    ).toEqual({
      kind: "entered_breached_root",
      serverId: null,
      cardIds: [],
    });
  });

  it("marks Find the Truth from draw set-aside zone diff (CR 8.4.5a)", () => {
    const s = createInitialState();
    const truth = instantiateCard("find-the-truth", "ftt-1", "runner:installed");
    truth.revealDrawnCards = true;
    s.cards["ftt-1"] = truth;
    s.runner.installed = ["ftt-1"];
    const drawn = s.runner.deck[0]!;
    commitCheckpointSnapshot(s, "before-draw");
    s.runner.deck.shift();
    const card = s.cards[drawn]!;
    card.zone = "runner:set-aside";
    card.setAsideGroupId = "draw";
    if (!s.runner.setAside) s.runner.setAside = [];
    s.runner.setAside.push(drawn);

    occurCheckpoint(
      s,
      "draw",
      "Draw checkpoint",
      [CR.drawCheckpoint, CR.drawPause],
      "draw",
    );
    expect(
      s.pendingAbilities.some(
        (p) => p.payload?.kind === "reveal_drawn_card" && p.payload.cardId === drawn,
      ) ||
        s.log.some((line) =>
          line.includes("Find the Truth") || line.includes("reveal"),
        ),
    ).toBe(true);
  });

  it("marks Valley first damage at 10.3.1a (phase 3 scanner)", async () => {
    const { noteValDamageTrigger } = await import(
      "../src/effects/sansanValHooks.js"
    );
    const s = createInitialState();
    const blood = instantiateCard(
      "synthetic-blood",
      "sb-1",
      "runner:installed",
    );
    const top = instantiateCard("sure-gamble", "sg-1", "runner:stack");
    s.cards["sb-1"] = blood;
    s.cards["sg-1"] = top;
    s.runner.installed = ["sb-1"];
    s.runner.deck = ["sg-1"];
    s.runner.hand = [];
    noteValDamageTrigger(s);
    expect(s.turn.valDamageTriggerCount).toBe(1);
    expect(s.turn.valDamageTriggerPendingCounts).toEqual([1]);
    expect(s.runner.hand).toEqual([]);
    occurCheckpoint(
      s,
      "instruction",
      "Valley first damage",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.valDamageTriggerPendingCounts).toEqual([]);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — onFirstDamageEachTurn"),
      ),
    ).toBe(true);
    expect(s.runner.hand).toEqual(["sg-1"]);
  });

  it("marks Valley first install at 10.3.1a (phase 3 scanner)", async () => {
    const { noteValRunnerTrigger } = await import(
      "../src/effects/sansanValHooks.js"
    );
    const s = createInitialState();
    const hayley = instantiateCard(
      "hayley-kaplan-universal-scholar",
      "hk-1",
      "runner:identity",
    );
    s.cards["hk-1"] = hayley;
    s.runner.identityId = "hk-1";
    noteValRunnerTrigger(s, "install");
    expect(s.turn.valInstallTriggerCount).toBe(1);
    expect(s.turn.valInstallTriggerPendingCounts).toEqual([1]);
    occurCheckpoint(
      s,
      "instruction",
      "Valley first install",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.valInstallTriggerPendingCounts).toEqual([]);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — onFirstInstallEachTurn"),
      ),
    ).toBe(true);
  });

  it("marks Valley first click-loss at 10.3.1a (phase 3 scanner)", async () => {
    const { noteValRunnerTrigger } = await import(
      "../src/effects/sansanValHooks.js"
    );
    const s = createInitialState();
    const chrono = instantiateCard(
      "adjusted-chronotype",
      "ac-1",
      "runner:installed",
    );
    s.cards["ac-1"] = chrono;
    s.runner.installed = ["ac-1"];
    s.runner.clicks = 0;
    noteValRunnerTrigger(s, "click_loss");
    expect(s.turn.valClickLossTriggerCount).toBe(1);
    expect(s.turn.valClickLossTriggerPendingCounts).toEqual([1]);
    occurCheckpoint(
      s,
      "instruction",
      "Valley first click-loss",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.valClickLossTriggerPendingCounts).toEqual([]);
    expect(
      s.log.some((line) =>
        line.includes(
          "becomes pending — onFirstClickLossEachTurnExceptPaidAbility",
        ),
      ),
    ).toBe(true);
    expect(s.runner.clicks).toBe(1);
  });

  it("marks Valley first basic click-draw at 10.3.1a (phase 3 scanner)", async () => {
    const { noteValRunnerTrigger } = await import(
      "../src/effects/sansanValHooks.js"
    );
    const s = createInitialState();
    const visage = instantiateCard(
      "symmetrical-visage",
      "sv-1",
      "runner:installed",
    );
    s.cards["sv-1"] = visage;
    s.runner.installed = ["sv-1"];
    s.runner.credits = 0;
    noteValRunnerTrigger(s, "basic_click_draw");
    expect(s.turn.valBasicClickDrawTriggerCount).toBe(1);
    expect(s.turn.valBasicClickDrawTriggerPendingCounts).toEqual([1]);
    occurCheckpoint(
      s,
      "instruction",
      "Valley first basic click-draw",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.valBasicClickDrawTriggerPendingCounts).toEqual([]);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — onFirstBasicClickDrawEachTurn"),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);
  });

  it("marks first program install at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstProgramInstall } = await import(
      "../src/state/programHardwareInstall.js"
    );
    const s = createInitialState();
    const pad = instantiateCard("lilypad", "pad-1", "runner:installed");
    s.cards["pad-1"] = pad;
    s.runner.installed = ["pad-1"];
    noteFirstProgramInstall(s);
    expect(s.turn.firstProgramInstallMetPending).toBe(true);
    expect(s.turn.firstProgramInstallUsedThisTurn).toBe(false);
    occurCheckpoint(
      s,
      "instruction",
      "first program install",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstProgramInstallMetPending).toBe(false);
    expect(s.turn.firstProgramInstallUsedThisTurn).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first program install this turn"),
      ),
    ).toBe(true);
  });

  it("marks first virus install at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstVirusInstall } = await import(
      "../src/state/virusInstall.js"
    );
    const s = createInitialState();
    const avg = instantiateCard(
      "avgustina-ivanovskaya",
      "avg-1",
      "runner:installed",
    );
    s.cards["avg-1"] = avg;
    s.runner.installed = ["avg-1"];
    noteFirstVirusInstall(s);
    expect(s.turn.firstVirusInstallMetPending).toBe(true);
    occurCheckpoint(
      s,
      "instruction",
      "first virus install",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstVirusInstallUsedThisTurn).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first virus install this turn"),
      ),
    ).toBe(true);
  });

  it("marks Valley first successful run at 10.3.1a (phase 3 scanner)", async () => {
    const { noteValSuccessfulRunTrigger } = await import(
      "../src/effects/sansanValHooks.js"
    );
    const s = createInitialState();
    const id = s.cards[s.corp.identityId];
    id.onFirstSuccessfulRunThisTurn = fx.gainCredits("corp", 1);
    s.corp.credits = 0;
    noteValSuccessfulRunTrigger(s);
    expect(s.turn.valSuccessfulRunTriggerCount).toBe(1);
    expect(s.turn.valSuccessfulRunTriggerPendingCounts).toEqual([1]);
    occurCheckpoint(
      s,
      "instruction",
      "Valley first successful run",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.valSuccessfulRunTriggerPendingCounts).toEqual([]);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first successful run this turn"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);
  });

  it("marks first run begin at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstRunBegin } = await import(
      "../src/state/runBeginHooks.js"
    );
    const s = createInitialState();
    const tiered = instantiateCard(
      "tiered-subscription",
      "ts-1",
      "server:hq:root",
    );
    tiered.rezzed = true;
    s.cards["ts-1"] = tiered;
    s.servers.hq.root = ["ts-1"];
    s.corp.credits = 0;
    noteFirstRunBegin(s);
    expect(s.turn.firstRunBeginMetPending).toBe(true);
    expect(s.turn.runBeginThisTurnUsed).toBe(false);
    occurCheckpoint(
      s,
      "instruction",
      "first run begin",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstRunBeginMetPending).toBe(false);
    expect(s.turn.runBeginThisTurnUsed).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first run begin this turn"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);
  });

  it("marks first unsuccessful run at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstUnsuccessfulRun } = await import(
      "../src/state/unsuccessfulRunHooks.js"
    );
    const s = createInitialState();
    const john = instantiateCard(
      "john-masanori",
      "jm-1",
      "runner:installed",
    );
    s.cards["jm-1"] = john;
    s.runner.installed = ["jm-1"];
    s.runner.tags = 0;
    noteFirstUnsuccessfulRun(s);
    expect(s.turn.firstUnsuccessfulRunMetPending).toBe(true);
    occurCheckpoint(
      s,
      "instruction",
      "first unsuccessful run",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstUnsuccessfulRunMetPending).toBe(false);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first unsuccessful run this turn"),
      ),
    ).toBe(true);
    expect(s.runner.tags).toBe(1);
  });

  it("marks first successful HQ run at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstSuccessfulHqRun } = await import(
      "../src/state/firstSuccessfulRunHooks.js"
    );
    const s = createInitialState();
    const pw = instantiateCard("pan-weave", "pw-1", "runner:installed");
    s.cards["pw-1"] = pw;
    s.runner.installed = ["pw-1"];
    s.corp.credits = 5;
    s.runner.credits = 3;
    noteFirstSuccessfulHqRun(s);
    expect(s.turn.firstSuccessfulHqRunMetPending).toBe(true);
    occurCheckpoint(
      s,
      "instruction",
      "first successful HQ run",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstSuccessfulHqRunMetPending).toBe(false);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first successful HQ run this turn"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(4);
    expect(s.runner.credits).toBe(4);
  });

  it("marks Daredevil first-run ice-gte at 10.3.1a (phase 3 scanner)", async () => {
    const { noteDaredevilFirstRun } = await import(
      "../src/state/runBeginHooks.js"
    );
    const s = createInitialState();
    const dd = instantiateCard("daredevil", "dd-1", "runner:installed");
    s.cards["dd-1"] = dd;
    s.runner.installed = ["dd-1"];
    for (let i = 0; i < 3; i++) {
      const id = `stk-dd-${i}`;
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:stack");
      s.runner.deck.push(id);
    }
    const iceA = instantiateCard("ice-wall", "ice-a", "corp:remote-1:ice");
    const iceB = instantiateCard("ice-wall", "ice-b", "corp:remote-1:ice");
    s.cards["ice-a"] = iceA;
    s.cards["ice-b"] = iceB;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["ice-a", "ice-b"],
      root: [],
    };
    s.run = {
      attackedServerId: "remote-1",
      position: "approach",
      successful: null,
    } as never;
    const grip0 = s.runner.hand.length;
    noteDaredevilFirstRun(s);
    expect(s.turn.daredevilDrawMetPending).toBe(true);
    expect(s.turn.daredevilDrawUsedThisTurn).toBeFalsy();
    occurCheckpoint(
      s,
      "instruction",
      "daredevil first run",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.daredevilDrawMetPending).toBe(false);
    expect(s.turn.daredevilDrawUsedThisTurn).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes(
          "becomes pending — first run on server with 2 ice (draw 2)",
        ),
      ),
    ).toBe(true);
    expect(s.runner.hand.length).toBe(grip0 + 2);
  });

  it("marks first credit pool empty at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstCreditPoolEmpty } = await import(
      "../src/state/storedTriggers.js"
    );
    const s = createInitialState();
    const sol = instantiateCard("order-of-sol", "sol-1", "runner:installed");
    s.cards["sol-1"] = sol;
    s.runner.installed = ["sol-1"];
    s.runner.credits = 0;
    noteFirstCreditPoolEmpty(s);
    expect(s.turn.firstCreditPoolEmptyMetPending).toBe(true);
    expect(s.turn.runnerCreditPoolEmptyFiredThisTurn).toBe(false);
    occurCheckpoint(
      s,
      "instruction",
      "first credit pool empty",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.runnerCreditPoolEmptyFiredThisTurn).toBe(true);
    expect(s.turn.firstCreditPoolEmptyMetPending).toBe(false);
    expect(
      s.log.some((line) =>
        line.includes(
          "becomes pending — the Runner's credit pool is empty for the first time this turn",
        ),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);
    noteFirstCreditPoolEmpty(s);
    expect(s.turn.firstCreditPoolEmptyMetPending).toBe(false);
  });

  it("marks first reveal this turn at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstRevealThisTurn } = await import(
      "../src/state/miscConditionalHooks.js"
    );
    const s = createInitialState();
    const id = instantiateCard(
      "hyoubu-institute-absolute-clarity",
      "hy-1",
      "corp:identity",
    );
    s.cards["hy-1"] = id;
    s.corp.identityId = "hy-1";
    s.corp.credits = 0;
    noteFirstRevealThisTurn(s);
    expect(s.turn.firstRevealMetPending).toBe(true);
    expect(s.turn.firstRevealCreditUsedThisTurn).toBe(false);
    expect(s.corp.credits).toBe(0);
    occurCheckpoint(
      s,
      "instruction",
      "first reveal this turn",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstRevealCreditUsedThisTurn).toBe(true);
    expect(s.turn.firstRevealMetPending).toBe(false);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first reveal this turn"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);
    noteFirstRevealThisTurn(s);
    expect(s.turn.firstRevealMetPending).toBe(false);
  });

  it("marks first tag this turn at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstTagThisTurn } = await import(
      "../src/state/miscConditionalHooks.js"
    );
    const s = createInitialState();
    const id = instantiateCard("nbn-reality-plus", "nbn-1", "corp:identity");
    s.cards["nbn-1"] = id;
    s.corp.identityId = "nbn-1";
    s.corp.credits = 0;
    noteFirstTagThisTurn(s);
    expect(s.turn.firstTagThisTurnMetPending).toBe(true);
    expect(s.turn.firstTagThisTurnUsedThisTurn).toBe(false);
    expect(s.corp.credits).toBe(0);
    expect(s.pendingChoice).toBeFalsy();
    occurCheckpoint(
      s,
      "instruction",
      "first tag this turn",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstTagThisTurnUsedThisTurn).toBe(true);
    expect(s.turn.firstTagThisTurnMetPending).toBe(false);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first tag this turn"),
      ),
    ).toBe(true);
    expect(s.pendingChoice?.chooser).toBe("corp");
    noteFirstTagThisTurn(s);
    expect(s.turn.firstTagThisTurnMetPending).toBe(false);
  });

  it("marks first installed trash at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstInstalledTrashForReaver } = await import(
      "../src/state/trashHooks.js"
    );
    const s = createInitialState();
    const reaver = instantiateCard("reaver", "rv-1", "runner:installed");
    const top = instantiateCard("sure-gamble", "sg-1", "runner:stack");
    s.cards["rv-1"] = reaver;
    s.cards["sg-1"] = top;
    s.runner.installed = ["rv-1"];
    s.runner.deck = ["sg-1"];
    s.runner.hand = [];
    noteFirstInstalledTrashForReaver(s);
    expect(s.turn.firstInstalledTrashMetPending).toBe(true);
    expect(s.turn.mlReaverDrawUsedThisTurn).toBe(false);
    expect(s.runner.hand).toEqual([]);
    occurCheckpoint(
      s,
      "instruction",
      "first installed trash",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.mlReaverDrawUsedThisTurn).toBe(true);
    expect(s.turn.firstInstalledTrashMetPending).toBe(false);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first installed trash this turn"),
      ),
    ).toBe(true);
    expect(s.runner.hand).toEqual(["sg-1"]);
    noteFirstInstalledTrashForReaver(s);
    expect(s.turn.firstInstalledTrashMetPending).toBe(false);
  });

  it("marks first grip/stack trash batch at 10.3.1a (phase 3 scanner)", async () => {
    const s = createInitialState();
    const buf = instantiateCard("buffer-drive", "buf-1", "runner:installed");
    buf.onFirstGripOrStackTrashBatchEachTurn = fx.do({
      kind: "may_add_one_of_card_ids_to_stack_bottom",
    });
    const a = instantiateCard("sure-gamble", "a-1", "runner:heap");
    const b = instantiateCard("sure-gamble", "b-1", "runner:heap");
    s.cards["buf-1"] = buf;
    s.cards["a-1"] = a;
    s.cards["b-1"] = b;
    s.runner.installed = ["buf-1"];
    s.runner.discardPile = ["a-1", "b-1"];
    s.turn.pendingGripOrStackTrashBatchIds = ["a-1", "b-1"];
    s.turn.bufferDriveGripStackTrashMetPending = true;
    expect(s.turn.bufferDriveGripStackTrashUsedThisTurn).toBe(false);
    occurCheckpoint(
      s,
      "instruction",
      "first grip/stack trash batch",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.bufferDriveGripStackTrashUsedThisTurn).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes(
          "becomes pending — first grip/stack trash batch this turn",
        ),
      ),
    ).toBe(true);
    expect(
      s.pendingChoice?.options.some((o) => o.id === "batch-bottom:a-1"),
    ).toBe(true);
  });

  it("marks Corp flipped first operation play at 10.3.1a (phase 3 scanner)", async () => {
    const { fireCorpIdentityFlippedFirstOperationPlay } = await import(
      "../src/state/identityFlipHooks.js"
    );
    const s = createInitialState();
    const id = s.cards[s.corp.identityId];
    id.identityFlipped = true;
    id.identityFlippedHooks = {
      onFirstOperationPlayThisTurn: fx.addPowerCounter(1),
    };
    id.powerCounters = 0;
    fireCorpIdentityFlippedFirstOperationPlay(s);
    expect(s.turn.corpFlippedIdentityFirstOpMetPending).toBe(true);
    expect(s.turn.corpFlippedIdentityFirstOpUsedThisTurn).toBe(false);
    expect(id.powerCounters).toBe(0);
    occurCheckpoint(
      s,
      "instruction",
      "Corp flipped first operation play",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.corpFlippedIdentityFirstOpUsedThisTurn).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes(
          "becomes pending — first operation play while flipped",
        ),
      ),
    ).toBe(true);
    expect(id.powerCounters).toBe(1);
  });

  it("marks first trash matching Runner ID faction at 10.3.1a (phase 3 scanner)", async () => {
    const { noteTrashMatchingRunnerIdentityFaction } = await import(
      "../src/state/trashHooks.js"
    );
    const s = createInitialState();
    const id = s.cards[s.runner.identityId];
    id.faction = "anarch";
    const storgotic = instantiateCard(
      "storgotic-resonator",
      "stor-1",
      "server:remote-1:root",
    );
    storgotic.rezzed = true;
    storgotic.faceup = true;
    storgotic.onFirstTrashMatchingRunnerIdentityFactionEachTurn =
      fx.addPowerCounter(1);
    storgotic.powerCounters = 0;
    s.cards["stor-1"] = storgotic;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["stor-1"],
    };
    const trash = instantiateCard("sure-gamble", "trash-1", "corp:archives");
    trash.faction = "anarch";
    s.cards["trash-1"] = trash;
    noteTrashMatchingRunnerIdentityFaction(s, "trash-1");
    expect(s.turn.firstTrashMatchingRunnerIdentityFactionMetPending).toBe(
      true,
    );
    expect(
      s.turn.firstTrashMatchingRunnerIdentityFactionUsedThisTurn,
    ).toBe(false);
    expect(storgotic.powerCounters).toBe(0);
    occurCheckpoint(
      s,
      "instruction",
      "first trash matching Runner ID faction",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(
      s.turn.firstTrashMatchingRunnerIdentityFactionUsedThisTurn,
    ).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes(
          "becomes pending — first trash matching Runner identity faction",
        ),
      ),
    ).toBe(true);
    expect(storgotic.powerCounters).toBe(1);
  });

  it("marks first access trash at 10.3.1a (phase 3 scanner)", async () => {
    const { noteAccessTrash } = await import("../src/state/trashHooks.js");
    const s = createInitialState();
    const mache = instantiateCard("mache", "mache-1", "runner:installed");
    mache.onFirstAccessTrashEachTurn = fx.addPowerCounter(1);
    mache.powerCounters = 0;
    s.cards["mache-1"] = mache;
    s.runner.installed.push("mache-1");
    noteAccessTrash(s, 3);
    expect(s.turn.lastAccessTrashCost).toBe(3);
    expect(s.turn.firstAccessTrashMetPending).toBe(true);
    expect(s.turn.firstAccessTrashUsedThisTurn).toBe(false);
    expect(mache.powerCounters).toBe(0);
    occurCheckpoint(
      s,
      "instruction",
      "first access trash",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstAccessTrashUsedThisTurn).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first access trash this turn"),
      ),
    ).toBe(true);
    expect(mache.powerCounters).toBe(1);
  });

  it("marks first program/hardware trash at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstProgramOrHardwareTrashEachTurn } = await import(
      "../src/state/trashHooks.js"
    );
    const s = createInitialState();
    const district = instantiateCard(
      "district-99",
      "d99-1",
      "runner:installed",
    );
    district.onFirstProgramOrHardwareTrashEachTurn = fx.addPowerCounter(1);
    district.powerCounters = 0;
    s.cards["d99-1"] = district;
    s.runner.installed.push("d99-1");
    const prog = instantiateCard("sure-gamble", "prog-1", "runner:installed");
    prog.type = "program";
    s.cards["prog-1"] = prog;
    noteFirstProgramOrHardwareTrashEachTurn(s, "prog-1");
    expect(s.turn.firstProgramOrHardwareTrashMetPending).toBe(true);
    expect(s.turn.firstProgramOrHardwareTrashUsedThisTurn).toBe(false);
    expect(district.powerCounters).toBe(0);
    occurCheckpoint(
      s,
      "instruction",
      "first program/hardware trash",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstProgramOrHardwareTrashUsedThisTurn).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes(
          "becomes pending — first program/hardware trash this turn",
        ),
      ),
    ).toBe(true);
    expect(district.powerCounters).toBe(1);
  });

  it("marks first Corp card trash at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstCorpCardTrashEachTurn } = await import(
      "../src/state/trashHooks.js"
    );
    const s = createInitialState();
    const badge = instantiateCard(
      "solidarity-badge",
      "sb-1",
      "runner:installed",
    );
    badge.onFirstCorpCardTrashEachTurn = fx.addPowerCounter(1);
    badge.powerCounters = 0;
    s.cards["sb-1"] = badge;
    s.runner.installed.push("sb-1");
    noteFirstCorpCardTrashEachTurn(s);
    expect(s.turn.firstCorpCardTrashMetPending).toBe(true);
    expect(s.turn.firstCorpCardTrashUsedThisTurn).toBe(false);
    expect(badge.powerCounters).toBe(0);
    occurCheckpoint(
      s,
      "instruction",
      "first Corp card trash",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstCorpCardTrashUsedThisTurn).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes(
          "becomes pending — first Corp card trashed this turn",
        ),
      ),
    ).toBe(true);
    expect(badge.powerCounters).toBe(1);
  });

  it("marks first Runner steal/trash at 10.3.1a (phase 3 scanner)", async () => {
    const { noteRunnerStoleOrTrashedCorpCard } = await import(
      "../src/state/trashHooks.js"
    );
    const s = createInitialState();
    const id = s.cards[s.runner.identityId];
    id.onFirstRunnerStoleOrTrashedCorpCardThisTurn = fx.addPowerCounter(1);
    id.powerCounters = 0;
    noteRunnerStoleOrTrashedCorpCard(s);
    expect(s.turn.firstRunnerStoleOrTrashedMetPending).toBe(true);
    expect(s.turn.firstRunnerStoleOrTrashedUsedThisTurn).toBe(false);
    expect(id.powerCounters).toBe(0);
    occurCheckpoint(
      s,
      "instruction",
      "first Runner steal/trash",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstRunnerStoleOrTrashedUsedThisTurn).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes(
          "becomes pending — first Runner steal/trash of a Corp card this turn",
        ),
      ),
    ).toBe(true);
    expect(id.powerCounters).toBe(1);
  });

  it("marks first agenda scored/stolen at 10.3.1a (phase 3 scanner)", async () => {
    const { fireFirstAgendaScoredOrStolenThisTurn } = await import(
      "../src/state/agendaHooks.js"
    );
    const s = createInitialState();
    const asset = instantiateCard("pad-campaign", "pg-1", "server:remote-1:root");
    asset.rezzed = true;
    asset.faceup = true;
    asset.onFirstAgendaScoredOrStolenThisTurn = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    s.cards["pg-1"] = asset;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["pg-1"],
    };
    s.corp.credits = 0;
    fireFirstAgendaScoredOrStolenThisTurn(s);
    expect(s.turn.firstAgendaScoredOrStolenMetPending).toBe(true);
    expect(s.turn.firstAgendaScoredOrStolenUsedThisTurn).toBe(false);
    expect(s.corp.credits).toBe(0);
    occurCheckpoint(
      s,
      "instruction",
      "first agenda scored or stolen",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstAgendaScoredOrStolenUsedThisTurn).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes(
          "becomes pending — first agenda scored or stolen this turn",
        ),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);
  });

  it("marks A Teia normal remote install at 10.3.1a (phase 3 scanner)", async () => {
    const { noteFirstRemoteInstallThisTurn } = await import(
      "../src/state/trashHooks.js"
    );
    const s = createInitialState();
    const teia = instantiateCard("a-teia-ip-recovery", "teia-1", "corp:identity");
    teia.onFirstRemoteInstallThisTurn = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    s.cards["teia-1"] = teia;
    s.corp.identityId = "teia-1";
    s.corp.credits = 0;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: [],
    };
    noteFirstRemoteInstallThisTurn(s, "remote-1");
    expect(s.turn.firstRemoteInstallMetPending).toBe(true);
    expect(s.turn.firstRemoteInstallThisTurnUsed).toBe(true);
    expect(s.corp.credits).toBe(0);
    occurCheckpoint(
      s,
      "instruction",
      "a teia normal remote install",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstRemoteInstallMetPending).toBe(false);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first remote install this turn"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);
  });

  it("marks A Teia from zone diff after a swap onto a remote (CR 8.8.4b)", () => {
    const s = createInitialState();
    const teia = instantiateCard("a-teia-ip-recovery", "teia-1", "corp:identity");
    s.cards["teia-1"] = teia;
    s.corp.identityId = "teia-1";
    const tatu = instantiateCard("tatu-bola", "tb-1", "server:remote-1:ice");
    tatu.rezzed = true;
    tatu.faceup = true;
    const palisade = instantiateCard("palisade", "pal-1", "corp:hq");
    s.cards["tb-1"] = tatu;
    s.cards["pal-1"] = palisade;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: ["tb-1"],
      root: [],
    };
    s.corp.hand = ["pal-1"];
    commitCheckpointSnapshot(s, "before-swap");

    s.corp.hand = [];
    s.servers["remote-1"]!.ice = ["pal-1"];
    palisade.zone = "server:remote-1:ice";
    tatu.zone = "corp:hq";
    s.corp.hand = ["tb-1"];

    occurCheckpoint(
      s,
      "instruction",
      "Swap",
      [CR.swapBecomeInstalled],
      "tb-1",
    );
    expect(s.log.join("\n")).toContain(
      `A Teia: IP Recovery becomes pending (CR ${CR.swapBecomeInstalled.number})`,
    );
    expect(
      s.pendingAbilities.some((p) => p.payload?.kind === "swap_install_trigger"),
    ).toBe(true);
  });

  it("diffs exposure counts for Blackguard (CR 9.6.4b)", () => {
    const s = createInitialState();
    commitCheckpointSnapshot(s, "before-expose");
    expect(diffAgainstPreviousCheckpoint(s).exposedIds).toEqual([]);

    s.turn.exposureCounts = { "pad-1": 1, "iw-1": 1 };
    expect(diffAgainstPreviousCheckpoint(s).exposedIds).toEqual([
      "pad-1",
      "iw-1",
    ]);

    commitCheckpointSnapshot(s, "after-expose");
    s.turn.exposureCounts = { "pad-1": 2, "iw-1": 1 };
    expect(diffAgainstPreviousCheckpoint(s).exposedIds).toEqual(["pad-1"]);
  });

  it("offers root-access from zone diff when a card enters the breached root (CR 10.3.1j)", () => {
    const s = createInitialState();
    const pad = instantiateCard("pad-campaign", "pad-1", "corp:hq");
    s.cards["pad-1"] = pad;
    s.corp.hand = ["pad-1"];
    s.timing.structure = "breach";
    s.run = {
      attackedServerId: "hq",
      phase: "breach",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: 0,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    commitCheckpointSnapshot(s, "before-root-entry");

    s.corp.hand = [];
    s.servers.hq.root.push("pad-1");
    pad.zone = "server:hq:root";
    pad.rezzed = false;
    pad.faceup = false;

    occurCheckpoint(
      s,
      "instruction",
      "Install into a breached root",
      [CR.checkpointCardEnteringRoot],
      "test",
    );
    expect(s.pendingChoice?.options.map((o) => o.id)).toEqual([
      "root-access:yes:pad-1",
      "root-access:no:pad-1",
    ]);
    const added = applyAction(s, {
      type: "choose_option",
      optionId: "root-access:yes:pad-1",
    });
    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(added.state.run?.accessCandidates).toContain("pad-1");
    }
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

  it("cancels still-pending instances when the Runner source leaves play (CR 9.6.10)", () => {
    resetPendingAbilitySeqForTests();
    const s = createInitialState();
    const dealer = instantiateCard("drug-dealer", "dd-1", "runner:installed");
    s.cards["dd-1"] = dealer;
    s.runner.installed = ["dd-1"];
    const pending = createPendingAbilityInstance(s, {
      abilityKey: "on-turn-begin",
      sourceId: "dd-1",
      controller: "runner",
      mandatory: true,
    });
    const imminent = createPendingAbilityInstance(s, {
      abilityKey: "on-turn-begin-kept",
      sourceId: "dd-1",
      controller: "runner",
      mandatory: true,
    });
    markPendingAbilityImminent(s, imminent.id);

    moveRunnerCardToHeap(s, "dd-1");
    expect(pending.status).toBe("cancelled");
    expect(imminent.status).toBe("imminent");
    expect(
      s.log.some((line) => line.includes(CR.pendingAbilityInactive.number)),
    ).toBe(true);
  });

  it("cancels still-pending instances when the Corp source leaves play (CR 9.6.10)", () => {
    resetPendingAbilitySeqForTests();
    const s = createInitialState();
    const pad = instantiateCard("pad-campaign", "pad-1", "server:remote1:root");
    pad.rezzed = true;
    s.cards["pad-1"] = pad;
    s.servers.remote1 = {
      id: "remote1",
      root: ["pad-1"],
      ice: [],
    };
    const pending = createPendingAbilityInstance(s, {
      abilityKey: "on-turn-begin",
      sourceId: "pad-1",
      controller: "corp",
      mandatory: true,
    });
    const imminent = createPendingAbilityInstance(s, {
      abilityKey: "on-turn-begin-kept",
      sourceId: "pad-1",
      controller: "corp",
      mandatory: true,
    });
    markPendingAbilityImminent(s, imminent.id);

    trashCorpCardToArchives(s, "pad-1");
    expect(pending.status).toBe("cancelled");
    expect(imminent.status).toBe("imminent");
    expect(
      s.log.some((line) => line.includes(CR.pendingAbilityInactive.number)),
    ).toBe(true);
  });

  it("cancels still-pending instances when the source is blanked (CR 9.6.10)", async () => {
    resetPendingAbilitySeqForTests();
    const { blankAbilitiesUntilCorpTurnEnd } = await import(
      "../src/state/lingeringEffects.js"
    );
    const s = createInitialState();
    const dealer = instantiateCard("drug-dealer", "dd-1", "runner:installed");
    s.cards["dd-1"] = dealer;
    s.runner.installed = ["dd-1"];
    const pending = createPendingAbilityInstance(s, {
      abilityKey: "on-turn-begin",
      sourceId: "dd-1",
      controller: "runner",
      mandatory: true,
    });
    const imminent = createPendingAbilityInstance(s, {
      abilityKey: "on-turn-begin-kept",
      sourceId: "dd-1",
      controller: "runner",
      mandatory: true,
    });
    markPendingAbilityImminent(s, imminent.id);

    blankAbilitiesUntilCorpTurnEnd(s, {
      createdBy: s.corp.identityId,
      cardId: "dd-1",
    });
    expect(pending.status).toBe("cancelled");
    expect(imminent.status).toBe("imminent");
    expect(
      s.log.some((line) => line.includes(CR.pendingAbilityInactive.number)),
    ).toBe(true);
  });

  it("cancels Hostile Infrastructure pending when blanked before resolve (CR 9.6.10)", () => {
    resetPendingAbilitySeqForTests();
    const s = createInitialState();
    const hi = instantiateCard(
      "hostile-infrastructure",
      "hi-1",
      "server:remote-1:root",
    );
    hi.rezzed = true;
    s.cards["hi-1"] = hi;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["hi-1"],
    };
    const pending = createPendingAbilityInstance(s, {
      abilityKey: "hostile-infrastructure:net-on-trash",
      sourceId: "hi-1",
      controller: "corp",
      mandatory: true,
      payload: { kind: "net_damage_on_corp_trash", amount: 1 },
    });
    hi.abilitiesBlanked = true;
    cancelPendingIfSourceInactive(s);
    expect(pending.status).toBe("cancelled");
    expect(
      s.log.some((line) => line.includes(CR.pendingAbilityInactive.number)),
    ).toBe(true);
  });

  it("keeps leftover pending off a checkpoint that marks nothing (CR 10.3.2)", () => {
    resetPendingAbilitySeqForTests();
    const s = createInitialState();
    // Deferred leftover (Amaze-class): still pending from an earlier window.
    const leftover = createPendingAbilityInstance(s, {
      abilityKey: "amaze:run-ends",
      sourceId: s.corp.identityId,
      controller: "corp",
      mandatory: true,
      payload: { kind: "amaze_give_tags", amount: 1 },
    });

    occurCheckpoint(
      s,
      "instruction",
      "no new marks",
      [CR.checkpointConditionalAbilities],
      "test",
    );

    expect(
      s.log.some((line) =>
        line.includes("none marked pending, so it stays closed"),
      ),
    ).toBe(true);
    expect(s.reactionStack).toHaveLength(0);
    expect(s.pendingAbilities.find((p) => p.id === leftover.id)?.status).toBe(
      "pending",
    );
  });

  it("opens a reaction window only for newly marked pending (CR 9.2.8a / 10.3.2)", () => {
    resetPendingAbilitySeqForTests();
    const s = createInitialState();
    s.cards[s.corp.identityId]!.defId = "weyland-consortium-built-to-last";
    const asset = instantiateCard(
      "pad-campaign",
      "pad-1",
      "server:remote-1:root",
    );
    asset.rezzed = true;
    asset.advancementCounters = 0;
    s.cards["pad-1"] = asset;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      root: ["pad-1"],
      ice: [],
    };
    commitCheckpointSnapshot(s, "baseline");
    asset.advancementCounters = 1;

    const leftover = createPendingAbilityInstance(s, {
      abilityKey: "amaze:run-ends",
      sourceId: s.corp.identityId,
      controller: "corp",
      mandatory: true,
      payload: { kind: "amaze_give_tags", amount: 1 },
    });

    occurCheckpoint(
      s,
      "instruction",
      "built-to-last mark",
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
    // Newly marked Built to Last resolved; leftover Amaze stayed pending.
    expect(
      s.pendingAbilities.some(
        (p) => p.abilityKey === "built-to-last-had-no-advancement",
      ),
    ).toBe(false);
    expect(s.pendingAbilities.find((p) => p.id === leftover.id)?.status).toBe(
      "pending",
    );
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

  it("registers mark designation as a turn-duration lingering (CR 10.11.4)", async () => {
    resetLingeringSeqForTests();
    const { identifyMark } = await import("../src/state/msKeywords.js");
    const {
      LINGERING_KIND_MARK,
      lingeringEffectsOfKind,
    } = await import("../src/state/lingeringEffects.js");
    let s = createInitialState();
    identifyMark(s, s.runner.identityId);
    expect(s.markServerId).toBeTruthy();
    const marks = lingeringEffectsOfKind(s, LINGERING_KIND_MARK);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.duration).toEqual({ kind: "turn" });
    expect(marks[0]!.payload).toEqual({ serverId: s.markServerId });
    expect(marks[0]!.independent).toBe(true);
    expect(
      s.log.some((line) => line.includes(CR.markLingering.number)),
    ).toBe(true);

    s.timingKey = "runner.turnEnds";
    autoWalk(s);
    const passed = applyAction(s, { type: "pass_window" });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    s = passed.state;
    expect(s.markServerId).toBeNull();
    expect(lingeringEffectsOfKind(s, LINGERING_KIND_MARK)).toHaveLength(0);
  });

  it("registers run/encounter strength boosts as lingerings (CR 9.10.1)", async () => {
    resetLingeringSeqForTests();
    const {
      LINGERING_KIND_BREAKER_STRENGTH_RUN,
      LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER,
      LINGERING_KIND_ICE_STRENGTH_ENCOUNTER,
      lingeringEffectsOfKind,
      addBreakerStrengthBoostThisRun,
      addBreakerStrengthBoostThisEncounter,
      addIceStrengthBoostThisEncounter,
    } = await import("../src/state/lingeringEffects.js");
    const s = createInitialState();
    s.run = {
      attackedServerId: "hq",
      phase: "encounter",
      position: 0,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: {
        iceId: "ice-1",
        broken: [false],
        subroutinesResolved: [],
      },
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    addBreakerStrengthBoostThisRun(s, {
      createdBy: s.runner.identityId,
      breakerId: "br-1",
      amount: 2,
    });
    addBreakerStrengthBoostThisEncounter(s, {
      createdBy: s.runner.identityId,
      breakerId: "br-1",
      amount: 1,
    });
    addIceStrengthBoostThisEncounter(s, {
      createdBy: s.corp.identityId,
      iceId: "ice-1",
      amount: 3,
    });
    expect(s.run.strengthBoosts["br-1"]).toBe(2);
    expect(s.run.encounterStrengthBoosts["br-1"]).toBe(1);
    expect(s.run.iceStrengthBoosts["ice-1"]).toBe(3);
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_BREAKER_STRENGTH_RUN),
    ).toHaveLength(1);
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER),
    ).toHaveLength(1);
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_ICE_STRENGTH_ENCOUNTER),
    ).toHaveLength(1);

    expireLingeringEffects(s, { encounter: true });
    expect(s.run.strengthBoosts["br-1"]).toBe(2);
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_BREAKER_STRENGTH_ENCOUNTER),
    ).toHaveLength(0);
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_ICE_STRENGTH_ENCOUNTER),
    ).toHaveLength(0);
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_BREAKER_STRENGTH_RUN),
    ).toHaveLength(1);

    expireLingeringEffects(s, { run: true });
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_BREAKER_STRENGTH_RUN),
    ).toHaveLength(0);
  });

  it("registers until-checkpoint breaker boosts as lingerings (CR 9.10.1)", async () => {
    resetLingeringSeqForTests();
    const {
      LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT,
      lingeringEffectsOfKind,
      addBreakerStrengthBoostUntilCheckpoint,
    } = await import("../src/state/lingeringEffects.js");
    const s = createInitialState();
    addBreakerStrengthBoostUntilCheckpoint(s, {
      createdBy: s.runner.identityId,
      breakerId: "br-1",
      amount: 2,
    });
    expect(s.turn.checkpointBreakerBoosts?.["br-1"]).toBe(2);
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT),
    ).toHaveLength(1);

    expireLingeringEffects(s, { untilCheckpoint: true });
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_BREAKER_STRENGTH_CHECKPOINT),
    ).toHaveLength(0);
  });

  it("registers Corp-turn ability blanks as lingerings (CR 9.10.1)", async () => {
    resetLingeringSeqForTests();
    const {
      LINGERING_KIND_ABILITY_BLANK,
      lingeringEffectsOfKind,
      blankAbilitiesUntilCorpTurnEnd,
    } = await import("../src/state/lingeringEffects.js");
    let s = createInitialState();
    const res = instantiateCard("aesops-pawnshop", "res-1", "runner:installed");
    s.cards["res-1"] = res;
    s.runner.installed = ["res-1"];
    blankAbilitiesUntilCorpTurnEnd(s, {
      createdBy: s.corp.identityId,
      cardId: "res-1",
    });
    expect(s.cards["res-1"]!.abilitiesBlanked).toBe(true);
    expect(s.cards["res-1"]!.abilitiesBlankedCorpTurnsRemaining).toBe(1);
    const blanks = lingeringEffectsOfKind(s, LINGERING_KIND_ABILITY_BLANK);
    expect(blanks).toHaveLength(1);
    expect(blanks[0]!.duration).toEqual({ kind: "turn", side: "corp" });
    expect(blanks[0]!.payload).toEqual({ cardId: "res-1" });

    // Runner turn end does not clear Corp-scoped blanks.
    expireLingeringEffects(s, { turn: "runner" });
    expect(lingeringEffectsOfKind(s, LINGERING_KIND_ABILITY_BLANK)).toHaveLength(
      1,
    );
    expect(s.cards["res-1"]!.abilitiesBlanked).toBe(true);

    s.timingKey = "corp.turnEnds";
    autoWalk(s);
    const passed = applyAction(s, { type: "pass_window" });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    s = passed.state;
    expect(s.cards["res-1"]!.abilitiesBlanked).toBeFalsy();
    expect(s.cards["res-1"]!.abilitiesBlankedCorpTurnsRemaining).toBeUndefined();
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_ABILITY_BLANK),
    ).toHaveLength(0);
  });

  it("registers this-turn strength boosts as turn-duration lingerings (CR 9.10.1)", async () => {
    resetLingeringSeqForTests();
    const {
      LINGERING_KIND_BREAKER_STRENGTH,
      LINGERING_KIND_ICE_STRENGTH,
      lingeringEffectsOfKind,
      addBreakerStrengthBoostThisTurn,
      addIceStrengthBoostThisTurn,
    } = await import("../src/state/lingeringEffects.js");
    let s = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    addBreakerStrengthBoostThisTurn(s, {
      createdBy: s.runner.identityId,
      breakerId: "breaker-1",
      amount: 2,
    });
    addIceStrengthBoostThisTurn(s, {
      createdBy: s.corp.identityId,
      iceId: "ice-1",
      amount: 1,
    });
    expect(s.turn.breakerStrengthBoostsThisTurn["breaker-1"]).toBe(2);
    expect(s.turn.iceStrengthBoostsThisTurn["ice-1"]).toBe(1);
    expect(lingeringEffectsOfKind(s, LINGERING_KIND_BREAKER_STRENGTH)).toHaveLength(
      1,
    );
    expect(lingeringEffectsOfKind(s, LINGERING_KIND_ICE_STRENGTH)).toHaveLength(1);
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_BREAKER_STRENGTH)[0]!.payload,
    ).toEqual({ breakerId: "breaker-1", amount: 2 });
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_ICE_STRENGTH)[0]!.payload,
    ).toEqual({ iceId: "ice-1", amount: 1 });

    s.timingKey = "runner.turnEnds";
    autoWalk(s);
    const passed = applyAction(s, { type: "pass_window" });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    s = passed.state;
    expect(s.turn.breakerStrengthBoostsThisTurn).toEqual({});
    expect(s.turn.iceStrengthBoostsThisTurn).toEqual({});
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_BREAKER_STRENGTH),
    ).toHaveLength(0);
    expect(lingeringEffectsOfKind(s, LINGERING_KIND_ICE_STRENGTH)).toHaveLength(0);
  });

  it("registers runner MU modifiers as a Runner-turn lingering (CR 9.10.1)", async () => {
    resetLingeringSeqForTests();
    const {
      LINGERING_KIND_RUNNER_MU,
      lingeringEffectsOfKind,
    } = await import("../src/state/lingeringEffects.js");
    let s = createInitialState();
    const r = evalEffect(
      { state: s, sourceId: s.corp.identityId },
      {
        op: "do",
        action: { kind: "runner_mu_modifier_until_turn_end", delta: -2 },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.turn.runnerMuModifierUntilTurnEnd).toBe(-2);
    const mus = lingeringEffectsOfKind(s, LINGERING_KIND_RUNNER_MU);
    expect(mus).toHaveLength(1);
    expect(mus[0]!.duration).toEqual({ kind: "turn", side: "runner" });
    expect(mus[0]!.payload).toEqual({ delta: -2 });
    expect(mus[0]!.independent).toBe(true);

    // Corp turn end does not clear Runner-scoped MU.
    expireLingeringEffects(s, { turn: "corp" });
    expect(lingeringEffectsOfKind(s, LINGERING_KIND_RUNNER_MU)).toHaveLength(1);
    expect(s.turn.runnerMuModifierUntilTurnEnd).toBe(-2);

    s.timingKey = "runner.turnEnds";
    autoWalk(s);
    const passed = applyAction(s, { type: "pass_window" });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    s = passed.state;
    expect(s.turn.runnerMuModifierUntilTurnEnd).toBeUndefined();
    expect(lingeringEffectsOfKind(s, LINGERING_KIND_RUNNER_MU)).toHaveLength(0);
  });

  it("registers granted ice subtypes as a turn-duration lingering (CR 9.10.1)", async () => {
    resetLingeringSeqForTests();
    const {
      LINGERING_KIND_GRANTED_SUBTYPES,
      lingeringEffectsOfKind,
    } = await import("../src/state/lingeringEffects.js");
    let s = createInitialState();
    const ice = instantiateCard("ice-wall", "ice-1", "server:hq:ice");
    s.cards["ice-1"] = ice;
    s.servers.hq.ice = ["ice-1"];
    const r = evalEffect(
      { state: s, sourceId: s.runner.identityId },
      {
        op: "do",
        action: {
          kind: "grant_ice_subtypes_until_end_of_turn",
          cardId: "ice-1",
          subtypes: ["sentry", "code gate"],
        },
      },
    );
    expect(r.ok).toBe(true);
    expect(s.cards["ice-1"]!.grantedSubtypesUntilEndOfTurn).toEqual([
      "sentry",
      "code gate",
    ]);
    const grants = lingeringEffectsOfKind(s, LINGERING_KIND_GRANTED_SUBTYPES);
    expect(grants).toHaveLength(1);
    expect(grants[0]!.duration).toEqual({ kind: "turn" });
    expect(grants[0]!.payload).toEqual({
      cardId: "ice-1",
      subtypes: ["sentry", "code gate"],
    });
    expect(grants[0]!.independent).toBe(true);

    s.timingKey = "runner.turnEnds";
    autoWalk(s);
    const passed = applyAction(s, { type: "pass_window" });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    s = passed.state;
    expect(s.cards["ice-1"]!.grantedSubtypesUntilEndOfTurn).toBeUndefined();
    expect(
      lingeringEffectsOfKind(s, LINGERING_KIND_GRANTED_SUBTYPES),
    ).toHaveLength(0);
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

describe("simultaneous trash multiplicity (CR 9.12.2a)", () => {
  it("marks Hostile Infrastructure twice and Warroid once, then resolves via a reaction window", () => {
    let s = createInitialState();
    const hi = instantiateCard(
      "hostile-infrastructure",
      "hi-1",
      "server:remote-1:root",
    );
    hi.rezzed = true;
    hi.faceup = true;
    const warroid = instantiateCard(
      "warroid-tracker",
      "war-1",
      "server:remote-1:root",
    );
    warroid.rezzed = true;
    warroid.faceup = true;
    const sing = instantiateCard("singularity", "sing-1", "runner:play-area");
    for (const card of [hi, warroid, sing]) s.cards[card.id] = card;
    s.runner.hand = ["grip-0", "grip-1"];
    for (const id of s.runner.hand) {
      s.cards[id] = instantiateCard("sure-gamble", id, "runner:grip");
    }
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["hi-1", "war-1"],
    };
    s.run = {
      attackedServerId: "remote-1",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
    };
    s.activeSide = "runner";

    const opened = evalEffect(
      { state: s, sourceId: "sing-1" },
      fx.do({ kind: "breach_instead_singularity_trash_root" }),
    );
    expect(opened.ok).toBe(true);
    const r = applyAction(s, { type: "choose_option", optionId: "singularity" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;

    const hiPending = s.log.findIndex((line) =>
      line.includes(
        "Hostile Infrastructure remains active — 2 instances become pending",
      ),
    );
    const warPending = s.log.findIndex((line) =>
      line.includes(
        "Warroid Tracker — one instance becomes pending for this trash",
      ),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > hiPending && line.includes("Reaction window open"),
    );
    expect(hiPending).toBeGreaterThanOrEqual(0);
    expect(warPending).toBeGreaterThan(hiPending);
    expect(windowOpen).toBeGreaterThan(warPending);
    expect(s.log.filter((line) => line.startsWith("net damage 1:")).length).toBe(
      2,
    );
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
  });
});

describe("interrupt expected effects (CR 9.9.2)", () => {
  it("tracks expected tags and updates them as they are prevented", () => {
    const s = createInitialState();
    openPendingTags(s, 2, s.corp.identityId);
    expect(s.pendingTags?.expectedEffects?.tags).toEqual({ amount: 2 });
    preventPendingTags(s, 1);
    expect(s.pendingTags?.expectedEffects?.tags).toEqual({ amount: 1 });
  });

  it("tracks expected expose via the interrupt opener and clears it when prevented", async () => {
    const {
      beginExpose,
      preventPendingExpose,
    } = await import("../src/state/expose.js");
    const s = createInitialState();
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["zb", "hidden"],
    };
    const zb = instantiateCard(
      "zaibatsu-loyalty",
      "zb",
      "server:remote-1:root",
    );
    zb.rezzed = true;
    zb.faceup = true;
    s.cards["zb"] = zb;
    const hidden = instantiateCard(
      "melange-mining-corp",
      "hidden",
      "server:remote-1:root",
    );
    hidden.rezzed = false;
    hidden.faceup = false;
    s.cards["hidden"] = hidden;
    s.corp.credits = 5;
    expect(beginExpose(s, "hidden")).toBe("pending");
    expect(s.pendingExpose?.phase).toBe("interrupt");
    expect(s.pendingExpose?.expectedEffects?.exposeCardIds).toEqual(["hidden"]);
    preventPendingExpose(s, 1);
    expect(s.pendingExpose).toBeNull();
    expect(s.cards["hidden"]!.faceup).toBe(false);
  });

  it("tracks expected subroutine break and clears it when prevented", async () => {
    const { finalizePendingSubroutineBreak } = await import(
      "../src/actions/breakSubroutine.js"
    );
    const s = createInitialState();
    s.pendingSubroutineBreak = {
      iceId: "heim-1",
      subIndex: 0,
      expectedEffects: {
        breakSubroutine: { iceId: "heim-1", subIndex: 0 },
      },
    };
    expect(s.pendingSubroutineBreak.expectedEffects?.breakSubroutine).toEqual({
      iceId: "heim-1",
      subIndex: 0,
    });
    const closed = finalizePendingSubroutineBreak(s, true);
    expect(closed.ok).toBe(true);
    expect(s.pendingSubroutineBreak).toBeNull();
  });
});

describe("storedTriggers pending bag (CR 9.6.2)", () => {
  it("marks onAgendaScored pending when an agenda is scored", async () => {
    const { scoreAgendaAction } = await import("../src/actions/score.js");
    const s = createInitialState();
    const agenda = instantiateCard(
      "hostile-takeover",
      "ag-1",
      "server:remote-1:root",
    );
    agenda.advancementCounters = agenda.advancementRequirement ?? 2;
    const marrow = instantiateCard("marrow", "mar-1", "runner:installed");
    s.cards["ag-1"] = agenda;
    s.cards["mar-1"] = marrow;
    s.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ag-1"],
    };
    s.runner.installed = ["mar-1"];
    s.activeSide = "corp";
    s.timingKey = "corp.actionPaw";
    const result = scoreAgendaAction(s, "ag-1");
    expect(result.ok).toBe(true);
    expect(
      s.log.some(
        (line) => line.includes("Marrow") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks onEncounter pending when resolving a deferred encounter", async () => {
    const { resolvePendingOnEncounter } = await import(
      "../src/state/onEncounter.js"
    );
    const s = createInitialState();
    const ice = instantiateCard("pop-up-window", "pop-1", "server:hq:ice");
    ice.rezzed = true;
    s.cards["pop-1"] = ice;
    s.servers.hq.ice = ["pop-1"];
    s.run = {
      serverId: "hq",
      position: 0,
      successful: false,
      ended: false,
      encounter: {
        iceId: "pop-1",
        onEncounterPending: true,
        onEncounterPrevented: false,
      },
    } as typeof s.run;
    resolvePendingOnEncounter(s);
    expect(
      s.log.some(
        (line) =>
          line.includes("Pop-up Window") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks onFirstEmptyGrip pending when the grip empties", async () => {
    const { maybeFireFirstEmptyGripTriggers } = await import(
      "../src/state/damage.js"
    );
    const s = createInitialState();
    const respiro = instantiateCard(
      "respirocytes",
      "resp-1",
      "runner:installed",
    );
    s.cards["resp-1"] = respiro;
    s.runner.installed = ["resp-1"];
    s.runner.hand = [];
    maybeFireFirstEmptyGripTriggers(s);
    expect(
      s.log.some(
        (line) =>
          line.includes("Respirocytes") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks onTrash pending when a Runner card hits the heap", async () => {
    const { moveRunnerCardToHeap } = await import("../src/state/trashHooks.js");
    const s = createInitialState();
    const rolodex = instantiateCard("rolodex", "rolo-1", "runner:installed");
    s.cards["rolo-1"] = rolodex;
    s.runner.installed = ["rolo-1"];
    moveRunnerCardToHeap(s, "rolo-1");
    expect(
      s.log.some(
        (line) => line.includes("Rolodex") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks first Corp card / root install at 10.3.1a (phase 3 scanner)", async () => {
    const {
      noteFirstCorpCardInstallEachTurn,
      noteFirstCorpRootInstallEachTurn,
    } = await import("../src/state/trashHooks.js");

    const s = createInitialState();
    const asa = instantiateCard(
      "asa-group-security-through-vigilance",
      "asa-1",
      "corp:identity",
    );
    asa.onFirstCorpCardInstallEachTurn = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    const lago = instantiateCard("lago-paranoa-shelter", "lago-1", "runner:installed");
    lago.onFirstCorpRootInstallEachTurn = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    s.cards["asa-1"] = asa;
    s.cards["lago-1"] = lago;
    s.corp.identityId = "asa-1";
    s.runner.installed = ["lago-1"];
    s.corp.credits = 0;
    s.runner.credits = 0;

    noteFirstCorpCardInstallEachTurn(s);
    noteFirstCorpRootInstallEachTurn(s);
    expect(s.turn.firstCorpCardInstallMetPending).toBe(true);
    expect(s.turn.firstCorpRootInstallMetPending).toBe(true);
    expect(s.corp.credits).toBe(0);
    expect(s.runner.credits).toBe(0);

    occurCheckpoint(
      s,
      "instruction",
      "first corp install family",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstCorpCardInstallUsedThisTurn).toBe(true);
    expect(s.turn.firstCorpRootInstallUsedThisTurn).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first Corp card install this turn"),
      ),
    ).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes("becomes pending — first Corp root install this turn"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);
    expect(s.runner.credits).toBe(1);
  });

  it("marks MirrorMorph pending on the third distinct Corp action", async () => {
    const { noteCorpActionType } = await import(
      "../src/state/corpActionHooks.js"
    );
    const s = createInitialState();
    const morph = instantiateCard(
      "mirrormorph-endless-iteration",
      "mm-1",
      "corp:identity",
    );
    s.cards["mm-1"] = morph;
    s.corp.identityId = "mm-1";
    s.activeSide = "corp";
    noteCorpActionType(s, "draw");
    noteCorpActionType(s, "gain");
    noteCorpActionType(s, "click_ability");
    expect(s.turn.mirrormorphThirdDistinctMetPending).toBe(true);
    expect(s.turn.mirrormorphThirdDistinctFiredThisTurn).toBe(false);
    occurCheckpoint(
      s,
      "instruction",
      "mirrormorph third distinct",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    const pending = s.log.findIndex((line) =>
      line.includes("MirrorMorph") && line.includes("becomes pending"),
    );
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(s.turn.mirrormorphThirdDistinctFiredThisTurn).toBe(true);
    expect(s.log.some((line) => line.includes("Reaction window open"))).toBe(
      true,
    );
  });

  it("marks Jackpot! pending when an agenda is added to the Runner score area", async () => {
    const { fireOnAgendaAddedToRunnerScore } = await import(
      "../src/state/trashHooks.js"
    );
    const s = createInitialState();
    const jackpot = instantiateCard("jackpot", "jp-1", "runner:installed");
    const agenda = instantiateCard("hostile-takeover", "ht-1", "runner:score");
    s.cards["jp-1"] = jackpot;
    s.cards["ht-1"] = agenda;
    s.runner.installed = ["jp-1"];
    s.runner.scoreArea = ["ht-1"];
    s.runner.credits = 0;

    fireOnAgendaAddedToRunnerScore(s);

    const pending = s.log.findIndex((line) =>
      line.includes("Jackpot! becomes pending"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > pending && line.includes("Reaction window open"),
    );
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(windowOpen).toBeGreaterThan(pending);
    expect(s.pendingAbilities).toHaveLength(0);
  });

  it("marks NeoTokyo Grid pending on the first advancement in its server", () => {
    let s = createInitialState();
    const grid = instantiateCard("neotokyo-grid", "neo-1", "server:hq:root");
    grid.rezzed = true;
    const agenda = instantiateCard(
      "priority-requisition",
      "ag-1",
      "server:hq:root",
    );
    s.cards["neo-1"] = grid;
    s.cards["ag-1"] = agenda;
    s.servers.hq.root = ["neo-1", "ag-1"];
    s.corp.credits = 5;
    s.corp.clicks = 2;
    s.activeSide = "corp";
    s.timingKey = "corp.action";
    const r = applyAction(s, { type: "advance", cardId: "ag-1" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;

    const pending = s.log.findIndex((line) =>
      line.includes("NeoTokyo Grid becomes pending"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > pending && line.includes("Reaction window open"),
    );
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(windowOpen).toBeGreaterThan(pending);
    expect(s.corp.credits).toBe(5);
    expect(s.pendingAbilities).toHaveLength(0);
  });
});

describe("Bug on Corp draw pending (CR 8.4.1)", () => {
  it("marks Bug pending when the Corp draws, then opens its may-pay choice", () => {
    const s = createInitialState();
    const bug = instantiateCard("bug", "bug-1", "runner:installed");
    const top = instantiateCard("hedge-fund", "hf-1", "corp:rd");
    s.cards["bug-1"] = bug;
    s.cards["hf-1"] = top;
    s.runner.installed = ["bug-1"];
    s.corp.deck = ["hf-1"];
    s.corp.hand = [];
    s.runner.credits = 5;

    const drawn = evalEffect(
      { state: s, sourceId: "bug-1" },
      fx.do({ kind: "draw", side: "corp", amount: 1 }),
    );
    expect(drawn.ok).toBe(true);

    const pending = s.log.findIndex((line) =>
      line.includes("Bug becomes pending"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > pending && line.includes("Reaction window open"),
    );
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(s.log[pending]).toContain(CR.drawing.number);
    expect(windowOpen).toBeGreaterThan(pending);
    expect(s.pendingChoice?.chooser).toBe("runner");
    expect(s.turn.pendingCorpDrawnCardId).toBe("hf-1");
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
  });
});

describe("Amaze run-end pending (CR 9.12.5d)", () => {
  it("marks Amaze pending at run end and gives tags in a reaction window", () => {
    const s = createInitialState();
    const amaze = instantiateCard(
      "amaze-amusements",
      "amaze-1",
      "corp:archives",
    );
    amaze.rezzed = false;
    amaze.faceup = true;
    s.cards["amaze-1"] = amaze;
    s.corp.discardPile.push("amaze-1");
    s.runner.tags = 0;
    s.run = {
      attackedServerId: "hq",
      phase: "success",
      position: null,
      successful: true,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      agendasStolenThisRun: 1,
      persistentTagsIfAgendaStolen: 2,
      persistentAmazeSourceId: "amaze-1",
    };
    enterStep(s, "run.ends");
    autoWalk(s);

    const persists = s.log.findIndex((line) =>
      line.includes("persists for this run end"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > persists && line.includes("Reaction window open"),
    );
    expect(persists).toBeGreaterThanOrEqual(0);
    expect(s.log[persists]).toContain(CR.persistentAbility.number);
    expect(windowOpen).toBeGreaterThan(persists);
    expect(s.runner.tags).toBe(2);
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
    expect(s.run).toBeNull();
  });
});

describe("Chum run-ends pending (CR 6.8.5)", () => {
  it("resolves Chum pending net damage in a reaction window at run complete", () => {
    const s = createInitialState();
    const chum = instantiateCard("chum", "chum-1", "server:hq:ice");
    chum.rezzed = true;
    s.cards["chum-1"] = chum;
    s.servers.hq.ice = ["chum-1"];
    s.runner.hand = [
      "runner-program-1",
      "runner-fill-1",
      "runner-fill-2",
      "runner-fill-3",
    ];
    createPendingAbilityInstance(s, {
      abilityKey: "chum:net-on-run-end",
      sourceId: "chum-1",
      controller: "corp",
      mandatory: true,
      payload: { kind: "chum_net_damage", amount: 3 },
    });
    s.run = {
      attackedServerId: "hq",
      phase: "ends",
      position: null,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: true,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      lastEncounteredIceId: "wall-1",
    };
    enterStep(s, "run.declareUnsuccessful");
    autoWalk(s);

    const windowOpen = s.log.findIndex((line) =>
      line.includes("Reaction window open"),
    );
    expect(windowOpen).toBeGreaterThanOrEqual(0);
    expect(s.log.some((line) => line.includes("net damage 3"))).toBe(true);
    expect(s.runner.hand).toHaveLength(1);
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
    expect(s.run).toBeNull();
  });

  it("drops Chum pending when Chum is blanked before run end (CR 9.6.10)", () => {
    const s = createInitialState();
    const chum = instantiateCard("chum", "chum-1", "server:hq:ice");
    chum.rezzed = true;
    s.cards["chum-1"] = chum;
    s.servers.hq.ice = ["chum-1"];
    s.runner.hand = [
      "runner-program-1",
      "runner-fill-1",
      "runner-fill-2",
      "runner-fill-3",
    ];
    const pending = createPendingAbilityInstance(s, {
      abilityKey: "chum:net-on-run-end",
      sourceId: "chum-1",
      controller: "corp",
      mandatory: true,
      payload: { kind: "chum_net_damage", amount: 3 },
    });
    chum.abilitiesBlanked = true;
    s.run = {
      attackedServerId: "hq",
      phase: "ends",
      position: null,
      successful: false,
      accessedCardIds: [],
      accessCandidates: [],
      randomAccessLimit: null,
      encounter: null,
      endedTheRun: true,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      lastEncounteredIceId: "chum-1",
    };
    enterStep(s, "run.declareUnsuccessful");
    autoWalk(s);

    expect(pending.status).toBe("cancelled");
    expect(s.runner.hand).toHaveLength(4);
    expect(
      s.log.some((line) => line.includes(CR.pendingAbilityInactive.number)),
    ).toBe(true);
  });
});

describe("Geist chain reaction pending (CR 9.1.2a)", () => {
  it("marks Geist pending after a trash cost, then draws in a nested reaction window", async () => {
    const { resolveGeistAfterTrashCost } = await import(
      "../src/actions/paidAbility.js"
    );
    const s = createInitialState();
    const geist = instantiateCard(
      "armand-geist-walker-tech-lord",
      "geist-1",
      "runner:identity",
    );
    const decoy = instantiateCard("decoy", "decoy-1", "runner:installed");
    const top = instantiateCard("sure-gamble", "stack-1", "runner:stack");
    s.cards["geist-1"] = geist;
    s.cards["decoy-1"] = decoy;
    s.cards["stack-1"] = top;
    s.runner.identityId = "geist-1";
    s.runner.installed = ["decoy-1"];
    s.runner.hand = [];
    s.runner.deck = ["stack-1"];

    resolveGeistAfterTrashCost(s, decoy, { trashSelf: true });

    const pending = s.log.findIndex(
      (line) => line.includes("Geist") && line.includes("becomes pending"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) => i > pending && line.includes("Reaction window open"),
    );
    const aside = s.log.findIndex(
      (line, i) => i > windowOpen && line.includes("Set aside 1"),
    );
    const windowClose = s.log.findIndex(
      (line, i) => i > aside && line.includes("Reaction window close"),
    );
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(s.log[pending]).toContain(CR.chainReaction.number);
    expect(windowOpen).toBeGreaterThan(pending);
    expect(aside).toBeGreaterThan(windowOpen);
    expect(windowClose).toBeGreaterThan(aside);
    expect(s.runner.hand).toEqual(["stack-1"]);
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
  });
});

describe("search pending (CR 8.7.5)", () => {
  it("marks Personality Profiles pending after shuffle, then trashes before the found card is revealed", () => {
    let s = createInitialState();
    const profiles = instantiateCard("personality-profiles", "pp-1", "corp:score");
    const ev = instantiateCard("special-order", "so-1", "runner:grip");
    const gamble = instantiateCard("sure-gamble", "sg-1", "runner:grip");
    const breaker = instantiateCard("corroder", "co-1", "runner:stack");
    s.cards["pp-1"] = profiles;
    s.cards["so-1"] = ev;
    s.cards["sg-1"] = gamble;
    s.cards["co-1"] = breaker;
    s.corp.scoreArea = ["pp-1"];
    s.runner.hand = ["so-1", "sg-1"];
    s.runner.deck = ["co-1"];
    s.runner.credits = 5;
    s.runner.clicks = 1;
    s.activeSide = "runner";
    s.timingKey = "runner.takeAction";

    let r = applyAction(s, { type: "play_event", cardId: "so-1" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    r = applyAction(s, { type: "choose_option", optionId: "search-find:co-1" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;

    const shuffled = s.log.findIndex((line) => line.includes("Stack shuffled"));
    const pending = s.log.findIndex((line) =>
      line.includes("Personality Profiles becomes pending"),
    );
    const windowOpen = s.log.findIndex(
      (line, i) =>
        i > pending && line.includes("Reaction window open"),
    );
    const trashed = s.log.findIndex((line) =>
      line.includes("trashes Sure Gamble from grip"),
    );
    expect(shuffled).toBeGreaterThanOrEqual(0);
    expect(pending).toBeGreaterThan(shuffled);
    expect(windowOpen).toBeGreaterThan(pending);
    expect(trashed).toBeGreaterThan(windowOpen);
    expect(s.log[pending]).toContain(CR.searchCondition.number);
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
  });
});

describe("card lifecycle conditionals pending (CR 9.6.2)", () => {
  it("marks onInstall / onRez / onPlay / onAccess / onBreakSubroutine / onBypass pending", async () => {
    const {
      fireOnAccess,
      fireOnBreakSubroutineTriggers,
      fireOnInstall,
      fireOnPlay,
      fireOnRez,
    } = await import("../src/state/cardLifecycleHooks.js");
    const { fireOnBypassTriggers } = await import("../src/state/iceRezHooks.js");

    const s = createInitialState();
    const asset = instantiateCard("pad-campaign", "pad-1", "server:hq:root");
    asset.onInstall = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    asset.onRez = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    asset.onPlay = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    asset.onAccess = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    asset.onBypass = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    const breaker = instantiateCard("corroder", "cor-1", "runner:installed");
    breaker.onBreakSubroutine = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    s.cards["pad-1"] = asset;
    s.cards["cor-1"] = breaker;
    s.servers.hq.root = ["pad-1"];
    s.runner.installed = ["cor-1"];
    s.corp.credits = 0;
    s.runner.credits = 0;

    fireOnInstall(s, "pad-1");
    expect(
      s.log.some((line) => line.includes("PAD Campaign becomes pending — installed")),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);

    fireOnRez(s, "pad-1");
    expect(
      s.log.some((line) => line.includes("PAD Campaign becomes pending — rezzed")),
    ).toBe(true);
    expect(s.corp.credits).toBe(2);

    fireOnPlay(s, "pad-1");
    expect(
      s.log.some((line) => line.includes("PAD Campaign becomes pending — played")),
    ).toBe(true);
    expect(s.corp.credits).toBe(3);

    fireOnAccess(s, "pad-1");
    expect(
      s.log.some((line) => line.includes("PAD Campaign becomes pending — accessed")),
    ).toBe(true);
    expect(s.corp.credits).toBe(4);

    fireOnBreakSubroutineTriggers(s);
    expect(
      s.log.some((line) =>
        line.includes("Corroder becomes pending — subroutine broken"),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);

    fireOnBypassTriggers(s, "pad-1");
    expect(
      s.log.some((line) => line.includes("PAD Campaign becomes pending — bypassed")),
    ).toBe(true);
    expect(s.corp.credits).toBe(5);
    expect(s.pendingAbilities).toHaveLength(0);
    expect(s.reactionStack).toHaveLength(0);
  });

  it("marks onSteal / onStealAgenda / onFullyBreak / onEncounterEnd / onScore pending", async () => {
    const {
      fireAfterAgendaStolenHooks,
      fireOnEncounterEnd,
      fireOnFullyBreak,
      fireOnScore,
      fireOnSteal,
    } = await import("../src/state/cardLifecycleHooks.js");

    const s = createInitialState();
    const agenda = instantiateCard("hostile-takeover", "ht-1", "runner:score");
    agenda.onSteal = fx.do({ kind: "gain_credits", side: "runner", amount: 1 });
    agenda.onScore = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    const maemi = instantiateCard("mystic-maemi", "mm-1", "runner:installed");
    maemi.onStealAgenda = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    const ice = instantiateCard("ice-wall", "iw-1", "server:hq:ice");
    ice.onFullyBreak = fx.do({ kind: "gain_credits", side: "corp", amount: 1 });
    ice.onEncounterEnd = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    s.cards["ht-1"] = agenda;
    s.cards["mm-1"] = maemi;
    s.cards["iw-1"] = ice;
    s.runner.scoreArea = ["ht-1"];
    s.runner.installed = ["mm-1"];
    s.servers.hq.ice = ["iw-1"];
    s.corp.credits = 0;
    s.runner.credits = 0;

    fireOnSteal(s, "ht-1");
    expect(
      s.log.some((line) => line.includes("Hostile Takeover becomes pending — stolen")),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);

    fireAfterAgendaStolenHooks(s, "ht-1");
    expect(
      s.log.some((line) => line.includes("Mystic Maemi becomes pending — agenda stolen")),
    ).toBe(true);
    expect(s.runner.credits).toBe(2);

    fireOnFullyBreak(s, "iw-1");
    expect(
      s.log.some((line) =>
        line.includes("Ice Wall becomes pending — ice fully broken"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);

    fireOnEncounterEnd(s, "iw-1");
    expect(
      s.log.some((line) =>
        line.includes("Ice Wall becomes pending — encounter ends"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(2);

    fireOnScore(s, "ht-1");
    expect(
      s.log.some((line) => line.includes("Hostile Takeover becomes pending — scored")),
    ).toBe(true);
    expect(s.corp.credits).toBe(3);
    expect(s.pendingAbilities).toHaveLength(0);
  });
});

describe("inline flag conditionals pending (CR 9.6.2)", () => {
  it("marks Franchise City / Builder of Nations / Caïssa pending", async () => {
    const { fireInlineConditional } = await import(
      "../src/state/storedTriggers.js"
    );

    const s = createInitialState();
    const city = instantiateCard("franchise-city", "fc-1", "server:hq:root");
    city.addSelfToCorpScoreOnAgendaAccess = { agendaPoints: 1 };
    city.rezzed = true;
    const bon = instantiateCard(
      "weyland-consortium-builder-of-nations",
      "bon-1",
      "corp:identity",
    );
    bon.firstAdvancedIceEncounterEndMeatDamageEachTurn = true;
    const caissa = instantiateCard("imp", "imp-1", "runner:installed");
    caissa.caissaAdvanceOnSuccessfulRun = true;
    caissa.hostId = "iw-1";
    s.cards["fc-1"] = city;
    s.cards["bon-1"] = bon;
    s.cards["imp-1"] = caissa;
    s.corp.identityId = "bon-1";
    s.servers.hq.root = ["fc-1"];
    s.runner.installed = ["imp-1"];

    fireInlineConditional(
      s,
      "fc-1",
      {
        op: "do",
        action: { kind: "add_to_corp_score_as_agenda", agendaPoints: 1 },
      },
      "add-self-to-corp-score-on-agenda-access",
      `${city.title} becomes pending — agenda accessed (add self to Corp score).`,
      "corp",
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Franchise City") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "bon-1",
      { op: "do", action: { kind: "meat_damage", amount: 1 } },
      "first-advanced-ice-encounter-end-meat",
      `${bon.title} becomes pending — first advanced ice encounter ends (meat damage).`,
      "corp",
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Builder of Nations") &&
          line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "imp-1",
      {
        op: "do",
        action: { kind: "advance_caissa_host_inward_or_install" },
      },
      "caissa-advance-on-successful-run",
      `${caissa.title} becomes pending — successful run (Caïssa advance).`,
    );
    expect(
      s.log.some(
        (line) => line.includes("Imp") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks on-advance flag hooks pending via inline_conditional", async () => {
    const { fireInlineConditional } = await import(
      "../src/state/storedTriggers.js"
    );

    const s = createInitialState();
    const card = instantiateCard("pad-campaign", "pad-1", "server:remote1:root");
    card.creditsOnAdvance = { default: 1 };
    card.placeAdvancementOnAnotherOnAdvance = { default: 1 };
    s.cards["pad-1"] = card;
    s.servers.remote1 = { ice: [], root: ["pad-1"] } as (typeof s.servers)["hq"];

    fireInlineConditional(
      s,
      "pad-1",
      { op: "do", action: { kind: "gain_credits", side: "corp", amount: 1 } },
      "credits-on-advance",
      `${card.title} becomes pending — advanced (gain 1¢).`,
      "corp",
    );
    expect(
      s.log.some(
        (line) =>
          line.includes(card.title) && line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "pad-1",
      {
        op: "do",
        action: { kind: "place_advancement_on_another_on_advance", amount: 1 },
      },
      "place-advancement-on-another-on-advance",
      `${card.title} becomes pending — advanced (may place advancement on another).`,
      "corp",
    );
    expect(
      s.log.filter((line) => line.includes("becomes pending")).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("marks mandatory flag conditionals pending via inline_conditional", async () => {
    const { fireInlineConditional } = await import(
      "../src/state/storedTriggers.js"
    );

    const s = createInitialState();
    const alg = instantiateCard("algernon", "alg-1", "runner:installed");
    alg.trashAtTurnEndUnlessSuccessfulRun = true;
    const dd = instantiateCard("daredevil", "dd-1", "runner:installed");
    dd.drawOnFirstRunEachTurnIfServerIceGte = { ice: 2, draw: 2 };
    s.cards["alg-1"] = alg;
    s.cards["dd-1"] = dd;
    s.runner.installed = ["alg-1", "dd-1"];

    fireInlineConditional(
      s,
      "alg-1",
      { op: "do", action: { kind: "trash_self" } },
      "trash-at-turn-end-unless-successful-run",
      `${alg.title} becomes pending — turn end (trash unless successful run).`,
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Algernon") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "dd-1",
      { op: "do", action: { kind: "draw", side: "runner", amount: 2 } },
      "daredevil-draw-on-first-run-ice-gte",
      `${dd.title} becomes pending — first run on server with 2 ice (draw 2).`,
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Daredevil") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks encounter/run may flag hooks pending via inline_conditional", async () => {
    const { fireInlineConditional } = await import(
      "../src/state/storedTriggers.js"
    );

    const s = createInitialState();
    const paperclip = instantiateCard("paperclip", "pc-1", "runner:heap");
    paperclip.mayInstallSelfFromHeapOnEncounterBarrier = true;
    const sifr = instantiateCard("sifr", "sifr-1", "runner:installed");
    sifr.sifrMayZeroEncounterIceStrengthOncePerTurn = true;
    const nero = instantiateCard(
      "nero-severn-information-broker",
      "nero-1",
      "runner:identity",
    );
    nero.mayJackOutOnEncounterSentryOncePerTurn = true;
    const aeneas = instantiateCard("aeneas-informant", "ae-1", "runner:installed");
    aeneas.aeneasInformantRevealGainOnAccessWithoutTrash = true;
    s.cards["pc-1"] = paperclip;
    s.cards["sifr-1"] = sifr;
    s.cards["nero-1"] = nero;
    s.cards["ae-1"] = aeneas;
    s.runner.identityId = "nero-1";
    s.runner.discardPile = ["pc-1"];
    s.runner.installed = ["sifr-1", "ae-1"];

    fireInlineConditional(
      s,
      "pc-1",
      {
        op: "choose",
        chooser: "runner",
        options: [
          {
            id: "install",
            label: "Install Paperclip from heap",
            effect: {
              op: "do",
              action: { kind: "install_heap_card", cardId: "pc-1", discount: 0 },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
        ],
      },
      "paperclip-heap-install-on-encounter-barrier",
      `${paperclip.title} becomes pending — encounter (may install from heap).`,
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Paperclip") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "sifr-1",
      {
        op: "choose",
        chooser: "runner",
        options: [
          {
            id: "sifr-accept",
            label: "Şifr accept",
            effect: {
              op: "do",
              action: { kind: "sifr_zero_encounter_ice_strength" },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
        ],
      },
      "sifr-may-zero-encounter-ice-strength",
      `${sifr.title} becomes pending — encounter (may zero ice strength).`,
    );
    expect(
      s.log.some(
        (line) => line.includes("Şifr") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "nero-1",
      { op: "do", action: { kind: "offer_jack_out" } },
      "nero-may-jack-out-on-encounter-sentry",
      `${nero.title} becomes pending — encounter sentry (may jack out).`,
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Nero Severn") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "ae-1",
      {
        op: "do",
        action: { kind: "may_reveal_aeneas_gain_one", cardId: "x-1" },
      },
      "aeneas-may-reveal-gain-on-access-without-trash",
      `${aeneas.title} becomes pending — access without trash (may reveal and gain).`,
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Aeneas Informant") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks Top Hat / Analog Dreamers / Puppet Master / Dedicated Neural Net pending", async () => {
    const { fireInlineConditional } = await import(
      "../src/state/storedTriggers.js"
    );

    const s = createInitialState();
    const hat = instantiateCard("top-hat", "th-1", "runner:installed");
    hat.mayInsteadOfBreachRdAccessOneOfTopN = 3;
    const ad = instantiateCard("analog-dreamers", "ad-1", "runner:installed");
    const pm = instantiateCard("puppet-master", "pm-1", "corp:score-area");
    pm.onSuccessfulRunMayPlaceAdvancementOnCanBeAdvanced = true;
    const dnn = instantiateCard(
      "dedicated-neural-net",
      "dnn-1",
      "corp:score-area",
    );
    dnn.firstSuccessfulHqRunEachTurnPsiCorpChoosesAccess = true;
    s.cards["th-1"] = hat;
    s.cards["ad-1"] = ad;
    s.cards["pm-1"] = pm;
    s.cards["dnn-1"] = dnn;
    s.runner.installed = ["th-1", "ad-1"];
    s.corp.scoreArea = ["pm-1", "dnn-1"];

    fireInlineConditional(
      s,
      "th-1",
      {
        op: "do",
        action: { kind: "top_hat_may_instead_of_breach", n: 3 },
      },
      "top-hat-may-instead-of-breach",
      `${hat.title} becomes pending — successful R&D run (may instead of breach).`,
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Top Hat") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "ad-1",
      {
        op: "do",
        action: { kind: "may_breach_instead_analog_dreamers" },
      },
      "analog-dreamers-may-instead-of-breach",
      `${ad.title} becomes pending — successful R&D run (may instead of breach).`,
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Analog Dreamers") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "pm-1",
      {
        op: "do",
        action: { kind: "tlm_puppet_master_place_advancement" },
      },
      "puppet-master-place-advancement-on-successful-run",
      `${pm.title} becomes pending — successful run (may place advancement).`,
      "corp",
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Puppet Master") && line.includes("becomes pending"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "dnn-1",
      {
        op: "do",
        action: {
          kind: "play_psi_game",
          maxBid: 2,
          ifBidsDiffer: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      },
      "dedicated-neural-net-psi-on-first-successful-hq",
      `${dnn.title} becomes pending — first successful HQ (psi; Corp may choose access).`,
      "corp",
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Dedicated Neural Net") &&
          line.includes("becomes pending"),
      ),
    ).toBe(true);
  });

  it("marks score/steal flag hooks pending via inline_conditional", async () => {
    const { fireInlineConditional } = await import(
      "../src/state/storedTriggers.js"
    );

    const s = createInitialState();
    const pe = instantiateCard(
      "jinteki-personal-evolution",
      "pe-1",
      "corp:identity",
    );
    pe.netDamageOnAgendaScoredOrStolen = 1;
    const panto = instantiateCard("pantograph", "pan-1", "runner:installed");
    panto.mayInstallOnScoreOrSteal = true;
    s.cards["pe-1"] = pe;
    s.cards["pan-1"] = panto;
    s.corp.identityId = "pe-1";
    s.runner.installed = ["pan-1"];
    s.runner.hand = [];

    fireInlineConditional(
      s,
      "pe-1",
      fx.netDamage(1),
      "net-damage-on-agenda-scored-or-stolen",
      `${pe.title} becomes pending — agenda scored or stolen (net damage).`,
      "corp",
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Personal Evolution") &&
          line.includes("becomes pending") &&
          line.includes("net damage"),
      ),
    ).toBe(true);

    fireInlineConditional(
      s,
      "pan-1",
      fx.mayInstallFromGrip(),
      "may-install-on-score-or-steal",
      `${panto.title} becomes pending — agenda scored or stolen (may install).`,
    );
    expect(
      s.log.some(
        (line) =>
          line.includes("Pantograph") && line.includes("becomes pending"),
      ),
    ).toBe(true);
  });
});

describe("misc conditionals pending (CR 9.6.2)", () => {
  it("marks leftover timed Effect conditionals pending", async () => {
    const {
      fireAfterMandatoryDraw,
      fireOnBeforeFirstTurn,
      fireOnCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun,
      fireOnFirstHardwareUseDuringRunEachTurn,
    } = await import("../src/state/miscConditionalHooks.js");
    const { maybeFireSeidrOnClickSpendOrLose } = await import(
      "../src/state/clickHooks.js"
    );

    const s = createInitialState();
    const forum = instantiateCard("open-forum", "of-1", "server:hq:root");
    forum.afterMandatoryDraw = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    const seidr = instantiateCard(
      "seidr-laboratories-destiny-defined",
      "seidr-1",
      "corp:identity",
    );
    seidr.onFirstRunnerClickSpendOrLoseDuringRun = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    seidr.onBeforeFirstTurn = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    seidr.onCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    const hw = instantiateCard("diesel", "hw-1", "runner:installed");
    hw.onFirstHardwareUseDuringRunEachTurn = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    s.cards["of-1"] = forum;
    s.cards["seidr-1"] = seidr;
    s.cards["hw-1"] = hw;
    s.corp.identityId = "seidr-1";
    s.servers.hq.root = ["of-1"];
    s.runner.installed = ["hw-1"];
    s.corp.credits = 0;
    s.runner.credits = 0;
    s.run = {
      attackedServerId: "hq",
      position: 0,
      successful: false,
      ended: false,
    } as typeof s.run;

    fireAfterMandatoryDraw(s, "of-1");
    expect(
      s.log.some((line) =>
        line.includes("Open Forum becomes pending — after mandatory draw"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);

    fireOnBeforeFirstTurn(s, "seidr-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "Seidr Laboratories: Destiny Defined becomes pending — before first turn",
        ),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(2);

    maybeFireSeidrOnClickSpendOrLose(s);
    expect(s.turn.seidrClickMetPending).toBe(true);
    occurCheckpoint(
      s,
      "instruction",
      "seidr first click during run",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(
      s.log.some((line) =>
        line.includes(
          "Seidr Laboratories: Destiny Defined becomes pending — first Runner click spend/lose during a run",
        ),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(3);

    fireOnCorpAbilityCausesRunnerSpendOrLoseCreditsDuringRun(s, "seidr-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "Seidr Laboratories: Destiny Defined becomes pending — Corp ability caused Runner to spend or lose credits during a run",
        ),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(4);

    fireOnFirstHardwareUseDuringRunEachTurn(s, "hw-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "Diesel becomes pending — first hardware use during a run this turn",
        ),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);
    expect(s.pendingAbilities).toHaveLength(0);
  });

  it("marks first / each bad-publicity take at 10.3.1a (phase 3 scanner)", async () => {
    const { fireFirstBadPublicityTake } = await import(
      "../src/state/badPublicityHooks.js"
    );

    const s = createInitialState();
    const editorial = instantiateCard(
      "editorial-division-ad-nihilum",
      "ed-1",
      "corp:identity",
    );
    editorial.onFirstBadPublicityTakeEachTurn = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    const flint = instantiateCard("raymond-flint", "flint-1", "runner:installed");
    flint.onEachCorpBadPublicityTake = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    s.cards["ed-1"] = editorial;
    s.cards["flint-1"] = flint;
    s.corp.identityId = "ed-1";
    s.runner.installed = ["flint-1"];
    s.corp.credits = 0;
    s.runner.credits = 0;

    fireFirstBadPublicityTake(s, 1);
    expect(s.turn.firstBadPublicityMetPending).toBe(true);
    expect(s.turn.corpBadPublicityTakeEventsPending).toBe(1);
    expect(s.turn.firstBadPublicityTakeUsedThisTurn).toBe(false);
    expect(s.corp.credits).toBe(0);
    expect(s.runner.credits).toBe(0);

    occurCheckpoint(
      s,
      "instruction",
      "bad publicity take",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstBadPublicityTakeUsedThisTurn).toBe(true);
    expect(s.turn.firstBadPublicityMetPending).toBe(false);
    expect(s.turn.corpBadPublicityTakeEventsPending).toBe(0);
    expect(
      s.log.some((line) =>
        line.includes(
          "Editorial Division: Ad Nihilum becomes pending — first bad publicity take this turn",
        ),
      ),
    ).toBe(true);
    expect(
      s.log.some((line) =>
        line.includes("Raymond Flint becomes pending — Corp took bad publicity"),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);
    expect(s.runner.credits).toBe(1);

    fireFirstBadPublicityTake(s, 1);
    expect(s.turn.firstBadPublicityMetPending).toBe(false);
    expect(s.turn.corpBadPublicityTakeEventsPending).toBe(1);
    occurCheckpoint(
      s,
      "instruction",
      "second bad publicity take",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.corp.credits).toBe(1);
    expect(s.runner.credits).toBe(2);
  });

  it("marks first event trashed at 10.3.1a (phase 3 scanner)", async () => {
    const { fireOnFirstEventTrashedThisTurn } = await import(
      "../src/state/trashHooks.js"
    );

    const s = createInitialState();
    const aniccam = instantiateCard("aniccam", "an-1", "runner:installed");
    aniccam.onFirstEventTrashedThisTurn = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    s.cards["an-1"] = aniccam;
    s.runner.installed = ["an-1"];
    s.runner.credits = 0;

    fireOnFirstEventTrashedThisTurn(s);
    expect(s.turn.firstEventTrashedMetPending).toBe(true);
    expect(s.turn.firstEventTrashedUsedThisTurn).toBe(false);
    expect(s.runner.credits).toBe(0);

    occurCheckpoint(
      s,
      "instruction",
      "first event trashed",
      [CR.checkpointConditionalAbilities],
      "test",
    );
    expect(s.turn.firstEventTrashedUsedThisTurn).toBe(true);
    expect(s.turn.firstEventTrashedMetPending).toBe(false);
    expect(
      s.log.some((line) =>
        line.includes("Aniccam becomes pending — first event trashed this turn"),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);

    fireOnFirstEventTrashedThisTurn(s);
    expect(s.turn.firstEventTrashedMetPending).toBe(false);
  });

  it("marks discard / full-break / first-ice-rez / would-draw pending", async () => {
    const {
      fireOnDiscardPhaseEnd,
      fireOnFirstIceRezEachTurn,
      fireOnFullyBreakOncePerTurn,
      fireOnInstallFromNonHq,
      fireOnWouldDrawOncePerTurn,
    } = await import("../src/state/miscConditionalHooks.js");

    const s = createInitialState();
    const discard = instantiateCard("diesel", "d-1", "runner:installed");
    discard.onDiscardPhaseEnd = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    const breaker = instantiateCard("corroder", "c-1", "runner:installed");
    breaker.onFullyBreakOncePerTurn = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    const foundry = instantiateCard(
      "haas-bioroid-stronger-together",
      "id-corp",
      "corp:identity",
    );
    foundry.onFirstIceRezEachTurn = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    const archivesInstall = instantiateCard(
      "pad-campaign",
      "pad-1",
      "server:remote-1:root",
    );
    archivesInstall.onInstallFromNonHq = fx.do({
      kind: "gain_credits",
      side: "corp",
      amount: 1,
    });
    const classAct = instantiateCard("the-class-act", "ca-1", "runner:installed");
    classAct.onWouldDrawOncePerTurn = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    s.cards["d-1"] = discard;
    s.cards["c-1"] = breaker;
    s.cards["id-corp"] = foundry;
    s.cards["pad-1"] = archivesInstall;
    s.cards["ca-1"] = classAct;
    s.runner.installed = ["d-1", "c-1", "ca-1"];
    s.corp.identityId = "id-corp";
    s.corp.credits = 0;
    s.runner.credits = 0;

    fireOnDiscardPhaseEnd(s, ["d-1"]);
    expect(
      s.log.some((line) =>
        line.includes("Diesel becomes pending — discard phase ends"),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);

    fireOnFullyBreakOncePerTurn(s, "c-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "Corroder becomes pending — ice fully broken (once per turn)",
        ),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(2);

    fireOnFirstIceRezEachTurn(s, "id-corp");
    expect(
      s.log.some((line) =>
        line.includes(
          "Haas-Bioroid: Stronger Together becomes pending — first ice rezzed this turn",
        ),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(1);

    fireOnInstallFromNonHq(s, "pad-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "PAD Campaign becomes pending — installed from outside HQ",
        ),
      ),
    ).toBe(true);
    expect(s.corp.credits).toBe(2);

    fireOnWouldDrawOncePerTurn(s, "ca-1");
    expect(
      s.log.some((line) =>
        line.includes(
          "The Class Act becomes pending — would draw (once per turn)",
        ),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(3);
    expect(s.pendingAbilities).toHaveLength(0);
  });
});

describe("run-timing conditionals pending (CR 9.6.2)", () => {
  it("marks first-encounter / pass / successful-run first-* pending", async () => {
    const {
      fireOnFirstEncounterEachRun,
      fireOnFirstSuccessfulHqRunThisTurn,
      fireOnPassRezzedIce,
    } = await import("../src/state/runTimingHooks.js");

    const s = createInitialState();
    const a = instantiateCard("corroder", "a-1", "runner:installed");
    a.onFirstEncounterEachRun = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    const b = instantiateCard("diesel", "b-1", "runner:installed");
    b.onPassRezzedIce = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    const c = instantiateCard("sure-gamble", "c-1", "runner:installed");
    c.onFirstSuccessfulHqRunThisTurn = fx.do({
      kind: "gain_credits",
      side: "runner",
      amount: 1,
    });
    s.cards["a-1"] = a;
    s.cards["b-1"] = b;
    s.cards["c-1"] = c;
    s.runner.installed = ["a-1", "b-1", "c-1"];
    s.runner.credits = 0;

    fireOnFirstEncounterEachRun(s);
    expect(
      s.log.some((line) =>
        line.includes("Corroder becomes pending — first encounter this run"),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(1);

    fireOnPassRezzedIce(s);
    expect(
      s.log.some((line) =>
        line.includes("Diesel becomes pending — rezzed ice passed"),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(2);

    fireOnFirstSuccessfulHqRunThisTurn(s);
    expect(
      s.log.some((line) =>
        line.includes(
          "Sure Gamble becomes pending — first successful HQ run this turn",
        ),
      ),
    ).toBe(true);
    expect(s.runner.credits).toBe(3);
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
