/** Up and Over (uao) Lunar pack primitives. */
import { revealCards } from "../../state/visibility/reveal.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { CR } from "../../timing/labels.js";
import {
  canPayCost,
  emptyRunnerCreditPool,
  payCost,
  subtractRunnerCreditPool,
} from "../../state/keywordsAndCredits/costs.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { chooseCards } from "../triggers/chooseCards.js";
import {
  addFoundStackCardAfterSearch,
  evalEffect,
  noteSearchConditionalAbilities,
} from "../eval.js";
import { shuffleRunnerStack } from "../install/runnerInstall.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarUaoPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "prevent_labyrinthine_jack_out": {
      if (!state.run) return { ok: true };
      state.run.cannotJackOut = true;
      log(state, `Labyrinthine Servers — Runner cannot jack out this run.`);
      return { ok: true };
    }
    case "universal_connectivity_fee_sub": {
      if (state.runner.tags > 0) {
        emptyRunnerCreditPool(state);
        log(state, `UCF — tagged Runner loses all credits; trash ice.`);
        if (source?.type === "ice") {
          // The ice's own subroutine trashes it (CR 1.14.5); the encounter
          // then ends (CR 6.2.7c).
          trashCard(state, sourceId, { by: "corp" });
        }
      } else if (state.runner.credits > 0) {
        subtractRunnerCreditPool(state, 1);
        log(state, `UCF — Runner loses 1¢.`);
      }
      return { ok: true };
    }
    case "spend_click_additional_cost": {
      // A cost that cannot be paid in full is not paid (CR 1.16.1a).
      const player = action.side === "runner" ? state.runner : state.corp;
      const title = state.cards[ctx.sourceId]?.title ?? ctx.sourceId;
      if ((player.clicks ?? 0) < 1) {
        return {
          ok: false,
          error: `Cannot spend [click] for ${title}.`,
          cites: [CR.spendClicks],
        };
      }
      player.clicks -= 1;
      log(
        state,
        `${title} — spend 1 [click] (additional cost, CR ${CR.spendClicks.number}).`,
      );
      return { ok: true };
    }
    case "may_add_archives_card_to_rd_bottom_only": {
      const archives = [...state.corp.discardPile];
      if (archives.length === 0) {
        log(state, `Hades Fragment — Archives empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "decline-hades",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
          ...archives.map((id) => ({
            id: `hades-bottom:${id}`,
            label: `Add ${state.cards[id]!.title} to bottom of R&D`,
            effect: fx.do({
              kind: "add_archives_card_to_rd",
              cardId: id,
              position: "bottom",
            }),
          })),
        ],
      });
      return { ok: true };
    }
    case "corp_lose_two_if_can": {
      if (state.corp.credits >= 2) {
        state.corp.credits -= 2;
        log(state, `Fester — Corp loses 2¢.`);
      }
      return { ok: true };
    }
    case "trade_in_record_hw": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "hardware") return { ok: true };
      const half = Math.floor((card.installCost ?? 0) / 2);
      trashCard(state, cardId);
      state.turn.tradeInCredits = half;
      log(state, `Trade-In — trashed ${card.title} for ${half}¢ (recorded).`);
      return { ok: true };
    }
    case "resolve_trade_in": {
      if (!action.cardIds) {
        const half = state.turn.tradeInCredits ?? 0;
        state.runner.credits += half;
        state.turn.tradeInCredits = undefined;
        log(state, `Trade-In — gain ${half}¢; search the stack for hardware.`);
        // A search of the stack: the Runner may find nothing, and the Corp
        // does not learn how many match (CR 8.7.2e, 10.2.2b).
        return evalEffect(
          ctx,
          chooseCards({
            chooser: "runner",
            candidates: state.runner.deck.filter(
              (id) => state.cards[id]?.type === "hardware",
            ),
            count: 1,
            search: true,
            purpose: "resume",
            label: "reveal and add to the grip",
            resume: { kind: "resolve_trade_in" },
          }),
        );
      }
      // "Shuffle your stack" whether or not a card was found (CR 8.7.3).
      const id = action.cardIds.find((cid) => state.runner.deck.includes(cid));
      if (!id) {
        shuffleRunnerStack(state);
        noteSearchConditionalAbilities(state);
        log(state, `Trade-In — no hardware found; shuffle the stack.`);
        return { ok: true };
      }
      addFoundStackCardAfterSearch(state, id);
      revealCards(state, [id], sourceId);
      return { ok: true };
    }
    case "place_x_counters": {
      // The printed card places X counters for X paid, with no cap beyond
      // what the Runner can pay (CR 1.2.1: card text wins).
      const max = state.runner.credits;
      const amounts = Array.from({ length: max + 1 }, (_, i) => i);
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: amounts.map((x) => ({
          id: `angel-x:${x}`,
          label: `Place ${x} power counter(s) (pay ${x}¢)`,
          effect: fx.do({ kind: "place_x_resolve", amount: x }),
        })),
      });
      return { ok: true };
    }
    case "place_x_resolve": {
      const amount = (action as { amount: number }).amount;
      if (!canPayCost(state, "runner", { credits: amount })) {
        return {
          ok: false,
          error: "Cannot pay for Angel Arena counters.",
          cites: [],
        };
      }
      payCost(state, "runner", { credits: amount }, "angel-arena", source);
      source!.powerCounters = (source!.powerCounters ?? 0) + amount;
      log(state, `Angel Arena — place ${amount} power counter(s).`);
      return { ok: true };
    }
    case "bottom_top": {
      const cardId = (action as { cardId: string }).cardId;
      state.runner.deck = state.runner.deck.filter((x) => x !== cardId);
      state.runner.deck.push(cardId);
      log(
        state,
        `Angel Arena — ${state.cards[cardId]!.title} to bottom of stack.`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
