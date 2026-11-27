/**
 * Tag primitives. Give, remove, and prevent tags. Card-specific tag
 * abilities stay in eval.ts.
 */
import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { onTagsRemoved } from "../../state/cardFlags/cardDeclarations.js";
import {
  hasPayableTagInterrupt,
  openPendingTags,
  preventPendingTags,
} from "../../state/keywordsAndCredits/tags.js";
import {
  fireOnFirstAvoidOrRemoveTagThisTurn,
  fireOnRemoveTags,
  fireOnTakeTagsWhenUntagged,
  fireMeatDamageWhenRunnerTakesTags,
} from "../../state/hostingAndTrash/trashHooks.js";
import type { GameState, RuleCite } from "../../state/types.js";
import { CR } from "../../timing/labels.js";
import type { EffectCtx } from "../eval.js";
import { abilityCreditTally } from "./creditTally.js";
import type { Effect } from "../ir/effect.js";
import type { Primitive } from "../ir/primitive.js";
import { fireOnFirstTagThisTurn } from "../../state/triggers/miscConditionalHooks.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

type EvalEffect = (ctx: EffectCtx, effect: Effect) => PrimResult;

function findPreventFirstTagEachRun(state: GameState): string | null {
  const idCard = state.cards[state.runner.identityId];
  if (
    idCard?.preventFirstTagEachRun &&
    !abilitiesSuppressed(state, idCard.id)
  ) {
    return idCard.id;
  }
  for (const rid of state.runner.installed) {
    if (abilitiesSuppressed(state, rid)) continue;
    if (state.cards[rid]?.preventFirstTagEachRun) return rid;
  }
  return null;
}

/**
 * The run during which the Runner would take tags, or null outside a run.
 * Jesminder Sareen prints "the first time each run you would take 1 or more
 * tags": the run records that first time, so a second run in the same turn
 * meets it again (CR 1.2.1, 9.9.5a).
 */
function runForTags(state: GameState): GameState["run"] {
  return state.run && !state.run.isPostRunBreach ? state.run : null;
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
  const preventSrc = findPreventFirstTagEachRun(state);
  if (!preventSrc) return true;
  const run = runForTags(state);
  // The first tags this run would be prevented by 1, so 1 tag is unpayable.
  if (run && !run.runnerWouldTakeTagsThisRun && amount === 1) return false;
  return true;
}

function giveTags(
  ctx: EffectCtx,
  amountIn: number,
  cannotBeAvoided: boolean,
): PrimResult {
  const { state, sourceId } = ctx;
  const run = runForTags(state);
  const firstThisRun = Boolean(
    run && amountIn > 0 && !run.runnerWouldTakeTagsThisRun,
  );
  if (run && amountIn > 0) run.runnerWouldTakeTagsThisRun = true;
  // "Cannot be avoided" wins over Dorm Computer's prevention (CR 1.2.2,
  // 9.9.5: prevent and avoid are synonymous).
  if (state.run?.preventAllTagsThisRun && !cannotBeAvoided) {
    log(state, `Dorm Computer — prevent all tags this run.`);
    return { ok: true };
  }
  const tagsBefore = state.runner.tags;
  const beforeTags = state.turn.tagsGivenThisTurn;
  let amount = amountIn;
  const preventSrc = findPreventFirstTagEachRun(state);
  if (!cannotBeAvoided && preventSrc && firstThisRun) {
    amount -= 1;
    log(
      state,
      `${state.cards[preventSrc]!.title} — prevent 1 tag (first time this run, CR ${CR.ordinalWould.number}).`,
    );
  } else if (
    !cannotBeAvoided &&
    preventSrc &&
    !run &&
    amount > 0 &&
    beforeTags === 0
  ) {
    log(
      state,
      `${state.cards[preventSrc]!.title} — the run has ended, so this tag is not during a run (CR ${CR.checkpointAfterTimingStructure.number}).`,
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
  fireMeatDamageWhenRunnerTakesTags(state);
  fireOnTakeTagsWhenUntagged(state, tagsBefore, amount);
  if (state.runner.tags > 0) {
    for (const id of [...state.runner.installed]) {
      if (abilitiesSuppressed(state, id)) continue;
      const res = state.cards[id];
      if (!res?.trashSelfWhenRunnerTagged) continue;
      trashCard(state, id);
      log(state, `${res.title} — trashed (Runner is tagged).`);
    }
  }
  if (beforeTags === 0 && amount > 0) {
    // Phase 3: MetPending only; mark at next 10.3.1a.
    fireOnFirstTagThisTurn(state, state.corp.identityId);
  }
  return { ok: true };
}

export function applyTagPrimitive(
  ctx: EffectCtx,
  action: Primitive,
  _evalEffect: EvalEffect,
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
      return giveTags(ctx, amount, Boolean(action.cannotBeAvoided));
    }
    case "give_tags_equal_to_last_trace_excess": {
      const n = Math.max(0, state.turn.lastTraceExcess ?? 0);
      log(
        state,
        `${source.title} — give ${n} tag(s) equal to lastTraceExcess.`,
      );
      if (n <= 0) return { ok: true };
      return giveTags(ctx, n, false);
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
      if (removed > 0) onTagsRemoved(state);
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
