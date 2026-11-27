/** Whispers in Nalubaale (win) Kitara pack primitives — v1.140.0. */
import { revealCards } from "../../state/visibility/reveal.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { GameState, RuleCite } from "../../state/types.js";
import { CR } from "../../timing/labels.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { addCompileInstalledToBottom } from "../install/runnerInstallFromOtherZonesKinds.js";
import { shuffleInPlace } from "../../state/rng.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function resolveIndependentSourceTrash(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card?.trashAfterBreakingThisRun) return;
  const origin = state.run?.delayedRunEndSourceZone?.[cardId];
  if (
    (origin !== undefined && card.zone !== origin) ||
    !state.runner.installed.includes(cardId)
  ) {
    log(
      state,
      `${card.title}'s ability does nothing — its source changed zones (CR ${CR.abilityIndependent.number}).`,
    );
    return;
  }
  // Its own ability trashes it, so the Runner does (CR 1.14.5).
  trashCard(state, cardId, { by: "runner" });
  log(state, `${card.title} trashed — broke a subroutine this run.`);
}

/** The Runner chose which run-end delayed ability resolves first (CR 9.1.4). */
export function resolveDelayedRunEndOrder(
  state: GameState,
  optionId: string,
): void {
  const run = state.run;
  if (!run) return;
  run.delayedRunEndOrderResolved = true;
  const trashIds = (run.breakersThatBroke ?? []).filter(
    (id) => state.cards[id]?.trashAfterBreakingThisRun,
  );
  if (optionId === "delayed-run-end:compile-first") {
    addCompileInstalledToBottom(state);
    for (const id of trashIds) resolveIndependentSourceTrash(state, id);
  } else {
    for (const id of trashIds) resolveIndependentSourceTrash(state, id);
    addCompileInstalledToBottom(state);
  }
  run.resumeAfterDelayedOrder = true;
}

function installedRunnerCardsWithNoVirus(state: EffectCtx["state"]): string[] {
  // Printed Contaminate: any installed Runner card with no virus counters
  // (hosted cards remain installed — CR 1.2.1 / card text).
  return state.runner.installed.filter((id) => {
    const c = state.cards[id];
    if (!c) return false;
    return (c.virusCounters ?? 0) === 0;
  });
}

export function applyKitaraWinPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "win_contaminate": {
      const targets = installedRunnerCardsWithNoVirus(state);
      if (targets.length === 0) {
        log(state, `Contaminate — no installed Runner card without virus.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const c = state.cards[targets[0]!]!;
        c.virusCounters = (c.virusCounters ?? 0) + 3;
        log(state, `Contaminate — place 3 virus on ${c.title}.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `contaminate:${id}`,
          label: `Place 3 virus on ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "resolve_contaminate", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "resolve_contaminate": {
      const c = state.cards[action.cardId];
      if (!c) return { ok: true };
      c.virusCounters = (c.virusCounters ?? 0) + 3;
      log(state, `Contaminate — place 3 virus on ${c.title}.`);
      return { ok: true };
    }

    case "search_compile": {
      const zoneIds =
        action.zone === "stack" ? state.runner.deck : state.runner.discardPile;
      const programs = zoneIds.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Compile — no program in ${action.zone}.`);
        if (action.zone === "stack") shuffleInPlace(state, state.runner.deck);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `compile:${id}`,
          label: `Install ${state.cards[id]!.title} ignoring costs`,
          effect: fx.do({
            kind: "install_compile_resolve",
            cardId: id,
            zone: action.zone,
          }),
        })),
      });
      return { ok: true };
    }

    case "bypass_current_encounter": {
      if (!state.run?.encounter) {
        log(state, `Logic Bomb — not encountering ice.`);
        return { ok: true };
      }
      const iceTitle = state.cards[state.run.encounter.iceId]?.title;
      state.run.encounter = null;
      state.run.bypassCurrentEncounter = true;
      log(state, `Logic Bomb — bypass ${iceTitle}.`);
      return { ok: true };
    }

    case "lose_remaining_clicks": {
      const lost = state.runner.clicks;
      state.runner.clicks = 0;
      log(state, `Logic Bomb — lose ${lost} remaining click(s).`);
      return { ok: true };
    }

    case "win_jackpot_place_credit": {
      if (!source) return { ok: true };
      source.hostedCredits = (source.hostedCredits ?? 0) + 1;
      log(state, `Jackpot! — place 1¢ → ${source.hostedCredits}.`);
      return { ok: true };
    }

    case "win_jackpot_take_credits": {
      if (!source) return { ok: true };
      const n = source.hostedCredits ?? 0;
      if (n <= 0) {
        log(state, `Jackpot! — no credits.`);
        return { ok: true };
      }
      // Printed: "take any number of credits from Jackpot!. If you do,
      // trash Jackpot!" — the Runner chooses how many.
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: Array.from({ length: n }, (_, i) => i + 1).map((x) => ({
          id: `jackpot-take:${x}`,
          label: `Take ${x}¢ from Jackpot! and trash it`,
          effect: fx.do({ kind: "take_jackpot_credits_resolve", amount: x }),
        })),
      });
      return { ok: true };
    }

    case "take_jackpot_credits_resolve": {
      if (!source) return { ok: true };
      const take = Math.min(action.amount, source.hostedCredits ?? 0);
      if (take <= 0) return { ok: true };
      state.runner.credits += take;
      source.hostedCredits = 0;
      trashCard(state, sourceId);
      log(state, `Jackpot! — take ${take}¢ and trash.`);
      return { ok: true };
    }

    case "win_viral_weaponization": {
      const n = state.runner.hand.length;
      if (n <= 0) {
        log(state, `Viral Weaponization — grip empty.`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.do({ kind: "net_damage", amount: n }));
    }

    case "win_standard_procedure": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: ["event", "hardware", "program", "resource", "identity"].map(
          (t) => ({
            id: `sp:${t}`,
            label: `Name ${t}`,
            effect: fx.do({
              kind: "win_standard_procedure_named",
              cardType: t,
            }),
          }),
        ),
      });
      return { ok: true };
    }

    case "win_standard_procedure_named": {
      let n = 0;
      for (const id of state.runner.hand) {
        const c = state.cards[id];
        if (c?.type === action.cardType) n += 1;
        if (c) revealCards(state, [c.id], sourceId);
        log(state, `Standard Procedure — reveal ${c.title}.`);
      }
      const gainAmt = n * 2;
      state.corp.credits += gainAmt;
      log(
        state,
        `Standard Procedure — gain ${gainAmt}¢ (${n} ${action.cardType}).`,
      );
      return { ok: true };
    }

    case "place_advancement_on_self": {
      if (!source) return { ok: true };
      const amount = action.amount ?? 1;
      source.advancementCounters = (source.advancementCounters ?? 0) + amount;
      log(
        state,
        `Masvingo — place ${amount} advancement → ${source.advancementCounters}.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
