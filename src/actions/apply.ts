import { activePlayer, cloneState, log } from "../state/createGame.js";
import type {
  Action,
  ApplyResult,
  GameState,
  InstallDestination,
  RuleCite,
  Server,
  ServerId,
} from "../state/types.js";
import {
  BREACH_STEPS,
  CORP_STEPS,
  CR,
  RUNNER_STEPS,
  RUN_STEPS,
} from "../timing/labels.js";

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

function ensureActionPhase(state: GameState): ApplyResult | null {
  if (state.run) {
    return fail("Cannot take a basic turn action while a run is in progress.", [
      CR.runnerBasicRun,
      CR.actionPhase,
    ]);
  }
  if (state.turnPhase !== "corp_action" && state.turnPhase !== "runner_action") {
    return fail("Basic actions are only legal during the action phase.", [
      CR.actionPhase,
      CR.basicActions,
    ]);
  }
  if (
    state.timing.stepId !== CORP_STEPS.takeAction.stepId &&
    state.timing.stepId !== RUNNER_STEPS.takeAction.stepId &&
    state.timing.stepId !== CORP_STEPS.actionWindow.stepId &&
    state.timing.stepId !== RUNNER_STEPS.actionWindow.stepId
  ) {
    // Allow actions once we have entered the action loop.
    if (
      state.turnPhase === "corp_action" ||
      state.turnPhase === "runner_action"
    ) {
      return null;
    }
    return fail("Not at an action step.", [CR.actionPhase]);
  }
  return null;
}

function afterAction(state: GameState): void {
  const p = activePlayer(state);
  if (p.clicks > 0) {
    state.timing =
      state.activeSide === "corp"
        ? { ...CORP_STEPS.actionWindow }
        : { ...RUNNER_STEPS.actionWindow };
  } else {
    state.timing =
      state.activeSide === "corp"
        ? { ...CORP_STEPS.actionPhaseEnd }
        : { ...RUNNER_STEPS.actionPhaseEnd };
  }
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
  if (card.type !== "asset" && card.type !== "agenda" && card.type !== "ice" && card.type !== "upgrade") {
    return fail("v0 Corp install supports asset/agenda/ice/upgrade only.", [
      CR.installing,
    ]);
  }

  let server: Server;
  if (destination.kind === "new_remote") {
    if (card.type === "ice") {
      // Installing ice into a brand-new remote creates that remote (may be empty of root).
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
    // Outermost: unshift so index 0 is outermost.
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

/**
 * v0 run resolver: supports servers with no ice, or only unrezzed ice
 * (approach → skip encounter → movement → approach server).
 * Rezzed ice / breaking is out of scope.
 */
function resolveRunToBreach(state: GameState): ApplyResult {
  const run = state.run!;
  const server = state.servers[run.attackedServerId];

  state.timing = { ...RUN_STEPS.begin };
  log(state, `Run begins (appendix ${RUN_STEPS.begin.stepNumber}).`);

  for (let i = 0; i < server.ice.length; i++) {
    const iceId = server.ice[i];
    const ice = state.cards[iceId];
    run.position = i;
    run.phase = "approach_ice";
    log(
      state,
      `Approach ice ${ice.title} at position ${i} (appendix 11.4_2).`,
    );
    if (ice.rezzed) {
      return fail(
        "v0 cannot encounter rezzed ice (no breaker DSL yet).",
        [CR.runnerBasicRun],
      );
    }
    log(state, `Ice unrezzed — skip encounter (appendix 11.4_2_c_ii).`);
    run.phase = "movement";
    log(state, `Pass ice / move inward (appendix 11.4_4).`);
  }

  run.position = null;
  state.timing = { ...RUN_STEPS.approachServer };
  log(
    state,
    `Approach server (appendix ${RUN_STEPS.approachServer.stepNumber}).`,
  );
  run.phase = "success";
  state.timing = { ...RUN_STEPS.success };
  run.successful = true;
  log(state, `Run successful (CR ${CR.successfulRun.number}).`);
  state.timing = { ...RUN_STEPS.breach };
  beginBreach(state);
  return ok(state);
}

function startRun(state: GameState, serverId: ServerId): ApplyResult {
  const server = state.servers[serverId];
  if (!server) {
    return fail("Unknown attacked server.", [CR.announceServer]);
  }
  // Empty remotes (no root) are legal; may still have ice protecting them.
  state.run = {
    attackedServerId: serverId,
    phase: "initiation",
    position: server.ice.length > 0 ? 0 : null,
    successful: null,
    accessedCardIds: [],
    accessCandidates: [],
  };
  state.timing = { ...RUN_STEPS.announce };
  log(
    state,
    `Runner announces run on ${serverId} (CR ${CR.runnerBasicRun.number}, ${CR.announceServer.number}).`,
  );
  return resolveRunToBreach(state);
}

function beginBreach(state: GameState): void {
  const run = state.run!;
  const server = state.servers[run.attackedServerId];
  run.accessCandidates = [...server.root];
  run.phase = "breach";
  state.timing = { ...BREACH_STEPS.begin };
  log(
    state,
    `Breach begins on ${server.id} with ${run.accessCandidates.length} candidate(s) (CR ${CR.breach.number}, ${CR.remoteCandidates.number}).`,
  );
  state.timing = { ...BREACH_STEPS.choose };
  if (run.accessCandidates.length === 0) {
    log(state, "No access candidates — empty server breach completes.");
    finishBreach(state);
  }
}

function finishBreach(state: GameState): void {
  state.timing = { ...BREACH_STEPS.complete };
  log(state, `Breach complete (appendix ${BREACH_STEPS.complete.stepNumber}).`);
  const run = state.run!;
  run.phase = "ends";
  state.timing = { ...RUN_STEPS.runEnds };
  log(state, `Run complete (appendix ${RUN_STEPS.runEnds.stepNumber}).`);
  state.run = null;
  // Return to runner action loop.
  afterAction(state);
}

function advanceDrawPhase(state: GameState): ApplyResult {
  if (state.timing.stepId === CORP_STEPS.gainClicks.stepId) {
    state.corp.clicks = 3;
    log(
      state,
      `Corp gains 3 clicks (CR ${CR.corpAllottedClicks.number} / appendix ${CORP_STEPS.gainClicks.stepNumber}).`,
    );
    state.timing = { ...CORP_STEPS.mandatoryDraw };
    return ok(state);
  }
  if (state.timing.stepId === CORP_STEPS.mandatoryDraw.stepId) {
    const drew = drawOne(state, "corp");
    log(
      state,
      drew
        ? `Corp mandatory draw (CR ${CR.mandatoryDraw.number} / appendix ${CORP_STEPS.mandatoryDraw.stepNumber}).`
        : "Corp mandatory draw — R&D empty (not modeled further in v0).",
    );
    state.turnPhase = "corp_action";
    state.timing = { ...CORP_STEPS.actionWindow };
    return ok(state);
  }
  return fail("Nothing to advance in draw phase.", []);
}

function advanceRunnerStart(state: GameState): ApplyResult {
  if (state.timing.stepId === RUNNER_STEPS.gainClicks.stepId) {
    state.runner.clicks = 4;
    log(
      state,
      `Runner gains 4 clicks (CR ${CR.runnerAllottedClicks.number} / appendix ${RUNNER_STEPS.gainClicks.stepNumber}). No draw phase (CR ${CR.noRunnerDrawPhase.number}).`,
    );
    state.turnPhase = "runner_action";
    state.timing = { ...RUNNER_STEPS.actionWindow };
    return ok(state);
  }
  return fail("Nothing to advance at runner start.", []);
}

function passWindow(state: GameState): ApplyResult {
  // Draw-phase automation
  if (state.turnPhase === "corp_draw") {
    return advanceDrawPhase(state);
  }
  if (
    state.activeSide === "runner" &&
    state.timing.stepId === RUNNER_STEPS.gainClicks.stepId
  ) {
    return advanceRunnerStart(state);
  }

  // Paid windows → take-action step
  if (state.timing.stepId === CORP_STEPS.actionWindow.stepId) {
    if (state.corp.clicks > 0) {
      state.timing = { ...CORP_STEPS.takeAction };
      return ok(state);
    }
    state.timing = { ...CORP_STEPS.actionPhaseEnd };
    return ok(state);
  }
  if (state.timing.stepId === RUNNER_STEPS.actionWindow.stepId) {
    if (state.runner.clicks > 0) {
      state.timing = { ...RUNNER_STEPS.takeAction };
      return ok(state);
    }
    state.timing = { ...RUNNER_STEPS.actionPhaseEnd };
    return ok(state);
  }

  // End action phase → discard
  if (state.timing.stepId === CORP_STEPS.actionPhaseEnd.stepId) {
    state.turnPhase = "corp_discard";
    state.timing = { ...CORP_STEPS.discard };
    return ok(state);
  }
  if (state.timing.stepId === RUNNER_STEPS.actionPhaseEnd.stepId) {
    state.turnPhase = "runner_discard";
    state.timing = { ...RUNNER_STEPS.discard };
    return ok(state);
  }

  // After discard / turn complete
  if (state.timing.stepId === CORP_STEPS.turnComplete.stepId) {
    state.activeSide = "runner";
    state.turnPhase = "runner_action";
    state.timing = { ...RUNNER_STEPS.gainClicks };
    log(state, "Runner turn begins.");
    return ok(state);
  }
  if (state.timing.stepId === RUNNER_STEPS.turnComplete.stepId) {
    state.turnNumber += 1;
    state.activeSide = "corp";
    state.turnPhase = "corp_draw";
    state.timing = { ...CORP_STEPS.gainClicks };
    state.done = true;
    log(state, "Vertical slice complete — returning to Corp would be turn " + state.turnNumber);
    return ok(state);
  }

  // During breach with candidates — pass is not enough
  if (state.run?.phase === "breach" && state.run.accessCandidates.length > 0) {
    return fail("Choose a card to access or finish is unavailable while candidates remain.", [
      CR.breach,
    ]);
  }

  return fail(`Cannot pass at step ${state.timing.stepId}.`, []);
}

function discardPhase(state: GameState): ApplyResult {
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
  p.clicks = 0;
  if (p.side === "corp") {
    state.timing = { ...CORP_STEPS.turnComplete };
  } else {
    state.timing = { ...RUNNER_STEPS.turnComplete };
  }
  return ok(state);
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

    case "basic_gain_credit": {
      const bad = ensureActionPhase(next) ?? spendClick(next);
      if (bad) return bad;
      const cite =
        next.activeSide === "corp" ? CR.corpBasicCredit : CR.runnerBasicCredit;
      activePlayer(next).credits += 1;
      log(
        next,
        `${next.activeSide} gains 1 credit (CR ${cite.number}, ${CR.gainCredits.number}).`,
      );
      afterAction(next);
      return ok(next);
    }

    case "basic_draw": {
      const bad = ensureActionPhase(next) ?? spendClick(next);
      if (bad) return bad;
      const cite =
        next.activeSide === "corp" ? CR.corpBasicDraw : CR.runnerBasicDraw;
      const drew = drawOne(next, next.activeSide);
      if (!drew) {
        return fail("Deck is empty.", [cite, CR.drawing]);
      }
      log(next, `${next.activeSide} draws 1 (CR ${cite.number}, ${CR.drawing.number}).`);
      afterAction(next);
      return ok(next);
    }

    case "basic_install": {
      const bad = ensureActionPhase(next) ?? spendClick(next);
      if (bad) return bad;
      const result =
        next.activeSide === "corp"
          ? installCorp(next, action.cardId, action.destination)
          : action.destination.kind === "rig"
            ? installRunner(next, action.cardId)
            : fail("Runner installs go to the rig in v0.", [CR.runnerBasicInstall]);
      if (!result.ok) return result;
      afterAction(result.state);
      return result;
    }

    case "basic_run": {
      if (next.activeSide !== "runner") {
        return fail("Only the Runner may make a run.", [CR.runnerBasicRun]);
      }
      const bad = ensureActionPhase(next) ?? spendClick(next);
      if (bad) return bad;
      return startRun(next, action.serverId);
    }

    case "access_card": {
      if (!next.run || next.run.phase !== "breach") {
        return fail("No breach in progress.", [CR.breach]);
      }
      const idx = next.run.accessCandidates.indexOf(action.cardId);
      if (idx < 0) {
        return fail("Card is not an access candidate.", [CR.remoteCandidates]);
      }
      next.run.accessCandidates.splice(idx, 1);
      next.run.accessedCardIds.push(action.cardId);
      next.timing = { ...BREACH_STEPS.access };
      const card = next.cards[action.cardId];
      card.faceup = true;
      log(
        next,
        `Accessed ${card.title} (appendix ${BREACH_STEPS.access.stepNumber}).`,
      );
      next.timing = { ...BREACH_STEPS.choose };
      if (next.run.accessCandidates.length === 0) {
        finishBreach(next);
      }
      return ok(next);
    }

    case "finish_breach": {
      if (!next.run || next.run.phase !== "breach") {
        return fail("No breach in progress.", [CR.breach]);
      }
      if (next.run.accessCandidates.length > 0) {
        return fail("Candidates remain.", [CR.remoteCandidates]);
      }
      finishBreach(next);
      return ok(next);
    }

    case "discard_to_hand_size": {
      if (
        next.turnPhase !== "corp_discard" &&
        next.turnPhase !== "runner_discard"
      ) {
        return fail("Not in discard phase.", [CR.maxHandSize]);
      }
      return discardPhase(next);
    }

    case "continue_run":
    case "jack_out":
      return fail("v0 empty-server runs auto-resolve; jack-out not required.", [
        CR.runnerBasicRun,
      ]);

    default: {
      const _exhaustive: never = action;
      return fail(`Unknown action: ${JSON.stringify(_exhaustive)}`, []);
    }
  }
}

/** List legal actions at the current timing cursor (v0 subset). */
export function legalActions(state: GameState): Action[] {
  if (state.done) return [];

  const actions: Action[] = [];

  if (
    state.turnPhase === "corp_draw" ||
    state.timing.stepId === RUNNER_STEPS.gainClicks.stepId ||
    state.timing.stepId === CORP_STEPS.actionWindow.stepId ||
    state.timing.stepId === RUNNER_STEPS.actionWindow.stepId ||
    state.timing.stepId === CORP_STEPS.actionPhaseEnd.stepId ||
    state.timing.stepId === RUNNER_STEPS.actionPhaseEnd.stepId ||
    state.timing.stepId === CORP_STEPS.turnComplete.stepId ||
    state.timing.stepId === RUNNER_STEPS.turnComplete.stepId
  ) {
    actions.push({ type: "pass_window" });
  }

  if (state.turnPhase === "corp_discard" || state.turnPhase === "runner_discard") {
    actions.push({ type: "discard_to_hand_size" });
  }

  if (state.run?.phase === "breach") {
    for (const id of state.run.accessCandidates) {
      actions.push({ type: "access_card", cardId: id });
    }
    if (state.run.accessCandidates.length === 0) {
      actions.push({ type: "finish_breach" });
    }
    return actions;
  }

  const atAction =
    state.timing.stepId === CORP_STEPS.takeAction.stepId ||
    state.timing.stepId === RUNNER_STEPS.takeAction.stepId;

  if (atAction && !state.run) {
    const p = activePlayer(state);
    if (p.clicks > 0) {
      actions.push({ type: "basic_gain_credit" });
      if (p.deck.length > 0) actions.push({ type: "basic_draw" });
      if (state.activeSide === "corp") {
        for (const id of state.corp.hand) {
          const card = state.cards[id];
          if (card.type === "asset" || card.type === "agenda") {
            actions.push({
              type: "basic_install",
              cardId: id,
              destination: { kind: "new_remote" },
            });
          }
          if (card.type === "ice") {
            // Prefer creating an empty remote via ice for the vertical slice.
            actions.push({
              type: "basic_install",
              cardId: id,
              destination: { kind: "new_remote" },
            });
            for (const s of listServers(state)) {
              actions.push({
                type: "basic_install",
                cardId: id,
                destination: { kind: "protect", serverId: s.id },
              });
            }
          }
        }
      } else {
        for (const id of state.runner.hand) {
          const card = state.cards[id];
          if (["program", "hardware", "resource"].includes(card.type)) {
            actions.push({
              type: "basic_install",
              cardId: id,
              destination: { kind: "rig" },
            });
          }
        }
        for (const s of listServers(state)) {
          const rezzedIce = s.ice.some((id) => state.cards[id].rezzed);
          if (!rezzedIce) {
            actions.push({ type: "basic_run", serverId: s.id });
          }
        }
      }
    }
  }

  return actions;
}

export function describeState(state: GameState): string {
  const lines = [
    `Turn ${state.turnNumber} | active=${state.activeSide} | phase=${state.turnPhase}`,
    `Timing: [${state.timing.stepNumber}] ${state.timing.label} (${state.timing.stepId})`,
    `Corp: ${state.corp.clicks} clicks, ${state.corp.credits}c, hand=${state.corp.hand.length}, R&D=${state.corp.deck.length}`,
    `Runner: ${state.runner.clicks} clicks, ${state.runner.credits}c, grip=${state.runner.hand.length}, rig=${state.runner.rig.length}`,
    `Servers: ${listServers(state)
      .map((s) => `${s.id}[ice=${s.ice.length},root=${s.root.length}]`)
      .join(", ")}`,
  ];
  if (state.run) {
    lines.push(
      `Run: ${state.run.attackedServerId} phase=${state.run.phase} success=${state.run.successful} accessed=${state.run.accessedCardIds.length}`,
    );
  }
  const empty = emptyRemoteExists(state);
  if (empty) lines.push(`Empty remote present: ${empty.id}`);
  return lines.join("\n");
}
