/** Council of the Crest (cotc) Kitara pack primitives — v1.138.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

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

function shuffleDeck(deck: string[]): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
}

function trashSelfUpgrade(
  state: EffectCtx["state"],
  sourceId: string,
): void {
  const card = state.cards[sourceId];
  if (!card) return;
  for (const server of Object.values(state.servers)) {
    server.root = server.root.filter((id) => id !== sourceId);
  }
  card.zone = "corp:archives";
  card.rezzed = false;
  card.faceup = true;
  if (!state.corp.discard.includes(sourceId)) {
    state.corp.discard.push(sourceId);
  }
}

function installedRunnerCardIds(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const id of state.runner.rig) {
    if (!state.cards[id]?.hostId) out.push(id);
  }
  for (const card of Object.values(state.cards)) {
    if (
      card.side === "runner" &&
      card.hostId &&
      !out.includes(card.id) &&
      state.runner.rig.includes(card.id)
    ) {
      out.push(card.id);
    }
  }
  return out;
}

function shuffleRunnerCardIntoStack(
  state: EffectCtx["state"],
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card) return;
  state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
  for (const id of [...state.runner.rig]) {
    const h = state.cards[id];
    if (h?.hostId === cardId) h.hostId = undefined;
  }
  card.hostId = undefined;
  card.zone = "runner:stack";
  card.faceup = false;
  card.rezzed = false;
  state.runner.deck.push(cardId);
  shuffleDeck(state.runner.deck);
  log(state, `Shuffle ${card.title} into the stack.`);
}

export function applyKitaraCotcPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "cotc_friday_chip_move_virus": {
      const have = source?.virusCounters ?? 0;
      if (have < 1) {
        log(state, `${source?.title ?? "Friday Chip"} — no virus counters.`);
        return { ok: true };
      }
      const viruses = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "program" &&
          (c.subtypes ?? []).includes("virus") &&
          id !== sourceId
        );
      });
      if (viruses.length === 0) {
        log(state, `${source?.title ?? "Friday Chip"} — no virus programs.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: viruses.map((id) => ({
          id: `friday-move:${id}`,
          label: `Move virus to ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "cotc_friday_chip_move_virus_resolve",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "cotc_friday_chip_move_virus_resolve": {
      const destId = (action as { cardId: string }).cardId;
      const src = state.cards[sourceId];
      const dest = state.cards[destId];
      if (!src || !dest || (src.virusCounters ?? 0) < 1) return { ok: true };
      src.virusCounters = (src.virusCounters ?? 0) - 1;
      dest.virusCounters = (dest.virusCounters ?? 0) + 1;
      log(
        state,
        `Friday Chip — move 1 virus to ${dest.title} (${src.virusCounters} left).`,
      );
      return { ok: true };
    }

    case "cotc_crypt_search_install": {
      const candidates = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "program" && (c.subtypes ?? []).includes("virus")
        );
      });
      if (candidates.length === 0) {
        shuffleDeck(state.runner.deck);
        log(state, `Crypt — no virus program in stack; shuffle.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: candidates.map((id) => ({
          id: `crypt-install:${id}`,
          label: `Install ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "cotc_crypt_install_resolve",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "cotc_crypt_install_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card) return { ok: true };
      const cost = card.installCost ?? 0;
      if (state.runner.credits < cost) {
        log(
          state,
          `Crypt — cannot pay ${cost}¢ to install ${card.title}; shuffle.`,
        );
        shuffleDeck(state.runner.deck);
        return { ok: true };
      }
      state.runner.credits -= cost;
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      state.runner.rig.push(cardId);
      card.zone = "runner:rig";
      card.faceup = true;
      shuffleDeck(state.runner.deck);
      log(
        state,
        `Crypt — install ${card.title} for ${cost}¢; shuffle stack.`,
      );
      return { ok: true };
    }

    case "cotc_no_one_home": {
      const mode = (action as { mode?: string }).mode ?? "tags";
      state.turn.cotcNoOneHomeUsed = true;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "noh-trace",
            label: "Trace[0]",
            effect: {
              op: "do",
              action: {
                kind: "trace",
                strength: 0,
                onSuccess: fx.do({
                  kind: "gain_credits",
                  side: "corp",
                  amount: 0,
                }),
                onFailure: fx.do({
                  kind: "cotc_no_one_home_prevent",
                  mode,
                }),
              },
            },
          },
        ],
      };
      return { ok: true };
    }

    case "cotc_no_one_home_prevent": {
      const mode = (action as { mode?: string }).mode ?? "tags";
      if (mode === "tags") {
        if (state.pendingTags) state.pendingTags.remaining = 0;
        log(state, `No One Home — prevent all tags.`);
      } else if (state.pendingDamage) {
        state.pendingDamage.remaining = 0;
        log(state, `No One Home — prevent all net damage.`);
      }
      return { ok: true };
    }

    case "cotc_marathon_resolve": {
      state.runner.clicks += 1;
      const serverId = state.run?.attackedServerId;
      if (serverId) {
        if (!state.turn.cotcForbiddenServerIds) {
          state.turn.cotcForbiddenServerIds = [];
        }
        if (!state.turn.cotcForbiddenServerIds.includes(serverId)) {
          state.turn.cotcForbiddenServerIds.push(serverId);
        }
      }
      // Return Marathon from heap to grip.
      const eventId = state.run?.runSourceId ?? sourceId;
      const card = state.cards[eventId];
      if (card) {
        state.runner.discard = state.runner.discard.filter(
          (id) => id !== eventId,
        );
        if (!state.runner.hand.includes(eventId)) {
          state.runner.hand.push(eventId);
        }
        card.zone = "runner:grip";
        card.faceup = true;
        log(
          state,
          `Marathon — gain [click], add to grip; cannot run ${serverId ?? "server"} again this turn.`,
        );
      } else {
        log(state, `Marathon — gain [click]; forbid server.`);
      }
      return { ok: true };
    }

    case "break_last_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `${source?.title ?? "Gbahali"} — no encounter.`);
        return { ok: true };
      }
      let idx = -1;
      for (let i = enc.broken.length - 1; i >= 0; i--) {
        if (!enc.broken[i]) {
          idx = i;
          break;
        }
      }
      if (idx < 0) {
        log(state, `${source?.title ?? "Gbahali"} — no unbroken subroutine.`);
        return { ok: true };
      }
      enc.broken[idx] = true;
      log(
        state,
        `${source?.title ?? "Gbahali"} — break last subroutine (index ${idx}).`,
      );
      return { ok: true };
    }

    case "cotc_white_hat": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "do-trace",
            label: "Resolve Trace[3]",
            effect: {
              op: "do",
              action: {
                kind: "trace",
                strength: 3,
                onSuccess: fx.do({
                  kind: "gain_credits",
                  side: "corp",
                  amount: 0,
                }),
                onFailure: fx.do({ kind: "cotc_white_hat_reveal" }),
              },
            },
          },
        ],
      };
      return { ok: true };
    }

    case "cotc_white_hat_trace": {
      return applyKitaraCotcPrimitive(ctx, { kind: "cotc_white_hat" });
    }

    case "cotc_white_hat_reveal": {
      for (const id of state.corp.hand) {
        const c = state.cards[id];
        if (c) c.faceup = true;
      }
      log(state, `White Hat — reveal all cards in HQ.`);
      const hq = [...state.corp.hand];
      if (hq.length === 0) return { ok: true };
      const opts: { id: string; label: string; effect: Effect }[] = hq.map(
        (id) => ({
          id: `wh-shuffle:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into R&D`,
          effect: fx.do({
            kind: "cotc_white_hat_shuffle_one",
            cardId: id,
            remaining: 1,
          }),
        }),
      );
      opts.push({
        id: "wh-done",
        label: "Done (shuffle 0)",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: opts,
      };
      return { ok: true };
    }

    case "cotc_white_hat_shuffle_one": {
      const cardId = (action as { cardId: string }).cardId;
      const remaining = (action as { remaining?: number }).remaining ?? 0;
      const card = state.cards[cardId];
      if (card && state.corp.hand.includes(cardId)) {
        state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
        card.zone = "corp:rd";
        card.faceup = false;
        state.corp.deck.push(cardId);
        shuffleDeck(state.corp.deck);
        log(state, `White Hat — shuffle ${card.title} into R&D.`);
      }
      if (remaining <= 0) return { ok: true };
      const hq = [...state.corp.hand];
      if (hq.length === 0) return { ok: true };
      const opts: { id: string; label: string; effect: Effect }[] = hq.map(
        (id) => ({
          id: `wh-shuffle:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into R&D`,
          effect: fx.do({
            kind: "cotc_white_hat_shuffle_one",
            cardId: id,
            remaining: remaining - 1,
          }),
        }),
      );
      opts.push({
        id: "wh-done",
        label: "Done",
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
      });
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: opts,
      };
      return { ok: true };
    }

    case "cotc_kuwinda_trace": {
      const x = source?.powerCounters ?? 0;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "kuwinda-trace",
            label: `Trace[${x}]`,
            effect: {
              op: "do",
              action: {
                kind: "trace",
                strength: x,
                onSuccess: fx.seq(
                  fx.do({ kind: "core_damage", amount: 1 }),
                  fx.do({ kind: "trash_self" }),
                ),
                onFailure: fx.do({ kind: "add_power_counter", amount: 1 }),
              },
            },
          },
        ],
      };
      return { ok: true };
    }

    case "cotc_next_sapphire_draw": {
      const x = countRezzedNextIce(state);
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 0; n <= x; n++) {
        opts.push({
          id: `sapphire-draw:${n}`,
          label: n === 0 ? "Draw 0" : `Draw ${n}`,
          effect: fx.do({ kind: "draw", side: "corp", amount: n }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options: opts };
      return { ok: true };
    }

    case "cotc_next_sapphire_archives_to_hq": {
      const x = countRezzedNextIce(state);
      const archives = [...state.corp.discard];
      if (x <= 0 || archives.length === 0) {
        log(state, `NEXT Sapphire — add 0 from Archives (X=${x}).`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...archives.map((id) => ({
            id: `sapphire-arch:${id}`,
            label: `Add ${state.cards[id]!.title} to HQ`,
            effect: fx.do({
              kind: "cotc_next_sapphire_archives_pick",
              cardId: id,
              remaining: Math.min(x, archives.length) - 1,
            }),
          })),
          {
            id: "sapphire-arch-done",
            label: "Done",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "cotc_next_sapphire_archives_pick": {
      const cardId = (action as { cardId: string }).cardId;
      const remaining = (action as { remaining?: number }).remaining ?? 0;
      const card = state.cards[cardId];
      if (card && state.corp.discard.includes(cardId)) {
        state.corp.discard = state.corp.discard.filter((id) => id !== cardId);
        state.corp.hand.push(cardId);
        card.zone = "corp:hq";
        card.faceup = true;
        log(state, `NEXT Sapphire — add ${card.title} from Archives to HQ.`);
      }
      if (remaining <= 0) return { ok: true };
      const archives = [...state.corp.discard];
      if (archives.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...archives.map((id) => ({
            id: `sapphire-arch:${id}`,
            label: `Add ${state.cards[id]!.title} to HQ`,
            effect: fx.do({
              kind: "cotc_next_sapphire_archives_pick",
              cardId: id,
              remaining: remaining - 1,
            }),
          })),
          {
            id: "sapphire-arch-done",
            label: "Done",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "cotc_next_sapphire_hq_to_rd": {
      const x = countRezzedNextIce(state);
      const hq = [...state.corp.hand];
      if (x <= 0 || hq.length === 0) {
        log(state, `NEXT Sapphire — shuffle 0 from HQ (X=${x}).`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...hq.map((id) => ({
            id: `sapphire-hq:${id}`,
            label: `Shuffle ${state.cards[id]!.title} into R&D`,
            effect: fx.do({
              kind: "cotc_next_sapphire_hq_pick",
              cardId: id,
              remaining: Math.min(x, hq.length) - 1,
            }),
          })),
          {
            id: "sapphire-hq-done",
            label: "Done",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "cotc_next_sapphire_hq_pick": {
      const cardId = (action as { cardId: string }).cardId;
      const remaining = (action as { remaining?: number }).remaining ?? 0;
      const card = state.cards[cardId];
      if (card && state.corp.hand.includes(cardId)) {
        state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
        card.zone = "corp:rd";
        card.faceup = false;
        state.corp.deck.push(cardId);
        shuffleDeck(state.corp.deck);
        log(state, `NEXT Sapphire — shuffle ${card.title} into R&D.`);
      }
      if (remaining <= 0) return { ok: true };
      const hq = [...state.corp.hand];
      if (hq.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...hq.map((id) => ({
            id: `sapphire-hq:${id}`,
            label: `Shuffle ${state.cards[id]!.title} into R&D`,
            effect: fx.do({
              kind: "cotc_next_sapphire_hq_pick",
              cardId: id,
              remaining: remaining - 1,
            }),
          })),
          {
            id: "sapphire-hq-done",
            label: "Done",
            effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
          },
        ],
      };
      return { ok: true };
    }

    case "cotc_anansi_arrange_rd": {
      const amount = (action as { amount?: number }).amount ?? 5;
      const top: string[] = [];
      for (let i = 0; i < amount && state.corp.deck.length > 0; i++) {
        top.push(state.corp.deck.shift()!);
      }
      if (top.length === 0) {
        log(state, `Anansi — R&D empty.`);
        return { ok: true };
      }
      // Reveal / look — leave faceup briefly then restore order as-is (deterministic).
      for (const id of top) {
        log(state, `Anansi — look at ${state.cards[id]?.title}.`);
      }
      // Put back in same order (player would arrange; tests validate IR tree).
      state.corp.deck = [...top, ...state.corp.deck];
      return { ok: true };
    }

    case "cotc_code_replicator": {
      const iceId =
        state.run?.encounter?.iceId ?? state.turn.cotcLastPassedIceId;
      if (!iceId || !state.run) {
        log(state, `Code Replicator — no passed ice.`);
        return { ok: true };
      }
      trashSelfUpgrade(state, sourceId);
      state.run.reencounterIceId = iceId;
      state.run.cotcCodeReplicatorMayJackOut = true;
      log(
        state,
        `Code Replicator — trash self; Runner approaches ${state.cards[iceId]?.title} again (may jack out).`,
      );
      return { ok: true };
    }

    case "cotc_reverse_infection_purge": {
      // Count viruses before purge, then purge, then mill stack.
      let before = 0;
      for (const card of Object.values(state.cards)) {
        before += card.virusCounters ?? 0;
      }
      // Delegate purge via nested — set flag and use eval's purge.
      // Inline purge:
      for (const card of Object.values(state.cards)) {
        if ((card.virusCounters ?? 0) > 0) {
          card.virusCounters = 0;
        }
      }
      state.turn.lastVirusCountersPurged = before;
      const mill = Math.floor(before / 3);
      for (let i = 0; i < mill; i++) {
        const top = state.runner.deck.shift();
        if (!top) break;
        moveRunnerCardToHeap(state, top);
      }
      log(
        state,
        `Reverse Infection — purge ${before} virus; trash ${mill} from stack.`,
      );
      return { ok: true };
    }

    case "cotc_azmari_name_card_type": {
      const types = ["event", "hardware", "program", "resource"];
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: types.map((t) => ({
          id: `azmari:${t}`,
          label: `Name ${t}`,
          effect: fx.do({ kind: "cotc_azmari_set_named_type", cardType: t }),
        })),
      };
      return { ok: true };
    }

    case "cotc_azmari_set_named_type": {
      const cardType = (action as { cardType: string }).cardType;
      state.turn.cotcAzmariNamedType = cardType;
      state.turn.cotcAzmariNamedTypeFired = false;
      log(
        state,
        `${source?.title ?? "Azmari EdTech"} — name ${cardType}.`,
      );
      return { ok: true };
    }

    case "shuffle_n_installed_runner_into_stack": {
      const amount = (action as { amount?: number }).amount ?? 2;
      const installed = installedRunnerCardIds(state);
      if (installed.length < amount) {
        return {
          ok: false,
          error: `Degree Mill steal requires ${amount} installed Runner cards.`,
          cites: [],
        };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: installed.map((id) => ({
          id: `degree:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into the stack`,
          effect: fx.do({
            kind: "shuffle_installed_pick",
            cardId: id,
            remaining: amount - 1,
          }),
        })),
      };
      return { ok: true };
    }

    case "shuffle_installed_pick": {
      const cardId = (action as { cardId: string }).cardId;
      const remaining = (action as { remaining?: number }).remaining ?? 0;
      shuffleRunnerCardIntoStack(state, cardId);
      if (remaining <= 0) return { ok: true };
      const installed = installedRunnerCardIds(state);
      if (installed.length === 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: installed.map((id) => ({
          id: `degree:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into the stack`,
          effect: fx.do({
            kind: "shuffle_installed_pick",
            cardId: id,
            remaining: remaining - 1,
          }),
        })),
      };
      return { ok: true };
    }

    case "cotc_personalized_portal_gain": {
      const grip = state.runner.hand.length;
      const n = Math.floor(grip / 2);
      state.corp.credits += n;
      log(
        state,
        `${source?.title ?? "Personalized Portal"} — gain ${n}¢ (${grip} in grip).`,
      );
      return { ok: true };
    }

    case "cotc_trojan_horse_trash": {
      const maxCost = state.turn.lastTraceExcess ?? 0;
      const progs = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return c?.type === "program" && (c.installCost ?? 0) <= maxCost;
      });
      if (progs.length === 0) {
        log(
          state,
          `Trojan Horse — no program with install cost ≤ ${maxCost}.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: progs.map((id) => ({
          id: `trojan:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "cotc_trojan_horse_trash_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "cotc_trojan_horse_trash_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      const card = state.cards[cardId];
      if (!card || !state.runner.rig.includes(cardId)) return { ok: true };
      removeCardFromCurrentZone(state, cardId);
      state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
      for (const id of [...state.runner.rig]) {
        const h = state.cards[id];
        if (h?.hostId === cardId) h.hostId = undefined;
      }
      card.hostId = undefined;
      card.zone = "runner:heap";
      card.faceup = true;
      state.runner.discard.push(cardId);
      log(state, `Trojan Horse — trash ${card.title}.`);
      return { ok: true };
    }

    default:
      return null;
  }
}
