/** Station One (so) Red Sand pack primitives — v1.129.0. */
import { log } from "../state/createGame.js";
import { removeCardFromCurrentZone } from "../state/scoring.js";
import { effectiveRunnerTags } from "../state/tags.js";
import type { RuleCite, ServerId } from "../state/types.js";
import type { EffectCtx } from "./eval.js";
import { evalEffect } from "./eval.js";
import { fx, type Effect, type Primitive } from "./ir.js";

type PrimResult =
  | { ok: true }
  | { ok: false; error: string; cites: RuleCite[] };

function trashToArchives(state: EffectCtx["state"], cardId: string): void {
  removeCardFromCurrentZone(state, cardId);
  const card = state.cards[cardId];
  if (!card) return;
  card.zone = "corp:archives";
  card.faceup = true;
  card.rezzed = false;
  state.corp.discard.push(cardId);
}

function trashToHeap(state: EffectCtx["state"], cardId: string): void {
  removeCardFromCurrentZone(state, cardId);
  const card = state.cards[cardId];
  if (!card) return;
  card.zone = "runner:heap";
  card.hostId = undefined;
  state.runner.discard.push(cardId);
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

function connectionResources(state: EffectCtx["state"]): string[] {
  return state.runner.rig.filter((id) => {
    const c = state.cards[id];
    return (
      c &&
      c.type === "resource" &&
      (c.subtypes ?? []).some((s) => s.toLowerCase() === "connection")
    );
  });
}

export function applyRedsandSoPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "severnius_trash_grip_run_hq_or_rd": {
      const grip = [...state.runner.hand];
      if (grip.length < 2) {
        log(state, `Severnius Stim Implant — need ≥2 cards in grip.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 2; n <= grip.length; n++) {
        options.push({
          id: `trash-n:${n}`,
          label: `Trash ${n} from grip (+${Math.floor(n / 2)} access)`,
          effect: fx.do({
            kind: "severnius_choose_grip_cards",
            remaining: n,
            trashed: 0,
            cardIds: grip,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "severnius_choose_grip_cards": {
      const remaining = action.remaining ?? 0;
      const trashed = action.trashed ?? 0;
      const cardIds = (action.cardIds ?? []).filter((id) =>
        state.runner.hand.includes(id),
      );
      if (remaining <= 0) {
        const bonus = Math.floor(trashed / 2);
        state.pendingChoice = {
          sourceId,
          chooser: "runner",
          options: (["hq", "rd"] as const).map((sid) => ({
            id: `run:${sid}`,
            label: `Run ${sid.toUpperCase()} (+${bonus} access)`,
            effect: fx.do({
              kind: "severnius_start_run",
              serverId: sid,
              bonusAccess: bonus,
            }),
          })),
        };
        return { ok: true };
      }
      if (cardIds.length === 0) {
        log(state, `Severnius — grip empty mid-trash.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: cardIds.map((id) => ({
          id: `trash:${id}`,
          label: `Trash ${state.cards[id]!.title}`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "severnius_trash_one_grip", cardId: id }),
              fx.do({
                kind: "severnius_choose_grip_cards",
                remaining: remaining - 1,
                trashed: trashed + 1,
                cardIds: cardIds.filter((x) => x !== id),
              }),
            ],
          },
        })),
      };
      return { ok: true };
    }

    case "severnius_trash_one_grip": {
      const cardId = action.cardId;
      if (!cardId || !state.runner.hand.includes(cardId)) {
        return { ok: true };
      }
      trashToHeap(state, cardId);
      log(state, `Severnius — trash ${state.cards[cardId]?.title ?? cardId}.`);
      return { ok: true };
    }

    case "severnius_start_run": {
      const serverId = action.serverId as ServerId;
      const bonusAccess = action.bonusAccess ?? 0;
      state.pendingStartRun = {
        sourceId,
        serverId,
        bonusAccess,
      };
      log(
        state,
        `Severnius — pending run on ${serverId} (+${bonusAccess} access).`,
      );
      return { ok: true };
    }

    case "trash_random_hq_per_power_on_self": {
      const n = source?.powerCounters ?? 0;
      if (n <= 0 || state.corp.hand.length === 0) {
        log(state, `Clan Vengeance — no power / empty HQ.`);
        return { ok: true };
      }
      let trashed = 0;
      for (let i = 0; i < n && state.corp.hand.length > 0; i++) {
        const idx = Math.floor(Math.random() * state.corp.hand.length);
        const id = state.corp.hand[idx]!;
        trashToArchives(state, id);
        trashed += 1;
      }
      log(state, `Clan Vengeance — trash ${trashed} from HQ at random.`);
      return { ok: true };
    }

    case "counter_surveillance_run": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: (Object.keys(state.servers) as ServerId[]).map((sid) => ({
          id: `run:${sid}`,
          label: `Run ${sid}`,
          effect: fx.do({
            kind: "counter_surveillance_start_run",
            serverId: sid,
          }),
        })),
      };
      return { ok: true };
    }

    case "counter_surveillance_start_run": {
      const serverId = action.serverId as ServerId;
      state.pendingStartRun = {
        sourceId,
        serverId,
        skipBreach: true,
        onSuccessfulRunEffect: fx.do({
          kind: "counter_surveillance_on_success",
        }),
      };
      log(state, `Counter Surveillance — pending run on ${serverId}.`);
      return { ok: true };
    }

    case "counter_surveillance_on_success": {
      const tags = effectiveRunnerTags(state);
      if (tags <= 0) {
        log(
          state,
          `Counter Surveillance — no tags; cannot pay; no access.`,
        );
        return { ok: true };
      }
      if (state.runner.credits < tags) {
        log(
          state,
          `Counter Surveillance — cannot pay ${tags}¢ (have ${state.runner.credits}); no access.`,
        );
        return { ok: true };
      }
      state.runner.credits -= tags;
      log(state, `Counter Surveillance — pay ${tags}¢ (tags).`);
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (let n = 0; n <= tags; n++) {
        options.push({
          id: `access:${n}`,
          label: n === 0 ? "Access 0 cards" : `Access ${n} card(s)`,
          effect: fx.do({
            kind: "access_n",
            amount: n,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "access_n": {
      const amount = action.amount ?? 0;
      if (amount <= 0 || !state.run) {
        log(state, `Counter Surveillance — access 0.`);
        return { ok: true };
      }
      state.run.bonusAccess = Math.max(0, amount - 1);
      state.run.skipBreach = false;
      log(
        state,
        `Counter Surveillance — access ${amount} in/at attacked server.`,
      );
      // Re-arm breach via clearing skipBreach; host will breach normally with bonus.
      // For exact X access, set bonus so HQ/RD base+bonus ≈ amount.
      if (state.run.attackedServerId === "archives") {
        state.run.bonusAccess = amount;
      } else {
        // HQ/RD base access is 1; bonusAccess adds (amount - 1).
        state.run.bonusAccess = Math.max(0, amount - 1);
      }
      state.pendingStandaloneBreach = {
        sourceId,
        serverId: state.run.attackedServerId,
      };
      return { ok: true };
    }

    case "mobius_on_run_end": {
      if (!state.run?.successful) {
        if (state.turn.mobiusSecondRun) {
          state.turn.mobiusSecondRun = false;
        }
        return { ok: true };
      }
      if (state.turn.mobiusSecondRun) {
        state.turn.mobiusSecondRun = false;
        state.runner.credits += 4;
        log(state, `Möbius — second run successful; gain 4¢.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "run-rd",
            label: "Run R&D again",
            effect: fx.do({ kind: "mobius_queue_second_rd_run" }),
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

    case "mobius_queue_second_rd_run": {
      state.turn.mobiusSecondRun = true;
      state.pendingStartRun = {
        sourceId,
        serverId: "rd",
        onRunEndEffect: fx.do({ kind: "mobius_on_run_end" }),
      };
      log(state, `Möbius — pending second R&D run.`);
      return { ok: true };
    }

    case "reveal_host_programs": {
      const top: string[] = [];
      for (let i = 0; i < 5 && state.runner.deck.length > 0; i++) {
        top.push(state.runner.deck.shift()!);
      }
      for (const id of top) {
        log(state, `Customized Secretary — reveal ${state.cards[id]?.title}.`);
      }
      const programs = top.filter((id) => state.cards[id]?.type === "program");
      const rest = top.filter((id) => !programs.includes(id));
      // Return non-programs to stack temporarily; host choice for programs.
      for (const id of rest) {
        state.runner.deck.unshift(id);
      }
      if (programs.length === 0) {
        // shuffle remaining
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.runner.deck[i], state.runner.deck[j]] = [
            state.runner.deck[j]!,
            state.runner.deck[i]!,
          ];
        }
        log(state, `Customized Secretary — no programs; shuffle stack.`);
        return { ok: true };
      }
      return evalEffect(
        ctx,
        fx.do({
          kind: "host_continue",
          cardIds: programs,
        }),
      );
    }

    case "host_continue": {
      const cardIds = (action.cardIds ?? []).filter((id) => state.cards[id]);
      if (cardIds.length === 0) {
        for (let i = state.runner.deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.runner.deck[i], state.runner.deck[j]] = [
            state.runner.deck[j]!,
            state.runner.deck[i]!,
          ];
        }
        log(state, `Customized Secretary — shuffle stack.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] =
        cardIds.map((id) => ({
          id: `host:${id}`,
          label: `Host ${state.cards[id]!.title}`,
          effect: {
            op: "seq",
            effects: [
              fx.do({ kind: "host_one", cardId: id }),
              fx.do({
                kind: "host_continue",
                cardIds: cardIds.filter((x) => x !== id),
              }),
            ],
          },
        }));
      options.push({
        id: "done",
        label: "Done hosting",
        effect: fx.do({
          kind: "host_continue",
          cardIds: [],
          returnRest: cardIds,
        }),
      });
      // When declining further hosts, return remaining to stack then shuffle.
      const doneOpt = options[options.length - 1]!;
      doneOpt.effect = {
        op: "seq",
        effects: [
          fx.do({
            kind: "return_to_stack",
            cardIds,
          }),
          fx.do({
            kind: "host_continue",
            cardIds: [],
          }),
        ],
      };
      state.pendingChoice = { sourceId, chooser: "runner", options };
      return { ok: true };
    }

    case "host_one": {
      const cardId = action.cardId;
      if (!cardId || !source) return { ok: true };
      const card = state.cards[cardId];
      if (!card) return { ok: true };
      // Remove from deck if still there
      state.runner.deck = state.runner.deck.filter((id) => id !== cardId);
      card.hostId = sourceId;
      card.faceup = true;
      card.zone = `hosted:${sourceId}`;
      if (!source.hostedCardIds) source.hostedCardIds = [];
      source.hostedCardIds.push(cardId);
      log(state, `Customized Secretary hosts ${card.title}.`);
      return { ok: true };
    }

    case "return_to_stack": {
      for (const id of action.cardIds ?? []) {
        const card = state.cards[id];
        if (!card) continue;
        card.zone = "runner:stack";
        card.hostId = undefined;
        state.runner.deck.push(id);
      }
      return { ok: true };
    }

    case "customized_secretary_install_hosted_program": {
      const hosted = (source?.hostedCardIds ?? []).filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (hosted.length === 0) {
        log(state, `Customized Secretary — no hosted program.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: hosted.map((cardId) => ({
          id: `install:${cardId}`,
          label: `Install ${state.cards[cardId]!.title}`,
          effect: fx.do({ kind: "install_hosted_program", cardId }),
        })),
      };
      return { ok: true };
    }

    case "may_install_ice_from_hq_inward_of_source_ignore_costs": {
      if (!state.run || source?.type !== "ice") {
        log(state, `Bloom inward — not during ice encounter.`);
        return { ok: true };
      }
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceInHq.length === 0) {
        log(state, `Bloom inward — no ice in HQ.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [
        {
          id: "decline",
          label: "Decline",
          effect: fx.do({ kind: "gain_credits", side: "corp", amount: 0 }),
        },
      ];
      for (const iceId of iceInHq) {
        options.push({
          id: `inward:${iceId}`,
          label: `Install ${state.cards[iceId]!.title} inward`,
          effect: fx.do({
            kind: "install_ice_inward",
            cardId: iceId,
          }),
        });
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "install_ice_inward": {
      if (!state.run || source?.type !== "ice") return { ok: true };
      const iceId = action.cardId;
      if (!iceId || !state.corp.hand.includes(iceId)) return { ok: true };
      const serverId = state.run.attackedServerId;
      const server = state.servers[serverId];
      const pos = server.ice.indexOf(sourceId);
      if (pos < 0) {
        log(state, `Bloom — source not on attacked server.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== iceId);
      const card = state.cards[iceId]!;
      server.ice.splice(pos + 1, 0, iceId);
      card.zone = `server:${serverId}:ice`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementTokens = card.advancementTokens ?? 0;
      log(
        state,
        `Bloom — install ${card.title} inward of ${source.title} (ignore costs).`,
      );
      return { ok: true };
    }

    case "add_installed_to_hq": {
      const installed = installedCorpCards(state);
      if (installed.length === 0) {
        log(state, `Replanting — no installed card.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: installed.map((id) => ({
          id: `hq:${id}`,
          label: `Add ${state.cards[id]!.title} to HQ`,
          effect: fx.do({ kind: "move_to_hq", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "move_to_hq": {
      const cardId = action.cardId;
      if (!cardId || !state.cards[cardId]) return { ok: true };
      removeCardFromCurrentZone(state, cardId);
      const card = state.cards[cardId]!;
      card.zone = "corp:hq";
      card.rezzed = false;
      card.faceup = false;
      card.hostId = undefined;
      card.advancementTokens = 0;
      state.corp.hand.push(cardId);
      log(state, `Replanting — add ${card.title} to HQ.`);
      return { ok: true };
    }

    case "install_2_from_hq_ignore_costs": {
      return evalEffect(
        ctx,
        fx.do({ kind: "install_from_hq_continue", remaining: 2 }),
      );
    }

    case "install_from_hq_continue": {
      const remaining = action.remaining ?? 0;
      if (remaining <= 0) return { ok: true };
      const hq = [...state.corp.hand];
      if (hq.length === 0) {
        log(state, `Replanting — HQ empty.`);
        return { ok: true };
      }
      const options: { id: string; label: string; effect: Effect }[] = [];
      for (const cardId of hq) {
        const card = state.cards[cardId]!;
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            options.push({
              id: `ice:${cardId}:${server.id}`,
              label: `Install ${card.title} protecting ${server.id}`,
              effect: {
                op: "seq",
                effects: [
                  fx.do({
                    kind: "install_hq_ice_protecting_server_ignore_costs",
                    cardId,
                    serverId: server.id,
                  }),
                  fx.do({
                    kind: "install_from_hq_continue",
                    remaining: remaining - 1,
                  }),
                ],
              },
            });
          }
        } else if (
          card.type === "asset" ||
          card.type === "agenda" ||
          card.type === "upgrade"
        ) {
          options.push({
            id: `root:${cardId}`,
            label: `Install ${card.title} in a new remote`,
            effect: {
              op: "seq",
              effects: [
                fx.do({
                  kind: "install_root_ignore_costs",
                  cardId,
                }),
                fx.do({
                  kind: "install_from_hq_continue",
                  remaining: remaining - 1,
                }),
              ],
            },
          });
        } else {
          // operations etc — skip installables only
        }
      }
      if (options.length === 0) {
        log(state, `Replanting — no installable cards in HQ.`);
        return { ok: true };
      }
      state.pendingChoice = { sourceId, chooser: "corp", options };
      return { ok: true };
    }

    case "install_root_ignore_costs": {
      const cardId = action.cardId;
      if (!cardId || !state.corp.hand.includes(cardId)) return { ok: true };
      const card = state.cards[cardId]!;
      state.corp.hand = state.corp.hand.filter((id) => id !== cardId);
      let n = 1;
      while (state.servers[`remote${n}` as ServerId]) n += 1;
      const serverId = `remote${n}` as ServerId;
      state.servers[serverId] = {
        id: serverId,
        kind: "remote",
        root: [cardId],
        ice: [],
      };
      card.zone = `server:${serverId}:root`;
      card.rezzed = false;
      card.faceup = false;
      card.advancementTokens = card.advancementTokens ?? 0;
      log(
        state,
        `Replanting — install ${card.title} in ${serverId} (ignore costs).`,
      );
      return { ok: true };
    }

    case "host_on_connection": {
      const hosts = connectionResources(state);
      if (hosts.length === 0) {
        log(state, `MCA Informant — no installed connection resource.`);
        // Operation already played; linger in play-area as condition without host?
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: hosts.map((id) => ({
          id: `host:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: fx.do({
            kind: "host_resolve",
            cardId: id,
          }),
        })),
      };
      return { ok: true };
    }

    case "host_resolve": {
      const hostId = action.cardId;
      if (!hostId || !source) return { ok: true };
      const host = state.cards[hostId];
      if (!host) return { ok: true };
      // Remove MCA from play-area / wherever
      removeCardFromCurrentZone(state, sourceId);
      source.hostId = hostId;
      source.zone = `hosted:${hostId}`;
      source.faceup = true;
      source.mcaInformantCondition = true;
      source.additionalTagsWhileHosted = 1;
      if (!host.hostedCardIds) host.hostedCardIds = [];
      host.hostedCardIds.push(sourceId);
      host.mcaInformantHosted = true;
      // Host gains [click], 2¢: trash this resource.
      if (!host.paidAbilities) host.paidAbilities = [];
      host.paidAbilities.push({
        id: "mca-informant-host-trash",
        label: "[click], 2¢: Trash this resource",
        clickCost: 1,
        creditCost: 2,
        cost: { clicks: 1, credits: 2, trashSelf: true },
        windows: ["runner_action_paw"],
        effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
        usableByRunnerOnSelfIce: true,
      });
      log(
        state,
        `MCA Informant — host on ${host.title} as condition (+1 tag; host trash ability).`,
      );
      return { ok: true };
    }

    case "pay_or_trash_top_stack": {
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (state.runner.credits >= 1) {
        options.push({
          id: "pay",
          label: "Pay 1¢",
          effect: fx.do({ kind: "lose_credits", side: "runner", amount: 1 }),
        });
      }
      options.push({
        id: "trash-top",
        label: "Trash the top card of the stack",
        effect: fx.do({ kind: "trash_top_of_stack" }),
      });
      state.pendingChoice = { sourceId, chooser: "runner", options };
      log(state, `Clyde Van Rite — Runner must pay 1¢ or trash top of stack.`);
      return { ok: true };
    }

    case "remove_bp_equal_forfeited_ap_gain_credits": {
      const x = Math.min(
        state.lastForfeitedAgendaPoints ?? 0,
        state.corp.badPublicity ?? 0,
      );
      if (x > 0) {
        state.corp.badPublicity = (state.corp.badPublicity ?? 0) - x;
        state.corp.credits += x;
        log(
          state,
          `Sacrifice — remove ${x} bad publicity; gain ${x}¢.`,
        );
      } else {
        log(state, `Sacrifice — no bad publicity to remove.`);
      }
      return { ok: true };
    }

    default:
      return null;
  }
}
