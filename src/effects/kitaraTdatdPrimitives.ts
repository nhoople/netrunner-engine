/** The Devil and the Dragon (tdatd) Kitara pack primitives — v1.139.0. */
import { log } from "../state/createGame.js";
import { beginExpose } from "../state/expose.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { GameState, RuleCite } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect } from "./eval.js";
import { fx, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function shuffleDeck(deck: string[]): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
}

function installedVirusProgramIds(state: EffectCtx["state"]): string[] {
  return state.runner.rig.filter((id) => {
    const c = state.cards[id];
    return c?.type === "program" && (c.subtypes ?? []).includes("virus");
  });
}

function installedNonVirtualResourceIds(state: EffectCtx["state"]): string[] {
  return state.runner.rig.filter((id) => {
    const c = state.cards[id];
    return (
      c?.type === "resource" &&
      !(c.subtypes ?? []).includes("virtual") &&
      !c.hostId
    );
  });
}

function installedRunnerCardIds(state: EffectCtx["state"]): string[] {
  return state.runner.rig.filter((id) => !state.cards[id]?.hostId);
}

function iceWithNoAdvancement(state: EffectCtx["state"]): string[] {
  const out: string[] = [];
  for (const server of Object.values(state.servers)) {
    for (const id of server.ice) {
      const c = state.cards[id];
      if (!c) continue;
      if ((c.advancementTokens ?? 0) === 0) out.push(id);
    }
  }
  return out;
}

function faceupAgendaPoints(state: EffectCtx["state"]): number {
  let n = 0;
  for (const id of state.corp.score) {
    const c = state.cards[id];
    if (!c) continue;
    n += c.agendaPoints ?? 0;
  }
  return n;
}

function lastAgendaAdvancementRequirement(state: EffectCtx["state"]): number {
  const id = state.turn.lastScoredOrStolenAgendaId;
  if (id) {
    const c = state.cards[id];
    if (c?.advancementRequirement != null) return c.advancementRequirement;
  }
  return 0;
}

export function applyKitaraTdatdPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "tdatd_glut_cipher": {
      const archives = state.corp.discard;
      if (archives.length < 5) {
        log(
          state,
          `Glut Cipher — Archives has ${archives.length} cards (need 5); no effect.`,
        );
        return { ok: true };
      }
      // Add exactly 5 from Archives to HQ (deterministic: oldest first).
      const moved: string[] = [];
      for (let i = 0; i < 5; i++) {
        const id = archives.shift()!;
        moved.push(id);
        const c = state.cards[id]!;
        c.zone = "corp:hq";
        c.faceup = false;
        c.rezzed = false;
        state.corp.hand.push(id);
      }
      log(
        state,
        `Glut Cipher — Corp adds 5 from Archives to HQ (${moved.map((id) => state.cards[id]?.title).join(", ")}).`,
      );
      // Trash 5 at random from HQ.
      const hq = [...state.corp.hand];
      for (let i = hq.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = hq[i]!;
        hq[i] = hq[j]!;
        hq[j] = tmp;
      }
      const trash = hq.slice(0, 5);
      for (const id of trash) {
        const idx = state.corp.hand.indexOf(id);
        if (idx >= 0) state.corp.hand.splice(idx, 1);
        const c = state.cards[id]!;
        c.zone = "corp:archives";
        c.faceup = true;
        c.rezzed = false;
        state.corp.discard.push(id);
        log(state, `Glut Cipher — trash ${c.title} from HQ at random.`);
      }
      return { ok: true };
    }

    case "tdatd_knobkierie_place_virus": {
      const viruses = installedVirusProgramIds(state);
      if (viruses.length === 0) {
        log(state, `Knobkierie — no installed virus program.`);
        return { ok: true };
      }
      if (viruses.length === 1) {
        const c = state.cards[viruses[0]!]!;
        c.virusCounters = (c.virusCounters ?? 0) + 1;
        log(
          state,
          `Knobkierie — place 1 virus on ${c.title} → ${c.virusCounters}.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: viruses.map((id) => ({
          id: `knob:${id}`,
          label: `Place 1 virus on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "tdatd_knobkierie_place_virus_resolve",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "tdatd_knobkierie_place_virus_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      const c = state.cards[cardId];
      if (!c) return { ok: true };
      c.virusCounters = (c.virusCounters ?? 0) + 1;
      log(
        state,
        `Knobkierie — place 1 virus on ${c.title} → ${c.virusCounters}.`,
      );
      return { ok: true };
    }

    case "tdatd_419_expose_or_pay": {
      const cardId = (action as { cardId: string }).cardId;
      const cost =
        (action as { credits?: number }).credits ??
        state.cards[state.runner.identityId]
          ?.mayExposeFirstCorpInstallEachTurnUnlessCorpPays ??
        1;
      const target = state.cards[cardId];
      if (!target) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "pay",
            label: `Pay ${cost}¢ to prevent expose`,
            effect: fx.do({
              kind: "tdatd_419_pay",
              credits: cost,
            }),
          },
          {
            id: "expose",
            label: `Allow expose of ${target.title}`,
            effect: fx.do({
              kind: "tdatd_419_expose",
              cardId,
            }),
          },
        ],
      };
      return { ok: true };
    }

    case "tdatd_419_pay": {
      const credits = (action as { credits?: number }).credits ?? 1;
      if (state.corp.credits < credits) {
        return {
          ok: false,
          error: `Corp cannot pay ${credits}¢.`,
          cites: [],
        };
      }
      state.corp.credits -= credits;
      log(
        state,
        `419 — Corp pays ${credits}¢ to prevent expose → ${state.corp.credits}¢.`,
      );
      return { ok: true };
    }

    case "tdatd_419_expose": {
      const cardId = (action as { cardId: string }).cardId;
      beginExpose(state, cardId);
      log(state, `419 — expose ${state.cards[cardId]?.title}.`);
      return { ok: true };
    }

    case "tdatd_falsified_credentials": {
      const types = ["agenda", "asset", "ice", "upgrade"];
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: types.map((t) => ({
          id: `falsified:${t}`,
          label: `Name ${t}`,
          effect: fx.do({
            kind: "tdatd_falsified_set_type",
            cardType: t,
          }),
        })),
      };
      return { ok: true };
    }

    case "tdatd_falsified_set_type": {
      const cardType = (action as { cardType: string }).cardType;
      state.turn.tdatdFalsifiedNamedType = cardType;
      // Expose a card in a remote server.
      const remotes: string[] = [];
      for (const server of Object.values(state.servers)) {
        if (server.kind !== "remote") continue;
        for (const id of [...server.root, ...server.ice]) {
          const c = state.cards[id];
          if (c && !c.rezzed && !c.faceup) remotes.push(id);
          else if (c && !c.rezzed) remotes.push(id);
        }
      }
      // Also allow faceup/rezzed? Expose typically targets unrezzed. Prefer unrezzed.
      const targets =
        remotes.length > 0
          ? remotes
          : Object.values(state.servers)
              .filter((s) => s.kind === "remote")
              .flatMap((s) => [...s.root, ...s.ice]);
      if (targets.length === 0) {
        log(state, `Falsified Credentials — no remote card to expose.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `falsified-expose:${id}`,
          label: `Expose ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "tdatd_falsified_expose",
            cardId: id,
            cardType,
          }),
        })),
      };
      return { ok: true };
    }

    case "tdatd_falsified_expose": {
      const cardId = (action as { cardId: string }).cardId;
      const cardType = (action as { cardType: string }).cardType;
      beginExpose(state, cardId);
      const c = state.cards[cardId];
      if (c?.type === cardType) {
        state.runner.credits += 5;
        log(
          state,
          `Falsified Credentials — expose ${c.title} (${cardType}); gain 5¢ → ${state.runner.credits}¢.`,
        );
      } else {
        log(
          state,
          `Falsified Credentials — expose ${c?.title}; not ${cardType}.`,
        );
      }
      return { ok: true };
    }

    case "tdatd_because_i_can_shuffle_root": {
      const serverId = state.run?.attackedServerId;
      if (!serverId) {
        log(state, `Because I Can — no attacked server.`);
        return { ok: true };
      }
      const server = state.servers[serverId];
      if (!server) return { ok: true };
      const root = [...server.root];
      for (const id of root) {
        server.root = server.root.filter((x) => x !== id);
        const c = state.cards[id]!;
        c.zone = "corp:rd";
        c.faceup = false;
        c.rezzed = false;
        c.advancementTokens = 0;
        state.corp.deck.push(id);
      }
      shuffleDeck(state.corp.deck);
      log(
        state,
        `Because I Can — shuffle ${root.length} card(s) from ${serverId} root into R&D.`,
      );
      return { ok: true };
    }

    case "tdatd_malia_choose_resource": {
      const targets = installedNonVirtualResourceIds(state);
      if (targets.length === 0) {
        log(state, `Malia Z0L0K4 — no installed non-virtual resource.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `malia:${id}`,
          label: `Blank ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "tdatd_malia_blank", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "tdatd_malia_blank": {
      const cardId = (action as { cardId: string }).cardId;
      const target = state.cards[cardId];
      if (!target) return { ok: true };
      if (source) source.tdatdMaliaBlankTargetId = cardId;
      log(
        state,
        `Malia Z0L0K4 — ${target.title} loses printed abilities.`,
      );
      return { ok: true };
    }

    case "tdatd_tempus_resolve": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "lose-clicks",
            label: "Lose [click][click]",
            effect: fx.do({ kind: "tdatd_tempus_lose_clicks" }),
          },
          {
            id: "core",
            label: "Suffer 1 core damage",
            effect: fx.do({ kind: "core_damage", amount: 1 }),
          },
        ],
      };
      return { ok: true };
    }

    case "tdatd_tempus_lose_clicks": {
      const lose = Math.min(2, state.runner.clicks);
      state.runner.clicks -= lose;
      log(state, `Tempus — Runner loses ${lose} click(s) → ${state.runner.clicks}.`);
      return { ok: true };
    }

    case "tdatd_sadaka_look_top_3": {
      const top: string[] = [];
      for (let i = 0; i < 3 && state.corp.deck.length > 0; i++) {
        top.push(state.corp.deck.shift()!);
      }
      if (top.length === 0) {
        log(state, `Sadaka — R&D empty.`);
        return { ok: true };
      }
      for (const id of top) {
        log(state, `Sadaka — look at ${state.cards[id]?.title}.`);
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: "arrange",
            label: "Arrange them in any order",
            effect: fx.do({
              kind: "tdatd_sadaka_arrange",
              cardIds: top,
            }),
          },
          {
            id: "shuffle",
            label: "Shuffle R&D",
            effect: fx.do({
              kind: "tdatd_sadaka_shuffle",
              cardIds: top,
            }),
          },
        ],
      };
      return { ok: true };
    }

    case "tdatd_sadaka_arrange": {
      const cardIds = (action as { cardIds: string[] }).cardIds;
      // Deterministic: put back in looked order.
      state.corp.deck = [...cardIds, ...state.corp.deck];
      log(state, `Sadaka — arrange top of R&D.`);
      return { ok: true };
    }

    case "tdatd_sadaka_shuffle": {
      const cardIds = (action as { cardIds: string[] }).cardIds;
      state.corp.deck = [...cardIds, ...state.corp.deck];
      shuffleDeck(state.corp.deck);
      log(state, `Sadaka — shuffle R&D.`);
      return { ok: true };
    }

    case "tdatd_sadaka_trash_hq_then_resource": {
      if (state.corp.hand.length === 0) {
        log(state, `Sadaka — HQ empty.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: state.corp.hand.map((id) => ({
          id: `sadaka-hq:${id}`,
          label: `Trash ${state.cards[id]!.title} from HQ`,
          effect: fx.do({
            kind: "tdatd_sadaka_trash_hq_resolve",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "tdatd_sadaka_trash_hq_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      const idx = state.corp.hand.indexOf(cardId);
      if (idx < 0) return { ok: true };
      state.corp.hand.splice(idx, 1);
      const c = state.cards[cardId]!;
      c.zone = "corp:archives";
      c.faceup = true;
      state.corp.discard.push(cardId);
      log(state, `Sadaka — trash ${c.title} from HQ.`);
      const resources = state.runner.rig.filter(
        (id) => state.cards[id]?.type === "resource",
      );
      if (resources.length === 0) {
        log(state, `Sadaka — no resource to trash.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: resources.map((id) => ({
          id: `sadaka-res:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "tdatd_sadaka_trash_resource",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "tdatd_sadaka_trash_resource": {
      const cardId = (action as { cardId: string }).cardId;
      if (!state.runner.rig.includes(cardId)) return { ok: true };
      moveRunnerCardToHeap(state, cardId);
      log(state, `Sadaka — trash resource ${state.cards[cardId]?.title}.`);
      return { ok: true };
    }

    case "tdatd_amani_trace": {
      const x = lastAgendaAdvancementRequirement(state);
      log(state, `Amani Senai — Trace[${x}].`);
      return evalEffect(ctx, {
        op: "do",
        action: {
          kind: "trace",
          strength: x,
          onSuccess: fx.do({ kind: "tdatd_amani_bounce" }),
        },
      });
    }

    case "tdatd_amani_bounce": {
      const installed = installedRunnerCardIds(state);
      if (installed.length === 0) {
        log(state, `Amani Senai — no installed Runner card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `amani:${id}`,
          label: `Add ${state.cards[id]!.title} to grip`,
          effect: fx.do({
            kind: "add_installed_runner_card_to_grip",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "tdatd_sso_advance_ice": {
      const targets = iceWithNoAdvancement(state);
      const ap = faceupAgendaPoints(state);
      if (targets.length === 0 || ap <= 0) {
        log(
          state,
          `SSO Industries — no eligible ice or no faceup agenda points.`,
        );
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `sso:${id}`,
          label: `Place ${ap} advancement on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "tdatd_sso_advance_resolve",
            cardId: id,
            amount: ap,
          }),
        })),
      };
      return { ok: true };
    }

    case "tdatd_sso_advance_resolve": {
      const cardId = (action as { cardId: string }).cardId;
      const amount = (action as { amount?: number }).amount ?? 0;
      const c = state.cards[cardId];
      if (!c) return { ok: true };
      c.advancementTokens = (c.advancementTokens ?? 0) + amount;
      log(
        state,
        `SSO Industries — place ${amount} advancement on ${c.title} → ${c.advancementTokens}.`,
      );
      return { ok: true };
    }

    case "tdatd_city_works_meat": {
      const adv = source?.advancementTokens ?? 0;
      const amount = 2 + adv;
      return evalEffect(ctx, {
        op: "do",
        action: { kind: "meat_damage", amount },
      });
    }

    case "tdatd_oduduwa_encounter": {
      if (source) {
        source.advancementTokens = (source.advancementTokens ?? 0) + 1;
        log(
          state,
          `Oduduwa — place 1 advancement → ${source.advancementTokens}.`,
        );
      }
      const x = source?.advancementTokens ?? 0;
      const others: string[] = [];
      for (const server of Object.values(state.servers)) {
        for (const id of server.ice) {
          if (id === sourceId) continue;
          others.push(id);
        }
      }
      if (others.length === 0 || x <= 0) return { ok: true };
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          ...others.map((id) => ({
            id: `oduduwa:${id}`,
            label: `Place ${x} advancement on ${state.cards[id]!.title}`,
            effect: fx.do({
              kind: "tdatd_oduduwa_place",
              cardId: id,
              amount: x,
            }),
          })),
          {
            id: "decline",
            label: "Decline",
            effect: fx.do({
              kind: "gain_credits",
              side: "corp",
              amount: 0,
            }),
          },
        ],
      };
      return { ok: true };
    }

    case "tdatd_oduduwa_place": {
      const cardId = (action as { cardId: string }).cardId;
      const amount = (action as { amount?: number }).amount ?? 0;
      const c = state.cards[cardId];
      if (!c) return { ok: true };
      c.advancementTokens = (c.advancementTokens ?? 0) + amount;
      log(
        state,
        `Oduduwa — place ${amount} advancement on ${c.title} → ${c.advancementTokens}.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}

/** Fire Kill Switch-class onAgendaAccessedOrScored from active currents / play area. */
export function fireTdatdOnAgendaAccessedOrScored(state: GameState): void {
  for (const card of Object.values(state.cards)) {
    if (!card?.onAgendaAccessedOrScored) continue;
    const inPlay =
      card.zone === "corp:play-area" ||
      card.zone === "runner:play-area" ||
      (card.rezzed &&
        Object.values(state.servers).some(
          (s) => s.root.includes(card.id) || s.ice.includes(card.id),
        ));
    if (!inPlay) continue;
    const r = evalEffect(
      { state, sourceId: card.id },
      card.onAgendaAccessedOrScored,
    );
    if (!r.ok) {
      log(
        state,
        `onAgendaAccessedOrScored failed on ${card.title}: ${r.error}`,
      );
    }
    if (state.pendingChoice || state.trace) return;
  }
}

/** 419: first Corp install each turn — Runner may expose unless Corp pays. */
export function fireTdatd419OnFirstCorpInstall(
  state: GameState,
  installedId: string,
): void {
  if (state.turn.tdatd419FiredThisTurn) return;
  const idCard = state.cards[state.runner.identityId];
  const cost = idCard?.mayExposeFirstCorpInstallEachTurnUnlessCorpPays;
  if (!cost || !idCard) return;
  const installed = state.cards[installedId];
  if (!installed || installed.side !== "corp") return;
  state.turn.tdatd419FiredThisTurn = true;
  state.pendingChoice = {
    sourceId: idCard.id,
    chooser: "runner",
    options: [
      {
        id: "accept",
        label: `Expose ${installed.title} unless Corp pays ${cost}¢`,
        effect: fx.do({
          kind: "tdatd_419_expose_or_pay",
          cardId: installedId,
          credits: cost,
        }),
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
    `419 — first Corp install (${installed.title}); Runner may expose unless Corp pays ${cost}¢.`,
  );
}
