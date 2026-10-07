import type { Action, GameState, Server, ServerId } from "../state/types.js";
import { abilityCost, canPayCost, costBeginsWithClick, runnerCreditsFor, runnerAvailableCredits, effectiveEventPlayCost, effectiveOperationExtraClicks } from "../state/costs.js";
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
  effectiveMemoryCost,
  wasAbilityUsed,
} from "../state/turn.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import { runnerAbilityCarrierIds } from "../state/fenris.js";
import { effectiveRunnerTags, runnerIsTagged } from "../state/tags.js";
import { hasActiveLockdown } from "../state/lockdowns.js";
import { corpMayScore } from "../cards/stubs.js";
import { isForbidden } from "./checkpoints.js";
import type { TimingStepDef } from "../timing/graph.js";

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

function playRestrictionOk(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (typeof card.playRequiresCreditsLt === "number") {
    const credits =
      card.side === "corp" ? state.corp.credits : state.runner.credits;
    if (credits >= card.playRequiresCreditsLt) return false;
  }
  if (typeof card.playRequiresRunnerCreditsGte === "number") {
    if (state.runner.credits < card.playRequiresRunnerCreditsGte) return false;
  }
  if (typeof card.playRequiresRunnerCreditsLt === "number") {
    if (state.runner.credits >= card.playRequiresRunnerCreditsLt) return false;
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
    card.playRequiresNoSuccessfulRunLastTurn &&
    state.turn.successfulRunLastTurn
  ) {
    return false;
  }
  if (
    card.playRequiresUnsuccessfulRunLastTurn &&
    !state.turn.unsuccessfulRunLastTurn
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
  if (card.playRequiresAgendaInRunnerScoreArea) {
    const hasAgenda = state.runner.score.some(
      (id) => state.cards[id]?.type === "agenda",
    );
    if (!hasAgenda) return false;
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
  if (card.playRequiresRunnerHasInstalledHardwareOrNonVirtualResource) {
    const okTarget = state.runner.rig.some((id) => {
      const c = state.cards[id];
      if (!c) return false;
      if (c.type === "hardware") return true;
      if (c.type === "resource" && !(c.subtypes ?? []).includes("virtual")) {
        return true;
      }
      return false;
    });
    if (!okTarget) return false;
  }
  if (card.playRequiresRunnerHasInstalledCard) {
    if (state.runner.rig.length === 0) return false;
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
    card.playRequiresVirusCounterPlacedOnProgramThisTurn &&
    (state.turn.programsWithVirusPlacedThisTurn?.length ?? 0) === 0
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
    card.playRequiresCorpScoredNoAgendasLastTurn &&
    state.turn.corpScoredAgendaLastTurn
  ) {
    return false;
  }
  if (
    card.playRequiresCorpBadPublicityGte &&
    (state.corp.badPublicity ?? 0) < card.playRequiresCorpBadPublicityGte
  ) {
    return false;
  }
  if (card.playRequiresScoredAgendaNotInstalledThisTurn) {
    const scored = state.turn.scoredCardIdsThisTurn ?? [];
    const installed = state.turn.installedThisTurn ?? [];
    if (!scored.some((id) => !installed.includes(id))) return false;
  }
  if (card.playRequiresScoredAgendaThisTurn) {
    if ((state.turn.scoredCardIdsThisTurn ?? []).length === 0) return false;
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
    typeof card.playRequiresOtherCardsInHq === "number" &&
    state.corp.hand.filter((id) => id !== cardId).length <
      card.playRequiresOtherCardsInHq
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


export function addClickActionCandidates(
  state: GameState,
  actions: Action[],
  step: TimingStepDef,
): void {
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
        step.allows?.includes("basic_purge_virus") &&
        state.corp.clicks >= 3 &&
        !isForbidden(state, "basic_purge_virus")
      ) {
        actions.push({ type: "basic_purge_virus" });
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
            if ((card.subtypes ?? []).includes("bioroid")) {
              for (const s of listServers(state)) {
                for (const rid of state.servers[s.id].root) {
                  const host = state.cards[rid];
                  if (host?.rezzed && host.hostsBioroidIceIgnoreInstallCost) {
                    actions.push({
                      type: "basic_install",
                      cardId: id,
                      destination: { kind: "host_upgrade", hostId: rid },
                    });
                  }
                }
              }
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
          let pavilionExtra = 0;
          for (const rid of state.runner.rig) {
            const c = state.cards[rid];
            if (typeof c?.basicTrashResourceAdditionalCostCredits === "number") {
              pavilionExtra = Math.max(
                pavilionExtra,
                c.basicTrashResourceAdditionalCostCredits,
              );
            }
          }
          if (pavilionExtra > 0 && state.corp.credits < pavilionExtra) {
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
      if (
        state.activeSide === "corp" &&
        step.allows?.includes("advance") &&
        !state.turn.cannotAdvanceCards
      ) {
        let advanceIceRecurring = 0;
        const idCard = state.cards[state.corp.identityId];
        for (const c of [
          idCard,
          ...Object.values(state.cards).filter(
            (x) => x.side === "corp" && x.rezzed && x.type !== "identity",
          ),
        ]) {
          if (!c?.recurringSpendFor?.includes("advance_ice")) continue;
          advanceIceRecurring += c.recurringCredits ?? 0;
        }
        for (const server of listServers(state)) {
          let advanceThisServerRecurring = 0;
          for (const id of [...server.root, ...server.ice]) {
            const c = state.cards[id];
            if (!c?.rezzed) continue;
            if (
              !(c.recurringSpendFor ?? []).includes("advance_cards_this_server")
            ) {
              continue;
            }
            advanceThisServerRecurring += c.recurringCredits ?? 0;
          }
          for (const id of server.root) {
            const card = state.cards[id];
            if (
              (card.type === "agenda" || card.type === "asset") &&
              (state.corp.credits >= 1 || advanceThisServerRecurring >= 1)
            ) {
              actions.push({ type: "advance", cardId: id });
            }
          }
          for (const id of server.ice) {
            const card = state.cards[id];
            if (
              card.type === "ice" &&
              (state.corp.credits >= 1 ||
                advanceIceRecurring >= 1 ||
                advanceThisServerRecurring >= 1)
            ) {
              if (card.canAdvanceOnlyWhenRezzed && !card.rezzed) continue;
              actions.push({ type: "advance", cardId: id });
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
                const need = effectiveMemoryCost(state, id);
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
                card.installRequiresSuccessfulHqRunThisTurn &&
                !state.turn.successfulHqRunThisTurn
              ) {
                continue;
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
                // Off-Campus Apartment: any connection may install hosted.
                if (
                  card.type === "resource" &&
                  (card.subtypes ?? []).includes("connection")
                ) {
                  for (const hid of state.runner.rig) {
                    const host = state.cards[hid];
                    if (!host?.hostsConnectionResources) continue;
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
                // Djinn/Muse: non-daemon programs may install on daemonHost.
                if (
                  card.type === "program" &&
                  !(card.subtypes ?? []).includes("daemon")
                ) {
                  for (const hid of state.runner.rig) {
                    const host = state.cards[hid];
                    if (!host?.daemonHost) continue;
                    if (
                      host.daemonHostExcludeIcebreaker &&
                      (card.breaker ||
                        (card.subtypes ?? []).includes("icebreaker"))
                    ) {
                      continue;
                    }
                    if (typeof host.daemonHostMaxMu === "number") {
                      const used = (host.hostedCardIds ?? []).reduce(
                        (sum, id) =>
                          sum + effectiveMemoryCost(state, id),
                        0,
                      );
                      if (
                        used + effectiveMemoryCost(state, id) >
                        host.daemonHostMaxMu
                      ) {
                        continue;
                      }
                    }
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
            if (
              tax.requireForfeitAgenda &&
              state.runner.score.filter((id) => !state.cards[id]?.cannotForfeit)
                .length === 0
            ) {
              continue;
            }
            actions.push({ type: "basic_run", serverId: s.id });
          }
        }
        if (
          step.allows?.includes("basic_remove_tag") &&
          !isForbidden(state, "basic_remove_tag") &&
          state.runner.tags > 0 &&
          runnerCreditsFor(state, "basic_remove_tag") >= 2
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
            if (!costBeginsWithClick(ab)) continue;
            if (!ab.windows.includes("runner_action_paw")) continue;
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
          if (!costBeginsWithClick(ab)) continue;
          if (!ab.windows.includes("corp_action_paw")) continue;
          const act = ab.effect?.op === "do" ? (ab.effect.action as { kind?: string; attackedServerOnly?: boolean }) : undefined;
          if (act?.kind === "trash_installed") {
            if (act.attackedServerOnly && !state.run) continue;
            if (trashInstalledLegalTargets(state, corpId.id, act as never).length === 0) {
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
}

export function addFreeScoreCandidates(
  state: GameState,
  actions: Action[],
): void {
  // CR 9.2.7d / 1.17.3: score in an (S) paid ability window.
  if (
    state.activeSide === "corp" &&
    !state.turn.cannotScoreAgendas &&
    corpMayScore(state.timingKey)
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
}
