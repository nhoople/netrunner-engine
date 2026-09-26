import { activePlayer, cloneState, log } from "../state/createGame.js";
import {
  currentWindow,
  effectiveBreakerStrength,
  effectiveIceStrength,
} from "../cards/stubs.js";
import {
  addRestriction,
  isForbidden,
  withCostCheckpoint,
} from "../legality/checkpoints.js";
import {
  actorSideForAction,
  ensurePriorityWindow,
  isWindowAct,
  nestPriorityAfterAbility,
  recordPriorityPass,
} from "../legality/priority.js";
import { legalActions as queryLegalActions } from "../legality/query.js";
import { evalEffect, validatePaidEffect } from "../effects/eval.js";
import { abilityCost, canPayCost, payCost } from "../state/costs.js";
import {
  acceptPendingDamage,
  preventPendingDamage,
} from "../state/damage.js";
import { boostTrace, resolveTrace, spendLink } from "../state/trace.js";
import {
  canScoreAgenda,
  scoreAgenda,
  stealAgenda,
} from "../state/scoring.js";
import type {
  Action,
  ApplyResult,
  GameState,
  InstallDestination,
  PaidAbility,
  RuleCite,
  Server,
  ServerId,
  Side,
} from "../state/types.js";
import { CR } from "../timing/labels.js";
import {
  actionAllowedHere,
  afterBasicAction,
  autoWalk,
  canPass,
  enterStep,
  getStep,
  resolveAndAdvance,
} from "../timing/machine.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

function spendClick(state: GameState): ApplyResult | null {
  const p = activePlayer(state);
  if (p.clicks < 1) {
    return fail("No unspent clicks.", [CR.spendClicks, CR.actionPhase]);
  }
  p.clicks -= 1;
  return null;
}

function drawOne(state: GameState, side: "corp" | "runner"): boolean {
  const p = side === "corp" ? state.corp : state.runner;
  const top = p.deck.shift();
  if (!top) return false;
  p.hand.push(top);
  const card = state.cards[top];
  card.zone = side === "corp" ? "corp:hq" : "runner:grip";
  card.faceup = side === "runner";
  return true;
}

function listServers(state: GameState): Server[] {
  return Object.values(state.servers);
}

function emptyRemoteExists(state: GameState): Server | undefined {
  return listServers(state).find(
    (s) => s.kind === "remote" && s.root.length === 0,
  );
}

function createRemote(state: GameState): Server {
  const id = `remote-${state.nextRemoteNumber++}` as ServerId;
  const server: Server = { id, kind: "remote", ice: [], root: [] };
  state.servers[id] = server;
  return server;
}

function approachedIceId(state: GameState): string | null {
  const run = state.run;
  if (!run || run.position === null) return null;
  return state.servers[run.attackedServerId].ice[run.position] ?? null;
}

function opponentHasPriorityActs(state: GameState): boolean {
  const pw = ensurePriorityWindow(state);
  const opponent: Side = pw.priorityHolder === "corp" ? "runner" : "corp";
  const acts = queryLegalActions(state).filter((a) => {
    if (!isWindowAct(a)) return false;
    return actorSideForAction(a, state) === opponent;
  });
  return acts.length > 0;
}

function installCorp(
  state: GameState,
  cardId: string,
  destination: InstallDestination,
): ApplyResult {
  const card = state.cards[cardId];
  if (!card || card.side !== "corp") {
    return fail("Card not in Corp hand.", [CR.corpBasicInstall]);
  }
  const handIdx = state.corp.hand.indexOf(cardId);
  if (handIdx < 0) {
    return fail("Card not in HQ.", [CR.corpBasicInstall]);
  }
  if (
    card.type !== "asset" &&
    card.type !== "agenda" &&
    card.type !== "ice" &&
    card.type !== "upgrade"
  ) {
    return fail("Corp install supports asset/agenda/ice/upgrade only.", [
      CR.installing,
    ]);
  }

  let server: Server;
  if (destination.kind === "new_remote") {
    if (card.type === "ice") {
      server = createRemote(state);
      log(
        state,
        `Created ${server.id} by installing ice (CR ${CR.creatingRemotes.number} / ${CR.remoteExistence.number}).`,
      );
    } else if (card.type === "asset" || card.type === "agenda") {
      server = createRemote(state);
      log(
        state,
        `Created ${server.id} for ${card.type} (CR ${CR.agendaAssetRemote.number}).`,
      );
    } else {
      return fail("Upgrade needs an existing server.", [CR.corpInstallDest]);
    }
  } else if (destination.kind === "remote_root") {
    server = state.servers[destination.serverId];
    if (!server || server.kind !== "remote") {
      return fail("Destination must be a remote server.", [CR.agendaAssetRemote]);
    }
  } else if (destination.kind === "protect") {
    server = state.servers[destination.serverId];
    if (!server) {
      return fail("Unknown server.", [CR.corpInstallDest]);
    }
    if (card.type !== "ice") {
      return fail("Only ice protects a server.", [CR.corpBasicInstall]);
    }
  } else {
    return fail("Corp cannot install to runner rig.", [CR.corpBasicInstall]);
  }

  if (state.corp.credits < card.installCost) {
    return fail("Insufficient credits for install cost.", [
      { number: "8.5.11", id: "sec_install_cost" },
    ]);
  }
  state.corp.credits -= card.installCost;
  state.corp.hand.splice(handIdx, 1);

  if (card.type === "ice") {
    server.ice.unshift(cardId);
    card.zone = `server:${server.id}:ice`;
    card.rezzed = false;
    card.faceup = false;
  } else {
    server.root.push(cardId);
    card.zone = `server:${server.id}:root`;
    card.rezzed = false;
    card.faceup = false;
    if (card.type === "agenda") {
      card.advancementTokens = card.advancementTokens ?? 0;
    }
  }

  log(
    state,
    `Corp installs ${card.title} on ${server.id} (CR ${CR.corpBasicInstall.number}, ${CR.installing.number}).`,
  );
  return ok(state);
}

function installRunner(state: GameState, cardId: string): ApplyResult {
  const card = state.cards[cardId];
  if (!card || card.side !== "runner") {
    return fail("Card not a Runner card.", [CR.runnerBasicInstall]);
  }
  const handIdx = state.runner.hand.indexOf(cardId);
  if (handIdx < 0) {
    return fail("Card not in grip.", [CR.runnerBasicInstall]);
  }
  if (!["program", "hardware", "resource"].includes(card.type)) {
    return fail("Runner install supports program/hardware/resource.", [
      CR.runnerBasicInstall,
    ]);
  }
  if (state.runner.credits < card.installCost) {
    return fail("Insufficient credits for install cost.", [
      { number: "8.5.11", id: "sec_install_cost" },
    ]);
  }
  state.runner.credits -= card.installCost;
  state.runner.hand.splice(handIdx, 1);
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  log(
    state,
    `Runner installs ${card.title} (CR ${CR.runnerBasicInstall.number}).`,
  );
  return ok(state);
}

/** Auto-advance the run graph until a player window or the run ends. */
function advanceRunUntilStop(state: GameState): ApplyResult {
  for (let guard = 0; guard < 64; guard++) {
    if (state.pendingTrashProgram || state.trace || state.pendingDamage) {
      return ok(state);
    }

    const step = getStep(state);

    if (step.key === "run.begin") {
      log(state, `Run begins (appendix ${step.stepNumber}).`);
    }

    if (
      step.kind === "pass" ||
      step.kind === "access" ||
      step.kind === "action" ||
      step.kind === "discard"
    ) {
      if (step.kind === "pass") ensurePriorityWindow(state);
      return ok(state);
    }

    if (step.structure === "runner_turn") {
      return ok(state);
    }

    if (step.kind === "auto" || step.kind === "branch") {
      step.onResolve?.(state);
      if (state.pendingTrashProgram || state.trace || state.pendingDamage) {
        return ok(state);
      }
      const nextKey =
        typeof step.next === "function" ? step.next(state) : step.next;
      enterStep(state, nextKey);
      continue;
    }

    return fail(`Unexpected stop during run walk at ${step.key}`, [
      CR.runnerBasicRun,
    ]);
  }
  return fail("Run walk exceeded step budget.", [CR.runnerBasicRun]);
}

function finishRunReturnToAction(state: GameState): void {
  if (!state.run) {
    state.restrictions = state.restrictions.filter((r) => r.forbid !== "jack_out");
    afterBasicAction(state);
  }
}

function startRun(state: GameState, serverId: ServerId): ApplyResult {
  const server = state.servers[serverId];
  if (!server) {
    return fail("Unknown attacked server.", [CR.announceServer]);
  }
  state.run = {
    attackedServerId: serverId,
    phase: "initiation",
    position: server.ice.length > 0 ? 0 : null,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
    accessRemaining: null,
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {},
    encounterStrengthBoosts: {},
    iceStrengthBoosts: {},
    accessingCardId: null,
  };
  enterStep(state, "run.announce");
  log(
    state,
    `Runner announces run on ${serverId} (CR ${CR.runnerBasicRun.number}, ${CR.announceServer.number}).`,
  );
  return advanceRunUntilStop(state);
}

function passWindow(state: GameState): ApplyResult {
  if (state.trace) {
    return fail("Resolve or continue the trace before passing.", [CR.trace]);
  }
  if (state.pendingDamage) {
    return fail("Accept or prevent pending damage before passing.", [
      CR.preventDamage,
    ]);
  }
  if (state.pendingTrashProgram) {
    return fail("Choose a program to trash before passing.", [CR.trashing]);
  }

  if (!canPass(state)) {
    if (state.timingKey === "breach.awaitAccess") {
      return fail(
        "Choose a card to access or finish is unavailable while candidates remain.",
        [CR.breach],
      );
    }
    return fail(
      `Cannot pass at step ${state.timingKey} (${state.timing.stepId}).`,
      [],
    );
  }

  const step = getStep(state);
  const inRunOrBreach =
    step.structure === "run" || step.structure === "breach";

  if (step.key === "corp.mandatoryDraw") {
    const drew = drawOne(state, "corp");
    log(
      state,
      drew
        ? `Corp mandatory draw (CR ${CR.mandatoryDraw.number} / appendix ${step.stepNumber}).`
        : "Corp mandatory draw — R&D empty (not modeled further).",
    );
    const next = typeof step.next === "function" ? step.next(state) : step.next;
    enterStep(state, next);
    autoWalk(state);
    return ok(state);
  }

  // Non-PAW pass steps (gain clicks, turn complete, action phase end, etc.)
  const isPaw =
    step.key.endsWith("Paw") ||
    step.key === "run.jackOutWindow" ||
    step.key === "run.approachPaw" ||
    step.key === "run.encounterPaw";

  if (isPaw) {
    if (step.key === "run.jackOutWindow") {
      log(state, `Runner declines to jack out (appendix 11.4_4_c).`);
    }
    if (step.key === "run.approachPaw") {
      log(
        state,
        `Approach PAW closes without further paid abilities (appendix 11.4_2_b).`,
      );
    }
    if (step.key === "run.encounterPaw") {
      log(
        state,
        `Encounter break window closes (appendix 11.4_3_b / CR ${CR.encounterBreakPaw.number}).`,
      );
    }
    const status = recordPriorityPass(state, opponentHasPriorityActs(state));
    if (status === "still_open") {
      return ok(state);
    }
  }

  resolveAndAdvance(state);

  if (inRunOrBreach) {
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  return ok(state);
}

function discardPhase(state: GameState): ApplyResult {
  const allowed = actionAllowedHere(state, "discard_to_hand_size");
  if (!allowed.ok) {
    return fail("Not in discard step.", allowed.cites);
  }
  const p = activePlayer(state);
  while (p.hand.length > p.maxHandSize) {
    const id = p.hand.pop()!;
    p.discard.push(id);
    const card = state.cards[id];
    card.zone = p.side === "corp" ? "corp:archives" : "runner:heap";
    if (p.side === "corp") card.faceup = false;
  }
  log(
    state,
    `${p.side} discards to hand size ${p.maxHandSize} (CR ${CR.maxHandSize.number}).`,
  );
  const next =
    typeof getStep(state).next === "function"
      ? (getStep(state).next as (s: GameState) => string)(state)
      : (getStep(state).next as string);
  enterStep(state, next);
  autoWalk(state);
  return ok(state);
}

function rezIce(state: GameState, cardId: string): ApplyResult {
  if (state.timingKey !== "run.approachPaw") {
    return fail("Ice can only be rezzed during the approach PAW.", [
      CR.rezInPaw,
      CR.rezIceRestriction,
    ]);
  }
  ensurePriorityWindow(state);
  const approached = approachedIceId(state);
  if (approached !== cardId) {
    return fail("Only the approached ice may be rezzed here.", [
      CR.rezIceRestriction,
    ]);
  }
  const card = state.cards[cardId];
  if (!card || card.type !== "ice") {
    return fail("Not ice.", [CR.rezProcedure]);
  }
  if (card.rezzed) {
    return fail("Ice is already rezzed.", [CR.rezProcedure]);
  }
  const cost = card.rezCost ?? 0;
  if (state.corp.credits < cost) {
    return fail("Insufficient credits to rez.", [
      CR.inherentRezCost,
      CR.rezProcedure,
    ]);
  }
  withCostCheckpoint(state, "rez_ice", () => {
    state.corp.credits -= cost;
  });
  card.rezzed = true;
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  log(
    state,
    `Corp rezzes ${card.title} for ${cost}¢ (CR ${CR.rezInPaw.number}, ${CR.rezProcedure.number}).`,
  );
  if (card.onRez) {
    const r = evalEffect({ state, sourceId: cardId }, card.onRez);
    if (!r.ok) return fail(r.error, r.cites);
  } else if (card.prevention?.jackOutForRun && state.run) {
    state.run.cannotJackOut = true;
    addRestriction(state, "jack_out", CR.cannotPrecedence, card.id);
  }
  nestPriorityAfterAbility(state, "rez_ice");
  return ok(state);
}

function breakSubroutine(
  state: GameState,
  breakerId: string,
  subIndex: number,
): ApplyResult {
  if (state.timingKey !== "run.encounterPaw") {
    return fail("Subroutines can only be broken during the encounter PAW.", [
      CR.encounterBreakPaw,
    ]);
  }
  ensurePriorityWindow(state);
  const run = state.run;
  if (!run?.encounter) {
    return fail("No encounter in progress.", [CR.encounterIce]);
  }
  const ice = state.cards[run.encounter.iceId];
  const subs = ice.subroutines ?? [];
  if (subIndex < 0 || subIndex >= subs.length) {
    return fail("Invalid subroutine index.", [CR.encounterSubResolve]);
  }
  if (run.encounter.broken[subIndex]) {
    return fail("Subroutine already broken.", [CR.fullyBreak]);
  }
  if (!state.runner.rig.includes(breakerId)) {
    return fail("Breaker is not installed.", [CR.encounterBreakPaw]);
  }
  const breaker = state.cards[breakerId];
  if (!breaker.breaker) {
    return fail("Card is not an icebreaker.", [CR.encounterBreakPaw]);
  }
  const iceSubs = ice.subtypes ?? [];
  if (!iceSubs.includes(breaker.breaker.breaksSubtype)) {
    return fail(
      `Breaker cannot break ${breaker.breaker.breaksSubtype} on this ice.`,
      [CR.encounterBreakPaw],
    );
  }
  const iceStr = effectiveIceStrength(state, ice.id);
  const brStr = effectiveBreakerStrength(state, breakerId);
  if (brStr < iceStr) {
    return fail(
      `Breaker strength ${brStr} < ice strength ${iceStr} (CR ${CR.icebreakerInterfaceStrength.number}).`,
      [CR.encounterBreakPaw, CR.icebreakerInterfaceStrength],
    );
  }
  const cost = breaker.breaker.breakCredits;
  if (state.runner.credits < cost) {
    return fail("Insufficient credits to break.", [CR.encounterBreakPaw]);
  }
  withCostCheckpoint(state, "break_subroutine", () => {
    state.runner.credits -= cost;
  });
  run.encounter.broken[subIndex] = true;
  log(
    state,
    `Runner breaks "${subs[subIndex].text}" with ${breaker.title} (str ${brStr}) for ${cost}¢ (CR ${CR.encounterBreakPaw.number}, ${CR.fullyBreak.number}).`,
  );
  nestPriorityAfterAbility(state, "break_subroutine");
  return ok(state);
}

function breakBioroidSubroutine(
  state: GameState,
  subIndex: number,
): ApplyResult {
  const run = state.run;
  if (!run?.encounter) {
    return fail("No encounter in progress.", [CR.encounterIce]);
  }
  const ice = state.cards[run.encounter.iceId];
  if (!(ice.subtypes ?? []).includes("bioroid")) {
    return fail("Encountered ice is not a bioroid.", [CR.encounterBreakPaw]);
  }
  const subs = ice.subroutines ?? [];
  if (subIndex < 0 || subIndex >= subs.length) {
    return fail("Invalid subroutine index.", [CR.encounterSubResolve]);
  }
  if (run.encounter.broken[subIndex]) {
    return fail("Subroutine already broken.", [CR.fullyBreak]);
  }
  if (state.runner.clicks < 1) {
    return fail("Insufficient clicks to break bioroid subroutine.", [
      CR.spendClicks,
      CR.encounterBreakPaw,
    ]);
  }
  withCostCheckpoint(state, "break_bioroid_subroutine", () => {
    state.runner.clicks -= 1;
  });
  run.encounter.broken[subIndex] = true;
  log(
    state,
    `Runner spends [click] to break "${subs[subIndex].text}" on bioroid ${ice.title} (CR ${CR.encounterBreakPaw.number}, ${CR.spendClicks.number}).`,
  );
  nestPriorityAfterAbility(state, "break_bioroid_subroutine");
  return ok(state);
}

function chooseTrashProgram(state: GameState, cardId: string): ApplyResult {
  const pending = state.pendingTrashProgram;
  if (!pending) {
    return fail("No pending trash-program choice.", [CR.trashing]);
  }
  if (!pending.candidates.includes(cardId)) {
    return fail("That program is not a legal trash target.", [CR.trashing]);
  }
  const card = state.cards[cardId];
  const handIdx = state.runner.hand.indexOf(cardId);
  if (handIdx >= 0) state.runner.hand.splice(handIdx, 1);
  const rigIdx = state.runner.rig.indexOf(cardId);
  if (rigIdx >= 0) state.runner.rig.splice(rigIdx, 1);
  state.runner.discard.push(cardId);
  card.zone = "runner:heap";
  card.faceup = true;
  state.pendingTrashProgram = null;
  log(
    state,
    `Corp trashes program ${card.title} (CR ${CR.trashing.number}).`,
  );
  // Resume the run graph from the current auto step (resolveSub).
  const step = getStep(state);
  if (step.kind === "auto" || step.kind === "branch") {
    const nextKey =
      typeof step.next === "function" ? step.next(state) : step.next;
    enterStep(state, nextKey);
  }
  const cont = advanceRunUntilStop(state);
  if (!cont.ok) return cont;
  finishRunReturnToAction(cont.state);
  return cont;
}

function rezAsset(state: GameState, cardId: string): ApplyResult {
  const paw = currentWindow(state.timingKey);
  if (paw !== "corp_action_paw") {
    return fail("Assets can only be rezzed in a Corp paid-ability window.", [
      CR.rezInPaw,
      CR.rezProcedure,
    ]);
  }
  ensurePriorityWindow(state);
  const card = state.cards[cardId];
  if (!card || (card.type !== "asset" && card.type !== "upgrade")) {
    return fail("Not an asset/upgrade.", [CR.rezProcedure]);
  }
  if (card.rezzed) {
    return fail("Already rezzed.", [CR.rezProcedure]);
  }
  const inRoot = Object.values(state.servers).some((srv) =>
    srv.root.includes(cardId),
  );
  if (!inRoot) {
    return fail("Card is not installed in a server root.", [CR.rezProcedure]);
  }
  const cost = card.rezCost ?? 0;
  if (state.corp.credits < cost) {
    return fail("Insufficient credits to rez.", [
      CR.inherentRezCost,
      CR.rezProcedure,
    ]);
  }
  withCostCheckpoint(state, "rez_asset", () => {
    state.corp.credits -= cost;
  });
  card.rezzed = true;
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  log(
    state,
    `Corp rezzes ${card.title} for ${cost}¢ (CR ${CR.rezInPaw.number}, ${CR.rezProcedure.number}).`,
  );
  if (card.onRez) {
    const r = evalEffect({ state, sourceId: cardId }, card.onRez);
    if (!r.ok) return fail(r.error, r.cites);
  }
  nestPriorityAfterAbility(state, "rez_asset");
  return ok(state);
}

function findPaidAbility(
  card: { paidAbilities?: PaidAbility[] },
  abilityId: string,
): PaidAbility | undefined {
  return card.paidAbilities?.find((a) => a.id === abilityId);
}

function usePaidAbility(
  state: GameState,
  cardId: string,
  abilityId: string,
): ApplyResult {
  const window = currentWindow(state.timingKey);
  if (!window) {
    return fail("No paid-ability window open.", [
      CR.paidAbility,
      CR.triggerPaidAbilities,
    ]);
  }
  ensurePriorityWindow(state);
  const card = state.cards[cardId];
  if (!card) {
    return fail("Unknown card.", [CR.paidAbility]);
  }
  const ability = findPaidAbility(card, abilityId);
  if (!ability) {
    return fail("Unknown paid ability.", [CR.paidAbility]);
  }
  if (!ability.windows.includes(window)) {
    return fail(`Ability not usable in ${window}.`, [
      CR.paidAbility,
      CR.triggerPaidAbilities,
    ]);
  }
  if (card.side === "runner" && !state.runner.rig.includes(cardId)) {
    return fail("Breaker/program not installed.", [CR.paidAbility]);
  }
  if (card.side === "corp" && window === "approach_paw") {
    const approached = approachedIceId(state);
    if (approached !== cardId) {
      return fail("Paid ability source is not the approached ice.", [
        CR.paidAbility,
      ]);
    }
    if (!card.rezzed) {
      return fail("Ice must be rezzed to use this ability.", [CR.paidAbility]);
    }
  }

  const cost = abilityCost(ability);
  if (!canPayCost(state, card.side, cost, card)) {
    return fail("Cannot pay ability cost.", [CR.paidAbility, CR.costCheckpoint]);
  }

  const ctx = {
    state,
    sourceId: cardId,
    payerSide: card.side,
  };
  const pre = validatePaidEffect(ctx, ability.effect);
  if (pre !== null) {
    return fail(pre.error, pre.cites);
  }

  payCost(state, card.side, cost, `use_paid_ability:${abilityId}`, card);

  const applied = evalEffect(ctx, ability.effect);
  if (!applied.ok) return fail(applied.error, applied.cites);
  nestPriorityAfterAbility(state, `use_paid_ability:${abilityId}`);
  return ok(state);
}

function jackOut(state: GameState): ApplyResult {
  if (state.timingKey !== "run.jackOutWindow") {
    return fail("Jack out is only legal during the movement jack-out step.", [
      CR.jackOutMovement,
      CR.jackOutAfterPass,
    ]);
  }
  const blocked = isForbidden(state, "jack_out");
  if (blocked) {
    return fail(`Cannot jack out: forbidden by ${blocked.source}.`, [
      blocked.cite,
      CR.cannotPrecedence,
    ]);
  }
  const run = state.run!;
  run.successful = false;
  log(
    state,
    `Runner jacks out (CR ${CR.jackingOut.number}, ${CR.jackOutMovement.number}).`,
  );
  enterStep(state, "run.ends");
  const cont = advanceRunUntilStop(state);
  if (!cont.ok) return cont;
  finishRunReturnToAction(cont.state);
  return cont;
}

function playOperation(state: GameState, cardId: string): ApplyResult {
  if (state.activeSide !== "corp") {
    return fail("Only Corp plays operations.", [CR.playOperation]);
  }
  const card = state.cards[cardId];
  if (!card || card.type !== "operation") {
    return fail("Not an operation.", [CR.playOperation]);
  }
  const handIdx = state.corp.hand.indexOf(cardId);
  if (handIdx < 0) return fail("Operation not in HQ.", [CR.playOperation]);
  const cost = card.playCost ?? 0;
  if (state.corp.credits < cost) {
    return fail("Insufficient credits to play operation.", [CR.playOperation]);
  }
  const bad = spendClick(state);
  if (bad) return bad;
  withCostCheckpoint(state, "play_operation", () => {
    state.corp.credits -= cost;
  });
  state.corp.hand.splice(handIdx, 1);
  state.corp.discard.push(cardId);
  card.zone = "corp:archives";
  card.faceup = true;
  log(
    state,
    `Corp plays ${card.title} for ${cost}¢ (CR ${CR.playOperation.number}).`,
  );
  if (card.onPlay) {
    const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
    if (!r.ok) return fail(r.error, r.cites);
  }
  afterBasicAction(state);
  return ok(state);
}

function playEvent(state: GameState, cardId: string): ApplyResult {
  if (state.activeSide !== "runner") {
    return fail("Only Runner plays events.", [CR.playEvent]);
  }
  const card = state.cards[cardId];
  if (!card || card.type !== "event") {
    return fail("Not an event.", [CR.playEvent]);
  }
  const handIdx = state.runner.hand.indexOf(cardId);
  if (handIdx < 0) return fail("Event not in grip.", [CR.playEvent]);
  const cost = card.playCost ?? 0;
  if (state.runner.credits < cost) {
    return fail("Insufficient credits to play event.", [CR.playEvent]);
  }
  const bad = spendClick(state);
  if (bad) return bad;
  withCostCheckpoint(state, "play_event", () => {
    state.runner.credits -= cost;
  });
  state.runner.hand.splice(handIdx, 1);
  state.runner.discard.push(cardId);
  card.zone = "runner:heap";
  card.faceup = true;
  log(
    state,
    `Runner plays ${card.title} for ${cost}¢ (CR ${CR.playEvent.number}).`,
  );
  if (card.onPlay) {
    const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
    if (!r.ok) return fail(r.error, r.cites);
  }
  afterBasicAction(state);
  return ok(state);
}

function advanceCard(state: GameState, cardId: string): ApplyResult {
  if (state.activeSide !== "corp") {
    return fail("Only Corp may advance.", [CR.corpBasicAdvance]);
  }
  const card = state.cards[cardId];
  if (!card) return fail("Unknown card.", [CR.advancing]);
  if (card.type !== "agenda" && card.type !== "asset") {
    return fail("Only agendas/assets advance in this engine.", [CR.advancing]);
  }
  if (!card.zone.endsWith(":root")) {
    return fail("Card must be installed to advance.", [CR.advancing]);
  }
  if (state.corp.credits < 1) {
    return fail("Need 1¢ to advance.", [CR.advancing]);
  }
  const bad = spendClick(state);
  if (bad) return bad;
  withCostCheckpoint(state, "advance", () => {
    state.corp.credits -= 1;
  });
  card.advancementTokens = (card.advancementTokens ?? 0) + 1;
  log(
    state,
    `Corp advances ${card.title} → ${card.advancementTokens} (CR ${CR.corpBasicAdvance.number}, ${CR.advancing.number}).`,
  );
  afterBasicAction(state);
  return ok(state);
}

function scoreAgendaAction(state: GameState, cardId: string): ApplyResult {
  if (state.activeSide !== "corp") {
    return fail("Only Corp scores agendas.", [CR.scoringAgenda]);
  }
  // Scoring is free (not an action) during Corp action PAW / takeAction
  if (
    state.timingKey !== "corp.takeAction" &&
    state.timingKey !== "corp.actionPaw"
  ) {
    return fail("Score only during Corp action window.", [CR.scoringAgenda]);
  }
  const card = state.cards[cardId];
  if (!canScoreAgenda(state, card)) {
    return fail("Agenda cannot be scored.", [CR.scoringAgenda]);
  }
  scoreAgenda(state, cardId);
  if (card.onScore) {
    const r = evalEffect({ state, sourceId: cardId }, card.onScore);
    if (!r.ok) return fail(r.error, r.cites);
  }
  return ok(state);
}

function useIdentityAbility(state: GameState, abilityId: string): ApplyResult {
  const idCard =
    state.cards[
      state.activeSide === "corp"
        ? state.corp.identityId
        : state.runner.identityId
    ];
  if (!idCard) return fail("No identity.", [CR.identityAbility]);
  const ability = findPaidAbility(idCard, abilityId);
  if (!ability) {
    return fail("Unknown identity ability.", [CR.identityAbility]);
  }
  const window = currentWindow(state.timingKey);
  // Identity abilities usable as click actions at takeAction, or in PAW.
  const atTake =
    state.timingKey === "corp.takeAction" ||
    state.timingKey === "runner.takeAction";
  if (!atTake && (!window || !ability.windows.includes(window))) {
    return fail("Identity ability not usable now.", [CR.identityAbility]);
  }
  const cost = abilityCost(ability);
  if (!canPayCost(state, idCard.side, cost, idCard)) {
    return fail("Cannot pay identity ability cost.", [CR.identityAbility]);
  }
  payCost(state, idCard.side, cost, `identity:${abilityId}`, idCard);
  const applied = evalEffect(
    { state, sourceId: idCard.id, payerSide: idCard.side },
    ability.effect,
  );
  if (!applied.ok) return fail(applied.error, applied.cites);
  log(
    state,
    `${idCard.side} uses identity ability ${ability.label} (CR ${CR.identityAbility.number}).`,
  );
  if (atTake && (cost.clicks ?? 0) > 0) {
    afterBasicAction(state);
  } else if (window) {
    nestPriorityAfterAbility(state, `identity:${abilityId}`);
  }
  return ok(state);
}

/** Pure action apply: returns a new state or a cited legality error. */
export function applyAction(state: GameState, action: Action): ApplyResult {
  const next = cloneState(state);
  if (next.done && action.type !== "pass_window") {
    return fail("Game marked done.", []);
  }

  // Trace / damage interrupts take precedence
  if (next.trace) {
    switch (action.type) {
      case "boost_trace": {
        const err = boostTrace(next, action.credits);
        if (err) return fail(err, [CR.trace]);
        return ok(next);
      }
      case "spend_link": {
        const err = spendLink(next, action.amount);
        if (err) return fail(err, [CR.trace]);
        return ok(next);
      }
      case "resolve_trace": {
        const r = resolveTrace(next);
        if (!r.ok) return fail(r.error, [CR.trace]);
        return ok(next);
      }
      default:
        return fail("Trace in progress — boost, spend link, or resolve.", [
          CR.trace,
        ]);
    }
  }

  if (next.pendingDamage) {
    switch (action.type) {
      case "prevent_damage":
        preventPendingDamage(next, action.amount);
        return ok(next);
      case "accept_damage":
        acceptPendingDamage(next);
        return ok(next);
      default:
        return fail("Pending damage — prevent or accept.", [CR.preventDamage]);
    }
  }

  if (next.pendingTrashProgram) {
    if (action.type === "choose_trash_program") {
      return chooseTrashProgram(next, action.cardId);
    }
    return fail("Pending trash-program choice — Corp must choose a target.", [
      CR.trashing,
    ]);
  }

  switch (action.type) {
    case "pass_window":
      return passWindow(next);

    case "continue_run":
      if (next.timingKey !== "run.jackOutWindow") {
        return fail("continue_run is only for the jack-out window.", [
          CR.jackOutMovement,
        ]);
      }
      return passWindow(next);

    case "basic_gain_credit": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      const bad = spendClick(next);
      if (bad) return bad;
      const cite =
        next.activeSide === "corp" ? CR.corpBasicCredit : CR.runnerBasicCredit;
      activePlayer(next).credits += 1;
      log(
        next,
        `${next.activeSide} gains 1 credit (CR ${cite.number}, ${CR.gainCredits.number}).`,
      );
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_draw": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      const bad = spendClick(next);
      if (bad) return bad;
      const cite =
        next.activeSide === "corp" ? CR.corpBasicDraw : CR.runnerBasicDraw;
      const drew = drawOne(next, next.activeSide);
      if (!drew) {
        return fail("Deck is empty.", [cite, CR.drawing]);
      }
      log(
        next,
        `${next.activeSide} draws 1 (CR ${cite.number}, ${CR.drawing.number}).`,
      );
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_install": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      const bad = spendClick(next);
      if (bad) return bad;
      const result =
        next.activeSide === "corp"
          ? installCorp(next, action.cardId, action.destination)
          : action.destination.kind === "rig"
            ? installRunner(next, action.cardId)
            : fail("Runner installs go to the rig.", [CR.runnerBasicInstall]);
      if (!result.ok) return result;
      afterBasicAction(result.state);
      return result;
    }

    case "basic_run": {
      if (next.activeSide !== "runner") {
        return fail("Only the Runner may make a run.", [CR.runnerBasicRun]);
      }
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Runs are only legal at the Runner take-action step.",
          gate.cites,
        );
      }
      const bad = spendClick(next);
      if (bad) return bad;
      const walked = startRun(next, action.serverId);
      if (!walked.ok) {
        next.run = null;
        return walked;
      }
      finishRunReturnToAction(walked.state);
      return walked;
    }

    case "play_operation":
      return playOperation(next, action.cardId);

    case "play_event":
      return playEvent(next, action.cardId);

    case "advance":
      return advanceCard(next, action.cardId);

    case "score_agenda":
      return scoreAgendaAction(next, action.cardId);

    case "use_identity_ability":
      return useIdentityAbility(next, action.abilityId);

    case "rez_ice":
      return rezIce(next, action.cardId);

    case "break_subroutine":
      return breakSubroutine(next, action.breakerId, action.subIndex);

    case "break_bioroid_subroutine":
      return breakBioroidSubroutine(next, action.subIndex);

    case "use_paid_ability":
      return usePaidAbility(next, action.cardId, action.abilityId);

    case "rez_asset":
      return rezAsset(next, action.cardId);

    case "choose_trash_program":
      return fail("No pending trash-program choice.", [CR.trashing]);

    case "jack_out":
      return jackOut(next);

    case "access_card": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) return fail("No breach access window.", gate.cites);
      if (!next.run) return fail("No breach in progress.", [CR.breach]);
      const idx = next.run.accessCandidates.indexOf(action.cardId);
      if (idx < 0) {
        return fail("Card is not an access candidate.", [CR.remoteCandidates]);
      }
      next.run.accessCandidates.splice(idx, 1);
      next.run.accessedCardIds.push(action.cardId);
      next.run.accessingCardId = action.cardId;
      if (next.run.accessRemaining !== null) {
        next.run.accessRemaining = Math.max(0, next.run.accessRemaining - 1);
      }
      const card = next.cards[action.cardId];
      card.faceup = true;
      log(
        next,
        `Accessed ${card.title} (appendix ${getStep(next).stepNumber}).`,
      );
      // Agendas: offer steal via steal_agenda before finishing access.
      if (card.type === "agenda") {
        log(
          next,
          `Mid-access agenda — may steal (CR ${CR.midAccessAgenda.number}).`,
        );
        return ok(next);
      }
      // Non-agenda: finish this access automatically.
      next.run.accessingCardId = null;
      enterStep(next, "breach.access");
      autoWalk(next);
      const cont = advanceRunUntilStop(next);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }

    case "steal_agenda": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that agenda.", [CR.stealingAgenda]);
      }
      stealAgenda(next, action.cardId);
      enterStep(next, "breach.access");
      autoWalk(next);
      const cont = advanceRunUntilStop(next);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }

    case "trash_accessed": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      const card = next.cards[action.cardId];
      const cost = card.trashCost ?? 0;
      if (next.runner.credits < cost) {
        return fail("Insufficient credits to trash.", [CR.trashing]);
      }
      next.runner.credits -= cost;
      // Move to archives
      const serverId = next.run.attackedServerId;
      const server = next.servers[serverId];
      server.root = server.root.filter((id) => id !== action.cardId);
      next.corp.hand = next.corp.hand.filter((id) => id !== action.cardId);
      next.corp.deck = next.corp.deck.filter((id) => id !== action.cardId);
      next.corp.discard.push(action.cardId);
      card.zone = "corp:archives";
      card.faceup = true;
      next.run.accessingCardId = null;
      log(
        next,
        `Runner trashes accessed ${card.title} for ${cost}¢ (CR ${CR.trashing.number}).`,
      );
      enterStep(next, "breach.access");
      autoWalk(next);
      const cont = advanceRunUntilStop(next);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }

    case "finish_access": {
      if (!next.run?.accessingCardId) {
        return fail("Not mid-access.", [CR.breach]);
      }
      next.run.accessingCardId = null;
      enterStep(next, "breach.access");
      autoWalk(next);
      const cont = advanceRunUntilStop(next);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }

    case "finish_breach": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) return fail("No breach access window.", gate.cites);
      if (!next.run) return fail("No breach in progress.", [CR.breach]);
      if (next.run.accessingCardId) {
        return fail("Finish current access first.", [CR.breach]);
      }
      const remaining = next.run.accessRemaining;
      if (
        remaining !== null &&
        remaining > 0 &&
        next.run.accessCandidates.length > 0
      ) {
        return fail("Candidates remain.", [CR.remoteCandidates]);
      }
      if (remaining === null && next.run.accessCandidates.length > 0) {
        return fail("Candidates remain.", [CR.remoteCandidates]);
      }
      enterStep(next, "breach.complete");
      autoWalk(next);
      const cont = advanceRunUntilStop(next);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }

    case "boost_trace":
    case "spend_link":
    case "resolve_trace":
      return fail("No trace in progress.", [CR.trace]);

    case "prevent_damage":
    case "accept_damage":
      return fail("No pending damage.", [CR.preventDamage]);

    case "discard_to_hand_size":
      return discardPhase(next);

    default: {
      const _exhaustive: never = action;
      return fail(`Unknown action: ${JSON.stringify(_exhaustive)}`, []);
    }
  }
}

/** List legal actions at the current timing graph node. */
export function legalActions(state: GameState): Action[] {
  return queryLegalActions(state);
}

export function describeState(state: GameState): string {
  const step = getStep(state);
  const lines = [
    `Turn ${state.turnNumber} | active=${state.activeSide} | phase=${state.turnPhase} | key=${state.timingKey}`,
    `Timing: [${step.stepNumber}] ${step.label} (${step.stepId}) kind=${step.kind}`,
    `Corp: ${state.corp.clicks} clicks, ${state.corp.credits}c, hand=${state.corp.hand.length}, R&D=${state.corp.deck.length}, score=${state.corp.score.length}`,
    `Runner: ${state.runner.clicks} clicks, ${state.runner.credits}c, tags=${state.runner.tags}, BD=${state.runner.brainDamage}, grip=${state.runner.hand.length}, rig=${state.runner.rig.length}`,
    `Servers: ${listServers(state)
      .map((s) => {
        const iceDesc = s.ice
          .map((id) => `${state.cards[id].title}${state.cards[id].rezzed ? "*" : ""}`)
          .join("|");
        return `${s.id}[ice=${iceDesc || "—"},root=${s.root.length}]`;
      })
      .join(", ")}`,
  ];
  if (state.winner) {
    lines.push(`Winner: ${state.winner} (${state.winReason})`);
  }
  if (state.checkpoints.length) {
    lines.push(
      `Checkpoints: ${state.checkpoints.map((c) => `${c.kind}:${c.label}`).join(" > ")}`,
    );
  }
  if (state.priorityStack.length) {
    lines.push(
      `Priority: ${state.priorityStack.map((p) => `d${p.nestDepth}/${p.priorityHolder}/pass${p.consecutivePasses}`).join(" > ")}`,
    );
  }
  if (state.restrictions.length) {
    lines.push(
      `Restrictions: ${state.restrictions.map((r) => `${r.forbid}@${r.source}`).join(", ")}`,
    );
  }
  if (state.trace) {
    lines.push(
      `Trace: base=${state.trace.baseStrength} corp+${state.trace.corpSpent} link+${state.trace.runnerLinkSpent}`,
    );
  }
  if (state.pendingDamage) {
    lines.push(
      `Pending damage: ${state.pendingDamage.remaining} ${state.pendingDamage.type}`,
    );
  }
  if (state.pendingTrashProgram) {
    lines.push(
      `Pending trash program: choose among ${state.pendingTrashProgram.candidates.join(",")}`,
    );
  }
  if (state.run) {
    lines.push(
      `Run: ${state.run.attackedServerId} phase=${state.run.phase} success=${state.run.successful} pos=${state.run.position} etr=${state.run.endedTheRun} noJack=${state.run.cannotJackOut}`,
    );
    const boosts = Object.entries(state.run.strengthBoosts);
    const encBoosts = Object.entries(state.run.encounterStrengthBoosts);
    const iceBoosts = Object.entries(state.run.iceStrengthBoosts);
    if (boosts.length || encBoosts.length || iceBoosts.length) {
      lines.push(
        `Strength boosts: run={${boosts.map(([k, v]) => `${k}:+${v}`).join(",")}} encounter={${encBoosts.map(([k, v]) => `${k}:+${v}`).join(",")}} ice={${iceBoosts.map(([k, v]) => `${k}:+${v}`).join(",")}}`,
      );
    }
    if (state.run.encounter) {
      const iceId = state.run.encounter.iceId;
      lines.push(
        `Encounter: ${iceId} str=${effectiveIceStrength(state, iceId)} broken=${state.run.encounter.broken.join(",")}`,
      );
    }
    if (state.run.accessingCardId) {
      lines.push(`Accessing: ${state.run.accessingCardId}`);
    }
  }
  const empty = emptyRemoteExists(state);
  if (empty) lines.push(`Empty remote present: ${empty.id}`);
  return lines.join("\n");
}
