/** Democracy and Dogma (dag) Mumbad pack primitives — v1.118.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { GameState, RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";
import { applySansanOhPrimitive } from "./sansanOhPrimitives.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashCorpToArchives(state: GameState, cardId: string): void {
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromCurrentZone(state, cardId);
  state.corp.discard.push(cardId);
  card.zone = "corp:archives";
  card.faceup = true;
  card.rezzed = false;
}

function serverIdHostingCard(
  state: GameState,
  cardId: string,
): ServerId | null {
  const card = state.cards[cardId];
  if (!card?.zone) return null;
  const m = /^server:([^:]+):/.exec(card.zone);
  return m ? (m[1] as ServerId) : null;
}

export function applyMumbadDagPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "host_on_scored_agenda": {
      if (!state.run) return { ok: true };
      state.run.skipBreach = true;
      const agendas = state.corp.score.filter(
        (id) => state.cards[id]?.type === "agenda",
      );
      if (agendas.length === 0) {
        log(state, `Political Graffiti — no agenda in Corp score area.`);
        return { ok: true };
      }
      if (agendas.length === 1) {
        return applyMumbadDagPrimitive(ctx, {
          kind: "political_graffiti_host_resolve",
          agendaId: agendas[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: agendas.map((agendaId) => {
          const a = state.cards[agendaId]!;
          return {
            id: `pg:${agendaId}`,
            label: `Host on ${a.title}`,
            effect: fx.do({
              kind: "political_graffiti_host_resolve",
              agendaId,
            }),
          };
        }),
      };
      return { ok: true };
    }

    case "political_graffiti_host_resolve": {
      const agendaId = action.agendaId;
      const agenda = state.cards[agendaId];
      if (!agenda || !state.corp.score.includes(agendaId)) {
        log(state, `Political Graffiti — agenda no longer in score area.`);
        return { ok: true };
      }
      if (!source) return { ok: true };
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = agendaId;
      source.zone = `hosted:${agendaId}`;
      source.faceup = true;
      if (!agenda.hostedCardIds) agenda.hostedCardIds = [];
      if (!agenda.hostedCardIds.includes(sourceId)) {
        agenda.hostedCardIds.push(sourceId);
      }
      log(
        state,
        `Political Graffiti — host on ${agenda.title} (−1 agenda point while hosted; trash on virus purge).`,
      );
      return { ok: true };
    }

    case "look_top_x_stack_arrange": {
      const copies = state.runner.rig.filter(
        (id) => state.cards[id]?.defId === (source?.defId ?? "spy-camera"),
      ).length;
      const n = Math.max(0, copies);
      if (n === 0) {
        log(state, `Spy Camera — no copies installed.`);
        return { ok: true };
      }
      return (
        applySansanOhPrimitive(ctx, {
          kind: "look_top_n_stack_arrange",
          n,
        }) ?? { ok: true }
      );
    }

    case "look_top_1_rd": {
      const top = state.corp.deck[0];
      if (!top) {
        log(state, `${source?.title ?? "Spy Camera"} — R&D empty.`);
        return { ok: true };
      }
      const card = state.cards[top]!;
      log(
        state,
        `${source?.title ?? "Spy Camera"} — look at top of R&D: ${card.title}.`,
      );
      return { ok: true };
    }

    case "trash_rezzed_paying_trash_cost": {
      const targets: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c?.rezzed) continue;
          if (typeof c.trashCost !== "number") continue;
          if (state.runner.credits < c.trashCost) continue;
          targets.push(id);
        }
      }
      if (targets.length === 0) {
        log(state, `Political Operative — no eligible rezzed card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          ...targets.map((cardId) => {
            const c = state.cards[cardId]!;
            const x = c.trashCost ?? 0;
            return {
              id: `po:${cardId}`,
              label: `Pay ${x}¢: trash ${c.title}`,
              effect: fx.do({
                kind: "political_operative_trash_resolve",
                cardId,
              }),
            };
          }),
          {
            id: "po:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "political_operative_trash_resolve": {
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!card?.rezzed) return { ok: true };
      const x = card.trashCost ?? 0;
      if (state.runner.credits < x) {
        log(state, `Political Operative — insufficient credits.`);
        return { ok: true };
      }
      state.runner.credits -= x;
      trashCorpToArchives(state, cardId);
      log(
        state,
        `Political Operative — pay ${x}¢; trash ${card.title}.`,
      );
      return { ok: true };
    }

    case "swap_with_grip_subtype": {
      const subtype = action.subtype;
      if (!source || !state.runner.rig.includes(sourceId)) {
        return { ok: true };
      }
      const grip = state.runner.hand.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes(subtype),
      );
      if (grip.length === 0) {
        log(state, `${source.title} — no ${subtype} in grip.`);
        return { ok: true };
      }
      if (grip.length === 1) {
        return applyMumbadDagPrimitive(ctx, {
          kind: "swap_with_grip_subtype_resolve",
          cardId: grip[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: grip.map((cardId) => ({
          id: `swap:${cardId}`,
          label: `Swap with ${state.cards[cardId]!.title}`,
          effect: fx.do({
            kind: "swap_with_grip_subtype_resolve",
            cardId,
          }),
        })),
      };
      return { ok: true };
    }

    case "swap_with_grip_subtype_resolve": {
      const gripId = action.cardId;
      if (!source || !state.runner.rig.includes(sourceId)) return { ok: true };
      if (!state.runner.hand.includes(gripId)) return { ok: true };
      const gripCard = state.cards[gripId]!;
      // Uninstall source → grip
      state.runner.rig = state.runner.rig.filter((id) => id !== sourceId);
      state.runner.hand.push(sourceId);
      source.zone = "runner:grip";
      source.faceup = true;
      // Install grip card into rig (same MU slot)
      state.runner.hand = state.runner.hand.filter((id) => id !== gripId);
      state.runner.rig.push(gripId);
      gripCard.zone = "runner:rig";
      gripCard.faceup = true;
      log(
        state,
        `${source.title} — swap with ${gripCard.title} from grip.`,
      );
      return { ok: true };
    }

    case "voting_machine_may_spend_lose_click": {
      if (!source) return { ok: true };
      const counters = source.agendaCounters ?? 0;
      if (counters < 1) {
        log(state, `Voting Machine Initiative — no agenda counters.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "vmi:spend",
            label: "Spend 1 agenda counter: Runner loses [click], if able",
            effect: fx.do({ kind: "voting_machine_spend_lose_click" }),
          },
          {
            id: "vmi:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "voting_machine_spend_lose_click": {
      if (!source) return { ok: true };
      const counters = source.agendaCounters ?? 0;
      if (counters < 1) return { ok: true };
      source.agendaCounters = counters - 1;
      if (state.runner.clicks > 0) {
        state.runner.clicks -= 1;
        log(
          state,
          `Voting Machine Initiative — spend counter; Runner loses [click] → ${state.runner.clicks}.`,
        );
      } else {
        log(
          state,
          `Voting Machine Initiative — spend counter; Runner has no click to lose.`,
        );
      }
      return { ok: true };
    }

    case "may_add_operation_from_archives_to_hq": {
      const ops = state.corp.discard.filter(
        (id) => state.cards[id]?.type === "operation",
      );
      if (ops.length === 0) {
        log(state, `Clone Suffrage Movement — no operation in Archives.`);
        return { ok: true };
      }
      if (ops.length === 1) {
        return applyMumbadDagPrimitive(ctx, {
          kind: "add_operation_from_archives_to_hq_resolve",
          cardId: ops[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: ops.map((cardId) => ({
          id: `csm:${cardId}`,
          label: `Add ${state.cards[cardId]!.title} to HQ`,
          effect: fx.do({
            kind: "add_operation_from_archives_to_hq_resolve",
            cardId,
          }),
        })),
      };
      return { ok: true };
    }

    case "add_operation_from_archives_to_hq_resolve": {
      const cardId = action.cardId;
      if (!state.corp.discard.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      log(
        state,
        `Clone Suffrage Movement — add ${card.title} from Archives to HQ.`,
      );
      return { ok: true };
    }

    case "sensie_add_one_hq_to_bottom_rd": {
      if (state.corp.hand.length === 0) {
        log(state, `Sensie Actors Union — HQ empty.`);
        return { ok: true };
      }
      if (state.corp.hand.length === 1) {
        return applyMumbadDagPrimitive(ctx, {
          kind: "sensie_add_hq_to_bottom_rd_resolve",
          cardId: state.corp.hand[0]!,
        });
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((cardId) => ({
          id: `sensie:${cardId}`,
          label: `Add ${state.cards[cardId]!.title} to bottom of R&D`,
          effect: fx.do({
            kind: "sensie_add_hq_to_bottom_rd_resolve",
            cardId,
          }),
        })),
      };
      return { ok: true };
    }

    case "sensie_add_hq_to_bottom_rd_resolve": {
      const cardId = action.cardId;
      if (!state.corp.hand.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      state.corp.deck.push(cardId);
      card.zone = "corp:rd";
      card.faceup = false;
      log(
        state,
        `Sensie Actors Union — add ${card.title} from HQ to bottom of R&D.`,
      );
      return { ok: true };
    }

    case "may_install_drawn_agenda": {
      const agendaId = action.cardId;
      if (!state.corp.hand.includes(agendaId)) return { ok: true };
      const agenda = state.cards[agendaId]!;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "pd:install",
            label: `Reveal and install ${agenda.title}`,
            effect: fx.do({
              kind: "install_agenda",
              cardId: agendaId,
            }),
          },
          {
            id: "pd:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "install_agenda": {
      const agendaId = action.cardId;
      if (!state.corp.hand.includes(agendaId)) return { ok: true };
      const agenda = state.cards[agendaId]!;
      let n = 1;
      while (state.servers[`remote-${n}` as ServerId]) n += 1;
      const serverId = `remote-${n}` as ServerId;
      state.servers[serverId] = {
        id: serverId,
        kind: "remote",
        ice: [],
        root: [],
      };
      state.corp.hand = state.corp.hand.filter((id) => id !== agendaId);
      agenda.zone = `server:${serverId}:root`;
      agenda.faceup = false;
      agenda.rezzed = false;
      state.servers[serverId]!.root.push(agendaId);
      log(
        state,
        `Political Dealings — reveal and install ${agenda.title} in ${serverId}.`,
      );
      return { ok: true };
    }

    case "search_alliance_play_or_install": {
      const alliance = state.corp.deck.filter((id) =>
        (state.cards[id]?.subtypes ?? []).includes("alliance"),
      );
      // Shuffle R&D regardless (search effect)
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      if (alliance.length === 0) {
        log(state, `Mumbad City Hall — no alliance in R&D; shuffle.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: alliance.map((cardId) => {
          const c = state.cards[cardId]!;
          return {
            id: `mch:${cardId}`,
            label: `Reveal ${c.title} (play/install paying costs)`,
            effect: fx.do({
              kind: "mumbad_city_hall_alliance_resolve",
              cardId,
            }),
          };
        }),
      };
      log(state, `Mumbad City Hall — choose an alliance from R&D.`);
      return { ok: true };
    }

    case "mumbad_city_hall_alliance_resolve": {
      const cardId = action.cardId;
      if (!state.corp.deck.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
      state.corp.hand.push(cardId);
      card.zone = "corp:hq";
      card.faceup = false;
      log(
        state,
        `Mumbad City Hall — reveal ${card.title}; added to HQ (play/install paying costs). R&D shuffled.`,
      );
      // Deterministic shuffle after remove
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      return { ok: true };
    }

    case "may_derez_rezzed": {
      const rezzedId = action.cardId;
      const rezzed = state.cards[rezzedId];
      if (!rezzed?.rezzed || !source) return { ok: true };
      const cost = rezzed.rezCost ?? 0;
      if (state.runner.credits < cost) {
        log(
          state,
          `Councilman — cannot pay ${cost}¢ to derez ${rezzed.title}.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "cm:accept",
            label: `Pay ${cost}¢ and trash Councilman: derez ${rezzed.title}`,
            effect: fx.do({
              kind: "derez_resolve",
              cardId: rezzedId,
            }),
          },
          {
            id: "cm:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "derez_resolve": {
      const rezzedId = action.cardId;
      const rezzed = state.cards[rezzedId];
      if (!rezzed?.rezzed || !source) return { ok: true };
      const cost = rezzed.rezCost ?? 0;
      if (state.runner.credits < cost) return { ok: true };
      state.runner.credits -= cost;
      rezzed.rezzed = false;
      state.turn.dagCannotRezCardIds = [
        ...(state.turn.dagCannotRezCardIds ?? []),
        rezzedId,
      ];
      moveRunnerCardToHeap(state, sourceId);
      log(
        state,
        `Councilman — pay ${cost}¢; derez ${rezzed.title}; cannot rez again this turn.`,
      );
      return { ok: true };
    }

    case "surat_may_rez_discount": {
      const discount = action.discount ?? 2;
      const candidates: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (!c || c.rezzed) continue;
          if (c.side !== "corp") continue;
          if (c.type === "agenda") continue;
          const cost = Math.max(0, (c.rezCost ?? 0) - discount);
          if (state.corp.credits < cost) continue;
          candidates.push(id);
        }
      }
      if (candidates.length === 0) {
        log(state, `Surat City Grid — no card to rez at −${discount}¢.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...candidates.map((cardId) => {
            const c = state.cards[cardId]!;
            const cost = Math.max(0, (c.rezCost ?? 0) - discount);
            return {
              id: `surat:${cardId}`,
              label: `Rez ${c.title} for ${cost}¢ (−${discount})`,
              effect: fx.do({
                kind: "surat_rez_discount_resolve",
                cardId,
                discount,
              }),
            };
          }),
          {
            id: "surat:decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "surat_rez_discount_resolve": {
      const cardId = action.cardId;
      const discount = action.discount ?? 2;
      const card = state.cards[cardId];
      if (!card || card.rezzed) return { ok: true };
      const cost = Math.max(0, (card.rezCost ?? 0) - discount);
      if (state.corp.credits < cost) return { ok: true };
      state.corp.credits -= cost;
      card.rezzed = true;
      card.faceup = true;
      log(
        state,
        `Surat City Grid — rez ${card.title} for ${cost}¢ (−${discount}).`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}

/** Fire Councilman / Surat after Corp rezzes an installed card. */
export function fireDagAfterCorpRez(
  state: GameState,
  rezzedId: string,
): void {
  const rezzed = state.cards[rezzedId];
  if (!rezzed?.rezzed) return;

  // Councilman: asset or upgrade
  if (rezzed.type === "asset" || rezzed.type === "upgrade") {
    for (const rid of [...state.runner.rig]) {
      const cm = state.cards[rid];
      if (!cm?.onCorpRezAssetOrUpgradeMayPayRezCostTrashSelfDerez) continue;
      const r = applyMumbadDagPrimitive(
        { state, sourceId: rid },
        { kind: "may_derez_rezzed", cardId: rezzedId },
      );
      if (r && !r.ok) {
        log(state, `Councilman failed: ${r.error}`);
      }
      if (state.pendingChoice) return;
    }
  }

  // Surat City Grid: whenever you rez another card in root/protecting this server
  const rezzedServer = serverIdHostingCard(state, rezzedId);
  if (!rezzedServer) return;
  const server = state.servers[rezzedServer];
  if (!server) return;
  for (const upId of server.root) {
    if (upId === rezzedId) continue;
    const up = state.cards[upId];
    if (!up?.rezzed) continue;
    const discount = up.onRezOtherCardInRootOrProtectingMayRezDiscount;
    if (typeof discount !== "number") continue;
    // Triggering rez is in root or ice of this server
    const inRoot = server.root.includes(rezzedId);
    const inIce = server.ice.includes(rezzedId);
    if (!inRoot && !inIce) continue;
    const r = applyMumbadDagPrimitive(
      { state, sourceId: upId },
      { kind: "surat_may_rez_discount", discount },
    );
    if (r && !r.ok) {
      log(state, `Surat City Grid failed: ${r.error}`);
    }
    if (state.pendingChoice) return;
  }
}
