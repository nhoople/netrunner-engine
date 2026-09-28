import type { Action, GameState, Server } from "../state/types.js";
import {
  continuousIceRezCostIncrease,
  iceShareServer,
  rezCostDiscountPerRezzedSubtype,
  rezCostDiscountPerOtherUnrezzedIce,
  currentWindow,
  effectiveBreakerStrength,
  effectiveIceStrength,
  effectiveIceSubtypes,
  iceBlocksAiBreak,
  isAiBreaker,
  runnerTrashCostForCard,
} from "../cards/stubs.js";
import { abilityCost, canPayCost, runnerCreditsFor, runnerAvailableCredits, effectiveEventPlayCost } from "../state/costs.js";
import { agendaPointsFor, canScoreAgenda } from "../state/scoring.js";
import { isRunTargetAllowed } from "../state/runLegality.js";
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
import { getStep } from "../timing/machine.js";
import { isForbidden } from "./checkpoints.js";

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
  if (card.playRequiresTagged && state.runner.tags <= 0) return false;
  if (
    card.playRequiresInstalledResource &&
    !state.runner.rig.some((id) => state.cards[id]?.type === "resource")
  ) {
    return false;
  }
  if (card.playRequiresUntagged && state.runner.tags > 0) return false;
  if (
    typeof card.playRequiresMinTags === "number" &&
    state.runner.tags < card.playRequiresMinTags
  ) {
    return false;
  }
  if (
    card.playRequiresSuccessfulRunLastTurn &&
    !state.turn.successfulRunLastTurn
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
  if (
    card.playRequiresNoCorpActionFinished &&
    (state.turn.corpActionsCompletedThisTurn ?? 0) > 0
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
    if (state.corp.credits > 0) {
      for (let c = 1; c <= Math.min(state.corp.credits, 5); c++) {
        actions.push({ type: "boost_trace", credits: c });
      }
    }
    if (state.runner.link > 0) {
      for (let L = 0; L <= state.runner.link; L++) {
        actions.push({ type: "spend_link", amount: L });
      }
    } else {
      actions.push({ type: "spend_link", amount: 0 });
    }
    actions.push({ type: "resolve_trace" });
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
    for (let a = 1; a <= state.pendingDamage.remaining; a++) {
      actions.push({ type: "prevent_damage", amount: a });
    }
    if (state.pendingDamage.type === "net" && state.run) {
      for (const id of state.runner.rig) {
        const card = state.cards[id];
        if (abilitiesSuppressed(state, id)) continue;
        for (const ab of card.paidAbilities ?? []) {
          if (!ab.windows.includes("damage_interrupt_paw")) continue;
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

  // Mid-access agenda decisions
  if (state.run?.accessingCardId) {
    const id = state.run.accessingCardId;
    const card = state.cards[id];
    if (card.type === "agenda") {
      if (!state.run.cannotStealOrTrash) {
        const stealClicks = card.stealAdditionalClicks ?? 0;
        if (stealClicks === 0 || state.runner.clicks >= stealClicks) {
          actions.push({ type: "steal_agenda", cardId: id });
        }
      }
      actions.push({ type: "finish_access" });
    } else {
      if (
        card.trashCost !== undefined &&
        !state.run.cannotStealOrTrash
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
    }
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
    // Imp: mid-access virus trash
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
    // Gourmand: trash self to trash accessed non-agenda, then draw
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
    // Cupellation: mid-access host non-agenda faceup
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
        increase +=
          state.cards[state.runner.identityId]?.firstIceRezCostIncrease ?? 0;
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
        state.corp.score.length === 0
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
      } else if (!ice.rezzed && !state.turn.cannotScoreOrRezCardIds.includes(iceId)) {
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
        if (ab.requiresUntagged && state.runner.tags > 0) continue;
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
          const approached = approachedIceId(state);
          if (ab.requireOtherServer) {
            // B-1001-class: already validated above; skip ice-only gate.
          } else if (ab.requireDuringRun && state.run) {
            // Event Horizon-class: any rezzed ice protecting attacked server.
            const sid = state.run.attackedServerId;
            if (!card.rezzed || !state.servers[sid]?.ice.includes(cardId)) {
              continue;
            }
          } else if (approached !== cardId || !card.rezzed) {
            continue;
          }
        }
        if (card.side === "corp" && paw === "approach_server_paw") {
          const sid = state.run?.attackedServerId;
          if (ab.requireOtherServer) {
            // Validated above.
          } else if (ab.requireDuringRun && sid) {
            if (!card.rezzed || !state.servers[sid]?.ice.includes(cardId)) {
              continue;
            }
          } else if (
            !sid ||
            !state.servers[sid].root.includes(cardId) ||
            !card.rezzed
          ) {
            continue;
          }
        }
        if (ab.startsRun) {
          for (const sid of serversMatchingSpec(state, ab.startsRun)) {
            if (!isServerAllowedForSpec(state, ab.startsRun, sid)) continue;
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
              const cost = card.rezCost ?? 0;
              const canForfeit =
                !card.rezAdditionalCostForfeitAgenda ||
                state.corp.score.length > 0;
              if (
                state.corp.credits >= cost &&
                canForfeit &&
                !state.turn.cannotScoreOrRezCardIds.includes(id) &&
                (!card.rezOnlyDuringCorpTurn ||
                  state.activeSide === "corp")
              ) {
                actions.push({ type: "rez_asset", cardId: id });
              }
            }
            if (card.rezzed) consider(id);
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
    // Encounter: also scored agendas (Nisei / HoK).
    if (paw === "encounter_paw") {
      for (const id of state.corp.score) consider(id);
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
        const maxPrinted =
          state.cards[enc.iceId]?.maxPrintedSubsBreakablePerEncounter;
        const exceptSub =
          state.cards[enc.iceId]?.maxPrintedSubsBreakExceptSubtype;
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
          const idCard = state.cards[state.runner.identityId];
          const connectionCost =
            idCard?.connectionBasicTrashAdditionalCostTrashHq &&
            (card.subtypes ?? []).includes("connection");
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
            const extra =
              typeof card.playAdditionalClicks === "number"
                ? card.playAdditionalClicks
                : card.playAdditionalClick
                  ? 1
                  : 0;
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
        step.allows?.includes("score_agenda")
      ) {
        for (const server of listServers(state)) {
          for (const id of server.root) {
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
                if (usedMemory(state) + need > memoryLimit(state)) continue;
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
                actions.push({
                  type: "basic_install",
                  cardId: id,
                  destination: { kind: "rig" },
                });
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
            actions.push({ type: "basic_run", serverId: s.id });
          }
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
          for (const id of playableIds) {
            const card = state.cards[id];
            if (card.type !== "event") continue;
            const cost = effectiveEventPlayCost(state, card.playCost);
            if (runnerCreditsFor(state, "play_event") < cost) continue;
            const extra =
              typeof card.playAdditionalClicks === "number"
                ? card.playAdditionalClicks
                : card.playAdditionalClick
                  ? 1
                  : 0;
            if (state.runner.clicks < 1 + extra) continue;
            if (!playRestrictionOk(state, id)) continue;
            if (card.runEvent) {
              for (const sid of serversMatchingSpec(state, card.runEvent)) {
                if (!isServerAllowedForSpec(state, card.runEvent, sid)) {
                  continue;
                }
                actions.push({
                  type: "play_event",
                  cardId: id,
                  serverId: sid,
                });
              }
              if (card.runEventOptional) {
                actions.push({ type: "play_event", cardId: id });
              }
            } else {
              actions.push({ type: "play_event", cardId: id });
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
        if (state.turn.cannotScoreOrRezCardIds.includes(id)) continue;
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
