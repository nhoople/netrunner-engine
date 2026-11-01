/**
 * Primitive kinds whose procedure is breach.
 * The effect switch in eval.ts dispatches here.
 */
import type {
  EffectCtx,
  EvalResult,
} from "../eval.js";
import type {
  Effect,
  Primitive,
} from "../ir.js";
import { log } from "../../state/createGame.js";
import { openPendingChoose } from "../../state/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import { applyPrimitive } from "../eval.js";

export function applyBreachKinds(ctx: EffectCtx, action: Primitive): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
case "may_breach_instead_indexing": {
      if (!state.run || state.run.attackedServerId !== "rd") {
        log(state, `Indexing — not a successful R&D run.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "breach",
            label: "Breach R&D",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: "arrange",
            label: "Instead of breaching: look at top 5 of R&D and arrange",
            effect: {
              op: "do",
              action: { kind: "breach_instead_indexing_arrange" as const },
            },
          },
        ],
logLine: `Indexing — may instead of breaching R&D.`,
});
      return { ok: true };
    }

case "breach_instead_indexing_arrange": {
      if (state.run) state.run.skipBreach = true;
      return applyPrimitive(ctx, { kind: "look_top_n_rd_arrange", n: 5 });
    }

case "breach_instead_record_reconstructor_archives": {
      if (!state.run || state.run.attackedServerId !== "archives") {
        return { ok: true };
      }
      state.run.skipBreach = true;
      return applyPrimitive(ctx, { kind: "may_add_archives_card_to_rd_top" });
    }

case "may_breach_instead_account_siphon": {
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `Account Siphon — not a successful HQ run.`);
        return { ok: true };
      }
      const maxLose = Math.min(5, state.corp.credits);
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "breach",
          label: "Breach HQ",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      for (let n = 0; n <= maxLose; n++) {
        options.push({
          id: `siphon:${n}`,
          label:
            n === 0
              ? "Siphon: Corp loses 0¢; take 2 tags"
              : `Siphon: Corp loses ${n}¢; gain ${n * 2}¢; take 2 tags`,
          effect: {
            op: "do" as const,
            action: {
              kind: "resolve_account_siphon" as const,
              loseAmount: n,
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `Account Siphon — may instead of breaching HQ.`,
});
      return { ok: true };
    }

case "may_breach_instead_escher": {
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `Escher — not a successful HQ run.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "breach",
            label: "Breach HQ",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          {
            id: "rearrange",
            label: "Instead of breaching: rearrange any ice on any servers",
            effect: {
              op: "do",
              action: { kind: "escher_rearrange_pick_server" as const },
            },
          },
        ],
logLine: `Escher — may instead of breaching HQ.`,
});
      return { ok: true };
    }

case "may_breach_instead_exploratory_romp": {
      const server = state.run?.attackedServerId
        ? state.servers[state.run.attackedServerId]
        : undefined;
      if (!state.run || !server) {
        log(state, `Exploratory Romp — not a successful run.`);
        return { ok: true };
      }
      const advanceable = [...server.ice, ...(server.root ?? [])].filter(
        (id) => (state.cards[id]?.advancementCounters ?? 0) > 0,
      );
      const amount = action.amount;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "breach",
            label: "Breach the server",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "runner", amount: 0 },
            },
          },
          ...(advanceable.length > 0
            ? [
                {
                  id: "romp",
                  label: `Instead of breaching: remove up to ${amount} advancement counters from 1 card`,
                  effect: {
                    op: "do" as const,
                    action: {
                      kind: "choose_exploratory_romp_card" as const,
                      amount,
                    },
                  },
                },
              ]
            : []),
        ],
logLine: `Exploratory Romp — may instead of breaching.`,
});
      return { ok: true };
    }

case "may_breach_instead_vamp": {
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `Vamp — not a successful HQ run.`);
        return { ok: true };
      }
      const maxSpend = state.runner.credits;
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "breach",
          label: "Breach HQ",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
      ];
      for (let n = 0; n <= maxSpend; n++) {
        options.push({
          id: `vamp:${n}`,
          label:
            n === 0
              ? "Vamp: spend 0¢; Corp loses 0¢"
              : `Vamp: spend ${n}¢; Corp loses ${n}¢; take 1 tag`,
          effect: {
            op: "do" as const,
            action: {
              kind: "resolve_vamp" as const,
              spendAmount: n,
            },
          },
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options,
logLine: `Vamp — may instead of breaching HQ.`,
});
      return { ok: true };
    }

case "breach_server_when_run_ends": {
      if (!state.run) {
        return {
          ok: false,
          error: "breach_server_when_run_ends requires an active run.",
          cites: [CR.breach],
        };
      }
      state.run.breachWhenRunEnds = action.server;
      log(
        state,
        `${source.title} — breach ${action.server} when the run ends (CR ${CR.breach.number}).`,
      );
      return { ok: true };
    }

case "breach_server_standalone": {
      const server = action.server as import("../../state/types.js").ServerId;
      if (state.run && !state.run.isPostRunBreach) {
        state.run.breachWhenRunEnds = server;
        if (action.cannotAccessRoot) {
          state.run.cannotAccessRoot = true;
        }
        log(
          state,
          `${source.title} — breach ${server} when the run ends.`,
        );
        return { ok: true };
      }
      state.pendingStandaloneBreach = {
        sourceId,
        serverId: server,
        ...(action.cannotAccessRoot ? { cannotAccessRoot: true } : {}),
      };
      log(
        state,
        `${source.title} — pending standalone breach of ${server}.`,
      );
      return { ok: true };
    }

case "may_breach_instead_expert_schedule_analyzer": {
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `${source.title} — no successful HQ run to replace.`);
        return { ok: true };
      }
      const titles = state.corp.hand.map((id) => state.cards[id]!.title);
      log(
        state,
        `${source.title} — reveal HQ (${titles.length}): ${titles.join(", ") || "empty"}; skip breach.`,
      );
      state.run.skipBreach = true;
      return { ok: true };
    }

case "breach_hq_no_root": {
      return applyPrimitive(ctx, {
        kind: "begin_replace_breach_hq_hand_only",
      });
    }
    default:
      return null;
  }
}
