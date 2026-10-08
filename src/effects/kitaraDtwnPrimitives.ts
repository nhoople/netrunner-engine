/** Down the White Nile (dtwn) Kitara pack primitives — v1.137.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashRunnerInstalled(
  state: EffectCtx["state"],
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card) return;
  removeCardFromCurrentZone(state, cardId);
  state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
  card.zone = "runner:heap";
  card.hostId = undefined;
  card.faceup = true;
  state.runner.discard.push(cardId);
}

function rfgRunnerInstalled(
  state: EffectCtx["state"],
  cardId: string,
): void {
  const card = state.cards[cardId];
  if (!card || !state.runner.rig.includes(cardId)) return;
  state.runner.rig = state.runner.rig.filter((id) => id !== cardId);
  for (const id of [...state.runner.rig]) {
    const c = state.cards[id];
    if (c?.hostId === cardId) c.hostId = undefined;
  }
  card.hostId = undefined;
  card.zone = "removed-from-game";
  card.faceup = true;
  if (!state.removedFromGame) state.removedFromGame = [];
  if (!state.removedFromGame.includes(cardId)) {
    state.removedFromGame.push(cardId);
  }
}

function exposeIceAndMaybeBounce(
  state: EffectCtx["state"],
  _sourceId: string,
  iceId: string,
  namedSubtype: string,
): PrimResult {
  const ice = state.cards[iceId];
  if (!ice) return { ok: true };
  ice.faceup = true;
  log(state, `Wari — expose ${ice.title}.`);
  const subs = (ice.subtypes ?? []).map((s) => s.toLowerCase());
  if (!subs.includes(namedSubtype.toLowerCase())) {
    log(state, `Wari — ${ice.title} is not ${namedSubtype}; leave installed.`);
    return { ok: true };
  }
  // Bounce to HQ
  for (const server of Object.values(state.servers)) {
    server.ice = server.ice.filter((id) => id !== iceId);
  }
  state.corp.hand.push(iceId);
  ice.zone = "corp:hq";
  ice.rezzed = false;
  ice.faceup = false;
  log(state, `Wari — add ${ice.title} to HQ (${namedSubtype}).`);
  return { ok: true };
}

export function applyKitaraDtwnPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "gain_credits_equal_to_last_purged_viruses": {
      const n = state.turn.lastVirusCountersPurged ?? 0;
      state.runner.credits += n;
      log(
        state,
        `${source?.title ?? "Acacia"} — gain ${n}¢ (virus counters purged) → ${state.runner.credits}¢.`,
      );
      return { ok: true };
    }

    case "dtwn_wari": {
      // Trash self first, then name subtype + choose ice to expose.
      trashRunnerInstalled(state, sourceId);
      const subtypes = ["sentry", "code gate", "barrier"];
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: subtypes.map((sub) => ({
          id: `wari-sub:${sub}`,
          label: `Name ${sub}`,
          effect: fx.do({ kind: "dtwn_wari_name_subtype", subtype: sub }),
        })),
      };
      log(state, `Wari — trash self; name sentry, code gate, or barrier.`);
      return { ok: true };
    }

    case "dtwn_wari_name_subtype": {
      const iceIds: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) iceIds.push(id);
      }
      if (iceIds.length === 0) {
        log(state, `Wari — no ice to expose.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: iceIds.map((id) => ({
          id: `wari-ice:${id}`,
          label: `Expose ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "dtwn_wari_expose_resolve",
            iceId: id,
            subtype: action.subtype,
          }),
        })),
      };
      return { ok: true };
    }

    case "dtwn_wari_expose_resolve": {
      return exposeIceAndMaybeBounce(
        state,
        sourceId,
        action.iceId,
        action.subtype,
      );
    }

    case "dtwn_kabonesa_search_install": {
      const matches = state.runner.deck.filter((id) => {
        const c = state.cards[id];
        return (
          c?.type === "program" && !(c.subtypes ?? []).includes("virus")
        );
      });
      if (matches.length === 0) {
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
        log(state, `${source?.title ?? "Kabonesa Wu"} — no non-virus program.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `kabonesa:${id}`,
          label: `Install ${state.cards[id]!.title} (−1¢)`,
          effect: fx.do({
            kind: "dtwn_kabonesa_install_resolve",
            cardId: id,
          }),
        })),
      };
      log(state, `${source?.title ?? "Kabonesa Wu"} — search stack.`);
      return { ok: true };
    }

    case "dtwn_kabonesa_install_resolve": {
      const id = action.cardId;
      if (!state.runner.deck.includes(id)) return { ok: true };
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      const card = state.cards[id]!;
      const printed = card.installCost ?? 0;
      const cost = Math.max(0, printed - 1);
      if (state.runner.credits < cost) {
        // Put back and shuffle — cannot afford.
        state.runner.deck.push(id);
        log(state, `Kabonesa Wu — cannot afford ${card.title}.`);
        return { ok: true };
      }
      state.runner.credits -= cost;
      state.runner.rig.push(id);
      card.zone = "runner:rig";
      card.faceup = true;
      if (!state.turn.dtwnKabonesaTrackedInstallIds) {
        state.turn.dtwnKabonesaTrackedInstallIds = [];
      }
      state.turn.dtwnKabonesaTrackedInstallIds.push(id);
      log(
        state,
        `Kabonesa Wu — install ${card.title} for ${cost}¢ (track RFG at turn end).`,
      );
      return { ok: true };
    }

    case "dtwn_takobi_pump_breaker": {
      const amount = action.amount ?? 3;
      const breakers = state.runner.rig.filter((id) => {
        const c = state.cards[id];
        return (
          c?.breaker &&
          !(c.subtypes ?? []).includes("ai") &&
          id !== sourceId
        );
      });
      // Also allow pumping other breakers; include self if non-AI (Takobi is not a breaker).
      if (breakers.length === 0) {
        log(state, `Takobi — no installed non-AI icebreaker.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: breakers.map((id) => ({
          id: `takobi:${id}`,
          label: `${state.cards[id]!.title} +${amount} strength`,
          effect: fx.do({
            kind: "dtwn_takobi_pump_resolve",
            cardId: id,
            amount,
          }),
        })),
      };
      return { ok: true };
    }

    case "dtwn_takobi_pump_resolve": {
      const card = state.cards[action.cardId];
      if (!card || !state.run) return { ok: true };
      const amount = action.amount ?? 3;
      state.run.encounterStrengthBoosts = state.run.encounterStrengthBoosts ?? {};
      state.run.encounterStrengthBoosts[action.cardId] =
        (state.run.encounterStrengthBoosts[action.cardId] ?? 0) + amount;
      log(
        state,
        `Takobi — ${card.title} +${amount} strength this encounter.`,
      );
      return { ok: true };
    }

    case "break_first_subroutine": {
      const enc = state.run?.encounter;
      if (!enc) {
        log(state, `${source?.title ?? "Kongamato"} — no encounter.`);
        return { ok: true };
      }
      const idx = enc.broken.findIndex((b) => !b);
      if (idx < 0) {
        log(state, `${source?.title ?? "Kongamato"} — no unbroken subroutine.`);
        return { ok: true };
      }
      enc.broken[idx] = true;
      log(
        state,
        `${source?.title ?? "Kongamato"} — break first subroutine (index ${idx}).`,
      );
      return { ok: true };
    }

    case "dtwn_emergent_creativity": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "begin",
            label: "Trash programs/hardware from grip (0 or more), then search",
            effect: fx.do({
              kind: "dtwn_emergent_trash_continue",
              trashedCost: 0,
            }),
          },
        ],
      };
      log(state, `Emergent Creativity — trash from grip then search stack.`);
      return { ok: true };
    }

    case "dtwn_emergent_trash_continue": {
      const candidates = state.runner.hand.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "done-trash",
          label: `Done trashing (X=${action.trashedCost}) — search stack`,
          effect: fx.do({
            kind: "dtwn_emergent_search_install",
            discount: action.trashedCost,
          }),
        },
      ];
      for (const id of candidates) {
        const c = state.cards[id]!;
        const cost = c.installCost ?? 0;
        options.push({
          id: `trash:${id}`,
          label: `Trash ${c.title} (install cost ${cost})`,
          effect: fx.do({
            kind: "dtwn_emergent_trash_one",
            cardId: id,
            trashedCost: action.trashedCost + cost,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "dtwn_emergent_trash_one": {
      const id = action.cardId;
      if (!state.runner.hand.includes(id)) return { ok: true };
      state.runner.hand = state.runner.hand.filter((x) => x !== id);
      const card = state.cards[id]!;
      card.zone = "runner:heap";
      card.faceup = true;
      state.runner.discard.push(id);
      log(state, `Emergent Creativity — trash ${card.title} from grip.`);
      return applyKitaraDtwnPrimitive(ctx, {
        kind: "dtwn_emergent_trash_continue",
        trashedCost: action.trashedCost,
      }) ?? { ok: true };
    }

    case "dtwn_emergent_search_install": {
      const matches = state.runner.deck.filter((id) => {
        const t = state.cards[id]?.type;
        return t === "program" || t === "hardware";
      });
      if (matches.length === 0) {
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = state.runner.deck[i]!;
          state.runner.deck[i] = state.runner.deck[j]!;
          state.runner.deck[j] = tmp;
        }
        log(state, `Emergent Creativity — no program/hardware in stack.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: matches.map((id) => ({
          id: `emergent:${id}`,
          label: `Install ${state.cards[id]!.title} (−${action.discount}¢)`,
          effect: fx.do({
            kind: "dtwn_emergent_install_resolve",
            cardId: id,
            discount: action.discount,
          }),
        })),
      };
      return { ok: true };
    }

    case "dtwn_emergent_install_resolve": {
      const id = action.cardId;
      if (!state.runner.deck.includes(id)) return { ok: true };
      state.runner.deck = state.runner.deck.filter((x) => x !== id);
      for (let i = state.runner.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.runner.deck[i]!;
        state.runner.deck[i] = state.runner.deck[j]!;
        state.runner.deck[j] = tmp;
      }
      const card = state.cards[id]!;
      const cost = Math.max(0, (card.installCost ?? 0) - action.discount);
      if (state.runner.credits < cost) {
        state.runner.deck.push(id);
        log(state, `Emergent Creativity — cannot afford ${card.title}.`);
        return { ok: true };
      }
      state.runner.credits -= cost;
      state.runner.rig.push(id);
      card.zone = "runner:rig";
      card.faceup = true;
      log(
        state,
        `Emergent Creativity — install ${card.title} for ${cost}¢ (−${action.discount}).`,
      );
      return { ok: true };
    }

    case "dtwn_rng_key": {
      // Name a number 0..20 (practical bound).
      const options = Array.from({ length: 21 }, (_, n) => ({
        id: `rng:${n}`,
        label: `Name ${n}`,
        effect: fx.do({ kind: "dtwn_rng_key_set_number", named: n }),
      }));
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(state, `RNG Key — name a number.`);
      return { ok: true };
    }

    case "dtwn_rng_key_set_number": {
      if (!state.run) return { ok: true };
      state.run.dtwnRngKeyNamedNumber = action.named;
      state.run.dtwnRngKeySourceId = sourceId;
      state.run.dtwnRngKeyPendingReveal = true;
      log(state, `RNG Key — named ${action.named}; reveal next access this run.`);
      return { ok: true };
    }

    case "dtwn_rng_key_reward": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "credits",
            label: "Gain 3¢",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 3 }),
          },
          {
            id: "draw",
            label: "Draw 2 cards",
            effect: fx.do({ kind: "draw", side: "runner", amount: 2 }),
          },
        ],
      };
      return { ok: true };
    }

    case "corp_additional_click_next_turn": {
      state.corpAllottedClicksDeltaNextTurn =
        (state.corpAllottedClicksDeltaNextTurn ?? 0) + 1;
      log(
        state,
        `Nightdancer — Corp +1 click next turn (pending ${state.corpAllottedClicksDeltaNextTurn}).`,
      );
      return { ok: true };
    }

    case "dtwn_bacterial_programming": {
      const n = Math.min(7, state.corp.deck.length);
      if (n === 0) {
        log(state, `Bacterial Programming — R&D empty.`);
        return { ok: true };
      }
      const looked = state.corp.deck.slice(0, n);
      state.corp.deck = state.corp.deck.slice(n);
      // Stage looked cards on the source for multi-step choice.
      (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked =
        looked;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "begin",
            label: `Looked at ${n} — choose cards to add to HQ / trash / arrange`,
            effect: fx.do({ kind: "dtwn_bacterial_partition" }),
          },
        ],
      };
      log(state, `Bacterial Programming — look at top ${n} of R&D.`);
      return { ok: true };
    }

    case "dtwn_bacterial_partition": {
      const looked =
        (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked ??
        [];
      if (looked.length === 0) {
        log(state, `Bacterial Programming — nothing left to arrange.`);
        return { ok: true };
      }
      // Simplified: put all back on top in current order (fail-closed usable).
      // Full HQ/trash/arrange UI is multi-step; keep looked on top for now via arrange.
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "keep-order",
          label: "Arrange looked cards back on top of R&D (same order)",
          effect: fx.do({
            kind: "dtwn_bacterial_finish",
            toHq: [],
            toTrash: [],
            arrange: looked,
          }),
        },
      ];
      for (const id of looked) {
        options.push({
          id: `hq:${id}`,
          label: `Add ${state.cards[id]!.title} to HQ`,
          effect: fx.do({
            kind: "dtwn_bacterial_take_hq",
            cardId: id,
          }),
        });
        options.push({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "dtwn_bacterial_trash_one",
            cardId: id,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "dtwn_bacterial_take_hq": {
      const looked =
        (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked ??
        [];
      const id = action.cardId;
      (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked =
        looked.filter((x) => x !== id);
      state.corp.hand.push(id);
      state.cards[id]!.zone = "corp:hq";
      state.cards[id]!.faceup = false;
      log(state, `Bacterial Programming — add ${state.cards[id]!.title} to HQ.`);
      return applyKitaraDtwnPrimitive(ctx, {
        kind: "dtwn_bacterial_partition",
      }) ?? { ok: true };
    }

    case "dtwn_bacterial_trash_one": {
      const looked =
        (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked ??
        [];
      const id = action.cardId;
      (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked =
        looked.filter((x) => x !== id);
      state.corp.discard.push(id);
      state.cards[id]!.zone = "corp:archives";
      state.cards[id]!.faceup = true;
      log(state, `Bacterial Programming — trash ${state.cards[id]!.title}.`);
      return applyKitaraDtwnPrimitive(ctx, {
        kind: "dtwn_bacterial_partition",
      }) ?? { ok: true };
    }

    case "dtwn_bacterial_finish": {
      for (const id of action.toHq) {
        state.corp.hand.push(id);
        state.cards[id]!.zone = "corp:hq";
      }
      for (const id of action.toTrash) {
        state.corp.discard.push(id);
        state.cards[id]!.zone = "corp:archives";
        state.cards[id]!.faceup = true;
      }
      // arrange: bottom-to-top → unshift in reverse so first is top
      for (let i = action.arrange.length - 1; i >= 0; i--) {
        const id = action.arrange[i]!;
        state.corp.deck.unshift(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
      }
      delete (source as { dtwnBacterialLooked?: string[] }).dtwnBacterialLooked;
      log(state, `Bacterial Programming — finish arrange.`);
      return { ok: true };
    }

    case "dtwn_jua_forbid_install_remainder_of_turn": {
      state.turn.dtwnRunnerCannotInstall = true;
      log(state, `Jua — Runner cannot install cards for the remainder of the turn.`);
      return { ok: true };
    }

    case "dtwn_jua_choose_two_bounce_one": {
      const rig = [...state.runner.rig];
      if (rig.length === 0) {
        log(state, `Jua — Runner has no installed cards.`);
        return { ok: true };
      }
      if (rig.length === 1) {
        // Choose the only card; Runner must bounce it.
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: [
            {
              id: `bounce:${rig[0]}`,
              label: `Add ${state.cards[rig[0]!]!.title} to top of stack`,
              effect: fx.do({
                kind: "dtwn_jua_bounce_resolve",
                cardId: rig[0]!,
              }),
            },
          ],
        };
        return { ok: true };
      }
      // Corp chooses 2; then Runner picks which to bounce.
      const pairs: [string, string][] = [];
      for (let i = 0; i < rig.length; i++) {
        for (let j = i + 1; j < rig.length; j++) {
          pairs.push([rig[i]!, rig[j]!]);
        }
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: pairs.map(([a, b]) => ({
          id: `pair:${a}:${b}`,
          label: `Choose ${state.cards[a]!.title} and ${state.cards[b]!.title}`,
          effect: fx.do({
            kind: "dtwn_jua_runner_pick_bounce",
            cardIds: [a, b],
          }),
        })),
      };
      return { ok: true };
    }

    case "dtwn_jua_runner_pick_bounce": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: action.cardIds.map((id) => ({
          id: `bounce:${id}`,
          label: `Add ${state.cards[id]!.title} to top of stack`,
          effect: fx.do({ kind: "dtwn_jua_bounce_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "dtwn_jua_bounce_resolve": {
      const id = action.cardId;
      if (!state.runner.rig.includes(id)) return { ok: true };
      state.runner.rig = state.runner.rig.filter((x) => x !== id);
      for (const hid of [...state.runner.rig]) {
        const c = state.cards[hid];
        if (c?.hostId === id) c.hostId = undefined;
      }
      const card = state.cards[id]!;
      card.hostId = undefined;
      card.zone = "runner:stack";
      card.faceup = false;
      state.runner.deck.unshift(id);
      log(state, `Jua — add ${card.title} to top of the stack.`);
      return { ok: true };
    }

    case "dtwn_threat_assessment": {
      const rig = [...state.runner.rig];
      if (rig.length === 0) {
        log(state, `Threat Assessment — no installed Runner cards.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: rig.map((id) => ({
          id: `threat:${id}`,
          label: `Choose ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "dtwn_threat_assessment_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "dtwn_threat_assessment_resolve": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "tags",
            label: "Take 2 tags",
            effect: fx.do({ kind: "give_tags", amount: 2 }),
          },
          {
            id: "bounce",
            label: `Add ${state.cards[action.cardId]?.title ?? "card"} to top of stack`,
            effect: fx.do({
              kind: "dtwn_jua_bounce_resolve",
              cardId: action.cardId,
            }),
          },
        ],
      };
      return { ok: true };
    }

    case "dtwn_distract_trash_hq_shuffle_archives": {
      // Offer trash 0-2 from HQ, then shuffle 0-2 from Archives.
      const hq = [...state.corp.hand];
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "trash-0",
          label: "Trash 0 from HQ",
          effect: fx.do({
            kind: "dtwn_distract_shuffle_archives",
            remaining: 2,
          }),
        },
      ];
      for (const id of hq) {
        options.push({
          id: `trash1:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "dtwn_distract_trash_hq_one",
            cardId: id,
            remainingAfter: 1,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "dtwn_distract_trash_hq_one": {
      const id = action.cardId;
      if (state.corp.hand.includes(id)) {
        state.corp.hand = state.corp.hand.filter((x) => x !== id);
        state.corp.discard.push(id);
        state.cards[id]!.zone = "corp:archives";
        state.cards[id]!.faceup = true;
        log(state, `Distract the Masses — trash ${state.cards[id]!.title} from HQ.`);
      }
      if (action.remainingAfter > 0) {
        const hq = [...state.corp.hand];
        const options: { id: string; label: string; effect: Effect }[] = [
          {
            id: "done-hq",
            label: "Done trashing from HQ",
            effect: fx.do({
              kind: "dtwn_distract_shuffle_archives",
              remaining: 2,
            }),
          },
        ];
        for (const hid of hq) {
          options.push({
            id: `trash2:${hid}`,
            label: `Trash ${state.cards[hid]!.title}`,
            effect: fx.do({
              kind: "dtwn_distract_trash_hq_one",
              cardId: hid,
              remainingAfter: 0,
            }),
          });
        }
        state.pendingChoice = { sourceId, chooser: "corp", options };
        return { ok: true };
      }
      return applyKitaraDtwnPrimitive(ctx, {
        kind: "dtwn_distract_shuffle_archives",
        remaining: 2,
      }) ?? { ok: true };
    }

    case "dtwn_distract_shuffle_archives": {
      const arch = [...state.corp.discard];
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "shuffle-0",
          label: "Shuffle 0 from Archives into R&D",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (const id of arch) {
        options.push({
          id: `sh1:${id}`,
          label: `Shuffle ${state.cards[id]!.title} into R&D`,
          effect: fx.do({
            kind: "dtwn_distract_shuffle_one",
            cardId: id,
            remainingAfter: action.remaining - 1,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "dtwn_distract_shuffle_one": {
      const id = action.cardId;
      if (state.corp.discard.includes(id)) {
        state.corp.discard = state.corp.discard.filter((x) => x !== id);
        state.corp.deck.push(id);
        state.cards[id]!.zone = "corp:rd";
        state.cards[id]!.faceup = false;
        log(
          state,
          `Distract the Masses — shuffle ${state.cards[id]!.title} into R&D.`,
        );
      }
      // Shuffle deck after adds
      for (let i = state.corp.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = state.corp.deck[i]!;
        state.corp.deck[i] = state.corp.deck[j]!;
        state.corp.deck[j] = tmp;
      }
      if (action.remainingAfter > 0) {
        return applyKitaraDtwnPrimitive(ctx, {
          kind: "dtwn_distract_shuffle_archives",
          remaining: action.remainingAfter,
        }) ?? { ok: true };
      }
      return { ok: true };
    }

    case "dtwn_jinja_install_drawn_ice": {
      const iceId = action.cardId;
      const serverId = action.serverId as ServerId;
      const server = state.servers[serverId];
      const ice = state.cards[iceId];
      if (!server || !ice || !state.corp.hand.includes(iceId)) {
        return { ok: true };
      }
      const printed = ice.rezCost ?? ice.installCost ?? 0;
      // Jinja discounts the install cost by 4 (corp installs ice facedown paying install cost).
      const cost = Math.max(0, printed - (action.discount ?? 4));
      // Installing ice uses install cost equal to rez cost printed on ice in ANR.
      if (state.corp.credits < cost) {
        log(state, `Jinja City Grid — cannot afford to install ${ice.title}.`);
        return { ok: true };
      }
      state.corp.credits -= cost;
      state.corp.hand = state.corp.hand.filter((x) => x !== iceId);
      server.ice.push(iceId);
      ice.zone = `server:${serverId}:ice`;
      ice.rezzed = false;
      ice.faceup = false;
      log(
        state,
        `Jinja City Grid — install ${ice.title} protecting ${serverId} for ${cost}¢.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}

/** Kabonesa Wu: RFG tracked installs still in rig at runner turn end. */
export function rfgKabonesaTrackedAtTurnEnd(state: EffectCtx["state"]): void {
  const ids = state.turn.dtwnKabonesaTrackedInstallIds ?? [];
  for (const id of ids) {
    if (state.runner.rig.includes(id)) {
      rfgRunnerInstalled(state, id);
      log(
        state,
        `Kabonesa Wu — remove ${state.cards[id]?.title ?? id} from the game.`,
      );
    }
  }
  state.turn.dtwnKabonesaTrackedInstallIds = [];
}

