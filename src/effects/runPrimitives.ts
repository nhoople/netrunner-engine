/**
 * End-the-run primitives. The subroutine and its nested "unless" costs
 * live here; the rest of the run flow stays in eval.ts.
 */
import { log } from "../state/createGame.js";
import {
  hasPayableEndTheRunInterrupt,
  openPendingEndTheRun,
} from "../state/endTheRun.js";
import type { GameState, RuleCite } from "../state/types.js";
import { CR } from "../timing/labels.js";
import { evalEffect, type EffectCtx } from "./eval.js";
import type { Effect, Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

type TrashCorpCard = (state: GameState, cardId: string) => void;

type CanPayTakeTags = (state: GameState, amount: number) => boolean;

/**
 * "[instruction] unless [player] [cost]" (CR 1.16.11b).
 * An empty cost does not resolve the instruction. An unpayable cost
 * resolves it immediately (CR 1.16.1b when the caller marks it unpayable).
 */
export function offerNestedUnless(
  ctx: EffectCtx,
  opts: {
    payer: "corp" | "runner";
    empty?: boolean;
    payable: boolean;
    unpaidLog?: string;
    offerLog: string;
    payFirst?: boolean;
    pay: { id: string; label: string; effect: Effect };
    instruction: { id: string; label: string; effect: Effect };
  },
): PrimResult {
  const { state, sourceId } = ctx;
  if (opts.empty) return { ok: true };
  if (!opts.payable) {
    if (opts.unpaidLog) log(state, opts.unpaidLog);
    return evalEffect(ctx, opts.instruction.effect);
  }
  const options = opts.payFirst === false
    ? [opts.instruction, opts.pay]
    : [opts.pay, opts.instruction];
  state.pendingChoice = { sourceId, chooser: opts.payer, options };
  if (opts.offerLog) log(state, opts.offerLog);
  return { ok: true };
}

function etrOption(id: string): {
  id: string;
  label: string;
  effect: Effect;
} {
  return {
    id,
    label: "End the run",
    effect: { op: "do", action: { kind: "end_the_run" } },
  };
}

function instructionLabel(effect: Effect): string {
  if (effect.op === "do" && effect.action.kind === "end_the_run") {
    return "End the run";
  }
  return "Resolve the instruction";
}

/**
 * Payability for the shared `unless` primitive (CR 1.16.11b).
 * Credit (lose or pay), click, tag, net, and core costs are recognized.
 * Anything else fails closed. Tag payability includes CR 1.16.1b.
 */
function offerGeneralUnless(
  ctx: EffectCtx,
  action: Extract<Primitive, { kind: "unless" }>,
  canPayTakeTagsNestedCost: CanPayTakeTags,
): PrimResult {
  const { state } = ctx;
  const cost = action.cost;
  if (cost.op !== "do") {
    return {
      ok: false,
      error: "unless cost must be a single primitive.",
      cites: [CR.nestedCostUnless],
    };
  }
  const payer = action.payer;
  const pool = payer === "corp" ? state.corp : state.runner;
  let empty: boolean;
  let payable: boolean;
  let unpaidLog = "";
  let costLabel: string;
  let payLabel: string;
  const prim = cost.action;
  switch (prim.kind) {
    case "lose_credits":
    case "runner_pay_credits":
    case "corp_pay_credits":
    case "cd_corp_pay_credits": {
      if (prim.kind === "lose_credits" && prim.side !== payer) {
        return {
          ok: false,
          error: "unless payer must match the credit cost.",
          cites: [CR.nestedCostUnless],
        };
      }
      if (
        (prim.kind === "runner_pay_credits" && payer !== "runner") ||
        ((prim.kind === "corp_pay_credits" || prim.kind === "cd_corp_pay_credits") &&
          payer !== "corp")
      ) {
        return {
          ok: false,
          error: "unless payer must match the credit cost.",
          cites: [CR.nestedCostUnless],
        };
      }
      const amount = Math.max(0, prim.amount ?? 0);
      empty = amount <= 0;
      payable = pool.credits >= amount;
      costLabel = `pays ${amount}¢`;
      payLabel = `Pay ${amount}¢`;
      unpaidLog = `${payer} cannot pay ${amount}¢ — the instruction resolves (CR ${CR.nestedCostUnless.number}).`;
      break;
    }
    case "lose_clicks": {
      if (prim.side !== payer) {
        return {
          ok: false,
          error: "unless payer must match the click cost.",
          cites: [CR.nestedCostUnless],
        };
      }
      const amount = Math.max(0, prim.amount);
      empty = amount <= 0;
      payable = pool.clicks >= amount;
      costLabel = `spends ${amount} [click]`;
      payLabel = `Spend ${amount} [click]`;
      unpaidLog = `${payer} cannot spend ${amount} [click] — the instruction resolves (CR ${CR.nestedCostUnless.number}).`;
      break;
    }
    case "give_tags": {
      if (payer !== "runner") {
        return {
          ok: false,
          error: "unless tag costs are paid by the Runner.",
          cites: [CR.nestedCostUnless],
        };
      }
      const amount = Math.max(0, prim.amount);
      empty = amount <= 0;
      payable =
        prim.cannotBeAvoided === true ||
        canPayTakeTagsNestedCost(state, amount);
      costLabel = `takes ${amount} tag(s)`;
      payLabel = `Take ${amount} tag(s)`;
      unpaidLog = `Cannot take ${amount} tag(s) as nested cost — the instruction resolves (CR ${CR.costInterruptStaticMandatory.number} / ${CR.nestedCostUnless.number}).`;
      break;
    }
    case "net_damage":
    case "core_damage": {
      if (payer !== "runner") {
        return {
          ok: false,
          error: "unless damage costs are suffered by the Runner.",
          cites: [CR.nestedCostUnless],
        };
      }
      const amount = Math.max(0, prim.amount);
      empty = amount <= 0;
      payable = true;
      const word = prim.kind === "net_damage" ? "net" : "core";
      costLabel = `suffers ${amount} ${word} damage`;
      payLabel = `Suffer ${amount} ${word} damage`;
      break;
    }
    default:
      return {
        ok: false,
        error: `unless cost ${prim.kind} is not a recognized nested cost.`,
        cites: [CR.nestedCostUnless],
      };
  }
  const label = instructionLabel(action.instruction);
  return offerNestedUnless(ctx, {
    payer,
    empty,
    payable,
    unpaidLog,
    offerLog: `${label} unless the ${payer} ${costLabel} (CR ${CR.nestedCostUnless.number}).`,
    pay: { id: "unless-pay", label: payLabel, effect: action.cost },
    instruction: {
      id: "unless-instruction",
      label,
      effect: action.instruction,
    },
  });
}

function endTheRun(ctx: EffectCtx, trashCorpCardToArchives: TrashCorpCard): PrimResult {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!state.run) {
    return {
      ok: false,
      error: "End the run with no active run.",
      cites: [CR.endTheRun],
    };
  }
  if (state.run.encounter?.forbidEndTheRunThisEncounter) {
    log(
      state,
      `End the run suppressed this encounter (Banner) (CR ${CR.endTheRun.number}).`,
    );
    return { ok: true };
  }
  if (
    state.run.shredPreventFirstEndTheRun &&
    !state.run.shredFirstEndTheRunUsed
  ) {
    state.run.shredFirstEndTheRunUsed = true;
    const sid = state.run.attackedServerId;
    const rootN = state.servers[sid]?.root.length ?? 0;
    const hq = [...state.corp.hand];
    if (rootN > 0 && hq.length >= rootN) {
      const picks = hq.slice(hq.length - rootN);
      for (const id of picks) {
        trashCorpCardToArchives(state, id);
        log(
          state,
          `Shred — Corp reveals and trashes ${state.cards[id]!.title} from HQ.`,
        );
      }
      state.run.endedTheRun = true;
      state.run.successful = false;
      log(
        state,
        `Shred — Corp trashed ${rootN} from HQ; end the run proceeds.`,
      );
      return { ok: true };
    }
    log(
      state,
      `Shred — prevent end the run (Corp cannot trash ${rootN} from HQ).`,
    );
    return { ok: true };
  }
  // Lucky Charm-class: Corp card ability ETR may open interrupt PAW.
  const fromCorpAbility = Boolean(source && source.side === "corp");
  if (
    fromCorpAbility &&
    hasPayableEndTheRunInterrupt(state) &&
    !state.pendingEndTheRun
  ) {
    openPendingEndTheRun(state, sourceId, true);
    return { ok: true };
  }
  state.run.endedTheRun = true;
  state.run.successful = false;
  log(
    state,
    `End the run (CR ${CR.endTheRun.number}) — run is unsuccessful.`,
  );
  return { ok: true };
}

export function applyRunPrimitive(
  ctx: EffectCtx,
  action: Primitive,
  trashCorpCardToArchives: TrashCorpCard,
  canPayTakeTagsNestedCost: CanPayTakeTags,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "prevent_declare_run_successful": {
      if (!state.run) {
        log(state, `Prevent declare successful — no run.`);
        return { ok: true };
      }
      state.run.cannotDeclareSuccessful = true;
      log(state, `${source.title} — this run cannot be declared successful.`);
      return { ok: true };
    }
    case "end_the_run":
      return endTheRun(ctx, trashCorpCardToArchives);
    case "forbid_end_the_run_this_encounter": {
      if (!state.run?.encounter) {
        log(state, `${source.title} — forbid ETR: no encounter.`);
        return { ok: true };
      }
      state.run.encounter.forbidEndTheRunThisEncounter = true;
      log(
        state,
        `${source.title} — subroutines cannot end the run this encounter.`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_trash_installed":
      return offerNestedUnless(ctx, {
        payer: "runner",
        payable: state.runner.rig.length > 0,
        offerLog:
          "End the run unless the Runner trashes 1 of their installed cards.",
        payFirst: false,
        pay: {
          id: "trash-installed-thunderbolt",
          label: "Trash 1 of your installed cards",
          effect: {
            op: "do",
            action: { kind: "trash_installed_runner", pick: "choose" },
          },
        },
        instruction: etrOption("etr-thunderbolt"),
      });
    case "end_the_run_unless_pay_credits_per_runner_scored_agenda": {
      const per = Math.max(0, action.creditsPer);
      const agendas = state.runner.score.length;
      const amount = per * agendas;
      return offerNestedUnless(ctx, {
        payer: "runner",
        empty: amount <= 0,
        payable: state.runner.credits >= amount,
        unpaidLog: `Runner cannot pay ${amount}¢ (${per}×${agendas} agendas) — end the run (CR ${CR.nestedCostUnless.number}).`,
        offerLog: `End the run unless the Runner pays ${amount}¢ (${per}×${agendas} agendas) (CR ${CR.nestedCostUnless.number}).`,
        pay: {
          id: "pay-per-agenda",
          label: `Pay ${amount}¢ (${per}×${agendas} agendas)`,
          effect: {
            op: "do",
            action: { kind: "lose_credits", side: "runner", amount },
          },
        },
        instruction: etrOption("etr-unless-pay-agendas"),
      });
    }
    case "unless":
      return offerGeneralUnless(ctx, action, canPayTakeTagsNestedCost);
    default:
      return null;
  }
}
