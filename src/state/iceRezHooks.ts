/**
 * Ice bypass / host rez-state / any-ice-rez conditionals (CR 9.6.2).
 * Host / any-ice / protecting-server notes for 10.3.1a (phase 3).
 */
import { abilitiesSuppressed } from "./abilities.js";
import { agendaPointsFor } from "./scoring.js";
import type { GameState, StoredConditionalEffectKey } from "./types.js";
import { syncMauiRecurringCredits } from "../effects/primitives/chooseGainShuffle.js";
import { noteBypassTriggers } from "./bypassHooks.js";
import { noteInlineConditional } from "./inlineConditionalHooks.js";
import { checkpointAfterInstruction } from "../legality/checkpoints.js";

export type IceRezAbilityPendingMark = {
  cardId: string;
  abilityKey: string;
  effectKey: StoredConditionalEffectKey;
  controller: "corp" | "runner";
  mandatory: boolean;
  logLine: string;
};

function pushMark(
  state: GameState,
  mark: IceRezAbilityPendingMark,
): void {
  if (!state.turn.iceRezAbilityPending) {
    state.turn.iceRezAbilityPending = [];
  }
  const q = state.turn.iceRezAbilityPending;
  if (
    q.some(
      (m) =>
        m.cardId === mark.cardId &&
        m.effectKey === mark.effectKey &&
        m.abilityKey === mark.abilityKey,
    )
  ) {
    return;
  }
  q.push(mark);
}

function checkpointIfNoted(state: GameState, openedBy: string): void {
  if ((state.turn.iceRezAbilityPending ?? []).length === 0) return;
  checkpointAfterInstruction(state, openedBy);
}

/**
 * Note ice + Runner-installed onBypass and Jeitinho-class heap install for
 * 10.3.1a (CR 9.6.2). Heap install is an optional inline conditional
 * (Paperclip-class), not a mid-hook pendingChoice.
 */
export function fireOnBypassTriggers(state: GameState, iceId: string): void {
  noteBypassTriggers(state, iceId);
  noteJeitinhoHeapInstallOnBypass(state);
  if (
    (state.turn.bypassPendingSourceIds ?? []).length > 0 ||
    (state.turn.inlineConditionalPending ?? []).length > 0
  ) {
    checkpointAfterInstruction(state, "bypass");
  }
}

/**
 * Jeitinho-class: while in the heap at Threat N, bypass notes a may-spend-
 * click install (CR 9.6.2 / 9.6.13c heap exception).
 */
function noteJeitinhoHeapInstallOnBypass(state: GameState): void {
  for (const id of [...state.runner.discardPile]) {
    // CR 9.12.1d — blanked heap sources do not note install-on-bypass.
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    const spec = card?.onBypassMayInstallFromHeap;
    if (!spec) continue;
    const threatPts = Math.max(
      agendaPointsFor(state, "corp"),
      agendaPointsFor(state, "runner"),
    );
    if (threatPts < spec.requiresThreat) continue;
    const installCost = card.installCost ?? 0;
    noteInlineConditional(state, {
      cardId: id,
      abilityKey: "heap-install-on-bypass",
      controller: "runner",
      mandatory: true,
      effect: {
        op: "choose",
        chooser: "runner",
        options: [
          {
            id: "install-from-heap",
            label: `Spend ${spec.clickCost}[click]: install ${card.title} from heap (${installCost}¢)`,
            effect: {
              op: "do",
              action: {
                kind: "install_heap_paying_click",
                cardId: id,
                clickCost: spec.clickCost,
              },
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
      },
      logLine: `${card.title} becomes pending — bypass (may spend ${spec.clickCost}[click] to install from heap; Threat ${spec.requiresThreat}).`,
      // Heap may-install fires from an inactive zone (CR 9.6.10 / 9.6.13c).
      independentOfSource: true,
    });
  }
}

/** Queue trojan onHostRezzed / onHostDerezzed for ice that stayed installed. */
export function noteHostRezStateTriggers(
  state: GameState,
  iceId: string,
  kind: "rez" | "derez",
): void {
  const effectKey = kind === "rez" ? "onHostRezzed" : "onHostDerezzed";
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (card?.hostId !== iceId) continue;
    if (kind === "rez" ? !card.onHostRezzed : !card.onHostDerezzed) continue;
    pushMark(state, {
      cardId: id,
      abilityKey: kind === "rez" ? "on-host-rezzed" : "on-host-derezzed",
      effectKey,
      controller: "runner",
      mandatory: true,
      logLine: `${card.title} becomes pending — host ice ${kind === "rez" ? "rezzed" : "derezzed"}.`,
    });
  }
}

/** Note then mark at 10.3.1a (phase 3). */
export function fireHostRezStateTriggers(
  state: GameState,
  iceId: string,
  kind: "rez" | "derez",
): void {
  noteHostRezStateTriggers(state, iceId, kind);
  checkpointIfNoted(state, `host.${kind}`);
}

/** Queue onAnyIceRez + onRezIceProtectingThisServer. */
export function noteOnAnyIceRez(state: GameState, iceId: string): void {
  const ice = state.cards[iceId];
  if (!ice || ice.type !== "ice" || !ice.rezzed) return;
  const note = (cardId: string): void => {
    if (abilitiesSuppressed(state, cardId)) return;
    const card = state.cards[cardId];
    if (!card?.onAnyIceRez) return;
    pushMark(state, {
      cardId,
      abilityKey: "on-any-ice-rez",
      effectKey: "onAnyIceRez",
      controller: "runner",
      mandatory: true,
      logLine: `${card.title} becomes pending — any ice rezzed.`,
    });
  };
  note(state.runner.identityId);
  for (const id of state.runner.installed) note(id);

  let iceServer: string | null = null;
  for (const [sid, server] of Object.entries(state.servers)) {
    if (server.ice.includes(iceId)) {
      iceServer = sid;
      break;
    }
  }
  if (!iceServer) return;
  for (const rid of state.servers[iceServer as keyof typeof state.servers]
    ?.root ?? []) {
    if (abilitiesSuppressed(state, rid)) continue;
    const up = state.cards[rid];
    if (!up?.rezzed || !up.onRezIceProtectingThisServer) continue;
    pushMark(state, {
      cardId: rid,
      abilityKey: "on-rez-ice-protecting-this-server",
      effectKey: "onRezIceProtectingThisServer",
      controller: "corp",
      mandatory: true,
      logLine: `${up.title} becomes pending — ice protecting this server rezzed.`,
    });
  }
}

/** Note then mark at 10.3.1a; sync Maui recurring after (phase 3). */
export function fireOnAnyIceRez(state: GameState, iceId: string): void {
  noteOnAnyIceRez(state, iceId);
  checkpointIfNoted(state, "ice.anyRez");
  syncMauiRecurringCredits(state);
}
