# 0001. Code comments are banned; their jobs moved to docs, test names, commits and instruction files

Status: accepted
Date: 2026-09-26

## Context

POLAR-1141 (port of platform ADR 0014 / POLAR-1106): files this repo authors carry no code
comments. Comments are unchecked prose: nothing parses them, nothing tests them, and they
rot on the exact lines that change most. The seeded baseline records 1,908 comments across
99 of the linted source files. Every job a comment does has a home that is checked: a
reason belongs in an ADR or the PR body, an edge case belongs in a test name, history
belongs in commits and Linear, and agent guidance belongs in AGENTS.md. Code that cannot
carry a comment has to be written so it does not need one.

## Decision

- `polarity/no-comments` (`scripts/eslint-plugin-polarity.mjs`) reports every entry of
  `sourceCode.getAllComments()`: line, block, JSDoc and `eslint-*` directive comments
  alike, one count each. A `#!` shebang parses as a `Shebang` comment token but is a file
  directive, not a comment, and is the only exemption.
- `scripts/ci/comments.mjs` counts comments through real parsers, never regex over source
  text: ESLint (espree for JS/JSX, typescript-eslint for TS/MTS/CTS) for
  `*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}`, postcss for `*.css`, and parse5 for `*.html`. HTML
  files are counted recursively: parse5 comment nodes (including `<template>` content
  fragments), the bodies of `<script>` elements whose type is a JavaScript MIME essence
  (parameters like `;charset=` stripped) fed back through ESLint, `<style>` bodies and
  `style=` attributes through postcss, and `on*=` event-handler attributes through
  ESLint, so a comment cannot hide inside an inline block. Non-JS script types
  (`application/json` and kin) are data and are not parsed, and so are `data-*` and other
  non-code attributes. A file that does not parse
  fails the gate closed instead of reading as zero (parse5 error-corrects the markup
  itself, so it has no fatal path). The ESLint pass runs with
  `linterOptions.noInlineConfig`, so an `eslint-disable` comment cannot launder a count
  and counts as a comment while it tries.
- The rule is `error` in `eslint.config.mjs` for every authored JS/TS file, less the
  config's ignores (node_modules, `dist`, `build`, `build-rel`, `.next`, `coverage`,
  caches and generated snapshot/parity output), which is what the ratchet mirrors.
  `scripts/ci/comments.baseline.json` (path -> comment count, written by
  `node scripts/ci/comments.mjs --init`) grandfathers the seeded corpus: a count may fall
  or hold, never rise, and a file that reaches zero drops out and stays out. Baseline keys
  for JS/TS feed an `off` override in the config so grandfathered files stay lint-clean
  while they burn down; a new file fails `npm run lint` on its first comment.
- `npm run check` runs typecheck, the comments ratchet and the node:test suite; the
  pre-push hook in `.githooks/` runs it (`git config core.hooksPath .githooks`).
- What a comment used to carry has a new home, and the rule's message says it: reasons go
  in ADRs or the PR body, edge cases in test names, history in commits and Linear, agent
  guidance in AGENTS.md.
- Out of scope: Swift, shell, Python and other languages the repo carries but the card did
  not name; stripping the seeded corpus is later work, not this PR's.

## Consequences

- Baseline at seeding: 1,904 comments in 99 files, each able only to shrink. The totals
  are the burn-down meter; `--update` in the same PR records every removal.
- "Why does this code exist" moves to `git log -S`, the PR body, or an ADR. Reviewers ask
  for a paragraph there instead of a comment in the file.
- Revisit when the baseline is empty: the `off` override and the ratchet then retire and
  the lint error stands alone.
