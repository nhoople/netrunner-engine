/** Honor and Profit (hap) deluxe primitives. */
import {
  markSubroutineBroken,
  subroutineBreakBlock,
} from "../../state/turnAndActions/break.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import { startPsiGame } from "../../state/turnAndActions/psi.js";
import { fireOnPlay } from "../../state/triggers/cardLifecycleHooks.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { agendaPointsFor } from "../../state/turnAndActions/scoring.js";
import type { EffectCtx } from "../eval.js";
import type { RuleCite } from "../../state/types.js";
import { fx, type Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function offerSparedSubroutineChoice(
  state: EffectCtx["state"],
  sourceId: string,
  leave: number,
): PrimResult {
  const enc = state.run?.encounter;
  const ice = enc ? state.cards[enc.iceId] : undefined;
  const subs = ice?.subroutines ?? [];
  if (!state.run || !enc || !ice || subs.length === 0) {
    log(
      state,
      `No encountered subroutine to leave (CR ${CR.breakAllButChosenSubroutine.number}).`,
    );
    return { ok: true };
  }
  while (enc.broken.length < subs.length) enc.broken.push(false);
  const pick = Math.max(0, Math.min(leave, subs.length));
  if (pick === 0) {
    breakUnbrokenExcept(state, sourceId, new Set());
    return { ok: true };
  }
  state.run.pendingSpareSubroutines = { remaining: pick, spared: [] };
  openSpareSubroutineChoice(state, sourceId);
  return { ok: true };
}

function openSpareSubroutineChoice(
  state: EffectCtx["state"],
  sourceId: string,
): void {
  const enc = state.run?.encounter;
  const ice = enc ? state.cards[enc.iceId] : undefined;
  const spared = new Set(state.run?.pendingSpareSubroutines?.spared ?? []);
  const subs = ice?.subroutines ?? [];
  openPendingChoose(state, {
    sourceId,
    chooser: "runner",
    options: subs.flatMap((sub, index) =>
      spared.has(index)
        ? []
        : [
            {
              id: `spare-sub:${index}`,
              label: sub.text,
              effect: {
                op: "do" as const,
                action: {
                  kind: "gain_credits" as const,
                  side: "runner" as const,
                  amount: 0,
                },
              },
            },
          ],
    ),
  });
}

function breakUnbrokenExcept(
  state: EffectCtx["state"],
  sourceId: string,
  spared: Set<number>,
): number {
  const enc = state.run?.encounter;
  const ice = enc ? state.cards[enc.iceId] : undefined;
  const subs = ice?.subroutines ?? [];
  if (!enc || !ice) return 0;
  while (enc.broken.length < subs.length) enc.broken.push(false);
  let brokenNow = 0;
  for (let i = 0; i < subs.length; i++) {
    if (spared.has(i) || subroutineBreakBlock(state, sourceId, i)) continue;
    markSubroutineBroken(state, sourceId, i);
    brokenNow += 1;
  }
  const left = [...spared]
    .filter((index) => subs[index])
    .map((index) => `"${subs[index]!.text}"`)
    .join(", ");
  log(
    state,
    `${ice.title} leaves ${left || "no subroutine"} and breaks ${brokenNow} unbroken subroutine(s) (CR ${CR.breakAllButChosenSubroutine.number}).`,
  );
  return brokenNow;
}

/** The Runner chose the subroutine Grappling Hook will not break (CR 9.8.6b). */
export function chooseSparedSubroutine(
  state: EffectCtx["state"],
  index: number,
  sourceId: string,
): PrimResult {
  const pending = state.run?.pendingSpareSubroutines;
  const enc = state.run?.encounter;
  const subs = enc ? (state.cards[enc.iceId]?.subroutines ?? []) : [];
  if (!state.run || !pending || !enc) {
    return {
      ok: false,
      error: "No subroutine choice is waiting.",
      cites: [CR.breakAllButChosenSubroutine],
    };
  }
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= subs.length ||
    pending.spared.includes(index)
  ) {
    return {
      ok: false,
      error: "Choose a subroutine to leave.",
      cites: [CR.breakAllButChosenSubroutine],
    };
  }
  pending.spared.push(index);
  pending.remaining -= 1;
  if (pending.remaining > 0) {
    openSpareSubroutineChoice(state, sourceId);
    return { ok: true };
  }
  const spared = new Set(pending.spared);
  state.run.pendingSpareSubroutines = undefined;
  breakUnbrokenExcept(state, sourceId, spared);
  return { ok: true };
}

export function applySpinHapPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "inazuma_lock_breaking_next_encounter": {
      if (state.run) state.run.inazumaLockNextEncounter = true;
      log(
        state,
        `Inazuma — next encounter cannot break subroutines on encountered ice.`,
      );
      return { ok: true };
    }
    case "corp_gain_iain_if_ahead_on_agenda": {
      const corp = agendaPointsFor(state, "corp");
      const run = agendaPointsFor(state, "runner");
      if (corp > run) {
        state.runner.credits += 2;
        log(state, `Iain Stirling — gain 2¢ (Corp ahead on agenda).`);
      }
      return { ok: true };
    }
    case "express_delivery_finish": {
      const { pickId, restIds } = action;
      state.runner.hand.push(pickId);
      state.cards[pickId]!.zone = "runner:grip";
      state.cards[pickId]!.faceup = true;
      for (const id of restIds ?? []) {
        state.runner.deck.push(id);
        state.cards[id]!.faceup = false;
      }
      // shuffle
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [state.runner.deck[i], state.runner.deck[j]] = [
          state.runner.deck[j]!,
          state.runner.deck[i]!,
        ];
      }
      log(state, `Express Delivery — took 1 card; shuffled stack.`);
      return { ok: true };
    }
    case "play_run_event_from_stack": {
      const cands = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return c?.type === "event" && (c.subtypes ?? []).includes("run");
      });
      if (cands.length === 0) {
        log(state, `Planned Assault — no run events in stack.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `pa:${id}`,
          label: `Play ${state.cards[id]!.title} ignoring cost`,
          effect: fx.do({ kind: "play_heap_event_ignore_cost", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "play_heap_event_ignore_cost": {
      // Planned Assault leaf: play the chosen run event from stack, paying its
      // play cost (additional costs ignored), then shuffle (CR 1.2.1).
      const cardId = action.cardId;
      const card = state.cards[cardId];
      const idx = state.runner.deck.indexOf(cardId);
      if (!card || idx < 0) return { ok: true };
      const cost = card.playCost ?? 0;
      if (state.runner.credits < cost) {
        log(state, `Cannot afford ${card.title} (${cost}¢).`);
        return { ok: true };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.deck.splice(idx, 1);
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [state.runner.deck[i], state.runner.deck[j]] = [
          state.runner.deck[j]!,
          state.runner.deck[i]!,
        ];
      }
      card.zone = "runner:play-area";
      card.faceup = true;
      log(
        state,
        `Planned Assault — play ${card.title} from stack for ${cost}¢; shuffle stack.`,
      );
      fireOnPlay(state, cardId);
      return { ok: true };
    }
    case "search_stack_take_to_grip": {
      const cands = [...state.runner.deck];
      if (cands.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cands.slice(0, 20).map((id) => ({
          id: `st:${id}`,
          label: `Take ${state.cards[id]!.title} to grip`,
          effect: fx.do({ kind: "take_runner_deck_card_to_grip", cardId: id }),
        })),
      });
      return { ok: true };
    }
    case "take_runner_deck_card_to_grip": {
      const cardId = action.cardId;
      const idx = state.runner.deck.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.runner.deck.splice(idx, 1);
      state.runner.hand.push(cardId);
      state.cards[cardId]!.zone = "runner:grip";
      log(state, `Search stack — ${state.cards[cardId]!.title} to grip.`);
      return { ok: true };
    }
    case "draw_from_stack_bottom": {
      const side = action.side === "corp" ? "corp" : "runner";
      const p = side === "corp" ? state.corp : state.runner;
      const amount = action.amount ?? 1;
      for (let i = 0; i < amount && p.deck.length > 0; i++) {
        const id = p.deck.pop()!;
        p.hand.push(id);
        state.cards[id]!.zone = side === "corp" ? "corp:hq" : "runner:grip";
      }
      log(state, `Draw ${amount} from bottom of stack.`);
      return { ok: true };
    }
    case "break_all_but_n_subroutines_on_encounter": {
      return offerSparedSubroutineChoice(state, sourceId, action.leave ?? 1);
    }
    case "spend_push_your_luck_secret_guess": {
      // Printed: Runner secretly spends any number of credits; the Corp
      // guesses even or odd. Wrong guess → Runner gains twice the spend.
      // The Corp's psi bid is a parity guess (0=even, 1=odd), not a spend.
      startPsiGame(
        state,
        sourceId,
        999,
        fx.do({ kind: "gain_credits_twice_secret_spend" }),
        fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        { corpGuess: "parity" },
      );
      return { ok: true };
    }
    case "gain_credits_twice_secret_spend": {
      const spent = state.turn.lastRevealedRunnerSecretSpend ?? 0;
      state.runner.credits += 2 * spent;
      log(state, `Push Your Luck — Corp guessed wrong; gain ${2 * spent}¢.`);
      return { ok: true };
    }
    case "choose_card_type_reveal_stack_top": {
      const types = ["event", "program", "resource", "hardware"];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: types.map((t) => ({
          id: `om:${t}`,
          label: `Choose ${t}`,
          effect: fx.do({ kind: "reveal_oracle_top_match", cardType: t }),
        })),
      });
      return { ok: true };
    }
    case "score_agenda_from_hq": {
      const cardId = action.cardId;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.corp.hand.splice(idx, 1);
      state.corp.scoreArea.push(cardId);
      const card = state.cards[cardId]!;
      card.zone = "corp:score";
      card.faceup = true;
      log(state, `Plan B — score ${card.title} from HQ.`);
      return { ok: true };
    }
    case "corp_pay_credits": {
      const n = Math.min(action.amount ?? 0, state.corp.credits);
      state.corp.credits -= n;
      return { ok: true };
    }
    case "runner_pay_credits": {
      const n = Math.min(action.amount ?? 0, state.runner.credits);
      subtractRunnerCreditPool(state, n);
      return { ok: true };
    }
    default:
      return null;
  }
}
