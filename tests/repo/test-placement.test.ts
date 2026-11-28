/**
 * Test placement (repository layout plan, slice E-tests, decision 5). The
 * same rule as the game's `tests/repo/layout.test.ts` (game #343).
 *
 * Tests live under `tests/`, in a folder that mirrors the code they test
 * (`tests/state/access/` for `src/state/access/`) or one folder per kind of
 * check (`tests/rulings/`, `tests/packs/`, …). This fails on:
 *   - a test file directly in `tests/`, or anywhere outside `tests/`;
 *   - a folder under `tests/` that `tests/README.md` leaves out, or a row
 *     there for a folder that is gone;
 *   - a code folder (one whose first name is a `src/` folder) that names no
 *     `src/` folder, so `tests/state/` and `tests/effects/` keep exactly the
 *     `src/` area names.
 *
 * It reads the files git tracks plus new files it does not ignore, so a new
 * test file or folder fails before its first commit.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function git(args: readonly string[]): string[] {
  // -z: names exactly as stored, never quoted.
  return execFileSync("git", ["ls-files", "-z", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

/** Files on disk that git tracks or would track: deleted files drop out, new ones count. */
function repoFiles(): string[] {
  const deleted = new Set(git(["--deleted"]));
  return git(["--cached", "--others", "--exclude-standard"]).filter(
    (file) => !deleted.has(file),
  );
}

/** Every folder under `tests/` that holds a file, and every folder above it, written `tests/…/`. */
function testFolders(files: readonly string[]): Set<string> {
  const folders = new Set<string>();
  for (const file of files) {
    if (!file.startsWith("tests/")) continue;
    for (
      let dir = posix.dirname(file);
      dir !== "tests" && dir !== ".";
      dir = posix.dirname(dir)
    ) {
      folders.add(`${dir}/`);
    }
  }
  return folders;
}

/** Every folder under `src/`, written `src/…/`. */
function srcFolders(files: readonly string[]): Set<string> {
  const folders = new Set<string>();
  for (const file of files) {
    if (!file.startsWith("src/")) continue;
    for (let dir = posix.dirname(file); dir !== "."; dir = posix.dirname(dir)) {
      folders.add(`${dir}/`);
    }
  }
  return folders;
}

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

function misplacedTests(files: readonly string[]): string[] {
  return files
    .filter((file) => TEST_FILE.test(file))
    .filter(
      (file) => !file.startsWith("tests/") || posix.dirname(file) === "tests",
    )
    .map((file) =>
      file.startsWith("tests/")
        ? `${file} is in the top tests/ folder: move it to the tests/ folder that mirrors the code it tests, or the one for its kind of check (tests/README.md lists them)`
        : `${file} is outside tests/: move it to the tests/ folder that mirrors its code (npm test runs only tests/**/*.test.ts)`,
    )
    .sort();
}

/** The folders in the first column of the tables in `tests/README.md`. */
function listedFolders(readme: string): Set<string> {
  const folders = new Set<string>();
  for (const line of readme.split("\n")) {
    const row = /^\|\s*`(tests\/[^`]+\/)`\s*\|/.exec(line);
    if (row) folders.add(row[1]!);
  }
  return folders;
}

function folderListProblems(
  files: readonly string[],
  readme: string,
): string[] {
  const folders = testFolders(files);
  const listed = listedFolders(readme);
  return [
    ...[...folders]
      .filter((folder) => !listed.has(folder))
      .map(
        (folder) =>
          `${folder} is missing from tests/README.md: add a row saying what goes in it`,
      ),
    ...[...listed]
      .filter((folder) => !folders.has(folder))
      .map(
        (folder) =>
          `${folder} is in tests/README.md but holds no file: remove its row`,
      ),
  ].sort();
}

/**
 * A folder under `tests/` whose first name is a `src/` folder mirrors `src/`,
 * so the rest of its path must be a `src/` folder too.
 */
function mirrorProblems(files: readonly string[]): string[] {
  const src = srcFolders(files);
  return [...testFolders(files)]
    .filter((folder) => {
      const top = folder.split("/")[1]!;
      return src.has(`src/${top}/`) && !src.has(`src/${folder.slice(6)}`);
    })
    .map(
      (folder) =>
        `${folder} mirrors src/ but src/${folder.slice(6)} does not exist: use the src/ folder name, or a check folder name that is not a src/ folder`,
    )
    .sort();
}

const readme = (): string =>
  readFileSync(join(ROOT, "tests/README.md"), "utf8");

describe("test placement (layout plan decision 5)", () => {
  it("every test file sits in a folder under tests/, none in the top tests/ folder", () => {
    expect(misplacedTests(repoFiles())).toEqual([]);
  });

  it("tests/README.md lists every folder under tests/, and no folder that is gone", () => {
    expect(folderListProblems(repoFiles(), readme())).toEqual([]);
  });

  it("a test folder named after a src/ folder mirrors a folder that exists in src/", () => {
    expect(mirrorProblems(repoFiles())).toEqual([]);
  });

  it("a new test file in the top tests/ folder fails the check", () => {
    expect(
      misplacedTests([
        "tests/state/access/access-a-card.test.ts",
        "tests/new-thing.test.ts",
      ]),
    ).toEqual([
      "tests/new-thing.test.ts is in the top tests/ folder: move it to the tests/ folder that mirrors the code it tests, or the one for its kind of check (tests/README.md lists them)",
    ]);
  });

  it("a test file beside its code in src/ fails the check", () => {
    expect(
      misplacedTests([
        "tests/state/access/access-a-card.test.ts",
        "src/state/access/new-thing.test.ts",
      ]),
    ).toEqual([
      "src/state/access/new-thing.test.ts is outside tests/: move it to the tests/ folder that mirrors its code (npm test runs only tests/**/*.test.ts)",
    ]);
  });

  it("a folder tests/README.md leaves out fails, and so does a row for a folder that is gone", () => {
    const list =
      "| Folder | What goes in it |\n| --- | --- |\n| `tests/rulings/` | Rulings |\n| `tests/packs/` | Packs |\n";
    expect(
      folderListProblems(
        ["tests/rulings/rulings.test.ts", "tests/made-up/thing.test.ts"],
        list,
      ),
    ).toEqual([
      "tests/made-up/ is missing from tests/README.md: add a row saying what goes in it",
      "tests/packs/ is in tests/README.md but holds no file: remove its row",
    ]);
  });

  it("a test folder that misspells a src/ area name fails", () => {
    expect(
      mirrorProblems([
        "src/state/access/access.ts",
        "tests/state/access/access-a-card.test.ts",
        "tests/state/acess/new-thing.test.ts",
        "tests/rulings/rulings.test.ts",
      ]),
    ).toEqual([
      "tests/state/acess/ mirrors src/ but src/state/acess/ does not exist: use the src/ folder name, or a check folder name that is not a src/ folder",
    ]);
  });
});
