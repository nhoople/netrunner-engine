import type { Action, GameState, Server } from "../state/types.js";
import {
  currentWindow,
  effectiveBreakerStrength,
  effectiveIceStrength,
} from "../cards/stubs.js";
import { abilityCost, canPayCost } from "../state/costs.js";
import { canScoreAgenda } from "../state/scoring.js";
import { getStep } from "../timing/machine.js";
import { isForbidden } from "./checkpoints.js";

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
      actions.push({ type: "steal_agenda", cardId: id });
      actions.push({ type: "finish_access" });
    } else {
      if (card.trashCost !== undefined) {
        if (state.runner.credits >= (card.trashCost ?? 0)) {
          actions.push({ type: "trash_accessed", cardId: id });
        }
      }
      actions.push({ type: "finish_access" });
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
      const cost = ice.rezCost ?? 0;
      if (!ice.rezzed && state.corp.credits >= cost) {
        actions.push({ type: "rez_ice", cardId: iceId });
      }
    }
  }

  if (paw) {
    const consider = (cardId: string) => {
      const card = state.cards[cardId];
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes(paw)) continue;
        const cost = abilityCost(ab);
        if (!canPayCost(state, card.side, cost, card)) continue;
        if (card.side === "runner" && !state.runner.rig.includes(cardId)) {
          continue;
        }
        if (card.side === "corp" && paw === "approach_paw") {
          const approached = approachedIceId(state);
          if (approached !== cardId || !card.rezzed) continue;
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
    if (paw === "approach_paw" || paw === "corp_action_paw") {
      if (paw === "approach_paw") {
        const iceId = approachedIceId(state);
        if (iceId) consider(iceId);
      }
      if (paw === "corp_action_paw") {
        for (const server of listServers(state)) {
          for (const id of server.root) {
            const card = state.cards[id];
            if (
              (card.type === "asset" || card.type === "upgrade") &&
              !card.rezzed
            ) {
              const cost = card.rezCost ?? 0;
              if (state.corp.credits >= cost) {
                actions.push({ type: "rez_asset", cardId: id });
              }
            }
            if (card.rezzed) consider(id);
          }
        }
      }
      const idCard = state.cards[state.corp.identityId];
      if (idCard) consider(idCard.id);
    }
  }

  if (step.key === "run.encounterPaw" && state.run?.encounter) {
    const enc = state.run.encounter;
    const ice = state.cards[enc.iceId];
    const iceStr = effectiveIceStrength(state, enc.iceId);
    for (let i = 0; i < enc.broken.length; i++) {
      if (enc.broken[i]) continue;
      for (const breakerId of state.runner.rig) {
        const br = state.cards[breakerId];
        if (!br.breaker) continue;
        const breaksAny = br.breaker.breaksSubtype === "*";
        if (
          !breaksAny &&
          !(ice.subtypes ?? []).includes(br.breaker.breaksSubtype)
        ) {
          continue;
        }
        if (effectiveBreakerStrength(state, breakerId) < iceStr) continue;
        const free =
          enc.freeBreaksRemaining?.breakerId === breakerId &&
          (enc.freeBreaksRemaining.remaining ?? 0) > 0;
        if (!free && state.runner.credits < br.breaker.breakCredits) continue;
        actions.push({
          type: "break_subroutine",
          breakerId,
          subIndex: i,
        });
      }
      if (
        (ice.subtypes ?? []).includes("bioroid") &&
        state.runner.clicks >= 1
      ) {
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
            if (state.corp.credits >= cost) {
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
              actions.push({
                type: "basic_install",
                cardId: id,
                destination: { kind: "rig" },
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
            if (card.type === "event") {
              const cost = card.playCost ?? 0;
              if (state.runner.credits >= cost) {
                actions.push({ type: "play_event", cardId: id });
              }
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
