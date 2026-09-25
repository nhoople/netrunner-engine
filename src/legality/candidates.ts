import type { Action, GameState, Server } from "../state/types.js";
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
  const step = getStep(state);

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

  if (step.key === "run.encounterPaw" && state.run?.encounter) {
    const enc = state.run.encounter;
    const ice = state.cards[enc.iceId];
    for (let i = 0; i < enc.broken.length; i++) {
      if (enc.broken[i]) continue;
      for (const breakerId of state.runner.rig) {
        const br = state.cards[breakerId];
        if (!br.breaker) continue;
        if (!(ice.subtypes ?? []).includes(br.breaker.breaksSubtype)) continue;
        if ((br.breaker.strength ?? 0) < (ice.strength ?? 0)) continue;
        if (state.runner.credits < br.breaker.breakCredits) continue;
        actions.push({
          type: "break_subroutine",
          breakerId,
          subIndex: i,
        });
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
    for (const id of state.run?.accessCandidates ?? []) {
      actions.push({ type: "access_card", cardId: id });
    }
    if ((state.run?.accessCandidates.length ?? 0) === 0) {
      actions.push({ type: "finish_breach" });
    }
    return actions;
  }

  if (step.kind === "action" && !state.run) {
    const p =
      state.activeSide === "corp" ? state.corp : state.runner;
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
      }
    }
  }

  return actions;
}
