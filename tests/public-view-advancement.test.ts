import { beforeAll, describe, expect, it } from "vitest";
import {
  assertPinnedTag,
  crDataPresent,
  createGame,
  getPublicView,
  instantiateCard,
} from "../src/index.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  assertPinnedTag("v26.03");
});

describe("public view advancement counters", () => {
  it("shows the count on a facedown agenda to both seats and hides the face from the Runner", () => {
    const state = createGame({ stopAfterFirstCycle: false, agendaPointsToWin: 7 });
    const agenda = instantiateCard("hostile-takeover", "ht-1", "server:remote-1:root");
    agenda.advancementTokens = 2;
    agenda.hostedCredits = 3;
    agenda.rezzed = false;
    agenda.faceup = false;
    state.cards["ht-1"] = agenda;
    state.servers["remote-1"] = {
      id: "remote-1",
      kind: "remote",
      ice: [],
      root: ["ht-1"],
    };

    const corp = getPublicView(state, "corp").servers.find((server) => server.id === "remote-1");
    const runner = getPublicView(state, "runner").servers.find((server) => server.id === "remote-1");
    expect(corp?.root[0]).toMatchObject({
      title: "Hostile Takeover",
      advancementTokens: 2,
      hostedCredits: 3,
    });
    expect(runner?.root[0]).toMatchObject({
      title: null,
      advancementTokens: 2,
      hostedCredits: 3,
    });
  });
});
