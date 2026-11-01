/**
 * Ported from game.core.rezzing-test in mtgred/netrunner, pinned at
 * bc9e2fca073a5b21d247e72877804118e81d5472. See tests/jnet/NOTICE.md and
 * docs/jnet-test-ports.md. Upstream's simultaneous "Choose a trigger to
 * resolve" UI between Advanced Assembly Lines' on-rez credits and Surat
 * City Grid is jnet-specific; this engine resolves the on-rez credits
 * automatically and then offers Surat's discounted rez (CR 9.1.2a /
 * 9.3.7c). The adapted board still ends with all three cards rezzed.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  crDataPresent,
} from "../../src/index.js";
import {
  clickPrompt,
  must,
  newGame,
  playFromHand,
  remotes,
  rezCard,
  settle,
} from "./helpers.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

describe("jnet ports — core rezzing", () => {
  // jnet: game.core.rezzing-test/simultaneous-rez-test
  it("rezzing Advanced Assembly Lines with Surat City Grid then rezzes NGO Front at −2", () => {
    let state = newGame({
      corpHand: [
        "Advanced Assembly Lines",
        "Surat City Grid",
        "NGO Front",
      ],
      corpCredits: 10,
    });
    state = playFromHand(state, "corp", "Surat City Grid");
    const remote1 = remotes(state)[0]!.id;
    const aalId = state.corp.hand.find(
      (id) => state.cards[id]?.title === "Advanced Assembly Lines",
    )!;
    state = must(settle(state), {
      type: "basic_install",
      cardId: aalId,
      destination: { kind: "remote_root", serverId: remote1 },
    });
    state = playFromHand(state, "corp", "NGO Front");
    const suratId = remotes(state)[0]!.root.find(
      (id) => state.cards[id]?.title === "Surat City Grid",
    )!;
    state = rezCard(state, suratId);
    const aalInstalled = remotes(state)[0]!.root.find(
      (id) => state.cards[id]?.title === "Advanced Assembly Lines",
    )!;
    const before = state.corp.credits;
    state = rezCard(state, aalInstalled);
    // Pay 1 to rez AAL, gain 3 from its on-rez ability.
    expect(state.corp.credits).toBe(before - 1 + 3);
    expect(state.cards[aalInstalled]?.rezzed).toBe(true);
    expect(
      state.pendingChoice?.options.some((o) =>
        o.label.includes("NGO Front"),
      ),
    ).toBe(true);
    state = clickPrompt(state, "NGO Front");
    const ngo = Object.values(state.cards).find((c) => c.title === "NGO Front")!;
    expect(ngo.rezzed).toBe(true);
    expect(state.cards[suratId]?.rezzed).toBe(true);
  });
});
