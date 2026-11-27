/** Breaker Bay (bb) SanSan pack primitives. */
import { revealCards } from "../../state/visibility/reveal.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { recomputeRunnerMaxHandSize } from "../../state/continuous/handSize.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import type { Effect, Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { shuffleInPlace } from "../../state/rng.js";
import { hostCard, unhostCard } from "../../state/hostingAndTrash/host.js";
import { removeCardFromCurrentZone } from "../../state/scoring.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";

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

    case "install_hayley_same_type_from_grip": {
      const lastId = state.turn.installedThisTurn.at(-1);
      const last = lastId ? state.cards[lastId] : null;
      if (!last?.type) {
        log(state, `Hayley — no install this turn.`);
        return { ok: true };
      }
      const typ = last.type;
      const grip = state.runner.hand.filter(
        (id) => state.cards[id]?.type === typ,
      );
      if (grip.length === 0) {
        log(state, `Hayley — no ${typ} in grip.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        grip.map((id) => ({
          id: `hayley:${id}`,
          label: `Install ${state.cards[id]!.title}`,
          effect: {
            op: "do",
            action: { kind: "install_hayley_grip_card", cardId: id },
          },
        }));
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "runner", amount: 0 },
        },
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Hayley — may install another ${typ} from grip.`,
      });
      return { ok: true };
    }

    case "install_hayley_grip_card": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.hand.includes(cardId)) {
        return {
          ok: false,
          error: "Hayley install — card not in grip.",
          cites: [],
        };
      }
      const cost = card.installCost ?? 0;
      if (state.runner.credits < cost) {
        return {
          ok: false,
          error: "Hayley install — insufficient credits.",
          cites: [],
        };
      }
      subtractRunnerCreditPool(state, cost);
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      state.runner.installed.push(cardId);
      card.zone = "runner:installed";
      card.faceup = true;
      state.turn.installedThisTurn.push(cardId);
      log(state, `Hayley — install ${card.title} for ${cost}¢.`);
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

    case "host_non_virus_program_ignore_cost": {
      const grip = state.runner.hand.filter((id) => {
        const c = state.cards[id];
        return c?.type === "program" && !(c.subtypes ?? []).includes("virus");
      });
      if (grip.length === 0) {
        log(state, `London Library — no non-virus program in grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...grip.map((id) => ({
            id: `ll-host:${id}`,
            label: `Host ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "host_program" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
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
      });
      return { ok: true };
    }

    case "host_program": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.hand.includes(cardId)) {
        return {
          ok: false,
          error: "London Library — program not in grip.",
          cites: [],
        };
      }
      state.runner.hand = state.runner.hand.filter((id) => id !== cardId);
      hostCard(state, card.id, sourceId, { installed: true });
      card.zone = `hosted:${sourceId}`;
      card.faceup = true;
      // Still counts as installed for MU — add to rig while hosted.
      if (!state.runner.installed.includes(cardId))
        state.runner.installed.push(cardId);
      log(state, `London Library — host ${card.title} (ignore install cost).`);
      return { ok: true };
    }

    case "add_hosted_program_to_grip": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (hosted.length === 0) {
        log(state, `London Library — no hosted program.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...hosted.map((id) => ({
            id: `ll-grip:${id}`,
            label: `Add ${state.cards[id]!.title} to grip`,
            effect: {
              op: "do" as const,
              action: {
                kind: "return_program" as const,
                cardId: id,
              },
            },
          })),
          {
            id: "decline",
            label: "Decline",
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
      });
      return { ok: true };
    }

    case "return_program": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || card.hostId !== sourceId) {
        return {
          ok: false,
          error: "London Library — program not hosted.",
          cites: [],
        };
      }
      // An installed program is uninstalled (CR 8.5.1b); one hosted
      // without being installed just moves (CR 1.13.12).
      if (!uninstallCard(state, cardId, "hand")) {
        unhostCard(state, cardId);
        removeCardFromCurrentZone(state, cardId);
        state.runner.hand.push(cardId);
        card.zone = "runner:grip";
        card.faceup = true;
      }
      log(state, `London Library — add ${card.title} to grip.`);
      return { ok: true };
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
