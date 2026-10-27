import { runnerIsTagged } from "./tags.js";
/** Central / remote breach access candidate building (CR 7.3–7.4). */

import { log } from "./createGame.js";
import { applyRunAccessRestrictions } from "./accessFilter.js";
import type { Effect } from "../effects/ir.js";
import type { GameState, ServerId } from "./types.js";
import { CR } from "../timing/labels.js";
import { maybeRipDeal } from "./cardDeclarations.js";
import { fireStoredConditionals } from "./storedTriggers.js";
import {
  fireOnArchivesFacedownTurnedFaceupGte,
} from "./miscConditionalHooks.js";

/** The Twinning: remove power for bonus HQ/R&D access at breach begin. */
function applyTwinningBonusAccess(state: GameState, serverId: ServerId): void {
  if (serverId !== "hq" && serverId !== "rd") return;
  const run = state.run;
  if (!run) return;
  for (const id of state.runner.installed) {
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
 * Medium: on R&D breach, choose a number less than hosted virus counters
 * for additional card access.
 * Nerve Agent: same on HQ breach.
 */
function offerMediumBreachBonusAccess(
  state: GameState,
  serverId: ServerId,
): boolean {
  if (serverId !== "rd" && serverId !== "hq") return false;
  const run = state.run;
  if (!run) return false;
  if (state.pendingChoice) return false;
  if (run.mediumBreachPending) return false;
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    const matches =
      (serverId === "rd" && card?.chooseBonusAccessLessThanVirusOnRdBreach) ||
      (serverId === "hq" && card?.chooseBonusAccessLessThanVirusOnHqBreach);
    if (!matches) continue;
    const virus = card.virusCounters ?? 0;
    const options: Array<{ id: string; label: string; effect: Effect }> = [];
    for (let n = 0; n < virus; n++) {
      options.push({
        id: `medium-bonus:${n}`,
        label:
          n === 0
            ? "Access no additional cards"
            : `Access ${n} additional card(s)`,
        effect: {
          op: "do",
          action: { kind: "bonus_access", amount: n },
        },
      });
    }
    if (options.length === 0) {
      // 0 virus → no positive choice; no additional access, continue.
      continue;
    }
    state.pendingChoice = { sourceId: id, chooser: "runner", options };
    run.mediumBreachPending = true;
    log(
      state,
      `${card.title} — choose a number less than ${virus} virus for bonus ${serverId.toUpperCase()} access.`,
    );
    return true;
  }
  return false;
}

/**
 * Rotary: whenever breaching HQ/R&D, may take 1 tag to access +N.
 */
function offerRotaryBreachBonusAccess(
  state: GameState,
  serverId: ServerId,
): boolean {
  if (serverId !== "hq" && serverId !== "rd") return false;
  const run = state.run;
  if (!run) return false;
  if (state.pendingChoice) return false;
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    const amount = card?.mayTakeTagForBonusAccessOnHqRdBreach;
    if (!amount || amount <= 0) continue;
    state.pendingChoice = {
      sourceId: id,
      chooser: "runner",
      options: [
        {
          id: "rotary-tag-bonus",
          label: `Take 1 tag: access ${amount} additional card(s)`,
          effect: {
            op: "seq",
            effects: [
              {
                op: "do",
                action: { kind: "give_tags", amount: 1 },
              },
              {
                op: "do",
                action: { kind: "bonus_access", amount },
              },
            ],
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
    run.mercuryBreachPending = true;
    log(
      state,
      `${card.title} — may take 1 tag to access +${amount} on ${serverId}.`,
    );
    return true;
  }
  return false;
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
  for (const id of state.runner.installed) {
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
  for (const id of state.runner.installed) {
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
 * Cupellation: when breaching HQ with a hosted Corp card, may pay 1¢ and trash
 * for bonus access (Effect on the program).
 */
function offerCupellationHqBreach(state: GameState, serverId: ServerId): boolean {
  if (serverId !== "hq") return false;
  const run = state.run;
  if (!run || run.cupellationBreachResolved) return false;
  if (state.runner.credits < 1) return false;
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.onBreachHqIfHostingCorpCard) continue;
    const hosted = card.hostedCardIds ?? [];
    const hasCorp = hosted.some((hid) => state.cards[hid]?.side === "corp");
    if (!hasCorp) continue;
    fireStoredConditionals(state, [
      {
        abilityKey: "on-breach-hq-if-hosting-corp",
        sourceId: id,
        controller: "runner",
        mandatory: true,
        effectKey: "onBreachHqIfHostingCorpCard",
        logLine: `${card.title} becomes pending — HQ breach while hosting Corp card.`,
      },
    ]);
    run.cupellationBreachResolved = true;
    if (state.pendingChoice) {
      run.cupellationBreachPending = true;
      log(
        state,
        `${card.title} — may pay and trash for bonus HQ access (hosting Corp card).`,
      );
      return true;
    }
  }
  return false;
}

/**
 * Akiko Nisei-class: fire identity (and installed) onBreachRd before building
 * R&D access candidates. Psi / pendingChoice pauses until resolved.
 */
function offerOnBreachRd(state: GameState, serverId: ServerId): boolean {
  if (serverId !== "rd") return false;
  const run = state.run;
  if (!run || run.onBreachRdResolved) return false;
  const sources: string[] = [];
  if (state.runner.identityId) sources.push(state.runner.identityId);
  for (const id of state.runner.installed) {
    if (!sources.includes(id)) sources.push(id);
  }
  for (const id of sources) {
    const card = state.cards[id];
    if (!card?.onBreachRd) continue;
    fireStoredConditionals(state, [
      {
        abilityKey: "on-breach-rd",
        sourceId: id,
        controller: "runner",
        mandatory: true,
        effectKey: "onBreachRd",
        logLine: `${card.title} becomes pending — R&D breach.`,
      },
    ]);
    run.onBreachRdResolved = true;
    if (state.pendingChoice || state.psi) {
      run.onBreachRdPending = true;
      log(state, `${card.title} — onBreachRd (psi/choice before R&D access).`);
      return true;
    }
    // Non-interactive onBreachRd already applied (e.g. future effects).
    break;
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
 * Multi-access: `randomAccessLimit` tracks how many more central accesses
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
      `Breach begins with ${run.accessCandidates.length} preset candidate(s) (access up to ${run.randomAccessLimit ?? "all"}).`,
    );
    return;
  }

  if (offerWakeImplantBonusAccess(state, serverId)) {
    return;
  }

  if (offerMercuryBreachBonusAccess(state, serverId)) {
    return;
  }

  if (offerMediumBreachBonusAccess(state, serverId)) {
    return;
  }

  if (offerRotaryBreachBonusAccess(state, serverId)) {
    return;
  }

  if (offerCupellationHqBreach(state, serverId)) {
    return;
  }

  if (offerOnBreachRd(state, serverId)) {
    return;
  }

  applyTwinningBonusAccess(state, serverId);

  // Climactic Showdown: first HQ/R&D breach this turn → +N access.
  if (
    (serverId === "hq" || serverId === "rd") &&
    (state.turn.climacticBonusAccessOnFirstHqRdBreach ?? 0) > 0
  ) {
    const n = state.turn.climacticBonusAccessOnFirstHqRdBreach;
    state.turn.climacticBonusAccessOnFirstHqRdBreach = 0;
    run.bonusAccess = (run.bonusAccess ?? 0) + n;
    log(state, `Climactic Showdown — access +${n} on first ${serverId} breach.`);
  }

  if (offerPrettyMaryBreachBonusAccess(state, serverId)) {
    return;
  }

  // Manuel: +N access on HQ/R&D breach while tagged.
  if (
    (serverId === "hq" || serverId === "rd") &&
    runnerIsTagged(state)
  ) {
    let bonus = 0;
    for (const rid of state.runner.installed) {
      const n = state.cards[rid]?.bonusAccessOnHqRdBreachWhileTagged ?? 0;
      if (n > 0) bonus += n;
    }
    if (bonus > 0) {
      run.bonusAccess = (run.bonusAccess ?? 0) + bonus;
      log(state, `Manuel — access +${bonus} while tagged on ${serverId}.`);
    }
  }

  // HQ Interface / R&D Interface: +N access whenever breaching that central.
  if (serverId === "hq" || serverId === "rd") {
    let bonus = 0;
    let sourceTitle: string | null = null;
    for (const rid of state.runner.installed) {
      const card = state.cards[rid];
      const n =
        serverId === "hq"
          ? (card?.bonusAccessOnHqBreach ?? 0)
          : (card?.bonusAccessOnRdBreach ?? 0);
      if (n > 0) {
        bonus += n;
        sourceTitle ??= card!.title;
      }
    }
    if (bonus > 0) {
      run.bonusAccess = (run.bonusAccess ?? 0) + bonus;
      log(
        state,
        `${sourceTitle ?? "Interface"} — access +${bonus} on ${serverId} breach.`,
      );
    }
  }

  if (server.kind === "remote") {
    run.accessCandidates = [...server.root];
    run.randomAccessLimit = run.accessCandidates.length;
    applyRunAccessRestrictions(state);
    log(
      state,
      `Breach begins on ${serverId} with ${run.accessCandidates.length} candidate(s) (CR ${CR.breach.number}, ${CR.remoteCandidates.number}).`,
    );
    return;
  }

  // Centrals
  const upgrades = run.cannotAccessRoot ? [] : [...server.root];
  if (run.cannotAccessRoot && server.root.length > 0) {
    log(
      state,
      `Breach ${serverId} — cannot access ${server.root.length} root card(s).`,
    );
  }
  if (serverId === "archives") {
    // All cards in Archives are candidates (CR 7.4.3).
    run.accessCandidates = [...state.corp.discardPile, ...upgrades];
    let turnedFaceup = 0;
    for (const id of state.corp.discardPile) {
      const c = state.cards[id];
      if (!c.faceup) {
        c.faceup = true;
        turnedFaceup++;
      }
    }
    if (turnedFaceup >= 2) {
      for (const rid of state.runner.installed) {
        const card = state.cards[rid];
        const spec = card?.onArchivesFacedownTurnedFaceupGte;
        if (!spec || turnedFaceup < spec.min) continue;
        fireOnArchivesFacedownTurnedFaceupGte(state, rid);
      }
    }
    run.randomAccessLimit = run.accessCandidates.length;
    log(
      state,
      `Breach Archives: ${run.accessCandidates.length} candidate(s) (CR ${CR.archivesAccess.number}, ${CR.breachArchivesFaceup.number}).`,
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

    // First HQ breach each turn → +N access (Docklands Pass; CR 7.4.2).
    // Prefer typed field; fall back to legacy defId until cards pin carries it.
    if (state.turn.hqBreachesThisTurn === 0 && hqCards.length > 1) {
      let bonus = 0;
      let sourceTitle: string | null = null;
      for (const rid of state.runner.installed) {
        const card = state.cards[rid];
        const n =
          card?.bonusAccessOnFirstHqBreachThisTurn ??
          (card?.defId === "docklands-pass" ? 1 : 0);
        if (n > 0) {
          bonus += n;
          sourceTitle ??= card!.title;
        }
      }
      for (let b = 0; b < bonus; b++) {
        const idx = hqCards.length - 2 - b;
        if (idx < 0) break;
        const extra = hqCards[idx]!;
        if (!run.accessCandidates.includes(extra)) {
          run.accessCandidates.push(extra);
          remaining += 1;
        }
      }
      if (bonus > 0 && sourceTitle) {
        log(state, `${sourceTitle} — access +${bonus} from HQ (first breach).`);
      }
    }
    // Climactic Showdown: first HQ or R&D breach this turn → +N access.
    if ((state.turn.climacticBonusAccessOnFirstHqRdBreach ?? 0) > 0) {
      const n = state.turn.climacticBonusAccessOnFirstHqRdBreach;
      state.turn.climacticBonusAccessOnFirstHqRdBreach = 0;
      run.bonusAccess = (run.bonusAccess ?? 0) + n;
      log(state, `Climactic Showdown — +${n} bonus access on first HQ breach.`);
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
    // The Gauntlet: +1 access per fully broken ice protecting HQ this run.
    {
      let gauntletBonus = 0;
      let gauntletTitle: string | null = null;
      for (const rid of state.runner.installed) {
        const card = state.cards[rid];
        if (!card?.bonusAccessOnHqBreachPerFullyBrokenProtectingIce) continue;
        const n = (run.inFullyBrokenHqProtectingIceIds ?? []).length;
        if (n > 0) {
          gauntletBonus += n;
          gauntletTitle ??= card.title;
        }
      }
      if (gauntletBonus > 0) {
        let added = 0;
        for (
          let i = hqCards.length - 1;
          i >= 0 && added < gauntletBonus;
          i--
        ) {
          const id = hqCards[i]!;
          if (!run.accessCandidates.includes(id)) {
            run.accessCandidates.push(id);
            remaining += 1;
            added += 1;
          }
        }
        if (added > 0 && gauntletTitle) {
          log(
            state,
            `${gauntletTitle} — access +${added} (fully broke ${gauntletBonus} HQ ice).`,
          );
        }
      }
    }
    run.randomAccessLimit = remaining + (run.bonusAccess ?? 0);
    // Avoid double-counting when we already expanded candidates above.
    if ((run.bonusAccess ?? 0) > 0) {
      run.randomAccessLimit = remaining;
    }
    log(
      state,
      `Breach HQ: access up to ${run.randomAccessLimit} (CR ${CR.hqAccess.number}, ${CR.breachCentralAccessCount.number}).`,
    );
    maybeRipDeal(state);
    applyRunAccessRestrictions(state);
    return;
  }

  if (serverId === "rd") {
    const top = state.corp.deck[0] ?? null;
    run.accessCandidates = top ? [top, ...upgrades] : [...upgrades];
    let remaining = top ? 1 + upgrades.length : upgrades.length;
    // Climactic Showdown: first HQ or R&D breach this turn → +N access.
    if ((state.turn.climacticBonusAccessOnFirstHqRdBreach ?? 0) > 0) {
      const n = state.turn.climacticBonusAccessOnFirstHqRdBreach;
      state.turn.climacticBonusAccessOnFirstHqRdBreach = 0;
      run.bonusAccess = (run.bonusAccess ?? 0) + n;
      log(state, `Climactic Showdown — +${n} bonus access on first R&D breach.`);
    }
    remaining += run.bonusAccess ?? 0;
    run.randomAccessLimit = remaining;
    refreshRdDeckCandidate(state);
    log(
      state,
      `Breach R&D: access up to ${run.randomAccessLimit} (CR ${CR.rdAccess.number}, ${CR.breachCentralAccessCount.number}).`,
    );
    applyRunAccessRestrictions(state);
    return;
  }

  run.accessCandidates = [...server.root];
  run.randomAccessLimit = run.accessCandidates.length;
  applyRunAccessRestrictions(state);
}

/**
 * R&D presents one deck card at a time: the topmost object the Runner has
 * not already chosen to access (CR 7.4.7a). Root upgrades stay candidates.
 */
export function refreshRdDeckCandidate(state: GameState): void {
  const run = state.run;
  if (!run || run.attackedServerId !== "rd") return;
  const deck = state.corp.deck;
  const inDeck = new Set(deck);
  const kept = run.accessCandidates.filter((id) => !inDeck.has(id));
  const prohibited = new Set([
    ...(run.forbiddenAccessCardIds ?? []),
    ...state.turn.cannotAccessCardIdsThisTurn,
  ]);
  const only =
    run.accessOnlyCardIds && run.accessOnlyCardIds.length > 0
      ? new Set(run.accessOnlyCardIds)
      : null;
  const accessed = new Set(run.accessedCardIds);
  let top: string | null = null;
  if (run.randomAccessLimit !== 0) {
    const order = run.accessFromBottomOfRd ? [...deck].reverse() : deck;
    for (const id of order) {
      if (accessed.has(id) || prohibited.has(id)) continue;
      if (only && !only.has(id)) continue;
      top = id;
      break;
    }
  }
  run.accessCandidates = top ? [top, ...kept] : [...kept];
}

export function isCentral(serverId: ServerId): boolean {
  return serverId === "hq" || serverId === "rd" || serverId === "archives";
}

/**
 * Shiro-class: arm a mid-encounter nested breach (CR 7.3). Caller must
 * `enterStep(state, "breach.begin")` then autoWalk; breach.complete resumes
 * the suspended ice encounter. Returns true when armed.
 */
export function armNestedBreachIfPending(state: GameState): boolean {
  const run = state.run;
  const pending = run?.pendingNestedBreach;
  if (!run || !pending) return false;
  if (
    state.pendingChoice ||
    state.pendingDamage ||
    state.pendingTrashProgram ||
    state.pendingSabotage ||
    state.pendingTags ||
    state.trace ||
    state.psi
  ) {
    return false;
  }
  run.pendingNestedBreach = undefined;
  if (run.encounter) {
    run.suspendedEncounter = structuredClone(run.encounter);
  }
  run.resumeEncounterIceId = pending.resumeIceId;
  run.attackedServerIdBeforeNestedBreach = run.attackedServerId;
  run.nestedBreachFromEncounter = true;
  run.attackedServerId = pending.server;
  run.cannotAccessRoot = pending.cannotAccessRoot ?? false;
  run.accessCandidates = [];
  run.randomAccessLimit = null;
  run.accessedCardIds = [];
  run.accessingCardId = null;
  run.accessCandidatesPreset = false;
  run.breachStoleOrTrashed = false;
  run.breached = false;
  run.phase = "breach";
  run.encounter = null;
  log(
    state,
    `Nested breach of ${pending.server} begins${
      pending.cannotAccessRoot ? " (cannot access root)" : ""
    } (CR ${CR.breach.number}).`,
  );
  return true;
}
