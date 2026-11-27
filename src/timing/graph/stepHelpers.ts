/** The step builders and the procedures the timing steps call, shared by the step files in timing/graph/. It imports only a type from timing/graph.ts, so the step files never need graph.ts while they load. */
import type { GameState } from "../../state/types/game.js";
import type { TurnPhase } from "../../state/types/turn.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../labels.js";
import {
  collectSubBoostEtrSubs,
  collectFatumaGainedSubs,
} from "../../state/continuous/continuousSubs.js";
import {
  trimEncounterBreaks,
  shiftEncounterBreaks,
  encounterFullyBrokenByRunner,
} from "../../state/turnAndActions/break.js";
import {
  pendingAbilitiesWithStatus,
  openReactionWindow,
  markPendingAbilityResolving,
  completePendingAbility,
  closeReactionWindow,
  pruneSettledPendingAbilities,
  createPendingAbilityInstance,
} from "../../state/triggers/pendingAbilities.js";
import { evalEffect, fireHostRezStateTriggers } from "../../effects/eval.js";
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { notePassAllIceProtectingServer } from "../../state/run/approachServerHooks.js";
import { onPassedAllIce } from "../../state/cardFlags/cardDeclarations.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import type { TimingStepDef } from "../graph.js";
import { noteInlineConditional } from "../../state/triggers/inlineConditionalHooks.js";

const TLDR_COPY_SUFFIX = "-tldr-copy";

/** Each subroutine gains a copy immediately after it (CR 9.8.2a). */
export function grantTldrSubroutineCopies(
  state: GameState,
  iceId: string,
): void {
  if (!state.turn.dadDuplicateSubsOnNextIceEncounter) return;
  state.turn.dadDuplicateSubsOnNextIceEncounter = false;
  const ice = state.cards[iceId];
  const subs = ice?.subroutines ?? [];
  if (!ice || subs.length === 0) return;
  ice.subroutines = subs.flatMap((sub) => [
    sub,
    { ...structuredClone(sub), id: `${sub.id}${TLDR_COPY_SUFFIX}` },
  ]);
  log(
    state,
    `${ice.title} gains a second copy of each subroutine (CR ${CR.subroutinesDuplicated.number}).`,
  );
}

/** TL;DR's arming lasts the run; when the run ends it is gone too. */
export function clearTldrSubroutineCopies(state: GameState): void {
  state.turn.dadDuplicateSubsOnNextIceEncounter = false;
  removeTldrSubroutineCopies(state);
}

/**
 * TL;DR's copies last "for the remainder of that encounter" (CR 9.10.1), so
 * a second encounter with the same ice this run (The Twins) has none.
 */
export function removeTldrSubroutineCopies(state: GameState): void {
  for (const card of Object.values(state.cards)) {
    if (!card.subroutines?.some((sub) => sub.id.endsWith(TLDR_COPY_SUFFIX))) {
      continue;
    }
    card.subroutines = card.subroutines.filter(
      (sub) => !sub.id.endsWith(TLDR_COPY_SUFFIX),
    );
  }
}

/**
 * Sub Boost: host gains ETR after printed (collector). Barrier is a continuous
 * subtype grant (host_grant_barrier) — do not mutate ice.subtypes.
 */
export function syncHostedSubBoost(state: GameState, iceId: string): void {
  const ice = state.cards[iceId];
  if (!ice) return;
  const gained = collectSubBoostEtrSubs(state, iceId);
  const keepIds = new Set(gained.map((g) => g.subId));
  ice.subroutines = (ice.subroutines ?? []).filter((sub) => {
    if (!sub.id.startsWith("sub-boost-etr-")) return true;
    return keepIds.has(sub.id);
  });
  for (const g of gained) {
    if (ice.subroutines.some((sub) => sub.id === g.subId)) continue;
    ice.subroutines.push({
      id: g.subId,
      text: g.text,
      effect: g.effect,
    });
    log(
      state,
      `${ice.title} gains "End the run." after its other subroutines (${state.cards[g.sourceId]?.title ?? g.sourceId}).`,
    );
  }
  const encounter = state.run?.encounter;
  if (encounter?.iceId !== iceId) return;
  const count = ice.subroutines.length;
  while (encounter.broken.length < count) encounter.broken.push(false);
  if (encounter.broken.length > count) {
    encounter.broken = encounter.broken.slice(0, count);
    trimEncounterBreaks(encounter, count);
  }
}

/** Warden Fatuma: bioroid ice gains a lose-click subroutine before its others (CR 9.8.3a). */
export function syncWardenBeforeSubroutines(
  state: GameState,
  iceId: string,
): void {
  const ice = state.cards[iceId];
  const encounter = state.run?.encounter;
  if (!ice || encounter?.iceId !== iceId) return;
  const gained = collectFatumaGainedSubs(state, iceId);
  const keepIds = new Set(gained.map((g) => g.subId));
  const subs = [...(ice.subroutines ?? [])];
  const broken = [...encounter.broken];
  for (let i = subs.length - 1; i >= 0; i--) {
    const sub = subs[i]!;
    if (!sub.id.startsWith("warden-lose-click-")) continue;
    if (keepIds.has(sub.id)) continue;
    subs.splice(i, 1);
    broken.splice(i, 1);
    shiftEncounterBreaks(encounter, i, -1);
  }
  for (const g of [...gained].reverse()) {
    if (subs.some((sub) => sub.id === g.subId)) continue;
    subs.unshift({
      id: g.subId,
      text: g.text,
      effect: g.effect,
    });
    broken.unshift(false);
    shiftEncounterBreaks(encounter, 0, 1);
    const source = state.cards[g.sourceId];
    log(
      state,
      `${source?.title ?? g.sourceId} — ${ice.title} gains "The Runner loses [click]." before its other subroutines (CR ${CR.subroutineOriginExternalBefore.number}).`,
    );
  }
  ice.subroutines = subs;
  encounter.broken = broken;
}

export function turnBeginPaused(state: GameState): boolean {
  return Boolean(
    state.pendingChoice ||
    state.pendingDamage ||
    state.pendingTags ||
    state.pendingTrashProgram ||
    state.pendingSabotage ||
    state.done,
  );
}

/**
 * Ice encountered while not installed is marked rezzed and faceup so its
 * subroutines are active for that encounter (CR 9.1.8h). Once the encounter
 * is over, a card that is not installed is not rezzed (CR 8.1.1). A card in
 * HQ or R&D is neither faceup nor facedown (CR 1.21.1a, 4.1.5, 4.1.6) once
 * the access that showed it is over too (CR 7.1.2, 6.5.9a): `accessOver`
 * says the run has ended. A card in Archives keeps its faceup status:
 * Archives is a public zone (CR 4.1.4).
 */
export function clearEncounterOutsidePlayMark(
  s: GameState,
  iceId: string | undefined,
  accessOver = false,
): void {
  const ice = iceId ? s.cards[iceId] : undefined;
  if (!ice) return;
  const hidden = ice.zone === "corp:hq" || ice.zone === "corp:rd";
  if (ice.rezzed && (hidden || ice.zone === "corp:archives")) {
    ice.rezzed = false;
  }
  if (
    ice.faceup &&
    hidden &&
    (accessOver || s.run?.accessingCardId !== ice.id)
  ) {
    ice.faceup = false;
  }
}

/**
 * The access is over (CR 7.2.4). A card accessed in HQ or R&D that is still
 * there was shown to the Corp (HQ only) for that access (CR 7.1.2) and
 * revealed for its duration when it must be (CR 1.21.7), and is again
 * neither faceup nor facedown (CR 1.21.1a). A reveal after this sets the
 * flag itself (CR 1.21.3).
 *
 * Open gap: CR 7.3.1a keeps the card visible to the Runner for the rest of
 * the breach. The engine has never kept it (`endLooksAndReveals` cleared it
 * after the access action too), and the flag is shared by both seats.
 */
export function endAccessVisibility(
  s: GameState,
  cardId: string | null | undefined,
): void {
  const card = cardId ? s.cards[cardId] : undefined;
  if (!card?.faceup || card.side !== "corp") return;
  if (s.corp.hand.includes(card.id) || s.corp.deck.includes(card.id)) {
    card.faceup = false;
  }
}

/** The run-end instance that stayed pending resolves once (CR 9.12.5d). */

/**
 * Some server is protected by an unrezzed piece of ice. Both seats can see
 * this (CR 10.2.3a, 8.5.3); what the facedown ice is, they cannot.
 */
export function anyUnrezzedIceInstalled(s: GameState): boolean {
  return Object.values(s.servers).some((srv) =>
    srv.ice.some((id) => s.cards[id] && !s.cards[id].rezzed),
  );
}

/** The card is hosted on a piece of installed ice. */
export function isHostedOnIce(s: GameState, cardId: string): boolean {
  const hostId = s.cards[cardId]?.hostId;
  if (!hostId) return false;
  const host = s.cards[hostId];
  return host?.type === "ice" && host.zone.endsWith(":ice");
}

/** The id suffix of the subroutine Marker grants for the remainder of a run. */
export const MARKER_ETR = "-marker-etr";
export function resolveDeferredPersistentAmaze(state: GameState): void {
  const bag = pendingAbilitiesWithStatus(state, "pending").filter(
    (p) => p.payload?.kind === "amaze_give_tags",
  );
  if (bag.length === 0) return;

  const frame = openReactionWindow(
    state,
    bag.map((p) => p.id),
    null,
  );
  for (const inst of bag) {
    const title = state.cards[inst.sourceId]?.title ?? inst.sourceId;
    log(
      state,
      `${title}'s pending instance resolves (CR ${CR.persistentAbility.number}).`,
    );
    markPendingAbilityResolving(state, inst.id);
    const amount =
      inst.payload?.kind === "amaze_give_tags" ? inst.payload.amount : 0;
    evalEffect(
      { state, sourceId: inst.sourceId },
      { op: "do", action: { kind: "give_tags", amount } },
    );
    completePendingAbility(state, inst.id, "done");
    if (state.pendingChoice || state.pendingTags || state.done) break;
  }
  closeReactionWindow(state, frame.id);
  pruneSettledPendingAbilities(state);
}

function isRunnerTurnBeginPendingKey(abilityKey: string): boolean {
  return (
    abilityKey === "on-turn-begin" ||
    abilityKey === "on-turn-begin-if-corp-no-bp"
  );
}

export function pendingTurnBeginIds(state: GameState): string[] {
  return pendingAbilitiesWithStatus(state, "pending")
    .filter(
      (p) =>
        isRunnerTurnBeginPendingKey(p.abilityKey) &&
        (p.payload?.kind === "stored_conditional" ||
          p.payload?.kind === "inline_conditional"),
    )
    .map((p) => p.id);
}

/** Log when one turn-begin ability is open and later ones remain pending. */
export function noteOpenTurnBeginWaiting(state: GameState): void {
  if (!turnBeginPaused(state)) return;
  const waiting = pendingTurnBeginIds(state).length;
  if (waiting === 0) return;
  // The open choice is the order of these abilities, not one of them.
  if (state.pendingChoice?.options.some((o) => o.id.startsWith("trigger:"))) {
    return;
  }
  const openId = state.pendingChoice?.sourceId;
  const title = openId ? state.cards[openId]?.title : undefined;
  if (!title) return;
  const noun = waiting === 1 ? "ability waits" : "abilities wait";
  state.log.push(
    `${title}'s turn-begin ability is open; ${waiting} later turn-begin ${noun} (CR ${CR.conditionCheckedWhenResolving.number}).`,
  );
}

export function iceBypassBlockedByServerUpgrade(
  state: import("../../state/types/game.js").GameState,
  iceId: string,
): boolean {
  const ice = state.cards[iceId];
  if (ice?.cannotBeBypassed && !abilitiesSuppressed(state, iceId)) {
    return true;
  }
  for (const server of Object.values(state.servers)) {
    if (!server.ice.includes(iceId)) continue;
    return [...server.root, ...server.ice].some((id) => {
      if (abilitiesSuppressed(state, id)) return false;
      const card = state.cards[id];
      return Boolean(card?.rezzed && card.iceCannotBeBypassedThisServer);
    });
  }
  return false;
}

/**
 * Is the encounter over before its remaining steps? The encountered ice was
 * uninstalled (CR 8.5.10) or derezzed (CR 6.2.7c), or an effect already
 * ended the encounter. The Runner then passes the position (run.movement).
 */
export function encounterEndsEarly(s: GameState): boolean {
  const run = s.run;
  if (!run) return false;
  const enc = run.encounter;
  if (!enc) return true;
  const ice = s.cards[enc.iceId];
  if (enc.iceUninstalled) {
    s.log.push(
      `${ice?.title ?? "The encountered ice"} was uninstalled — the encounter ends and the Runner passes its position (CR ${CR.uninstallIceDuringRun.number}, ${CR.encounteredIceLeaves.number}).`,
    );
    return true;
  }
  const installed =
    Boolean(ice) && (ice!.zone.endsWith(":ice") || Boolean(ice!.hostId));
  if (installed && !ice!.rezzed) {
    s.log.push(
      `${ice!.title} was derezzed — the encounter ends (CR ${CR.encounteredIceLeaves.number}).`,
    );
    return true;
  }
  return false;
}

/** Derez ice with derezAtAnyTurnEnd; clear Lycian gained subtypes. */
export function sweepDerezAtAnyTurnEnd(s: GameState): void {
  for (const server of Object.values(s.servers)) {
    for (const id of [...server.ice]) {
      const card = s.cards[id];
      if (!card?.rezzed || !card.derezAtAnyTurnEnd) continue;
      if (card.lycianGainedSubtypes?.length) {
        const gained = new Set(card.lycianGainedSubtypes);
        card.subtypes = (card.subtypes ?? []).filter((x) => !gained.has(x));
        card.lycianGainedSubtypes = undefined;
      }
      card.rezzed = false;
      card.faceup = false;
      fireHostRezStateTriggers(s, id, "derez");
      log(s, `Derez ${card.title} (derez at turn end).`);
    }
  }
}

/** Player-facing step kinds for the v0 graph. */
export type StepKind =
  "auto" | "pass" | "action" | "discard" | "access" | "branch";

/** PAW stepKeys closed under CR 6.8.2a at Run Ends. */
export const pawStepKeysForRunEnds = new Set([
  "run.approachPaw",
  "run.encounterPaw",
  "run.approachServerPaw",
  "run.jackOutWindow",
  "corp.actionPaw",
  "corp.drawPaw",
  "corp.discardPaw",
  "runner.actionPaw",
  "runner.startPaw",
  "runner.discardPaw",
  "run.initiatePaw",
  "run.passIcePaw",
  "run.afterMovePaw",
]);

/** Phase-begin reaction placeholders closed under CR 6.8.2b at Run Ends. */
export const reactionStepKeysForRunEnds = new Set([
  "run.encounterBeginReaction",
  "run.approachBeginReaction",
  "run.approachServerBeginReaction",
]);

/**
 * CR 6.9.4a: the Runner passed ice with no position more inward, so the
 * conditions for passing all of the ice protecting the server are met.
 * This is before the 6.9.4b paid ability window and before the Runner may
 * jack out (6.9.4c).
 */
export function meetPassAllIceConditions(s: GameState): void {
  const run = s.run;
  if (!run) return;
  const serverId = run.attackedServerId;
  // Root cards with a pass-all-ice ability (Caprice Nisei, K. P. Lynn)
  // become pending for the checkpoint that follows.
  notePassAllIceProtectingServer(s, serverId);
  // Polyhistor: the first time each turn all ice protecting HQ is passed.
  if (!s.pendingChoice) onPassedAllIce(s);
  // Awakening Center: may rez 1 hosted piece of ice for 7¢ less; the
  // Runner then encounters it. Once per run per upgrade.
  if (s.pendingChoice) return;
  for (const id of s.servers[serverId].root) {
    if (abilitiesSuppressed(s, id)) continue;
    const card = s.cards[id];
    if (!card?.rezzed || !card.hostsBioroidIceIgnoreInstallCost) continue;
    const fired = run.awakeningCenterTriggeredIds ?? [];
    if (fired.includes(id)) continue;
    run.awakeningCenterTriggeredIds = [...fired, id];
    const hostedUnrezzed = (card.hostedCardIds ?? []).filter((hid) => {
      const h = s.cards[hid];
      return h && h.type === "ice" && !h.rezzed;
    });
    if (hostedUnrezzed.length === 0) continue;
    const affordable = hostedUnrezzed.filter(
      (hid) => s.corp.credits >= Math.max(0, (s.cards[hid]!.rezCost ?? 0) - 7),
    );
    if (affordable.length === 0) continue;
    openPendingChoose(s, {
      sourceId: id,
      chooser: "corp",
      options: [
        ...affordable.map((hid) => {
          const h = s.cards[hid]!;
          const pay = Math.max(0, (h.rezCost ?? 0) - 7);
          return {
            id: `awakening-rez:${hid}`,
            label: `Rez ${h.title} for ${pay}¢ (−7) and force encounter`,
            effect: {
              op: "do" as const,
              action: { kind: "rez_hosted" as const, cardId: hid },
            },
          };
        }),
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 0,
            },
          },
        },
      ],
      logLine: `${card.title} — may rez a hosted bioroid ice (−7¢) and force the Runner to encounter it.`,
    });
    break;
  }
}

export function corp(
  key: string,
  stepId: string,
  stepNumber: string,
  label: string,
  kind: StepKind,
  turnPhase: TurnPhase | null,
  next: TimingStepDef["next"],
  extra: Partial<TimingStepDef> = {},
): TimingStepDef {
  return {
    key,
    structure: "corp_turn",
    stepId,
    stepNumber,
    label,
    kind,
    turnPhase,
    next,
    ...extra,
  };
}

export function runner(
  key: string,
  stepId: string,
  stepNumber: string,
  label: string,
  kind: StepKind,
  turnPhase: TurnPhase | null,
  next: TimingStepDef["next"],
  extra: Partial<TimingStepDef> = {},
): TimingStepDef {
  return {
    key,
    structure: "runner_turn",
    stepId,
    stepNumber,
    label,
    kind,
    turnPhase,
    next,
    ...extra,
  };
}

export function run(
  key: string,
  stepId: string,
  stepNumber: string,
  label: string,
  kind: StepKind,
  next: TimingStepDef["next"],
  extra: Partial<TimingStepDef> = {},
): TimingStepDef {
  return {
    key,
    structure: "run",
    stepId,
    stepNumber,
    label,
    kind,
    turnPhase: null,
    next,
    ...extra,
  };
}

export function breach(
  key: string,
  stepId: string,
  stepNumber: string,
  label: string,
  kind: StepKind,
  next: TimingStepDef["next"],
  extra: Partial<TimingStepDef> = {},
): TimingStepDef {
  return {
    key,
    structure: "breach",
    stepId,
    stepNumber,
    label,
    kind,
    turnPhase: null,
    next,
    ...extra,
  };
}

/**
 * Opening / setup steps (CR 1.6.6–1.6.7a). Not appendix timing structures;
 * stepIds are rule ids from the CR index. `activeSide` stays corp until the
 * first Corp turn begins.
 */
export function opening(
  key: string,
  stepId: string,
  stepNumber: string,
  label: string,
  kind: StepKind,
  next: TimingStepDef["next"],
  extra: Partial<TimingStepDef> = {},
): TimingStepDef {
  return {
    key,
    structure: "corp_turn",
    stepId,
    stepNumber,
    label,
    kind,
    turnPhase: null,
    next,
    ...extra,
  };
}

/**
 * Explicit timing step graph for Corp turn, Runner turn, run, and breach.
 * Appendix ids match vendor/cr-data/timing-structures.json (CR v26.03).
 * Opening mulligan steps cite rule ids from the CR index (1.6.6a / 1.6.7a).
 *
 * PAW nodes accept hardcoded paid abilities (pump / fortify) via use_paid_ability.
 */
/**
 * Snitch's ability id. Its "once per run" is recorded per copy when the
 * Runner carries out its optional part (CR 9.1.6b).
 */
export const SNITCH_EXPOSE = "snitch-expose";

export function offerDelayedRunEndOrder(s: GameState): boolean {
  const runState = s.run;
  if (!runState || runState.delayedRunEndOrderResolved) return false;
  const trashIds = (runState.breakersThatBroke ?? []).filter((id) => {
    const card = s.cards[id];
    return (
      Boolean(card?.trashAfterBreakingThisRun) &&
      s.runner.installed.includes(id)
    );
  });
  const onRunEnd = runState.onRunEndEffect;
  const compileId = runState.winCompileInstalledProgramId;
  const compilePending =
    onRunEnd?.op === "do" &&
    onRunEnd.action.kind === "win_compile_bottom_of_stack" &&
    Boolean(compileId && s.runner.installed.includes(compileId));
  if (trashIds.length === 0 || !compilePending || !compileId) return false;
  const eventId = runState.runSourceId;
  const eventTitle = eventId
    ? (s.cards[eventId]?.title ?? "Compile")
    : "Compile";
  const trashTitles = trashIds.map((id) => s.cards[id]?.title ?? id).join(", ");
  log(
    s,
    `${eventTitle} and ${trashTitles} become pending (CR ${CR.abilityIndependent.number}).`,
  );
  const zones: Record<string, string> = {};
  for (const id of [...trashIds, compileId]) {
    const zone = s.cards[id]?.zone;
    if (zone) zones[id] = zone;
  }
  runState.delayedRunEndSourceZone = zones;
  const trashLabel =
    trashIds.length === 1 ? trashTitles : "the trash abilities";
  return openPendingChoose(s, {
    sourceId: eventId ?? trashIds[0]!,
    chooser: "runner",
    options: [
      {
        id: "delayed-run-end:compile-first",
        label: `Resolve ${eventTitle} first`,
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      },
      {
        id: "delayed-run-end:trash-first",
        label: `Resolve ${trashLabel} first`,
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      },
    ],
  });
}

/**
 * Faerie: "Whenever an encounter ends, if you used this program to break a
 * subroutine during that encounter, trash this program." An encounter also
 * ends when the run ends during it (CR 6.1.4) or when the encountered ice is
 * uninstalled (CR 8.5.10), so the ability is met there as well as where an
 * encounter ends while the run goes on.
 */
export function noteEncounterEndIfBrokeEarly(s: GameState, why: string): void {
  const enc = s.run?.encounter;
  if (!enc) return;
  for (const bid of enc.breakersThatBrokeThisEncounter ?? []) {
    const br = s.cards[bid];
    if (!br?.onEncounterEndIfBroke) continue;
    if (!s.runner.installed.includes(bid) || abilitiesSuppressed(s, bid)) {
      continue;
    }
    noteInlineConditional(s, {
      cardId: bid,
      abilityKey: "encounter-end-if-broke",
      controller: "runner",
      mandatory: true,
      effect: br.onEncounterEndIfBroke,
      logLine: `${br.title} becomes pending — it broke a subroutine during an encounter that ended because ${why}.`,
    });
  }
}

/**
 * Chum: "When that encounter ends, if the Runner did not fully break that
 * ice, do 3 net damage." Called when the run ends with the boosted encounter
 * still in progress: the encounter ends with the run (CR 6.1.4). The damage
 * is pending for the Run Ends Phase (CR 6.8.5.ex1). An encounter that ends
 * while the run goes on is handled where the encounter ends.
 */
export function noteChumEncounterEndedByRunEnd(s: GameState): void {
  const runState = s.run;
  const chumEnc = runState?.chumActiveEncounter;
  if (!runState || !chumEnc) return;
  if (runState.encounter?.iceId !== chumEnc.iceId) return;
  runState.chumActiveEncounter = undefined;
  if (encounterFullyBrokenByRunner(runState.encounter)) return;
  if (chumEnc.netDamageIfNotFullyBroken <= 0) return;
  const amount = chumEnc.netDamageIfNotFullyBroken;
  createPendingAbilityInstance(s, {
    abilityKey: "chum:net-on-run-end",
    sourceId: chumEnc.chumSourceId,
    controller: "corp",
    mandatory: true,
    // A delayed conditional ability is kept by a lingering effect, so it
    // does not depend on Chum staying active (CR 9.6.13, 9.10.1).
    independentOfSource: true,
    payload: { kind: "chum_net_damage", amount },
  });
  s.log.push(
    `Chum — ${amount} net damage becomes pending for the Run Ends Phase (CR ${CR.runEndsCondition.number}).`,
  );
}
