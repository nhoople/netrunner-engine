/** Search, look-and-arrange and set-aside helpers the effect kinds share (CR 8.7.5, 9.11.4d), moved out of `effects/eval.ts`. */
import type { GameState } from "../../state/types.js";
import {
  createPendingAbilityInstance,
  openReactionWindow,
  markPendingAbilityResolving,
  findPendingAbility,
  completePendingAbility,
  closeReactionWindow,
  pruneSettledPendingAbilities,
} from "../../state/triggers/pendingAbilities.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import { trashRandomGripForPersonalityProfiles } from "../hostingAndTrash/runnerHandAndDeckTrashKinds.js";
import { shuffleRunnerStack } from "../install/runnerInstall.js";
import { enterSetAside } from "../../state/zones.js";
import type { Effect } from "../ir/effect.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { type EvalResult, hostServerUnprotectedByIce } from "../eval.js";
import { random, shuffleInPlace } from "../../state/rng.js";

/** CR 8.7.5. A search trigger becomes pending after the shuffle, before a found card is acted on. */
export function noteSearchConditionalAbilities(state: GameState): void {
  const createdIds: string[] = [];
  for (const id of state.corp.scoreArea) {
    const card = state.cards[id];
    if (!card?.onRunnerSearchStackOrInstallFromHeapTrashRandomFromGrip)
      continue;
    const inst = createPendingAbilityInstance(state, {
      abilityKey: "personality-profiles:trash-random-grip",
      sourceId: id,
      controller: "corp",
      mandatory: true,
      payload: { kind: "trash_random_from_grip" },
    });
    createdIds.push(inst.id);
    log(
      state,
      `${card.title} becomes pending (CR ${CR.searchCondition.number}).`,
    );
  }
  if (createdIds.length === 0) return;
  // Nested reaction for search conditionals before found cards are acted on.
  const frame = openReactionWindow(state, createdIds, null);
  for (const pendingId of createdIds) {
    markPendingAbilityResolving(state, pendingId);
    const inst = findPendingAbility(state, pendingId);
    if (inst) {
      trashRandomGripForPersonalityProfiles(state, inst.sourceId);
    }
    completePendingAbility(state, pendingId, "done");
  }
  closeReactionWindow(state, frame.id);
  pruneSettledPendingAbilities(state);
}

/**
 * A stack search sets the found card aside and shuffles before the next
 * instruction adds it to the grip (CR 9.11.4d).
 */
export function addFoundStackCardAfterSearch(
  state: GameState,
  id: string,
): void {
  const card = state.cards[id];
  if (!card || !state.runner.deck.includes(id)) {
    shuffleRunnerStack(state);
    log(state, `Search stack pick — card missing.`);
    noteSearchConditionalAbilities(state);
    return;
  }
  state.runner.deck = state.runner.deck.filter((x) => x !== id);
  enterSetAside(state, [id], { side: "runner", faceup: false });
  log(state, `${card.title} found and set aside (CR ${CR.find.number}).`);
  shuffleRunnerStack(state);
  log(state, `Stack shuffled (CR ${CR.shuffleDeckAfterSearch.number}).`);
  noteSearchConditionalAbilities(state);
  state.runner.setAside = (state.runner.setAside ?? []).filter((x) => x !== id);
  card.setAsideGroupId = undefined;
  card.faceup = true;
  state.runner.hand.push(id);
  card.zone = "runner:grip";
  log(state, `Search stack — add ${card.title} to grip.`);
}

export function heapCardsWithTrashAbilities(state: GameState): string[] {
  return state.runner.discardPile.filter((id) => {
    const card = state.cards[id];
    if (!card) return false;
    if (card.trashCost !== undefined) return true;
    return (card.paidAbilities ?? []).some((a) => Boolean(a.cost?.trashSelf));
  });
}

export function rfgRunnerSetAside(state: GameState): void {
  const aside = [...(state.runner.setAside ?? [])];
  for (const id of aside) {
    const card = state.cards[id];
    if (!card) continue;
    if (card.zone !== "runner:set-aside") continue;
    card.zone = "removed-from-game";
    card.faceup = true;
    if (!state.removedFromGame) state.removedFromGame = [];
    if (!state.removedFromGame.includes(id)) state.removedFromGame.push(id);
  }
  state.runner.setAside = [];
  if (aside.length > 0) {
    log(state, `Remove ${aside.length} set-aside card(s) from the game.`);
  }
}

export function offerBurnerMoves(
  state: GameState,
  sourceId: string,
  revealed: string[],
  movesLeft: number,
): EvalResult {
  const stillInHq = revealed.filter((id) => state.corp.hand.includes(id));
  if (movesLeft <= 0 || stillInHq.length === 0) {
    for (const id of stillInHq) {
      state.cards[id]!.faceup = false;
    }
    log(state, `Burner — reveal/move complete.`);
    return { ok: true };
  }
  const options: Array<{ id: string; label: string; effect: Effect }> = [];
  for (const id of stillInHq) {
    const title = state.cards[id]!.title;
    options.push({
      id: `top:${id}`,
      label: `Top of R&D: ${title}`,
      effect: {
        op: "do",
        action: {
          kind: "burner_place",
          cardId: id,
          position: "top",
          revealed,
          movesLeft: movesLeft - 1,
        },
      },
    });
    options.push({
      id: `bottom:${id}`,
      label: `Bottom of R&D: ${title}`,
      effect: {
        op: "do",
        action: {
          kind: "burner_place",
          cardId: id,
          position: "bottom",
          revealed,
          movesLeft: movesLeft - 1,
        },
      },
    });
  }
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options,
    logLine: `Burner — choose ${movesLeft} more card(s) to move to R&D top/bottom.`,
  });
  return { ok: true };
}

export function returnRdLookedToDeckTop(state: GameState): void {
  const ids = state.turn.rdLookedCards;
  if (ids.length === 0) return;
  for (const id of ids) {
    state.cards[id].faceup = false;
    state.cards[id].zone = "corp:rd";
  }
  state.corp.deck = [...ids, ...state.corp.deck];
  state.turn.rdLookedCards = [];
  state.turn.rdArrangePlaced = [];
}

function hiddenCopy(state: GameState, oldId: string): string {
  const old = state.cards[oldId];
  if (!old) return oldId;
  // The id must say nothing about the card, which may next be seen
  // facedown, and must not repeat across turns.
  let newId: string;
  do {
    const part = Math.floor(random(state) * 36 ** 8)
      .toString(36)
      .padStart(8, "0");
    newId = `obj_${part}`;
  } while (state.cards[newId]);
  const copy = structuredClone(old);
  copy.id = newId;
  copy.faceup = false;
  state.cards[newId] = copy;
  delete state.cards[oldId];
  return newId;
}

function finishRdArrange(state: GameState, sourceId: string): EvalResult {
  const placed = state.turn.rdArrangePlaced.map((id) => hiddenCopy(state, id));
  for (const id of placed) {
    state.cards[id]!.zone = "corp:rd";
  }
  state.corp.deck = [...placed, ...state.corp.deck];
  state.turn.rdArrangePlaced = [];
  state.turn.rdLookedCards = [];
  state.turn.rdLooker = undefined;
  const maybeDraw = state.turn.rdArrangeThenMayDrawIfUnprotected;
  state.turn.rdArrangeThenMayDrawIfUnprotected = false;
  log(
    state,
    `R&D rearranged (${placed.length} cards). They are new objects (CR ${CR.objectMoveLocation.number}).`,
  );
  if (maybeDraw && hostServerUnprotectedByIce(state, sourceId)) {
    openPendingChoose(state, {
      sourceId,
      chooser: "corp",
      options: [
        {
          id: "draw",
          label: "Draw 1 card",
          effect: {
            op: "do",
            action: { kind: "draw", side: "corp", amount: 1 },
          },
        },
        {
          id: "decline",
          label: "Decline to draw",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
      ],
    });
    log(state, `Federal — host server unprotected; may draw 1.`);
  }
  return { ok: true };
}

export function offerRdArrangeChoice(
  state: GameState,
  sourceId: string,
): EvalResult {
  const remaining = state.turn.rdLookedCards;
  if (remaining.length === 0) {
    return finishRdArrange(state, sourceId);
  }
  openPendingChoose(state, {
    sourceId,
    chooser:
      state.turn.rdLooker ??
      (state.cards[sourceId]?.side === "runner" ? "runner" : "corp"),
    options: remaining.map((id) => ({
      id: `rd-arrange:${id}`,
      label: `Place ${state.cards[id].title} on top next`,
      effect: {
        op: "do" as const,
        action: { kind: "pick_rd_arrange" as const, cardId: id },
      },
    })),
    logLine: `Arrange R&D — choose next card for top (${remaining.length} remaining).`,
  });
  return { ok: true };
}

export function offerCultivateTrashChoice(
  state: GameState,
  sourceId: string,
): EvalResult {
  const remaining = state.turn.rdLookedCards;
  openPendingChoose(state, {
    sourceId,
    chooser: "corp",
    options: remaining.map((id) => ({
      id: `cultivate-trash:${id}`,
      label: `Trash ${state.cards[id].title}`,
      effect: {
        op: "do" as const,
        action: { kind: "trash_cultivate_looked" as const, cardId: id },
      },
    })),
    logLine: `Cultivate — choose 1 to trash.`,
  });
  return { ok: true };
}

export function offerCultivateHqChoice(
  state: GameState,
  sourceId: string,
): EvalResult {
  const remaining = state.turn.rdLookedCards;
  openPendingChoose(state, {
    sourceId,
    chooser: "corp",
    options: remaining.map((id) => ({
      id: `cultivate-hq:${id}`,
      label: `Add ${state.cards[id].title} to HQ`,
      effect: {
        op: "do" as const,
        action: { kind: "cultivate_hq_looked" as const, cardId: id },
      },
    })),
    logLine: `Cultivate — choose 1 to add to HQ.`,
  });
  return { ok: true };
}

export function shuffleCorpRdAfterSearch(state: GameState): void {
  shuffleInPlace(state, state.corp.deck);
}
