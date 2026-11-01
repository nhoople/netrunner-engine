/** Chrome City (cc) SanSan pack primitives. */
import { log } from "../../state/createGame.js";
import { addBreakerStrengthBoostThisRun } from "../../state/lingeringEffects.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { fireOnAgendaAddedToRunnerScore } from "../../state/trashHooks.js";
import type { Effect, Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/pendingChoice.js";


type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function shuffleDeck(deck: string[]): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
}

export function applySansanCcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "swap_stolen_with_corp_scored": {
      const stolenId = state.turn.lastStolenAgendaId;
      if (!stolenId || !state.runner.scoreArea.includes(stolenId)) {
        log(state, `Turntable — no stolen agenda to swap.`);
        return { ok: true };
      }
      const corpScored = state.corp.scoreArea.filter((id) => id !== stolenId);
      if (corpScored.length === 0) {
        log(state, `Turntable — Corp score area empty.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: corpScored.map((id) => ({
          id: `tt-swap:${id}`,
          label: `Swap with ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "swap_turntable_resolve" as const,
              corpAgendaId: id,
            },
          },
        })),
logLine: `Turntable — choose Corp scored agenda to swap.`,
});
      return { ok: true };
    }

    case "swap_turntable_resolve": {
      const stolenId = state.turn.lastStolenAgendaId;
      const corpId = action.corpAgendaId;
      if (
        !stolenId ||
        !state.runner.scoreArea.includes(stolenId) ||
        !state.corp.scoreArea.includes(corpId)
      ) {
        return {
          ok: false,
          error: "Turntable swap — agendas not in score areas.",
          cites: [],
        };
      }
      state.runner.scoreArea = state.runner.scoreArea.filter((id) => id !== stolenId);
      state.corp.scoreArea = state.corp.scoreArea.filter((id) => id !== corpId);
      state.corp.scoreArea.push(stolenId);
      state.runner.scoreArea.push(corpId);
      const stolen = state.cards[stolenId];
      const corpAg = state.cards[corpId];
      if (stolen) stolen.zone = "corp:score";
      if (corpAg) corpAg.zone = "runner:score";
      fireOnAgendaAddedToRunnerScore(state);
      log(
        state,
        `Turntable — swap ${stolen?.title ?? stolenId} with ${corpAg?.title ?? corpId}.`,
      );
      return { ok: true };
    }

    case "net_ready_eyes_choose_icebreaker_strength": {
      const amount = action.amount;
      const breakers = state.runner.installed.filter((id) => {
        const c = state.cards[id];
        return c?.breaker || (c?.subtypes ?? []).includes("icebreaker");
      });
      if (breakers.length === 0) {
        log(state, `Net-Ready Eyes — no installed icebreaker.`);
        return { ok: true };
      }
      if (breakers.length === 1) {
        const id = breakers[0]!;
        if (state.run) {
          addBreakerStrengthBoostThisRun(state, {
            createdBy: sourceId,
            breakerId: id,
            amount,
          });
        }
        log(
          state,
          `Net-Ready Eyes — ${state.cards[id]!.title} +${amount} strength this run.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: breakers.map((id) => ({
          id: `nre:${id}`,
          label: `${state.cards[id]!.title} +${amount} strength`,
          effect: {
            op: "do" as const,
            action: {
              kind: "net_ready_eyes_apply_strength" as const,
              cardId: id,
              amount,
            },
          },
        })),
      });
      return { ok: true };
    }

    case "net_ready_eyes_apply_strength": {
      if (!state.run) {
        return {
          ok: false,
          error: "Net-Ready Eyes — no active run.",
          cites: [],
        };
      }
      const id = action.cardId;
      addBreakerStrengthBoostThisRun(state, {
        createdBy: sourceId,
        breakerId: id,
        amount: action.amount,
      });
      log(
        state,
        `Net-Ready Eyes — ${state.cards[id]?.title ?? id} +${action.amount} strength this run.`,
      );
      return { ok: true };
    }

    case "analog_dreamers_run_rd": {
      state.turn.ccAnalogDreamersRun = true;
      state.pendingStartRun = { sourceId, serverId: "rd" };
      log(state, `Analog Dreamers — run R&D.`);
      return { ok: true };
    }

    case "may_breach_instead_analog_dreamers": {
      if (!state.run || state.run.attackedServerId !== "rd") {
        log(state, `Analog Dreamers — not a successful R&D run.`);
        return { ok: true };
      }
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const c = state.cards[id];
          if (!c) continue;
          if (c.rezzed) continue;
          if (c.type === "ice") continue;
          if ((c.advancementCounters ?? 0) > 0) continue;
          candidates.push(id);
        }
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "breach",
          label: "Breach R&D",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      for (const id of candidates) {
        options.push({
          id: `ad-shuffle:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into R&D`,
          effect: {
            op: "do" as const,
            action: {
              kind: "shuffle_into_rd" as const,
              cardId: id,
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `Analog Dreamers — may instead of breaching R&D.`,
});
      return { ok: true };
    }

    case "shuffle_into_rd": {
      if (state.run) state.run.skipBreach = true;
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) {
        return {
          ok: false,
          error: "Analog Dreamers — card missing.",
          cites: [],
        };
      }
      for (const server of Object.values(state.servers)) {
        if (server.root.includes(cardId)) {
          server.root = server.root.filter((id) => id !== cardId);
        }
      }
      state.corp.deck.push(cardId);
      card.zone = "corp:rd";
      card.faceup = false;
      card.rezzed = false;
      shuffleDeck(state.corp.deck);
      log(state, `Analog Dreamers — shuffle ${card.title} into R&D.`);
      return { ok: true };
    }

    case "runner_cannot_draw_remainder_of_turn": {
      state.turn.ccRunnerCannotDraw = true;
      log(state, `Lockdown — Runner cannot draw for the remainder of this turn.`);
      return { ok: true };
    }

    case "trash_rezzed_copy": {
      const defId = action.defId;
      const rezzed = Object.values(state.cards).filter(
        (c) =>
          c &&
          c.defId === defId &&
          c.type === "ice" &&
          c.rezzed &&
          (c.zone?.includes(":ice") ||
            Object.values(state.servers).some((s) => s.ice.includes(c.id))),
      );
      const ids = rezzed.map((c) => c!.id);
      if (ids.length === 0) {
        log(state, `Immolation Script — no rezzed copy of ${defId}.`);
        return { ok: true };
      }
      if (ids.length === 1) {
        state.turn.ccImmolationScriptUsedThisRun = true;
        return evalEffect(ctx, {
          op: "do",
          action: { kind: "trash_corp_card", cardId: ids[0]! },
        });
      }
      state.turn.ccImmolationScriptUsedThisRun = true;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: ids.map((id) => ({
          id: `imm:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "trash_corp_card" as const, cardId: id },
          },
        })),
      });
      return { ok: true };
    }

    default:
      return null;
  }
}
