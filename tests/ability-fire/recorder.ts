/**
 * Records which abilities resolve (CR audit tool 1.18). Not a test file.
 *
 * `tests/setup/ability-fire.ts` wraps two engine functions for every test
 * file, without changing `src/`:
 * - `evalEffect` as other modules call it, which sees the root of each tree
 *   the engine resolves for a card;
 * - `applyChooseCard`, the first step of every `do` (`applyPrimitive`), which
 *   sees each primitive, including those `eval.ts` resolves itself.
 *
 * Both pass here with the source card (`ctx.sourceId`). A tree that equals
 * one of that card's ability records (its instructions, or the `if` the
 * engine wraps around a record with a condition, or a `seq` of them, the way
 * load merges two records on one hook) marks those records. A primitive that
 * appears in exactly one of that card's records, or only in records with the
 * same instructions, marks them too. Records with the same instructions on
 * one card cannot be told apart and are marked together.
 *
 * It also wraps `collectCandidateActions`, which builds the legal actions
 * (`queryLegality`, `passIdle`), and records nothing while it runs: to see
 * whether an agenda's steal costs can be paid it tries the steal on a copy
 * of the state, and nothing on that copy resolves.
 *
 * Nothing is recorded unless a sink is open, so outside a recording the
 * wrappers cost one check per call.
 */
import type { Effect } from "../../src/effects/ir/effect.js";
import type { Primitive } from "../../src/effects/ir/primitive.js";
import type { GameState } from "../../src/state/types.js";
import { canonical, supportedAbilities } from "./abilities.js";

interface CardIndex {
  /** Canonical tree → keys of the records it is. */
  roots: Map<string, string[]>;
  /** Canonical primitive → keys of the records that contain it. */
  leaves: Map<string, string[]>;
}

let index: Map<string, CardIndex> | undefined;

function add(map: Map<string, string[]>, at: string, key: string): void {
  const list = map.get(at);
  if (!list) map.set(at, [key]);
  else if (!list.includes(key)) list.push(key);
}

function leavesOf(tree: unknown, out: unknown[] = []): unknown[] {
  if (!tree || typeof tree !== "object") return out;
  if (Array.isArray(tree)) {
    for (const item of tree) leavesOf(item, out);
    return out;
  }
  const node = tree as Record<string, unknown>;
  if (node.op === "do" && node.action) out.push(node.action);
  for (const value of Object.values(node)) leavesOf(value, out);
  return out;
}

function buildIndex(): Map<string, CardIndex> {
  const byCard = new Map<string, CardIndex>();
  const sameTree = new Map<string, string>();
  for (const ability of supportedAbilities()) {
    let entry = byCard.get(ability.cardId);
    if (!entry) {
      entry = { roots: new Map(), leaves: new Map() };
      byCard.set(ability.cardId, entry);
    }
    const tree = canonical(ability.instructions);
    sameTree.set(ability.key, tree);
    add(entry.roots, tree, ability.key);
    if (ability.condition) {
      add(
        entry.roots,
        canonical({
          op: "if",
          cond: ability.condition,
          then: ability.instructions,
        }),
        ability.key,
      );
    }
    for (const leaf of leavesOf(ability.instructions)) {
      add(entry.leaves, canonical(leaf), ability.key);
    }
  }
  // A primitive shared by records with different instructions says nothing
  // about which one resolved: drop it.
  for (const entry of byCard.values()) {
    for (const [leaf, keys] of entry.leaves) {
      const trees = new Set(keys.map((key) => sameTree.get(key)));
      if (trees.size > 1) entry.leaves.delete(leaf);
    }
  }
  return byCard;
}

/** Receives each ability key that resolves while it is open. */
export type Sink = (key: string) => void;

let sink: Sink | null = null;

/** Open `next` (or close, with null). Returns the previous sink. */
export function setSink(next: Sink | null): Sink | null {
  const previous = sink;
  sink = next;
  return previous;
}

/** Runs `fn` with recording paused. */
export function paused<T>(fn: () => T): T {
  if (!sink) return fn();
  const previous = setSink(null);
  try {
    return fn();
  } finally {
    setSink(previous);
  }
}

interface Ctx {
  state: GameState;
  sourceId: string;
}

function cardIndex(ctx: Ctx): CardIndex | undefined {
  const defId = ctx.state?.cards?.[ctx.sourceId]?.defId;
  if (!defId) return undefined;
  index ??= buildIndex();
  return index.get(defId);
}

function mark(keys: readonly string[] | undefined): boolean {
  if (!keys) return false;
  for (const key of keys) sink!(key);
  return true;
}

/** `evalEffect(ctx, effect)` is about to run. */
export function noteTree(ctx: Ctx, effect: Effect): void {
  if (!sink) return;
  const entry = cardIndex(ctx);
  if (!entry) return;
  if (mark(entry.roots.get(canonical(effect)))) return;
  if (effect.op === "seq") {
    for (const child of effect.effects) mark(entry.roots.get(canonical(child)));
  }
}

/** `applyPrimitive(ctx, action)` is about to run. */
export function notePrimitive(ctx: Ctx, action: Primitive): void {
  if (!sink) return;
  const entry = cardIndex(ctx);
  if (!entry) return;
  mark(entry.leaves.get(canonical(action)));
}
