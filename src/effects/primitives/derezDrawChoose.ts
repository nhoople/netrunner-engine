import { breakNextSubroutines } from "../../state/turnAndActions/break.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
/** Terminal Directive Cards (td) Red Sand deluxe primitives — v1.130.0. */
import { log } from "../../state/setupAndEnd/createGame.js";
import { enterLingeringPlayArea } from "../../state/zones.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { fireOnPlay } from "../../state/triggers/cardLifecycleHooks.js";
import {
  programUseRecurringCreditsAvailable,
  spendProgramUseRecurringCredits,
  subtractRunnerCreditPool,
} from "../../state/keywordsAndCredits/costs.js";
import { controllerOf, trashCard } from "../../state/hostingAndTrash/trash.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function breakOneSub(
  state: EffectCtx["state"],
  sourceId: string,
  label: string,
): PrimResult {
  const enc = state.run?.encounter;
  if (!enc) {
    log(state, `${label} — no encounter.`);
    return { ok: true };
  }
  const ice = state.cards[enc.iceId];
  // Strength was checked when the ability was used (CR 3.9.5g, 9.5.4).
  const [idx] = breakNextSubroutines(state, sourceId, 1);
  if (idx === undefined) {
    log(state, `${label} — no unbroken subroutines.`);
    return { ok: true };
  }
  log(
    state,
    `${label} — break "${ice?.subroutines?.[idx]?.text ?? `sub ${idx}`}" on ${ice?.title}.`,
  );
  if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
  if (!state.run!.breakersThatBroke.includes(sourceId)) {
    state.run!.breakersThatBroke.push(sourceId);
  }
  return { ok: true };
}

export function applyRedsandTdPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "corp_draw_syn_attack_discard_2_or_4": {
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "draw4",
          label: "Draw 4 cards",
          effect: fx.draw("corp", 4),
        },
      ];
      if (state.corp.hand.length >= 2) {
        options.unshift({
          id: "discard2",
          label: "Discard 2 cards",
          effect: fx.do({ kind: "choose_syn_attack_discard", remaining: 2 }),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `SYN Attack — Corp must discard 2 or draw 4.`,
      });
      return { ok: true };
    }

    case "spend_credits_place_power_counters": {
      const title = source?.title ?? sourceId;
      // A program's own ability: credits for using programs may pay it
      // (CR 1.10.3c: Cyberfeeder pays for Atman's first ability; Mammon).
      const useRecurring =
        action.includeProgramRecurring ?? source?.type === "program";
      const recurring = useRecurring
        ? programUseRecurringCreditsAvailable(state)
        : 0;
      const max = Math.max(0, state.runner.credits) + recurring;
      if (typeof action.amount === "number") {
        const n = Math.min(action.amount, max);
        if (n <= 0 || !source) return { ok: true };
        const fromRecurring = useRecurring
          ? spendProgramUseRecurringCredits(state, n)
          : 0;
        subtractRunnerCreditPool(state, n - fromRecurring);
        source.powerCounters = (source.powerCounters ?? 0) + n;
        log(state, `${title} — spend ${n}¢ for ${n} power counter(s).`);
        return { ok: true };
      }
      if (max <= 0 || !source) {
        log(state, `${title} — no credits to spend.`);
        return { ok: true };
      }
      // "You may spend any number": 0 is a choice (CR 9.6.9c).
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 1; n <= max; n++) {
        options.push({
          id: `spend-power:${n}`,
          label: `Spend ${n}¢ → place ${n} power`,
          effect: fx.do({
            kind: "spend_credits_place_power_counters",
            amount: n,
            includeProgramRecurring: useRecurring,
          }),
        });
      }
      options.push({
        id: "spend-power:0",
        label: "Spend nothing",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "charlatan_run_any_server": {
      state.pendingStartRun = {
        sourceId,
        serverId: "hq",
        // Charlatan: first approached rezzed ice may pay strength to bypass.
      };
      state.turn.charlatanArmed = true;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: (["hq", "rd", "archives"] as ServerId[])
          .concat(
            Object.keys(state.servers).filter(
              (s) => s !== "hq" && s !== "rd" && s !== "archives",
            ) as ServerId[],
          )
          .map((sid) => ({
            id: `run:${sid}`,
            label: `Run ${sid}`,
            effect: fx.do({ kind: "charlatan_start_run", serverId: sid }),
          })),
      });
      return { ok: true };
    }

    case "charlatan_start_run": {
      const serverId = action.serverId as ServerId;
      state.pendingStartRun = { sourceId, serverId };
      state.turn.charlatanArmed = true;
      state.pendingChoice = null;
      log(state, `Charlatan — run ${serverId}.`);
      return { ok: true };
    }

    case "break_sentry_or_barrier": {
      const enc = state.run?.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      const subs = ice?.subtypes ?? [];
      if (!subs.includes("sentry") && !subs.includes("barrier")) {
        return {
          ok: false,
          error: "Adept can only break sentry or barrier subroutines.",
          cites: [],
        };
      }
      return breakOneSub(state, sourceId, "Adept");
    }

    case "break_sentry_or_code_gates": {
      const enc = state.run?.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      const subs = ice?.subtypes ?? [];
      const isSentry = subs.includes("sentry");
      const isCodeGate = subs.includes("code gate");
      if (!isSentry && !isCodeGate) {
        return {
          ok: false,
          error: "Savant can only break sentry or code gate subroutines.",
          cites: [],
        };
      }
      if (isSentry && !isCodeGate) {
        return breakOneSub(state, sourceId, "Savant");
      }
      if (isCodeGate && !isSentry) {
        // Break up to 2 code gate subs
        for (const i of breakNextSubroutines(state, sourceId, 2)) {
          log(
            state,
            `Savant — break "${ice?.subroutines?.[i]?.text ?? `sub ${i}`}" on ${ice?.title}.`,
          );
        }
        if (!state.run!.breakersThatBroke) state.run!.breakersThatBroke = [];
        if (!state.run!.breakersThatBroke.includes(sourceId)) {
          state.run!.breakersThatBroke.push(sourceId);
        }
        return { ok: true };
      }
      // Both subtypes: choose 1 sentry or up to 2 code gate — treat as 1 break for simplicity
      return breakOneSub(state, sourceId, "Savant");
    }

    case "levy_take_program_rest_bottom": {
      const takeId = action.cardId;
      const restIds = action.restIds ?? [];
      if (takeId && state.cards[takeId]) {
        state.runner.hand.push(takeId);
        state.cards[takeId]!.zone = "runner:grip";
        log(state, `Levy — add ${state.cards[takeId]!.title} to grip.`);
      }
      for (const id of restIds) {
        if (!state.cards[id]) continue;
        state.runner.deck.push(id);
        state.cards[id]!.zone = "runner:stack";
      }
      return { ok: true };
    }

    case "play_event_from_heap": {
      const events = state.runner.discardPile.filter(
        (id) => state.cards[id]?.type === "event",
      );
      if (events.length === 0) {
        log(state, `The Shadow Net — no events in heap.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: events.map((id) => ({
          id: `play:${id}`,
          label: `Play ${state.cards[id]!.title} (ignore costs)`,
          effect: fx.do({
            kind: "resolve_the_shadow_net_play",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "resolve_the_shadow_net_play": {
      const cardId = action.cardId;
      if (!cardId) return { ok: true };
      const card = state.cards[cardId];
      if (!card || card.type !== "event") return { ok: true };
      // Remove from heap and fire onPlay ignoring costs
      state.runner.discardPile = state.runner.discardPile.filter(
        (id) => id !== cardId,
      );
      enterLingeringPlayArea(state, cardId, "runner");
      fireOnPlay(state, cardId);
      // Events go to heap after play unless otherwise stated
      trashCard(state, cardId, { by: controllerOf(state, sourceId) });
      log(state, `The Shadow Net — play ${card.title} from heap.`);
      return { ok: true };
    }

    case "jack_out": {
      state.corp.credits += 5;
      if (source)
        trashCard(state, sourceId, { by: controllerOf(state, sourceId) });
      if (state.run) {
        state.run.endedTheRun = true;
        state.run.successful = false;
      }
      log(state, `Black Level Clearance — Runner jacks out; Corp gains 5¢.`);
      return evalEffect(ctx, fx.draw("corp", 1));
    }

    case "armored_servers_activate_this_run": {
      if (state.run) {
        state.run.armoredServersTrashGripAdditionalCost = true;
      }
      log(
        state,
        `Armored Servers — trash 1 grip as additional cost to jack out or break a subroutine this run.`,
      );
      return { ok: true };
    }

    case "tag_or_end_the_run": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "tag",
            label: "Take 1 tag",
            effect: fx.do({ kind: "give_tags", amount: 1 }),
          },
          {
            id: "etr",
            label: "End the run",
            effect: fx.etr(),
          },
        ],
      });
      return { ok: true };
    }

    case "take_any_hosted_credits": {
      const hosted = source?.hostedCredits ?? 0;
      if (!source || hosted < 8) {
        log(state, `Long-Term Investment — need ≥8 hosted credits.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 1; n <= hosted; n++) {
        options.push({
          id: `take:${n}`,
          label: `Take ${n}¢`,
          effect: fx.do({ kind: "take_hosted_credits", amount: n }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    default:
      return null;
  }
}
