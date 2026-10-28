/**
 * First virus-program install this turn → installed continuous triggers
 * (Avgustina-class; CR install + card text).
 * Also fires every-install hooks (Noise / Grimoire-class).
 */

import { abilitiesSuppressed } from "./abilities.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";
import {
  fireStoredConditionals,
  type StoredConditionalMark,
} from "./storedTriggers.js";

/**
 * After a virus program is installed, bump the per-turn counter and fire
 * `onFirstVirusInstallThisTurn` on installed Runner cards / identity once.
 * Always fires `onVirusProgramInstall` and Grimoire-class place-virus.
 */
export function noteVirusProgramInstalled(
  state: GameState,
  installedId: string,
): void {
  const installed = state.cards[installedId];
  if (!installed || installed.type !== "program") return;
  if (!(installed.subtypes ?? []).includes("virus")) return;

  const before = state.turn.virusProgramsInstalledThisTurn;
  state.turn.virusProgramsInstalledThisTurn += 1;

  const every: StoredConditionalMark[] = [];
  const considerEvery = (sourceId: string): void => {
    if (abilitiesSuppressed(state, sourceId)) return;
    const card = state.cards[sourceId];
    if (!card) return;
    if (card.placeVirusCounterOnInstalledVirusProgram) {
      installed.virusCounters = (installed.virusCounters ?? 0) + 1;
      if (!state.turn.programsWithVirusPlacedThisTurn.includes(installedId)) {
        state.turn.programsWithVirusPlacedThisTurn.push(installedId);
      }
      if (installed.recurringCreditsMaxEqualsVirusCounters) {
        installed.recurringCreditsMax = installed.virusCounters ?? 0;
      }
      log(
        state,
        `${card.title} — place 1 virus counter on ${installed.title}.`,
      );
    }
    if (!card.onVirusProgramInstall) return;
    every.push({
      abilityKey: "on-virus-program-install",
      sourceId,
      controller: "runner",
      mandatory: true,
      effectKey: "onVirusProgramInstall",
      logLine: `${card.title} becomes pending — virus program install.`,
    });
  };

  for (const id of state.runner.installed) {
    if (id === installedId) continue;
    considerEvery(id);
  }
  considerEvery(state.runner.identityId);
  fireStoredConditionals(state, every);

  if (before > 0 || state.done) return;

  const first: StoredConditionalMark[] = [];
  const considerFirst = (sourceId: string): void => {
    if (abilitiesSuppressed(state, sourceId)) return;
    const card = state.cards[sourceId];
    if (!card?.onFirstVirusInstallThisTurn) return;
    first.push({
      abilityKey: "on-first-virus-install",
      sourceId,
      controller: "runner",
      mandatory: true,
      effectKey: "onFirstVirusInstallThisTurn",
      logLine: `${card.title} becomes pending — first virus install this turn.`,
    });
  };

  for (const id of state.runner.installed) {
    if (id === installedId) continue;
    considerFirst(id);
  }
  considerFirst(state.runner.identityId);
  fireStoredConditionals(state, first);
}
