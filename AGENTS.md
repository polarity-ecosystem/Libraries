# Libraries

React libraries (`packages/`) and the sites that demo them (`sites/`). npm workspaces:
one `npm install` at the root covers everything.

## Checks

`npm run check` must pass before every push: typecheck, the comments ratchet and the
node:test suite. Install the hook once: `git config core.hooksPath .githooks`.

## No code comments

Files this repo authors carry no code comments (`docs/adr/0001-comments-ban.md`). A new
comment in authored JS/TS/CSS/HTML fails `npm run check`; grandfathered per-file counts
live in `scripts/ci/comments.baseline.json` and may only shrink
(`node scripts/ci/comments.mjs --update`). What a comment used to carry has a new home:
reasons go in ADRs or the PR body, edge cases in test names, history in commits and
Linear, agent guidance in this file.
