/** All That Remains (atr) Lunar pack primitives. */
import { log } from "../state/createGame.js";
import { dealDamage } from "../state/damage.js";
import { autoResolveTrace } from "../state/trace.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashRunnerProgramChoose(
  ctx: EffectCtx,
  label: string,
): PrimResult {
  const { state, sourceId } = ctx;
  const programs = state.runner.rig.filter(
    (id) => state.cards[id]?.type === "program",
  );
  if (programs.length === 0) {
    log(state, `${label} — no Runner programs to trash.`);
    return { ok: true };
  }
  if (programs.length === 1) {
    moveRunnerCardToHeap(state, programs[0]!);
    log(state, `${label} — trash ${state.cards[programs[0]!]!.title}.`);
    return { ok: true };
  }
  state.pendingChoice = {
    sourceId,
    chooser: "corp",
    options: programs.map((id) => ({
      id: `trash-prog:${id}`,
      label: `Trash ${state.cards[id]!.title}`,
      effect: fx.do({ kind: "trash_installed_runner_card", cardId: id }),
    })),
  };
  return { ok: true };
}

export function applyLunarAtrPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "bifrost_may_trigger_scored_agenda_on_score": {
      const candidates = state.corp.score.filter((id) => {
        if (id === sourceId) return false;
        const c = state.cards[id];
        if (!c || c.type !== "agenda") return false;
        if (c.defId === "bifrost-array") return false;
        return Boolean(c.onScore);
      });
      if (candidates.length === 0) {
        log(state, `Bifrost Array — no other scored agenda with when-scored.`);
        return { ok: true };
      }
      state.pendingChoice = {
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
                  kind: "bifrost_fire_scored_agenda_on_score",
                  cardId: id,
                }),
              ],
            },
          })),
        ],
      };
      return { ok: true };
    }
    case "bifrost_fire_scored_agenda_on_score": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card?.onScore || !state.corp.score.includes(cardId)) {
        log(state, `Bifrost Array — target agenda not available.`);
        return { ok: true };
      }
      log(state, `Bifrost Array — trigger when-scored of ${card.title}.`);
      // Queue the agenda's onScore as the sole pending choice option so
      // resolution uses cardId as source (via a trampoline pendingChoice).
      state.pendingChoice = {
        sourceId: cardId,
        chooser: "corp",
        options: [
          {
            id: "bifrost-resolve",
            label: `Resolve ${card.title} when-scored`,
            effect: structuredClone(card.onScore),
          },
        ],
      };
      return { ok: true };
    }
    case "sagittarius_trace_subroutine": {
      const r = autoResolveTrace(
        state,
        sourceId,
        2,
        fx.do({ kind: "sagittarius_trace_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "sagittarius_trace_success": {
      const first = trashRunnerProgramChoose(ctx, "Sagittarius");
      if (state.pendingChoice) return first;
      if ((state.turn.lastResolvedTraceStrength ?? 0) >= 5) {
        return trashRunnerProgramChoose(ctx, "Sagittarius (strength ≥5)");
      }
      return first;
    }
    case "trace_subroutine": {
      const r = autoResolveTrace(
        state,
        sourceId,
        2,
        fx.do({ kind: "trace_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "trace_success": {
      dealDamage(state, "net", 1, sourceId);
      if ((state.turn.lastResolvedTraceStrength ?? 0) >= 5) {
        dealDamage(state, "net", 1, sourceId);
      }
      return { ok: true };
    }
    case "snatch_and_grab_on_play": {
      const r = autoResolveTrace(
        state,
        sourceId,
        3,
        fx.do({ kind: "snatch_and_grab_trace_success" }),
      );
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }
    case "snatch_and_grab_trace_success": {
      const connections = state.runner.rig.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("connection"),
      );
      if (connections.length === 0) {
        log(state, `Snatch and Grab — no connection to trash.`);
        return { ok: true };
      }
      state.pendingChoice = {
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
      };
      return { ok: true };
    }
    case "offer_prevent": {
      const cardId = (action as { cardId: string }).cardId;
      state.pendingChoice = {
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
      };
      return { ok: true };
    }
    case "prevent_with_tag": {
      state.runner.tags += 1;
      state.turn.tagsGivenThisTurn = (state.turn.tagsGivenThisTurn ?? 0) + 1;
      log(state, `Snatch and Grab — Runner takes 1 tag to prevent trash.`);
      if (state.runner.tags > 0) {
        for (const id of [...state.runner.rig]) {
          const res = state.cards[id];
          if (!res?.trashSelfWhenRunnerTagged) continue;
          moveRunnerCardToHeap(state, id);
          log(state, `${res.title} — trashed (Runner is tagged).`);
        }
      }
      return { ok: true };
    }
    case "trash_connection": {
      const cardId = (action as { cardId: string }).cardId;
      if (!state.runner.rig.includes(cardId)) {
        log(state, `Snatch and Grab — connection already gone.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, cardId);
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
        const j = Math.floor(Math.random() * (i + 1));
        [hq[i], hq[j]] = [hq[j]!, hq[i]!];
      }
      const pick = hq.slice(0, Math.min(amount, hq.length));
      for (const id of pick) {
        state.corp.hand = state.corp.hand.filter((x) => x !== id);
        state.corp.discard.push(id);
        state.cards[id]!.zone = "corp:archives";
        state.cards[id]!.faceup = true;
        log(
          state,
          `Corp discards ${state.cards[id]!.title} from HQ at random.`,
        );
      }
      return { ok: true };
    }
    default:
      return null;
  }
}
