/** Central / remote breach access candidate building (CR 7.3–7.4). */

import { log } from "./createGame.js";
import type { GameState, ServerId } from "./types.js";
import { CR } from "../timing/labels.js";

/**
 * Build access candidates when breaching a server.
 * Remotes: all root cards.
 * Archives: all cards in Archives (faceup after access prep).
 * HQ: one random card from HQ (v0: first card for determinism) + upgrades in root.
 * R&D: top card of R&D (+ upgrades in root).
 *
 * Multi-access: `accessRemaining` tracks how many more central accesses
 * are allowed (default 1 for HQ/R&D; Archives = all).
 */
export function beginBreachAccess(state: GameState): void {
  const run = state.run;
  if (!run) return;
  const serverId = run.attackedServerId;
  const server = state.servers[serverId];
  run.phase = "breach";
  run.accessingCardId = null;

  if (server.kind === "remote") {
    run.accessCandidates = [...server.root];
    run.accessRemaining = run.accessCandidates.length;
    log(
      state,
      `Breach begins on ${serverId} with ${run.accessCandidates.length} candidate(s) (CR ${CR.breach.number}, ${CR.remoteCandidates.number}).`,
    );
    return;
  }

  // Centrals
  const upgrades = [...server.root];
  if (serverId === "archives") {
    // All cards in Archives are candidates (CR 7.4.3).
    run.accessCandidates = [...state.corp.discard, ...upgrades];
    for (const id of state.corp.discard) {
      state.cards[id].faceup = true;
    }
    run.accessRemaining = run.accessCandidates.length;
    log(
      state,
      `Breach Archives: ${run.accessCandidates.length} candidate(s) (CR ${CR.archivesAccess.number}).`,
    );
    return;
  }

  if (serverId === "hq") {
    // Access 1 card from HQ (deterministic: last card in hand) + upgrades.
    const hqCards = [...state.corp.hand];
    const primary =
      hqCards.length > 0 ? hqCards[hqCards.length - 1]! : null;
    run.accessCandidates = primary ? [primary, ...upgrades] : [...upgrades];
    let remaining = primary ? 1 + upgrades.length : upgrades.length;

    // Docklands Pass: first HQ breach each turn → +1 access
    const docklands = state.runner.rig.some(
      (id) => state.cards[id].defId === "docklands-pass",
    );
    if (docklands && state.turn.hqBreachesThisTurn === 0 && hqCards.length > 1) {
      const extra = hqCards[hqCards.length - 2]!;
      if (!run.accessCandidates.includes(extra)) {
        run.accessCandidates.push(extra);
        remaining += 1;
        log(state, `Docklands Pass — access +1 from HQ.`);
      }
    }
    state.turn.hqBreachesThisTurn += 1;
    run.accessRemaining = remaining + (run.bonusAccess ?? 0);
    log(
      state,
      `Breach HQ: access up to ${run.accessRemaining} (CR ${CR.hqAccess.number}).`,
    );
    return;
  }

  if (serverId === "rd") {
    const top = state.corp.deck[0] ?? null;
    run.accessCandidates = top ? [top, ...upgrades] : [...upgrades];
    let remaining = top ? 1 + upgrades.length : upgrades.length;
    remaining += run.bonusAccess ?? 0;
    // Extra R&D cards when bonusAccess granted (Jailbreak / Conduit)
    if ((run.bonusAccess ?? 0) > 0 && state.corp.deck.length > 1) {
      for (
        let i = 1;
        i < state.corp.deck.length && i <= (run.bonusAccess ?? 0);
        i++
      ) {
        const id = state.corp.deck[i]!;
        if (!run.accessCandidates.includes(id)) {
          run.accessCandidates.push(id);
        }
      }
    }
    run.accessRemaining = remaining;
    log(
      state,
      `Breach R&D: access up to ${run.accessRemaining} (CR ${CR.rdAccess.number}).`,
    );
    return;
  }

  run.accessCandidates = [...server.root];
  run.accessRemaining = run.accessCandidates.length;
}

export function isCentral(serverId: ServerId): boolean {
  return serverId === "hq" || serverId === "rd" || serverId === "archives";
}
