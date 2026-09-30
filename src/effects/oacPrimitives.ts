/** Order and Chaos (oac) deluxe primitives. */
import { log } from "../state/createGame.js";
import { dealDamage } from "../state/damage.js";
import { autoResolveTrace } from "../state/trace.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import { memoryLimit, usedMemory } from "../state/turn.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function serverIdForCard(
  state: EffectCtx["state"],
  cardId: string,
): ServerId | null {
  const zone = state.cards[cardId]?.zone ?? "";
  if (!zone.startsWith("server:")) return null;
  const parts = zone.split(":");
  return (parts[1] as ServerId) ?? null;
}

function installedIceIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) out.push(id);
  }
  return out;
}

function advanceableInstalled(
  state: EffectCtx["state"],
): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      const c = state.cards[id];
      if (c?.side === "corp" && c.canAdvance) out.push(id);
    }
  }
  return out;
}

export function applyOacPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "firmware_place_advancement_on_advanceable_ice": {
      const cands = installedIceIds(state).filter(
        (id) => state.cards[id]?.canAdvance,
      );
      if (cands.length === 0) {
        log(state, `Firmware Updates — no advanceable ice.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `fw:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 1,
          }),
        })),
      };
      return { ok: true };
    }

    case "glenn_host_from_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Glenn Station — HQ empty.`);
        return { ok: true };
      }
      const hosted = Object.values(state.cards).filter(
        (c) => c.hostId === sourceId,
      );
      if (hosted.length >= (source?.maxHostedCards ?? 1)) {
        log(state, `Glenn Station — already hosting a card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: hq.map((id) => ({
          id: `glenn-host:${id}`,
          label: `Host ${state.cards[id]!.title} facedown`,
          effect: fx.do({ kind: "glenn_host_card", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "glenn_host_card": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.hand.includes(cardId)) {
        return { ok: false, error: "Glenn host target not in HQ.", cites: [] };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      card.zone = `hosted:${sourceId}`;
      card.hostId = sourceId;
      card.rezzed = false;
      log(state, `Glenn Station — host ${card.title} facedown.`);
      return { ok: true };
    }

    case "glenn_retrieve_to_hq": {
      const hosted = Object.values(state.cards).filter(
        (c) => c.hostId === sourceId,
      );
      if (hosted.length === 0) {
        log(state, `Glenn Station — no hosted card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: hosted.map((c) => ({
          id: `glenn-ret:${c.id}`,
          label: `Add ${c.title} to HQ`,
          effect: fx.do({ kind: "glenn_retrieve_card", cardId: c.id }),
        })),
      };
      return { ok: true };
    }

    case "glenn_retrieve_card": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || card.hostId !== sourceId) {
        return {
          ok: false,
          error: "Glenn retrieve target not hosted.",
          cites: [],
        };
      }
      card.hostId = undefined;
      card.zone = "corp:hq";
      state.corp.hand.push(cardId);
      log(state, `Glenn Station — add ${card.title} to HQ.`);
      return { ok: true };
    }

    case "gain_credits_equal_to_runner_credits": {
      const n = state.runner.credits;
      state.corp.credits += n;
      log(state, `High-Risk Investment — Corp gains ${n}¢.`);
      return { ok: true };
    }

    case "constellation_move_advancement_between_ice": {
      const from = installedIceIds(state).filter(
        (id) => (state.cards[id]?.advancementTokens ?? 0) > 0,
      );
      const to = installedIceIds(state).filter(
        (id) => state.cards[id]?.canAdvance,
      );
      if (from.length === 0 || to.length === 0) {
        log(state, `Constellation Protocol — no valid ice.`);
        return { ok: true };
      }
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (const a of from) {
        for (const b of to) {
          if (a === b) continue;
          opts.push({
            id: `const:${a}:${b}`,
            label: `Move advancement ${state.cards[a]!.title} → ${state.cards[b]!.title}`,
            effect: fx.do({
              kind: "constellation_apply_move",
              fromId: a,
              toId: b,
            }),
          });
        }
      }
      if (opts.length === 0) {
        log(state, `Constellation Protocol — no distinct targets.`);
        return { ok: true };
      }
      state.pendingChoice = { sourceId, chooser: "corp", options: opts };
      return { ok: true };
    }

    case "constellation_apply_move": {
      const fromId = (action as { fromId: string }).fromId;
      const toId = (action as { toId: string }).toId;
      const from = state.cards[fromId];
      const to = state.cards[toId];
      if (!from || !to || (from.advancementTokens ?? 0) < 1) {
        return { ok: false, error: "Constellation move invalid.", cites: [] };
      }
      from.advancementTokens = (from.advancementTokens ?? 0) - 1;
      to.advancementTokens = (to.advancementTokens ?? 0) + 1;
      log(
        state,
        `Constellation Protocol — move advancement ${from.title} → ${to.title}.`,
      );
      return { ok: true };
    }

    case "mark_yale_spend_any_agenda_counter_gain_2": {
      const cands = [
        ...state.corp.score,
        ...Object.values(state.cards)
          .filter(
            (c) =>
              c.side === "corp" &&
              (c.agendaCounters ?? 0) > 0 &&
              c.zone.startsWith("server:"),
          )
          .map((c) => c.id),
      ].filter((id) => (state.cards[id]?.agendaCounters ?? 0) > 0);
      if (cands.length === 0) {
        log(state, `Mark Yale — no agenda counters.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `yale:${id}`,
          label: `Spend agenda counter on ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "mark_yale_spend_counter_on", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "mark_yale_spend_counter_on": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || (card.agendaCounters ?? 0) < 1) {
        return { ok: false, error: "No agenda counter to spend.", cites: [] };
      }
      card.agendaCounters = (card.agendaCounters ?? 0) - 1;
      state.corp.credits += 2;
      // Mark Yale continuous: spending an agenda counter also gains 1¢.
      for (const id of Object.keys(state.cards)) {
        const c = state.cards[id];
        const n = (c as { gainCreditsOnSpendAgendaCounter?: number })
          ?.gainCreditsOnSpendAgendaCounter;
        if (n && c.rezzed && c.side === "corp") {
          state.corp.credits += n;
          log(state, `${c.title} — gain ${n}¢ from agenda counter spend.`);
        }
      }
      log(state, `Mark Yale — spend agenda counter on ${card.title}; gain 2¢.`);
      return { ok: true };
    }

    case "place_advancement_on_advanceable_installed": {
      const cands = advanceableInstalled(state);
      if (cands.length === 0) {
        log(state, `Space Camp — no advanceable installed card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `sc:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 1,
          }),
        })),
      };
      return { ok: true };
    }

    case "builder_move_to_outermost": {
      const servers = Object.keys(state.servers) as ServerId[];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: servers.map((sid) => ({
          id: `builder:${sid}`,
          label: `Move Builder to outermost of ${sid}`,
          effect: fx.do({ kind: "builder_move_to_server", serverId: sid }),
        })),
      };
      return { ok: true };
    }

    case "builder_move_to_server": {
      const serverId = (action as { serverId: ServerId }).serverId;
      const from = serverIdForCard(state, sourceId);
      if (!from || !state.servers[serverId]) {
        return { ok: false, error: "Builder move invalid.", cites: [] };
      }
      state.servers[from]!.ice = state.servers[from]!.ice.filter(
        (id) => id !== sourceId,
      );
      state.servers[serverId]!.ice.push(sourceId);
      source!.zone = `server:${serverId}:ice`;
      log(state, `Builder — move to outermost of ${serverId}.`);
      return { ok: true };
    }

    case "place_advancement_on_advanceable_ice_protecting_this_server": {
      const sid = serverIdForCard(state, sourceId);
      if (!sid) return { ok: true };
      const cands = (state.servers[sid]?.ice ?? []).filter(
        (id) => state.cards[id]?.canAdvance,
      );
      if (cands.length === 0) {
        log(state, `Builder — no advanceable ice on this server.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `badv:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 1,
          }),
        })),
      };
      return { ok: true };
    }

    case "checkpoint_schedule_meat_on_successful_run": {
      const amount = (action as { amount: number }).amount;
      if (state.run) {
        const run = state.run as { checkpointMeatOnSuccess?: number };
        run.checkpointMeatOnSuccess = (run.checkpointMeatOnSuccess ?? 0) + amount;
        log(
          state,
          `Checkpoint — schedule ${amount} meat damage if this run is successful.`,
        );
      }
      return { ok: true };
    }

    case "trace_strength_equal_source_advancements": {
      const strength = source?.advancementTokens ?? 0;
      const onSuccess =
        (action as { onSuccess?: Effect }).onSuccess ??
        fx.gainCredits("corp", 0);
      const r = autoResolveTrace(state, sourceId, strength, onSuccess);
      if (!r.ok) return { ok: false, error: r.error, cites: [] };
      return { ok: true };
    }

    case "twins_trash_hq_copy_reencounter": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) {
        log(state, `The Twins — no passed ice.`);
        return { ok: true };
      }
      const title = state.cards[iceId]?.title;
      const copies = state.corp.hand.filter(
        (id) => state.cards[id]?.title === title,
      );
      if (copies.length === 0) {
        log(state, `The Twins — no HQ copy of ${title}.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: copies.map((id) => ({
          id: `twins:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ; re-encounter`,
          effect: fx.do({
            kind: "twins_apply_reencounter",
            trashId: id,
            iceId,
          }),
        })),
      };
      return { ok: true };
    }

    case "twins_apply_reencounter": {
      const trashId = (action as { trashId: string }).trashId;
      const iceId = (action as { iceId: string }).iceId;
      // Trash HQ copy to Archives (reveal implied).
      const card = state.cards[trashId];
      if (card) {
        state.corp.hand = state.corp.hand.filter((id) => id !== trashId);
        card.zone = "corp:archives";
        state.corp.discard.push(trashId);
        card.zone = "corp:archives";
        card.faceup = true;
        card.rezzed = false;
        log(state, `The Twins — trash ${card.title} from HQ.`);
      }
      if (state.run) {
        (state.run as { twinsForceReencounterIceId?: string }).twinsForceReencounterIceId = iceId;
        log(state, `The Twins — force re-encounter of ${state.cards[iceId]?.title}.`);
      }
      return { ok: true };
    }

    case "wanton_destruction_instead_of_breach": {
      if (state.run) state.run.skipBreach = true;
      const clicks = state.runner.clicks;
      const opts: { id: string; label: string; effect: Effect }[] = [
        {
          id: "wanton-decline",
          label: "Decline (breach skipped)",
          effect: fx.gainCredits("runner", 0),
        },
      ];
      for (let n = 1; n <= clicks; n++) {
        opts.push({
          id: `wanton:${n}`,
          label: `Spend ${n} [click]: Corp trashes ${n} from HQ at random`,
          effect: fx.do({ kind: "wanton_spend_clicks_trash_hq", amount: n }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options: opts };
      return { ok: true };
    }

    case "wanton_spend_clicks_trash_hq": {
      const amount = (action as { amount: number }).amount;
      if (state.runner.clicks < amount) {
        return { ok: false, error: "Not enough clicks.", cites: [] };
      }
      state.runner.clicks -= amount;
      const hq = [...state.corp.hand];
      for (let i = 0; i < amount && hq.length > 0; i++) {
        const idx = Math.floor(Math.random() * hq.length);
        const id = hq.splice(idx, 1)[0]!;
        state.corp.hand = state.corp.hand.filter((x) => x !== id);
        const card = state.cards[id]!;
        card.zone = "corp:archives";
        card.faceup = true;
        card.rezzed = false;
        state.corp.discard.push(id);
        log(state, `Wanton Destruction — trash ${card.title} from HQ.`);
      }
      return { ok: true };
    }

    case "uninstall_program_or_hardware_to_grip": {
      const cands = state.runner.rig.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (cands.length === 0) {
        log(state, `Uninstall — no program/hardware installed.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `uninst:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({ kind: "uninstall_to_grip", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "uninstall_to_grip": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.rig.includes(cardId)) {
        return { ok: false, error: "Uninstall target not installed.", cites: [] };
      }
      state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
      card.hostId = undefined;
      card.zone = "runner:grip";
      state.runner.hand.push(cardId);
      log(state, `Uninstall — ${card.title} to grip.`);
      return { ok: true };
    }

    case "chop_bot_trash_installed_then_draw_or_remove_tag": {
      const cands = state.runner.rig.filter((id) => id !== sourceId);
      if (cands.length === 0) {
        log(state, `Chop Bot 3000 — no other installed card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `chop:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "chop_bot_trash_then_choose", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "chop_bot_trash_then_choose": {
      const cardId = (action as { cardId: string }).cardId;
      moveRunnerCardToHeap(state, cardId);
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "chop-draw",
            label: "Draw 1 card",
            effect: fx.draw("runner", 1),
          },
          {
            id: "chop-tag",
            label: "Remove 1 tag",
            effect: fx.do({ kind: "remove_tags", amount: 1 }),
          },
        ],
      };
      return { ok: true };
    }

    case "vigil_draw_if_hq_full": {
      const max = state.corp.maxHandSize;
      if (state.corp.hand.length === max) {
        // draw 1 for runner
        if (state.runner.deck.length > 0) {
          const id = state.runner.deck.shift()!;
          state.cards[id]!.zone = "runner:grip";
          state.runner.hand.push(id);
          log(state, `Vigil — HQ full; draw ${state.cards[id]!.title}.`);
        }
      }
      return { ok: true };
    }

    case "gain_credits_equal_to_agenda_points_of_trigger": {
      const agendaId = (state.turn as { lastScoredOrStolenAgendaId?: string })
        .lastScoredOrStolenAgendaId;
      const pts = agendaId ? (state.cards[agendaId]?.agendaPoints ?? 0) : 0;
      state.runner.credits += pts;
      log(state, `Human First — gain ${pts}¢.`);
      return { ok: true };
    }

    case "sacrificial_clone_prevent_all_damage": {
      if (state.pendingDamage) {
        const prevented = state.pendingDamage.remaining;
        state.pendingDamage.remaining = 0;
        log(state, `Sacrificial Clone — prevent ${prevented} damage.`);
      }
      // Trash all installed hardware, non-virtual resources, all grip; lose credits; remove tags.
      for (const id of [...state.runner.rig]) {
        const c = state.cards[id];
        if (!c) continue;
        if (c.type === "hardware") {
          moveRunnerCardToHeap(state, id);
        } else if (
          c.type === "resource" &&
          !(c.subtypes ?? []).includes("virtual")
        ) {
          moveRunnerCardToHeap(state, id);
        }
      }
      for (const id of [...state.runner.hand]) {
        moveRunnerCardToHeap(state, id);
      }
      state.runner.credits = 0;
      if (state.runner.tags > 0) {
        const removed = state.runner.tags;
        state.runner.tags = 0;
        log(state, `Sacrificial Clone — remove ${removed} tag(s).`);
      }
      return { ok: true };
    }

    case "stim_dealer_turn_begin": {
      const power = source?.powerCounters ?? 0;
      if (power >= 2) {
        source!.powerCounters = 0;
        dealDamage(state, "core", 1, sourceId, { cannotPrevent: true });
        log(state, `Stim Dealer — remove power; suffer 1 unpreventable core.`);
      } else {
        source!.powerCounters = power + 1;
        state.runner.clicks += 1;
        log(state, `Stim Dealer — place power; gain [click].`);
      }
      return { ok: true };
    }

    case "virus_breeding_ground_move_counter": {
      if ((source?.virusCounters ?? 0) < 1) {
        log(state, `Virus Breeding Ground — no virus counters.`);
        return { ok: true };
      }
      const cands = state.runner.rig.filter(
        (id) =>
          id !== sourceId && (state.cards[id]?.virusCounters ?? 0) >= 1,
      );
      if (cands.length === 0) {
        log(state, `Virus Breeding Ground — no other card with virus.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `vbg:${id}`,
          label: `Move virus to ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "vbg_apply_move", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "vbg_apply_move": {
      const cardId = (action as { cardId: string }).cardId;
      if ((source?.virusCounters ?? 0) < 1) {
        return { ok: false, error: "No virus to move.", cites: [] };
      }
      source!.virusCounters = (source!.virusCounters ?? 0) - 1;
      const t = state.cards[cardId]!;
      t.virusCounters = (t.virusCounters ?? 0) + 1;
      log(state, `Virus Breeding Ground — move virus to ${t.title}.`);
      return { ok: true };
    }

    case "qianju_lose_click_prevent_tag_until_next_turn": {
      if (state.runner.clicks < 1) {
        log(state, `Qianju PT — no click to lose.`);
        return { ok: true };
      }
      state.runner.clicks -= 1;
      (state.runner as { qianjuPreventTagUntilNextTurn?: boolean }).qianjuPreventTagUntilNextTurn = true;
      log(state, `Qianju PT — lose [click]; prevent 1 tag until next turn.`);
      return { ok: true };
    }

    case "data_folding_gain_if_unused_mu_gte": {
      const threshold = (action as { threshold: number }).threshold;
      const amount = (action as { amount: number }).amount;
      const unused = memoryLimit(state) - usedMemory(state);
      if (unused >= threshold) {
        state.runner.credits += amount;
        log(state, `Data Folding — gain ${amount}¢ (${unused} unused MU).`);
      }
      return { ok: true };
    }

    default:
      return null;
  }
}
