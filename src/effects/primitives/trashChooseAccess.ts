import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { effectiveRunnerTags } from "../../state/keywordsAndCredits/tags.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyRedsandSoPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "choose_severnius_grip_cards": {
      const remaining = action.remaining ?? 0;
      const trashed = action.trashed ?? 0;
      const cardIds = (action.cardIds ?? []).filter((id) =>
        state.runner.hand.includes(id),
      );
      if (remaining <= 0) {
        const bonus = Math.floor(trashed / 2);
        openPendingChoose(state, {
          sourceId,
          chooser: "runner",
          options: (["hq", "rd"] as const).map((sid) => ({
            id: `run:${sid}`,
            label: `Run ${sid.toUpperCase()} (+${bonus} access)`,
            effect: fx.do({
              kind: "severnius_start_run",
              serverId: sid,
              bonusAccess: bonus,
            }),
          })),
        });
        return { ok: true };
      }
      if (cardIds.length === 0) {
        log(state, `Severnius — grip empty mid-trash.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: cardIds.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "trash_severnius_one_grip", cardId: id }),
              fx.do({
                kind: "choose_severnius_grip_cards",
                remaining: remaining - 1,
                trashed: trashed + 1,
                cardIds: cardIds.filter((x) => x !== id),
              }),
            ],
          },
        })),
      });
      return { ok: true };
    }

    case "severnius_start_run": {
      const serverId = action.serverId as ServerId;
      const bonusAccess = action.bonusAccess ?? 0;
      state.pendingStartRun = {
        sourceId,
        serverId,
        bonusAccess,
      };
      log(
        state,
        `Severnius — pending run on ${serverId} (+${bonusAccess} access).`,
      );
      return { ok: true };
    }

    case "counter_surveillance_run": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: (Object.keys(state.servers) as ServerId[]).map((sid) => ({
          id: `run:${sid}`,
          label: `Run ${sid}`,
          effect: fx.do({
            kind: "counter_surveillance_start_run",
            serverId: sid,
          }),
        })),
      });
      return { ok: true };
    }

    case "counter_surveillance_start_run": {
      const serverId = action.serverId as ServerId;
      state.pendingStartRun = {
        sourceId,
        serverId,
        skipBreach: true,
        onSuccessfulRunEffect: fx.do({
          kind: "counter_surveillance_on_success",
        }),
      };
      log(state, `Counter Surveillance — pending run on ${serverId}.`);
      return { ok: true };
    }

    case "counter_surveillance_on_success": {
      const tags = effectiveRunnerTags(state);
      if (tags <= 0) {
        log(state, `Counter Surveillance — no tags; cannot pay; no access.`);
        return { ok: true };
      }
      if (state.runner.credits < tags) {
        log(
          state,
          `Counter Surveillance — cannot pay ${tags}¢ (have ${state.runner.credits}); no access.`,
        );
        return { ok: true };
      }
      subtractRunnerCreditPool(state, tags);
      log(state, `Counter Surveillance — pay ${tags}¢ (tags).`);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 0; n <= tags; n++) {
        options.push({
          id: `access:${n}`,
          label: n === 0 ? "Access 0 cards" : `Access ${n} card(s)`,
          effect: fx.do({
            kind: "access_n",
            amount: n,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "mobius_on_run_end": {
      if (!state.run?.successful) {
        if (state.turn.mobiusSecondRun) {
          state.turn.mobiusSecondRun = false;
        }
        return { ok: true };
      }
      if (state.turn.mobiusSecondRun) {
        state.turn.mobiusSecondRun = false;
        state.runner.credits += 4;
        log(state, `Möbius — second run successful; gain 4¢.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "run-rd",
            label: "Run R&D again",
            effect: fx.do({ kind: "mobius_queue_second_rd_run" }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "mobius_queue_second_rd_run": {
      state.turn.mobiusSecondRun = true;
      state.pendingStartRun = {
        sourceId,
        serverId: "rd",
        onRunEndEffect: fx.do({ kind: "mobius_on_run_end" }),
      };
      log(state, `Möbius — pending second R&D run.`);
      return { ok: true };
    }

    case "pay_or_trash_top_stack": {
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (state.runner.credits >= 1) {
        options.push({
          id: "pay",
          label: "Pay 1¢",
          effect: fx.do({ kind: "lose_credits", side: "runner", amount: 1 }),
        });
      }
      options.push({
        id: "trash-top",
        label: "Trash the top card of the stack",
        effect: fx.do({ kind: "trash_top_of_stack" }),
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Clyde Van Rite — Runner must pay 1¢ or trash top of stack.`,
      });
      return { ok: true };
    }

    case "remove_bp_equal_forfeited_ap_gain_credits": {
      const x = Math.min(
        state.lastForfeitedAgendaPoints ?? 0,
        state.corp.badPublicity ?? 0,
      );
      if (x > 0) {
        state.corp.badPublicity = (state.corp.badPublicity ?? 0) - x;
        state.corp.credits += x;
        log(state, `Sacrifice — remove ${x} bad publicity; gain ${x}¢.`);
      } else {
        log(state, `Sacrifice — no bad publicity to remove.`);
      }
      return { ok: true };
    }

    default:
      return null;
  }
}
