/** Honor and Profit (hap) deluxe primitives. */
import {
  markSubroutineBroken,
  subroutineBreakBlock,
} from "../../state/turnAndActions/break.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import { fireOnPlay } from "../../state/triggers/cardLifecycleHooks.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
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
    case "break_all_but_n_subroutines_on_encounter": {
      return offerSparedSubroutineChoice(state, sourceId, action.leave ?? 1);
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
    default:
      return null;
  }
}
