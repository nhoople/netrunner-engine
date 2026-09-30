/**
 * Minimal effect IR for card data / stubs.
 * Hand-authored AST — not a CR / nodes.json compiler.
 *
 * Shape: seq | do | if | prevent | choose
 * Unknown IR nodes fail closed at load/eval time.
 */

export type SideRef = "corp" | "runner" | "payer" | "controller";

/** How long a breaker strength pump lasts. Default: encounter. */
export type PumpDuration = "encounter" | "run";

/** Leaf actions the host knows how to execute. */
export type Primitive =
  | { kind: "end_the_run" }
  /** Transport Monopoly: this run cannot be declared successful. */
  | { kind: "prevent_declare_run_successful" }
  | { kind: "gain_credits"; side: SideRef; amount: number }
  /**
   * Side loses up to `amount` credits. Optional `then` is "if they do" —
   * evaluates only when at least 1 credit was actually lost (PAN-Weave).
   */
  | {
      kind: "lose_credits";
      side: SideRef;
      amount: number;
      then?: Effect;
      /** Transfer of Wealth: gain per credit actually lost. */
      gainPerCreditLost?: { side: SideRef; per: number };
    }
  /** Side loses all credits in their credit pool (Closed Accounts). */
  | { kind: "lose_all_credits"; side: SideRef }
  | {
      kind: "pump_strength";
      amount: number;
      /** Default encounter-scoped; `"run"` lasts until the run ends. */
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
  | { kind: "net_damage"; amount: number }
  /** Philotic: 1 net damage per agenda in the Runner's score area. */
  | { kind: "net_damage_per_runner_scored_agenda" }
  /**
   * Sting!: do 1 + (copies of source title in the other player's score area)
   * net damage.
   */
  | { kind: "net_damage_1_plus_copies_of_source_title_in_other_score_area" }
  | {
      kind: "meat_damage";
      amount: number;
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
  /** Older synonym for core_damage (CR §10.4.2c). */
  | { kind: "brain_damage"; amount: number }
  | { kind: "give_tags"; amount: number }
  /**
   * Give the Runner `base` + (`per` × source advancement tokens) tags
   * (Chekist Scion: base 1 + 1 per hosted advancement).
   */
  | { kind: "give_tags_per_advancement"; base?: number; per?: number }
  /** Midseason Replacements: give tags equal to turn.lastTraceExcess. */
  | { kind: "give_tags_equal_to_last_trace_excess" }
  /** Indexing: may look top 5 R&D arrange instead of breach. */
  | { kind: "indexing_may_instead_of_breach" }
  | { kind: "indexing_instead_of_breach_arrange" }
  /** Mr. Li: draw N then put 1 of those drawn on bottom of stack. */
  | { kind: "draw_n_then_bottom_one_of_drawn"; amount: number }
  | { kind: "bottom_drawn_card"; cardId: string }
  /** Midori: may swap approached ice with ice from HQ (unrezzed), then Runner may jack out. */
  | { kind: "midori_may_swap_approached_ice_with_hq" }
  | {
      kind: "midori_swap_approached_ice_with_hq";
      replacementIceId: string;
    }
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
  | { kind: "choose_forfeit_runner_scored_agenda" }
  | { kind: "forfeit_runner_scored_agenda"; cardId: string }
  | { kind: "false_echo_trash_then_corp_rez_or_hq" }
  | { kind: "rez_ice_by_id"; iceId: string }
  | { kind: "move_unrezzed_ice_to_hq"; iceId: string }
  | { kind: "caissa_pawn_host_outermost_central" }
  | { kind: "caissa_rook_host" }
  | { kind: "caissa_bishop_host" }
  | { kind: "caissa_advance_host_inward_or_install" }
  | { kind: "eureka_reveal_install_or_trash"; discount: number }
  | { kind: "record_reconstructor_archives_instead_of_breach" }
  | { kind: "profiteering_on_score" }
  | { kind: "copycat_jump_to_rezzed_copy" }
  | { kind: "copycat_continue_from_ice"; iceId: string }
  | { kind: "install_caissa_from_zone_ignore_costs"; cardId: string }
  | { kind: "project_ares_on_score"; past: number }
  | { kind: "project_ares_trash_next" }
  | {
      kind: "invasion_of_privacy";
      traceStrength?: number;
    }
  | { kind: "invasion_of_privacy_success" }
  | { kind: "invasion_of_privacy_trash_next" }
  | { kind: "invasion_of_privacy_finish" }
  | { kind: "trash_from_grip"; cardId: string }
  | { kind: "trash_installed_runner_card"; cardId: string }
  /** Sell Out: Runner trashes one of their own installed resources. */
  | { kind: "trash_own_resource" }
  /** Spec Work: Runner trashes one of their own installed programs. */
  | { kind: "trash_own_program" }
  | {
      kind: "trace";
      strength: number;
      onSuccess: Effect;
      onFailure?: Effect;
      /** When true, leave state.trace pending for host intents. */
      interactive?: boolean;
    }
  | { kind: "draw"; side: SideRef; amount: number }
  /** Kingmaking: draw up to N cards (auto draws min(N, deck size)). */
  | { kind: "draw_up_to"; side: SideRef; amount: number }
  /** Kingmaking: may add one HQ agenda with AP ≤ max to Corp score. */
  | { kind: "may_add_hq_agenda_ap_lte_to_score"; maxAgendaPoints: number }
  /** Leaf: move HQ agenda into Corp score area (Kingmaking; ignores adv req). */
  | { kind: "add_hq_agenda_to_score"; cardId: string }
  /** Cohort: may turn 1 facedown Archives card faceup; if so, then. */
  | { kind: "may_turn_facedown_archives_faceup_then"; then: Effect }
  | { kind: "turn_archives_card_faceup"; cardId: string; then?: Effect }
  | { kind: "add_agenda_counter"; amount: number }
  | {
      kind: "add_agenda_counters_from_overadvance";
      past: number;
      /** Counters = floor((advancements - past) / per). Default per=1. */
      per?: number;
      /**
       * When set, counters = (advancements - past) × countersPerExcess
       * (Embedded Reporting Dividends 2).
       */
      countersPerExcess?: number;
    }
  | { kind: "remove_agenda_counters"; amount: number }
  | { kind: "lose_clicks"; side: SideRef; amount: number }
  | { kind: "gain_clicks"; side: SideRef; amount: number }
  | { kind: "take_hosted_credits"; amount: number }
  | { kind: "place_hosted_credits"; amount: number }
  | { kind: "add_virus_counter"; amount: number }
  /** Darwin: may pay credits to place virus counters on self. */
  | { kind: "may_pay_credits_add_virus_counter"; credits: number; amount: number }
  | { kind: "pay_credits_add_virus_counter"; credits: number; amount: number }
  /** Surge: place virus on a program that received virus this turn. */
  | {
      kind: "place_virus_on_program_that_received_virus_this_turn";
      amount: number;
    }
  | { kind: "place_virus_on_program"; cardId: string; amount: number }
  /** Replicator: may search stack for copy of last installed hardware → grip. */
  | { kind: "may_search_stack_copy_of_last_installed_hardware_add_to_grip" }
  | {
      kind: "search_stack_copy_of_last_installed_hardware_add_to_grip";
    }
  /** Data Hound: look top lastTraceExcess of stack, trash 1, arrange rest. */
  | { kind: "look_top_last_trace_excess_stack_trash_one_arrange_rest" }
  | { kind: "data_hound_trash_looked"; cardId: string }
  | {
      kind: "data_hound_arrange_looked";
      order: string[];
    }
  /** Kraken: Runner chooses server; Corp trashes 1 ice protecting it. */
  | { kind: "choose_server_corp_trash_ice_protecting" }
  | { kind: "corp_trash_ice_protecting_server"; serverId: string }
  | { kind: "corp_trash_ice_card"; cardId: string }
  /** Foxfire: trash 1 virtual resource or 1 link card. */
  | {
      kind: "trash_virtual_resource_or_link_card";
      pick: "first" | "choose";
    }
  | { kind: "remove_virus_counters"; amount: number }
  | { kind: "gain_credits_per_virus"; per: number }
  | { kind: "increase_hand_size"; side: SideRef; amount: number }
  | {
      kind: "trash_hq";
      pick: "first" | "choose" | "random";
      amount?: number;
      then?: Effect;
    }
  /** Leaf: trash a specific card from HQ. */
  | { kind: "trash_hq_card"; cardId: string }
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
  | { kind: "shuffle_hq_to_rd"; amount: number }
  | { kind: "shuffle_archives_to_rd"; amount: number }
  | { kind: "net_damage_agenda_points_this_turn" }
  | { kind: "forbid_scoring_agendas_this_turn" }
  /** Efficiency Committee: cannot advance any card for the remainder of this turn. */
  | { kind: "forbid_advance_this_turn" }
  /** Skip the discard step for the remainder of this turn (Midnight-3). */
  | { kind: "skip_discard_this_turn" }
  /** Logjam: place base + distinct faceup Archives types advancements on self. */
  | {
      kind: "place_advancements_on_self_per_faceup_archive_types";
      base?: number;
    }
  | {
      kind: "place_advancements";
      amount: number;
      preferNotInstalledThisTurn?: boolean;
      /**
       * Only target advanceable cards in the same server root as the source
       * (Vladisibirsk City Grid).
       */
      sameServerRootAsSource?: boolean;
      /**
       * Holo Man: target advanceable cards in the same server root OR ice
       * protecting that server.
       */
      sameServerRootOrIceAsSource?: boolean;
      /**
       * Isaac: only ice protecting the source upgrade's server with 0
       * advancement counters.
       */
      onlyIceProtectingSourceServerWithNoAdvancements?: boolean;
      /**
       * Cayambe Grid: any ice protecting the source upgrade's server.
       */
      onlyIceProtectingSourceServer?: boolean;
      /**
       * Holo Man: add this many extra advancements when Corp has not
       * installed from HQ this turn.
       */
      bonusAmountIfNoCorpInstallFromHqThisTurn?: number;
      /** Exclude the effect source from targets (default false). */
      excludeSelf?: boolean;
      /**
       * Target any installed ice (Tree Line expendable), not only
       * agendas / canAdvance cards.
       */
      anyInstalledIce?: boolean;
      /**
       * Jumon: any card in the root of a remote server (not ice / centrals).
       */
      onlyRemoteRoot?: boolean;
      /**
       * After placing, if the target can be scored, offer Corp a may-score
       * choice (Big Deal). `then` runs after the choice (or immediately when
       * scoring is impossible).
       */
      thenMayScore?: boolean;
      /** Continuation after place (and after thenMayScore choice, if any). */
      then?: Effect;
      /** Sericulture / PT Untaian: choose target (default `first`). */
      pick?: "first" | "choose";
      /** Push target into cannotScoreOrRezCardIds after placing. */
      cannotScoreTargetThisTurn?: boolean;
      /** Only unrezzed installed cards. */
      unrezzedOnly?: boolean;
    }
  /**
   * Move the source card into the Corp score area as an agenda worth
   * `agendaPoints` (Backroom Machinations). Overrides card.agendaPoints
   * when provided.
   */
  | { kind: "score_self_as_agenda"; agendaPoints?: number }
  /**
   * Add this card to the Runner's score area as an agenda worth
   * `agendaPoints` (Nightmare Archive: −1). Not a steal.
   * Optional `addSubtypes` merges subtypes onto the scored instance
   * (Jeitinho assassination).
   */
  | {
      kind: "add_to_runner_score_as_agenda";
      agendaPoints?: number;
      addSubtypes?: string[];
    }
  /**
   * Burner: reveal N random HQ cards; Runner moves `move` of them to
   * top and/or bottom of R&D (interactive).
   */
  | { kind: "burner_resolve"; reveal: number; move: number }
  /** Leaf: place a revealed HQ card on top or bottom of R&D; continue Burner. */
  | {
      kind: "burner_place";
      cardId: string;
      position: "top" | "bottom";
      revealed: string[];
      movesLeft: number;
    }
  /** Cataloguer: set `run.skipBreach` on the current run. */
  | { kind: "set_run_skip_breach" }
  /**
   * Cataloguer paid ability: begin a standalone breach of the named server
   * (Virtuoso post-run shell; not a successful run).
   */
  | {
      kind: "breach_server_standalone";
      server: "rd" | "hq" | "archives" | string;
      /** Mind's Eye: exclude cards in the server root during this breach. */
      cannotAccessRoot?: boolean;
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
  /**
   * Muse onInstall: choose stack/heap/grip → non-daemon program →
   * trojan on ice else host on Muse (daemonHost).
   */
  | { kind: "muse_search_install_non_daemon" }
  /** Leaf: Muse search a specific zone for a non-daemon program. */
  | { kind: "muse_search_zone"; zone: "stack" | "heap" | "grip" }
  /** Leaf: install Muse-picked program (trojan → choose ice; else host on Muse). */
  | {
      kind: "muse_install_picked";
      cardId: string;
      from: "stack" | "heap" | "grip";
    }
  /** Leaf: install Muse-picked trojan hosted on ice. */
  | {
      kind: "muse_install_on_ice";
      cardId: string;
      iceId: string;
      from: "stack" | "heap" | "grip";
    }
  /** Leaf: install Muse-picked non-trojan hosted on Muse. */
  | {
      kind: "muse_install_on_daemon";
      cardId: string;
      from: "stack" | "heap" | "grip";
    }
  /**
   * Wizard's Chest: choose type → set aside until `untilCount` of that type →
   * may install 1 ignoring costs → shuffle rest.
   */
  | {
      kind: "wizard_chest_resolve";
      untilCount: number;
      ignoreAllCosts: boolean;
    }
  /** Leaf: Wizard's Chest after type chosen. */
  | {
      kind: "wizard_chest_for_type";
      cardType: "hardware" | "program" | "resource";
      untilCount: number;
      ignoreAllCosts: boolean;
    }
  /** Leaf: install a set-aside card ignoring costs (Wizard's Chest). */
  | { kind: "wizard_chest_install"; cardId: string }
  /**
   * Jeitinho: if Runner has ≥ `amount` assassination agendas in score area,
   * Runner wins.
   */
  | { kind: "check_assassination_win"; amount: number }
  /** Leaf: spend clicks and install a heap hardware (Jeitinho bypass). */
  | {
      kind: "install_heap_paying_click";
      cardId: string;
      clickCost: number;
    }
  /**
   * Corp may pay `amount` credits to do `damage` core damage
   * (Mr. Hendrik). Opens interactive pendingDamage with
   * preventByLoseAllClicks when the Runner has clicks remaining.
   */
  | {
      kind: "may_pay_credits_for_core_damage";
      amount: number;
      damage: number;
    }
  /**
   * Cerebral Overwriter: like may_pay_credits_for_core_damage but damage
   * equals the source's advancement tokens. If damage is 0 or Corp cannot
   * afford `amount`, only Decline is offered.
   */
  | {
      kind: "may_pay_credits_for_core_damage_per_advancement";
      amount: number;
    }
  /**
   * Project Junebug: pay `amount`¢ to do (`per` × advancement tokens) net
   * damage. If damage is 0 or Corp cannot afford `amount`, only Decline.
   */
  | {
      kind: "may_pay_credits_for_net_damage_per_advancement";
      amount: number;
      per: number;
    }
  /**
   * Aggressive Secretary: pay `amount`¢ to trash 1 installed program per
   * advancement token on the source. If advancements are 0 or Corp cannot
   * afford `amount`, only Decline.
   */
  | {
      kind: "may_pay_credits_for_trash_programs_per_advancement";
      amount: number;
    }
  /**
   * Neurostasis: pay `amount`¢ to shuffle 1 installed Runner card into the
   * stack per advancement token on the source.
   */
  | {
      kind: "may_pay_credits_for_shuffle_installed_runner_per_advancement";
      amount: number;
    }
  /** Internal: trash up to `remaining` installed programs (Corp chooses). */
  | { kind: "trash_n_programs_remaining"; remaining: number }
  /**
   * Internal: shuffle up to `remaining` installed Runner cards into the stack
   * (Corp chooses; Neurostasis).
   */
  | { kind: "shuffle_n_installed_runner_remaining"; remaining: number }
  /**
   * Successful Field Test: iteratively install any number of cards from HQ
   * ignoring all costs (Done allowed at each step).
   */
  | { kind: "install_any_number_from_hq_ignore_costs" }
  /**
   * Hostage: search stack for a card with `subtype`, add to grip, shuffle,
   * then may install that card paying costs.
   */
  | { kind: "search_stack_subtype_may_install"; subtype: string }
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
   * Queen's Gambit: place up to `max` advancements on 1 unrezzed card in a
   * remote root; gain `creditsPer`¢ per counter; that card cannot be accessed
   * for the remainder of the turn.
   */
  | {
      kind: "queens_gambit_place_up_to";
      max: number;
      creditsPer: number;
    }
  /** Internal: place N advancements, gain credits, forbid access this turn. */
  | {
      kind: "queens_gambit_place_on";
      cardId: string;
      amount: number;
      creditsPer: number;
    }
  /**
   * Blue Sun: may add 1 rezzed card to HQ and gain credits equal to its rez
   * cost.
   */
  | { kind: "may_return_rezzed_to_hq_gain_rez_cost" }
  /** Internal: return rezzed card to HQ and gain its rez cost. */
  | { kind: "return_rezzed_to_hq_gain_rez_cost"; cardId: string }
  /**
   * Bank Job: may take any number of hosted credits and skip breach
   * (successful remote run).
   */
  | { kind: "may_take_any_hosted_credits_skip_breach" }
  /** Internal: take N hosted credits then skip breach. */
  | { kind: "take_hosted_credits_skip_breach"; amount: number }
  /** Seidr: may put 1 Archives card on top of R&D. */
  | { kind: "may_add_archives_card_to_rd_top" }
  | { kind: "add_archives_card_to_rd_top"; cardId: string }
  /** Oversight AI: rez chosen ice ignore costs; host this card on it. */
  | { kind: "oversight_ai_rez_and_host" }
  | { kind: "oversight_ai_host_on_ice"; iceId: string }
  /** Bioroid Efficiency Research: rez chosen unrezzed bioroid ice; host this card. */
  | { kind: "ber_rez_bioroid_and_host" }
  | { kind: "ber_host_on_ice"; iceId: string }
  /**
   * Bravado: gain `base + per * (run.passedIceIds.length ?? 0)` credits.
   */
  | {
      kind: "gain_credits_base_plus_per_passed_ice";
      side: SideRef;
      base: number;
      per: number;
    }
  /**
   * Trash any number of rezzed Corp cards; give the Runner 1 tag per
   * card trashed (Mutually Assured Destruction). Iterative Corp choice.
   */
  | { kind: "trash_any_rezzed_give_tags" }
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
   * Harmony AR Therapy: Runner iteratively picks up to `max` heap cards
   * with distinct titles, then shuffles the selection into the stack.
   */
  | { kind: "shuffle_up_to_n_distinct_heap_titles_into_stack"; max: number }
  /** Internal follow-up for shuffle_up_to_n_distinct_heap_titles_into_stack. */
  | {
      kind: "shuffle_up_to_n_distinct_heap_titles_into_stack_continue";
      maxRemaining: number;
      selected: string[];
      usedTitles: string[];
    }
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
  /** Search R&D for the first ice, add to HQ (Wave). */
  | { kind: "search_rd_ice_to_hq" }
  /**
   * Tocsin: search R&D for up to one ice of each listed subtype; reveal and
   * add to HQ; shuffle.
   */
  | { kind: "search_rd_up_to_one_each_subtype_to_hq"; subtypes: string[] }
  /** Search R&D for the first operation, add to HQ (Gaslight). */
  | { kind: "search_rd_operation_to_hq" }
  /** Search R&D for the first operation or agenda, add to HQ, shuffle R&D (Pivot). */
  | { kind: "search_rd_operation_or_agenda_to_hq" }
  /** Digital Rights Management: search R&D for an agenda, reveal, add to HQ. */
  | { kind: "search_rd_agenda_to_hq" }
  /** Look at top N of R&D; may install one paying costs (Epiphany). */
  | { kind: "look_top_n_rd_may_install_one"; n: number; excludeAgenda?: boolean }
  /**
   * Architect Deployment Test: look at top N of R&D; may install and rez one
   * ignoring all costs (agendas install without rez).
   */
  | { kind: "look_top_n_rd_may_install_and_rez_ignore_costs"; n: number }
  /** Leaf: install+rez one card from `turn.rdLookedCards` ignoring costs. */
  | { kind: "install_rez_rd_looked_card_ignore_costs"; cardId: string }
  /** Leaf: install one card from `turn.rdLookedCards` paying installCost. */
  | { kind: "install_rd_looked_card_paying_costs"; cardId: string }
  /** Leaf: return remaining looked R&D cards to top of deck. */
  | { kind: "return_rd_looked_to_deck_top" }
  /** Look at top N of R&D and rearrange order (Federal Fundraising). */
  | { kind: "look_top_n_rd_arrange"; n: number; thenMayDrawIfUnprotected?: boolean }
  /**
   * Cultivate: look at top N of R&D; trash 1, add 1 to HQ, arrange the rest.
   */
  | { kind: "look_top_n_rd_trash_one_hq_one_arrange_rest"; n: number }
  /** Leaf: trash one looked R&D card during Cultivate. */
  | { kind: "cultivate_trash_looked"; cardId: string }
  /** Leaf: add one looked R&D card to HQ during Cultivate. */
  | { kind: "cultivate_hq_looked"; cardId: string }
  /**
   * Corp chooses a card type, looks at top of R&D; on match may reveal and
   * gain `credits` (Balanced Coverage).
   */
  | { kind: "look_top_1_rd_choose_type_may_reveal_gain"; credits: number }
  /** Leaf: peek top of R&D for chosen Corp card type (Balanced Coverage). */
  | {
      kind: "peek_rd_top_for_chosen_type_may_reveal_gain";
      cardType:
        | "agenda"
        | "asset"
        | "ice"
        | "operation"
        | "upgrade"
        | "event";
      credits: number;
    }
  /** Corp may reveal one agenda from HQ (Chrysopoeian Skimming). */
  | { kind: "corp_may_reveal_agenda_from_hq"; then?: Effect; else?: Effect }
  /** Leaf: reveal a card currently in HQ (faceup). */
  | { kind: "reveal_corp_hand_card"; cardId: string }
  /** Runner looks at top N of R&D; order unchanged (Chrysopoeian). */
  | { kind: "look_top_n_rd_peek"; n: number }
  /**
   * Search R&D for ice, shuffle, install outermost on source server, rez
   * paying `totalDiscount` less combined install+rez (Tucana).
   */
  | {
      kind: "search_rd_install_rez_ice_on_source_server";
      totalDiscount: number;
    }
  /** Leaf: install one searched ice id on source server and rez (Tucana). */
  | {
      kind: "install_rez_rd_ice_on_source_server";
      cardId: string;
      totalDiscount: number;
    }
  /**
   * On encounter: append ETR subs equal to Runner tags after printed subs
   * (Starlit Knight @ Threat 4).
   */
  | { kind: "etr_subroutines_per_runner_tags_on_encounter" }
  /** Leaf: place one looked card next on top during arrange. */
  | { kind: "rd_arrange_pick"; cardId: string }
  /** Threat follow-up: may play an operation or install from HQ (Pivot). */
  | { kind: "may_play_or_install_from_hq" }
  /** Leaf: play an operation from HQ paying playCost only. */
  | { kind: "play_hq_operation_paying_costs"; cardId: string }
  /** Gain credits equal to count of rezzed ice with subtype (Wave harmonic). */
  | { kind: "gain_credits_per_rezzed_subtype"; subtype: string; per?: number }
  /**
   * Side loses `per` × count of rezzed ice with subtype credits
   * (Pulse: Runner loses 1¢ per rezzed harmonic).
   */
  | {
      kind: "lose_credits_per_rezzed_subtype";
      side: SideRef;
      subtype: string;
      per?: number;
    }
  /**
   * Add 1 card from the Runner's heap to grip (Katorga Breakout).
   * `choose` opens a Runner pendingChoice when multiple heap cards exist.
   * Optional `cardId` moves that specific heap card (used by choose options).
   */
  | {
      kind: "add_from_heap_to_grip";
      pick: "first" | "choose";
      cardId?: string;
      /** District 99: only cards matching Runner identity faction. */
      matchingIdentityFaction?: boolean;
    }
  /**
   * Choose a rezzed bioroid ice; set cannotBreakWithRunnerCardAbilities on it
   * (Trieste Model Bioroids).
   */
  | { kind: "choose_rezzed_bioroid_forbid_runner_break" }
  /**
   * If no Corp cards were added to Archives this turn, score a facedown
   * agenda from Archives (Regenesis).
   */
  | { kind: "score_facedown_agenda_from_archives_if_clean" }
  /**
   * Remove up to `amount` advancement tokens from the source card.
   * Optional `then` runs only if at least one was removed (Mestnichestvo).
   */
  | { kind: "remove_advancements"; amount: number; then?: Effect }
  | { kind: "meat_damage_per_advancement" }
  | { kind: "net_damage_per_advancement"; base?: number }
  /** Vicsek: do X net and give X tags where X = current Runner tag count. */
  | { kind: "net_damage_and_tags_equal_runner_tags" }
  /**
   * Unleash: rez 1 installed unrezzed ice ignoring costs, then may resolve
   * 1 subroutine on that ice.
   */
  | { kind: "unleash_rez_may_resolve_sub" }
  /** Leaf: rez specific ice ignore costs, then may resolve one of its subs. */
  | { kind: "unleash_rez_ice_then_may_resolve_sub"; cardId: string }
  | { kind: "trash_self" }
  /**
   * Bioroid Efficiency Research onHostFullyBrokenThisEncounter: capture host
   * ice id, trash self, then derez host if it is rezzed ice.
   */
  | { kind: "trash_self_and_derez_host" }
  | { kind: "trash_attacked_server_root" }
  | { kind: "archives_to_hq"; amount: number }
  | { kind: "trash_installed_runner"; pick: "first" | "choose" }
  | { kind: "forbid_steal_trash_this_run" }
  /**
   * Instead of breaching the attacked server: access 1 root card of another
   * server; agendas accessed this way cannot be stolen/trashed (Pinhole).
   * Presets access candidates and clears skipBreach when candidates exist.
   */
  | { kind: "access_one_root_other_server" }
  /**
   * Install up to `max` cards from HQ into new remotes, place `advancements`
   * on each, and forbid scoring/rezzing those cards this turn (Mitosis).
   * Pays install costs; skips cards that cannot be afforded.
   */
  | {
      kind: "install_hq_new_remotes_with_advancements";
      max: number;
      advancements: number;
    }
  /**
   * Moon Pool aftermath after trashSelf cost: RFG self; trash up to N from HQ;
   * reveal up to M facedown Archives cards and shuffle them into R&D; for each
   * agenda revealed, place 1 advancement on an advanceable installed card.
   */
  | {
      kind: "moon_pool_resolve";
      trashHqMax: number;
      revealArchivesMax: number;
    }
  /**
   * Simulation Reset: trash up to `trashHqMax` from HQ; shuffle that many
   * from Archives into R&D; draw that many; remove source from the game.
   */
  | { kind: "simulation_reset_resolve"; trashHqMax: number }
  /**
   * Search R&D for a card whose printed rez cost equals
   * `lastTrashedRezzedPrintedRezCost + delta` (Ob: delta -1); install into a
   * new remote and rez ignoring credit costs.
   */
  | { kind: "search_rd_install_rez_by_printed_rez_cost"; delta: number }
  /**
   * Deep Dive: set aside top `setAside` of R&D faceup; access up to
   * `initialAccess` (then may spend clicks for more — auto spends available
   * clicks up to set-aside size); shuffle remainder into R&D.
   */
  | {
      kind: "deep_dive_resolve";
      setAside?: number;
      initialAccess?: number;
    }
  | {
      kind: "install_from_hq_or_archives";
      /** Skip agendas when picking (Ablative Barrier). */
      excludeAgenda?: boolean;
      /**
       * Install into a server other than the source's server (Ablative).
       * Current v0 path always creates a new remote, which satisfies this.
       */
      excludeSourceServer?: boolean;
    }
  /**
   * May install 1 facedown card from Archives into a new remote
   * (Hybrid Release). No-op when Archives has no installable card.
   */
  | { kind: "may_install_facedown_from_archives" }
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
  /** Spend N power counters from source for +N bonus access (Wake Implant). */
  | { kind: "spend_power_for_bonus_access"; amount: number }
  /**
   * Reveal top of Runner stack: place printed play/install cost as hosted
   * credits on source, add card to grip (Concerto).
   */
  | { kind: "reveal_top_stack_to_grip_place_hosted_credits" }
  /** Source ice: Runner cannot break with card abilities this encounter (Anvil). */
  | { kind: "forbid_runner_break_on_source" }
  /**
   * Hafrún: may trash 1 from HQ; if so, continue with `then`
   * (choose installed Runner card → forbid break for run).
   */
  | { kind: "may_trash_hq_then"; then: Effect }
  /**
   * Hafrún: choose an installed Runner card; its abilities cannot break
   * subroutines for the remainder of the run.
   */
  | { kind: "forbid_installed_runner_break_for_run" }
  /** Leaf: forbid break abilities on a specific Runner card for this run. */
  | { kind: "forbid_runner_card_break_for_run"; cardId: string }
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
   * Return 1 installed Corp card (ice/asset/upgrade/agenda) to HQ
   * (Reprise). `choose` opens Corp? No — Runner chooses.
   */
  | {
      kind: "return_installed_corp_to_hq";
      pick: "first" | "choose";
      /** Specific card (used by choose options). */
      cardId?: string;
      /** Leela-class: only unrezzed installed Corp cards. */
      unrezzedOnly?: boolean;
    }
  | { kind: "install_ice_inward_free" }
  /**
   * Howler: install and rez a bioroid ice from HQ or Archives, inward of
   * source, ignoring all costs; trash Howler and derez it at run end.
   */
  | { kind: "howler_install_rez_bioroid_inward" }
  | { kind: "howler_install_rez_chosen"; cardId: string }
  /**
   * Awakening Center: whenever the Runner passes all ice protecting this
   * server, the Corp may rez 1 hosted piece of bioroid ice paying 7 less,
   * forcing the Runner to encounter it; trashed at run end.
   */
  | { kind: "awakening_center_rez_hosted"; cardId: string }
  /**
   * Tyr's Hand: [trash] paid ability effect that prevents the pending
   * subroutine break (`PendingSubroutineBreak`) opened by a
   * `break_interrupt_paw`.
   */
  | { kind: "prevent_pending_subroutine_break" }
  | {
      kind: "break_host_subroutine";
      /** Ika: break up to this many unbroken host subs (default 1). */
      maxSubs?: number;
      /** Ika: host ice must include this subtype. */
      requireSubtype?: string;
    }
  /**
   * Drudge Work: choose an agenda in HQ or Archives; reveal it, gain credits
   * equal to its agenda points, shuffle it into R&D.
   */
  | { kind: "reveal_agenda_hq_or_archives_gain_ap_shuffle" }
  | {
      kind: "break_encounter_subroutine";
      /** Encountered ice must include this subtype. */
      requireSubtype?: string;
      /** Break up to this many unbroken subs (default 1; Poison Vial = 2). */
      maxSubs?: number;
      /** Lobisomem: pay this many credits per subroutine actually broken. */
      payCreditsPerBrokenSub?: number;
      /** Fire when at least one subroutine was broken this resolution (Umbrella). */
      thenIfBroke?: Effect;
    }
  | { kind: "place_event_credits"; amount: number }
  | {
      kind: "may_start_run";
      servers: "any" | "central" | "hq_rd" | "rd" | "hq" | "archives" | "remote";
      /**
       * Alarm Clock: at the first ice encounter of the started run, Runner
       * may spend this many clicks to bypass.
       */
      bypassFirstEncounterForClicks?: number;
    }
  | {
      kind: "queue_start_run";
      serverId: string;
      bypassFirstEncounterForClicks?: number;
    }
  | {
      kind: "may_install_from_heap";
      types: Array<"program" | "hardware" | "resource">;
      discount?: number;
    }
  | {
      kind: "install_from_heap";
      types: Array<"program" | "hardware" | "resource">;
      discount?: number;
    }
  | {
      kind: "may_add_from_heap_to_stack_bottom";
      types?: Array<"program" | "hardware" | "resource" | "event">;
    }
  /** Leaf for Scrounge heap→stack-bottom choice. */
  | { kind: "add_from_heap_to_stack_bottom"; cardId: string }
  /** Buffer Drive: may add one heap card to the top of the stack. */
  | { kind: "may_add_from_heap_to_stack_top" }
  | { kind: "add_from_heap_to_stack_top"; cardId: string }
  /**
   * Buffer Drive spectator: may bottom one of the given (or pending-batch) card ids.
   */
  | { kind: "may_add_one_of_card_ids_to_stack_bottom"; cardIds?: string[] }
  | { kind: "add_card_id_to_stack_bottom"; cardId: string }
  | { kind: "offer_jack_out" }
  /**
   * Project Yagi-Uda: swap 1 HQ card with 1 card in the root of or protecting
   * the attacked server (choose both).
   */
  | { kind: "yagi_swap_hq_with_attacked_root_or_ice" }
  /** Leaf: complete Yagi swap with chosen HQ + attacked-server card. */
  | {
      kind: "yagi_swap_hq_with_attacked_pick";
      hqCardId: string;
      serverCardId: string;
    }
  /**
   * Daruma: swap 1 card in the root of this server with 1 card in another
   * server's root or 1 agenda/asset/upgrade in HQ. Optional onSuccess when
   * a swap actually occurs (offer_jack_out).
   */
  | {
      kind: "daruma_swap_this_root_with_other_root_or_hq";
      onSuccess?: Effect;
    }
  /** Leaf: complete Daruma swap. */
  | {
      kind: "daruma_swap_pick";
      thisRootCardId: string;
      otherCardId: string;
      onSuccess?: Effect;
    }
  /**
   * Peeping Tom: Corp chooses a card type, reveal grip, then for the
   * remainder of the run this ice gains N × end_the_run_unless_take_tags{1}
   * (N = revealed cards of chosen type). Empty printed subs.
   */
  | { kind: "peeping_tom_choose_type_reveal_gain_etr_unless_tag_for_run" }
  /** Leaf: apply Peeping Tom type choice → reveal → gain run-scoped subs. */
  | {
      kind: "peeping_tom_apply_type";
      cardType: import("../state/types.js").CardType;
    }
  /**
   * Hangeki: Corp chooses 1 installed card; Runner may access it (out-of-run
   * access-a-card fidelity) or decline. onAccess / onDecline branch.
   */
  | {
      kind: "hangeki_choose_installed_runner_may_access";
      onAccess: Effect;
      onDecline: Effect;
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
      kind: "hangeki_access_installed";
      cardId: string;
      onAccess: Effect;
    }
  /** Derez the ice currently being encountered (Baklan). */
  | { kind: "derez_encounter_ice" }
  /**
   * Project Wotan: the currently approached ice — if rezzed bioroid — gains
   * an ETR subroutine (after printed) for the remainder of this run.
   */
  | { kind: "grant_approached_rezzed_bioroid_etr_subroutine_this_run" }
  | { kind: "search_stack_icebreaker"; mayInstallIfSuccessfulRunThisTurn?: boolean }
  | { kind: "search_rd_non_agenda" }
  | { kind: "search_rd_to_hq"; amount: number }
  | { kind: "swap_two_ice" }
  | { kind: "rez_ice_ignoring_costs" }
  | {
      kind: "may_install_from_grip";
      discount?: number;
      types?: Array<"program" | "hardware" | "resource">;
      subtype?: string;
    }
  /** Turn-scoped breaker strength boost on source (Living Mural). */
  | { kind: "gain_strength_this_turn"; amount: number; targetCardId?: string }
  /**
   * Helpful AI: choose an installed icebreaker; it gains `amount` strength
   * this turn (`breakerStrengthBoostsThisTurn`).
   */
  | { kind: "choose_icebreaker_gain_strength_this_turn"; amount: number }
  /**
   * Cortez Chip: choose installed ice; that ice costs `amount` more to rez
   * until end of turn.
   */
  | { kind: "choose_ice_additional_rez_cost_this_turn"; amount: number }
  /** Apply Cortez Chip rez cost bump to a specific ice instance. */
  | {
      kind: "add_ice_additional_rez_cost_this_turn";
      cardId: string;
      amount: number;
    }
  /** Oracle Thinktank: shuffle source from Runner score into R&D. */
  | { kind: "shuffle_source_into_rd" }
  /**
   * Greasing the Palm: may install one HQ card paying printed install cost.
   */
  | {
      kind: "may_install_from_hq_paying_costs";
      thenMayRemoveTagToAdvance?: boolean;
      /** Warm Reception: installed card cannot be scored this turn. */
      cannotScoreInstalledCardThisTurn?: boolean;
      excludeAgenda?: boolean;
    }
  /**
   * Digital Rights Management: may install 1 HQ card in a remote root paying costs.
   */
  | { kind: "may_install_from_hq_in_remote_root_paying_costs" }
  /** Leaf: install one HQ card paying installCost; optional tag→advance follow-up. */
  | {
      kind: "install_hq_card_paying_costs";
      cardId: string;
      thenMayRemoveTagToAdvance?: boolean;
      cannotScoreInstalledCardThisTurn?: boolean;
    }
  /** Place advancements on a specific card (Greasing the Palm follow-up). */
  | {
      kind: "place_advancements_on";
      cardId: string;
      amount: number;
      cannotScoreTargetThisTurn?: boolean;
      then?: Effect;
    }

  | { kind: "place_advancements_on_up_to"; amountEach: number; maxCards: number }
  /** Internal follow-up for place_advancements_on_up_to. */
  | {
      kind: "place_advancements_on_up_to_continue";
      cardId: string;
      amountEach: number;
      remainingAfter: number;
      exclude: string[];
    }
  | { kind: "remove_all_virus_from_one_installed" }
  | { kind: "remove_all_virus_from"; cardId: string }
  | { kind: "move_source_ice_to_outermost_attacked" }
  /**
   * Bullfrog: if installed, choose another server; move this ice to outermost
   * protecting that server; the run continues from the new position.
   */
  | { kind: "move_source_ice_to_outermost_another_server_continue_run" }
  /** Leaf: perform Bullfrog move to a specific server. */
  | {
      kind: "move_source_ice_to_outermost_server_continue_run";
      serverId: import("../state/types.js").ServerId;
    }
  /**
   * Formicary-class: rez source ice (optional discount), move to innermost
   * protecting the attacked server, then encounter — blocked when
   * `run.forbidNewTimingStructures` (CR 6.8.2c).
   */
  | { kind: "formicary_rez_move_innermost"; rezDiscount?: number }
  | { kind: "may_install_ice_from_hq_other_server_ignore_costs" }
  /**
   * Minelayer: may install 1 ice from HQ protecting the server that contains
   * the source ice, ignoring install cost.
   */
  | { kind: "may_install_ice_from_hq_protecting_this_server_ignore_costs" }
  | { kind: "install_hq_ice_protecting_server_ignore_costs"; cardId: string; serverId: string }
  | { kind: "fortify_all_ice"; amount: number }
  | { kind: "meeting_of_minds_resolve"; subtype: string }
  | { kind: "meeting_of_minds_fetch"; cardId: string; subtype: string }
  | { kind: "meeting_of_minds_reveal_gain"; subtype: string }
  | { kind: "derez_ice_protecting_attacked"; cardId: string }
  | { kind: "may_derez_protecting_attacked_ice" }
  /**
   * Kompromat: give Corp 1 bad publicity unless they derez 1 rezzed ice
   * protecting the attacked server.
   */
  | { kind: "bp_unless_derez_protecting_attacked" }
  | { kind: "may_rez_event_derezzed_ice_ignore_costs" }
  | { kind: "rez_ice_ignore_costs"; cardId: string }
  | {
      kind: "may_reveal_shuffle_agendas_into_rd";
      max: number;
      /** Attitude Adjustment: gain this many credits per revealed agenda. */
      creditsEach?: number;
    }
  | {
      kind: "reveal_shuffle_agenda_into_rd";
      cardId: string;
      remainingAfter: number;
      exclude: string[];
      creditsEach?: number;
    }
  /**
   * Building Blocks: reveal a card of subtype from HQ; install and rez ignoring
   * all costs.
   */
  | {
      kind: "reveal_hq_subtype_install_and_rez_ignore_costs";
      subtype: string;
    }
  /** Leaf for Building Blocks after choosing ice + server. */
  | {
      kind: "install_and_rez_hq_ice_protecting_server_ignore_costs";
      cardId: string;
      serverId: string;
    }
  /**
   * API-S Keeper Isobel: may remove 1 advancement from an installed card to
   * gain `credits`.
   */
  | {
      kind: "may_remove_advancement_from_installed_gain_credits";
      credits: number;
    }
  /** Leaf: remove 1 advancement from cardId, gain credits. */
  | {
      kind: "remove_advancement_from_installed_gain_credits";
      cardId: string;
      credits: number;
    }
  | { kind: "look_top_rd_may_trash" }
  /** ezaM: look at top of R&D; may move it to the bottom. */
  | { kind: "look_top_rd_may_bottom" }
  /** Flower Sermon: look at top of R&D; may advance; may bottom. */
  | { kind: "look_top_rd_may_advance_may_bottom" }
  /** Leaf: move top of R&D to bottom. */
  | { kind: "rd_top_to_bottom" }
  /** ezaM: swap this ice with another installed ice. */
  | { kind: "swap_source_ice_with_other" }
  /** Sipa: Runner may swap source ice with another installed ice (or decline). */
  | { kind: "may_swap_ice_with_other_installed" }
  /**
   * Cordyceps: Runner may swap one ice protecting the attacked server with
   * another installed ice (decline allowed).
   */
  | { kind: "may_swap_protecting_attacked_ice_with_other_installed" }
  /** Internal: after choosing protecting ice, choose other ice to swap with. */
  | {
      kind: "swap_protecting_attacked_ice_pick_other";
      protectingIceId: string;
    }
  /** Leaf: swap two installed ice by id (preserve rez/face). */
  | {
      kind: "swap_protecting_attacked_ice_with";
      protectingIceId: string;
      otherIceId: string;
    }
  /** Leaf: swap two installed ice (preserve rez/face). */
  | { kind: "swap_two_installed_ice"; otherIceId: string }
  | { kind: "pay_credits_reencounter_passed_ice"; credits: number }
  | { kind: "trash_hq_reencounter_passed_ice" }
  | { kind: "may_install_and_rez_from_hq"; totalDiscount: number }
  | {
      kind: "install_and_rez_hq_card_with_discount";
      cardId: string;
      totalDiscount: number;
    }
  | { kind: "may_search_rd_install_rez_ignore_costs" }
  | { kind: "search_rd_pick_install_rez_ignore_costs"; cardId: string }
  | { kind: "lycian_choose_subtypes" }
  | { kind: "lycian_gain_subtype"; subtype: string; remaining: string[] }
  | { kind: "rez_up_to_ice_protecting_attacked_ignore_costs"; maxIce: number }
  | {
      kind: "rez_one_protecting_attacked_ignore_costs";
      cardId: string;
      remaining: number;
    }
  | { kind: "derez_up_to_ice_protecting_server"; serverId: string; maxIce: number }
  | {
      kind: "derez_one_protecting_server";
      cardId: string;
      serverId: string;
      remaining: number;
    }
  | {
      kind: "lightning_spend_counter_rez_up_to_protecting_attacked";
      maxIce: number;
    }
  | {
      kind: "brasilia_derez_other_ice_for_strength";
      otherIceId: string;
      rezzedIceId: string;
      bonus: number;
      brasiliaId: string;
    }
  | { kind: "end_the_run_unless_trash_installed" }
  /**
   * Nested cost: end the run unless the Runner takes N tags (Funhouse).
   * If a static/mandatory interrupt would prevent taking those tags, the
   * nested cost is unpayable (CR 1.16.1b) and the run ends.
   */
  | { kind: "end_the_run_unless_take_tags"; amount: number }
  /**
   * Formicary-class: end the run unless the Runner suffers N net damage
   * (nested cost; Runner chooses).
   */
  | { kind: "end_the_run_unless_net_damage"; amount: number }
  /**
   * Tsurugi-class: end the run unless the Corp pays N¢ (nested cost; Corp
   * chooses). If Corp cannot pay, the run ends.
   */
  | { kind: "end_the_run_unless_corp_pays"; amount: number }
  /**
   * Turing-class: end the run unless the Runner spends N [click] (nested
   * cost; Runner chooses). If the Runner cannot spend that many clicks,
   * the run ends.
   */
  | { kind: "end_the_run_unless_runner_spends_clicks"; amount: number }
  /**
   * Giordano Memorial Field: end the run unless the Runner pays
   * `creditsPer` × agendas in the Runner score area.
   */
  | {
      kind: "end_the_run_unless_pay_credits_per_runner_scored_agenda";
      creditsPer: number;
    }
  /**
   * Broad Daylight: may take `amount` bad publicity, then place agenda
   * counters on source equal to Corp bad publicity.
   */
  | {
      kind: "may_take_bad_publicity_then_add_agenda_counters_equal_to_bad_publicity";
      amount: number;
    }
  /** Leaf: place agenda counters on source equal to Corp bad publicity. */
  | { kind: "add_agenda_counters_equal_to_bad_publicity" }
  /**
   * Algernon: may pay `credits` to gain [click]; if so, trash source at
   * Runner turn end unless a successful run was made this turn.
   */
  | {
      kind: "may_pay_credits_gain_click_trash_at_turn_end_if_no_successful_run";
      credits: number;
    }
  /** Internal leaf for Algernon after choosing to pay. */
  | { kind: "algernon_pay_gain_click"; credits: number }
  /**
   * Joshua B.: may gain [click]; if so, take 1 tag at Runner turn end.
   */
  | { kind: "may_gain_click_then_tag_at_turn_end" }
  /** Internal leaf for Joshua B. after choosing to gain the click. */
  | { kind: "joshua_gain_click_tag_at_turn_end" }
  /**
   * Personal Workshop: host program/hardware from grip; place power
   * counters equal to its install cost.
   */
  | { kind: "host_grip_program_or_hardware_with_power_equal_install_cost" }
  | {
      kind: "host_grip_pw_card_with_power_equal_install_cost";
      cardId: string;
    }
  /**
   * Personal Workshop: remove 1 power from a hosted card; at 0 install
   * ignoring all costs.
   */
  | { kind: "remove_power_from_hosted_card_install_at_zero_ignore_costs" }
  | {
      kind: "remove_power_from_hosted_card_id_install_at_zero";
      cardId: string;
    }
  | { kind: "install_hosted_card_ignore_costs"; cardId: string }
  /**
   * Edge of World: may pay `amount`¢ to deal core damage equal to ice
   * protecting this server.
   */
  | {
      kind: "may_pay_credits_for_core_damage_per_ice_protecting_this_server";
      amount: number;
    }
  /** Sunset: choose a server and rearrange its ice. */
  | { kind: "choose_server_rearrange_ice" }
  | {
      kind: "rearrange_server_ice";
      serverId: import("../state/types.js").ServerId;
      order: string[];
    }
  /** Commercialization: choose ice; gain ¢ equal to its advancements. */
  | { kind: "choose_ice_gain_credits_per_advancement" }
  | { kind: "gain_credits_from_ice_advancements"; iceId: string }
  /**
   * Chimera: choose exactly one of sentry / code gate / barrier until
   * derezzed (tracked via lycianGainedSubtypes).
   */
  | { kind: "choose_one_subtype_until_derez" }
  | { kind: "gain_one_subtype_until_derez"; subtype: string }
  /**
   * Arella Salvatore: may install from HQ ignoring costs, then place
   * `amount` advancement counters on the installed card.
   */
  | {
      kind: "may_install_from_hq_ignore_costs_then_place_advancements";
      amount: number;
    }
  /** Leaf: install HQ card ignoring costs, then place advancements on it. */
  | {
      kind: "install_hq_card_ignore_costs_then_place_advancements";
      cardId: string;
      serverId: string;
      amount: number;
    }
  /**
   * Divert Power: derez any number of rezzed installed cards, then may rez
   * a card lowering rez cost by `creditsPerDerezzed` × count derezzed.
   */
  | {
      kind: "derez_any_number_then_may_rez_discount_per";
      creditsPerDerezzed: number;
    }
  /** Internal: continue Divert Power after each derez (track count). */
  | {
      kind: "derez_any_number_continue";
      creditsPerDerezzed: number;
      derezzed: number;
      justDerezzedId?: string;
    }
  /** Internal: after done derezzing, may rez one card with discount. */
  | {
      kind: "may_rez_card_with_discount";
      discount: number;
    }
  /** Leaf: rez installed card paying rez cost minus discount. */
  | {
      kind: "rez_card_with_discount";
      cardId: string;
      discount: number;
    }
  /**
   * Lady Liberty: add an agenda from HQ to Corp score worth AP equal to
   * hosted power counters on the source.
   */
  | { kind: "add_agenda_from_hq_to_score_worth_exact_hosted_power" }
  /** Leaf: move HQ agenda to score with overridden agendaPoints. */
  | {
      kind: "add_hq_agenda_to_score_with_agenda_points";
      cardId: string;
      agendaPoints: number;
    }
  /**
   * Psych Mike: gain 1¢ per R&D access during the ending successful R&D run
   * (count from run.accessedCardIds while still available).
   */
  | { kind: "gain_credits_equal_to_rd_accesses_this_run" }
  /**
   * Otoroshi: may place up to `maxAdvancements` on 1 remote-root card; if
   * you do, Runner accesses that card unless they pay `credits`.
   */
  | {
      kind: "may_place_up_to_advancements_on_remote_root_then_access_unless_pay";
      maxAdvancements: number;
      credits: number;
    }
  /** Leaf: place N advancements on cardId, then access unless pay. */
  | {
      kind: "place_advancements_then_access_unless_pay";
      cardId: string;
      amount: number;
      credits: number;
    }
  /** Leaf: force mid-run access of one installed card (Otoroshi). */
  | { kind: "access_installed_card"; cardId: string }
  /**
   * Eavesdrop: choose installed ice; host source as a condition counter
   * (no rez).
   */
  | { kind: "host_on_ice_as_condition" }
  /** Leaf: host source on chosen ice as condition. */
  | { kind: "host_on_ice_as_condition_on"; iceId: string }
  /**
   * Mâché: place power on source equal to the trash cost of the card just
   * trashed while accessed (`turn.lastAccessTrashCost`).
   */
  | { kind: "add_power_counter_equal_to_last_access_trash_cost" }
  /**
   * Reboot: install up to `max` cards from heap into the rig facedown
   * (ignore costs); interactive multi-pick with Done.
   */
  | { kind: "install_up_to_from_heap_facedown"; max: number }
  /** Internal: continue Reboot after each facedown install. */
  | {
      kind: "install_up_to_from_heap_facedown_continue";
      remaining: number;
      justInstalledId?: string;
    }
  /**
   * Fast Break: X = agendas in Runner score area; gain X¢, draw up to X,
   * then install up to X cards from HQ into root and/or protecting one chosen
   * remote (paying install costs).
   */
  | { kind: "fast_break_equal_to_runner_scored_agendas" }
  /** Internal: Corp chooses the single remote for Fast Break installs. */
  | { kind: "fast_break_choose_remote"; remaining: number }
  /** Internal: continue Fast Break installs into a chosen remote. */
  | {
      kind: "fast_break_install_continue";
      remaining: number;
      serverId: string;
      justInstalledId?: string;
      asIce?: boolean;
    }
  /**
   * Saraswati: install 1 HQ card on a remote root, place `amount`
   * advancements, forbid score/rez until next Corp turn begins.
   */
  | {
      kind: "install_from_hq_on_remote_root_place_advancement_cannot_score_or_rez_until_next_corp_turn";
      amount: number;
    }
  /** Leaf: perform Saraswati install+advance+lock. */
  | {
      kind: "install_hq_remote_root_place_adv_lock_until_next_corp_turn";
      cardId: string;
      serverId: string;
      amount: number;
    }
  /**
   * Choose exactly N distinct options (Bahia Bands). Uses
   * `pendingExclusiveChoices` like exclusive_choices_per_passed_ice.
   */
  | { kind: "choose_exactly_n"; n: number; options: ChoiceOption[] }
  /** Set `hostedCreditsSpendFor` on source (Bahia Bands). */
  | {
      kind: "enable_hosted_credits_spend_for";
      purposes: Array<"install" | "trash">;
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
  /**
   * Daniela: move first `count` grip cards to bottom of stack (v0 deterministic:
   * first N in hand order).
   */
  | { kind: "add_random_grip_to_stack_bottom"; count: number }
  /** Bring Them Home: move first `count` grip cards to top of stack. */
  | { kind: "add_random_grip_to_stack_top"; count: number }
  /** Bring Them Home threat: move `count` grip cards into stack and shuffle. */
  | { kind: "shuffle_random_grip_into_stack"; count: number }
  | { kind: "shuffle_grip_and_heap_into_stack" }
  | { kind: "rfg_top_of_stack"; amount: number }
  | { kind: "may_play_nonterminal_operation_from_hq" }
  | { kind: "may_play_operation_from_hq" }
  | { kind: "shuffle_any_number_hq_to_rd" }
  | { kind: "shuffle_hq_card_into_rd"; cardId: string }
  | {
      kind: "may_remove_power_counters_then_net_damage";
      base: number;
      perRemoved: number;
      maxRemove: number;
    }
  | { kind: "set_rez_ice_forfeit_discount"; cardId: string; forfeit: boolean }
  | { kind: "may_install_ice_from_hq_discount_then_move_source"; discount: number }
  | {
      kind: "install_hq_ice_protecting_server_paying_costs";
      cardId: string;
      serverId: string;
      discount?: number;
      thenMoveSourceToServerRoot?: boolean;
    }
  | { kind: "play_hq_operation_card"; cardId: string }
  | { kind: "add_installed_resource_to_stack_top" }
  /** Sherlock 1.0: choose 1 installed program → top of stack. */
  | { kind: "add_installed_program_to_stack_top" }
  | { kind: "move_runner_card_to_stack_top"; cardId: string }
  | { kind: "host_installed_trojan_on_attacked_ice" }
  | { kind: "host_program_on_ice"; programId: string; iceId: string }
  /** Adrian Seis / Hyoubu / Akiko: interactive psi bid then branch effects. */
  | {
      kind: "play_psi_game";
      maxBid: number;
      /** Optional — when omitted, differing bids resolve as a no-op. */
      ifBidsDiffer?: Effect;
      /** Optional — when omitted, matching bids resolve as a no-op. */
      ifBidsMatch?: Effect;
    }
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
  /** A Teia: may install from HQ on another remote ignoring costs. */
  | {
      kind: "may_install_from_hq_on_other_remote_ignore_costs";
      cannotScoreInstalledCardThisTurn?: boolean;
    }
  /** Leaf: install HQ card on remote `serverId` ignoring costs. */
  | {
      kind: "install_hq_on_remote_ignore_costs";
      cardId: string;
      serverId: string;
      cannotScoreInstalledCardThisTurn?: boolean;
    }
  /** Project Ingatan: may install from Archives ignoring costs. */
  | { kind: "may_install_from_archives_ignore_costs" }
  /**
   * Retirement Plan: install 1 agenda/asset/ice from Archives paying
   * install cost (mandatory; no Decline).
   */
  | {
      kind: "install_from_archives";
      types: Array<"agenda" | "asset" | "ice" | "upgrade">;
    }
  /** Leaf: pay install cost and install a specific Archives card. */
  | {
      kind: "install_archives_card_paying";
      cardId: string;
      serverId: string;
    }
  /** Synapse Global: may install from HQ ignoring costs. */
  | { kind: "may_install_from_hq_ignore_costs" }
  /**
   * Vaporframe Fabricator onTrash: may install from HQ ignoring costs, but
   * cannot install into the root of the server that hosted the source.
   * Ice protecting that server remains legal.
   */
  | { kind: "may_install_from_hq_ignore_costs_exclude_source_server" }
  /**
   * Wall to Wall: when Corp turn begins, resolve 1 (if any other rezzed
   * asset) or up to 3 (otherwise) of draw / gain 1¢ / advance ice / add to HQ.
   */
  | { kind: "wall_to_wall_turn_begin" }
  /** Internal follow-up for wall_to_wall_turn_begin. */
  | {
      kind: "wall_to_wall_turn_begin_continue";
      remaining: number;
      used: string[];
      mustPick: boolean;
    }
  /** Internal: place 1 advancement on chosen installed ice then continue W2W. */
  | {
      kind: "wall_to_wall_place_adv_on_ice";
      cardId: string;
      remaining: number;
      used: string[];
      mustPick: boolean;
    }
  /**
   * Engram Flush onEncounter: Corp chooses a Runner card type for the
   * remainder of the encounter.
   */
  | { kind: "choose_card_type_for_encounter" }
  /** Leaf: store Corp's encounter card-type choice. */
  | {
      kind: "set_encounter_chosen_card_type";
      cardType: import("../state/types.js").CardType;
    }
  /**
   * Engram Flush subroutine: reveal grip; Corp may trash 1 revealed card of
   * the encounter's chosen card type.
   */
  | { kind: "reveal_grip_may_trash_chosen_encounter_type" }
  /**
   * Focus Group: choose a card type, reveal grip, choose X ≤ count of that
   * type, may pay X¢ to place X advancements on 1 installed card.
   */
  | { kind: "focus_group_reveal_may_advance" }
  /** Internal: after Focus Group type choice — reveal, choose X, may pay+place. */
  | {
      kind: "focus_group_after_type";
      cardType: import("../state/types.js").CardType;
    }
  /** Internal: Focus Group may pay X to place X advancements. */
  | { kind: "focus_group_may_pay_place"; amount: number }
  /**
   * Divested Trust: may forfeit this scored agenda to gain credits and return
   * the just-stolen agenda to HQ.
   */
  | {
      kind: "divested_trust_may_forfeit_return_stolen";
      gainCredits: number;
    }
  /** Return a stolen agenda from Runner score to HQ. */
  | { kind: "return_stolen_agenda_to_hq"; cardId: string }
  /**
   * The Nihilist: may remove any 2 virus counters from installed Runner cards;
   * if you do, draw 2 unless Corp trashes the top card of R&D.
   */
  | { kind: "nihilist_may_remove_2_virus_draw_unless_corp_trash_top_rd" }
  /** Internal: remove `amount` virus from cardId, then continue Nihilist. */
  | {
      kind: "nihilist_remove_virus_from";
      cardId: string;
      amount: number;
      remaining: number;
    }
  /** Internal: after removing 2 virus — Corp trash top R&D or Runner draws 2. */
  | { kind: "nihilist_corp_trash_top_rd_or_runner_draws_2" }
  /**
   * Game Over: Corp chooses a Runner card type; trash all installed
   * non-icebreaker cards of that type; Runner may pay 3¢ per card to prevent.
   */
  | { kind: "game_over_trash_type_may_pay_3_prevent" }
  /** Internal: after Game Over type choice — process matching installed cards. */
  | {
      kind: "game_over_after_type";
      cardType: import("../state/types.js").CardType;
    }
  /** Internal: offer pay-3 prevent or trash for one card, then continue. */
  | {
      kind: "game_over_process_card";
      cardId: string;
      remaining: string[];
    }
  /** Internal: continue Game Over queue after prevent/trash. */
  | { kind: "game_over_continue"; remaining: string[] }
  /**
   * Ganked!: trash this card, then Corp chooses a rezzed piece of ice
   * protecting this server; Runner encounters that ice (reencounterIceId).
   */
  | { kind: "trash_self_choose_rezzed_protecting_ice_encounter" }
  /** Internal leaf: schedule encounter of chosen protecting ice. */
  | { kind: "set_reencounter_ice"; iceId: string }
  /**
   * Konjin: Corp may choose another rezzed ice; Runner encounters it, then
   * resumes this ice's encounter if still rezzed.
   */
  | { kind: "may_choose_other_rezzed_ice_encounter_then_resume_source" }
  /** Internal leaf: schedule nested encounter then resume source. */
  | { kind: "set_nested_encounter_then_resume_source"; iceId: string }
  /** Mystic Maemi: trash N random cards from grip. */
  | { kind: "trash_random_from_grip"; amount: number }
  /**
   * Paladin Poemu: Runner must trash 1 of their installed cards
   * (chooser; may include source).
   */
  | { kind: "must_trash_own_installed" }
  /**
   * Prognostic Q-Loop: privately look at top N of stack (no rearrange).
   * Cards-data uses `amount` (not `n`) for this leaf.
   */
  | { kind: "look_top_n_stack_peek"; amount: number }
  /**
   * Prognostic Q-Loop paid: reveal top of stack; if program or hardware,
   * may install it (paying costs).
   */
  | { kind: "reveal_top_stack_may_install_program_or_hardware" }
  /**
   * Boomerang: when trash-break resolves, register a delayed conditional —
   * on successful run end, may shuffle 1 copy of `title` from heap into stack.
   */
  | {
      kind: "register_may_shuffle_title_from_heap_on_successful_run_end";
      title: string;
    }
  /** Internal / run-end: offer may shuffle one heap card with this title. */
  | { kind: "may_shuffle_title_from_heap_into_stack"; title: string }
  /** Leaf: shuffle a specific heap card into stack. */
  | { kind: "shuffle_heap_card_into_stack"; cardId: string }
  /** Leaf: install Archives card on server ignoring costs (unrezzed). */
  | {
      kind: "install_archives_card_ignore_costs";
      cardId: string;
      serverId: string;
    }
  /** Leaf: install HQ card on server ignoring costs (unrezzed). */
  | {
      kind: "install_hq_card_ignore_costs";
      cardId: string;
      serverId: string;
    }
  /** Embedded Reporting: search R&D for operation, shuffle, put on top. */
  | { kind: "search_rd_operation_to_top_rd" }
  /** Off the Books: search R&D, reveal, then install or HQ. */
  | { kind: "search_rd_reveal_may_install_ignore_costs_else_hq" }
  /** Leaf: reveal R&D pick then install or leave in HQ. */
  | { kind: "search_rd_reveal_pick_install_or_hq"; cardId: string }
  /** Arissana: install program from grip paying full install cost. */
  | {
      kind: "install_program_from_grip_paying_cost";
      cardId?: string;
      trackOnRunEndTrashUnlessSubtype?: string;
    }

  /** Prāna Condenser: net damage equal to hosted power counters on source. */
  | { kind: "deal_net_damage_per_power_counter" }
  /** Kakurenbo: trash any number of cards from HQ (incl. zero). */
  | { kind: "trash_any_number_from_hq" }
  /** Kakurenbo: turn every card in Archives facedown. */
  | { kind: "turn_all_archives_facedown" }
  /**
   * Kakurenbo: may install 1 agenda/asset/upgrade from Archives in a remote
   * root (paying install cost), then place `amount` advancements on it.
   */
  | {
      kind: "may_install_from_archives_in_remote_root_with_advancements";
      amount: number;
    }
  /** Leaf: install from Archives into remote root paying, then place advancements. */
  | {
      kind: "install_archives_remote_root_with_advancements";
      cardId: string;
      serverId: string;
      amount: number;
    }
  /** Gachapon: set aside top 6; may install program/virtual −2; shuffle 3; RFG rest. */
  | { kind: "gachapon_resolve" }
  /** Internal: install set-aside program/virtual without shuffling rest. */
  | { kind: "gachapon_install_set_aside"; cardId: string; discount: number }
  /** Internal: after Gachapon install/decline — choose shuffle then RFG rest. */
  | { kind: "gachapon_after_install_choice" }
  /** Internal: iterative pick of set-aside cards to shuffle. */
  | {
      kind: "gachapon_shuffle_pick_continue";
      need: number;
      selected: string[];
    }
  /** Internal: shuffle selected set-aside ids into stack, RFG remaining. */
  | {
      kind: "gachapon_shuffle_selected_rfg_rest";
      cardIds: string[];
    }
  /**
   * The Back: shuffle up to nPerPowerCounter × power counters heap cards that
   * have [trash] abilities into the stack. Reads rfgSelf snapshot when source RFG'd.
   */
  | {
      kind: "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack";
      nPerPowerCounter: number;
    }
  | {
      kind: "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack_continue";
      maxRemaining: number;
      selected: string[];
    }
  /** AirbladeX: prevent up to `amount` pending net damage. */
  | { kind: "prevent_pending_damage"; amount: number }
  | { kind: "prevent_pending_tags"; amount: number }
  /** AirbladeX: prevent onEncounter on current encountered ice. */
  | { kind: "prevent_current_ice_on_encounter" }
  | { kind: "remove_tags"; amount: number }
  /** Witch Hunt: remove every tag the Runner currently has. */
  | { kind: "remove_all_tags" }
  | { kind: "lose_credits_per_advancement"; per: number }
  /** Gain `per` × hosted advancement counters on the source card. */
  | { kind: "gain_credits_per_advancement"; per: number }
  /** Alix T4LB07: gain `per` × hosted power counters on the source card. */
  | { kind: "gain_credits_per_power_counter"; per: number }
  | { kind: "gain_credits_per_hq_card"; per: number }
  /** Capacitor: Corp gains `per` × Runner tags. */
  | { kind: "gain_credits_per_runner_tags"; per: number }
  /**
   * Gain 1¢ per distinct card type among faceup cards in Archives; if any
   * are agendas, gain another 2¢ (Armed Asset Protection; base 3¢ is separate).
   */
  | { kind: "gain_credits_per_distinct_faceup_archive_type" }
  /**
   * Swap source ice with a piece of ice from HQ (same server/position).
   * New ice installs unrezzed ignoring costs. Optional gainCredits if swapped
   * (Tatu-Bola).
   */
  | { kind: "swap_ice_with_hq"; gainCredits?: number }
  /** Move one HQ card to the top of R&D (Mindscaping). */
  | { kind: "hq_to_top_rd"; pick?: "first" | "choose" }
  | { kind: "hq_card_to_top_rd"; cardId: string }
  /** Net damage equal to Runner tags, capped at `max`. */
  | { kind: "net_damage_up_to_tags"; max: number }
  | { kind: "bypass_current_ice"; requireSubtype?: string }
  /** Banner: subroutines cannot end the run for the remainder of this encounter. */
  | { kind: "forbid_end_the_run_this_encounter" }
  | { kind: "remove_power_counter"; amount: number }
  /** Cold Site Server: remove all hosted power counters from the source. */
  | { kind: "remove_all_power_counters" }
  /**
   * Stargate: reveal top `n` of R&D; Runner trashes 1; rest return in order.
   */
  | { kind: "reveal_top_n_rd_trash_one"; n: number }
  /** Internal: trash one revealed R&D card, return the rest in order. */
  | { kind: "reveal_top_n_rd_trash_picked"; cardId: string }
  /** Insight: reveal the top `n` cards of R&D (public), leave them in place. */
  | { kind: "reveal_top_n_rd"; n: number }
  /**
   * Game Changer: Corp gains clicks equal to agendas in the Runner's score area.
   */
  | { kind: "gain_clicks_equal_to_runner_scored_agendas" }
  /**
   * Letheia Nisei: move the Runner to the outermost ice of the attacked server.
   */
  | { kind: "move_runner_to_outermost_attacked" }
  /**
   * Reduced Service rez helper: pay `amount` credits, place that many power.
   */
  | { kind: "rez_spend_credits_for_power_counters"; amount: number }
  /**
   * Climactic Showdown: Runner chooses an iced server; Corp may trash 1 ice
   * protecting it; if they do not, first HQ/R&D breach this turn +2 access.
   */
  | { kind: "climactic_choose_server_corp_may_trash_ice_else_bonus_access" }
  /** Internal: after Climactic server pick — Corp may trash ice or decline. */
  | { kind: "climactic_corp_may_trash_ice"; serverId: string }
  /** Internal: trash chosen ice protecting Climactic server. */
  | { kind: "climactic_trash_ice"; cardId: string }
  /**
   * Internal: Corp declined ice trash — register `amount` bonus accesses on
   * the first HQ/R&D breach this turn.
   */
  | { kind: "climactic_register_bonus_access"; amount?: number }
  /** Lucky Charm: prevent a pending Corp-card-ability end-the-run. */
  | { kind: "prevent_pending_end_the_run_from_corp_card_ability" }
  /** Whistleblower: may trash self to name; steal that agenda ignoring costs. */
  | { kind: "whistleblower_may_trash_name_agenda_steal_ignore_costs" }
  | { kind: "whistleblower_name_agenda"; title: string }
  | { kind: "hyoubu_reveal_grip_random_or_stack_top" }
  | { kind: "hyoubu_reveal_grip_random" }
  | { kind: "hyoubu_reveal_stack_top" }
  | { kind: "class_act_look_top_draw_amount_plus_one_bottom_one" }
  | { kind: "class_act_bottom_one_then_draw"; cardId: string }
  | { kind: "backup_plan_may_rerun_ignore_additional_costs_bypass_last_ice" }
  | { kind: "backup_plan_rerun" }
  | { kind: "complete_image_name_net_damage_loop" }
  | { kind: "complete_image_net_named"; title: string }
  | { kind: "khusyuk_choose_install_cost_set_aside_access_shuffle" }
  | { kind: "khusyuk_set_aside_access_shuffle"; installCost: number }
  | { kind: "khusyuk_access_set_aside"; cardId: string }
  | { kind: "mirrormorph_take_different_action_click_discount" }
  /** Place N power counters on the source card (not Charge — no ≥1 gate). */
  | { kind: "add_power_counter"; amount: number }
  /**
   * Draw `per` × hosted power counters on the source (Raindrops Cut Stone).
   */
  | { kind: "draw_per_power_counter"; side: SideRef; per?: number }
  /** Ritual: draw 1 per click remaining on side. */
  | { kind: "draw_per_clicks_remaining"; side: SideRef }
  /**
   * Take N hosted bad publicity counters from the source into the Corp's
   * player BP pool (Superdeep Borehole). Hosted counters are not player BP
   * until taken (CR §1.13.3).
   */
  | { kind: "take_hosted_bad_publicity"; amount: number }
  /**
   * Luana: may move `amount` player BP onto source as hosted; if so, `then`.
   */
  | { kind: "may_host_bad_publicity_then"; amount: number; then: Effect }
  /** Leaf: host amount player BP on source. */
  | { kind: "host_bad_publicity"; amount: number }
  /**
   * Let Them Dream: may search HQ/R&D/Archives for an agenda; reveal; add to
   * HQ or bottom of R&D.
   */
  | { kind: "may_search_hq_rd_archives_agenda_to_hq_or_rd_bottom" }
  /** Leaf helpers for Let Them Dream search. */
  | { kind: "search_zone_agenda_to_hq_or_rd_bottom"; zone: "hq" | "rd" | "archives" }
  | {
      kind: "place_agenda_hq_or_rd_bottom";
      cardId: string;
      destination: "hq" | "rd_bottom";
    }
  /**
   * Editorial: may search R&D for 1 non-agenda with any listed subtype;
   * reveal and add to HQ; shuffle.
   */
  | { kind: "may_search_rd_non_agenda_any_subtype_to_hq"; subtypes: string[] }
  | { kind: "search_rd_take_card_to_hq"; cardId: string }
  | { kind: "search_stack_non_virus_program_install_ignore_costs_track" }
  | { kind: "return_tracked_install_to_stack_top_if_installed" }
  | { kind: "reveal_hq_forbid_steal_trash_copies_this_run" }
  | { kind: "forbid_steal_trash_title_this_run"; title: string }
  | { kind: "install_stack_program_ignore_costs_track"; cardId: string }
  | { kind: "pay_credits_or_etr"; side: SideRef; amount: number }
  | { kind: "meat_damage_stolen_last_turn" }
  | { kind: "derez_ice"; pick: "first" | "choose" }
  /** Derez a specific rezzed installed card (ice / asset / upgrade). */
  | { kind: "derez_card"; cardId: string }
  /** Derez the effect source if it is currently rezzed (Warm Reception). */
  | { kind: "derez_source" }
  /**
   * May derez another rezzed installed card (Hákarl-class). Opens a Corp
   * choice when ≥1 eligible target exists; decline is always offered.
   * When a target is chosen, derez it then evaluate optional `then`
   * ("if you do"). No-op (no choice) when no eligible targets.
   */
  | {
      kind: "may_derez_installed";
      /** Exclude the effect source from targets (default true). */
      excludeSelf?: boolean;
      /** Only ice cards (Stegodon). */
      onlyIce?: boolean;
      /** Exclude ice protecting the attacked server (Stegodon). */
      excludeProtectingAttackedServer?: boolean;
      then?: Effect;
    }
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
   * realloc(): choose 2 rezzed ice; for each, gain printed rez cost then derez.
   */
  | { kind: "realloc_two_rezzed_ice" }
  /** Leaf: pick second ice after first selected for realloc. */
  | { kind: "realloc_pick_second"; firstIceId: string }
  /** Leaf: resolve gain+derez for two chosen ice. */
  | { kind: "realloc_resolve"; iceIds: [string, string] }
  /**
   * Flood the Market: choose 1 advanceable installed card; place 1 advancement
   * per remote that has a root card and is protected by ice.
   */
  | { kind: "place_advancements_per_iced_rooted_remote" }
  /** Lethe: may move 1 Archives card to top or bottom of R&D. */
  | { kind: "may_add_archives_card_to_rd_top_or_bottom" }
  /** Leaf: place Archives card on top or bottom of R&D. */
  | {
      kind: "add_archives_card_to_rd";
      cardId: string;
      position: "top" | "bottom";
    }
  /** Lethe: add 1 installed Runner card to the grip (Corp chooses). */
  | { kind: "add_installed_runner_to_grip" }
  /** Leaf: return specific installed Runner card to grip. */
  | { kind: "add_installed_runner_card_to_grip"; cardId: string }
  /**
   * Reanimation Protocol: install and rez 1 ice from Archives paying
   * `totalDiscount` less combined; if rezzed ice lacks subtype
   * `badPublicityIfNotSubtype`, take 1 bad publicity.
   */
  | {
      kind: "install_and_rez_ice_from_archives";
      totalDiscount: number;
      badPublicityIfNotSubtype?: string;
    }
  /** Leaf: install+rez chosen Archives ice with discount. */
  | {
      kind: "install_and_rez_archives_ice";
      cardId: string;
      totalDiscount: number;
      badPublicityIfNotSubtype?: string;
      serverId: string;
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
      kind: "must_trash_installed";
      /** Exclude the effect source from targets (default true). */
      excludeSelf?: boolean;
    }
  /**
   * Runner cannot use paid abilities printed on bioroid ice for the
   * remainder of the turn (Hákarl 1.0 after may-derez).
   */
  | { kind: "forbid_bioroid_ice_paid_abilities_this_turn" }
  | { kind: "install_and_rez_asset_or_upgrade_free" }
  /**
   * Install and rez 1 card from Archives ignoring all costs
   * (Trust Operation). Targets asset / upgrade / ice (and agendas install
   * without rez). Auto-picks first eligible Archives card (v0).
   */
  | { kind: "install_and_rez_from_archives_free" }
  | { kind: "may_return_self_to_grip"; creditCost: number }
  | { kind: "return_source_to_grip" }
  /** Janaína / Descent: move source Corp card to HQ. */
  | { kind: "return_source_to_hq" }
  | { kind: "install_resource_discount"; discount: number }
  /**
   * Install 1 card from grip among `types`, paying `discount`¢ less
   * (Rigging Up / Career Fair–class). Opens a choice when multiple
   * affordable candidates exist; sole candidate auto-installs.
   * When `mayCharge`, after install offer may-charge of that card if able
   * (CR §10.10; Hyperbaric ruling — onInstall / powerCountersOnInstall
   * resolve before the may-charge check).
   */
  | {
      kind: "install_from_grip_discount";
      types: Array<"program" | "hardware" | "resource">;
      discount: number;
      mayCharge?: boolean;
      /** Topan: Effect after the chosen card installs (baked into choice options). */
      thenOnInstall?: Effect;
    }
  /** KPI: install 1 ice from HQ ignoring costs (any server; mandatory choose). */
  | { kind: "install_ice_from_hq_ignore_costs" }
  /**
   * Monolith: on install, may install up to `remaining` programs from grip,
   * each paying `discount`¢ less.
   */
  | {
      kind: "install_up_to_n_programs_from_grip_discount";
      remaining: number;
      discount: number;
    }
  /**
   * Director Haas' Pet Project: onScore — may install up to `remaining`
   * cards from HQ and/or Archives into a single new remote, ignoring all
   * costs (agendas/assets/upgrades to root, ice to protect it).
   */
  | { kind: "haas_pet_project_setup"; remaining: number }
  | {
      kind: "haas_pet_project_install_continue";
      remaining: number;
      serverId: import("../state/types.js").ServerId | "";
      justInstalledId?: string;
      justInstalledFrom?: "hq" | "archives";
      asIce?: boolean;
    }
  /**
   * Scavenge: install 1 program from grip or heap, paying the install cost
   * of the program most recently trashed via `trash_own_program` less
   * (`state.turn.lastTrashedOwnProgramInstallCost`).
   */
  | { kind: "scavenge_install_program" }
  /** Leaf: install a specific grip card paying `discount`¢ less. */
  | { kind: "install_grip_card"; cardId: string; discount: number }
  /**
   * Leaf: if `cardId` is chargeable (≥1 power), offer may-charge that card;
   * otherwise no-op (if able).
   */
  | { kind: "may_charge_card"; cardId: string }
  | { kind: "give_bad_publicity"; amount: number }
  /** Scapegoat: remove up to `amount` bad publicity. */
  | { kind: "remove_bad_publicity"; amount: number }
  /** Scapegoat: Corp chooses an installed Runner card; Runner shuffles it into stack. */
  | { kind: "shuffle_installed_runner_into_stack" }
  /** Leaf: shuffle a specific installed Runner card into the stack. */
  | { kind: "shuffle_runner_card_into_stack"; cardId: string }
  | { kind: "reveal_hq_gain_credits"; maxCards: number; creditsEach: number }
  | { kind: "flip_identity" }
  /** Méliès U: choose secretly among HQ / R&D / Archives faces. */
  | { kind: "melies_secretly_set_face" }
  | { kind: "melies_set_face"; face: "hq" | "rd" | "archives" }
  /** Méliès U back: look top R&D, may trash; if trash, add 1 from Archives to HQ. */
  | { kind: "look_top_rd_may_trash_if_do_archives_to_hq" }
  /** Word on the Street: add source to Corp score as an agenda. */
  | {
      kind: "add_to_corp_score_as_agenda";
      agendaPoints: number;
      cannotForfeit?: boolean;
    }
  /** Read-Write Share: may host 1 grip card facedown then draw 1. */
  | { kind: "may_host_one_from_grip_facedown_then_draw" }
  | { kind: "host_grip_card_facedown_then_draw"; cardId: string }
  /** Read-Write Share trash: shuffle all hosted cards into stack. */
  | { kind: "shuffle_hosted_cards_into_stack" }
  | { kind: "look_top_stack_may_reveal_breaker_or_run_event" }
  | { kind: "reveal_runner_stack_top_to_grip"; cardId: string }
  | { kind: "peer_review" }
  | { kind: "play_self_from_archives_then_rfg" }
  /** Same Old Thing: may play an event from the heap, paying its play cost. */
  | { kind: "may_play_event_from_heap" }
  | { kind: "play_heap_event_card"; cardId: string }
  | { kind: "bigger_picture_remove_tags" }
  | { kind: "mitra_aman_approach_ice" }
  | {
      kind: "may_install_program_hardware_from_last_runner_discarded";
    }
  | {
      kind: "swap_approached_ice_with_hq_or_archives";
      replacementIceId: string;
    }
  | { kind: "plutus_pay_rez_additional_cost" }
  | { kind: "forfeit_scored_agenda"; cardId: string }
  /** Posted Bounty-class: forfeit the source agenda from Corp score. */
  | { kind: "forfeit_self" }
  | { kind: "plutus_may_play_transaction_from_archives" }
  | { kind: "play_archives_transaction_then_rfg"; cardId: string }
  | { kind: "ip_enforcement_remove_tags" }
  | { kind: "store_ip_enforcement_tags_removed"; amount: number }
  | { kind: "ip_enforcement_install_from_runner_score" }
  | { kind: "charm_offensive_trash_rezzed_accessed" }
  | { kind: "host_all_programs_from_grip" }
  | { kind: "may_install_one_hosted_program" }
  | { kind: "install_hosted_program"; cardId: string }
  /** Paule's Café: may host 1 program or hardware from grip faceup. */
  | { kind: "may_host_one_program_or_hardware_from_grip_faceup" }
  | { kind: "host_grip_program_or_hardware_faceup"; cardId: string }
  /**
   * Paule's Café: may install 1 hosted program/hardware; optional first-this-turn
   * −1¢ per unique ♦ connection installed.
   */
  | {
      kind: "may_install_one_hosted_card";
      firstThisTurnDiscountPerUniqueConnection?: boolean;
    }
  | {
      kind: "install_hosted_card";
      cardId: string;
      firstThisTurnDiscountPerUniqueConnection?: boolean;
    }
  | {
      kind: "gamedragon_may_host_on_icebreaker";
      /** Personal Touch: allow AI icebreakers. */
      allowAi?: boolean;
      /** Personal Touch: host is required when any icebreaker exists (no decline). */
      requireHost?: boolean;
    }
  | { kind: "host_hardware_on_icebreaker"; icebreakerId: string }
  /** Rabbit Hole: search stack for another copy of source title; may install paying. */
  | { kind: "search_stack_same_title_may_install_paying" }
  /** Security Subcontract: trash a rezzed ice, then gain credits. */
  | { kind: "trash_rezzed_ice_gain_credits"; amount: number }
  | { kind: "trash_rezzed_ice_gain_credits_resolve"; cardId: string; amount: number }
  /** Shipment from MirrorMorph: install up to max from HQ paying costs. */
  | { kind: "install_up_to_from_hq_paying_costs"; max: number }
  | {
      kind: "install_up_to_from_hq_paying_costs_continue";
      remaining: number;
      justInstalledId?: string;
      serverId?: string;
      asIce?: boolean;
    }
  /** Déjà Vu: add 1 card from heap, or up to 2 virus cards. */
  | { kind: "deja_vu_from_heap" }
  | { kind: "deja_vu_add_heap_cards"; cardIds: string[] }
  /** Djinn: search stack for subtype(+optional type), reveal, add to grip, shuffle. */
  | {
      kind: "search_stack_subtype_add_to_grip";
      subtype: string;
      type?: string;
    }
  | { kind: "search_stack_subtype_add_to_grip_pick"; cardId: string }
  /** Expose 1 installed unrezzed Corp card (Infiltration / Lemuria). */
  | { kind: "expose"; pick: "choose"; cardId?: string }
  /**
   * Satellite Uplink: expose up to `max` cards (sequential may-expose with decline).
   * `remaining` is internal for the recursive choice chain.
   */
  | { kind: "expose_up_to"; max: number; remaining?: number }
  | { kind: "prevent_pending_expose"; amount: number }
  | { kind: "continue_expose_after_may_rez" }
  | { kind: "rez_for_expose_interrupt"; cardId: string }
  /** Sacrificial Construct: prevent pending installed program/hardware trash. */
  | { kind: "prevent_pending_installed_trash"; amount: number }
  /** Accelerated Beta Test: look top n; may install+rez ice ignore costs; trash rest. */
  | { kind: "accelerated_beta_test"; n: number }
  | { kind: "accelerated_beta_test_continue" }
  | { kind: "accelerated_beta_test_trash_looked"; cardId: string }
  | {
      kind: "accelerated_beta_test_install_ice";
      cardId: string;
      serverId: string;
    }
  /** Mala Tempora — Expert Schedule Analyzer replace-breach reveal HQ. */
  | { kind: "expert_schedule_analyzer_may_instead_of_breach" }
  | { kind: "reveal_top_rd_corp_may_draw" }
  | { kind: "raymond_flint_breach_hq_no_root" }
  | { kind: "cap_run_access_remaining"; max: number }
  | { kind: "break_subroutine_on_self"; amount: number }
  | { kind: "accelerated_diagnostics" }
  | { kind: "unorthodox_predictions_on_score" }
  | { kind: "reveal_grip" }
  | { kind: "reveal_grip_may_trash_one" }
  | { kind: "runner_lose_credits_equal_corp_bad_publicity" }
  | { kind: "power_shutdown" }
  | { kind: "draw_top_rd_to_hand" }
  | { kind: "begin_replace_breach_hq_hand_only" }
  | { kind: "unorthodox_predictions_lock_subtype"; subtype: string }
  | { kind: "power_shutdown_trash_rd"; amount: number }
  | { kind: "power_shutdown_trash_runner_install_lte"; maxInstallCost: number }
  /** True Colors — Keyhole replace-breach. */
  | { kind: "keyhole_may_instead_of_breach" }
  | { kind: "keyhole_instead_of_breach" }
  | { kind: "keyhole_trash_looked_program"; cardId: string }
  | { kind: "lawyer_up" }
  | { kind: "leverage" }
  | { kind: "leverage_shield_runner" }
  | { kind: "capstone_trash_grip_draw_for_installed_dupes" }
  | { kind: "capstone_trash_grip_card"; cardId: string }
  | { kind: "rex_campaign_turn_begin" }
  | { kind: "rex_campaign_when_empty" }
  | { kind: "gain_credits_per_runner_grip_size" }
  | { kind: "forbid_runner_spend_credits_for_run" }
  | { kind: "remove_bad_publicity_up_to"; max: number }
  | { kind: "hemorrhage_corp_trash_from_hq" }
  | { kind: "tallie_perrault_on_ops_trashed" }
  | { kind: "restoring_face_trash_exec_sysop_clone_remove_bp" }
  | { kind: "trash_installed_corp_card"; cardId: string }
  | { kind: "toshiyuki_sakai_swap_with_hq" }
  | { kind: "toshiyuki_sakai_swap_execute"; hqCardId: string }
  /** Double Time — Singularity replace-breach trash root. */
  | { kind: "singularity_instead_of_breach_trash_root" }
  | { kind: "savoir_faire_install_program_from_grip" }
  | { kind: "fall_guy_prevent_trash_resource" }
  | { kind: "power_nap_gain_per_double_in_heap" }
  | { kind: "paintbrush_choose_ice_gain_subtype" }
  | { kind: "paintbrush_apply_subtype"; iceId: string }
  | { kind: "gyri_labyrinth_reduce_max_hand" }
  | { kind: "reclamation_order_archives_to_hq" }
  | { kind: "broadcast_square_trace_prevent_bad_publicity" }
  | { kind: "corporate_shuffle_hq_to_rd_draw"; draw: number }
  | { kind: "caprice_nisei_secret_spend" }
  | { kind: "marker_add_etr_to_next_ice" }
  | { kind: "tennin_place_advancement_on_installed" }
  | { kind: "mutate_trash_rezzed_ice_additional_cost" }
  | { kind: "mutate_record_trashed_ice"; iceId: string }
  | { kind: "mutate_operation_resolve" }
  | { kind: "taurus_trace_subroutine" }
  | { kind: "taurus_trace_success" }
  | { kind: "grail_reveal_gain_subroutines"; maxReveal?: number }
  | { kind: "runner_mu_modifier_until_turn_end"; delta: number }
  | { kind: "cyber_threat" }
  | { kind: "cyber_threat_server"; serverId: string }
  | { kind: "cyber_threat_corp_rez"; iceId: string }
  | { kind: "cyber_threat_runner_reward" }
  | { kind: "nasir_lose_all_credits" }
  | { kind: "social_engineering" }
  | { kind: "social_engineering_mark"; iceId: string }
  | { kind: "eden_shard_may_instead_of_breach" }
  | { kind: "eden_shard_install_instead" }
  | { kind: "shi_kyu_spend_for_net_damage" }
  | { kind: "mushin_install_from_hq_root" }
  | { kind: "mushin_install_hq_card_pick_server"; cardId: string }
  | { kind: "install_hq_card_on_server_root"; cardId: string; serverId: import("../state/types.js").ServerId }
  | { kind: "komainu_add_net_subs_for_rezzed_ice" }
  | { kind: "pup_pay_or_net"; amount?: number }
  | { kind: "corp_may_pay_net"; creditCost?: number; damage?: number }
  | { kind: "inazuma_lock_breaking_next_encounter" }
  | { kind: "susanoo_redirect_to_archives" }
  | { kind: "gain_credits_per_remote_with_root_card"; per?: number }
  | { kind: "gain_credits_per_installed_subtype"; subtype?: string }
  | { kind: "iain_gain_if_corp_ahead_on_agenda" }
  | { kind: "look_top_n_stack_add_one_to_grip_shuffle"; n?: number }
  | { kind: "express_delivery_finish"; pickId: string; restIds?: string[] }
  | { kind: "planned_assault_play_run_event_from_stack" }
  | { kind: "play_heap_event_ignore_cost"; cardId: string }
  | { kind: "search_stack_take_to_grip"; max?: number }
  | { kind: "take_runner_deck_card_to_grip"; cardId: string }
  | { kind: "draw_from_stack_bottom"; side?: SideRef; amount?: number }
  | { kind: "break_all_but_n_subroutines_on_encounter"; leave?: number }
  | { kind: "bug_may_pay_reveal_top" }
  | { kind: "bug_reveal_top_paid" }
  | { kind: "push_your_luck_secret_spend_guess" }
  | { kind: "push_your_luck_corp_guessed_wrong" }
  | { kind: "push_your_luck_corp_guessed_right" }
  | { kind: "oracle_may_choose_type_reveal_install" }
  | { kind: "oracle_reveal_top_match"; cardType: string }
  | { kind: "plan_b_reveal_score_from_hq" }
  | { kind: "score_agenda_from_hq"; cardId: string }
  | { kind: "unregistered_trash_rezzed_ice_gain_per_strength" }
  | { kind: "unregistered_trash_ice_gain"; iceId: string }
  | { kind: "tori_hanzo_pay_instead_net" }
  | { kind: "may_swap_two_installed_ice" }
  | { kind: "corp_pay_credits"; amount: number }
  | { kind: "runner_pay_credits"; amount: number }
  | { kind: "break_all_destroyer_subroutines_on_encounter" }
  /** Account Siphon: may instead of breach HQ — lose up to 5¢, gain 2×, take 2 tags. */
  | { kind: "account_siphon_may_instead_of_breach" }
  | { kind: "account_siphon_resolve"; loseAmount: number }
  /**
   * Vamp: may instead of breach HQ — spend X Runner ¢ (X≥0); Corp loses X;
   * if X>0 take 1 tag; skip breach.
   */
  | { kind: "vamp_may_instead_of_breach" }
  | { kind: "vamp_resolve"; spendAmount: number }
  | { kind: "set_skip_breach" }
  /** Escher: may instead of breach HQ — rearrange any ice on any servers. */
  | { kind: "escher_may_instead_of_breach" }
  | { kind: "escher_rearrange_pick_server" }
  | {
      kind: "escher_rearrange_server_ice";
      serverId: import("../state/types.js").ServerId;
      order: string[];
    }
  /**
   * Exploratory Romp: may instead of breach — remove up to `amount`
   * advancement tokens from 1 card in the attacked server.
   */
  | { kind: "exploratory_romp_may_instead_of_breach"; amount: number }
  | { kind: "exploratory_romp_choose_card"; amount: number }
  | { kind: "exploratory_romp_remove_up_to"; cardId: string; amount: number }
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
  | { kind: "host_top_of_stack_on_source" }
  | { kind: "trash_all_hosted_cards" }
  | { kind: "detente_host_random_hq" }
  | { kind: "detente_return_two_hosted_may_access" }
  | { kind: "access_random_hq" }
  | { kind: "au_co_remove_2_look_rd" }
  | { kind: "au_co_trash_looked_rd_card"; cardId: string }
  | {
      kind: "install_runner_score_agenda_on_remote";
      cardId: string;
      placeAdvancementIfRunnerTagged?: boolean;
    }
  | {
      kind: "install_runner_score_agenda_on_server";
      cardId: string;
      serverId: string;
      placeAdvancementIfRunnerTagged?: boolean;
    }
  | { kind: "move_advancements"; amount: number }
  | { kind: "trash_passed_unrezzed_ice" }
  | { kind: "forged_activation_orders" }
  | { kind: "install_program_from_stack_or_heap_free" }
  | { kind: "place_advancements_x_from_tags" }
  | { kind: "troubleshooter_fortify" }
  | { kind: "resolve_bioroid_subroutine" }
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
  /**
   * Touch-ups: Corp chooses a card type; Runner shuffles up to 2 grip cards
   * of that type into the stack.
   */
  | { kind: "touch_ups_choose_type_shuffle_grip"; maxCards: number }
  /** Proprionegation: during a run, move Runner to Archives outermost ice. */
  | { kind: "move_runner_to_archives_outermost" }
  /** Mycoweb: may rez 1 installed unrezzed ice paying `discount`¢ less. */
  | { kind: "may_rez_installed_ice_discount"; discount: number }
  /**
   * Mycoweb: resolve 1 subroutine on another rezzed ice matching `subtype`.
   */
  | {
      kind: "may_resolve_subroutine_on_rezzed_ice";
      subtype: string;
      excludeSelf?: boolean;
    }
  | {
      kind: "touch_ups_shuffle_grip_of_type";
      cardType: string;
      maxCards: number;
    }
  | { kind: "shuffle_grip_card_into_stack"; cardId: string }
  | {
      kind: "rez_ice_with_discount";
      cardId: string;
      discount: number;
    }
  /** Arruaceiras: trash encountered ice if effective strength ≤ maxStrength. */
  | { kind: "trash_encounter_ice_if_strength_lte"; maxStrength: number }
  /**
   * Gantulga: may name a server (stored on source.namedServerId) for the
   * remainder of the game until renamed.
   */
  | { kind: "may_choose_server" }
  /** Leaf: set source.namedServerId. */
  | { kind: "set_named_server"; serverId: string }
  /**
   * Hyoubu Precog Manifold: mandatory Corp choose a server → chosenServerId.
   */
  | { kind: "choose_server" }
  /** Cyber-Cypher: Runner chooses a server on install → chosenServerId. */
  | { kind: "choose_server_runner" }
  /**
   * NEXT Design onGameStart: may install up to `remaining` ice from HQ, ≤1
   * per server, ignoring all costs; then draw until HQ has `thenDrawToHq`.
   */
  | {
      kind: "next_design_may_install_ice";
      remaining: number;
      usedServerIds: string[];
      thenDrawToHq: number;
    }
  | {
      kind: "next_design_choose_server";
      cardId: string;
      remaining: number;
      usedServerIds: string[];
      thenDrawToHq: number;
    }
  | {
      kind: "next_design_install_on_server";
      cardId: string;
      serverId: string;
      remaining: number;
      usedServerIds: string[];
      thenDrawToHq: number;
    }
  /** Draw cards until the Corp's HQ (hand) has at least `amount` cards. */
  | { kind: "draw_until_hq_has"; amount: number }
  /** Leaf: set source.chosenServerId. */
  | { kind: "set_chosen_server"; serverId: string }
  /**
   * Asmund: search stack for up to `max` virus or weapon cards with different
   * titles; host them faceup on source (not installed); shuffle.
   */
  | { kind: "search_stack_host_virus_or_weapon"; max: number }
  /** Leaf: host a specific stack card faceup on source (not installed). */
  | { kind: "host_stack_card_on_source"; cardId: string }
  /** Asmund turn begin: may move 1 hosted card to grip; trash host if empty. */
  | { kind: "may_add_hosted_card_to_grip" }
  | { kind: "add_hosted_card_to_grip"; cardId: string }
  /** Matryoshka: turn each hosted card faceup. */
  | { kind: "turn_hosted_cards_faceup" }
  /** Host a grip card with matching title faceup on source (not installed). */
  | { kind: "host_copy_from_grip"; title: string }
  /**
   * Matryoshka break: pay X¢, turn 1 faceup hosted copy facedown, break X
   * encounter subs (X chosen among affordable unbroken counts).
   */
  | { kind: "matryoshka_break" }
  /** Leaf: pay amount, turn hostedId facedown, break amount subs. */
  | {
      kind: "matryoshka_break_resolve";
      amount: number;
      hostedId: string;
    }
  | { kind: "host_ice_program_on_self" }
  /** Hush: move this trojan onto another installed ice. */
  | { kind: "rehost_on_other_ice" }
  /** Leaf: rehost source onto a specific ice instance. */
  | { kind: "rehost_to_ice"; iceId: string }
  | { kind: "return_subliminal_from_archives" }
  | { kind: "aesop_trash_for_credits"; amount: number }
  | { kind: "ayla_set_aside_to_grip" }
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
  | { kind: "bonus_access"; amount: number }
  /**
   * After the current run ends, breach the named central server
   * (Virtuoso non-HQ mark branch). Not a run; does not declare success.
   */
  | {
      kind: "breach_server_when_run_ends";
      server: "hq" | "rd" | "archives";
    }
  /**
   * Search stack for a program and install it, paying install costs
   * (Into the Depths). Opens a choice when multiple affordable programs
   * exist; sole candidate auto-installs. Shuffles the stack after search
   * (deterministic reverse in v0). No-op install when none affordable.
   */
  | { kind: "search_stack_program_install" }
  /** Leaf: install a specific program from stack paying full install cost. */
  | { kind: "install_stack_program"; cardId: string }
  /**
   * Spark of Inspiration: set aside top of stack faceup until a program
   * (or deck empty); may install that program paying `discount`¢ less;
   * shuffle remaining set-aside into stack.
   */
  | { kind: "spark_of_inspiration_resolve"; discount?: number }
  /** Leaf: install a set-aside program paying `discount`¢ less; shuffle remainder. */
  | { kind: "install_set_aside_program"; cardId: string; discount: number }
  /** Leaf: shuffle runner set-aside zone into stack (no install). */
  | { kind: "shuffle_runner_set_aside_into_stack" }
  /**
   * The Price: trash top `count` of stack to heap; may install 1 of those
   * cards paying `discount`¢ less (remainder stay in heap).
   */
  | { kind: "trash_top_n_may_install_discount"; count: number; discount: number }
  /** Leaf: install a specific heap card paying `discount`¢ less. */
  | { kind: "install_heap_card"; cardId: string; discount: number }
  /** Leaf: trash the top card of the Runner's stack (no-op if empty). */
  | { kind: "trash_top_of_stack" }
  /** Trash the top card of R&D (The Basalt Spire). */
  | { kind: "trash_top_of_rd" }
  /** Reveal the top card of R&D (leave it on top; Public Health Portal). */
  | { kind: "reveal_top_of_rd" }
  /** Set the base strength of the pending trace (Flip Switch interrupt). */
  | { kind: "set_trace_base_strength"; amount: number }
  /** Uroboros: Runner cannot initiate another run this turn. */
  | { kind: "forbid_runner_runs_this_turn" }
  /**
   * Fully Operational: choose gain 2¢ or draw 2; repeat for each iced rooted
   * remote (plus the initial resolve).
   */
  | { kind: "fully_operational_resolve" }
  /** Leaf: one Fully Operational choose step; continues while remaining > 0. */
  | { kind: "fully_operational_step"; remaining: number }
  /**
   * Blueberry!™ Diesel: look at top `n` of stack; may add one of those to
   * bottom; remaining stay on top in original relative order.
   */
  | { kind: "look_top_n_stack_may_bottom_one"; n: number }
  /** Leaf: move a looked stack card to bottom; restore others on top. */
  | {
      kind: "look_top_n_stack_bottom_one";
      /** When omitted/empty, leave all looked cards on top. */
      cardId?: string;
      lookedIds: string[];
    }
  /**
   * Pelangi: choose barrier / code gate / sentry; grant to encountered ice
   * for the remainder of this encounter.
   */
  | { kind: "choose_grant_encounter_ice_subtype" }
  /** Leaf: grant one ice subtype to the current encounter. */
  | { kind: "grant_encounter_ice_subtype"; subtype: string }
  /**
   * Loot Box: reveal top `n` of stack; Corp chooses one → add to grip and
   * Corp gains that card's play/install cost; shuffle remaining into stack.
   */
  | { kind: "loot_box_reveal_top_n"; n: number }
  /** Leaf: resolve Loot Box pick among revealed stack ids. */
  | {
      kind: "loot_box_pick_revealed";
      cardId: string;
      revealedIds: string[];
    }
  /**
   * Secure and Protect: search R&D for ice, reveal, shuffle, install
   * protecting a central paying `discount`¢ less.
   */
  | { kind: "search_rd_ice_install_central_discount"; discount: number }
  /** Leaf: after choosing which R&D ice, reveal and offer central install. */
  | {
      kind: "search_rd_ice_install_central_discount_pick";
      cardId: string;
      discount: number;
    }
  /** Leaf: install revealed R&D ice on a central with install-cost discount. */
  | {
      kind: "install_rd_ice_protecting_central_discount";
      cardId: string;
      serverId: string;
      discount: number;
    }
  /**
   * Rejig: bounce 1 installed program/hardware to grip, then install 1
   * program/hardware from grip paying X¢ less (X = printed install cost of
   * the bounced card).
   */
  | { kind: "rejig_bounce_install" }
  /**
   * Urban Art Vernissage: may return 1 installed non-virus trojan to grip;
   * if so, place `hostedAmount` credits on source.
   */
  | {
      kind: "may_return_non_virus_trojan_to_grip_place_hosted";
      hostedAmount: number;
    }
  /** Leaf: return a specific installed Runner card to grip. */
  | { kind: "return_rig_card_to_grip"; cardId: string }
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
  | { kind: "trash_runner_rig_card_record_program_cost"; cardId: string }
  /**
   * Search stack for a card of `cardType` and install paying `discount`¢ less.
   * Opens a choice when multiple affordable matches exist; shuffles after.
   */
  | {
      kind: "search_stack_type_install";
      cardType: "program" | "hardware" | "resource";
      discount: number;
    }
  /** Leaf: install a specific stack card paying `discount`¢ less; shuffle rest. */
  | {
      kind: "install_stack_card";
      cardId: string;
      discount: number;
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
    }
  /**
   * DJ Fenris on-install: host a g-mod identity from the outside-game pile
   * that does not match the Runner identity's faction (CR 1.5.4 / 1.5.4a).
   * Mandatory — no decline. Fails closed when no legal candidate.
   */
  | {
      kind: "fenris_host_gmod_identity_from_outside_game";
      requireFactionMismatchWithRunnerIdentity?: boolean;
    }
  /** Leaf: host a specific outside-game g-mod identity on Fenris. */
  | {
      kind: "fenris_host_gmod_identity";
      cardId: string;
      requireFactionMismatchWithRunnerIdentity?: boolean;
    };

export type Cond =
  | { op: "true" }
  | { op: "false" }
  | { op: "during_run" }
  | { op: "source_is_breaker" }
  | { op: "source_is_ice" }
  | { op: "source_rezzed" }
  | { op: "grip_nonempty" }
  | { op: "has_installed_program" }
  | { op: "runner_tagged" }
  /** True when the Runner has at least `amount` tags (Doomscroll). */
  | { op: "tags_gte"; amount: number }
  | { op: "first_mandate_this_turn" }
  | { op: "clicks_remaining"; side: SideRef }
  | { op: "clicks_gte"; side: SideRef; amount: number }
  | { op: "credits_lte"; side: SideRef; amount: number }
  | { op: "credits_gte"; side: SideRef; amount: number }
  | { op: "credits_gt_other_side"; side: SideRef }
  /** True when side's credits equal the other side's (Supercorridor). */
  | { op: "credits_eq_other_side"; side: SideRef }
  /** True when Runner has gained ≥ N clicks during the current run (Pichação). */
  | { op: "clicks_gained_this_run_gte"; amount: number }
  /**
   * True when no decoder broke a printed subroutine this encounter
   * (Virtual Service Agent).
   */
  | { op: "did_not_break_printed_sub_with_decoder_this_encounter" }
  | { op: "protecting_remote" }
  /** True when source ice protects HQ, R&D, or Archives (Grubber). */
  | { op: "protecting_central" }
  /** Negate a nested condition (Vertigo). */
  | { op: "not"; cond: Cond }
  /** True when at least one piece of ice was rezzed this turn (Underdome). */
  | { op: "ice_rezzed_this_turn" }
  /** True when the effect source was scored by the Corp this turn (Witch Hunt). */
  | { op: "self_scored_this_turn" }
  | { op: "hq_nonempty" }
  | { op: "has_installed_resource" }
  | { op: "grip_count_odd" }
  | { op: "grip_count_gte"; amount: number }
  /** Piranhas: HQ size > grip size. */
  | { op: "hq_count_gt_grip" }
  /** Lat: Runner grip size equals Corp HQ size. */
  | { op: "grip_count_eq_hq" }
  /** Chisel: current encounter ice effective strength ≤ amount. */
  | { op: "encounter_ice_strength_lte"; amount: number }
  /**
   * Daily Quest: Runner made no successful run on the server hosting the
   * source card during their last turn.
   */
  | { op: "no_successful_run_on_host_server_last_turn" }
  | { op: "successful_run_this_turn" }
  /**
   * Current run was declared unsuccessful (`run.successful === false`).
   * Blocked success (Crisium/Flagship) leaves `successful === null` and must
   * not match — CR 6.8.4a.
   */
  | { op: "run_unsuccessful" }
  /** Current run ended successfully (`run.successful === true`). */
  | { op: "run_successful" }
  | { op: "attacking_central" }
  | { op: "attacking_rd" }
  | { op: "attacking_hq" }
  | { op: "attacking_archives" }
  | { op: "attacking_remote" }
  | { op: "advancements_gte"; amount: number }
  | { op: "agenda_counters_gte"; amount: number }
  | { op: "hq_count_lte"; amount: number }
  | { op: "power_counters_gte"; amount: number }
  /** Hosted credits on the effect source ≥ amount (Mystic Maemi / Paladin Poemu). */
  | { op: "hosted_credits_gte"; amount: number }
  | { op: "virus_counters_gte"; amount: number }
  | { op: "has_mark" }
  | { op: "attacking_mark" }
  /**
   * Source ice protects the currently attacked server (run in progress).
   * Hákarl / Wave / Anemone-class "during a run against this server".
   */
  | { op: "source_protects_attacked_server" }
  /**
   * Source is installed in a server root or ice slot (Mr. Hendrik
   * "while it is installed").
   */
  | { op: "source_installed" }
  /**
   * Megaprix Qualifier: at least 2 cards in either score area share the
   * source's title (source is already scored when onScore fires).
   */
  | { op: "another_copy_of_source_title_in_either_score_area" }
  /**
   * Threat N: active when any player has at least `level` agenda points
   * (CR §1.17.1a). Used by Liberation-cycle Threat abilities.
   */
  | { op: "threat"; level: number }
  | { op: "source_has_subtype"; subtype: string }
  /**
   * Source card's host server has no rezzed ice protecting it
   * (Federal Fundraising).
   */
  | { op: "host_server_unprotected_by_ice" }
  /**
   * Attacked server is protected by at least one piece of ice
   * (Argus Crackdown).
   */
  | { op: "attacked_server_protected_by_ice" }
  /**
   * Current run attacks the server stored on source.chosenServerId
   * (Hyoubu Precog Manifold).
   */
  | { op: "attacking_chosen_server" }
  /**
   * Agenda scored/stolen from the root of the server hosting the source card
   * (Tucana).
   */
  | { op: "last_agenda_scored_or_stolen_from_source_server_root" }
  /**
   * Successful runs on HQ, R&D, and Archives this turn
   * (Jeitinho / Wizard's Chest / Deep Dive-class).
   */
  | { op: "successful_all_centrals_this_turn" }
  /** Corp played at least one operation this turn (Nebula-class). */
  | { op: "corp_played_operation_this_turn" }
  /** Corp identity is currently on its flip side (Nebula). */
  | { op: "identity_flipped" }
  /** Corp identity is on its front side (Nebula). */
  | { op: "identity_unflipped" }
  /** Runner accessed at least one card this turn (Hoshiko). */
  | { op: "accessed_a_card_this_turn" }
  /** Runner did not access any cards this turn (Hoshiko flip side). */
  | { op: "not_accessed_a_card_this_turn" }
  /**
   * Most recently scored agenda this turn was installed this turn
   * (Word on the Street).
   */
  | { op: "last_scored_agenda_installed_this_turn" }
  /** Current operation was played from a zone other than HQ (Petty Cash). */
  | { op: "played_from_non_hq" }
  /** All nested conditions must hold. */
  | { op: "and"; conds: Cond[] }
  /** At least one nested condition holds. */
  | { op: "or"; conds: Cond[] }
  /** Runner identity has the given subtype (DreamNet digital). */
  | { op: "identity_has_subtype"; subtype: string }
  /** Runner has at least `amount` link (DreamNet). */
  | { op: "link_gte"; amount: number }
  /** Runner MU limit equals used MU (Dewi). */
  | { op: "runner_mu_full" }
  /** Runner has at least `amount` unused MU (Dewi flip side). */
  | { op: "runner_unused_mu_gte"; amount: number }
  /** A subroutine resolved during the current run (Ryō Phoenix). */
  | { op: "subroutine_resolved_this_run" }
  /** Source card was installed this turn (The Class Act). */
  | { op: "self_installed_this_turn" };

export type ChoiceOption = {
  id: string;
  label: string;
  effect: Effect;
};

export type Effect =
  | { op: "seq"; effects: Effect[] }
  | { op: "do"; action: Primitive }
  | { op: "if"; cond: Cond; then: Effect; else?: Effect }
  | { op: "prevent"; forbid: "jack_out" }
  | {
      op: "choose";
      chooser: "corp" | "runner";
      options: ChoiceOption[];
    };

/** Known primitive kinds — used by card loader fail-closed checks. */
export const KNOWN_PRIMITIVE_KINDS = new Set([
  "end_the_run",
  "prevent_declare_run_successful",
  "gain_credits",
  "lose_credits",
  "lose_all_credits",
  "pump_strength",
  "fortify_ice",
  "weaken_ice",
  "spend_stealth_credits",
  "redirect_approach_to_server",
  "net_damage",
  "net_damage_1_plus_copies_of_source_title_in_other_score_area",
  "net_damage_per_runner_scored_agenda",
  "meat_damage",
  "core_damage",
  "brain_damage",
  "give_tags",
  "give_tags_per_advancement",
  "give_tags_equal_to_last_trace_excess",
  "indexing_may_instead_of_breach",
  "indexing_instead_of_breach_arrange",
  "draw_n_then_bottom_one_of_drawn",
  "bottom_drawn_card",
  "midori_may_swap_approached_ice_with_hq",
  "midori_swap_approached_ice_with_hq",
  "trash_program",
  "trash_resource",
  "trash_own_resource",
  "trash_own_program",
  "trace",
  "draw",
  "draw_up_to",
  "may_add_hq_agenda_ap_lte_to_score",
  "add_hq_agenda_to_score",
  "may_turn_facedown_archives_faceup_then",
  "turn_archives_card_faceup",
  "add_agenda_counter",
  "add_agenda_counters_from_overadvance",
  "remove_agenda_counters",
  "lose_clicks",
  "gain_clicks",
  "take_hosted_credits",
  "place_hosted_credits",
  "add_virus_counter",
  "may_pay_credits_add_virus_counter",
  "pay_credits_add_virus_counter",
  "place_virus_on_program_that_received_virus_this_turn",
  "place_virus_on_program",
  "may_search_stack_copy_of_last_installed_hardware_add_to_grip",
  "search_stack_copy_of_last_installed_hardware_add_to_grip",
  "look_top_last_trace_excess_stack_trash_one_arrange_rest",
  "data_hound_trash_looked",
  "data_hound_arrange_looked",
  "choose_server_corp_trash_ice_protecting",
  "corp_trash_ice_protecting_server",
  "corp_trash_ice_card",
  "trash_virtual_resource_or_link_card",
  "remove_virus_counters",
  "gain_credits_per_virus",
  "increase_hand_size",
  "trash_hq",
  "trash_hq_card",
  "trash_hardware",
  "trash_hardware_install_cost_lte_last_trace_excess",
  "trash_up_to_n_resources",
  "trash_installed_resources_with_any_subtype",
  "trash_installed_resource_with_subtype",
  "trash_ice_rezzed_this_run",
  "trash_program_or_hardware",
  "trash_resource_or_hardware",
  "shuffle_hq_to_rd",
  "shuffle_archives_to_rd",
  "net_damage_agenda_points_this_turn",
  "forbid_scoring_agendas_this_turn",
  "forbid_advance_this_turn",
  "skip_discard_this_turn",
  "place_advancements",
  "place_advancements_on_self_per_faceup_archive_types",
  "score_self_as_agenda",
  "add_to_runner_score_as_agenda",
  "burner_resolve",
  "burner_place",
  "set_run_skip_breach",
  "breach_server_standalone",
  "queue_breaches_after_current",
  "muse_search_install_non_daemon",
  "muse_search_zone",
  "muse_install_picked",
  "muse_install_on_ice",
  "muse_install_on_daemon",
  "wizard_chest_resolve",
  "wizard_chest_for_type",
  "wizard_chest_install",
  "check_assassination_win",
  "install_heap_paying_click",
  "may_pay_credits_for_core_damage",
  "may_pay_credits_for_core_damage_per_advancement",
  "may_pay_credits_for_net_damage_per_advancement",
  "may_pay_credits_for_trash_programs_per_advancement",
  "may_pay_credits_for_shuffle_installed_runner_per_advancement",
  "trash_n_programs_remaining",
  "shuffle_n_installed_runner_remaining",
  "install_any_number_from_hq_ignore_costs",
  "search_stack_subtype_may_install",
  "grant_chosen_ice_subtypes_until_end_of_turn",
  "grant_ice_subtypes_until_end_of_turn",
  "queens_gambit_place_up_to",
  "queens_gambit_place_on",
  "may_return_rezzed_to_hq_gain_rez_cost",
  "return_rezzed_to_hq_gain_rez_cost",
  "may_take_any_hosted_credits_skip_breach",
  "take_hosted_credits_skip_breach",
  "may_add_archives_card_to_rd_top",
  "add_archives_card_to_rd_top",
  "oversight_ai_rez_and_host",
  "oversight_ai_host_on_ice",
  "ber_rez_bioroid_and_host",
  "ber_host_on_ice",
  "gain_credits_base_plus_per_passed_ice",
  "trash_any_rezzed_give_tags",
  "trash_any_number_from_hq",
  "turn_all_archives_facedown",
  "may_install_from_archives_in_remote_root_with_advancements",
  "install_archives_remote_root_with_advancements",
  "rfg_self",
  "rfg_heap_card",
  "rfg_specific_heap_card",
  "rfg_installed_with_any_subtype",
  "rfg_installed_card",
  "shuffle_up_to_n_distinct_heap_titles_into_stack",
  "shuffle_up_to_n_distinct_heap_titles_into_stack_continue",
  "rfg_self_then_derez_bypassed_ice",
  "allotted_clicks_next_turn",
  "score_agenda_card",
  "choose_forfeit_runner_scored_agenda",
  "forfeit_runner_scored_agenda",
  "false_echo_trash_then_corp_rez_or_hq",
  "rez_ice_by_id",
  "move_unrezzed_ice_to_hq",
  "caissa_pawn_host_outermost_central",
  "caissa_rook_host",
  "caissa_bishop_host",
  "caissa_advance_host_inward_or_install",
  "eureka_reveal_install_or_trash",
  "record_reconstructor_archives_instead_of_breach",
  "profiteering_on_score",
  "copycat_jump_to_rezzed_copy",
  "copycat_continue_from_ice",
  "install_caissa_from_zone_ignore_costs",
  "project_ares_on_score",
  "project_ares_trash_next",
  "invasion_of_privacy",
  "invasion_of_privacy_success",
  "invasion_of_privacy_trash_next",
  "invasion_of_privacy_finish",
  "trash_from_grip",
  "trash_installed_runner_card",
  "purge_virus_counters",
  "score_facedown_agenda_from_archives_if_clean",
  "choose_rezzed_bioroid_forbid_runner_break",
  "gain_credits_per_rezzed_subtype",
  "lose_credits_per_rezzed_subtype",
  "add_from_heap_to_grip",
  "search_rd_ice_to_hq",
  "search_rd_up_to_one_each_subtype_to_hq",
  "search_rd_operation_to_hq",
  "search_rd_operation_or_agenda_to_hq",
  "search_rd_agenda_to_hq",
  "look_top_n_rd_may_install_one",
  "look_top_n_rd_may_install_and_rez_ignore_costs",
  "install_rez_rd_looked_card_ignore_costs",
  "install_rd_looked_card_paying_costs",
  "return_rd_looked_to_deck_top",
  "look_top_n_rd_arrange",
  "look_top_n_rd_trash_one_hq_one_arrange_rest",
  "cultivate_trash_looked",
  "cultivate_hq_looked",
  "look_top_1_rd_choose_type_may_reveal_gain",
  "peek_rd_top_for_chosen_type_may_reveal_gain",
  "corp_may_reveal_agenda_from_hq",
  "reveal_corp_hand_card",
  "look_top_n_rd_peek",
  "search_rd_install_rez_ice_on_source_server",
  "install_rez_rd_ice_on_source_server",
  "etr_subroutines_per_runner_tags_on_encounter",
  "rd_arrange_pick",
  "may_play_or_install_from_hq",
  "play_hq_operation_paying_costs",
  "remove_advancements",
  "meat_damage_per_advancement",
  "net_damage_per_advancement",
  "net_damage_and_tags_equal_runner_tags",
  "unleash_rez_may_resolve_sub",
  "unleash_rez_ice_then_may_resolve_sub",
  "trash_self",
  "trash_self_and_derez_host",
  "trash_attacked_server_root",
  "archives_to_hq",
  "trash_installed_runner",
  "forbid_steal_trash_this_run",
  "access_one_root_other_server",
  "install_hq_new_remotes_with_advancements",
  "moon_pool_resolve",
  "simulation_reset_resolve",
  "search_rd_install_rez_by_printed_rez_cost",
  "deep_dive_resolve",
  "install_from_hq_or_archives",
  "may_install_facedown_from_archives",
  "may_trash_from_grip_to_draw",
  "trash_grip_card_draw",
  "may_trash_one_from_grip",
  "trash_grip_card",
  "trash_n_from_grip",
  "trash_up_to_grip_cards_gain_credits_each",
  "may_trash_hardware_from_grip_place_hosted_credits",
  "trash_grip_hardware_place_hosted_credits",
  "spend_power_for_bonus_access",
  "reveal_top_stack_to_grip_place_hosted_credits",
  "forbid_runner_break_on_source",
  "may_trash_hq_then",
  "forbid_installed_runner_break_for_run",
  "forbid_runner_card_break_for_run",
  "may_give_runner_credits_then",
  "blank_installed_resource_until_corp_turn_end",
  "blank_resource_until_corp_turn_end",
  "limit_printed_breaks_on_source_for_run",
  "return_installed_corp_to_hq",
  "install_ice_inward_free",
  "howler_install_rez_bioroid_inward",
  "howler_install_rez_chosen",
  "awakening_center_rez_hosted",
  "prevent_pending_subroutine_break",
  "break_host_subroutine",
  "break_encounter_subroutine",
  "place_event_credits",
  "may_start_run",
  "queue_start_run",
  "may_install_from_heap",
  "install_from_heap",
  "may_add_from_heap_to_stack_bottom",
  "add_from_heap_to_stack_bottom",
  "may_add_from_heap_to_stack_top",
  "add_from_heap_to_stack_top",
  "may_add_one_of_card_ids_to_stack_bottom",
  "add_card_id_to_stack_bottom",
  "offer_jack_out",
  "yagi_swap_hq_with_attacked_root_or_ice",
  "yagi_swap_hq_with_attacked_pick",
  "daruma_swap_this_root_with_other_root_or_hq",
  "daruma_swap_pick",
  "peeping_tom_choose_type_reveal_gain_etr_unless_tag_for_run",
  "peeping_tom_apply_type",
  "hangeki_choose_installed_runner_may_access",
  "hangeki_runner_may_access",
  "hangeki_access_installed",
  "derez_encounter_ice",
  "grant_approached_rezzed_bioroid_etr_subroutine_this_run",
  "search_stack_icebreaker",
  "search_rd_non_agenda",
  "search_rd_to_hq",
  "swap_two_ice",
  "rez_ice_ignoring_costs",
  "may_install_from_grip",
  "remove_tags",
  "remove_all_tags",
  "lose_credits_per_advancement",
  "gain_credits_per_advancement",
  "gain_credits_per_power_counter",
  "gain_credits_per_hq_card",
  "gain_credits_per_runner_tags",
  "gain_credits_per_distinct_faceup_archive_type",
  "swap_ice_with_hq",
  "hq_to_top_rd",
  "hq_card_to_top_rd",
  "net_damage_up_to_tags",
  "bypass_current_ice",
  "forbid_end_the_run_this_encounter",
  "remove_power_counter",
  "remove_all_power_counters",
  "reveal_top_n_rd_trash_one",
  "reveal_top_n_rd_trash_picked",
  "reveal_top_n_rd",
  "gain_clicks_equal_to_runner_scored_agendas",
  "move_runner_to_outermost_attacked",
  "rez_spend_credits_for_power_counters",
  "climactic_choose_server_corp_may_trash_ice_else_bonus_access",
  "climactic_corp_may_trash_ice",
  "climactic_trash_ice",
  "climactic_register_bonus_access",
  "prevent_pending_end_the_run_from_corp_card_ability",
  "whistleblower_may_trash_name_agenda_steal_ignore_costs",
  "whistleblower_name_agenda",
  "hyoubu_reveal_grip_random_or_stack_top",
  "hyoubu_reveal_grip_random",
  "hyoubu_reveal_stack_top",
  "class_act_look_top_draw_amount_plus_one_bottom_one",
  "class_act_bottom_one_then_draw",
  "backup_plan_may_rerun_ignore_additional_costs_bypass_last_ice",
  "backup_plan_rerun",
  "complete_image_name_net_damage_loop",
  "complete_image_net_named",
  "khusyuk_choose_install_cost_set_aside_access_shuffle",
  "khusyuk_set_aside_access_shuffle",
  "khusyuk_access_set_aside",
  "mirrormorph_take_different_action_click_discount",
  "add_power_counter",
  "draw_per_power_counter",
  "draw_per_clicks_remaining",
  "take_hosted_bad_publicity",
  "may_host_bad_publicity_then",
  "host_bad_publicity",
  "may_search_hq_rd_archives_agenda_to_hq_or_rd_bottom",
  "search_zone_agenda_to_hq_or_rd_bottom",
  "place_agenda_hq_or_rd_bottom",
  "may_search_rd_non_agenda_any_subtype_to_hq",
  "pay_credits_or_etr",
  "meat_damage_stolen_last_turn",
  "derez_ice",
  "derez_card",
  "derez_source",
  "may_derez_installed",
  "trash_corp_card",
  "may_trash_installed",
  "trash_installed",
  "trash_n_installed_corp",
  "trash_corp_card_then_trash_n",
  "realloc_two_rezzed_ice",
  "realloc_pick_second",
  "realloc_resolve",
  "place_advancements_per_iced_rooted_remote",
  "may_add_archives_card_to_rd_top_or_bottom",
  "add_archives_card_to_rd",
  "add_installed_runner_to_grip",
  "add_installed_runner_card_to_grip",
  "install_and_rez_ice_from_archives",
  "install_and_rez_archives_ice",
  "trash_installed_runner_lte_last_trashed_rez",
  "must_trash_installed",
  "forbid_bioroid_ice_paid_abilities_this_turn",
  "install_and_rez_asset_or_upgrade_free",
  "install_and_rez_from_archives_free",
  "may_return_self_to_grip",
  "return_source_to_grip",
  "return_source_to_hq",
  "install_resource_discount",
  "install_from_grip_discount",
  "install_ice_from_hq_ignore_costs",
  "install_up_to_n_programs_from_grip_discount",
  "haas_pet_project_setup",
  "haas_pet_project_install_continue",
  "scavenge_install_program",
  "trash_runner_rig_card_record_program_cost",
  "install_grip_card",
  "may_charge_card",
  "give_bad_publicity",
  "remove_bad_publicity",
  "shuffle_installed_runner_into_stack",
  "shuffle_runner_card_into_stack",
  "reveal_hq_gain_credits",
  "flip_identity",
  "melies_secretly_set_face",
  "melies_set_face",
  "look_top_rd_may_trash_if_do_archives_to_hq",
  "add_to_corp_score_as_agenda",
  "may_host_one_from_grip_facedown_then_draw",
  "host_grip_card_facedown_then_draw",
  "shuffle_hosted_cards_into_stack",
  "look_top_stack_may_reveal_breaker_or_run_event",
  "reveal_runner_stack_top_to_grip",
  "peer_review",
  "play_self_from_archives_then_rfg",
  "may_play_event_from_heap",
  "play_heap_event_card",
  "bigger_picture_remove_tags",
  "mitra_aman_approach_ice",
  "may_install_program_hardware_from_last_runner_discarded",
  "swap_approached_ice_with_hq_or_archives",
  "plutus_pay_rez_additional_cost",
  "forfeit_scored_agenda",
  "forfeit_self",
  "plutus_may_play_transaction_from_archives",
  "play_archives_transaction_then_rfg",
  "ip_enforcement_remove_tags",
  "store_ip_enforcement_tags_removed",
  "ip_enforcement_install_from_runner_score",
  "charm_offensive_trash_rezzed_accessed",
  "host_all_programs_from_grip",
  "may_install_one_hosted_program",
  "install_hosted_program",
  "may_host_one_program_or_hardware_from_grip_faceup",
  "host_grip_program_or_hardware_faceup",
  "may_install_one_hosted_card",
  "install_hosted_card",
  "gamedragon_may_host_on_icebreaker",
  "host_hardware_on_icebreaker",
  "search_stack_same_title_may_install_paying",
  "trash_rezzed_ice_gain_credits",
  "trash_rezzed_ice_gain_credits_resolve",
  "install_up_to_from_hq_paying_costs",
  "install_up_to_from_hq_paying_costs_continue",
  "deja_vu_from_heap",
  "deja_vu_add_heap_cards",
  "search_stack_subtype_add_to_grip",
  "search_stack_subtype_add_to_grip_pick",
  "expose",
  "expose_up_to",
  "prevent_pending_expose",
  "continue_expose_after_may_rez",
  "rez_for_expose_interrupt",
  "prevent_pending_installed_trash",
  "accelerated_beta_test",
  "accelerated_beta_test_continue",
  "accelerated_beta_test_trash_looked",
  "accelerated_beta_test_install_ice",
  "expert_schedule_analyzer_may_instead_of_breach",
  "reveal_top_rd_corp_may_draw",
  "raymond_flint_breach_hq_no_root",
  "cap_run_access_remaining",
  "break_subroutine_on_self",
  "accelerated_diagnostics",
  "unorthodox_predictions_on_score",
  "reveal_grip",
  "reveal_grip_may_trash_one",
  "runner_lose_credits_equal_corp_bad_publicity",
  "power_shutdown",
  "draw_top_rd_to_hand",
  "begin_replace_breach_hq_hand_only",
  "unorthodox_predictions_lock_subtype",
  "power_shutdown_trash_rd",
  "power_shutdown_trash_runner_install_lte",
  "keyhole_may_instead_of_breach",
  "keyhole_instead_of_breach",
  "keyhole_trash_looked_program",
  "lawyer_up",
  "leverage",
  "leverage_shield_runner",
  "capstone_trash_grip_draw_for_installed_dupes",
  "capstone_trash_grip_card",
  "rex_campaign_turn_begin",
  "rex_campaign_when_empty",
  "gain_credits_per_runner_grip_size",
  "forbid_runner_spend_credits_for_run",
  "remove_bad_publicity_up_to",
  "hemorrhage_corp_trash_from_hq",
  "tallie_perrault_on_ops_trashed",
  "restoring_face_trash_exec_sysop_clone_remove_bp",
  "trash_installed_corp_card",
  "toshiyuki_sakai_swap_with_hq",
  "toshiyuki_sakai_swap_execute",
  "singularity_instead_of_breach_trash_root",
  "savoir_faire_install_program_from_grip",
  "fall_guy_prevent_trash_resource",
  "power_nap_gain_per_double_in_heap",
  "paintbrush_choose_ice_gain_subtype",
  "paintbrush_apply_subtype",
  "gyri_labyrinth_reduce_max_hand",
  "reclamation_order_archives_to_hq",
  "broadcast_square_trace_prevent_bad_publicity",
  "corporate_shuffle_hq_to_rd_draw",
  "caprice_nisei_secret_spend",
  "marker_add_etr_to_next_ice",
  "tennin_place_advancement_on_installed",
  "mutate_trash_rezzed_ice_additional_cost",
  "mutate_record_trashed_ice",
  "mutate_operation_resolve",
  "taurus_trace_subroutine",
  "taurus_trace_success",
  "grail_reveal_gain_subroutines",
  "runner_mu_modifier_until_turn_end",
  "cyber_threat",
  "cyber_threat_server",
  "cyber_threat_corp_rez",
  "cyber_threat_runner_reward",
  "nasir_lose_all_credits",
  "social_engineering",
  "social_engineering_mark",
  "eden_shard_may_instead_of_breach",
  "eden_shard_install_instead",
  "shi_kyu_spend_for_net_damage",
  "mushin_install_from_hq_root",
  "mushin_install_hq_card_pick_server",
  "install_hq_card_on_server_root",
  "komainu_add_net_subs_for_rezzed_ice",
  "pup_pay_or_net",
  "corp_may_pay_net",
  "inazuma_lock_breaking_next_encounter",
  "susanoo_redirect_to_archives",
  "gain_credits_per_remote_with_root_card",
  "gain_credits_per_installed_subtype",
  "iain_gain_if_corp_ahead_on_agenda",
  "look_top_n_stack_add_one_to_grip_shuffle",
  "express_delivery_finish",
  "planned_assault_play_run_event_from_stack",
  "play_heap_event_ignore_cost",
  "search_stack_take_to_grip",
  "take_runner_deck_card_to_grip",
  "draw_from_stack_bottom",
  "break_all_but_n_subroutines_on_encounter",
  "bug_may_pay_reveal_top",
  "bug_reveal_top_paid",
  "push_your_luck_secret_spend_guess",
  "push_your_luck_corp_guessed_wrong",
  "push_your_luck_corp_guessed_right",
  "oracle_may_choose_type_reveal_install",
  "oracle_reveal_top_match",
  "plan_b_reveal_score_from_hq",
  "score_agenda_from_hq",
  "unregistered_trash_rezzed_ice_gain_per_strength",
  "unregistered_trash_ice_gain",
  "tori_hanzo_pay_instead_net",
  "may_swap_two_installed_ice",
  "corp_pay_credits",
  "runner_pay_credits",
  "break_all_destroyer_subroutines_on_encounter",
  "account_siphon_may_instead_of_breach",
  "account_siphon_resolve",
  "vamp_may_instead_of_breach",
  "vamp_resolve",
  "set_skip_breach",
  "escher_may_instead_of_breach",
  "escher_rearrange_pick_server",
  "escher_rearrange_server_ice",
  "exploratory_romp_may_instead_of_breach",
  "exploratory_romp_choose_card",
  "exploratory_romp_remove_up_to",
  "chum_register_next_ice",
  "sensei_register_etr_on_other_ice_for_run",
  "ryo_phoenix_on_successful_run",
  "host_top_of_stack_on_source",
  "trash_all_hosted_cards",
  "detente_host_random_hq",
  "detente_return_two_hosted_may_access",
  "access_random_hq",
  "au_co_remove_2_look_rd",
  "au_co_trash_looked_rd_card",
  "install_runner_score_agenda_on_remote",
  "install_runner_score_agenda_on_server",
  "move_advancements",
  "trash_passed_unrezzed_ice",
  "forged_activation_orders",
  "install_program_from_stack_or_heap_free",
  "place_advancements_x_from_tags",
  "troubleshooter_fortify",
  "resolve_bioroid_subroutine",
  "may_flip_archives_ice_resolve_subroutine",
  "flip_archives_ice_resolve_subroutine",
  "trash_encounter_ice_resolve_subroutine",
  "may_trash_other_installed_gain_printed_install_and_draw",
  "touch_ups_choose_type_shuffle_grip",
  "move_runner_to_archives_outermost",
  "may_rez_installed_ice_discount",
  "may_resolve_subroutine_on_rezzed_ice",
  "touch_ups_shuffle_grip_of_type",
  "shuffle_grip_card_into_stack",
  "rez_ice_with_discount",
  "trash_encounter_ice_if_strength_lte",
  "may_choose_server",
  "set_named_server",
  "choose_server",
  "choose_server_runner",
  "next_design_may_install_ice",
  "next_design_choose_server",
  "next_design_install_on_server",
  "draw_until_hq_has",
  "set_chosen_server",
  "search_stack_host_virus_or_weapon",
  "host_stack_card_on_source",
  "may_add_hosted_card_to_grip",
  "add_hosted_card_to_grip",
  "turn_hosted_cards_faceup",
  "host_copy_from_grip",
  "matryoshka_break",
  "matryoshka_break_resolve",
  "host_ice_program_on_self",
  "rehost_on_other_ice",
  "rehost_to_ice",
  "return_subliminal_from_archives",
  "aesop_trash_for_credits",
  "ayla_set_aside_to_grip",
  "sabotage",
  "identify_mark",
  "start_run_on_mark",
  "charge",
  "bonus_access",
  "breach_server_when_run_ends",
  "search_stack_program_install",
  "install_stack_program",
  "spark_of_inspiration_resolve",
  "install_set_aside_program",
  "shuffle_runner_set_aside_into_stack",
  "trash_top_n_may_install_discount",
  "install_heap_card",
  "trash_top_of_stack",
  "trash_top_of_rd",
  "reveal_top_of_rd",
  "set_trace_base_strength",
  "forbid_runner_runs_this_turn",
  "fully_operational_resolve",
  "fully_operational_step",
  "look_top_n_stack_may_bottom_one",
  "look_top_n_stack_bottom_one",
  "choose_grant_encounter_ice_subtype",
  "grant_encounter_ice_subtype",
  "loot_box_reveal_top_n",
  "loot_box_pick_revealed",
  "search_rd_ice_install_central_discount",
  "search_rd_ice_install_central_discount_pick",
  "install_rd_ice_protecting_central_discount",
  "rejig_bounce_install",
  "may_return_non_virus_trojan_to_grip_place_hosted",
  "return_rig_card_to_grip",
  "may_trash_other_installed_search_stack_same_type_install",
  "trash_runner_rig_card",
  "search_stack_non_virus_program_install_ignore_costs_track",
  "return_tracked_install_to_stack_top_if_installed",
  "reveal_hq_forbid_steal_trash_copies_this_run",
  "forbid_steal_trash_title_this_run",
  "install_stack_program_ignore_costs_track",
  "search_stack_type_install",
  "install_stack_card",
  "exclusive_choices_per_passed_ice",
  "fenris_host_gmod_identity_from_outside_game",
  "fenris_host_gmod_identity",
  "gain_strength_this_turn",
  "choose_icebreaker_gain_strength_this_turn",
  "choose_ice_additional_rez_cost_this_turn",
  "add_ice_additional_rez_cost_this_turn",
  "shuffle_source_into_rd",
  "may_install_from_hq_paying_costs",
  "may_install_from_hq_in_remote_root_paying_costs",
  "install_hq_card_paying_costs",
  "place_advancements_on",
  "place_advancements_on_up_to",
  "place_advancements_on_up_to_continue",
  "remove_all_virus_from_one_installed",
  "remove_all_virus_from",
  "move_source_ice_to_outermost_attacked",
  "move_source_ice_to_outermost_another_server_continue_run",
  "move_source_ice_to_outermost_server_continue_run",
  "formicary_rez_move_innermost",
  "may_install_ice_from_hq_other_server_ignore_costs",
  "may_install_ice_from_hq_protecting_this_server_ignore_costs",
  "install_hq_ice_protecting_server_ignore_costs",
  "fortify_all_ice",
  "meeting_of_minds_resolve",
  "meeting_of_minds_fetch",
  "meeting_of_minds_reveal_gain",
  "derez_ice_protecting_attacked",
  "may_derez_protecting_attacked_ice",
  "bp_unless_derez_protecting_attacked",
  "may_rez_event_derezzed_ice_ignore_costs",
  "rez_ice_ignore_costs",
  "may_reveal_shuffle_agendas_into_rd",
  "reveal_shuffle_agenda_into_rd",
  "reveal_agenda_hq_or_archives_gain_ap_shuffle",
  "reveal_hq_subtype_install_and_rez_ignore_costs",
  "install_and_rez_hq_ice_protecting_server_ignore_costs",
  "may_remove_advancement_from_installed_gain_credits",
  "remove_advancement_from_installed_gain_credits",
  "look_top_rd_may_trash",
  "look_top_rd_may_bottom",
  "look_top_rd_may_advance_may_bottom",
  "rd_top_to_bottom",
  "swap_source_ice_with_other",
  "may_swap_ice_with_other_installed",
  "may_swap_protecting_attacked_ice_with_other_installed",
  "swap_protecting_attacked_ice_with",
  "swap_protecting_attacked_ice_pick_other",
  "swap_two_installed_ice",
  "pay_credits_reencounter_passed_ice",
  "trash_hq_reencounter_passed_ice",
  "may_install_and_rez_from_hq",
  "install_and_rez_hq_card_with_discount",
  "may_search_rd_install_rez_ignore_costs",
  "search_rd_pick_install_rez_ignore_costs",
  "lycian_choose_subtypes",
  "lycian_gain_subtype",
  "rez_up_to_ice_protecting_attacked_ignore_costs",
  "rez_one_protecting_attacked_ignore_costs",
  "derez_up_to_ice_protecting_server",
  "derez_one_protecting_server",
  "lightning_spend_counter_rez_up_to_protecting_attacked",
  "brasilia_derez_other_ice_for_strength",
  "end_the_run_unless_trash_installed",
  "end_the_run_unless_take_tags",
  "end_the_run_unless_net_damage",
  "end_the_run_unless_corp_pays",
  "end_the_run_unless_runner_spends_clicks",
  "end_the_run_unless_pay_credits_per_runner_scored_agenda",
  "may_take_bad_publicity_then_add_agenda_counters_equal_to_bad_publicity",
  "add_agenda_counters_equal_to_bad_publicity",
  "may_pay_credits_gain_click_trash_at_turn_end_if_no_successful_run",
  "algernon_pay_gain_click",
  "may_gain_click_then_tag_at_turn_end",
  "joshua_gain_click_tag_at_turn_end",
  "host_grip_program_or_hardware_with_power_equal_install_cost",
  "host_grip_pw_card_with_power_equal_install_cost",
  "remove_power_from_hosted_card_install_at_zero_ignore_costs",
  "remove_power_from_hosted_card_id_install_at_zero",
  "install_hosted_card_ignore_costs",
  "may_pay_credits_for_core_damage_per_ice_protecting_this_server",
  "choose_server_rearrange_ice",
  "rearrange_server_ice",
  "choose_ice_gain_credits_per_advancement",
  "gain_credits_from_ice_advancements",
  "choose_one_subtype_until_derez",
  "gain_one_subtype_until_derez",
  "may_install_from_hq_ignore_costs_then_place_advancements",
  "install_hq_card_ignore_costs_then_place_advancements",
  "derez_any_number_then_may_rez_discount_per",
  "derez_any_number_continue",
  "may_rez_card_with_discount",
  "rez_card_with_discount",
  "add_agenda_from_hq_to_score_worth_exact_hosted_power",
  "add_hq_agenda_to_score_with_agenda_points",
  "gain_credits_equal_to_rd_accesses_this_run",
  "may_place_up_to_advancements_on_remote_root_then_access_unless_pay",
  "place_advancements_then_access_unless_pay",
  "access_installed_card",
  "host_on_ice_as_condition",
  "host_on_ice_as_condition_on",
  "add_power_counter_equal_to_last_access_trash_cost",
  "install_up_to_from_heap_facedown",
  "install_up_to_from_heap_facedown_continue",
  "fast_break_equal_to_runner_scored_agendas",
  "fast_break_choose_remote",
  "fast_break_install_continue",
  "install_from_hq_on_remote_root_place_advancement_cannot_score_or_rez_until_next_corp_turn",
  "install_hq_remote_root_place_adv_lock_until_next_corp_turn",
  "choose_exactly_n",
  "enable_hosted_credits_spend_for",
  "may_move_source_upgrade_to_another_server_root",
  "move_upgrade_to_server_root",
  "may_move_rezzed_upgrade_to_another_server_root",
  "may_move_picked_rezzed_upgrade",
  "move_rezzed_upgrade_to_server_root",
  "add_random_grip_to_stack_bottom",
  "add_random_grip_to_stack_top",
  "shuffle_random_grip_into_stack",
  "shuffle_grip_and_heap_into_stack",
  "rfg_top_of_stack",
  "may_play_nonterminal_operation_from_hq",
  "may_play_operation_from_hq",
  "shuffle_any_number_hq_to_rd",
  "shuffle_hq_card_into_rd",
  "may_remove_power_counters_then_net_damage",
  "set_rez_ice_forfeit_discount",
  "may_install_ice_from_hq_discount_then_move_source",
  "install_hq_ice_protecting_server_paying_costs",
  "play_hq_operation_card",
  "add_installed_resource_to_stack_top",
  "add_installed_program_to_stack_top",
  "move_runner_card_to_stack_top",
  "host_installed_trojan_on_attacked_ice",
  "host_program_on_ice",
  "play_psi_game",
  "restrict_run_access",
  "may_install_from_hq_on_other_remote_ignore_costs",
  "install_hq_on_remote_ignore_costs",
  "may_install_from_archives_ignore_costs",
  "install_from_archives",
  "install_archives_card_paying",
  "may_install_from_hq_ignore_costs",
  "may_install_from_hq_ignore_costs_exclude_source_server",
  "wall_to_wall_turn_begin",
  "wall_to_wall_turn_begin_continue",
  "wall_to_wall_place_adv_on_ice",
  "choose_card_type_for_encounter",
  "set_encounter_chosen_card_type",
  "reveal_grip_may_trash_chosen_encounter_type",
  "focus_group_reveal_may_advance",
  "focus_group_after_type",
  "focus_group_may_pay_place",
  "divested_trust_may_forfeit_return_stolen",
  "return_stolen_agenda_to_hq",
  "nihilist_may_remove_2_virus_draw_unless_corp_trash_top_rd",
  "nihilist_remove_virus_from",
  "nihilist_corp_trash_top_rd_or_runner_draws_2",
  "game_over_trash_type_may_pay_3_prevent",
  "game_over_after_type",
  "game_over_process_card",
  "game_over_continue",
  "trash_self_choose_rezzed_protecting_ice_encounter",
  "set_reencounter_ice",
  "may_choose_other_rezzed_ice_encounter_then_resume_source",
  "set_nested_encounter_then_resume_source",
  "trash_random_from_grip",
  "must_trash_own_installed",
  "look_top_n_stack_peek",
  "reveal_top_stack_may_install_program_or_hardware",
  "register_may_shuffle_title_from_heap_on_successful_run_end",
  "may_shuffle_title_from_heap_into_stack",
  "shuffle_heap_card_into_stack",
  "install_archives_card_ignore_costs",
  "install_hq_card_ignore_costs",
  "search_rd_operation_to_top_rd",
  "search_rd_reveal_may_install_ignore_costs_else_hq",
  "search_rd_reveal_pick_install_or_hq",
  "install_program_from_grip_paying_cost",
  "gachapon_resolve",
  "gachapon_install_set_aside",
  "gachapon_after_install_choice",
  "gachapon_shuffle_pick_continue",
  "gachapon_shuffle_selected_rfg_rest",
  "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack",
  "shuffle_up_to_n_heap_cards_with_trash_abilities_into_stack_continue",
  "deal_net_damage_per_power_counter",
  "prevent_pending_damage",
  "prevent_pending_tags",
  "prevent_current_ice_on_encounter",
]);

export const KNOWN_EFFECT_OPS = new Set([
  "seq",
  "do",
  "if",
  "prevent",
  "choose",
]);
export const KNOWN_COND_OPS = new Set([
  "true",
  "false",
  "during_run",
  "source_is_breaker",
  "source_is_ice",
  "source_rezzed",
  "grip_nonempty",
  "has_installed_program",
  "runner_tagged",
  "tags_gte",
  "first_mandate_this_turn",
  "clicks_remaining",
  "clicks_gte",
  "credits_lte",
  "credits_gte",
  "credits_gt_other_side",
  "credits_eq_other_side",
  "clicks_gained_this_run_gte",
  "did_not_break_printed_sub_with_decoder_this_encounter",
  "protecting_remote",
  "protecting_central",
  "not",
  "ice_rezzed_this_turn",
  "self_scored_this_turn",
  "hq_nonempty",
  "has_installed_resource",
  "grip_count_odd",
  "grip_count_gte",
  "hq_count_gt_grip",
  "grip_count_eq_hq",
  "encounter_ice_strength_lte",
  "no_successful_run_on_host_server_last_turn",
  "successful_run_this_turn",
  "run_unsuccessful",
  "run_successful",
  "attacking_central",
  "attacking_rd",
  "attacking_hq",
  "attacking_archives",
  "attacking_remote",
  "advancements_gte",
  "agenda_counters_gte",
  "hq_count_lte",
  "power_counters_gte",
  "hosted_credits_gte",
  "virus_counters_gte",
  "has_mark",
  "attacking_mark",
  "source_protects_attacked_server",
  "source_installed",
  "another_copy_of_source_title_in_either_score_area",
  "threat",
  "source_has_subtype",
  "host_server_unprotected_by_ice",
  "attacked_server_protected_by_ice",
  "attacking_chosen_server",
  "last_agenda_scored_or_stolen_from_source_server_root",
  "successful_all_centrals_this_turn",
  "corp_played_operation_this_turn",
  "identity_flipped",
  "identity_unflipped",
  "accessed_a_card_this_turn",
  "not_accessed_a_card_this_turn",
  "last_scored_agenda_installed_this_turn",
  "played_from_non_hq",
  "and",
  "or",
  "identity_has_subtype",
  "link_gte",
  "runner_mu_full",
  "runner_unused_mu_gte",
  "subroutine_resolved_this_run",
  "self_installed_this_turn",
]);

/** Construction helpers for stubs / tests. */
export const fx = {
  seq: (...effects: Effect[]): Effect => ({ op: "seq", effects }),
  do: (action: Primitive): Effect => ({ op: "do", action }),
  if: (cond: Cond, then: Effect, elseEffect?: Effect): Effect => ({
    op: "if",
    cond,
    then,
    ...(elseEffect !== undefined ? { else: elseEffect } : {}),
  }),
  prevent: (forbid: "jack_out"): Effect => ({ op: "prevent", forbid }),
  choose: (
    chooser: "corp" | "runner",
    options: ChoiceOption[],
  ): Effect => ({ op: "choose", chooser, options }),
  etr: (): Effect => fx.do({ kind: "end_the_run" }),
  gainCredits: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "gain_credits", side, amount }),
  loseCredits: (side: SideRef, amount: number, then?: Effect): Effect =>
    fx.do({
      kind: "lose_credits",
      side,
      amount,
      ...(then !== undefined ? { then } : {}),
    }),
  loseAllCredits: (side: SideRef): Effect =>
    fx.do({ kind: "lose_all_credits", side }),
  pump: (amount: number, duration: PumpDuration = "encounter"): Effect =>
    fx.do({
      kind: "pump_strength",
      amount,
      ...(duration !== "encounter" ? { duration } : {}),
    }),
  fortify: (amount: number): Effect => fx.do({ kind: "fortify_ice", amount }),
  weakenIce: (amount: number): Effect => fx.do({ kind: "weaken_ice", amount }),
  spendStealthCredits: (amount: number): Effect =>
    fx.do({ kind: "spend_stealth_credits", amount }),
  redirectApproachToServer: (serverId: "hq" | "rd"): Effect =>
    fx.do({ kind: "redirect_approach_to_server", serverId }),
  netDamage: (amount: number): Effect => fx.do({ kind: "net_damage", amount }),
  netDamage1PlusCopiesOfSourceTitleInOtherScoreArea: (): Effect =>
    fx.do({
      kind: "net_damage_1_plus_copies_of_source_title_in_other_score_area",
    }),
  netDamagePerRunnerScoredAgenda: (): Effect =>
    fx.do({ kind: "net_damage_per_runner_scored_agenda" }),
  meatDamage: (
    amount: number,
    opts?: { cannotPrevent?: boolean },
  ): Effect =>
    fx.do({
      kind: "meat_damage",
      amount,
      ...(opts?.cannotPrevent ? { cannotPrevent: true } : {}),
    }),
  /** Prefer for printed "core damage" (CR §10.4.2b). */
  coreDamage: (
    amount: number,
    opts?: {
      interactive?: boolean;
      preventByLoseAllClicks?: boolean;
      cannotPrevent?: boolean;
    },
  ): Effect =>
    fx.do({
      kind: "core_damage",
      amount,
      ...(opts?.interactive ? { interactive: true } : {}),
      ...(opts?.preventByLoseAllClicks
        ? { preventByLoseAllClicks: true }
        : {}),
      ...(opts?.cannotPrevent ? { cannotPrevent: true } : {}),
    }),
  /** Alias of coreDamage (CR §10.4.2c "brain damage"). */
  brainDamage: (amount: number): Effect =>
    fx.do({ kind: "brain_damage", amount }),
  mayPayCreditsForCoreDamage: (amount: number, damage: number): Effect =>
    fx.do({ kind: "may_pay_credits_for_core_damage", amount, damage }),
  mayPayCreditsForCoreDamagePerAdvancement: (amount: number): Effect =>
    fx.do({
      kind: "may_pay_credits_for_core_damage_per_advancement",
      amount,
    }),
  mayPayCreditsForNetDamagePerAdvancement: (
    amount: number,
    per: number,
  ): Effect =>
    fx.do({
      kind: "may_pay_credits_for_net_damage_per_advancement",
      amount,
      per,
    }),
  mayPayCreditsForTrashProgramsPerAdvancement: (amount: number): Effect =>
    fx.do({
      kind: "may_pay_credits_for_trash_programs_per_advancement",
      amount,
    }),
  mayPayCreditsForShuffleInstalledRunnerPerAdvancement: (
    amount: number,
  ): Effect =>
    fx.do({
      kind: "may_pay_credits_for_shuffle_installed_runner_per_advancement",
      amount,
    }),
  queueBreachesAfterCurrent: (
    servers: Array<"hq" | "rd" | "archives" | string>,
    cannotAccessRoot?: boolean,
  ): Effect =>
    fx.do({
      kind: "queue_breaches_after_current",
      servers,
      ...(cannotAccessRoot !== undefined ? { cannotAccessRoot } : {}),
    }),
  fastBreakEqualToRunnerScoredAgendas: (): Effect =>
    fx.do({ kind: "fast_break_equal_to_runner_scored_agendas" }),
  installAnyNumberFromHqIgnoreCosts: (): Effect =>
    fx.do({ kind: "install_any_number_from_hq_ignore_costs" }),
  searchStackSubtypeMayInstall: (subtype: string): Effect =>
    fx.do({ kind: "search_stack_subtype_may_install", subtype }),
  grantChosenIceSubtypesUntilEndOfTurn: (subtypes: string[]): Effect =>
    fx.do({
      kind: "grant_chosen_ice_subtypes_until_end_of_turn",
      subtypes,
    }),
  queensGambitPlaceUpTo: (max: number, creditsPer: number): Effect =>
    fx.do({ kind: "queens_gambit_place_up_to", max, creditsPer }),
  mayReturnRezzedToHqGainRezCost: (): Effect =>
    fx.do({ kind: "may_return_rezzed_to_hq_gain_rez_cost" }),
  mayTakeAnyHostedCreditsSkipBreach: (): Effect =>
    fx.do({ kind: "may_take_any_hosted_credits_skip_breach" }),
  mayAddArchivesCardToRdTop: (): Effect =>
    fx.do({ kind: "may_add_archives_card_to_rd_top" }),
  oversightAiRezAndHost: (): Effect =>
    fx.do({ kind: "oversight_ai_rez_and_host" }),
  berRezBioroidAndHost: (): Effect =>
    fx.do({ kind: "ber_rez_bioroid_and_host" }),
  gainCreditsBasePlusPerPassedIce: (
    side: SideRef,
    base: number,
    per: number,
  ): Effect =>
    fx.do({
      kind: "gain_credits_base_plus_per_passed_ice",
      side,
      base,
      per,
    }),
  rfgInstalledWithAnySubtype: (
    subtypes: string[],
    pick: "choose" | "first" = "choose",
  ): Effect =>
    fx.do({ kind: "rfg_installed_with_any_subtype", subtypes, pick }),
  rfgInstalledCard: (cardId: string): Effect =>
    fx.do({ kind: "rfg_installed_card", cardId }),
  shuffleUpToNDistinctHeapTitlesIntoStack: (max: number): Effect =>
    fx.do({ kind: "shuffle_up_to_n_distinct_heap_titles_into_stack", max }),
  addToRunnerScoreAsAgenda: (agendaPoints?: number): Effect =>
    fx.do({
      kind: "add_to_runner_score_as_agenda",
      ...(agendaPoints !== undefined ? { agendaPoints } : {}),
    }),
  giveTags: (amount: number): Effect => fx.do({ kind: "give_tags", amount }),
  giveTagsEqualToLastTraceExcess: (): Effect =>
    fx.do({ kind: "give_tags_equal_to_last_trace_excess" }),
  indexingMayInsteadOfBreach: (): Effect =>
    fx.do({ kind: "indexing_may_instead_of_breach" }),
  drawNThenBottomOneOfDrawn: (amount: number): Effect =>
    fx.do({ kind: "draw_n_then_bottom_one_of_drawn", amount }),
  midoriMaySwapApproachedIceWithHq: (): Effect =>
    fx.do({ kind: "midori_may_swap_approached_ice_with_hq" }),
  giveTagsPerAdvancement: (base = 1, per = 1): Effect =>
    fx.do({ kind: "give_tags_per_advancement", base, per }),
  trashProgram: (
    pick: "first" | "choose" = "first",
    aiOnly = false,
  ): Effect =>
    fx.do({
      kind: "trash_program",
      pick,
      ...(aiOnly ? { aiOnly: true } : {}),
    }),
  trashResource: (pick: "first" | "choose" = "first"): Effect =>
    fx.do({ kind: "trash_resource", pick }),
  trashOwnResource: (): Effect => fx.do({ kind: "trash_own_resource" }),
  trashOwnProgram: (): Effect => fx.do({ kind: "trash_own_program" }),
  draw: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "draw", side, amount }),
  loseClicks: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "lose_clicks", side, amount }),
  gainClicks: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "gain_clicks", side, amount }),
  takeHostedCredits: (amount: number): Effect =>
    fx.do({ kind: "take_hosted_credits", amount }),
  placeHostedCredits: (amount: number): Effect =>
    fx.do({ kind: "place_hosted_credits", amount }),
  addVirusCounter: (amount: number): Effect =>
    fx.do({ kind: "add_virus_counter", amount }),
  mayPayCreditsAddVirusCounter: (credits: number, amount: number = 1): Effect =>
    fx.do({ kind: "may_pay_credits_add_virus_counter", credits, amount }),
  placeVirusOnProgramThatReceivedVirusThisTurn: (amount: number): Effect =>
    fx.do({
      kind: "place_virus_on_program_that_received_virus_this_turn",
      amount,
    }),
  maySearchStackCopyOfLastInstalledHardwareAddToGrip: (): Effect =>
    fx.do({
      kind: "may_search_stack_copy_of_last_installed_hardware_add_to_grip",
    }),
  lookTopLastTraceExcessStackTrashOneArrangeRest: (): Effect =>
    fx.do({
      kind: "look_top_last_trace_excess_stack_trash_one_arrange_rest",
    }),
  chooseServerCorpTrashIceProtecting: (): Effect =>
    fx.do({ kind: "choose_server_corp_trash_ice_protecting" }),
  trashVirtualResourceOrLinkCard: (
    pick: "first" | "choose" = "choose",
  ): Effect =>
    fx.do({ kind: "trash_virtual_resource_or_link_card", pick }),
  removeVirusCounters: (amount: number): Effect =>
    fx.do({ kind: "remove_virus_counters", amount }),
  gainCreditsPerVirus: (per: number): Effect =>
    fx.do({ kind: "gain_credits_per_virus", per }),
  increaseHandSize: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "increase_hand_size", side, amount }),
  trashHq: (
    pick: "first" | "choose" | "random" = "first",
    then?: Effect,
    amount?: number,
  ): Effect =>
    fx.do({
      kind: "trash_hq",
      pick,
      ...(amount !== undefined ? { amount } : {}),
      ...(then ? { then } : {}),
    }),
  trashHardware: (pick: "first" | "choose" = "first"): Effect =>
    fx.do({ kind: "trash_hardware", pick }),
  trashHardwareInstallCostLteLastTraceExcess: (
    pick: "first" | "choose" = "choose",
  ): Effect =>
    fx.do({
      kind: "trash_hardware_install_cost_lte_last_trace_excess",
      pick,
    }),
  trashUpToNResources: (n: number): Effect =>
    fx.do({ kind: "trash_up_to_n_resources", n }),
  exposeUpTo: (max: number): Effect => fx.do({ kind: "expose_up_to", max }),
  vampMayInsteadOfBreach: (): Effect =>
    fx.do({ kind: "vamp_may_instead_of_breach" }),
  escherMayInsteadOfBreach: (): Effect =>
    fx.do({ kind: "escher_may_instead_of_breach" }),
  exploratoryRompMayInsteadOfBreach: (amount: number): Effect =>
    fx.do({ kind: "exploratory_romp_may_instead_of_breach", amount }),
  senseiRegisterEtrOnOtherIceForRun: (): Effect =>
    fx.do({ kind: "sensei_register_etr_on_other_ice_for_run" }),
  addInstalledProgramToStackTop: (): Effect =>
    fx.do({ kind: "add_installed_program_to_stack_top" }),
  trashInstalledResourcesWithAnySubtype: (subtypes: string[]): Effect =>
    fx.do({ kind: "trash_installed_resources_with_any_subtype", subtypes }),
  trashInstalledResourceWithSubtype: (
    subtype: string,
    pick: "first" | "choose" = "choose",
  ): Effect =>
    fx.do({ kind: "trash_installed_resource_with_subtype", subtype, pick }),
  trashIceRezzedThisRun: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "trash_ice_rezzed_this_run", pick }),
  endTheRunUnlessCorpPays: (amount: number): Effect =>
    fx.do({ kind: "end_the_run_unless_corp_pays", amount }),
  endTheRunUnlessRunnerSpendsClicks: (amount: number): Effect =>
    fx.do({ kind: "end_the_run_unless_runner_spends_clicks", amount }),
  endTheRunUnlessTakeTags: (amount: number): Effect =>
    fx.do({ kind: "end_the_run_unless_take_tags", amount }),
  endTheRunUnlessNetDamage: (amount: number): Effect =>
    fx.do({ kind: "end_the_run_unless_net_damage", amount }),
  trashProgramOrHardware: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "trash_program_or_hardware", pick }),
  shuffleHqToRd: (amount: number): Effect =>
    fx.do({ kind: "shuffle_hq_to_rd", amount }),
  shuffleArchivesToRd: (amount: number): Effect =>
    fx.do({ kind: "shuffle_archives_to_rd", amount }),
  netDamageAgendaPointsThisTurn: (): Effect =>
    fx.do({ kind: "net_damage_agenda_points_this_turn" }),
  forbidScoringAgendasThisTurn: (): Effect =>
    fx.do({ kind: "forbid_scoring_agendas_this_turn" }),
  forbidAdvanceThisTurn: (): Effect =>
    fx.do({ kind: "forbid_advance_this_turn" }),
  skipDiscardThisTurn: (): Effect => fx.do({ kind: "skip_discard_this_turn" }),
  placeAdvancements: (
    amount: number,
    preferNotInstalledThisTurn = false,
    opts?: {
      sameServerRootAsSource?: boolean;
      excludeSelf?: boolean;
      anyInstalledIce?: boolean;
      thenMayScore?: boolean;
      then?: Effect;
    },
  ): Effect =>
    fx.do({
      kind: "place_advancements",
      amount,
      ...(preferNotInstalledThisTurn
        ? { preferNotInstalledThisTurn: true }
        : {}),
      ...(opts?.sameServerRootAsSource
        ? { sameServerRootAsSource: true }
        : {}),
      ...(opts?.excludeSelf ? { excludeSelf: true } : {}),
      ...(opts?.anyInstalledIce ? { anyInstalledIce: true } : {}),
      ...(opts?.thenMayScore ? { thenMayScore: true } : {}),
      ...(opts?.then ? { then: opts.then } : {}),
    }),
  scoreSelfAsAgenda: (agendaPoints?: number): Effect =>
    fx.do({
      kind: "score_self_as_agenda",
      ...(agendaPoints !== undefined ? { agendaPoints } : {}),
    }),
  trashAnyRezzedGiveTags: (): Effect =>
    fx.do({ kind: "trash_any_rezzed_give_tags" }),
  rfgSelf: (): Effect => fx.do({ kind: "rfg_self" }),
  allottedClicksNextTurn: (side: SideRef, delta: number): Effect =>
    fx.do({ kind: "allotted_clicks_next_turn", side, delta }),
  scoreAgendaCard: (cardId: string): Effect =>
    fx.do({ kind: "score_agenda_card", cardId }),
  purgeVirusCounters: (): Effect => fx.do({ kind: "purge_virus_counters" }),
  searchRdIceToHq: (): Effect => fx.do({ kind: "search_rd_ice_to_hq" }),
  searchRdOperationToHq: (): Effect =>
    fx.do({ kind: "search_rd_operation_to_hq" }),
  gainCreditsPerRezzedSubtype: (subtype: string, per = 1): Effect =>
    fx.do({ kind: "gain_credits_per_rezzed_subtype", subtype, per }),
  loseCreditsPerRezzedSubtype: (
    side: SideRef,
    subtype: string,
    per = 1,
  ): Effect =>
    fx.do({ kind: "lose_credits_per_rezzed_subtype", side, subtype, per }),
  addFromHeapToGrip: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "add_from_heap_to_grip", pick }),
  chooseRezzedBioroidForbidRunnerBreak: (): Effect =>
    fx.do({ kind: "choose_rezzed_bioroid_forbid_runner_break" }),
  scoreFacedownAgendaFromArchivesIfClean: (): Effect =>
    fx.do({ kind: "score_facedown_agenda_from_archives_if_clean" }),

  mayPurgeVirusCounters: (): Effect =>
    fx.choose("corp", [
      {
        id: "purge",
        label: "Purge virus counters",
        effect: fx.purgeVirusCounters(),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.gainCredits("corp", 0),
      },
    ]),
  mayDraw: (side: SideRef, amount: number): Effect =>
    fx.choose(side === "runner" ? "runner" : "corp", [
      {
        id: "draw",
        label: `Draw ${amount}`,
        effect: fx.draw(side, amount),
      },
      {
        id: "decline",
        label: "Decline",
        effect: fx.gainCredits(side, 0),
      },
    ]),
  removeAdvancements: (amount: number, then?: Effect): Effect =>
    fx.do({
      kind: "remove_advancements",
      amount,
      ...(then ? { then } : {}),
    }),
  meatDamagePerAdvancement: (): Effect =>
    fx.do({ kind: "meat_damage_per_advancement" }),
  netDamagePerAdvancement: (base = 0): Effect =>
    fx.do({ kind: "net_damage_per_advancement", base }),
  netDamageAndTagsEqualRunnerTags: (): Effect =>
    fx.do({ kind: "net_damage_and_tags_equal_runner_tags" }),
  unleashRezMayResolveSub: (): Effect =>
    fx.do({ kind: "unleash_rez_may_resolve_sub" }),
  trashSelf: (): Effect => fx.do({ kind: "trash_self" }),
  trashSelfAndDerezHost: (): Effect =>
    fx.do({ kind: "trash_self_and_derez_host" }),
  mayInstallIceFromHqProtectingThisServerIgnoreCosts: (): Effect =>
    fx.do({ kind: "may_install_ice_from_hq_protecting_this_server_ignore_costs" }),
  mayPlayEventFromHeap: (): Effect => fx.do({ kind: "may_play_event_from_heap" }),
  trashAttackedServerRoot: (): Effect =>
    fx.do({ kind: "trash_attacked_server_root" }),
  archivesToHq: (amount: number): Effect =>
    fx.do({ kind: "archives_to_hq", amount }),
  trashInstalledRunner: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "trash_installed_runner", pick }),
  forbidStealTrashThisRun: (): Effect =>
    fx.do({ kind: "forbid_steal_trash_this_run" }),
  accessOneRootOtherServer: (): Effect =>
    fx.do({ kind: "access_one_root_other_server" }),
  installHqNewRemotesWithAdvancements: (
    max: number,
    advancements: number,
  ): Effect =>
    fx.do({
      kind: "install_hq_new_remotes_with_advancements",
      max,
      advancements,
    }),
  moonPoolResolve: (trashHqMax = 2, revealArchivesMax = 2): Effect =>
    fx.do({
      kind: "moon_pool_resolve",
      trashHqMax,
      revealArchivesMax,
    }),
  simulationResetResolve: (trashHqMax = 5): Effect =>
    fx.do({ kind: "simulation_reset_resolve", trashHqMax }),
  searchRdInstallRezByPrintedRezCost: (delta: number): Effect =>
    fx.do({ kind: "search_rd_install_rez_by_printed_rez_cost", delta }),
  deepDiveResolve: (setAside = 8, initialAccess = 1): Effect =>
    fx.do({ kind: "deep_dive_resolve", setAside, initialAccess }),
  installFromHqOrArchives: (): Effect =>
    fx.do({ kind: "install_from_hq_or_archives" }),
  mayInstallFacedownFromArchives: (): Effect =>
    fx.do({ kind: "may_install_facedown_from_archives" }),
  mayTrashFromGripToDraw: (): Effect =>
    fx.do({ kind: "may_trash_from_grip_to_draw" }),
  trashGripCardDraw: (cardId: string): Effect =>
    fx.do({ kind: "trash_grip_card_draw", cardId }),
  mayTrashOneFromGrip: (): Effect => fx.do({ kind: "may_trash_one_from_grip" }),
  trashGripCard: (cardId: string): Effect =>
    fx.do({ kind: "trash_grip_card", cardId }),
  trashNFromGrip: (amount: number): Effect =>
    fx.do({ kind: "trash_n_from_grip", amount }),
  trashUpToGripCardsGainCreditsEach: (
    remaining: number,
    per: number,
    types?: Array<"program" | "hardware" | "resource">,
  ): Effect =>
    fx.do({
      kind: "trash_up_to_grip_cards_gain_credits_each",
      remaining,
      per,
      ...(types ? { types } : {}),
    }),
  mayTrashHardwareFromGripPlaceHostedCredits: (amount: number): Effect =>
    fx.do({
      kind: "may_trash_hardware_from_grip_place_hosted_credits",
      amount,
    }),
  trashGripHardwarePlaceHostedCredits: (
    cardId: string,
    amount: number,
  ): Effect =>
    fx.do({
      kind: "trash_grip_hardware_place_hosted_credits",
      cardId,
      amount,
    }),
  spendPowerForBonusAccess: (amount: number): Effect =>
    fx.do({ kind: "spend_power_for_bonus_access", amount }),
  revealTopStackToGripPlaceHostedCredits: (): Effect =>
    fx.do({ kind: "reveal_top_stack_to_grip_place_hosted_credits" }),
  forbidRunnerBreakOnSource: (): Effect =>
    fx.do({ kind: "forbid_runner_break_on_source" }),
  mayTrashHqThen: (then: Effect): Effect =>
    fx.do({ kind: "may_trash_hq_then", then }),
  forbidInstalledRunnerBreakForRun: (): Effect =>
    fx.do({ kind: "forbid_installed_runner_break_for_run" }),
  forbidRunnerCardBreakForRun: (cardId: string): Effect =>
    fx.do({ kind: "forbid_runner_card_break_for_run", cardId }),
  mayGiveRunnerCreditsThen: (amount: number, then: Effect): Effect =>
    fx.do({ kind: "may_give_runner_credits_then", amount, then }),
  blankInstalledResourceUntilCorpTurnEnd: (): Effect =>
    fx.do({ kind: "blank_installed_resource_until_corp_turn_end" }),
  blankResourceUntilCorpTurnEnd: (cardId: string): Effect =>
    fx.do({ kind: "blank_resource_until_corp_turn_end", cardId }),
  limitPrintedBreaksOnSourceForRun: (max: number): Effect =>
    fx.do({ kind: "limit_printed_breaks_on_source_for_run", max }),
  returnInstalledCorpToHq: (
    pick: "first" | "choose" = "choose",
    opts?: { unrezzedOnly?: boolean },
  ): Effect =>
    fx.do({
      kind: "return_installed_corp_to_hq",
      pick,
      ...(opts?.unrezzedOnly ? { unrezzedOnly: true } : {}),
    }),
  installIceInwardFree: (): Effect =>
    fx.do({ kind: "install_ice_inward_free" }),
  howlerInstallRezBioroidInward: (): Effect =>
    fx.do({ kind: "howler_install_rez_bioroid_inward" }),
  awakeningCenterRezHosted: (cardId: string): Effect =>
    fx.do({ kind: "awakening_center_rez_hosted", cardId }),
  preventPendingSubroutineBreak: (): Effect =>
    fx.do({ kind: "prevent_pending_subroutine_break" }),
  breakHostSubroutine: (): Effect =>
    fx.do({ kind: "break_host_subroutine" }),
  breakEncounterSubroutine: (
    requireSubtype?: string,
    maxSubs?: number,
  ): Effect =>
    fx.do({
      kind: "break_encounter_subroutine",
      ...(requireSubtype ? { requireSubtype } : {}),
      ...(maxSubs !== undefined ? { maxSubs } : {}),
    }),
  offerJackOut: (): Effect => fx.do({ kind: "offer_jack_out" }),
  darumaSwapThisRootWithOtherRootOrHq: (onSuccess?: Effect): Effect =>
    fx.do({
      kind: "daruma_swap_this_root_with_other_root_or_hq",
      ...(onSuccess ? { onSuccess } : {}),
    }),
  peepingTomChooseTypeRevealGainEtrUnlessTagForRun: (): Effect =>
    fx.do({ kind: "peeping_tom_choose_type_reveal_gain_etr_unless_tag_for_run" }),
  hangekiChooseInstalledRunnerMayAccess: (
    onAccess: Effect,
    onDecline: Effect,
  ): Effect =>
    fx.do({
      kind: "hangeki_choose_installed_runner_may_access",
      onAccess,
      onDecline,
    }),
  searchStackIcebreaker: (
    mayInstallIfSuccessfulRunThisTurn = false,
  ): Effect =>
    fx.do({
      kind: "search_stack_icebreaker",
      ...(mayInstallIfSuccessfulRunThisTurn
        ? { mayInstallIfSuccessfulRunThisTurn: true }
        : {}),
    }),
  searchRdNonAgenda: (): Effect => fx.do({ kind: "search_rd_non_agenda" }),
  searchRdToHq: (amount = 1): Effect =>
    fx.do({ kind: "search_rd_to_hq", amount }),
  swapTwoIce: (): Effect => fx.do({ kind: "swap_two_ice" }),
  rezIceIgnoringCosts: (): Effect =>
    fx.do({ kind: "rez_ice_ignoring_costs" }),
  mayInstallFromGrip: (discount?: number): Effect =>
    fx.do({
      kind: "may_install_from_grip",
      ...(discount !== undefined ? { discount } : {}),
    }),
  gainStrengthThisTurn: (amount: number): Effect =>
    fx.do({ kind: "gain_strength_this_turn", amount }),
  chooseIcebreakerGainStrengthThisTurn: (amount: number): Effect =>
    fx.do({ kind: "choose_icebreaker_gain_strength_this_turn", amount }),
  chooseIceAdditionalRezCostThisTurn: (amount: number): Effect =>
    fx.do({ kind: "choose_ice_additional_rez_cost_this_turn", amount }),
  addIceAdditionalRezCostThisTurn: (
    cardId: string,
    amount: number,
  ): Effect =>
    fx.do({ kind: "add_ice_additional_rez_cost_this_turn", cardId, amount }),
  shuffleSourceIntoRd: (): Effect => fx.do({ kind: "shuffle_source_into_rd" }),
  mayInstallFromHqPayingCosts: (
    thenMayRemoveTagToAdvance?: boolean,
  ): Effect =>
    fx.do({
      kind: "may_install_from_hq_paying_costs",
      ...(thenMayRemoveTagToAdvance ? { thenMayRemoveTagToAdvance: true } : {}),
    }),
  installHqCardPayingCosts: (
    cardId: string,
    thenMayRemoveTagToAdvance?: boolean,
  ): Effect =>
    fx.do({
      kind: "install_hq_card_paying_costs",
      cardId,
      ...(thenMayRemoveTagToAdvance ? { thenMayRemoveTagToAdvance: true } : {}),
    }),
  placeAdvancementsOn: (cardId: string, amount: number): Effect =>
    fx.do({ kind: "place_advancements_on", cardId, amount }),
  chooseExactlyN: (n: number, options: ChoiceOption[]): Effect =>
    fx.do({ kind: "choose_exactly_n", n, options }),
  enableHostedCreditsSpendFor: (
    purposes: Array<"install" | "trash">,
  ): Effect => fx.do({ kind: "enable_hosted_credits_spend_for", purposes }),
  mayMoveSourceUpgradeToAnotherServerRoot: (): Effect =>
    fx.do({ kind: "may_move_source_upgrade_to_another_server_root" }),
  searchRdOperationOrAgendaToHq: (): Effect =>
    fx.do({ kind: "search_rd_operation_or_agenda_to_hq" }),
  lookTopNRdMayInstallOne: (n: number): Effect =>
    fx.do({ kind: "look_top_n_rd_may_install_one", n }),
  lookTopNRdMayInstallAndRezIgnoreCosts: (n: number): Effect =>
    fx.do({ kind: "look_top_n_rd_may_install_and_rez_ignore_costs", n }),
  yagiSwapHqWithAttackedRootOrIce: (): Effect =>
    fx.do({ kind: "yagi_swap_hq_with_attacked_root_or_ice" }),
  derezEncounterIce: (): Effect => fx.do({ kind: "derez_encounter_ice" }),
  grantApproachedRezzedBioroidEtrSubroutineThisRun: (): Effect =>
    fx.do({ kind: "grant_approached_rezzed_bioroid_etr_subroutine_this_run" }),
  focusGroupRevealMayAdvance: (): Effect =>
    fx.do({ kind: "focus_group_reveal_may_advance" }),
  divestedTrustMayForfeitReturnStolen: (gainCredits = 5): Effect =>
    fx.do({
      kind: "divested_trust_may_forfeit_return_stolen",
      gainCredits,
    }),
  returnStolenAgendaToHq: (cardId: string): Effect =>
    fx.do({ kind: "return_stolen_agenda_to_hq", cardId }),
  nihilistMayRemove2VirusDrawUnlessCorpTrashTopRd: (): Effect =>
    fx.do({
      kind: "nihilist_may_remove_2_virus_draw_unless_corp_trash_top_rd",
    }),
  gameOverTrashTypeMayPay3Prevent: (): Effect =>
    fx.do({ kind: "game_over_trash_type_may_pay_3_prevent" }),
  lookTopNRdArrange: (n: number): Effect =>
    fx.do({ kind: "look_top_n_rd_arrange", n }),
  mayPlayOrInstallFromHq: (): Effect =>
    fx.do({ kind: "may_play_or_install_from_hq" }),
  moveUpgradeToServerRoot: (serverId: string): Effect =>
    fx.do({ kind: "move_upgrade_to_server_root", serverId }),
  removeTags: (amount: number): Effect =>
    fx.do({ kind: "remove_tags", amount }),
  removeAllTags: (): Effect => fx.do({ kind: "remove_all_tags" }),
  loseCreditsPerAdvancement: (per: number): Effect =>
    fx.do({ kind: "lose_credits_per_advancement", per }),
  gainCreditsPerAdvancement: (per: number): Effect =>
    fx.do({ kind: "gain_credits_per_advancement", per }),
  gainCreditsPerPowerCounter: (per: number): Effect =>
    fx.do({ kind: "gain_credits_per_power_counter", per }),
  gainCreditsPerHqCard: (per: number): Effect =>
    fx.do({ kind: "gain_credits_per_hq_card", per }),
  gainCreditsPerRunnerTags: (per: number): Effect =>
    fx.do({ kind: "gain_credits_per_runner_tags", per }),
  hqToTopRd: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "hq_to_top_rd", pick }),
  netDamageUpToTags: (max: number): Effect =>
    fx.do({ kind: "net_damage_up_to_tags", max }),
  bypassCurrentIce: (requireSubtype?: string): Effect =>
    fx.do({
      kind: "bypass_current_ice",
      ...(requireSubtype ? { requireSubtype } : {}),
    }),
  removePowerCounter: (amount: number): Effect =>
    fx.do({ kind: "remove_power_counter", amount }),
  removeAllPowerCounters: (): Effect =>
    fx.do({ kind: "remove_all_power_counters" }),
  revealTopNRdTrashOne: (n: number): Effect =>
    fx.do({ kind: "reveal_top_n_rd_trash_one", n }),
  moveRunnerToOutermostAttacked: (): Effect =>
    fx.do({ kind: "move_runner_to_outermost_attacked" }),
  climacticChooseServerCorpMayTrashIceElseBonusAccess: (): Effect =>
    fx.do({
      kind: "climactic_choose_server_corp_may_trash_ice_else_bonus_access",
    }),
  preventPendingEndTheRunFromCorpCardAbility: (): Effect =>
    fx.do({ kind: "prevent_pending_end_the_run_from_corp_card_ability" }),
  whistleblowerMayTrashNameAgendaStealIgnoreCosts: (): Effect =>
    fx.do({ kind: "whistleblower_may_trash_name_agenda_steal_ignore_costs" }),
  hyoubuRevealGripRandomOrStackTop: (): Effect =>
    fx.do({ kind: "hyoubu_reveal_grip_random_or_stack_top" }),
  classActLookTopDrawAmountPlusOneBottomOne: (): Effect =>
    fx.do({ kind: "class_act_look_top_draw_amount_plus_one_bottom_one" }),
  backupPlanMayRerunIgnoreAdditionalCostsBypassLastIce: (): Effect =>
    fx.do({
      kind: "backup_plan_may_rerun_ignore_additional_costs_bypass_last_ice",
    }),
  completeImageNameNetDamageLoop: (): Effect =>
    fx.do({ kind: "complete_image_name_net_damage_loop" }),
  khusyukChooseInstallCostSetAsideAccessShuffle: (): Effect =>
    fx.do({ kind: "khusyuk_choose_install_cost_set_aside_access_shuffle" }),
  mirrormorphTakeDifferentActionClickDiscount: (): Effect =>
    fx.do({ kind: "mirrormorph_take_different_action_click_discount" }),
  addPowerCounter: (amount: number): Effect =>
    fx.do({ kind: "add_power_counter", amount }),
  drawPerPowerCounter: (side: SideRef, per = 1): Effect =>
    fx.do({ kind: "draw_per_power_counter", side, per }),
  drawPerClicksRemaining: (side: SideRef): Effect =>
    fx.do({ kind: "draw_per_clicks_remaining", side }),
  installFromHeap: (
    types: Array<"program" | "hardware" | "resource">,
    discount = 0,
  ): Effect => fx.do({ kind: "install_from_heap", types, discount }),
  mayAddFromHeapToStackBottom: (
    types?: Array<"program" | "hardware" | "resource" | "event">,
  ): Effect =>
    fx.do({
      kind: "may_add_from_heap_to_stack_bottom",
      ...(types ? { types } : {}),
    }),
  takeHostedBadPublicity: (amount: number): Effect =>
    fx.do({ kind: "take_hosted_bad_publicity", amount }),
  payCreditsOrEtr: (side: SideRef, amount: number): Effect =>
    fx.do({ kind: "pay_credits_or_etr", side, amount }),
  meatDamageStolenLastTurn: (): Effect =>
    fx.do({ kind: "meat_damage_stolen_last_turn" }),
  derezIce: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "derez_ice", pick }),
  derezCard: (cardId: string): Effect =>
    fx.do({ kind: "derez_card", cardId }),
  derezSource: (): Effect => fx.do({ kind: "derez_source" }),
  mayDerezInstalled: (
    opts?: { excludeSelf?: boolean; then?: Effect },
  ): Effect =>
    fx.do({
      kind: "may_derez_installed",
      excludeSelf: opts?.excludeSelf ?? true,
      ...(opts?.then ? { then: opts.then } : {}),
    }),
  trashCorpCard: (cardId: string): Effect =>
    fx.do({ kind: "trash_corp_card", cardId }),
  mayTrashInstalled: (
    opts?: { excludeSelf?: boolean; rezzedOnly?: boolean; then?: Effect },
  ): Effect =>
    fx.do({
      kind: "may_trash_installed",
      excludeSelf: opts?.excludeSelf ?? true,
      ...(opts?.rezzedOnly ? { rezzedOnly: true } : {}),
      ...(opts?.then ? { then: opts.then } : {}),
    }),
  trashInstalledRunnerLteLastTrashedRez: (
    pick: "first" | "choose" = "choose",
  ): Effect =>
    fx.do({ kind: "trash_installed_runner_lte_last_trashed_rez", pick }),
  mustTrashInstalled: (opts?: { excludeSelf?: boolean }): Effect =>
    fx.do({
      kind: "must_trash_installed",
      excludeSelf: opts?.excludeSelf ?? true,
    }),
  forbidBioroidIcePaidAbilitiesThisTurn: (): Effect =>
    fx.do({ kind: "forbid_bioroid_ice_paid_abilities_this_turn" }),
  installAndRezAssetOrUpgradeFree: (): Effect =>
    fx.do({ kind: "install_and_rez_asset_or_upgrade_free" }),
  installAndRezFromArchivesFree: (): Effect =>
    fx.do({ kind: "install_and_rez_from_archives_free" }),
  mayReturnSelfToGrip: (creditCost: number): Effect =>
    fx.do({ kind: "may_return_self_to_grip", creditCost }),
  installResourceDiscount: (discount: number): Effect =>
    fx.do({ kind: "install_resource_discount", discount }),
  installFromGripDiscount: (
    types: Array<"program" | "hardware" | "resource">,
    discount: number,
    mayCharge = false,
  ): Effect =>
    fx.do({
      kind: "install_from_grip_discount",
      types,
      discount,
      ...(mayCharge ? { mayCharge: true } : {}),
    }),
  installGripCard: (cardId: string, discount: number): Effect =>
    fx.do({ kind: "install_grip_card", cardId, discount }),
  mayChargeCard: (cardId: string): Effect =>
    fx.do({ kind: "may_charge_card", cardId }),
  giveBadPublicity: (amount: number): Effect =>
    fx.do({ kind: "give_bad_publicity", amount }),
  revealHqGainCredits: (maxCards: number, creditsEach: number): Effect =>
    fx.do({ kind: "reveal_hq_gain_credits", maxCards, creditsEach }),
  moveAdvancements: (amount: number): Effect =>
    fx.do({ kind: "move_advancements", amount }),
  trashPassedUnrezzedIce: (): Effect =>
    fx.do({ kind: "trash_passed_unrezzed_ice" }),
  forgedActivationOrders: (): Effect =>
    fx.do({ kind: "forged_activation_orders" }),
  installProgramFromStackOrHeapFree: (): Effect =>
    fx.do({ kind: "install_program_from_stack_or_heap_free" }),
  placeAdvancementsXFromTags: (): Effect =>
    fx.do({ kind: "place_advancements_x_from_tags" }),
  troubleshooterFortify: (): Effect =>
    fx.do({ kind: "troubleshooter_fortify" }),
  resolveBioroidSubroutine: (): Effect =>
    fx.do({ kind: "resolve_bioroid_subroutine" }),
  mayFlipArchivesIceResolveSubroutine: (): Effect =>
    fx.do({ kind: "may_flip_archives_ice_resolve_subroutine" }),
  flipArchivesIceResolveSubroutine: (
    iceId: string,
    subIndex: number,
  ): Effect =>
    fx.do({ kind: "flip_archives_ice_resolve_subroutine", iceId, subIndex }),
  trashEncounterIceResolveSubroutine: (subIndex: number): Effect =>
    fx.do({ kind: "trash_encounter_ice_resolve_subroutine", subIndex }),
  trashEncounterIceIfStrengthLte: (maxStrength: number): Effect =>
    fx.do({ kind: "trash_encounter_ice_if_strength_lte", maxStrength }),
  mayChooseServer: (): Effect => fx.do({ kind: "may_choose_server" }),
  setNamedServer: (serverId: string): Effect =>
    fx.do({ kind: "set_named_server", serverId }),
  chooseServer: (): Effect => fx.do({ kind: "choose_server" }),
  chooseServerRunner: (): Effect => fx.do({ kind: "choose_server_runner" }),
  nextDesignMayInstallIce: (remaining: number, thenDrawToHq: number): Effect =>
    fx.do({
      kind: "next_design_may_install_ice",
      remaining,
      usedServerIds: [],
      thenDrawToHq,
    }),
  drawUntilHqHas: (amount: number): Effect =>
    fx.do({ kind: "draw_until_hq_has", amount }),
  setChosenServer: (serverId: string): Effect =>
    fx.do({ kind: "set_chosen_server", serverId }),
  searchStackHostVirusOrWeapon: (max = 2): Effect =>
    fx.do({ kind: "search_stack_host_virus_or_weapon", max }),
  hostStackCardOnSource: (cardId: string): Effect =>
    fx.do({ kind: "host_stack_card_on_source", cardId }),
  mayAddHostedCardToGrip: (): Effect =>
    fx.do({ kind: "may_add_hosted_card_to_grip" }),
  addHostedCardToGrip: (cardId: string): Effect =>
    fx.do({ kind: "add_hosted_card_to_grip", cardId }),
  turnHostedCardsFaceup: (): Effect =>
    fx.do({ kind: "turn_hosted_cards_faceup" }),
  hostCopyFromGrip: (title: string): Effect =>
    fx.do({ kind: "host_copy_from_grip", title }),
  matryoshkaBreak: (): Effect => fx.do({ kind: "matryoshka_break" }),
  matryoshkaBreakResolve: (amount: number, hostedId: string): Effect =>
    fx.do({ kind: "matryoshka_break_resolve", amount, hostedId }),
  hostIceProgramOnSelf: (): Effect =>
    fx.do({ kind: "host_ice_program_on_self" }),
  formicaryRezMoveInnermost: (rezDiscount = 2): Effect =>
    fx.do({ kind: "formicary_rez_move_innermost", rezDiscount }),
  rehostOnOtherIce: (): Effect => fx.do({ kind: "rehost_on_other_ice" }),
  rehostToIce: (iceId: string): Effect =>
    fx.do({ kind: "rehost_to_ice", iceId }),
  /** May charge any installed chargeable card (Orca / Flux). */
  mayChargeChoose: (): Effect => ({
    op: "choose",
    chooser: "runner",
    options: [
      {
        id: "charge",
        label: "Charge 1 of your installed cards",
        effect: fx.do({ kind: "charge", pick: "choose" }),
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
  }),
  returnSubliminalFromArchives: (): Effect =>
    fx.do({ kind: "return_subliminal_from_archives" }),
  aesopTrashForCredits: (amount: number): Effect =>
    fx.do({ kind: "aesop_trash_for_credits", amount }),
  aylaSetAsideToGrip: (): Effect =>
    fx.do({ kind: "ayla_set_aside_to_grip" }),
  sabotage: (amount: number, interactive = false): Effect =>
    fx.do({
      kind: "sabotage",
      amount,
      ...(interactive ? { interactive: true } : {}),
    }),
  identifyMark: (): Effect => fx.do({ kind: "identify_mark" }),
  startRunOnMark: (): Effect => fx.do({ kind: "start_run_on_mark" }),
  chargeSelf: (): Effect => fx.do({ kind: "charge", pick: "self" }),
  chargeChoose: (): Effect => fx.do({ kind: "charge", pick: "choose" }),
  chargeCard: (cardId: string): Effect =>
    fx.do({ kind: "charge", pick: "card", cardId }),
  bonusAccess: (amount: number): Effect =>
    fx.do({ kind: "bonus_access", amount }),
  breachServerWhenRunEnds: (
    server: "hq" | "rd" | "archives",
  ): Effect => fx.do({ kind: "breach_server_when_run_ends", server }),
  searchStackProgramInstall: (): Effect =>
    fx.do({ kind: "search_stack_program_install" }),
  installStackProgram: (cardId: string): Effect =>
    fx.do({ kind: "install_stack_program", cardId }),
  sparkOfInspirationResolve: (discount = 10): Effect =>
    fx.do({ kind: "spark_of_inspiration_resolve", discount }),
  installSetAsideProgram: (cardId: string, discount: number): Effect =>
    fx.do({ kind: "install_set_aside_program", cardId, discount }),
  shuffleRunnerSetAsideIntoStack: (): Effect =>
    fx.do({ kind: "shuffle_runner_set_aside_into_stack" }),
  trashTopNMayInstallDiscount: (count: number, discount: number): Effect =>
    fx.do({ kind: "trash_top_n_may_install_discount", count, discount }),
  installHeapCard: (cardId: string, discount: number): Effect =>
    fx.do({ kind: "install_heap_card", cardId, discount }),
  trashTopOfStack: (): Effect => fx.do({ kind: "trash_top_of_stack" }),
  trashTopOfRd: (): Effect => fx.do({ kind: "trash_top_of_rd" }),
  revealTopOfRd: (): Effect => fx.do({ kind: "reveal_top_of_rd" }),
  setTraceBaseStrength: (amount: number): Effect =>
    fx.do({ kind: "set_trace_base_strength", amount }),
  forbidRunnerRunsThisTurn: (): Effect =>
    fx.do({ kind: "forbid_runner_runs_this_turn" }),
  moveSourceIceToOutermostAnotherServerContinueRun: (): Effect =>
    fx.do({ kind: "move_source_ice_to_outermost_another_server_continue_run" }),
  fullyOperationalResolve: (): Effect =>
    fx.do({ kind: "fully_operational_resolve" }),
  lookTopNStackMayBottomOne: (n: number): Effect =>
    fx.do({ kind: "look_top_n_stack_may_bottom_one", n }),
  chooseGrantEncounterIceSubtype: (): Effect =>
    fx.do({ kind: "choose_grant_encounter_ice_subtype" }),
  lootBoxRevealTopN: (n: number): Effect =>
    fx.do({ kind: "loot_box_reveal_top_n", n }),
  searchRdIceInstallCentralDiscount: (discount: number): Effect =>
    fx.do({ kind: "search_rd_ice_install_central_discount", discount }),
  rejigBounceInstall: (): Effect => fx.do({ kind: "rejig_bounce_install" }),
  mayTrashOtherInstalledSearchStackSameTypeInstall: (
    discount: number,
  ): Effect =>
    fx.do({
      kind: "may_trash_other_installed_search_stack_same_type_install",
      discount,
    }),
  trashRunnerRigCard: (cardId: string): Effect =>
    fx.do({ kind: "trash_runner_rig_card", cardId }),
  trashRunnerRigCardRecordProgramCost: (cardId: string): Effect =>
    fx.do({ kind: "trash_runner_rig_card_record_program_cost", cardId }),
  scavengeInstallProgram: (): Effect =>
    fx.do({ kind: "scavenge_install_program" }),
  haasPetProjectSetup: (remaining: number): Effect =>
    fx.do({ kind: "haas_pet_project_setup", remaining }),
  installUpToNProgramsFromGripDiscount: (
    remaining: number,
    discount: number,
  ): Effect =>
    fx.do({
      kind: "install_up_to_n_programs_from_grip_discount",
      remaining,
      discount,
    }),
  searchStackTypeInstall: (
    cardType: "program" | "hardware" | "resource",
    discount: number,
  ): Effect =>
    fx.do({ kind: "search_stack_type_install", cardType, discount }),
  installStackCard: (cardId: string, discount: number): Effect =>
    fx.do({ kind: "install_stack_card", cardId, discount }),
  exclusiveChoicesPerPassedIce: (
    options: ChoiceOption[],
  ): Effect =>
    fx.do({ kind: "exclusive_choices_per_passed_ice", options }),
  addAgendaCounter: (amount: number): Effect =>
    fx.do({ kind: "add_agenda_counter", amount }),
  addAgendaCountersFromOveradvance: (
    past: number,
    per = 1,
    countersPerExcess?: number,
  ): Effect =>
    fx.do({
      kind: "add_agenda_counters_from_overadvance",
      past,
      ...(countersPerExcess !== undefined
        ? { countersPerExcess }
        : per !== 1
          ? { per }
          : {}),
    }),
  trace: (
    strength: number,
    onSuccess: Effect,
    onFailure?: Effect,
    interactive = false,
  ): Effect =>
    fx.do({
      kind: "trace",
      strength,
      onSuccess,
      ...(onFailure !== undefined ? { onFailure } : {}),
      interactive,
    }),
};

/** Walk the AST; true if any leaf matches. */
export function effectContains(
  effect: Effect,
  pred: (p: Primitive) => boolean,
): boolean {
  switch (effect.op) {
    case "seq":
      return effect.effects.some((e) => effectContains(e, pred));
    case "do":
      return pred(effect.action);
    case "if":
      return (
        effectContains(effect.then, pred) ||
        (effect.else !== undefined && effectContains(effect.else, pred))
      );
    case "prevent":
      return false;
    case "choose":
      return effect.options.some((o) => effectContains(o.effect, pred));
    default: {
      const _e: never = effect;
      return _e;
    }
  }
}

/**
 * Fail-closed validation of an Effect tree.
 * Returns an error string if any node/primitive is unknown.
 */
export function validateEffectTree(
  effect: unknown,
  path = "effect",
): string | null {
  if (!effect || typeof effect !== "object") {
    return `${path}: not an object`;
  }
  const e = effect as Record<string, unknown>;
  if (typeof e.op !== "string" || !KNOWN_EFFECT_OPS.has(e.op)) {
    return `${path}: unknown op ${JSON.stringify(e.op)}`;
  }
  switch (e.op) {
    case "seq": {
      if (!Array.isArray(e.effects)) return `${path}.effects: not an array`;
      for (let i = 0; i < e.effects.length; i++) {
        const err = validateEffectTree(e.effects[i], `${path}.effects[${i}]`);
        if (err) return err;
      }
      return null;
    }
    case "do": {
      const action = e.action as Record<string, unknown> | undefined;
      if (!action || typeof action.kind !== "string") {
        return `${path}.action: missing kind`;
      }
      if (!KNOWN_PRIMITIVE_KINDS.has(action.kind)) {
        return `${path}.action: unknown primitive kind ${action.kind}`;
      }
      if (action.kind === "pump_strength") {
        const d = action.duration;
        if (
          d !== undefined &&
          d !== "encounter" &&
          d !== "run"
        ) {
          return `${path}.action.duration: must be "encounter" | "run"`;
        }
      }
      if (
        action.kind === "trash_program" ||
        action.kind === "trash_resource" ||
        action.kind === "trash_hardware" ||
        action.kind === "trash_hardware_install_cost_lte_last_trace_excess" ||
        action.kind === "trash_program_or_hardware" ||
        action.kind === "trash_resource_or_hardware" ||
        action.kind === "trash_installed_runner"
      ) {
        if (action.pick !== "first" && action.pick !== "choose") {
          return `${path}.action.pick: must be "first" | "choose"`;
        }
      }
      if (action.kind === "expose_up_to") {
        if (typeof action.max !== "number" || action.max < 1) {
          return `${path}.action.max: must be a positive number`;
        }
      }
      if (action.kind === "trash_up_to_n_resources") {
        if (typeof action.n !== "number" || action.n < 1) {
          return `${path}.action.n: must be a positive number`;
        }
      }
      if (action.kind === "trash_installed_resources_with_any_subtype") {
        if (!Array.isArray(action.subtypes) || action.subtypes.length < 1) {
          return `${path}.action.subtypes: must be a non-empty string array`;
        }
        for (const s of action.subtypes) {
          if (typeof s !== "string") {
            return `${path}.action.subtypes: each entry must be a string`;
          }
        }
      }
      if (action.kind === "trash_installed_resource_with_subtype") {
        if (typeof action.subtype !== "string" || !action.subtype) {
          return `${path}.action.subtype: required non-empty string`;
        }
        if (action.pick !== "first" && action.pick !== "choose") {
          return `${path}.action.pick: must be "first" | "choose"`;
        }
      }
      if (action.kind === "trash_ice_rezzed_this_run") {
        if (action.pick !== "first" && action.pick !== "choose") {
          return `${path}.action.pick: must be "first" | "choose"`;
        }
      }
      if (action.kind === "end_the_run_unless_corp_pays") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "end_the_run_unless_net_damage") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "end_the_run_unless_runner_spends_clicks") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "trash_hq") {
        if (
          action.pick !== "first" &&
          action.pick !== "choose" &&
          action.pick !== "random"
        ) {
          return `${path}.action.pick: must be "first" | "choose" | "random"`;
        }
        if (
          action.amount !== undefined &&
          (typeof action.amount !== "number" || action.amount < 1)
        ) {
          return `${path}.action.amount: must be a positive number when present`;
        }
      }
      if (action.kind === "trash_encounter_ice_if_strength_lte") {
        if (typeof action.maxStrength !== "number") {
          return `${path}.action.maxStrength: must be a number`;
        }
      }
      if (action.kind === "place_advancements_on_self_per_faceup_archive_types") {
        if (
          action.base !== undefined &&
          (typeof action.base !== "number" || action.base < 0)
        ) {
          return `${path}.action.base: must be a non-negative number when present`;
        }
      }
      if (action.kind === "trace") {
        const sErr = validateEffectTree(action.onSuccess, `${path}.onSuccess`);
        if (sErr) return sErr;
        if (action.onFailure !== undefined) {
          const fErr = validateEffectTree(
            action.onFailure,
            `${path}.onFailure`,
          );
          if (fErr) return fErr;
        }
      }
      if (action.kind === "daruma_swap_this_root_with_other_root_or_hq") {
        if (action.onSuccess !== undefined) {
          const sErr = validateEffectTree(
            action.onSuccess,
            `${path}.onSuccess`,
          );
          if (sErr) return sErr;
        }
      }
      if (action.kind === "daruma_swap_pick") {
        if (typeof action.thisRootCardId !== "string") {
          return `${path}.action.thisRootCardId: must be a string`;
        }
        if (typeof action.otherCardId !== "string") {
          return `${path}.action.otherCardId: must be a string`;
        }
        if (action.onSuccess !== undefined) {
          const sErr = validateEffectTree(
            action.onSuccess,
            `${path}.onSuccess`,
          );
          if (sErr) return sErr;
        }
      }
      if (action.kind === "hangeki_choose_installed_runner_may_access") {
        const aErr = validateEffectTree(action.onAccess, `${path}.onAccess`);
        if (aErr) return aErr;
        const dErr = validateEffectTree(action.onDecline, `${path}.onDecline`);
        if (dErr) return dErr;
      }
      if (action.kind === "hangeki_runner_may_access") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: must be a string`;
        }
        const aErr = validateEffectTree(action.onAccess, `${path}.onAccess`);
        if (aErr) return aErr;
        const dErr = validateEffectTree(action.onDecline, `${path}.onDecline`);
        if (dErr) return dErr;
      }
      if (action.kind === "hangeki_access_installed") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: must be a string`;
        }
        const aErr = validateEffectTree(action.onAccess, `${path}.onAccess`);
        if (aErr) return aErr;
      }
      if (action.kind === "peeping_tom_apply_type") {
        if (typeof action.cardType !== "string") {
          return `${path}.action.cardType: must be a string`;
        }
      }
      if (action.kind === "sabotage") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "allotted_clicks_next_turn") {
        if (action.side !== "corp" && action.side !== "runner") {
          return `${path}.action.side: must be "corp" | "runner"`;
        }
        if (typeof action.delta !== "number" || !Number.isInteger(action.delta)) {
          return `${path}.action.delta: must be an integer`;
        }
      }
      if (action.kind === "charge") {
        if (
          action.pick !== "self" &&
          action.pick !== "choose" &&
          action.pick !== "card"
        ) {
          return `${path}.action.pick: must be "self" | "choose" | "card"`;
        }
        if (action.pick === "card" && typeof action.cardId !== "string") {
          return `${path}.action.cardId: required when pick is "card"`;
        }
      }
      if (action.kind === "install_from_grip_discount") {
        if (action.thenOnInstall !== undefined) {
          const tErr = validateEffectTree(
            action.thenOnInstall,
            `${path}.action.thenOnInstall`,
          );
          if (tErr) return tErr;
        }
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
        if (!Array.isArray(action.types) || action.types.length === 0) {
          return `${path}.action.types: need non-empty array`;
        }
        const allowed = new Set(["program", "hardware", "resource"]);
        for (const t of action.types) {
          if (typeof t !== "string" || !allowed.has(t)) {
            return `${path}.action.types: each must be program|hardware|resource`;
          }
        }
        if (
          action.mayCharge !== undefined &&
          typeof action.mayCharge !== "boolean"
        ) {
          return `${path}.action.mayCharge: must be boolean when present`;
        }
      }
      if (action.kind === "install_grip_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (action.kind === "may_charge_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "rehost_to_ice") {
        if (typeof action.iceId !== "string") {
          return `${path}.action.iceId: required string`;
        }
      }
      if (action.kind === "flip_archives_ice_resolve_subroutine") {
        if (typeof action.iceId !== "string") {
          return `${path}.action.iceId: required string`;
        }
        if (typeof action.subIndex !== "number" || action.subIndex < 0) {
          return `${path}.action.subIndex: must be a non-negative number`;
        }
      }
      if (action.kind === "trash_encounter_ice_resolve_subroutine") {
        if (typeof action.subIndex !== "number" || action.subIndex < 0) {
          return `${path}.action.subIndex: must be a non-negative number`;
        }
      }
      if (action.kind === "set_named_server") {
        if (typeof action.serverId !== "string") {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "set_chosen_server") {
        if (typeof action.serverId !== "string") {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "play_psi_game") {
        if (typeof action.maxBid !== "number" || action.maxBid < 0) {
          return `${path}.action.maxBid: must be a non-negative number`;
        }
        if (action.ifBidsDiffer !== undefined) {
          const dErr = validateEffectTree(
            action.ifBidsDiffer,
            `${path}.action.ifBidsDiffer`,
          );
          if (dErr) return dErr;
        }
        if (action.ifBidsMatch !== undefined) {
          const mErr = validateEffectTree(
            action.ifBidsMatch,
            `${path}.action.ifBidsMatch`,
          );
          if (mErr) return mErr;
        }
      }
      if (action.kind === "search_stack_host_virus_or_weapon") {
        if (typeof action.max !== "number" || action.max < 1) {
          return `${path}.action.max: must be a positive number`;
        }
      }
      if (
        action.kind === "host_stack_card_on_source" ||
        action.kind === "add_hosted_card_to_grip"
      ) {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "host_copy_from_grip") {
        if (typeof action.title !== "string") {
          return `${path}.action.title: required string`;
        }
      }
      if (action.kind === "matryoshka_break_resolve") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
        if (typeof action.hostedId !== "string") {
          return `${path}.action.hostedId: required string`;
        }
      }
      if (
        action.kind === "install_hosted_program" ||
        action.kind === "install_hosted_card" ||
        action.kind === "host_grip_program_or_hardware_faceup" ||
        action.kind === "add_from_heap_to_stack_top" ||
        action.kind === "add_card_id_to_stack_bottom" ||
        action.kind === "au_co_trash_looked_rd_card" ||
        action.kind === "cultivate_trash_looked" ||
        action.kind === "cultivate_hq_looked"
      ) {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "set_nested_encounter_then_resume_source") {
        if (typeof action.iceId !== "string") {
          return `${path}.action.iceId: required string`;
        }
      }
      if (action.kind === "search_rd_up_to_one_each_subtype_to_hq") {
        if (!Array.isArray(action.subtypes) || action.subtypes.length < 1) {
          return `${path}.action.subtypes: must be a non-empty string array`;
        }
      }
      if (action.kind === "may_search_rd_non_agenda_any_subtype_to_hq") {
        if (!Array.isArray(action.subtypes) || action.subtypes.length < 1) {
          return `${path}.action.subtypes: must be a non-empty string array`;
        }
      }
      if (action.kind === "may_host_bad_publicity_then") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
        if (!action.then) return `${path}.action.then: required`;
        const tErr = validateEffectTree(action.then, `${path}.action.then`);
        if (tErr) return tErr;
      }
      if (action.kind === "may_trash_hardware_from_grip_place_hosted_credits") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "trash_grip_hardware_place_hosted_credits") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "look_top_n_rd_trash_one_hq_one_arrange_rest") {
        if (typeof action.n !== "number" || action.n < 1) {
          return `${path}.action.n: must be a positive number`;
        }
      }
      if (action.kind === "reveal_top_n_rd_trash_one") {
        if (typeof action.n !== "number" || action.n < 1) {
          return `${path}.action.n: must be a positive number`;
        }
      }
      if (action.kind === "reveal_top_n_rd_trash_picked") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "rez_spend_credits_for_power_counters") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "climactic_corp_may_trash_ice") {
        if (typeof action.serverId !== "string") {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "climactic_trash_ice") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "climactic_register_bonus_access") {
        if (
          action.amount !== undefined &&
          (typeof action.amount !== "number" || action.amount < 0)
        ) {
          return `${path}.action.amount: must be a non-negative number when present`;
        }
      }
      if (action.kind === "whistleblower_name_agenda") {
        if (typeof action.title !== "string") {
          return `${path}.action.title: required string`;
        }
      }
      if (action.kind === "class_act_bottom_one_then_draw") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "complete_image_net_named") {
        if (typeof action.title !== "string") {
          return `${path}.action.title: required string`;
        }
      }
      if (action.kind === "khusyuk_set_aside_access_shuffle") {
        if (typeof action.installCost !== "number" || action.installCost < 1) {
          return `${path}.action.installCost: must be a positive number`;
        }
      }
      if (action.kind === "khusyuk_access_set_aside") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "host_hardware_on_icebreaker") {
        if (typeof action.icebreakerId !== "string") {
          return `${path}.action.icebreakerId: required string`;
        }
      }
      if (action.kind === "trash_rezzed_ice_gain_credits") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "trash_rezzed_ice_gain_credits_resolve") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "install_up_to_from_hq_paying_costs") {
        if (typeof action.max !== "number" || action.max < 0) {
          return `${path}.action.max: must be a non-negative number`;
        }
      }
      if (action.kind === "install_up_to_from_hq_paying_costs_continue") {
        if (typeof action.remaining !== "number" || action.remaining < 0) {
          return `${path}.action.remaining: must be a non-negative number`;
        }
      }
      if (action.kind === "deja_vu_add_heap_cards") {
        if (!Array.isArray(action.cardIds)) {
          return `${path}.action.cardIds: required string[]`;
        }
      }
      if (action.kind === "search_stack_subtype_add_to_grip") {
        if (typeof action.subtype !== "string") {
          return `${path}.action.subtype: required string`;
        }
      }
      if (action.kind === "search_stack_subtype_add_to_grip_pick") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "trash_hq_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "may_trash_hq_then") {
        const tErr = validateEffectTree(action.then, `${path}.action.then`);
        if (tErr) return tErr;
      }
      if (action.kind === "forbid_runner_card_break_for_run") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "may_give_runner_credits_then") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
        const tErr = validateEffectTree(action.then, `${path}.action.then`);
        if (tErr) return tErr;
      }
      if (action.kind === "blank_resource_until_corp_turn_end") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "limit_printed_breaks_on_source_for_run") {
        if (typeof action.max !== "number" || action.max < 1) {
          return `${path}.action.max: must be a positive number`;
        }
      }
      if (action.kind === "install_stack_program") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "spark_of_inspiration_resolve") {
        if (
          action.discount !== undefined &&
          (typeof action.discount !== "number" || action.discount < 0)
        ) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (action.kind === "break_encounter_subroutine") {
        if (action.thenIfBroke !== undefined) {
          const tErr = validateEffectTree(
            action.thenIfBroke,
            `${path}.action.thenIfBroke`,
          );
          if (tErr) return tErr;
        }
      }
      if (action.kind === "may_return_non_virus_trojan_to_grip_place_hosted") {
        if (
          typeof action.hostedAmount !== "number" ||
          action.hostedAmount < 0
        ) {
          return `${path}.action.hostedAmount: must be a non-negative number`;
        }
      }
      if (action.kind === "draw_per_power_counter") {
        if (
          action.side !== "corp" &&
          action.side !== "runner" &&
          action.side !== "payer" &&
          action.side !== "controller"
        ) {
          return `${path}.action.side: must be corp|runner|payer|controller`;
        }
        if (
          action.per !== undefined &&
          (typeof action.per !== "number" || action.per < 0)
        ) {
          return `${path}.action.per: must be a non-negative number`;
        }
      }
      if (action.kind === "take_hosted_bad_publicity") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "install_set_aside_program") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (
        action.kind === "may_trash_other_installed_search_stack_same_type_install"
      ) {
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (
        action.kind === "trash_runner_rig_card" ||
        action.kind === "trash_runner_rig_card_record_program_cost"
      ) {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "search_stack_type_install") {
        const allowed = new Set(["program", "hardware", "resource"]);
        if (
          typeof action.cardType !== "string" ||
          !allowed.has(action.cardType)
        ) {
          return `${path}.action.cardType: must be program|hardware|resource`;
        }
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (action.kind === "install_stack_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.discount !== "number" || action.discount < 0) {
          return `${path}.action.discount: must be a non-negative number`;
        }
      }
      if (
        action.kind === "exclusive_choices_per_passed_ice" ||
        action.kind === "choose_exactly_n"
      ) {
        if (!Array.isArray(action.options) || action.options.length === 0) {
          return `${path}.action.options: need non-empty array`;
        }
        if (action.kind === "choose_exactly_n") {
          if (typeof action.n !== "number" || action.n < 1) {
            return `${path}.action.n: must be a positive number`;
          }
        }
        for (let i = 0; i < action.options.length; i++) {
          const opt = action.options[i] as Record<string, unknown>;
          if (typeof opt?.id !== "string" || typeof opt?.label !== "string") {
            return `${path}.action.options[${i}]: need id+label`;
          }
          const oErr = validateEffectTree(
            opt.effect,
            `${path}.action.options[${i}].effect`,
          );
          if (oErr) return oErr;
        }
      }
      if (action.kind === "gain_strength_this_turn") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "choose_icebreaker_gain_strength_this_turn") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "choose_ice_additional_rez_cost_this_turn") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "add_ice_additional_rez_cost_this_turn") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "install_hq_card_paying_costs") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "place_advancements_on") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "enable_hosted_credits_spend_for") {
        if (!Array.isArray(action.purposes) || action.purposes.length === 0) {
          return `${path}.action.purposes: need non-empty array`;
        }
      }
      if (action.kind === "move_upgrade_to_server_root") {
        if (typeof action.serverId !== "string") {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "may_install_from_grip") {
        if (
          action.discount !== undefined &&
          typeof action.discount !== "number"
        ) {
          return `${path}.action.discount: must be a number (negative = surcharge)`;
        }
      }
      if (action.kind === "derez_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "lose_credits") {
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "lose_all_credits") {
        if (
          action.side !== "corp" &&
          action.side !== "runner" &&
          action.side !== "payer" &&
          action.side !== "controller"
        ) {
          return `${path}.action.side: must be corp|runner|payer|controller`;
        }
      }
      if (action.kind === "meat_damage") {
        if (
          action.cannotPrevent !== undefined &&
          typeof action.cannotPrevent !== "boolean"
        ) {
          return `${path}.action.cannotPrevent: must be boolean`;
        }
      }
      if (action.kind === "return_installed_corp_to_hq") {
        if (action.pick !== "first" && action.pick !== "choose") {
          return `${path}.action.pick: must be "first" | "choose"`;
        }
        if (
          action.unrezzedOnly !== undefined &&
          typeof action.unrezzedOnly !== "boolean"
        ) {
          return `${path}.action.unrezzedOnly: must be boolean`;
        }
      }
      if (action.kind === "place_advancements") {
        if (
          action.thenMayScore !== undefined &&
          typeof action.thenMayScore !== "boolean"
        ) {
          return `${path}.action.thenMayScore: must be boolean when present`;
        }
        if (
          action.anyInstalledIce !== undefined &&
          typeof action.anyInstalledIce !== "boolean"
        ) {
          return `${path}.action.anyInstalledIce: must be boolean when present`;
        }
        if (
          action.onlyRemoteRoot !== undefined &&
          typeof action.onlyRemoteRoot !== "boolean"
        ) {
          return `${path}.action.onlyRemoteRoot: must be boolean when present`;
        }
        if (
          action.pick !== undefined &&
          action.pick !== "first" &&
          action.pick !== "choose"
        ) {
          return `${path}.action.pick: must be first|choose`;
        }
        if (
          action.cannotScoreTargetThisTurn !== undefined &&
          typeof action.cannotScoreTargetThisTurn !== "boolean"
        ) {
          return `${path}.action.cannotScoreTargetThisTurn: must be boolean`;
        }
        if (
          action.unrezzedOnly !== undefined &&
          typeof action.unrezzedOnly !== "boolean"
        ) {
          return `${path}.action.unrezzedOnly: must be boolean`;
        }
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "add_agenda_counters_from_overadvance") {
        if (
          action.countersPerExcess !== undefined &&
          (typeof action.countersPerExcess !== "number" ||
            action.countersPerExcess < 0)
        ) {
          return `${path}.action.countersPerExcess: must be non-negative number`;
        }
      }
      if (action.kind === "remove_agenda_counters") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be non-negative number`;
        }
      }
      if (action.kind === "remove_virus_counters") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "trash_installed") {
        if (
          action.rezzedOnly !== undefined &&
          typeof action.rezzedOnly !== "boolean"
        ) {
          return `${path}.action.rezzedOnly: must be boolean`;
        }
        if (
          action.attackedServerOnly !== undefined &&
          typeof action.attackedServerOnly !== "boolean"
        ) {
          return `${path}.action.attackedServerOnly: must be boolean`;
        }
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (
        action.kind === "install_archives_card_ignore_costs" ||
        action.kind === "install_archives_card_paying" ||
        action.kind === "install_hq_card_ignore_costs" ||
        action.kind === "search_rd_reveal_pick_install_or_hq"
      ) {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (
        action.kind === "install_archives_card_ignore_costs" ||
        action.kind === "install_archives_card_paying" ||
        action.kind === "install_hq_card_ignore_costs"
      ) {
        if (typeof action.serverId !== "string") {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "install_from_archives") {
        if (!Array.isArray(action.types) || action.types.length === 0) {
          return `${path}.action.types: required non-empty array`;
        }
        for (const t of action.types) {
          if (
            t !== "agenda" &&
            t !== "asset" &&
            t !== "ice" &&
            t !== "upgrade"
          ) {
            return `${path}.action.types: invalid type ${t}`;
          }
        }
      }
      if (action.kind === "rfg_specific_heap_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "install_from_hq_or_archives") {
        if (
          action.excludeAgenda !== undefined &&
          typeof action.excludeAgenda !== "boolean"
        ) {
          return `${path}.action.excludeAgenda: must be boolean when present`;
        }
        if (
          action.excludeSourceServer !== undefined &&
          typeof action.excludeSourceServer !== "boolean"
        ) {
          return `${path}.action.excludeSourceServer: must be boolean when present`;
        }
      }
      if (action.kind === "install_hq_new_remotes_with_advancements") {
        if (typeof action.max !== "number" || action.max < 0) {
          return `${path}.action.max: must be a non-negative number`;
        }
        if (typeof action.advancements !== "number" || action.advancements < 0) {
          return `${path}.action.advancements: must be a non-negative number`;
        }
      }
      if (action.kind === "moon_pool_resolve") {
        if (typeof action.trashHqMax !== "number" || action.trashHqMax < 0) {
          return `${path}.action.trashHqMax: must be a non-negative number`;
        }
        if (
          typeof action.revealArchivesMax !== "number" ||
          action.revealArchivesMax < 0
        ) {
          return `${path}.action.revealArchivesMax: must be a non-negative number`;
        }
      }
      if (action.kind === "simulation_reset_resolve") {
        if (typeof action.trashHqMax !== "number" || action.trashHqMax < 0) {
          return `${path}.action.trashHqMax: must be a non-negative number`;
        }
      }
      if (action.kind === "search_rd_install_rez_by_printed_rez_cost") {
        if (typeof action.delta !== "number") {
          return `${path}.action.delta: must be a number`;
        }
      }
      if (action.kind === "deep_dive_resolve") {
        if (
          action.setAside !== undefined &&
          (typeof action.setAside !== "number" || action.setAside < 0)
        ) {
          return `${path}.action.setAside: must be a non-negative number`;
        }
        if (
          action.initialAccess !== undefined &&
          (typeof action.initialAccess !== "number" || action.initialAccess < 1)
        ) {
          return `${path}.action.initialAccess: must be a positive number`;
        }
      }
      if (action.kind === "score_self_as_agenda") {
        if (
          action.agendaPoints !== undefined &&
          typeof action.agendaPoints !== "number"
        ) {
          return `${path}.action.agendaPoints: must be number when present`;
        }
      }
      if (action.kind === "add_to_runner_score_as_agenda") {
        if (
          action.agendaPoints !== undefined &&
          typeof action.agendaPoints !== "number"
        ) {
          return `${path}.action.agendaPoints: must be number when present`;
        }
        if (action.addSubtypes !== undefined) {
          if (
            !Array.isArray(action.addSubtypes) ||
            action.addSubtypes.some((s) => typeof s !== "string")
          ) {
            return `${path}.action.addSubtypes: must be string[] when present`;
          }
        }
      }
      if (action.kind === "melies_set_face") {
        if (
          action.face !== "hq" &&
          action.face !== "rd" &&
          action.face !== "archives"
        ) {
          return `${path}.action.face: must be hq|rd|archives`;
        }
      }
      if (action.kind === "add_to_corp_score_as_agenda") {
        if (typeof action.agendaPoints !== "number") {
          return `${path}.action.agendaPoints: must be a number`;
        }
        if (
          action.cannotForfeit !== undefined &&
          typeof action.cannotForfeit !== "boolean"
        ) {
          return `${path}.action.cannotForfeit: must be boolean when present`;
        }
      }
      if (action.kind === "host_grip_card_facedown_then_draw") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "fenris_host_gmod_identity") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "burner_resolve") {
        if (typeof action.reveal !== "number" || action.reveal < 0) {
          return `${path}.action.reveal: must be a non-negative number`;
        }
        if (typeof action.move !== "number" || action.move < 0) {
          return `${path}.action.move: must be a non-negative number`;
        }
      }
      if (action.kind === "breach_server_standalone") {
        if (typeof action.server !== "string" || !action.server) {
          return `${path}.action.server: required string`;
        }
        if (
          action.cannotAccessRoot !== undefined &&
          typeof action.cannotAccessRoot !== "boolean"
        ) {
          return `${path}.action.cannotAccessRoot: must be boolean when present`;
        }
      }
      if (action.kind === "queue_breaches_after_current") {
        if (
          !Array.isArray(action.servers) ||
          action.servers.length === 0 ||
          action.servers.some((s) => typeof s !== "string" || !s)
        ) {
          return `${path}.action.servers: must be a non-empty string array`;
        }
        if (
          action.cannotAccessRoot !== undefined &&
          typeof action.cannotAccessRoot !== "boolean"
        ) {
          return `${path}.action.cannotAccessRoot: must be boolean when present`;
        }
      }
      if (action.kind === "break_host_subroutine") {
        if (
          action.maxSubs !== undefined &&
          (typeof action.maxSubs !== "number" || action.maxSubs < 1)
        ) {
          return `${path}.action.maxSubs: must be a positive number when present`;
        }
        if (
          action.requireSubtype !== undefined &&
          typeof action.requireSubtype !== "string"
        ) {
          return `${path}.action.requireSubtype: must be string when present`;
        }
      }
      if (action.kind === "wizard_chest_resolve") {
        if (typeof action.untilCount !== "number" || action.untilCount < 1) {
          return `${path}.action.untilCount: must be a positive number`;
        }
        if (typeof action.ignoreAllCosts !== "boolean") {
          return `${path}.action.ignoreAllCosts: must be boolean`;
        }
      }
      if (action.kind === "check_assassination_win") {
        if (typeof action.amount !== "number" || action.amount < 1) {
          return `${path}.action.amount: must be a positive number`;
        }
      }
      if (action.kind === "may_pay_credits_for_core_damage") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
        if (typeof action.damage !== "number" || action.damage < 0) {
          return `${path}.action.damage: must be a non-negative number`;
        }
      }
      if (action.kind === "may_pay_credits_for_core_damage_per_advancement") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (
        action.kind ===
        "may_pay_credits_for_core_damage_per_ice_protecting_this_server"
      ) {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "rearrange_server_ice") {
        if (typeof action.serverId !== "string" || !action.serverId) {
          return `${path}.action.serverId: required non-empty string`;
        }
        if (!Array.isArray(action.order)) {
          return `${path}.action.order: must be a string array`;
        }
      }
      if (action.kind === "gain_credits_from_ice_advancements") {
        if (typeof action.iceId !== "string" || !action.iceId) {
          return `${path}.action.iceId: required non-empty string`;
        }
      }
      if (action.kind === "gain_one_subtype_until_derez") {
        if (typeof action.subtype !== "string" || !action.subtype) {
          return `${path}.action.subtype: required non-empty string`;
        }
      }
      if (action.kind === "host_grip_pw_card_with_power_equal_install_cost") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: required non-empty string`;
        }
      }
      if (action.kind === "remove_power_from_hosted_card_id_install_at_zero") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: required non-empty string`;
        }
      }
      if (action.kind === "install_hosted_card_ignore_costs") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: required non-empty string`;
        }
      }
      if (action.kind === "may_pay_credits_for_net_damage_per_advancement") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
        if (typeof action.per !== "number" || action.per < 1) {
          return `${path}.action.per: must be a positive number`;
        }
      }
      if (action.kind === "may_pay_credits_for_trash_programs_per_advancement") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (
        action.kind ===
        "may_pay_credits_for_shuffle_installed_runner_per_advancement"
      ) {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "trash_n_programs_remaining") {
        if (typeof action.remaining !== "number" || action.remaining < 0) {
          return `${path}.action.remaining: must be a non-negative number`;
        }
      }
      if (action.kind === "shuffle_n_installed_runner_remaining") {
        if (typeof action.remaining !== "number" || action.remaining < 0) {
          return `${path}.action.remaining: must be a non-negative number`;
        }
      }
      if (action.kind === "fast_break_choose_remote") {
        if (typeof action.remaining !== "number" || action.remaining < 0) {
          return `${path}.action.remaining: must be a non-negative number`;
        }
      }
      if (action.kind === "fast_break_install_continue") {
        if (typeof action.remaining !== "number" || action.remaining < 0) {
          return `${path}.action.remaining: must be a non-negative number`;
        }
        if (typeof action.serverId !== "string" || !action.serverId) {
          return `${path}.action.serverId: required string`;
        }
      }
      if (action.kind === "search_stack_subtype_may_install") {
        if (typeof action.subtype !== "string" || !action.subtype.trim()) {
          return `${path}.action.subtype: must be a non-empty string`;
        }
      }
      if (action.kind === "grant_chosen_ice_subtypes_until_end_of_turn") {
        if (
          !Array.isArray(action.subtypes) ||
          action.subtypes.length === 0 ||
          action.subtypes.some((s) => typeof s !== "string" || !s.trim())
        ) {
          return `${path}.action.subtypes: must be a non-empty string array`;
        }
      }
      if (action.kind === "grant_ice_subtypes_until_end_of_turn") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: must be a non-empty string`;
        }
        if (
          !Array.isArray(action.subtypes) ||
          action.subtypes.length === 0 ||
          action.subtypes.some((s) => typeof s !== "string" || !s.trim())
        ) {
          return `${path}.action.subtypes: must be a non-empty string array`;
        }
      }
      if (action.kind === "queens_gambit_place_up_to") {
        if (typeof action.max !== "number" || action.max < 1) {
          return `${path}.action.max: must be a positive number`;
        }
        if (typeof action.creditsPer !== "number" || action.creditsPer < 0) {
          return `${path}.action.creditsPer: must be a non-negative number`;
        }
      }
      if (action.kind === "queens_gambit_place_on") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: must be a non-empty string`;
        }
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
        if (typeof action.creditsPer !== "number" || action.creditsPer < 0) {
          return `${path}.action.creditsPer: must be a non-negative number`;
        }
      }
      if (action.kind === "return_rezzed_to_hq_gain_rez_cost") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: must be a non-empty string`;
        }
      }
      if (action.kind === "take_hosted_credits_skip_breach") {
        if (typeof action.amount !== "number" || action.amount < 0) {
          return `${path}.action.amount: must be a non-negative number`;
        }
      }
      if (action.kind === "add_archives_card_to_rd_top") {
        if (typeof action.cardId !== "string" || !action.cardId) {
          return `${path}.action.cardId: must be a non-empty string`;
        }
      }
      if (action.kind === "oversight_ai_host_on_ice") {
        if (typeof action.iceId !== "string" || !action.iceId) {
          return `${path}.action.iceId: must be a non-empty string`;
        }
      }
      if (action.kind === "ber_host_on_ice") {
        if (typeof action.iceId !== "string" || !action.iceId) {
          return `${path}.action.iceId: must be a non-empty string`;
        }
      }
      if (action.kind === "gain_credits_base_plus_per_passed_ice") {
        if (
          action.side !== "corp" &&
          action.side !== "runner" &&
          action.side !== "payer" &&
          action.side !== "controller"
        ) {
          return `${path}.action.side: must be a SideRef`;
        }
        if (typeof action.base !== "number" || action.base < 0) {
          return `${path}.action.base: must be a non-negative number`;
        }
        if (typeof action.per !== "number" || action.per < 0) {
          return `${path}.action.per: must be a non-negative number`;
        }
      }
      if (action.kind === "rfg_installed_with_any_subtype") {
        if (!Array.isArray(action.subtypes) || action.subtypes.length === 0) {
          return `${path}.action.subtypes: required non-empty string array`;
        }
        for (const s of action.subtypes) {
          if (typeof s !== "string") {
            return `${path}.action.subtypes: each entry must be a string`;
          }
        }
        if (action.pick !== "choose" && action.pick !== "first") {
          return `${path}.action.pick: must be choose|first`;
        }
      }
      if (action.kind === "rfg_installed_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "shuffle_up_to_n_distinct_heap_titles_into_stack") {
        if (typeof action.max !== "number" || action.max < 0) {
          return `${path}.action.max: must be a non-negative number`;
        }
      }
      if (
        action.kind === "shuffle_up_to_n_distinct_heap_titles_into_stack_continue"
      ) {
        if (typeof action.maxRemaining !== "number" || action.maxRemaining < 0) {
          return `${path}.action.maxRemaining: must be a non-negative number`;
        }
        if (!Array.isArray(action.selected)) {
          return `${path}.action.selected: required string array`;
        }
        if (!Array.isArray(action.usedTitles)) {
          return `${path}.action.usedTitles: required string array`;
        }
      }
      if (action.kind === "core_damage") {
        if (
          action.interactive !== undefined &&
          typeof action.interactive !== "boolean"
        ) {
          return `${path}.action.interactive: must be boolean when present`;
        }
        if (
          action.preventByLoseAllClicks !== undefined &&
          typeof action.preventByLoseAllClicks !== "boolean"
        ) {
          return `${path}.action.preventByLoseAllClicks: must be boolean when present`;
        }
        if (
          action.cannotPrevent !== undefined &&
          typeof action.cannotPrevent !== "boolean"
        ) {
          return `${path}.action.cannotPrevent: must be boolean when present`;
        }
      }
      if (action.kind === "score_agenda_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "remove_advancements") {
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "trash_hq") {
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "may_derez_installed") {
        if (
          action.excludeSelf !== undefined &&
          typeof action.excludeSelf !== "boolean"
        ) {
          return `${path}.action.excludeSelf: must be boolean when present`;
        }
        if (
          action.onlyIce !== undefined &&
          typeof action.onlyIce !== "boolean"
        ) {
          return `${path}.action.onlyIce: must be boolean when present`;
        }
        if (
          action.excludeProtectingAttackedServer !== undefined &&
          typeof action.excludeProtectingAttackedServer !== "boolean"
        ) {
          return `${path}.action.excludeProtectingAttackedServer: must be boolean when present`;
        }
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "trash_corp_card") {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
        }
      }
      if (action.kind === "may_trash_installed") {
        if (
          action.excludeSelf !== undefined &&
          typeof action.excludeSelf !== "boolean"
        ) {
          return `${path}.action.excludeSelf: must be boolean when present`;
        }
        if (
          action.rezzedOnly !== undefined &&
          typeof action.rezzedOnly !== "boolean"
        ) {
          return `${path}.action.rezzedOnly: must be boolean when present`;
        }
        if (action.then !== undefined) {
          const tErr = validateEffectTree(action.then, `${path}.action.then`);
          if (tErr) return tErr;
        }
      }
      if (action.kind === "must_trash_installed") {
        if (
          action.excludeSelf !== undefined &&
          typeof action.excludeSelf !== "boolean"
        ) {
          return `${path}.action.excludeSelf: must be boolean when present`;
        }
      }
      return null;
    }
    case "if": {
      const cond = e.cond as Record<string, unknown> | undefined;
      if (!cond || typeof cond.op !== "string" || !KNOWN_COND_OPS.has(cond.op)) {
        return `${path}.cond: unknown op ${JSON.stringify(cond?.op)}`;
      }
      const tErr = validateEffectTree(e.then, `${path}.then`);
      if (tErr) return tErr;
      if (e.else !== undefined) {
        const elseErr = validateEffectTree(e.else, `${path}.else`);
        if (elseErr) return elseErr;
      }
      return null;
    }
    case "prevent":
      if (e.forbid !== "jack_out") {
        return `${path}: unknown forbid ${JSON.stringify(e.forbid)}`;
      }
      return null;
    case "choose": {
      if (e.chooser !== "corp" && e.chooser !== "runner") {
        return `${path}.chooser: must be corp|runner`;
      }
      if (!Array.isArray(e.options) || e.options.length === 0) {
        return `${path}.options: need non-empty array`;
      }
      for (let i = 0; i < e.options.length; i++) {
        const opt = e.options[i] as Record<string, unknown>;
        if (typeof opt?.id !== "string" || typeof opt?.label !== "string") {
          return `${path}.options[${i}]: need id+label`;
        }
        const oErr = validateEffectTree(opt.effect, `${path}.options[${i}].effect`);
        if (oErr) return oErr;
      }
      return null;
    }
    default:
      return `${path}: unhandled op`;
  }
}
