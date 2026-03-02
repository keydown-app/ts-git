# Agent notes: Git `diff` in ts-git

This document summarizes **what our diff stack implements today**, **where it diverges from canonical `git diff`**, and **what full CLI parity would require**. It is intended for contributors and coding agents working in `@keydown-app/ts-git`.

## Architecture (where logic lives)

| Layer                                                                                                  | Role                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`packages/ts-git/src/commands/diff/index.ts`](packages/ts-git/src/commands/diff/index.ts)             | Core comparison: snapshots from worktree, index, commits/trees; unified deltas; `formatPatch` / `formatDiff` and helpers like `resolveCommitRef`.                              |
| [`packages/ts-git-diff-myers`](../../../ts-git-diff-myers)                                             | Optional **line-level** Myers diff via npm [`diff`](https://www.npmjs.com/package/diff) (jsdiff), packaged separately. Install to use with `lineDiffAlgorithm: myersLineDiff`. |
| [`packages/ts-git-diff-words`](../../../ts-git-diff-words)                                             | (Planned) Word-level diff for prose with cross-file move detection.                                                                                                            |
| [`packages/ts-git/src/client/index.ts`](packages/ts-git/src/client/index.ts)                           | `GitClient.diff(...)`: thin wrapper with `fs` / `dir` / `gitdir`; returns typed `DiffResult` only (no string formatting).                                                      |
| [`packages/ts-git/src/cli/resolveDiffInvocation.ts`](packages/ts-git/src/cli/resolveDiffInvocation.ts) | Maps embedded-CLI argv (after `handleDiff` strips a few flags) to `{ left, right, paths, cached }`.                                                                            |
| [`packages/ts-git/src/cli/commandParser.ts`](packages/ts-git/src/cli/commandParser.ts)                 | `handleDiff`: parses `--cached`, `--staged`, `--name-only`, `--name-status`, `--stat`; calls `resolveDiffInvocation` + `git.diff` + `formatDiff`.                              |

String parsing and presentation belong in **`@keydown-app/ts-git/cli`**; the client stays typed.

### Line-level diff (Myers / jsdiff)

- Blobs are decoded to text and split on `\n` (same as before).
- **No default algorithm**: `@keydown-app/ts-git` does **not** include a diff algorithm by default. You must install and configure one:

  ```bash
  npm install @keydown-app/ts-git-diff-myers
  ```

  ```typescript
  import { myersLineDiff } from '@keydown-app/ts-git-diff-myers';
  import { diff } from '@keydown-app/ts-git';

  const result = await diff({
    fs,
    dir: '/path/to/repo',
    lineDiffAlgorithm: myersLineDiff,
  });
  ```

- **`DiffArgs.lineDiffAlgorithm`** (and **`GitClient.diff({ lineDiffAlgorithm })`**) is **required**. The diff command will throw an error if no algorithm is provided.
- The `diff` npm package is no longer a dependency of `@keydown-app/ts-git`. It is now a dependency of `@keydown-app/ts-git-diff-myers` only.

---

## What is implemented today

### Comparison modes (engine + typical CLI use)

- **Index vs worktree** (`git diff` with no revs), optionally limited by **pathspecs** (including a single path token that does not resolve as a ref).
- **Peeled HEAD (commit/tree) vs index** (`--cached` / `--staged`), with pathspecs.
- **One commit vs worktree** (single rev that resolves via `resolveCommitRef`).
- **Two commits** (two rev arguments or `rev1..rev2` in one token).
- **`rev1...rev2` syntax is accepted** but is implemented as **two resolved commits compared directly**, not as git’s merge-base semantics (see below).

### Ref resolution (approximate git behavior)

- Full OIDs, peeled `HEAD`, symbolic refs readable via `readRef`, and commit/tree objects where applicable.
- **Pathspec disambiguation:** a single token that fails `resolveCommitRef` is treated as a path (revision tried first, matching git’s ordering).

### Embedded CLI output modes

- Unified **patch** (default), **`--name-only`**, **`--name-status`**, **`--stat`** (via `formatDiff`).

### Interoperability tests

- [`packages/ts-git/src/tests/integration/status-diff-git-interop.test.ts`](packages/ts-git/src/tests/integration/status-diff-git-interop.test.ts) compares **name-status** and **patch-shaped** output to system `git` on temp repos, with test-side normalization where git and ts-git legitimately differ (e.g. `index` line OID width, unified hunk headers).

---

## Limitations vs canonical `git diff`

### 1. Embedded CLI argument surface

`handleDiff` only recognizes a **small fixed set** of options. Any other `-` argument is either handled only in the flag loop (if listed) or **dropped from `diffArgs`** in `resolveDiffInvocation` (unknown options starting with `-` are skipped). There is no general `git diff` option parser.

**Not supported in the CLI layer** (non-exhaustive):

- Context and hunk shape: `-U`, `--unified`, `--inter-hunk-context`, `--function-context`, etc.
- Diff algorithm / behavior: `--minimal`, `--histogram`, `--patience`, `--diff-algorithm`, ignore-space / ignore-blank-lines family, `--word-diff`, `--color`, `--no-color`.
- More output formats: `--raw`, `--numstat`, `-z`, `--shortstat`, `--summary`, `--patch-with-raw`, `--compact-summary`, `--dirstat`, submodule diffs, external diff drivers.
- **`git diff --no-index`**, **`--exit-code`**, **`--quiet`**, **`--merge-base`**, pathspec magic (e.g. `:(top)`), and most plumbing-style flags.

### 2. Revision and pathspec semantics

- **More than two non-option rev tokens** (before `--`) are rejected (`Too many refs specified`).
- **Mixed ref + path without `--`** in positions git would disambiguate (e.g. multiple ambiguous tokens) is **not** fully modeled; only the single-token pathspec fallback is in place.
- **`A...B`**: git diff uses the **merge base** of A and B as the left side and B as the right; we currently treat `A...B` like **`A..B`** (two explicit commits). Proper parity needs **merge-base** computation and wiring into `resolveDiffInvocation` / `resolveDiffSpecs`.
- **Blobs, tags-only, ranges with three dots to merge-base**, and **diffing a path that exists as both ref and file** follow git’s more complex rules; we only implement the subset above.

### 3. Core engine and snapshots

- Default **index vs worktree** diff only walks **tracked** paths from the index (untracked files generally do not appear as addable deltas in that mode), which matches common git behavior for `git diff` but may differ in edge cases.
- **Rename / copy detection** as first-class R/C status with similarity scores is limited compared to git’s full rename logic (types may advertise R/C but behavior should be verified per scenario).
- **Binary files**: detected and summarized; no textual binary patch or external diff.
- **`DiffArgs.contextLines`** is honored when building hunks (default `3`). **`GitClient.diff`** accepts **`contextLines`** and **`lineDiffAlgorithm`**. The embedded CLI does not yet parse `-U` / `--unified`; context is library/API only unless extended in the CLI layer.

### 4. Output fidelity

- Patch text may differ from git in **hunk headers**, **index line** formatting (OID length), and **ordering**; interop tests normalize some lines for that reason.
- **Color, word-level diff, and raw machine-readable formats** are out of scope until implemented in formatters.

---

## What full canonical `git diff` support would require

Work is naturally split into **argv / semantics**, **engine**, and **output**.

### A. CLI and `resolveDiffInvocation`

1. **Option parser**: tokenize `git diff` options per git’s precedence (including negated forms, `-R`, combined short options where applicable).
2. **Map options to typed parameters**: e.g. context lines → `DiffArgs` / hunk builder; rename detection toggles → compare pipeline; whitespace rules → diff driver or preprocessor.
3. **Complete revision parser**: pathspecs after `--`, magic pathspecs, multiple refs vs paths, `...` merge-base, `--merge-base`, etc., ideally shared or aligned with other commands (`reset`, `checkout`, …).
4. **Subcommands / modes** that git implements as separate code paths (`--no-index`, submodules): either explicit scope exclusions or full implementations.

### B. Core diff engine (`commands/diff/` and dependencies)

1. **Merge-base** for `A...B` and related operations (needs graph walk / parent pointers from commits).
2. **Rename/copy detection** aligned with git’s heuristics (optional similarity index, `-M`/`-C` style knobs).
3. **Pathspec engine** matching git (literal, glob, exclude, top, etc.) if not already shared with `add` / `status`.
4. **Algorithm and ignore options** affecting the line-level diff (and possibly pre-normalization of input text).
5. **Plumbing for blob/tree-only diffs** if exposed at the CLI.

### C. Formatters

1. Implement additional **`DiffOutputMode`** values (or parallel formatters) for `--raw`, `--numstat`, `-z`, `--shortstat`, etc.
2. **Byte-accurate patch mode** with git (optional): match default context, hunk headers, and `index` line policy; may require configurables for abbreviation and ordering.

### D. API surface

1. **`GitClient.diff`**: extend only when the engine supports new inputs; keep “typed in, typed out” — avoid reintroducing string argv or formatting into the client.
2. **Tests**: extend interop tests as each git feature lands; prefer oracle tests against system `git` on temp repos where possible.

---

## Related files

- Core: [`packages/ts-git/src/commands/diff/index.ts`](packages/ts-git/src/commands/diff/index.ts)
- Diff types: [`packages/ts-git/src/commands/diff/types.ts`](packages/ts-git/src/commands/diff/types.ts)
- Myers algorithm package: [`packages/ts-git-diff-myers`](../../../ts-git-diff-myers)
- Words algorithm package: [`packages/ts-git-diff-words`](../../../ts-git-diff-words)
- Client: [`packages/ts-git/src/client/index.ts`](packages/ts-git/src/client/index.ts)
- CLI resolution: [`packages/ts-git/src/cli/resolveDiffInvocation.ts`](packages/ts-git/src/cli/resolveDiffInvocation.ts), [`packages/ts-git/src/cli/commandParser.ts`](packages/ts-git/src/cli/commandParser.ts)
- Types: [`packages/ts-git/src/types.ts`](packages/ts-git/src/types.ts) (`DiffArgs`, `DiffSide`, `DiffResult`, `DiffOutputMode`, `LineDiffAlgorithm`, `WordDiffAlgorithm`)
- Interop: [`packages/ts-git/src/tests/integration/status-diff-git-interop.test.ts`](packages/ts-git/src/tests/integration/status-diff-git-interop.test.ts)

When adding behavior, update this document if the **supported / unsupported** boundary changes materially.

## Creating a custom diff algorithm

To create your own diff algorithm:

1. Create a package that exports a `LineDiffAlgorithm` function
2. Import types from `@keydown-app/ts-git`:

   ```typescript
   import type { LineDiffAlgorithm, LineDiffEdit } from '@keydown-app/ts-git';

   export const myCustomDiff: LineDiffAlgorithm = (oldLines, newLines) => {
     const edits: LineDiffEdit[] = [];
     // Your diffing logic here
     return edits;
   };
   ```

3. Use it when calling `diff()`:

   ```typescript
   import { myCustomDiff } from 'my-custom-diff-package';

   const result = await diff({
     fs,
     dir: '/path/to/repo',
     lineDiffAlgorithm: myCustomDiff,
   });
   ```
