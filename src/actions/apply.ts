import { activePlayer, cloneState, log } from "../state/createGame.js";
import {
  currentWindow,
  effectiveBreakerStrength,
  effectiveIceStrength,
} from "../cards/stubs.js";
import {
  addRestriction,
  closePriorityWindow,
  isForbidden,
  withCostCheckpoint,
} from "../legality/checkpoints.js";
import { legalActions as queryLegalActions } from "../legality/query.js";
import type {
  Action,
  ApplyResult,
  GameState,
  InstallDestination,
  PaidAbility,
  RuleCite,
  Server,
  ServerId,
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
    return fail("v0 Corp install supports asset/agenda/ice/upgrade only.", [
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
      return fail("Upgrade needs an existing server in v0.", [CR.corpInstallDest]);
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
    return fail("v0 Runner install supports program/hardware/resource.", [
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
  log(
    state,
    `Runner installs ${card.title} (CR ${CR.runnerBasicInstall.number}).`,
  );
  return ok(state);
}

/** Auto-advance the run graph until a player window or the run ends. */
function advanceRunUntilStop(state: GameState): ApplyResult {
  for (let guard = 0; guard < 64; guard++) {
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
      return ok(state);
    }

    if (step.structure === "runner_turn") {
      return ok(state);
    }

    if (step.kind === "auto" || step.kind === "branch") {
      step.onResolve?.(state);
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
    // Clear run-scoped cannot effects when the run has ended.
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
    encounter: null,
    endedTheRun: false,
    cannotJackOut: false,
    strengthBoosts: {},
    iceStrengthBoosts: {},
  };
  enterStep(state, "run.announce");
  log(
    state,
    `Runner announces run on ${serverId} (CR ${CR.runnerBasicRun.number}, ${CR.announceServer.number}).`,
  );
  return advanceRunUntilStop(state);
}

function passWindow(state: GameState): ApplyResult {
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
        : "Corp mandatory draw — R&D empty (not modeled further in v0).",
    );
    const next = typeof step.next === "function" ? step.next(state) : step.next;
    enterStep(state, next);
    autoWalk(state);
    return ok(state);
  }

  if (step.key === "run.jackOutWindow") {
    log(state, `Runner declines to jack out (appendix 11.4_4_c).`);
  }

  if (step.key === "run.approachPaw") {
    log(state, `Approach PAW closes without further paid abilities (appendix 11.4_2_b).`);
    closePriorityWindow(state, step.key);
  }

  if (step.key === "run.encounterPaw") {
    log(
      state,
      `Encounter break window closes (appendix 11.4_3_b / CR ${CR.encounterBreakPaw.number}).`,
    );
    closePriorityWindow(state, step.key);
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
    return fail("Ice can only be rezzed during the approach PAW in v0.", [
      CR.rezInPaw,
      CR.rezIceRestriction,
    ]);
  }
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
  log(
    state,
    `Corp rezzes ${card.title} for ${cost}¢ (CR ${CR.rezInPaw.number}, ${CR.rezProcedure.number}).`,
  );
  if (card.prevention?.jackOutForRun && state.run) {
    state.run.cannotJackOut = true;
    addRestriction(state, "jack_out", CR.cannotPrecedence, card.id);
  }
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
  // Source must be available: Runner rig, or Corp rezzed approached ice / installed.
  if (card.side === "runner" && !state.runner.rig.includes(cardId)) {
    return fail("Breaker/program not installed.", [CR.paidAbility]);
  }
  if (card.side === "corp") {
    if (window === "approach_paw") {
      const approached = approachedIceId(state);
      if (approached !== cardId || !card.rezzed) {
        // Allow fortify on approached ice only if already rezzed, OR allow on unrezzed? Fortify typically after rez. Require rezzed approached ice.
        if (approached !== cardId) {
          return fail("Paid ability source is not the approached ice.", [
            CR.paidAbility,
          ]);
        }
        if (!card.rezzed) {
          return fail("Ice must be rezzed to use this ability.", [CR.paidAbility]);
        }
      }
    }
  }

  const payer = card.side === "corp" ? state.corp : state.runner;
  if (payer.clicks < ability.clickCost) {
    return fail("Insufficient clicks for paid ability.", [CR.paidAbility]);
  }
  if (payer.credits < ability.creditCost) {
    return fail("Insufficient credits for paid ability.", [
      CR.paidAbility,
      CR.costCheckpoint,
    ]);
  }

  const amount = ability.pumpAmount ?? 1;
  // Validate effect preconditions before paying (CR 1.16.3 cost checkpoint).
  if (ability.effect === "pump_strength") {
    if (!state.run) {
      return fail("Pump requires an active run/encounter.", [
        CR.icebreakerStrengthImplicit,
      ]);
    }
    if (!card.breaker) {
      return fail("Pump requires an icebreaker.", [CR.programStrength]);
    }
  } else if (ability.effect === "fortify_ice") {
    if (!state.run || card.type !== "ice") {
      return fail("Fortify requires approached ice during a run.", [
        CR.iceStrength,
      ]);
    }
  } else if (ability.effect === "gain_credit") {
    // no extra preconditions
  } else {
    const _e: never = ability.effect;
    return fail(`Unhandled paid ability effect: ${_e}`, [CR.paidAbility]);
  }

  withCostCheckpoint(state, `use_paid_ability:${abilityId}`, () => {
    payer.clicks -= ability.clickCost;
    payer.credits -= ability.creditCost;
  });

  if (ability.effect === "pump_strength") {
    state.run!.strengthBoosts[cardId] =
      (state.run!.strengthBoosts[cardId] ?? 0) + amount;
    const eff = effectiveBreakerStrength(state, cardId);
    log(
      state,
      `Pump ${card.title} +${amount} → strength ${eff} (CR ${CR.icebreakerStrengthImplicit.number}, ${CR.paidAbility.number}).`,
    );
    return ok(state);
  }
  if (ability.effect === "fortify_ice") {
    state.run!.iceStrengthBoosts[cardId] =
      (state.run!.iceStrengthBoosts[cardId] ?? 0) + amount;
    const eff = effectiveIceStrength(state, cardId);
    log(
      state,
      `Fortify ${card.title} +${amount} → strength ${eff} (CR ${CR.iceStrength.number}, ${CR.paidAbility.number}).`,
    );
    return ok(state);
  }
  // gain_credit
  payer.credits += 1;
  log(
    state,
    `${card.side} gains 1¢ from paid ability (CR ${CR.gainCredits.number}, ${CR.paidAbility.number}).`,
  );
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

/** Pure action apply: returns a new state or a cited legality error. */
export function applyAction(state: GameState, action: Action): ApplyResult {
  const next = cloneState(state);
  if (next.done && action.type !== "pass_window") {
    return fail("Game demo marked done.", []);
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
            : fail("Runner installs go to the rig in v0.", [
                CR.runnerBasicInstall,
              ]);
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

    case "rez_ice":
      return rezIce(next, action.cardId);

    case "break_subroutine":
      return breakSubroutine(next, action.breakerId, action.subIndex);

    case "use_paid_ability":
      return usePaidAbility(next, action.cardId, action.abilityId);

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
      enterStep(next, "breach.access");
      const card = next.cards[action.cardId];
      card.faceup = true;
      log(
        next,
        `Accessed ${card.title} (appendix ${getStep(next).stepNumber}).`,
      );
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
      if (next.run.accessCandidates.length > 0) {
        return fail("Candidates remain.", [CR.remoteCandidates]);
      }
      enterStep(next, "breach.complete");
      autoWalk(next);
      const cont = advanceRunUntilStop(next);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }

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
    `Corp: ${state.corp.clicks} clicks, ${state.corp.credits}c, hand=${state.corp.hand.length}, R&D=${state.corp.deck.length}`,
    `Runner: ${state.runner.clicks} clicks, ${state.runner.credits}c, grip=${state.runner.hand.length}, rig=${state.runner.rig.length}`,
    `Servers: ${listServers(state)
      .map((s) => {
        const iceDesc = s.ice
          .map((id) => `${state.cards[id].title}${state.cards[id].rezzed ? "*" : ""}`)
          .join("|");
        return `${s.id}[ice=${iceDesc || "—"},root=${s.root.length}]`;
      })
      .join(", ")}`,
  ];
  if (state.checkpoints.length) {
    lines.push(
      `Checkpoints: ${state.checkpoints.map((c) => `${c.kind}:${c.label}`).join(" > ")}`,
    );
  }
  if (state.restrictions.length) {
    lines.push(
      `Restrictions: ${state.restrictions.map((r) => `${r.forbid}@${r.source}`).join(", ")}`,
    );
  }
  if (state.run) {
    lines.push(
      `Run: ${state.run.attackedServerId} phase=${state.run.phase} success=${state.run.successful} pos=${state.run.position} etr=${state.run.endedTheRun} noJack=${state.run.cannotJackOut}`,
    );
    const boosts = Object.entries(state.run.strengthBoosts);
    const iceBoosts = Object.entries(state.run.iceStrengthBoosts);
    if (boosts.length || iceBoosts.length) {
      lines.push(
        `Strength boosts: breaker={${boosts.map(([k, v]) => `${k}:+${v}`).join(",")}} ice={${iceBoosts.map(([k, v]) => `${k}:+${v}`).join(",")}}`,
      );
    }
    if (state.run.encounter) {
      const iceId = state.run.encounter.iceId;
      lines.push(
        `Encounter: ${iceId} str=${effectiveIceStrength(state, iceId)} broken=${state.run.encounter.broken.join(",")}`,
      );
    }
  }
  const empty = emptyRemoteExists(state);
  if (empty) lines.push(`Empty remote present: ${empty.id}`);
  return lines.join("\n");
}
