/**
 * DJ Fenris / CR 1.5.4 additional-identity helpers.
 * Outside-game pile, g-mod host filter, gains-text sync, ability carriers.
 */
import type { CardInstance, GameState } from "./types.js";
import { log } from "./createGame.js";

export const RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE =
  "runner:outside-game-identities" as const;

/** Ability-bearing fields Fenris copies from a hosted g-mod identity. */
export const FENRIS_GAINS_TEXT_KEYS = [
  "muBonus",
  "onFirstSuccessfulCentralRunThisTurn",
  "onTurnBegin",
  "onSuccessfulRun",
  "onSuccessfulRunOncePerTurn",
  "paidAbilities",
  "firstIceRezCostIncrease",
  "onTakeTagsWhenUntagged",
  "connectionBasicTrashAdditionalCostTrashHq",
  "steveCambridge",
] as const;

export type FenrisGainsTextKey = (typeof FENRIS_GAINS_TEXT_KEYS)[number];

/**
 * Primary Runner identity plus installed cards that gained identity text
 * (Fenris). Call sites that historically read only identityId must use this.
 */
export function runnerAbilityCarrierIds(state: GameState): string[] {
  const ids = [state.runner.identityId];
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    if (c?.gainsTextOfHostedIdentity && (c.hostedCardIds?.length ?? 0) > 0) {
      ids.push(id);
    }
  }
  return ids;
}

/** Ensure the outside-game pile array exists on runner state. */
export function ensureAdditionalIdentities(state: GameState): string[] {
  if (!state.runner.additionalIdentities) {
    state.runner.additionalIdentities = [];
  }
  return state.runner.additionalIdentities;
}

/**
 * Legal Fenris hosts: g-mod identities in the outside-game pile whose faction
 * mismatches the Runner's primary identity (when required).
 */
export function legalFenrisHostIds(
  state: GameState,
  requireFactionMismatch: boolean,
): string[] {
  const pile = state.runner.additionalIdentities ?? [];
  const primary = state.cards[state.runner.identityId];
  const primaryFaction = primary?.faction;
  const out: string[] = [];
  for (const id of pile) {
    const card = state.cards[id];
    if (!card || card.type !== "identity") continue;
    if (!(card.subtypes ?? []).includes("g-mod")) continue;
    if (requireFactionMismatch) {
      if (!card.faction || !primaryFaction || card.faction === primaryFaction) {
        continue;
      }
    }
    out.push(id);
  }
  return out;
}

/** Clear ability fields Fenris previously gained from a hosted identity. */
export function clearFenrisGainedText(fenris: CardInstance): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = fenris as any;
  for (const key of FENRIS_GAINS_TEXT_KEYS) {
    delete f[key];
  }
}

/** Copy ability-bearing fields from hosted identity onto Fenris. */
export function syncFenrisGainsTextFromHosted(
  fenris: CardInstance,
  hosted: CardInstance,
): void {
  clearFenrisGainedText(fenris);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = fenris as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h = hosted as any;
  for (const key of FENRIS_GAINS_TEXT_KEYS) {
    const value = h[key];
    if (value === undefined) continue;
    f[key] = structuredClone(value);
  }
}

/**
 * Host a legal outside-game g-mod identity on Fenris and sync gains-text.
 * Removes the identity from the outside-game pile.
 */
export function hostFenrisIdentity(
  state: GameState,
  fenrisId: string,
  identityId: string,
): void {
  const fenris = state.cards[fenrisId]!;
  const hosted = state.cards[identityId]!;
  const pile = ensureAdditionalIdentities(state);
  state.runner.additionalIdentities = pile.filter((id) => id !== identityId);
  hosted.hostId = fenrisId;
  hosted.zone = `hosted:${fenrisId}`;
  hosted.faceup = true;
  if (!fenris.hostedCardIds) fenris.hostedCardIds = [];
  if (!fenris.hostedCardIds.includes(identityId)) {
    fenris.hostedCardIds.push(identityId);
  }
  if (fenris.gainsTextOfHostedIdentity) {
    syncFenrisGainsTextFromHosted(fenris, hosted);
  }
  log(
    state,
    `${fenris.title} hosts ${hosted.title} from outside-game (CR 1.5.4 / 1.5.4a).`,
  );
}

/**
 * Return a hosted identity to the outside-game pile and clear Fenris gained text.
 */
export function returnHostedIdentityToOutsideGame(
  state: GameState,
  hostId: string,
  identityId: string,
): void {
  const host = state.cards[hostId];
  const identity = state.cards[identityId];
  if (!identity) return;
  identity.hostId = undefined;
  identity.zone = RUNNER_OUTSIDE_GAME_IDENTITIES_ZONE;
  identity.faceup = true;
  const pile = ensureAdditionalIdentities(state);
  if (!pile.includes(identityId)) pile.push(identityId);
  if (host?.hostedCardIds) {
    host.hostedCardIds = host.hostedCardIds.filter((id) => id !== identityId);
  }
  if (host?.gainsTextOfHostedIdentity || host?.returnHostedIdentityToOutsideGameOnUninstall) {
    clearFenrisGainedText(host);
  }
  // Ensure not left in heap / rig / RFG.
  state.runner.discard = state.runner.discard.filter((id) => id !== identityId);
  state.runner.rig = state.runner.rig.filter((id) => id !== identityId);
  if (state.removedFromGame) {
    state.removedFromGame = state.removedFromGame.filter((id) => id !== identityId);
  }
  log(
    state,
    `${identity.title} returns to outside-game additional-identities pile (CR 1.5.4b).`,
  );
}
