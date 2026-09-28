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
  | { kind: "meat_damage"; amount: number }
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
    }
  /** Older synonym for core_damage (CR §10.4.2c). */
  | { kind: "brain_damage"; amount: number }
  | { kind: "give_tags"; amount: number }
  /**
   * Give the Runner `base` + (`per` × source advancement tokens) tags
   * (Chekist Scion: base 1 + 1 per hosted advancement).
   */
  | { kind: "give_tags_per_advancement"; base?: number; per?: number }
  | {
      kind: "trash_program";
      pick: "first" | "choose";
      aiOnly?: boolean;
      /** Hammer: skip programs with any of these subtypes. */
      excludeSubtypes?: string[];
      /** Bumi 1.0: only programs with any of these subtypes. */
      includeSubtypes?: string[];
    }
  | { kind: "trash_resource"; pick: "first" | "choose" }
  /** Sell Out: Runner trashes one of their own installed resources. */
  | { kind: "trash_own_resource" }
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
  | {
      kind: "trash_program_or_hardware";
      pick: "first" | "choose";
    }
  | { kind: "trash_resource_or_hardware"; pick: "first" | "choose" }
  | { kind: "shuffle_hq_to_rd"; amount: number }
  | { kind: "shuffle_archives_to_rd"; amount: number }
  | { kind: "net_damage_agenda_points_this_turn" }
  | { kind: "forbid_scoring_agendas_this_turn" }
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
  /** Look at top N of R&D; may install one paying costs (Epiphany). */
  | { kind: "look_top_n_rd_may_install_one"; n: number; excludeAgenda?: boolean }
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
    }
  | { kind: "install_ice_inward_free" }
  | { kind: "break_host_subroutine" }
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
  | { kind: "offer_jack_out" }
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
  | { kind: "gain_strength_this_turn"; amount: number }
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
  | { kind: "may_install_ice_from_hq_other_server_ignore_costs" }
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
  | { kind: "may_reveal_shuffle_agendas_into_rd"; max: number }
  | {
      kind: "reveal_shuffle_agenda_into_rd";
      cardId: string;
      remainingAfter: number;
      exclude: string[];
    }
  | { kind: "look_top_rd_may_trash" }
  /** ezaM: look at top of R&D; may move it to the bottom. */
  | { kind: "look_top_rd_may_bottom" }
  /** Leaf: move top of R&D to bottom. */
  | { kind: "rd_top_to_bottom" }
  /** ezaM: swap this ice with another installed ice. */
  | { kind: "swap_source_ice_with_other" }
  /** Sipa: Runner may swap source ice with another installed ice (or decline). */
  | { kind: "may_swap_ice_with_other_installed" }
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
  | { kind: "move_runner_card_to_stack_top"; cardId: string }
  | { kind: "host_installed_trojan_on_attacked_ice" }
  | { kind: "host_program_on_ice"; programId: string; iceId: string }
  /** Adrian Seis: interactive psi bid then branch effects. */
  | {
      kind: "play_psi_game";
      maxBid: number;
      ifBidsDiffer: Effect;
      ifBidsMatch: Effect;
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
  /** AirbladeX: prevent up to `amount` pending net damage. */
  | { kind: "prevent_pending_damage"; amount: number }
  /** AirbladeX: prevent onEncounter on current encountered ice. */
  | { kind: "prevent_current_ice_on_encounter" }
  | { kind: "remove_tags"; amount: number }
  /** Witch Hunt: remove every tag the Runner currently has. */
  | { kind: "remove_all_tags" }
  | { kind: "lose_credits_per_advancement"; per: number }
  /** Gain `per` × hosted advancement counters on the source card. */
  | { kind: "gain_credits_per_advancement"; per: number }
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
  | { kind: "plutus_may_play_transaction_from_archives" }
  | { kind: "play_archives_transaction_then_rfg"; cardId: string }
  | { kind: "ip_enforcement_remove_tags" }
  | { kind: "store_ip_enforcement_tags_removed"; amount: number }
  | { kind: "ip_enforcement_install_from_runner_score" }
  | { kind: "charm_offensive_trash_rezzed_accessed" }
  | { kind: "host_all_programs_from_grip" }
  | { kind: "may_install_one_hosted_program" }
  | { kind: "install_hosted_program"; cardId: string }
  | { kind: "gamedragon_may_host_on_icebreaker" }
  | { kind: "host_hardware_on_icebreaker"; icebreakerId: string }
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
  | { op: "credits_lte"; side: SideRef; amount: number }
  | { op: "credits_gt_other_side"; side: SideRef }
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
  | { op: "successful_run_this_turn" }
  /** Current run ended unsuccessfully (`run.successful === false`). */
  | { op: "run_unsuccessful" }
  /** Current run ended successfully (`run.successful === true`). */
  | { op: "run_successful" }
  | { op: "attacking_central" }
  | { op: "attacking_rd" }
  | { op: "attacking_hq" }
  | { op: "advancements_gte"; amount: number }
  | { op: "agenda_counters_gte"; amount: number }
  | { op: "hq_count_lte"; amount: number }
  | { op: "power_counters_gte"; amount: number }
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
  /**
   * Most recently scored agenda this turn was installed this turn
   * (Word on the Street).
   */
  | { op: "last_scored_agenda_installed_this_turn" }
  /** Current operation was played from a zone other than HQ (Petty Cash). */
  | { op: "played_from_non_hq" }
  /** All nested conditions must hold. */
  | { op: "and"; conds: Cond[] }
  /** Runner MU limit equals used MU (Dewi). */
  | { op: "runner_mu_full" }
  /** Runner has at least `amount` unused MU (Dewi flip side). */
  | { op: "runner_unused_mu_gte"; amount: number }
  /** A subroutine resolved during the current run (Ryō Phoenix). */
  | { op: "subroutine_resolved_this_run" };

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
  "gain_credits",
  "lose_credits",
  "pump_strength",
  "fortify_ice",
  "weaken_ice",
  "spend_stealth_credits",
  "redirect_approach_to_server",
  "net_damage",
  "meat_damage",
  "core_damage",
  "brain_damage",
  "give_tags",
  "give_tags_per_advancement",
  "trash_program",
  "trash_resource",
  "trash_own_resource",
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
  "gain_credits_per_virus",
  "increase_hand_size",
  "trash_hq",
  "trash_hq_card",
  "trash_hardware",
  "trash_program_or_hardware",
  "trash_resource_or_hardware",
  "shuffle_hq_to_rd",
  "shuffle_archives_to_rd",
  "net_damage_agenda_points_this_turn",
  "forbid_scoring_agendas_this_turn",
  "skip_discard_this_turn",
  "place_advancements",
  "place_advancements_on_self_per_faceup_archive_types",
  "score_self_as_agenda",
  "add_to_runner_score_as_agenda",
  "burner_resolve",
  "burner_place",
  "set_run_skip_breach",
  "breach_server_standalone",
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
  "trash_any_rezzed_give_tags",
  "rfg_self",
  "rfg_heap_card",
  "rfg_specific_heap_card",
  "rfg_self_then_derez_bypassed_ice",
  "allotted_clicks_next_turn",
  "score_agenda_card",
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
  "look_top_n_rd_may_install_one",
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
  "break_host_subroutine",
  "break_encounter_subroutine",
  "place_event_credits",
  "may_start_run",
  "queue_start_run",
  "may_install_from_heap",
  "install_from_heap",
  "may_add_from_heap_to_stack_bottom",
  "add_from_heap_to_stack_bottom",
  "offer_jack_out",
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
  "bigger_picture_remove_tags",
  "mitra_aman_approach_ice",
  "may_install_program_hardware_from_last_runner_discarded",
  "swap_approached_ice_with_hq_or_archives",
  "plutus_pay_rez_additional_cost",
  "forfeit_scored_agenda",
  "plutus_may_play_transaction_from_archives",
  "play_archives_transaction_then_rfg",
  "ip_enforcement_remove_tags",
  "store_ip_enforcement_tags_removed",
  "ip_enforcement_install_from_runner_score",
  "charm_offensive_trash_rezzed_accessed",
  "host_all_programs_from_grip",
  "may_install_one_hosted_program",
  "install_hosted_program",
  "gamedragon_may_host_on_icebreaker",
  "host_hardware_on_icebreaker",
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
  "gain_strength_this_turn",
  "shuffle_source_into_rd",
  "may_install_from_hq_paying_costs",
  "install_hq_card_paying_costs",
  "place_advancements_on",
  "place_advancements_on_up_to",
  "place_advancements_on_up_to_continue",
  "remove_all_virus_from_one_installed",
  "remove_all_virus_from",
  "move_source_ice_to_outermost_attacked",
  "may_install_ice_from_hq_other_server_ignore_costs",
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
  "look_top_rd_may_trash",
  "look_top_rd_may_bottom",
  "rd_top_to_bottom",
  "swap_source_ice_with_other",
  "may_swap_ice_with_other_installed",
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
  "install_archives_card_ignore_costs",
  "install_hq_card_ignore_costs",
  "search_rd_operation_to_top_rd",
  "search_rd_reveal_may_install_ignore_costs_else_hq",
  "search_rd_reveal_pick_install_or_hq",
  "install_program_from_grip_paying_cost",
  "prevent_pending_damage",
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
  "credits_lte",
  "credits_gt_other_side",
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
  "successful_run_this_turn",
  "run_unsuccessful",
  "run_successful",
  "attacking_central",
  "attacking_rd",
  "attacking_hq",
  "advancements_gte",
  "agenda_counters_gte",
  "hq_count_lte",
  "power_counters_gte",
  "virus_counters_gte",
  "has_mark",
  "attacking_mark",
  "source_protects_attacked_server",
  "source_installed",
  "threat",
  "source_has_subtype",
  "host_server_unprotected_by_ice",
  "last_agenda_scored_or_stolen_from_source_server_root",
  "successful_all_centrals_this_turn",
  "corp_played_operation_this_turn",
  "identity_flipped",
  "identity_unflipped",
  "last_scored_agenda_installed_this_turn",
  "played_from_non_hq",
  "and",
  "runner_mu_full",
  "runner_unused_mu_gte",
  "subroutine_resolved_this_run",
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
  meatDamage: (amount: number): Effect => fx.do({ kind: "meat_damage", amount }),
  /** Prefer for printed "core damage" (CR §10.4.2b). */
  coreDamage: (
    amount: number,
    opts?: { interactive?: boolean; preventByLoseAllClicks?: boolean },
  ): Effect =>
    fx.do({
      kind: "core_damage",
      amount,
      ...(opts?.interactive ? { interactive: true } : {}),
      ...(opts?.preventByLoseAllClicks
        ? { preventByLoseAllClicks: true }
        : {}),
    }),
  /** Alias of coreDamage (CR §10.4.2c "brain damage"). */
  brainDamage: (amount: number): Effect =>
    fx.do({ kind: "brain_damage", amount }),
  mayPayCreditsForCoreDamage: (amount: number, damage: number): Effect =>
    fx.do({ kind: "may_pay_credits_for_core_damage", amount, damage }),
  addToRunnerScoreAsAgenda: (agendaPoints?: number): Effect =>
    fx.do({
      kind: "add_to_runner_score_as_agenda",
      ...(agendaPoints !== undefined ? { agendaPoints } : {}),
    }),
  giveTags: (amount: number): Effect => fx.do({ kind: "give_tags", amount }),
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
  returnInstalledCorpToHq: (pick: "first" | "choose" = "choose"): Effect =>
    fx.do({ kind: "return_installed_corp_to_hq", pick }),
  installIceInwardFree: (): Effect =>
    fx.do({ kind: "install_ice_inward_free" }),
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
  mayTrashOtherInstalledSearchStackSameTypeInstall: (
    discount: number,
  ): Effect =>
    fx.do({
      kind: "may_trash_other_installed_search_stack_same_type_install",
      discount,
    }),
  trashRunnerRigCard: (cardId: string): Effect =>
    fx.do({ kind: "trash_runner_rig_card", cardId }),
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
        action.kind === "trash_program_or_hardware" ||
        action.kind === "trash_resource_or_hardware" ||
        action.kind === "trash_installed_runner"
      ) {
        if (action.pick !== "first" && action.pick !== "choose") {
          return `${path}.action.pick: must be "first" | "choose"`;
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
        action.kind === "au_co_trash_looked_rd_card" ||
        action.kind === "cultivate_trash_looked" ||
        action.kind === "cultivate_hq_looked"
      ) {
        if (typeof action.cardId !== "string") {
          return `${path}.action.cardId: required string`;
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
      if (action.kind === "host_hardware_on_icebreaker") {
        if (typeof action.icebreakerId !== "string") {
          return `${path}.action.icebreakerId: required string`;
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
      if (action.kind === "trash_runner_rig_card") {
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
          (typeof action.discount !== "number" || action.discount < 0)
        ) {
          return `${path}.action.discount: must be a non-negative number`;
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
