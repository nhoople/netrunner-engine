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
import type { EffectCtx } from "./eval.js";
import type { Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

type TrashCorpCard = (state: GameState, cardId: string) => void;

type CanPayTakeTags = (state: GameState, amount: number) => boolean;

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
    case "end_the_run_unless_trash_installed": {
      const installed = [...state.runner.rig];
      if (installed.length === 0) {
        return endTheRun(ctx, trashCorpCardToArchives);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "etr-thunderbolt",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
          {
            id: "trash-installed-thunderbolt",
            label: "Trash 1 of your installed cards",
            effect: {
              op: "do",
              action: { kind: "trash_installed_runner", pick: "choose" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Runner trashes 1 of their installed cards.`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_corp_pays": {
      const amount = Math.max(0, action.amount);
      if (amount <= 0) return { ok: true };
      if (state.corp.credits < amount) {
        log(
          state,
          `Corp cannot pay ${amount}¢ — end the run (CR ${CR.nestedCostUnless.number}).`,
        );
        return endTheRun(ctx, trashCorpCardToArchives);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "corp-pay-nested",
            label: `Pay ${amount}¢`,
            effect: {
              op: "do",
              action: {
                kind: "lose_credits",
                side: "corp",
                amount,
              },
            },
          },
          {
            id: "etr-unless-corp-pay",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Corp pays ${amount}¢ (CR ${CR.nestedCostUnless.number}).`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_pay_credits_per_runner_scored_agenda": {
      const per = Math.max(0, action.creditsPer);
      const agendas = state.runner.score.length;
      const amount = per * agendas;
      if (amount <= 0) return { ok: true };
      if (state.runner.credits < amount) {
        log(
          state,
          `Runner cannot pay ${amount}¢ (${per}×${agendas} agendas) — end the run (CR ${CR.nestedCostUnless.number}).`,
        );
        return endTheRun(ctx, trashCorpCardToArchives);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "pay-per-agenda",
            label: `Pay ${amount}¢ (${per}×${agendas} agendas)`,
            effect: {
              op: "do",
              action: {
                kind: "lose_credits",
                side: "runner",
                amount,
              },
            },
          },
          {
            id: "etr-unless-pay-agendas",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Runner pays ${amount}¢ (${per}×${agendas} agendas) (CR ${CR.nestedCostUnless.number}).`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_runner_spends_clicks": {
      const amount = Math.max(0, action.amount);
      if (amount <= 0) return { ok: true };
      if (state.runner.clicks < amount) {
        log(
          state,
          `Runner cannot spend ${amount} [click] — end the run (CR ${CR.nestedCostUnless.number}).`,
        );
        return endTheRun(ctx, trashCorpCardToArchives);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "runner-spend-clicks-nested",
            label: `Spend ${amount} [click]`,
            effect: {
              op: "do",
              action: {
                kind: "lose_clicks",
                side: "runner",
                amount,
              },
            },
          },
          {
            id: "etr-unless-runner-clicks",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Runner spends ${amount} [click] (CR ${CR.nestedCostUnless.number}).`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_take_tags": {
      const amount = Math.max(0, action.amount);
      // Nested cost: take N tags. Unpayable when a static/mandatory interrupt
      // would prevent that payment (CR 1.16.1b / Funhouse×Jesminder).
      if (amount > 0 && !canPayTakeTagsNestedCost(state, amount)) {
        log(
          state,
          `Cannot take ${amount} tag(s) as nested cost — end the run (CR ${CR.costInterruptStaticMandatory.number} / ${CR.nestedCostUnless.number}).`,
        );
        return endTheRun(ctx, trashCorpCardToArchives);
      }
      if (amount <= 0) {
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "take-tags-nested",
            label: `Take ${amount} tag(s)`,
            effect: {
              op: "do",
              action: { kind: "give_tags", amount },
            },
          },
          {
            id: "etr-unless-tags",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Runner takes ${amount} tag(s) (CR ${CR.nestedCostUnless.number}).`,
      );
      return { ok: true };
    }
    case "end_the_run_unless_net_damage": {
      const amount = Math.max(0, action.amount);
      if (amount <= 0) {
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "suffer-net",
            label: `Suffer ${amount} net damage`,
            effect: {
              op: "do",
              action: { kind: "net_damage", amount },
            },
          },
          {
            id: "etr-unless-net",
            label: "End the run",
            effect: {
              op: "do",
              action: { kind: "end_the_run" },
            },
          },
        ],
      };
      log(
        state,
        `End the run unless the Runner suffers ${amount} net damage (CR ${CR.nestedCostUnless.number}).`,
      );
      return { ok: true };
    }
    default:
      return null;
  }
}
