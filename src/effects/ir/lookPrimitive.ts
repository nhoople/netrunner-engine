/**
 * Effect IR: the `Primitive` members whose procedure is look.
 * Their handlers are in `../kinds/lookKinds.ts` (or elsewhere in `effects/`).
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
export type LookPrimitive =
  /** Data Hound: look top lastTraceExcess of stack, trash 1, arrange rest. */
  | { kind: "look_top_last_trace_excess_stack_trash_one_arrange_rest" }
  /** Look at top N of R&D; may install one paying costs (Epiphany). */
  | {
      kind: "look_top_n_rd_may_install_one";
      n: number;
      excludeAgenda?: boolean;
    }
  /**
   * Architect Deployment Test: look at top N of R&D; may install and rez one
   * ignoring all costs (agendas install without rez).
   */
  | { kind: "look_top_n_rd_may_install_and_rez_ignore_costs"; n: number }
  /** Architect: install one, ignoring the install cost; no rez. */
  | { kind: "look_top_n_rd_may_install_ignore_install_cost"; n: number }
  /** Look at top N of R&D and rearrange order (Federal Fundraising). */
  | {
      kind: "look_top_n_rd_arrange";
      n: number;
      thenMayDrawIfUnprotected?: boolean;
      /**
       * The player who looks and arranges, when it is not the controller of
       * the source (Insight has the Corp look; CR 1.21.2).
       */
      looker?: "corp" | "runner";
    }
  /**
   * Cultivate: look at top N of R&D; trash 1, add 1 to HQ, arrange the rest.
   */
  | { kind: "look_top_n_rd_trash_one_hq_one_arrange_rest"; n: number }
  /**
   * Corp chooses a card type, looks at top of R&D; on match may reveal and
   * gain `credits` (Balanced Coverage).
   */
  | { kind: "look_top_1_rd_choose_type_may_reveal_gain"; credits: number }
  /** Runner looks at top N of R&D; order unchanged (Chrysopoeian). */
  | { kind: "look_top_n_rd_peek"; n: number }
  | { kind: "look_top_rd_may_trash" }
  /** ezaM: look at top of R&D; may move it to the bottom. */
  | { kind: "look_top_rd_may_bottom" }
  /** Flower Sermon: look at top of R&D; may advance; may bottom. */
  | { kind: "look_top_rd_may_advance_may_bottom" }
  /**
   * Prognostic Q-Loop: privately look at top N of stack (no rearrange).
   * Cards-data uses `amount` (not `n`) for this leaf.
   */
  | { kind: "look_top_n_stack_peek"; amount: number }
  | { kind: "look_class_act_top_draw_amount_plus_one_bottom_one" }
  /** Méliès U back: look top R&D, may trash; if trash, add 1 from Archives to HQ. */
  | { kind: "look_top_rd_may_trash_if_do_archives_to_hq" }
  | { kind: "look_top_stack_may_reveal_breaker_or_run_event" }
  | { kind: "look_top_n_stack_arrange"; n: number }
  | { kind: "look_at_top_of_stack" }
  | { kind: "look_top_x_stack_arrange" }
  | { kind: "look_top_1_rd" }
  /** Salsette Island (si) */
  | { kind: "look_top_n_stack_trash_any_arrange_rest"; n?: number }
  /** Intervention (in) Flashpoint */
  | { kind: "look_top_install"; n?: number; discount?: number }
  | { kind: "may_look_nihongai_top5_swap_hq" }
  | { kind: "look_nihongai_swap_continue"; lookedIds: string[] }
  | { kind: "look_top5_may_install_remote" }
  | { kind: "look_sadaka_top_3" }
  | { kind: "look_top_n_stack_add_one_to_grip_shuffle"; n?: number }
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
    };
