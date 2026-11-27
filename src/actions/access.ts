/**
 * Breach access, mid-access choices, and stealing an agenda.
 */
import { log } from "../state/setupAndEnd/createGame.js";
import { abilitiesSuppressed } from "../state/continuous/abilities.js";
import { evalEffect } from "../effects/eval.js";
import {
  canPayCost,
  runnerCreditsFor,
} from "../state/keywordsAndCredits/costs.js";
import { dealDamage } from "../state/damageAndPrevention/damage.js";
import { runnerTrashCostForCard } from "../cards/stubs.js";
import {
  fireAfterAgendaStolenHooks,
  fireOnSteal,
} from "../state/triggers/cardLifecycleHooks.js";
import { noteAccessTrash } from "../state/hostingAndTrash/trashHooks.js";
import { runnerCannotTrashWhileRezzed } from "../state/cardFlags/cardDeclarations.js";
import { removeCardFromCurrentZone, stealAgenda } from "../state/scoring.js";
import { stealAdditionalCreditsFromActiveLockdowns } from "../state/continuous/lockdowns.js";
import { programBannedThisRun, wasAbilityUsed } from "../state/turn.js";
import { autoWalk, enterStep } from "../timing/machine.js";
import type {
  ApplyResult,
  GameState,
  RuleCite,
  ServerId,
} from "../state/types.js";
import type { Effect } from "../effects/ir.js";
import { CR } from "../timing/labels.js";
import { fireScoreOrStealSideEffects } from "./score.js";
import { advanceRunUntilStop, finishRunReturnToAction } from "./run.js";
import { applyActionCore } from "./apply.js";
import { openPendingChoose } from "../state/triggers/pendingChoice.js";
import { hostCard } from "../state/hostingAndTrash/host.js";
import { trashCard } from "../state/hostingAndTrash/trash.js";

function fail(error: string, cites: RuleCite[]): ApplyResult {
  return { ok: false, error, cites };
}

function ok(state: GameState): ApplyResult {
  return { ok: true, state };
}

export function carnivoreAvailable(state: GameState): boolean {
  const ids: string[] = [...state.runner.installed];
  if (state.run?.runSourceId) ids.push(state.run.runSourceId);
  for (const id of ids) {
    if (abilitiesSuppressed(state, id)) continue;
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
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
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
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
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
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onWouldAccessArchivesHostInstead) continue;
    return true;
  }
  return false;
}

export function findHeliamphora(state: GameState): string | null {
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    if (state.cards[id]?.onWouldAccessArchivesHostInstead) return id;
  }
  return null;
}

/** Mid-access abilities other than pass (`finish_access`) — CR 11.6_2 / 7.2.2. */
/**
 * The Runner cannot steal or trash this accessed card: Forbid-style "cannot
 * steal or trash Corp cards this run", or Pinhole Threading's "if that card
 * is an agenda, you cannot steal or trash it during this access" (CR 1.2.1).
 */
export function stealOrTrashBlocked(
  state: GameState,
  cardId: string | null | undefined,
): boolean {
  const run = state.run;
  if (!run) return false;
  if (run.cannotStealOrTrash) return true;
  return Boolean(
    run.cannotStealOrTrashAgendas &&
    cardId &&
    state.cards[cardId]?.type === "agenda",
  );
}

/**
 * The Future Perfect: "the Runner cannot steal this agenda during this
 * access" after differing bids. Lakshmi Smartfabrics: "The Runner cannot
 * steal copies of that agenda for the remainder of this turn": a copy is
 * any card with that title (CR 10.1.5). Steal legality, the steal itself and the steal step
 * all read this (CR 1.2.2: "cannot" takes precedence).
 */
export function stealForbiddenThisAccess(
  state: GameState,
  cardId: string | null | undefined,
): boolean {
  if (!cardId) return false;
  if (state.run?.stealForbiddenAccessCardId === cardId) return true;
  const defId = state.cards[cardId]?.defId;
  return Boolean(
    defId && state.turn.bfCannotStealAgendaDefIds?.includes(defId),
  );
}

/**
 * Why the Runner cannot use the basic trash ability on this accessed card
 * (CR 7.1.5), or null when they can, credits aside. The access candidates,
 * apply's `trash_accessed`, and the forced-trash checks all ask this.
 */
export function basicTrashRefusal(
  state: GameState,
  cardId: string,
): { reason: string; cites: RuleCite[] } | null {
  const card = state.cards[cardId];
  if (!card) return { reason: "No such card.", cites: [CR.trashing] };
  if (stealOrTrashBlocked(state, cardId)) {
    return {
      reason: "Cannot trash Corp cards this run.",
      cites: [CR.trashing],
    };
  }
  // CR 7.1.5a: a card with no trash cost cannot be trashed this way.
  if (card.trashCost === undefined) {
    return {
      reason: `${card.title} has no trash cost.`,
      cites: [CR.noTrashCost],
    };
  }
  // CR 7.1.5b: nor can a card in the Corp's discard pile. A card installed
  // in the root of Archives is not in the discard pile.
  if (card.zone === "corp:archives") {
    return {
      reason: `${card.title} is in Archives and cannot be trashed.`,
      cites: [CR.trashInArchives],
    };
  }
  if (runnerCannotTrashWhileRezzed(state, cardId)) {
    return {
      reason: `Cannot trash rezzed ${card.title}.`,
      cites: [CR.trashing],
    };
  }
  return null;
}

function hasInteractiveMidAccess(state: GameState): boolean {
  const id = state.run?.accessingCardId;
  if (!id) return false;
  const card = state.cards[id];
  if (!card) return false;
  if (!basicTrashRefusal(state, id)) {
    const purpose =
      card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
    if (runnerCreditsFor(state, purpose) >= runnerTrashCostForCard(state, id)) {
      return true;
    }
  }
  if (carnivoreAvailable(state)) return true;
  if (cupellationHostAvailable(state)) return true;
  if (state.run!.accessTrashFree && !stealOrTrashBlocked(state, id))
    return true;
  if (
    !state.turn.siSalsetteSlumsUsedThisTurn &&
    card.trashCost !== undefined &&
    !stealOrTrashBlocked(state, id)
  ) {
    for (const rid of state.runner.installed) {
      if (abilitiesSuppressed(state, rid)) continue;
      if (state.cards[rid]?.accessPayTrashCostRemoveFromGameOncePerTurn) {
        const purpose =
          card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
        if (
          runnerCreditsFor(state, purpose) >= runnerTrashCostForCard(state, id)
        ) {
          return true;
        }
      }
    }
  }
  if (!stealOrTrashBlocked(state, id)) {
    for (const rid of state.runner.installed) {
      if (abilitiesSuppressed(state, rid)) continue;
      const c = state.cards[rid];
      if (
        c?.accessTrashWithVirus &&
        (c.virusCounters ?? 0) >= 1 &&
        !wasAbilityUsed(state, rid, "imp-access-trash") &&
        !programBannedThisRun(state, rid)
      ) {
        return true;
      }
      if (
        c?.accessTrashPayingPrintedCostFromStealth &&
        (c.powerCounters ?? 0) >= 1
      ) {
        const printed = printedRezOrPlayCost(card);
        if (
          printed !== null &&
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

/**
 * Lampades: "pay the printed rez or play cost of the card you are
 * accessing". A card with neither (an agenda) has no such cost, and a cost
 * that does not exist cannot be paid (CR 1.16.1, 2.3.3, 2.3.5).
 */
export function printedRezOrPlayCost(card: {
  rezCost?: number;
  playCost?: number;
}): number | null {
  if (typeof card.rezCost === "number") return card.rezCost;
  if (typeof card.playCost === "number") return card.playCost;
  return null;
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
      !abilitiesSuppressed(state, accessingId) &&
      !basicTrashRefusal(state, accessingId)
    ) {
      const purpose =
        accessed.type === "asset"
          ? ("trash_asset" as const)
          : ("trash" as const);
      const cost = runnerTrashCostForCard(state, accessingId);
      const canPay = runnerCreditsFor(state, purpose) >= cost;
      const impId = state.runner.installed.find((rid) => {
        if (abilitiesSuppressed(state, rid)) return false;
        const c = state.cards[rid];
        return (
          c?.accessTrashWithVirus &&
          (c.virusCounters ?? 0) >= 1 &&
          !wasAbilityUsed(state, rid, "imp-access-trash") &&
          !programBannedThisRun(state, rid)
        );
      });
      if (canPay && impId) {
        log(
          state,
          `${accessed.title} — choose how to trash it (CR ${CR.mustAnyMeans.number}).`,
        );
        openPendingChoose(state, {
          sourceId: accessingId,
          chooser: "runner",
          options: [
            {
              id: "must-trash:pay",
              label: `Pay ${cost}¢ to trash ${accessed.title}`,
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
            {
              id: "must-trash:imp",
              label: `Spend a virus counter on ${state.cards[impId]!.title}`,
              effect: {
                op: "do",
                action: { kind: "gain_credits", side: "runner", amount: 0 },
              },
            },
          ],
        });
        return ok(state);
      }
      if (canPay) {
        return applyActionCore(state, {
          type: "trash_accessed",
          cardId: accessingId,
        });
      }
      if (impId) {
        log(
          state,
          `${accessed.title} — trash with ${state.cards[impId]!.title} (CR ${CR.mustAnyMeans.number}).`,
        );
        return applyActionCore(state, {
          type: "access_trash_with_virus",
          cardId: accessingId,
        });
      }
      for (const rid of state.runner.installed) {
        if (abilitiesSuppressed(state, rid)) continue;
        const c = state.cards[rid];
        if (
          c?.accessTrashWithVirus &&
          (c.virusCounters ?? 0) >= 1 &&
          !wasAbilityUsed(state, rid, "imp-access-trash") &&
          programBannedThisRun(state, rid)
        ) {
          log(
            state,
            `${c.title}'s ability stays optional (CR ${CR.forcedMidAccessOptional.number}).`,
          );
        }
      }
    }
    // Edward Kim: "Trash the first operation you access each turn at no
    // cost." The identity's ability trashes it, not the basic trash of
    // CR 7.1.5 (an operation has no trash cost), and it is mandatory. The
    // first operation accessed uses it up wherever it is, even one in
    // Archives, which cannot be trashed (CR 1.2.1, 7.1.5b).
    const kimId = state.runner.identityId;
    if (
      accessed?.type === "operation" &&
      !state.turn.firstAccessedOperationTrashedFreeThisTurn &&
      state.cards[kimId]?.firstAccessedOperationTrashFreeEachTurn &&
      !abilitiesSuppressed(state, kimId)
    ) {
      state.turn.firstAccessedOperationTrashedFreeThisTurn = true;
      if (
        accessed.zone !== "corp:archives" &&
        !stealOrTrashBlocked(state, accessingId)
      ) {
        trashCard(state, accessingId, { by: "runner", cause: "access" });
        state.run!.accessingCardId = null;
        if (state.run) state.run.breachStoleOrTrashed = true;
        noteAccessTrash(state, 0);
        log(
          state,
          `${state.cards[kimId]!.title} — trash ${accessed.title}, the first operation accessed this turn, at no cost.`,
        );
        if (state.pendingChoice || state.pendingDamage || state.done) {
          return ok(state);
        }
        return completeAccessAndContinue(state);
      }
    }
    // Neutralize All Threats: the first access each turn of a card with a
    // trash cost uses it up wherever the card is; only the trash is "if
    // able" (CR 7.1.5d), and a card in Archives cannot be trashed (7.1.5b).
    const natApplies =
      accessed?.trashCost !== undefined &&
      !state.turn.neutralizeAllThreatsCheckedThisTurn &&
      state.runner.installed.some(
        (id) =>
          !abilitiesSuppressed(state, id) &&
          state.cards[id]?.mustTrashFirstAccessedCardWithTrashCostEachTurn,
      );
    if (natApplies && accessed) {
      state.turn.neutralizeAllThreatsCheckedThisTurn = true;
      const refusal = basicTrashRefusal(state, accessingId);
      const purpose =
        accessed.type === "asset"
          ? ("trash_asset" as const)
          : ("trash" as const);
      const cost = runnerTrashCostForCard(state, accessingId);
      if (!refusal && runnerCreditsFor(state, purpose) >= cost) {
        return applyActionCore(state, {
          type: "trash_accessed",
          cardId: accessingId,
        });
      }
      log(
        state,
        refusal
          ? `${refusal.reason} Neutralize All Threats does not force it (CR ${CR.mustSpecifiedMeans.number}).`
          : `Cannot pay ${accessed.title}'s trash cost — another ability is not required (CR ${CR.mustSpecifiedMeans.number}).`,
      );
    }
    // By Any Means: remainder of turn — access not in Archives → trash + 1 meat.
    if (
      state.turn.ssByAnyMeansActive &&
      state.run!.attackedServerId !== "archives" &&
      !stealOrTrashBlocked(state, accessingId) &&
      accessed
    ) {
      // The Runner's event trashes the accessed card (CR 1.14.5, 7.1.5).
      trashCard(state, accessingId, { by: "runner", cause: "access" });
      state.run!.accessingCardId = null;
      if (state.run) state.run.breachStoleOrTrashed = true;
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
  if (
    state.timingKey === "access.midAccess" &&
    hasInteractiveMidAccess(state)
  ) {
    return ok(state);
  }
  return enterStealAgendaOrComplete(state);
}

/** Enter 11.6_3; park for steal when still accessing an agenda, else complete. */
export function enterStealAgendaOrComplete(state: GameState): ApplyResult {
  enterStep(state, "access.stealAgenda");
  const id = state.run?.accessingCardId;
  if (id && state.cards[id]?.type === "agenda") {
    if (stealOrTrashBlocked(state, id) || stealForbiddenThisAccess(state, id)) {
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
  hostCard(state, card.id, hostId, { installed: true });
  card.zone = `hosted:${hostId}`;
  card.faceup = true;
  card.rezzed = false;
  log(state, `${host.title} hosts ${card.title} faceup (not installed).`);
}

/** True when `cardId` is in the root of a server other than `attackedServerId`. */

function effectDealsNetOrMeat(effect: Effect): boolean {
  const seen = new Set<object>();
  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== "object") return false;
    if (seen.has(node)) return false;
    seen.add(node);
    if (Array.isArray(node)) return node.some(walk);
    const kind = (node as { kind?: string }).kind;
    if (kind === "net_damage" || kind === "meat_damage") return true;
    return Object.values(node as Record<string, unknown>).some(walk);
  };
  return walk(effect);
}

/** Guru Davinder prevents the net or meat the steal cost would suffer (CR 1.16.1b). */
export function stealNetOrMeatPrevented(
  state: GameState,
  agendaId: string,
  serverId: string,
): boolean {
  const costs = stealAdditionalCosts(state, serverId, agendaId);
  if (!costs.some(effectDealsNetOrMeat)) return false;
  return state.runner.installed.some((id) => {
    const card = state.cards[id];
    return typeof card?.autoPreventNetOrMeatDamagePayOrTrash === "number";
  });
}

export function stealAdditionalCosts(
  state: GameState,
  serverId: string,
  agendaId?: string,
): Effect[] {
  const out: Effect[] = [];
  if (agendaId && !abilitiesSuppressed(state, agendaId)) {
    const agendaCost = state.cards[agendaId]?.stealAdditionalCost;
    if (agendaCost) out.push(agendaCost);
  }
  const server = state.servers[serverId as ServerId];
  if (!server) return out;
  for (const id of server.root) {
    if (abilitiesSuppressed(state, id)) continue;
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
      if (abilitiesSuppressed(state, id)) continue;
      const c = state.cards[id];
      if (!c?.rezzed) continue;
      total += c.stealAdditionalCreditsWhileRezzed ?? 0;
    }
  }
  for (const c of Object.values(state.cards)) {
    if (c.zone !== "corp:play-area") continue;
    if (abilitiesSuppressed(state, c.id)) continue;
    total += c.stealAdditionalCreditsWhileRezzed ?? 0;
  }
  // The Source-class: Runner installed cards reuse this field while installed.
  for (const id of state.runner.installed) {
    if (abilitiesSuppressed(state, id)) continue;
    total += state.cards[id]?.stealAdditionalCreditsWhileRezzed ?? 0;
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
    if (abilitiesSuppressed(state, id)) continue;
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
  for (const id of state.corp.scoreArea) {
    if (abilitiesSuppressed(state, id)) continue;
    const per =
      state.cards[id]?.whileScoredStealAdditionalCreditsPerAdvancement;
    if (typeof per === "number" && per > 0) {
      scoredFragment += per * (agenda?.advancementCounters ?? 0);
    }
  }
  const selfSteal =
    agenda && !abilitiesSuppressed(state, agendaId)
      ? (agenda.stealAdditionalCredits ?? 0)
      : 0;
  return (
    selfSteal +
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
  fireOnSteal(state, action.cardId);
  fireAfterAgendaStolenHooks(state, action.cardId);
  if (state.pendingChoice) return ok(state);
  return completeAccessAndContinue(state);
}
