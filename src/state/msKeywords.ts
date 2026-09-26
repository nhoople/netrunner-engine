/**
 * Midnight Sun set-defining keyword helpers (CR §10.10–10.12).
 * Sabotage, mark, and charge — used by Effect IR eval / host intents.
 */

import { log } from "./createGame.js";
import { removeCardFromCurrentZone } from "./scoring.js";
import type {
  CentralServerId,
  GameState,
  RuleCite,
  Side,
  ServerId,
} from "./types.js";
import { CR } from "../timing/labels.js";

const CENTRAL_SERVERS: CentralServerId[] = ["hq", "rd", "archives"];

/** Trash a Corp card to Archives facedown (sabotage, CR 10.12.2a). */
export function trashCorpCardFacedownToArchives(
  state: GameState,
  cardId: string,
): void {
  const card = state.cards[cardId];
  removeCardFromCurrentZone(state, cardId);
  state.corp.discard.push(cardId);
  card.zone = "corp:archives";
  card.faceup = false;
  card.rezzed = false;
}

export function sabotageCites(): RuleCite[] {
  return [CR.sabotage, CR.sabotageResolution, CR.trashing];
}

/**
 * Resolve sabotage N.
 * When `hqCardIds` is omitted, auto-pick: trash as many as possible from R&D
 * top, then fill from the end of HQ (deterministic for tests).
 */
export function resolveSabotageAmount(
  state: GameState,
  sourceId: string,
  amount: number,
  hqCardIds?: string[],
): { ok: true } | { ok: false; error: string; cites: RuleCite[] } {
  if (amount <= 0) {
    log(state, `Sabotage 0 — nothing to trash (CR ${CR.sabotage.number}).`);
    return { ok: true };
  }

  const hq = [...state.corp.hand];
  const rd = [...state.corp.deck];
  const total = hq.length + rd.length;

  if (total === 0) {
    log(
      state,
      `Sabotage ${amount} — HQ and R&D empty (CR ${CR.sabotage.number}).`,
    );
    return { ok: true };
  }

  // CR 10.12.3b: fewer than N total → trash everything.
  if (total < amount) {
    for (const id of [...hq]) trashCorpCardFacedownToArchives(state, id);
    for (const id of [...rd]) trashCorpCardFacedownToArchives(state, id);
    log(
      state,
      `Sabotage ${amount} — only ${total} in HQ+R&D; trash all facedown (CR ${CR.sabotageAllRemaining.number}).`,
    );
    return { ok: true };
  }

  let fromHq: string[];
  if (hqCardIds === undefined) {
    // Auto: maximize R&D trash; remainder from end of HQ.
    const fromRd = Math.min(amount, rd.length);
    const needHq = amount - fromRd;
    fromHq = needHq > 0 ? hq.slice(hq.length - needHq) : [];
  } else {
    fromHq = [...hqCardIds];
  }

  // Validate HQ picks.
  const hqSet = new Set(hq);
  for (const id of fromHq) {
    if (!hqSet.has(id)) {
      return {
        ok: false,
        error: `Sabotage: ${id} is not in HQ.`,
        cites: sabotageCites(),
      };
    }
  }
  if (new Set(fromHq).size !== fromHq.length) {
    return {
      ok: false,
      error: "Sabotage: duplicate HQ card ids.",
      cites: sabotageCites(),
    };
  }
  if (fromHq.length > amount) {
    return {
      ok: false,
      error: `Sabotage: cannot trash more than ${amount} from HQ.`,
      cites: sabotageCites(),
    };
  }

  const fromRdNeeded = amount - fromHq.length;
  // CR 10.12.3a: must leave R&D remainder ≤ actual R&D size.
  if (fromRdNeeded > rd.length) {
    return {
      ok: false,
      error: `Sabotage: must trash at least ${amount - rd.length} from HQ (R&D has only ${rd.length}).`,
      cites: [CR.sabotageHqFirst, ...sabotageCites()],
    };
  }

  for (const id of fromHq) trashCorpCardFacedownToArchives(state, id);
  // Top of R&D = front of deck array (draw uses shift()).
  const rdTrash = state.corp.deck.splice(0, fromRdNeeded);
  for (const id of rdTrash) trashCorpCardFacedownToArchives(state, id);

  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Sabotage ${amount} from ${src}: ${fromHq.length} from HQ, ${fromRdNeeded} from R&D top → Archives facedown (CR ${CR.sabotageResolution.number}).`,
  );
  return { ok: true };
}

/** Deterministic central when identifying a fresh mark (equal-weight stand-in). */
export function pickRandomCentral(state: GameState): CentralServerId {
  return CENTRAL_SERVERS[state.turnNumber % CENTRAL_SERVERS.length]!;
}

export function identifyMark(state: GameState, sourceId: string): void {
  if (state.markServerId !== null) {
    log(
      state,
      `Identify mark — already ${state.markServerId} this turn (CR ${CR.markAlreadyIdentified.number}).`,
    );
    return;
  }
  const server = pickRandomCentral(state);
  state.markServerId = server;
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Identify mark → ${server} (from ${src}; CR ${CR.markIdentification.number}).`,
  );
}

export function clearMark(state: GameState): void {
  if (state.markServerId !== null) {
    log(
      state,
      `Mark on ${state.markServerId} expires (CR ${CR.markLingering.number}).`,
    );
    state.markServerId = null;
  }
}

/** Installed cards controlled by `side` that already have ≥1 power counter. */
export function chargeableInstalledIds(
  state: GameState,
  side: Side,
): string[] {
  if (side === "runner") {
    return state.runner.rig.filter(
      (id) => (state.cards[id].powerCounters ?? 0) >= 1,
    );
  }
  const ids: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.ice, ...server.root]) {
      if ((state.cards[id].powerCounters ?? 0) >= 1) ids.push(id);
    }
  }
  return ids;
}

export function chargeCard(
  state: GameState,
  cardId: string,
  sourceId: string,
): { ok: true } | { ok: false; error: string; cites: RuleCite[] } {
  const card = state.cards[cardId];
  if (!card) {
    return {
      ok: false,
      error: `Charge: unknown card ${cardId}.`,
      cites: [CR.charge],
    };
  }
  if ((card.powerCounters ?? 0) < 1) {
    log(
      state,
      `Cannot charge ${card.title} — no hosted power counters (CR ${CR.chargeRequiresCounter.number}).`,
    );
    return { ok: true };
  }
  card.powerCounters = (card.powerCounters ?? 0) + 1;
  const src = state.cards[sourceId]?.title ?? sourceId;
  log(
    state,
    `Charge ${card.title} → ${card.powerCounters} power (from ${src}; CR ${CR.charge.number}).`,
  );
  return { ok: true };
}

export function isMarkServer(
  state: GameState,
  serverId: ServerId | null | undefined,
): boolean {
  return (
    state.markServerId !== null &&
    serverId !== undefined &&
    serverId !== null &&
    state.markServerId === serverId
  );
}
