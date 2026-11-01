/**
 * Icebreaker strength-increase interrupt window (CR 9.9).
 *
 * System Seizure is a mandatory interrupt: the first time each turn the Runner
 * would increase an icebreaker's strength, for the remainder of the run that
 * icebreaker gains a duration rewrite (CR 9.9.5a / 9.9.9 / 1.2.1).
 */

import { log } from "./createGame.js";
import {
  maybeGrantSystemSeizureRunDuration,
  noteHostDurationReplacement,
  resolveStrengthIncreaseDuration,
  type StrengthIncreaseDuration,
} from "./hostDuration.js";
import {
  allocateEffectIdentity,
  applyActiveReplacementsAtInterruptOpen,
} from "./replacements.js";
import type { GameState, LingeringEffect } from "./types.js";
import { CR } from "../timing/labels.js";

// Kind strings match lingeringEffects.ts (avoid circular import).
const KIND_TURN = "breaker_strength_turn";
const KIND_RUN = "breaker_strength_run";
const KIND_ENCOUNTER = "breaker_strength_encounter";
const KIND_CHECKPOINT = "breaker_strength_checkpoint";

let commitSeq = 0;

function pushLingering(
  state: GameState,
  args: {
    createdBy: string;
    duration: LingeringEffect["duration"];
    kind: string;
    payload: { breakerId: string; amount: number };
  },
): void {
  const effect: LingeringEffect = {
    id: `le-str-${++commitSeq}`,
    createdBy: args.createdBy,
    independent: true,
    duration: args.duration,
    kind: args.kind,
    payload: args.payload,
  };
  state.lingeringEffects.push(effect);
  state.log.push(
    `Lingering effect ${effect.kind} (${effect.id}) created (CR ${CR.lingeringEffect.number}).`,
  );
}

/**
 * Apply a breaker strength increase through the interrupt window, then commit
 * the boost (with any active 9.9.9 duration rewrite).
 */
export function applyBreakerStrengthIncrease(
  state: GameState,
  args: {
    createdBy: string;
    breakerId: string;
    amount: number;
    requestedDuration: StrengthIncreaseDuration;
  },
): void {
  if (args.amount === 0) return;
  if (
    (args.requestedDuration === "encounter" ||
      args.requestedDuration === "run") &&
    !state.run
  ) {
    return;
  }

  // Nested duration redirect while a window is open — do not re-open.
  if (state.pendingStrengthIncrease) {
    commitResolvedStrengthIncrease(state, args);
    return;
  }

  // Decreases are not "would increase" (System Seizure / CR 9.9.5a).
  if (args.amount < 0) {
    commitResolvedStrengthIncrease(state, args);
    return;
  }

  const effectId = allocateEffectIdentity(
    state,
    `strength:${args.breakerId}`,
  );
  const expectedEffects = applyActiveReplacementsAtInterruptOpen(
    state,
    {
      strengthIncrease: {
        breakerId: args.breakerId,
        amount: args.amount,
        duration: args.requestedDuration,
      },
    },
    effectId,
  );
  const imminent = expectedEffects.strengthIncrease ?? {
    breakerId: args.breakerId,
    amount: args.amount,
    duration: args.requestedDuration,
  };
  state.pendingStrengthIncrease = {
    breakerId: imminent.breakerId,
    amount: imminent.amount,
    requestedDuration: imminent.duration,
    sourceId: args.createdBy,
    effectId,
    expectedEffects,
  };
  log(
    state,
    `Pending strength increase on ${state.cards[imminent.breakerId]?.title ?? imminent.breakerId} — interrupt window (CR ${CR.ordinalWould.number}).`,
  );

  // Mandatory System Seizure interrupt (no player choice).
  maybeGrantSystemSeizureRunDuration(state, imminent.breakerId, effectId);

  const pending = state.pendingStrengthIncrease;
  state.pendingStrengthIncrease = null;
  if (!pending || pending.amount === 0) return;

  commitResolvedStrengthIncrease(state, {
    createdBy: args.createdBy,
    breakerId: pending.breakerId,
    amount: pending.amount,
    requestedDuration: pending.requestedDuration,
  });
}

function commitResolvedStrengthIncrease(
  state: GameState,
  args: {
    createdBy: string;
    breakerId: string;
    amount: number;
    requestedDuration: StrengthIncreaseDuration;
  },
): void {
  if (args.amount === 0) return;
  if (args.amount < 0) {
    commitByDuration(state, args);
    return;
  }
  const resolved = resolveStrengthIncreaseDuration(
    state,
    args.breakerId,
    args.requestedDuration,
  );
  if (
    resolved.replacement?.trackWhileSourceActive &&
    resolved.original &&
    resolved.duration !== args.requestedDuration
  ) {
    noteHostDurationReplacement(state, {
      sourceId: resolved.replacement.sourceId,
      breakerId: args.breakerId,
      amount: args.amount,
      original: resolved.original,
      replacedTo: resolved.replacement.to,
    });
  }
  commitByDuration(state, {
    ...args,
    requestedDuration: resolved.duration,
  });
}

function commitByDuration(
  state: GameState,
  args: {
    createdBy: string;
    breakerId: string;
    amount: number;
    requestedDuration: StrengthIncreaseDuration;
  },
): void {
  switch (args.requestedDuration) {
    case "turn": {
      // Registry single-write (residual lingering migration).
      pushLingering(state, {
        createdBy: args.createdBy,
        duration: { kind: "turn" },
        kind: KIND_TURN,
        payload: { breakerId: args.breakerId, amount: args.amount },
      });
      return;
    }
    case "run": {
      if (!state.run) return;
      pushLingering(state, {
        createdBy: args.createdBy,
        duration: { kind: "run" },
        kind: KIND_RUN,
        payload: { breakerId: args.breakerId, amount: args.amount },
      });
      return;
    }
    case "encounter": {
      if (!state.run) return;
      pushLingering(state, {
        createdBy: args.createdBy,
        duration: { kind: "encounter" },
        kind: KIND_ENCOUNTER,
        payload: { breakerId: args.breakerId, amount: args.amount },
      });
      return;
    }
    case "checkpoint": {
      pushLingering(state, {
        createdBy: args.createdBy,
        duration: { kind: "until_checkpoint" },
        kind: KIND_CHECKPOINT,
        payload: { breakerId: args.breakerId, amount: args.amount },
      });
      return;
    }
  }
}
