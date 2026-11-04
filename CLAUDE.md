# Clipper Status Desk (omc5-admin)

The admin app for the Clayton Clipper site (molund/omc5): a React Native editor for its `status.yaml`. See `README.md`.

## Commits and changes

- One change, one commit, pushed straight to `main`. Don't batch several requested changes into one commit.
- Make small, exact edits. Change nothing that wasn't asked for, and mention other issues instead of fixing them.

## Formatting

- Format every changed file with Prettier before committing (`npx prettier --write <file>`, or `npm run format` for everything).
  The options, including the 120-character width, are in `.prettierrc`. `npm run format:check` must pass.
- `test/fixtures/` holds verbatim copies of files from molund/omc5 and is never formatted (see `.prettierignore`).
