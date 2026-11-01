/**
 * Street Magic: the Runner orders unbroken subroutines before the first one
 * resolves (CR 9.8.7d).
 */

import { log } from "../state/createGame.js";
import { abilitiesSuppressed } from "../state/abilities.js";
import type { GameState, RuleCite } from "../state/types.js";
import { CR } from "./labels.js";
import { openPendingChoose } from "../state/pendingChoice.js";


type OrderResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function streetMagicId(state: GameState): string | undefined {
  for (const id of state.runner.installed) {
    const card = state.cards[id];
    if (!card?.runnerChoosesUnbrokenSubroutineOrder) continue;
    if (abilitiesSuppressed(state, id)) continue;
    return id;
  }
  return undefined;
}

function unbrokenIndexes(state: GameState): number[] {
  const enc = state.run?.encounter;
  if (!enc) return [];
  return enc.broken.flatMap((broken, index) => (broken ? [] : [index]));
}

function openNextPick(state: GameState, sourceId: string): void {
  const pending = state.run?.pendingSubroutineOrder;
  const ice = state.run?.encounter
    ? state.cards[state.run.encounter.iceId]
    : undefined;
  const subs = ice?.subroutines ?? [];
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: (pending?.remaining ?? []).map((index) => ({
      id: `resolve-next:${index}`,
      label: subs[index]?.text ?? "subroutine",
      effect: {
        op: "do" as const,
        action: {
          kind: "gain_credits" as const,
          side: "runner" as const,
          amount: 0,
        },
      },
    })),
  });
}

function finishOrder(state: GameState, sourceId: string): void {
  const pending = state.run?.pendingSubroutineOrder;
  const iceId = state.run?.encounter?.iceId;
  if (!state.run || !pending || !iceId) return;
  const ice = state.cards[iceId];
  const subs = ice?.subroutines ?? [];
  state.run.subroutineResolveOrder = { iceId, indexes: [...pending.picked] };
  state.run.pendingSubroutineOrder = undefined;
  const texts = pending.picked
    .map((index) => `"${subs[index]?.text ?? "subroutine"}"`)
    .join(", then ");
  const source = state.cards[sourceId]?.title ?? "Street Magic";
  log(
    state,
    `${source} — the Runner orders the unbroken subroutines: ${texts} (CR ${CR.subroutineResolveOrder.number}).`,
  );
}

/** Open the order choice the first time this encounter would resolve a subroutine. */
export function maybeOfferSubroutineOrder(state: GameState): boolean {
  const run = state.run;
  const enc = run?.encounter;
  if (!run || !enc) return false;
  if (run.subroutineResolveOrder?.iceId === enc.iceId) return false;
  if (run.pendingSubroutineOrder) return false;
  const sourceId = streetMagicId(state);
  if (!sourceId) return false;
  const unbroken = unbrokenIndexes(state);
  if (unbroken.length < 2) return false;
  run.pendingSubroutineOrder = {
    sourceId,
    remaining: unbroken,
    picked: [],
  };
  openNextPick(state, sourceId);
  return true;
}

/** Index of the next subroutine to resolve, consuming a declared order. */
export function takeNextSubroutineIndex(state: GameState): number {
  const enc = state.run?.encounter;
  if (!enc) return -1;
  const order = state.run?.subroutineResolveOrder;
  if (order && order.iceId === enc.iceId) {
    while (order.indexes.length > 0 && enc.broken[order.indexes[0]!] !== false) {
      order.indexes.shift();
    }
    if (order.indexes.length > 0) {
      const index = order.indexes.shift()!;
      if (!enc.broken[index]) return index;
    }
  }
  return enc.broken.findIndex((broken) => !broken);
}

/** The Runner picked the next unbroken subroutine to resolve (CR 9.8.7d). */
export function chooseNextSubroutineToResolve(
  state: GameState,
  index: number,
): OrderResult {
  const pending = state.run?.pendingSubroutineOrder;
  if (!state.run || !pending) {
    return {
      ok: false,
      error: "No subroutine order is waiting.",
      cites: [CR.subroutineResolveOrder],
    };
  }
  if (!pending.remaining.includes(index)) {
    return {
      ok: false,
      error: "Choose the next unbroken subroutine.",
      cites: [CR.subroutineResolveOrder],
    };
  }
  pending.remaining = pending.remaining.filter((item) => item !== index);
  pending.picked.push(index);
  if (pending.remaining.length > 1) {
    openNextPick(state, pending.sourceId);
    return { ok: true };
  }
  if (pending.remaining.length === 1) pending.picked.push(pending.remaining[0]!);
  finishOrder(state, pending.sourceId);
  return { ok: true };
}
