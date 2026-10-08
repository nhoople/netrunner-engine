/**
 * Tag primitives. Give, remove, and prevent tags. Card-specific tag
 * abilities stay in eval.ts.
 */
import { log } from "../state/createGame.js";
import {
  hasPayableTagInterrupt,
  openPendingTags,
  preventPendingTags,
} from "../state/tags.js";
import {
  fireOnFirstAvoidOrRemoveTagThisTurn,
  fireOnRemoveTags,
  fireOnTakeTagsWhenUntagged,
  moveRunnerCardToHeap,
} from "../state/trashHooks.js";
import type { GameState, RuleCite } from "../state/types.js";
import { CR } from "../timing/labels.js";
import type { EffectCtx } from "./eval.js";
import { abilityCreditTally } from "./creditTally.js";
import type { Effect, Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

type EvalEffect = (ctx: EffectCtx, effect: Effect) => PrimResult;

function findPreventFirstTagThisTurn(state: GameState): string | null {
  const idCard = state.cards[state.runner.identityId];
  if (idCard?.preventFirstTagThisTurn) return idCard.id;
  for (const rid of state.runner.rig) {
    if (state.cards[rid]?.preventFirstTagThisTurn) return rid;
  }
  return null;
}

/**
 * Nested cost "take N tags" is unpayable when a static/mandatory interrupt
 * would prevent that tag payment (CR 1.16.1b).
 */
export function canPayTakeTagsNestedCost(
  state: GameState,
  amount: number,
): boolean {
  if (amount <= 0) return true;
  const preventSrc = findPreventFirstTagThisTurn(state);
  if (!preventSrc) return true;
  // First tag this turn would be fully prevented for amount === 1.
  if (state.turn.tagsGivenThisTurn === 0 && amount === 1) return false;
  return true;
}

function giveTags(
  ctx: EffectCtx,
  amountIn: number,
  cannotBeAvoided: boolean,
  evalEffect: EvalEffect,
): PrimResult {
  const { state, sourceId } = ctx;
  if (state.turn.bbPreventAllTagsThisRun) {
    log(state, `Dorm Computer — prevent all tags this run.`);
    return { ok: true };
  }
  const tagsBefore = state.runner.tags;
  const beforeTags = state.turn.tagsGivenThisTurn;
  let amount = amountIn;
  const preventSrc = findPreventFirstTagThisTurn(state);
  if (!cannotBeAvoided && preventSrc && beforeTags === 0 && amount > 0) {
    amount -= 1;
    log(
      state,
      `${state.cards[preventSrc]!.title} — prevent 1 tag (first this turn).`,
    );
  }
  if (amount <= 0) {
    // Still count the prevented instance so further tags this turn land.
    state.turn.tagsGivenThisTurn += 1;
    return { ok: true };
  }
  // Tag interrupt PAW when a payable avoid ability exists (Decoy-class).
  // NBN: Controlling the Message — cannotBeAvoided skips Decoy-class interrupts.
  if (!cannotBeAvoided && !state.pendingTags && hasPayableTagInterrupt(state)) {
    openPendingTags(state, amount, sourceId);
    return { ok: true };
  }
  state.runner.tags += amount;
  state.turn.tagsGivenThisTurn += amount;
  log(
    state,
    `Runner receives ${amount} tag(s) → ${state.runner.tags} (CR ${CR.tags.number}).`,
  );
  fireOnTakeTagsWhenUntagged(state, tagsBefore, amount);
  if (state.runner.tags > 0) {
    for (const id of [...state.runner.rig]) {
      const res = state.cards[id];
      if (!res?.trashSelfWhenRunnerTagged) continue;
      moveRunnerCardToHeap(state, id);
      log(state, `${res.title} — trashed (Runner is tagged).`);
    }
  }
  if (beforeTags === 0 && amount > 0) {
    const idCard = state.cards[state.corp.identityId];
    if (idCard?.onFirstTagThisTurn) {
      const r = evalEffect(
        { state, sourceId: idCard.id },
        idCard.onFirstTagThisTurn,
      );
      if (!r.ok) return r;
    }
  }
  return { ok: true };
}

export function applyTagPrimitive(
  ctx: EffectCtx,
  action: Primitive,
  evalEffect: EvalEffect,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "give_tags": {
      let amount = action.amount;
      if (action.tally) {
        const tallied = abilityCreditTally(state, sourceId, action.tally);
        // A summed value of 0 or less does not happen (CR 9.12.2b).
        if (tallied.amount <= 0) return { ok: true };
        amount = tallied.amount;
      }
      return giveTags(
        ctx,
        amount,
        Boolean(action.cannotBeAvoided),
        evalEffect,
      );
    }
    case "give_tags_equal_to_last_trace_excess": {
      const n = Math.max(0, state.turn.lastTraceExcess ?? 0);
      log(
        state,
        `${source.title} — give ${n} tag(s) equal to lastTraceExcess.`,
      );
      if (n <= 0) return { ok: true };
      return giveTags(ctx, n, false, evalEffect);
    }
    case "remove_tags": {
      let amount = action.amount;
      if (action.tally) {
        const tallied = abilityCreditTally(state, sourceId, action.tally);
        // A summed value of 0 or less does not happen (CR 9.12.2b).
        if (tallied.amount <= 0) return { ok: true };
        amount = tallied.amount;
      }
      const removed = Math.min(amount, state.runner.tags);
      state.runner.tags -= removed;
      log(
        state,
        `Remove ${removed} tag(s) → ${state.runner.tags} (CR ${CR.tags.number}).`,
      );
      if (removed > 0) {
        const r = fireOnRemoveTags(state);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "prevent_pending_tags": {
      const before = state.pendingTags?.remaining ?? 0;
      preventPendingTags(state, action.amount);
      const after = state.pendingTags?.remaining ?? 0;
      if (before > after) {
        const r = fireOnFirstAvoidOrRemoveTagThisTurn(state);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
