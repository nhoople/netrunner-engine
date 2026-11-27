/** Sides, card types, zones and damage types: the words the other state types share. */

export type Side = "corp" | "runner";

export type CardType =
  | "identity"
  | "agenda"
  | "asset"
  | "upgrade"
  | "ice"
  | "operation"
  | "event"
  | "hardware"
  | "program"
  | "resource";

export type ZoneId =
  | "corp:rd"
  | "corp:hq"
  | "corp:archives"
  | "corp:play-area"
  | "corp:score"
  | "runner:play-area"
  | "runner:stack"
  | "runner:grip"
  | "runner:heap"
  | "runner:installed"
  | "runner:score"
  | "runner:set-aside"
  | "runner:outside-game-identities"
  | "corp:set-aside"
  | "removed-from-game"
  | `server:${string}:root`
  | `server:${string}:ice`
  | `hosted:${string}`;

/** Damage kinds. `"brain"` is a CR alias of `"core"` (§10.4.2c). */
export type DamageType = "net" | "meat" | "core" | "brain";
