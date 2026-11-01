/**
 * Ported from game.core.init-game-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. Upstream's default identities when none are
 * chosen (Custom Biotics / The Professor) are jnet-specific; this engine's
 * createInitialState defaults differ and are recorded as deferred.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../../src/index.js";
import { newGame } from "./helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

describe("jnet ports — core init game", () => {
  // jnet: game.core.init-game-test/default-identity
  it("newGame uses the named Corp and Runner identities", () => {
    const state = newGame({
      corpIdentity: "Jinteki: Personal Evolution",
      runnerIdentity: "Khan: Savvy Skiptracer",
    });
    expect(state.cards[state.corp.identityId]?.title).toBe(
      "Jinteki: Personal Evolution",
    );
    expect(state.cards[state.runner.identityId]?.title).toBe(
      "Khan: Savvy Skiptracer",
    );
  });
});
