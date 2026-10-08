/** Honor and Profit (hap) deluxe primitives. */
import { log } from "../state/createGame.js";
import { startPsiGame } from "../state/psi.js";
import {
  agendaPointsFor,
  effectiveAdvancementRequirement,
  removeCardFromCurrentZone,
} from "../state/scoring.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function installedIceIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) out.push(id);
  }
  return out;
}

export function applySpinHapPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "tennin_place_advancement_on_installed": {
      const cands: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c?.side === "corp" && c.rezzed) cands.push(id);
        }
      }
      if (cands.length === 0) {
        log(state, `Tennin — no installed Corp cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `tennin:${id}`,
          label: `Place 1 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "place_advancements_on", cardId: id, amount: 1 }),
        })),
      };
      return { ok: true };
    }
    case "shi_kyu_spend_for_net_damage": {
      const max = state.corp.credits;
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 0; n <= Math.min(max, 20); n++) {
        opts.push({
          id: `shi:${n}`,
          label: n === 0 ? "Spend 0¢" : `Spend ${n}¢`,
          effect: fx.seq(
            fx.do({ kind: "corp_pay_credits", amount: n }),
            fx.do({ kind: "net_damage", amount: n }),
          ),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options: opts };
      return { ok: true };
    }
    case "mushin_install_from_hq_root": {
      const hq = state.corp.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "asset" || t === "agenda" || t === "upgrade";
      });
      if (hq.length === 0) {
        log(state, `Mushin — no asset/agenda/upgrade in HQ.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: hq.map((id) => ({
          id: `mushin:${id}`,
          label: `Install ${state.cards[id]!.title} from HQ in a server root`,
          effect: fx.do({
            kind: "mushin_install_hq_card_pick_server",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }
    case "mushin_install_hq_card_pick_server": {
      const cardId = action.cardId;
      const remotes = Object.keys(state.servers).filter(
        (s) => !["hq", "rd", "archives"].includes(s),
      ) as ServerId[];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: remotes.map((sid) => ({
          id: `mushin-srv:${sid}:${cardId}`,
          label: `Install on ${sid}`,
          effect: fx.do({
            kind: "install_hq_card_on_server_root",
            cardId,
            serverId: sid,
          }),
        })),
      };
      return { ok: true };
    }
    case "install_hq_card_on_server_root": {
      const { cardId, serverId } = action;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.corp.hand.splice(idx, 1);
      const card = state.cards[cardId]!;
      card.zone = `server:${serverId}:root`;
      card.faceup = true;
      card.rezzed = false;
      state.servers[serverId]!.root.push(cardId);
      log(state, `Mushin — install ${card.title} on ${serverId} root.`);
      return { ok: true };
    }
    case "add_net_subs_for_rezzed_ice": {
      const sid = state.run?.attackedServerId;
      if (!sid) return { ok: true };
      const n = state.servers[sid]?.ice.filter((id) => state.cards[id]?.rezzed)
        .length ?? 0;
      const ice = state.cards[sourceId]!;
      if (!ice.baseSubroutines) {
        ice.baseSubroutines = structuredClone(ice.subroutines ?? []);
      }
      const base = ice.baseSubroutines ?? [];
      const extras = Array.from({ length: n }, (_, i) => ({
        id: `${ice.defId}-komainu-${i}`,
        text: "Do 1 net damage.",
        effect: fx.do({ kind: "net_damage", amount: 1 }),
      }));
      ice.subroutines = [...base, ...extras];
      if (state.run?.encounter?.iceId === sourceId) {
        state.run.encounter.broken = ice.subroutines.map(() => false);
      }
      log(state, `Komainu — gains ${n} net damage subroutine(s).`);
      return { ok: true };
    }
    case "pay_or_net": {
      const amt = action.amount ?? 1;
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "pup-pay",
            label: `Pay ${amt}¢`,
            effect: fx.do({ kind: "runner_pay_credits", amount: amt }),
          },
          {
            id: "pup-net",
            label: `Take ${amt} net damage`,
            effect: fx.do({ kind: "net_damage", amount: amt }),
          },
        ],
      };
      return { ok: true };
    }
    case "corp_may_pay_net": {
      const creditCost = action.creditCost ?? 1;
      const damage = action.damage ?? 1;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "pay",
            label: `Pay ${creditCost}¢`,
            effect: fx.do({ kind: "corp_pay_credits", amount: creditCost }),
          },
          {
            id: "net",
            label: `Take ${damage} net damage`,
            effect: fx.do({ kind: "net_damage", amount: damage }),
          },
        ],
      };
      return { ok: true };
    }
    case "inazuma_lock_breaking_next_encounter": {
      if (state.run) state.run.inazumaLockNextEncounter = true;
      log(state, `Inazuma — next encounter cannot break subroutines on encountered ice.`);
      return { ok: true };
    }
    case "susanoo_redirect_to_archives": {
      if (!state.run || state.run.attackedServerId === "archives") {
        return { ok: true };
      }
      state.run.attackedServerId = "archives";
      log(state, `Susanoo-no-Mikoto — Runner moves to outermost Archives.`);
      return { ok: true };
    }
    case "iain_gain_if_corp_ahead_on_agenda": {
      const corp = agendaPointsFor(state, "corp");
      const run = agendaPointsFor(state, "runner");
      if (corp > run) {
        state.runner.credits += 2;
        log(state, `Iain Stirling — gain 2¢ (Corp ahead on agenda).`);
      }
      return { ok: true };
    }
    case "look_top_n_stack_add_one_to_grip_shuffle": {
      const n = action.n ?? 4;
      const deck = state.runner.deck;
      const taken: string[] = [];
      for (let i = 0; i < Math.min(n, deck.length); i++) {
        taken.push(deck[deck.length - 1 - i]!);
      }
      for (const id of taken) {
        const idx = deck.lastIndexOf(id);
        if (idx >= 0) deck.splice(idx, 1);
        state.cards[id]!.faceup = true;
      }
      if (taken.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: taken.map((id) => ({
          id: `ed:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "express_delivery_finish",
            pickId: id,
            restIds: taken.filter((x) => x !== id),
          }),
        })),
      };
      return { ok: true };
    }
    case "express_delivery_finish": {
      const { pickId, restIds } = action;
      state.runner.hand.push(pickId);
      state.cards[pickId]!.zone = "runner:grip";
      state.cards[pickId]!.faceup = true;
      for (const id of restIds ?? []) {
        state.runner.deck.push(id);
        state.cards[id]!.faceup = false;
      }
      // shuffle
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.runner.deck[i], state.runner.deck[j]] = [
          state.runner.deck[j]!,
          state.runner.deck[i]!,
        ];
      }
      log(state, `Express Delivery — took 1 card; shuffled stack.`);
      return { ok: true };
    }
    case "play_run_event_from_stack": {
      const cands = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return c?.type === "event" && (c.subtypes ?? []).includes("run");
      });
      if (cands.length === 0) {
        log(state, `Planned Assault — no run events in stack.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: cands.map((id) => ({
          id: `pa:${id}`,
          label: `Play ${state.cards[id]!.title} ignoring cost`,
          effect: fx.do({ kind: "play_heap_event_ignore_cost", cardId: id }),
        })),
      };
      return { ok: true };
    }
    case "play_heap_event_ignore_cost": {
      const cardId = action.cardId;
      const idx = state.runner.deck.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.runner.deck.splice(idx, 1);
      state.cards[cardId]!.zone = "runner:heap";
      log(state, `Planned Assault — play ${state.cards[cardId]!.title} from stack.`);
      return { ok: true };
    }
    case "search_stack_take_to_grip": {
      const cands = [...state.runner.deck];
      if (cands.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: cands.slice(0, 20).map((id) => ({
          id: `st:${id}`,
          label: `Take ${state.cards[id]!.title} to grip`,
          effect: fx.do({ kind: "take_runner_deck_card_to_grip", cardId: id }),
        })),
      };
      return { ok: true };
    }
    case "take_runner_deck_card_to_grip": {
      const cardId = action.cardId;
      const idx = state.runner.deck.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.runner.deck.splice(idx, 1);
      state.runner.hand.push(cardId);
      state.cards[cardId]!.zone = "runner:grip";
      log(state, `Search stack — ${state.cards[cardId]!.title} to grip.`);
      return { ok: true };
    }
    case "draw_from_stack_bottom": {
      const side = action.side === "corp" ? "corp" : "runner";
      const p = side === "corp" ? state.corp : state.runner;
      const amount = action.amount ?? 1;
      for (let i = 0; i < amount && p.deck.length > 0; i++) {
        const id = p.deck.shift()!;
        p.hand.push(id);
        state.cards[id]!.zone = side === "corp" ? "corp:hq" : "runner:grip";
      }
      log(state, `Draw ${amount} from bottom of stack.`);
      return { ok: true };
    }
    case "break_all_but_n_subroutines_on_encounter": {
      const leave = action.leave ?? 1;
      const enc = state.run?.encounter;
      if (!enc) return { ok: true };
      const ice = state.cards[enc.iceId];
      const subs = ice?.subroutines ?? [];
      const breakCount = Math.max(0, subs.length - leave);
      for (let i = 0; i < breakCount; i++) enc.broken[i] = true;
      log(state, `Grappling Hook — break all but ${leave} subroutine(s).`);
      return { ok: true };
    }
    case "may_pay_reveal_top": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "bug-pay",
            label: "Pay 2¢ to reveal top of stack",
            effect: fx.do({ kind: "reveal_top_paid" }),
          },
          {
            id: "bug-skip",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }
    case "reveal_top_paid": {
      if (state.runner.credits < 2) return { ok: true };
      state.runner.credits -= 2;
      const id = state.runner.deck[state.runner.deck.length - 1];
      if (id) {
        state.cards[id]!.faceup = true;
        log(state, `Bug — reveal ${state.cards[id]!.title}.`);
      }
      return { ok: true };
    }
    case "push_your_luck_secret_spend_guess": {
      startPsiGame(
        state,
        sourceId,
        99,
        fx.do({ kind: "push_your_luck_corp_guessed_wrong" }),
        fx.do({ kind: "push_your_luck_corp_guessed_right" }),
      );
      return { ok: true };
    }
    case "push_your_luck_corp_guessed_wrong":
    case "push_your_luck_corp_guessed_right": {
      log(state, `Push Your Luck — resolve guess (v0 stub).`);
      return { ok: true };
    }
    case "choose_type_reveal_install": {
      const types = ["event", "program", "resource", "hardware"];
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: types.map((t) => ({
          id: `om:${t}`,
          label: `Choose ${t}`,
          effect: fx.do({ kind: "oracle_reveal_top_match", cardType: t }),
        })),
      };
      return { ok: true };
    }
    case "oracle_reveal_top_match": {
      const top = state.runner.deck[state.runner.deck.length - 1];
      if (!top) return { ok: true };
      state.cards[top]!.faceup = true;
      const match = state.cards[top]!.type === action.cardType;
      log(
        state,
        `Oracle May — reveal ${state.cards[top]!.title} (${match ? "match" : "no match"}).`,
      );
      if (match) {
        state.runner.deck.pop();
        state.runner.rig.push(top);
        state.cards[top]!.zone = "runner:rig";
      }
      return { ok: true };
    }
    case "reveal_score_from_hq": {
      const agendas = state.corp.hand.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "agenda" &&
          (c.advancementTokens ?? 0) >= effectiveAdvancementRequirement(state, c)
        );
      });
      if (agendas.length === 0) {
        log(state, `Plan B — no scoreable agenda in HQ.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: agendas.map((id) => ({
          id: `pb:${id}`,
          label: `Score ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "score_agenda_from_hq", cardId: id }),
        })),
      };
      return { ok: true };
    }
    case "score_agenda_from_hq": {
      const cardId = action.cardId;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.corp.hand.splice(idx, 1);
      state.corp.score.push(cardId);
      const card = state.cards[cardId]!;
      card.zone = "corp:score";
      card.faceup = true;
      log(state, `Plan B — score ${card.title} from HQ.`);
      return { ok: true };
    }
    case "unregistered_trash_rezzed_ice_gain_per_strength": {
      const ice = installedIceIds(state).filter((id) => state.cards[id]?.rezzed);
      if (ice.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: ice.map((id) => ({
          id: `unreg:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "unregistered_trash_ice_gain", iceId: id }),
        })),
      };
      return { ok: true };
    }
    case "unregistered_trash_ice_gain": {
      const iceId = action.iceId;
      const ice = state.cards[iceId];
      if (!ice?.rezzed) return { ok: true };
      const str = ice.strength ?? 0;
      removeCardFromCurrentZone(state, iceId);
      state.corp.discard.push(iceId);
      ice.zone = "corp:archives";
      state.runner.credits += 2 * str;
      log(state, `Unregistered S&W — trash ice; gain ${2 * str}¢.`);
      return { ok: true };
    }
    case "tori_hanzo_pay_instead_net": {
      log(state, `Tori Hanzō — may pay to prevent net damage (v0 logged).`);
      return { ok: true };
    }
    case "may_swap_two_installed_ice": {
      const ice = installedIceIds(state);
      if (ice.length < 2) {
        log(state, `Tenma Line — need 2 installed ice.`);
        return { ok: true };
      }
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (let i = 0; i < ice.length; i++) {
        for (let j = i + 1; j < ice.length; j++) {
          const a = ice[i]!;
          const b = ice[j]!;
          opts.push({
            id: `swap:${a}:${b}`,
            label: `Swap ${state.cards[a]!.title} and ${state.cards[b]!.title}`,
            effect: fx.do({
              kind: "swap_two_installed_ice",
              otherIceId: b,
            }),
          });
        }
      }
      state.pendingChoice = { sourceId, chooser: "corp", options: opts.slice(0, 12) };
      return { ok: true };
    }
    case "corp_pay_credits": {
      const n = Math.min(action.amount ?? 0, state.corp.credits);
      state.corp.credits -= n;
      return { ok: true };
    }
    case "runner_pay_credits": {
      const n = Math.min(action.amount ?? 0, state.runner.credits);
      state.runner.credits -= n;
      return { ok: true };
    }
    default:
      return null;
  }
}
