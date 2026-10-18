/**
 * A learn-to-play match plays legal actions until the game ends or the step
 * budget runs out. The deck lists match the System Gateway starters. The
 * shuffle is seeded, so a failure replays the same hands and the same actions.
 * createInitialState stays the small stub the other tests build on.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyAction,
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  instantiateCard,
  legalActions,
} from "../src/index.js";
import type { CardInstance, GameState, ServerId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.6");
});

const CORP_IDENTITY = "the-syndicate-profit-over-principle";
const RUNNER_IDENTITY = "the-catalyst-convention-breaker";

/** Quantities from the Corp learn-to-play starter list. 34 cards. */
const CORP_DECK: Record<string, number> = {
  "offworld-office": 3,
  "send-a-message": 2,
  "superconducting-hub": 2,
  "nico-campaign": 2,
  "urtica-cipher": 2,
  "regolith-mining-license": 2,
  "bran-1-0": 2,
  diviner: 2,
  karuna: 2,
  palisade: 3,
  tithe: 2,
  whitespace: 2,
  "seamless-launch": 2,
  "government-subsidy": 2,
  "hedge-fund": 3,
  "manegarm-skunkworks": 1,
};

/** Quantities from the Runner learn-to-play starter list. 30 cards. */
const RUNNER_DECK: Record<string, number> = {
  "tread-lightly": 2,
  "creative-commission": 2,
  vrcation: 2,
  overclock: 2,
  jailbreak: 3,
  "sure-gamble": 3,
  "docklands-pass": 1,
  pennyshaver: 1,
  cleaver: 2,
  carmen: 2,
  unity: 2,
  mayfly: 2,
  "red-team": 1,
  "telework-contract": 2,
  "smartware-distributor": 2,
  "verbal-plasticity": 1,
};

const WIN_REASONS = new Set([
  "corp_agenda",
  "runner_agenda",
  "flatline",
  "empty_rd",
  "corp_alternate",
  "runner_alternate",
  "draw",
]);

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffle(ids: string[], random: () => number): void {
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = swap;
  }
}

function expand(side: "corp" | "runner", list: Record<string, number>): string[] {
  const ids: string[] = [];
  for (const [slug, count] of Object.entries(list)) {
    for (let n = 1; n <= count; n++) ids.push(`${side}:${slug}:${n}`);
  }
  return ids;
}

function learnToPlay(seed: number): GameState {
  const state = createInitialState({
    agendaPointsToWin: 6,
    stopAfterFirstCycle: false,
  });
  const random = rng(seed);
  const cards: Record<string, CardInstance> = {};
  const put = (card: CardInstance) => {
    cards[card.id] = card;
  };
  put(instantiateCard(CORP_IDENTITY, "corp-id", "corp:hq"));
  put(instantiateCard(RUNNER_IDENTITY, "runner-id", "runner:grip"));
  const corpPile = expand("corp", CORP_DECK);
  const runnerPile = expand("runner", RUNNER_DECK);
  shuffle(corpPile, random);
  shuffle(runnerPile, random);
  for (const id of corpPile) put(instantiateCard(id.split(":")[1]!, id, "corp:rd"));
  for (const id of runnerPile) put(instantiateCard(id.split(":")[1]!, id, "runner:stack"));
  const corpHand = corpPile.splice(0, 5);
  const runnerHand = runnerPile.splice(0, 5);
  for (const id of corpHand) cards[id]!.zone = "corp:hq";
  for (const id of runnerHand) cards[id]!.zone = "runner:grip";
  state.cards = cards;
  state.corp.identityId = "corp-id";
  state.corp.deck = corpPile;
  state.corp.hand = corpHand;
  state.corp.discardPile = [];
  state.corp.scoreArea = [];
  state.corp.installed = [];
  state.corp.playArea = [];
  state.corp.credits = 5;
  state.corp.clicks = 0;
  state.runner.identityId = "runner-id";
  state.runner.deck = runnerPile;
  state.runner.hand = runnerHand;
  state.runner.discardPile = [];
  state.runner.scoreArea = [];
  state.runner.installed = [];
  state.runner.playArea = [];
  state.runner.credits = 5;
  state.runner.clicks = 0;
  state.runner.link = cards["runner-id"]?.link ?? 0;
  for (const server of Object.values(state.servers)) {
    server.ice = [];
    server.root = [];
  }
  state.done = false;
  state.winner = null;
  state.winReason = null;
  return state;
}

function spots(state: GameState): Array<{ id: string; zone: string }> {
  const out: Array<{ id: string; zone: string }> = [];
  const add = (ids: readonly string[] | undefined, zone: string) => {
    for (const id of ids ?? []) out.push({ id, zone });
  };
  add(state.corp.deck, "corp:rd");
  add(state.corp.hand, "corp:hq");
  add(state.corp.discardPile, "corp:archives");
  add(state.corp.scoreArea, "corp:score");
  add(state.corp.playArea, "corp:play-area");
  add(state.corp.installed, "corp:installed");
  add(state.corp.setAside, "corp:set-aside");
  add(state.corp.corpSetAside, "corp:set-aside");
  add(state.runner.deck, "runner:stack");
  add(state.runner.hand, "runner:grip");
  add(state.runner.discardPile, "runner:heap");
  add(state.runner.scoreArea, "runner:score");
  add(state.runner.installed, "runner:installed");
  add(state.runner.playArea, "runner:play-area");
  add(state.runner.setAside, "runner:set-aside");
  add(state.runner.additionalIdentities, "runner:outside-game-identities");
  add(state.removedFromGame, "removed-from-game");
  for (const server of Object.values(state.servers)) {
    add(server.ice, `server:${server.id}:ice`);
    add(server.root, `server:${server.id}:root`);
  }
  for (const card of Object.values(state.cards)) {
    for (const hostedId of card.hostedCardIds ?? []) {
      out.push({ id: hostedId, zone: `hosted:${card.id}` });
    }
  }
  return out;
}

function boardProblems(state: GameState): string[] {
  const problems: string[] = [];
  if (state.corp.credits < 0 || state.runner.credits < 0) {
    problems.push(`credits corp=${state.corp.credits} runner=${state.runner.credits}`);
  }
  if (state.corp.clicks < 0 || state.runner.clicks < 0) {
    problems.push(`clicks corp=${state.corp.clicks} runner=${state.runner.clicks}`);
  }
  const found = new Map<string, string[]>();
  for (const spot of spots(state)) {
    const zones = found.get(spot.id) ?? [];
    zones.push(spot.zone);
    found.set(spot.id, zones);
    if (!state.cards[spot.id]) problems.push(`${spot.id} is listed in ${spot.zone} and is not a card`);
  }
  const identities = new Set([state.corp.identityId, state.runner.identityId]);
  for (const [id, zones] of found) {
    if (identities.has(id)) {
      problems.push(`identity ${id} is also in ${zones.join(", ")}`);
      continue;
    }
    if (zones.length > 1) problems.push(`${id} is in ${zones.join(", ")}`);
  }
  for (const card of Object.values(state.cards)) {
    if (identities.has(card.id)) continue;
    const zones = found.get(card.id);
    if (!zones) {
      problems.push(`${card.id} (${card.title}) is in ${card.zone} and in no zone list`);
      continue;
    }
    if (zones.length === 1 && zones[0] !== card.zone) {
      problems.push(`${card.id} (${card.title}) lists ${zones[0]} but zone is ${card.zone}`);
    }
  }
  for (const id of state.corp.scoreArea) {
    const card = state.cards[id];
    if (card && card.zone !== "corp:score") {
      problems.push(`${card.title} is in the Corp score area with zone ${card.zone}`);
    }
  }
  for (const id of state.runner.scoreArea) {
    const card = state.cards[id];
    if (card && card.zone !== "runner:score") {
      problems.push(`${card.title} is in the Runner score area with zone ${card.zone}`);
    }
  }
  if (state.run) {
    const server = state.servers[state.run.attackedServerId as ServerId];
    if (!server) {
      problems.push(`run attacks missing server ${state.run.attackedServerId}`);
    } else if (
      state.run.position !== null &&
      (state.run.position < 0 || state.run.position >= server.ice.length)
    ) {
      problems.push(
        `run position ${state.run.position} is outside ${server.id} ice (${server.ice.length})`,
      );
    }
  }
  if (state.winner) {
    if (!state.winReason || !WIN_REASONS.has(state.winReason)) {
      problems.push(`winner ${state.winner} has reason ${state.winReason}`);
    }
    if (state.winner === "draw" && state.winReason !== "draw") {
      problems.push(`draw winner has reason ${state.winReason}`);
    }
    if (state.winner === "corp" && state.winReason === "runner_agenda") {
      problems.push("Corp won with the Runner agenda reason");
    }
    if (state.winner === "runner" && state.winReason === "corp_agenda") {
      problems.push("Runner won with the Corp agenda reason");
    }
  }
  return problems;
}

describe("learn-to-play playout", () => {
  it("keeps a legal board through the starter match", () => {
    const failures: string[] = [];
    for (const seed of [1, 2]) {
      let state = learnToPlay(seed);
      const opening = boardProblems(state);
      if (opening.length > 0) {
        failures.push(`seed ${seed} opening: ${opening.join("; ")}`);
        continue;
      }
      for (let step = 0; step < 40 && !state.winner && !state.done; step++) {
        const actions = legalActions(state);
        if (actions.length === 0) {
          failures.push(`seed ${seed} step ${step} has no legal action at ${state.timingKey}`);
          break;
        }
        const random = rng(seed + step * 997);
        const action = actions[Math.floor(random() * actions.length)]!;
        let result: ReturnType<typeof applyAction>;
        try {
          result = applyAction(state, action);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`seed ${seed} step ${step} ${action.type} threw: ${message}`);
          break;
        }
        if (!result.ok) {
          failures.push(`seed ${seed} step ${step} ${action.type} was refused: ${result.error}`);
          break;
        }
        state = result.state;
        const problems = boardProblems(state);
        if (problems.length > 0) {
          failures.push(`seed ${seed} step ${step} after ${action.type}: ${problems.join("; ")}`);
          break;
        }
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);
});
