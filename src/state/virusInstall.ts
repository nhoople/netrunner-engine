/**
 * First virus-program install this turn → installed continuous triggers
 * (Avgustina-class; CR install + card text).
 * Also fires every-install hooks (Noise / Grimoire-class).
 */

import { evalEffect } from "../effects/eval.js";
import { log } from "./createGame.js";
import type { GameState } from "./types.js";

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

  const fireEvery = (sourceId: string): void => {
    const card = state.cards[sourceId];
    if (!card) return;
    if (card.placeVirusCounterOnInstalledVirusProgram) {
      installed.virusCounters = (installed.virusCounters ?? 0) + 1;
      log(
        state,
        `${card.title} — place 1 virus counter on ${installed.title}.`,
      );
    }
    if (!card.onVirusProgramInstall) return;
    const r = evalEffect(
      { state, sourceId },
      card.onVirusProgramInstall,
    );
    if (!r.ok) {
      log(
        state,
        `onVirusProgramInstall failed on ${card.title}: ${r.error}`,
      );
    }
  };

  for (const id of state.runner.rig) {
    if (id === installedId) continue;
    fireEvery(id);
  }
  fireEvery(state.runner.identityId);

  if (before > 0 || state.done) return;

  const fireFirst = (sourceId: string): void => {
    const card = state.cards[sourceId];
    if (!card?.onFirstVirusInstallThisTurn) return;
    const r = evalEffect(
      { state, sourceId },
      card.onFirstVirusInstallThisTurn,
    );
    if (!r.ok) {
      log(
        state,
        `onFirstVirusInstallThisTurn failed on ${card.title}: ${r.error}`,
      );
    }
  };

  for (const id of state.runner.rig) {
    if (id === installedId) continue;
    fireFirst(id);
  }
  fireFirst(state.runner.identityId);
}
