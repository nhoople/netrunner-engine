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

export function crDataPresent(): boolean {
  return existsSync(join(vendorDir, "index.json"));
}

export function loadIndex(): CrIndex {
  const path = join(vendorDir, "index.json");
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}. Run: npm run fetch-cr (pins ${loadPin().tag})`,
    );
  }
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
