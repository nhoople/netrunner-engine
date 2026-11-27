import type { ServerId } from "../../state/types.js";
/**
 * Primitive kinds whose procedure is breach.
 * The effect switch in eval.ts dispatches here.
 */
import { breachAlreadyReplaced } from "../../state/access/breachAlreadyReplaced.js";
import type { EffectCtx, EvalResult } from "../eval.js";
import type { Effect } from "../ir/effect.js";
import type { Primitive } from "../ir/primitive.js";
import { fx } from "../ir/fx.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { CR } from "../../timing/labels.js";
import { applyPrimitive, evalEffect } from "../eval.js";
import {
  canInstallHeapCard,
  gripInstallCostAfterDiscount,
} from "../install/runnerInstall.js";

/** A discount that brings a heap card's install cost to 0: "ignoring all costs". */
function heapCostIgnored(state: EffectCtx["state"], cardId: string): number {
  const card = state.cards[cardId];
  return card ? gripInstallCostAfterDiscount(state, card, 0) : 0;
}

export function applyBreachKinds(
  ctx: EffectCtx,
  action: Primitive,
): EvalResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  switch (action.kind) {
    case "may_install_heap_program_instead_of_breach": {
      // Retrieval Run: "If successful, instead of breaching Archives, you
      // may install 1 program from your heap, ignoring all costs." The
      // Runner may breach instead, and picks the program (CR 1.2.1, 9.9.1).
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      if (!state.run || state.run.attackedServerId !== "archives") {
        log(
          state,
          `${source?.title ?? "Run"} — not a successful Archives run.`,
        );
        return { ok: true };
      }
      const programs = state.runner.discardPile.filter(
        (id) =>
          state.cards[id]?.type === "program" &&
          canInstallHeapCard(state, id, heapCostIgnored(state, id)),
      );
      const options: Array<{ id: string; label: string; effect: Effect }> = [
        {
          id: "breach",
          label: "Breach Archives",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "runner", amount: 0 },
          },
        },
        ...programs.map((id) => ({
          id: `install:${id}`,
          label: `Install ${state.cards[id]!.title} ignoring all costs`,
          effect: {
            op: "seq" as const,
            effects: [
              {
                op: "do" as const,
                action: { kind: "set_skip_breach" as const },
              },
              {
                op: "do" as const,
                action: {
                  kind: "install_heap_card" as const,
                  cardId: id,
                  discount: heapCostIgnored(state, id),
                },
              },
            ],
          },
        })),
      ];
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `${source?.title ?? "Run"} — may install 1 program from the heap instead of breaching Archives.`,
      });
      return { ok: true };
    }

    case "may_breach_instead_indexing": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
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
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      if (!state.run || state.run.attackedServerId !== "archives") {
        return { ok: true };
      }
      // "Instead of breaching Archives, you may add 1 faceup card from
      // Archives to the top of R&D."
      // The ability's controller makes its choices (CR 1.14.5).
      // Only faceup cards are offered: the facedown ones are not the
      // Runner's to see (CR 4.4.6c, 10.2.2a). Replacing the breach takes
      // the card moving (CR 9.9.8); declining leaves the breach as usual
      // (CR 6.9.5b).
      const faceup = state.corp.discardPile.filter(
        (id) => state.cards[id]?.faceup,
      );
      if (faceup.length === 0) {
        log(state, `${source?.title ?? "Run"} — no faceup card in Archives.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "breach",
            label: "Breach Archives",
            effect: fx.gainCredits("runner", 0),
          },
          ...faceup.map((id) => ({
            id: `rd-top:${id}`,
            label: `Add ${state.cards[id]!.title} to the top of R&D`,
            effect: fx.seq(
              fx.do({ kind: "set_skip_breach" }),
              fx.do({ kind: "add_archives_card_to_rd_top", cardId: id }),
            ),
          })),
        ],
        logLine: `${source?.title ?? "Run"} — may add 1 faceup Archives card to the top of R&D instead of breaching.`,
      });
      return { ok: true };
    }

    case "may_breach_instead_account_siphon": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
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
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `Account Siphon — may instead of breaching HQ.`,
      });
      return { ok: true };
    }

    case "rearrange_ice_instead_of_breach": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `Escher — not a successful HQ run.`);
        return { ok: true };
      }
      // "Instead of breaching HQ, rearrange any number of ice" has no "may":
      // a replacement applies once created (CR 9.9.8). Arranging no ice is
      // allowed, but the Runner does not breach.
      log(state, `Escher — instead of breaching HQ, rearrange ice.`);
      return evalEffect(ctx, {
        op: "seq",
        effects: [
          { op: "do", action: { kind: "set_skip_breach" } },
          {
            op: "do",
            action: {
              kind: "rearrange_ice",
              chooser: "runner",
              serverIds: Object.keys(state.servers) as ServerId[],
            },
          },
        ],
      });
    }
    case "may_breach_instead_exploratory_romp": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
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
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
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
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
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
        log(state, `${source.title} — breach ${server} when the run ends.`);
        return { ok: true };
      }
      state.pendingStandaloneBreach = {
        sourceId,
        serverId: server,
        ...(action.cannotAccessRoot ? { cannotAccessRoot: true } : {}),
      };
      log(state, `${source.title} — pending standalone breach of ${server}.`);
      return { ok: true };
    }

    case "may_breach_instead_expert_schedule_analyzer": {
      if (breachAlreadyReplaced(state, sourceId)) return { ok: true };
      if (!state.run || state.run.attackedServerId !== "hq") {
        log(state, `${source.title} — no successful HQ run to replace.`);
        return { ok: true };
      }
      // The Runner may still breach normally: this replacement of the
      // breach is optional (CR 6.7.4c, 9.6.9).
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
            id: "reveal",
            label: "Instead of breaching: reveal all cards in HQ",
            effect: {
              op: "seq",
              effects: [
                { op: "do", action: { kind: "set_skip_breach" } },
                { op: "do", action: { kind: "reveal_hq" } },
              ],
            },
          },
        ],
        logLine: `${source.title} — may instead of breaching HQ.`,
      });
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
