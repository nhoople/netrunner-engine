/**
 * The README's Layout map names every folder (repository layout plan,
 * decision 12). The map had gone stale with no check: it left out src/state/.
 *
 * The map is the first fenced block under "## Layout" in README.md. Each line
 * names one folder (ending in "/") or file, indented two spaces per level
 * under its parent; text after "#" describes it. The check fails when:
 *   - a top-level folder that holds a tracked file is missing from the map
 *     (dot folders, node_modules/ and other ignored or untracked output are
 *     not part of the layout);
 *   - a folder anywhere under src/ is missing from the map;
 *   - the map names a folder or file that does not exist.
 * tests/ subfolders are mapped but not required here: tests/README.md lists
 * them, and tests/repo/test-placement.test.ts checks that list.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MAP_HINT =
  "add each folder to the map in README.md's Layout section, indented under its parent, with a line on what it holds";

/** Every path the README's Layout map names: folders end in "/". */
function readLayoutMap(readme: string): string[] {
  const after = readme.split(/^## Layout\s*$/m)[1];
  if (after === undefined) throw new Error('README.md has no "## Layout"');
  const section = after.split(/^## /m)[0]!;
  const block = /^```[^\n]*\n([\s\S]*?)^```/m.exec(section)?.[1];
  if (block === undefined) throw new Error("the Layout section has no map");
  const parents: string[] = [];
  const paths: string[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    if (indent % 2 !== 0) {
      throw new Error(
        `map line is not indented by twos: ${JSON.stringify(raw)}`,
      );
    }
    const depth = indent / 2;
    if (depth > parents.length) {
      throw new Error(`map line has no parent folder: ${JSON.stringify(raw)}`);
    }
    parents.length = depth;
    const name = line.trim();
    const path = parents.join("") + name;
    paths.push(path);
    if (name.endsWith("/")) parents.push(name);
  }
  return paths;
}

/**
 * Top-level folders that hold a file git tracks (or has staged). Dot folders,
 * ignored folders (node_modules/, dist/) and local untracked output such as a
 * coverage run are not part of the layout.
 */
function topFolders(): string[] {
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const names = new Set<string>();
  for (const path of tracked.split("\n")) {
    const slash = path.indexOf("/");
    if (slash > 0 && !path.startsWith(".")) names.add(path.slice(0, slash));
  }
  return [...names].sort().map((name) => `${name}/`);
}

function srcFolders(dir = "src", out: string[] = []): string[] {
  out.push(`${dir}/`);
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) srcFolders(`${dir}/${entry.name}`, out);
  }
  return out;
}

const mapped = (): string[] =>
  readLayoutMap(readFileSync(join(ROOT, "README.md"), "utf8"));

describe("README Layout map (layout plan decision 12)", () => {
  it("names every top-level folder", () => {
    const names = new Set(mapped());
    const missing = topFolders().filter((f) => !names.has(f));
    expect(
      missing,
      `top-level folders missing from the map: ${MAP_HINT}`,
    ).toEqual([]);
  });

  it("names every folder under src/", () => {
    const names = new Set(mapped());
    const missing = srcFolders().filter((f) => !names.has(f));
    expect(missing, `src/ folders missing from the map: ${MAP_HINT}`).toEqual(
      [],
    );
  });

  it("names only folders and files that exist", () => {
    const stale = mapped().filter((path) => {
      const full = join(ROOT, path);
      if (!existsSync(full)) return true;
      return statSync(full).isDirectory() !== path.endsWith("/");
    });
    expect(
      stale,
      "the map names a folder or file that does not exist (a folder ends in /): fix or remove it in README.md's Layout section",
    ).toEqual([]);
  });
});
