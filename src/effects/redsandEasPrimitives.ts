/** Earth's Scion (eas) Red Sand pack primitives — v1.131.0. */
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

function trashToArchives(state: EffectCtx["state"], cardId: string): void {
  removeCardFromCurrentZone(state, cardId);
  const card = state.cards[cardId];
  if (!card) return;
  card.zone = "corp:archives";
  card.faceup = true;
  card.rezzed = false;
  state.corp.discard.push(cardId);
}

function installedIce(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      if (state.cards[id]) out.push(id);
    }
  }
  return out;
}

function installedCorpCards(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of [...server.root, ...server.ice]) {
      if (state.cards[id]) out.push(id);
    }
  }
  return out;
}

function canAdvance(state: EffectCtx["state"], cardId: string): boolean {
  const c = state.cards[cardId];
  if (!c) return false;
  if (c.type === "agenda") return true;
  if (c.canAdvance) return true;
  const def = c.defId ? getCardDef(c.defId) : undefined;
  return Boolean(def?.canAdvance);
}

function icePrintedRezCost(state: EffectCtx["state"], iceId: string): number {
  const c = state.cards[iceId];
  if (!c) return 0;
  const def = c.defId ? getCardDef(c.defId) : undefined;
  return def?.rezCost ?? c.rezCost ?? 0;
}

function swapTwoInstalledIce(
  state: EffectCtx["state"],
  a: string,
  b: string,
): void {
  let aServer: ServerId | null = null;
  let bServer: ServerId | null = null;
  let aIdx = -1;
  let bIdx = -1;
  for (const [sid, server] of Object.entries(state.servers)) {
    const ai = server.ice.indexOf(a);
    if (ai >= 0) {
      aServer = sid as ServerId;
      aIdx = ai;
    }
    const bi = server.ice.indexOf(b);
    if (bi >= 0) {
      bServer = sid as ServerId;
      bIdx = bi;
    }
  }
  if (!aServer || !bServer || aIdx < 0 || bIdx < 0) return;
  state.servers[aServer]!.ice[aIdx] = b;
  state.servers[bServer]!.ice[bIdx] = a;
  const ca = state.cards[a]!;
  const cb = state.cards[b]!;
  ca.zone = `server:${aServer}:ice`;
  cb.zone = `server:${bServer}:ice`;
}

export function applyRedsandEasPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;

  switch (action.kind) {
    case "persephone_may_trash_stack_top_then_trash_rd_per_resolved": {
      const enc = state.run?.encounter;
      const ice = enc ? state.cards[enc.iceId] : null;
      const isSentry = (ice?.subtypes ?? []).some(
        (s) => s.toLowerCase() === "sentry",
      );
      if (!enc || !ice || !isSentry) {
        log(state, `Persephone — pass was not after encountering a sentry.`);
        return { ok: true };
      }
      const resolved = (enc.broken ?? []).filter((b) => !b).length;
      if (state.runner.deck.length === 0) {
        log(state, `Persephone — stack empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "accept",
            label: `Trash top of stack; trash ${resolved} from R&D`,
            effect: fx.do({
              kind: "persephone_resolve_trash",
              amount: resolved,
            }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "persephone_resolve_trash": {
      const amount = Math.max(0, action.amount ?? 0);
      if (state.runner.deck.length > 0) {
        const top = state.runner.deck.shift()!;
        trashToHeap(state, top);
        log(state, `Persephone — trash ${state.cards[top]?.title} from stack.`);
      }
      for (let i = 0; i < amount; i++) {
        if (state.corp.deck.length === 0) break;
        const top = state.corp.deck.shift()!;
        trashToArchives(state, top);
        log(state, `Persephone — trash ${state.cards[top]?.title} from R&D.`);
      }
      return { ok: true };
    }

    case "rubicon_switch_derez_rezzed_this_turn": {
      const rezzedThisTurn = state.turn.rezzedThisTurnIds ?? [];
      const candidates = installedIce(state).filter((id) => {
        const ice = state.cards[id];
        return ice?.rezzed && rezzedThisTurn.includes(id);
      });
      if (candidates.length === 0) {
        log(state, `Rubicon Switch — no ice rezzed this turn.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const id of candidates) {
        const x = icePrintedRezCost(state, id);
        if (state.runner.credits < x) continue;
        options.push({
          id: `derez:${id}`,
          label: `Pay ${x}¢: Derez ${state.cards[id]!.title}`,
          effect: fx.seq(
            fx.do({ kind: "lose_credits", side: "runner", amount: x }),
            fx.do({ kind: "derez_card", cardId: id }),
          ),
        });
      }
      if (options.length === 0) {
        log(state, `Rubicon Switch — cannot pay printed rez cost of any candidate.`);
        return { ok: true };
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "rosetta_rfg_program_search_install_non_virus": {
      const programs = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Rosetta 2.0 — no installed program to remove.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `rfg:${id}`,
          label: `Remove ${state.cards[id]!.title} from the game`,
          effect: fx.do({ kind: "rosetta_rfg_then_search", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "rosetta_rfg_then_search": {
      const rfgId = (action as { cardId: string }).cardId;
      const rfg = state.cards[rfgId];
      if (!rfg || !state.runner.rig.includes(rfgId)) {
        log(state, `Rosetta 2.0 — RFG target gone.`);
        return { ok: true };
      }
      const discount =
        rfg.installCost ??
        (rfg.defId ? getCardDef(rfg.defId)?.installCost : undefined) ??
        0;
      removeCardFromCurrentZone(state, rfgId);
      rfg.zone = "removed-from-game";
      rfg.hostId = undefined;
      log(state, `Rosetta 2.0 — remove ${rfg.title} from the game.`);
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        if (!c || c.type !== "program") return false;
        return !(c.subtypes ?? []).some((s) => s.toLowerCase() === "virus");
      });
      // Shuffle after search regardless.
      const shuffle = () => {
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
      };
      if (matches.length === 0) {
        shuffle();
        log(state, `Rosetta 2.0 — no non-virus program in stack.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `install:${id}`,
          label: `Install ${state.cards[id]!.title} (−${discount}¢)`,
          effect: fx.do({
            kind: "rosetta_install_from_stack",
            cardId: id,
            discount,
          }),
        })),
      };
      return { ok: true };
    }

    case "rosetta_install_from_stack": {
      const cardId = action.cardId;
      const discount = action.discount ?? 0;
      const card = state.cards[cardId];
      if (!card || !state.runner.deck.includes(cardId)) {
        log(state, `Rosetta 2.0 — install target not in stack.`);
        return { ok: true };
      }
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      const cost = Math.max(0, (card.installCost ?? 0) - discount);
      if (state.runner.credits < cost) {
        state.runner.hand.push(cardId);
        card.zone = "runner:grip";
        log(
          state,
          `Rosetta 2.0 — cannot pay ${cost}¢; ${card.title} added to grip.`,
        );
        return { ok: true };
      }
      state.runner.credits -= cost;
      state.runner.rig.push(cardId);
      card.zone = "runner:rig";
      card.faceup = true;
      log(
        state,
        `Rosetta 2.0 — install ${card.title} for ${cost}¢ (−${discount}).`,
      );
      return { ok: true };
    }

    case "inversificator_may_swap_passed_ice": {
      const iceId = action.iceId ?? state.run?.encounter?.iceId;
      if (!iceId || !state.cards[iceId]) {
        log(state, `Inversificator — no ice to swap.`);
        return { ok: true };
      }
      const others = installedIce(state).filter((id) => id !== iceId);
      if (others.length === 0) {
        log(state, `Inversificator — no other installed ice.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
          ...others.map((id) => ({
            id: `swap:${id}`,
            label: `Swap with ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "inversificator_swap_resolve",
              iceId,
              otherId: id,
            }),
          })),
        ],
      };
      return { ok: true };
    }

    case "inversificator_swap_resolve": {
      const a = action.iceId;
      const b = action.otherId;
      if (!a || !b) return { ok: true };
      swapTwoInstalledIce(state, a, b);
      log(
        state,
        `Inversificator — swap ${state.cards[a]?.title} with ${state.cards[b]?.title}.`,
      );
      return { ok: true };
    }

    case "aginfusion_trash_approached_unrezzed_redirect": {
      const run = state.run;
      if (!run || run.position === null) {
        log(state, `AgInfusion — no approached ice.`);
        return { ok: true };
      }
      const iceId =
        state.servers[run.attackedServerId]?.ice[run.position] ?? null;
      const ice = iceId ? state.cards[iceId] : null;
      if (!ice || ice.rezzed) {
        log(state, `AgInfusion — approached ice must be unrezzed.`);
        return { ok: true };
      }
      trashToArchives(state, iceId!);
      log(state, `AgInfusion — trash approached ${ice.title}.`);
      const attacked = run.attackedServerId;
      const servers = (
        Object.keys(state.servers) as ServerId[]
      ).filter((sid) => sid !== attacked);
      if (servers.length === 0) {
        log(state, `AgInfusion — no other server.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: servers.map((sid) => ({
          id: `server:${sid}`,
          label: `Move Runner to ${sid}`,
          effect: fx.do({ kind: "aginfusion_redirect_resolve", serverId: sid }),
        })),
      };
      return { ok: true };
    }

    case "aginfusion_redirect_resolve": {
      const run = state.run;
      const sid = action.serverId as ServerId | undefined;
      if (!run || !sid || !state.servers[sid]) {
        log(state, `AgInfusion — invalid redirect server.`);
        return { ok: true };
      }
      run.attackedServerId = sid;
      const iceCount = state.servers[sid]!.ice.length;
      run.position = iceCount > 0 ? iceCount - 1 : null;
      run.encounter = null;
      if (iceCount > 0) {
        const outer = state.servers[sid]!.ice[iceCount - 1]!;
        run.forceEncounterIceId = outer;
        log(
          state,
          `AgInfusion — Runner moves to outermost of ${sid} (${state.cards[outer]?.title}).`,
        );
      } else {
        log(state, `AgInfusion — Runner moves to ${sid} (no ice).`);
      }
      return { ok: true };
    }

    case "bamboo_dome_reveal_top_3": {
      const top = state.corp.deck.slice(0, 3);
      if (top.length === 0) {
        log(state, `Bamboo Dome — R&D empty.`);
        return { ok: true };
      }
      for (const id of top) {
        log(state, `Bamboo Dome — reveal ${state.cards[id]?.title}.`);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: top.map((id) => ({
          id: `hq:${id}`,
          label: `Add ${state.cards[id]!.title} to HQ`,
          effect: fx.do({
            kind: "bamboo_dome_choose_hq",
            cardId: id,
            restIds: top.filter((x) => x !== id),
          }),
        })),
      };
      return { ok: true };
    }

    case "bamboo_dome_choose_hq": {
      const cardId = action.cardId;
      const rest = action.restIds ?? [];
      if (!cardId || !state.corp.deck.includes(cardId)) {
        log(state, `Bamboo Dome — chosen card not on R&D.`);
        return { ok: true };
      }
      state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
      state.corp.hand.push(cardId);
      state.cards[cardId]!.zone = "corp:hq";
      state.cards[cardId]!.faceup = false;
      log(state, `Bamboo Dome — add ${state.cards[cardId]!.title} to HQ.`);
      const still = rest.filter((id) => state.corp.deck.includes(id));
      if (still.length <= 1) {
        // Keep relative order; already on top after removing HQ card.
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: still.map((id) => ({
          id: `top:${id}`,
          label: `Top: ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "bamboo_dome_order_rest",
            ordered: [id],
            remaining: still.filter((x) => x !== id),
          }),
        })),
      };
      return { ok: true };
    }

    case "bamboo_dome_order_rest": {
      const ordered = [...(action.ordered ?? [])];
      const remaining = action.remaining ?? [];
      if (remaining.length === 0) {
        // Rebuild deck: ordered (top-first) then the rest of deck without those.
        const set = new Set(ordered);
        state.corp.deck = state.corp.deck.filter((id) => !set.has(id));
        state.corp.deck = [...ordered, ...state.corp.deck];
        log(
          state,
          `Bamboo Dome — return ${ordered.map((id) => state.cards[id]?.title).join(", ")} to top of R&D.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: remaining.map((id) => ({
          id: `next:${id}`,
          label: `Next: ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "bamboo_dome_order_rest",
            ordered: [...ordered, id],
            remaining: remaining.filter((x) => x !== id),
          }),
        })),
      };
      return { ok: true };
    }

    case "audacity_trash_hq_place_total_2_advancements": {
      const hq = [...state.corp.hand];
      for (const id of hq) {
        trashToArchives(state, id);
      }
      log(state, `Audacity — trash all cards from HQ (${hq.length}).`);
      const advanceable = installedCorpCards(state).filter((id) =>
        canAdvance(state, id),
      );
      if (advanceable.length === 0) {
        log(state, `Audacity — no advanceable installed cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: advanceable.flatMap((id) => {
          const title = state.cards[id]!.title;
          return [
            {
              id: `adv2:${id}`,
              label: `Place 2 advancements on ${title}`,
              effect: fx.do({
                kind: "place_advancements_on",
                cardId: id,
                amount: 2,
              }),
            },
            {
              id: `adv1:${id}`,
              label: `Place 1 advancement on ${title} (split)`,
              effect: fx.do({
                kind: "audacity_place_one_then_choose",
                cardId: id,
              }),
            },
          ];
        }),
      };
      return { ok: true };
    }

    case "audacity_place_one_then_choose": {
      const first = action.cardId;
      if (first && state.cards[first]) {
        state.cards[first]!.advancementTokens =
          (state.cards[first]!.advancementTokens ?? 0) + 1;
        log(state, `Audacity — place 1 advancement on ${state.cards[first]!.title}.`);
      }
      const advanceable = installedCorpCards(state).filter((id) =>
        canAdvance(state, id),
      );
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: advanceable.map((id) => ({
          id: `adv:${id}`,
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

    case "red_planet_couriers_move_all_advancements": {
      const withAdv = installedCorpCards(state).filter(
        (id) => (state.cards[id]?.advancementTokens ?? 0) > 0,
      );
      let total = 0;
      for (const id of withAdv) {
        total += state.cards[id]!.advancementTokens ?? 0;
        state.cards[id]!.advancementTokens = 0;
      }
      if (total === 0) {
        log(state, `Red Planet Couriers — no advancement tokens.`);
        return { ok: true };
      }
      const targets = installedCorpCards(state).filter((id) =>
        canAdvance(state, id),
      );
      if (targets.length === 0) {
        log(state, `Red Planet Couriers — no advanceable target; tokens lost.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `move:${id}`,
          label: `Move ${total} advancements onto ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: total,
          }),
        })),
      };
      return { ok: true };
    }

    case "aeneas_may_reveal_gain_one": {
      const cardId = action.cardId;
      const card = cardId ? state.cards[cardId] : null;
      if (!card) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "accept",
            label: `Reveal ${card.title} and gain 1¢`,
            effect: fx.do({
              kind: "aeneas_reveal_gain_resolve",
              cardId,
            }),
          },
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "aeneas_reveal_gain_resolve": {
      const cardId = action.cardId;
      const card = cardId ? state.cards[cardId] : null;
      if (card) {
        card.faceup = true;
        log(state, `Aeneas Informant — reveal ${card.title}.`);
      }
      state.runner.credits += 1;
      log(state, `Aeneas Informant — gain 1¢ → ${state.runner.credits}¢.`);
      return { ok: true };
    }

    default:
      return null;
  }
}
