/**
 * Effect IR: the `Primitive` members whose procedure is search.
 * Their handlers are in `../kinds/searchKinds.ts` (or elsewhere in `effects/`).
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
export type SearchPrimitive =
  /** Replicator: may search stack for copy of last installed hardware → grip. */
  | { kind: "may_search_stack_copy_of_last_installed_hardware_add_to_grip" }
  | {
      kind: "search_stack_copy_of_last_installed_hardware_add_to_grip";
    }
  /**
   * Muse onInstall: choose stack/heap/grip → non-daemon program →
   * trojan on ice else host on Muse (daemonHost).
   */
  | { kind: "search_install_non_daemon" }
  /** Leaf: Muse search a specific zone for a non-daemon program. */
  | { kind: "search_zone"; zone: "stack" | "heap" | "grip" }
  /**
   * Hostage: search stack for a card with `subtype`, add to grip, shuffle,
   * then may install that card paying costs.
   */
  /**
   * Hostage: search the stack for a card with `subtype` (the Runner may find
   * nothing, CR 8.7.2e), shuffle, reveal it and add it to the grip, then the
   * Runner may install it. `cardIds` is the found card, filled by the search.
   */
  | {
      kind: "search_stack_subtype_may_install";
      subtype: string;
      cardIds?: string[];
    }
  /**
   * Search R&D for the first card of `cardType`, reveal it, add it to HQ,
   * then reverse R&D (the engine's stand-in for shuffle).
   * `shuffleIfNone` also reverses when the search misses (asset search).
   * Ice, operation, and agenda leave R&D as-is on a miss.
   */
  | {
      kind: "search_rd_type_to_hq";
      cardType: "ice" | "agenda" | "operation" | "asset";
      shuffleIfNone?: boolean;
    }
  /**
   * Tocsin: search R&D for up to one ice of each listed subtype; reveal and
   * add to HQ; shuffle.
   */
  | { kind: "search_rd_up_to_one_each_subtype_to_hq"; subtypes: string[] }
  /** Search R&D for the first operation or agenda, add to HQ, shuffle R&D (Pivot). */
  | { kind: "search_rd_operation_or_agenda_to_hq"; cardIds?: string[] }
  /**
   * Search R&D for ice, shuffle, install outermost on source server, rez
   * paying `totalDiscount` less combined install+rez (Tucana).
   */
  | {
      kind: "search_rd_install_rez_ice_on_source_server";
      totalDiscount: number;
    }
  /**
   * Search R&D for a card whose printed rez cost equals
   * `lastTrashedRezzedPrintedRezCost + delta` (Ob: delta -1); install into a
   * new remote ignoring install costs. Rez is an additional cost the Corp
   * may decline (CR 8.5.13c).
   */
  | {
      kind: "search_rd_install_rez_by_printed_rez_cost";
      delta: number;
      /** Set by the engine: the card the Corp found. */
      cardIds?: string[];
    }
  | {
      kind: "search_stack_icebreaker";
      mayInstallIfSuccessfulRunThisTurn?: boolean;
    }
  | {
      kind: "search_stack_icebreaker_resolve";
      cardId?: string;
      fail?: boolean;
      mayInstallIfSuccessfulRunThisTurn?: boolean;
    }
  /**
   * `cardIds` is the Corp's pick, set by the engine; not authored.
   * `reveal`: the text has the found card revealed (Malapert Data Vault).
   */
  | { kind: "search_rd_non_agenda"; reveal?: boolean; cardIds?: string[] }
  /**
   * Search R&D for `amount` cards and add them to HQ, then shuffle R&D
   * (CR 8.7). `upTo`: the text says "up to". `reveal`: the text has the
   * found cards revealed. `cardIds` is the Corp's pick, set by the engine;
   * card data does not author it.
   */
  | {
      kind: "search_rd_to_hq";
      amount: number;
      upTo?: boolean;
      reveal?: boolean;
      cardIds?: string[];
    }
  | { kind: "may_search_rd_install_rez_ignore_costs" }
  | { kind: "search_rd_pick_install_rez_ignore_costs"; cardId: string }
  /** Embedded Reporting: search R&D for operation, shuffle, put on top. */
  | { kind: "search_rd_operation_to_top_rd" }
  /** Off the Books: search R&D, reveal, then install or HQ. */
  | { kind: "search_rd_reveal_may_install_ignore_costs_else_hq" }
  /** Leaf: reveal R&D pick then install or leave in HQ. */
  | { kind: "search_rd_reveal_pick_install_or_hq"; cardId: string }
  /**
   * Let Them Dream: may search HQ/R&D/Archives for an agenda; reveal; add to
   * HQ or bottom of R&D.
   */
  | { kind: "may_search_hq_rd_archives_agenda_to_hq_or_rd_bottom" }
  /** Leaf helpers for Let Them Dream search. */
  | {
      kind: "search_zone_agenda_to_hq_or_rd_bottom";
      zone: "hq" | "rd" | "archives";
    }
  /**
   * Editorial: may search R&D for 1 non-agenda with any listed subtype;
   * reveal and add to HQ; shuffle.
   */
  | {
      kind: "may_search_rd_non_agenda_any_subtype_to_hq";
      subtypes: string[];
      /** The search is complete: the card found, or none (CR 8.7.2e). */
      cardIds?: string[];
    }
  | { kind: "search_rd_take_card_to_hq"; cardId: string }
  | { kind: "search_stack_non_virus_program_install_ignore_costs_track" }
  /** Rabbit Hole: search stack for another copy of source title; may install paying. */
  | { kind: "search_stack_same_title_may_install_paying" }
  /** Djinn: search stack for subtype(+optional type), reveal, add to grip, shuffle. */
  | {
      kind: "search_stack_subtype_add_to_grip";
      subtype: string;
      type?: string;
    }
  | { kind: "search_stack_subtype_add_to_grip_pick"; cardId: string }
  | {
      kind: "search_foundry_copy_to_hq";
      /** The Corp answered whether to search ("you may"; CR 9.6.9c). */
      chosen?: boolean;
      /** The Corp chose not to search; R&D is still shuffled. */
      declined?: boolean;
      /** The search is complete: the copy found, or none (CR 8.7.2e). */
      cardIds?: string[];
    }
  /**
   * Paige Piper: may add any number of copies of the installed card from
   * the stack to the heap, then shuffle. `cardIds` is the Runner's pick,
   * set by the engine; card data does not author it.
   */
  | { kind: "search_stack_copies_to_heap"; cardIds?: string[] }
  /**
   * Tech Startup: search R&D for an asset, reveal it, install it; shuffle
   * R&D. `cardIds` is the Corp's pick, filled in by the choice (empty =
   * found nothing, CR 8.7.2e).
   */
  | { kind: "search_rd_asset_install"; cardIds?: string[] }
  | {
      kind: "search_stack_type_add_to_grip";
      cardType: "program" | "hardware" | "resource";
    }
  | { kind: "search_stack_type_add_to_grip_pick"; cardId: string }
  | {
      kind: "search_rd_up_to_x_subtype_to_hq";
      subtype: string;
      /** The search is complete: the cards found (CR 8.7.2e). */
      cardIds?: string[];
    }
  | { kind: "search_rd_or_archives_agenda_to_bottom_rd" }
  | { kind: "search_stack_install" }
  | {
      kind: "search_alliance_play_or_install";
      /** The search is complete: the card found, or none (CR 8.7.2e). */
      cardIds?: string[];
    }
  | { kind: "search_rd_for_any_subtype_to_hq"; subtypes: string[] }
  | { kind: "search_rd_subtype_to_hq_resolve"; cardId: string }
  | {
      kind: "search_rd_copies_to_hq";
      /** The search is complete: the copies found (CR 8.7.2e). */
      cardIds?: string[];
    }
  | { kind: "search_rd_play_operation" }
  | { kind: "search_rosetta_rfg_program_install_non_virus" }
  | { kind: "search_rosetta_rfg_then"; cardId: string }
  | { kind: "search_kabonesa_install" }
  | { kind: "search_emergent_install"; discount: number }
  | { kind: "search_crypt_install" }
  | { kind: "search_compile"; zone: "stack" | "heap" }
  | {
      kind: "search_rd_any_card_to_hq";
      /** The search is complete: the card found (CR 8.7.2d). */
      cardIds?: string[];
    }
  | { kind: "search_stack_take_to_grip"; max?: number }
  /**
   * Asmund: search stack for up to `max` virus or weapon cards with different
   * titles; host them faceup on source (not installed); shuffle.
   */
  | { kind: "search_stack_host_virus_or_weapon"; max: number }
  /**
   * Search stack for a program and install it, paying install costs
   * (Into the Depths). Opens a choice when multiple affordable programs
   * exist; sole candidate auto-installs. Shuffles the stack after search
   * (deterministic reverse in v0). No-op install when none affordable.
   */
  | { kind: "search_stack_program_install" }
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
  /**
   * Search stack for a card of `cardType` and install paying `discount`¢ less.
   * Opens a choice when multiple affordable matches exist; shuffles after.
   */
  | {
      kind: "search_stack_type_install";
      cardType: "program" | "hardware" | "resource";
      discount: number;
    };
