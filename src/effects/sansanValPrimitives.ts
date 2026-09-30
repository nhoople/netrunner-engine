/** The Valley (val) SanSan pack primitives. */
import { log } from "../state/createGame.js";
import { dealDamage } from "../state/damage.js";
import { recomputeRunnerMaxHandSize } from "../state/handSize.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import { memoryLimit, usedMemory } from "../state/turn.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function countRezzedNextIce(state: EffectCtx["state"]): number {
  let n = 0;
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      const c = state.cards[id];
      if (c?.rezzed && (c.subtypes ?? []).includes("next")) n += 1;
    }
  }
  return n;
}

function installedPrograms(state: EffectCtx["state"]): string[] {
  return state.runner.rig.filter((id) => state.cards[id]?.type === "program");
}

export function applySansanValPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "paige_piper_search_stack_copies_to_heap": {
      const lastInstallId = state.turn.installedThisTurn.at(-1);
      const installed = lastInstallId ? state.cards[lastInstallId] : null;
      if (!installed?.defId) {
        log(state, `Paige Piper — no install this turn to search for.`);
        return { ok: true };
      }
      const defId = installed.defId;
      const copies = state.runner.deck.filter(
        (id) => state.cards[id]?.defId === defId,
      );
      if (copies.length === 0) {
        log(state, `Paige Piper — no copies of ${installed.title} in stack.`);
        // Still shuffle.
        // Fisher-Yates via existing shuffle if available — simple reverse+sort ok for test.
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
        return { ok: true };
      }
      // May add any number — offer choice of how many / which; simplify: move all copies.
      for (const id of copies) {
        state.runner.deck = state.runner.deck.filter((x) => x !== id);
        moveRunnerCardToHeap(state, id);
      }
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      log(
        state,
        `Paige Piper — add ${copies.length} copy/copies of ${installed.title} to heap; shuffle stack.`,
      );
      return { ok: true };
    }

    case "reveal_random_hq_card": {
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Enhanced Vision — HQ empty.`);
        return { ok: true };
      }
      const pick = hq[Math.floor(Math.random() * hq.length)]!;
      const card = state.cards[pick];
      log(
        state,
        `Enhanced Vision — Corp reveals ${card?.title ?? pick} from HQ.`,
      );
      return { ok: true };
    }

    case "next_gold_net_damage": {
      const x = countRezzedNextIce(state);
      if (x <= 0) {
        log(state, `NEXT Gold — X=0, no net damage.`);
        return { ok: true };
      }
      dealDamage(state, "net", x, sourceId);
      log(state, `NEXT Gold — do ${x} net damage (rezzed NEXT ice).`);
      return { ok: true };
    }

    case "next_gold_trash_programs": {
      const x = countRezzedNextIce(state);
      if (x <= 0) {
        log(state, `NEXT Gold — X=0, trash no programs.`);
        return { ok: true };
      }
      const progs = installedPrograms(state);
      if (progs.length === 0) {
        log(state, `NEXT Gold — no installed programs.`);
        return { ok: true };
      }
      const n = Math.min(x, progs.length);
      // Offer Corp choice iteratively via pendingChoice for first batch.
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: progs.map((id) => ({
          id: `next-gold-trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "next_gold_trash_program_pick",
            cardId: id,
            remaining: n - 1,
          }),
        })),
      };
      return { ok: true };
    }

    case "next_gold_trash_program_pick": {
      const cardId = (action as { cardId: string }).cardId;
      const remaining = (action as { remaining: number }).remaining;
      const card = state.cards[cardId];
      if (!card || card.type !== "program" || !state.runner.rig.includes(cardId)) {
        return { ok: false, error: "NEXT Gold trash target invalid.", cites: [] };
      }
      moveRunnerCardToHeap(state, cardId);
      log(state, `NEXT Gold — trash ${card.title}.`);
      if (remaining > 0) {
        const progs = installedPrograms(state);
        if (progs.length === 0) return { ok: true };
        state.pendingChoice = {
          sourceId,
          chooser: "corp",
          options: progs.map((id) => ({
            id: `next-gold-trash:${id}`,
            label: `Trash ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "next_gold_trash_program_pick",
              cardId: id,
              remaining: remaining - 1,
            }),
          })),
        };
      }
      return { ok: true };
    }

    case "jinteki_biotech_flip": {
      if (!source) {
        return { ok: false, error: "Jinteki Biotech flip — no source.", cites: [] };
      }
      const faceId = source.chosenIdentityFaceId;
      const faces = source.identityFaceOptions ?? [];
      const face = faces.find((f) => f.id === faceId) ?? faces[0];
      if (!face) {
        log(state, `Jinteki Biotech — no face chosen.`);
        return { ok: true };
      }
      source.identityFlipped = !source.identityFlipped;
      log(state, `Jinteki Biotech flips (${face.label}).`);
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "jinteki-flip-resolve",
            label: face.label,
            effect: face.onFlip,
          },
        ],
      };
      return { ok: true };
    }

    case "jinteki_biotech_choose_face": {
      if (!source) {
        return { ok: false, error: "Jinteki Biotech choose — no source.", cites: [] };
      }
      const faceId = (action as { faceId: string }).faceId;
      source.chosenIdentityFaceId = faceId;
      const face = (source.identityFaceOptions ?? []).find((f) => f.id === faceId);
      log(
        state,
        `Jinteki Biotech — choose face ${face?.label ?? faceId}.`,
      );
      return { ok: true };
    }

    case "jinteki_biotech_shuffle_archives_into_rd": {
      const arch = [...state.corp.discard];
      state.corp.discard = [];
      for (const id of arch) {
        const c = state.cards[id];
        if (!c) continue;
        c.zone = "corp:rd";
        c.faceup = false;
        state.corp.deck.push(id);
      }
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      log(
        state,
        `Jinteki Biotech (Agriculture) — shuffle ${arch.length} Archives card(s) into R&D.`,
      );
      return { ok: true };
    }

    case "jinteki_biotech_place_4_advancement": {
      const cands: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c?.side === "corp" && c.canAdvance) cands.push(id);
        }
      }
      if (cands.length === 0) {
        log(state, `Jinteki Biotech (Warehouse) — no advanceable card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: cands.map((id) => ({
          id: `jb-adv:${id}`,
          label: `Place 4 advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "place_advancements_on",
            cardId: id,
            amount: 4,
          }),
        })),
      };
      return { ok: true };
    }

    case "genetic_resequencing_place_agenda_counter": {
      const scored = state.corp.score.filter((id) => state.cards[id]?.type === "agenda");
      if (scored.length === 0) {
        log(state, `Genetic Resequencing — no scored agenda.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: scored.map((id) => ({
          id: `gr-counter:${id}`,
          label: `Place 1 agenda counter on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "genetic_resequencing_add_counter",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "genetic_resequencing_add_counter": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || !state.corp.score.includes(cardId)) {
        return {
          ok: false,
          error: "Genetic Resequencing target not in score area.",
          cites: [],
        };
      }
      card.agendaCounters = (card.agendaCounters ?? 0) + 1;
      log(
        state,
        `Genetic Resequencing — place 1 agenda counter on ${card.title} → ${card.agendaCounters}.`,
      );
      return { ok: true };
    }

    case "net_damage_equal_unused_mu": {
      const unused = Math.max(0, memoryLimit(state) - usedMemory(state));
      if (unused <= 0) {
        log(state, `Cortex Lock — 0 unused MU.`);
        return { ok: true };
      }
      dealDamage(state, "net", unused, sourceId);
      log(state, `Cortex Lock — do ${unused} net damage (unused MU).`);
      return { ok: true };
    }

    case "valley_grid_hand_size_penalty_until_next_corp_turn": {
      state.runner.valleyGridHandSizePenalty =
        (state.runner.valleyGridHandSizePenalty ?? 0) + 1;
      recomputeRunnerMaxHandSize(state);
      log(
        state,
        `Valley Grid — Runner max hand size −1 until beginning of Corp's next turn (penalty=${state.runner.valleyGridHandSizePenalty}).`,
      );
      return { ok: true };
    }

    case "bandwidth_give_tag_remove_if_successful": {
      state.runner.tags += 1;
      if (state.run) {
        state.run.bandwidthTagsToRemoveOnSuccess =
          (state.run.bandwidthTagsToRemoveOnSuccess ?? 0) + 1;
      }
      log(
        state,
        `Bandwidth — give Runner 1 tag (remove 1 if run successful) → ${state.runner.tags}.`,
      );
      return { ok: true };
    }

    case "tech_startup_search_rd_asset_install": {
      const assets = state.corp.deck.filter(
        (id) => state.cards[id]?.type === "asset",
      );
      if (assets.length === 0) {
        log(state, `Tech Startup — no asset in R&D.`);
        for (let i = state.corp.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.corp.deck[i]!;
          state.corp.deck[i] = state.corp.deck[j]!;
          state.corp.deck[j] = tmp;
        }
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: assets.map((id) => ({
          id: `tech-startup:${id}`,
          label: `Install ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "tech_startup_install_asset",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "tech_startup_install_asset": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || card.type !== "asset" || !state.corp.deck.includes(cardId)) {
        return {
          ok: false,
          error: "Tech Startup asset not in R&D.",
          cites: [],
        };
      }
      state.corp.deck = state.corp.deck.filter((id) => id !== cardId);
      const remoteNum = state.nextRemoteNumber++;
      const sid = `remote-${remoteNum}` as import("../state/types.js").ServerId;
      state.servers[sid] = { id: sid, kind: "remote", ice: [], root: [] };
      state.servers[sid].root.push(cardId);
      card.zone = `server:${sid}:root`;
      card.faceup = false;
      card.rezzed = false;
      log(
        state,
        `Tech Startup — reveal and install ${card.title} in ${sid}; shuffle R&D.`,
      );
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      return { ok: true };
    }

    default:
      return null;
  }
}
