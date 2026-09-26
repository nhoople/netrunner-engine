import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const vendorDir = join(root, "vendor/cr-data");
const pinPath = join(root, "data/cr-pin.json");

export interface CrPin {
  tag: string;
  repo: string;
  rawBase: string;
  files: string[];
}

export interface CrIndex {
  metadata?: { version?: string; title?: string };
  numbers: Record<string, string>;
  ids: Record<string, string>;
}

export function loadPin(): CrPin {
  return JSON.parse(readFileSync(pinPath, "utf8")) as CrPin;
}

/** Map a pin-relative path (`data/index.json`) to its vendored location. */
export function vendorPathForPinFile(relPath: string): string {
  return join(vendorDir, relPath.replace(/^data\//, ""));
}

/** True when every file listed in `data/cr-pin.json` is present under vendor. */
export function crDataPresent(): boolean {
  const pin = loadPin();
  return pin.files.every((f) => existsSync(vendorPathForPinFile(f)));
}

/**
 * Assert every pin-listed file exists under `vendor/cr-data/`.
 * Includes `nodes.json` when listed (gitignored; requires `npm run fetch-cr`).
 */
export function assertPinnedFilesPresent(): void {
  const pin = loadPin();
  const missing = pin.files
    .map((f) => ({ pin: f, path: vendorPathForPinFile(f) }))
    .filter((f) => !existsSync(f.path));
  if (missing.length > 0) {
    const list = missing.map((m) => m.path).join(", ");
    throw new Error(
      `Missing pinned CR file(s): ${list}. Run: npm run fetch-cr (pins ${pin.tag})`,
    );
  }
}

export function loadIndex(): CrIndex {
  assertPinnedFilesPresent();
  const path = vendorPathForPinFile("data/index.json");
  return JSON.parse(readFileSync(path, "utf8")) as CrIndex;
}

/** Resolve a printed rule number to its stable id via pinned index. */
export function idForNumber(number: string): string {
  const index = loadIndex();
  const id = index.numbers[number];
  if (!id) throw new Error(`Unknown CR number ${number} in pinned index`);
  return id;
}

export function assertPinnedTag(expected = "v26.03"): void {
  const pin = loadPin();
  if (pin.tag !== expected) {
    throw new Error(`Expected pin ${expected}, found ${pin.tag}`);
  }
  const vendorPinPath = join(vendorDir, "PIN.json");
  if (existsSync(vendorPinPath)) {
    const vendor = JSON.parse(readFileSync(vendorPinPath, "utf8")) as {
      tag: string;
    };
    if (vendor.tag !== expected) {
      throw new Error(`Vendor PIN.json tag ${vendor.tag} != ${expected}`);
    }
  }
}
