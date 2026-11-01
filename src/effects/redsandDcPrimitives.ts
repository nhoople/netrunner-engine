/** Daedalus Complex (dc) Red Sand pack primitives — v1.128.0. */
import { abilitiesSuppressed } from "../state/abilities.js";
import { log } from "../state/createGame.js";
import { mayAdvanceInstalledCard } from "../state/advanceable.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite } from "../state/types.js";
import { CR } from "../timing/labels.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";
import { openPendingChoose } from "../state/pendingChoice.js";


type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function remoteServerCount(state: EffectCtx["state"]): number {
  return Object.keys(state.servers).filter((id) => id.startsWith("remote")).length;
}

function rezzedIceIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const iceId of server.ice) {
      const ice = state.cards[iceId];
      if (ice?.rezzed && ice.type === "ice") out.push(iceId);
    }
  }
  return out;
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
    case "derez_up_to_ice": {
      const max = action.max ?? 3;
      const ice = rezzedIceIds(state);
      if (ice.length === 0 || max <= 0) {
        log(state, `Exploit — no rezzed ice to derez.`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.do({ kind: "derez_up_to_ice_continue", remaining: max, cardIds: ice }));
    }

    case "derez_up_to_ice_continue": {
      const remaining = action.remaining ?? 0;
      const cardIds = (action.cardIds ?? []).filter((id) => {
        const c = state.cards[id];
        return c?.rezzed && c.type === "ice";
      });
      if (remaining <= 0 || cardIds.length === 0) {
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = cardIds.map(
        (id) => ({
          id: `derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "derez_card", cardId: id }),
              fx.do({
                kind: "derez_up_to_ice_continue",
                remaining: remaining - 1,
                cardIds: cardIds.filter((x) => x !== id),
              }),
            ],
          },
        }),
      );
      options.push({
        id: "done",
        label: "Done",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      openPendingChoose(state, { sourceId, chooser: "runner", options });
      return { ok: true };
    }

    case "expose_non_ice_then_run": {
      const candidates = Object.values(state.cards).filter((c) => {
        if (c.side !== "corp" || c.type === "ice") return false;
        // Installed Corp cards live at server:<id>:root (see corpInstall).
        const parts = c.zone.split(":");
        return parts[0] === "server" && parts[2] === "root";
      });
      if (candidates.length === 0) {
        log(state, `Spot the Prey — no non-ice card to expose; still run.`);
        return evalEffect(ctx, fx.do({ kind: "may_start_run", servers: "any" }));
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: candidates.map((c) => ({
          id: `expose:${c.id}`,
          label: `Expose ${c.title}`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "expose", pick: "choose", cardId: c.id }),
              fx.do({ kind: "may_start_run", servers: "any" }),
            ],
          },
        })),
      });
      return { ok: true };
    }

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
      return evalEffect(
        ctx,
        {
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
        },
      );
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
      removeCardFromCurrentZone(state, cardId);
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      log(state, `Defense Construct — add facedown card from Archives to HQ.`);
      return { ok: true };
    }

    case "breach_reduce_access_remainder_of_run": {
      const amount = action.amount ?? 1;
      if (!state.run) {
        log(state, `SYNC BRE — no active run.`);
        return { ok: true };
      }
      state.run.breachAccessReduction =
        (state.run.breachAccessReduction ?? 0) + amount;
      log(
        state,
        `SYNC BRE — Runner accesses ${amount} fewer card(s) on each breach this run.`,
      );
      return { ok: true };
    }

    case "rez_up_to_3_ice_discount": {
      const forfeitedAp = state.lastForfeitedAgendaPoints ?? 1;
      const discountPer = 2 * forfeitedAp;
      const unrezzed: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const iceId of server.ice) {
          const ice = state.cards[iceId];
          if (ice && !ice.rezzed && ice.type === "ice") unrezzed.push(iceId);
        }
      }
      if (unrezzed.length === 0) {
        log(state, `Quarantine System — no unrezzed ice.`);
        return { ok: true };
      }
      return evalEffect(
        ctx,
        fx.do({
          kind: "rez_continue",
          remaining: 3,
          discount: discountPer,
          cardIds: unrezzed,
        }),
      );
    }

    case "rez_continue": {
      const remaining = action.remaining ?? 0;
      const discount = action.discount ?? 0;
      const cardIds = (action.cardIds ?? []).filter((id) => {
        const c = state.cards[id];
        return c && !c.rezzed && c.type === "ice";
      });
      if (remaining <= 0 || cardIds.length === 0) return { ok: true };
      const options: { id: string; label: string; effect: Effect }[] =
        cardIds.map((id) => {
          const ice = state.cards[id]!;
          const cost = Math.max(0, (ice.rezCost ?? 0) - discount);
          return {
            id: `rez:${id}`,
            label: `Rez ${ice.title} for ${cost}¢ (−${discount})`,
            effect: fx.do({
              kind: "rez_one",
              cardId: id,
              discount,
              remaining: remaining - 1,
              cardIds: cardIds.filter((x) => x !== id),
            }),
          };
        });
      options.push({
        id: "done",
        label: "Done",
        effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
      });
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "rez_one": {
      const cardId = action.cardId!;
      const discount = action.discount ?? 0;
      const ice = state.cards[cardId];
      if (!ice || ice.rezzed) {
        return evalEffect(
          ctx,
          fx.do({
            kind: "rez_continue",
            remaining: action.remaining ?? 0,
            discount,
            cardIds: action.cardIds ?? [],
          }),
        );
      }
      const cost = Math.max(0, (ice.rezCost ?? 0) - discount);
      if (state.corp.credits < cost) {
        log(state, `Quarantine System — cannot afford ${ice.title}.`);
        return evalEffect(
          ctx,
          fx.do({
            kind: "rez_continue",
            remaining: action.remaining ?? 0,
            discount,
            cardIds: action.cardIds ?? [],
          }),
        );
      }
      state.corp.credits -= cost;
      ice.rezzed = true;
      log(
        state,
        `Quarantine System — rez ${ice.title} for ${cost}¢ (discount ${discount}).`,
      );
      return evalEffect(
        ctx,
        fx.do({
          kind: "rez_continue",
          remaining: action.remaining ?? 0,
          discount,
          cardIds: action.cardIds ?? [],
        }),
      );
    }

    case "forbid_installs_until_run_end": {
      if (!state.run) {
        log(state, `Signal Jamming — no active run.`);
        return { ok: true };
      }
      state.run.forbidInstallsUntilRunEnd = true;
      log(state, `Signal Jamming — cards cannot be installed until the run ends.`);
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
      log(state, `Khondi Plaza — recurring credits set to ${n} (remote servers).`);
      return { ok: true };
    }

    default:
      return null;
  }
}
