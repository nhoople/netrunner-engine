/** Old Hollywood (oh) SanSan pack primitives. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import type { Primitive } from "./ir.js";

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

export function applySansanOhPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];
  if (!source) return null;

  switch (action.kind) {
    case "shuffle_n_heap_cards_into_stack_per_power_counter": {
      // Snapshot power from RFG'd source or lingering counters.
      const n = Math.max(0, source.powerCounters ?? 0);
      if (n <= 0 || state.runner.discard.length === 0) {
        log(state, `${source.title} — no heap cards to shuffle.`);
        return { ok: true };
      }
      const heap = [...state.runner.discard];
      if (heap.length <= n) {
        for (const id of heap) {
          state.runner.discard = state.runner.discard.filter((x) => x !== id);
          const c = state.cards[id]!;
          c.zone = "runner:stack";
          c.faceup = false;
          state.runner.deck.push(id);
        }
        shuffleInPlace(state.runner.deck);
        log(
          state,
          `${source.title} — shuffle all ${heap.length} heap card(s) into stack.`,
        );
        return { ok: true };
      }
      state.turn.ohTropeShuffleRemaining = n;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: heap.map((cardId) => ({
          id: `trope-shuffle:${cardId}`,
          label: `Shuffle ${state.cards[cardId]!.title} into stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "oh_trope_shuffle_pick" as const,
              cardId,
            },
          },
        })),
      };
      log(state, `${source.title} — choose ${n} heap card(s) to shuffle.`);
      return { ok: true };
    }

    case "oh_trope_shuffle_pick": {
      const cardId = action.cardId;
      const remaining = state.turn.ohTropeShuffleRemaining ?? 0;
      if (!state.runner.discard.includes(cardId) || remaining <= 0) {
        log(state, `Trope — invalid shuffle pick.`);
        return { ok: true };
      }
      state.runner.discard = state.runner.discard.filter((id) => id !== cardId);
      const c = state.cards[cardId]!;
      c.zone = "runner:stack";
      c.faceup = false;
      state.runner.deck.push(cardId);
      state.turn.ohTropeShuffleRemaining = remaining - 1;
      log(state, `Trope — shuffle ${c.title} into stack.`);
      if ((state.turn.ohTropeShuffleRemaining ?? 0) <= 0) {
        shuffleInPlace(state.runner.deck);
        state.turn.ohTropeShuffleRemaining = undefined;
        return { ok: true };
      }
      const heap = [...state.runner.discard];
      if (heap.length === 0) {
        shuffleInPlace(state.runner.deck);
        state.turn.ohTropeShuffleRemaining = undefined;
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: heap.map((id) => ({
          id: `trope-shuffle:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into stack`,
          effect: {
            op: "do" as const,
            action: {
              kind: "oh_trope_shuffle_pick" as const,
              cardId: id,
            },
          },
        })),
      };
      return { ok: true };
    }

    case "look_top_n_stack_arrange": {
      const n = action.n ?? 5;
      const taken = state.runner.deck.splice(
        0,
        Math.min(n, state.runner.deck.length),
      );
      if (taken.length === 0) {
        log(state, `${source.title} — stack empty.`);
        return { ok: true };
      }
      state.turn.ohStackLookedCards = taken;
      state.turn.ohStackArrangePlaced = [];
      for (const id of taken) {
        state.cards[id]!.faceup = true;
        log(state, `Look stack — ${state.cards[id]!.title}.`);
      }
      return offerStackArrangeChoice(ctx);
    }

    case "oh_stack_arrange_pick": {
      const cardId = action.cardId;
      const looked = state.turn.ohStackLookedCards ?? [];
      const idx = looked.indexOf(cardId);
      if (idx < 0) {
        log(state, `Arrange stack — card not in look zone.`);
        return { ok: true };
      }
      looked.splice(idx, 1);
      state.turn.ohStackLookedCards = looked;
      const placed = state.turn.ohStackArrangePlaced ?? [];
      placed.push(cardId);
      state.turn.ohStackArrangePlaced = placed;
      return offerStackArrangeChoice(ctx);
    }

    case "trash_hardware_with_subtype": {
      const want = action.subtype.toLowerCase();
      const targets = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "hardware") return false;
        return (c.subtypes ?? []).some((s) => s.toLowerCase() === want);
      });
      if (targets.length === 0) {
        log(state, `Trash ${action.subtype} — none installed.`);
        return { ok: true };
      }
      if (action.pick === "choose" && targets.length > 1) {
        state.pendingChoice = {
          sourceId,
          chooser: "corp",
          options: targets.map((id) => ({
            id: `trash-hw-sub:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "trash_installed_runner_card" as const,
                cardId: id,
              },
            },
          })),
        };
        return { ok: true };
      }
      moveRunnerCardToHeap(state, targets[0]!);
      return { ok: true };
    }

    case "place_up_to_n_advancements_on_advanceable_installed": {
      const max = action.max ?? 2;
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          if (c.type === "agenda" || c.canAdvance) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `${source.title} — no advanceable installed card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.flatMap((cardId) =>
            Array.from({ length: max }, (_, i) => {
              const amount = i + 1;
              return {
                id: `oh-adv:${cardId}:${amount}`,
                label: `Place ${amount} advancement(s) on ${state.cards[cardId]!.title}`,
                effect: {
                  op: "do" as const,
                  action: {
                    kind: "oh_place_advancements_on" as const,
                    cardId,
                    amount,
                  },
                },
              };
            }),
          ),
          {
            id: "oh-adv-decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      return { ok: true };
    }

    case "oh_place_advancements_on": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      card.advancementTokens = (card.advancementTokens ?? 0) + action.amount;
      log(
        state,
        `${source.title} — place ${action.amount} advancement(s) on ${card.title} → ${card.advancementTokens}.`,
      );
      return { ok: true };
    }

    case "early_premiere_pay_place_advancement": {
      if (state.corp.credits < 1) {
        log(state, `Early Premiere — insufficient credits.`);
        return { ok: true };
      }
      const targets: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === "hq" || sid === "rd" || sid === "archives") continue;
        for (const id of server.root) {
          const c = state.cards[id];
          if (!c) continue;
          if (c.type === "agenda" || c.canAdvance) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Early Premiere — no advanceable remote root card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((cardId) => ({
          id: `early-prem:${cardId}`,
          label: `Pay 1¢: advance ${state.cards[cardId]!.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "oh_early_premiere_resolve" as const,
              cardId,
            },
          },
        })),
      };
      return { ok: true };
    }

    case "oh_early_premiere_resolve": {
      if (state.corp.credits < 1) return { ok: true };
      state.corp.credits -= 1;
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      card.advancementTokens = (card.advancementTokens ?? 0) + 1;
      log(
        state,
        `Early Premiere — pay 1¢, place advancement on ${card.title} → ${card.advancementTokens}.`,
      );
      return { ok: true };
    }

    case "an_offer_you_cant_refuse": {
      const centrals: ServerId[] = ["hq", "rd", "archives"];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: centrals.map((serverId) => ({
          id: `offer-central:${serverId}`,
          label: `Choose ${serverId.toUpperCase()}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "offer_central_chosen" as const,
              serverId,
            },
          },
        })),
      };
      return { ok: true };
    }

    case "offer_central_chosen": {
      const serverId = action.serverId as ServerId;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "offer-run",
            label: `Run ${serverId.toUpperCase()} (cannot jack out)`,
            effect: {
              op: "do" as const,
              action: {
                kind: "offer_start_run" as const,
                serverId,
              },
            },
          },
          {
            id: "offer-decline",
            label: "Decline — Corp scores An Offer as 1-point agenda",
            effect: {
              op: "do" as const,
              action: {
                kind: "add_to_corp_score_as_agenda" as const,
                agendaPoints: 1,
              },
            },
          },
        ],
      };
      return { ok: true };
    }

    case "offer_start_run": {
      const serverId = action.serverId as ServerId;
      state.pendingStartRun = {
        sourceId,
        serverId,
      };
      state.turn.ohForcedRunCannotJackOut = true;
      log(
        state,
        `An Offer — Runner runs ${serverId} (cannot jack out).`,
      );
      return { ok: true };
    }

    case "back_channels_trash_remote_root": {
      const targets: string[] = [];
      for (const [sid, server] of Object.entries(state.servers)) {
        if (sid === "hq" || sid === "rd" || sid === "archives") continue;
        for (const id of server.root) {
          if (state.cards[id]) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Back Channels — no remote root card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((cardId) => ({
          id: `back-ch:${cardId}`,
          label: `Trash ${state.cards[cardId]!.title} (3¢ × adv)`,
          effect: {
            op: "do" as const,
            action: {
              kind: "oh_back_channels_resolve" as const,
              cardId,
            },
          },
        })),
      };
      return { ok: true };
    }

    case "oh_back_channels_resolve": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card) return { ok: true };
      const adv = card.advancementTokens ?? 0;
      const gain = 3 * adv;
      state.corp.credits += gain;
      // Trash from remote root to archives.
      for (const server of Object.values(state.servers)) {
        if (server.root.includes(cardId)) {
          server.root = server.root.filter((id) => id !== cardId);
          break;
        }
      }
      card.zone = "corp:archives";
      card.faceup = true;
      card.rezzed = false;
      state.corp.discard.push(cardId);
      log(
        state,
        `Back Channels — trash ${card.title} (${adv} adv) → gain ${gain}¢.`,
      );
      return { ok: true };
    }

    case "casting_call_install_agenda_faceup": {
      const agendas = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (agendas.length === 0) {
        log(state, `Casting Call — no agenda in HQ.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: agendas.map((cardId) => ({
          id: `casting:${cardId}`,
          label: `Install ${state.cards[cardId]!.title} faceup`,
          effect: {
            op: "do" as const,
            action: {
              kind: "oh_casting_call_install" as const,
              cardId,
            },
          },
        })),
      };
      return { ok: true };
    }

    case "oh_casting_call_install": {
      const agendaId = action.cardId;
      const agenda = state.cards[agendaId];
      if (!agenda || agenda.type !== "agenda") return { ok: true };
      // Install into a new remote faceup and host Casting Call as condition.
      let remoteIdx = 1;
      while (state.servers[`remote-${remoteIdx}` as ServerId]) remoteIdx += 1;
      const serverId = `remote-${remoteIdx}` as ServerId;
      state.servers[serverId] = { id: serverId, kind: "remote", ice: [], root: [] };
      state.corp.hand = state.corp.hand.filter((id) => id !== agendaId);
      agenda.zone = `server:${serverId}:root`;
      agenda.faceup = true;
      agenda.rezzed = false;
      state.servers[serverId]!.root.push(agendaId);
      // Host condition counter on agenda.
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = agendaId;
      source.zone = `hosted:${agendaId}`;
      source.faceup = true;
      source.castingCallCondition = true;
      if (!agenda.hostedCardIds) agenda.hostedCardIds = [];
      agenda.hostedCardIds.push(sourceId);
      agenda.onAccessGiveTags = (agenda.onAccessGiveTags ?? 0) + 2;
      log(
        state,
        `Casting Call — install ${agenda.title} faceup in ${serverId}; host condition (2 tags on access).`,
      );
      return { ok: true };
    }

    case "add_hosted_agenda_to_runner_score": {
      const hosted = (source.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (hosted.length === 0) {
        log(state, `${source.title} — no hosted agenda.`);
        return { ok: true };
      }
      const agendaId = hosted[0]!;
      const agenda = state.cards[agendaId]!;
      source.hostedCardIds = (source.hostedCardIds ?? []).filter(
        (id) => id !== agendaId,
      );
      agenda.hostId = undefined;
      removeCardFromCurrentZone(state, agendaId);
      state.runner.score.push(agendaId);
      agenda.zone = "runner:score";
      agenda.faceup = true;
      agenda.rezzed = true;
      log(
        state,
        `${source.title} — add hosted ${agenda.title} to Runner score.`,
      );
      return { ok: true };
    }

    case "place_advancement_on_another_on_advance": {
      const amount = action.amount;
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          if (id === sourceId) continue;
          const c = state.cards[id];
          if (!c || c.side !== "corp") continue;
          if (c.type === "agenda" || c.canAdvance) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Hollywood Renovation — no other advanceable card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...targets.map((cardId) => ({
            id: `hr-adv:${cardId}`,
            label: `Place ${amount} advancement(s) on ${state.cards[cardId]!.title}`,
            effect: {
              op: "do" as const,
              action: {
                kind: "oh_place_advancements_on" as const,
                cardId,
                amount,
              },
            },
          })),
          {
            id: "hr-decline",
            label: "Decline",
            effect: {
              op: "do" as const,
              action: {
                kind: "gain_credits" as const,
                side: "corp" as const,
                amount: 0,
              },
            },
          },
        ],
      };
      return { ok: true };
    }

    default:
      return null;
  }
}

function offerStackArrangeChoice(ctx: EffectCtx): PrimResult {
  const { state, sourceId } = ctx;
  const looked = state.turn.ohStackLookedCards ?? [];
  if (looked.length === 0) {
    // Place arranged cards back on top in reverse pick order (last pick = top).
    const placed = state.turn.ohStackArrangePlaced ?? [];
    for (let i = placed.length - 1; i >= 0; i--) {
      const id = placed[i]!;
      state.cards[id]!.faceup = false;
      state.cards[id]!.zone = "runner:stack";
      state.runner.deck.unshift(id);
    }
    state.turn.ohStackLookedCards = undefined;
    state.turn.ohStackArrangePlaced = undefined;
    log(state, `Arrange stack — ${placed.length} card(s) replaced.`);
    return { ok: true };
  }
  state.pendingChoice = {
    sourceId,
    chooser: "runner",
    options: looked.map((cardId) => ({
      id: `stack-arr:${cardId}`,
      label: `Place ${state.cards[cardId]!.title} (next from top)`,
      effect: {
        op: "do" as const,
        action: {
          kind: "oh_stack_arrange_pick" as const,
          cardId,
        },
      },
    })),
  };
  return { ok: true };
}
