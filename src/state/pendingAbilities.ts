/**
 * Pending conditional ability instances (CR 9.6.2) and reaction windows
 * (CR 10.3.2 / 9.2.8 / 9.2.8a). Lifecycle: pending → imminent → resolving →
 * done/cancelled; independence at imminent (CR 9.6.12 / 9.1.4).
 */
import { CR } from "../timing/labels.js";
import { abilitiesSuppressed } from "./abilities.js";
import type {
  GameState,
  PendingAbilityInstance,
  PendingAbilityPayload,
  PendingAbilityStatus,
  ReactionWindowFrame,
  Side,
} from "./types.js";

let pendingAbilitySeq = 0;
let reactionWindowSeq = 0;

export function resetPendingAbilitySeqForTests(): void {
  pendingAbilitySeq = 0;
  reactionWindowSeq = 0;
}

export function createPendingAbilityInstance(
  state: GameState,
  args: {
    abilityKey: string;
    sourceId: string;
    controller: Side;
    mandatory: boolean;
    payload?: PendingAbilityPayload;
    /** Persistent / already-independent abilities (CR 9.12.5b / 9.6.12). */
    independentOfSource?: boolean;
  },
): PendingAbilityInstance {
  const instance: PendingAbilityInstance = {
    id: `pa-${++pendingAbilitySeq}`,
    abilityKey: args.abilityKey,
    sourceId: args.sourceId,
    controller: args.controller,
    mandatory: args.mandatory,
    status: "pending",
    independentOfSource: Boolean(args.independentOfSource),
    windowId: null,
    ...(args.payload ? { payload: args.payload } : {}),
  };
  state.pendingAbilities.push(instance);
  return instance;
}

export function pendingAbilitiesWithStatus(
  state: GameState,
  status: PendingAbilityStatus = "pending",
): PendingAbilityInstance[] {
  return state.pendingAbilities.filter((p) => p.status === status);
}

export function findPendingAbility(
  state: GameState,
  id: string,
): PendingAbilityInstance | undefined {
  return state.pendingAbilities.find((p) => p.id === id);
}

/**
 * Mark an instance imminent: it becomes independent of its source
 * (CR 9.6.12) and 9.1.4 applies thereafter.
 */
export function markPendingAbilityImminent(
  state: GameState,
  id: string,
): PendingAbilityInstance | null {
  const inst = findPendingAbility(state, id);
  if (!inst || inst.status !== "pending") return null;
  inst.status = "imminent";
  inst.independentOfSource = true;
  state.log.push(
    `Pending ability ${inst.abilityKey} (${inst.id}) becomes imminent and independent of its source (CR ${CR.conditionalAbilityIndependent.number} / ${CR.abilityIndependent.number}).`,
  );
  return inst;
}

export function markPendingAbilityResolving(
  state: GameState,
  id: string,
): PendingAbilityInstance | null {
  const inst = findPendingAbility(state, id);
  if (!inst) return null;
  if (inst.status === "pending") markPendingAbilityImminent(state, id);
  if (inst.status !== "imminent" && inst.status !== "resolving") return null;
  inst.status = "resolving";
  return inst;
}

export function completePendingAbility(
  state: GameState,
  id: string,
  status: "done" | "cancelled" = "done",
): void {
  const inst = findPendingAbility(state, id);
  if (!inst) return;
  inst.status = status;
}

/**
 * Practical default for CR 9.6.10: a pending instance's source ability is
 * still active while the card remains in a play zone where abilities fire
 * and is not blanked. Heap / Archives / R&D / HQ / grip / stack are inactive.
 */
export function pendingAbilitySourceStillActive(
  state: GameState,
  inst: PendingAbilityInstance,
): boolean {
  const card = state.cards[inst.sourceId];
  if (!card) return false;
  // Identities stay in play for ability purposes even when their zone string
  // is the HQ/grip proxy used by createInitialState.
  const isIdentity =
    inst.sourceId === state.corp.identityId ||
    inst.sourceId === state.runner.identityId ||
    card.type === "identity";
  if (!isIdentity) {
    const z = card.zone ?? "";
    if (
      z === "runner:heap" ||
      z === "corp:archives" ||
      z === "runner:grip" ||
      z === "runner:stack" ||
      z === "corp:hq" ||
      z === "corp:rd" ||
      z === "runner:set-aside" ||
      z === "corp:set-aside" ||
      z.startsWith("out-of-play")
    ) {
      return false;
    }
  }
  // Blanked sources are inactive (CR 9.12.1d / 9.6.10).
  if (abilitiesSuppressed(state, inst.sourceId)) return false;
  return true;
}

/**
 * Cancel still-pending instances whose source ability is no longer active
 * (CR 9.6.10). Already-imminent / resolving instances are left alone
 * (CR 9.6.12 / 9.1.4).
 */
export function cancelPendingIfSourceInactive(
  state: GameState,
  isAbilityActive: (
    inst: PendingAbilityInstance,
  ) => boolean = (inst) => pendingAbilitySourceStillActive(state, inst),
): number {
  let cancelled = 0;
  for (const inst of state.pendingAbilities) {
    if (inst.status !== "pending") continue;
    if (inst.independentOfSource) continue;
    if (isAbilityActive(inst)) continue;
    inst.status = "cancelled";
    cancelled += 1;
    const title = state.cards[inst.sourceId]?.title ?? inst.sourceId;
    state.log.push(
      `${title} loses pending status — ability inactive (CR ${CR.pendingAbilityInactive.number}).`,
    );
  }
  return cancelled;
}

/** Drop finished instances so the bag stays small between windows. */
export function pruneSettledPendingAbilities(state: GameState): void {
  state.pendingAbilities = state.pendingAbilities.filter(
    (p) => p.status === "pending" || p.status === "imminent" || p.status === "resolving",
  );
}

/**
 * Open a reaction window for the given pending instance ids (CR 10.3.2 /
 * 9.2.8a). The set is fixed at open; later pendings need a new window.
 */
export function openReactionWindow(
  state: GameState,
  pendingInstanceIds: string[],
  afterCheckpointId: string | null,
): ReactionWindowFrame {
  const frame: ReactionWindowFrame = {
    id: `rw-${++reactionWindowSeq}`,
    afterCheckpointId,
    pendingInstanceIds: [...pendingInstanceIds],
    priorityHolder: state.activeSide,
    consecutivePasses: 0,
  };
  for (const id of pendingInstanceIds) {
    const inst = findPendingAbility(state, id);
    if (inst && inst.status === "pending") inst.windowId = frame.id;
  }
  state.reactionStack.push(frame);
  state.log.push(
    `Reaction window open ${frame.id} with ${pendingInstanceIds.length} pending instance(s) (CR ${CR.checkpointReaction.number} / ${CR.reactionWindowFixedSet.number}).`,
  );
  return frame;
}

export function closeReactionWindow(state: GameState, expectedId?: string): void {
  const frame = state.reactionStack.pop();
  if (!frame) return;
  if (expectedId && frame.id !== expectedId) {
    state.log.push(
      `Reaction window mismatch: expected ${expectedId}, closed ${frame.id}`,
    );
  }
  state.log.push(
    `Reaction window close ${frame.id} (CR ${CR.checkpointReaction.number}).`,
  );
}

export function currentReactionWindow(
  state: GameState,
): ReactionWindowFrame | null {
  return state.reactionStack[state.reactionStack.length - 1] ?? null;
}
