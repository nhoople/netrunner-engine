/** Magnum Opus (mo) primitives — v1.142.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function shuffleInPlace(arr: string[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function moveHeapCardToStack(state: EffectCtx["state"], cardId: string): void {
  state.runner.discard = state.runner.discard.filter((id) => id !== cardId);
  const c = state.cards[cardId]!;
  c.zone = "runner:stack";
  c.faceup = false;
  state.runner.deck.push(cardId);
}

function offerHeapShufflePick(
  ctx: EffectCtx,
  remaining: number,
): PrimResult {
  const { state, sourceId } = ctx;
  const heap = [...state.runner.discard];
  if (remaining <= 0 || heap.length === 0) {
    shuffleInPlace(state.runner.deck);
    state.turn.moHeapShuffleRemaining = undefined;
    return { ok: true };
  }
  state.turn.moHeapShuffleRemaining = remaining;
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: heap.map((cardId) => ({
      id: `mo-shuffle:${cardId}`,
      label: `Shuffle ${state.cards[cardId]!.title} into stack`,
      effect: fx.do({ kind: "mo_shuffle_heap_pick", cardId }),
    })),
  };
  return { ok: true };
}

function sharedTypeMax(types: string[]): number {
  if (types.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of types) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let max = 0;
  for (const n of counts.values()) {
    if (n > max) max = n;
  }
  return max;
}

function iceCandidatesFromHqOrArchives(
  state: EffectCtx["state"],
): Array<{ cardId: string; from: "hq" | "archives" }> {
  const out: Array<{ cardId: string; from: "hq" | "archives" }> = [];
  for (const id of state.corp.hand) {
    if (state.cards[id]?.type === "ice") out.push({ cardId: id, from: "hq" });
  }
  for (const id of state.corp.discard) {
    if (state.cards[id]?.type === "ice") {
      out.push({ cardId: id, from: "archives" });
    }
  }
  return out;
}

export function applyMagnumOpusPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "shuffle_n_heap_cards_into_stack": {
      const amount = Math.max(0, action.amount);
      const heap = [...state.runner.discard];
      if (amount <= 0 || heap.length === 0) {
        log(state, `${source?.title ?? "Labor Rights"} — no heap cards to shuffle.`);
        return { ok: true };
      }
      const n = Math.min(amount, heap.length);
      if (heap.length <= n) {
        for (const id of heap) moveHeapCardToStack(state, id);
        shuffleInPlace(state.runner.deck);
        log(
          state,
          `${source?.title ?? "Labor Rights"} — shuffle all ${heap.length} heap card(s) into stack.`,
        );
        return { ok: true };
      }
      log(
        state,
        `${source?.title ?? "Labor Rights"} — choose ${n} heap card(s) to shuffle.`,
      );
      return offerHeapShufflePick(ctx, n);
    }

    case "mo_shuffle_heap_pick": {
      const cardId = action.cardId;
      const remaining = state.turn.moHeapShuffleRemaining ?? 0;
      if (!state.runner.discard.includes(cardId) || remaining <= 0) {
        log(state, `Shuffle heap — invalid pick.`);
        return { ok: true };
      }
      moveHeapCardToStack(state, cardId);
      log(state, `Shuffle ${state.cards[cardId]!.title} into stack.`);
      return offerHeapShufflePick(ctx, remaining - 1);
    }

    case "mo_crowdfunding_may_install_from_heap_ignore_costs": {
      const minRuns = action.minSuccessfulRuns ?? 3;
      if (!state.runner.discard.includes(sourceId)) {
        log(state, `Crowdfunding — not in heap.`);
        return { ok: true };
      }
      const runs = state.turn.successfulRunCountThisTurn ?? 0;
      if (runs < minRuns) {
        log(
          state,
          `Crowdfunding — need ${minRuns} successful runs this turn (have ${runs}).`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "accept",
            label: "Install Crowdfunding from heap, ignoring all costs",
            effect: fx.do({ kind: "mo_crowdfunding_install_resolve" }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({
              kind: "gain_credits",
              side: "runner",
              amount: 0,
            }),
          },
        ],
      };
      log(
        state,
        `Crowdfunding — may install from heap ignoring costs (${runs} successful runs).`,
      );
      return { ok: true };
    }

    case "mo_crowdfunding_install_resolve": {
      if (!state.runner.discard.includes(sourceId)) {
        log(state, `Crowdfunding — not in heap.`);
        return { ok: true };
      }
      state.runner.discard = state.runner.discard.filter((id) => id !== sourceId);
      state.runner.rig.push(sourceId);
      source.zone = "runner:rig";
      source.faceup = true;
      source.hostId = undefined;
      if ((source.hostedCreditsOnInstall ?? 0) > 0) {
        source.hostedCredits = source.hostedCreditsOnInstall;
      }
      log(state, `Crowdfunding — install from heap ignoring all costs.`);
      if (source.onInstall) {
        return evalEffect({ state, sourceId }, source.onInstall);
      }
      return { ok: true };
    }

    case "mo_install_ice_hq_or_archives_any_position_ignore_costs": {
      const ice = iceCandidatesFromHqOrArchives(state);
      if (ice.length === 0) {
        log(state, `Timely Public Release — no ice in HQ or Archives.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: ice.map(({ cardId, from }) => ({
          id: `mo-ice:${from}:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} from ${from.toUpperCase()}`,
          effect: fx.do({
            kind: "mo_install_ice_choose_server",
            iceId: cardId,
            from,
          }),
        })),
      };
      log(
        state,
        `Timely Public Release — choose ice from HQ or Archives.`,
      );
      return { ok: true };
    }

    case "mo_install_ice_choose_server": {
      const ice = state.cards[action.iceId];
      if (!ice || ice.type !== "ice") {
        log(state, `Timely Public Release — invalid ice.`);
        return { ok: true };
      }
      const inZone =
        action.from === "hq"
          ? state.corp.hand.includes(action.iceId)
          : state.corp.discard.includes(action.iceId);
      if (!inZone) {
        log(state, `Timely Public Release — ice not in ${action.from}.`);
        return { ok: true };
      }
      const servers = Object.keys(state.servers) as ServerId[];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: servers.map((serverId) => ({
          id: `mo-server:${serverId}`,
          label: `Protect ${serverId}`,
          effect: fx.do({
            kind: "mo_install_ice_choose_position",
            iceId: action.iceId,
            from: action.from,
            serverId,
          }),
        })),
      };
      log(
        state,
        `Timely Public Release — choose server for ${ice.title}.`,
      );
      return { ok: true };
    }

    case "mo_install_ice_choose_position": {
      const server = state.servers[action.serverId as ServerId];
      const ice = state.cards[action.iceId];
      if (!server || !ice) {
        log(state, `Timely Public Release — invalid server/ice.`);
        return { ok: true };
      }
      const maxPos = server.ice.length; // 0=outermost … length=innermost
      const options: Array<{ id: string; label: string; effect: Effect }> = [];
      for (let pos = 0; pos <= maxPos; pos++) {
        options.push({
          id: `mo-pos:${pos}`,
          label:
            pos === 0
              ? "Outermost"
              : pos === maxPos
                ? "Innermost"
                : `Position ${pos}`,
          effect: fx.do({
            kind: "mo_install_ice_resolve",
            iceId: action.iceId,
            from: action.from,
            serverId: action.serverId,
            position: pos,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      log(
        state,
        `Timely Public Release — choose position on ${action.serverId}.`,
      );
      return { ok: true };
    }

    case "mo_install_ice_resolve": {
      const serverId = action.serverId as ServerId;
      const server = state.servers[serverId];
      const ice = state.cards[action.iceId];
      if (!server || !ice || ice.type !== "ice") {
        log(state, `Timely Public Release — install failed.`);
        return { ok: true };
      }
      if (action.from === "hq") {
        if (!state.corp.hand.includes(action.iceId)) return { ok: true };
        state.corp.hand = state.corp.hand.filter((id) => id !== action.iceId);
      } else {
        if (!state.corp.discard.includes(action.iceId)) return { ok: true };
        state.corp.discard = state.corp.discard.filter(
          (id) => id !== action.iceId,
        );
      }
      const pos = Math.max(0, Math.min(action.position, server.ice.length));
      server.ice.splice(pos, 0, action.iceId);
      ice.zone = `server:${serverId}:ice`;
      ice.rezzed = false;
      ice.faceup = false;
      log(
        state,
        `Timely Public Release — install ${ice.title} at position ${pos} on ${serverId} ignoring costs.`,
      );
      return { ok: true };
    }

    case "mo_slot_machine_encounter": {
      if (state.runner.deck.length > 0) {
        const top = state.runner.deck.shift()!;
        state.runner.deck.push(top);
        log(
          state,
          `Slot Machine — put top of stack (${state.cards[top]?.title ?? top}) on bottom.`,
        );
      }
      const revealN = Math.min(3, state.runner.deck.length);
      const revealed = state.runner.deck.slice(0, revealN);
      const types = revealed.map((id) => state.cards[id]?.type ?? "unknown");
      const max = sharedTypeMax(types);
      if (state.run) {
        state.run.encounterSlotMachineSharedTypeMax = max;
      }
      const titles = revealed
        .map((id) => state.cards[id]?.title ?? id)
        .join(", ");
      log(
        state,
        `Slot Machine — reveal top ${revealN}: ${titles || "(empty)"} (shared-type max=${max}).`,
      );
      return { ok: true };
    }

    case "mo_slot_machine_if_shared_type_gte": {
      const have = state.run?.encounterSlotMachineSharedTypeMax ?? 0;
      if (have < action.threshold) {
        log(
          state,
          `Slot Machine — shared-type max ${have} < ${action.threshold}; skip.`,
        );
        return { ok: true };
      }
      return evalEffect(ctx, action.then);
    }

    case "mo_gain_credits_per_ice_protecting_this_server": {
      const per = action.per ?? 1;
      let serverId: ServerId | null = null;
      if (source?.zone.startsWith("server:") && source.zone.endsWith(":ice")) {
        serverId = source.zone.slice("server:".length, -":ice".length) as ServerId;
      } else if (state.run) {
        serverId = state.run.attackedServerId;
      }
      const iceCount = serverId
        ? (state.servers[serverId]?.ice.length ?? 0)
        : 0;
      const gain = iceCount * per;
      state.corp.credits += gain;
      log(
        state,
        `Border Control — gain ${gain}¢ (${iceCount} ice × ${per}).`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}

/** Helper exported for Watch the World Burn access RFG. */
export function rfgAccessedCorpCard(
  state: EffectCtx["state"],
  cardId: string,
): void {
  removeCardFromCurrentZone(state, cardId);
  const card = state.cards[cardId];
  if (!card) return;
  card.zone = "removed-from-game";
  card.faceup = true;
  if (!state.removedFromGame) state.removedFromGame = [];
  if (!state.removedFromGame.includes(cardId)) {
    state.removedFromGame.push(cardId);
  }
}
