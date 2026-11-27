import { abilitiesSuppressed } from "../../state/continuous/abilities.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { revealCards } from "../../state/visibility/reveal.js";
import { mayAdvanceInstalledCard } from "../../state/counters/advanceable.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import type { RuleCite } from "../../state/types.js";
import { CR } from "../../timing/labels.js";
import type { EffectCtx } from "../eval.js";
import { evalEffect } from "../eval.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { fx, type Primitive } from "../ir.js";
import { rezzedIceIds } from "../rez/rezKinds.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function remoteServerCount(state: EffectCtx["state"]): number {
  return Object.keys(state.servers).filter((id) => id.startsWith("remote"))
    .length;
}

function facedownArchivesIds(state: EffectCtx["state"]): string[] {
  return state.corp.discardPile.filter((id: string) => {
    const c = state.cards[id];
    return c && !c.faceup;
  });
}

export function applyRedsandDcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "prevent_all_but_n_pending_damage": {
      const leave = action.leave ?? 1;
      const pending = state.pendingDamage;
      if (!pending || pending.type !== "net" || pending.remaining <= leave) {
        log(
          state,
          `Prevent all but ${leave} is relevant only when net damage is ${leave + 1} or more (CR ${CR.preventAllButOne.number}).`,
        );
        return { ok: true };
      }
      pending.remaining = leave;
      log(
        state,
        `Expected ${pending.type} damage is set to ${leave} (CR ${CR.preventAllButOne.number}).`,
      );
      return { ok: true };
    }

    case "mad_dash_on_run_end": {
      const stole = (state.run?.agendasStolenThisRun ?? 0) > 0;
      if (stole) {
        return evalEffect(
          ctx,
          fx.do({ kind: "add_to_runner_score_as_agenda", agendaPoints: 1 }),
        );
      }
      return evalEffect(ctx, fx.do({ kind: "meat_damage", amount: 1 }));
    }

    case "may_core_if_rezzed_next_ice": {
      const hasNext = rezzedIceIds(state).some((id) =>
        (state.cards[id]?.subtypes ?? []).includes("next"),
      );
      if (!hasNext) {
        log(state, `NEXT Wave 2 — no rezzed NEXT ice.`);
        return { ok: true };
      }
      return evalEffect(ctx, {
        op: "choose",
        chooser: "corp",
        options: [
          {
            id: "accept",
            label: "Do 1 core damage",
            effect: fx.do({ kind: "core_damage", amount: 1 }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
    }

    case "add_facedown_archives_to_hq_per_advancement": {
      const n = source.advancementCounters ?? 0;
      if (n <= 0) {
        log(state, `Defense Construct — no advancement counters.`);
        return { ok: true };
      }
      const facedown = facedownArchivesIds(state);
      if (facedown.length === 0) {
        log(state, `Defense Construct — no facedown Archives cards.`);
        return { ok: true };
      }
      const take = Math.min(n, facedown.length);
      return evalEffect(
        ctx,
        fx.do({
          kind: "pick_facedown_archives",
          remaining: take,
          cardIds: facedown,
        }),
      );
    }

    case "pick_facedown_archives": {
      const remaining = action.remaining ?? 0;
      const cardIds = (action.cardIds ?? []).filter((id) => {
        const c = state.cards[id];
        return c && state.corp.discardPile.includes(id) && !c.faceup;
      });
      if (remaining <= 0 || cardIds.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: cardIds.map((id) => ({
          id: `hq:${id}`,
          label: `Add facedown Archives card to HQ`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "move_archives_to_hq", cardId: id }),
              fx.do({
                kind: "pick_facedown_archives",
                remaining: remaining - 1,
                cardIds: cardIds.filter((x) => x !== id),
              }),
            ],
          },
        })),
      });
      return { ok: true };
    }

    case "move_archives_to_hq": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.discardPile.includes(cardId)) {
        return { ok: true };
      }
      if (action.reveal) revealCards(state, [cardId], sourceId);
      removeCardFromCurrentZone(state, cardId);
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      log(
        state,
        action.reveal
          ? `Reveal ${card.title} and add it from Archives to HQ (CR ${CR.reveal.number}).`
          : `${state.cards[sourceId]?.title ?? sourceId} — add a card from Archives to HQ.`,
      );
      return { ok: true };
    }

    case "place_advancements_on_forfeit": {
      const ap = action.agendaPoints ?? state.lastForfeitedAgendaPoints ?? 0;
      const x = ap + 1;
      if (x <= 0) return { ok: true };
      const targets = Object.values(state.cards).filter((c) => {
        if (c.side !== "corp") return false;
        // Installed Corp cards live at server:<id>:ice|root (see corpInstall);
        // Jemison places the counters on a card that can be advanced (CR 1.18.3).
        if (!c.zone.startsWith("server:")) return false;
        return mayAdvanceInstalledCard(c);
      });
      if (targets.length === 0) {
        log(state, `Jemison — no installed card for advancements.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((c) => ({
          id: `adv:${c.id}`,
          label: `Place ${x} advancement(s) on ${c.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: c.id,
            amount: x,
          }),
        })),
      });
      return { ok: true };
    }

    case "refresh_khondi_plaza_recurring": {
      if (!source.recurringCreditsMaxEqualsRemoteServers) {
        return { ok: true };
      }
      // Blanked Khondi keeps a 0 pool (CR 9.12.1d).
      if (abilitiesSuppressed(state, sourceId)) {
        source.recurringCreditsMax = 0;
        source.recurringCredits = 0;
        return { ok: true };
      }
      const n = remoteServerCount(state);
      source.recurringCreditsMax = n;
      source.recurringCredits = n;
      log(
        state,
        `Khondi Plaza — recurring credits set to ${n} (remote servers).`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
