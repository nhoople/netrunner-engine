import type { Action, GameState, Server, ServerId } from "../state/types.js";
import {
  currentWindow,
  effectiveBreakerStrength,
  effectiveIceStrength,
  effectiveIceSubtypes,
  iceBlocksAiBreak,
  isAiBreaker,
} from "../cards/stubs.js";
import { abilityCost, canPayCost, runnerCreditsFor } from "../state/costs.js";
import { canScoreAgenda } from "../state/scoring.js";
import {
  memoryLimit,
  usedMemory,
  wasAbilityUsed,
  wasAbilityUsedThisRun,
} from "../state/turn.js";
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
  return cost;
}

function playRestrictionOk(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (card.playRequiresTagged && state.runner.tags <= 0) return false;
  if (
    card.playRequiresSuccessfulRunLastTurn &&
    !state.turn.successfulRunLastTurn
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
    for (let a = 1; a <= state.pendingDamage.remaining; a++) {
      actions.push({ type: "prevent_damage", amount: a });
    }
    return actions;
  }

  if (state.pendingTrashProgram) {
    for (const id of state.pendingTrashProgram.candidates) {
      actions.push({ type: "choose_trash_program", cardId: id });
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
        actions.push({ type: "steal_agenda", cardId: id });
      }
      actions.push({ type: "finish_access" });
    } else {
      if (
        card.trashCost !== undefined &&
        !state.run.cannotStealOrTrash
      ) {
        const purpose =
          card.type === "asset" ? ("trash_asset" as const) : ("trash" as const);
        if (runnerCreditsFor(state, purpose) >= (card.trashCost ?? 0)) {
          actions.push({ type: "trash_accessed", cardId: id });
        }
      }
      actions.push({ type: "finish_access" });
    }
    const sid = state.run.attackedServerId;
    if (
      (sid === "hq" || sid === "rd") &&
      !state.turn.carnivoreAccessTrashUsed
    ) {
      for (const rid of state.runner.rig) {
        const spec = state.cards[rid].accessTrashFromGrip;
        if (spec && state.runner.hand.length >= spec.gripCards) {
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
      let increase = state.run?.iceRezCostIncrease ?? 0;
      for (const id of state.runner.rig) {
        increase += state.cards[id].iceRezCostIncrease ?? 0;
      }
      if (state.turn.iceRezzedThisTurn === 0) {
        increase +=
          state.cards[state.runner.identityId]?.firstIceRezCostIncrease ?? 0;
      }
      const cost = Math.max(
        0,
        (ice.rezCost ?? 0) +
          increase -
          (state.turn.pendingBioroidRezDiscount ?? 0),
      );
      if (
        ice.rezAdditionalCostForfeitAgenda &&
        state.corp.score.length === 0
      ) {
        // cannot rez without an agenda to forfeit
      } else if (!ice.rezzed && state.corp.credits >= cost) {
        actions.push({ type: "rez_ice", cardId: iceId });
      }
    }
  }

  if (paw) {
    const consider = (cardId: string) => {
      const card = state.cards[cardId];
      if (card.abilitiesBlanked) return;
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes(paw)) continue;
        if (ab.oncePerTurn && wasAbilityUsed(state, cardId, ab.id)) continue;
        if (ab.oncePerRun && wasAbilityUsedThisRun(state, cardId, ab.id)) {
          continue;
        }
        if (
          ab.requiresAdvancements !== undefined &&
          (card.advancementTokens ?? 0) < ab.requiresAdvancements
        ) {
          continue;
        }
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
        const cost = abilityCost(ab);
        if (!canPayCost(state, card.side, cost, card)) continue;
        if (card.side === "runner" && !state.runner.rig.includes(cardId)) {
          // Runner identity is allowed without being in rig.
          if (cardId !== state.runner.identityId) continue;
        }
        if (card.side === "corp" && paw === "approach_paw") {
          const approached = approachedIceId(state);
          if (approached !== cardId || !card.rezzed) continue;
        }
        if (card.side === "corp" && paw === "approach_server_paw") {
          const sid = state.run?.attackedServerId;
          if (
            !sid ||
            !state.servers[sid].root.includes(cardId) ||
            !card.rezzed
          ) {
            continue;
          }
        }
        if (ab.startsRun) {
          for (const sid of Object.keys(state.servers) as ServerId[]) {
            // Filter via StartsRunSpec — inline check
            const spec = ab.startsRun;
            let ok = false;
            switch (spec.servers) {
              case "any":
                ok = true;
                break;
              case "central":
                ok = sid === "hq" || sid === "rd" || sid === "archives";
                break;
              case "hq_rd":
                ok = sid === "hq" || sid === "rd";
                break;
              case "rd":
                ok = sid === "rd";
                break;
              case "hq":
                ok = sid === "hq";
                break;
            }
            if (!ok) continue;
            if (
              spec.requireNotRunThisTurn &&
              state.turn.serversRunThisTurn.includes(sid)
            ) {
              continue;
            }
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
    if (paw === "encounter_paw" || paw === "runner_action_paw") {
      for (const id of state.runner.rig) consider(id);
      const idCard = state.cards[state.runner.identityId];
      if (idCard) consider(idCard.id);
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
              if (state.corp.credits >= cost && canForfeit) {
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
        if (br.abilitiesBlanked) continue;
        if (blocksAi && isAiBreaker(br)) continue;
        const breaksAny = br.breaker.breaksSubtype === "*";
        if (!breaksAny && !iceSubs.includes(br.breaker.breaksSubtype)) {
          continue;
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
          const pool =
            state.runner.credits + (state.run?.eventCredits ?? 0);
          if (pool < breakCostFor(state, breakerId)) continue;
        }
        actions.push({
          type: "break_subroutine",
          breakerId,
          subIndex: i,
        });
      }
      if (iceSubs.includes("bioroid") && state.runner.clicks >= 1) {
        actions.push({ type: "break_bioroid_subroutine", subIndex: i });
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
        step.allows?.includes("play_operation")
      ) {
        for (const id of state.corp.hand) {
          const card = state.cards[id];
          if (card.type === "operation") {
            const cost = card.playCost ?? 0;
            const clicksNeeded = 1 + (card.playAdditionalClick ? 1 : 0);
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
          for (const id of state.runner.hand) {
            const card = state.cards[id];
            if (["program", "hardware", "resource"].includes(card.type)) {
              if (card.type === "program") {
                const need = card.memoryCost ?? 1;
                if (usedMemory(state) + need > memoryLimit(state)) continue;
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
            const cost = abilityCost(ab);
            if (!canPayCost(state, "runner", cost, card)) continue;
            for (const sid of Object.keys(state.servers) as ServerId[]) {
              const spec = ab.startsRun;
              let okSrv = false;
              switch (spec.servers) {
                case "any":
                  okSrv = true;
                  break;
                case "central":
                  okSrv = sid === "hq" || sid === "rd" || sid === "archives";
                  break;
                case "hq_rd":
                  okSrv = sid === "hq" || sid === "rd";
                  break;
                case "rd":
                  okSrv = sid === "rd";
                  break;
                case "hq":
                  okSrv = sid === "hq";
                  break;
              }
              if (!okSrv) continue;
              if (
                spec.requireNotRunThisTurn &&
                state.turn.serversRunThisTurn.includes(sid)
              ) {
                continue;
              }
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
            actions.push({ type: "basic_run", serverId: s.id });
          }
        }
        if (step.allows?.includes("play_event")) {
          for (const id of state.runner.hand) {
            const card = state.cards[id];
            if (card.type !== "event") continue;
            const cost = card.playCost ?? 0;
            if (state.runner.credits < cost) continue;
            if (card.runEvent) {
              const spec = card.runEvent;
              for (const sid of Object.keys(state.servers) as ServerId[]) {
                let ok = false;
                switch (spec.servers) {
                  case "any":
                    ok = true;
                    break;
                  case "central":
                    ok = sid === "hq" || sid === "rd" || sid === "archives";
                    break;
                  case "hq_rd":
                    ok = sid === "hq" || sid === "rd";
                    break;
                  case "rd":
                    ok = sid === "rd";
                    break;
                  case "hq":
                    ok = sid === "hq";
                    break;
                }
                if (!ok) continue;
                if (
                  spec.requireNotRunThisTurn &&
                  state.turn.serversRunThisTurn.includes(sid)
                ) {
                  continue;
                }
                actions.push({
                  type: "play_event",
                  cardId: id,
                  serverId: sid,
                });
              }
            } else {
              actions.push({ type: "play_event", cardId: id });
            }
          }
        }
        if (step.allows?.includes("use_identity_ability")) {
          const idCard = state.cards[state.runner.identityId];
          for (const ab of idCard?.paidAbilities ?? []) {
            const cost = abilityCost(ab);
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
          const cost = abilityCost(ab);
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
