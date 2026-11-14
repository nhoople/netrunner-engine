/**
 * State invariants: facts about a game state that the Comprehensive Rules
 * say always hold once an action has finished resolving. A finding is a
 * bug in the engine (or a hand-built test state), never a legal position.
 *
 * This module only reports. It changes nothing, and nothing in the engine
 * reads its output. Tests run it after every `applyAction` through
 * `setApplyHook` (see `tests/setup/invariants.ts`).
 */

import { iceAtRunnerPosition } from "../state/runPosition.js";
import type { GameState, ServerId } from "../state/types.js";

/** Stable problem codes. Baselines key on these, so never rename one. */
export type ProblemCode =
  /** A zone list names an id that is not a card (CR 4.1.1c). */
  | "LISTED_NOT_A_CARD"
  /** An identity is also listed in a zone (CR 4.6.4a). */
  | "IDENTITY_IN_ZONE_LIST"
  /** A card is listed in more than one zone (CR 4.1.1c, 4.1.2b). */
  | "MULTIPLE_ZONES"
  /** A card is listed in no zone (CR 4.1.2b). */
  | "NO_ZONE"
  /** A card's `zone` disagrees with the one list it is in (CR 4.1.1c). */
  | "ZONE_MISMATCH"
  /** `zone` says the card protects a server it is not in (CR 6.2.1, 4.6.9a). */
  | "ICE_NOT_IN_SERVER"
  /** `hostId` names a card that does not exist (CR 1.13.1). */
  | "HOST_MISSING"
  /** `hostId` is set but the host's `hostedCardIds` lacks the card (CR 1.13.4, 4.1.7c). */
  | "HOST_LINK_MISSING"
  /** The host lists the card in `hostedCardIds` but the card's `hostId` differs (CR 1.13.4). */
  | "HOSTED_BACKLINK_MISSING"
  /** A hosted card's host is not installed, in the play area or in a score area (CR 1.13.1a, 10.3.1g). */
  | "HOST_NOT_IN_PLAY"
  /** A card in a deck, hand, discard pile or score area is hosted (CR 1.13.12). */
  | "OFF_BOARD_HOSTED"
  /** `run.attackedServerId` names no server (CR 4.6.8e). */
  | "RUN_SERVER_MISSING"
  /** `run.position` is not a position of the attacked server (CR 6.2.1, 6.2.5). */
  | "POSITION_OUT_OF_RANGE"
  /** The encountered ice is not the ice in the Runner's position (CR 6.2.7c, 6.2.7d). */
  | "ENCOUNTER_ICE_MISMATCH"
  /** A Runner card is marked rezzed (CR 8.1.4f). */
  | "RUNNER_CARD_REZZED"
  /** A Corp card in R&D, HQ or Archives is marked rezzed (CR 8.1.1, 1.12.1). */
  | "REZZED_OUTSIDE_PLAY"
  /** A credit pool is below 0 (CR 1.10.3b, 1.10.3c). */
  | "NEGATIVE_CREDITS"
  /** A click count is below 0 (CR 1.11.3b). */
  | "NEGATIVE_CLICKS"
  /** The winner and the win reason disagree (CR 1.7.1, 1.7.2). */
  | "WIN_REASON";

export interface Problem {
  code: ProblemCode;
  /** The card, server or player the problem is about. */
  id: string;
  message: string;
  /** The CR rule numbers the invariant follows, at the pinned CR version. */
  rules: readonly string[];
}

export const PROBLEM_RULES: Readonly<Record<ProblemCode, readonly string[]>> = {
  LISTED_NOT_A_CARD: ["4.1.1c"],
  IDENTITY_IN_ZONE_LIST: ["4.6.4a"],
  MULTIPLE_ZONES: ["4.1.1c", "4.1.2b"],
  NO_ZONE: ["4.1.2b"],
  ZONE_MISMATCH: ["4.1.1c"],
  ICE_NOT_IN_SERVER: ["6.2.1", "4.6.9a"],
  HOST_MISSING: ["1.13.1"],
  HOST_LINK_MISSING: ["1.13.4", "4.1.7c"],
  HOSTED_BACKLINK_MISSING: ["1.13.4"],
  HOST_NOT_IN_PLAY: ["1.13.1a", "10.3.1g"],
  OFF_BOARD_HOSTED: ["1.13.12"],
  RUN_SERVER_MISSING: ["4.6.8e"],
  POSITION_OUT_OF_RANGE: ["6.2.1", "6.2.5"],
  ENCOUNTER_ICE_MISMATCH: ["6.2.7c", "6.2.7d"],
  RUNNER_CARD_REZZED: ["8.1.4f"],
  REZZED_OUTSIDE_PLAY: ["8.1.1", "1.12.1", "4.6.7c", "4.6.7d", "1.8.4a"],
  NEGATIVE_CREDITS: ["1.10.3b", "1.10.3c"],
  NEGATIVE_CLICKS: ["1.11.3b"],
  WIN_REASON: ["1.7.1", "1.7.2"],
};

const WIN_REASONS = new Set([
  "corp_agenda",
  "runner_agenda",
  "flatline",
  "empty_rd",
  "corp_alternate",
  "runner_alternate",
  "draw",
]);

/**
 * Zones whose cards are not in the play area: decks, hands and discard
 * piles are not installed (CR 4.6.7c, 4.6.7d, 1.8.4a), so nothing in them is
 * hosted (CR 1.13.12). A card in a score area can be a host (CR 1.13.1a) but
 * is not itself hosted.
 */
const OFF_BOARD = new Set([
  "corp:rd",
  "corp:hq",
  "corp:archives",
  "corp:score",
  "runner:stack",
  "runner:grip",
  "runner:heap",
  "runner:score",
]);

/** Zones a host can be in: the play area or a score area (CR 1.13.1a). */
function hostZoneAllowed(zone: string): boolean {
  return (
    zone === "runner:installed" ||
    zone === "corp:installed" ||
    zone === "corp:play-area" ||
    zone === "runner:play-area" ||
    zone === "corp:score" ||
    zone === "runner:score" ||
    zone.startsWith("hosted:") ||
    (zone.startsWith("server:") && (zone.endsWith(":ice") || zone.endsWith(":root")))
  );
}

/**
 * Corp zones where no card is installed (CR 4.6.7c, 4.6.7d, 1.8.4a), so
 * none is rezzed (CR 8.1.1). Identities, score areas and the
 * play area are left out: the engine marks active cards there `rezzed`.
 */
const CORP_NOT_INSTALLED = new Set(["corp:rd", "corp:hq", "corp:archives"]);

/** Every zone list in the state, as id → the zones that list it. */
function zoneLists(state: GameState): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const add = (ids: readonly string[] | undefined, zone: string) => {
    if (!ids) return;
    for (const id of ids) {
      const zones = found.get(id);
      if (zones) zones.push(zone);
      else found.set(id, [zone]);
    }
  };
  add(state.corp.deck, "corp:rd");
  add(state.corp.hand, "corp:hq");
  add(state.corp.discardPile, "corp:archives");
  add(state.corp.scoreArea, "corp:score");
  add(state.corp.playArea, "corp:play-area");
  add(state.corp.installed, "corp:installed");
  add(state.corp.setAside, "corp:set-aside");
  add(state.corp.corpSetAside, "corp:set-aside");
  add(state.runner.deck, "runner:stack");
  add(state.runner.hand, "runner:grip");
  add(state.runner.discardPile, "runner:heap");
  add(state.runner.scoreArea, "runner:score");
  add(state.runner.installed, "runner:installed");
  add(state.runner.playArea, "runner:play-area");
  add(state.runner.setAside, "runner:set-aside");
  add(state.runner.additionalIdentities, "runner:outside-game-identities");
  add(state.removedFromGame, "removed-from-game");
  for (const server of Object.values(state.servers)) {
    add(server.ice, `server:${server.id}:ice`);
    add(server.root, `server:${server.id}:root`);
  }
  for (const card of Object.values(state.cards)) {
    add(card.hostedCardIds, `hosted:${card.id}`);
  }
  return found;
}

function iceServerOf(zone: string): string | null {
  const match = /^server:(.+):ice$/.exec(zone);
  return match ? match[1]! : null;
}

/**
 * Report every invariant the state breaks. An empty list means none.
 * Pure: reads `state` and never writes to it.
 */
export function checkInvariants(state: GameState): Problem[] {
  const problems: Problem[] = [];
  const report = (code: ProblemCode, id: string, message: string) => {
    problems.push({ code, id, message, rules: PROBLEM_RULES[code] });
  };

  for (const side of ["corp", "runner"] as const) {
    const player = state[side];
    if (player.credits < 0) report("NEGATIVE_CREDITS", side, `${side} has ${player.credits} credits`);
    if (player.clicks < 0) report("NEGATIVE_CLICKS", side, `${side} has ${player.clicks} clicks`);
  }

  // CR 4.1.1c: each card is in exactly 1 zone, and `zone` names it.
  const found = zoneLists(state);
  const identities = new Set([state.corp.identityId, state.runner.identityId]);
  for (const [id, zones] of found) {
    if (!state.cards[id]) {
      report("LISTED_NOT_A_CARD", id, `${id} is listed in ${zones.join(", ")} and is not a card`);
    } else if (identities.has(id)) {
      report("IDENTITY_IN_ZONE_LIST", id, `identity ${id} is also in ${zones.join(", ")}`);
    } else if (zones.length > 1) {
      const title = state.cards[id]!.title;
      report("MULTIPLE_ZONES", id, `${id} (${title}) is in ${zones.join(", ")}`);
    }
  }

  /** Where the card is: its one listed zone, else its `zone` field. */
  const placeOf = (id: string): string | undefined => {
    const zones = found.get(id);
    if (zones?.length === 1) return zones[0];
    return state.cards[id]?.zone;
  };

  // CR 9.1.8h: ice encountered while not installed has active subroutines.
  // The engine marks it rezzed for that encounter (Archangel, Chrysalis).
  const encounteredOutsidePlay = new Set(
    [state.run?.encounter?.iceId, state.run?.forceEncounterIceId].filter(
      (id): id is string => typeof id === "string",
    ),
  );

  for (const card of Object.values(state.cards)) {
    if (identities.has(card.id)) continue;
    const zones = found.get(card.id) ?? [];
    const label = `${card.id} (${card.title})`;

    const iceServer = iceServerOf(card.zone);
    if (iceServer !== null) {
      if (!state.servers[iceServer as ServerId]?.ice.includes(card.id)) {
        report(
          "ICE_NOT_IN_SERVER",
          card.id,
          `${label} has zone ${card.zone} but is not in ${iceServer}'s ice` +
            (zones.length > 0 ? ` (listed in ${zones.join(", ")})` : ""),
        );
      }
    } else if (zones.length === 0) {
      // A hosted card missing from its host's list is HOST_LINK_MISSING.
      if (!(card.hostId && card.zone === `hosted:${card.hostId}`)) {
        report("NO_ZONE", card.id, `${label} is in ${card.zone} and in no zone list`);
      }
    } else if (zones.length === 1 && zones[0] !== card.zone) {
      report("ZONE_MISMATCH", card.id, `${label} is listed in ${zones[0]} but zone is ${card.zone}`);
    }

    // CR 8.1.4f: Runner cards are never rezzed or unrezzed.
    if (card.side === "runner" && card.rezzed) {
      report("RUNNER_CARD_REZZED", card.id, `${label} is a Runner card marked rezzed`);
    }

    // CR 8.1.1: only an installed card is rezzed. A card that leaves play
    // becomes a new object (CR 1.12.1) and does not keep the status. Only a
    // card listed in the zone its field names is checked: anything else is
    // a zone problem, reported above.
    if (
      card.side === "corp" &&
      card.rezzed &&
      zones.length === 1 &&
      zones[0] === card.zone &&
      CORP_NOT_INSTALLED.has(card.zone) &&
      !encounteredOutsidePlay.has(card.id)
    ) {
      report("REZZED_OUTSIDE_PLAY", card.id, `${label} is in ${card.zone} and marked rezzed`);
    }

    // CR 1.13.4: one host, and both ends of the link agree.
    for (const hostedId of card.hostedCardIds ?? []) {
      const hosted = state.cards[hostedId];
      if (hosted && hosted.hostId !== card.id) {
        report(
          "HOSTED_BACKLINK_MISSING",
          hostedId,
          `${hostedId} (${hosted.title}) is in ${label}'s hosted list but its hostId is ${hosted.hostId ?? "unset"}`,
        );
      }
    }
    if (card.hostId) {
      const host = state.cards[card.hostId];
      if (!host) {
        report("HOST_MISSING", card.id, `${label} has hostId ${card.hostId}, which is not a card`);
      } else {
        if (!host.hostedCardIds?.includes(card.id)) {
          report(
            "HOST_LINK_MISSING",
            card.id,
            `${label} has hostId ${host.id} (${host.title}) but is not in its hosted list (zone ${card.zone})`,
          );
        }
        // CR 1.13.1a, 10.3.1g: a host is in the play area or a score area.
        const hostPlace = identities.has(host.id) ? "identity" : placeOf(host.id);
        if (hostPlace !== "identity" && (!hostPlace || !hostZoneAllowed(hostPlace))) {
          report(
            "HOST_NOT_IN_PLAY",
            card.id,
            `${label} is hosted on ${host.id} (${host.title}), which is in ${hostPlace ?? "no zone"}`,
          );
        }
      }
      // CR 1.13.12: hosting moves the card to its host's zone.
      const offBoard = zones.find((zone) => OFF_BOARD.has(zone));
      if (offBoard) {
        report("OFF_BOARD_HOSTED", card.id, `${label} is in ${offBoard} with hostId ${card.hostId}`);
      }
    }
  }

  const run = state.run;
  if (run) {
    const server = state.servers[run.attackedServerId];
    if (!server) {
      report("RUN_SERVER_MISSING", run.attackedServerId, `run attacks missing server ${run.attackedServerId}`);
    } else if (
      run.position !== null &&
      (!Number.isInteger(run.position) || run.position < 0 || run.position >= server.ice.length)
    ) {
      // CR 6.2.4: an emptied position the Runner is in still exists.
      const vacatedEnd = run.positionVacated && run.position === server.ice.length;
      if (!vacatedEnd) {
        report(
          "POSITION_OUT_OF_RANGE",
          server.id,
          `run position ${run.position} is outside ${server.id} ice (${server.ice.length})`,
        );
      }
    }
    const encounter = run.encounter;
    if (
      server &&
      encounter &&
      !encounter.iceUninstalled &&
      !run.positionVacated &&
      !run.encounterOutsideRun
    ) {
      const atPosition = iceAtRunnerPosition(state);
      if (encounter.iceId !== atPosition) {
        report(
          "ENCOUNTER_ICE_MISMATCH",
          encounter.iceId,
          `encountering ${encounter.iceId} but the ice at position ${run.position} of ${server.id} is ${atPosition ?? "none"}`,
        );
      }
    }
  }

  if (state.winner) {
    const reason = state.winReason;
    const bad =
      !reason ||
      !WIN_REASONS.has(reason) ||
      (state.winner === "draw" && reason !== "draw") ||
      (state.winner === "corp" && reason === "runner_agenda") ||
      (state.winner === "runner" && reason === "corp_agenda");
    if (bad) report("WIN_REASON", state.winner, `winner ${state.winner} has reason ${reason}`);
  }

  return problems;
}
