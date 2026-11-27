/** Sovereign Sight (ss) Kitara pack primitives — v1.136.0. */
import { printsCanBeAdvanced } from "../../state/counters/advanceable.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import { CR } from "../../timing/labels.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { uninstallCard } from "../../state/uninstallAndPosition/uninstall.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function addInstalledToGrip(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card || !state.runner.installed.includes(cardId)) return;
  uninstallCard(state, cardId, "hand");
}

export function applyKitaraSsPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "add_or_remove_power": {
      const have = source?.powerCounters ?? 0;
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "add",
          label: "Place 1 power counter",
          effect: fx.do({ kind: "add_power_counter", amount: 1 }),
        },
      ];
      if (have > 0) {
        options.push({
          id: "remove",
          label: "Remove 1 hosted power counter",
          effect: fx.do({ kind: "remove_power_counter", amount: 1 }),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options,
        logLine: `${source?.title ?? "Puffer"} — add or remove 1 power counter.`,
      });
      return { ok: true };
    }

    case "add_n_installed_runner_to_grip": {
      const n = Math.max(1, action.amount ?? 2);
      const targets = [...state.runner.installed];
      if (targets.length === 0) {
        log(
          state,
          `${source?.title ?? "Self-Growth Program"} — no installed Runner cards.`,
        );
        return { ok: true };
      }
      // Offer choosing up to n cards; if fewer exist, take all via sequential choices.
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `sgp:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "add_n_installed_runner_to_grip_pick",
            cardId: id,
            remaining: n - 1,
          }),
        })),
        logLine: `${source?.title ?? "Self-Growth Program"} — add ${n} installed Runner card(s) to grip.`,
      });
      return { ok: true };
    }

    case "add_n_installed_runner_to_grip_pick": {
      addInstalledToGrip(state, action.cardId);
      log(
        state,
        `Add ${state.cards[action.cardId]?.title ?? action.cardId} to the grip.`,
      );
      const remaining = action.remaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const targets = [...state.runner.installed];
      if (targets.length === 0) return { ok: true };
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `sgp:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "add_n_installed_runner_to_grip_pick",
            cardId: id,
            remaining: remaining - 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "place_advancement_on_root_of_this_server": {
      let serverId: ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.root.includes(sourceId)) {
          serverId = sid as ServerId;
          break;
        }
      }
      if (!serverId) {
        log(
          state,
          `${source?.title ?? "Calibration Testing"} — not in a server root.`,
        );
        return { ok: true };
      }
      const root = (state.servers[serverId]?.root ?? []).filter(
        (id) => id !== sourceId,
      );
      if (root.length === 0) {
        log(
          state,
          `${source?.title ?? "Calibration Testing"} — no other root cards.`,
        );
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: root.map((id) => ({
          id: `cal:${id}`,
          label: `Advance ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancement_on_card",
            cardId: id,
            amount: 1,
          }),
        })),
      });
      return { ok: true };
    }

    case "place_advancement_on_card": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      card.advancementCounters =
        (card.advancementCounters ?? 0) + (action.amount ?? 1);
      log(
        state,
        `Place ${action.amount ?? 1} advancement on ${card.title} → ${card.advancementCounters}.`,
      );
      return { ok: true };
    }

    case "move_any_advancements_from_self_to_advanceable": {
      const aside = state.resolvingSetAsideAdvancements;
      const have =
        aside?.sourceId === sourceId
          ? aside.count
          : (source?.advancementCounters ?? 0);
      if (have <= 0) {
        log(
          state,
          `${source?.title ?? "Reconstruction Contract"} — no advancements.`,
        );
        return { ok: true };
      }
      const dests: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if (id === sourceId) continue;
          const c = state.cards[id];
          if (!c) continue;
          // Printed: "a card that can be advanced" — agendas, plus cards
          // whose text makes them advanceable (instance canAdvance).
          if (c.type === "agenda" || printsCanBeAdvanced(c)) {
            dests.push(id);
          }
        }
      }
      if (dests.length === 0) {
        log(
          state,
          `${source?.title ?? "Reconstruction Contract"} — no advanceable cards.`,
        );
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const destId of dests) {
        for (let n = 1; n <= have; n++) {
          options.push({
            id: `rc:${destId}:${n}`,
            label: `Move ${n} advancement(s) to ${state.cards[destId]!.title}`,
            effect: fx.do({
              kind: "move_advancements_resolve",
              destId,
              amount: n,
            }),
          });
        }
      }
      openPendingChoose(state, { sourceId, chooser: "corp", options });
      return { ok: true };
    }

    case "move_advancements_resolve": {
      if (!source) return { ok: true };
      const dest = state.cards[action.destId];
      if (!dest) return { ok: true };
      const aside = state.resolvingSetAsideAdvancements;
      const fromAside = aside?.sourceId === sourceId;
      const pool = fromAside ? aside.count : (source.advancementCounters ?? 0);
      const move = Math.min(action.amount, pool);
      log(
        state,
        `Interrupt window — ${move} advancement counter(s) onto ${dest.title} (CR ${CR.trashAbilityKeepsHosted.number}).`,
      );
      if (fromAside && aside) aside.count -= move;
      else
        source.advancementCounters = (source.advancementCounters ?? 0) - move;
      dest.advancementCounters = (dest.advancementCounters ?? 0) + move;
      log(
        state,
        `Reconstruction Contract — move ${move} advancement(s) to ${dest.title}.`,
      );
      return { ok: true };
    }

    case "may_place_advancement_on_self_meat": {
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "accept",
            label: "Place 1 advancement on Reconstruction Contract",
            effect: fx.do({
              kind: "place_advancement_on_card",
              cardId: sourceId,
              amount: 1,
            }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    default:
      return null;
  }
}
