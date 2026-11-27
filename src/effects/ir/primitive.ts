/**
 * Effect IR: the `Primitive` union, one member type per kind family.
 * Part of the split of `../ir.ts`, which re-exports the public names.
 */
import type { AddPrimitive } from "./addPrimitive.js";
import type { BreachPrimitive } from "./breachPrimitive.js";
import type { ChoosePrimitive } from "./choosePrimitive.js";
import type { DerezPrimitive } from "./derezPrimitive.js";
import type { ForbidPrimitive } from "./forbidPrimitive.js";
import type { GainPrimitive } from "./gainPrimitive.js";
import type { HostPrimitive } from "./hostPrimitive.js";
import type { InstallPrimitive } from "./installPrimitive.js";
import type { LookPrimitive } from "./lookPrimitive.js";
import type { MovePrimitive } from "./movePrimitive.js";
import type { OtherPrimitive } from "./otherPrimitive.js";
import type { PayPrimitive } from "./payPrimitive.js";
import type { PlacePrimitive } from "./placePrimitive.js";
import type { PlayPrimitive } from "./playPrimitive.js";
import type { RemovePrimitive } from "./removePrimitive.js";
import type { ResolvePrimitive } from "./resolvePrimitive.js";
import type { ReturnPrimitive } from "./returnPrimitive.js";
import type { RevealPrimitive } from "./revealPrimitive.js";
import type { RezPrimitive } from "./rezPrimitive.js";
import type { SearchPrimitive } from "./searchPrimitive.js";
import type { SetPrimitive } from "./setPrimitive.js";
import type { ShufflePrimitive } from "./shufflePrimitive.js";
import type { SwapPrimitive } from "./swapPrimitive.js";
import type { TrashPrimitive } from "./trashPrimitive.js";

/** Leaf actions the host knows how to execute. */
export type Primitive =
  | AddPrimitive
  | BreachPrimitive
  | ChoosePrimitive
  | DerezPrimitive
  | ForbidPrimitive
  | GainPrimitive
  | HostPrimitive
  | InstallPrimitive
  | LookPrimitive
  | MovePrimitive
  | PayPrimitive
  | PlacePrimitive
  | PlayPrimitive
  | RemovePrimitive
  | ResolvePrimitive
  | ReturnPrimitive
  | RevealPrimitive
  | RezPrimitive
  | SearchPrimitive
  | SetPrimitive
  | ShufflePrimitive
  | SwapPrimitive
  | TrashPrimitive
  | OtherPrimitive;
