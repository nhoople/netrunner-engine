/** Breaker Bay (bb) SanSan pack primitives. */
import { revealCards } from "../../state/visibility/reveal.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { recomputeRunnerMaxHandSize } from "../../state/continuous/handSize.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { shuffleInPlace } from "../../state/rng.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";
import type { Primitive } from "../ir.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applySansanBbPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "prevent_dorm_computer_run_all_tags": {
      // "Whenever you would take tags during that run": the prevention
      // lasts for the run this ability makes and ends with it (CR 9.10.1).
      const r = evalEffect(ctx, {
        op: "do",
        action: {
          kind: "may_start_run",
          servers: "any",
          preventAllTagsThisRun: true,
        },
      });
      if (!r.ok) return r;
      log(state, `Dorm Computer — run; prevent all tags this run.`);
      return { ok: true };
    }

    case "draw_until_grip_equals_max_hand_size": {
      // Game Day: draw the difference through the draw procedure, so draw
      // limits and draw triggers apply (CR 8.4.2).
      recomputeRunnerMaxHandSize(state);
      const max = state.runner.maxHandSize;
      const need = max - state.runner.hand.length;
      log(state, `Game Day — draw until grip equals max hand size (${max}).`);
      if (need <= 0) return { ok: true };
      return evalEffect(ctx, {
        op: "do",
        action: { kind: "draw", side: "runner", amount: need },
      });
    }

    case "search_stack_type_add_to_grip": {
      const typ = action.cardType;
      const matches = state.runner.deck.filter(
        (id) => state.cards[id]?.type === typ,
      );
      if (matches.length === 0) {
        shuffleInPlace(state, state.runner.deck);
        log(state, `Search stack for ${typ} — none found; shuffle.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `stack-type:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: {
            op: "do" as const,
            action: {
              kind: "search_stack_type_add_to_grip_pick" as const,
              cardId: id,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "search_stack_type_add_to_grip_pick": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.deck.includes(cardId)) {
        return {
          ok: false,
          error: "Search stack — card not in stack.",
          cites: [],
        };
      }
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      state.runner.hand.push(cardId);
      card.zone = "runner:grip";
      shuffleInPlace(state, state.runner.deck);
      revealCards(state, [card.id], sourceId);
      log(state, `Reveal ${card.title}; add to grip; shuffle stack.`);
      return { ok: true };
    }

    case "score_another_installed_copy_of_self": {
      const defId = source.defId;
      const installed = Object.values(state.cards).filter(
        (c) =>
          c &&
          c.defId === defId &&
          c.id !== sourceId &&
          c.type === "agenda" &&
          !state.corp.scoreArea.includes(c.id) &&
          (c.zone?.startsWith("server:") ?? false),
      );
      const ids = installed.map((c) => c!.id);
      if (ids.length === 0) {
        log(state, `Research Grant — no other installed copy.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ids.map((id) => ({
          id: `rg-score:${id}`,
          label: `Score ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "score_installed_agenda_ignore_requirement" as const,
              cardId: id,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "score_installed_agenda_ignore_requirement": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "agenda") {
        return {
          ok: false,
          error: "Not an installed agenda.",
          cites: [],
        };
      }
      // Scoring an installed agenda uninstalls it: the cards hosted on it
      // are trashed at the next checkpoint (CR 8.5.1b, 10.3.1g).
      if (!uninstallCard(state, cardId, "score-area", { scoreSide: "corp" })) {
        return { ok: false, error: "Not an installed agenda.", cites: [] };
      }
      card.rezzed = true;
      log(
        state,
        `Research Grant — score ${card.title} (ignore advancement requirement).`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
