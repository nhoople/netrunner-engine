/** Expose interrupt helpers (CR 1.21.4). */

import { log } from "./createGame.js";
import { abilitiesSuppressed } from "./abilities.js";
import type { GameState } from "./types.js";
import { CR } from "../timing/labels.js";

/** Installed, unrezzed Corp cards legal as expose targets. */
export function exposeLegalTargets(state: GameState): string[] {
  const out: string[] = [];
  for (const [, server] of Object.entries(state.servers)) {
    const blocked = [...server.root, ...server.ice].some(
      (id) =>
        state.cards[id]?.rezzed &&
        state.cards[id]?.cardsCannotBeExposedThisServer,
    );
    if (blocked) continue;
    for (const id of [...server.root, ...server.ice]) {
      const c = state.cards[id];
      if (!c || c.side !== "corp") continue;
      if (c.rezzed) continue;
      out.push(id);
    }
  }
  return out;
}

export function hasPayableExposeInterrupt(state: GameState): boolean {
  const corpIds: string[] = [state.corp.identityId];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const c = state.cards[id];
      if (c?.rezzed) corpIds.push(id);
    }
  }
  for (const id of corpIds) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card) continue;
    for (const ab of card.paidAbilities ?? []) {
      if (!ab.windows.includes("expose_interrupt_paw")) continue;
      const cost = ab.cost
        ? { ...ab.cost }
        : { clicks: ab.clickCost, credits: ab.creditCost };
      if ((cost.credits ?? 0) > state.corp.credits) continue;
      if (cost.trashSelf && !corpIds.includes(id) && !card.rezzed) continue;
      if (cost.trashSelf) {
        // asset must be rezzed/installed to trash as cost
        let installed = false;
        for (const server of Object.values(state.servers)) {
          if (server.root.includes(id) || server.ice.includes(id)) {
            installed = true;
            break;
          }
        }
        if (!installed) continue;
      }
      return true;
    }
  }
  return false;
}

/**
 * Offer Zaibatsu-class may-rez when a card would be exposed, then open
 * expose interrupt if payable prevent exists; otherwise complete expose.
 */
export function beginExpose(state: GameState, cardId: string): "pending" | "done" {
  const card = state.cards[cardId];
  if (!card || card.side !== "corp" || card.rezzed) {
    log(state, `Expose — invalid target ${cardId}.`);
    return "done";
  }
  const blackguard = state.runner.rig.some(
    (id) => state.cards[id]?.blackguardForceRezOnExpose,
  );
  if (blackguard && !card.rezzed) {
    const cost = card.rezCost ?? card.installCost ?? 0;
    if (state.corp.credits >= cost && cost >= 0) {
      state.corp.credits -= cost;
      card.rezzed = true;
      card.faceup = true;
      log(
        state,
        `Blackguard — Corp must rez ${card.title} for ${cost}¢ (CR ${CR.expose?.number ?? "1.21.4"}).`,
      );
      return "done";
    }
  }
  // May rez Zaibatsu-class assets first.
  const mayRez: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.root) {
      const c = state.cards[id];
      if (
        c &&
        !c.rezzed &&
        c.mayRezWhenCardWouldBeExposed &&
        c.type === "asset"
      ) {
        mayRez.push(id);
      }
    }
  }
  if (mayRez.length > 0 && !state.pendingExpose) {
    state.pendingExpose = {
      cardId,
      phase: "may_rez",
      offeredRezIds: mayRez,
    };
    state.pendingChoice = {
      sourceId: mayRez[0]!,
      chooser: "corp",
      options: [
        ...mayRez.map((id) => ({
          id: `zaibatsu-rez:${id}`,
          label: `Rez ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "rez_for_expose_interrupt" as const,
              cardId: id,
            },
          },
        })),
        {
          id: "decline-rez",
          label: "Decline to rez",
          effect: {
            op: "do" as const,
            action: { kind: "continue_expose_after_may_rez" as const },
          },
        },
      ],
    };
    log(
      state,
      `Card would be exposed — Corp may rez Zaibatsu-class asset (CR ${CR.expose?.number ?? "1.21.4"}).`,
    );
    return "pending";
  }
  return openExposeInterruptOrComplete(state, cardId);
}

export function openExposeInterruptOrComplete(
  state: GameState,
  cardId: string,
): "pending" | "done" {
  if (hasPayableExposeInterrupt(state)) {
    state.pendingExpose = { cardId, phase: "interrupt" };
    log(
      state,
      `Pending expose of ${state.cards[cardId]?.title ?? cardId} — interrupt PAW (CR 1.21.4).`,
    );
    return "pending";
  }
  completeExpose(state, cardId);
  return "done";
}

export function completeExpose(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  card.faceup = true;
  log(
    state,
    `Expose ${card.title} (CR ${CR.expose?.number ?? "1.21.4"}).`,
  );
  // Expose is temporary reveal for unrezzed cards — leave faceup for visibility
  // this game-state (engine treats unrezzed+faceup as exposed/known).
  state.pendingExpose = null;
}

export function preventPendingExpose(state: GameState, amount: number): void {
  const pending = state.pendingExpose;
  if (!pending || amount < 1) return;
  log(
    state,
    `Prevent expose of ${state.cards[pending.cardId]?.title ?? pending.cardId}.`,
  );
  state.pendingExpose = null;
}

export function acceptPendingExpose(state: GameState): void {
  const pending = state.pendingExpose;
  if (!pending) return;
  const id = pending.cardId;
  state.pendingExpose = null;
  completeExpose(state, id);
}
