/** The Underway (uw) SanSan pack primitives. */
import { log } from "../state/createGame.js";
import { beginExpose } from "../state/expose.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect } from "./eval.js";
import type { Effect, Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

export function applySansanUwPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;

  switch (action.kind) {
    case "host_top_n_of_stack_facedown": {
      const n = action.amount;
      for (let i = 0; i < n; i++) {
        const top = state.runner.deck[0];
        if (!top) {
          log(state, `${source.title} — stack empty while hosting.`);
          break;
        }
        state.runner.deck.shift();
        const card = state.cards[top]!;
        card.hostId = sourceId;
        card.faceup = false;
        card.zone = `hosted:${sourceId}`;
        if (!source.hostedCardIds) source.hostedCardIds = [];
        source.hostedCardIds.push(top);
        log(state, `${source.title} hosts a card facedown from stack.`);
      }
      return { ok: true };
    }

    case "street_peddler_install_hosted": {
      const discount = action.discount ?? 1;
      const hosted = (source.hostedCardIds ?? []).filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware" || t === "resource";
      });
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted installable card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: hosted.map((cardId) => ({
          id: `peddler:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} (−${discount}¢)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "street_peddler_install_hosted_card" as const,
              cardId,
              discount,
            },
          },
        })),
      };
      log(state, `${source.title} — choose a hosted card to install.`);
      return { ok: true };
    }

    case "street_peddler_install_hosted_card": {
      const cardId = action.cardId;
      const discount = action.discount ?? 1;
      const card = state.cards[cardId];
      if (
        !card ||
        !(source.hostedCardIds ?? []).includes(cardId) ||
        (card.type !== "program" &&
          card.type !== "hardware" &&
          card.type !== "resource")
      ) {
        log(state, `Street Peddler — invalid hosted card.`);
        return { ok: true };
      }
      const cost = Math.max(0, (card.installCost ?? 0) - discount);
      if (state.runner.credits < cost) {
        log(state, `Street Peddler — insufficient credits (${cost}¢).`);
        return { ok: true };
      }
      state.runner.credits -= cost;
      source.hostedCardIds = (source.hostedCardIds ?? []).filter(
        (id) => id !== cardId,
      );
      card.hostId = undefined;
      card.zone = "runner:rig";
      card.faceup = true;
      state.runner.rig.push(cardId);
      log(state, `Street Peddler — install ${card.title} for ${cost}¢.`);
      if (card.onInstall) {
        const r = evalEffect({ state, sourceId: cardId }, card.onInstall);
        if (!r.ok) return r;
      }
      return { ok: true };
    }

    case "drive_by_expose_and_trash_remote_root": {
      const targets: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === "hq" || sid === "rd" || sid === "archives") continue;
        for (const id of server.root) {
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          if (c.rezzed) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Drive By — no unrezzed remote root card to expose.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `driveby:${id}`,
          label: `Expose ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "drive_by_expose_resolve" as const,
              cardId: id,
            },
          },
        })),
      };
      log(state, `Drive By — choose a remote root card to expose.`);
      return { ok: true };
    }

    case "drive_by_expose_resolve": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) return { ok: true };
      beginExpose(state, cardId);
      if (card.type === "asset" || card.type === "upgrade") {
        for (const server of Object.values(state.servers)) {
          if (server.root.includes(cardId)) {
            server.root = server.root.filter((id) => id !== cardId);
            break;
          }
        }
        card.zone = "corp:archives";
        card.rezzed = false;
        card.faceup = true;
        state.corp.discard.push(cardId);
        log(state, `Drive By — trash exposed ${card.title}.`);
      } else {
        log(state, `Drive By — exposed ${card.title} (not asset/upgrade).`);
      }
      return { ok: true };
    }

    case "corp_must_derez_a_card": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c?.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Muertos — no rezzed Corp card to derez.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const id = targets[0]!;
        state.cards[id]!.rezzed = false;
        log(state, `Muertos — Corp derezzes ${state.cards[id]!.title}.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `muertos-derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: { kind: "derez_card" as const, cardId: id },
          },
        })),
      };
      log(state, `Muertos — Corp must choose a card to derez.`);
      return { ok: true };
    }

    case "corp_may_rez_ignoring_cost": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c && c.side === "corp" && !c.rezzed) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Muertos — no unrezzed Corp card to rez.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> =
        targets.map((id) => ({
          id: `muertos-rez:${id}`,
          label: `Rez ${state.cards[id]!.title} (ignore cost)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "corp_rez_ignoring_cost" as const,
              cardId: id,
            },
          },
        }));
      options.push({
        id: "decline",
        label: "Decline",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options,
      };
      log(state, `Muertos — Corp may rez a card, ignoring rez cost.`);
      return { ok: true };
    }

    case "corp_rez_ignoring_cost": {
      const card = state.cards[action.cardId];
      if (!card || card.side !== "corp") return { ok: true };
      card.rezzed = true;
      card.faceup = true;
      log(state, `Corp rezzes ${card.title}, ignoring rez cost.`);
      return { ok: true };
    }

    case "derez_per_advancement_on_self": {
      const n = source.advancementTokens ?? 0;
      if (n <= 0) {
        log(state, `${source.title} — no advancements; nothing to derez.`);
        return { ok: true };
      }
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c?.rezzed && id !== sourceId) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no rezzed cards to derez.`);
        return { ok: true };
      }
      const max = Math.min(n, targets.length);
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.map((id) => ({
            id: `tg-derez:${id}`,
            label: `Derez ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "derez_n_from_list" as const,
                cardIds: [id],
                remaining: max - 1,
              },
            },
          })),
        ],
      };
      log(state, `${source.title} — derez up to ${max} card(s).`);
      return { ok: true };
    }

    case "derez_n_from_list": {
      for (const id of action.cardIds) {
        const c = state.cards[id];
        if (c?.rezzed) {
          c.rezzed = false;
          log(state, `Derez ${c.title}.`);
        }
      }
      const remaining = action.remaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.ice, ...server.root]) {
          const c = state.cards[id];
          if (c?.rezzed && id !== sourceId && !action.cardIds.includes(id)) {
            targets.push(id);
          }
        }
      }
      if (targets.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `tg-derez:${id}`,
          label: `Derez ${state.cards[id]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "derez_n_from_list" as const,
              cardIds: [...action.cardIds, id],
              remaining: remaining - 1,
            },
          },
        })),
      };
      return { ok: true };
    }

    case "swap_hq_archives_per_advancement_on_self": {
      const n = source.advancementTokens ?? 0;
      if (n <= 0) {
        log(state, `${source.title} — no advancements.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "allele-start",
            label: `Swap HQ ↔ Archives (up to ${n})`,
            effect: {
              op: "do" as const,
              action: {
                kind: "allele_swap_step" as const,
                remaining: n,
              },
            },
          },
          {
            id: "decline",
            label: "Decline",
            effect: {
              op: "do",
              action: { kind: "gain_credits", side: "corp", amount: 0 },
            },
          },
        ],
      };
      log(state, `${source.title} — may swap up to ${n} HQ↔Archives.`);
      return { ok: true };
    }

    case "allele_swap_step": {
      const remaining = action.remaining;
      if (remaining <= 0) return { ok: true };
      const hq = [...state.corp.hand];
      const archives = [...state.corp.discard];
      if (hq.length === 0 || archives.length === 0) {
        log(state, `Allele Repression — HQ or Archives empty.`);
        return { ok: true };
      }
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (const hqId of hq) {
        for (const archId of archives) {
          options.push({
            id: `allele:${hqId}:${archId}`,
            label: `Swap ${state.cards[hqId]!.title} ↔ ${state.cards[archId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "allele_swap_resolve" as const,
                hqCardId: hqId,
                archivesCardId: archId,
                remaining: remaining - 1,
              },
            },
          });
        }
      }
      options.push({
        id: "stop",
        label: "Stop swapping",
        effect: {
          op: "do",
          action: { kind: "gain_credits", side: "corp", amount: 0 },
        },
      });
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "allele_swap_resolve": {
      const hqId = action.hqCardId;
      const archId = action.archivesCardId;
      if (
        !state.corp.hand.includes(hqId) ||
        !state.corp.discard.includes(archId)
      ) {
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== hqId);
      state.corp.discard = state.corp.discard.filter((id) => id !== archId);
      state.corp.hand.push(archId);
      state.corp.discard.push(hqId);
      const hqCard = state.cards[hqId]!;
      const archCard = state.cards[archId]!;
      hqCard.zone = "corp:archives";
      hqCard.faceup = true;
      archCard.zone = "corp:hq";
      archCard.faceup = false;
      log(
        state,
        `Allele Repression — swap ${hqCard.title} (HQ) ↔ ${archCard.title} (Archives).`,
      );
      if (action.remaining > 0) {
        return applySansanUwPrimitive(ctx, {
          kind: "allele_swap_step",
          remaining: action.remaining,
        });
      }
      return { ok: true };
    }

    case "remove_bad_publicity_per_advancement_on_self": {
      const n = source.advancementTokens ?? 0;
      if (n <= 0) {
        log(state, `${source.title} — no advancements.`);
        return { ok: true };
      }
      const currentBp = state.corp.badPublicity ?? 0;
      const remove = Math.min(n, currentBp);
      state.corp.badPublicity = currentBp - remove;
      log(
        state,
        `${source.title} — remove ${remove} bad publicity → ${state.corp.badPublicity}.`,
      );
      return { ok: true };
    }

    case "resolve_subroutine_on_rezzed_ice_protecting_this_server": {
      let serverIce: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (server.root.includes(sourceId)) {
          serverIce = [...server.ice];
          break;
        }
      }
      const picks: Array<{ iceId: string; subIndex: number }> = [];
      for (const id of serverIce) {
        const ice = state.cards[id];
        if (!ice?.rezzed) continue;
        const subs = ice.subroutines ?? [];
        for (let i = 0; i < subs.length; i++) {
          picks.push({ iceId: id, subIndex: i });
        }
      }
      if (picks.length === 0) {
        log(state, `${source.title} — no rezzed protecting ice with subs.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: picks.map((p) => {
          const ice = state.cards[p.iceId]!;
          const sub = ice.subroutines![p.subIndex]!;
          return {
            id: `batty:${p.iceId}:${p.subIndex}`,
            label: `Resolve "${sub.text}" on ${ice.title}`,
            effect: sub.effect,
          };
        }),
      };
      log(
        state,
        `${source.title} — resolve 1 subroutine on protecting ice.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
