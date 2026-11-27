/**
 * A player picks cards from a zone they can look at, one pick at a time,
 * and the engine then moves all of the picked cards at once.
 *
 * CR 1.15.2: the player resolving an instruction makes its choices. The
 * engine does not pick a card for a player when more than one result is
 * possible. CR 5.5.4c: cards discarded to hand size are chosen by the
 * discarding player and discarded simultaneously.
 */
import { openCardName } from "../state/seatVisibility.js";
import { log } from "../state/createGame.js";
import { openPendingChoose } from "../state/pendingChoice.js";
import { shuffleInPlace } from "../state/rng.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { GameState, RuleCite } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { deferContinuationAfter } from "./continuation.js";
import type { EffectCtx } from "./eval.js";
import type { Effect, Primitive } from "./ir.js";
import { trashCard } from "../state/procedures/trash.js";
import { revealCards } from "../state/reveal.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

type ChooseCards = Extract<Primitive, { kind: "choose_cards" }>;
type Purpose = ChooseCards["purpose"];

function verb(purpose: Purpose, label?: string): string {
  switch (purpose) {
    case "shuffle_hq_to_rd":
      return "shuffle into R&D from HQ";
    case "trash_grip":
      return "trash from the grip";
    case "shuffle_grip_to_stack":
      return "shuffle into the stack from the grip";
    case "resume":
      return label ?? "choose";
    case "discard_to_hand_size":
      return "discard";
    case "trash_hq":
      return "trash from HQ";
    case "reveal_trash_hq":
      return "reveal and trash from HQ";
    case "archives_to_hq":
      return "add to HQ from Archives";
    case "shuffle_archives_to_rd":
      return "shuffle into R&D from Archives";
  }
}

/** Does the other player see the face of this card where it is now? */
function openToOpponent(state: GameState, cardId: string): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  if (card.zone === "corp:archives" || card.zone === "runner:heap") {
    return Boolean(card.faceup);
  }
  if (card.zone.startsWith("server:")) return Boolean(card.rezzed);
  if (card.zone === "runner:installed") return card.faceup !== false;
  return false;
}

/** Two cards the chooser cannot tell apart for this pick. */
function sameForChoice(state: GameState, a: string, b: string): boolean {
  const x = state.cards[a];
  const y = state.cards[b];
  if (!x || !y) return false;
  return x.defId === y.defId && Boolean(x.faceup) === Boolean(y.faceup);
}

function finish(
  ctx: EffectCtx,
  action: ChooseCards,
  evalEffect: (ctx: EffectCtx, effect: Effect) => PrimResult,
): PrimResult {
  const { state } = ctx;
  const ids = action.picked.filter((id) => state.cards[id]);
  switch (action.purpose) {
    case "discard_to_hand_size": {
      // The discard step itself moves the cards (CR 5.5.4c).
      state.turn.chosenDiscardIds = ids;
      return { ok: true };
    }
    case "trash_hq": {
      for (const id of ids) {
        if (!state.corp.hand.includes(id)) continue;
        trashCard(state, id, { by: "corp" });
      }
      log(
        state,
        `Corp trashes ${ids.length} card(s) from HQ (CR ${CR.trashing.number}).`,
      );
      break;
    }
    case "reveal_trash_hq": {
      // Revealed cards are seen by the Runner, so they go to Archives
      // faceup (CR 1.21.3, 4.4.6b).
      const inHq = ids.filter((id) => state.corp.hand.includes(id));
      revealCards(state, inHq, ctx.sourceId);
      for (const id of inHq) {
        trashCard(state, id, { by: "corp", faceup: true });
      }
      log(
        state,
        `Corp reveals and trashes ${inHq.length} card(s) from HQ (CR ${CR.reveal.number}).`,
      );
      break;
    }
    case "archives_to_hq": {
      for (const id of ids) {
        if (!state.corp.discardPile.includes(id)) continue;
        removeCardFromCurrentZone(state, id);
        state.corp.hand.push(id);
        state.cards[id]!.zone = "corp:hq";
        state.cards[id]!.faceup = false;
      }
      log(
        state,
        `Add ${ids.length} card(s) from Archives to HQ (CR ${CR.announceTargets.number}).`,
      );
      break;
    }
    case "shuffle_hq_to_rd": {
      for (const id of ids) {
        if (!state.corp.hand.includes(id)) continue;
        removeCardFromCurrentZone(state, id);
        state.corp.deck.push(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
      }
      shuffleInPlace(state, state.corp.deck);
      log(
        state,
        `Shuffle ${ids.length} card(s) from HQ into R&D (CR ${CR.announceTargets.number}).`,
      );
      break;
    }
    case "trash_grip": {
      for (const id of ids) {
        if (!state.runner.hand.includes(id)) continue;
        const title = state.cards[id]!.title;
        trashCard(state, id);
        log(
          state,
          `Runner trashes ${title} from the grip (CR ${CR.trashing.number}).`,
        );
      }
      break;
    }
    case "shuffle_grip_to_stack": {
      for (const id of ids) {
        const moved = evalEffect(ctx, {
          op: "do",
          action: { kind: "shuffle_grip_card_into_stack", cardId: id },
        });
        if (!moved.ok) return moved;
      }
      shuffleInPlace(state, state.runner.deck);
      log(
        state,
        `Runner shuffles ${ids.length} revealed card(s) from the grip into the stack (CR ${CR.reveal.number}).`,
      );
      break;
    }
    case "resume": {
      if (!action.resume) break;
      const resumed = evalEffect(ctx, {
        op: "do",
        action: {
          ...structuredClone(action.resume),
          cardIds: ids,
        } as Primitive,
      });
      if (!resumed.ok) return resumed;
      break;
    }
    case "shuffle_archives_to_rd": {
      for (const id of ids) {
        if (!state.corp.discardPile.includes(id)) continue;
        removeCardFromCurrentZone(state, id);
        state.corp.deck.push(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
      }
      shuffleInPlace(state, state.corp.deck);
      log(
        state,
        `Shuffle ${ids.length} card(s) from Archives into R&D (CR ${CR.announceTargets.number}).`,
      );
      break;
    }
  }
  if (action.then) return evalEffect(ctx, action.then);
  return { ok: true };
}

/**
 * Start or continue a pick. Opens a choice when the player has a real
 * decision; otherwise finishes at once.
 */
export function applyChooseCards(
  ctx: EffectCtx,
  action: Primitive,
  evalEffect: (ctx: EffectCtx, effect: Effect) => PrimResult,
): PrimResult | null {
  if (action.kind !== "choose_cards") return null;
  const { state, sourceId } = ctx;
  const pickedTitles = new Set(
    action.picked.map((id) => state.cards[id]?.title),
  );
  const firstTitle = state.cards[action.picked[0] ?? ""]?.title;
  const left = action.candidates.filter((id) => {
    const card = state.cards[id];
    if (!card || action.picked.includes(id)) return false;
    if (action.titles === "distinct") return !pickedTitles.has(card.title);
    if (action.titles === "same" && firstTitle !== undefined) {
      return card.title === firstTitle;
    }
    return true;
  });
  // A search of a hidden deck asks for `count` cards whatever matches, so
  // the other player cannot tell how many matches exist (CR 8.7.2e, 10.2.2b).
  const search = Boolean(action.search);
  const total = search
    ? action.count
    : Math.min(action.count, action.candidates.length);
  const need = total - action.picked.length;
  if (need <= 0 || (left.length === 0 && !search)) {
    return finish(ctx, action, evalEffect);
  }

  // Nothing to decide: every remaining card must be taken, or the remaining
  // cards cannot be told apart.
  if (!action.upTo && !search) {
    const forced =
      left.length <= need ||
      left.every((id) => sameForChoice(state, id, left[0]!));
    if (forced) {
      return finish(
        ctx,
        { ...action, picked: [...action.picked, ...left.slice(0, need)] },
        evalEffect,
      );
    }
  }

  const options: Array<{ id: string; label: string; effect: Effect }> =
    left.map((id) => ({
      id: `choose-card:${id}`,
      // A candidate out of play is one the chooser looks at or searches
      // (CR 1.21.2, 8.7.1); an installed or hosted one is named as the
      // chooser sees it.
      label: /^(server|hosted):/.test(state.cards[id]!.zone)
        ? openCardName(state, id, action.chooser)
        : state.cards[id]!.title,
      effect: {
        op: "do",
        action: { ...structuredClone(action), picked: [...action.picked, id] },
      },
    }));
  if (action.upTo || search) {
    options.push({
      id: "choose-cards-done",
      label: action.picked.length === 0 ? "None" : "Done",
      effect: {
        op: "do",
        action: {
          ...structuredClone(action),
          count: action.picked.length,
        },
      },
    });
  }
  // Another choice is open: this pick waits its turn instead of being lost.
  if (state.pendingChoice) {
    deferContinuationAfter(state, {
      sourceId,
      effects: [{ op: "do", action: structuredClone(action) }],
    });
    return { ok: true };
  }
  const who = action.chooser === "corp" ? "The Corp" : "The Runner";
  const upTo = action.upTo || search;
  openPendingChoose(state, {
    sourceId,
    chooser: action.chooser,
    options,
    // The other player may not learn which hidden cards are on offer.
    hiddenFromOpponent:
      !action.open && (search || left.some((id) => !openToOpponent(state, id))),
    ...(search && !action.open ? { optionCountHidden: true } : {}),
    ...(action.open ? { shownToOpponent: true } : {}),
    prompt: `Choose a card to ${verb(action.purpose, action.label)} (${action.picked.length + 1} of ${upTo ? "up to " : ""}${total}).`,
    logLine:
      action.picked.length === 0
        ? `${who} chooses ${upTo ? "up to " : ""}${total} card(s) to ${verb(action.purpose, action.label)} (CR ${CR.announceTargets.number}).`
        : undefined,
  });
  if (!state.pendingChoice) return finish(ctx, action, evalEffect);
  return { ok: true };
}

/** Build the first step of a pick. */
export function chooseCards(args: {
  chooser: "corp" | "runner";
  candidates: string[];
  count: number;
  upTo?: boolean;
  purpose: Purpose;
  resume?: Primitive;
  label?: string;
  open?: boolean;
  /** A search of a hidden deck with criteria (CR 8.7.2e); see the IR field. */
  search?: boolean;
  /** Each pick a different title, or every pick the first pick's title. */
  titles?: "distinct" | "same";
  then?: Effect;
}): Effect {
  return {
    op: "do",
    action: {
      kind: "choose_cards",
      chooser: args.chooser,
      candidates: [...args.candidates],
      count: args.count,
      ...(args.upTo ? { upTo: true } : {}),
      picked: [],
      purpose: args.purpose,
      ...(args.resume ? { resume: structuredClone(args.resume) } : {}),
      ...(args.label ? { label: args.label } : {}),
      ...(args.open ? { open: true } : {}),
      ...(args.search ? { search: true } : {}),
      ...(args.titles ? { titles: args.titles } : {}),
      ...(args.then ? { then: structuredClone(args.then) } : {}),
    },
  };
}
