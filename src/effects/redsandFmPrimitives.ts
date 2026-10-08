/** Free Mars (fm) Red Sand pack primitives — v1.133.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";
import { getCardDef } from "../cards/load.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashToHeap(state: EffectCtx["state"], cardId: string): void {
  removeCardFromCurrentZone(state, cardId);
  const card = state.cards[cardId];
  if (!card) return;
  card.zone = "runner:heap";
  card.hostId = undefined;
  state.runner.discard.push(cardId);
}

function rfgCard(state: EffectCtx["state"], cardId: string): void {
  removeCardFromCurrentZone(state, cardId);
  const card = state.cards[cardId];
  if (!card) return;
  card.zone = "removed-from-game";
  card.hostId = undefined;
  card.rezzed = false;
}

function installedPrograms(state: EffectCtx["state"]): string[] {
  return state.runner.rig.filter((id) => state.cards[id]?.type === "program");
}

function installedClanResources(state: EffectCtx["state"]): number {
  return state.runner.rig.filter((id) => {
    const c = state.cards[id];
    return (
      c?.type === "resource" &&
      (c.subtypes ?? []).some((s) => s.toLowerCase() === "clan")
    );
  }).length;
}

export function applyRedsandFmPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "draw_per_installed_clan_resource": {
      const n = installedClanResources(state) * (action.per ?? 1);
      for (let i = 0; i < n; i++) {
        const top = state.runner.deck.shift();
        if (!top) break;
        state.runner.hand.push(top);
        const c = state.cards[top];
        if (c) c.zone = "runner:grip";
      }
      log(state, `${source?.title ?? "Mars for Martians"} — draw ${n} (clan resources).`);
      return { ok: true };
    }

    case "derez_all_ice_rezzed_this_run": {
      const ids = state.run?.iceRezzedThisRunIds ?? [];
      for (const id of ids) {
        const ice = state.cards[id];
        if (!ice || ice.type !== "ice" || !ice.rezzed) continue;
        ice.rezzed = false;
        log(state, `Leave No Trace — derez ${ice.title}.`);
      }
      return { ok: true };
    }

    case "derez_encountered_ice": {
      const iceId = state.run?.encounter?.iceId;
      if (!iceId) return { ok: true };
      const ice = state.cards[iceId];
      if (!ice?.rezzed) return { ok: true };
      ice.rezzed = false;
      if (state.run) state.run.iceDerezzedThisRun = true;
      log(state, `${source?.title ?? "Flashbang"} — derez ${ice.title}.`);
      return { ok: true };
    }

    case "rfg_heap_gain_credits": {
      const heap = [...state.runner.discard];
      if (heap.length === 0) {
        log(state, `Bloo Moose — heap empty.`);
        return { ok: true };
      }
      const credits = action.credits ?? 2;
      state.pendingChoice = {
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
      };
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
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "o2-trash",
            label: "Trash 1 card from grip at random",
            effect: fx.do({ kind: "o2_shortage_trash_random_grip" }),
          },
          {
            id: "o2-decline",
            label: "Decline (Corp gains [click][click])",
            effect: fx.do({ kind: "o2_shortage_corp_gains_clicks" }),
          },
        ],
      };
      return { ok: true };
    }

    case "o2_shortage_trash_random_grip": {
      if (state.runner.hand.length === 0) {
        log(state, `O₂ Shortage — grip empty; no trash.`);
        return { ok: true };
      }
      const idx = Math.floor(Math.random() * state.runner.hand.length);
      const id = state.runner.hand[idx]!;
      state.runner.hand.splice(idx, 1);
      trashToHeap(state, id);
      log(state, `O₂ Shortage — Runner trashes ${state.cards[id]?.title ?? id} at random.`);
      return { ok: true };
    }

    case "o2_shortage_corp_gains_clicks": {
      state.corp.clicks = (state.corp.clicks ?? 0) + 2;
      log(state, `O₂ Shortage — Corp gains [click][click] → ${state.corp.clicks}.`);
      return { ok: true };
    }

    case "helheim_ice_protecting_this_server_strength_until_end_of_run": {
      if (!state.run) return { ok: true };
      let serverId: ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.root.includes(sourceId) || server.ice.includes(sourceId)) {
          serverId = sid as ServerId;
          break;
        }
      }
      if (!serverId) return { ok: true };
      const amount = action.amount ?? 2;
      if (!state.run.helheimServerStrengthBonus) {
        state.run.helheimServerStrengthBonus = {};
      }
      state.run.helheimServerStrengthBonus[serverId] =
        (state.run.helheimServerStrengthBonus[serverId] ?? 0) + amount;
      log(
        state,
        `Helheim Servers — ice protecting ${serverId} has +${amount} strength until end of run.`,
      );
      return { ok: true };
    }

    case "rearrange_ice_protecting_all_servers": {
      // Simplified: for each server with 2+ ice, offer rearrange (first server with choice).
      const servers = Object.values(state.servers).filter((s) => s.ice.length >= 2);
      if (servers.length === 0) {
        log(state, `Mandatory Seed Replacement — no ice to rearrange.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...servers.map((s) => ({
            id: `msr:${s.id}`,
            label: `Rearrange ice protecting ${s.id}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "choose_server_rearrange_ice" as const,
              },
            },
          })),
          {
            id: "msr:done",
            label: "Done rearranging",
            effect: fx.gainCredits("corp", 0),
          },
        ],
      };
      log(state, `Mandatory Seed Replacement — rearrange ice protecting servers.`);
      return { ok: true };
    }

    case "swap_2_other_ice_or_2_non_ice": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "meta-ice",
            label: "Swap 2 other installed ice",
            effect: fx.do({ kind: "may_swap_two_installed_ice" }),
          },
          {
            id: "meta-nonice",
            label: "Swap 2 installed non-ice cards",
            effect: fx.do({ kind: "swap_2_non_ice" }),
          },
        ],
      };
      return { ok: true };
    }

    case "swap_2_non_ice": {
      const cards: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.root) {
          const c = state.cards[id];
          if (c && c.type !== "ice") cards.push(id);
        }
      }
      if (cards.length < 2) {
        log(state, `Metamorph — fewer than 2 installed non-ice cards.`);
        return { ok: true };
      }
      // Pick first two for deterministic simplification when no multi-select UI.
      const [a, b] = cards;
      const ca = state.cards[a!]!;
      const cb = state.cards[b!]!;
      const zoneA = ca.zone;
      const zoneB = cb.zone;
      // Swap zones and server root membership.
      for (const server of Object.values(state.servers)) {
        const ia = server.root.indexOf(a!);
        const ib = server.root.indexOf(b!);
        if (ia >= 0) server.root[ia] = b!;
        if (ib >= 0) server.root[ib] = a!;
      }
      ca.zone = zoneB;
      cb.zone = zoneA;
      log(state, `Metamorph — swap ${ca.title} and ${cb.title}.`);
      return { ok: true };
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
      state.pendingChoice = {
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
      };
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
      state.pendingChoice = {
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
      };
      return { ok: true };
    }

    case "choose_type": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: (["resource", "hardware", "program"] as const).map((t) => ({
          id: `br:${t}`,
          label: `Choose ${t}`,
          effect: fx.do({ kind: "biased_reporting_resolve", cardType: t }),
        })),
      };
      return { ok: true };
    }

    case "biased_reporting_resolve": {
      const t = action.cardType;
      const installed = state.runner.rig.filter(
        (id) => state.cards[id]?.type === t,
      );
      state.pendingChoice = {
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
      };
      return { ok: true };
    }

    case "runner_trash_continue": {
      const trashed = [...(action.trashed ?? [])];
      const remaining = action.remaining ?? [];
      // Trash the newly chosen ones already in trashed that are still installed.
      for (const id of trashed) {
        if (!state.runner.rig.includes(id)) continue;
        trashToHeap(state, id);
        state.runner.credits += 1;
      }
      if (remaining.length === 0) {
        return applyRedsandFmPrimitive(ctx, {
          kind: "corp_gain",
          cardType: action.cardType,
          trashed,
        })!;
      }
      state.pendingChoice = {
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
      };
      return { ok: true };
    }

    case "corp_gain": {
      const t = action.cardType;
      const remaining = state.runner.rig.filter(
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
          c.faceup = true;
        }
        log(state, `Open Forum — reveal ${c?.title ?? top} and add to HQ.`);
      }
      if (state.corp.hand.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `of:${id}`,
          label: `Add ${state.cards[id]?.title ?? id} to top of R&D`,
          effect: fx.do({ kind: "open_forum_hq_to_rd_top", cardId: id }),
        })),
      };
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
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => ({
          id: `ti:${id}`,
          label: `Host on ${state.cards[id]?.title ?? id}`,
          effect: fx.do({
            kind: "transparency_initiative_host_resolve",
            agendaId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "transparency_initiative_host_resolve": {
      const agendaId = action.agendaId;
      const agenda = state.cards[agendaId];
      if (!agenda || !source) return { ok: true };
      agenda.faceup = true;
      if (!(agenda.subtypes ?? []).includes("public")) {
        agenda.subtypes = [...(agenda.subtypes ?? []), "public"];
      }
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = agendaId;
      source.zone = `hosted:${agendaId}`;
      source.faceup = true;
      if (!agenda.hostedCardIds) agenda.hostedCardIds = [];
      agenda.hostedCardIds.push(sourceId);
      // Copy onAdvance onto host path via hosted cards; also set gainCreditsOnAdvance.
      agenda.gainCreditsOnAdvance =
        (agenda.gainCreditsOnAdvance ?? 0) + 1;
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
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: iceIds.map((id) => ({
          id: `rover:${id}`,
          label: `Host on ${state.cards[id]?.title ?? id}`,
          effect: fx.do({
            kind: "host_on_rezzed_ice_as_condition_on",
            iceId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "host_on_rezzed_ice_as_condition_on": {
      const iceId = action.iceId;
      const ice = state.cards[iceId];
      if (!ice || !source) return { ok: true };
      if (ice.cannotHostCards) {
        log(state, `${ice.title} cannot host cards.`);
        return { ok: true };
      }
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = iceId;
      source.zone = `hosted:${iceId}`;
      source.faceup = true;
      source.hostStrengthPerPowerCounter =
        source.hostStrengthPerPowerCounter ??
        (source.defId
          ? getCardDef(source.defId)?.hostStrengthPerPowerCounter
          : undefined) ??
        1;
      if (!ice.hostedCardIds) ice.hostedCardIds = [];
      ice.hostedCardIds.push(sourceId);
      log(state, `Rover Algorithm — host on ${ice.title}.`);
      return { ok: true };
    }

    default:
      return null;
  }
}

export function applyLeanAndMeanStrengthBonus(state: EffectCtx["state"]): void {
  if (!state.run) return;
  const spec = state.run.icebreakerStrengthBonusIfInstalledProgramsLte;
  if (!spec) return;
  if (installedPrograms(state).length > spec.programsMax) return;
  for (const id of state.runner.rig) {
    const c = state.cards[id];
    if (!c) continue;
    const isBreaker =
      Boolean(c.breaker) || (c.subtypes ?? []).includes("icebreaker");
    if (!isBreaker) continue;
    state.run.strengthBoosts[id] =
      (state.run.strengthBoosts[id] ?? 0) + spec.bonus;
  }
  log(
    state,
    `Lean and Mean — icebreakers +${spec.bonus} strength (≤${spec.programsMax} programs).`,
  );
}

/** Unused helper kept for typecheck of Effect import in tooling. */
export function _fmUnusedEffect(_e: Effect): void {}
