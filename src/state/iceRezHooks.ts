/**
 * Ice bypass / host rez-state / any-ice-rez conditionals (CR 9.6.2).
 */
import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import { agendaPointsFor } from "./scoring.js";
import { creditsAvailableForInstall } from "./costs.js";
import type { GameState } from "./types.js";
import {
  fireStoredConditionals,
  type StoredConditionalMark,
} from "./storedTriggers.js";
import { syncMauiRecurringCredits } from "../effects/redsandBawPrimitives.js";

/** Fire ice + Runner-installed onBypass triggers after a piece of ice is bypassed. */
export function fireOnBypassTriggers(state: GameState, iceId: string): void {
  const items: StoredConditionalMark[] = [];
  const bypassed = state.cards[iceId];
  // CR 9.12.1d — blanked ice does not fire continuous on-bypass abilities.
  if (bypassed?.onBypass && !abilitiesSuppressed(state, iceId)) {
    items.push({
      abilityKey: "on-bypass",
      sourceId: iceId,
      controller: "corp",
      mandatory: true,
      effectKey: "onBypass",
      logLine: `${bypassed.title} becomes pending — bypassed.`,
    });
  }
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (!card?.onBypass) continue;
    items.push({
      abilityKey: "on-bypass",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey: "onBypass",
      logLine: `${card.title} becomes pending — ice bypassed.`,
    });
  }
  fireStoredConditionals(state, items);
  if (state.pendingChoice) return;
  // Jeitinho-class: heap cards may install on bypass when Threat met.
  for (const id of [...state.runner.discardPile]) {
    // CR 9.12.1d — blanked heap sources do not offer install-on-bypass.
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    const spec = card?.onBypassMayInstallFromHeap;
    if (!spec) continue;
    const threatPts = Math.max(
      agendaPointsFor(state, "corp"),
      agendaPointsFor(state, "runner"),
    );
    if (threatPts < spec.requiresThreat) continue;
    if (state.runner.clicks < spec.clickCost) continue;
    const installCost = card.installCost ?? 0;
    if (creditsAvailableForInstall(state, "runner") < installCost) continue;
    state.pendingChoice = {
      sourceId: id,
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
    };
    log(
      state,
      `${card.title} — may spend ${spec.clickCost}[click] to install from heap (Threat ${spec.requiresThreat}).`,
    );
    return;
  }
}

/** Fire trojan onHostRezzed / onHostDerezzed for ice that stayed installed. */
export function fireHostRezStateTriggers(
  state: GameState,
  iceId: string,
  kind: "rez" | "derez",
): void {
  const effectKey = kind === "rez" ? "onHostRezzed" : "onHostDerezzed";
  const items: StoredConditionalMark[] = [];
  for (const id of [...state.runner.installed]) {
    if (abilitiesSuppressed(state, id)) continue;
    const card = state.cards[id];
    if (card?.hostId !== iceId) continue;
    if (kind === "rez" ? !card.onHostRezzed : !card.onHostDerezzed) continue;
    items.push({
      abilityKey: kind === "rez" ? "on-host-rezzed" : "on-host-derezzed",
      sourceId: id,
      controller: "runner",
      mandatory: true,
      effectKey,
      logLine: `${card.title} becomes pending — host ice ${kind === "rez" ? "rezzed" : "derezzed"}.`,
    });
  }
  fireStoredConditionals(state, items);
}

/** Barry Wong / Compromised Employee: fire onAnyIceRez on identity + installed. */
export function fireOnAnyIceRez(state: GameState, iceId: string): void {
  const ice = state.cards[iceId];
  if (!ice || ice.type !== "ice" || !ice.rezzed) return;
  const items: StoredConditionalMark[] = [];
  const note = (cardId: string): void => {
    if (abilitiesSuppressed(state, cardId)) return;
    const card = state.cards[cardId];
    if (!card?.onAnyIceRez) return;
    items.push({
      abilityKey: "on-any-ice-rez",
      sourceId: cardId,
      controller: "runner",
      mandatory: true,
      effectKey: "onAnyIceRez",
      logLine: `${card.title} becomes pending — any ice rezzed.`,
    });
  };
  note(state.runner.identityId);
  for (const id of state.runner.installed) note(id);
  fireStoredConditionals(state, items);

  // Traffic Analyzer: rez ice protecting this server.
  let iceServer: string | null = null;
  for (const [sid, server] of Object.entries(state.servers)) {
    if (server.ice.includes(iceId)) {
      iceServer = sid;
      break;
    }
  }
  if (iceServer) {
    const protecting: StoredConditionalMark[] = [];
    for (const rid of state.servers[iceServer as keyof typeof state.servers]
      ?.root ?? []) {
      if (abilitiesSuppressed(state, rid)) continue;
      const up = state.cards[rid];
      if (!up?.rezzed || !up.onRezIceProtectingThisServer) continue;
      protecting.push({
        abilityKey: "on-rez-ice-protecting-this-server",
        sourceId: rid,
        controller: "corp",
        mandatory: true,
        effectKey: "onRezIceProtectingThisServer",
        logLine: `${up.title} becomes pending — ice protecting this server rezzed.`,
      });
    }
    fireStoredConditionals(state, protecting);
  }
  syncMauiRecurringCredits(state);
}
