# Clayton Clipper Leash Log (omc5-admin)

The admin app for the Clayton Clipper site (molund/omc5): a React Native editor for its `status.yaml`. See `README.md`.

## Commits and changes

- One change, one commit, pushed straight to `main`. Don't batch several requested changes into one commit.
- Make small, exact edits. Change nothing that wasn't asked for, and mention other issues instead of fixing them.

## Formatting

- Format every changed file with Prettier before committing (`npx prettier --write <file>`, or `npm run format` for everything).
  The options, including the 120-character width, are in `.prettierrc`. `npm run format:check` must pass.
- `test/fixtures/` holds verbatim copies of files from molund/omc5 and is never formatted (see `.prettierignore`).

## Artifacts

- When listing artifacts, list only the Leash Log (`artifactUrl` in `desk.config.json`). Leave the others out.

## Styling

- Everything is styled with twrnc through `useTw()` (`src/theme/tw.js`), so the colours follow the light or dark theme. No
  `StyleSheet.create`: it can't follow the theme.
- Existing components keep their styling; new work follows the rules below. Don't rewrite existing components to match:
  apply them only to new components and to the elements a change actually touches (boy scout rule).
- Inline `tw` is for layout only: at most 4 utilities, and only positioning and layout (`flex-1`, `flex-row`,
  `items-center`, `gap-2`, `mt-3`, `w-full`).
- A look used in more than one place is a component in `src/components/ui.js` (`Panel`, `Button`, `Body`, `Notice`, …). Use
  those before writing a new one.
- Anything else visual (colours, type, padding, borders, radii, backgrounds) goes in a style map at the top of the
  component's file under a semantic name, built from the themed `tw` and used as `style={s.cardHeader}`:
  ``const looks = (tw) => ({ cardHeader: tw`text-sm font-semibold text-ink` })``, then
  `const s = useMemo(() => looks(tw), [tw])`.
- Colours are the theme's names from `tw.js` (`text-ink`, `bg-panel`). A colour that isn't the theme's (the card's mirror
  of the site's, an icon's art) is a named constant with a comment saying where it comes from.
