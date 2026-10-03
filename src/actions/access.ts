/**
 * Breach access, mid-access choices, and stealing an agenda.
 */
import { log } from "../state/createGame.js";
import { evalEffect } from "../effects/eval.js";
import { canPayCost, runnerCreditsFor } from "../state/costs.js";
import { dealDamage } from "../state/damage.js";
import { runnerTrashCostForCard } from "../cards/stubs.js";
import {
  noteAccessTrash,
  noteFirstCorpCardTrashEachTurn,
} from "../state/trashHooks.js";
import { removeCardFromCurrentZone, stealAgenda } from "../state/scoring.js";
import { stealAdditionalCreditsFromActiveLockdowns } from "../state/lockdowns.js";
import { wasAbilityUsed } from "../state/turn.js";
import { autoWalk, enterStep } from "../timing/machine.js";
import type { ApplyResult, GameState, RuleCite, ServerId } from "../state/types.js";
import type { Effect } from "../effects/ir.js";
import { CR } from "../timing/labels.js";
import { fireScoreOrStealSideEffects } from "./score.js";
import { advanceRunUntilStop, finishRunReturnToAction } from "./run.js";
import { applyAction } from "./apply.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

export function carnivoreAvailable(state: GameState): boolean {
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

export function findCupellationHost(state: GameState): string | null {
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
export function heliamphoraHostInsteadAvailable(state: GameState): boolean {
  if (!state.run || state.run.attackedServerId !== "archives") return false;
  if (state.run.heliamphoraHostInsteadUsedThisBreach) return false;
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    if (!card?.onWouldAccessArchivesHostInstead) continue;
    return true;
  }
  return false;
}

export function findHeliamphora(state: GameState): string | null {
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
  if (
    !state.turn.siSalsetteSlumsUsedThisTurn &&
    card.trashCost !== undefined &&
    !state.run!.cannotStealOrTrash
  ) {
    for (const rid of state.runner.rig) {
      if (state.cards[rid]?.accessPayTrashCostRemoveFromGameOncePerTurn) {
        const purpose =
          card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
        if (
          runnerCreditsFor(state, purpose) >=
          runnerTrashCostForCard(state, id)
        ) {
          return true;
        }
      }
    }
  }
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
export function completeAccessAndContinue(state: GameState): ApplyResult {
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
export function advanceFromMidAccess(state: GameState): ApplyResult {
  if (
    state.pendingChoice ||
    state.pendingDamage ||
    state.pendingTrashProgram ||
    state.pendingSabotage
  ) {
    return ok(state);
  }
  // Mumbad Virtual Tour: when accessed while installed, must trash if able.
  const accessingId = state.run?.accessingCardId;
  if (accessingId && state.timingKey === "access.midAccess") {
    const accessed = state.cards[accessingId];
    if (
      accessed?.mustTrashWhenAccessedWhileInstalled &&
      accessed.trashCost !== undefined &&
      !state.run!.cannotStealOrTrash
    ) {
      const purpose =
        accessed.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
      const cost = runnerTrashCostForCard(state, accessingId);
      if (runnerCreditsFor(state, purpose) >= cost) {
        return applyAction(state, {
          type: "trash_accessed",
          cardId: accessingId,
        });
      }
    }
    // By Any Means: remainder of turn — access not in Archives → trash + 1 meat.
    if (
      state.turn.ssByAnyMeansActive &&
      state.run!.attackedServerId !== "archives" &&
      !state.run!.cannotStealOrTrash &&
      accessed
    ) {
      const serverId = state.run!.attackedServerId;
      const server = state.servers[serverId];
      if (server) {
        server.root = server.root.filter((id) => id !== accessingId);
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== accessingId);
      state.corp.deck = state.corp.deck.filter((id) => id !== accessingId);
      // Also strip from ice arrays if accessing ice (rare for access).
      if (server) {
        server.ice = server.ice.filter((id) => id !== accessingId);
      }
      state.corp.discard.push(accessingId);
      accessed.zone = "corp:archives";
      accessed.faceup = true;
      state.run!.accessingCardId = null;
      if (state.run) state.run.breachStoleOrTrashed = true;
      noteFirstCorpCardTrashEachTurn(state);
      noteAccessTrash(state, 0);
      log(
        state,
        `By Any Means — trash accessed ${accessed.title} (not Archives).`,
      );
      dealDamage(state, "meat", 1, "by-any-means");
      if (state.pendingChoice || state.pendingDamage || state.done) {
        return ok(state);
      }
      return completeAccessAndContinue(state);
    }
  }
  if (state.timingKey === "access.midAccess" && hasInteractiveMidAccess(state)) {
    return ok(state);
  }
  return enterStealAgendaOrComplete(state);
}

/** Enter 11.6_3; park for steal when still accessing an agenda, else complete. */
export function enterStealAgendaOrComplete(state: GameState): ApplyResult {
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
export function hostCorpCardFaceupOn(
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


export function stealAdditionalCosts(
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

export function stealAdditionalCreditsForAgenda(
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

export function payStealAdditionalCosts(
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

export function completeStealAgenda(
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
  // Freedom Through Equality-class: runner currents' onStealAgenda.
  for (const card of Object.values(state.cards)) {
    if (card.zone !== "runner:play-area" || !card.onStealAgenda) continue;
    const r = evalEffect({ state, sourceId: card.id }, card.onStealAgenda);
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
