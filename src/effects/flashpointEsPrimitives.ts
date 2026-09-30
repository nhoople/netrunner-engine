/** Escalation (es) Flashpoint pack primitives — v1.124.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashRunnerInstalled(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromCurrentZone(state, cardId);
  state.runner.discard.push(cardId);
  card.zone = "runner:heap";
  card.faceup = true;
}

function rfgFromHeap(state: EffectCtx["state"], cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  state.runner.discard = state.runner.discard.filter((id) => id !== cardId);
  card.zone = "removed-from-game";
  card.faceup = true;
  state.removedFromGame = state.removedFromGame ?? [];
  if (!state.removedFromGame.includes(cardId)) {
    state.removedFromGame.push(cardId);
  }
}

export function applyFlashpointEsPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "omar_redirect_success": {
      const sid = action.serverId as "hq" | "rd";
      if (state.run && (sid === "hq" || sid === "rd")) {
        log(
          state,
          `Omar Keung — change attacked server to ${sid}.`,
        );
        state.run.attackedServerId = sid;
      }
      return { ok: true };
    }

    case "black_orchestra_spend_pump_and_break": {
      if (!state.run?.encounter) {
        log(state, `Black Orchestra — no encounter.`);
        return { ok: true };
      }
      state.run.encounterStrengthBoosts[sourceId] =
        (state.run.encounterStrengthBoosts[sourceId] ?? 0) + 2;
      log(state, `Black Orchestra — +2 strength this encounter.`);
      const enc = state.run.encounter;
      const ice = state.cards[enc.iceId];
      if (!ice || !(ice.subtypes ?? []).includes("code gate")) {
        return { ok: true };
      }
      const str =
        (source.breaker?.strength ?? source.strength ?? 0) +
        (state.run.strengthBoosts[sourceId] ?? 0) +
        (state.run.encounterStrengthBoosts[sourceId] ?? 0);
      const iceStr = ice.strength ?? 0;
      if (str < iceStr) {
        log(
          state,
          `Black Orchestra — cannot interface (str ${str} < ice ${iceStr}).`,
        );
        return { ok: true };
      }
      const unbroken = enc.broken
        .map((b, i) => (!b ? i : -1))
        .filter((i) => i >= 0);
      const toBreak = unbroken.slice(0, 2);
      for (const i of toBreak) enc.broken[i] = true;
      if (toBreak.length > 0) {
        log(
          state,
          `Black Orchestra — break ${toBreak.length} code gate subroutine(s).`,
        );
      }
      return { ok: true };
    }

    case "ark_lockdown_name_and_rfg_heap_copies": {
      const titles = new Map<string, string>();
      for (const id of state.runner.discard) {
        const c = state.cards[id];
        if (!c) continue;
        titles.set(c.defId ?? c.id, c.title);
      }
      if (titles.size === 0) {
        log(state, `Ark Lockdown — heap empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [...titles.entries()].map(([defId, title]) => ({
          id: `ark:${defId}`,
          label: `Name ${title}`,
          effect: fx.do({
            kind: "ark_lockdown_rfg_named",
            defId,
          }),
        })),
      };
      return { ok: true };
    }

    case "ark_lockdown_rfg_named": {
      const defId = action.defId;
      if (!defId) return { ok: true };
      const matches = state.runner.discard.filter(
        (id) => state.cards[id]?.defId === defId || state.cards[id]?.id === defId,
      );
      for (const id of [...matches]) {
        rfgFromHeap(state, id);
      }
      log(
        state,
        `Ark Lockdown — remove ${matches.length} copy(ies) of ${defId} from the heap.`,
      );
      return { ok: true };
    }

    case "hellion_beta_trash_two_installed_non_program": {
      const targets = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return c && c.type !== "program";
      });
      if (targets.length === 0) {
        log(state, `Hellion Beta Test — no installed non-program cards.`);
        return { ok: true };
      }
      const count = Math.min(2, targets.length);
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `hellion:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "hellion_beta_trash_pick",
            cardId: id,
            remaining: count - 1,
          }),
        })),
      };
      return { ok: true };
    }

    case "hellion_beta_trash_pick": {
      const cardId = action.cardId;
      const remaining = action.remaining ?? 0;
      if (cardId) trashRunnerInstalled(state, cardId);
      log(
        state,
        `Hellion Beta Test — trash ${state.cards[cardId!]?.title ?? cardId}.`,
      );
      if (remaining <= 0) return { ok: true };
      const targets = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return c && c.type !== "program" && id !== cardId;
      });
      if (targets.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `hellion:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "hellion_beta_trash_pick",
            cardId: id,
            remaining: remaining - 1,
          }),
        })),
      };
      return { ok: true };
    }

    case "kusanagi_grant_net_subroutine_this_run": {
      if (!state.run) {
        log(state, `Project Kusanagi — no active run.`);
        return { ok: true };
      }
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (state.cards[id]) targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Project Kusanagi — no ice installed.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `kusanagi:${id}`,
          label: `Grant net sub to ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "kusanagi_grant_net_subroutine_resolve",
            iceId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "kusanagi_grant_net_subroutine_resolve": {
      const iceId = action.iceId;
      if (!iceId || !state.run) return { ok: true };
      const ice = state.cards[iceId];
      if (!ice) return { ok: true };
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = ice.subroutines
          ? structuredClone(ice.subroutines)
          : [];
      }
      const granted = {
        id: `${ice.defId ?? ice.id}-kusanagi-net-${iceId}-${(ice.subroutines ?? []).length}`,
        text: "Do 1 net damage.",
        effect: {
          op: "do" as const,
          action: { kind: "net_damage" as const, amount: 1 },
        },
      };
      ice.subroutines = [...(ice.subroutines ?? []), granted];
      if (!state.run.thunderboltGrantedIceIds) {
        state.run.thunderboltGrantedIceIds = [];
      }
      if (!state.run.thunderboltGrantedIceIds.includes(iceId)) {
        state.run.thunderboltGrantedIceIds.push(iceId);
      }
      if (state.run.encounter?.iceId === iceId) {
        state.run.encounter.broken.push(false);
      }
      log(
        state,
        `Project Kusanagi — ${ice.title} gains "[subroutine] Do 1 net damage" this run.`,
      );
      return { ok: true };
    }

    case "alexa_belsky_shuffle_hq": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Alexa Belsky — HQ empty.`);
        return { ok: true };
      }
      // Runner may pay 2¢ per card to trash instead of shuffle.
      const maxPrevent = Math.floor(state.runner.credits / 2);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 0; n <= Math.min(maxPrevent, hq.length); n++) {
        options.push({
          id: `alexa:${n}`,
          label:
            n === 0
              ? "Decline (shuffle all HQ into R&D)"
              : `Pay ${n * 2}¢: trash ${n} random HQ instead of shuffling`,
          effect: fx.do({
            kind: "alexa_belsky_shuffle_resolve",
            amount: n,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "alexa_belsky_shuffle_resolve": {
      const prevent = action.amount ?? 0;
      const hq = [...state.corp.hand];
      if (prevent > 0) {
        const cost = prevent * 2;
        if (state.runner.credits < cost) {
          log(state, `Alexa Belsky — Runner cannot afford prevent.`);
        } else {
          state.runner.credits -= cost;
          // Trash prevent random cards from HQ instead of shuffling them.
          const shuffled = [...hq];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
          }
          const toTrash = shuffled.slice(0, prevent);
          const toShuffle = shuffled.slice(prevent);
          for (const id of toTrash) {
            state.corp.hand = state.corp.hand.filter((x) => x !== id);
            state.corp.discard.push(id);
            const c = state.cards[id];
            if (c) {
              c.zone = "corp:archives";
              c.faceup = true;
            }
          }
          for (const id of toShuffle) {
            state.corp.hand = state.corp.hand.filter((x) => x !== id);
            state.corp.deck.unshift(id);
            const c = state.cards[id];
            if (c) {
              c.zone = "corp:rd";
              c.faceup = false;
            }
          }
          // Shuffle R&D
          for (let i = state.corp.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [state.corp.deck[i], state.corp.deck[j]] = [
              state.corp.deck[j]!,
              state.corp.deck[i]!,
            ];
          }
          log(
            state,
            `Alexa Belsky — Runner pays ${cost}¢; trash ${toTrash.length}; shuffle ${toShuffle.length} into R&D.`,
          );
          return { ok: true };
        }
      }
      // Shuffle all HQ into R&D
      for (const id of hq) {
        state.corp.hand = state.corp.hand.filter((x) => x !== id);
        state.corp.deck.unshift(id);
        const c = state.cards[id];
        if (c) {
          c.zone = "corp:rd";
          c.faceup = false;
        }
      }
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.corp.deck[i], state.corp.deck[j]] = [
          state.corp.deck[j]!,
          state.corp.deck[i]!,
        ];
      }
      log(state, `Alexa Belsky — shuffle ${hq.length} HQ card(s) into R&D.`);
      return { ok: true };
    }

    case "net_mercur_place_or_draw": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "place",
            label: "Place 1¢ on Net Mercur",
            effect: fx.do({ kind: "net_mercur_place_credit" }),
          },
          {
            id: "draw",
            label: "Draw 1 card",
            effect: fx.do({ kind: "draw", side: "runner", amount: 1 }),
          },
        ],
      };
      return { ok: true };
    }

    case "net_mercur_place_credit": {
      source.hostedCredits = (source.hostedCredits ?? 0) + 1;
      log(
        state,
        `Net Mercur — place 1¢ → ${source.hostedCredits} hosted.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
