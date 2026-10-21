import type { CardInstance } from "./types.js";

export type IdentityFace = NonNullable<CardInstance["identityFaces"]>[number];

/**
 * Index of the face currently faceup (CR 3.1.1a: only that face is active).
 * Faces are stored front first. A facade identity (Jinteki Biotech) follows
 * its chosen face option; Méliès U follows its secretly chosen back face,
 * whose stored order is HQ, R&D, Archives (CR 2.18.1).
 */
export function activeIdentityFaceIndex(card: CardInstance): number {
  if (!card.identityFaces?.length || !card.identityFlipped) return 0;
  if (card.chosenIdentityFaceId && card.identityFaceOptions?.length) {
    const chosen = card.identityFaceOptions.findIndex(
      (face) => face.id === card.chosenIdentityFaceId,
    );
    return chosen >= 0 ? chosen + 1 : 1;
  }
  if (card.meliesChosenBackFace) {
    return { hq: 1, rd: 2, archives: 3 }[card.meliesChosenBackFace];
  }
  return 1;
}

/** The face record currently faceup, when the identity stores faces. */
export function activeIdentityFace(card: CardInstance): IdentityFace | undefined {
  return card.identityFaces?.[activeIdentityFaceIndex(card)];
}

/**
 * Make the active face's printed attributes the identity's: subtypes always,
 * and base link when the face prints one (CR 2.9.1). Call after any flip or
 * face choice changes which face is up, and recompute the Runner's link
 * afterwards when the Runner identity changed face.
 */
export function applyIdentityFace(card: CardInstance): void {
  const face = activeIdentityFace(card);
  if (!face) return;
  card.subtypes = [...face.subtypes];
  if (face.link !== undefined) card.link = face.link;
}
