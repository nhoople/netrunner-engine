/**
 * Each card's printed play, rez, subroutine, and paid ability runs.
 * A throw, or an "Unhandled primitive" result, is a card the engine cannot
 * execute. Any other refusal or an open choice still counts as the tree running.
 *
 * The minimal board is an opening game with the card in hand. The situation
 * boards give the same trees a run, an encounter, or a breach to look at.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCardsPinnedTag,
  assertPinnedTag,
  cardsDataPresent,
  createInitialState,
  crDataPresent,
  evalEffect,
  instantiateCard,
  loadCardCatalog,
} from "../src/index.js";
import type { Effect } from "../src/effects/ir.js";
import type { EvalResult } from "../src/effects/eval.js";
import type { CardDef } from "../src/cards/load.js";
import type { CardType, GameState, ServerId, ZoneId } from "../src/state/types.js";

beforeAll(() => {
  if (!crDataPresent()) throw new Error("Run npm run fetch-cr");
  if (!cardsDataPresent()) throw new Error("Run npm run fetch-cards");
  assertPinnedTag("v26.03");
  assertCardsPinnedTag("v1.147.17");
});

function isEffect(value: unknown): value is Effect {
  return Boolean(value && typeof value === "object" && "op" in value);
}

function treesOf(def: CardDef): Array<[string, Effect]> {
  const trees: Array<[string, Effect]> = [];
  if (isEffect(def.onPlay)) trees.push(["onPlay", def.onPlay]);
  if (isEffect(def.onRez)) trees.push(["onRez", def.onRez]);
  for (const [index, sub] of (def.subroutines ?? []).entries()) {
    if (isEffect(sub.effect)) trees.push([`subroutines[${index}]`, sub.effect]);
  }
  for (const [index, ability] of (def.paidAbilities ?? []).entries()) {
    if (isEffect(ability.effect)) trees.push([`paidAbilities[${index}]`, ability.effect]);
  }
  return trees;
}

function runTrees(
  state: GameState,
  defId: string,
  trees: Array<[string, Effect]>,
  failures: string[],
  board: string,
): void {
  for (const [label, effect] of trees) {
    state.pendingChoice = null;
    try {
      const result: EvalResult = evalEffect({ state, sourceId: "subject" }, effect);
      if (!result.ok && result.error.startsWith("Unhandled primitive")) {
        failures.push(`${defId} ${board} ${label}: ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${defId} ${board} ${label}: ${message}`);
    }
  }
}

const INSTALLED: ReadonlySet<CardType> = new Set([
  "ice",
  "asset",
  "upgrade",
  "agenda",
  "program",
  "hardware",
  "resource",
]);

function richBoard(): GameState {
  const state = createInitialState();
  state.corp.credits = 99;
  state.runner.credits = 99;
  state.corp.clicks = 3;
  state.runner.clicks = 3;
  state.runner.tags = 1;

  const archived = state.corp.deck.pop();
  if (archived) {
    state.corp.discardPile.push(archived);
    state.cards[archived]!.zone = "corp:archives";
    state.cards[archived]!.faceup = true;
  }
  const inHand = state.corp.deck.pop();
  if (inHand) {
    state.corp.hand.push(inHand);
    state.cards[inHand]!.zone = "corp:hq";
  }
  const heaped = state.runner.deck.pop();
  if (heaped) {
    state.runner.discardPile.push(heaped);
    state.cards[heaped]!.zone = "runner:heap";
  }

  state.runner.hand = state.runner.hand.filter((id) => id !== "runner-program-1");
  state.runner.installed.push("runner-program-1");
  state.cards["runner-program-1"]!.zone = "runner:installed";

  state.corp.deck = state.corp.deck.filter((id) => id !== "corp-ice-1");
  state.servers.hq.ice = ["corp-ice-1"];
  state.cards["corp-ice-1"]!.zone = "server:hq:ice";
  state.cards["corp-ice-1"]!.rezzed = true;
  state.cards["corp-ice-1"]!.faceup = true;

  state.corp.deck = state.corp.deck.filter((id) => id !== "corp-asset-1");
  state.servers["remote-1"] = {
    id: "remote-1",
    kind: "remote",
    ice: [],
    root: ["corp-asset-1"],
  };
  state.nextRemoteNumber = 2;
  state.cards["corp-asset-1"]!.zone = "server:remote-1:root";
  state.cards["corp-asset-1"]!.rezzed = true;
  state.cards["corp-asset-1"]!.faceup = true;
  return state;
}

function seat(state: GameState, def: CardDef, zone: ZoneId): void {
  const card = instantiateCard(def.id, "subject", zone);
  card.rezzed = true;
  card.faceup = true;
  card.powerCounters = 2;
  card.virusCounters = 2;
  card.advancementCounters = 2;
  state.cards.subject = card;
  state.activeSide = def.side;
  if (zone === "corp:hq") state.corp.hand.push("subject");
  else if (zone === "runner:grip") state.runner.hand.push("subject");
  else if (zone === "corp:rd") state.corp.deck.unshift("subject");
  else if (zone === "corp:archives") state.corp.discardPile.push("subject");
  else if (zone === "corp:score") state.corp.scoreArea.push("subject");
  else if (zone === "runner:score") state.runner.scoreArea.push("subject");
  else if (zone === "runner:installed") state.runner.installed.push("subject");
  else if (zone === "server:hq:ice") state.servers.hq.ice.unshift("subject");
  else if (zone === "server:remote-1:ice") state.servers["remote-1"]!.ice.unshift("subject");
  else if (zone === "server:remote-1:root") state.servers["remote-1"]!.root.unshift("subject");
}

function installedZone(def: CardDef): ZoneId {
  if (def.type === "ice") return "server:remote-1:ice";
  if (def.type === "agenda") return def.side === "corp" ? "corp:score" : "runner:score";
  if (def.side === "corp") return "server:remote-1:root";
  return "runner:installed";
}

function openRun(
  state: GameState,
  serverId: ServerId,
  phase: "encounter" | "access",
  encounterIceId: string | null,
): void {
  const ice = encounterIceId ? state.cards[encounterIceId] : undefined;
  state.run = {
    attackedServerId: serverId,
    phase,
    position: encounterIceId ? 0 : null,
    successful: phase === "encounter" ? null : true,
    accessedCardIds: [],
    accessCandidates: [],
    randomAccessLimit: phase === "access" ? 1 : null,
    encounter: encounterIceId
      ? {
          iceId: encounterIceId,
          broken: (ice?.subroutines ?? []).map(() => false),
        }
      : null,
    endedTheRun: false,
    cannotJackOut: false,
    accessingCardId: null,
    breached: phase === "access",
  };
}

function accessCard(state: GameState, serverId: ServerId, cardId: string): void {
  openRun(state, serverId, "access", null);
  state.run!.accessCandidates = [cardId];
  state.run!.accessingCardId = cardId;
}

describe("each card's printed abilities execute", () => {
  it("evaluates play, rez, subroutines, and paid abilities without throwing", () => {
    const base = createInitialState();
    const failures: string[] = [];
    for (const def of loadCardCatalog(true).values()) {
      const trees = treesOf(def);
      if (trees.length === 0) continue;
      const state = structuredClone(base) as GameState;
      const zone = def.side === "corp" ? "corp:hq" : "runner:grip";
      const card = instantiateCard(def.id, "card", zone);
      card.rezzed = true;
      card.faceup = true;
      state.cards.card = card;
      if (def.side === "corp") state.corp.hand.push("card");
      else state.runner.hand.push("card");
      for (const [label, effect] of trees) {
        try {
          evalEffect({ state, sourceId: "card" }, effect);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${def.id} ${label}: ${message}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it(
    "evaluates those trees on a hand, an install, a run, and a breach",
    () => {
      const base = richBoard();
      const failures: string[] = [];
      for (const def of loadCardCatalog(true).values()) {
        const all = treesOf(def);
        if (all.length === 0) continue;
        const play = all.filter(([label]) => label === "onPlay");
        const rez = all.filter(([label]) => label === "onRez");
        const subs = all.filter(([label]) => label.startsWith("subroutines"));
        const paid = all.filter(([label]) => label.startsWith("paidAbilities"));

        const hand = structuredClone(base) as GameState;
        seat(hand, def, def.side === "corp" ? "corp:hq" : "runner:grip");
        runTrees(hand, def.id, [...play, ...paid], failures, "hand");

        if (INSTALLED.has(def.type)) {
          const installed = structuredClone(base) as GameState;
          seat(installed, def, installedZone(def));
          runTrees(installed, def.id, [...rez, ...paid], failures, "installed");

          const during = structuredClone(base) as GameState;
          seat(during, def, def.type === "ice" ? "server:remote-1:ice" : installedZone(def));
          openRun(during, "hq", "encounter", "corp-ice-1");
          runTrees(during, def.id, paid, failures, "during-run");
        }

        if (def.type === "ice") {
          const encountered = structuredClone(base) as GameState;
          seat(encountered, def, "server:hq:ice");
          openRun(encountered, "hq", "encounter", "subject");
          runTrees(encountered, def.id, [...subs, ...paid], failures, "encounter");
        }

        const breaches: Array<[string, ServerId, ZoneId]> = [
          ["breach-hq", "hq", "corp:hq"],
          ["breach-rd", "rd", "corp:rd"],
          ["breach-archives", "archives", "corp:archives"],
          ["breach-remote", "remote-1", "server:remote-1:root"],
        ];
        for (const [name, serverId, zone] of breaches) {
          const state = structuredClone(base) as GameState;
          const watching =
            name === "breach-hq"
              ? (state.corp.hand[0] ?? "corp-asset-1")
              : name === "breach-rd"
                ? (state.corp.deck[0] ?? "corp-asset-1")
                : name === "breach-archives"
                  ? (state.corp.discardPile[0] ?? "corp-asset-1")
                  : "corp-asset-1";
          const corpCard = def.side === "corp" && def.type !== "identity";
          const inZone =
            corpCard &&
            (name !== "breach-remote" || def.type === "asset" || def.type === "upgrade" || def.type === "agenda");
          if (inZone && name === "breach-hq" && def.type === "ice") {
            seat(state, def, "server:hq:ice");
            accessCard(state, serverId, watching);
          } else if (inZone) {
            seat(state, def, zone);
            accessCard(state, serverId, "subject");
          } else if (INSTALLED.has(def.type)) {
            seat(state, def, installedZone(def));
            accessCard(state, serverId, watching);
          } else {
            seat(state, def, def.side === "corp" ? "corp:hq" : "runner:grip");
            accessCard(state, serverId, watching);
          }
          if (name === "breach-rd" && state.run) {
            const top = state.corp.deck[0];
            if (top && state.run.accessingCardId === "subject") state.run.accessCandidates = [top];
          }
          if (name === "breach-archives") {
            const accessed = state.run?.accessingCardId;
            if (accessed && state.cards[accessed]) state.cards[accessed]!.faceup = true;
          }
          runTrees(state, def.id, paid, failures, name);
        }
      }
      expect(failures).toEqual([]);
    },
    60_000,
  );
});
