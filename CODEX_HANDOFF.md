# Codex Handoff

Last updated: 2026-04-21

## Project

Local WebGL scene editor on `Three.js` + `Vite`.

Main files:
- `src/main.js`
- `src/styles.css`

## Current Goal

Improve UI/UX without changing core rendering logic unless needed for usability.

## What Was Recently Done

1. Removed unused atlas relief controls:
- `maskByRelief`
- `reliefStrength`

2. Published current state to GitHub:
- repo: `videokarneev/webgl-viewer`
- branch: `main`

3. Began UI restructuring toward:
- `Scene`
- `Viewer`
- `Models`
- `Config`

4. Moved `Selected Model` concept under `Models` via runtime DOM restructuring.

5. Added model transform controls in UI:
- position X/Y/Z
- rotation X/Y/Z

6. Added viewport drag-and-drop handling for:
- model
- config
- HDRI
- atlas

## Important Technical Reality

The UI is being shaped for a future multi-model workflow, but the actual runtime still supports only one active model root:

- `state.modelRoot`
- loading a new model replaces the old one

So `Models` is currently a UI-forward structure, not true multi-model scene management yet.

## Current UI State

There is a mixed approach right now:

- original sidebar markup still exists in the large `app.innerHTML` template
- then `setupSidebarLayout()` rearranges/removes parts of it at runtime

This works, but it is transitional and a bit messy.

## Recommended Next Step

Clean up the sidebar properly in source instead of relying on runtime restructuring:

1. rewrite the `app.innerHTML` sidebar template directly
2. remove old duplicate sections from markup
3. keep only the compact accordion structure
4. keep drag-and-drop on the viewport

## Known UX Direction From User

User wants:
- only the title at the top
- short menu
- main sections as collapsible lists
- `Selected Model` inside `Models`
- `Models` disabled when no model is loaded
- drag and drop directly into scene
- controls for moving and rotating the model
- interface should not be built around atlas

## Notes About Risk

Be careful around:
- large `app.innerHTML` edits in `src/main.js`
- broken selector references after DOM changes
- encoding artifacts with degree symbols

## Validation

Last verified:
- `npx vite build` passes

