/**
 * Nico Campaign trashes itself when its last credits are taken. The trashed
 * card is a new object in Archives (CR 1.12.1) and is not installed, so it
 * is not rezzed (CR 8.1.1) and its turn-begin ability no longer triggers.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertPinnedTag,
  autoWalk,
  checkInvariants,
  createInitialState,
  crDataPresent,
  enterStep,
  instantiateCard,
  loadCardCatalog,
} from "../src/index.js";
import type { GameState } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
  loadCardCatalog(true);
});

/** A rezzed Nico Campaign alone in remote-1, holding `credits`. */
function nicoBoard(credits: number): GameState {
  const s = createInitialState();
  const nico = instantiateCard("nico-campaign", "nico-1", "server:remote-1:root");
  nico.rezzed = true;
  nico.faceup = true;
  nico.hostedCredits = credits;
  s.cards["nico-1"] = nico;
  s.servers["remote-1"] = { id: "remote-1", kind: "remote", ice: [], root: ["nico-1"] };
  s.nextRemoteNumber = 2;
  s.activeSide = "corp";
  return s;
}

function beginCorpTurn(s: GameState): void {
  s.activeSide = "corp";
  s.timingKey = "corp.startPaw";
  enterStep(s, "corp.turnBegins");
  autoWalk(s);
}

describe("Nico Campaign trashed when empty", () => {
  it("is not rezzed in Archives after its last take (CR 8.1.1, 1.12.1)", () => {
    const s = nicoBoard(3);
    const hand = s.corp.hand.length;
    beginCorpTurn(s);
    const nico = s.cards["nico-1"]!;
    expect(s.corp.discardPile).toContain("nico-1");
    expect(nico.zone).toBe("corp:archives");
    expect(nico.faceup).toBe(true);
    expect(nico.rezzed).toBe(false);
    expect(s.corp.hand.length).toBe(hand + 1);
    expect(checkInvariants(s).map((p) => p.code)).not.toContain("REZZED_OUTSIDE_PLAY");
  });

  it("does not raise its turn-begin ability from Archives on a later turn", () => {
    const s = nicoBoard(3);
    beginCorpTurn(s);
    const credits = s.corp.credits;
    const lines = s.log.length;
    beginCorpTurn(s);
    const later = s.log.slice(lines).filter((line) => line.includes("Nico Campaign"));
    expect(later).toEqual([]);
    expect(s.corp.credits).toBe(credits);
    expect((s.pendingAbilities ?? []).some((p) => p.sourceId === "nico-1")).toBe(false);
  });
});
