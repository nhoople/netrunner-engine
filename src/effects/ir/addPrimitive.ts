/**
 * Effect IR: the `Primitive` members whose procedure is add.
 * Their handlers live in the area folders under `effects/`; the kind registry is `effects/coreKinds.ts`.
 * Part of the Effect IR in `effects/ir/`: import each name from the file that declares it.
 */
export type AddPrimitive =
  /** Kingmaking: may add one HQ agenda with AP ≤ max to Corp score. */
  | { kind: "may_add_hq_agenda_ap_lte_to_score"; maxAgendaPoints: number }
  /** Leaf: move HQ agenda into Corp score area (Kingmaking; ignores adv req). */
  | { kind: "add_hq_agenda_to_score"; cardId: string }
  | {
      kind: "add_agenda_counter";
      amount: number;
      /** On the agenda that was just scored (Titan Transnational). */
      onTriggerAgenda?: boolean;
    }
  | { kind: "add_virus_counter"; amount: number }
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
  /** Seidr: may put 1 Archives card on top of R&D. */
  | { kind: "may_add_archives_card_to_rd_top" }
  | { kind: "add_archives_card_to_rd_top"; cardId: string }
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
  /** Apply Cortez Chip rez cost bump to a specific ice instance. */
  | {
      kind: "add_ice_additional_rez_cost_this_turn";
      cardId: string;
      amount: number;
    }
  /** Leaf: place agenda counters on source equal to Corp bad publicity. */
  | { kind: "add_agenda_counters_equal_to_bad_publicity" }
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
   * Mâché: place power on source equal to the trash cost of the card just
   * trashed while accessed (`turn.lastAccessTrashCost`).
   */
  | { kind: "add_power_counter_equal_to_last_access_trash_cost" }
  /** Daniela: add `count` grip cards at random to the bottom of the stack. */
  | { kind: "add_random_grip_to_stack_bottom"; count: number }
  /** Bring Them Home: reveal and add `count` grip cards at random to the top of the stack. */
  | { kind: "add_random_grip_to_stack_top"; count: number }
  | { kind: "add_installed_resource_to_stack_top" }
  /** Sherlock 1.0: choose 1 installed program → top of stack. */
  | { kind: "add_installed_program_to_stack_top" }
  /** Add to an imminent damage amount, including one already at 0 or below (CR 9.9.7a). */
  | { kind: "add_pending_damage"; amount: number }
  /** Place N power counters on the source card (not Charge — no ≥1 gate). */
  | { kind: "add_power_counter"; amount: number }
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
  /** Word on the Street: add source to Corp score as an agenda. */
  | {
      kind: "add_to_corp_score_as_agenda";
      agendaPoints: number;
      cannotForfeit?: boolean;
    }
  | { kind: "add_etr_to_next_ice" }
  | { kind: "add_counter"; cardId: string }
  | { kind: "add_hosted_program_to_grip" }
  | { kind: "add_hosted_agenda_to_runner_score" }
  | { kind: "add_all_hosted_to_grip" }
  | {
      kind: "add_hq_to_bottom_rd";
      /** The Corp's picks, in the order they go to the bottom of R&D. */
      cardIds?: string[];
    }
  | { kind: "may_add_operation_from_archives_to_hq" }
  | { kind: "add_operation_from_archives_to_hq_resolve"; cardId: string }
  | { kind: "add_nonvirus_program_to_stack_top" }
  | { kind: "add_fully_broken_barrier_to_hq" }
  | { kind: "add_installed_program_to_stack_bottom" }
  | { kind: "add_installed_program_to_stack_bottom_resolve"; cardId: string }
  | { kind: "add_n_hq_to_top_rd"; amount?: number }
  | { kind: "add_n_hq_to_top_rd_continue"; remaining: number }
  | { kind: "add_facedown_archives_to_hq_per_advancement" }
  | { kind: "add_installed_to_hq" }
  | { kind: "add_or_remove_power" }
  | { kind: "add_n_installed_runner_to_grip"; amount?: number }
  | {
      kind: "add_n_installed_runner_to_grip_pick";
      cardId: string;
      remaining: number;
    }
  | { kind: "add_installed_non_virtual_runner_to_grip" }
  | { kind: "may_add_archives_card_to_rd_bottom_only" }
  | { kind: "add_net_subs_for_rezzed_ice" }
  /** Asmund turn begin: may move 1 hosted card to grip; trash host if empty. */
  | { kind: "may_add_hosted_card_to_grip" }
  | { kind: "add_hosted_card_to_grip"; cardId: string };
