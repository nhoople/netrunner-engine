/**
 * Arranging installed ice and moving it to another position (CR 8.3, 6.2.2).
 * The one place that reorders `server.ice` without installing or
 * uninstalling a card.
 *
 * - `rearrangeIce` repositions a set of installed ice among the positions
 *   they already occupy (CR 8.3.1). The Corp carries it out as a sequence of
 *   swaps (CR 8.3.2), so no position is created or removed and each server
 *   keeps its number of ice. The whole arrangement is applied at once, with
 *   no checkpoint in between (CR 8.3.2a): every ice stays in a server's
 *   list while the player chooses.
 * - `moveIce` moves installed ice to a new outermost or innermost position
 *   (CR 6.2.2, 6.2.2a, 6.2.2b). Its old position is left (CR 6.2.4).
 *
 * During a run each keeps the Runner's position an element of the sequence
 * (CR 6.2.6):
 *
 * - Ice the Runner is encountering takes the Runner with it (CR 6.2.7d).
 * - Otherwise the Runner stays in their position. After a rearrange they
 *   approach whichever ice now occupies it (CR 6.2.7b, 6.2.7e). Ice moved
 *   away from the Runner's position while it is approached ends the approach
 *   (CR 6.2.7a); in the Initiation or Movement Phase the Runner does not move
 *   (CR 6.2.7e).
 */
import type { GameState } from "../types/game.js";
import type { ServerId } from "../types/servers.js";
import {
  addOutermostIce,
  followEncounteredIce,
  noteIceUninstalled,
} from "./runPosition.js";

/** The new order of each server's ice, outermost first. */
export type IceArrangement = Partial<Record<ServerId, readonly string[]>>;

/**
 * Whether `arrangement` repositions the ice of its servers among the
 * positions they occupy now (CR 8.3.1, 8.3.2): each listed server keeps its
 * number of ice, and every piece of ice in those servers appears exactly
 * once.
 */
export function isRearrangement(
  state: GameState,
  arrangement: IceArrangement,
): boolean {
  const before: string[] = [];
  const after: string[] = [];
  for (const [serverId, order] of Object.entries(arrangement)) {
    const server = state.servers[serverId as ServerId];
    if (!server || !order) return false;
    if (order.length !== server.ice.length) return false;
    before.push(...server.ice);
    after.push(...order);
  }
  if (new Set(after).size !== after.length) return false;
  const placed = new Set(before);
  return after.every((id) => placed.has(id));
}

/**
 * Rearrange installed ice (CR 8.3.1, 8.3.2). `arrangement` gives the new
 * order of each listed server's ice. Returns false and changes nothing when
 * it is not a rearrangement of those servers' ice (CR 8.3.1); fewer than 2
 * ice is a legal arrangement that changes nothing (CR 8.3.1a).
 */
export function rearrangeIce(
  state: GameState,
  arrangement: IceArrangement,
): boolean {
  if (!isRearrangement(state, arrangement)) return false;
  const encountered =
    state.run?.encounter && !state.run.encounter.iceUninstalled
      ? state.run.encounter.iceId
      : null;
  for (const [serverId, order] of Object.entries(arrangement)) {
    const server = state.servers[serverId as ServerId]!;
    server.ice = [...order!];
    for (const id of server.ice) {
      const card = state.cards[id];
      if (card) card.zone = `server:${serverId}:ice`;
    }
  }
  if (encountered) followEncounteredIce(state, encountered);
  return true;
}

/** Where moved ice goes in its new server. */
export type IcePlacement = "outermost" | "innermost";

/**
 * Move installed ice `iceId` to the `placement` position protecting
 * `serverId` (CR 6.2.2a, 6.2.2b). A move to a known location in the same
 * zone leaves it the same object (CR 1.12.4), so it keeps what it hosts.
 * Returns false when the ice protects no server or the server does not
 * exist.
 */
export function moveIce(
  state: GameState,
  iceId: string,
  serverId: ServerId,
  placement: IcePlacement,
): boolean {
  const to = state.servers[serverId];
  const from = Object.values(state.servers).find((server) =>
    server.ice.includes(iceId),
  );
  if (!to || !from) return false;
  const encountering =
    state.run?.encounter?.iceId === iceId &&
    !state.run.encounter.iceUninstalled;
  // Leaving the old position: as for an uninstall, unless the Runner goes
  // with it (CR 6.2.4, 6.2.7a, 6.2.7d).
  if (!encountering) noteIceUninstalled(state, iceId);
  from.ice = from.ice.filter((id) => id !== iceId);
  if (placement === "outermost") addOutermostIce(state, serverId, iceId);
  else to.ice.push(iceId);
  const card = state.cards[iceId];
  if (card) card.zone = `server:${serverId}:ice`;
  if (encountering) followEncounteredIce(state, iceId);
  return true;
}
