/**
 * Effect IR: the `Primitive` members whose procedure is shuffle.
 * Their handlers are in `../kinds/shuffleKinds.ts` (or elsewhere in `effects/`).
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
export type ShufflePrimitive =
  | { kind: "shuffle_hq_to_rd"; amount: number }
  /** The Corp chooses up to `amount` cards in Archives; R&D is shuffled. */
  | { kind: "shuffle_archives_to_rd"; amount: number }
  /**
   * Internal: shuffle up to `remaining` installed Runner cards into the stack
   * (Corp chooses; Neurostasis).
   */
  | { kind: "shuffle_n_installed_runner_remaining"; remaining: number }
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
  /** Oracle Thinktank: shuffle source from Runner score into R&D. */
  | {
      kind: "shuffle_source_into_rd";
      /** Also usable from the Corp's score area (15 Minutes). */
      fromCorpScoreArea?: boolean;
    }
  /** Bring Them Home threat: reveal `count` grip cards at random; the Runner shuffles them into the stack. */
  | { kind: "shuffle_random_grip_into_stack"; count: number }
  | { kind: "shuffle_grip_and_heap_into_stack" }
  | { kind: "shuffle_any_number_hq_to_rd" }
  | { kind: "shuffle_hq_card_into_rd"; cardId: string }
  /**
   * Boomerang: when trash-break resolves, register a delayed conditional —
   * on successful run end, may shuffle 1 copy of `title` from heap into stack.
   */
  | {
      kind: "may_shuffle_register_title_from_heap_on_successful_run_end";
      title: string;
    }
  /** Internal / run-end: offer may shuffle one heap card with this title. */
  | { kind: "may_shuffle_title_from_heap_into_stack"; title: string }
  /** Leaf: shuffle a specific heap card into stack. */
  | { kind: "shuffle_heap_card_into_stack"; cardId: string }
  /** Internal: iterative pick of set-aside cards to shuffle. */
  | {
      kind: "shuffle_pick_continue";
      need: number;
      selected: string[];
    }
  /** Internal: shuffle selected set-aside ids into stack, RFG remaining. */
  | {
      kind: "shuffle_selected_rfg_rest";
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
  /** Scapegoat: Corp chooses an installed Runner card; Runner shuffles it into stack. */
  | { kind: "shuffle_installed_runner_into_stack" }
  /** Leaf: shuffle a specific installed Runner card into the stack. */
  | { kind: "shuffle_runner_card_into_stack"; cardId: string }
  /** Read-Write Share trash: shuffle all hosted cards into stack. */
  | { kind: "shuffle_hosted_cards_into_stack" }
  | { kind: "shuffle_corporate_hq_to_rd_draw"; draw: number }
  | { kind: "shuffle_jinteki_biotech_archives_into_rd" }
  | { kind: "shuffle_into_rd"; cardId: string }
  /** Old Hollywood (oh) */
  | { kind: "shuffle_n_heap_cards_into_stack_per_power_counter" }
  | { kind: "shuffle_trope_pick"; cardId: string }
  | { kind: "shuffle_trash_top_gain_install_cost" }
  | { kind: "shuffle_one_archives_into_rd" }
  | { kind: "shuffle_archives_card_into_rd"; cardId: string }
  | { kind: "shuffle_hq" }
  | { kind: "shuffle_resolve"; amount: number }
  | { kind: "shuffle_one_grip_into_stack" }
  | { kind: "shuffle_all_grip_into_stack" }
  | { kind: "shuffle_distract_archives"; remaining: number }
  | {
      kind: "shuffle_distract_one";
      cardId: string;
      remainingAfter: number;
    }
  | { kind: "shuffle_white_hat_one"; cardId: string; remaining?: number }
  | { kind: "shuffle_n_installed_runner_into_stack"; amount?: number }
  | {
      kind: "shuffle_installed_pick";
      cardId: string;
      remaining?: number;
    }
  | { kind: "shuffle_because_i_can_root" }
  | { kind: "shuffle_sadaka"; cardIds: string[] }
  /** Magnum Opus (mo) */
  | { kind: "shuffle_n_heap_cards_into_stack"; amount: number }
  | { kind: "shuffle_heap_pick"; cardId: string }
  | { kind: "shuffle_any_hq_draw" }
  | { kind: "shuffle_hq_card"; cardId: string }
  | {
      kind: "shuffle_grip_of_type";
      cardType: string;
      maxCards: number;
    }
  | { kind: "shuffle_grip_card_into_stack"; cardId: string }
  /** Leaf: shuffle runner set-aside zone into stack (no install). */
  | { kind: "shuffle_runner_set_aside_into_stack" };
