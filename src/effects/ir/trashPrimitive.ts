/**
 * Effect IR: the `Primitive` members whose procedure is trash.
 * Their handlers are in `../kinds/trashKinds.ts` (or elsewhere in `effects/`).
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
import type { Effect } from "./effect.js";

export type TrashPrimitive =
  | {
      kind: "trash_program";
      pick: "first" | "choose";
      aiOnly?: boolean;
      /** Hammer: skip programs with any of these subtypes. */
      excludeSubtypes?: string[];
      /** Bumi 1.0: only programs with any of these subtypes. */
      includeSubtypes?: string[];
    }
  | {
      kind: "trash_resource";
      pick: "first" | "choose";
      cannotPrevent?: boolean;
    }
  | { kind: "trash_then_corp_rez_or_hq" }
  | { kind: "trash_project_ares_next" }
  | { kind: "trash_next" }
  | { kind: "trash_from_grip"; cardId: string }
  | { kind: "trash_installed_runner_card"; cardId: string }
  /** Sell Out: Runner trashes one of their own installed resources. */
  | { kind: "trash_own_resource" }
  /** Spec Work: Runner trashes one of their own installed programs. */
  | { kind: "trash_own_program" }
  | { kind: "trash_data_hound_looked"; cardId: string }
  | { kind: "corp_trash_ice_protecting_server"; serverId: string }
  | { kind: "corp_trash_ice_card"; cardId: string }
  /** Foxfire: trash 1 virtual resource or 1 link card. */
  | {
      kind: "trash_virtual_resource_or_link_card";
      pick: "first" | "choose";
    }
  | {
      kind: "trash_hq";
      /**
       * `"random"` trashes cards at random. Any other value has the Corp
       * choose the cards (CR 1.15.2); `"first"` is kept as a spelling of
       * that for existing card data.
       */
      pick: "first" | "choose" | "random";
      amount?: number;
      /** Trash any number of cards up to `amount`, including none. */
      upTo?: boolean;
      /**
       * Reveal the chosen cards before trashing them, so they go to
       * Archives faceup (Plutus's rez cost; CR 1.21.3, 4.4.6b).
       */
      reveal?: boolean;
      then?: Effect;
    }
  /** Leaf: trash a specific card from HQ. */
  /** `by`: the player the text says trashes the card, when not the controller (CR 1.14.5). */
  | { kind: "trash_hq_card"; cardId: string; by?: "corp" | "runner" }
  | { kind: "trash_hardware"; pick: "first" | "choose" }
  /**
   * Power Grid Overload: trash 1 installed hardware with install cost ≤
   * `turn.lastTraceExcess`.
   */
  | {
      kind: "trash_hardware_install_cost_lte_last_trace_excess";
      pick: "first" | "choose";
    }
  /**
   * Freelancer: trash up to `n` installed resources (decline or choose sequentially).
   * `remaining` is internal for the recursive choice chain.
   */
  | { kind: "trash_up_to_n_resources"; n: number; remaining?: number }
  /**
   * Paper Trail: trash every installed resource that has any of the listed
   * subtypes (e.g. connection / job).
   */
  | {
      kind: "trash_installed_resources_with_any_subtype";
      subtypes: string[];
    }
  /** Elizabeth Mills: trash 1 installed resource with the given subtype. */
  | {
      kind: "trash_installed_resource_with_subtype";
      subtype: string;
      pick: "first" | "choose";
    }
  /**
   * Run Amok: trash 1 ice that was rezzed during the current/just-ended run.
   */
  | {
      kind: "trash_ice_rezzed_this_run";
      pick: "first" | "choose";
    }
  | {
      kind: "trash_program_or_hardware";
      pick: "first" | "choose";
    }
  | { kind: "trash_resource_or_hardware"; pick: "first" | "choose" }
  /** Internal: trash up to `remaining` installed programs (Corp chooses). */
  | { kind: "trash_n_programs_remaining"; remaining: number }
  /**
   * Trash any number of rezzed Corp cards; give the Runner 1 tag per
   * card trashed (Mutually Assured Destruction). Iterative Corp choice.
   */
  | { kind: "trash_any_rezzed_give_tags" }
  /** Leaf: trash one looked R&D card during Cultivate. */
  | { kind: "trash_cultivate_looked"; cardId: string }
  | { kind: "trash_self" }
  /**
   * Bioroid Efficiency Research onHostFullyBrokenThisEncounter: capture host
   * ice id, trash self, then derez host if it is rezzed ice.
   */
  | { kind: "trash_self_and_derez_host" }
  | { kind: "trash_attacked_server_root" }
  | { kind: "trash_installed_runner"; pick: "first" | "choose" }
  /**
   * May trash 1 card from grip to draw 1 (Abaasy). Decline / empty grip = no-op.
   */
  | { kind: "may_trash_from_grip_to_draw" }
  /** Leaf: trash a specific grip card then draw 1. */
  | { kind: "trash_grip_card_draw"; cardId: string }
  /** May trash 1 card from the Runner's grip (Vera Ivanovna). */
  | { kind: "may_trash_one_from_grip" }
  /** Leaf: trash a specific grip card. */
  | { kind: "trash_grip_card"; cardId: string }
  /**
   * Moshing-class: trash `amount` cards from grip (auto-pick from end of hand).
   * Used as playAdditionalCost after the event has left grip.
   */
  | { kind: "trash_n_from_grip"; amount: number }
  /**
   * Freelance Coding Contract: trash up to `remaining` matching cards from
   * the grip (self-recursing chooser), gaining `per` credits each.
   */
  | {
      kind: "trash_up_to_grip_cards_gain_credits_each";
      remaining: number;
      per: number;
      types?: Array<"program" | "hardware" | "resource">;
    }
  /**
   * Methuselah: may trash 1 hardware from grip; if so, place `amount`
   * hosted credits on source.
   */
  | {
      kind: "may_trash_hardware_from_grip_place_hosted_credits";
      amount: number;
    }
  /** Leaf: trash grip hardware then place hosted credits on source. */
  | {
      kind: "trash_grip_hardware_place_hosted_credits";
      cardId: string;
      amount: number;
    }
  /**
   * Hafrún: may trash 1 from HQ; if so, continue with `then`
   * (choose installed Runner card → forbid break for run).
   */
  | { kind: "may_trash_hq_then"; then: Effect }
  | { kind: "trash_hq_reencounter_passed_ice" }
  /** Follow-up: trash the chosen HQ card and reencounter (Sisyphus Protocol). */
  | { kind: "trash_hq_reencounter_passed_ice_resolve"; cardId: string }
  /**
   * Game Over: Corp chooses a Runner card type; trash all installed
   * non-icebreaker cards of that type; Runner may pay 3¢ per card to prevent.
   */
  | { kind: "trash_type_may_pay_3_prevent" }
  /**
   * Ganked!: trash this card, then Corp chooses a rezzed piece of ice
   * protecting this server; Runner encounters that ice (reencounterIceId).
   */
  | { kind: "trash_self_choose_rezzed_protecting_ice_encounter" }
  /** Mystic Maemi: trash N random cards from grip. */
  | { kind: "trash_random_from_grip"; amount: number }
  /**
   * Paladin Poemu: Runner must trash 1 of their installed cards
   * (chooser; may include source).
   */
  | { kind: "trash_must_own_installed" }

  /** Kakurenbo: trash any number of cards from HQ (incl. zero). */
  | { kind: "trash_any_number_from_hq" }
  /** Internal: after Climactic server pick — Corp may trash ice or decline. */
  | { kind: "may_corp_trash_climactic_ice"; serverId: string }
  /** Internal: trash chosen ice protecting Climactic server. */
  | { kind: "trash_climactic_ice"; cardId: string }
  /** Whistleblower: may trash self to name; steal that agenda ignoring costs. */
  | { kind: "may_trash_name_agenda_steal_ignore_costs" }
  /** Trash a specific Corp installed card (ice / asset / upgrade / agenda). */
  | { kind: "trash_corp_card"; cardId: string }
  /**
   * May trash another Corp installed card (Svyatogor / Extract / Stavka).
   * Opens a Corp choice when ≥1 eligible target exists; decline is always
   * offered. When a target is chosen, trash it then evaluate optional
   * `then` ("if you do"). No-op (no choice) when no eligible targets.
   * Targets any installed Corp card (rezzed or not); excludes score area.
   */
  | {
      kind: "may_trash_installed";
      /** Exclude the effect source from targets (default true). */
      excludeSelf?: boolean;
      /** Only rezzed Corp cards (Kimberlite Field). */
      rezzedOnly?: boolean;
      then?: Effect;
    }
  /**
   * Mandatory trash 1 installed Corp card (LEO Labor Solutions).
   * No Decline option.
   */
  | {
      kind: "trash_installed";
      rezzedOnly?: boolean;
      includeSubtypes?: string[];
      attackedServerOnly?: boolean;
      then?: Effect;
    }
  /**
   * Chain Reaction: trash `count` installed Corp cards; chooser picks each.
   * Recursive: after each trash, require remaining count.
   */
  | {
      kind: "trash_n_installed_corp";
      count: number;
      chooser: "runner" | "corp";
    }
  /** Leaf: trash one Corp card then continue trash_n with remaining. */
  | {
      kind: "trash_corp_card_then_trash_n";
      cardId: string;
      remaining: number;
      chooser: "runner" | "corp";
    }
  /**
   * Trash 1 installed Runner card with printed install cost ≤
   * `turn.lastTrashedRezzedPrintedRezCost` (Kimberlite Field).
   */
  | {
      kind: "trash_installed_runner_lte_last_trashed_rez";
      pick: "first" | "choose";
    }
  /**
   * Must trash another Corp installed card (Azef Protocol score cost).
   * Opens a Corp choice when ≥1 eligible target exists; decline is NOT
   * offered. Returns failure when no eligible targets (caller should gate).
   */
  | {
      kind: "trash_must_installed";
      /** Exclude the effect source from targets (default true). */
      excludeSelf?: boolean;
    }
  | { kind: "trash_rezzed_accessed" }
  /** Security Subcontract: trash a rezzed ice, then gain credits. */
  | { kind: "trash_rezzed_ice_gain_credits"; amount: number }
  | {
      kind: "trash_rezzed_ice_gain_credits_resolve";
      cardId: string;
      amount: number;
    }
  | { kind: "trash_looked"; cardId: string }
  | { kind: "trash_rd"; amount: number }
  | { kind: "trash_runner_install_lte"; maxInstallCost: number }
  | { kind: "trash_looked_program"; cardId: string }
  | { kind: "trash_grip_draw_for_installed_dupes" }
  /** Capstone: trash the chosen grip cards, then draw per installed copy. */
  | { kind: "trash_capstone_grip_card"; cardIds: string[] }
  | { kind: "corp_trash_from_hq" }
  | { kind: "trash_exec_sysop_clone_remove_bp" }
  | {
      kind: "trash_installed_corp_card";
      cardId: string;
      /** The ability revealed the card, so it goes to Archives faceup (CR 1.21.6, 4.4.6b). */
      revealed?: boolean;
    }
  | { kind: "trash_rezzed_ice_additional_cost" }
  | { kind: "trash_per_tag" }
  | { kind: "trash_per_tag_continue"; remaining: number }
  | { kind: "trash_will_o_wisp_breaker_used" }
  | { kind: "trash_one_installed_runner_program" }
  | { kind: "trash_connection"; cardId: string }
  | { kind: "trash_twins_hq_copy_reencounter" }
  | { kind: "trash_chop_bot_installed_then_draw_or_remove_tag" }
  | { kind: "trash_chop_bot_then_choose"; cardId: string }
  | { kind: "trash_programs" }
  | { kind: "trash_program_pick"; cardId: string; remaining: number }
  | { kind: "trash_rezzed_copy"; defId: string }
  | {
      kind: "trash_hardware_with_subtype";
      subtype: string;
      pick: "first" | "choose";
    }
  | { kind: "trash_remote_root" }
  | { kind: "trash_all_resources_unless_remove_bad_publicity" }
  | { kind: "trash_all_resources" }
  | { kind: "trash_all_installed_corp_cards" }
  | { kind: "trash_installed_prevent_damage"; amount: number }
  | { kind: "trash_own_installed"; cardId: string }
  | {
      kind: "trash_draw";
      /** Filled by the pick: the installed cards to trash. */
      cardIds?: string[];
    }
  | { kind: "trash_rezzed_gain_trash_cost" }
  | { kind: "trash_rezzed_paying_trash_cost" }
  | { kind: "trash_political_operative_resolve"; cardId: string }
  | { kind: "trash_stack_pick"; cardId: string }
  /** Salem's Hospitality: reveal the grip, trash the cards with this title. */
  | { kind: "trash_named"; title: string }
  /** The Liberated Mind (tlm) */
  | { kind: "trash_all_cards_from_grip" }
  | { kind: "trash_own_resource_with_subtype"; subtype: string }
  | { kind: "trash_own_resource_with_subtype_resolve"; cardId: string }
  | { kind: "trash_named_type"; cardType: string }
  | { kind: "trash_resolve"; cardId: string }
  | { kind: "trash_hq_draw"; amount?: number }
  /** 23 Seconds (23s) Flashpoint */
  | { kind: "trash_null_grip_lower_encountered_ice_strength"; amount?: number }
  | { kind: "trash_null_grip_card_resolve"; cardId: string; amount?: number }
  | { kind: "trash_hellion_beta_two_installed_non_program" }
  | { kind: "trash_hellion_beta_pick"; cardId: string; remaining: number }
  | { kind: "trash_frantic_coding_looked"; lookedIds: string[] }
  | { kind: "trash_installed_with_install_cost_lte_tags" }
  | { kind: "trash_one_program_used_this_run_cannot_prevent" }
  | { kind: "trash_program_cannot_prevent"; cardId: string }
  | { kind: "trash_installed_virus"; pick?: "first" | "choose" }
  | { kind: "trash_installed_virus_resolve"; cardId: string }
  /** Station One (so) Red Sand */
  | { kind: "trash_severnius_grip_run_hq_or_rd" }
  | { kind: "trash_severnius_one_grip"; cardId: string }
  | { kind: "trash_random_hq_per_power_on_self" }
  | { kind: "trash_per_power" }
  | { kind: "trash_installed_icebreaker" }
  | { kind: "trash_program_or_top_2_stack" }
  | { kind: "trash_hunter_seeker_installed" }
  | { kind: "trash_one_from_grip" }
  /** Earth's Scion (eas) Red Sand #3 */
  | { kind: "may_trash_stack_top_then_trash_rd_per_resolved" }
  | { kind: "trash_aginfusion_approached_unrezzed_redirect" }
  | { kind: "trash_hq_place_total_2_advancements" }
  | { kind: "trash_warroid_one"; cardId: string }
  | { kind: "trash_loop" }
  | { kind: "runner_trash_standoff_after"; cardId: string }
  | { kind: "corp_trash"; cardId: string }
  | { kind: "trash_whampoa_hq_archives_to_rd_bottom" }
  | { kind: "trash_shortage_random_grip" }
  | {
      kind: "runner_trash_continue";
      cardType: "resource" | "hardware" | "program";
      trashed: string[];
      remaining: string[];
    }
  | { kind: "trash_top_rd_equal_damage_suffered_this_turn" }
  | { kind: "trash_wake_up_call"; cardId: string }
  | { kind: "trash_emergent_continue"; trashedCost: number }
  | {
      kind: "trash_emergent_one";
      cardId: string;
      trashedCost: number;
    }
  | { kind: "trash_bacterial_one"; cardId: string }
  | { kind: "trash_distract_hq_shuffle_archives" }
  | {
      kind: "trash_distract_hq_one";
      cardId: string;
      remainingAfter: number;
    }
  | { kind: "trash_trojan_horse" }
  | { kind: "trash_trojan_horse_resolve"; cardId: string }
  | { kind: "trash_sadaka_hq_then_resource" }
  | { kind: "trash_sadaka_hq_resolve"; cardId: string }
  | { kind: "trash_sadaka_resource"; cardId: string }
  | { kind: "trash_installed_not_matching_runner_identity_faction" }
  | { kind: "trash_any_rezzed_gain_3_each" }
  | { kind: "trash_rezzed_card"; cardId: string }
  | { kind: "trash_chronos_pick"; cardId: string }
  | { kind: "trash_hq_gain_credits" }
  | { kind: "trash_hq_tick" }
  | { kind: "trash_hq_gain_credits_finalize" }
  | { kind: "trash_hardware_additional_cost" }
  | { kind: "trash_all_hosted_cards" }
  | { kind: "trash_co_looked_rd_card"; cardId: string }
  | { kind: "trash_passed_unrezzed_ice" }
  /** Follow-up: trash the chosen passed unrezzed ice (En Passant). */
  | { kind: "trash_passed_unrezzed_ice_resolve"; cardId: string }
  /**
   * ZATO City Grid: trash the currently encountered ice, resolve the chosen
   * subroutine, and mark remaining subs broken (encounter ends).
   */
  | { kind: "trash_encounter_ice_resolve_subroutine"; subIndex: number }
  /**
   * Knickknack O'Brian: may trash another installed Runner card; gain ¢ equal
   * to its printed install cost and draw 1.
   */
  | { kind: "may_trash_other_installed_gain_printed_install_and_draw" }
  /** Arruaceiras: trash encountered ice if effective strength ≤ maxStrength. */
  | { kind: "trash_encounter_ice_if_strength_lte"; maxStrength: number }
  | { kind: "trash_aesop_for_credits"; amount: number }
  | { kind: "trash_aesop_for_credits_resolve"; cardId: string; amount: number }
  /**
   * The Price: trash top `count` of stack to heap; may install 1 of those
   * cards paying `discount`¢ less (remainder stay in heap).
   */
  | {
      kind: "trash_top_n_may_install_discount";
      count: number;
      discount: number;
    }
  /** Leaf: trash the top card of the Runner's stack (no-op if empty). */
  | { kind: "trash_top_of_stack" }
  /** Trash the top card of R&D (The Basalt Spire). */
  | { kind: "trash_top_of_rd" }
  /**
   * World Tree: may trash 1 other installed Runner card; if so, search stack
   * for 1 card of the same type and install it paying `discount`¢ less
   * (shuffle after search). Decline / no other installed = no-op.
   */
  | {
      kind: "may_trash_other_installed_search_stack_same_type_install";
      discount: number;
    }
  /** Leaf: trash a specific installed Runner card to heap. */
  | { kind: "trash_runner_rig_card"; cardId: string }
  /** Like trash_runner_rig_card, but also records installCost for Scavenge. */
  | { kind: "trash_runner_rig_card_record_program_cost"; cardId: string };
