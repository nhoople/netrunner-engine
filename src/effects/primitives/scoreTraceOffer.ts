/** All That Remains (atr) Lunar pack primitives. */
import { whenScoredEffect } from "../../state/whenScored.js";
import { CR } from "../../timing/labels.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { dealDamage } from "../../state/damageAndPrevention/damage.js";
import { autoResolveTrace } from "../../state/trace.js";
import { syncCorpHandSizeSubroutines } from "../../state/continuous/handSizeSubroutines.js";
import type { RuleCite } from "../../state/types.js";
import { evalEffect, type EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { discardCard, trashCard } from "../../state/hostingAndTrash/trash.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

export function applyLunarAtrPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "may_score_bifrost_trigger_scored_agenda_on": {
      const candidates = state.corp.scoreArea.filter((id) => {
        if (id === sourceId) return false;
        const c = state.cards[id];
        if (!c || c.type !== "agenda") return false;
        if (c.defId === "bifrost-array") return false;
        return Boolean(whenScoredEffect(c));
      });
      if (candidates.length === 0) {
        log(state, `Bifrost Array — no other scored agenda with when-scored.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "bifrost-decline",
            label: "Decline",
            effect: fx.gainCredits("corp", 0),
          },
          ...candidates.map((id) => ({
            id: `bifrost-fire:${id}`,
            label: `Trigger when-scored of ${state.cards[id]!.title}`,
            // Resolve as the target agenda's onScore with that card as source.
            effect: {
              op: "seq" as const,
              effects: [
                fx.do({
                  kind: "score_bifrost_fire_scored_agenda_on",
                  cardId: id,
                }),
              ],
            },
          })),
        ],
      });
      return { ok: true };
    }
    case "score_bifrost_fire_scored_agenda_on": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      const whenScored = card ? whenScoredEffect(card) : undefined;
      if (!card || !whenScored || !state.corp.scoreArea.includes(cardId)) {
        log(state, `Resolve when-scored — target agenda not available.`);
        return { ok: true };
      }
      log(state, `Resolve the when-scored ability of ${card.title}.`);
      // Queue the agenda's onScore as the sole pending choice option so
      // resolution uses cardId as source (via a trampoline pendingChoice).
      openPendingChoose(state, {
        sourceId: cardId,
        chooser: "corp",
        options: [
          {
            id: "bifrost-resolve",
            label: `Resolve ${card.title} when-scored`,
            effect: structuredClone(whenScored),
          },
        ],
      });
      return { ok: true };
    }
    case "trace_sagittarius_subroutine": {
      // "If successful, trash 1 program. If your trace strength is 5 or
      // greater, trash 1 program": the second part does not need a
      // successful trace (CR 10.8.5). Each trash waits for the one before.
      const trash = fx.do({ kind: "trash_program", pick: "choose" });
      const kick = fx.do({
        kind: "resolve_if_trace_strength_at_least",
        min: 5,
        then: trash,
      });
      const r = autoResolveTrace(state, sourceId, 2, fx.seq(trash, kick), kick);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "resolve_if_trace_strength_at_least": {
      if ((state.turn.lastResolvedTraceStrength ?? 0) < action.min) {
        return { ok: true };
      }
      log(
        state,
        `${state.cards[sourceId]?.title ?? sourceId} — trace strength is ${action.min} or greater (CR ${CR.traceConditionals.number}).`,
      );
      return evalEffect(ctx, action.then);
    }
    case "trace_subroutine": {
      const whenDetermined = fx.do({ kind: "trace_when_determined" });
      const r = autoResolveTrace(
        state,
        sourceId,
        2,
        fx.seq(fx.do({ kind: "trace_success" }), whenDetermined),
        whenDetermined,
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_success": {
      dealDamage(state, "net", 1, sourceId);
      return { ok: true };
    }
    case "trace_when_determined": {
      if ((state.turn.lastResolvedTraceStrength ?? 0) >= 5) {
        log(
          state,
          `${state.cards[sourceId]?.title ?? sourceId} — trace strength is 5 or greater (CR ${CR.traceConditionals.number}).`,
        );
        dealDamage(state, "net", 1, sourceId);
      }
      return { ok: true };
    }
    case "snatch_and_grab_on_play": {
      const r = autoResolveTrace(
        state,
        sourceId,
        3,
        fx.do({ kind: "trace_snatch_and_grab_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_snatch_and_grab_success": {
      const connections = state.runner.installed.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("connection"),
      );
      if (connections.length === 0) {
        log(state, `Snatch and Grab — no connection to trash.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: connections.map((id) => ({
          id: `snatch-pick:${id}`,
          label: `Trash ${state.cards[id]!.title} (Runner may take 1 tag to prevent)`,
          effect: fx.do({
            kind: "offer_prevent",
            cardId: id,
          }),
        })),
      });
      return { ok: true };
    }
    case "offer_prevent": {
      const cardId = (action as { cardId: string }).cardId;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "snatch-take-tag",
            label: "Take 1 tag to prevent trash",
            effect: fx.do({ kind: "prevent_with_tag" }),
          },
          {
            id: "snatch-allow",
            label: `Allow trash of ${state.cards[cardId]?.title ?? cardId}`,
            effect: fx.do({
              kind: "trash_connection",
              cardId,
            }),
          },
        ],
      });
      return { ok: true };
    }
    case "prevent_with_tag": {
      state.runner.tags += 1;
      state.turn.tagsGivenThisTurn = (state.turn.tagsGivenThisTurn ?? 0) + 1;
      log(state, `Snatch and Grab — Runner takes 1 tag to prevent trash.`);
      if (state.runner.tags > 0) {
        for (const id of [...state.runner.installed]) {
          const res = state.cards[id];
          if (!res?.trashSelfWhenRunnerTagged) continue;
          trashCard(state, id);
          log(state, `${res.title} — trashed (Runner is tagged).`);
        }
      }
      return { ok: true };
    }
    case "trash_connection": {
      const cardId = (action as { cardId: string }).cardId;
      if (!state.runner.installed.includes(cardId)) {
        log(state, `Snatch and Grab — connection already gone.`);
        return { ok: true };
      }
      trashCard(state, cardId);
      log(state, `Snatch and Grab — trash ${state.cards[cardId]!.title}.`);
      return { ok: true };
    }
    case "corp_discard_random_from_hq": {
      const amount = Math.max(0, (action as { amount?: number }).amount ?? 2);
      const hq = [...state.corp.hand];
      if (hq.length === 0 || amount <= 0) {
        log(state, `Corp discard random from HQ — nothing to discard.`);
        return { ok: true };
      }
      for (let i = hq.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [hq[i], hq[j]] = [hq[j]!, hq[i]!];
      }
      const pick = hq.slice(0, Math.min(amount, hq.length));
      for (const id of pick) {
        // A discard, not a trash (CR 1.19.3); facedown from HQ (CR 4.4.6b).
        discardCard(state, id);
        log(
          state,
          `Corp discards ${state.cards[id]!.title} from HQ at random.`,
        );
      }
      const encounterIceId = state.run?.encounter?.iceId;
      if (
        encounterIceId &&
        state.cards[encounterIceId]?.dynamicEtrSubroutineCountFromCorpHandSize
      ) {
        syncCorpHandSizeSubroutines(state, encounterIceId);
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
