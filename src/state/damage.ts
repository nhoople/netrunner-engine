/** Damage types + prevention hooks (CR 10.4). */

import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import { moveRunnerCardToHeap, beginGripOrStackTrashBatch, endGripOrStackTrashBatch } from "./trashHooks.js";
import type { DamageType, GameState } from "./types.js";
import { CR } from "../timing/labels.js";
import { recomputeRunnerMaxHandSize } from "./handSize.js";
import { scoredAgendaMeatDamageIncrease } from "./breakerMods.js";
import { abilitiesSuppressed } from "./abilities.js";
import { pickRandomSubset } from "./rng.js";
import { fireRunnerValTrigger } from "../effects/sansanValHooks.js";

function trashToHeap(state: GameState, cardId: string): void {
  moveRunnerCardToHeap(state, cardId);
}

/** Core damage includes the older "brain damage" alias (CR §10.4.2c). */
export function isCoreDamageType(type: DamageType): boolean {
  return type === "core" || type === "brain";
}

/**
 * True when there is a payable `damage_interrupt_paw` ability
 * (AirbladeX / Plascrete / Prāna-class). Lightweight cost check to avoid
 * importing `costs.ts` (which itself imports `dealDamage`).
 *
 * When `damageType` is set, abilities with `requirePendingDamageTypes` must
 * include that type (or be untyped).
 */
export function hasPayableDamageInterrupt(
  state: GameState,
  damageType?: DamageType,
): boolean {
  const scan = (ids: string[], payer: "runner" | "corp"): boolean => {
    for (const id of ids) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (!card) continue;
      if (
        state.pendingDamage?.interruptUsedSourceIds?.includes(id)
      ) {
        continue;
      }
      for (const ab of card.paidAbilities ?? []) {
        if (!ab.windows.includes("damage_interrupt_paw")) continue;
        if (ab.requireDuringRun && !state.run) continue;
        if (
          damageType &&
          ab.requirePendingDamageTypes &&
          !ab.requirePendingDamageTypes.includes(damageType)
        ) {
          continue;
        }
        if (
          !damageType &&
          ab.requirePendingDamageTypes &&
          state.pendingDamage &&
          !ab.requirePendingDamageTypes.includes(state.pendingDamage.type)
        ) {
          continue;
        }
        const cost = ab.cost
          ? { ...ab.cost }
          : { clicks: ab.clickCost, credits: ab.creditCost };
        if ((cost.powerCounters ?? 0) > (card.powerCounters ?? 0)) continue;
        if (payer === "runner") {
          if ((cost.clicks ?? 0) > state.runner.clicks) continue;
          if ((cost.credits ?? 0) > state.runner.credits) continue;
        } else {
          if ((cost.clicks ?? 0) > state.corp.clicks) continue;
          if ((cost.credits ?? 0) > state.corp.credits) continue;
        }
        return true;
      }
    }
    return false;
  };

  if (scan(state.runner.rig, "runner")) return true;

  // Corp rezzed assets/upgrades/ice + identity (Prāna Condenser).
  const corpIds: string[] = [state.corp.identityId];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const c = state.cards[id];
      if (c?.rezzed) corpIds.push(id);
    }
  }
  return scan(corpIds, "corp");
}

/**
 * Apply damage. If interactive prevention is desired, set pendingDamage and
 * return "pending". Otherwise resolve with random simultaneous grip trash
 * (CR 10.4.2a / 10.4.3).
 *
 * Net/meat/core open a damage interrupt PAW when a payable prevent ability
 * exists (CR 9.9.3a / 9.9.5 / 10.4) — AirbladeX-class and Plascrete-class
 * (`requirePendingDamageTypes`). Explicit `interactive` / Hendrik lose-clicks
 * paths unchanged.
 */
export function dealDamage(
  state: GameState,
  type: DamageType,
  amount: number,
  sourceId: string,
  opts: {
    interactive?: boolean;
    preventByLoseAllClicks?: boolean;
    /** Suppress free prevent_damage; only interrupt paid abilities + accept. */
    interruptPawOnly?: boolean;
    /** Flare-class: skip prevention windows entirely (CR §10.4). */
    cannotPrevent?: boolean;
  } = {},
): "applied" | "pending" | "flatline" {
  if (amount <= 0) return "applied";

  if (state.turn.leveragePreventRunnerDamage) {
    log(state, `Leverage — prevent ${amount} ${type} damage.`);
    return "applied";
  }

  if (state.run?.preventAllDamageThisRun) {
    log(state, `Prevent all damage this run — prevent ${amount} ${type} damage.`);
    return "applied";
  }

  // Guru Davinder: auto-prevent net/meat; then pay N or trash.
  if (type === "net" || type === "meat") {
    for (const id of state.runner.rig) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      const pay = card?.autoPreventNetOrMeatDamagePayOrTrash;
      if (typeof pay !== "number") continue;
      log(state, `${card!.title} — prevent all ${amount} ${type} damage.`);
      if (state.runner.credits >= pay) {
        state.pendingChoice = {
          sourceId: id,
          chooser: "runner",
          options: [
            {
              id: "pay",
              label: `Pay ${pay}¢ to keep ${card!.title}`,
              effect: {
                op: "do",
                action: { kind: "lose_credits", side: "runner", amount: pay },
              },
            },
            {
              id: "trash",
              label: `Trash ${card!.title}`,
              effect: { op: "do", action: { kind: "trash_self" } },
            },
          ],
        };
      } else {
        // Must trash
        state.runner.rig = state.runner.rig.filter((x) => x !== id);
        moveRunnerCardToHeap(state, id);
        log(state, `${card!.title} — trashed (cannot pay ${pay}¢).`);
      }
      return "applied";
    }
  }

  if (type === "meat") {
    const bonus = scoredAgendaMeatDamageIncrease(state);
    if (bonus > 0) {
      amount += bonus;
      log(
        state,
        `Meat damage increased by ${bonus} from scored agenda(s) (The Cleaners-class).`,
      );
    }
    // Paparazzi: prevent all meat damage while installed.
    for (const id of state.runner.rig) {
      if (abilitiesSuppressed(state, id)) continue;
      const card = state.cards[id];
      if (card?.preventAllMeatDamage) {
        log(state, `${card.title} — prevent all ${amount} meat damage.`);
        return "applied";
      }
    }
  }

  if (opts.cannotPrevent) {
    log(
      state,
      `${amount} ${type} damage from ${sourceId} cannot be prevented.`,
    );
    return resolveDamage(state, type, amount, sourceId);
  }

  let interactive = Boolean(opts.interactive);
  let interruptPawOnly = Boolean(opts.interruptPawOnly);
  const canInterrupt = hasPayableDamageInterrupt(state, type);
  const damageOpensInterrupt =
    type === "net" || type === "meat" || isCoreDamageType(type);

  if (
    !interactive &&
    !opts.preventByLoseAllClicks &&
    damageOpensInterrupt &&
    canInterrupt
  ) {
    interactive = true;
    interruptPawOnly = true;
  }

  if (interactive) {
    state.pendingDamage = {
      type,
      remaining: amount,
      sourceId,
      ...(opts.preventByLoseAllClicks
        ? { preventByLoseAllClicks: true }
        : {}),
      ...(interruptPawOnly ? { interruptPawOnly: true } : {}),
    };
    log(
      state,
      `Pending ${amount} ${type} damage from ${sourceId} (CR ${CR.sufferDamage.number}${
        interruptPawOnly
          ? `; interrupt PAW ${CR.preventDamage.number}`
          : ""
      }).`,
    );
    return "pending";
  }

  return resolveDamage(state, type, amount, sourceId);
}

export function resolveDamage(
  state: GameState,
  type: DamageType,
  amount: number,
  sourceId: string,
): "applied" | "flatline" {
  const core = isCoreDamageType(type);
  const beforeCore = state.turn.coreDamageSufferedThisTurn;

  // Chrome Parlor: prevent damage from cybernetic when-installed abilities.
  const srcCard = state.cards[sourceId];
  if (
    srcCard &&
    srcCard.type === "hardware" &&
    (srcCard.subtypes ?? []).includes("cybernetic") &&
    (state.turn.installedThisTurn ?? []).includes(sourceId)
  ) {
    const parlor = state.runner.rig.some(
      (id) => state.cards[id]?.preventCyberneticInstallDamage,
    );
    if (parlor) {
      log(
        state,
        `Chrome Parlor — prevent ${amount} ${type} damage from cybernetic install.`,
      );
      return "applied";
    }
  }

  // First Responders / corp-sourced damage tracking.
  const src = state.cards[sourceId];
  if (src && src.side === "corp") {
    state.turn.esSufferedCorpDamageThisTurn = true;
  }

  // Jinteki: Potential Unleashed — on ≥1 net, trash top of stack.
  if (type === "net" && amount >= 1) {
    const idCard = state.cards[state.corp.identityId];
    if (idCard?.trashTopOfStackOnRunnerNetDamage && state.runner.deck.length > 0) {
      const top = state.runner.deck.shift()!;
      trashToHeap(state, top);
      log(
        state,
        `Jinteki: Potential Unleashed — trash top of stack (${state.cards[top]?.title ?? top}).`,
      );
    }
  }

  if (core) {
    // Defective Brainchips: first core damage each turn +N.
    if (!state.turn.uwFirstCoreDamageIncreasedThisTurn) {
      let bump = 0;
      for (const c of Object.values(state.cards)) {
        if (
          c.zone === "corp:play-area" &&
          c.increaseFirstCoreDamagePerTurn
        ) {
          bump = Math.max(bump, c.increaseFirstCoreDamagePerTurn);
        }
      }
      if (bump > 0) {
        amount += bump;
        state.turn.uwFirstCoreDamageIncreasedThisTurn = true;
        log(
          state,
          `Defective Brainchips — first core damage this turn +${bump}.`,
        );
      }
    }
    state.runner.brainDamage += amount;
    recomputeRunnerMaxHandSize(state);
    state.turn.coreDamageSufferedThisTurn += amount;
    log(
      state,
      `Core damage ${amount} → BD=${state.runner.brainDamage}, max hand ${state.runner.maxHandSize} (CR ${CR.coreDamage.number}; brain alias ${CR.brainDamage.number}).`,
    );
    // Also trash from grip like net/meat for the damage amount
  }

  let left = amount;
  const toTrash = Math.min(amount, state.runner.hand.length);
  // Chronos Protocol: first net damage each turn — Corp chooses grip cards.
  const chronosId = state.corp.identityId;
  const chronos = state.cards[chronosId];
  const chronosFirstNet =
    type === "net" &&
    chronos?.corpChoosesFirstNetDamageCardEachTurn &&
    !state.turn.uotChronosNetDamageUsedThisTurn &&
    toTrash > 0;
  if (chronosFirstNet) {
    state.turn.uotChronosNetDamageUsedThisTurn = true;
    state.turn.uotChronosTrashRemaining = toTrash;
    const grip = [...state.runner.hand];
    state.pendingChoice = {
      sourceId: chronosId,
      chooser: "corp",
      options: grip.map((id) => ({
        id: `chronos:${id}`,
        label: `Trash ${state.cards[id]!.title}`,
        effect: {
          op: "do" as const,
          action: {
            kind: "uot_chronos_trash_pick" as const,
            cardId: id,
          },
        },
      })),
    };
    log(
      state,
      `Chronos Protocol — look at grip; choose ${toTrash} card(s) to trash for first net damage.`,
    );
    // Core damage side effects already applied above when core; for net, mark applied via choice.
    return "applied";
  }
  // Titanium Ribs: Runner chooses — when installed, prefer grip order (engine
  // still opens a choice when grip size is small via pendingChoice elsewhere;
  // default path uses simultaneous trash with Runner preference = hand order).
  const ribs = state.runner.rig.some(
    (id) => state.cards[id]?.runnerChoosesDamageTrashFromGrip,
  );
  const picks = ribs
    ? state.runner.hand.slice(0, toTrash)
    : pickRandomSubset(state.runner.hand, toTrash);
  beginGripOrStackTrashBatch(state);
  for (const id of picks) {
    trashToHeap(state, id);
  }
  endGripOrStackTrashBatch(state);
  const trashed = picks.length;
  left -= trashed;

  const cite = core
    ? CR.coreDamage
    : type === "meat"
      ? CR.meatDamage
      : CR.netDamage;
  const label = core ? "core" : type;

  log(
    state,
    `${label} damage ${amount}: trashed ${trashed} from grip simultaneously (CR ${cite.number}, ${CR.multipleDamageSimultaneous.number}, ${CR.sufferDamage.number}) source=${sourceId}.`,
  );

  if (left > 0) {
    // Still owing damage with empty grip → flatline (CR 10.4.3 style).
    state.winner = "corp";
    state.winReason = "flatline";
    state.done = true;
    log(
      state,
      `Runner flatlined — could not suffer remaining ${left} ${label} damage (CR ${CR.flatline.number}).`,
    );
    state.pendingDamage = null;
    return "flatline";
  }

  if (state.runner.maxHandSize < 0) {
    state.winner = "corp";
    state.winReason = "flatline";
    state.done = true;
    log(state, `Runner flatlined — max hand size < 0 (CR ${CR.flatline.number}).`);
    state.pendingDamage = null;
    return "flatline";
  }

  state.pendingDamage = null;

  if (amount > 0 && !state.done) {
    fireRunnerValTrigger(
      state,
      "valDamageTriggerCount",
      (c) => c.onFirstDamageEachTurn,
      "onFirstDamageEachTurn",
    );
    const idCard = state.cards[state.corp.identityId];
    if (idCard?.powerCounterOnDamageOrTrashFromHq) {
      idCard.powerCounters = (idCard.powerCounters ?? 0) + 1;
      log(
        state,
        `${idCard.title} — place 1 power (damage) → ${idCard.powerCounters}.`,
      );
    }
    // Clan Vengeance: whenever you suffer any amount of damage, place 1 power.
    for (const rid of [...state.runner.rig]) {
      const rc = state.cards[rid];
      if (!rc?.placePowerCounterOnSufferAnyDamage) continue;
      rc.powerCounters = (rc.powerCounters ?? 0) + 1;
      log(
        state,
        `${rc.title} — place 1 power (suffered damage) → ${rc.powerCounters}.`,
      );
    }
  }

  // Sentinel Defense Program: continuous while scored — whenever the Runner
  // suffers core damage, fire the scored agenda's effect.
  if (core && amount > 0 && !state.done) {
    for (const id of [...state.corp.score]) {
      const scored = state.cards[id];
      if (!scored?.onSufferCoreDamage) continue;
      const r = evalEffect({ state, sourceId: id }, scored.onSufferCoreDamage);
      if (!r.ok) {
        log(state, `onSufferCoreDamage failed on ${scored.title}: ${r.error}`);
      }
      if (state.done) break;
    }
  }

  // First core damage this turn → Runner identity trigger (Esâ).
  if (core && beforeCore === 0 && amount > 0 && !state.done) {
    const idCard = state.cards[state.runner.identityId];
    if (idCard?.onFirstCoreDamageThisTurn) {
      const r = evalEffect(
        { state, sourceId: idCard.id },
        idCard.onFirstCoreDamageThisTurn,
      );
      if (!r.ok) {
        log(
          state,
          `onFirstCoreDamageThisTurn failed on ${idCard.title}: ${r.error}`,
        );
      }
    }
  }

  // Saisentan-class: when net damage from this encounter ice trashes cards of
  // the chosen type, do 1 net damage per such card (may chain).
  if (type === "net" && !state.done && picks.length > 0) {
    const enc = state.run?.encounter;
    const ice = enc ? state.cards[enc.iceId] : undefined;
    if (
      enc?.chosenCardType &&
      enc.iceId === sourceId &&
      ice?.amplifyNetDamageOnTrashChosenEncounterType
    ) {
      let amplify = 0;
      for (const id of picks) {
        if (state.cards[id]?.type === enc.chosenCardType) amplify += 1;
      }
      if (amplify > 0) {
        log(
          state,
          `${ice.title} — amplify ${amplify} net damage (trashed ${enc.chosenCardType}).`,
        );
        dealDamage(state, "net", amplify, sourceId);
      }
    }
  }

  return "applied";
}

export function preventPendingDamage(state: GameState, amount: number): void {
  const pending = state.pendingDamage;
  if (!pending) return;
  const prevented = Math.min(amount, pending.remaining);
  pending.remaining -= prevented;
  log(
    state,
    `Prevent ${prevented} ${pending.type} damage → ${pending.remaining} remaining (CR ${CR.preventDamage.number}).`,
  );
  if (pending.remaining <= 0) {
    state.pendingDamage = null;
  }
}

/** Prevent all pending damage by losing all remaining clicks (Mr. Hendrik). */
export function preventPendingDamageLoseAllClicks(state: GameState): void {
  const pending = state.pendingDamage;
  if (!pending?.preventByLoseAllClicks) return;
  const lost = state.runner.clicks;
  state.runner.clicks = 0;
  state.pendingDamage = null;
  log(
    state,
    `Runner loses ${lost} click(s) to prevent ${pending.remaining} ${pending.type} damage (CR ${CR.preventDamage.number}).`,
  );
}

export function acceptPendingDamage(state: GameState): "applied" | "flatline" {
  if (!state.pendingDamage) return "applied";
  const { type, remaining, sourceId } = state.pendingDamage;
  state.pendingDamage = null;
  return resolveDamage(state, type, remaining, sourceId);
}
