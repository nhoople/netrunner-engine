/**
 * Double-sided identity faces (CR 3.1.1a): only the faceup face is active.
 */
import { describe, expect, it } from "vitest";
import {
  activeIdentityFace,
  applyIdentityFace,
} from "../src/state/identityFace.js";
import type { CardInstance } from "../src/state/types.js";

function identity(patch: Partial<CardInstance>): CardInstance {
  return patch as CardInstance;
}

const FACES = [
  { title: "Front", subtypes: ["division"] },
  { title: "Back A", subtypes: ["department"] },
  { title: "Back B", subtypes: ["department"] },
  { title: "Back C", subtypes: ["department"] },
];

describe("identity faces", () => {
  it("front face is active until flipped", () => {
    const card = identity({ identityFaces: FACES });
    expect(activeIdentityFace(card)?.title).toBe("Front");
    card.identityFlipped = true;
    expect(activeIdentityFace(card)?.title).toBe("Back A");
  });

  it("facade follows the chosen face option", () => {
    const card = identity({
      identityFaces: FACES,
      identityFlipped: true,
      identityFaceOptions: [
        { id: "a", label: "A", onFlip: { op: "do" } as never },
        { id: "b", label: "B", onFlip: { op: "do" } as never },
        { id: "c", label: "C", onFlip: { op: "do" } as never },
      ],
      chosenIdentityFaceId: "c",
    });
    expect(activeIdentityFace(card)?.title).toBe("Back C");
  });

  it("Méliès U follows the secretly chosen central server (CR 2.18.1)", () => {
    const card = identity({
      identityFaces: FACES,
      identityFlipped: true,
      meliesChosenBackFace: "archives",
    });
    expect(activeIdentityFace(card)?.title).toBe("Back C");
    card.meliesChosenBackFace = "hq";
    expect(activeIdentityFace(card)?.title).toBe("Back A");
  });

  it("applyIdentityFace switches subtypes and base link", () => {
    const card = identity({
      identityFaces: [
        { title: "Hoshiko Shiro: Untold Protagonist", subtypes: ["natural"], link: 0 },
        { title: "Hoshiko Shiro: Mahou Shoujo", subtypes: ["digital"], link: 1 },
      ],
      subtypes: ["natural"],
      link: 0,
      identityFlipped: true,
    });
    applyIdentityFace(card);
    expect(card.subtypes).toEqual(["digital"]);
    expect(card.link).toBe(1);
    card.identityFlipped = false;
    applyIdentityFace(card);
    expect(card.subtypes).toEqual(["natural"]);
    expect(card.link).toBe(0);
  });

  it("cards without faces are left alone", () => {
    const card = identity({ subtypes: ["natural"], link: 0 });
    expect(activeIdentityFace(card)).toBeUndefined();
    applyIdentityFace(card);
    expect(card.subtypes).toEqual(["natural"]);
  });
});
