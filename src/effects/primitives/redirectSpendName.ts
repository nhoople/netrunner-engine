/** Escalation (es) Flashpoint pack primitives — v1.124.0. */
import {
  breakNextSubroutines,
  interfaceBlock,
  runnerBreakBlock,
} from "../../state/turnAndActions/break.js";
import { subtractRunnerCreditPool } from "../../state/keywordsAndCredits/costs.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { addBreakerStrengthBoostThisEncounter } from "../../state/continuous/lingeringEffects.js";
import type { RuleCite } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { controllerOf, trashCard } from "../../state/hostingAndTrash/trash.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyFlashpointEsPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "spend_pump_and_break": {
      if (!state.run?.encounter) {
        log(state, `Black Orchestra — no encounter.`);
        return { ok: true };
      }
      addBreakerStrengthBoostThisEncounter(state, {
        createdBy: sourceId,
        breakerId: sourceId,
        amount: 2,
      });
      log(state, `Black Orchestra — +2 strength this encounter.`);
      const enc = state.run.encounter;
      const ice = state.cards[enc.iceId];
      if (!ice || !(ice.subtypes ?? []).includes("code gate")) {
        return { ok: true };
      }
      // "Then, if this program can interface with the code gate" (CR 3.9.5g).
      const blocked =
        interfaceBlock(state, sourceId, enc.iceId) ??
        runnerBreakBlock(state, sourceId, enc.iceId);
      if (blocked) {
        log(state, `Black Orchestra — cannot interface: ${blocked.error}`);
        return { ok: true };
      }
      const toBreak = breakNextSubroutines(state, sourceId, 2);
      if (toBreak.length > 0) {
        log(
          state,
          `Black Orchestra — break ${toBreak.length} code gate subroutine(s).`,
        );
      }
      return { ok: true };
    }

    case "shuffle_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Alexa Belsky — HQ empty.`);
        return { ok: true };
      }
      // Runner may pay 2¢ per card to trash instead of shuffle.
      const maxPrevent = Math.floor(state.runner.credits / 2);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 0; n <= Math.min(maxPrevent, hq.length); n++) {
        options.push({
          id: `alexa:${n}`,
          label:
            n === 0
              ? "Decline (shuffle all HQ into R&D)"
              : `Pay ${n * 2}¢: trash ${n} random HQ instead of shuffling`,
          effect: fx.do({
            kind: "shuffle_resolve",
            amount: n,
          }),
        });
      }
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "shuffle_resolve": {
      const prevent = action.amount ?? 0;
      const hq = [...state.corp.hand];
      if (prevent > 0) {
        const cost = prevent * 2;
        if (state.runner.credits < cost) {
          log(state, `Alexa Belsky — Runner cannot afford prevent.`);
        } else {
          subtractRunnerCreditPool(state, cost);
          // Trash prevent random cards from HQ instead of shuffling them.
          const shuffled = [...hq];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(random(state) * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
          }
          const toTrash = shuffled.slice(0, prevent);
          const toShuffle = shuffled.slice(prevent);
          for (const id of toTrash) {
            // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
            trashCard(state, id, { by: controllerOf(state, sourceId) });
            const c = state.cards[id];
            if (c) {
              c.faceup = false;
            }
          }
          for (const id of toShuffle) {
            state.corp.hand = state.corp.hand.filter((x) => x !== id);
            state.corp.deck.unshift(id);
            const c = state.cards[id];
            if (c) {
              c.zone = "corp:rd";
              c.faceup = false;
            }
          }
          // Shuffle R&D
          for (let i = state.corp.deck.length - 1; i > 0; i--) {
            const j = Math.floor(random(state) * (i + 1));
            [state.corp.deck[i], state.corp.deck[j]] = [
              state.corp.deck[j]!,
              state.corp.deck[i]!,
            ];
          }
          log(
            state,
            `Alexa Belsky — Runner pays ${cost}¢; trash ${toTrash.length}; shuffle ${toShuffle.length} into R&D.`,
          );
          return { ok: true };
        }
      }
      // Shuffle all HQ into R&D
      for (const id of hq) {
        state.corp.hand = state.corp.hand.filter((x) => x !== id);
        state.corp.deck.unshift(id);
        const c = state.cards[id];
        if (c) {
          c.zone = "corp:rd";
          c.faceup = false;
        }
      }
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [state.corp.deck[i], state.corp.deck[j]] = [
          state.corp.deck[j]!,
          state.corp.deck[i]!,
        ];
      }
      log(state, `Alexa Belsky — shuffle ${hq.length} HQ card(s) into R&D.`);
      return { ok: true };
    }

    case "net_mercur_place_or_draw": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "place",
            label: "Place 1¢ on Net Mercur",
            effect: fx.do({ kind: "net_mercur_place_credit" }),
          },
          {
            id: "draw",
            label: "Draw 1 card",
            effect: fx.do({ kind: "draw", side: "runner", amount: 1 }),
          },
        ],
      });
      return { ok: true };
    }

    case "net_mercur_place_credit": {
      source.hostedCredits = (source.hostedCredits ?? 0) + 1;
      log(state, `Net Mercur — place 1¢ → ${source.hostedCredits} hosted.`);
      return { ok: true };
    }

    default:
      return null;
  }
}
