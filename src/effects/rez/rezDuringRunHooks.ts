/** Hooks that fire when ice is rezzed during a run, moved out of `effects/eval.ts`. */
import type { GameState } from "../../state/types.js";
import { addIceStrengthBoostThisRun } from "../../state/continuous/lingeringEffects.js";
import { log } from "../../state/setupAndEnd/createGame.js";
import { iceCannotGainAbilities } from "../../state/continuous/continuousEffects.js";
import { openPendingChoose } from "../../state/triggers/pendingChoice.js";
import { serverHostingCard } from "../eval.js";

/** Fire Brasília / Thunderbolt when ice is rezzed during a run. */
export function fireIceRezDuringRunHooks(
  state: GameState,
  iceId: string,
): void {
  if (!state.run) return;
  const ice = state.cards[iceId];
  if (!ice || ice.type !== "ice" || !ice.rezzed) return;
  const iceServer = serverHostingCard(state, iceId);
  if (!iceServer) return;

  // Thunderbolt first (no choice) so it still applies when onRez opened a choice.
  const idCard = state.cards[state.corp.identityId];
  const tb = idCard?.onRezApOrDestroyerIceDuringRun;
  if (tb) {
    const subtypes = ice.subtypes ?? [];
    const isApOrDestroyer =
      subtypes.includes("ap") || subtypes.includes("destroyer");
    if (isApOrDestroyer) {
      // "+1 strength ... for the remainder of that run" (CR 1.2.1, 9.10.1).
      addIceStrengthBoostThisRun(state, {
        createdBy: state.corp.identityId,
        iceId,
        amount: tb.strengthBonus,
      });
      log(
        state,
        `${idCard!.title} — ${ice.title} gets +${tb.strengthBonus} strength this run.`,
      );
      // Hush: the host ice cannot gain abilities (CR 1.2.1).
      if (
        tb.gainEtrUnlessTrashInstalledSub &&
        !iceCannotGainAbilities(state, iceId)
      ) {
        if (!ice.baseSubroutines) {
          ice.baseSubroutines = ice.subroutines
            ? structuredClone(ice.subroutines)
            : [];
        }
        const granted = {
          id: `${ice.defId}-thunderbolt-etr-unless-trash`,
          text: "End the run unless the Runner trashes 1 of their installed cards.",
          effect: {
            op: "do" as const,
            action: {
              kind: "unless" as const,
              payer: "runner" as const,
              cost: {
                op: "do" as const,
                action: {
                  kind: "trash_installed_runner" as const,
                  pick: "choose" as const,
                },
              },
              instruction: {
                op: "do" as const,
                action: { kind: "end_the_run" as const },
              },
            },
          },
        };
        ice.subroutines = [...(ice.subroutines ?? []), granted];
        if (!state.run.thunderboltGrantedIceIds) {
          state.run.thunderboltGrantedIceIds = [];
        }
        if (!state.run.thunderboltGrantedIceIds.includes(iceId)) {
          state.run.thunderboltGrantedIceIds.push(iceId);
        }
        if (state.run.encounter?.iceId === iceId) {
          state.run.encounter.broken.push(false);
        }
        log(
          state,
          `${ice.title} gains Thunderbolt ETR-unless-trash subroutine for this run.`,
        );
      }
    }
  }

  // Brasília: "When you rez a piece of ice during a run against this
  // server": any piece of ice, wherever it is installed. Skipped if another
  // choice is open. A declined offer leaves the ability unused, so its once
  // per turn flag is spent only when it resolves (CR 9.3.6g).
  if (state.pendingChoice) return;
  const attacked = state.servers[state.run.attackedServerId];
  if (!attacked) return;
  for (const uid of attacked.root) {
    const up = state.cards[uid];
    const hook = up?.oncePerTurnOnRezIceProtectingThisServerDuringRun;
    if (!up?.rezzed || !hook) continue;
    if (state.turn.brasiliaAbilityUsedIds.includes(uid)) continue;
    const bonus = hook.mayDerezOtherIceForStrengthBonus;
    const others: string[] = [];
    for (const server of Object.values(state.servers)) {
      for (const id of server.ice) {
        if (id === iceId) continue;
        if (state.cards[id]?.rezzed) others.push(id);
      }
    }
    if (others.length === 0) continue;
    openPendingChoose(state, {
      sourceId: uid,
      chooser: "corp",
      options: [
        {
          id: "decline-brasilia",
          label: "Decline",
          effect: {
            op: "do",
            action: { kind: "gain_credits", side: "corp", amount: 0 },
          },
        },
        ...others.map((oid) => ({
          id: `brasilia-derez:${oid}`,
          label: `Derez ${state.cards[oid]!.title} → +${bonus} strength on ${ice.title}`,
          effect: {
            op: "do" as const,
            action: {
              kind: "derez_brasilia_other_ice_for_strength" as const,
              otherIceId: oid,
              rezzedIceId: iceId,
              bonus,
              brasiliaId: uid,
            },
          },
        })),
      ],
    });
    log(
      state,
      `${up.title} — may derez another ice for +${bonus} strength on ${ice.title}.`,
    );
    break;
  }
}
