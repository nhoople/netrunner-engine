import type { Action, GameState, Server } from "../state/types.js";
import {
  continuousIceRezCostIncrease,
  iceShareServer,
  rezCostDiscountPerRezzedSubtype,
  rezCostDiscountPerOtherUnrezzedIce,
  rezCostDiscountIfAgendaScoredOrStolenThisTurn,
  effectiveBreakerStrength,
  effectiveIceStrength,
  effectiveIceSubtypes,
  iceBlocksAiBreak,
  isAiBreaker,
  iceRezCostReductionFromScoredAgendaCounters,
} from "../cards/stubs.js";
import { abilityCost, canPayCost, runnerAvailableCredits } from "../state/costs.js";
import { directHostedTakeFromEmpty } from "../state/hostedCredits.js";
import { agendaPointsFor } from "../state/scoring.js";
import { additionalRunInitiateTax } from "../state/runInitiateTax.js";
import {
  isServerAllowedForSpec,
  serversMatchingSpec,
} from "../state/runStart.js";
import {
  wasAbilityUsed,
  wasAbilityUsedThisEncounter,
  wasAbilityUsedThisRun,
} from "../state/turn.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { runnerAbilityCarrierIds } from "../state/fenris.js";
import { runnerIsTagged } from "../state/tags.js";
import {
  cannotBreakExceptIcebreakerActive,
  cardHasIcebreakerSubtype,
} from "../state/lockdowns.js";
import type { PaidAbilityWindow } from "../state/types.js";
import type { TimingStepDef } from "../timing/graph.js";

function breakCostFor(state: GameState, breakerId: string): number {
  const br = state.cards[breakerId].breaker!;
  let cost = br.breakCredits + (state.run?.kgIcebreakerBreakAdditionalCost ?? 0);
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


export function listServers(state: GameState): Server[] {
  return Object.values(state.servers);
}

function approachedIceId(state: GameState): string | null {
  const run = state.run;
  if (!run || run.position === null) return null;
  return state.servers[run.attackedServerId].ice[run.position] ?? null;
}

export function addApproachIceCandidates(
  state: GameState,
  actions: Action[],
  step: TimingStepDef,
): void {
  if (step.key === "run.approachPaw") {
    const iceId = approachedIceId(state);
    if (iceId) {
      const ice = state.cards[iceId];
      let increase =
        (state.run?.iceRezCostIncrease ?? 0) +
        continuousIceRezCostIncrease(state, iceId) +
        (state.turn.iceAdditionalRezCostThisTurn[iceId] ?? 0);
      if (state.turn.iceRezzedThisTurn === 0) {
        for (const carrierId of runnerAbilityCarrierIds(state)) {
          if (abilitiesSuppressed(state, carrierId)) continue;
          increase +=
            state.cards[carrierId]?.firstIceRezCostIncrease ?? 0;
        }
      }
      const discount =
        rezCostDiscountPerRezzedSubtype(state, iceId) +
        rezCostDiscountPerOtherUnrezzedIce(state, iceId) +
        iceRezCostReductionFromScoredAgendaCounters(state);
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
        !state.run?.forbidCorpRezIceDuringRun &&
        !state.turn.cannotScoreOrRezCardIds.includes(iceId) &&
        !state.cannotScoreOrRezUntilNextCorpTurnCardIds.includes(iceId)
      ) {
        // DDoS: cannot rez outermost ice during a run this turn.
        if (
          state.turn.uotCannotRezOutermostIce &&
          state.run &&
          state.servers[state.run.attackedServerId]?.ice[0] === iceId
        ) {
          // skip
        } else {
        const agendaDisc = ice.rezCostCreditDiscountOnForfeitAgenda ?? 0;
        const discountedCost = Math.max(0, cost - agendaDisc);
        let rezIceRecurring = 0;
        for (const c of Object.values(state.cards)) {
          if (c.side !== "corp" || !c.rezzed) continue;
          if (!(c.recurringSpendFor ?? []).includes("rez_ice")) continue;
          rezIceRecurring += c.recurringCredits ?? 0;
        }
        const canPay =
          state.corp.credits + rezIceRecurring >= cost ||
          (agendaDisc > 0 &&
            state.corp.score.length > 0 &&
            state.corp.credits + rezIceRecurring >= discountedCost);
        if (canPay) {
          actions.push({ type: "rez_ice", cardId: iceId });
        }
        }
      }
    }
  }
}

export function addPaidWindowCandidates(
  state: GameState,
  actions: Action[],
  step: TimingStepDef,
  paw: PaidAbilityWindow | null,
): void {
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
      // Navi Mumbai City Grid: during runs on this server, Runner cannot use
      // paid abilities on installed cards except icebreakers and mid-access.
      if (
        state.run &&
        state.activeSide === "runner" &&
        state.runner.rig.includes(cardId) &&
        !String(state.timingKey).startsWith("access.")
      ) {
        const sid = state.run.attackedServerId;
        const server = state.servers[sid];
        const naviBlocks = (server?.root ?? []).some((id) => {
          const up = state.cards[id];
          return (
            !!up?.rezzed &&
            !!up.blockRunnerPaidAbilitiesExceptIcebreakersAndMidAccess
          );
        });
        if (naviBlocks) {
          const isBreaker =
            !!card.breaker || (card.subtypes ?? []).includes("icebreaker");
          if (!isBreaker) return;
        }
      }
      for (const ab of card.paidAbilities ?? []) {
        if (!abilityWindowOpen(ab)) continue;
        if (ab.requireDuringRun && !state.run) continue;
        if (ab.forbidDuringRun && state.run) continue;
        if (ab.onlyDuringHqRun && state.run?.attackedServerId !== "hq") continue;
        if (ab.onlyDuringArchivesRun && state.run?.attackedServerId !== "archives") continue;
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
          ab.requiresSuccessfulHqRunThisTurn &&
          !state.turn.successfulHqRunThisTurn
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
        if (ab.requireFullyBrokenThisEncounter) {
          const enc = state.run?.encounter;
          if (!enc?.fullyBrokenByRunner) continue;
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
        if (ab.requireThisServer) {
          const sid = state.run?.attackedServerId;
          if (!sid || !card.rezzed) continue;
          const server = state.servers[sid];
          if (!server?.root.includes(cardId) && !server?.ice.includes(cardId)) {
            continue;
          }
        }
        if (
          typeof ab.requireRunnerClicksEq === "number" &&
          state.runner.clicks !== ab.requireRunnerClicksEq
        ) {
          continue;
        }
        if (ab.requireRunnerTagged && !runnerIsTagged(state)) continue;
        if (
          ab.requireSufferedCorpDamageThisTurn &&
          !state.turn.esSufferedCorpDamageThisTurn
        ) {
          continue;
        }
        if (
          ab.requireSufferedAnyDamageThisTurn &&
          (state.turn.damageSufferedThisTurn ?? 0) < 1
        ) {
          continue;
        }
        if (ab.requireNextPawAfterDamage && !state.turn.vanadisNextPawArmed) {
          continue;
        }
        if (
          card.bryanStinsonPlayArchivesTransactionWhileRunnerLt6c &&
          ab.id === "bryan-stinson-play-tx" &&
          state.runner.credits >= 6
        ) {
          continue;
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
        if (directHostedTakeFromEmpty(card.hostedCredits, ab.effect)) continue;
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
                  state.activeSide === "corp") &&
                (!card.rezRequiresTagged || runnerIsTagged(state))
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
        if (
          typeof br.breaker.breakRequiresIceSubtypeCountGte === "number" &&
          iceSubs.length < br.breaker.breakRequiresIceSubtypeCountGte
        ) {
          continue;
        }
        if (
          typeof br.breaker.breakRequiresIceExactSubroutineCount === "number"
        ) {
          const need = br.breaker.breakRequiresIceExactSubroutineCount;
          const iceCard = state.cards[enc.iceId];
          const subCount = (iceCard?.subroutines ?? []).length;
          if (subCount !== need) continue;
        }
        if (typeof br.breaker.breakRequiresIceRezCostGte === "number") {
          const need = br.breaker.breakRequiresIceRezCostGte;
          const iceCard = state.cards[enc.iceId];
          if ((iceCard?.rezCost ?? 0) < need) continue;
        }
        if (
          br.interfaceRequiresChosenServer &&
          state.run?.attackedServerId !== br.chosenServerId
        ) {
          continue;
        }
        if (br.breakerOnlyOutermostIce) {
          const sid = state.run?.attackedServerId;
          const iceList = sid ? (state.servers[sid]?.ice ?? []) : [];
          if (iceList[0] !== enc.iceId) continue;
        }
        if (br.breakerOnlyInnermostIce) {
          const sid = state.run?.attackedServerId;
          const iceList = sid ? (state.servers[sid]?.ice ?? []) : [];
          if (iceList[iceList.length - 1] !== enc.iceId) continue;
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
    // Bioroid 2.0-class: [click] × N breaks up to N subroutines in one PAW.
    const iceCardForMulti = state.cards[enc.iceId];
    const maxSubs = iceCardForMulti?.bioroidBreakMaxSubs;
    if (
      maxSubs &&
      maxSubs >= 2 &&
      iceSubs.includes("bioroid") &&
      !state.turn.bioroidIcePaidAbilitiesForbidden &&
      state.runner.clicks >= maxSubs
    ) {
      const subs = iceCardForMulti?.subroutines ?? [];
      const unbroken: number[] = [];
      for (let i = 0; i < enc.broken.length; i++) {
        if (enc.broken[i]) continue;
        if (subs[i]?.requireLostClickToBreakThisRun && !enc.broken[i]) {
          if (!state.run?.lostClickToBreakThisRun) continue;
        }
        unbroken.push(i);
      }
      const combos: number[][] = [];
      const build = (start: number, chosen: number[]): void => {
        if (chosen.length > 0) combos.push([...chosen]);
        if (chosen.length >= maxSubs) return;
        for (let j = start; j < unbroken.length; j++) {
          build(j + 1, [...chosen, unbroken[j]]);
        }
      };
      build(0, []);
      for (const subIndexes of combos) {
        actions.push({ type: "break_bioroid_subroutines", subIndexes });
      }
    }
  }
}

export function addBreachAccessCandidates(
  state: GameState,
  actions: Action[],
): void {
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
}
