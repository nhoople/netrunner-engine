/**
 * Effect IR: the effect tree (seq, do, if, prevent, choose) and its ops.
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
import type { Cond } from "./cond.js";
import type { Primitive } from "./primitive.js";

export type ChoiceOption = {
  id: string;
  label: string;
  effect: Effect;
};

export type Effect =
  | {
      op: "seq";
      effects: Effect[];
      /**
       * The effects are one printed sentence, so one instruction: no
       * checkpoint between them (CR 9.11.3, 9.1.2). Without it each effect
       * is its own instruction.
       */
      oneInstruction?: boolean;
    }
  | { op: "do"; action: Primitive }
  | { op: "if"; cond: Cond; then: Effect; else?: Effect }
  | { op: "prevent"; forbid: "jack_out" }
  | {
      op: "choose";
      chooser: "corp" | "runner";
      options: ChoiceOption[];
    };

export const KNOWN_EFFECT_OPS = new Set([
  "seq",
  "do",
  "if",
  "prevent",
  "choose",
]);
