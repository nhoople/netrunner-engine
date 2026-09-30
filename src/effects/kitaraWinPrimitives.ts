/** Whispers in Nalubaale (win) Kitara pack primitives — v1.140.0. */
import { log } from "../state/createGame.js";
import { moveRunnerCardToHeap } from "../state/trashHooks.js";
import type { RuleCite } from "../state/types.js";
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

function installedRunnerCardsWithNoVirus(state: EffectCtx["state"]): string[] {
  return state.runner.rig.filter((id) => {
    const c = state.cards[id];
    if (!c || c.hostId) return false;
    return (c.virusCounters ?? 0) === 0;
  });
}

function installedNonAiIcebreakers(state: EffectCtx["state"]): string[] {
  return state.runner.rig.filter((id) => {
    const c = state.cards[id];
    if (!c || c.type !== "program") return false;
    if ((c.subtypes ?? []).includes("ai")) return false;
    return Boolean(c.breaker) || (c.subtypes ?? []).includes("icebreaker");
  });
}

function installedProgramsOrVirtualResources(
  state: EffectCtx["state"],
): string[] {
  return state.runner.rig.filter((id) => {
    const c = state.cards[id];
    if (!c || c.hostId) return false;
    if (c.type === "program") return true;
    return c.type === "resource" && (c.subtypes ?? []).includes("virtual");
  });
}

export function applyKitaraWinPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "win_contaminate": {
      const targets = installedRunnerCardsWithNoVirus(state);
      if (targets.length === 0) {
        log(state, `Contaminate — no installed Runner card without virus.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        const c = state.cards[targets[0]!]!;
        c.virusCounters = (c.virusCounters ?? 0) + 3;
        log(state, `Contaminate — place 3 virus on ${c.title}.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `contaminate:${id}`,
          label: `Place 3 virus on ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "win_contaminate_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "win_contaminate_resolve": {
      const c = state.cards[action.cardId];
      if (!c) return { ok: true };
      c.virusCounters = (c.virusCounters ?? 0) + 3;
      log(state, `Contaminate — place 3 virus on ${c.title}.`);
      return { ok: true };
    }

    case "win_embezzle": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: ["asset", "ice", "operation", "upgrade"].map((t) => ({
          id: `embezzle:${t}`,
          label: `Name ${t}`,
          effect: fx.do({ kind: "win_embezzle_named", cardType: t }),
        })),
      };
      return { ok: true };
    }

    case "win_embezzle_named": {
      const hq = [...state.corp.hand];
      for (let i = hq.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = hq[i]!;
        hq[i] = hq[j]!;
        hq[j] = tmp;
      }
      const revealed = hq.slice(0, Math.min(2, hq.length));
      let trashed = 0;
      for (const id of revealed) {
        const c = state.cards[id];
        if (!c) continue;
        log(state, `Embezzle — reveal ${c.title} from HQ.`);
        if (c.type === action.cardType) {
          const idx = state.corp.hand.indexOf(id);
          if (idx >= 0) state.corp.hand.splice(idx, 1);
          c.zone = "corp:archives";
          c.faceup = true;
          c.rezzed = false;
          state.corp.discard.push(id);
          trashed += 1;
          log(state, `Embezzle — trash ${c.title}.`);
        }
      }
      if (trashed > 0) {
        state.runner.credits += trashed * 4;
        log(state, `Embezzle — gain ${trashed * 4}¢.`);
      }
      return { ok: true };
    }

    case "win_slipstream": {
      if (!state.run?.lastPassedRezzedIceId) {
        log(state, `Slipstream — no passed ice context.`);
        return { ok: true };
      }
      moveRunnerCardToHeap(state, sourceId);
      const passedId = state.run.lastPassedRezzedIceId;
      let passedPos = -1;
      let passedServer: string | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        const idx = server.ice.indexOf(passedId);
        if (idx >= 0) {
          passedPos = idx;
          passedServer = sid;
          break;
        }
      }
      if (passedPos < 0) return { ok: true };
      const options: {
        id: string;
        label: string;
        effect: ReturnType<typeof fx.do>;
      }[] = [];
      for (const sid of ["hq", "rd", "archives"] as const) {
        if (sid === passedServer) continue;
        const iceId = state.servers[sid]?.ice[passedPos];
        if (!iceId) continue;
        const ice = state.cards[iceId];
        if (!ice) continue;
        options.push({
          id: `slip:${iceId}`,
          label: `Move to ${ice.title} protecting ${sid}`,
          effect: fx.do({ kind: "win_slipstream_move", iceId, serverId: sid }),
        });
      }
      if (options.length === 0) {
        log(state, `Slipstream — no matching central ice.`);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options,
      };
      return { ok: true };
    }

    case "win_slipstream_move": {
      if (!state.run) return { ok: true };
      const serverId = action.serverId as import("../state/types.js").ServerId;
      const server = state.servers[serverId];
      if (!server) return { ok: true };
      state.run.attackedServerId = serverId;
      const pos = server.ice.indexOf(action.iceId);
      state.run.position = pos >= 0 ? pos : 0;
      state.run.encounter = {
        iceId: action.iceId,
        broken: (state.cards[action.iceId]?.subroutines ?? []).map(() => false),
      };
      log(
        state,
        `Slipstream — approach ${state.cards[action.iceId]?.title} on ${action.serverId}.`,
      );
      return { ok: true };
    }

    case "win_gebrselassie_host": {
      const targets = installedNonAiIcebreakers(state);
      if (targets.length === 0) {
        log(state, `Gebrselassie — no installed non-AI icebreaker.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        return evalEffect(ctx, fx.do({
          kind: "win_gebrselassie_host_resolve",
          cardId: targets[0]!,
        }));
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: targets.map((id) => ({
          id: `geb:${id}`,
          label: `Host on ${state.cards[id]!.title}`,
          effect: fx.do({ kind: "win_gebrselassie_host_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "win_gebrselassie_host_resolve": {
      const host = state.cards[action.cardId];
      const mod = state.cards[sourceId];
      if (!host || !mod) return { ok: true };
      mod.hostId = action.cardId;
      log(state, `Gebrselassie — host on ${host.title}.`);
      return { ok: true };
    }

    case "win_compile_install_program": {
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: [
          {
            id: "stack",
            label: "Search stack for a program",
            effect: fx.do({ kind: "win_compile_search", zone: "stack" }),
          },
          {
            id: "heap",
            label: "Search heap for a program",
            effect: fx.do({ kind: "win_compile_search", zone: "heap" }),
          },
        ],
      };
      return { ok: true };
    }

    case "win_compile_search": {
      const zoneIds =
        action.zone === "stack" ? state.runner.deck : state.runner.discard;
      const programs = zoneIds.filter((id) => state.cards[id]?.type === "program");
      if (programs.length === 0) {
        log(state, `Compile — no program in ${action.zone}.`);
        if (action.zone === "stack") shuffleDeck(state.runner.deck);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "runner",
        options: programs.map((id) => ({
          id: `compile:${id}`,
          label: `Install ${state.cards[id]!.title} ignoring costs`,
          effect: fx.do({
            kind: "win_compile_install_resolve",
            cardId: id,
            zone: action.zone,
          }),
        })),
      };
      return { ok: true };
    }

    case "win_compile_install_resolve": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const zone = action.zone === "stack" ? state.runner.deck : state.runner.discard;
      const idx = zone.indexOf(action.cardId);
      if (idx >= 0) zone.splice(idx, 1);
      card.zone = "runner:rig";
      card.rezzed = true;
      state.runner.rig.push(action.cardId);
      if (state.run) {
        state.run.winCompileInstalledProgramId = action.cardId;
      }
      if (action.zone === "stack") shuffleDeck(state.runner.deck);
      log(state, `Compile — install ${card.title} ignoring costs.`);
      return { ok: true };
    }

    case "win_compile_bottom_of_stack": {
      const id = state.run?.winCompileInstalledProgramId;
      if (!id) return { ok: true };
      const card = state.cards[id];
      if (!card || !state.runner.rig.includes(id)) return { ok: true };
      const idx = state.runner.rig.indexOf(id);
      if (idx >= 0) state.runner.rig.splice(idx, 1);
      card.zone = "runner:stack";
      card.hostId = undefined;
      state.runner.deck.push(id);
      log(state, `Compile — add ${card.title} to bottom of stack.`);
      return { ok: true };
    }

    case "win_bypass_encountered_ice": {
      if (!state.run?.encounter) {
        log(state, `Logic Bomb — not encountering ice.`);
        return { ok: true };
      }
      const iceTitle = state.cards[state.run.encounter.iceId]?.title;
      state.run.encounter = null;
      state.run.bypassCurrentEncounter = true;
      log(state, `Logic Bomb — bypass ${iceTitle}.`);
      return { ok: true };
    }

    case "win_lose_remaining_clicks": {
      const lost = state.runner.clicks;
      state.runner.clicks = 0;
      log(state, `Logic Bomb — lose ${lost} remaining click(s).`);
      return { ok: true };
    }

    case "win_jackpot_place_credit": {
      if (!source) return { ok: true };
      source.hostedCredits = (source.hostedCredits ?? 0) + 1;
      log(state, `Jackpot! — place 1¢ → ${source.hostedCredits}.`);
      return { ok: true };
    }

    case "win_jackpot_take_credits": {
      if (!source) return { ok: true };
      const n = source.hostedCredits ?? 0;
      if (n <= 0) {
        log(state, `Jackpot! — no credits.`);
        return { ok: true };
      }
      // Take all for deterministic resolution (any number including all).
      state.runner.credits += n;
      source.hostedCredits = 0;
      moveRunnerCardToHeap(state, sourceId);
      log(state, `Jackpot! — take ${n}¢ and trash.`);
      return { ok: true };
    }

    case "win_remote_enforcement": {
      const ice = state.corp.deck.filter((id) => state.cards[id]?.type === "ice");
      if (ice.length === 0) {
        log(state, `Remote Enforcement — no ice in R&D.`);
        shuffleDeck(state.corp.deck);
        return { ok: true };
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: ice.map((id) => ({
          id: `re:${id}`,
          label: `Install and rez ${state.cards[id]!.title} protecting a remote`,
          effect: fx.do({ kind: "win_remote_enforcement_pick_ice", iceId: id }),
        })),
      };
      return { ok: true };
    }

    case "win_remote_enforcement_pick_ice": {
      let remoteId: import("../state/types.js").ServerId | null = null;
      for (const [sid, server] of Object.entries(state.servers)) {
        if (server.kind === "remote") {
          remoteId = sid as import("../state/types.js").ServerId;
          break;
        }
      }
      if (!remoteId) {
        let n = state.nextRemoteNumber ?? 1;
        while (state.servers[`remote-${n}` as import("../state/types.js").ServerId]) {
          n += 1;
        }
        remoteId = `remote-${n}` as import("../state/types.js").ServerId;
        state.servers[remoteId] = {
          id: remoteId,
          kind: "remote",
          root: [],
          ice: [],
        };
        state.nextRemoteNumber = n + 1;
      }
      const installServerId = remoteId;
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: [
          {
            id: `re-install:${action.iceId}:${installServerId}`,
            label: `Install protecting ${installServerId}`,
            effect: fx.do({
              kind: "win_remote_enforcement_install",
              iceId: action.iceId,
              serverId: installServerId,
            }),
          },
        ],
      };
      return { ok: true };
    }

    case "win_remote_enforcement_install": {
      const ice = state.cards[action.iceId];
      if (!ice) return { ok: true };
      const cost = ice.installCost ?? 0;
      if (state.corp.credits < cost) {
        log(state, `Remote Enforcement — cannot pay install cost ${cost}.`);
        shuffleDeck(state.corp.deck);
        return { ok: true };
      }
      state.corp.credits -= cost;
      const idx = state.corp.deck.indexOf(action.iceId);
      if (idx >= 0) state.corp.deck.splice(idx, 1);
      const serverId = action.serverId as import("../state/types.js").ServerId;
      const server = state.servers[serverId];
      if (!server) {
        shuffleDeck(state.corp.deck);
        return { ok: true };
      }
      ice.zone = `server:${serverId}:ice`;
      ice.rezzed = true;
      ice.faceup = true;
      server.ice.push(action.iceId);
      shuffleDeck(state.corp.deck);
      log(
        state,
        `Remote Enforcement — install and rez ${ice.title} on ${serverId} (paid ${cost}¢ install, ignored rez).`,
      );
      return { ok: true };
    }

    case "win_viral_weaponization": {
      const n = state.runner.hand.length;
      if (n <= 0) {
        log(state, `Viral Weaponization — grip empty.`);
        return { ok: true };
      }
      return evalEffect(ctx, fx.do({ kind: "net_damage", amount: n }));
    }

    case "win_standard_procedure": {
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: ["event", "hardware", "program", "resource", "identity"].map(
          (t) => ({
            id: `sp:${t}`,
            label: `Name ${t}`,
            effect: fx.do({ kind: "win_standard_procedure_named", cardType: t }),
          }),
        ),
      };
      return { ok: true };
    }

    case "win_standard_procedure_named": {
      let n = 0;
      for (const id of state.runner.hand) {
        const c = state.cards[id];
        if (c?.type === action.cardType) n += 1;
        if (c) log(state, `Standard Procedure — reveal ${c.title}.`);
      }
      const gainAmt = n * 2;
      state.corp.credits += gainAmt;
      log(state, `Standard Procedure — gain ${gainAmt}¢ (${n} ${action.cardType}).`);
      return { ok: true };
    }

    case "win_intake_bounce": {
      const targets = installedProgramsOrVirtualResources(state);
      if (targets.length === 0) {
        log(state, `Intake — no program or virtual resource.`);
        return { ok: true };
      }
      if (targets.length === 1) {
        return evalEffect(ctx, fx.do({
          kind: "win_intake_bounce_resolve",
          cardId: targets[0]!,
        }));
      }
      state.pendingChoice = {
        sourceId,
        chooser: "corp",
        options: targets.map((id) => ({
          id: `intake:${id}`,
          label: `Bounce ${state.cards[id]!.title} to grip`,
          effect: fx.do({ kind: "win_intake_bounce_resolve", cardId: id }),
        })),
      };
      return { ok: true };
    }

    case "win_intake_bounce_resolve": {
      const card = state.cards[action.cardId];
      if (!card) return { ok: true };
      const idx = state.runner.rig.indexOf(action.cardId);
      if (idx >= 0) state.runner.rig.splice(idx, 1);
      card.zone = "runner:grip";
      card.hostId = undefined;
      state.runner.hand.push(action.cardId);
      log(state, `Intake — add ${card.title} to grip.`);
      return { ok: true };
    }

    case "win_place_advancement_on_self": {
      if (!source) return { ok: true };
      const amount = action.amount ?? 1;
      source.advancementTokens = (source.advancementTokens ?? 0) + amount;
      log(
        state,
        `Masvingo — place ${amount} advancement → ${source.advancementTokens}.`,
      );
      return { ok: true };
    }

    default:
      return null;
  }
}
