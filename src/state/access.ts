/** Central / remote breach access candidate building (CR 7.3–7.4). */

import { log } from "./createGame.js";
import { applyRunAccessRestrictions } from "./accessFilter.js";
import type { Effect } from "../effects/ir.js";
import type { GameState, ServerId } from "./types.js";
import { CR } from "../timing/labels.js";

/** The Twinning: remove power for bonus HQ/R&D access at breach begin. */
function applyTwinningBonusAccess(state: GameState, serverId: ServerId): void {
  if (serverId !== "hq" && serverId !== "rd") return;
  const run = state.run;
  if (!run) return;
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    const max = card.removePowerForBonusAccessOnHqRdBreach;
    if (!max || max <= 0) continue;
    const have = card.powerCounters ?? 0;
    if (have <= 0) continue;
    const rem = Math.min(max, have);
    card.powerCounters = have - rem;
    run.bonusAccess = (run.bonusAccess ?? 0) + rem;
    log(
      state,
      `${card.title} — remove ${rem} power for +${rem} access on ${serverId} → ${card.powerCounters} power.`,
    );
  }
}

/**
 * Mercury: once/turn when breaching HQ/R&D with no breaks this run,
 * may access +N additional cards.
 */
function offerMercuryBreachBonusAccess(
  state: GameState,
  serverId: ServerId,
): boolean {
  if (serverId !== "hq" && serverId !== "rd") return false;
  const run = state.run;
  if (!run) return false;
  if (state.turn.mercuryBreachBonusUsedThisTurn) return false;
  if ((run.breakersThatBroke ?? []).length > 0) return false;
  const idCard = state.cards[state.runner.identityId];
  const amount = idCard?.onBreachHqRdIfNoBreaksOncePerTurnMayBonusAccess;
  if (!amount || amount <= 0) return false;
  state.pendingChoice = {
    sourceId: idCard.id,
    chooser: "runner",
    options: [
      {
        id: "mercury-bonus",
        label: `Access ${amount} additional card(s)`,
        effect: {
          op: "do",
          action: { kind: "bonus_access", amount },
        },
      },
      {
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      },
    ],
  };
  state.turn.mercuryBreachBonusUsedThisTurn = true;
  run.mercuryBreachPending = true;
  log(
    state,
    `${idCard.title} — may access +${amount} (no breaks this run).`,
  );
  return true;
}

/**
 * Pretty Mary: when breaching R&D, if already allowed ≥ min R&D accesses,
 * may access +amount more.
 */
function offerPrettyMaryBreachBonusAccess(
  state: GameState,
  serverId: ServerId,
): boolean {
  if (serverId !== "rd") return false;
  const run = state.run;
  if (!run || run.prettyMaryBreachResolved) return false;
  // Base R&D access is 1 (top card) + existing bonusAccess.
  const allowed = 1 + (run.bonusAccess ?? 0);
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    const spec = card?.onBreachRdIfAccessGteMayBonusAccess;
    if (!spec) continue;
    if (allowed < spec.min) continue;
    const amount = spec.amount;
    if (amount <= 0) continue;
    state.pendingChoice = {
      sourceId: id,
      chooser: "runner",
      options: [
        {
          id: "pretty-mary-bonus",
          label: `Access ${amount} additional card(s)`,
          effect: {
            op: "do",
            action: { kind: "bonus_access", amount },
          },
        },
        {
          id: "decline",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ],
    };
    run.prettyMaryBreachResolved = true;
    run.mercuryBreachPending = true;
    log(
      state,
      `${card.title} — may access +${amount} (R&D access ≥ ${spec.min}).`,
    );
    return true;
  }
  return false;
}

/** Wake Implant: may remove up to N power for bonus R&D access. */
function offerWakeImplantBonusAccess(state: GameState, serverId: ServerId): boolean {
  if (serverId !== "rd") return false;
  const run = state.run;
  if (!run || run.wakeImplantResolved) return false;
  for (const id of state.runner.rig) {
    const card = state.cards[id];
    const max = card.maySpendPowerCountersForBonusRdAccess?.max ?? 0;
    if (max <= 0) continue;
    const have = card.powerCounters ?? 0;
    if (have <= 0) continue;
    const upTo = Math.min(max, have);
    const options: Array<{ id: string; label: string; effect: Effect }> = [];
    for (let n = 1; n <= upTo; n++) {
      options.push({
        id: `wake-access:${n}`,
        label: `Remove ${n} power for +${n} access`,
        effect: {
          op: "do",
          action: { kind: "spend_power_for_bonus_access", amount: n },
        },
      });
    }
    options.push({
      id: "decline",
      label: "Decline",
      effect: {
        op: "do",
        action: { kind: "gain_credits", side: "runner", amount: 0 },
      },
    });
    state.pendingChoice = { sourceId: id, chooser: "runner", options };
    run.wakeImplantPending = true;
    log(state, `${card.title} — may remove up to ${upTo} power for bonus R&D access.`);
    return true;
  }
  return false;
}

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
  run.breached = true;
  run.accessingCardId = null;

  if (run.accessCandidatesPreset) {
    run.accessCandidatesPreset = false;
    log(
      state,
      `Breach begins with ${run.accessCandidates.length} preset candidate(s) (access up to ${run.accessRemaining ?? "all"}).`,
    );
    return;
  }

  if (offerWakeImplantBonusAccess(state, serverId)) {
    return;
  }

  if (offerMercuryBreachBonusAccess(state, serverId)) {
    return;
  }

  applyTwinningBonusAccess(state, serverId);

  if (offerPrettyMaryBreachBonusAccess(state, serverId)) {
    return;
  }

  if (server.kind === "remote") {
    run.accessCandidates = [...server.root];
    run.accessRemaining = run.accessCandidates.length;
    applyRunAccessRestrictions(state);
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
    // Jailbreak / bonusAccess: add extra HQ cards to candidates
    if ((run.bonusAccess ?? 0) > 0 && hqCards.length > 1) {
      let added = 0;
      for (let i = hqCards.length - 2; i >= 0 && added < (run.bonusAccess ?? 0); i--) {
        const id = hqCards[i]!;
        if (!run.accessCandidates.includes(id)) {
          run.accessCandidates.push(id);
          remaining += 1;
          added += 1;
        }
      }
      if (added > 0) {
        log(state, `Bonus access +${added} from HQ.`);
      }
    }
    run.accessRemaining = remaining + (run.bonusAccess ?? 0);
    // Avoid double-counting when we already expanded candidates above.
    if ((run.bonusAccess ?? 0) > 0) {
      run.accessRemaining = remaining;
    }
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
  applyRunAccessRestrictions(state);
}

export function isCentral(serverId: ServerId): boolean {
  return serverId === "hq" || serverId === "rd" || serverId === "archives";
}
