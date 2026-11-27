/**
 * Effect IR: the `Primitive` members whose procedure is move.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
export type MovePrimitive =
  | { kind: "move_unrezzed_ice_to_hq"; iceId: string }
  | { kind: "move_source_ice_to_outermost_attacked" }
  /**
   * Bullfrog: if installed, choose another server; move this ice to outermost
   * protecting that server; the run continues from the new position.
   */
  | { kind: "move_source_ice_to_outermost_another_server_continue_run" }
  /** Leaf: perform Bullfrog move to a specific server. */
  | {
      kind: "move_source_ice_to_outermost_server_continue_run";
      serverId: import("../../state/types/servers.js").ServerId;
    }
  /**
   * Vovô Ozetti: may move this upgrade to another server's root.
   */
  | { kind: "may_move_source_upgrade_to_another_server_root" }
  /** Leaf: move source upgrade to `serverId` root. */
  | { kind: "move_upgrade_to_server_root"; serverId: string }
  /**
   * Lotus Haze: choose 1 rezzed upgrade; move it to another server's root.
   */
  | { kind: "may_move_rezzed_upgrade_to_another_server_root" }
  /** Leaf: after picking upgrade, choose destination server. */
  | { kind: "may_move_picked_rezzed_upgrade"; cardId: string }
  /** Leaf: move a chosen rezzed upgrade to `serverId` root. */
  | {
      kind: "move_rezzed_upgrade_to_server_root";
      cardId: string;
      serverId: string;
    }
  | { kind: "move_runner_card_to_stack_top"; cardId: string }
  /**
   * Letheia Nisei: move the Runner to the outermost ice of the attacked server.
   */
  | { kind: "move_runner_to_outermost_attacked" }
  | { kind: "move_credits_to_sealed_vault"; amount: number }
  | { kind: "move_credits_from_sealed_vault"; amount: number }
  | { kind: "move_virus_counters" }
  | { kind: "move_incubator_apply"; cardId: string; amount?: number }
  | { kind: "move_constellation_advancement_between_ice" }
  | { kind: "move_constellation_apply"; fromId: string; toId: string }
  | { kind: "move_to_outermost" }
  | { kind: "move_to_server"; serverId: string }
  | { kind: "move_counter" }
  | { kind: "move_vbg_apply"; cardId: string }
  | { kind: "move_agenda_to_bottom_rd"; cardId: string; shuffledRd: boolean }
  | { kind: "move_accessed_to_bottom_rd" }
  | { kind: "move_mumbad_construction_advancement_to_faceup" }
  | { kind: "move_mumbad_construction_advancement_resolve"; cardId: string }
  | { kind: "move_program_to_stack_top"; cardId: string }
  | { kind: "move_source_upgrade_to_another_server_root" }
  /** Add a card from Archives to HQ; `reveal` shows it first (Subliminal Messaging). */
  | { kind: "move_archives_to_hq"; cardId: string; reveal?: boolean }
  | { kind: "move_to_hq"; cardId: string }
  | { kind: "move_all_advancements" }
  | { kind: "may_move_miraju_archives_jack_out_derez" }
  | { kind: "move_any_advancements_from_self_to_advanceable" }
  | { kind: "move_advancements_resolve"; destId: string; amount: number }
  /** Council of the Crest (cotc) Kitara #3 */
  | { kind: "move_friday_chip_virus" }
  | { kind: "move_friday_chip_virus_resolve"; cardId: string }
  | { kind: "move_slipstream"; iceId: string; serverId: string }
  | { kind: "may_move_up_to_credits_from_pool_to_self"; amount?: number }
  | { kind: "move_credits_from_pool_to_self_resolve"; amount: number }
  | {
      kind: "move_advancements";
      /** At most this many counters move ("up to", Trick of Light). */
      amount: number;
      /** Engine-filled as the Corp chooses: the card that gets the counters. */
      toId?: string;
      /** Engine-filled: the other card the counters come from. */
      fromId?: string;
      /** Engine-filled: how many counters the Corp moves. */
      count?: number;
    }
  /** Proprionegation: during a run, move Runner to Archives outermost ice. */
  | { kind: "move_runner_to_archives_outermost" };
