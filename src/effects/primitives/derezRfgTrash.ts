/** Free Mars (fm) Red Sand pack primitives — v1.133.0. */
import { revealCards } from "../../state/visibility/reveal.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { removeCardFromCurrentZone } from "../../state/turnAndActions/scoring.js";
import { evalEffect } from "../eval.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { random } from "../../state/rng.js";
import { hostCard } from "../../state/hostingAndTrash/host.js";
import { controllerOf, trashCard } from "../../state/hostingAndTrash/trash.js";
import { removeCardFromGame } from "../../state/uninstallAndPosition/uninstall.js";
import type { RuleCite, ServerId } from "../../state/types.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function rfgCard(state: EffectCtx["state"], cardId: string): void {
  removeCardFromGame(state, cardId);
}

export function applyRedsandFmPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "rfg_heap_gain_credits": {
      const heap = [...state.runner.discardPile];
      if (heap.length === 0) {
        log(state, `Bloo Moose — heap empty.`);
        return { ok: true };
      }
      const credits = action.credits ?? 2;
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: heap.map((id) => ({
          id: `bloo:${id}`,
          label: `RFG ${state.cards[id]?.title ?? id}`,
          effect: fx.do({
            kind: "rfg_resolve",
            cardId: id,
            credits,
          }),
        })),
      });
      return { ok: true };
    }

    case "rfg_resolve": {
      rfgCard(state, action.cardId);
      const n = action.credits ?? 2;
      state.runner.credits += n;
      log(
        state,
        `Bloo Moose — RFG ${state.cards[action.cardId]?.title ?? action.cardId}; gain ${n}¢ → ${state.runner.credits}¢.`,
      );
      return { ok: true };
    }

    case "o2_shortage_runner_may_trash_random_grip_or_corp_gains_clicks": {
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "o2-trash",
            label: "Trash 1 card from grip at random",
            effect: fx.do({ kind: "trash_shortage_random_grip" }),
          },
          {
            id: "o2-decline",
            label: "Decline (Corp gains [click][click])",
            effect: fx.do({ kind: "o2_shortage_corp_gains_clicks" }),
          },
        ],
      });
      return { ok: true };
    }

    case "trash_shortage_random_grip": {
      if (state.runner.hand.length === 0) {
        log(state, `O₂ Shortage — grip empty; no trash.`);
        return { ok: true };
      }
      const idx = Math.floor(random(state) * state.runner.hand.length);
      const id = state.runner.hand[idx]!;
      state.runner.hand.splice(idx, 1);
      trashCard(state, id, { by: controllerOf(state, sourceId) });
      log(
        state,
        `O₂ Shortage — Runner trashes ${state.cards[id]?.title ?? id} at random.`,
      );
      return { ok: true };
    }

    case "o2_shortage_corp_gains_clicks": {
      state.corp.clicks = (state.corp.clicks ?? 0) + 2;
      log(
        state,
        `O₂ Shortage — Corp gains [click][click] → ${state.corp.clicks}.`,
      );
      return { ok: true };
    }

    case "rearrange_ice_protecting_all_servers": {
      // Mandatory Seed Replacement: "rearrange any number of ice protecting
      // all servers". Arranging is repositioning among the current
      // positions, by swaps, so each server keeps its number of ice
      // (CR 8.3.1, 8.3.2).
      return evalEffect(
        ctx,
        fx.do({
          kind: "rearrange_ice",
          chooser: "corp",
          serverIds: Object.keys(state.servers) as ServerId[],
        }),
      );
    }

    case "choose_n_grip_to_stack_top": {
      const n = action.count ?? 2;
      const grip = [...state.runner.hand];
      if (grip.length === 0) {
        log(state, `${source?.title ?? "Data Loop"} — grip empty.`);
        return { ok: true };
      }
      const take = Math.min(n, grip.length);
      // Sequential choose: pick cards one-by-one onto stack top.
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `dl:${id}`,
          label: `Add ${state.cards[id]?.title ?? id} to top of stack`,
          effect: fx.do({
            kind: "choose_n_grip_to_stack_top_continue",
            selected: [id],
            remaining: take - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "choose_n_grip_to_stack_top_continue": {
      const selected = action.selected ?? [];
      const remaining = action.remaining ?? 0;
      // Apply already-selected moves lazily at the end.
      if (remaining <= 0 || state.runner.hand.length === 0) {
        for (const id of selected) {
          if (!state.runner.hand.includes(id)) continue;
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          state.runner.deck.unshift(id);
          const c = state.cards[id];
          if (c) c.zone = "runner:stack";
        }
        log(
          state,
          `${source?.title ?? "Data Loop"} — add ${selected.length} card(s) from grip to top of stack.`,
        );
        return { ok: true };
      }
      const grip = state.runner.hand.filter((id) => !selected.includes(id));
      if (grip.length === 0) {
        for (const id of selected) {
          if (!state.runner.hand.includes(id)) continue;
          state.runner.hand = state.runner.hand.filter((x) => x !== id);
          state.runner.deck.unshift(id);
          const c = state.cards[id];
          if (c) c.zone = "runner:stack";
        }
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: grip.map((id) => ({
          id: `dl:${id}`,
          label: `Add ${state.cards[id]?.title ?? id} to top of stack`,
          effect: fx.do({
            kind: "choose_n_grip_to_stack_top_continue",
            selected: [...selected, id],
            remaining: remaining - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "choose_type": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: (["resource", "hardware", "program"] as const).map((t) => ({
          id: `br:${t}`,
          label: `Choose ${t}`,
          effect: fx.do({ kind: "resolve_biased_reporting", cardType: t }),
        })),
      });
      return { ok: true };
    }

    case "resolve_biased_reporting": {
      const t = action.cardType;
      const installed = state.runner.installed.filter(
        (id) => state.cards[id]?.type === t,
      );
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "br:trash-none",
            label: "Trash none",
            effect: fx.do({
              kind: "corp_gain",
              cardType: t,
              trashed: [],
            }),
          },
          ...installed.map((id) => ({
            id: `br:trash:${id}`,
            label: `Trash ${state.cards[id]?.title ?? id} (and continue)`,
            effect: fx.do({
              kind: "runner_trash_continue",
              cardType: t,
              trashed: [id],
              remaining: installed.filter((x) => x !== id),
            }),
          })),
        ],
      });
      return { ok: true };
    }

    case "runner_trash_continue": {
      const trashed = [...(action.trashed ?? [])];
      const remaining = action.remaining ?? [];
      // Trash the newly chosen ones already in trashed that are still installed.
      for (const id of trashed) {
        if (!state.runner.installed.includes(id)) continue;
        trashCard(state, id, { by: controllerOf(state, sourceId) });
        state.runner.credits += 1;
      }
      if (remaining.length === 0) {
        return applyRedsandFmPrimitive(ctx, {
          kind: "corp_gain",
          cardType: action.cardType,
          trashed,
        })!;
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "br:done",
            label: "Done trashing",
            effect: fx.do({
              kind: "corp_gain",
              cardType: action.cardType,
              trashed,
            }),
          },
          ...remaining.map((id) => ({
            id: `br:trash:${id}`,
            label: `Trash ${state.cards[id]?.title ?? id}`,
            effect: fx.do({
              kind: "runner_trash_continue",
              cardType: action.cardType,
              trashed: [...trashed, id],
              remaining: remaining.filter((x) => x !== id),
            }),
          })),
        ],
      });
      return { ok: true };
    }

    case "corp_gain": {
      const t = action.cardType;
      const remaining = state.runner.installed.filter(
        (id) => state.cards[id]?.type === t,
      ).length;
      const gainAmt = remaining * 2;
      state.corp.credits += gainAmt;
      log(
        state,
        `Biased Reporting — Corp gains ${gainAmt}¢ (${remaining} ${t}(s) remain) → ${state.corp.credits}¢.`,
      );
      return { ok: true };
    }

    case "reveal_top_rd_to_hq_then_hq_to_rd_top": {
      const top = state.corp.deck.shift();
      if (top) {
        state.corp.hand.push(top);
        const c = state.cards[top];
        if (c) {
          c.zone = "corp:hq";
          c.faceup = false;
        }
        revealCards(state, [top], sourceId);
        log(state, `Open Forum — reveal ${c?.title ?? top} and add to HQ.`);
      }
      if (state.corp.hand.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `of:${id}`,
          label: `Add ${state.cards[id]?.title ?? id} to top of R&D`,
          effect: fx.do({ kind: "open_forum_hq_to_rd_top", cardId: id }),
        })),
      });
      return { ok: true };
    }

    case "open_forum_hq_to_rd_top": {
      const id = action.cardId;
      if (!state.corp.hand.includes(id)) return { ok: true };
      state.corp.hand = state.corp.hand.filter((x) => x !== id);
      state.corp.deck.unshift(id);
      const c = state.cards[id];
      if (c) {
        c.zone = "corp:rd";
        c.faceup = false;
      }
      log(state, `Open Forum — add ${c?.title ?? id} to top of R&D.`);
      return { ok: true };
    }

    case "host_on_agenda": {
      // Faceup agendas in remote roots (installed).
      const agendas: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const c = state.cards[id];
          if (c?.type === "agenda") agendas.push(id);
        }
      }
      // Also allow turning a facedown agenda faceup — include all installed agendas.
      if (agendas.length === 0) {
        log(state, `Transparency Initiative — no installed agenda.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => ({
          id: `ti:${id}`,
          label: `Host on ${state.cards[id]?.title ?? id}`,
          effect: fx.do({
            kind: "resolve_transparency_initiative_host",
            agendaId: id,
          }),
        })),
      });
      return { ok: true };
    }

    case "resolve_transparency_initiative_host": {
      const agendaId = action.agendaId;
      const agenda = state.cards[agendaId];
      if (!agenda || !source) return { ok: true };
      agenda.faceup = true;
      if (!(agenda.subtypes ?? []).includes("public")) {
        agenda.subtypes = [...(agenda.subtypes ?? []), "public"];
      }
      removeCardFromCurrentZone(state, sourceId);
      hostCard(state, source.id, agendaId, { installed: true });
      source.zone = `hosted:${agendaId}`;
      source.faceup = true;
      // Copy onAdvance onto host path via hosted cards; also set gainCreditsOnAdvance.
      agenda.gainCreditsOnAdvance = (agenda.gainCreditsOnAdvance ?? 0) + 1;
      log(
        state,
        `Transparency Initiative — host on ${agenda.title} (public; +1¢ on advance).`,
      );
      return { ok: true };
    }

    case "host_on_rezzed_ice_as_condition": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]?.rezzed) iceIds.push(id);
        }
      }
      if (iceIds.length === 0) {
        log(state, `Rover Algorithm — no rezzed ice.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: iceIds.map((id) => ({
          id: `rover:${id}`,
          label: `Host on ${state.cards[id]?.title ?? id}`,
          effect: fx.do({
            kind: "host_self_as_condition",
            hostId: id,
          }),
        })),
      });
      return { ok: true };
    }

    default:
      return null;
  }
}
