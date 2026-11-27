/**
 * Effect IR: the `Primitive` members whose verb has no kind family file of its own,
 * matching `../kinds/otherKinds.ts`.
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
import type { ChoiceOption, Effect } from "./effect.js";
import type { CreditTally, PumpDuration, SideRef } from "./shared.js";

export type OtherPrimitive =
  | { kind: "end_the_run" }
  /** Transport Monopoly: this run cannot be declared successful. */
  | { kind: "prevent_declare_run_successful" }
  /**
   * Side loses up to `amount` credits. Optional `then` is "if they do" —
   * evaluates only when at least 1 credit was actually lost (PAN-Weave).
   * `tally` counts, then loses that total as this one instruction
   * (CR 9.12.2b, 9.12.2c). `amount` is unused when `tally` is set.
   * A total of 0 or less does not happen.
   */
  | {
      kind: "lose_credits";
      side: SideRef;
      amount: number;
      tally?: CreditTally;
      then?: Effect;
      /** Transfer of Wealth: gain per credit actually lost. */
      gainPerCreditLost?: { side: SideRef; per: number };
    }
  /** Side loses all credits in their credit pool (Closed Accounts). */
  | { kind: "lose_all_credits"; side: SideRef }
  | {
      kind: "pump_strength";
      amount: number;
      /** Default encounter-scoped; `"run"` lasts until the run ends; `"turn"` lasts the rest of the turn. */
      duration?: PumpDuration;
    }
  | { kind: "fortify_ice"; amount: number }
  | { kind: "weaken_ice"; amount: number }
  /** Spend credits only from stealth hosted / stealth event pools. */
  | { kind: "spend_stealth_credits"; amount: number }
  /**
   * Baker: change attacked server during Archives approach redirect and
   * approach that server (position 0 or null if no ice).
   */
  | { kind: "redirect_approach_to_server"; serverId: "hq" | "rd" }
  | {
      kind: "net_damage";
      amount: number;
      /**
       * Count, then deal that much net damage as this one instruction
       * (CR 9.12.2b, 9.12.2c). `amount` is unused when `tally` is set.
       * A total of 0 or less does not happen.
       */
      tally?: CreditTally;
    }
  /**
   * Sting!: do 1 + (copies of source title in the other player's score area)
   * net damage.
   */
  | { kind: "net_damage_1_plus_copies_of_source_title_in_other_score_area" }
  | {
      kind: "meat_damage";
      amount: number;
      /**
       * Count, then deal that much meat damage as this one instruction
       * (CR 9.12.2b, 9.12.2c). `amount` is unused when `tally` is set.
       * A total of 0 or less does not happen.
       */
      tally?: CreditTally;
      /** Flare-class: damage cannot be prevented (CR §10.4). */
      cannotPrevent?: boolean;
    }
  /** Canonical core damage (CR §10.4.2b). */
  | {
      kind: "core_damage";
      amount: number;
      /** Open a prevention window (pendingDamage) instead of applying immediately. */
      interactive?: boolean;
      /**
       * With interactive: Runner may prevent by losing all remaining clicks
       * (Mr. Hendrik).
       */
      preventByLoseAllClicks?: boolean;
      /** Stimhack-class: damage cannot be prevented (CR §10.4). */
      cannotPrevent?: boolean;
    }
  /**
   * CR §10.4.2c synonym for `core_damage` (“brain damage”). Prefer
   * `core_damage` in new card IR.
   */
  | { kind: "brain_damage"; amount: number }
  | {
      kind: "give_tags";
      amount: number;
      cannotBeAvoided?: boolean;
      /**
       * Count, then give that many tags as this one instruction
       * (CR 9.12.2b, 9.12.2c). `amount` is unused when `tally` is set.
       * A total of 0 or less does not happen.
       */
      tally?: CreditTally;
    }
  /** Midseason Replacements: give tags equal to turn.lastTraceExcess. */
  | { kind: "give_tags_equal_to_last_trace_excess" }
  /** Mr. Li: draw N then put 1 of those drawn on bottom of stack. */
  | { kind: "draw_n_then_bottom_one_of_drawn"; amount: number }
  | { kind: "bottom_drawn_card"; cardId: string }
  | { kind: "forfeit_runner_scored_agenda"; cardId: string }
  | { kind: "caissa_pawn_host_outermost_central" }
  /**
   * Rook, Knight: host this program on ice not hosting a Caïssa program.
   * Once hosted, `move` limits where it may go next: Rook to ice protecting
   * the same server or in the same position; Knight not to the next ice
   * inward or outward.
   */
  | {
      kind: "caissa_rook_host";
      move?: "same_server_or_position" | "not_adjacent";
    }
  | { kind: "caissa_bishop_host" }
  | { kind: "advance_caissa_host_inward_or_install" }
  | { kind: "score_profiteering_on" }
  | { kind: "copycat_jump_to_rezzed_copy" }
  | { kind: "copycat_continue_from_ice"; iceId: string }
  | { kind: "score_project_ares_on"; past: number }
  | {
      kind: "invasion_of_privacy";
      traceStrength?: number;
    }
  | { kind: "invasion_of_privacy_success" }
  | { kind: "invasion_of_privacy_finish" }
  | {
      kind: "trace";
      strength: number;
      onSuccess: Effect;
      onFailure?: Effect;
      /** When true, leave state.trace pending for host intents. */
      interactive?: boolean;
    }
  | {
      kind: "draw";
      side: SideRef;
      amount: number;
      /**
       * Count, then draw that many cards as this one instruction
       * (CR 9.12.2b, 9.12.2c). `amount` is unused when `tally` is set.
       * A total of 0 or less does not happen.
       */
      tally?: CreditTally;
    }
  /** Kingmaking: draw up to N cards (auto draws min(N, deck size)). */
  | { kind: "draw_up_to"; side: SideRef; amount: number }
  /** Cohort: may turn 1 facedown Archives card faceup; if so, then. */
  | { kind: "may_turn_facedown_archives_faceup_then"; then: Effect }
  | { kind: "turn_archives_card_faceup"; cardId: string; then?: Effect }
  /**
   * Dividends N (CR 10.13.1): place N agenda counters for each hosted
   * advancement past the advancement requirement at score begin (CR 10.13.2).
   */
  | { kind: "dividends"; n: number }
  | { kind: "lose_clicks"; side: SideRef; amount: number }
  | { kind: "take_hosted_credits"; amount: number }
  | {
      kind: "arrange_looked";
      order: string[];
    }
  | { kind: "increase_hand_size"; side: SideRef; amount: number }
  | { kind: "net_damage_agenda_points_this_turn" }
  /** Skip the discard step for the remainder of this turn (Midnight-3). */
  | { kind: "skip_discard_this_turn" }
  /**
   * Move the source card into the Corp score area as an agenda worth
   * `agendaPoints` (Backroom Machinations). Overrides card.agendaPoints
   * when provided.
   */
  | { kind: "score_self_as_agenda"; agendaPoints?: number }
  /** Leaf: place a revealed HQ card on top or bottom of R&D; continue Burner. */
  | {
      kind: "burner_place";
      cardId: string;
      position: "top" | "bottom";
      revealed: string[];
      movesLeft: number;
    }
  /**
   * Divide and Conquer: after the current breach, breach these servers in
   * order (optionally excluding root cards).
   */
  | {
      kind: "queue_breaches_after_current";
      servers: Array<"hq" | "rd" | "archives" | string>;
      cannotAccessRoot?: boolean;
    }
  /** Leaf: Wizard's Chest after type chosen. */
  | {
      kind: "wizard_chest_for_type";
      cardType: "hardware" | "program" | "resource";
      untilCount: number;
      ignoreAllCosts: boolean;
    }
  /**
   * Jeitinho: if Runner has ≥ `amount` assassination agendas in score area,
   * Runner wins.
   */
  | { kind: "check_assassination_win"; amount: number }
  /**
   * Tinkering: choose a piece of ice; it gains `subtypes` until end of turn.
   */
  | {
      kind: "grant_chosen_ice_subtypes_until_end_of_turn";
      subtypes: string[];
    }
  /** Internal: grant subtypes on a specific ice until end of turn. */
  | {
      kind: "grant_ice_subtypes_until_end_of_turn";
      cardId: string;
      subtypes: string[];
    }
  /**
   * Bank Job: may take any number of hosted credits and skip breach
   * (successful remote run).
   */
  | { kind: "may_take_any_hosted_credits_skip_breach" }
  /** Internal: take N hosted credits then skip breach. */
  | { kind: "take_hosted_credits_skip_breach"; amount: number }
  | { kind: "oversight_ai_host_on_ice"; iceId: string }
  /** Remove the source card from the game (Big Deal). */
  | { kind: "rfg_self" }
  /** Ansel 2.0: Corp removes 1 card in the Runner's heap from the game. */
  | { kind: "rfg_heap_card" }
  /** Leaf: RFG a specific heap card. */
  | { kind: "rfg_specific_heap_card"; cardId: string }
  /**
   * Scapenet: RFG an installed Runner rig card whose subtypes intersect
   * `subtypes` (e.g. chip OR virtual).
   */
  | {
      kind: "rfg_installed_with_any_subtype";
      subtypes: string[];
      pick: "choose" | "first";
    }
  /** Leaf: RFG a specific installed Runner card. */
  | { kind: "rfg_installed_card"; cardId: string }
  /**
   * Remove source from the game, then derez the most recently bypassed ice
   * this run (Capybara).
   */
  | { kind: "rfg_self_then_derez_bypassed_ice" }
  /**
   * Adjust allotted clicks for `side` on their next gain-clicks step
   * (Hypoxia: Runner −1 next turn).
   */
  | { kind: "allotted_clicks_next_turn"; side: SideRef; delta: number }
  /** Score an installed agenda by id if able (used inside thenMayScore). */
  | { kind: "score_agenda_card"; cardId: string }
  /** Purge all virus counters; trash cards with trashOnVirusPurge (Mavirus). */
  | { kind: "purge_virus_counters" }
  /** Leaf: add one looked R&D card to HQ during Cultivate. */
  | { kind: "cultivate_hq_looked"; cardId: string }
  /**
   * On encounter: append ETR subs equal to Runner tags after printed subs
   * (Starlit Knight @ Threat 4).
   */
  | { kind: "etr_subroutines_per_runner_tags_on_encounter" }
  /** Leaf: place one looked card next on top during arrange. */
  | { kind: "pick_rd_arrange"; cardId: string }
  /**
   * If no Corp cards were added to Archives this turn, score a facedown
   * agenda from Archives (Regenesis).
   */
  | { kind: "score_facedown_agenda_from_archives_if_clean"; cardId?: string }
  | { kind: "archives_to_hq"; amount: number }
  /**
   * Instead of breaching the attacked server: access 1 root card of another
   * server; agendas accessed this way cannot be stolen/trashed (Pinhole).
   * Presets access candidates and clears skipBreach when candidates exist.
   */
  | { kind: "access_one_root_other_server" }
  /** Spend N power counters from source for +N bonus access (Wake Implant). */
  | { kind: "spend_power_for_bonus_access"; amount: number }
  /**
   * Klevetnik / Unsmiling: may give the Runner N¢; if so, continue with `then`.
   */
  | { kind: "may_give_runner_credits_then"; amount: number; then: Effect }
  /**
   * Klevetnik: choose an installed resource; blank abilities until Corp turn ends.
   */
  | { kind: "blank_installed_resource_until_corp_turn_end" }
  /** Leaf: blank a specific resource until Corp turn ends. */
  | { kind: "blank_resource_until_corp_turn_end"; cardId: string }
  /**
   * Unsmiling Tsarevna: for remainder of run, encounters with source ice
   * allow at most `max` printed subroutine breaks.
   */
  | { kind: "limit_printed_breaks_on_source_for_run"; max: number }
  /**
   * Tyr's Hand: [trash] paid ability effect that prevents the pending
   * subroutine break (`PendingSubroutineBreak`) opened by a
   * `break_interrupt`.
   */
  | { kind: "prevent_pending_subroutine_break" }
  | {
      kind: "break_host_subroutine";
      /** Ika: break up to this many unbroken host subs (default 1). */
      maxSubs?: number;
      /** Ika: host ice must include this subtype. */
      requireSubtype?: string;
    }
  | {
      kind: "break_encounter_subroutine";
      /** Encountered ice must include this subtype. */
      requireSubtype?: string;
      /** Encountered ice must have at least this printed strength (D4v1d). */
      requireMinStrength?: number;
      /** Break up to this many unbroken subs (default 1; Poison Vial = 2). */
      maxSubs?: number;
      /** Lobisomem: pay this many credits per subroutine actually broken. */
      payCreditsPerBrokenSub?: number;
      /** Fire when at least one subroutine was broken this resolution (Umbrella). */
      thenIfBroke?: Effect;
    }
  | {
      kind: "may_start_run";
      servers:
        "any" | "central" | "hq_rd" | "rd" | "hq" | "archives" | "remote";
      /**
       * Alarm Clock: at the first ice encounter of the started run, Runner
       * may spend this many clicks to bypass.
       */
      bypassFirstEncounterForClicks?: number;
      /** Dorm Computer: prevent all tags during the started run. */
      preventAllTagsThisRun?: boolean;
    }
  | {
      kind: "queue_start_run";
      serverId: string;
      bypassFirstEncounterForClicks?: number;
      preventAllTagsThisRun?: boolean;
    }
  | { kind: "offer_jack_out" }
  /** Leaf: apply Peeping Tom type choice → reveal → gain run-scoped subs. */
  | {
      kind: "peeping_tom_apply_type";
      cardType: import("../../state/types.js").CardType;
    }
  /** Leaf: Corp picked installed card — Runner may access or decline. */
  | {
      kind: "hangeki_runner_may_access";
      cardId: string;
      onAccess: Effect;
      onDecline: Effect;
    }
  /** Leaf: Runner accepts out-of-run access of installed card. */
  | {
      kind: "access_installed";
      cardId: string;
      onAccess: Effect;
    }
  /**
   * Project Wotan: the currently approached ice — if rezzed bioroid — gains
   * an ETR subroutine (after printed) for the remainder of this run.
   */
  | { kind: "grant_approached_rezzed_bioroid_etr_subroutine_this_run" }
  | { kind: "fortify_all_ice"; amount: number }
  | { kind: "meeting_of_minds_fetch"; cardId: string; subtype: string }
  /** Leaf: move top of R&D to bottom. */
  | { kind: "rd_top_to_bottom" }
  | {
      kind: "spend_lightning_counter_rez_up_to_protecting_attacked";
      maxIce: number;
    }
  /**
   * "[instruction] unless [payer] [cost]" (CR 1.16.11b).
   * Cost is one of lose_credits (a flat amount or a tally),
   * runner_pay_credits, corp_pay_credits, corp_pay_credits_to_prevent,
   * lose_clicks, give_tags, net_damage, core_damage,
   * trash_installed_runner, or shuffle_all_grip_into_stack.
   * A seq of those is one cost with several parts ("spends [click] and
   * pays 2 credits"): it is paid in full or not at all.
   * An empty cost (amount ≤ 0) is treated as paid. An unpayable cost
   * resolves the instruction (CR 1.16.1b for tags).
   */
  | {
      kind: "unless";
      payer: "corp" | "runner";
      cost: Effect;
      instruction: Effect;
    }
  /** The choice has ended; the chosen option is the next instruction (CR 9.11.4g). */
  | { kind: "end_choice_instruction" }
  /**
   * Broad Daylight: may take `amount` bad publicity, then place agenda
   * counters on source equal to Corp bad publicity.
   */
  | {
      kind: "may_take_bad_publicity_then_add_agenda_counters_equal_to_bad_publicity";
      amount: number;
    }
  /**
   * Arrange installed ice (CR 8.3.1, 8.3.2): the chooser fills each position
   * of `serverIds`, outermost first, from those servers' ice. `placed` holds
   * the ice chosen so far, in position order.
   */
  | {
      kind: "rearrange_ice";
      chooser: "corp" | "runner";
      serverIds: import("../../state/types.js").ServerId[];
      placed?: string[];
    }
  /** Leaf: force mid-run access of one installed card (Otoroshi). */
  | { kind: "access_installed_card"; cardId: string }
  /**
   * Fast Break: X = agendas in Runner score area; gain X¢, draw up to X,
   * then install up to X cards from HQ into root and/or protecting one chosen
   * remote (paying install costs).
   */
  | { kind: "runner_break_fast_equal_to_scored_agendas" }
  /** Set `hostedCreditsSpendFor` on source (Bahia Bands). */
  | {
      kind: "spend_enable_hosted_credits_for";
      purposes: Array<"install" | "trash">;
    }
  | { kind: "rfg_top_of_stack"; amount: number }
  /**
   * Restrict which cards on the attacked server may be accessed for rest of run.
   * `only_source` / `forbid_source` resolve `cardIdsFromSource` to source id.
   */
  | {
      kind: "restrict_run_access";
      mode: "only_source" | "forbid_source";
      cardIdsFromSource?: boolean;
      cardIds?: string[];
    }
  /**
   * Wall to Wall: when Corp turn begins, resolve 1 (if any other rezzed
   * asset) or up to 3 (otherwise) of draw / gain 1¢ / advance ice / add to HQ.
   */
  | { kind: "wall_to_wall_turn_begin" }
  /** Internal follow-up for wall_to_wall_turn_begin. */
  | {
      kind: "turn_begin_continue";
      remaining: number;
      used: string[];
      mustPick: boolean;
    }
  /** Internal: after Focus Group type choice — reveal, choose X, may pay+place. */
  | {
      kind: "focus_group_after_type";
      cardType: import("../../state/types.js").CardType;
    }
  /**
   * Divested Trust: may forfeit this scored agenda to gain credits and return
   * the just-stolen agenda to HQ.
   */
  | {
      kind: "may_forfeit_return_stolen";
      gainCredits: number;
    }
  /**
   * The Nihilist: may remove any 2 virus counters from installed Runner cards;
   * if you do, draw 2 unless Corp trashes the top card of R&D.
   */
  | { kind: "nihilist_may_remove_2_virus_draw_unless_corp_trash_top_rd" }
  /** Internal: after removing 2 virus — Corp trash top R&D or Runner draws 2. */
  | { kind: "nihilist_corp_trash_top_rd_or_runner_draws_2" }
  /** Internal: after Game Over type choice — process matching installed cards. */
  | {
      kind: "game_over_after_type";
      cardType: import("../../state/types.js").CardType;
    }
  /** Internal: offer pay-3 prevent or trash for one card, then continue. */
  | {
      kind: "game_over_process_card";
      cardId: string;
      remaining: string[];
    }
  /** Internal: continue Game Over queue after prevent/trash. */
  | { kind: "game_over_continue"; remaining: string[] }
  /** Kakurenbo: turn every card in Archives facedown. */
  | { kind: "turn_all_archives_facedown" }
  /** AirbladeX: prevent up to `amount` pending net damage. */
  | { kind: "prevent_pending_damage"; amount: number }
  /** Guru Davinder: remove imminent net or meat damage, then pay or trash only if 1 or more was prevented. */
  | { kind: "prevent_all_pending_net_or_meat" }
  | { kind: "prevent_pending_tags"; amount: number }
  /** AirbladeX: prevent onEncounter on current encountered ice. */
  | { kind: "prevent_current_ice_on_encounter" }
  /** Move one HQ card to the top of R&D (Mindscaping). */
  | { kind: "hq_to_top_rd"; pick?: "first" | "choose" }
  | { kind: "hq_card_to_top_rd"; cardId: string }
  /** Net damage equal to Runner tags, capped at `max`. */
  | { kind: "net_damage_up_to_tags"; max: number }
  | { kind: "bypass_current_ice"; requireSubtype?: string }
  /**
   * Internal: Corp declined ice trash — register `amount` bonus accesses on
   * the first HQ/R&D breach this turn.
   */
  | { kind: "climactic_register_bonus_access"; amount?: number }
  /** Lucky Charm: prevent a pending Corp-card-ability end-the-run. */
  | { kind: "prevent_pending_end_the_run_from_corp_card_ability" }
  | { kind: "name_agenda"; title: string }
  | { kind: "draw_class_act_bottom_one_then"; cardId: string }
  | { kind: "backup_plan_may_rerun_ignore_additional_costs_bypass_last_ice" }
  | { kind: "backup_plan_rerun" }
  | { kind: "name_net_damage_loop" }
  | { kind: "net_named"; title: string }
  | { kind: "access_set_aside"; cardId: string }
  /**
   * Take another action now, different from the first three this turn,
   * paying [click] less (MirrorMorph: Endless Iteration; CR 5.2.5b).
   */
  | { kind: "take_different_action_paying_click_less" }
  /**
   * Take N hosted bad publicity counters from the source into the Corp's
   * player BP pool (Superdeep Borehole). Hosted counters are not player BP
   * until taken (CR §1.13.3).
   */
  | { kind: "take_hosted_bad_publicity"; amount: number }
  | { kind: "meat_damage_stolen_last_turn" }
  /**
   * realloc(): choose 2 rezzed ice; for each, gain printed rez cost then derez.
   * Derez is not an aggregated effect, so each ice is its own instance
   * (CR 9.12.2b, 9.12.2c).
   */
  | { kind: "realloc_two_rezzed_ice" }
  /** Leaf: pick second ice after first selected for realloc. */
  | { kind: "pick_second"; firstIceId: string }
  /**
   * Director Haas' Pet Project: onScore — may install up to `remaining`
   * cards from HQ and/or Archives into a single new remote, ignoring all
   * costs (agendas/assets/upgrades to root, ice to protect it).
   */
  | { kind: "haas_pet_project_setup"; remaining: number }
  /**
   * Leaf: if `cardId` is chargeable (≥1 power), offer may-charge that card;
   * otherwise no-op (if able).
   */
  | { kind: "may_charge_card"; cardId: string }
  | { kind: "give_bad_publicity"; amount: number }
  /** The bad publicity is suffered after a replacement trace fails. */
  | { kind: "suffer_bad_publicity"; amount: number }
  | { kind: "flip_identity" }
  /** Méliès U: choose secretly among HQ / R&D / Archives faces. */
  | { kind: "melies_secretly_set_face" }
  | { kind: "melies_set_face"; face: "hq" | "rd" | "archives" }
  /**
   * Peer Review. `cardIds` is the HQ card the Corp keeps hidden, set by the
   * engine once the Corp has picked it; card data does not author it.
   */
  | { kind: "peer_review"; cardIds?: string[] }
  | { kind: "mitra_aman_approach_ice" }
  | { kind: "forfeit_scored_agenda"; cardId: string }
  /** Posted Bounty-class: forfeit the source agenda from Corp score. */
  | { kind: "forfeit_self" }
  | { kind: "store_ip_enforcement_tags_removed"; amount: number }
  | {
      kind: "gamedragon_may_host_on_icebreaker";
      /** Personal Touch: allow AI icebreakers. */
      allowAi?: boolean;
      /** Personal Touch: host is required when any icebreaker exists (no decline). */
      requireHost?: boolean;
    }
  /** Déjà Vu: add 1 card from heap, or up to 2 virus cards. */
  | { kind: "deja_vu_from_heap" }
  | { kind: "deja_vu_add_heap_cards"; cardIds: string[] }
  /** Expose 1 installed unrezzed Corp card (Infiltration / Lemuria). */
  | { kind: "expose"; pick: "choose"; cardId?: string }
  /**
   * Satellite Uplink: expose up to `max` cards (sequential may-expose with decline).
   * `remaining` is internal for the recursive choice chain.
   */
  | { kind: "expose_up_to"; max: number; remaining?: number }
  /** One card of an expose-up-to instruction, then the rest of that instruction. */
  | {
      kind: "expose_one_of_up_to";
      cardId: string;
      max: number;
      remaining: number;
    }
  | { kind: "end_expose_up_to" }
  | { kind: "prevent_pending_expose"; amount: number }
  | { kind: "may_expose_after_rez_continue" }
  /** Sacrificial Construct: prevent pending installed program/hardware trash. */
  | { kind: "prevent_pending_installed_trash"; amount: number }
  /** Accelerated Beta Test: look top n; may install+rez ice ignore costs; trash rest. */
  | {
      kind: "accelerated_beta_test";
      n: number;
      /** Engine-built: the Corp chose to look (the look is optional, CR 9.6.9c). */
      look?: boolean;
    }
  | { kind: "accelerated_beta_test_continue" }
  | { kind: "cap_run_access_remaining"; max: number }
  | { kind: "break_subroutine_on_self"; amount: number }
  /**
   * `cardIds`: the looked-at cards not yet played or trashed. `playId`: the
   * one the Corp chose to play next. `done`: the Corp plays no more. All
   * three are set while the card resolves.
   */
  | {
      kind: "accelerated_diagnostics";
      cardIds?: string[];
      playId?: string;
      done?: boolean;
    }
  | { kind: "score_unorthodox_predictions_on" }
  | { kind: "power_shutdown" }
  | { kind: "draw_top_rd_to_hand" }
  | { kind: "begin_replace_breach_hq_hand_only" }
  | { kind: "unorthodox_predictions_lock_subtype"; subtype: string }
  | { kind: "lawyer_up" }
  | { kind: "leverage" }
  | { kind: "leverage_shield_runner" }
  | { kind: "turn_begin" }
  | { kind: "rex_campaign_when_empty" }
  | { kind: "tallie_perrault_on_ops_trashed" }
  | { kind: "give_bad_publicity_and_tag" }
  | { kind: "prevent_trash_resource" }
  /**
   * Paintbrush: the chosen ice gains `subtype` (the Runner chooses sentry,
   * code gate or barrier when it is absent) until the end of the next run
   * this turn.
   */
  | {
      kind: "paintbrush_apply_subtype";
      iceId: string;
      subtype?: "sentry" | "code gate" | "barrier";
    }
  | { kind: "gyri_labyrinth_reduce_max_hand" }
  | { kind: "reclamation_order_archives_to_hq" }
  | { kind: "take_reclamation_copies_to_hq"; defId: string; amount: number }
  | { kind: "trace_prevent_bad_publicity" }
  | { kind: "spend_caprice_nisei_secret" }
  | { kind: "tennin_place_advancement_on_installed" }
  | { kind: "mutate_record_trashed_ice"; iceId: string }
  | { kind: "trace_taurus_subroutine" }
  | { kind: "runner_mu_modifier_until_turn_end"; delta: number }
  | { kind: "cyber_threat" }
  | { kind: "cyber_threat_server"; serverId: string }
  | {
      kind: "run_cyber_threat_server";
      serverId: import("../../state/types.js").ServerId;
    }
  | { kind: "lose_nasir_all_credits" }
  | { kind: "social_engineering" }
  | { kind: "social_engineering_mark"; iceId: string }
  | { kind: "score_encrypted_portals_on" }
  | { kind: "name_card" }
  | { kind: "information_overload_encounter" }
  | { kind: "sealed_vault_store_from_pool" }
  | { kind: "take_to_pool" }
  | { kind: "three_steps_ahead_payout" }
  | { kind: "wendigo_ban_program" }
  | { kind: "rfg_runner_heap" }
  | { kind: "shattered_remains_access" }
  | { kind: "break_barrier" }
  | { kind: "pump_blackat_strength" }
  | { kind: "supplier_host_from_grip" }
  | { kind: "may_score_bifrost_trigger_scored_agenda_on" }
  | { kind: "score_bifrost_fire_scored_agenda_on"; cardId: string }
  | { kind: "trace_sagittarius_subroutine" }
  | { kind: "trace_subroutine" }
  | { kind: "trace_success" }
  | { kind: "trace_when_determined" }
  | { kind: "snatch_and_grab_on_play" }
  | { kind: "trace_snatch_and_grab_success" }
  | { kind: "offer_prevent"; cardId: string }
  | { kind: "prevent_with_tag" }
  | { kind: "corp_discard_random_from_hq"; amount?: number }
  | { kind: "helium3_place_up_to_2_power" }
  | { kind: "helium3_place_n"; cardId: string; amount: number }
  | { kind: "boost_ice" }
  | { kind: "boost_it_department_apply"; cardId: string; amount: number }
  | { kind: "runner_trashes_one_installed" }
  | { kind: "trace_troll_encounter" }
  | { kind: "trace_troll_success" }
  | { kind: "trace_virgo_subroutine" }
  | { kind: "self_destruct_ability" }
  | { kind: "trace_self_destruct_success" }
  | { kind: "break_code_gate_or_barrier" }
  | { kind: "firmware_place_advancement_on_advanceable_ice" }
  | { kind: "glenn_host_from_hq" }
  | { kind: "glenn_host_card"; cardId: string }
  | { kind: "glenn_retrieve_to_hq" }
  | { kind: "glenn_retrieve_card"; cardId: string }
  | { kind: "mark_yale_spend_any_agenda_counter_gain_2" }
  | { kind: "mark_yale_spend_counter_on"; cardId: string }
  | { kind: "checkpoint_schedule_meat_on_successful_run"; amount: number }
  | { kind: "trace_strength_equal_source_advancements"; onSuccess?: Effect }
  | { kind: "twins_apply_reencounter"; trashId: string; iceId: string }
  | { kind: "spend_wanton_clicks_trash_hq"; amount: number }
  | { kind: "uninstall_program_or_hardware_to_grip" }
  | { kind: "uninstall_to_grip"; cardId: string }
  | { kind: "draw_if_hq_full" }
  | { kind: "prevent_all_damage" }
  | { kind: "stim_dealer_turn_begin" }
  | { kind: "lose_qianju_click_prevent_tag_until_next_turn" }
  | { kind: "next_gold_net_damage" }
  | { kind: "jinteki_biotech_flip" }
  | { kind: "jinteki_biotech_place_4_advancement" }
  | { kind: "net_damage_equal_unused_mu" }
  | { kind: "valley_grid_hand_size_penalty_until_next_corp_turn" }
  | { kind: "give_tag_remove_if_successful" }
  /** Breaker Bay (bb) */
  | { kind: "prevent_dorm_computer_run_all_tags" }
  | { kind: "draw_until_grip_equals_max_hand_size" }
  | { kind: "score_another_installed_copy_of_self" }
  | { kind: "score_installed_agenda_ignore_requirement"; cardId: string }
  | { kind: "net_ready_eyes_choose_icebreaker_strength"; amount: number }
  | { kind: "net_ready_eyes_apply_strength"; cardId: string; amount: number }
  | { kind: "analog_dreamers_run_rd" }
  | { kind: "runner_cannot_draw_remainder_of_turn" }
  | { kind: "expose_and_trash_remote_root" }
  | {
      kind: "expose_resolve";
      cardId: string;
      /** The card's exposures this turn before Drive By's expose. */
      exposuresBefore?: number;
    }
  | { kind: "pick_stack_arrange"; cardId: string }
  | { kind: "oh_place_advancements_on"; cardId: string; amount: number }
  | { kind: "an_offer_you_cant_refuse" }
  | { kind: "offer_central_chosen"; serverId: string }
  | { kind: "offer_start_run"; serverId: string }
  | { kind: "cannot_arm_rez_outermost_ice_this_turn" }
  | { kind: "uot_bookmark_host_one"; cardId: string }
  | { kind: "draw_from_bottom_of_rd"; amount?: number }
  | { kind: "force_encounter_accessed_ice" }
  | { kind: "arm_duplicate_subs_on_next_ice_encounter" }
  | { kind: "dad_media_blitz_copy"; cardId: string }
  | { kind: "turn_all_installed_runner_cards_facedown" }
  | { kind: "break_etr_subroutine_trash_installed" }
  | { kind: "break_encounter_etr_subroutine" }
  | { kind: "break_any_subroutine" }
  | { kind: "break_sub_index"; iceId: string; index: number }
  | { kind: "blank_installed_abilities" }
  | { kind: "blank_card_this_turn"; cardId: string }
  | { kind: "boost_breakers_per_link" }
  | { kind: "boost_breakers"; cardIds: string[]; amount: number }
  | { kind: "trace_bypass_or_tag_etr" }
  | { kind: "bypass_encountered_ice" }
  | { kind: "jak_sinclair_run_without_programs" }
  | { kind: "prevent_ramujan_damage_trash_stack" }
  | { kind: "panchatantra_apply_subtype"; iceId: string; subtype: string }
  | { kind: "cannot_use_programs_this_run_kg" }
  | { kind: "break_arm_icebreaker_additional_cost_this_run"; amount: number }
  | { kind: "cannot_steal_copies_of_revealed_agenda" }
  | { kind: "draw_then_discard_down_to_hand_size"; drawAmount?: number }
  | { kind: "draw_then_discard_down_to_hand_size_continue"; cardId: string }
  | { kind: "bf_place_advancement_on_self"; amount?: number }
  | { kind: "may_spend_voting_machine_lose_click" }
  | { kind: "spend_voting_machine_lose_click" }
  | { kind: "sensie_add_one_hq_to_bottom_rd" }
  | { kind: "si_stack_done_trashing" }
  | { kind: "si_stack_arrange_pick"; cardId: string }
  | { kind: "name_reveal_trash_grip_copies" }
  | { kind: "bottom_drawn_card"; cardId: string }
  | { kind: "patron_set_named_server"; serverId: string }
  | { kind: "information_sifting_corp_split_hq" }
  | { kind: "access_pile"; pile: "a" | "b" }
  | { kind: "may_corp_forfeit_liberated_chela_or_score" }
  | { kind: "corp_forfeit_rfg" }
  | { kind: "forfeit_resolve"; agendaId: string }
  | { kind: "score_self" }
  | { kind: "rebirth_switch_identity_same_faction" }
  | { kind: "rebirth_switch_to_identity"; cardId: string }
  | { kind: "turning_wheel_set_bonus_access"; server: "hq" | "rd" }
  | { kind: "tlm_out_of_ashes_rfg_and_run" }
  | { kind: "tlm_puppet_master_place_advancement" }
  | { kind: "corp_cannot_advance_cards_next_turn" }
  | { kind: "spend_rigged_results_secret_guess" }
  | { kind: "rigged_results_corp_guessed_wrong" }
  | { kind: "rigged_results_corp_guessed_right" }
  | { kind: "bypass_rigged_results_run_ice"; iceId: string; serverId: string }
  | { kind: "name_type_trash_from_grip" }
  | { kind: "force_trace_then_gain_credits" }
  | { kind: "expose_then_run" }
  | {
      kind: "injection_attack_run_with_breaker";
      breakerId: string;
      strengthBonus?: number;
    }
  /** Blood Money (bm) Flashpoint */
  | { kind: "spend_x_pump_and_break" }
  | { kind: "spend_x_pump_and_break_resolve"; amount: number }
  | { kind: "redirect_omar_success"; serverId: "hq" | "rd" }
  | { kind: "spend_pump_and_break" }
  | { kind: "name_and_rfg_heap_copies" }
  | { kind: "rfg_named"; defId: string }
  | { kind: "grant_kusanagi_net_subroutine_this_run" }
  | { kind: "grant_kusanagi_net_subroutine_resolve"; iceId: string }
  | { kind: "net_mercur_place_or_draw" }
  | { kind: "net_mercur_place_credit" }
  | { kind: "top_hat_may_instead_of_breach"; n?: number }
  | { kind: "top_hat_access_instead_of_breach"; cardId: string }
  /** Martial Law (ml) Flashpoint */
  | { kind: "spend_mkultra_pump_and_break" }
  | { kind: "prevent_tags_or_damage"; max?: number }
  | { kind: "spend_x_remove_tags" }
  | { kind: "spend_x_remove_tags_resolve"; amount: number }
  | { kind: "psi_differ_redirect" }
  | { kind: "redirect_resolve"; serverId: string }
  | {
      kind: "give_tags_if_runner_has_installed_subtype";
      amount?: number;
      subtype?: string;
    }
  /** Quorum (qu) Flashpoint */
  | { kind: "prevent_x_damage" }
  | { kind: "prevent_x_damage_resolve"; amount: number }
  | { kind: "prevent_tracker_run_chosen_first_sub" }
  | { kind: "schedule_additional_runner_turn" }
  | { kind: "spend_x_pump" }
  | { kind: "spend_x_pump_resolve"; amount: number }
  | { kind: "rfg_virus_from_heap" }
  | { kind: "rfg_virus_from_heap_resolve"; cardId: string }
  | { kind: "may_spend_to_place_power"; amount?: number }
  | {
      kind: "spend_place_power_resolve";
      amount: number;
      nasxId?: string;
    }
  | { kind: "sifr_zero_encounter_ice_strength" }
  | { kind: "expose_non_ice_then_run" }
  | { kind: "prevent_all_but_n_pending_damage"; leave?: number }
  | { kind: "mad_dash_on_run_end" }
  | { kind: "may_core_if_rezzed_next_ice" }
  | {
      kind: "pick_facedown_archives";
      remaining: number;
      cardIds: string[];
    }
  | { kind: "refresh_khondi_plaza_recurring" }
  | { kind: "severnius_start_run"; serverId: string; bonusAccess?: number }
  | { kind: "counter_surveillance_run" }
  | { kind: "counter_surveillance_start_run"; serverId: string }
  | { kind: "counter_surveillance_on_success" }
  | { kind: "access_n"; amount: number }
  | { kind: "mobius_on_run_end" }
  | { kind: "mobius_queue_second_rd_run" }
  | { kind: "corp_draw_syn_attack_discard_2_or_4" }
  | {
      /**
       * "You may spend any number of credits to place that many power
       * counters" (Mammon, Atman). With no `amount` the Runner chooses
       * how many, 0 included (CR 9.6.9c); with `amount` that many are spent.
       */
      kind: "spend_credits_place_power_counters";
      amount?: number;
      /** Recurring credits for using programs may pay too; default: when the source is a program. */
      includeProgramRecurring?: boolean;
    }
  | { kind: "charlatan_run_any_server" }
  | { kind: "charlatan_start_run"; serverId: string }
  | { kind: "break_sentry_or_barrier" }
  | { kind: "break_sentry_or_code_gates" }
  | {
      kind: "levy_take_program_rest_bottom";
      cardId?: string;
      restIds?: string[];
    }
  | { kind: "boost_icebreaker" }
  | { kind: "boost_dean_lister_apply"; cardId: string; amount: number }
  | { kind: "brain_rewiring_spend_credits_force_bottom_draw" }
  | { kind: "brain_rewiring_resolve"; amount: number }
  | { kind: "core_or_jack_out" }
  | { kind: "jack_out" }
  | { kind: "armored_servers_activate_this_run" }
  | { kind: "tag_or_end_the_run" }
  | { kind: "take_any_hosted_credits" }
  | { kind: "redirect_aginfusion_resolve"; serverId: string }
  | {
      kind: "bamboo_dome_order_rest";
      ordered: string[];
      remaining: string[];
    }
  /** Blood and Water (baw) Red Sand #4 */
  | { kind: "jarogniew_load_power_equal_tags_plus_3" }
  | { kind: "warroid_runner_trashes_installed"; amount?: number }
  | { kind: "reeducation_hq_bottom_rd_draw_runner_grip_to_stack" }
  | { kind: "pick_continue"; selected: string[]; remaining: string[] }
  | { kind: "advance_equal_forfeit_advancement_requirement" }
  | { kind: "whampoa_archives_to_rd_bottom"; cardId: string }
  | { kind: "bug_out_bag_load_power"; amount: number }
  | { kind: "draw_per_power_then_trash" }
  | { kind: "rfg_heap_gain_credits"; credits?: number }
  | { kind: "rfg_resolve"; cardId: string; credits?: number }
  | { kind: "o2_shortage_runner_may_trash_random_grip_or_corp_gains_clicks" }
  | { kind: "o2_shortage_corp_gains_clicks" }
  | {
      kind: "helheim_ice_protecting_this_server_strength_until_end_of_run";
      amount?: number;
    }
  /** Mandatory Seed Replacement: rearrange the ice protecting all servers. */
  | { kind: "rearrange_ice_protecting_all_servers" }
  | { kind: "open_forum_hq_to_rd_top"; cardId: string }
  /** Crimson Dust (cd) Red Sand #6 */
  | {
      kind: "give_bad_publicity_unless_corp_pays";
      amount?: number;
      credits?: number;
    }
  | { kind: "give_tags_equal_to_runner_tags_min_1" }
  /** Sovereign Sight (ss) Kitara #1 */
  | { kind: "ss_activate_by_any_means" }
  | { kind: "ss_assimilator_turn_facedown_faceup" }
  | { kind: "ss_wake_up_call" }
  | { kind: "dtwn_wari" }
  | { kind: "dtwn_wari_name_subtype"; subtype: string }
  | { kind: "expose_wari_resolve"; iceId: string; subtype: string }
  | { kind: "pump_takobi_breaker"; amount?: number }
  | { kind: "pump_takobi_resolve"; cardId: string; amount?: number }
  | { kind: "break_first_subroutine" }
  | { kind: "dtwn_emergent_creativity" }
  | { kind: "dtwn_rng_key" }
  | { kind: "dtwn_rng_key_set_number"; named: number }
  | { kind: "dtwn_rng_key_reward" }
  | { kind: "corp_additional_click_next_turn" }
  | { kind: "dtwn_bacterial_programming" }
  | { kind: "dtwn_bacterial_partition" }
  | { kind: "dtwn_bacterial_take_hq"; cardId: string }
  | {
      kind: "dtwn_bacterial_finish";
      toHq: string[];
      toTrash: string[];
      arrange: string[];
    }
  | { kind: "dtwn_jua_runner_pick_bounce"; cardIds: string[] }
  | { kind: "dtwn_threat_assessment" }
  | { kind: "cotc_no_one_home"; mode?: string }
  | { kind: "prevent_no_one_home"; mode?: string }
  | { kind: "break_last_subroutine" }
  | { kind: "cotc_white_hat" }
  | { kind: "trace_white_hat" }
  | { kind: "trace_kuwinda" }
  | { kind: "draw_next_sapphire" }
  | { kind: "cotc_next_sapphire_archives_to_hq" }
  | {
      kind: "pick_next_sapphire_archives";
      cardId: string;
      remaining?: number;
    }
  | { kind: "cotc_next_sapphire_hq_to_rd" }
  | {
      kind: "pick_next_sapphire_hq";
      cardId: string;
      remaining?: number;
    }
  | { kind: "cotc_anansi_arrange_rd"; amount?: number }
  | { kind: "cotc_code_replicator" }
  | { kind: "cotc_reverse_infection_purge" }
  | { kind: "cotc_azmari_name_card_type" }
  | { kind: "cotc_azmari_set_named_type"; cardType: string }

  /**
   * Glut Cipher. `cardIds` is the Corp's pick of 5 Archives cards, set by
   * the engine; card data does not author it.
   */
  | { kind: "tdatd_glut_cipher"; cardIds?: string[] }
  | { kind: "tdatd_knobkierie_place_virus" }
  | { kind: "expose_419_or_pay"; cardId: string; credits?: number }
  | { kind: "expose_419"; cardId: string }
  | { kind: "tdatd_falsified_credentials" }
  | { kind: "tdatd_falsified_set_type"; cardType: string }
  | { kind: "expose_falsified"; cardId: string; cardType: string }
  | { kind: "blank_malia"; cardId: string }
  | { kind: "lose_tempus_clicks" }
  | { kind: "tdatd_sadaka_arrange"; cardIds: string[] }
  | { kind: "trace_amani" }
  | { kind: "tdatd_amani_bounce" }
  | { kind: "advance_sso_ice" }
  | { kind: "advance_sso_resolve"; cardId: string; amount?: number }
  | { kind: "tdatd_city_works_meat" }
  | { kind: "tdatd_oduduwa_encounter" }
  | { kind: "tdatd_oduduwa_place"; cardId: string; amount?: number }
  /** Whispers in Nalubaale (win) */
  | { kind: "win_contaminate" }
  | { kind: "win_embezzle" }
  | { kind: "win_embezzle_named"; cardType: string }
  | { kind: "win_slipstream" }
  | { kind: "win_gebrselassie_host" }
  | { kind: "win_compile_bottom_of_stack" }
  | { kind: "bypass_current_encounter" }
  | { kind: "lose_remaining_clicks" }
  | { kind: "win_jackpot_place_credit" }
  | { kind: "win_jackpot_take_credits" }
  | { kind: "take_jackpot_credits_resolve"; amount: number }
  | { kind: "win_remote_enforcement" }
  | { kind: "win_remote_enforcement_pick_ice"; iceId: string }
  | { kind: "win_viral_weaponization" }
  | { kind: "win_standard_procedure" }
  | { kind: "win_standard_procedure_named"; cardType: string }
  | { kind: "win_intake_bounce" }
  | { kind: "ka_black_hat_bonus_access" }
  | { kind: "ka_market_forces" }
  | { kind: "give_tags_per_two_advancements" }
  | {
      kind: "trace_strength_equal_source_strength";
      onSuccess?: Effect;
      onFailure?: Effect;
    }
  | { kind: "mo_slot_machine_encounter" }
  | {
      kind: "mo_slot_machine_if_shared_type_gte";
      threshold: number;
      then: Effect;
    }
  | { kind: "beth_kilrain_corp_credit_tiers" }
  | { kind: "draw_shuffled" }
  | { kind: "lose_2_per_resource_or_trash" }
  /**
   * Titanium Ribs: the Runner's picks for damage being suffered. The last
   * pick trashes them together and finishes the damage. Set by the engine;
   * card data does not author this kind.
   */
  | {
      kind: "suffer_chosen_damage";
      damage: "net" | "meat" | "core" | "brain";
      amount: number;
      damageSourceId: string;
      beforeCore: number;
      count: number;
      picked: string[];
    }
  | { kind: "prevent_labyrinthine_jack_out" }
  | { kind: "universal_connectivity_fee_sub" }
  /**
   * Spend [click] as an additional cost (CR 1.16.10): the Corp's by default
   * (Reuse), the Runner's with `side: "runner"` (Strongbox's steal cost).
   */
  | { kind: "spend_click_additional_cost"; side?: "corp" | "runner" }
  | { kind: "corp_lose_two_if_can" }
  | { kind: "trade_in_record_hw"; cardId: string }
  | { kind: "bottom_top"; cardId: string }
  | { kind: "spend_shi_kyu_for_net_damage" }
  | { kind: "inazuma_lock_breaking_next_encounter" }
  | { kind: "redirect_susanoo_to_archives" }
  | { kind: "express_delivery_finish"; pickId: string; restIds?: string[] }
  | { kind: "take_runner_deck_card_to_grip"; cardId: string }
  | { kind: "draw_from_stack_bottom"; side?: SideRef; amount?: number }
  | { kind: "break_all_but_n_subroutines_on_encounter"; leave?: number }
  | { kind: "spend_push_your_luck_secret_guess" }
  | { kind: "score_agenda_from_hq"; cardId: string }
  | { kind: "break_all_destroyer_subroutines_on_encounter" }
  /** Engine-built: an optional part was carried out, so a once-per-run ability is used (CR 9.6.9d). */
  | { kind: "mark_ability_used_this_run"; abilityId: string }
  /** Escher: may instead of breach HQ — rearrange any ice on any servers. */
  | { kind: "rearrange_ice_instead_of_breach" }
  /** Chum: next ice +strength; if not fully broken at encounter end → net damage. */
  | {
      kind: "chum_register_next_ice";
      strengthBonus: number;
      netDamageIfNotFullyBroken: number;
    }
  /**
   * Sensei: for remainder of run, other ice encounters gain ETR after printed.
   */
  | { kind: "sensei_register_etr_on_other_ice_for_run" }
  | { kind: "ryo_phoenix_on_successful_run" }
  | { kind: "access_random_hq" }
  | { kind: "forged_activation_orders" }
  | { kind: "offer_forged_activation_orders_rez"; cardId: string }
  | { kind: "troubleshooter_fortify" }
  /** Follow-up: spend X¢, give chosen ice +X strength this turn. */
  | { kind: "fortify_ice_spend_x_resolve"; iceId: string; amount: number }
  /**
   * Nanisivik Grid: may turn 1 facedown ice in Archives faceup; if you do,
   * resolve 1 subroutine on that ice.
   */
  | { kind: "may_flip_archives_ice_resolve_subroutine" }
  /** Leaf: flip specific Archives ice faceup and resolve one subroutine. */
  | {
      kind: "flip_archives_ice_resolve_subroutine";
      iceId: string;
      subIndex: number;
    }
  /** Draw cards until the Corp's HQ (hand) has at least `amount` cards. */
  | { kind: "draw_until_hq_has"; amount: number }
  /** Matryoshka: turn each hosted card faceup. */
  | { kind: "turn_hosted_cards_faceup" }
  /**
   * Matryoshka break: pay X¢, turn 1 faceup hosted copy facedown, break X
   * encounter subs (X chosen among affordable unbroken counts).
   */
  | { kind: "break_matryoshka" }
  /** Leaf: pay amount, turn hostedId facedown, break amount subs. */
  | {
      kind: "break_resolve";
      amount: number;
      hostedId: string;
    }
  /** Hush: move this trojan onto another installed ice. */
  | { kind: "rehost_on_other_ice" }
  /** Leaf: rehost source onto a specific ice instance. */
  | { kind: "rehost_to_ice"; iceId: string }
  | { kind: "ayla_set_aside_to_grip"; cardId?: string }
  /** Sabotage N — Corp trashes N from HQ and/or R&D top (CR §10.12). */
  | { kind: "sabotage"; amount: number; interactive?: boolean }
  /** Identify the mark (CR §10.11.2); no-op if already designated this turn. */
  | { kind: "identify_mark" }
  /**
   * Start a run on the current mark (CR §10.11).
   * Queues `pendingStartRunOnMark` for the host to begin the run after the
   * current effect tree (e.g. Carpe Diem may-run choice).
   * No-op if there is no mark.
   */
  | { kind: "start_run_on_mark" }
  /**
   * Charge — place 1 power counter on a card that already has ≥1 (CR §10.10).
   * `self` targets the source; `choose` picks among the controller's installed
   * chargeable cards; `card` targets a specific instance (pending options).
   */
  | {
      kind: "charge";
      pick: "self" | "choose" | "card";
      cardId?: string;
    }
  /**
   * Add N bonus central accesses to the current run's breach
   * (Virtuoso HQ-mark branch; Jailbreak-style multi-access).
   */
  | {
      kind: "bonus_access";
      amount: number;
      /** Mercury: its once per turn is used when the bonus is taken. */
      oncePerTurn?: "mercury";
    }
  /** Leaf: one Fully Operational choose step; continues while remaining > 0. */
  | { kind: "fully_operational_step"; remaining: number }
  /** Leaf: grant one ice subtype to the current encounter. */
  | { kind: "grant_encounter_ice_subtype"; subtype: string }
  /** Leaf: resolve Loot Box pick among revealed stack ids. */
  | {
      kind: "pick_revealed";
      cardId: string;
      revealedIds: string[];
    }
  /**
   * For each ice passed this run, resolve one unused option from `options`
   * (Into the Depths exclusive multi-choice). Resolves min(passed, options)
   * times; each option id at most once. Uses `pendingExclusiveChoices` so
   * nested charge/search choices resume correctly.
   */
  | {
      kind: "exclusive_choices_per_passed_ice";
      options: ChoiceOption[];
    };
