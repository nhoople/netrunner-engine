/**
 * Revealing cards (CR 1.21.3): each card's front face is shown to all
 * players, then the card returns to its previous state. Revealing a
 * facedown card does not turn it faceup (CR 1.21.3a).
 *
 * The record of what was shown is open to both players. It carries titles
 * and not card ids, so a card that goes back to a hidden zone cannot be
 * followed there.
 */
import { CR } from "../timing/labels.js";
import { log } from "./createGame.js";
import type { GameState, LookEvent, RevealEvent, RuleCite, Side } from "./types.js";

const KEPT = 30;

export function revealCards(
  state: GameState,
  cardIds: readonly string[],
  sourceId: string,
  cite: RuleCite = CR.reveal,
): void {
  const cards = cardIds
    .map((id) => state.cards[id])
    .filter((card): card is NonNullable<typeof card> => Boolean(card));
  if (cards.length === 0) return;
  const source = state.cards[sourceId];
  const seq = (state.revealSeq ?? 0) + 1;
  state.revealSeq = seq;
  const event: RevealEvent = {
    seq,
    by: cards[0]!.side,
    sourceTitle: source?.title ?? sourceId,
    cards: cards.map((card) => ({ defId: card.defId ?? "", title: card.title })),
  };
  state.reveals = [...(state.reveals ?? []), event].slice(-KEPT);
  const rules =
    cite.number === CR.reveal.number
      ? CR.reveal.number
      : `${cite.number}, ${CR.reveal.number}`;
  log(
    state,
    `${event.sourceTitle} — reveal ${event.cards.map((c) => c.title).join(", ")} (CR ${rules}).`,
  );
}

/**
 * Looking at cards (CR 1.21.2): the looker sees each front face and does
 * not show it to the other player. The cards stay visible to the looker
 * until the ability finishes or the card moves (CR 1.21.6).
 *
 * The looker is the controller of the source unless one is given. The log
 * line counts the cards and does not name them.
 */
export function lookAtCards(
  state: GameState,
  cardIds: readonly string[],
  sourceId: string,
  looker?: Side,
): void {
  const cards = cardIds
    .map((id) => state.cards[id])
    .filter((card): card is NonNullable<typeof card> => Boolean(card));
  if (cards.length === 0) return;
  const source = state.cards[sourceId];
  const by: Side = looker ?? source?.side ?? state.activeSide;
  for (const card of cards) card.lookedBy = by;
  const seq = (state.lookSeq ?? 0) + 1;
  state.lookSeq = seq;
  const event: LookEvent = {
    seq,
    by,
    sourceTitle: source?.title ?? sourceId,
    cards: cards.map((card) => ({ defId: card.defId ?? "", title: card.title })),
  };
  state.looks = [...(state.looks ?? []), event].slice(-KEPT);
  log(
    state,
    `${event.sourceTitle} — the ${by === "corp" ? "Corp" : "Runner"} looks at ${cards.length} card(s) (CR ${CR.look.number}).`,
  );
}

/**
 * The resolving ability is finished: nobody is looking any more, and a card
 * in R&D, the stack, or HQ is neither faceup nor facedown
 * (CR 1.21.6, CR 1.21.1a). Cards in the grip keep the flag, which Runner
 * cards carry from the start and which the Corp's view does not read.
 */
export function endLooksAndReveals(state: GameState): void {
  const hidden = new Set([...state.corp.deck, ...state.runner.deck, ...state.corp.hand]);
  for (const card of Object.values(state.cards)) {
    if (card.lookedBy) delete card.lookedBy;
    if (card.faceup && hidden.has(card.id)) card.faceup = false;
  }
}
