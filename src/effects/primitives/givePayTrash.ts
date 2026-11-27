/** Crimson Dust (cd) Red Sand pack primitives — v1.134.0. */
import { log } from "../../state/setupAndEnd/createGame.js";
import { addOutermostIce } from "../../state/uninstallAndPosition/runPosition.js";
import { corpInstallCost } from "../../state/keywordsAndCredits/costs.js";
import type { RuleCite, ServerId } from "../../state/types.js";
import type { EffectCtx } from "../eval.js";
import { fx, type Effect, type Primitive } from "../ir.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { trashCard } from "../../state/hostingAndTrash/trash.js";
import { removeCardFromGame } from "../../state/uninstallAndPosition/uninstall.js";

type PrimResult =
  { ok: true } | { ok: false; error: string; cites: RuleCite[] };

function trashTopOfRd(
  state: EffectCtx["state"],
  n: number,
  label: string,
): void {
  for (let i = 0; i < n; i++) {
    const top = state.corp.deck[0];
    if (!top) break;
    const c = state.cards[top];
    // "Force the Corp to trash": the Corp carries it out (CR 1.14.5).
    // Not visible to the Runner when trashed: facedown (CR 4.4.6b).
    trashCard(state, top, { by: "corp" });
    log(state, `${label} — trash ${c?.title ?? top} from R&D.`);
  }
}

export function applyRedsandCdPrimitive(
  ctx: EffectCtx,
  action: Primitive,
): PrimResult | null {
  const { state, sourceId } = ctx;
  const source = state.cards[sourceId];

  switch (action.kind) {
    case "give_bad_publicity_unless_corp_pays": {
      const amount = action.amount ?? 1;
      const credits = action.credits ?? 5;
      const options: { id: string; label: string; effect: Effect }[] = [];
      if (state.corp.credits >= credits) {
        options.push({
          id: "pay",
          label: `Pay ${credits}¢ to prevent`,
          effect: fx.do({
            kind: "corp_pay_credits_to_prevent",
            amount: credits,
          }),
        });
      }
      options.push({
        id: "take-bp",
        label: `Take ${amount} bad publicity`,
        effect: fx.do({ kind: "give_bad_publicity", amount }),
      });
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options,
        logLine: `${source?.title ?? "Mining Accident"} — Corp may pay ${credits}¢ or take ${amount} bad publicity.`,
      });
      return { ok: true };
    }

    case "corp_pay_credits_to_prevent": {
      const n = Math.min(action.amount ?? 0, state.corp.credits);
      state.corp.credits -= n;
      log(state, `Corp pays ${n}¢ → ${state.corp.credits}¢.`);
      return { ok: true };
    }

    case "trash_top_rd_equal_damage_suffered_this_turn": {
      const x = state.turn.damageSufferedThisTurn ?? 0;
      trashTopOfRd(state, x, source?.title ?? "Salvaged Vanadis Armory");
      state.turn.vanadisNextPawArmed = false;
      return { ok: true };
    }

    case "give_tags_equal_to_runner_tags_min_1": {
      const n = Math.max(1, state.runner.tags ?? 0);
      state.runner.tags = (state.runner.tags ?? 0) + n;
      state.turn.tagsGivenThisTurn = (state.turn.tagsGivenThisTurn ?? 0) + n;
      log(
        state,
        `${source?.title ?? "Threat Level Alpha"} — give ${n} tag(s) → ${state.runner.tags}.`,
      );
      return { ok: true };
    }

    case "install_ice_from_hq_outermost_remote_ignore_costs_place_advancements": {
      const advancements = action.advancements ?? 3;
      const iceInHq = state.corp.hand.filter(
        (id) => state.cards[id]?.type === "ice",
      );
      if (iceInHq.length === 0) {
        log(state, `Priority Construction — no ice in HQ.`);
        return { ok: true };
      }
      const remotes = Object.values(state.servers).filter(
        (s) => s.kind === "remote",
      );
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (const iceId of iceInHq) {
        for (const server of remotes) {
          opts.push({
            id: `pc:${iceId}:${server.id}`,
            label: `Install ${state.cards[iceId]!.title} outermost on ${server.id}`,
            effect: fx.do({
              kind: "install_priority_construction_resolve",
              iceId,
              serverId: server.id,
              advancements,
            }),
          });
        }
        opts.push({
          id: `pc:${iceId}:new`,
          label: `Install ${state.cards[iceId]!.title} outermost on new remote`,
          effect: fx.do({
            kind: "install_priority_construction_resolve",
            iceId,
            serverId: "__new_remote__",
            advancements,
          }),
        });
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        // Do not truncate: every ice × remote (plus new-remote) pair is legal.
        options: opts,
      });
      return { ok: true };
    }

    case "install_priority_construction_resolve": {
      let serverId = action.serverId as ServerId | "__new_remote__";
      if (serverId === "__new_remote__") {
        const remoteNum = state.nextRemoteNumber++;
        serverId = `remote-${remoteNum}` as ServerId;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      const server = state.servers[serverId];
      const iceId = action.iceId;
      const card = state.cards[iceId];
      if (!server || !card || card.type !== "ice") {
        log(state, `Priority Construction — invalid install.`);
        return { ok: true };
      }
      state.corp.hand = state.corp.hand.filter((id) => id !== iceId);
      // Outermost = index 0.
      server.ice.unshift(iceId);
      card.zone = `server:${serverId}:ice`;
      card.faceup = false;
      card.rezzed = false;
      const adv = action.advancements ?? 3;
      card.advancementCounters = (card.advancementCounters ?? 0) + adv;
      log(
        state,
        `Priority Construction — install ${card.title} outermost on ${serverId} with ${adv} advancement(s) (ignore costs).`,
      );
      return { ok: true };
    }

    case "install_and_rez_from_archives_paying_costs_rfg_other_copies": {
      const installable = state.corp.discardPile.filter((id) => {
        const t = state.cards[id]?.type;
        return (
          t === "asset" || t === "upgrade" || t === "ice" || t === "agenda"
        );
      });
      if (installable.length === 0) {
        log(state, `Restore — no installable card in Archives.`);
        return { ok: true };
      }
      const opts: { id: string; label: string; effect: Effect }[] = [];
      for (const cardId of installable) {
        const card = state.cards[cardId]!;
        const rezCost = card.type === "agenda" ? 0 : (card.rezCost ?? 0);
        if (card.type === "ice") {
          for (const server of Object.values(state.servers)) {
            const total = corpInstallCost(card, server.ice.length) + rezCost;
            if (state.corp.credits < total) continue;
            opts.push({
              id: `restore:${cardId}:${server.id}`,
              label: `Install+rez ${card.title} on ${server.id} (${total}¢)`,
              effect: fx.do({
                kind: "install_rez_resolve",
                cardId,
                serverId: server.id,
              }),
            });
          }
        } else {
          const total = rezCost;
          if (state.corp.credits < total) continue;
          for (const server of Object.values(state.servers)) {
            if (server.kind !== "remote") continue;
            opts.push({
              id: `restore:${cardId}:${server.id}`,
              label: `Install+rez ${card.title} on ${server.id} (${total}¢)`,
              effect: fx.do({
                kind: "install_rez_resolve",
                cardId,
                serverId: server.id,
              }),
            });
          }
          opts.push({
            id: `restore:${cardId}:new`,
            label: `Install+rez ${card.title} on new remote (${total}¢)`,
            effect: fx.do({
              kind: "install_rez_resolve",
              cardId,
              serverId: "__new_remote__",
            }),
          });
        }
      }
      if (opts.length === 0) {
        log(state, `Restore — cannot afford any Archives install+rez.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "corp",
        options: opts.slice(0, 24),
      });
      return { ok: true };
    }

    case "install_rez_resolve": {
      let serverId = action.serverId as ServerId | "__new_remote__";
      if (serverId === "__new_remote__") {
        const remoteNum = state.nextRemoteNumber++;
        serverId = `remote-${remoteNum}` as ServerId;
        state.servers[serverId] = {
          id: serverId,
          kind: "remote",
          ice: [],
          root: [],
        };
      }
      const server = state.servers[serverId];
      const cardId = action.cardId;
      const card = state.cards[cardId];
      if (!server || !card) {
        log(state, `Restore — invalid target.`);
        return { ok: true };
      }
      const installCost = corpInstallCost(
        card,
        card.type === "ice" ? server.ice.length : 0,
      );
      const rezCost = card.type === "agenda" ? 0 : (card.rezCost ?? 0);
      const total = installCost + rezCost;
      if (state.corp.credits < total) {
        log(state, `Restore — cannot afford ${total}¢.`);
        return { ok: true };
      }
      state.corp.credits -= total;
      state.corp.discardPile = state.corp.discardPile.filter(
        (id) => id !== cardId,
      );
      if (card.type === "ice") {
        // Outermost, as the text names no other position (CR 6.2.2a).
        addOutermostIce(state, serverId, cardId);
        card.zone = `server:${serverId}:ice`;
      } else {
        server.root.push(cardId);
        card.zone = `server:${serverId}:root`;
      }
      if (card.type !== "agenda") {
        card.rezzed = true;
      }
      card.faceup = true;
      const defId = card.defId;
      // RFG other copies of that card in Archives.
      const others = state.corp.discardPile.filter(
        (id) => state.cards[id]?.defId === defId,
      );
      for (const oid of others) {
        removeCardFromGame(state, oid);
        const oc = state.cards[oid];
        log(
          state,
          `Restore — RFG other copy ${oc?.title ?? oid} from Archives.`,
        );
      }
      log(
        state,
        `Restore — install${card.type !== "agenda" ? "+rez" : ""} ${card.title} on ${serverId} for ${total}¢.`,
      );
      return { ok: true };
    }

    case "may_install_diana_program_from_grip_ignoring_costs": {
      const programs = state.runner.hand.filter(
        (id) => state.cards[id]?.type === "program",
      );
      if (programs.length === 0) {
        log(state, `Diana's Hunt — no program in grip.`);
        return { ok: true };
      }
      openPendingChoose(state, {
        sourceId,
        chooser: "runner",
        options: [
          ...programs.map((id) => ({
            id: `diana:${id}`,
            label: `Install ${state.cards[id]!.title} ignoring costs`,
            effect: fx.do({
              kind: "install_diana_program_resolve",
              cardId: id,
            }),
          })),
          {
            id: "diana-decline",
            label: "Decline",
            effect: fx.do({ kind: "gain_credits", side: "runner", amount: 0 }),
          },
        ],
      });
      return { ok: true };
    }

    case "install_diana_program_resolve": {
      const id = action.cardId;
      const card = state.cards[id];
      if (!card || card.type !== "program") return { ok: true };
      const idx = state.runner.hand.indexOf(id);
      if (idx < 0) return { ok: true };
      state.runner.hand.splice(idx, 1);
      state.runner.installed.push(id);
      card.zone = "runner:installed";
      card.faceup = true;
      if (!state.run) return { ok: true };
      state.run.dianaInstalledProgramIds = [
        ...(state.run.dianaInstalledProgramIds ?? []),
        id,
      ];
      log(state, `Diana's Hunt — install ${card.title} ignoring all costs.`);
      return { ok: true };
    }

    default:
      return null;
  }
}
