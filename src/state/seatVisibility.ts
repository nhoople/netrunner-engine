/**
 * Seat visibility policy (standardization S5).
 * What a seat may see for faces, counters, and hosted cards (CR 1.18 / 4.6 / 4.8).
 */
import { consideredAdvancement } from "./cardDeclarations.js";
import type {
  CardInstance,
  GameState,
  PublicHostedCardView,
  Side,
} from "./types.js";

/** Advancement counters hosted on an installed card. Zero stays unset. */
export function openAdvancement(
  state: GameState,
  card: CardInstance,
): number | null {
  const count = consideredAdvancement(state, card);
  return count > 0 ? count : null;
}

/** Credit counters hosted on an installed card (CR 1.9.5a). Zero stays unset. */
export function openHostedCredits(card: {
  hostedCredits?: number;
}): number | null {
  const count = card.hostedCredits ?? 0;
  return count > 0 ? count : null;
}

/**
 * Face of a card in the play area / set-aside for a viewer (CR 4.6.3 / 4.8.6).
 * Location is always open; the face is open when faceup or the viewer controls it.
 */
export function openFace(
  card: CardInstance,
  viewer: Side,
): { title: string | null; type: CardInstance["type"] | null } {
  const faceOpen = card.faceup || card.side === viewer;
  return {
    title: faceOpen ? card.title : null,
    type: faceOpen ? card.type : null,
  };
}

/** True when the viewer may see an ice face (rezzed or Corp). */
export function iceFaceVisible(
  card: CardInstance,
  viewer: Side,
): boolean {
  return card.rezzed || viewer === "corp";
}

/** Hosted-card public rows for a host (CR 4.6.5). */
export function hostedCardViews(
  state: GameState,
  hostId: string,
  viewer: Side,
): PublicHostedCardView[] {
  const host = state.cards[hostId];
  if (!host) return [];
  const out: PublicHostedCardView[] = [];
  for (const hid of host.hostedCardIds ?? []) {
    const card = state.cards[hid];
    if (!card) continue;
    const face = openFace(card, viewer);
    out.push({
      id: hid,
      title: face.title,
      type: face.type,
      faceup: card.faceup,
      side: card.side,
    });
  }
  return out;
}
