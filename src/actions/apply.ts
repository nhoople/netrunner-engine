import { activePlayer, cloneState, log } from "../state/createGame.js";
import {
  currentWindow,
  effectiveBreakerStrength,
  continuousIceRezCostIncrease,
  continuousIceRezCostReduction,
  iceShareServer,
  rootRezCostReduction,
  rezCostDiscountPerRezzedSubtype,
  rezCostDiscountPerOtherUnrezzedIce,
  rezCostDiscountIfAgendaScoredOrStolenThisTurn,
  effectiveIceStrength,
  effectiveIceSubtypes,
  iceBlocksAiBreak,
  isAiBreaker,
  applyHostServerRecurringTowardCorpRez,
  applyRezIceRecurringTowardCorpRez,
  applyAdvanceIceRecurringTowardAdvance,
  applyAdvanceThisServerRecurringTowardAdvance,
  runnerTrashCostForCard,
  iceRezCostReductionFromScoredAgendaCounters,
} from "../cards/stubs.js";
import {
  cannotBreakExceptIcebreakerActive,
  cardHasIcebreakerSubtype,
  hasActiveLockdown,
  stealAdditionalCreditsFromActiveLockdowns,
} from "../state/lockdowns.js";
import {
  placeCurrentAfterPlay,
  runnerCannotPlayCurrentEvents,
  sumRunnerFirstRunAdditionalCost,
  isCurrentCard,
} from "../state/currents.js";
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
import {
  evalEffect,
  fireHostRezStateTriggers,
  fireIceRezDuringRunHooks,
  fireOnAnyIceRez,
  fireAfterBreakSubroutineHooks,
  fireOnAfterOperationOrExpendable,
  fireGrayBlackOpsTrashedHooks,
  maybeFireFluxFirstBreakCharge,
  resumeExclusiveChoicesIfPending,
  resumePendingEffectContinuation,
  validatePaidEffect,
} from "../effects/eval.js";
import { syncAllTourGuideSubs } from "../effects/sansanUotPrimitives.js";
import {
  abilityCost,
  canPayCost,
  creditsAvailableForInstall,
  effectiveEventPlayCost,
  firstDoubleOperationClickDiscountAvailable,
  payCost,
  runnerAvailableCreditsForBreaker,
  runnerCreditsFor,
  spendCreditsForInstall,
  spendRunnerCredits,
  spendRunnerCreditsFor,
} from "../state/costs.js";
import {
  acceptPendingDamage,
  dealDamage,
  preventPendingDamage,
  preventPendingDamageLoseAllClicks,
} from "../state/damage.js";
import { acceptPendingTags } from "../state/tags.js";
import {
  acceptPendingExpose,
} from "../state/expose.js";
import {
  acceptPendingInstalledTrash,
} from "../state/trashPrevent.js";
import { acceptPendingEndTheRun } from "../state/endTheRun.js";
import { resolveSabotageAmount } from "../state/msKeywords.js";
import { noteVirusProgramInstalled } from "../state/virusInstall.js";
import { noteInstalledThisTurn, noteProgramOrHardwareInstalled } from "../state/programHardwareInstall.js";
import { fireRunnerValTrigger } from "../effects/sansanValHooks.js";
import {
  azJobConnectionOrHardwareInstallDiscount,
  noteJobConnectionOrHardwareInstalled,
} from "../state/azInstallDiscount.js";
import {
  fireHostedCreditsOnAnyIceRez,
  firePowerCounterOnAnyCardRez,
  firePowerCounterOnAnyCorpInstall,
  firePowerOnHarmonicIceRez,
  syncGainsSubroutinesPerAdvancement,
} from "../state/powerCounters.js";
import { recomputeRunnerMaxHandSize } from "../state/handSize.js";
import { fireFirstBadPublicityTake } from "../state/badPublicityHooks.js";
import { noteCorpActionType } from "../state/corpActionHooks.js";
import { fireCorpIdentityFlippedFirstOperationPlay } from "../state/identityFlipHooks.js";
import {
  fireCorpOnTrash,
  moveRunnerCardToHeap,
  noteAccessTrash,
  noteCorpCardAddedToArchives,
  noteFirstCorpCardTrashEachTurn,
  noteFirstCorpRootInstallEachTurn,
  noteFirstCorpCardInstallEachTurn,
  noteFirstInstallInServerRootThisTurn,
  recomputeRunnerLink,
  noteFirstRemoteInstallThisTurn,
} from "../state/trashHooks.js";
import { fireFirstAgendaScoredOrStolenThisTurn } from "../state/agendaHooks.js";
import { boostTrace, resolveTrace, spendLink } from "../state/trace.js";
import { psiCorpBid, psiRunnerBid } from "../state/psi.js";
import { resolvePendingOnEncounter } from "../state/onEncounter.js";
import type { Effect } from "../effects/ir.js";
import {
  agendaPointsFor,
  canScoreAgenda,
  checkWinConditions,
  removeCardFromCurrentZone,
  scoreAgenda,
  stealAgenda,
} from "../state/scoring.js";
import {
  markAbilityUsed,
  markAbilityUsedThisEncounter,
  markAbilityUsedThisRun,
  memoryLimit,
  usedMemory,
  effectiveMemoryCost,
  wasAbilityUsed,
  wasAbilityUsedThisEncounter,
  wasAbilityUsedThisRun,
} from "../state/turn.js";
import { noteRunnerClickSpend } from "../state/clickHooks.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { runnerAbilityCarrierIds } from "../state/fenris.js";
import { beginBreachAccess } from "../state/access.js";
import { effectiveRunnerTags, runnerIsTagged } from "../state/tags.js";
import { applyRunAccessRestrictions } from "../state/accessFilter.js";
import { isRunTargetAllowed } from "../state/runLegality.js";
import { additionalRunInitiateTax } from "../state/runInitiateTax.js";
import {
  collectPersistentAmazeTags,
  isServerAllowedForSpec,
  modifiersFromStartsRun,
  type RunModifiers,
} from "../state/runStart.js";
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
import { fx } from "../effects/ir.js";
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
  if (state.activeSide === "runner") {
    state.turn.runnerClicksSpentThisTurn =
      (state.turn.runnerClicksSpentThisTurn ?? 0) + 1;
    noteRunnerClickSpend(state);
  }
  return null;
}

/** Patchwork: trash 1 from grip for a once-per-turn play/install discount. */
function applyPatchworkDiscount(
  state: GameState,
  trashGripCardId: string | undefined,
  playingOrInstallingId: string,
): { ok: true; discount: number } | { ok: false; error: string } {
  if (!trashGripCardId) return { ok: true, discount: 0 };
  if (state.turn.patchworkDiscountUsedThisTurn) {
    return { ok: false, error: "Patchwork discount already used this turn." };
  }
  if (trashGripCardId === playingOrInstallingId) {
    return { ok: false, error: "Cannot trash the card being played/installed." };
  }
  let amount = 0;
  let hwId: string | undefined;
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    const n = c?.playOrInstallDiscountByTrashingGripOncePerTurn;
    if (n) {
      amount = n;
      hwId = id;
      break;
    }
  }
  if (!amount || !hwId) {
    return { ok: false, error: "No Patchwork-class discount installed." };
  }
  const idx = state.runner.hand.indexOf(trashGripCardId);
  if (idx < 0) {
    return { ok: false, error: "Patchwork trash target not in grip." };
  }
  state.runner.hand.splice(idx, 1);
  const trashed = state.cards[trashGripCardId]!;
  state.runner.discard.push(trashGripCardId);
  trashed.zone = "runner:heap";
  trashed.faceup = true;
  state.turn.patchworkDiscountUsedThisTurn = true;
  log(
    state,
    `${state.cards[hwId]!.title} — trash ${trashed.title} from grip for −${amount}¢.`,
  );
  return { ok: true, discount: amount };
}

function drawOne(state: GameState, side: "corp" | "runner"): boolean {
  if (side === "runner" && state.activeSide === "runner") {
    let limit: number | undefined;
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        const c = state.cards[id];
        if (
          c?.rezzed &&
          typeof c.runnerCannotDrawMoreThanPerTurn === "number"
        ) {
          limit =
            limit === undefined
              ? c.runnerCannotDrawMoreThanPerTurn
              : Math.min(limit, c.runnerCannotDrawMoreThanPerTurn);
        }
      }
    }
    if (limit !== undefined) {
      const already = state.turn.uotRunnerCardsDrawnThisTurn ?? 0;
      if (already >= limit) {
        log(
          state,
          `Genetics Pavilion — Runner cannot draw more this turn (limit ${limit}).`,
        );
        return false;
      }
    }
  }
  const p = side === "corp" ? state.corp : state.runner;
  const top = p.deck.shift();
  if (!top) return false;
  p.hand.push(top);
  const card = state.cards[top];
  card.zone = side === "corp" ? "corp:hq" : "runner:grip";
  card.faceup = side === "runner";
  if (side === "runner") {
    state.turn.uotRunnerCardsDrawnThisTurn =
      (state.turn.uotRunnerCardsDrawnThisTurn ?? 0) + 1;
  }
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

function remoteServerCount(state: GameState): number {
  return Object.values(state.servers).filter((s) => s.kind === "remote").length;
}

function canCreateAnotherRemote(state: GameState): boolean {
  const idCard = state.cards[state.corp.identityId];
  const max = idCard?.maxRemoteServers;
  if (max === undefined) return true;
  return remoteServerCount(state) < max;
}

function createRemote(state: GameState): Server {
  const id = `remote-${state.nextRemoteNumber++}` as ServerId;
  const server: Server = { id, kind: "remote", ice: [], root: [] };
  state.servers[id] = server;
  state.turn.remotesCreatedThisTurn += 1;
  const idCard = state.cards[state.corp.identityId];
  if (
    idCard?.drawOnFirstRemoteCreated &&
    state.turn.remotesCreatedThisTurn === 1
  ) {
    const n = idCard.drawOnFirstRemoteCreated;
    for (let i = 0; i < n; i++) {
      const top = state.corp.deck.shift();
      if (!top) break;
      state.corp.hand.push(top);
      state.cards[top].zone = "corp:hq";
    }
    log(
      state,
      `${idCard.title} — draw ${n} (first remote this turn).`,
    );
  }
  // Hijacked Router-class: Corp loses credits when creating a server.
  for (const rid of state.runner.rig) {
    const card = state.cards[rid];
    const n = card?.corpLosesCreditsOnCreateServer;
    if (typeof n !== "number" || n <= 0) continue;
    const lost = Math.min(n, state.corp.credits);
    state.corp.credits -= lost;
    log(
      state,
      `${card!.title} — Corp loses ${lost}¢ creating a server → ${state.corp.credits}¢.`,
    );
  }
  // Turtlebacks-class: Corp gains credits when creating a server.
  for (const serverKey of Object.keys(state.servers)) {
    const serverObj = state.servers[serverKey as keyof typeof state.servers];
    if (!serverObj) continue;
    for (const rid of [...serverObj.root, ...serverObj.ice]) {
      const card = state.cards[rid];
      if (!card?.rezzed) continue;
      const n = card.gainCreditsOnCreateServer;
      if (typeof n !== "number" || n <= 0) continue;
      state.corp.credits += n;
      log(
        state,
        `${card.title} — gain ${n}¢ creating a server → ${state.corp.credits}¢.`,
      );
    }
  }
  return server;
}

function firstIceRezIncrease(state: GameState): number {
  if (state.turn.iceRezzedThisTurn > 0) return 0;
  let increase = 0;
  for (const carrierId of runnerAbilityCarrierIds(state)) {
    if (abilitiesSuppressed(state, carrierId)) continue;
    increase += state.cards[carrierId]?.firstIceRezCostIncrease ?? 0;
  }
  return increase;
}

function carnivoreAvailable(state: GameState): boolean {
  const ids: string[] = [...state.runner.rig];
  if (state.run?.runSourceId) ids.push(state.run.runSourceId);
  for (const id of ids) {
    const card = state.cards[id];
    const spec = card?.accessTrashFromGrip;
    if (!spec) continue;
    if (spec.oncePerTurn && state.turn.carnivoreAccessTrashUsed) continue;
    if (state.runner.hand.length >= spec.gripCards) return true;
  }
  return false;
}

/** Cupellation mid-access host: installed with room, credits, accessing non-agenda. */
function cupellationHostAvailable(state: GameState): boolean {
  if (!state.run?.accessingCardId) return false;
  const accessed = state.cards[state.run.accessingCardId];
  if (!accessed || accessed.type === "agenda" || accessed.side !== "corp") {
    return false;
  }
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    const spec = card?.accessHostNonAgendaFaceup;
    if (!spec) continue;
    const max = card.maxHostedCards ?? Infinity;
    const have = card.hostedCardIds?.length ?? 0;
    if (have >= max) continue;
    if (state.runner.credits < spec.creditCost) continue;
    return true;
  }
  return false;
}

function findCupellationHost(state: GameState): string | null {
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    const spec = card?.accessHostNonAgendaFaceup;
    if (!spec) continue;
    const max = card.maxHostedCards ?? Infinity;
    const have = card.hostedCardIds?.length ?? 0;
    if (have >= max) continue;
    if (state.runner.credits < spec.creditCost) continue;
    return id;
  }
  return null;
}

/** Heliamphora: may host Archives card instead of accessing (once per breach). */
function heliamphoraHostInsteadAvailable(state: GameState): boolean {
  if (!state.run || state.run.attackedServerId !== "archives") return false;
  if (state.run.heliamphoraHostInsteadUsedThisBreach) return false;
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (!card?.onWouldAccessArchivesHostInstead) continue;
    return true;
  }
  return false;
}

function findHeliamphora(state: GameState): string | null {
  for (const id of state.runner.rig) {
    if (state.cards[id]?.onWouldAccessArchivesHostInstead) return id;
  }
  return null;
}

/** Mid-access abilities other than pass (`finish_access`) — CR 11.6_2 / 7.2.2. */
function hasInteractiveMidAccess(state: GameState): boolean {
  const id = state.run?.accessingCardId;
  if (!id) return false;
  const card = state.cards[id];
  if (!card) return false;
  if (
    card.trashCost !== undefined &&
    !state.run!.cannotStealOrTrash &&
    !(
      card.cannotBeTrashedByRunnerWhileRezzed && card.rezzed
    )
  ) {
    const purpose =
      card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
    if (
      runnerCreditsFor(state, purpose) >= runnerTrashCostForCard(state, id)
    ) {
      return true;
    }
  }
  if (carnivoreAvailable(state)) return true;
  if (cupellationHostAvailable(state)) return true;
  if (state.run!.accessTrashFree && !state.run!.cannotStealOrTrash) return true;
  if (!state.run!.cannotStealOrTrash) {
    for (const rid of state.runner.rig) {
      const c = state.cards[rid];
      if (
        c?.accessTrashWithVirus &&
        (c.virusCounters ?? 0) >= 1 &&
        !wasAbilityUsed(state, rid, "imp-access-trash")
      ) {
        return true;
      }
      if (
        c?.accessTrashPayingPrintedCostFromStealth &&
        (c.powerCounters ?? 0) >= 1
      ) {
        const printed = card.rezCost ?? card.playCost ?? 0;
        if (
          canPayCost(
            state,
            "runner",
            { credits: printed, creditsFromStealthOnly: true },
            c,
          )
        ) {
          return true;
        }
      }
      if (
        c?.accessTrashSelfNonAgendaThenDraw &&
        card.type !== "agenda" &&
        card.side === "corp"
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Finish nested 11.6 after trash / steal / skip — enter access.complete then walk. */
function completeAccessAndContinue(state: GameState): ApplyResult {
  enterStep(state, "access.complete");
  autoWalk(state);
  const cont = advanceRunUntilStop(state);
  if (!cont.ok) return cont;
  finishRunReturnToAction(cont.state);
  return cont;
}

/**
 * After landing on access.midAccess: park if interactive mid-access exists;
 * otherwise auto-pass to 11.6_3 / 11.6_4.
 */
function advanceFromMidAccess(state: GameState): ApplyResult {
  if (
    state.pendingChoice ||
    state.pendingDamage ||
    state.pendingTrashProgram ||
    state.pendingSabotage
  ) {
    return ok(state);
  }
  if (state.timingKey === "access.midAccess" && hasInteractiveMidAccess(state)) {
    return ok(state);
  }
  return enterStealAgendaOrComplete(state);
}

/** Enter 11.6_3; park for steal when still accessing an agenda, else complete. */
function enterStealAgendaOrComplete(state: GameState): ApplyResult {
  enterStep(state, "access.stealAgenda");
  const id = state.run?.accessingCardId;
  if (id && state.cards[id]?.type === "agenda") {
    if (state.run?.cannotStealOrTrash) {
      return completeAccessAndContinue(state);
    }
    log(
      state,
      `Access agenda step — steal if able (CR ${CR.midAccessAgenda.number} / appendix 11.6_3).`,
    );
    return ok(state);
  }
  return completeAccessAndContinue(state);
}

/** Host a Corp card faceup on a Runner program (not installed). */
function hostCorpCardFaceupOn(
  state: GameState,
  hostId: string,
  cardId: string,
): void {
  const host = state.cards[hostId]!;
  const card = state.cards[cardId]!;
  removeCardFromCurrentZone(state, cardId);
  // Also strip from Archives / access tracking zones already covered.
  card.hostId = hostId;
  card.zone = `hosted:${hostId}`;
  card.faceup = true;
  card.rezzed = false;
  if (!host.hostedCardIds) host.hostedCardIds = [];
  host.hostedCardIds.push(cardId);
  log(
    state,
    `${host.title} hosts ${card.title} faceup (not installed).`,
  );
}

/** True when `cardId` is in the root of a server other than `attackedServerId`. */
function cardProtectsOtherServer(
  state: GameState,
  cardId: string,
  attackedServerId: string,
): boolean {
  for (const [sid, server] of Object.entries(state.servers)) {
    if (sid === attackedServerId) continue;
    if (server.root.includes(cardId)) return true;
  }
  return false;
}

function approachedIceId(state: GameState): string | null {
  const run = state.run;
  if (!run || run.position === null) return null;
  return state.servers[run.attackedServerId].ice[run.position] ?? null;
}

function stealAdditionalCosts(
  state: GameState,
  serverId: string,
  agendaId?: string,
): Effect[] {
  const out: Effect[] = [];
  if (agendaId) {
    const agendaCost = state.cards[agendaId]?.stealAdditionalCost;
    if (agendaCost) out.push(agendaCost);
  }
  const server = state.servers[serverId as ServerId];
  if (!server) return out;
  for (const id of server.root) {
    const c = state.cards[id];
    if (!c?.stealAdditionalCostFromProtectingServer) continue;
    if (!c.rezzed && !c.persistent) continue;
    out.push(c.stealAdditionalCostFromProtectingServer);
  }
  return out;
}

/** Sum of stealAdditionalCreditsWhileRezzed from rezzed Corp cards + currents. */
function stealAdditionalCreditsTotal(state: GameState): number {
  let total = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      total += c.stealAdditionalCreditsWhileRezzed ?? 0;
    }
  }
  for (const c of Object.values(state.cards)) {
    if (c.zone !== "corp:play-area") continue;
    total += c.stealAdditionalCreditsWhileRezzed ?? 0;
  }
  return total;
}

/** Red Herrings-class: credits from root upgrades protecting the steal server. */
function stealAdditionalCreditsFromProtectingServerRoot(
  state: GameState,
  serverId: string | undefined,
): number {
  if (!serverId) return 0;
  const server = state.servers[serverId as keyof typeof state.servers];
  if (!server) return 0;
  let total = 0;
  for (const id of server.root) {
    const c = state.cards[id];
    if (!c) continue;
    if (!c.rezzed && !c.persistent) continue;
    total += c.stealAdditionalCreditsFromProtectingServer ?? 0;
  }
  return total;
}

function stealAdditionalCreditsForAgenda(
  state: GameState,
  agendaId: string,
  serverId?: string,
): number {
  const agenda = state.cards[agendaId];
  const stealServer =
    serverId ??
    state.run?.attackedServerId ??
    (agenda?.zone.startsWith("server:")
      ? agenda.zone.split(":")[1]
      : undefined);
  let scoredFragment = 0;
  for (const id of state.corp.score) {
    const per = state.cards[id]?.whileScoredStealAdditionalCreditsPerAdvancement;
    if (typeof per === "number" && per > 0) {
      scoredFragment += per * (agenda?.advancementTokens ?? 0);
    }
  }
  return (
    (agenda?.stealAdditionalCredits ?? 0) +
    stealAdditionalCreditsTotal(state) +
    stealAdditionalCreditsFromProtectingServerRoot(state, stealServer) +
    stealAdditionalCreditsFromActiveLockdowns(state, agendaId) +
    scoredFragment
  );
}

function payStealAdditionalCosts(
  state: GameState,
  agendaId: string,
  serverId: string,
): ApplyResult {
  for (const eff of stealAdditionalCosts(state, serverId, agendaId)) {
    const r = evalEffect({ state, sourceId: agendaId }, eff);
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice) return ok(state);
  }
  return ok(state);
}

function completeStealAgenda(
  state: GameState,
  action: { cardId: string },
): ApplyResult {
  const stolen = state.cards[action.cardId];
  const stealServerId = state.run?.attackedServerId;
  stealAgenda(state, action.cardId);
  state.turn.lastStolenAgendaId = action.cardId;
  const sideFx = fireScoreOrStealSideEffects(
    state,
    action.cardId,
    "steal",
    stealServerId,
  );
  if (!sideFx.ok) return sideFx;
  if (stolen.onSteal) {
    const r = evalEffect({ state: state, sourceId: action.cardId }, stolen.onSteal);
    if (!r.ok) return fail(r.error, r.cites);
  }
  // Mystic Maemi / Paladin Poemu: installed Runner cards' onStealAgenda.
  for (const id of [...state.runner.rig]) {
    const card = state.cards[id];
    if (!card?.onStealAgenda) continue;
    const r = evalEffect({ state, sourceId: id }, card.onStealAgenda);
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice) return ok(state);
  }
  const corpId = state.cards[state.corp.identityId];
  if (corpId?.onAgendaStolen) {
    const r = evalEffect(
      { state, sourceId: corpId.id },
      corpId.onAgendaStolen,
    );
    if (!r.ok) return fail(r.error, r.cites);
  }
  // Divested Trust-class: scored agendas react to another agenda being stolen.
  for (const id of [...state.corp.score]) {
    const card = state.cards[id];
    if (!card?.onOtherAgendaStolen) continue;
    const r = evalEffect({ state, sourceId: id }, card.onOtherAgendaStolen);
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice) return ok(state);
  }
  if (state.pendingChoice) return ok(state);
  return completeAccessAndContinue(state);
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
  state.turn.corpInstallInProgress = true;
  try {
    return installCorpInner(state, cardId, destination);
  } finally {
    state.turn.corpInstallInProgress = false;
  }
}

function installCorpInner(
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
  if (card.installServers?.length) {
    const allowed = new Set(card.installServers);
    if (destination.kind === "new_remote") {
      return fail(
        `${card.title} may only be installed on ${card.installServers.join("/")}.`,
        [CR.corpInstallDest],
      );
    }
    if (destination.kind === "remote_root") {
      const sid = String(destination.serverId);
      if (!allowed.has(sid as "hq" | "rd" | "archives")) {
        return fail(
          `${card.title} may only be installed on ${card.installServers.join("/")}.`,
          [CR.corpInstallDest],
        );
      }
    }
  }

  if (destination.kind === "host_upgrade") {
    if (card.type !== "ice" || !(card.subtypes ?? []).includes("bioroid")) {
      return fail("Only bioroid ice may be hosted this way.", [
        CR.corpBasicInstall,
      ]);
    }
    const host = state.cards[destination.hostId];
    if (
      !host ||
      host.type !== "upgrade" ||
      !host.rezzed ||
      !host.hostsBioroidIceIgnoreInstallCost
    ) {
      return fail("Invalid host for hosted bioroid ice.", [
        CR.corpBasicInstall,
      ]);
    }
    const hostInServer = Object.values(state.servers).some((srv) =>
      srv.root.includes(destination.hostId),
    );
    if (!hostInServer) {
      return fail("Host upgrade is not installed.", [CR.corpBasicInstall]);
    }
    state.corp.hand.splice(handIdx, 1);
    card.hostId = destination.hostId;
    card.zone = `hosted:${destination.hostId}`;
    card.rezzed = false;
    card.faceup = false;
    card.advancementTokens = card.advancementTokens ?? 0;
    if (!host.hostedCardIds) host.hostedCardIds = [];
    host.hostedCardIds.push(cardId);
    log(
      state,
      `Corp installs ${card.title} hosted on ${host.title}, ignoring install cost.`,
    );
    noteInstalledThisTurn(state, cardId);
    state.turn.corpInstalledFromHqThisTurn = true;
    firePowerCounterOnAnyCorpInstall(state, cardId);
    noteFirstCorpCardInstallEachTurn(state);
    return ok(state);
  }

  let server: Server;
  if (destination.kind === "new_remote") {
    if (!canCreateAnotherRemote(state)) {
      return fail("Cannot create another remote server.", [CR.corpBasicInstall]);
    }
    if (card.type === "ice") {
      server = createRemote(state);
      log(
        state,
        `Created ${server.id} by installing ice (CR ${CR.creatingRemotes.number} / ${CR.remoteExistence.number}).`,
      );
      fireRunnerOnCorpRemoteServerCreated(state);
    } else if (card.type === "asset" || card.type === "agenda") {
      if (!canCreateAnotherRemote(state)) {
        return fail("Cannot create another remote server.", [CR.corpBasicInstall]);
      }
      server = createRemote(state);
      log(
        state,
        `Created ${server.id} for ${card.type} (CR ${CR.agendaAssetRemote.number}).`,
      );
      fireRunnerOnCorpRemoteServerCreated(state);
    } else {
      return fail("Upgrade needs an existing server.", [CR.corpInstallDest]);
    }
  } else if (destination.kind === "remote_root") {
    server = state.servers[destination.serverId];
    if (!server) {
      return fail("Unknown server.", [CR.corpInstallDest]);
    }
    // Upgrades (and installServers-gated cards) may target central roots;
    // assets/agendas still need remotes unless installServers allows the central.
    if (
      server.kind !== "remote" &&
      card.type !== "upgrade" &&
      !(card.installServers ?? []).includes(
        destination.serverId as "hq" | "rd" | "archives",
      )
    ) {
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

  if (card.remoteOnly && server.kind !== "remote") {
    return fail("Card may only be installed in a remote server.", [
      CR.corpBasicInstall,
    ]);
  }

  if (creditsAvailableForInstall(state, "corp") < card.installCost) {
    return fail("Insufficient credits for install cost.", [
      { number: "8.5.11", id: "sec_install_cost" },
    ]);
  }
  spendCreditsForInstall(state, "corp", card.installCost);
  state.corp.hand.splice(handIdx, 1);

  if (card.type === "ice") {
    server.ice.unshift(cardId);
    card.zone = `server:${server.id}:ice`;
    card.rezzed = false;
    card.faceup = false;
    card.advancementTokens = card.advancementTokens ?? 0;
    // Server Diagnostics: trash when the Corp installs any ice.
    for (const other of Object.values(state.cards)) {
      if (!other.trashSelfOnCorpIceInstall) continue;
      if (other.side !== "corp" || !other.rezzed) continue;
      if (other.id === cardId) continue;
      log(
        state,
        `${other.title} — trashed (Corp installed ice: ${card.title}).`,
      );
      const r = evalEffect({ state, sourceId: other.id }, fx.trashSelf());
      if (!r.ok) {
        log(state, `trashSelfOnCorpIceInstall failed on ${other.title}: ${r.error}`);
      }
    }
  } else {
    // Region limit: trash existing region in this server's root.
    if ((card.subtypes ?? []).includes("region")) {
      trashExistingRegions(state, server, cardId);
    }
    server.root.push(cardId);
    card.zone = `server:${server.id}:root`;
    card.rezzed = false;
    const corpId = state.cards[state.corp.identityId];
    const bangunFaceup =
      card.type === "agenda" && Boolean(corpId?.mayInstallAgendasFaceup);
    if (
      card.installFaceup ||
      (card.subtypes ?? []).includes("public") ||
      bangunFaceup
    ) {
      card.faceup = true;
      if (bangunFaceup) card.faceupInstalledInactive = true;
    } else {
      card.faceup = false;
    }
    if (card.type === "agenda" || card.type === "asset") {
      card.advancementTokens = card.advancementTokens ?? 0;
    }
  }

  log(
    state,
    `Corp installs ${card.title} on ${server.id} (CR ${CR.corpBasicInstall.number}, ${CR.installing.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return fail(r.error, r.cites);
  }
  noteInstalledThisTurn(state, cardId);
  state.turn.corpInstalledFromHqThisTurn = true;
  firePowerCounterOnAnyCorpInstall(state, cardId);
  noteFirstCorpCardInstallEachTurn(state);
  if (server.kind === "remote") {
    noteFirstRemoteInstallThisTurn(state, server.id);
  }
  if (card.type !== "ice") {
    noteFirstCorpRootInstallEachTurn(state);
    noteFirstInstallInServerRootThisTurn(state, server.id, cardId);
  }
  // Amazon Industrial Zone: may immediately rez ice protecting this server (−N).
  if (card.type === "ice" && !state.pendingChoice) {
    for (const rid of server.root) {
      const up = state.cards[rid];
      const discount =
        up?.mayImmediatelyRezIceOnInstallProtectingThisServerDiscount;
      if (!up?.rezzed || typeof discount !== "number") continue;
      const pay = Math.max(0, (card.rezCost ?? 0) - discount);
      state.pendingChoice = {
        sourceId: rid,
        chooser: "corp",
        options: [
          {
            id: `aiz-rez:${cardId}`,
            label: `Rez ${card.title} for ${pay}¢ (−${discount})`,
            effect: {
              op: "do",
              action: {
                kind: "rez_ice_with_discount",
                cardId,
                discount,
              },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
      };
      log(
        state,
        `${up.title} — may immediately rez ${card.title} (−${discount}¢).`,
      );
      break;
    }
  }
  return ok(state);
}

function countInstalledIcebreakers(state: GameState): number {
  return state.runner.rig.filter(
    (id) =>
      Boolean(state.cards[id].breaker) ||
      (state.cards[id].subtypes ?? []).includes("icebreaker"),
  ).length;
}

function runnerInstallCost(
  state: GameState,
  card: GameState["cards"][string],
  destination?: InstallDestination,
): number {
  let cost = card.installCost;
  if (
    card.installCostDiscountIfSuccessfulRunThisTurn &&
    state.turn.successfulRunThisTurn
  ) {
    cost = Math.max(
      0,
      cost - card.installCostDiscountIfSuccessfulRunThisTurn,
    );
  }
  if (
    card.installCostDiscountIfSuccessfulHqRunThisTurn &&
    state.turn.successfulHqRunThisTurn
  ) {
    cost = Math.max(
      0,
      cost - card.installCostDiscountIfSuccessfulHqRunThisTurn,
    );
  }
  if (card.installCostDiscountPerInstalledIcebreaker) {
    cost = Math.max(
      0,
      cost -
        card.installCostDiscountPerInstalledIcebreaker *
          countInstalledIcebreakers(state),
    );
  }
  if (card.type === "program" && state.turn.programsInstalledThisTurn === 0) {
    for (const id of state.runner.rig) {
      const discount = state.cards[id].firstProgramInstallDiscount ?? 0;
      if (discount > 0) cost = Math.max(0, cost - discount);
    }
  }
  if (
    (card.type === "program" || card.type === "hardware") &&
    state.turn.programsInstalledThisTurn === 0 &&
    state.turn.hardwareInstalledThisTurn === 0
  ) {
    const idCard = state.cards[state.runner.identityId];
    let kate = idCard?.firstProgramOrHardwareInstallDiscount ?? 0;
    for (const id of state.runner.rig) {
      kate = Math.max(
        kate,
        state.cards[id]?.firstProgramOrHardwareInstallDiscount ?? 0,
      );
    }
    if (kate > 0) cost = Math.max(0, cost - kate);
  }
  {
    const azDisc = azJobConnectionOrHardwareInstallDiscount(state, card);
    if (azDisc > 0) cost = Math.max(0, cost - azDisc);
  }
  if (state.turn.patchworkPendingDiscountThisAction > 0) {
    cost = Math.max(0, cost - state.turn.patchworkPendingDiscountThisAction);
  }
  if (
    destination?.kind === "host_card" &&
    card.type === "resource" &&
    card.unique
  ) {
    const host = state.cards[destination.hostId];
    const disc = host?.hostsUniqueCompanionOrConnectionResources?.creditDiscount;
    if (
      typeof disc === "number" &&
      disc > 0 &&
      ((card.subtypes ?? []).includes("companion") ||
        (card.subtypes ?? []).includes("connection"))
    ) {
      cost = Math.max(0, cost - disc);
    }
  }
  if (
    card.type === "program" ||
    card.type === "hardware" ||
    card.type === "resource"
  ) {
    const isFirst =
      state.turn.programsInstalledThisTurn === 0 &&
      state.turn.hardwareInstalledThisTurn === 0;
    if (isFirst) {
      let bump = 0;
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const root = state.cards[id];
          if (!root?.rezzed) continue;
          const per =
            root.runnerFirstInstallCostIncreasePerPowerCounterOnThis ?? 0;
          if (per > 0) bump += per * (root.powerCounters ?? 0);
        }
      }
      if (bump > 0) cost += bump;
    }
  }
  return cost;
}

function fireRunnerOnCorpRemoteServerCreated(state: GameState): void {
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    if (!c?.onCorpRemoteServerCreated) continue;
    const r = evalEffect({ state, sourceId: id }, c.onCorpRemoteServerCreated);
    if (!r.ok) {
      log(state, `onCorpRemoteServerCreated failed on ${c.title}: ${r.error}`);
    }
  }
}

/** Forfeit the first scored agenda that can be forfeited. */
function forfeitAgenda(state: GameState): void {
  const id = state.corp.score.find((x) => !state.cards[x]?.cannotForfeit);
  if (!id) return;
  state.corp.score = state.corp.score.filter((x) => x !== id);
  const card = state.cards[id];
  if (card.onForfeit) {
    const r = evalEffect({ state, sourceId: id }, card.onForfeit);
    if (!r.ok) {
      log(state, `Forfeit ${card.title} — onForfeit failed: ${r.error}`);
    }
  }
  state.corp.discard.push(id);
  card.zone = "corp:archives";
  card.faceup = true;
  log(state, `Forfeit ${card.title}.`);
}

function trashExistingConsoles(state: GameState, keepId: string): void {
  const toTrash = state.runner.rig.filter((id) => {
    if (id === keepId) return false;
    return (state.cards[id].subtypes ?? []).includes("console");
  });
  for (const id of toTrash) {
    const card = state.cards[id];
    moveRunnerCardToHeap(state, id);
    log(
      state,
      `Trash ${card.title} — console limit (CR ${CR.trashing.number}).`,
    );
  }
}

function trashExistingRegions(
  state: GameState,
  server: Server,
  keepId: string,
): void {
  const toTrash = server.root.filter((id) => {
    if (id === keepId) return false;
    return (state.cards[id].subtypes ?? []).includes("region");
  });
  for (const id of toTrash) {
    const card = state.cards[id];
    server.root = server.root.filter((x) => x !== id);
    state.corp.discard.push(id);
    card.zone = "corp:archives";
    card.faceup = true;
    card.rezzed = false;
    log(
      state,
      `Trash ${card.title} — region limit (CR ${CR.trashing.number}).`,
    );
  }
}

function fireCookbookOnVirusInstall(state: GameState, installedId: string): void {
  const installed = state.cards[installedId];
  if (!(installed.subtypes ?? []).includes("virus")) return;
  for (const id of state.runner.rig) {
    if (id === installedId) continue;
    if (state.cards[id].defId !== "cookbook") continue;
    // May place 1 virus counter on the installed virus — auto-apply (may).
    installed.virusCounters = (installed.virusCounters ?? 0) + 1;
    if (!state.turn.programsWithVirusPlacedThisTurn.includes(installedId)) {
      state.turn.programsWithVirusPlacedThisTurn.push(installedId);
    }
    log(
      state,
      `Cookbook places 1 virus counter on ${installed.title}.`,
    );
  }
}


function hostedPlayableAsGrip(state: GameState, cardId: string): string | null {
  const card = state.cards[cardId];
  if (!card?.hostId) return null;
  const host = state.cards[card.hostId];
  if (!host?.hostedCardsPlayableAsGrip) return null;
  if (!(host.hostedCardIds ?? []).includes(cardId)) return null;
  return card.hostId;
}

function installRunner(
  state: GameState,
  cardId: string,
  destination?: InstallDestination,
): ApplyResult {
  const card = state.cards[cardId];
  if (!card || card.side !== "runner") {
    return fail("Card not a Runner card.", [CR.runnerBasicInstall]);
  }
  const handIdx = state.runner.hand.indexOf(cardId);
  const blingHostId = handIdx < 0 ? hostedPlayableAsGrip(state, cardId) : null;
  if (handIdx < 0 && !blingHostId) {
    return fail("Card not in grip.", [CR.runnerBasicInstall]);
  }
  if (!["program", "hardware", "resource"].includes(card.type)) {
    return fail("Runner install supports program/hardware/resource.", [
      CR.runnerBasicInstall,
    ]);
  }
  if (card.installRequiresSuccessfulCentralRunThisTurn) {
    const okCentral =
      state.turn.successfulHqRunThisTurn ||
      state.turn.successfulRdRunThisTurn ||
      state.turn.successfulArchivesRunThisTurn;
    if (!okCentral) {
      return fail(
        "Install requires a successful run on a central server this turn.",
        [CR.runnerBasicInstall],
      );
    }
  }
  if (card.installOnIce || (card.subtypes ?? []).includes("trojan")) {
    if (!destination || destination.kind !== "host_ice") {
      return fail("Trojan must be installed hosted on ice.", [
        CR.runnerBasicInstall,
      ]);
    }
    const host = state.cards[destination.iceId];
    if (!host || host.type !== "ice") {
      return fail("Host must be installed ice.", [CR.runnerBasicInstall]);
    }
    if (card.hostGainsAllIceSubtypes && !host.rezzed) {
      return fail("Egret must be installed on rezzed ice.", [
        CR.runnerBasicInstall,
      ]);
    }
    let found = false;
    for (const server of Object.values(state.servers)) {
      if (server.ice.includes(destination.iceId)) {
        found = true;
        break;
      }
    }
    if (!found) {
      return fail("Host ice is not installed.", [CR.runnerBasicInstall]);
    }
    card.hostId = destination.iceId;
  } else if (destination && destination.kind === "host_ice") {
    return fail("Only trojans install hosted on ice.", [CR.runnerBasicInstall]);
  } else if (destination && destination.kind === "host_card") {
    const host = state.cards[destination.hostId];
    if (!host || !state.runner.rig.includes(destination.hostId)) {
      return fail("Invalid host.", [CR.runnerBasicInstall]);
    }
    if (host.hostNonAiIcebreaker) {
      const max = host.maxHostedCards ?? 1;
      const have = (host.hostedCardIds ?? []).length;
      if (have >= max) {
        return fail("Host has no free host slots.", [CR.runnerBasicInstall]);
      }
      if (card.type !== "program" || !card.breaker) {
        return fail("Only icebreakers may host on Dinosaurus.", [
          CR.runnerBasicInstall,
        ]);
      }
      if ((card.subtypes ?? []).includes("ai") || card.breaker.breaksSubtype === "*") {
        return fail("Cannot host an AI icebreaker here.", [
          CR.runnerBasicInstall,
        ]);
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
    } else if (host.hostsAnyProgramMemoryCostLte !== undefined) {
      const max = host.maxHostedCards ?? 1;
      const have = (host.hostedCardIds ?? []).length;
      if (have >= max) {
        return fail("Host has no free host slots.", [CR.runnerBasicInstall]);
      }
      if (card.type !== "program") {
        return fail("Only programs may host here.", [CR.runnerBasicInstall]);
      }
      const printedMu = card.memoryCost ?? 0;
      if (printedMu > host.hostsAnyProgramMemoryCostLte) {
        return fail(
          `Only programs with ${host.hostsAnyProgramMemoryCostLte} MU or less may host here.`,
          [CR.runnerBasicInstall],
        );
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
    } else if (host.daemonHost) {
      if (card.type !== "program") {
        return fail("Only programs may host on a daemon.", [
          CR.runnerBasicInstall,
        ]);
      }
      if ((card.subtypes ?? []).includes("daemon")) {
        return fail("Cannot host a daemon on a daemon.", [
          CR.runnerBasicInstall,
        ]);
      }
      if (
        host.daemonHostExcludeIcebreaker &&
        (card.breaker || (card.subtypes ?? []).includes("icebreaker"))
      ) {
        return fail("This daemon cannot host icebreakers.", [
          CR.runnerBasicInstall,
        ]);
      }
      const maxMu = host.daemonHostMaxMu;
      if (typeof maxMu === "number") {
        const used = (host.hostedCardIds ?? []).reduce((sum, id) => {
          return sum + effectiveMemoryCost(state, id);
        }, 0);
        const need = effectiveMemoryCost(state, cardId);
        if (used + need > maxMu) {
          return fail("Daemon has insufficient hosting MU.", [
            CR.runnerBasicInstall,
          ]);
        }
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
    } else if (host.hostsUniqueCompanionOrConnectionResources) {
      if (card.type !== "resource" || !card.unique) {
        return fail(
          "Only unique companion/connection resources host here.",
          [CR.runnerBasicInstall],
        );
      }
      const subs = card.subtypes ?? [];
      if (!subs.includes("companion") && !subs.includes("connection")) {
        return fail(
          "Only unique companion/connection resources host here.",
          [CR.runnerBasicInstall],
        );
      }
      card.hostId = destination.hostId;
    } else if (host.hostsConnectionResources) {
      if (
        card.type !== "resource" ||
        !(card.subtypes ?? []).includes("connection")
      ) {
        return fail("Only connections host on Off-Campus Apartment.", [
          CR.runnerBasicInstall,
        ]);
      }
      card.hostId = destination.hostId;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(cardId);
      const drawN = host.drawOnHostConnectionInstall ?? 0;
      if (drawN > 0) {
        for (let i = 0; i < drawN; i++) {
          if (state.runner.deck.length === 0) break;
          const top = state.runner.deck.shift()!;
          state.runner.hand.push(top);
          const drawn = state.cards[top];
          if (drawn) drawn.zone = "runner:grip";
        }
        log(
          state,
          `Off-Campus Apartment — draw ${drawN} (hosted connection).`,
        );
      }
    } else {
      return fail("Invalid host for card.", [CR.runnerBasicInstall]);
    }
  }
  if (card.type === "program") {
    const hostExempt =
      destination?.kind === "host_card" &&
      Boolean(
        state.cards[destination.hostId]?.hostedIcebreakerMemoryDoesNotCount ||
          state.cards[destination.hostId]?.daemonHost ||
          state.cards[destination.hostId]?.hostsAnyProgramMemoryCostLte !==
            undefined,
      );
    const need = effectiveMemoryCost(state, cardId);
    if (!hostExempt && usedMemory(state) + need > memoryLimit(state)) {
      return fail("Insufficient memory units to install program.", [
        CR.runnerBasicInstall,
      ]);
    }
  }
  const cost = runnerInstallCost(state, card, destination);
  if (creditsAvailableForInstall(state, "runner", card) < cost) {
    return fail("Insufficient credits for install cost.", [
      { number: "8.5.11", id: "sec_install_cost" },
    ]);
  }
  spendCreditsForInstall(state, "runner", cost, card);
  if (handIdx >= 0) {
    state.runner.hand.splice(handIdx, 1);
  } else if (blingHostId) {
    const host = state.cards[blingHostId]!;
    host.hostedCardIds = (host.hostedCardIds ?? []).filter((id) => id !== cardId);
    card.hostId = undefined;
  }
  state.runner.rig.push(cardId);
  card.zone = "runner:rig";
  card.faceup = true;
  if ((card.recurringCreditsMax ?? 0) > 0) {
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.hostedCreditsOnInstall ?? 0) > 0) {
    card.hostedCredits = card.hostedCreditsOnInstall;
  }
  if ((card.powerCountersOnInstall ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnInstall;
  }
  if (card.installSpendCreditsForPowerCounters) {
    const x = state.runner.credits;
    if (x > 0) {
      state.runner.credits = 0;
      card.powerCounters = (card.powerCounters ?? 0) + x;
      log(
        state,
        `${card.title} — spend ${x}¢ for ${x} power counter(s).`,
      );
    }
  }
  if (card.chooseBreakerSubtypeOnInstall && card.breaker) {
    // Honesty: default to barrier when no interactive choice.
    card.breaker.breaksSubtype = "barrier";
    card.subtypes = [
      ...(card.subtypes ?? []).filter(
        (s) => s !== "barrier" && s !== "code gate" && s !== "sentry",
      ),
      "barrier",
    ];
    log(state, `${card.title} — choose barrier (auto).`);
  }
  if (card.chooseIceOnInstallForBypass || card.chooseIceOnInstall) {
    let pick: string | undefined;
    for (const server of Object.values(state.servers)) {
      if (server.ice.length > 0) {
        pick = server.ice[0];
        break;
      }
    }
    if (pick) {
      card.chosenIceId = pick;
      log(
        state,
        card.chooseIceOnInstallForBypass
          ? `${card.title} — choose ${state.cards[pick].title} for bypass.`
          : `${card.title} — choose ${state.cards[pick].title} (chosen ice).`,
      );
    }
  }
  if (
    (card.handSizeBonus ?? 0) !== 0 ||
    (card.handSizePerPowerCounter ?? 0) !== 0 ||
    (card.hostId &&
      state.cards[card.hostId]?.handSizeBonusIfHostingCompanionAndConnection)
  ) {
    recomputeRunnerMaxHandSize(state);
  }
  if ((card.subtypes ?? []).includes("console")) {
    trashExistingConsoles(state, cardId);
  }
  noteInstalledThisTurn(state, cardId);
  if (card.type === "program") {
    state.turn.programsInstalledThisTurn += 1;
  }
  if (card.type === "resource") {
    state.turn.runnerInstalledResourceThisTurn = true;
  }
  if (card.type === "program" && card.hostId) {
    const host = state.cards[card.hostId];
    const bonus = host?.gainCreditsWhenRunnerHostsProgramOnSelf ?? 0;
    if (bonus > 0) {
      state.runner.credits += bonus;
      log(
        state,
        `${host!.title} — gain ${bonus}¢ for hosting ${card.title}.`,
      );
    }
  }
  noteJobConnectionOrHardwareInstalled(state, card);
  log(
    state,
    card.hostId
      ? `Runner installs ${card.title} hosted on ${state.cards[card.hostId].title} for ${cost}¢ (CR ${CR.runnerBasicInstall.number}).`
      : `Runner installs ${card.title} for ${cost}¢ (CR ${CR.runnerBasicInstall.number}).`,
  );
  if (card.onInstall) {
    const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
    if (!r.ok) return fail(r.error, r.cites);
  }
  fireCookbookOnVirusInstall(state, cardId);
  noteVirusProgramInstalled(state, cardId);
  noteProgramOrHardwareInstalled(state, cardId);
  recomputeRunnerLink(state);
  if (
    card.type === "program" &&
    (card.subtypes ?? []).includes("icebreaker") &&
    !(card.subtypes ?? []).includes("ai")
  ) {
    for (const rid of state.runner.rig) {
      if (rid === cardId) continue;
      const host = state.cards[rid];
      const bonus = host?.nonAiIcebreakerInstallStrengthBonusThisTurn;
      if (!bonus) continue;
      state.turn.breakerStrengthBoostsThisTurn[cardId] =
        (state.turn.breakerStrengthBoostsThisTurn[cardId] ?? 0) + bonus;
      log(
        state,
        `${host.title} — ${card.title} +${bonus} strength this turn.`,
      );
    }
  }
  if (cost === 0) {
    for (const rid of state.runner.rig) {
      const host = state.cards[rid];
      if (!host?.onInstallWithoutSpendingCredits) continue;
      const r = evalEffect(
        { state, sourceId: rid },
        host.onInstallWithoutSpendingCredits,
      );
      if (!r.ok) {
        log(state, `onInstallWithoutSpendingCredits failed on ${host.title}: ${r.error}`);
      }
    }
  }
  return ok(state);
}

/** Auto-advance the run graph until a player window or the run ends. */
function advanceRunUntilStop(state: GameState): ApplyResult {
  for (let guard = 0; guard < 64; guard++) {
    if (
      state.pendingTrashProgram ||
      state.pendingChoice ||
      state.trace ||
      state.psi ||
      state.pendingDamage
    ) {
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
      // Formicary-class 6.8.2c: other frames already on the stack from
      // closePriorityWindows — do not open a duplicate PAW frame.
      if (
        step.kind === "pass" &&
        step.key !== "run.completeOtherPriorityWindows"
      ) {
        ensurePriorityWindow(state);
      }
      return ok(state);
    }

    if (step.structure === "runner_turn") {
      return ok(state);
    }

    if (step.kind === "auto" || step.kind === "branch") {
      step.onResolve?.(state);
      if (
        state.pendingTrashProgram ||
        state.pendingChoice ||
        state.trace ||
        state.psi ||
        state.pendingDamage
      ) {
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

function startRun(
  state: GameState,
  serverId: ServerId,
  mods: RunModifiers = {},
): ApplyResult {
  if (state.turn.cannotMakeAnotherRunThisTurn) {
    return fail("Runner cannot make another run this turn.", [
      CR.runnerBasicRun,
    ]);
  }
  const server = state.servers[serverId];
  if (!server) {
    return fail("Unknown attacked server.", [CR.announceServer]);
  }
  const initiateTax = additionalRunInitiateTax(state, serverId);
  if (initiateTax.clicks > 0) {
    if (state.runner.clicks < initiateTax.clicks) {
      return fail(
        `Cannot pay additional ${initiateTax.clicks} [click] to initiate this run.`,
        [CR.runnerBasicRun, CR.costCheckpoint],
      );
    }
  }
  if (initiateTax.credits > 0) {
    if (state.runner.credits < initiateTax.credits) {
      return fail(
        `Cannot pay additional ${initiateTax.credits}¢ to initiate this run.`,
        [CR.runnerBasicRun, CR.costCheckpoint],
      );
    }
  }
  if (initiateTax.clicks > 0) {
    state.runner.clicks -= initiateTax.clicks;
    state.turn.runnerClicksSpentThisTurn += initiateTax.clicks;
    log(
      state,
      `Runner spends ${initiateTax.clicks} [click] additional cost to initiate run on ${serverId}.`,
    );
  }
  if (initiateTax.credits > 0) {
    state.runner.credits -= initiateTax.credits;
    log(
      state,
      `Runner pays ${initiateTax.credits}¢ additional cost to initiate run on ${serverId}.`,
    );
    // Not GameNET: spend is the cost to initiate, not "during a run" (1.16.2b).
  }
  if (!state.turn.serversRunThisTurn.includes(serverId)) {
    state.turn.serversRunThisTurn.push(serverId);
  }
  // Replicating Perfection: running a central unlocks remotes until EOT.
  if (
    server.kind === "central" &&
    state.cards[state.corp.identityId]?.cannotRunRemotesUntilCentralRunThisTurn
  ) {
    state.turn.remotesUnlockedByCentralRunThisTurn = true;
  }
  // Sundew: if first click-spend action starts a run on watched server, refund.
  if (state.turn.sundewRefundServerIdsThisAction.includes(serverId)) {
    for (const id of state.servers[serverId]?.root ?? []) {
      const card = state.cards[id];
      const refund = card?.refundCreditsIfRunBeginsOnThisServerDuringClickAction;
      if (!card?.rezzed || !refund) continue;
      const pay = Math.min(refund, state.corp.credits);
      state.corp.credits -= pay;
      log(
        state,
        `${card.title} — pay ${pay}¢ (run began on this server during click action).`,
      );
    }
    state.turn.sundewRefundServerIdsThisAction = [];
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
    bonusAccess: mods.bonusAccess,
    iceRezCostIncrease: mods.iceRezCostIncrease,
    iceRezAdditionalCostEqualsPrintedRezCost:
      mods.iceRezAdditionalCostEqualsPrintedRezCost,
    firstApproachedIceAdditionalRezCost:
      mods.firstApproachedIceAdditionalRezCost,
    briberyFirstIceRezConsumed: false,
    eventCredits: mods.eventCredits,
    runSourceId: mods.runSourceId,
    onSuccessfulRunEffect: mods.onSuccessfulRunEffect,
    addPowerCounterOnSubroutineResolve: mods.addPowerCounterOnSubroutineResolve,
    onRunEndEffect: mods.onRunEndEffect,
    agendasStolenThisRun: 0,
    persistentTagsIfAgendaStolen: mods.persistentTagsIfAgendaStolen ?? 0,
    bypassFirstEncounter: mods.bypassFirstEncounter,
    bypassEncountersRemaining: mods.bypassEncountersRemaining,
    mayJackOutOnFirstIceEncounter: mods.mayJackOutOnFirstIceEncounter,
    bypassInnermostEncounter: mods.bypassInnermostEncounter,
    bypassSecondEncounterForClick: mods.bypassSecondEncounterForClick,
    bypassFirstEncounterForClicks: mods.bypassFirstEncounterForClicks,
    mayRezEventDerezzedIceOnRunEndIgnoreCosts:
      mods.mayRezEventDerezzedIceOnRunEndIgnoreCosts,
    derezProtectingIceOnRunBegin: mods.derezProtectingIceOnRunBegin,
    iceEncounteredCount: 0,
    redirectSuccessTo: mods.redirectSuccessTo,
    redirectApproachArchivesToHq: mods.redirectApproachArchivesToHq,
    archivesApproachRedirectUsed: false,
    mayRedirectApproachArchivesToHqOrRdPayingStealthCredits:
      mods.mayRedirectApproachArchivesToHqOrRdPayingStealthCredits,
    blockCreditPoolSpendAndLose: mods.blockCreditPoolSpendAndLose,
    forbidCorpRezIceDuringRun: mods.forbidCorpRezIceDuringRun,
    shredPreventFirstEndTheRun: mods.shredPreventFirstEndTheRun,
    shredFirstEndTheRunUsed: false,
    bypassedIceIds: [],
    passedIceIds: [],
    skipBreachInstallProgramFromHeap: mods.skipBreachInstallProgramFromHeap,
    skipBreach: mods.skipBreach ?? false,
    immolationScriptAccessReplace: mods.immolationScriptAccessReplace ?? false,
    accessTrashFree: mods.accessTrashFree ?? false,
    accessFromBottomOfRd: mods.accessFromBottomOfRd ?? false,
    trashFirstFullyBrokenSubtype: mods.trashFirstFullyBrokenSubtype,
    blankAttackedServerRoot: mods.blankAttackedServerRoot,
    blankIdentities: mods.blankIdentities,
    approachServerTriggersFiredIds: [],
    approachIceTriggersFiredIds: [],
  };
  const src = mods.runSourceId ? state.cards[mods.runSourceId] : undefined;
  if (src?.blankIdentitiesWhileResolving) {
    state.run.blankIdentities = true;
  }
  const pending = (src as { betaBuildPendingTrackId?: string } | undefined)
    ?.betaBuildPendingTrackId;
  if (pending) {
    state.run.betaBuildTrackedInstallId = pending;
    delete (src as { betaBuildPendingTrackId?: string }).betaBuildPendingTrackId;
  }
  state.turn.runnerMadeRunThisTurn = true;
  state.turn.currentRunPassedUnrezzedIceIds = [];
  // Capture Amaze (and similar) already rezzed on the attacked server.
  const amaze = collectPersistentAmazeTags(state);
  if (amaze > 0) {
    state.run.persistentTagsIfAgendaStolen = Math.max(
      state.run.persistentTagsIfAgendaStolen ?? 0,
      amaze,
    );
  }
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
  if (state.pendingEndTheRun) {
    return fail("Prevent or accept pending end the run before passing.", [
      CR.endTheRun,
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
    // Daily Business Show: first draw +1 then put 1 drawn on bottom of R&D.
    const dbs = Object.values(state.cards).find(
      (c) => c.rezzed && c.interruptFirstDrawBottomOne,
    );
    if (dbs) {
      const drew1 = drawOne(state, "corp");
      const drew2 = drawOne(state, "corp");
      if (drew1 && drew2 && state.corp.hand.length >= 2) {
        const bottom = state.corp.hand.pop()!;
        state.corp.deck.push(bottom);
        state.cards[bottom].zone = "corp:rd";
        state.cards[bottom].faceup = false;
        log(
          state,
          `Daily Business Show — draw 2, put ${state.cards[bottom].title} on bottom of R&D.`,
        );
      } else {
        log(
          state,
          drew1
            ? `Corp mandatory draw (CR ${CR.mandatoryDraw.number} / appendix ${step.stepNumber}).`
            : "Corp mandatory draw — R&D empty (not modeled further).",
        );
      }
    } else {
      const drew = drawOne(state, "corp");
      log(
        state,
        drew
          ? `Corp mandatory draw (CR ${CR.mandatoryDraw.number} / appendix ${step.stepNumber}).`
          : "Corp mandatory draw — R&D empty (not modeled further).",
      );
    }
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
    step.key === "run.approachServerPaw" ||
    step.key === "run.encounterPaw";

  if (step.key === "run.completeOtherPriorityWindows") {
    // CR 6.8.2c — complete one remaining non-PAW frame (Formicary-class).
    const pw = state.priorityStack.pop();
    if (pw) {
      log(
        state,
        `Complete open priority window @ ${pw.stepKey} without new structures (CR ${CR.runEndsOtherPriorityWindows.number} / appendix 11.4_6_a).`,
      );
    }
    if (state.priorityStack.length > 0) {
      return ok(state);
    }
    if (state.run) state.run.forbidNewTimingStructures = false;
    resolveAndAdvance(state);
    if (inRunOrBreach) {
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
    return ok(state);
  }

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
    if (step.key === "run.approachServerPaw") {
      log(state, `Approach-server PAW closes.`);
    }
    if (step.key === "run.encounterPaw") {
      resolvePendingOnEncounter(state);
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
  if (p.side === "corp") {
    const idCard = state.cards[state.corp.identityId];
    if (idCard?.handSizeEqualsCredits) {
      state.corp.maxHandSize = state.corp.credits;
      log(
        state,
        `${idCard.title}: Corp max hand size = credits (${state.corp.maxHandSize}) (CR ${CR.maxHandSize.number}).`,
      );
    }
  }
  if (state.turn.skipDiscardThisTurn) {
    state.turn.skipDiscardThisTurn = false;
    log(
      state,
      `${p.side} skips discard step (hand ${p.hand.length}, max ${p.maxHandSize}).`,
    );
  } else {
    state.turn.runnerDiscardedToMaxHandIds = [];
    while (p.hand.length > p.maxHandSize) {
      const id = p.hand.pop()!;
      p.discard.push(id);
      const card = state.cards[id];
      card.zone = p.side === "corp" ? "corp:archives" : "runner:heap";
      if (p.side === "corp") card.faceup = false;
      if (p.side === "runner") {
        state.turn.runnerDiscardedToMaxHandIds.push(id);
      }
    }
    log(
      state,
      `${p.side} discards to hand size ${p.maxHandSize} (CR ${CR.maxHandSize.number}).`,
    );
    if (p.side === "runner") {
      const idCard = state.cards[state.runner.identityId];
      if (
        idCard?.onRunnerDiscardOverMaxHand &&
        state.turn.runnerDiscardedToMaxHandIds.length > 0
      ) {
        const r = evalEffect(
          { state, sourceId: state.runner.identityId },
          idCard.onRunnerDiscardOverMaxHand,
        );
        if (!r.ok) {
          log(
            state,
            `onRunnerDiscardOverMaxHand failed on ${idCard.title}: ${r.error}`,
          );
        }
        if (state.pendingChoice) {
          return ok(state);
        }
      }
    }
  }
  if (p.side === "corp") {
    const walk: string[] = [];
    for (const id of state.corp.score) walk.push(id);
    for (const server of Object.values(state.servers)) {
      for (const id of server.root) {
        const c = state.cards[id];
        if (c?.rezzed) walk.push(id);
      }
    }
    walk.push(state.corp.identityId);
    for (const id of walk) {
      const card = state.cards[id];
      if (!card?.onDiscardPhaseEnd) continue;
      const r = evalEffect(
        { state, sourceId: id },
        card.onDiscardPhaseEnd,
      );
      if (!r.ok) {
        log(state, `onDiscardPhaseEnd error on ${card.title}: ${r.error}`);
      }
      if (state.pendingChoice) {
        return ok(state);
      }
    }
  } else if (p.side === "runner") {
    // Identity + installed rig (The Class Act and cousins).
    const walk = [state.runner.identityId, ...state.runner.rig];
    for (const id of walk) {
      const card = state.cards[id];
      if (!card?.onDiscardPhaseEnd) continue;
      const r = evalEffect(
        { state, sourceId: id },
        card.onDiscardPhaseEnd,
      );
      if (!r.ok) {
        log(state, `onDiscardPhaseEnd error on ${card.title}: ${r.error}`);
      }
      if (state.pendingChoice) {
        return ok(state);
      }
    }
    // Méliès U: while flipped, flip back when Runner discard phase ends.
    const corpId = state.cards[state.corp.identityId];
    if (
      corpId?.identityFlipped &&
      corpId.identityFlippedHooks?.onRunnerDiscardPhaseEnd
    ) {
      const r = evalEffect(
        { state, sourceId: state.corp.identityId },
        corpId.identityFlippedHooks.onRunnerDiscardPhaseEnd,
      );
      if (!r.ok) {
        log(
          state,
          `identityFlipped onRunnerDiscardPhaseEnd failed on ${corpId.title}: ${r.error}`,
        );
      }
      if (state.pendingChoice) {
        return ok(state);
      }
    }
  }
  const next =
    typeof getStep(state).next === "function"
      ? (getStep(state).next as (s: GameState) => string)(state)
      : (getStep(state).next as string);
  enterStep(state, next);
  autoWalk(state);
  return ok(state);
}

function iceServerId(
  state: GameState,
  iceId: string,
): string | null {
  for (const [sid, server] of Object.entries(state.servers)) {
    if (server.ice.includes(iceId)) return sid;
  }
  return null;
}

function rezIce(state: GameState, cardId: string): ApplyResult {
  const card = state.cards[cardId];
  if (!card || card.type !== "ice") {
    return fail("Not ice.", [CR.rezProcedure]);
  }
  const asNonIce =
    Boolean(card.rezAsNonIceDuringRunsOnServer) &&
    Boolean(state.run) &&
    iceServerId(state, cardId) === state.run!.attackedServerId;
  if (asNonIce) {
    const paw = currentWindow(state.timingKey);
    if (paw !== "approach_server_paw" && paw !== "corp_action_paw") {
      return fail(
        "This ice may only be rezzed as non-ice during approach-server or Corp action PAWs.",
        [CR.rezInPaw, CR.rezProcedure],
      );
    }
  } else if (state.timingKey !== "run.approachPaw") {
    return fail("Ice can only be rezzed during the approach PAW.", [
      CR.rezInPaw,
      CR.rezIceRestriction,
    ]);
  }
  ensurePriorityWindow(state);
  if (!asNonIce) {
    const approached = approachedIceId(state);
    if (approached !== cardId) {
      return fail("Only the approached ice may be rezzed here.", [
        CR.rezIceRestriction,
      ]);
    }
  }
  if (card.rezzed) {
    return fail("Ice is already rezzed.", [CR.rezProcedure]);
  }
  // DDoS: Corp cannot rez the outermost piece of ice during a run this turn.
  if (state.turn.uotCannotRezOutermostIce && state.run) {
    const sid = iceServerId(state, cardId);
    if (sid && state.servers[sid]?.ice[0] === cardId) {
      return fail("DDoS — cannot rez outermost ice during a run this turn.", [
        CR.rezProcedure,
      ]);
    }
  }
  if (
    state.turn.cannotScoreOrRezCardIds.includes(cardId) ||
    state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(cardId)
  ) {
    return fail("Cannot rez this card for the remainder of this turn.", [
      CR.rezProcedure,
    ]);
  }
  const iqIncrease =
    (card.rezCostIncreasePerCorpCardInHq ?? 0) * state.corp.hand.length;
  const increase =
    (state.run?.iceRezCostIncrease ?? 0) +
    (state.run?.iceRezAdditionalCostEqualsPrintedRezCost
      ? (card.rezCost ?? 0)
      : 0) +
    (!state.run?.briberyFirstIceRezConsumed
      ? (state.run?.firstApproachedIceAdditionalRezCost ?? 0)
      : 0) +
    continuousIceRezCostIncrease(state, cardId) +
    (state.turn.iceAdditionalRezCostThisTurn[cardId] ?? 0) +
    firstIceRezIncrease(state) +
    iqIncrease -
    (state.turn.pendingBioroidRezDiscount ?? 0);
  const discount =
    rezCostDiscountPerRezzedSubtype(state, cardId) +
    rezCostDiscountPerOtherUnrezzedIce(state, cardId) +
    rezCostDiscountIfAgendaScoredOrStolenThisTurn(state, cardId) +
    iceRezCostReductionFromScoredAgendaCounters(state);
  const serverReduction = continuousIceRezCostReduction(state, cardId);
  const advRezReduction =
    (card.rezCostReductionPerAdvancement ?? 0) *
    (card.advancementTokens ?? 0);
  let cost = Math.max(
    0,
    (card.rezCost ?? 0) + increase - discount - serverReduction - advRezReduction,
  );
  cost = applyHostServerRecurringTowardCorpRez(state, cardId, cost);
  cost = applyRezIceRecurringTowardCorpRez(state, cost);
  const agendaCreditDiscount = card.rezCostCreditDiscountOnForfeitAgenda ?? 0;
  let payCost = cost;
  let forfeitAgendaOnPay = false;
  if (state.turn.rezIceForfeitDiscountCardId === cardId) {
    state.turn.rezIceForfeitDiscountCardId = null;
    payCost = Math.max(0, cost - agendaCreditDiscount);
    forfeitAgendaOnPay = agendaCreditDiscount > 0;
  } else if (
    agendaCreditDiscount > 0 &&
    state.corp.score.length > 0 &&
    state.pendingRezCardId !== cardId
  ) {
    const discountedCost = Math.max(0, cost - agendaCreditDiscount);
    const canPayFull = state.corp.credits >= cost;
    const canPayDiscount = state.corp.credits >= discountedCost;
    if (!canPayFull && !canPayDiscount) {
      return fail("Insufficient credits to rez.", [
        CR.inherentRezCost,
        CR.rezProcedure,
      ]);
    }
    if (canPayDiscount && (canPayFull || state.corp.credits < cost)) {
      state.pendingRezCardId = cardId;
      state.pendingChoice = {
        sourceId: cardId,
        chooser: "corp",
        options: [
          ...(canPayFull
            ? [
                {
                  id: "rez-full",
                  label: `Rez paying full ${cost}¢`,
                  effect: {
                    op: "do" as const,
                    action: {
                      kind: "set_rez_ice_forfeit_discount" as const,
                      cardId,
                      forfeit: false,
                    },
                  },
                },
              ]
            : []),
          {
            id: "rez-forfeit-discount",
            label: `Forfeit 1 agenda (−${agendaCreditDiscount}¢) and rez for ${discountedCost}¢`,
            effect: {
              op: "do" as const,
              action: {
                kind: "set_rez_ice_forfeit_discount" as const,
                cardId,
                forfeit: true,
              },
            },
          },
        ],
      };
      log(
        state,
        `${card.title} — may forfeit an agenda for −${agendaCreditDiscount}¢ rez cost.`,
      );
      return ok(state);
    }
  }
  if (state.corp.credits < payCost) {
    return fail("Insufficient credits to rez.", [
      CR.inherentRezCost,
      CR.rezProcedure,
    ]);
  }
  if (card.rezAdditionalCostForfeitAgenda) {
    if (!state.corp.score.some((id) => !state.cards[id]?.cannotForfeit)) {
      return fail("Rez requires forfeiting 1 agenda.", [CR.rezProcedure]);
    }
  }
  let derezTarget: string | null = null;
  if (card.rezAdditionalCostDerezSubtype) {
    const subtype = card.rezAdditionalCostDerezSubtype;
    const targets: string[] = [];
    for (const server of Object.values(state.servers)) {
      for (const id of server.ice) {
        if (id === cardId) continue;
        const c = state.cards[id];
        if (c?.rezzed && (c.subtypes ?? []).includes(subtype)) {
          targets.push(id);
        }
      }
    }
    if (targets.length === 0) {
      return fail(
        `Rez requires derezzing another rezzed ${subtype} ice.`,
        [CR.rezProcedure],
      );
    }
    // Deterministic: first eligible target (multi-match auto-pick).
    derezTarget = targets[0]!;
  }
  // Valentão-class: additional rez cost Effect (may open a choice).
  if (card.rezAdditionalCost) {
    if (state.pendingRezCardId === cardId) {
      state.pendingRezCardId = null;
    } else {
      state.pendingRezCardId = cardId;
      const r = evalEffect(
        { state, sourceId: cardId },
        card.rezAdditionalCost,
      );
      if (!r.ok) {
        state.pendingRezCardId = null;
        return fail(r.error, r.cites);
      }
      if (state.pendingChoice) {
        // Drop remove-tag when Runner has no tags (must take bad publicity).
        if (state.runner.tags <= 0) {
          state.pendingChoice.options = state.pendingChoice.options.filter(
            (o) => o.id !== "remove-tag",
          );
        }
        if (state.pendingChoice.options.length === 1) {
          const only = state.pendingChoice.options[0]!;
          state.pendingChoice = null;
          const paid = evalEffect(
            { state, sourceId: cardId },
            only.effect,
          );
          if (!paid.ok) {
            state.pendingRezCardId = null;
            return fail(paid.error, paid.cites);
          }
          state.pendingRezCardId = null;
        } else if (state.pendingChoice.options.length === 0) {
          state.pendingRezCardId = null;
          state.pendingChoice = null;
          return fail("No legal additional rez cost.", [CR.rezProcedure]);
        } else {
          return ok(state);
        }
      } else {
        state.pendingRezCardId = null;
      }
    }
  }
  withCostCheckpoint(state, "rez_ice", () => {
    state.corp.credits -= payCost;
    if (forfeitAgendaOnPay) {
      forfeitAgenda(state);
    }
    if (card.rezAdditionalCostForfeitAgenda) {
      forfeitAgenda(state);
    }
    if (derezTarget) {
      const t = state.cards[derezTarget];
      t.rezzed = false;
      t.faceup = false;
      log(
        state,
        `Additional rez cost: derez ${t.title} (${card.rezAdditionalCostDerezSubtype}).`,
      );
    }
  });
  state.turn.pendingBioroidRezDiscount = 0;
  card.rezzed = true;
  card.faceup = true;
  if (state.run && state.timingKey === "run.approachPaw" && card.type === "ice") {
    state.run.iceRezzedDuringApproachId = cardId;
  }
  if (state.turn.socialEngineeringMarkedIce === cardId) {
    const gainAmt = card.rezCost ?? 0;
    if (gainAmt > 0) {
      state.runner.credits += gainAmt;
      log(state, `Social Engineering — Runner gains ${gainAmt}¢.`);
    }
    state.turn.socialEngineeringMarkedIce = undefined;
  }
  state.turn.iceRezzedThisTurn += 1;
  if (!state.turn.rezzedThisTurnIds) state.turn.rezzedThisTurnIds = [];
  if (!state.turn.rezzedThisTurnIds.includes(cardId)) {
    state.turn.rezzedThisTurnIds.push(cardId);
  }
  // Bribery: consume first-ice additional rez once any ice is rezzed this run.
  if (card.type === "ice" && state.run?.firstApproachedIceAdditionalRezCost) {
    state.run.briberyFirstIceRezConsumed = true;
  }
  // Collective Consciousness: draw when Corp rezzes ice.
  if (card.type === "ice") {
    for (const rid of [...state.runner.rig]) {
      const rc = state.cards[rid];
      const n = rc?.drawWhenCorpRezzesIce;
      if (typeof n !== "number" || n <= 0) continue;
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        const top = state.runner.deck.shift();
        if (!top) break;
        state.runner.hand.push(top);
        state.cards[top]!.zone = "runner:grip";
        drawn += 1;
      }
      if (drawn > 0) {
        log(state, `${rc!.title} — draw ${drawn} (Corp rezzed ice).`);
      }
    }
  }
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.onFirstIceRezEachTurn && state.turn.iceRezzedThisTurn === 1) {
    const r = evalEffect(
      { state, sourceId: state.corp.identityId },
      idCard.onFirstIceRezEachTurn,
    );
    if (!r.ok) return fail(r.error, r.cites);
  }
  if (
    (card.recurringCreditsMax ?? 0) > 0 ||
    card.recurringCreditsMaxEqualsRunnerLink ||
    card.recurringCreditsMaxEqualsVirusCounters
  ) {
    if (card.recurringCreditsMaxEqualsRunnerLink) {
      card.recurringCreditsMax = state.runner.link;
    }
    if (card.recurringCreditsMaxEqualsVirusCounters) {
      card.recurringCreditsMax = card.virusCounters ?? 0;
    }
    card.recurringCredits = card.recurringCreditsMax;
  }
  const base = card.rezCost ?? 0;
  let rezDetail = "";
  if (increase > 0 || discount > 0) {
    const parts: string[] = [`base ${base}`];
    if (increase > 0) parts.push(`+${increase}`);
    if (discount > 0) parts.push(`−${discount}`);
    rezDetail = ` (${parts.join("")})`;
  }
  log(
    state,
    `Corp rezzes ${card.title} for ${payCost}¢${rezDetail} (CR ${CR.rezInPaw.number}, ${CR.rezProcedure.number}).`,
  );
  // Amaze becomes persistent once rezzed during the run.
  if (state.run && (card.tagsIfAgendaStolenThisRun ?? 0) > 0) {
    const server = state.servers[state.run.attackedServerId];
    if (server.root.includes(cardId)) {
      state.run.persistentTagsIfAgendaStolen = Math.max(
        state.run.persistentTagsIfAgendaStolen ?? 0,
        card.tagsIfAgendaStolenThisRun ?? 0,
      );
    }
  }
  if (card.onRez) {
    const r = evalEffect({ state, sourceId: cardId }, card.onRez);
    if (!r.ok) return fail(r.error, r.cites);
  } else if (card.prevention?.jackOutForRun && state.run) {
    state.run.cannotJackOut = true;
    addRestriction(state, "jack_out", CR.cannotPrecedence, card.id);
  }
  if ((card.subtypes ?? []).includes("harmonic")) {
    firePowerOnHarmonicIceRez(state, cardId);
  }
  if (card.type === "ice") {
    fireHostedCreditsOnAnyIceRez(state, cardId);
    if (state.run) {
      if (!state.run.iceRezzedThisRunIds) state.run.iceRezzedThisRunIds = [];
      if (!state.run.iceRezzedThisRunIds.includes(cardId)) {
        state.run.iceRezzedThisRunIds.push(cardId);
      }
    }
  }
  firePowerCounterOnAnyCardRez(state, cardId);
  if (card.type === "ice") {
    fireHostRezStateTriggers(state, cardId, "rez");
    fireIceRezDuringRunHooks(state, cardId);
    fireOnAnyIceRez(state, cardId);
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
  if (breaker.breaker.breakViaPaidAbilityOnly) {
    return fail(
      `${breaker.title} breaks only via paid abilities (not credit break).`,
      [CR.encounterBreakPaw],
    );
  }
  if (breaker.cannotBreakSubsThisRun) {
    return fail(
      `${breaker.title}'s abilities cannot break subroutines this run (Hafrún).`,
      [CR.encounterBreakPaw],
    );
  }
  let maxPrinted = ice.maxPrintedSubsBreakablePerEncounter;
  const atAdv = ice.maxPrintedSubsBreakablePerEncounterAtAdvancements;
  if (
    atAdv &&
    (ice.advancementTokens ?? 0) >= atAdv.threshold
  ) {
    maxPrinted = atAdv.max;
  }
  const exceptSub = ice.maxPrintedSubsBreakExceptSubtype;
  const breakerExempt =
    exceptSub && (breaker.subtypes ?? []).includes(exceptSub);
  if (
    typeof maxPrinted === "number" &&
    !breakerExempt &&
    run.encounter.broken.filter(Boolean).length >= maxPrinted
  ) {
    return fail(
      `Cannot break more than ${maxPrinted} printed subroutine(s) on ${ice.title} this encounter.`,
      [CR.encounterBreakPaw],
    );
  }
  if (breaker.breaker.breakRequiresAttackingMark) {
    if (!state.run || state.run.attackedServerId !== state.markServerId) {
      return fail(
        `${breaker.title} can only break ice protecting the mark.`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (typeof breaker.breaker.breakRequiresIceStrengthLte === "number") {
    const iceStr = effectiveIceStrength(state, ice.id);
    if (iceStr > breaker.breaker.breakRequiresIceStrengthLte) {
      return fail(
        `${breaker.title} can only break ice with ${breaker.breaker.breakRequiresIceStrengthLte} or less strength (current ${iceStr}).`,
        [CR.encounterBreakPaw],
      );
    }
  }
  const iceSubs = effectiveIceSubtypes(state, ice.id);
  const breaksAny = breaker.breaker.breaksSubtype === "*";
  if (!breaksAny && !iceSubs.includes(breaker.breaker.breaksSubtype)) {
    return fail(
      `Breaker cannot break ${breaker.breaker.breaksSubtype} on this ice.`,
      [CR.encounterBreakPaw],
    );
  }
  if (iceBlocksAiBreak(state, ice.id) && isAiBreaker(breaker)) {
    return fail("This ice cannot be broken by AI programs.", [
      CR.encounterBreakPaw,
    ]);
  }
  if (ice.cannotBreakExceptSubtype) {
    const need = ice.cannotBreakExceptSubtype;
    if (!(breaker.subtypes ?? []).includes(need)) {
      return fail(
        `Subroutines on ${ice.title} can only be broken by a ${need}.`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (ice.cannotBreakWithRunnerCardAbilities) {
    return fail(
      "Runner card abilities cannot break subroutines on this ice (Trieste).",
      [CR.encounterBreakPaw],
    );
  }
  if (
    cannotBreakExceptIcebreakerActive(state) &&
    !cardHasIcebreakerSubtype(breaker)
  ) {
    return fail(
      "Cannot break subroutines with a non-icebreaker card while NEXT Activation Command is active.",
      [CR.encounterBreakPaw, CR.lockdownOperation],
    );
  }

  const iceStr = effectiveIceStrength(state, ice.id);
  const brStr = effectiveBreakerStrength(state, breakerId);
  if (breaker.interfaceRequiresTrojanHost) {
    const hasTrojan = Object.values(state.cards).some(
      (c) =>
        c.hostId === ice.id &&
        (c.subtypes ?? []).includes("trojan") &&
        state.runner.rig.includes(c.id),
    );
    if (!hasTrojan) {
      return fail(
        `${breaker.title} can only interface ice hosting a trojan.`,
        [CR.encounterBreakPaw],
      );
    }
  }
  if (breaker.interfaceRequiresEqualStrength) {
    if (brStr !== iceStr) {
      return fail(
        `Breaker strength ${brStr} must equal ice strength ${iceStr}.`,
        [CR.encounterBreakPaw, CR.icebreakerInterfaceStrength],
      );
    }
  } else if (brStr < iceStr) {
    return fail(
      `Breaker strength ${brStr} < ice strength ${iceStr} (CR ${CR.icebreakerInterfaceStrength.number}).`,
      [CR.encounterBreakPaw, CR.icebreakerInterfaceStrength],
    );
  }

  const free = run.encounter.freeBreaksRemaining;
  let cost = 0;
  if (free && free.breakerId === breakerId && free.remaining > 0) {
    free.remaining -= 1;
    if (free.remaining <= 0) {
      delete run.encounter.freeBreaksRemaining;
    }
    cost = 0;
  } else {
    cost = breaker.breaker.breakCredits;
    if (
      breaker.breaker.breakCreditsDiscountIfSuccessfulRunThisTurn &&
      state.turn.successfulRunThisTurn
    ) {
      cost = Math.max(
        0,
        cost - breaker.breaker.breakCreditsDiscountIfSuccessfulRunThisTurn,
      );
    }
    if (breaker.breaker.breakCreditsDiscountPerInstalledSubtype) {
      const { subtype, amount } =
        breaker.breaker.breakCreditsDiscountPerInstalledSubtype;
      const n = state.runner.rig.filter((id) =>
        (state.cards[id].subtypes ?? []).includes(subtype),
      ).length;
      cost = Math.max(0, cost - amount * n);
    }
    const attacked = state.run!.attackedServerId;
    for (const rid of state.servers[attacked].root) {
      const up = state.cards[rid];
      if (
        up?.rezzed &&
        up.runnerIcebreakerAbilityAdditionalCostOnThisServer
      ) {
        cost += up.runnerIcebreakerAbilityAdditionalCostOnThisServer;
      }
    }
    if (runnerAvailableCreditsForBreaker(state) < cost) {
      return fail("Insufficient credits to break.", [CR.encounterBreakPaw]);
    }
    withCostCheckpoint(state, "break_subroutine", () => {
      spendRunnerCredits(state, cost);
    });
    const maxSubs = breaker.breaker.breakMaxSubs ?? 1;
    if (maxSubs > 1) {
      run.encounter.freeBreaksRemaining = {
        breakerId,
        remaining: maxSubs - 1,
      };
    }
  }
  run.encounter.broken[subIndex] = true;
  if (run.encounter.broken.every(Boolean)) {
    run.encounter.fullyBrokenByRunner = true;
  }
  maybeFireOnHostFullyBrokenThisEncounter(state);
  if (!run.breakersThatBroke) run.breakersThatBroke = [];
  if (!run.breakersThatBroke.includes(breakerId)) {
    run.breakersThatBroke.push(breakerId);
  }
  if (run.encounter) {
    if (!run.encounter.breakersThatBrokeThisEncounter) {
      run.encounter.breakersThatBrokeThisEncounter = [];
    }
    if (!run.encounter.breakersThatBrokeThisEncounter.includes(breakerId)) {
      run.encounter.breakersThatBrokeThisEncounter.push(breakerId);
    }
  }
  if ((breaker.subtypes ?? []).includes("decoder")) {
    run.encounter.brokePrintedSubWithDecoder = true;
  }
  log(
    state,
    `Runner breaks "${subs[subIndex].text}" with ${breaker.title} (str ${brStr}) for ${cost}¢ (CR ${CR.encounterBreakPaw.number}, ${CR.fullyBreak.number}).`,
  );
  const loseOnBreak = ice.runnerLoseCreditsOnBreakPrintedSubroutine ?? 0;
  if (loseOnBreak > 0) {
    const lost = Math.min(loseOnBreak, state.runner.credits);
    state.runner.credits -= lost;
    log(
      state,
      `${ice.title} — Runner loses ${lost}¢ for breaking a printed subroutine → ${state.runner.credits}¢.`,
    );
  }
  if (maybeFireFluxFirstBreakCharge(state) && state.pendingChoice) {
    return ok(state);
  }
  // Curupira: every full break.
  if (breaker.onFullyBreak && run.encounter.broken.every(Boolean)) {
    const r = evalEffect(
      { state, sourceId: breakerId },
      breaker.onFullyBreak,
    );
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice) return ok(state);
  }
  // Orca / Abaasy: first full break this turn by this program
  if (
    breaker.onFullyBreakOncePerTurn &&
    run.encounter.broken.every(Boolean) &&
    !state.turn.onFullyBreakFiredIds.includes(breakerId)
  ) {
    state.turn.onFullyBreakFiredIds.push(breakerId);
    const r = evalEffect(
      { state, sourceId: breakerId },
      breaker.onFullyBreakOncePerTurn,
    );
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice) return ok(state);
  }
  fireAfterBreakSubroutineHooks(state, breakerId);
  if (state.pendingChoice) return ok(state);
  nestPriorityAfterAbility(state, "break_subroutine");
  return ok(state);
}

/**
 * Bioroid Efficiency Research: fire `onHostFullyBrokenThisEncounter` once
 * per encounter for condition counters hosted on the just-fully-broken ice.
 */
function maybeFireOnHostFullyBrokenThisEncounter(state: GameState): void {
  const enc = state.run?.encounter;
  if (!enc?.fullyBrokenByRunner) return;
  const ice = state.cards[enc.iceId];
  if (ice?.trashSelfWhenFullyBrokenByRunner) {
    evalEffect(
      { state, sourceId: enc.iceId },
      { op: "do", action: { kind: "trash_self" } },
    );
  }
  // Valley Grid: fully break ice protecting this server.
  {
    const server = Object.values(state.servers).find((s) =>
      s.ice.includes(enc.iceId),
    );
    if (server) {
      for (const rid of server.root) {
        const up = state.cards[rid];
        if (!up?.rezzed || !up.onFullyBreakProtectingIce) continue;
        const r = evalEffect(
          { state, sourceId: rid },
          up.onFullyBreakProtectingIce,
        );
        if (!r.ok) {
          log(state, `onFullyBreakProtectingIce failed on ${up.title}: ${r.error}`);
        }
      }
    }
  }
  const fired = enc.hostFullyBrokenFiredIds ?? [];
  for (const [id, card] of Object.entries(state.cards)) {
    if (card.hostId !== enc.iceId) continue;
    if (!card.onHostFullyBrokenThisEncounter) continue;
    if (fired.includes(id)) continue;
    fired.push(id);
    enc.hostFullyBrokenFiredIds = fired;
    log(
      state,
      `${card.title} — host ice fully broken this encounter.`,
    );
    const r = evalEffect(
      { state, sourceId: id },
      card.onHostFullyBrokenThisEncounter,
    );
    if (!r.ok) {
      log(
        state,
        `onHostFullyBrokenThisEncounter failed on ${card.title}: ${r.error}`,
      );
    }
    if (state.pendingChoice || state.done) return;
  }
}

/**
 * Tyr's Hand-class: opens a `break_interrupt_paw` pending window instead of
 * immediately marking `subIndex` broken, when the encountered ice is a
 * bioroid protecting a server with an eligible upgrade (rezzed — always
 * eligible via its `[trash]` ability — or unrezzed and affordable to rez).
 * Returns true when the window was opened (caller must not finalize yet).
 */
function maybeOpenTyrsHandInterrupt(
  state: GameState,
  ice: GameState["cards"][string],
  subIndex: number,
): boolean {
  if (!(ice.subtypes ?? []).includes("bioroid")) return false;
  const server = Object.values(state.servers).find((s) =>
    s.ice.includes(ice.id),
  );
  if (!server) return false;
  const eligible = server.root.some((id) => {
    const c = state.cards[id];
    if (!c?.preventSubroutineBreakOnBioroidByTrash) return false;
    if (c.rezzed) return true;
    return state.corp.credits >= (c.rezCost ?? 0);
  });
  if (!eligible) return false;
  state.pendingSubroutineBreak = { iceId: ice.id, subIndex };
  log(
    state,
    `Interrupt — "${ice.subroutines?.[subIndex]?.text ?? ""}" on ${ice.title} would be broken (Tyr's Hand-class).`,
  );
  return true;
}

/**
 * Rez an upgrade eligible for the `break_interrupt_paw` window as an
 * interrupt reaction, bypassing the normal PAW-window gate on `rezAsset`
 * (this window is a `pendingSubroutineBreak` pause, not a graph step).
 */
function resolveTyrsHandRezDuringBreakInterrupt(
  state: GameState,
  cardId: string,
): ApplyResult {
  const pending = state.pendingSubroutineBreak;
  if (!pending) {
    return fail("No pending subroutine-break interrupt.", [
      CR.encounterBreakPaw,
    ]);
  }
  const card = state.cards[cardId];
  if (!card || card.type !== "upgrade" || !card.preventSubroutineBreakOnBioroidByTrash) {
    return fail("Not eligible to rez during this interrupt.", [
      CR.rezProcedure,
    ]);
  }
  if (card.rezzed) {
    return fail("Already rezzed.", [CR.rezProcedure]);
  }
  const server = Object.values(state.servers).find((s) =>
    s.root.includes(cardId),
  );
  if (!server || !server.ice.includes(pending.iceId)) {
    return fail("This upgrade does not protect the ice's server.", [
      CR.rezProcedure,
    ]);
  }
  const cost = card.rezCost ?? 0;
  if (state.corp.credits < cost) {
    return fail("Insufficient credits to rez.", [CR.inherentRezCost]);
  }
  withCostCheckpoint(state, "rez_asset", () => {
    state.corp.credits -= cost;
  });
  card.rezzed = true;
  card.faceup = true;
  const ice = state.cards[pending.iceId];
  log(
    state,
    `Rez ${card.title} (interrupt — subroutine break on ${ice?.title ?? "bioroid ice"}).`,
  );
  if (card.onRez) {
    const r = evalEffect({ state, sourceId: cardId }, card.onRez);
    if (!r.ok) return fail(r.error, r.cites);
  }
  return ok(state);
}

/**
 * Finalize a `pendingSubroutineBreak` window: either the subroutine is
 * marked broken as normal (`prevented` false — Corp declined/passed), or it
 * is not (Tyr's Hand-class `[trash]` prevented it).
 */
function finalizePendingSubroutineBreak(
  state: GameState,
  prevented: boolean,
): ApplyResult {
  const pending = state.pendingSubroutineBreak;
  if (!pending) {
    return fail("No pending subroutine-break interrupt.", [
      CR.encounterBreakPaw,
    ]);
  }
  state.pendingSubroutineBreak = null;
  const ice = state.cards[pending.iceId];
  const run = state.run;
  if (
    prevented ||
    !run?.encounter ||
    run.encounter.iceId !== pending.iceId ||
    !ice
  ) {
    if (prevented) {
      log(
        state,
        `Prevent "${ice?.subroutines?.[pending.subIndex]?.text ?? ""}" from being broken on ${ice?.title ?? pending.iceId}.`,
      );
    }
    nestPriorityAfterAbility(state, "break_bioroid_subroutine");
    return ok(state);
  }
  run.encounter.broken[pending.subIndex] = true;
  log(
    state,
    `Break "${ice.subroutines?.[pending.subIndex]?.text ?? ""}" on bioroid ${ice.title} (CR ${CR.encounterBreakPaw.number}).`,
  );
  if (ice.bioroidBreakGivesCorpAllottedClickNextTurn) {
    state.corpAllottedClicksDeltaNextTurn =
      (state.corpAllottedClicksDeltaNextTurn ?? 0) + 1;
    log(
      state,
      `${ice.title} — Corp allotted clicks next turn +1 → pending ${state.corpAllottedClicksDeltaNextTurn} (CR ${CR.corpAllottedClicks.number}).`,
    );
  }
  if (run.encounter.broken.every(Boolean)) {
    run.encounter.fullyBrokenByRunner = true;
  }
  maybeFireOnHostFullyBrokenThisEncounter(state);
  if (state.pendingChoice) return ok(state);
  if (maybeFireFluxFirstBreakCharge(state) && state.pendingChoice) {
    return ok(state);
  }
  fireAfterBreakSubroutineHooks(state, null);
  if (state.pendingChoice) return ok(state);
  nestPriorityAfterAbility(state, "break_bioroid_subroutine");
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
  if (state.turn.bioroidIcePaidAbilitiesForbidden) {
    return fail(
      "Runner cannot use paid abilities printed on bioroid ice this turn.",
      [CR.paidAbility, CR.cannotPrecedence],
    );
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
  if (subs[subIndex].requireLostClickToBreakThisRun && !run.lostClickToBreakThisRun) {
    return fail(
      "This subroutine cannot be broken unless the Runner has spent [click] to break a subroutine on a bioroid this run.",
      [CR.encounterBreakPaw],
    );
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
  run.lostClickToBreakThisRun = true;
  if (maybeOpenTyrsHandInterrupt(state, ice, subIndex)) {
    log(
      state,
      `Runner spends [click] to attempt to break "${subs[subIndex].text}" on bioroid ${ice.title} — Corp may interrupt (Tyr's Hand-class).`,
    );
    return ok(state);
  }
  run.encounter.broken[subIndex] = true;
  log(
    state,
    `Runner spends [click] to break "${subs[subIndex].text}" on bioroid ${ice.title} (CR ${CR.encounterBreakPaw.number}, ${CR.spendClicks.number}).`,
  );
  if (ice.bioroidBreakGivesCorpAllottedClickNextTurn) {
    state.corpAllottedClicksDeltaNextTurn =
      (state.corpAllottedClicksDeltaNextTurn ?? 0) + 1;
    log(
      state,
      `${ice.title} — Corp allotted clicks next turn +1 → pending ${state.corpAllottedClicksDeltaNextTurn} (CR ${CR.corpAllottedClicks.number}).`,
    );
  }
  if (run.encounter.broken.every(Boolean)) {
    run.encounter.fullyBrokenByRunner = true;
  }
  maybeFireOnHostFullyBrokenThisEncounter(state);
  if (state.pendingChoice) return ok(state);
  if (maybeFireFluxFirstBreakCharge(state) && state.pendingChoice) {
    return ok(state);
  }
  fireAfterBreakSubroutineHooks(state, null);
  if (state.pendingChoice) return ok(state);
  nestPriorityAfterAbility(state, "break_bioroid_subroutine");
  return ok(state);
}

/**
 * Bioroid 2.0-class (Heimdall/Ichi/Viktor 2.0): [click] × N breaks up to N
 * subroutines on this bioroid in one paid ability. Cost is always
 * `ice.bioroidBreakMaxSubs` clicks, regardless of how many subs (1..N) are
 * chosen (card text: "[click][click]: Break up to N subroutines").
 */
function breakBioroidSubroutines(
  state: GameState,
  subIndexes: number[],
): ApplyResult {
  const run = state.run;
  if (!run?.encounter) {
    return fail("No encounter in progress.", [CR.encounterIce]);
  }
  if (state.turn.bioroidIcePaidAbilitiesForbidden) {
    return fail(
      "Runner cannot use paid abilities printed on bioroid ice this turn.",
      [CR.paidAbility, CR.cannotPrecedence],
    );
  }
  const ice = state.cards[run.encounter.iceId];
  if (!(ice.subtypes ?? []).includes("bioroid")) {
    return fail("Encountered ice is not a bioroid.", [CR.encounterBreakPaw]);
  }
  const maxSubs = ice.bioroidBreakMaxSubs;
  if (!maxSubs || maxSubs < 2) {
    return fail("This bioroid does not support multi-sub breaking.", [
      CR.encounterBreakPaw,
    ]);
  }
  const uniq = [...new Set(subIndexes)];
  if (uniq.length === 0 || uniq.length > maxSubs) {
    return fail(`Choose 1 to ${maxSubs} subroutines to break.`, [
      CR.encounterBreakPaw,
    ]);
  }
  const subs = ice.subroutines ?? [];
  for (const subIndex of uniq) {
    if (subIndex < 0 || subIndex >= subs.length) {
      return fail("Invalid subroutine index.", [CR.encounterSubResolve]);
    }
    if (run.encounter.broken[subIndex]) {
      return fail("Subroutine already broken.", [CR.fullyBreak]);
    }
    if (
      subs[subIndex].requireLostClickToBreakThisRun &&
      !run.lostClickToBreakThisRun
    ) {
      return fail(
        "This subroutine cannot be broken unless the Runner has spent [click] to break a subroutine on a bioroid this run.",
        [CR.encounterBreakPaw],
      );
    }
  }
  if (state.runner.clicks < maxSubs) {
    return fail("Insufficient clicks to break bioroid subroutines.", [
      CR.spendClicks,
      CR.encounterBreakPaw,
    ]);
  }
  withCostCheckpoint(state, "break_bioroid_subroutines", () => {
    state.runner.clicks -= maxSubs;
  });
  for (const subIndex of uniq) {
    run.encounter.broken[subIndex] = true;
  }
  run.lostClickToBreakThisRun = true;
  log(
    state,
    `Runner spends [click]×${maxSubs} to break ${uniq.length} subroutine(s) on bioroid ${ice.title} (CR ${CR.encounterBreakPaw.number}, ${CR.spendClicks.number}).`,
  );
  if (ice.bioroidBreakGivesCorpAllottedClickNextTurn) {
    state.corpAllottedClicksDeltaNextTurn =
      (state.corpAllottedClicksDeltaNextTurn ?? 0) + 1;
    log(
      state,
      `${ice.title} — Corp allotted clicks next turn +1 → pending ${state.corpAllottedClicksDeltaNextTurn} (CR ${CR.corpAllottedClicks.number}).`,
    );
  }
  if (run.encounter.broken.every(Boolean)) {
    run.encounter.fullyBrokenByRunner = true;
  }
  maybeFireOnHostFullyBrokenThisEncounter(state);
  if (state.pendingChoice) return ok(state);
  if (maybeFireFluxFirstBreakCharge(state) && state.pendingChoice) {
    return ok(state);
  }
  fireAfterBreakSubroutineHooks(state, null);
  if (state.pendingChoice) return ok(state);
  nestPriorityAfterAbility(state, "break_bioroid_subroutines");
  return ok(state);
}

function chooseTrashProgram(state: GameState, cardId: string): ApplyResult {
  const pending = state.pendingTrashProgram;
  if (!pending) {
    return fail("No pending trash-program choice.", [CR.trashing]);
  }
  if (!pending.candidates.includes(cardId)) {
    return fail("That card is not a legal trash target.", [CR.trashing]);
  }
  const card = state.cards[cardId];
  if (card.side === "corp") {
    const handIdx = state.corp.hand.indexOf(cardId);
    if (handIdx >= 0) state.corp.hand.splice(handIdx, 1);
    state.corp.discard.push(cardId);
    card.zone = "corp:archives";
    card.faceup = true;
  } else {
    const handIdx = state.runner.hand.indexOf(cardId);
    if (handIdx >= 0) state.runner.hand.splice(handIdx, 1);
    const rigIdx = state.runner.rig.indexOf(cardId);
    if (rigIdx >= 0) state.runner.rig.splice(rigIdx, 1);
    state.runner.discard.push(cardId);
    card.zone = "runner:heap";
    card.faceup = true;
  }
  state.pendingTrashProgram = null;
  log(
    state,
    `Trashes ${card.title} (CR ${CR.trashing.number}).`,
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

function resolveSabotageIntent(
  state: GameState,
  hqCardIds: string[],
): ApplyResult {
  const pending = state.pendingSabotage;
  if (!pending) {
    return fail("No pending sabotage.", [CR.sabotage]);
  }
  const r = resolveSabotageAmount(
    state,
    pending.sourceId,
    pending.amount,
    hqCardIds,
  );
  if (!r.ok) return fail(r.error, r.cites);
  state.pendingSabotage = null;
  if (state.pendingChoice || state.pendingTrashProgram || state.pendingDamage) {
    return ok(state);
  }
  if (state.run) {
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
  return ok(state);
}

function chooseOption(state: GameState, optionId: string): ApplyResult {
  const pending = state.pendingChoice;
  if (!pending) {
    return fail("No pending choice.", [CR.paidAbility]);
  }
  const option = pending.options.find((o) => o.id === optionId);
  if (!option) {
    return fail("Unknown choice option.", [CR.paidAbility]);
  }
  const sourceId = pending.sourceId;
  state.pendingChoice = null;
  if (state.run) state.run.pendingJackOutOffer = false;

  // Trieste: option id forbid-runner-break:<iceId>
  if (optionId.startsWith("forbid-runner-break:")) {
    const iceId = optionId.slice("forbid-runner-break:".length);
    const ice = state.cards[iceId];
    if (ice) {
      ice.cannotBreakWithRunnerCardAbilities = true;
      log(
        state,
        `Choose ${ice.title} — Runner card abilities cannot break its subroutines.`,
      );
    }
    if (state.deferAfterBasicAction) {
      state.deferAfterBasicAction = false;
      afterBasicAction(state);
    }
    return ok(state);
  }

  // Heliamphora: host Archives card instead of accessing, or proceed to access.
  if (optionId.startsWith("heliamphora-host:")) {
    const cardId = optionId.slice("heliamphora-host:".length);
    if (!state.run) return fail("No run for Heliamphora.", [CR.breach]);
    const heliId = sourceId;
    if (!state.run.accessCandidates.includes(cardId) && !state.corp.discard.includes(cardId)) {
      // Still allow if only in discard (candidate list may lag).
    }
    const idx = state.run.accessCandidates.indexOf(cardId);
    if (idx >= 0) state.run.accessCandidates.splice(idx, 1);
    if (state.run.accessRemaining !== null) {
      state.run.accessRemaining = Math.max(0, state.run.accessRemaining - 1);
    }
    hostCorpCardFaceupOn(state, heliId, cardId);
    state.run.heliamphoraHostInsteadUsedThisBreach = true;
    state.run.pendingHeliamphoraAccessCardId = undefined;
    log(state, `Chose "${option.label}" on ${state.cards[heliId]?.title ?? heliId}.`);
    enterStep(state, "breach.access");
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }
  if (optionId.startsWith("heliamphora-access:")) {
    const cardId = optionId.slice("heliamphora-access:".length);
    if (!state.run) return fail("No run for Heliamphora.", [CR.breach]);
    state.run.pendingHeliamphoraAccessCardId = cardId; // sentinel: skip re-offer
    // Mark so access_card won't re-offer: clear availability by setting used? No —
    // decline does not consume the once-per-breach. Use pending flag: access_card
    // skips offer when pendingHeliamphoraAccessCardId is already set to this card.
    log(state, `Chose "${option.label}" on ${state.cards[sourceId]?.title ?? sourceId}.`);
    return applyAction(state, { type: "access_card", cardId });
  }

  const exclusive = state.pendingExclusiveChoices;
  const isExclusivePick =
    exclusive !== null &&
    exclusive.options.some((o) => o.id === optionId);
  if (isExclusivePick && exclusive) {
    if (!exclusive.usedIds.includes(optionId)) {
      exclusive.usedIds.push(optionId);
      exclusive.remaining = Math.max(0, exclusive.remaining - 1);
    }
  }

  // Special option handlers encoded by option id prefix / card fields.
  if (optionId.startsWith("swap-")) {
    const parts = optionId.slice("swap-".length).split("-");
    // ids may contain hyphens — split on last occurrence of known pattern swap-A-B
    // Option ids are `swap-${a}-${b}` where a/b are instance ids like "ice-1".
    const raw = optionId.slice(5);
    const mid = raw.indexOf("-", raw.indexOf("-") + 1);
    // Fallback: find two ice ids by matching against installed ice.
    const allIce: string[] = [];
    for (const server of Object.values(state.servers)) {
      allIce.push(...server.ice);
    }
    let a: string | undefined;
    let b: string | undefined;
    for (const x of allIce) {
      for (const y of allIce) {
        if (x !== y && optionId === `swap-${x}-${y}`) {
          a = x;
          b = y;
        }
      }
    }
    if (a && b) {
      swapIcePositions(state, a, b);
      log(
        state,
        `Swap ${state.cards[a].title} with ${state.cards[b].title}.`,
      );
    }
    void parts;
    void mid;
  } else if (
    state.cards[sourceId]?.mayRezIceIgnoringCostsOnScoreOrSteal ||
    state.cards[optionId]?.type === "ice"
  ) {
    if (optionId !== "decline" && state.cards[optionId]?.type === "ice") {
      const ice = state.cards[optionId];
      ice.rezzed = true;
      ice.faceup = true;
      log(state, `Rez ${ice.title} ignoring all costs.`);
      if (ice.onRez) {
        const r = evalEffect({ state, sourceId: optionId }, ice.onRez);
        if (!r.ok) return fail(r.error, r.cites);
      }
      fireHostRezStateTriggers(state, optionId, "rez");
    }
  } else if (
    state.cards[sourceId]?.mayInstallOnScoreOrSteal ||
    (optionId !== "decline" &&
      state.runner.hand.includes(optionId) &&
      ["program", "hardware", "resource"].includes(
        state.cards[optionId]?.type ?? "",
      ))
  ) {
    if (optionId !== "decline" && state.runner.hand.includes(optionId)) {
      const installed = installRunner(state, optionId);
      if (!installed.ok) return installed;
    }
  } else {
    const r = evalEffect({ state, sourceId }, option.effect);
    if (!r.ok) return fail(r.error, r.cites);
  }

  log(state, `Chose "${option.label}" on ${state.cards[sourceId]?.title ?? sourceId}.`);
  if (
    state.run?.runnerCannotSpendCredits &&
    !state.pendingChoice &&
    !state.pendingDamage
  ) {
    state.run.runnerCannotSpendCredits = false;
  }
  if (
    state.pendingTrashProgram ||
    state.pendingChoice ||
    state.pendingSabotage ||
    state.pendingDamage
  ) {
    return ok(state);
  }

  // Ganked!-class: mid-access forced encounter — divert to approachIce.
  if (
    state.run?.reencounterIceId &&
    state.run.resumeAccessAfterReencounter &&
    state.run.accessingCardId
  ) {
    const iceId = state.run.reencounterIceId;
    const server = state.servers[state.run.attackedServerId];
    const pos = server?.ice.indexOf(iceId) ?? -1;
    if (pos >= 0) {
      state.run.position = pos;
      state.run.reencounterIceId = undefined;
      enterStep(state, "run.approachIce");
      autoWalk(state);
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
    state.run.reencounterIceId = undefined;
    state.run.resumeAccessAfterReencounter = false;
  }

  // Konjin-class: nested encounter then resume parent — divert now.
  if (
    state.run?.reencounterIceId &&
    state.run.resumeEncounterIceId &&
    !state.run.resumeAccessAfterReencounter
  ) {
    const iceId = state.run.reencounterIceId;
    state.run.reencounterIceId = undefined;
    const server = state.servers[state.run.attackedServerId];
    const pos = server?.ice.indexOf(iceId) ?? -1;
    if (pos >= 0) {
      state.run.position = pos;
    }
    state.run.forceEncounterIceId = iceId;
    enterStep(state, "run.approachIce");
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  const exclusiveCont = resumeExclusiveChoicesIfPending(state);
  if (!exclusiveCont.ok) {
    return fail(exclusiveCont.error, exclusiveCont.cites);
  }
  if (
    state.pendingTrashProgram ||
    state.pendingChoice ||
    state.pendingSabotage ||
    state.pendingDamage
  ) {
    return ok(state);
  }

  if (state.pendingStartRunOnMark) {
    const mark = state.markServerId;
    const runSrc = state.pendingStartRunOnMark.sourceId;
    state.pendingStartRunOnMark = null;
    state.deferAfterBasicAction = false;
    if (mark && state.servers[mark]) {
      const walked = startRun(state, mark, { runSourceId: runSrc });
      if (!walked.ok) return walked;
      finishRunReturnToAction(walked.state);
      return walked;
    }
    log(state, `Run on mark declined — mark missing.`);
  }

  if (state.pendingStartRun) {
    const pending = state.pendingStartRun;
    state.pendingStartRun = null;
    state.deferAfterBasicAction = false;
    if (state.servers[pending.serverId]) {
      const mods: import("../state/runStart.js").RunModifiers = {
        runSourceId: pending.sourceId,
      };
      if (pending.bypassFirstEncounterForClicks !== undefined) {
        mods.bypassFirstEncounterForClicks =
          pending.bypassFirstEncounterForClicks;
      }
      const walked = startRun(state, pending.serverId as import("../state/types.js").ServerId, mods);
      if (!walked.ok) return walked;
      if (walked.state.turn.ohForcedRunCannotJackOut && walked.state.run) {
        walked.state.run.cannotJackOut = true;
        walked.state.turn.ohForcedRunCannotJackOut = false;
        log(walked.state, `An Offer — Runner cannot jack out this run.`);
      }
      finishRunReturnToAction(walked.state);
      return walked;
    }
    log(state, `Pending run — server ${pending.serverId} missing.`);
  }

  if (state.run?.wakeImplantPending) {
    state.run.wakeImplantPending = false;
    state.run.wakeImplantResolved = true;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.mercuryBreachPending) {
    state.run.mercuryBreachPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.mediumBreachPending) {
    state.run.mediumBreachPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.cupellationBreachPending) {
    state.run.cupellationBreachPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.run?.onBreachRdPending) {
    state.run.onBreachRdPending = false;
    beginBreachAccess(state);
    if (state.pendingChoice || state.psi) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.pendingRunEventStart) {
    const pending = state.pendingRunEventStart;
    state.pendingRunEventStart = null;
    state.deferAfterBasicAction = false;
    const runCard = state.cards[pending.sourceId];
    const mods = runCard?.runEvent
      ? modifiersFromStartsRun(state, runCard.runEvent, pending.sourceId)
      : { runSourceId: pending.sourceId };
    const hosted = runCard?.hostedCredits ?? 0;
    if (hosted > 0) {
      mods.eventCredits = (mods.eventCredits ?? 0) + hosted;
      runCard!.hostedCredits = 0;
    }
    if (state.servers[pending.serverId]) {
      const walked = startRun(state, pending.serverId, mods);
      if (!walked.ok) return walked;
      finishRunReturnToAction(walked.state);
      return walked;
    }
    log(state, `Deferred run event — server missing.`);
  }

  if (state.pendingStealAgendaId) {
    const agendaId = state.pendingStealAgendaId;
    state.pendingStealAgendaId = null;
    const resumed = completeStealAgenda(state, { cardId: agendaId });
    if (!resumed.ok) return resumed;
    if (
      state.pendingChoice ||
      state.pendingTrashProgram ||
      state.pendingSabotage ||
      state.pendingDamage
    ) {
      return resumed;
    }
  }

  if (state.pendingTrashAccessedCardId) {
    const cardId = state.pendingTrashAccessedCardId;
    state.pendingTrashAccessedCardId = null;
    const trashed = applyAction(state, { type: "trash_accessed", cardId });
    return trashed;
  }

  // Resume scoring after scoreAdditionalCost (Azef must_trash).
  if (state.pendingScoreAgendaId) {
    const agendaId = state.pendingScoreAgendaId;
    const scored = scoreAgendaAction(state, agendaId);
    if (!scored.ok) return scored;
    if (
      state.pendingTrashProgram ||
      state.pendingChoice ||
      state.pendingSabotage ||
      state.pendingDamage
    ) {
      return scored;
    }
  }

  // Resume rez after rezAdditionalCost (Valentão).
  if (state.pendingRezCardId) {
    const rezId = state.pendingRezCardId;
    const rezCard = state.cards[rezId];
    if (rezCard?.type === "ice") {
      const rezzed = rezIce(state, rezId);
      if (!rezzed.ok) return rezzed;
      if (
        state.pendingTrashProgram ||
        state.pendingChoice ||
        state.pendingSabotage ||
        state.pendingDamage
      ) {
        return rezzed;
      }
    }
  }

  if (state.run) {
    // ETR from jack-out offer
    if (state.run.endedTheRun) {
      enterStep(state, "run.closePriorityWindows");
    } else {
      const step = getStep(state);
      if (step.kind === "auto" || step.kind === "branch") {
        const nextKey =
          typeof step.next === "function" ? step.next(state) : step.next;
        enterStep(state, nextKey);
      }
    }
    if (
      state.run.accessingCardId &&
      (state.timingKey === "access.midAccess" ||
        state.timingKey === "access.cardAccessed" ||
        state.timingKey === "access.stealAgenda")
    ) {
      autoWalk(state);
      return advanceFromMidAccess(state);
    }
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  // Resume a seq that paused when this choice window opened.
  resumePendingEffectContinuation(state);
  if (
    state.pendingTrashProgram ||
    state.pendingChoice ||
    state.pendingSabotage ||
    state.pendingDamage ||
    state.pendingTags ||
    state.trace ||
    state.psi
  ) {
    return ok(state);
  }

  if (state.pendingStandaloneBreach) {
    const pending = state.pendingStandaloneBreach;
    state.pendingStandaloneBreach = null;
    const sid = pending.serverId;
    if (state.servers[sid]) {
      log(state, `Standalone breach of ${sid} begins (CR ${CR.breach.number}).`);
      state.run = {
        attackedServerId: sid,
        phase: "breach",
        position: null,
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
        isPostRunBreach: true,
        runSourceId: pending.sourceId,
        ...(pending.cannotAccessRoot ? { cannotAccessRoot: true } : {}),
      };
      enterStep(state, "breach.begin");
      beginBreachAccess(state);
      if (state.pendingChoice) return ok(state);
      autoWalk(state);
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
  }

  if (state.pendingStandaloneCardAccess) {
    const pending = state.pendingStandaloneCardAccess;
    state.pendingStandaloneCardAccess = null;
    const sid = pending.serverId;
    const card = state.cards[pending.cardId];
    if (state.servers[sid] && card) {
      log(
        state,
        `Standalone access of ${card.title} on ${sid} begins (CR ${CR.cardAccessed.number}).`,
      );
      state.run = {
        attackedServerId: sid,
        phase: "breach",
        position: null,
        successful: null,
        accessedCardIds: [],
        accessCandidates: [pending.cardId],
        accessRemaining: 1,
        encounter: null,
        endedTheRun: false,
        cannotJackOut: false,
        strengthBoosts: {},
        encounterStrengthBoosts: {},
        iceStrengthBoosts: {},
        accessingCardId: null,
        isPostRunBreach: true,
        accessCandidatesPreset: true,
        runSourceId: pending.sourceId,
      };
      enterStep(state, "breach.begin");
      beginBreachAccess(state);
      if (state.pendingChoice) return ok(state);
      autoWalk(state);
      const cont = advanceRunUntilStop(state);
      if (!cont.ok) return cont;
      finishRunReturnToAction(cont.state);
      return cont;
    }
  }

  if (state.deferAfterBasicAction) {
    state.deferAfterBasicAction = false;
    afterBasicAction(state);
  }
  return ok(state);
}

function swapIcePositions(state: GameState, a: string, b: string): void {
  let serverA: Server | null = null;
  let idxA = -1;
  let serverB: Server | null = null;
  let idxB = -1;
  for (const server of Object.values(state.servers)) {
    const ia = server.ice.indexOf(a);
    const ib = server.ice.indexOf(b);
    if (ia >= 0) {
      serverA = server;
      idxA = ia;
    }
    if (ib >= 0) {
      serverB = server;
      idxB = ib;
    }
  }
  if (!serverA || !serverB || idxA < 0 || idxB < 0) return;
  serverA.ice[idxA] = b;
  serverB.ice[idxB] = a;
  state.cards[a].zone = `server:${serverB.id}:ice`;
  state.cards[b].zone = `server:${serverA.id}:ice`;
}

function rezAsset(state: GameState, cardId: string): ApplyResult {
  const paw = currentWindow(state.timingKey);
  if (paw !== "corp_action_paw" && paw !== "approach_server_paw") {
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
  if (
    state.turn.cannotScoreOrRezCardIds.includes(cardId) ||
    state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(cardId)
  ) {
    return fail("Cannot rez this card for the remainder of this turn.", [
      CR.rezProcedure,
    ]);
  }
  const inRoot = Object.values(state.servers).some((srv) =>
    srv.root.includes(cardId),
  );
  if (!inRoot) {
    return fail("Card is not installed in a server root.", [CR.rezProcedure]);
  }
  if (paw === "approach_server_paw") {
    const sid = state.run?.attackedServerId;
    if (!sid || !state.servers[sid].root.includes(cardId)) {
      return fail("Only upgrades on the attacked server may be rezzed here.", [
        CR.rezProcedure,
      ]);
    }
  }
  const reduction = rootRezCostReduction(state, cardId);
  const discount = rezCostDiscountIfAgendaScoredOrStolenThisTurn(state, cardId);
  const cost = Math.max(0, (card.rezCost ?? 0) - reduction - discount);
  if (state.corp.credits < cost) {
    return fail("Insufficient credits to rez.", [
      CR.inherentRezCost,
      CR.rezProcedure,
    ]);
  }
  // Hacktivist Meeting: additional cost to rez non-ice — randomly trash HQ.
  {
    let hacktivist = false;
    for (const c of Object.values(state.cards)) {
      if (c?.rezNonIceAdditionalCostRandomTrashHq && c.lingerAsCurrent) {
        hacktivist = true;
        break;
      }
    }
    if (hacktivist) {
      if (state.corp.hand.length === 0) {
        return fail(
          "Hacktivist Meeting — must randomly trash a card from HQ.",
          [CR.rezProcedure],
        );
      }
      const pick =
        state.corp.hand[Math.floor(Math.random() * state.corp.hand.length)]!;
      state.corp.hand = state.corp.hand.filter((id) => id !== pick);
      state.corp.discard.push(pick);
      const trashed = state.cards[pick];
      if (trashed) {
        trashed.zone = "corp:archives";
        trashed.faceup = true;
      }
      log(
        state,
        `Hacktivist Meeting — randomly trash ${trashed?.title ?? pick} from HQ.`,
      );
    }
  }
  if (card.rezAdditionalCostForfeitAgenda) {
    if (!state.corp.score.some((id) => !state.cards[id]?.cannotForfeit)) {
      return fail("Rez requires forfeiting 1 agenda.", [CR.rezProcedure]);
    }
  }
  if (card.rezOnlyDuringCorpTurn && state.activeSide !== "corp") {
    return fail("This card can only be rezzed during your turn.", [
      CR.rezProcedure,
    ]);
  }
  withCostCheckpoint(state, "rez_asset", () => {
    state.corp.credits -= cost;
    if (card.rezAdditionalCostForfeitAgenda) {
      forfeitAgenda(state);
    }
  });
  card.rezzed = true;
  card.faceup = true;
  if (
    (card.recurringCreditsMax ?? 0) > 0 ||
    card.recurringCreditsMaxEqualsRunnerLink ||
    card.recurringCreditsMaxEqualsVirusCounters
  ) {
    if (card.recurringCreditsMaxEqualsRunnerLink) {
      card.recurringCreditsMax = state.runner.link;
    }
    if (card.recurringCreditsMaxEqualsVirusCounters) {
      card.recurringCreditsMax = card.virusCounters ?? 0;
    }
    card.recurringCredits = card.recurringCreditsMax;
  }
  if ((card.badPublicityCountersOnRez ?? 0) > 0) {
    card.badPublicityCounters = card.badPublicityCountersOnRez;
    log(
      state,
      `Load ${card.badPublicityCounters} bad publicity counter(s) on ${card.title}.`,
    );
  }
  if ((card.powerCountersOnRez ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnRez;
    log(
      state,
      `Load ${card.powerCounters} power counter(s) on ${card.title}.`,
    );
  }
  if (card.rezSpendCreditsForPowerCounters) {
    const max = card.rezSpendCreditsForPowerCounters.max;
    const affordable = Math.min(max, state.corp.credits);
    if (affordable > 0) {
      const options: import("../effects/ir.js").ChoiceOption[] = [];
      for (let n = 0; n <= affordable; n++) {
        options.push({
          id: `rez-power:${n}`,
          label:
            n === 0
              ? "Place 0 power counters"
              : `Pay ${n}¢ → place ${n} power counter(s)`,
          effect: {
            op: "do",
            action: {
              kind: "rez_spend_credits_for_power_counters",
              amount: n,
            },
          },
        });
      }
      state.pendingChoice = {
        sourceId: cardId,
        chooser: "corp",
        options,
      };
      log(
        state,
        `${card.title} — may pay up to ${affordable}¢ for power counters.`,
      );
    }
  }
  log(
    state,
    `Corp rezzes ${card.title} for ${cost}¢ (CR ${CR.rezInPaw.number}, ${CR.rezProcedure.number}).`,
  );
  if ((card.handSizeBonus ?? 0) !== 0) {
    state.corp.maxHandSize += card.handSizeBonus!;
    log(
      state,
      `${card.title} — Corp max hand size +${card.handSizeBonus} → ${state.corp.maxHandSize}.`,
    );
  }
  syncAllTourGuideSubs(state);
  fireSparkAgencyOnAdvertisementRez(state, cardId);
  if (card.onRez) {
    const r = evalEffect({ state, sourceId: cardId }, card.onRez);
    if (!r.ok) return fail(r.error, r.cites);
  }
  firePowerCounterOnAnyCardRez(state, cardId);
  nestPriorityAfterAbility(state, "rez_asset");
  return ok(state);
}

/** Spark Agency: first advertisement rez each turn — Runner loses N¢. */
function fireSparkAgencyOnAdvertisementRez(
  state: GameState,
  rezzedId: string,
): void {
  const rezzed = state.cards[rezzedId];
  if (!rezzed || !(rezzed.subtypes ?? []).includes("advertisement")) return;
  if (state.turn.advertisementRezzedThisTurn) return;
  state.turn.advertisementRezzedThisTurn = true;
  const idCard = state.cards[state.corp.identityId];
  const lose = idCard?.loseCreditsOnFirstAdvertisementRezThisTurn;
  if (!lose || lose < 1) return;
  const lost = Math.min(lose, state.runner.credits);
  state.runner.credits -= lost;
  log(
    state,
    `${idCard!.title} — Runner loses ${lost}¢ (first advertisement rez this turn).`,
  );
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
  serverId?: ServerId,
): ApplyResult {
  const card = state.cards[cardId];
  if (!card) {
    return fail("Unknown card.", [CR.paidAbility]);
  }
  const ability = findPaidAbility(card, abilityId);
  if (!ability) {
    return fail("Unknown paid ability.", [CR.paidAbility]);
  }

  // Damage / tag interrupt PAWs — open while pending awaits prevent/accept,
  // independent of graph timingKey (CR 9.9.3a / 9.9.5 / 9.1.2a).
  const damageInterruptOpen =
    Boolean(state.pendingDamage) &&
    ability.windows.includes("damage_interrupt_paw") &&
    (!ability.requireDuringRun || Boolean(state.run)) &&
    (!ability.requirePendingDamageTypes ||
      ability.requirePendingDamageTypes.includes(state.pendingDamage!.type));
  // Corp damage interrupts (Prāna) are once per pending instance (CR 9.12.2b).
  // Runner AirbladeX-class may fire multiple times by paying again.
  const corpDamageInterruptOnce =
    damageInterruptOpen && card.side === "corp";
  if (
    corpDamageInterruptOnce &&
    state.pendingDamage?.interruptUsedSourceIds?.includes(cardId)
  ) {
    return fail("Interrupt already used for this damage instance.", [
      CR.paidAbility,
      CR.preventDamage,
    ]);
  }
  if (
    damageInterruptOpen &&
    ability.oncePerPendingDamageInstance &&
    state.pendingDamage?.interruptUsedSourceIds?.includes(cardId)
  ) {
    return fail("Interrupt already used for this damage instance.", [
      CR.paidAbility,
      CR.preventDamage,
    ]);
  }
  const tagInterruptOpen =
    Boolean(state.pendingTags) &&
    ability.windows.includes("tag_interrupt_paw") &&
    (!ability.requireDuringRun || Boolean(state.run));
  const exposeInterruptOpen =
    Boolean(state.pendingExpose && state.pendingExpose.phase === "interrupt") &&
    ability.windows.includes("expose_interrupt_paw");
  const trashInterruptOpen =
    Boolean(state.pendingTrashPrevent) &&
    ability.windows.includes("trash_interrupt_paw");
  const traceInterruptOpen =
    Boolean(state.trace) &&
    ability.windows.includes("trace_interrupt_paw") &&
    (!ability.requireDuringRun || Boolean(state.run));
  const breakInterruptOpen =
    Boolean(state.pendingSubroutineBreak) &&
    ability.windows.includes("break_interrupt_paw");
  const interruptOpen =
    damageInterruptOpen ||
    tagInterruptOpen ||
    exposeInterruptOpen ||
    trashInterruptOpen ||
    traceInterruptOpen ||
    breakInterruptOpen;

  const window = currentWindow(state.timingKey);
  // startsRun click abilities are also legal at runner.takeAction
  const atTake = state.timingKey === "runner.takeAction";
  if (
    !interruptOpen &&
    !window &&
    !(atTake && ability.startsRun)
  ) {
    return fail("No paid-ability window open.", [
      CR.paidAbility,
      CR.triggerPaidAbilities,
    ]);
  }
  if (window && !interruptOpen) ensurePriorityWindow(state);
  if (
    !interruptOpen &&
    window &&
    !ability.windows.includes(window) &&
    !ability.startsRun
  ) {
    return fail(`Ability not usable in ${window}.`, [
      CR.paidAbility,
      CR.triggerPaidAbilities,
    ]);
  }
  if (
    ability.startsRun &&
    !atTake &&
    window !== "runner_action_paw"
  ) {
    return fail("Run ability only usable during Runner action window.", [
      CR.paidAbility,
    ]);
  }
  if (card.side === "runner" && !state.runner.rig.includes(cardId)) {
    if (
      cardId !== state.runner.identityId &&
      cardId !== state.run?.runSourceId
    ) {
      return fail("Breaker/program not installed.", [CR.paidAbility]);
    }
  }
  if (card.side === "corp") {
    const inHq = state.corp.hand.includes(cardId);
    if (inHq) {
      if (!ability.usableFromHq) {
        return fail("Ability not usable from HQ.", [CR.paidAbility]);
      }
      if (window !== "corp_action_paw") {
        return fail("HQ expendable ability only during Corp action window.", [
          CR.paidAbility,
        ]);
      }
    }
    const inArchives = state.corp.discard.includes(cardId);
    if (inArchives) {
      if (!ability.usableFromArchives) {
        return fail("Ability not usable from Archives.", [CR.paidAbility]);
      }
      if (window !== "corp_action_paw") {
        return fail(
          "Archives ability only during Corp action window.",
          [CR.paidAbility],
        );
      }
    }
    const inRunnerScore = state.runner.score.includes(cardId);
    if (inRunnerScore) {
      if (!ability.usableFromRunnerScoreArea) {
        return fail("Ability not usable from Runner score area.", [
          CR.paidAbility,
        ]);
      }
      if (window !== "corp_action_paw") {
        return fail(
          "Runner score area ability only during Corp action window.",
          [CR.paidAbility],
        );
      }
    }
  }
  if (card.side === "corp" && window === "approach_paw") {
    const approached = approachedIceId(state);
    const scored = state.corp.score.includes(cardId);
    const otherServerOk =
      ability.requireOtherServer &&
      card.rezzed &&
      !!state.run &&
      cardProtectsOtherServer(state, cardId, state.run.attackedServerId);
    if (approached !== cardId && !scored && !otherServerOk) {
      return fail("Paid ability source is not the approached ice.", [
        CR.paidAbility,
      ]);
    }
    if (approached === cardId && !card.rezzed) {
      return fail("Ice must be rezzed to use this ability.", [CR.paidAbility]);
    }
  }
  if (card.side === "corp" && window === "approach_server_paw") {
    const sid = state.run?.attackedServerId;
    const scored = state.corp.score.includes(cardId);
    const otherServerOk =
      ability.requireOtherServer &&
      card.rezzed &&
      !!sid &&
      cardProtectsOtherServer(state, cardId, sid);
    const formicaryOk =
      !!ability.formicaryApproachAnyServer &&
      !card.rezzed &&
      card.type === "ice";
    if (
      !scored &&
      !otherServerOk &&
      !formicaryOk &&
      (!sid || !state.servers[sid].root.includes(cardId) || !card.rezzed)
    ) {
      return fail(
        "Approach-server ability must be a rezzed upgrade on the attacked server.",
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireOtherServer) {
    const sid = state.run?.attackedServerId;
    if (
      !sid ||
      !card.rezzed ||
      !cardProtectsOtherServer(state, cardId, sid)
    ) {
      return fail(
        "Ability requires a run against another server.",
        [CR.paidAbility],
      );
    }
  }
  if (
    card.side === "corp" &&
    window === "encounter_paw" &&
    !interruptOpen &&
    !state.corp.score.includes(cardId)
  ) {
    const encIce = state.run?.encounter?.iceId;
    const isEncounterIce = encIce === cardId && card.rezzed;
    const isRequireDuringRunIce =
      !!ability.requireDuringRun &&
      !!state.run &&
      card.rezzed &&
      (state.servers[state.run.attackedServerId]?.ice.includes(cardId) ??
        false);
    if (!isEncounterIce && !isRequireDuringRunIce) {
      // Encounter window corp abilities: scored agendas, encountered ice
      // (F2P / N-Pot), or requireDuringRun ice.
      return fail("Corp encounter ability must be a scored agenda.", [
        CR.paidAbility,
      ]);
    }
  }

  const cost = abilityCost(ability, state, card);
  if (card.paidAbilitiesUseStealthCreditsOnly && (cost.credits ?? 0) > 0) {
    cost.creditsFromStealthOnly = true;
  }
  const payer: "corp" | "runner" = ability.usableByAnyPlayer
    ? state.activeSide
    : card.side;
  if (!canPayCost(state, payer, cost, card)) {
    return fail("Cannot pay ability cost.", [CR.paidAbility, CR.costCheckpoint]);
  }
  if (ability.oncePerTurn && wasAbilityUsed(state, cardId, abilityId)) {
    return fail("Ability already used this turn.", [CR.paidAbility]);
  }
  if (
    card.paidAbilitiesOncePerTurn &&
    (card.paidAbilities ?? []).some((ab) =>
      wasAbilityUsed(state, cardId, ab.id),
    )
  ) {
    return fail("A paid ability on this card was already used this turn.", [
      CR.paidAbility,
    ]);
  }
  if (ability.oncePerRun && wasAbilityUsedThisRun(state, cardId, abilityId)) {
    return fail("Ability already used this run.", [CR.paidAbility]);
  }
  if (
    ability.oncePerEncounter &&
    wasAbilityUsedThisEncounter(state, cardId, abilityId)
  ) {
    return fail("Ability already used this encounter.", [CR.paidAbility]);
  }
  if (
    ability.requiresAdvancements !== undefined &&
    (card.advancementTokens ?? 0) < ability.requiresAdvancements
  ) {
    return fail(
      `Need ${ability.requiresAdvancements}+ advancements on ${card.title}.`,
      [CR.paidAbility],
    );
  }
  if (ability.requiresThreat !== undefined) {
    const threatPts = Math.max(
      agendaPointsFor(state, "corp"),
      agendaPointsFor(state, "runner"),
    );
    if (threatPts < ability.requiresThreat) {
      return fail(
        `Need Threat ${ability.requiresThreat} (have ${threatPts}).`,
        [CR.paidAbility],
      );
    }
  }
  if (
    typeof ability.requiresCorpCreditsGte === "number" &&
    state.corp.credits < ability.requiresCorpCreditsGte
  ) {
    return fail(
      `Need Corp to have at least ${ability.requiresCorpCreditsGte}¢.`,
      [CR.paidAbility],
    );
  }
  if (
    ability.requiresSuccessfulRdRunThisTurn &&
    !state.turn.successfulRdRunThisTurn
  ) {
    return fail("Ability requires a successful run on R&D this turn.", [
      CR.paidAbility,
    ]);
  }
  if (
    ability.requiresSuccessfulHqRunThisTurn &&
    !state.turn.successfulHqRunThisTurn
  ) {
    return fail("Ability requires a successful run on HQ this turn.", [
      CR.paidAbility,
    ]);
  }
  if (ability.requiresRezzedIce) {
    let has = false;
    for (const server of Object.values(state.servers)) {
      for (const id of server.ice) {
        if (state.cards[id]?.rezzed) {
          has = true;
          break;
        }
      }
      if (has) break;
    }
    if (!has) {
      return fail("Need a rezzed piece of ice.", [CR.paidAbility]);
    }
  }
  if (
    ability.requiresSuccessfulAllCentralsThisTurn &&
    !(
      state.turn.successfulHqRunThisTurn &&
      state.turn.successfulRdRunThisTurn &&
      state.turn.successfulArchivesRunThisTurn
    )
  ) {
    return fail(
      "Ability requires successful runs on HQ, R&D, and Archives this turn.",
      [CR.paidAbility],
    );
  }
  if (ability.requiresUntagged && runnerIsTagged(state)) {
    return fail("Ability requires the Runner to be untagged.", [CR.paidAbility]);
  }
  if (ability.requireEncounterSubtype) {
    const enc = state.run?.encounter;
    if (!enc) {
      return fail("Ability requires an encounter.", [CR.paidAbility]);
    }
    const subs = effectiveIceSubtypes(state, enc.iceId);
    if (!subs.includes(ability.requireEncounterSubtype)) {
      return fail(
        `Encountered ice must be ${ability.requireEncounterSubtype}.`,
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireEncounterChosenIce) {
    const enc = state.run?.encounter;
    if (!enc) {
      return fail("Ability requires an encounter.", [CR.paidAbility]);
    }
    if (!card.chosenIceId || enc.iceId !== card.chosenIceId) {
      return fail(
        "Ability requires an encounter with the ice chosen on install.",
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireAttackingMark) {
    const mark = state.markServerId;
    if (!mark || state.run?.attackedServerId !== mark) {
      return fail("Ability requires a run on the mark.", [CR.paidAbility]);
    }
  }
  if (ability.requireBrokenSubThisEncounter) {
    const enc = state.run?.encounter;
    if (!enc || !enc.broken.some((b) => b)) {
      return fail(
        "Ability requires a subroutine already broken this encounter.",
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireFullyBrokenThisEncounter) {
    const enc = state.run?.encounter;
    if (!enc?.fullyBrokenByRunner) {
      return fail(
        "Ability requires the encountered ice to be fully broken.",
        [CR.paidAbility],
      );
    }
  }
  if (ability.requireProtectingHostServer) {
    const enc = state.run?.encounter;
    const hostId = card.hostId;
    if (!enc || !hostId) {
      return fail("Ability requires host ice on encountered server.", [
        CR.paidAbility,
      ]);
    }
    if (!iceShareServer(state, hostId, enc.iceId)) {
      return fail(
        "Host ice must protect the same server as encountered ice.",
        [CR.paidAbility],
      );
    }
  }

  const ctx = {
    state,
    sourceId: cardId,
    payerSide: card.side,
  };

  if (ability.startsRun) {
    if (!serverId) {
      return fail("Run ability requires a target server.", [CR.paidAbility]);
    }
    if (!isServerAllowedForSpec(state, ability.startsRun, serverId)) {
      return fail("Illegal run target for this ability.", [CR.paidAbility]);
    }
    payCost(state, payer, cost, `use_paid_ability:${abilityId}`, card);
    if (ability.oncePerTurn) {
      markAbilityUsed(state, cardId, abilityId);
    }
    if (state.done) {
      // Flatline (or other game end) while paying costs — do not start the run.
      return ok(state);
    }
    const applied = evalEffect(ctx, ability.effect);
    if (!applied.ok) return fail(applied.error, applied.cites);
    const mods = modifiersFromStartsRun(state, ability.startsRun, cardId);
    log(state, `${card.title} starts a run on ${serverId}.`);
    const walked = startRun(state, serverId, mods);
    if (!walked.ok) {
      state.run = null;
      return walked;
    }
    finishRunReturnToAction(walked.state);
    return walked;
  }

  const pre = validatePaidEffect(ctx, ability.effect);
  if (pre !== null) {
    return fail(pre.error, pre.cites);
  }

  payCost(state, payer, cost, `use_paid_ability:${abilityId}`, card);
  if (ability.oncePerTurn) {
    markAbilityUsed(state, cardId, abilityId);
  }
  if (ability.oncePerRun) {
    markAbilityUsedThisRun(state, cardId, abilityId);
  }
  if (ability.oncePerEncounter) {
    markAbilityUsedThisEncounter(state, cardId, abilityId);
  }

  const applied = evalEffect(ctx, ability.effect);
  if (!applied.ok) return fail(applied.error, applied.cites);

  if (
    damageInterruptOpen &&
    state.pendingDamage &&
    (card.side === "corp" || ability.oncePerPendingDamageInstance)
  ) {
    if (!state.pendingDamage.interruptUsedSourceIds) {
      state.pendingDamage.interruptUsedSourceIds = [];
    }
    if (!state.pendingDamage.interruptUsedSourceIds.includes(cardId)) {
      state.pendingDamage.interruptUsedSourceIds.push(cardId);
    }
  }

  // The Back: first hardware paid-ability use during a run each turn.
  if (
    card.type === "hardware" &&
    card.side === "runner" &&
    state.run &&
    !state.turn.hardwareUsedDuringRunThisTurn
  ) {
    state.turn.hardwareUsedDuringRunThisTurn = true;
    for (const id of state.runner.rig) {
      const trigger = state.cards[id]?.onFirstHardwareUseDuringRunEachTurn;
      if (!trigger) continue;
      const r = evalEffect({ state, sourceId: id }, trigger);
      if (!r.ok) return fail(r.error, r.cites);
    }
  }

  if (state.pendingStandaloneBreach) {
    const pending = state.pendingStandaloneBreach;
    state.pendingStandaloneBreach = null;
    const sid = pending.serverId;
    if (!state.servers[sid]) {
      return fail(`Unknown server for standalone breach: ${sid}`, [CR.breach]);
    }
    log(state, `Standalone breach of ${sid} begins (CR ${CR.breach.number}).`);
    state.run = {
      attackedServerId: sid,
      phase: "breach",
      position: null,
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
      isPostRunBreach: true,
      runSourceId: pending.sourceId,
      ...(pending.cannotAccessRoot ? { cannotAccessRoot: true } : {}),
    };
    enterStep(state, "breach.begin");
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (state.pendingStandaloneCardAccess) {
    const pending = state.pendingStandaloneCardAccess;
    state.pendingStandaloneCardAccess = null;
    const sid = pending.serverId;
    const card = state.cards[pending.cardId];
    if (!state.servers[sid] || !card) {
      return fail(
        `Unknown card/server for standalone access: ${pending.cardId}`,
        [CR.breach],
      );
    }
    log(
      state,
      `Standalone access of ${card.title} on ${sid} begins (CR ${CR.cardAccessed.number}).`,
    );
    state.run = {
      attackedServerId: sid,
      phase: "breach",
      position: null,
      successful: null,
      accessedCardIds: [],
      accessCandidates: [pending.cardId],
      accessRemaining: 1,
      encounter: null,
      endedTheRun: false,
      cannotJackOut: false,
      strengthBoosts: {},
      encounterStrengthBoosts: {},
      iceStrengthBoosts: {},
      accessingCardId: null,
      isPostRunBreach: true,
      accessCandidatesPreset: true,
      runSourceId: pending.sourceId,
    };
    enterStep(state, "breach.begin");
    beginBreachAccess(state);
    if (state.pendingChoice) return ok(state);
    autoWalk(state);
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }

  if (
    card.type === "resource" &&
    card.side === "runner" &&
    !state.turn.firstResourcePaidAbilityThisTurn
  ) {
    state.turn.firstResourcePaidAbilityThisTurn = true;
    for (const id of state.runner.rig) {
      const trigger = state.cards[id]?.onFirstResourcePaidAbilityEachTurn;
      if (!trigger) continue;
      const r = evalEffect({ state, sourceId: id }, trigger);
      if (!r.ok) return fail(r.error, r.cites);
    }
  }

  if (card.side === "corp") {
    noteCorpActionType(state, "use_paid_ability");
    if (
      ability.usableFromHq ||
      (card.subtypes ?? []).includes("expendable")
    ) {
      fireOnAfterOperationOrExpendable(state);
    }
  }
  // ETR from a paid ability (Nisei MK II) ends the current phase and opens
  // Run Ends — process open priority windows (CR 6.1.4 / 6.8.2 / 11.4_6_a).
  if (state.run?.endedTheRun) {
    enterStep(state, "run.closePriorityWindows");
    const cont = advanceRunUntilStop(state);
    if (!cont.ok) return cont;
    finishRunReturnToAction(cont.state);
    return cont;
  }
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
  // Au Revoir-class: gain credits on jack out.
  for (const rid of state.runner.rig) {
    const card = state.cards[rid];
    const n = card?.gainCreditsOnJackOut;
    if (typeof n !== "number" || n <= 0) continue;
    state.runner.credits += n;
    log(state, `${card!.title} — gain ${n}¢ on jack out → ${state.runner.credits}¢.`);
  }
  // Ancestral Imager: net damage on jack out (scored agenda).
  for (const id of state.corp.score) {
    const card = state.cards[id];
    const n = card?.netDamageOnJackOut;
    if (typeof n !== "number" || n <= 0) continue;
    const r = dealDamage(state, "net", n, id);
    log(state, `${card!.title} — ${n} net damage on jack out (${r}).`);
  }
  enterStep(state, "run.closePriorityWindows");
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
  state.turn.operationPlayedFromNonHq = false;
  const handIdx = state.corp.hand.indexOf(cardId);
  if (handIdx < 0) return fail("Operation not in HQ.", [CR.playOperation]);
  if (card.playRequiresTagged && !runnerIsTagged(state)) {
    return fail("Play requires the Runner to be tagged.", [CR.playOperation]);
  }
  if (
    typeof card.playRequiresMinTags === "number" &&
    effectiveRunnerTags(state) < card.playRequiresMinTags
  ) {
    return fail(
      `Play requires the Runner to have at least ${card.playRequiresMinTags} tags.`,
      [CR.playOperation],
    );
  }
  if (
    card.playRequiresSuccessfulRunLastTurn &&
    !state.turn.successfulRunLastTurn
  ) {
    return fail("Play requires a successful run last turn.", [CR.playOperation]);
  }
  if (
    card.playRequiresUnsuccessfulRunLastTurn &&
    !state.turn.unsuccessfulRunLastTurn
  ) {
    return fail("Play requires an unsuccessful run last turn.", [
      CR.playOperation,
    ]);
  }
  if (
    card.playRequiresRunnerAccessedCardLastTurn &&
    !state.turn.accessedACardLastTurn
  ) {
    return fail(
      "Play requires the Runner accessed a card last turn.",
      [CR.playOperation],
    );
  }
  if (
    card.playRequiresRunnerMadeRunLastTurn &&
    !state.turn.runnerMadeRunLastTurn
  ) {
    return fail("Play requires the Runner made a run last turn.", [
      CR.playOperation,
    ]);
  }
  if (
    card.playRequiresRunnerInstalledResourceLastTurn &&
    !state.turn.runnerInstalledResourceLastTurn
  ) {
    return fail(
      "Play requires the Runner to have installed a resource during their last turn.",
      [CR.playOperation],
    );
  }
  if (
    typeof card.playRequiresRunnerAgendaPointsGte === "number" &&
    agendaPointsFor(state, "runner") < card.playRequiresRunnerAgendaPointsGte
  ) {
    return fail(
      `Play requires the Runner to have at least ${card.playRequiresRunnerAgendaPointsGte} agenda points.`,
      [CR.playOperation],
    );
  }
  if (
    card.playRequiresNoSuccessfulHqRunLastTurn &&
    state.turn.successfulHqRunLastTurn
  ) {
    return fail(
      "Play requires no successful HQ run during the Runner's last turn.",
      [CR.playOperation],
    );
  }
  if (typeof card.playRequiresThreat === "number") {
    const threatPts = Math.max(
      agendaPointsFor(state, "corp"),
      agendaPointsFor(state, "runner"),
    );
    if (threatPts < card.playRequiresThreat) {
      return fail(
        `Play requires Threat ${card.playRequiresThreat} (have ${threatPts}).`,
        [CR.playOperation],
      );
    }
  }
  if (
    card.playRequiresAgendaStolenLastTurn &&
    (state.turn.agendaPointsStolenLastTurn ?? 0) <= 0
  ) {
    return fail(
      "Play requires the Runner to have stolen an agenda last turn.",
      [CR.playOperation],
    );
  }
  if (
    card.playRequiresRunnerStoleOrTrashedCorpCardLastTurn &&
    !state.turn.runnerStoleOrTrashedCorpCardLastTurn
  ) {
    return fail(
      "Play requires the Runner to have stolen or trashed a Corp card last turn.",
      [CR.playOperation],
    );
  }
  if (
    card.playRequiresRunnerTrashedCorpCardLastTurn &&
    !state.turn.runnerTrashedCorpCardLastTurn
  ) {
    return fail(
      "Play requires the Runner to have trashed a Corp card last turn.",
      [CR.playOperation],
    );
  }
  if (card.playRequiresCorpHasInstalledCard) {
    let hasInstalled = false;
    for (const server of Object.values(state.servers)) {
      if (server.root.length > 0 || server.ice.length > 0) {
        hasInstalled = true;
        break;
      }
    }
    if (!hasInstalled) {
      return fail(
        "Play requires the Corp to have at least 1 installed card.",
        [CR.playOperation],
      );
    }
  }
  if (card.playRequiresScoredAgendaNotInstalledThisTurn) {
    const scored = state.turn.scoredCardIdsThisTurn ?? [];
    const installed = state.turn.installedThisTurn ?? [];
    if (!scored.some((id) => !installed.includes(id))) {
      return fail(
        "Play requires scoring an agenda this turn that was not installed this turn.",
        [CR.playOperation],
      );
    }
  }
  if (card.playRequiresScoredAgendaThisTurn) {
    const scored = state.turn.scoredCardIdsThisTurn ?? [];
    if (scored.length === 0) {
      return fail("Play requires scoring an agenda this turn.", [
        CR.playOperation,
      ]);
    }
  }
  if (
    (card.playRequiresNoActiveLockdown ||
      (card.subtypes ?? []).includes("lockdown")) &&
    hasActiveLockdown(state)
  ) {
    return fail("Cannot play while a lockdown is active.", [
      CR.playOperation,
      CR.lockdownOperation,
    ]);
  }
  const rawExtra =
    typeof card.playAdditionalClicks === "number"
      ? card.playAdditionalClicks
      : card.playAdditionalClick
        ? 1
        : 0;
  const discount =
    rawExtra > 0
      ? Math.min(rawExtra, firstDoubleOperationClickDiscountAvailable(state))
      : 0;
  const extraClick = rawExtra - discount;
  const clicksNeeded = 1 + extraClick;
  if (state.corp.clicks < clicksNeeded) {
    return fail(
      rawExtra > 0
        ? "Operation requires additional click(s)."
        : "Insufficient clicks.",
      [CR.playOperation],
    );
  }
  const cost = card.playCost ?? 0;
  if (state.corp.credits < cost) {
    return fail("Insufficient credits to play operation.", [CR.playOperation]);
  }
  if (card.playCostXMaxRunnerTags && state.runner.tags <= 0) {
    return fail("Psychographics requires the Runner to be tagged.", [
      CR.playOperation,
    ]);
  }
  const bad = spendClick(state);
  if (bad) return bad;
  if (extraClick > 0) {
    state.corp.clicks -= extraClick;
  }
  if (discount > 0) {
    state.turn.doubleOpClickDiscountUsedThisTurn = true;
    log(
      state,
      `First double operation click discount −${discount} (Synchrocyclotron-class).`,
    );
  }
  withCostCheckpoint(state, "play_operation", () => {
    state.corp.credits -= cost;
  });
  state.corp.hand.splice(handIdx, 1);
  const linger =
    Boolean(card.lingerUntilCorpNextTurnBegins) ||
    (card.subtypes ?? []).includes("lockdown");
  if (card.lingerAsCurrent) {
    placeCurrentAfterPlay(state, cardId, "corp");
  } else if (linger) {
    card.zone = "corp:play-area";
    card.faceup = true;
    log(
      state,
      `${card.title} remains in play until Corp's next turn begins (CR ${CR.playNotTrashedUntil.number}).`,
    );
  } else if (card.rfgInsteadOfTrashing) {
    card.zone = "removed-from-game";
    card.faceup = true;
    if (!state.removedFromGame) state.removedFromGame = [];
    if (!state.removedFromGame.includes(cardId)) {
      state.removedFromGame.push(cardId);
    }
    log(state, `${card.title} is removed from the game instead of trashing.`);
  } else {
    state.corp.discard.push(cardId);
    card.zone = "corp:archives";
    card.faceup = true;
    noteCorpCardAddedToArchives(state);
    fireGrayBlackOpsTrashedHooks(state, cardId);
  }
  if (card.playAdditionalCost) {
    const r = evalEffect(
      { state, sourceId: cardId },
      card.playAdditionalCost,
    );
    if (!r.ok) return fail(r.error, r.cites);
    log(
      state,
      `Additional cost paid for ${card.title} (CR ${CR.playOperation.number}).`,
    );
  }
  if (card.subliminalMessaging) {
    const isFirstSubliminal = !state.turn.subliminalPlayedThisTurn;
    state.turn.subliminalPlayedThisTurn = true;
    log(
      state,
      `Corp plays ${card.title} for ${cost}¢ (CR ${CR.playOperation.number}).`,
    );
    if ((card.subtypes ?? []).includes("transaction")) {
      const idCard = state.cards[state.corp.identityId];
      const bonus = idCard?.gainCreditOnTransactionPlayed ?? 0;
      if (bonus > 0) {
        state.corp.credits += bonus;
        log(
          state,
          `${idCard!.title} — gain ${bonus}¢ (transaction played).`,
        );
      }
    }
    if (card.onPlay) {
      const effect = isFirstSubliminal
        ? card.onPlay
        : {
            op: "do" as const,
            action: {
              kind: "gain_credits" as const,
              side: "corp" as const,
              amount: 1,
            },
          };
      const r = evalEffect({ state, sourceId: cardId }, effect);
      if (!r.ok) return fail(r.error, r.cites);
    }
    noteCorpActionType(state, "play_operation");
    fireCorpIdentityFlippedFirstOperationPlay(state);
    afterBasicAction(state);
    return ok(state);
  }
  log(
    state,
    `Corp plays ${card.title} for ${cost}¢ (CR ${CR.playOperation.number}).`,
  );
  if ((card.subtypes ?? []).includes("mandate")) {
    state.turn.mandatesPlayedThisTurn =
      (state.turn.mandatesPlayedThisTurn ?? 0) + 1;
  }
  if ((card.subtypes ?? []).includes("transaction")) {
    const idCard = state.cards[state.corp.identityId];
    const bonus = idCard?.gainCreditOnTransactionPlayed ?? 0;
    if (bonus > 0) {
      state.corp.credits += bonus;
      log(
        state,
        `${idCard!.title} — gain ${bonus}¢ (transaction played).`,
      );
    }
  }
  if (card.onPlay) {
    const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
    if (!r.ok) return fail(r.error, r.cites);
  }
  if (card.endsActionPhase) {
    state.corp.clicks = 0;
    log(
      state,
      `${card.title} is terminal — end the action phase (CR ${CR.playOperation.number}).`,
    );
  }
  if (state.pendingChoice) {
    state.deferAfterBasicAction = true;
    return ok(state);
  }
  noteCorpActionType(state, "play_operation");
  fireCorpIdentityFlippedFirstOperationPlay(state);
  fireOnAfterOperationOrExpendable(state);
  if (state.pendingChoice) {
    state.deferAfterBasicAction = true;
    return ok(state);
  }
  afterBasicAction(state);
  return ok(state);
}

function playEvent(
  state: GameState,
  cardId: string,
  serverId?: ServerId,
  trashGripForDiscountCardId?: string,
): ApplyResult {
  if (state.activeSide !== "runner") {
    return fail("Only Runner plays events.", [CR.playEvent]);
  }
  const card = state.cards[cardId];
  if (!card || card.type !== "event") {
    return fail("Not an event.", [CR.playEvent]);
  }
  const handIdx = state.runner.hand.indexOf(cardId);
  const blingHostId = handIdx < 0 ? hostedPlayableAsGrip(state, cardId) : null;
  if (handIdx < 0 && !blingHostId) return fail("Event not in grip.", [CR.playEvent]);
  if (
    isCurrentCard(card) &&
    runnerCannotPlayCurrentEvents(state)
  ) {
    return fail("Cannot play current events while The News Now Hour is active.", [
      CR.playEvent,
    ]);
  }
  if (
    card.playRequiresSuccessfulRunThisTurn &&
    !state.turn.successfulRunThisTurn
  ) {
    return fail("Play requires a successful run this turn.", [CR.playEvent]);
  }
  if (
    card.playRequiresSuccessfulHqRunThisTurn &&
    !state.turn.successfulHqRunThisTurn
  ) {
    return fail("Play requires a successful HQ run this turn.", [CR.playEvent]);
  }
  if (
    card.playRequiresSuccessfulAllCentralsThisTurn &&
    !(
      state.turn.successfulHqRunThisTurn &&
      state.turn.successfulRdRunThisTurn &&
      state.turn.successfulArchivesRunThisTurn
    )
  ) {
    return fail(
      "Play requires successful runs on HQ, R&D, and Archives this turn.",
      [CR.playEvent],
    );
  }
  if (card.playRequiresTagged && !runnerIsTagged(state)) {
    return fail("Play requires the Runner to be tagged.", [CR.playEvent]);
  }
  if (
    card.playRequiresCorpBadPublicityGte &&
    (state.corp.badPublicity ?? 0) < card.playRequiresCorpBadPublicityGte
  ) {
    return fail("Play requires the Corp to have bad publicity.", [CR.playEvent]);
  }
  if (
    card.playRequiresInstalledResource &&
    !state.runner.rig.some((id) => state.cards[id]?.type === "resource")
  ) {
    return fail("Play requires an installed resource.", [CR.playEvent]);
  }
  if (
    card.playRequiresInstalledProgram &&
    !state.runner.rig.some((id) => state.cards[id]?.type === "program")
  ) {
    return fail("Play requires an installed program.", [CR.playEvent]);
  }
  if (
    card.playRequiresInstalledProgramOrHardware &&
    !state.runner.rig.some((id) => {
      const t = state.cards[id]?.type;
      return t === "program" || t === "hardware";
    })
  ) {
    return fail("Play requires an installed program or hardware.", [
      CR.playEvent,
    ]);
  }
  if (
    typeof card.playRequiresOtherGripCardsGte === "number" &&
    state.runner.hand.filter((id) => id !== cardId).length <
      card.playRequiresOtherGripCardsGte
  ) {
    return fail(
      `Play requires trashing ${card.playRequiresOtherGripCardsGte} other cards from grip.`,
      [CR.playEvent],
    );
  }
  if (card.playRequiresUntagged && runnerIsTagged(state)) {
    return fail("Play requires the Runner to be untagged.", [CR.playEvent]);
  }
  if (
    card.playRequiresSuccessfulRunLastTurn &&
    !state.turn.successfulRunLastTurn
  ) {
    return fail("Play requires a successful run last turn.", [CR.playEvent]);
  }
  if (
    card.playRequiresUnsuccessfulRunLastTurn &&
    !state.turn.unsuccessfulRunLastTurn
  ) {
    return fail("Play requires an unsuccessful run last turn.", [
      CR.playEvent,
    ]);
  }
  if (
    card.playRequiresFirstClick &&
    (state.turn.runnerClicksSpentThisTurn ?? 0) > 0
  ) {
    return fail("Play only as your first [click].", [CR.playEvent]);
  }
  if (typeof card.playRequiresThreat === "number") {
    const threatPts = Math.max(
      agendaPointsFor(state, "corp"),
      agendaPointsFor(state, "runner"),
    );
    if (threatPts < card.playRequiresThreat) {
      return fail(
        `Play requires Threat ${card.playRequiresThreat} (have ${threatPts}).`,
        [CR.playEvent],
      );
    }
  }
  if (
    card.playRequiresAgendaStolenThisTurn &&
    (state.turn.agendaPointsStolenThisTurn ?? 0) <= 0
  ) {
    return fail(
      "Play requires the Runner to have stolen an agenda this turn.",
      [CR.playEvent],
    );
  }
  if (
    card.playRequiresVirusCounterPlacedOnProgramThisTurn &&
    (state.turn.programsWithVirusPlacedThisTurn?.length ?? 0) === 0
  ) {
    return fail(
      "Play requires placing a virus counter on a program this turn.",
      [CR.playEvent],
    );
  }
  let extraClick =
    typeof card.playAdditionalClicks === "number"
      ? card.playAdditionalClicks
      : card.playAdditionalClick
        ? 1
        : 0;
  if (
    extraClick > 0 &&
    (card.subtypes ?? []).includes("double") &&
    !state.turn.starlightDoubleEventAdditionalCostIgnored
  ) {
    for (const rid of state.runner.rig) {
      const host = state.cards[rid];
      if (!host?.ignoreAdditionalCostFirstDoubleEventEachTurn) continue;
      extraClick = 0;
      state.turn.starlightDoubleEventAdditionalCostIgnored = true;
      log(state, `${host.title} — ignore additional cost on double event.`);
      break;
    }
  }
  const clicksNeeded = 1 + extraClick;
  if (state.runner.clicks < clicksNeeded) {
    return fail(
      extraClick > 0
        ? "Event requires additional click(s)."
        : "Insufficient clicks.",
      [CR.playEvent],
    );
  }
  if (trashGripForDiscountCardId) {
    const pw = applyPatchworkDiscount(
      state,
      trashGripForDiscountCardId,
      cardId,
    );
    if (!pw.ok) return fail(pw.error, [CR.playEvent]);
    state.turn.patchworkPendingDiscountThisAction = pw.discount;
  }
  const cost = effectiveEventPlayCost(state, card.playCost, card);
  if (runnerCreditsFor(state, "play_event") < cost) {
    state.turn.patchworkPendingDiscountThisAction = 0;
    return fail("Insufficient credits to play event.", [
      CR.playEvent,
      CR.costCalculation,
      CR.eventPlayCost,
    ]);
  }
  const bad = spendClick(state);
  if (bad) {
    state.turn.patchworkPendingDiscountThisAction = 0;
    return bad;
  }
  if (extraClick > 0) {
    state.runner.clicks -= extraClick;
  }
  withCostCheckpoint(state, "play_event", () => {
    spendRunnerCreditsFor(state, cost, "play_event");
  });
  state.turn.patchworkPendingDiscountThisAction = 0;
  // Leave hand/hosted then move to heap (fires onTrashFromGripOrStack — Steelskin).
  // Recompute hand index — Patchwork may have spliced grip.
  const handIdxAfter = state.runner.hand.indexOf(cardId);
  if (handIdxAfter >= 0) {
    state.runner.hand.splice(handIdxAfter, 1);
  } else if (blingHostId) {
    const host = state.cards[blingHostId]!;
    host.hostedCardIds = (host.hostedCardIds ?? []).filter((id) => id !== cardId);
    card.hostId = undefined;
  }
  if (card.lingerAsCurrent) {
    placeCurrentAfterPlay(state, cardId, "runner");
  } else {
    card.zone = "runner:grip";
    moveRunnerCardToHeap(state, cardId);
  }
  if ((card.powerCountersOnPlay ?? 0) > 0) {
    card.powerCounters = card.powerCountersOnPlay;
  }
  if (card.playAdditionalCost) {
    const r = evalEffect(
      { state, sourceId: cardId },
      card.playAdditionalCost,
    );
    if (!r.ok) return fail(r.error, r.cites);
    log(
      state,
      `Additional cost paid for ${card.title} (CR ${CR.playEvent.number}).`,
    );
  }
  log(
    state,
    `Runner plays ${card.title} for ${cost}¢ (CR ${CR.playEvent.number}${
      cost !== (card.playCost ?? 0)
        ? `; cost calc ${CR.costCalculation.number}`
        : ""
    }).`,
  );
  if ((card.subtypes ?? []).includes("run")) {
    const idCard = state.cards[state.runner.identityId];
    const bonus = idCard?.gainCreditOnFirstRunEvent ?? 0;
    if (bonus > 0 && state.turn.runEventsPlayedThisTurn === 0) {
      state.runner.credits += bonus;
      log(
        state,
        `${idCard!.title} — gain ${bonus}¢ (first run event this turn).`,
      );
    }
    if (state.turn.runEventsPlayedThisTurn === 0) {
      for (const rid of state.runner.rig) {
        const rigCard = state.cards[rid];
        if (!rigCard?.gainClickOnFirstRunEventThisTurn) continue;
        state.runner.clicks += 1;
        log(
          state,
          `${rigCard.title} — gain [click] (first run event this turn).`,
        );
      }
    }
    state.turn.runEventsPlayedThisTurn += 1;
    // Debbie-class: place hosted credits on installed cards.
    for (const id of state.runner.rig) {
      const rigCard = state.cards[id];
      const n = rigCard?.hostedCreditsOnRunEventPlay;
      if (!n) continue;
      rigCard.hostedCredits = (rigCard.hostedCredits ?? 0) + n;
      log(
        state,
        `${rigCard.title} — place ${n}¢ (run event played) → ${rigCard.hostedCredits}.`,
      );
    }
  }
  // Touchstone-class: first event each turn places hosted credits.
  if (state.turn.eventsPlayedThisTurn === 0) {
    for (const id of state.runner.rig) {
      const rigCard = state.cards[id];
      const n = rigCard?.hostedCreditsOnFirstEventPlayOncePerTurn;
      if (!n) continue;
      rigCard.hostedCredits = (rigCard.hostedCredits ?? 0) + n;
      log(
        state,
        `${rigCard.title} — place ${n}¢ (first event this turn) → ${rigCard.hostedCredits}.`,
      );
    }
  }
  state.turn.eventsPlayedThisTurn += 1;
  if (card.runEvent) {
    if (!serverId) {
      if (!card.runEventOptional) {
        return fail("Run event requires a target server.", [CR.playEvent]);
      }
      // Optional run declined: resolve onPlay only (Reprise).
      if (card.onPlay) {
        const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
        if (!r.ok) return fail(r.error, r.cites);
      }
      if (state.pendingChoice) {
        state.deferAfterBasicAction = true;
        return ok(state);
      }
      afterBasicAction(state);
      return ok(state);
    }
    if (!isServerAllowedForSpec(state, card.runEvent, serverId)) {
      return fail("Illegal run target for this event.", [CR.playEvent]);
    }
    if (card.onPlay) {
      const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
      if (!r.ok) return fail(r.error, r.cites);
      if (state.pendingChoice) {
        state.pendingRunEventStart = { sourceId: cardId, serverId };
        return ok(state);
      }
    }
    const mods = modifiersFromStartsRun(state, card.runEvent, cardId);
    // Concerto: hosted credits on the played event become run eventCredits.
    const hosted = card.hostedCredits ?? 0;
    if (hosted > 0) {
      mods.eventCredits = (mods.eventCredits ?? 0) + hosted;
      card.hostedCredits = 0;
    }
    const walked = startRun(state, serverId, mods);
    if (!walked.ok) {
      state.run = null;
      return walked;
    }
    finishRunReturnToAction(walked.state);
    return walked;
  }
  if (card.onPlay) {
    const r = evalEffect({ state, sourceId: cardId }, card.onPlay);
    if (!r.ok) return fail(r.error, r.cites);
  }
  if (card.remainderOfTurnOnInstallPrintedCostGte) {
    if (!state.turn.remainderOfTurnOnInstallPrintedCostGte) {
      state.turn.remainderOfTurnOnInstallPrintedCostGte = [];
    }
    state.turn.remainderOfTurnOnInstallPrintedCostGte.push({
      min: card.remainderOfTurnOnInstallPrintedCostGte.min,
      effect: structuredClone(card.remainderOfTurnOnInstallPrintedCostGte.effect),
      sourceId: cardId,
    });
    log(
      state,
      `${card.title} — for the remainder of this turn, on install with printed cost ≥ ${card.remainderOfTurnOnInstallPrintedCostGte.min}¢, draw 1 or gain 1¢.`,
    );
  }
  if (state.pendingStartRunOnMark) {
    const mark = state.markServerId;
    const runSrc = state.pendingStartRunOnMark.sourceId;
    state.pendingStartRunOnMark = null;
    if (mark && state.servers[mark]) {
      const walked = startRun(state, mark, { runSourceId: runSrc });
      if (!walked.ok) return walked;
      finishRunReturnToAction(walked.state);
      return walked;
    }
  }
  if (state.pendingChoice) {
    state.deferAfterBasicAction = true;
    return ok(state);
  }
  afterBasicAction(state);
  return ok(state);
}

function advanceCard(state: GameState, cardId: string): ApplyResult {
  if (state.activeSide !== "corp") {
    return fail("Only Corp may advance.", [CR.corpBasicAdvance]);
  }
  if (state.turn.cannotAdvanceCards) {
    return fail("Cannot advance cards for the remainder of this turn.", [
      CR.advancing,
    ]);
  }
  const card = state.cards[cardId];
  if (!card) return fail("Unknown card.", [CR.advancing]);
  if (card.type !== "agenda" && card.type !== "asset" && card.type !== "ice") {
    return fail("Only agendas/assets/ice advance in this engine.", [
      CR.advancing,
    ]);
  }
  if (!card.zone.endsWith(":root") && !card.zone.endsWith(":ice")) {
    return fail("Card must be installed to advance.", [CR.advancing]);
  }
  if (state.corp.credits < 1) {
    let avail = 0;
    if (card.type === "ice") {
      const idCardProbe = state.cards[state.corp.identityId];
      for (const c of [
        idCardProbe,
        ...Object.values(state.cards).filter(
          (x) => x.side === "corp" && x.rezzed && x.type !== "identity",
        ),
      ]) {
        if (!c?.recurringSpendFor?.includes("advance_ice")) continue;
        avail += c.recurringCredits ?? 0;
      }
    }
    // Simone Diego-class: recurring for cards in this server.
    for (const server of Object.values(state.servers)) {
      if (!server.root.includes(cardId) && !server.ice.includes(cardId)) continue;
      for (const id of [...server.root, ...server.ice]) {
        const c = state.cards[id];
        if (!c?.rezzed) continue;
        if (!(c.recurringSpendFor ?? []).includes("advance_cards_this_server")) {
          continue;
        }
        avail += c.recurringCredits ?? 0;
      }
    }
    if (avail < 1) {
      return fail("Need 1¢ to advance.", [CR.advancing]);
    }
  }
  const bad = spendClick(state);
  if (bad) return bad;
  withCostCheckpoint(state, "advance", () => {
    let left = 1;
    left = applyAdvanceThisServerRecurringTowardAdvance(state, cardId, left);
    if (card.type === "ice" && left > 0) {
      left = applyAdvanceIceRecurringTowardAdvance(state, left);
    }
    if (left > 0) state.corp.credits -= left;
  });
  const prior = card.advancementTokens ?? 0;
  card.advancementTokens = prior + 1;
  const firstAdvanceThisTurn = !state.turn.advancedThisTurn.includes(cardId);
  if (firstAdvanceThisTurn) {
    state.turn.advancedThisTurn.push(cardId);
  }
  const idCard = state.cards[state.corp.identityId];
  if (
    idCard?.defId === "weyland-consortium-built-to-last" &&
    prior === 0
  ) {
    state.corp.credits += 2;
    log(
      state,
      `Weyland: Built to Last — gain 2¢ for first advancement on ${card.title}.`,
    );
  }
  if (card.creditsOnFirstAdvanceThisTurn && firstAdvanceThisTurn) {
    const n = card.creditsOnFirstAdvanceThisTurn;
    state.corp.credits += n;
    log(
      state,
      `${card.title} — gain ${n}¢ (first advance this turn) → ${state.corp.credits}.`,
    );
  }
  if (card.creditsOnAdvance) {
    const nextTokens = card.advancementTokens ?? 0;
    const spec = card.creditsOnAdvance;
    const gain =
      spec.atOrAbove !== undefined && nextTokens >= spec.atOrAbove
        ? spec.bonus ?? spec.default
        : spec.default;
    state.corp.credits += gain;
    log(
      state,
      `${card.title} — gain ${gain}¢ on advance → ${state.corp.credits}.`,
    );
  }
  if (card.trashTopOfStackOnAdvance) {
    const nextTokens = card.advancementTokens ?? 0;
    const spec = card.trashTopOfStackOnAdvance;
    const n =
      spec.atOrAbove !== undefined && nextTokens >= spec.atOrAbove
        ? spec.bonus ?? spec.default
        : spec.default;
    for (let i = 0; i < n; i++) {
      const top = state.runner.deck.shift();
      if (!top) break;
      const milled = state.cards[top]!;
      milled.zone = "runner:heap";
      milled.faceup = true;
      state.runner.discard.push(top);
    }
    log(state, `${card.title} — trash top ${n} of Runner stack.`);
  }
  if (card.placeAdvancementOnAnotherOnAdvance) {
    const nextTokens = card.advancementTokens ?? 0;
    const spec = card.placeAdvancementOnAnotherOnAdvance;
    const amount =
      spec.atOrAbove !== undefined && nextTokens >= spec.atOrAbove
        ? spec.bonus ?? spec.default
        : spec.default;
    const r = evalEffect(
      { state, sourceId: cardId },
      {
        op: "do",
        action: {
          kind: "oh_place_advancement_on_another_on_advance",
          amount,
        },
      },
    );
    if (!r.ok) {
      log(state, `${card.title} on-advance place failed: ${r.error}`);
    }
  }
  log(
    state,
    `Corp advances ${card.title} → ${card.advancementTokens} (CR ${CR.corpBasicAdvance.number}, ${CR.advancing.number}).`,
  );
  syncGainsSubroutinesPerAdvancement(card);
  noteCorpActionType(state, "basic_advance");
  afterBasicAction(state);
  return ok(state);
}

function grantCreditsOnScoreOrSteal(state: GameState): void {
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    const n = card.creditsOnScoreOrSteal ?? 0;
    if (n > 0) {
      state.runner.credits += n;
      log(state, `${card.title} — gain ${n}¢ (agenda scored/stolen).`);
    }
  }
}

function fireScoreOrStealSideEffects(
  state: GameState,
  scoredOrStolenId: string,
  kind: "score" | "steal",
  serverIdBefore?: string,
): ApplyResult {
  if (serverIdBefore && state.servers[serverIdBefore as ServerId]) {
    state.turn.lastAgendaScoredOrStolenServerId =
      serverIdBefore as ServerId;
  }
  grantCreditsOnScoreOrSteal(state);

  fireFirstAgendaScoredOrStolenThisTurn(state);
  if (state.pendingChoice || state.pendingSabotage) return ok(state);

  // Jinteki: Personal Evolution
  const corpId = state.cards[state.corp.identityId];
  if (corpId?.netDamageOnAgendaScoredOrStolen) {
    const r = evalEffect(
      { state, sourceId: corpId.id },
      fx.netDamage(corpId.netDamageOnAgendaScoredOrStolen),
    );
    if (!r.ok) return fail(r.error, r.cites);
  }

  // Pantograph may-install
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (card.mayInstallOnScoreOrSteal) {
      const r = evalEffect(
        { state, sourceId: id },
        fx.mayInstallFromGrip(),
      );
      if (!r.ok) return fail(r.error, r.cites);
      if (state.pendingChoice) return ok(state);
    }
  }

  // Daeg-class / Leela-class: on agenda scored or stolen (rig + Runner identity)
  for (const id of [state.runner.identityId, ...state.runner.rig]) {
    const card = state.cards[id];
    if (!card?.onAgendaScoredOrStolen) continue;
    const r = evalEffect(
      { state, sourceId: id },
      card.onAgendaScoredOrStolen,
    );
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice) return ok(state);
  }

  // Perfect Recall: power on agenda scored/stolen from this server
  if (serverIdBefore) {
    const server = state.servers[serverIdBefore as keyof typeof state.servers];
    if (server) {
      for (const id of [...server.root, ...server.ice]) {
        const card = state.cards[id];
        const n = card?.powerCounterOnAgendaScoredOrStolenFromThisServer;
        if (!n || !card.rezzed) continue;
        card.powerCounters = (card.powerCounters ?? 0) + n;
        log(
          state,
          `${card.title} — place ${n} power (agenda scored/stolen from this server) → ${card.powerCounters}.`,
        );
      }
    }
  }

  // Vera Ivanovna-class: rezzed Corp installed onAgendaScoredOrStolen
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const card = state.cards[id];
      if (!card?.onAgendaScoredOrStolen) continue;
      if (!card.rezzed && !card.persistent) continue;
      const r = evalEffect(
        { state, sourceId: id },
        card.onAgendaScoredOrStolen,
      );
      if (!r.ok) return fail(r.error, r.cites);
      if (state.pendingChoice) return ok(state);
    }
  }

  // Send a Message (on the agenda itself)
  const agenda = state.cards[scoredOrStolenId];
  if (agenda.mayRezIceIgnoringCostsOnScoreOrSteal) {
    const r = evalEffect(
      { state, sourceId: scoredOrStolenId },
      fx.rezIceIgnoringCosts(),
    );
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice) return ok(state);
  }

  // Tāo Salonga ice swap
  const runnerId = state.cards[state.runner.identityId];
  if (runnerId?.maySwapIceOnAgendaScoredOrStolen) {
    const r = evalEffect(
      { state, sourceId: runnerId.id },
      fx.swapTwoIce(),
    );
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice) return ok(state);
  }

  // Malapert: search R&D when scoring from its server
  if (kind === "score" && serverIdBefore) {
    const server = state.servers[serverIdBefore as ServerId];
    if (server) {
      for (const id of server.root) {
        const up = state.cards[id];
        if (up.rezzed && up.searchRdNonAgendaOnScoreFromServer) {
          const r = evalEffect(
            { state, sourceId: id },
            fx.searchRdNonAgenda(),
          );
          if (!r.ok) return fail(r.error, r.cites);
        }
      }
    }
  }

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
  if (state.turn.cannotScoreAgendas) {
    return fail("Cannot score agendas for the remainder of this turn.", [
      CR.scoringAgenda,
    ]);
  }
  if (
    state.turn.cannotScoreOrRezCardIds.includes(cardId) ||
    state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(cardId)
  ) {
    return fail("Cannot score this card for the remainder of this turn.", [
      CR.scoringAgenda,
    ]);
  }
  const card = state.cards[cardId];
  if (state.turn.installedThisTurn.includes(cardId)) {
    if (card.cannotScoreIfInstalledThisTurn) {
      return fail(
        "Cannot score this agenda if it was installed this turn.",
        [CR.scoringAgenda],
      );
    }
    for (const id of state.runner.rig) {
      if (state.cards[id].forbidScoreAgendaInstalledThisTurn) {
        return fail(
          "Cannot score an agenda installed this turn (Clot).",
          [CR.scoringAgenda],
        );
      }
    }
  }
  if (!canScoreAgenda(state, card)) {
    return fail("Agenda cannot be scored.", [CR.scoringAgenda]);
  }

  // Word on the Street-class: additional cost when scoring an agenda installed
  // this turn — add each such resource to Corp score as a −1 agenda.
  if (state.turn.installedThisTurn.includes(cardId)) {
    for (const id of [...state.runner.rig]) {
      const runnerCard = state.cards[id];
      if (!runnerCard?.additionalCostOnScoreAgendaInstalledThisTurn) continue;
      const r = evalEffect(
        { state, sourceId: id },
        runnerCard.additionalCostOnScoreAgendaInstalledThisTurn,
      );
      if (!r.ok) return fail(r.error, r.cites);
      if (state.pendingChoice) return ok(state);
    }
  }

  // Additional score cost (Azef): pay before the agenda leaves its server.
  if (card.scoreAdditionalCost) {
    if (state.pendingScoreAgendaId === cardId) {
      // Cost already resolved via choose_option.
      state.pendingScoreAgendaId = null;
    } else {
      state.pendingScoreAgendaId = cardId;
      const r = evalEffect(
        { state, sourceId: cardId },
        card.scoreAdditionalCost,
      );
      if (!r.ok) {
        state.pendingScoreAgendaId = null;
        return fail(r.error, r.cites);
      }
      if (state.pendingChoice) {
        return ok(state);
      }
      // Cost resolved synchronously (unlikely for must_trash) — clear and continue.
      state.pendingScoreAgendaId = null;
    }
  }

  const serverIdBefore = card.zone
    .replace(/^server:/, "")
    .replace(/:root$/, "");
  scoreAgenda(state, cardId);
  state.turn.agendaPointsScoredThisTurn += card.agendaPoints ?? 0;
  if (!state.turn.scoredCardIdsThisTurn) state.turn.scoredCardIdsThisTurn = [];
  state.turn.scoredCardIdsThisTurn.push(cardId);
  // Djupstad Grid-class: core damage when scoring from this server's root.
  // Arella Salvatore-class: onAgendaScoredFromThisServer effect.
  const scoredFromServer = state.servers[serverIdBefore as ServerId];
  if (scoredFromServer) {
    for (const uid of scoredFromServer.root) {
      const up = state.cards[uid];
      if (
        up?.rezzed &&
        (up.coreDamageOnAgendaScoredFromThisServer ?? 0) > 0
      ) {
        dealDamage(
          state,
          "core",
          up.coreDamageOnAgendaScoredFromThisServer!,
          uid,
        );
        log(
          state,
          `${up.title} — do ${up.coreDamageOnAgendaScoredFromThisServer} core damage (agenda scored from this server).`,
        );
      }
      if (up?.rezzed && up.onAgendaScoredFromThisServer) {
        const r = evalEffect(
          { state, sourceId: uid },
          up.onAgendaScoredFromThisServer,
        );
        if (!r.ok) return fail(r.error, r.cites);
        if (state.pendingChoice || state.pendingSabotage) return ok(state);
      }
    }
  }
  if ((card.badPublicityOnScore ?? 0) > 0) {
    const bpGain = card.badPublicityOnScore ?? 0;
    state.corp.badPublicity = (state.corp.badPublicity ?? 0) + bpGain;
    log(
      state,
      `${card.title} — take ${bpGain} bad publicity → ${state.corp.badPublicity}.`,
    );
    fireFirstBadPublicityTake(state, bpGain);
  }
  if ((card.handSizeBonus ?? 0) !== 0) {
    state.corp.maxHandSize += card.handSizeBonus!;
  }
  const sideFx = fireScoreOrStealSideEffects(
    state,
    cardId,
    "score",
    serverIdBefore,
  );
  if (!sideFx.ok) return sideFx;
  if (state.pendingChoice) return sideFx;
  if (card.onScore) {
    if (card.onScoreIfRunnerTaggedPlaceAgendaCounter && state.runner.tags > 0) {
      card.agendaCounters = (card.agendaCounters ?? 0) + 1;
      log(
        state,
        `${card.title} — Runner tagged; place agenda counter → ${card.agendaCounters}.`,
      );
    }
    const r = evalEffect({ state, sourceId: cardId }, card.onScore);
    if (!r.ok) return fail(r.error, r.cites);
    // Wait for onScore choice (e.g. Élivágar may_derez) before identity /
    // installed onAgendaScored triggers (CR §9.5 / ability resolution).
    if (state.pendingChoice || state.pendingSabotage) return ok(state);
  }
  const idCard = state.cards[state.corp.identityId];
  if (idCard?.onAgendaScored) {
    const r = evalEffect(
      { state, sourceId: idCard.id },
      idCard.onAgendaScored,
    );
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice || state.pendingSabotage) return ok(state);
  }
  // Issuaq Adaptics: power if agenda was not installed or advanced this turn
  if (idCard?.powerOnScoreIfAgendaNotInstalledOrAdvancedThisTurn) {
    const touched =
      state.turn.installedThisTurn.includes(cardId) ||
      state.turn.advancedThisTurn.includes(cardId);
    if (!touched) {
      idCard.powerCounters = (idCard.powerCounters ?? 0) + 1;
      log(
        state,
        `${idCard.title} — place 1 power → ${idCard.powerCounters} (agenda not installed/advanced this turn).`,
      );
      checkWinConditions(state);
      if (state.winner) return ok(state);
    }
  }
  // Marrow-class: installed Runner cards with onAgendaScored
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (!card?.onAgendaScored) continue;
    const r = evalEffect({ state, sourceId: id }, card.onAgendaScored);
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice || state.pendingSabotage) return ok(state);
  }
  // The Powers That Be-class: rezzed Corp installed onAgendaScored
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const installed = state.cards[id];
      if (!installed?.onAgendaScored) continue;
      if (!installed.rezzed && !installed.persistent) continue;
      const r = evalEffect(
        { state, sourceId: id },
        installed.onAgendaScored,
      );
      if (!r.ok) return fail(r.error, r.cites);
      if (state.pendingChoice || state.pendingSabotage) return ok(state);
    }
  }
  // Salvo Testing-class: scored agendas with onAgendaScored (incl. this one)
  for (const id of state.corp.score) {
    const scored = state.cards[id];
    if (!scored?.onAgendaScored) continue;
    const r = evalEffect({ state, sourceId: id }, scored.onAgendaScored);
    if (!r.ok) return fail(r.error, r.cites);
    if (state.pendingChoice || state.pendingSabotage) return ok(state);
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
  const cost = abilityCost(ability, state, idCard);
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
      case "use_paid_ability": {
        return usePaidAbility(
          next,
          action.cardId,
          action.abilityId,
          action.serverId,
        );
      }
      default:
        return fail("Trace in progress — boost, spend link, or resolve.", [
          CR.trace,
        ]);
    }
  }

  if (next.psi) {
    switch (action.type) {
      case "psi_runner_bid": {
        const err = psiRunnerBid(next, action.amount);
        if (err) return fail(err, [CR.trace]);
        return ok(next);
      }
      case "psi_corp_bid": {
        const err = psiCorpBid(next, action.amount);
        if (err) return fail(err, [CR.trace]);
        // Resume R&D breach after onBreachRd psi (Akiko Nisei).
        if (next.run?.onBreachRdPending) {
          next.run.onBreachRdPending = false;
          beginBreachAccess(next);
          if (next.pendingChoice || next.psi) return ok(next);
          autoWalk(next);
          const cont = advanceRunUntilStop(next);
          if (!cont.ok) return cont;
          finishRunReturnToAction(cont.state);
          return cont;
        }
        // Resume auto-walk if psi paused an auto/branch step (Letheia).
        if (
          next.pendingChoice ||
          next.pendingTrashProgram ||
          next.pendingSabotage ||
          next.pendingDamage ||
          next.trace ||
          next.psi
        ) {
          return ok(next);
        }
        autoWalk(next);
        if (next.run) {
          const cont = advanceRunUntilStop(next);
          if (!cont.ok) return cont;
          finishRunReturnToAction(cont.state);
          return cont;
        }
        return ok(next);
      }
      default:
        return fail("Psi game in progress — Runner then Corp must bid.", [
          CR.trace,
        ]);
    }
  }

  if (next.pendingExpose && next.pendingExpose.phase === "interrupt") {
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingExpose) return ok(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "accept_expose") {
      acceptPendingExpose(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    return fail("Pending expose — prevent or accept.", [CR.expose]);
  }

  if (next.pendingTrashPrevent) {
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingTrashPrevent) return ok(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "accept_installed_trash") {
      acceptPendingInstalledTrash(next, moveRunnerCardToHeap);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    return fail("Pending installed trash — prevent or accept.", [CR.trashing]);
  }

  if (next.pendingTags) {
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingTags) return ok(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "accept_tags") {
      acceptPendingTags(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    return fail("Pending tags — avoid or accept.", [CR.tags]);
  }

  if (next.pendingEndTheRun) {
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingEndTheRun) return ok(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    if (action.type === "accept_end_the_run") {
      acceptPendingEndTheRun(next);
      resumePendingEffectContinuation(next);
      return ok(next);
    }
    return fail("Pending end the run — prevent or accept.", [CR.endTheRun]);
  }

  if (next.pendingSubroutineBreak) {
    if (action.type === "rez_asset") {
      return resolveTyrsHandRezDuringBreakInterrupt(next, action.cardId);
    }
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingSubroutineBreak?.prevented) {
        return finalizePendingSubroutineBreak(next, true);
      }
      return ok(next);
    }
    if (action.type === "pass_window") {
      return finalizePendingSubroutineBreak(next, false);
    }
    return fail(
      "Pending subroutine-break interrupt — rez, use a paid ability, or pass.",
      [CR.encounterBreakPaw],
    );
  }

  if (next.pendingDamage) {
    if (action.type === "use_paid_ability") {
      const paid = usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );
      if (!paid.ok) return paid;
      if (next.pendingDamage) return ok(next);
      resumePendingEffectContinuation(next);
      if (
        next.run?.accessingCardId &&
        (next.timingKey === "access.cardAccessed" ||
          next.timingKey === "access.midAccess")
      ) {
        autoWalk(next);
        return advanceFromMidAccess(next);
      }
      return ok(next);
    }
    switch (action.type) {
      case "prevent_damage":
        preventPendingDamage(next, action.amount);
        break;
      case "prevent_damage_lose_all_clicks":
        if (!next.pendingDamage.preventByLoseAllClicks) {
          return fail("Cannot prevent this damage by losing clicks.", [
            CR.preventDamage,
          ]);
        }
        if (next.runner.clicks <= 0) {
          return fail("No clicks remaining to prevent damage.", [
            CR.preventDamage,
          ]);
        }
        preventPendingDamageLoseAllClicks(next);
        break;
      case "accept_damage":
        acceptPendingDamage(next);
        break;
      default:
        return fail("Pending damage — prevent or accept.", [CR.preventDamage]);
    }
    if (next.pendingDamage) return ok(next);
    resumePendingEffectContinuation(next);
    // Resume nested access-a-card walk after onAccess damage interrupt.
    if (
      next.run?.accessingCardId &&
      (next.timingKey === "access.cardAccessed" ||
        next.timingKey === "access.midAccess")
    ) {
      autoWalk(next);
      return advanceFromMidAccess(next);
    }
    return ok(next);
  }

  if (next.pendingTrashProgram) {
    if (action.type === "choose_trash_program") {
      return chooseTrashProgram(next, action.cardId);
    }
    return fail("Pending trash-program choice — Corp must choose a target.", [
      CR.trashing,
    ]);
  }

  if (next.pendingSabotage) {
    if (action.type === "resolve_sabotage") {
      return resolveSabotageIntent(next, action.hqCardIds);
    }
    return fail(
      "Pending sabotage — Corp must resolve_sabotage with HQ card ids.",
      [CR.sabotage, CR.sabotageResolution],
    );
  }

  if (next.pendingChoice) {
    if (action.type === "choose_option") {
      return chooseOption(next, action.optionId);
    }
    return fail(
      `Pending choice for ${next.pendingChoice.chooser} — resolve with choose_option.`,
      [CR.paidAbility],
    );
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
      noteCorpActionType(next, "basic_gain");
      for (const rid of [...next.runner.rig]) {
        const rigCard = next.cards[rid];
        if (!rigCard?.onCorpBasicClickForCreditOrDraw) continue;
        const r = evalEffect(
          { state: next, sourceId: rid },
          rigCard.onCorpBasicClickForCreditOrDraw,
        );
        if (!r.ok) {
          log(
            next,
            `onCorpBasicClickForCreditOrDraw failed on ${rigCard.title}: ${r.error}`,
          );
        }
        if (next.pendingChoice) break;
      }
      afterBasicAction(next);
      return ok(next);
    }

    case "basic_remove_tag": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      if (next.activeSide !== "runner") {
        return fail("Only the Runner may remove a tag with the basic action.", [
          CR.runnerBasicRemoveTag,
          CR.taggedRemoveTag,
        ]);
      }
      if (next.runner.tags <= 0) {
        return fail("Runner has no tags to remove.", [
          CR.runnerBasicRemoveTag,
          CR.taggedRemoveTag,
          CR.tagged,
        ]);
      }
      if (runnerCreditsFor(next, "basic_remove_tag") < 2) {
        return fail("Need 2¢ to remove a tag.", [
          CR.runnerBasicRemoveTag,
          CR.taggedRemoveTag,
          CR.costCheckpoint,
        ]);
      }
      const bad = spendClick(next);
      if (bad) return bad;
      withCostCheckpoint(next, "basic_remove_tag", () => {
        spendRunnerCreditsFor(next, 2, "basic_remove_tag");
        next.runner.tags -= 1;
      });
      log(
        next,
        `Runner removes 1 tag for {click}+2¢ → ${next.runner.tags} tag(s) (CR ${CR.runnerBasicRemoveTag.number}, ${CR.taggedRemoveTag.number}).`,
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
      if (next.activeSide === "runner" && next.turn.ccRunnerCannotDraw) {
        return fail("Runner cannot draw (Lockdown).", [CR.drawing]);
      }
      const cite =
        next.activeSide === "corp" ? CR.corpBasicDraw : CR.runnerBasicDraw;
      let drawAmount = 1;
      if (
        next.activeSide === "runner" &&
        next.turn.basicDrawsThisTurn === 0 &&
        next.runner.rig.some(
          (id) => next.cards[id].defId === "verbal-plasticity",
        )
      ) {
        drawAmount = 2;
        log(next, `Verbal Plasticity — first basic draw is 2.`);
      }
      let drewTotal = 0;
      for (let i = 0; i < drawAmount; i++) {
        const drew = drawOne(next, next.activeSide);
        if (!drew) {
          if (drewTotal === 0) {
            return fail("Deck is empty.", [cite, CR.drawing]);
          }
          break;
        }
        drewTotal += 1;
      }
      next.turn.basicDrawsThisTurn += 1;
      log(
        next,
        `${next.activeSide} draws ${drewTotal} (CR ${cite.number}, ${CR.drawing.number}).`,
      );
      if (next.activeSide === "runner") {
        fireRunnerValTrigger(
          next,
          "valBasicClickDrawTriggerCount",
          (c) => c.onFirstBasicClickDrawEachTurn,
          "onFirstBasicClickDrawEachTurn",
        );
      }
      if (next.activeSide === "corp") {
        noteCorpActionType(next, "basic_draw");
      }
      if (next.activeSide === "corp") {
        for (const rid of [...next.runner.rig]) {
          const rigCard = next.cards[rid];
          if (!rigCard?.onCorpBasicClickForCreditOrDraw) continue;
          const r = evalEffect(
            { state: next, sourceId: rid },
            rigCard.onCorpBasicClickForCreditOrDraw,
          );
          if (!r.ok) {
            log(
              next,
              `onCorpBasicClickForCreditOrDraw failed on ${rigCard.title}: ${r.error}`,
            );
          }
          if (next.pendingChoice) break;
        }
      }
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
      if (next.activeSide === "runner" && action.trashGripForDiscountCardId) {
        const pw = applyPatchworkDiscount(
          next,
          action.trashGripForDiscountCardId,
          action.cardId,
        );
        if (!pw.ok) return fail(pw.error, [CR.runnerBasicInstall]);
        next.turn.patchworkPendingDiscountThisAction = pw.discount;
      }
      const result =
        next.activeSide === "corp"
          ? installCorp(next, action.cardId, action.destination)
          : action.destination.kind === "rig" ||
              action.destination.kind === "host_ice" ||
              action.destination.kind === "host_card"
            ? installRunner(next, action.cardId, action.destination)
            : fail("Runner installs go to the rig or a legal host.", [
                CR.runnerBasicInstall,
              ]);
      next.turn.patchworkPendingDiscountThisAction = 0;
      if (!result.ok) return result;
      if (next.activeSide === "corp") {
        noteCorpActionType(result.state, "basic_install");
      }
      afterBasicAction(result.state);
      return result;
    }

    case "basic_trash_resource": {
      const gate = actionAllowedHere(next, action.type);
      if (!gate.ok) {
        return fail(
          "Basic actions are only legal at the take-action step.",
          gate.cites,
        );
      }
      if (next.activeSide !== "corp") {
        return fail("Only the Corp may trash a resource with the basic action.", [
          CR.corpBasicTrashResource,
        ]);
      }
      if (next.runner.tags <= 0) {
        return fail("Runner must be tagged to trash a resource.", [
          CR.corpBasicTrashResource,
          CR.tagged,
        ]);
      }
      const target = next.cards[action.cardId];
      if (
        !target ||
        target.type !== "resource" ||
        !next.runner.rig.includes(action.cardId)
      ) {
        return fail("Not an installed Runner resource.", [
          CR.corpBasicTrashResource,
        ]);
      }
      const corpPts = agendaPointsFor(next, "corp");
      const runnerPts = agendaPointsFor(next, "runner");
      const threat = Math.max(corpPts, runnerPts);
      const threatCost = target.threatBasicTrashAdditionalCostTrashHq;
      const connectionCost = runnerAbilityCarrierIds(next).some((cid) => {
        if (abilitiesSuppressed(next, cid)) return false;
        return (
          Boolean(next.cards[cid]?.connectionBasicTrashAdditionalCostTrashHq) &&
          (target.subtypes ?? []).includes("connection")
        );
      });
      if (typeof threatCost === "number" && threat >= threatCost) {
        if (next.corp.hand.length < 1) {
          return fail(
            "Threat additional cost: must trash 1 card from HQ.",
            [CR.corpBasicTrashResource, CR.trashing],
          );
        }
        const hqId = next.corp.hand[next.corp.hand.length - 1]!;
        const hqCard = next.cards[hqId]!;
        next.corp.hand.pop();
        next.corp.discard.push(hqId);
        hqCard.zone = "corp:archives";
        hqCard.faceup = true;
        noteCorpCardAddedToArchives(next);
        log(
          next,
          `Threat ${threatCost} — trash ${hqCard.title} from HQ as additional cost.`,
        );
      } else if (connectionCost) {
        if (next.corp.hand.length < 1) {
          return fail(
            "Sebastião: must trash 1 card from HQ to trash a connection.",
            [CR.corpBasicTrashResource, CR.trashing],
          );
        }
        const hqId = next.corp.hand[next.corp.hand.length - 1]!;
        const hqCard = next.cards[hqId]!;
        next.corp.hand.pop();
        next.corp.discard.push(hqId);
        hqCard.zone = "corp:archives";
        hqCard.faceup = true;
        noteCorpCardAddedToArchives(next);
        log(
          next,
          `Sebastião — trash ${hqCard.title} from HQ as additional cost.`,
        );
      }
      // Wireless Net Pavilion: additional credit cost to basic trash resource.
      {
        let extra = 0;
        for (const rid of next.runner.rig) {
          const c = next.cards[rid];
          if (typeof c?.basicTrashResourceAdditionalCostCredits === "number") {
            extra = Math.max(extra, c.basicTrashResourceAdditionalCostCredits);
          }
        }
        if (extra > 0) {
          if (next.corp.credits < extra) {
            return fail(
              `Wireless Net Pavilion — must pay ${extra}¢ additional cost.`,
              [CR.corpBasicTrashResource],
            );
          }
          next.corp.credits -= extra;
          log(
            next,
            `Wireless Net Pavilion — pay ${extra}¢ additional cost → ${next.corp.credits}¢.`,
          );
        }
      }
      const bad = spendClick(next);
      if (bad) return bad;
      moveRunnerCardToHeap(next, action.cardId);
      log(
        next,
        `Corp trashes ${target.title} with the basic action (CR ${CR.corpBasicTrashResource.number}).`,
      );
      noteCorpActionType(next, "basic_trash_resource");
      afterBasicAction(next);
      return ok(next);
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
      if (
        !isRunTargetAllowed(next, action.serverId)
      ) {
        return fail(
          "The first run each turn cannot be made against a remote server.",
          [CR.runnerBasicRun],
        );
      }
      const bad = spendClick(next);
      if (bad) return bad;
      if (!next.turn.runnerMadeRunThisTurn) {
        const extra = sumRunnerFirstRunAdditionalCost(next);
        if (extra > 0) {
          if (next.runner.credits < extra) {
            return fail(
              `First run this turn requires ${extra} additional credits (Enhanced Login Protocol).`,
              [CR.runnerBasicRun],
            );
          }
          next.runner.credits -= extra;
          log(
            next,
            `Runner pays ${extra}¢ additional cost for first run this turn.`,
          );
        }
      }
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
      return playEvent(
        next,
        action.cardId,
        action.serverId,
        action.trashGripForDiscountCardId,
      );

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

    case "break_bioroid_subroutines":
      return breakBioroidSubroutines(next, action.subIndexes);

    case "use_paid_ability":
      return usePaidAbility(
        next,
        action.cardId,
        action.abilityId,
        action.serverId,
      );

    case "rez_asset":
      return rezAsset(next, action.cardId);

    case "choose_trash_program":
      return fail("No pending trash-program choice.", [CR.trashing]);

    case "resolve_sabotage":
      return fail("No pending sabotage.", [CR.sabotage]);

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
      // Heliamphora: [interrupt] before Archives access resolves.
      if (
        next.run.attackedServerId === "archives" &&
        heliamphoraHostInsteadAvailable(next) &&
        !next.run.pendingHeliamphoraAccessCardId
      ) {
        const heliId = findHeliamphora(next)!;
        const title = next.cards[action.cardId]?.title ?? action.cardId;
        next.run.pendingHeliamphoraAccessCardId = action.cardId;
        next.pendingChoice = {
          sourceId: heliId,
          chooser: "runner",
          options: [
            {
              id: `heliamphora-host:${action.cardId}`,
              label: `Host ${title} faceup on Heliamphora instead`,
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
            {
              id: `heliamphora-access:${action.cardId}`,
              label: "Access normally",
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
          ],
        };
        log(
          next,
          `${next.cards[heliId]!.title} — may host ${title} instead of accessing.`,
        );
        return ok(next);
      }
      next.run.pendingHeliamphoraAccessCardId = undefined;
      next.run.accessCandidates.splice(idx, 1);
      next.run.accessedCardIds.push(action.cardId);
      next.run.accessingCardId = action.cardId;
      next.turn.accessedACardThisTurn = true;
      if (next.run.accessRemaining !== null) {
        next.run.accessRemaining = Math.max(0, next.run.accessRemaining - 1);
      }
      // Flagship: re-apply other-than-self access cap after each access.
      applyRunAccessRestrictions(next);
      const card = next.cards[action.cardId];
      const faceupInstalledAgenda =
        card.type === "agenda" &&
        card.faceup &&
        (card.zone ?? "").includes(":root");
      card.faceup = true;
      if (faceupInstalledAgenda) {
        const idCard = next.cards[next.corp.identityId];
        if (idCard?.onAccessFaceupInstalledAgenda) {
          const r = evalEffect(
            { state: next, sourceId: next.corp.identityId },
            idCard.onAccessFaceupInstalledAgenda,
          );
          if (!r.ok) {
            log(
              next,
              `onAccessFaceupInstalledAgenda failed on ${idCard.title}: ${r.error}`,
            );
          }
        }
      }
      if (
        card.mustRevealWhenAccessedFromRd &&
        next.run.attackedServerId === "rd"
      ) {
        log(
          next,
          `Revealed ${card.title} while accessing from R&D (CR ${CR.ambushText.number}).`,
        );
      }
      // Franchise City: agendas accessed from R&D must be revealed.
      if (
        card.type === "agenda" &&
        next.run.attackedServerId === "rd"
      ) {
        for (const server of Object.values(next.servers)) {
          for (const id of server.root) {
            const up = next.cards[id];
            if (up?.rezzed && up.mustRevealAgendasAccessedFromRd) {
              log(
                next,
                `${up.title} — reveal accessed agenda ${card.title} from R&D.`,
              );
            }
          }
        }
      }
      // Power to the People: first agenda access this turn → gain credits.
      if (
        card.type === "agenda" &&
        typeof next.turn.uotFirstAgendaAccessCredits === "number"
      ) {
        const gain = next.turn.uotFirstAgendaAccessCredits;
        next.turn.uotFirstAgendaAccessCredits = undefined;
        next.runner.credits += gain;
        log(
          next,
          `Power to the People — gain ${gain}¢ on first agenda access → ${next.runner.credits}¢.`,
        );
      }
      // Franchise City: when Runner accesses an agenda, add this to Corp score.
      if (card.type === "agenda") {
        for (const server of Object.values(next.servers)) {
          for (const id of [...server.root]) {
            const asset = next.cards[id];
            if (!asset?.rezzed || !asset.addSelfToCorpScoreOnAgendaAccess) {
              continue;
            }
            const pts = asset.addSelfToCorpScoreOnAgendaAccess.agendaPoints;
            const r = evalEffect(
              { state: next, sourceId: id },
              {
                op: "do",
                action: {
                  kind: "add_to_corp_score_as_agenda",
                  agendaPoints: pts,
                },
              },
            );
            if (!r.ok) {
              log(
                next,
                `${asset.title} addSelfToCorpScoreOnAgendaAccess failed: ${r.error}`,
              );
            }
          }
        }
      }
      log(
        next,
        `Accessed ${card.title} (CR ${CR.cardAccessed.number} / appendix ${CR.accessAppendix1.number}).`,
      );
      if (card.onAccess) {
        // Ambush exemption: Snare!/Behold! do not fire from Archives.
        if (
          next.run.attackedServerId === "archives" &&
          (card.skipOnAccessFromArchives || card.defId === "snare")
        ) {
          log(next, `${card.title} onAccess skipped — accessed from Archives.`);
        } else if (card.onAccessRequiresRezzed && !card.rezzed) {
          log(
            next,
            `${card.title} onAccess skipped — requires rezzed.`,
          );
        } else if (
          card.onAccessRequiresInstalled &&
          !card.zone.endsWith(":root")
        ) {
          log(
            next,
            `${card.title} onAccess skipped — requires installed.`,
          );
        } else if (abilitiesSuppressed(next, action.cardId)) {
          log(
            next,
            `${card.title} onAccess skipped — abilities blanked.`,
          );
        } else {
          const r = evalEffect(
            { state: next, sourceId: action.cardId },
            card.onAccess,
          );
          if (!r.ok) return fail(r.error, r.cites);
        }
      }
      if ((card.onAccessGiveTags ?? 0) > 0) {
        const n = card.onAccessGiveTags!;
        next.runner.tags += n;
        next.turn.tagsGivenThisTurn += n;
        log(
          next,
          `${card.title} — Runner takes ${n} tag(s) on access → ${next.runner.tags}.`,
        );
      }
      // Ganked!-class: onAccess may schedule a forced encounter immediately
      // (single rezzed ice, no pendingChoice). Divert before mid-access resume.
      if (
        next.run?.reencounterIceId &&
        next.run.resumeAccessAfterReencounter &&
        !next.pendingChoice
      ) {
        const iceId = next.run.reencounterIceId;
        const server = next.servers[next.run.attackedServerId];
        const pos = server?.ice.indexOf(iceId) ?? -1;
        if (pos >= 0) {
          next.run.position = pos;
          next.run.reencounterIceId = undefined;
          enterStep(next, "run.approachIce");
          autoWalk(next);
          const cont = advanceRunUntilStop(next);
          if (!cont.ok) return cont;
          finishRunReturnToAction(cont.state);
          return cont;
        }
        next.run.reencounterIceId = undefined;
        next.run.resumeAccessAfterReencounter = false;
      }
      // Nested access-a-card appendix 11.6_1 → 11.6_2 (…); park on pending.
      enterStep(next, "access.cardAccessed");
      if (
        next.pendingChoice ||
        next.pendingDamage ||
        next.pendingTrashProgram
      ) {
        return ok(next);
      }
      autoWalk(next);
      return advanceFromMidAccess(next);
    }

    case "steal_agenda": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that agenda.", [CR.stealingAgenda]);
      }
      if (next.timingKey !== "access.stealAgenda") {
        return fail("Steal only after mid-access (CR 7.2.3).", [
          CR.accessAgenda,
          CR.midAccessAgenda,
        ]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot steal Corp cards this run.", [CR.stealingAgenda]);
      }
      const agenda = next.cards[action.cardId];
      const whistleblowerIgnore =
        Boolean(next.run.whistleblowerNamedTitle) &&
        agenda?.title === next.run.whistleblowerNamedTitle;
      if (whistleblowerIgnore) {
        log(
          next,
          `Whistleblower — steal ${agenda.title} ignoring all costs.`,
        );
        next.run.whistleblowerNamedTitle = undefined;
        return completeStealAgenda(next, action);
      }
      const stealClicks = agenda?.stealAdditionalClicks ?? 0;
      if (stealClicks > 0) {
        if (next.runner.clicks < stealClicks) {
          return fail(
            `Must spend ${stealClicks} [click] to steal ${agenda.title}.`,
            [CR.stealingAgenda, CR.spendClicks],
          );
        }
        next.runner.clicks -= stealClicks;
        log(
          next,
          `Runner spends ${stealClicks} [click] to steal ${agenda.title} → ${next.runner.clicks} (CR ${CR.spendClicks.number}).`,
        );
      }
      const stealCredits = stealAdditionalCreditsForAgenda(
        next,
        action.cardId,
        next.run.attackedServerId,
      );
      if (stealCredits > 0) {
        if (next.runner.credits < stealCredits) {
          return fail(
            `Must pay ${stealCredits}¢ to steal ${agenda.title}.`,
            [CR.stealingAgenda],
          );
        }
        next.runner.credits -= stealCredits;
        log(
          next,
          `Runner pays ${stealCredits}¢ additional cost to steal ${agenda.title} → ${next.runner.credits}¢.`,
        );
      }
      const stealServerId = next.run.attackedServerId;
      if (next.pendingStealAgendaId === action.cardId) {
        next.pendingStealAgendaId = null;
      } else if (
        stealAdditionalCosts(next, stealServerId, action.cardId).length > 0
      ) {
        next.pendingStealAgendaId = action.cardId;
        const paid = payStealAdditionalCosts(
          next,
          action.cardId,
          stealServerId,
        );
        if (!paid.ok) {
          next.pendingStealAgendaId = null;
          return paid;
        }
        if (next.pendingChoice) {
          return ok(next);
        }
        next.pendingStealAgendaId = null;
      }
      return completeStealAgenda(next, action);
    }

    case "trash_accessed": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const card = next.cards[action.cardId];
      if (card.cannotBeTrashedByRunnerWhileRezzed && card.rezzed) {
        return fail(
          `Cannot trash rezzed ${card.title}.`,
          [CR.trashing],
        );
      }
      const wasRezzedForThreat = Boolean(card.rezzed);
      if (card.trashAdditionalCost) {
        if (next.pendingTrashAccessedCardId === action.cardId) {
          next.pendingTrashAccessedCardId = null;
        } else {
          next.pendingTrashAccessedCardId = action.cardId;
          const r = evalEffect(
            { state: next, sourceId: action.cardId },
            card.trashAdditionalCost,
          );
          if (!r.ok) {
            next.pendingTrashAccessedCardId = null;
            return fail(r.error, r.cites);
          }
          if (next.pendingChoice) return ok(next);
          next.pendingTrashAccessedCardId = null;
        }
      }
      const cost = runnerTrashCostForCard(next, action.cardId);
      const purpose =
        card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
      if (runnerCreditsFor(next, purpose) < cost) {
        return fail("Insufficient credits to trash.", [CR.trashing]);
      }
      spendRunnerCreditsFor(next, cost, purpose);
      // Marilyn: may shuffle into R&D instead of Archives.
      const serverId = next.run.attackedServerId;
      const server = next.servers[serverId];
      server.root = server.root.filter((id) => id !== action.cardId);
      next.corp.hand = next.corp.hand.filter((id) => id !== action.cardId);
      next.corp.deck = next.corp.deck.filter((id) => id !== action.cardId);
      if (card.mayShuffleIntoRdWhenTrashed) {
        next.corp.deck.push(action.cardId);
        card.zone = "corp:rd";
        card.faceup = false;
        card.rezzed = false;
        card.hostedCredits = undefined;
        log(
          next,
          `Runner trashes accessed ${card.title} for ${cost}¢ — shuffled into R&D instead.`,
        );
      } else {
        next.corp.discard.push(action.cardId);
        card.zone = "corp:archives";
        card.faceup = true;
        log(
          next,
          `Runner trashes accessed ${card.title} for ${cost}¢ (CR ${CR.trashing.number}).`,
        );
      }
      next.run.accessingCardId = null;
      fireCorpOnTrash(next, action.cardId);
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, cost);
      // Public Access Plaza: Threat N → tag when Runner trashes while rezzed.
      const threatTrash = card.threatGiveTagsOnRezzedTrash;
      if (threatTrash && wasRezzedForThreat) {
        const threatPts = Math.max(
          agendaPointsFor(next, "corp"),
          agendaPointsFor(next, "runner"),
        );
        if (threatPts >= threatTrash.level) {
          next.runner.tags += threatTrash.tags;
          log(
            next,
            `${card.title} — Threat ${threatTrash.level}: give Runner ${threatTrash.tags} tag(s) → ${next.runner.tags}.`,
          );
        }
      }
      // René: first access-trash each turn → gain ¢ + draw
      const idCard = next.cards[next.runner.identityId];
      const gain = idCard?.onAccessTrashGain;
      if (gain && !(gain.oncePerTurn && next.turn.reneAccessTrashUsed)) {
        next.runner.credits += gain.credits;
        let drew = 0;
        for (let i = 0; i < gain.draw; i++) {
          if (drawOne(next, "runner")) drew += 1;
        }
        next.turn.reneAccessTrashUsed = true;
        log(
          next,
          `René “Loup” Arcemont — gain ${gain.credits}¢ and draw ${drew}.`,
        );
      }
      return completeAccessAndContinue(next);
    }

    case "access_trash_from_grip": {
      if (!next.run?.accessingCardId) {
        return fail("Not mid-access.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const sid = next.run.attackedServerId;
      if (sid !== "hq" && sid !== "rd") {
        return fail("Carnivore only on HQ/R&D access.", [CR.trashing]);
      }
      if (!carnivoreAvailable(next)) {
        return fail("Carnivore not available.", [CR.trashing]);
      }
      const carnIds: string[] = [...next.runner.rig];
      if (next.run.runSourceId) carnIds.push(next.run.runSourceId);
      const carn = carnIds
        .map((id) => next.cards[id])
        .find((c) => {
          const spec = c?.accessTrashFromGrip;
          if (!spec) return false;
          if (spec.oncePerTurn && next.turn.carnivoreAccessTrashUsed) return false;
          return next.runner.hand.length >= spec.gripCards;
        });
      const n = carn!.accessTrashFromGrip!.gripCards;
      for (let i = 0; i < n; i++) {
        const gid = next.runner.hand.pop();
        if (!gid) {
          return fail("Not enough cards in grip.", [CR.trashing]);
        }
        next.runner.discard.push(gid);
        next.cards[gid].zone = "runner:heap";
        next.cards[gid].faceup = true;
      }
      const accessedId = next.run.accessingCardId;
      const card = next.cards[accessedId];
      const server = next.servers[sid];
      server.root = server.root.filter((id) => id !== accessedId);
      next.corp.hand = next.corp.hand.filter((id) => id !== accessedId);
      next.corp.deck = next.corp.deck.filter((id) => id !== accessedId);
      next.corp.discard.push(accessedId);
      card.zone = "corp:archives";
      card.faceup = true;
      next.run.accessingCardId = null;
      if (carn!.accessTrashFromGrip!.oncePerTurn) {
        next.turn.carnivoreAccessTrashUsed = true;
      }
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, card.trashCost ?? 0);
      log(
        next,
        `Carnivore — trash ${n} from grip to trash accessed ${card.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_with_virus": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const imp = next.runner.rig
        .map((id) => next.cards[id])
        .find(
          (c) =>
            c.accessTrashWithVirus &&
            (c.virusCounters ?? 0) >= 1 &&
            !wasAbilityUsed(next, c.id, "imp-access-trash"),
        );
      if (!imp) {
        return fail("No Imp virus trash available.", [CR.trashing]);
      }
      imp.virusCounters = (imp.virusCounters ?? 0) - 1;
      markAbilityUsed(next, imp.id, "imp-access-trash");
      const accessedId = action.cardId;
      const card = next.cards[accessedId];
      const server = next.servers[next.run.attackedServerId];
      server.root = server.root.filter((id) => id !== accessedId);
      next.corp.hand = next.corp.hand.filter((id) => id !== accessedId);
      next.corp.deck = next.corp.deck.filter((id) => id !== accessedId);
      next.corp.discard.push(accessedId);
      card.zone = "corp:archives";
      card.faceup = true;
      next.run.accessingCardId = null;
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, card.trashCost ?? 0);
      log(
        next,
        `Imp — spend virus counter to trash accessed ${card.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_free": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      if (!next.run.accessTrashFree) {
        return fail("No free access trash available this run.", [CR.trashing]);
      }
      const accessedId = action.cardId;
      const card = next.cards[accessedId];
      const server = next.servers[next.run.attackedServerId];
      server.root = server.root.filter((id) => id !== accessedId);
      next.corp.hand = next.corp.hand.filter((id) => id !== accessedId);
      next.corp.deck = next.corp.deck.filter((id) => id !== accessedId);
      next.corp.discard.push(accessedId);
      card.zone = "corp:archives";
      card.faceup = true;
      next.run.accessingCardId = null;
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, 0);
      log(
        next,
        `Demolition Run — trash accessed ${card.title} for 0¢.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_paying_printed_cost_from_stealth": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const lamp = next.cards[action.lampadesId];
      if (
        !lamp?.accessTrashPayingPrintedCostFromStealth ||
        !next.runner.rig.includes(action.lampadesId) ||
        (lamp.powerCounters ?? 0) < 1
      ) {
        return fail("Lampades trash not available.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      const printed = accessed?.rezCost ?? accessed?.playCost ?? 0;
      const stealthCost = {
        credits: printed,
        creditsFromStealthOnly: true as const,
      };
      if (!canPayCost(next, "runner", stealthCost, lamp)) {
        return fail("Insufficient stealth credits for printed cost.", [
          CR.trashing,
        ]);
      }
      lamp.powerCounters = (lamp.powerCounters ?? 0) - 1;
      payCost(next, "runner", stealthCost, "lampades-access-trash", lamp);
      const accessedId = action.cardId;
      const server = next.servers[next.run.attackedServerId];
      server.root = server.root.filter((id) => id !== accessedId);
      next.corp.hand = next.corp.hand.filter((id) => id !== accessedId);
      next.corp.deck = next.corp.deck.filter((id) => id !== accessedId);
      next.corp.discard.push(accessedId);
      accessed.zone = "corp:archives";
      accessed.faceup = true;
      next.run.accessingCardId = null;
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, accessed.trashCost ?? 0);
      log(
        next,
        `${lamp.title} — spend power + ${printed}¢ from stealth to trash accessed ${accessed.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_trash_self_non_agenda_draw": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      if (next.run.cannotStealOrTrash) {
        return fail("Cannot trash Corp cards this run.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      if (!accessed || accessed.type === "agenda" || accessed.side !== "corp") {
        return fail("Can only trash a non-agenda Corp card.", [CR.trashing]);
      }
      const gourmand = next.cards[action.gourmandId];
      if (
        !gourmand?.accessTrashSelfNonAgendaThenDraw ||
        !next.runner.rig.includes(action.gourmandId)
      ) {
        return fail("Gourmand trash not available.", [CR.trashing]);
      }
      moveRunnerCardToHeap(next, action.gourmandId);
      const accessedId = action.cardId;
      const server = next.servers[next.run.attackedServerId];
      server.root = server.root.filter((id) => id !== accessedId);
      next.corp.hand = next.corp.hand.filter((id) => id !== accessedId);
      next.corp.deck = next.corp.deck.filter((id) => id !== accessedId);
      next.corp.discard.push(accessedId);
      accessed.zone = "corp:archives";
      accessed.faceup = true;
      next.run.accessingCardId = null;
      noteFirstCorpCardTrashEachTurn(next);
      noteAccessTrash(next, accessed.trashCost ?? 0);
      const drew = drawOne(next, "runner") ? 1 : 0;
      log(
        next,
        `${gourmand.title} — trash self to trash accessed ${accessed.title}; draw ${drew}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_host_non_agenda_faceup": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      if (!accessed || accessed.type === "agenda" || accessed.side !== "corp") {
        return fail("Can only host a non-agenda Corp card.", [CR.trashing]);
      }
      const hostId = findCupellationHost(next);
      if (!hostId) {
        return fail("Cupellation host not available.", [CR.trashing]);
      }
      const host = next.cards[hostId]!;
      const cost = host.accessHostNonAgendaFaceup!.creditCost;
      if (next.runner.credits < cost) {
        return fail("Insufficient credits to host.", [CR.trashing]);
      }
      next.runner.credits -= cost;
      hostCorpCardFaceupOn(next, hostId, action.cardId);
      next.run.accessingCardId = null;
      log(
        next,
        `${host.title} — pay ${cost}¢ to host accessed ${accessed.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "access_host_agenda_on_film_critic": {
      if (!next.run || next.run.accessingCardId !== action.cardId) {
        return fail("Not accessing that card.", [CR.trashing]);
      }
      const accessed = next.cards[action.cardId];
      if (!accessed || accessed.type !== "agenda") {
        return fail("Can only host an agenda.", [CR.trashing]);
      }
      const host = next.cards[action.hostId];
      if (!host?.mayHostAccessedAgenda || !next.runner.rig.includes(action.hostId)) {
        return fail("Film Critic host not available.", [CR.trashing]);
      }
      const cap = host.hostAgendaCapacity ?? 1;
      const hostedAgendas = (host.hostedCardIds ?? []).filter(
        (hid) => next.cards[hid]?.type === "agenda",
      ).length;
      if (hostedAgendas >= cap) {
        return fail("Film Critic already hosts an agenda.", [CR.trashing]);
      }
      hostCorpCardFaceupOn(next, action.hostId, action.cardId);
      next.run.accessingCardId = null;
      log(
        next,
        `${host.title} — host accessed agenda ${accessed.title}.`,
      );
      return completeAccessAndContinue(next);
    }

    case "finish_access": {
      if (!next.run?.accessingCardId) {
        return fail("Not mid-access.", [CR.breach, CR.midAccessAbility]);
      }
      // Pass mid-access (11.6_2) → agenda steal step (11.6_3) or complete.
      if (next.timingKey === "access.stealAgenda") {
        // Declining steal when additional costs block / Runner declines.
        return completeAccessAndContinue(next);
      }
      return enterStealAgendaOrComplete(next);
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

    case "psi_runner_bid":
    case "psi_corp_bid":
      return fail("No psi game in progress.", [CR.trace]);

    case "prevent_damage":
    case "prevent_damage_lose_all_clicks":
    case "accept_damage":
      return fail("No pending damage.", [CR.preventDamage]);

    case "accept_expose":
      if (!next.pendingExpose) {
        return fail("No pending expose.", [CR.expose]);
      }
      acceptPendingExpose(next);
      return ok(next);
    case "accept_installed_trash":
      if (!next.pendingTrashPrevent) {
        return fail("No pending installed trash.", [CR.trashing]);
      }
      acceptPendingInstalledTrash(next, moveRunnerCardToHeap);
      return ok(next);
    case "accept_tags":
      return fail("No pending tags.", [CR.tags]);

    case "accept_end_the_run":
      return fail("No pending end the run.", [CR.endTheRun]);

    case "discard_to_hand_size":
      return discardPhase(next);

    case "choose_option":
      return fail("No pending choice.", [CR.paidAbility]);

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
