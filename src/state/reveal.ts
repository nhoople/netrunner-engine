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
import type { GameState, RevealEvent, RuleCite } from "./types.js";

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
