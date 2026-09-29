import type { Action, GameState, Server, ServerId } from "../state/types.js";
import {
  continuousIceRezCostIncrease,
  iceShareServer,
  rezCostDiscountPerRezzedSubtype,
  rezCostDiscountPerOtherUnrezzedIce,
  rezCostDiscountIfAgendaScoredOrStolenThisTurn,
  currentWindow,
  effectiveBreakerStrength,
  effectiveIceStrength,
  effectiveIceSubtypes,
  iceBlocksAiBreak,
  isAiBreaker,
  runnerTrashCostForCard,
} from "../cards/stubs.js";
import { abilityCost, canPayCost, runnerCreditsFor, runnerAvailableCredits, effectiveEventPlayCost, effectiveOperationExtraClicks } from "../state/costs.js";
import { corpCreditsForTrace } from "../state/trace.js";
import { agendaPointsFor, canScoreAgenda } from "../state/scoring.js";
import { isRunTargetAllowed } from "../state/runLegality.js";
import { additionalRunInitiateTax } from "../state/runInitiateTax.js";
import {
  isServerAllowedForSpec,
  serversMatchingSpec,
} from "../state/runStart.js";
import { trashInstalledLegalTargets } from "../effects/eval.js";
import {
  memoryLimit,
  usedMemory,
  wasAbilityUsed,
  wasAbilityUsedThisEncounter,
  wasAbilityUsedThisRun,
} from "../state/turn.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { runnerAbilityCarrierIds } from "../state/fenris.js";
import { effectiveRunnerTags, runnerIsTagged } from "../state/tags.js";
import {
  cannotBreakExceptIcebreakerActive,
  cardHasIcebreakerSubtype,
  hasActiveLockdown,
  stealAdditionalCreditsFromActiveLockdowns,
} from "../state/lockdowns.js";
import { getStep } from "../timing/machine.js";
import { isForbidden } from "./checkpoints.js";

/**
 * Turn-scoped "cannot score" from Luminal / Mitosis / Clot-class effects.
 * Must match apply.ts score_agenda guards so legality never offers a
 * silent-illegal score (CR 1.2.2 fail-closed for cannot).
 */
function scoreAgendaBlockedByCannot(
  state: GameState,
  cardId: string,
): boolean {
  if (state.turn.cannotScoreAgendas) return true;
  if (state.turn.cannotScoreOrRezCardIds.includes(cardId)) return true;
  if (state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(cardId)) {
    return true;
  }
  if (state.turn.installedThisTurn.includes(cardId)) {
    if (state.cards[cardId]?.cannotScoreIfInstalledThisTurn) return true;
    for (const id of state.runner.rig) {
      if (state.cards[id]?.forbidScoreAgendaInstalledThisTurn) return true;
    }
  }
  return false;
}

function breakCostFor(state: GameState, breakerId: string): number {
  const br = state.cards[breakerId].breaker!;
  let cost = br.breakCredits;
  if (
    br.breakCreditsDiscountIfSuccessfulRunThisTurn &&
    state.turn.successfulRunThisTurn
  ) {
    cost = Math.max(
      0,
      cost - br.breakCreditsDiscountIfSuccessfulRunThisTurn,
    );
  }
  if (br.breakCreditsDiscountPerInstalledSubtype) {
    const { subtype, amount } = br.breakCreditsDiscountPerInstalledSubtype;
    const n = state.runner.rig.filter((id) =>
      (state.cards[id].subtypes ?? []).includes(subtype),
    ).length;
    cost = Math.max(0, cost - amount * n);
  }
  return cost;
}

function playRestrictionOk(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (typeof card.playRequiresCreditsLt === "number") {
    const credits =
      card.side === "corp" ? state.corp.credits : state.runner.credits;
    if (credits >= card.playRequiresCreditsLt) return false;
  }
  if (card.playRequiresTagged && !runnerIsTagged(state)) return false;
  if (
    card.playRequiresInstalledResource &&
    !state.runner.rig.some((id) => state.cards[id]?.type === "resource")
  ) {
    return false;
  }
  if (
    card.playRequiresInstalledProgram &&
    !state.runner.rig.some((id) => state.cards[id]?.type === "program")
  ) {
    return false;
  }
  if (
    card.playRequiresInstalledProgramOrHardware &&
    !state.runner.rig.some((id) => {
      const t = state.cards[id]?.type;
      return t === "program" || t === "hardware";
    })
  ) {
    return false;
  }
  if (card.playRequiresUntagged && runnerIsTagged(state)) return false;
  if (
    typeof card.playRequiresMinTags === "number" &&
    effectiveRunnerTags(state) < card.playRequiresMinTags
  ) {
    return false;
  }
  if (
    card.playRequiresSuccessfulRunLastTurn &&
    !state.turn.successfulRunLastTurn
  ) {
    return false;
  }
  if (
    card.playRequiresRunnerAccessedCardLastTurn &&
    !state.turn.accessedACardLastTurn
  ) {
    return false;
  }
  if (
    card.playRequiresRunnerMadeRunLastTurn &&
    !state.turn.runnerMadeRunLastTurn
  ) {
    return false;
  }
  if (
    typeof card.playRequiresRunnerAgendaPointsGte === "number" &&
    agendaPointsFor(state, "runner") < card.playRequiresRunnerAgendaPointsGte
  ) {
    return false;
  }
  if (
    card.playRequiresNoSuccessfulHqRunLastTurn &&
    state.turn.successfulHqRunLastTurn
  ) {
    return false;
  }
  if (typeof card.playRequiresThreat === "number") {
    const threatPts = Math.max(
      agendaPointsFor(state, "corp"),
      agendaPointsFor(state, "runner"),
    );
    if (threatPts < card.playRequiresThreat) return false;
  }
  if (
    card.playRequiresAgendaStolenLastTurn &&
    (state.turn.agendaPointsStolenLastTurn ?? 0) <= 0
  ) {
    return false;
  }
  if (
    card.playRequiresRunnerStoleOrTrashedCorpCardLastTurn &&
    !state.turn.runnerStoleOrTrashedCorpCardLastTurn
  ) {
    return false;
  }
  if (
    card.playRequiresRunnerTrashedCorpCardLastTurn &&
    !state.turn.runnerTrashedCorpCardLastTurn
  ) {
    return false;
  }
  if (card.playRequiresCorpHasInstalledCard) {
    let hasInstalled = false;
    for (const server of Object.values(state.servers)) {
      if (server.root.length > 0 || server.ice.length > 0) {
        hasInstalled = true;
        break;
      }
    }
    if (!hasInstalled) return false;
  }
  if (
    card.playRequiresAgendaStolenThisTurn &&
    (state.turn.agendaPointsStolenThisTurn ?? 0) <= 0
  ) {
    return false;
  }
  if (
    card.playRequiresSuccessfulRunThisTurn &&
    !state.turn.successfulRunThisTurn
  ) {
    return false;
  }
  if (
    card.playRequiresSuccessfulHqRunThisTurn &&
    !state.turn.successfulHqRunThisTurn
  ) {
    return false;
  }
  if (
    card.playRequiresSuccessfulAllCentralsThisTurn &&
    !(
      state.turn.successfulHqRunThisTurn &&
      state.turn.successfulRdRunThisTurn &&
      state.turn.successfulArchivesRunThisTurn
    )
  ) {
    return false;
  }
  if (card.playRequiresScoredAgendaNotInstalledThisTurn) {
    const scored = state.turn.scoredCardIdsThisTurn ?? [];
    const installed = state.turn.installedThisTurn ?? [];
    if (!scored.some((id) => !installed.includes(id))) return false;
  }
  if (
    card.playRequiresNoCorpActionFinished &&
    (state.turn.corpActionsCompletedThisTurn ?? 0) > 0
  ) {
    return false;
  }
  if (
    card.playRequiresFirstClick &&
    (state.turn.runnerClicksSpentThisTurn ?? 0) > 0
  ) {
    return false;
  }
  if (
    typeof card.playRequiresOtherGripCardsGte === "number" &&
    state.runner.hand.filter((id) => id !== cardId).length <
      card.playRequiresOtherGripCardsGte
  ) {
    return false;
  }
  if (
    (card.playRequiresNoActiveLockdown ||
      (card.subtypes ?? []).includes("lockdown")) &&
    hasActiveLockdown(state)
  ) {
    return false;
  }
  return true;
}

function listServers(state: GameState): Server[] {
  return Object.values(state.servers);
}

function approachedIceId(state: GameState): string | null {
  const run = state.run;
  if (!run || run.position === null) return null;
  return state.servers[run.attackedServerId].ice[run.position] ?? null;
}

/**
 * Enumerate candidate actions for the current timing node
 * (before cannot-filtering is applied by queryLegality).
 */
export function collectCandidateActions(state: GameState): Action[] {
  if (state.done) return [];

  const actions: Action[] = [];

  if (state.psi) {
    const psi = state.psi;
    if (psi.runnerBid === null) {
      for (let b = 0; b <= psi.maxBid; b++) {
        actions.push({ type: "psi_runner_bid", amount: b });
      }
    } else if (psi.corpBid === null) {
      for (let b = 0; b <= psi.maxBid; b++) {
        actions.push({ type: "psi_corp_bid", amount: b });
      }
    }
    return actions;
  }

  if (state.trace) {
    actions.push({ type: "boost_trace", credits: 0 });
    const corpTraceCredits = corpCreditsForTrace(state);
    if (corpTraceCredits > 0) {
      for (let c = 1; c <= Math.min(corpTraceCredits, 5); c++) {
        actions.push({ type: "boost_trace", credits: c });
      }
    }
    // Runner spends credits to raise link strength (CR 10.8.3 / 10.8.6d).
    actions.push({ type: "spend_link", amount: 0 });
    if (state.runner.credits > 0) {
      for (let c = 1; c <= Math.min(state.runner.credits, 5); c++) {
        actions.push({ type: "spend_link", amount: c });
      }
    }
    actions.push({ type: "resolve_trace" });
    // Flip Switch-class: trash to set base trace strength to 0.
    for (const id of state.runner.rig) {
      const card = state.cards[id];
      if (abilitiesSuppressed(state, id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("trace_interrupt_paw")) continue;
        if (ab.requireDuringRun && !state.run) continue;
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "runner", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    return actions;
  }

  if (state.pendingTags) {
    actions.push({ type: "accept_tags" });
    for (const id of state.runner.rig) {
      const card = state.cards[id];
      if (abilitiesSuppressed(state, id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("tag_interrupt_paw")) continue;
        if (ab.requireDuringRun && !state.run) continue;
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "runner", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    return actions;
  }

  if (state.pendingEndTheRun) {
    actions.push({ type: "accept_end_the_run" });
    for (const id of state.runner.rig) {
      const card = state.cards[id];
      if (abilitiesSuppressed(state, id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("end_the_run_interrupt_paw")) continue;
        if (
          ab.requiresSuccessfulHqRunThisTurn &&
          !state.turn.successfulHqRunThisTurn
        ) {
          continue;
        }
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "runner", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    return actions;
  }

  if (state.pendingDamage) {
    actions.push({ type: "accept_damage" });
    if (state.pendingDamage.preventByLoseAllClicks) {
      if (state.runner.clicks > 0) {
        actions.push({ type: "prevent_damage_lose_all_clicks" });
      }
      return actions;
    }
    if (!state.pendingDamage.interruptPawOnly) {
      for (let a = 1; a <= state.pendingDamage.remaining; a++) {
        actions.push({ type: "prevent_damage", amount: a });
      }
    }
    // Interrupt PAW applies to net/meat/core (brain alias) prevent abilities.
    const pendingType = state.pendingDamage.type;
    const used =
      state.pendingDamage.interruptUsedSourceIds ?? [];
    for (const id of state.runner.rig) {
      const card = state.cards[id];
      if (abilitiesSuppressed(state, id)) continue;
      if (used.includes(id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("damage_interrupt_paw")) continue;
        if (ab.requireDuringRun && !state.run) continue;
        if (
          ab.requirePendingDamageTypes &&
          !ab.requirePendingDamageTypes.includes(pendingType)
        ) {
          continue;
        }
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "runner", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    // Corp rezzed sources (Prāna Condenser) during damage interrupt.
    const corpInterruptIds: string[] = [state.corp.identityId];
    for (const server of Object.values(state.servers)) {
      for (const id of [...server.root, ...server.ice]) {
        if (state.cards[id]?.rezzed) corpInterruptIds.push(id);
      }
    }
    for (const id of corpInterruptIds) {
      const card = state.cards[id];
      if (!card || abilitiesSuppressed(state, id)) continue;
      if (used.includes(id)) continue;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("damage_interrupt_paw")) continue;
        if (ab.requireDuringRun && !state.run) continue;
        if (
          ab.requirePendingDamageTypes &&
          !ab.requirePendingDamageTypes.includes(pendingType)
        ) {
          continue;
        }
        const cost = abilityCost(ab, state, card);
        if (!canPayCost(state, "corp", cost, card)) continue;
        actions.push({
          type: "use_paid_ability",
          cardId: id,
          abilityId: ab.id,
        });
      }
    }
    return actions;
  }

  if (state.pendingTrashProgram) {
    for (const id of state.pendingTrashProgram.candidates) {
      actions.push({ type: "choose_trash_program", cardId: id });
    }
    return actions;
  }

  if (state.pendingSabotage) {
    const amount = state.pendingSabotage.amount;
    const hq = [...state.corp.hand];
    const rdLen = state.corp.deck.length;
    const total = hq.length + rdLen;
    if (total === 0 || total < amount) {
      // Only legal resolution is trash-all (empty HQ pick).
      actions.push({ type: "resolve_sabotage", hqCardIds: [] });
      return actions;
    }
    // Enumerate valid HQ subset sizes; for each size, offer one deterministic
    // pick (end of hand). Hosts that need full combinatorial choice can send
    // any legal hqCardIds via applyIntent.
    const minFromHq = Math.max(0, amount - rdLen);
    const maxFromHq = Math.min(amount, hq.length);
    for (let n = minFromHq; n <= maxFromHq; n++) {
      const hqCardIds = n === 0 ? [] : hq.slice(hq.length - n);
      actions.push({ type: "resolve_sabotage", hqCardIds });
    }
    return actions;
  }

  if (state.pendingChoice) {
    for (const opt of state.pendingChoice.options) {
      actions.push({ type: "choose_option", optionId: opt.id });
    }
    return actions;
  }

  // Nested access-a-card (appendix 11.6): mid-access vs steal steps.
  if (state.run?.accessingCardId) {
    const id = state.run.accessingCardId;
    const card = state.cards[id];
    const accessKey = state.timingKey;

    // 11.6_3 — steal agenda (mandatory when able); decline only when steal blocked.
    if (accessKey === "access.stealAgenda") {
      if (card.type === "agenda") {
        let stealLegal = false;
        if (!state.run.cannotStealOrTrash) {
          const stealClicks = card.stealAdditionalClicks ?? 0;
          let stealCredits = card.stealAdditionalCredits ?? 0;
          for (const server of Object.values(state.servers)) {
            for (const sid of [...server.root, ...server.ice]) {
              const c = state.cards[sid];
              if (!c?.rezzed) continue;
              stealCredits += c.stealAdditionalCreditsWhileRezzed ?? 0;
            }
          }
          const attacked = state.run?.attackedServerId;
          if (attacked) {
            const root = state.servers[attacked]?.root ?? [];
            for (const sid of root) {
              const c = state.cards[sid];
              if (!c) continue;
              if (!c.rezzed && !c.persistent) continue;
              stealCredits += c.stealAdditionalCreditsFromProtectingServer ?? 0;
            }
          }
          stealCredits += stealAdditionalCreditsFromActiveLockdowns(state, id);
          if (
            (stealClicks === 0 || state.runner.clicks >= stealClicks) &&
            (stealCredits === 0 || state.runner.credits >= stealCredits)
          ) {
            actions.push({ type: "steal_agenda", cardId: id });
            stealLegal = true;
          }
        }
        if (!stealLegal) {
          actions.push({ type: "finish_access" });
        }
      } else {
        actions.push({ type: "finish_access" });
      }
      return actions;
    }

    // 11.6_2 (and parked 11.6_1 with accessingCardId): mid-access abilities only.
    if (
      accessKey === "access.midAccess" ||
      accessKey === "access.cardAccessed"
    ) {
      if (
        card.trashCost !== undefined &&
        !state.run.cannotStealOrTrash &&
        !(card.cannotBeTrashedByRunnerWhileRezzed && card.rezzed)
      ) {
        const purpose =
          card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
        if (
          runnerCreditsFor(state, purpose) >=
          runnerTrashCostForCard(state, id)
        ) {
          actions.push({ type: "trash_accessed", cardId: id });
        }
      }
      actions.push({ type: "finish_access" });
      const sid = state.run.attackedServerId;
      if (sid === "hq" || sid === "rd") {
        const ids: string[] = [...state.runner.rig];
        if (state.run.runSourceId) ids.push(state.run.runSourceId);
        for (const rid of ids) {
          const spec = state.cards[rid]?.accessTrashFromGrip;
          if (!spec) continue;
          if (spec.oncePerTurn && state.turn.carnivoreAccessTrashUsed) continue;
          if (state.runner.hand.length >= spec.gripCards) {
            actions.push({ type: "access_trash_from_grip" });
            break;
          }
        }
      }
      if (!state.run.cannotStealOrTrash) {
        for (const rid of state.runner.rig) {
          const c = state.cards[rid];
          if (
            c.accessTrashWithVirus &&
            (c.virusCounters ?? 0) >= 1 &&
            !wasAbilityUsed(state, rid, "imp-access-trash")
          ) {
            actions.push({
              type: "access_trash_with_virus",
              cardId: id,
            });
            break;
          }
        }
      }
      if (!state.run.cannotStealOrTrash) {
        for (const rid of state.runner.rig) {
          const c = state.cards[rid];
          if (
            !c?.accessTrashPayingPrintedCostFromStealth ||
            (c.powerCounters ?? 0) < 1
          ) {
            continue;
          }
          const accessed = state.cards[id];
          const printed = accessed?.rezCost ?? accessed?.playCost ?? 0;
          if (
            canPayCost(
              state,
              "runner",
              { credits: printed, creditsFromStealthOnly: true },
              c,
            )
          ) {
            actions.push({
              type: "access_trash_paying_printed_cost_from_stealth",
              cardId: id,
              lampadesId: rid,
            });
            break;
          }
        }
      }
      if (
        !state.run.cannotStealOrTrash &&
        card.type !== "agenda" &&
        card.side === "corp"
      ) {
        for (const rid of state.runner.rig) {
          const c = state.cards[rid];
          if (c?.accessTrashSelfNonAgendaThenDraw) {
            actions.push({
              type: "access_trash_self_non_agenda_draw",
              cardId: id,
              gourmandId: rid,
            });
            break;
          }
        }
      }
      if (card.type !== "agenda" && card.side === "corp") {
        for (const rid of state.runner.rig) {
          const c = state.cards[rid];
          const spec = c?.accessHostNonAgendaFaceup;
          if (!spec) continue;
          const max = c.maxHostedCards ?? Infinity;
          const have = c.hostedCardIds?.length ?? 0;
          if (have >= max) continue;
          if (state.runner.credits < spec.creditCost) continue;
          actions.push({
            type: "access_host_non_agenda_faceup",
            cardId: id,
          });
          break;
        }
      }
      return actions;
    }
  }

  const step = getStep(state);
  const paw = currentWindow(state.timingKey);

  if (step.kind === "pass") {
    actions.push({ type: "pass_window" });
  }

  if (step.key === "run.approachPaw") {
    const iceId = approachedIceId(state);
    if (iceId) {
      const ice = state.cards[iceId];
      let increase =
        (state.run?.iceRezCostIncrease ?? 0) +
        continuousIceRezCostIncrease(state, iceId);
      if (state.turn.iceRezzedThisTurn === 0) {
        for (const carrierId of runnerAbilityCarrierIds(state)) {
          if (abilitiesSuppressed(state, carrierId)) continue;
          increase +=
            state.cards[carrierId]?.firstIceRezCostIncrease ?? 0;
        }
      }
      const discount =
        rezCostDiscountPerRezzedSubtype(state, iceId) +
        rezCostDiscountPerOtherUnrezzedIce(state, iceId);
      const cost = Math.max(
        0,
        (ice.rezCost ?? 0) +
          increase -
          (state.turn.pendingBioroidRezDiscount ?? 0) -
          discount,
      );
      if (
        ice.rezAdditionalCostForfeitAgenda &&
        !state.corp.score.some((id) => !state.cards[id]?.cannotForfeit)
      ) {
        // cannot rez without an agenda to forfeit
      } else if (
        ice.rezAdditionalCostDerezSubtype &&
        !Object.values(state.servers).some((srv) =>
          srv.ice.some((id) => {
            if (id === iceId) return false;
            const c = state.cards[id];
            return (
              !!c?.rezzed &&
              (c.subtypes ?? []).includes(ice.rezAdditionalCostDerezSubtype!)
            );
          }),
        )
      ) {
        // cannot rez without another rezzed ice of the required subtype
      } else if (
        !ice.rezzed &&
        !state.turn.cannotScoreOrRezCardIds.includes(iceId) &&
        !state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(iceId)
      ) {
        const agendaDisc = ice.rezCostCreditDiscountOnForfeitAgenda ?? 0;
        const discountedCost = Math.max(0, cost - agendaDisc);
        const canPay =
          state.corp.credits >= cost ||
          (agendaDisc > 0 &&
            state.corp.score.length > 0 &&
            state.corp.credits >= discountedCost);
        if (canPay) {
          actions.push({ type: "rez_ice", cardId: iceId });
        }
      }
    }
  }

  const abilityWindowOpen = (
    ab: import("../state/types.js").PaidAbility,
  ): boolean => {
    if (paw && ab.windows.includes(paw)) return true;
    if (
      ab.windows.includes("when_encountered_interrupt_paw") &&
      state.timingKey === "run.encounterPaw" &&
      state.run?.encounter?.onEncounterPending
    ) {
      return true;
    }
    return false;
  };

  if (paw) {
    const consider = (cardId: string) => {
      const card = state.cards[cardId];
      if (abilitiesSuppressed(state, cardId)) return;
      for (const ab of card.paidAbilities ?? []) {
        if (!abilityWindowOpen(ab)) continue;
        if (ab.requireDuringRun && !state.run) continue;
        if (ab.oncePerTurn && wasAbilityUsed(state, cardId, ab.id)) continue;
        if (
          card.paidAbilitiesOncePerTurn &&
          (card.paidAbilities ?? []).some((other) =>
            wasAbilityUsed(state, cardId, other.id),
          )
        ) {
          continue;
        }
        if (ab.oncePerRun && wasAbilityUsedThisRun(state, cardId, ab.id)) {
          continue;
        }
        if (
          ab.oncePerEncounter &&
          wasAbilityUsedThisEncounter(state, cardId, ab.id)
        ) {
          continue;
        }
        if (
          cannotBreakExceptIcebreakerActive(state) &&
          !cardHasIcebreakerSubtype(card) &&
          JSON.stringify(ab.effect).includes("break_encounter_subroutine")
        ) {
          continue;
        }
        if (
          ab.requiresAdvancements !== undefined &&
          (card.advancementTokens ?? 0) < ab.requiresAdvancements
        ) {
          continue;
        }
        if (ab.requiresThreat !== undefined) {
          const threatPts = Math.max(
            agendaPointsFor(state, "corp"),
            agendaPointsFor(state, "runner"),
          );
          if (threatPts < ab.requiresThreat) continue;
        }
        if (
          typeof ab.requiresCorpCreditsGte === "number" &&
          state.corp.credits < ab.requiresCorpCreditsGte
        ) {
          continue;
        }
        if (
          ab.requiresSuccessfulRdRunThisTurn &&
          !state.turn.successfulRdRunThisTurn
        ) {
          continue;
        }
        if (
          ab.requiresSuccessfulAllCentralsThisTurn &&
          !(
            state.turn.successfulHqRunThisTurn &&
            state.turn.successfulRdRunThisTurn &&
            state.turn.successfulArchivesRunThisTurn
          )
        ) {
          continue;
        }
        if (ab.requiresUntagged && runnerIsTagged(state)) continue;
        if (ab.requireEncounterSubtype) {
          const enc = state.run?.encounter;
          if (!enc) continue;
          if (
            !effectiveIceSubtypes(state, enc.iceId).includes(
              ab.requireEncounterSubtype,
            )
          ) {
            continue;
          }
        }
        if (ab.requireEncounterChosenIce) {
          const enc = state.run?.encounter;
          if (!enc) continue;
          if (!card.chosenIceId || enc.iceId !== card.chosenIceId) continue;
        }
        if (ab.forbidEncounterSubtype) {
          const enc = state.run?.encounter;
          if (!enc) continue;
          if (
            effectiveIceSubtypes(state, enc.iceId).includes(
              ab.forbidEncounterSubtype,
            )
          ) {
            continue;
          }
        }
        if (ab.requireEncounterHost) {
          const enc = state.run?.encounter;
          if (!enc || card.hostId !== enc.iceId) continue;
        }
        if (typeof ab.requireEncounterStrengthLte === "number") {
          const enc = state.run?.encounter;
          if (!enc) continue;
          if (
            effectiveIceStrength(state, enc.iceId) >
            ab.requireEncounterStrengthLte
          ) {
            continue;
          }
        }
        if (ab.requireAttackingMark) {
          const mark = state.markServerId;
          if (!mark || state.run?.attackedServerId !== mark) continue;
        }
        if (ab.requireBrokenSubThisEncounter) {
          const enc = state.run?.encounter;
          if (!enc || !enc.broken.some((b) => b)) continue;
        }
        if (ab.requireInstalledThisTurn) {
          if (!(state.turn.installedThisTurn ?? []).includes(cardId)) continue;
        }
        if (typeof ab.requireInstalledVirtualResourcesGte === "number") {
          const n = state.runner.rig.filter((id) => {
            const c = state.cards[id];
            return (
              c?.type === "resource" &&
              (c.subtypes ?? []).includes("virtual")
            );
          }).length;
          if (n < ab.requireInstalledVirtualResourcesGte) continue;
        }
        if (ab.requireProtectingHostServer) {
          const enc = state.run?.encounter;
          const hostId = card.hostId;
          if (!enc || !hostId) continue;
          if (!iceShareServer(state, hostId, enc.iceId)) continue;
        }
        if (ab.requireOtherServer) {
          const sid = state.run?.attackedServerId;
          if (!sid || !card.rezzed) continue;
          let onOther = false;
          for (const [otherId, server] of Object.entries(state.servers)) {
            if (otherId === sid) continue;
            if (server.root.includes(cardId)) {
              onOther = true;
              break;
            }
          }
          if (!onOther) continue;
        }
        if (ab.requireRunnerTagged && !runnerIsTagged(state)) continue;
        const cost = abilityCost(ab, state, card);
        const payer: "corp" | "runner" = ab.usableByAnyPlayer
          ? state.activeSide
          : card.side;
        if (!canPayCost(state, payer, cost, card)) continue;
        if (card.side === "runner" && !state.runner.rig.includes(cardId)) {
          // Runner identity and the active run event source are allowed.
          if (
            cardId !== state.runner.identityId &&
            cardId !== state.run?.runSourceId
          ) {
            continue;
          }
        }
        if (card.side === "corp" && state.corp.hand.includes(cardId)) {
          if (!ab.usableFromHq || paw !== "corp_action_paw") continue;
        }
        if (card.side === "corp" && state.corp.discard.includes(cardId)) {
          if (!ab.usableFromArchives || paw !== "corp_action_paw") continue;
        }
        if (card.side === "corp" && state.corp.discard.includes(cardId)) {
          if (!ab.usableFromArchives || paw !== "corp_action_paw") continue;
        }
        if (card.side === "corp" && state.runner.score.includes(cardId)) {
          if (!ab.usableFromRunnerScoreArea || paw !== "corp_action_paw") {
            continue;
          }
        }
        if (card.side === "corp" && paw === "approach_paw") {
          // Scored agendas (Nisei MK II) are legal in approach PAW — not ice.
          if (state.corp.score.includes(cardId)) {
            // fall through to cost / push
          } else if (ab.requireOtherServer) {
            // B-1001-class: already validated above; skip ice-only gate.
          } else if (ab.requireDuringRun && state.run) {
            // Event Horizon-class: any rezzed ice protecting attacked server.
            const sid = state.run.attackedServerId;
            if (!card.rezzed || !state.servers[sid]?.ice.includes(cardId)) {
              continue;
            }
          } else {
            const approached = approachedIceId(state);
            if (approached !== cardId || !card.rezzed) {
              continue;
            }
          }
        }
        if (card.side === "corp" && paw === "approach_server_paw") {
          // Scored agendas also legal at approach-server PAW.
          if (state.corp.score.includes(cardId)) {
            // fall through
          } else if (ab.requireOtherServer) {
            // Validated above.
          } else if (ab.requireDuringRun && state.run?.attackedServerId) {
            const sid = state.run.attackedServerId;
            if (!card.rezzed || !state.servers[sid]?.ice.includes(cardId)) {
              continue;
            }
          } else if (
            ab.formicaryApproachAnyServer &&
            !card.rezzed &&
            card.type === "ice"
          ) {
            // Formicary: ability only while unrezzed ("you may rez").
          } else if (
            !state.run?.attackedServerId ||
            !state.servers[state.run.attackedServerId].root.includes(cardId) ||
            !card.rezzed
          ) {
            continue;
          }
        }
        if (ab.startsRun) {
          for (const sid of serversMatchingSpec(state, ab.startsRun)) {
            if (!isServerAllowedForSpec(state, ab.startsRun, sid)) continue;
            const tax = additionalRunInitiateTax(state, sid);
            const clicksNeeded = (cost.clicks ?? 0) + tax.clicks;
            if (
              (tax.clicks > 0 && state.runner.clicks < clicksNeeded) ||
              (tax.credits > 0 && runnerAvailableCredits(state) < tax.credits)
            )
              continue;
            actions.push({
              type: "use_paid_ability",
              cardId,
              abilityId: ab.id,
              serverId: sid,
            });
          }
          continue;
        }
        actions.push({
          type: "use_paid_ability",
          cardId,
          abilityId: ab.id,
        });
      }
    };
    if (
      paw === "encounter_paw" ||
      paw === "runner_action_paw" ||
      (state.run &&
        (paw === "approach_paw" || paw === "approach_server_paw"))
    ) {
      for (const id of state.runner.rig) consider(id);
      if (state.run?.runSourceId) consider(state.run.runSourceId);
      const idCard = state.cards[state.runner.identityId];
      if (idCard) consider(idCard.id);
    }
    // B-1001-class: rezzed root cards on other servers during run PAWs.
    if (
      state.run &&
      (paw === "approach_paw" ||
        paw === "approach_server_paw" ||
        paw === "encounter_paw")
    ) {
      const attacked = state.run.attackedServerId;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === attacked) continue;
        for (const id of server.root) {
          const card = state.cards[id];
          if (
            card?.rezzed &&
            card.paidAbilities?.some((a) => a.requireOtherServer)
          ) {
            consider(id);
          }
        }
      }
    }
    // Ice with requireDuringRun paid abilities (Event Horizon): available
    // during run PAWs while protecting the attacked server.
    if (
      state.run &&
      (paw === "approach_paw" ||
        paw === "encounter_paw" ||
        paw === "approach_server_paw")
    ) {
      const attacked = state.run.attackedServerId;
      const server = state.servers[attacked];
      if (server) {
        for (const id of server.ice) {
          const card = state.cards[id];
          if (
            card?.rezzed &&
            card.paidAbilities?.some((a) => a.requireDuringRun)
          ) {
            consider(id);
          }
        }
      }
    }
    // Formicary-class: unrezzed ice on ANY server with formicaryApproachAnyServer
    // at approach-server PAW.
    if (state.run && paw === "approach_server_paw") {
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const card = state.cards[id];
          if (
            card &&
            !card.rezzed &&
            card.type === "ice" &&
            card.paidAbilities?.some((a) => a.formicaryApproachAnyServer)
          ) {
            consider(id);
          }
        }
      }
    }
    if (
      paw === "approach_paw" ||
      paw === "approach_server_paw" ||
      paw === "corp_action_paw"
    ) {
      if (paw === "approach_paw") {
        const iceId = approachedIceId(state);
        if (iceId) consider(iceId);
      }
      if (paw === "approach_server_paw" || paw === "corp_action_paw") {
        const servers =
          paw === "approach_server_paw" && state.run
            ? [state.servers[state.run.attackedServerId]]
            : listServers(state);
        for (const server of servers) {
          for (const id of server.root) {
            const card = state.cards[id];
            if (
              (card.type === "asset" || card.type === "upgrade") &&
              !card.rezzed
            ) {
              const cost = Math.max(
                0,
                (card.rezCost ?? 0) -
                  rezCostDiscountIfAgendaScoredOrStolenThisTurn(state, id),
              );
              const canForfeit =
                !card.rezAdditionalCostForfeitAgenda ||
                state.corp.score.some((sid) => !state.cards[sid]?.cannotForfeit);
              if (
                state.corp.credits >= cost &&
                canForfeit &&
                !state.turn.cannotScoreOrRezCardIds.includes(id) &&
                !state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(id) &&
                (!card.rezOnlyDuringCorpTurn ||
                  state.activeSide === "corp")
              ) {
                actions.push({ type: "rez_asset", cardId: id });
              }
            }
            if (card.rezzed) consider(id);
          }
          // Rime: rez ice as non-ice during runs against this server.
          if (state.run && server.id === state.run.attackedServerId) {
            for (const id of server.ice) {
              const ice = state.cards[id];
              if (
                !ice ||
                ice.rezzed ||
                !ice.rezAsNonIceDuringRunsOnServer ||
                state.turn.cannotScoreOrRezCardIds.includes(id) ||
                state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(id)
              ) {
                continue;
              }
              const cost = Math.max(0, ice.rezCost ?? 0);
              if (state.corp.credits >= cost) {
                actions.push({ type: "rez_ice", cardId: id });
              }
            }
          }
          // Rezzed ice paid abilities (ezaM swap) during Corp action PAW.
          if (paw === "corp_action_paw") {
            for (const id of server.ice) {
              if (state.cards[id]?.rezzed) consider(id);
            }
          }
        }
      }
      // Scored agendas (Nisei, House of Knives, Vitruvius, Atlas).
      if (
        paw === "corp_action_paw" ||
        paw === "approach_paw" ||
        paw === "approach_server_paw" ||
        paw === "encounter_paw"
      ) {
        for (const id of state.corp.score) consider(id);
      }
      // Expendable / HQ paid abilities (Tree Line).
      if (paw === "corp_action_paw") {
        for (const id of state.corp.hand) {
          const card = state.cards[id];
          if (card?.paidAbilities?.some((a) => a.usableFromHq)) {
            consider(id);
          }
        }
        for (const id of state.runner.rig) {
          const card = state.cards[id];
          if (card?.paidAbilities?.some((a) => a.usableByAnyPlayer)) {
            consider(id);
          }
        }
        for (const id of state.corp.discard) {
          const card = state.cards[id];
          if (card?.paidAbilities?.some((a) => a.usableFromArchives)) {
            consider(id);
          }
        }
        for (const id of state.corp.discard) {
          const card = state.cards[id];
          if (card?.paidAbilities?.some((a) => a.usableFromArchives)) {
            consider(id);
          }
        }
        for (const id of state.runner.score) {
          const card = state.cards[id];
          if (
            card?.side === "corp" &&
            card.paidAbilities?.some((a) => a.usableFromRunnerScoreArea)
          ) {
            consider(id);
          }
        }
      }
      const idCard = state.cards[state.corp.identityId];
      if (idCard) consider(idCard.id);
    }
    // Encounter: encountered ice paid abilities (F2P / N-Pot / Hákarl) + scored agendas.
    if (paw === "encounter_paw") {
      const encIce = state.run?.encounter?.iceId;
      if (encIce) consider(encIce);
      for (const id of state.corp.score) consider(id);
    }
    // Formicary-class: complete other priority windows at Run Ends (CR 6.8.2c).
    if (paw === "other_priority_window") {
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          const card = state.cards[id];
          if (
            card?.paidAbilities?.some((a) =>
              a.windows.includes("other_priority_window"),
            )
          ) {
            consider(id);
          }
        }
      }
    }
  }

    if (step.key === "run.encounterPaw" && state.run?.encounter) {
    const enc = state.run.encounter;
    const iceStr = effectiveIceStrength(state, enc.iceId);
    const iceSubs = effectiveIceSubtypes(state, enc.iceId);
    const blocksAi = iceBlocksAiBreak(state, enc.iceId);
    for (let i = 0; i < enc.broken.length; i++) {
      if (enc.broken[i]) continue;
      for (const breakerId of state.runner.rig) {
        const br = state.cards[breakerId];
        if (!br.breaker) continue;
        if (abilitiesSuppressed(state, breakerId)) continue;
        if (br.cannotBreakSubsThisRun) continue;
        if (br.breaker.breakViaPaidAbilityOnly) continue;
        if (
          cannotBreakExceptIcebreakerActive(state) &&
          !cardHasIcebreakerSubtype(br)
        ) {
          continue;
        }
        const iceCard = state.cards[enc.iceId];
        let maxPrinted = iceCard?.maxPrintedSubsBreakablePerEncounter;
        const atAdv = iceCard?.maxPrintedSubsBreakablePerEncounterAtAdvancements;
        if (
          atAdv &&
          (iceCard?.advancementTokens ?? 0) >= atAdv.threshold
        ) {
          maxPrinted = atAdv.max;
        }
        const exceptSub = iceCard?.maxPrintedSubsBreakExceptSubtype;
        const breakerExempt =
          exceptSub && (br.subtypes ?? []).includes(exceptSub);
        if (
          typeof maxPrinted === "number" &&
          !breakerExempt &&
          enc.broken.filter(Boolean).length >= maxPrinted
        ) {
          continue;
        }
        if (
          br.breaker.breakRequiresAttackingMark &&
          state.run?.attackedServerId !== state.markServerId
        ) {
          continue;
        }
        if (blocksAi && isAiBreaker(br)) continue;
        const exceptBreakerSub = state.cards[enc.iceId]?.cannotBreakExceptSubtype;
        if (
          exceptBreakerSub &&
          !(br.subtypes ?? []).includes(exceptBreakerSub)
        ) {
          continue;
        }
        const breaksAny = br.breaker.breaksSubtype === "*";
        if (!breaksAny && !iceSubs.includes(br.breaker.breaksSubtype)) {
          continue;
        }
        if (br.interfaceRequiresTrojanHost) {
          const hasTrojan = Object.values(state.cards).some(
            (c) =>
              c.hostId === enc.iceId &&
              (c.subtypes ?? []).includes("trojan") &&
              state.runner.rig.includes(c.id),
          );
          if (!hasTrojan) continue;
        }
        const brStr = effectiveBreakerStrength(state, breakerId);
        if (br.interfaceRequiresEqualStrength) {
          if (brStr !== iceStr) continue;
        } else if (brStr < iceStr) {
          continue;
        }
        const free =
          enc.freeBreaksRemaining?.breakerId === breakerId &&
          (enc.freeBreaksRemaining.remaining ?? 0) > 0;
        if (!free) {
          if (runnerAvailableCredits(state) < breakCostFor(state, breakerId)) {
            continue;
          }
        }
        actions.push({
          type: "break_subroutine",
          breakerId,
          subIndex: i,
        });
      }
      if (iceSubs.includes("bioroid") && state.runner.clicks >= 1) {
        if (!state.turn.bioroidIcePaidAbilitiesForbidden) {
          actions.push({ type: "break_bioroid_subroutine", subIndex: i });
        }
      }
    }
  }

  if (step.key === "run.jackOutWindow") {
    if (!isForbidden(state, "jack_out")) {
      actions.push({ type: "jack_out" });
    }
    actions.push({ type: "continue_run" });
  }

  if (step.kind === "discard") {
    actions.push({ type: "discard_to_hand_size" });
  }

  if (step.kind === "access") {
    const remaining = state.run?.accessRemaining;
    const cands = state.run?.accessCandidates ?? [];
    for (const id of cands) {
      if (remaining !== null && remaining !== undefined && remaining <= 0) break;
      actions.push({ type: "access_card", cardId: id });
    }
    if (
      cands.length === 0 ||
      remaining === 0 ||
      (remaining !== null &&
        remaining !== undefined &&
        remaining <= 0)
    ) {
      actions.push({ type: "finish_breach" });
    }
    return actions;
  }

  if (step.kind === "action" && !state.run) {
    const p = state.activeSide === "corp" ? state.corp : state.runner;
    if (p.clicks > 0) {
      if (
        step.allows?.includes("basic_gain_credit") &&
        !isForbidden(state, "basic_gain_credit")
      ) {
        actions.push({ type: "basic_gain_credit" });
      }
      if (
        step.allows?.includes("basic_draw") &&
        p.deck.length > 0 &&
        !isForbidden(state, "basic_draw")
      ) {
        actions.push({ type: "basic_draw" });
      }
      if (
        state.activeSide === "corp" &&
        step.allows?.includes("basic_install") &&
        !isForbidden(state, "basic_install")
      ) {
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
      }
      if (
        state.activeSide === "corp" &&
        step.allows?.includes("basic_trash_resource") &&
        !isForbidden(state, "basic_trash_resource") &&
        state.runner.tags > 0
      ) {
        const corpPts = agendaPointsFor(state, "corp");
        const runnerPts = agendaPointsFor(state, "runner");
        const threat = Math.max(corpPts, runnerPts);
        for (const id of state.runner.rig) {
          const card = state.cards[id];
          if (card?.type !== "resource") continue;
          const threatCost = card.threatBasicTrashAdditionalCostTrashHq;
          const connectionCost = runnerAbilityCarrierIds(state).some((cid) => {
            if (abilitiesSuppressed(state, cid)) return false;
            return (
              Boolean(
                state.cards[cid]?.connectionBasicTrashAdditionalCostTrashHq,
              ) && (card.subtypes ?? []).includes("connection")
            );
          });
          if (
            typeof threatCost === "number" &&
            threat >= threatCost &&
            state.corp.hand.length < 1
          ) {
            continue;
          }
          if (connectionCost && state.corp.hand.length < 1) {
            continue;
          }
          actions.push({ type: "basic_trash_resource", cardId: id });
        }
      }
      if (
        state.activeSide === "corp" &&
        step.allows?.includes("play_operation")
      ) {
        for (const id of state.corp.hand) {
          const card = state.cards[id];
          if (card.type === "operation") {
            const cost = card.playCost ?? 0;
            const extra = effectiveOperationExtraClicks(state, card);
            const clicksNeeded = 1 + extra;
            if (
              state.corp.credits >= cost &&
              state.corp.clicks >= clicksNeeded &&
              playRestrictionOk(state, id)
            ) {
              if (
                card.playCostXMaxRunnerTags &&
                state.runner.tags <= 0
              ) {
                continue;
              }
              actions.push({ type: "play_operation", cardId: id });
            }
          }
        }
      }
      if (state.activeSide === "corp" && step.allows?.includes("advance")) {
        for (const server of listServers(state)) {
          for (const id of server.root) {
            const card = state.cards[id];
            if (
              (card.type === "agenda" || card.type === "asset") &&
              state.corp.credits >= 1
            ) {
              actions.push({ type: "advance", cardId: id });
            }
          }
          for (const id of server.ice) {
            const card = state.cards[id];
            if (card.type === "ice" && state.corp.credits >= 1) {
              actions.push({ type: "advance", cardId: id });
            }
          }
        }
      }
      if (
        state.activeSide === "corp" &&
        step.allows?.includes("score_agenda") &&
        !state.turn.cannotScoreAgendas
      ) {
        for (const server of listServers(state)) {
          for (const id of server.root) {
            if (scoreAgendaBlockedByCannot(state, id)) continue;
            if (canScoreAgenda(state, state.cards[id])) {
              actions.push({ type: "score_agenda", cardId: id });
            }
          }
        }
      }
      if (state.activeSide === "runner") {
        if (
          step.allows?.includes("basic_install") &&
          !isForbidden(state, "basic_install")
        ) {
          for (const id of [
            ...state.runner.hand,
            ...state.runner.rig.flatMap((hid) => {
              const host = state.cards[hid];
              if (!host?.hostedCardsPlayableAsGrip) return [];
              return host.hostedCardIds ?? [];
            }),
          ]) {
            const card = state.cards[id];
            if (["program", "hardware", "resource"].includes(card.type)) {
              if (card.type === "program") {
                const need = card.memoryCost ?? 1;
                if (usedMemory(state) + need > memoryLimit(state)) {
                  // Still allow Dinosaurus-host installs (MU exempt).
                  const dinoHosts = state.runner.rig.filter((hid) => {
                    const host = state.cards[hid];
                    if (!host?.hostNonAiIcebreaker) return false;
                    const max = host.maxHostedCards ?? 1;
                    const have = (host.hostedCardIds ?? []).length;
                    return have < max;
                  });
                  if (
                    !(
                      card.breaker &&
                      !(card.subtypes ?? []).includes("ai") &&
                      card.breaker.breaksSubtype !== "*" &&
                      dinoHosts.length > 0
                    )
                  ) {
                    continue;
                  }
                }
              }
              if (card.installRequiresSuccessfulCentralRunThisTurn) {
                const okCentral =
                  state.turn.successfulHqRunThisTurn ||
                  state.turn.successfulRdRunThisTurn ||
                  state.turn.successfulArchivesRunThisTurn;
                if (!okCentral) continue;
              }
              if (
                card.installOnIce ||
                (card.subtypes ?? []).includes("trojan")
              ) {
                for (const server of listServers(state)) {
                  for (const iceId of server.ice) {
                    actions.push({
                      type: "basic_install",
                      cardId: id,
                      destination: { kind: "host_ice", iceId },
                    });
                  }
                }
              } else {
                const pushInstall = (
                  destination: {
                    kind: "rig" | "host_card";
                    hostId?: string;
                  },
                ) => {
                  const base =
                    destination.kind === "rig"
                      ? ({
                          type: "basic_install" as const,
                          cardId: id,
                          destination: { kind: "rig" as const },
                        } as const)
                      : ({
                          type: "basic_install" as const,
                          cardId: id,
                          destination: {
                            kind: "host_card" as const,
                            hostId: destination.hostId!,
                          },
                        } as const);
                  actions.push(base);
                  // Patchwork once-per-turn discount variants.
                  if (
                    !state.turn.patchworkDiscountUsedThisTurn &&
                    state.runner.hand.length > 1
                  ) {
                    for (const rid of state.runner.rig) {
                      const hw = state.cards[rid];
                      const disc =
                        hw?.playOrInstallDiscountByTrashingGripOncePerTurn;
                      if (!disc) continue;
                      for (const gid of state.runner.hand) {
                        if (gid === id) continue;
                        actions.push({
                          ...base,
                          trashGripForDiscountCardId: gid,
                        });
                      }
                      break;
                    }
                  }
                };
                pushInstall({ kind: "rig" });
                // Hackerspace: unique companion/connection may install hosted.
                if (
                  card.type === "resource" &&
                  card.unique &&
                  ((card.subtypes ?? []).includes("companion") ||
                    (card.subtypes ?? []).includes("connection"))
                ) {
                  for (const hid of state.runner.rig) {
                    const host = state.cards[hid];
                    if (!host?.hostsUniqueCompanionOrConnectionResources) {
                      continue;
                    }
                    pushInstall({ kind: "host_card", hostId: hid });
                  }
                }
                // Dinosaurus: non-AI icebreaker may install hosted.
                if (
                  card.type === "program" &&
                  card.breaker &&
                  !(card.subtypes ?? []).includes("ai") &&
                  card.breaker.breaksSubtype !== "*"
                ) {
                  for (const hid of state.runner.rig) {
                    const host = state.cards[hid];
                    if (!host?.hostNonAiIcebreaker) continue;
                    const max = host.maxHostedCards ?? 1;
                    const have = (host.hostedCardIds ?? []).length;
                    if (have >= max) continue;
                    pushInstall({ kind: "host_card", hostId: hid });
                  }
                }
              }
            }
          }
        }
        // startsRun paid abilities as click actions
        for (const rid of state.runner.rig) {
          const card = state.cards[rid];
          for (const ab of card.paidAbilities ?? []) {
            if (!ab.startsRun) continue;
            if (ab.oncePerTurn && wasAbilityUsed(state, rid, ab.id)) continue;
            const cost = abilityCost(ab, state, card);
            if (!canPayCost(state, "runner", cost, card)) continue;
            for (const sid of serversMatchingSpec(state, ab.startsRun)) {
              if (!isServerAllowedForSpec(state, ab.startsRun, sid)) continue;
              const tax = additionalRunInitiateTax(state, sid);
              const clicksNeeded = (cost.clicks ?? 0) + tax.clicks;
              if (
                (tax.clicks > 0 && state.runner.clicks < clicksNeeded) ||
                (tax.credits > 0 && runnerAvailableCredits(state) < tax.credits)
              )
                continue;
              actions.push({
                type: "use_paid_ability",
                cardId: rid,
                abilityId: ab.id,
                serverId: sid,
              });
            }
          }
        }
        if (
          step.allows?.includes("basic_run") &&
          !isForbidden(state, "basic_run")
        ) {
          for (const s of listServers(state)) {
            if (!isRunTargetAllowed(state, s.id)) continue;
            const tax = additionalRunInitiateTax(state, s.id);
            if (
              (tax.clicks > 0 &&
                state.runner.clicks < 1 + tax.clicks) ||
              (tax.credits > 0 && runnerAvailableCredits(state) < tax.credits)
            )
              continue;
            actions.push({ type: "basic_run", serverId: s.id });
          }
        }
        if (
          step.allows?.includes("basic_remove_tag") &&
          !isForbidden(state, "basic_remove_tag") &&
          state.runner.tags > 0 &&
          state.runner.credits >= 2
        ) {
          actions.push({ type: "basic_remove_tag" });
        }
        if (step.allows?.includes("play_event")) {
          const playableIds = [
            ...state.runner.hand,
            ...state.runner.rig.flatMap((hid) => {
              const host = state.cards[hid];
              if (!host?.hostedCardsPlayableAsGrip) return [];
              return host.hostedCardIds ?? [];
            }),
          ];
          let patchworkDisc = 0;
          if (!state.turn.patchworkDiscountUsedThisTurn) {
            for (const rid of state.runner.rig) {
              const n =
                state.cards[rid]?.playOrInstallDiscountByTrashingGripOncePerTurn;
              if (n) {
                patchworkDisc = n;
                break;
              }
            }
          }
          for (const id of playableIds) {
            const card = state.cards[id];
            if (card.type !== "event") continue;
            const cost = effectiveEventPlayCost(state, card.playCost, card);
            const credits = runnerCreditsFor(state, "play_event");
            const canPayBase = credits >= cost;
            const canPayWithPw =
              patchworkDisc > 0 &&
              credits >= Math.max(0, cost - patchworkDisc) &&
              state.runner.hand.some((gid) => gid !== id);
            if (!canPayBase && !canPayWithPw) continue;
            const extra =
              typeof card.playAdditionalClicks === "number"
                ? card.playAdditionalClicks
                : card.playAdditionalClick
                  ? 1
                  : 0;
            if (state.runner.clicks < 1 + extra) continue;
            if (!playRestrictionOk(state, id)) continue;
            const pushPlay = (serverId?: ServerId) => {
              if (canPayBase) {
                actions.push(
                  serverId
                    ? { type: "play_event", cardId: id, serverId }
                    : { type: "play_event", cardId: id },
                );
              }
              if (canPayWithPw) {
                for (const gid of state.runner.hand) {
                  if (gid === id) continue;
                  actions.push(
                    serverId
                      ? {
                          type: "play_event",
                          cardId: id,
                          serverId,
                          trashGripForDiscountCardId: gid,
                        }
                      : {
                          type: "play_event",
                          cardId: id,
                          trashGripForDiscountCardId: gid,
                        },
                  );
                }
              }
            };
            if (card.runEvent) {
              for (const sid of serversMatchingSpec(state, card.runEvent)) {
                if (!isServerAllowedForSpec(state, card.runEvent, sid)) {
                  continue;
                }
                const tax = additionalRunInitiateTax(state, sid);
                if (
                  (tax.clicks > 0 &&
                    state.runner.clicks < 1 + extra + tax.clicks) ||
                  (tax.credits > 0 &&
                    credits < Math.max(0, cost - (canPayWithPw ? patchworkDisc : 0)) + tax.credits)
                ) {
                  continue;
                }
                pushPlay(sid);
              }
              if (card.runEventOptional) {
                pushPlay();
              }
            } else {
              pushPlay();
            }
          }
        }
        if (step.allows?.includes("use_identity_ability")) {
          const idCard = state.cards[state.runner.identityId];
          for (const ab of idCard?.paidAbilities ?? []) {
            const cost = abilityCost(ab, state, idCard);
            if (canPayCost(state, "runner", cost, idCard)) {
              actions.push({
                type: "use_identity_ability",
                abilityId: ab.id,
              });
            }
          }
        }
      }
      if (
        state.activeSide === "corp" &&
        step.allows?.includes("score_agenda") === false
      ) {
        // no-op
      }
      const corpId = state.cards[state.corp.identityId];
      if (state.activeSide === "corp" && corpId?.paidAbilities) {
        for (const ab of corpId.paidAbilities) {
          const act = ab.effect?.op === "do" ? ab.effect.action : undefined;
          if (act?.kind === "trash_installed") {
            if (act.attackedServerOnly && !state.run) continue;
            if (trashInstalledLegalTargets(state, corpId.id, act).length === 0) {
              continue;
            }
          }
          const cost = abilityCost(ab, state, corpId);
          if (canPayCost(state, "corp", cost, corpId)) {
            actions.push({
              type: "use_identity_ability",
              abilityId: ab.id,
            });
          }
        }
      }
    }
  }

  // Free score during Corp action PAW
  if (
    state.activeSide === "corp" &&
    !state.turn.cannotScoreAgendas &&
    (state.timingKey === "corp.actionPaw" ||
      state.timingKey === "corp.takeAction")
  ) {
    for (const server of listServers(state)) {
      for (const id of server.root) {
        if (scoreAgendaBlockedByCannot(state, id)) continue;
        if (canScoreAgenda(state, state.cards[id])) {
          if (!actions.some((a) => a.type === "score_agenda" && a.cardId === id)) {
            actions.push({ type: "score_agenda", cardId: id });
          }
        }
      }
    }
  }

  return actions;
}
