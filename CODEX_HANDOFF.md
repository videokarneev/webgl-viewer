# Codex Handoff

Last updated: 2026-04-25

## Project

React + TypeScript + Vite refactor of the legacy `Three.js` configurator.

Core stack:

- React
- React Three Fiber
- Drei
- Zustand
- Three.js
- `@react-three/postprocessing`

Entry point:

- `src/main.tsx`

Legacy reference:

- `src/main.js`

## Validation

Passing now:

- `npx tsc --noEmit`
- `npx vite build`

Known non-blocker:

- Vite large chunk warning still remains

Latest pushed baseline:

- `ed87401 Checkpoint current editor version`

There are many local unpushed changes after that commit.

## Current UI Shape

The app is a 3-column editor:

1. Left panel:
   - title/header
   - sticky `ProjectToolbar`
   - `OUTLINER`
   - `SCENE`, `CAMERA`, `EFFECTS`
2. Center:
   - R3F viewport
   - floating viewport HUD
   - floating performance HUD
   - fullscreen button
3. Right panel:
   - contextual inspector

Keep the editor-style UI. Do not regress toward a minimal hidden-controls layout.

## Key Files

- `src/components/SceneManager.tsx`
- `src/components/SceneCanvas.tsx`
- `src/components/ViewportHud.tsx`
- `src/components/Inspector.tsx`
- `src/store/editorStore.ts`
- `src/features/scene/runtime/AssetController.tsx`
- `src/features/scene/runtime/SceneBindings.tsx`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`
- `src/features/scene/runtime/ConfigController.tsx`
- `src/features/config/buildSceneConfig.ts`
- `src/styles.css`

## Left Panel

Main file:

- `src/components/SceneManager.tsx`

Current order:

1. `.left-panel__title`
2. sticky `ProjectToolbar`
3. `OUTLINER`
4. `settings-container`

Removed already:

- old `Scene Tool` line
- old `ASSETS` block
- `import-export-footer`
- `panel-footer`

### ProjectToolbar

Buttons are now:

- `GLB`
- `LGT`
- `LOAD`
- `SAVE`
- `RST`

Notes:

- `RST` is separated slightly by left margin
- toolbar is sticky and sits directly under the title
- buttons were compacted to stay on one row

Reset confirmation:

- local state: `isResetConfirming`
- first click sets it to `true`
- button glyph changes to `SURE?`
- button class becomes `is-reset-confirming`
- second click calls `requestSceneReset()`
- auto-reset after 3 seconds
- also resets on `scene-pointer-missed`

Important CSS:

- `.tool-button.is-reset-confirming`
- `.tool-button.is-reset-confirming:hover`
- `.tool-button.is-reset-confirming:focus`
- `.tool-button.is-reset-confirming:active`

These force immediate dark-red confirmation styling.

## Outliner

### Structure

- `OUTLINER` is a dedicated section above the settings accordions
- it has its own scroll
- search and outliner mode filters live at the top

### Search

State:

- `searchQuery`

UX:

- search input is inside `.search-container`
- clear button `search-clear` appears only when text exists
- filter icons stay outside the search input, on the right

Important styling:

- input uses class `search-input`
- `padding-right: 32px !important`
- clear button is positioned inside the field

### Outliner Modes

State:

- `outlinerMode: 'all' | 'meshes' | 'materials'`

Default:

- `'meshes'`

Behavior:

- `meshes`
  - shows mesh rows
  - materials are hidden unless manually expanded with chevron
- `all`
  - shows mesh rows
  - materials under meshes are auto-expanded
- `materials`
  - shows a flat materials list only
  - mesh rows are hidden

### TreeNode rules

- nodes with `label === 'Material'` are pass-through wrappers only
- they must not render their own row
- mesh rows can show a chevron before the cube icon
- chevron appears only if the mesh has child materials
- nested materials render only as:
  - circle icon + material name

### Selection Sync

Implemented:

- automatic scroll to the highlighted outliner row when `selectedObjectId` changes
- uses `data-outliner-node-id`
- uses `scrollIntoView({ block: 'nearest' })`

Highlight logic:

- in `all` and `meshes`, selecting a mesh highlights the mesh row
- in `materials`, selecting a mesh highlights its first material row
- selecting a material in non-material modes highlights its parent mesh row

CSS:

- `.tree-node.is-selected` uses blue-tinted background plus a bright left inset stripe

## SCENE Section

Main file:

- `src/components/SceneManager.tsx`

The `SCENE` accordion now has class:

- `scene-panel`

Its tab content lives in:

- `.scene-panel__content`

Current SCENE tabs:

- `REFLECTIONS`
- `BACKGROUND`

### SCENE layout behavior

- `scene-panel__content` has fixed height `180px`
- `overflow-y: auto`
- `overflow-x: hidden`
- `BACKGROUND` scrolls internally if needed
- `REFLECTIONS` fits without growing the section

Scrollbar styling:

- thin
- subtle
- should not visually dominate the left column

### Reflections row

Current row structure:

- compact `HDR` button
- filename field
- inline `✕` clear button inside the filename field

Removed:

- standalone `CLR` button

Clear behavior:

- clears reflections asset
- resets:
  - `environment.rotation = 0`
  - `environment.intensity = 1`
- reverts to fallback environment lighting state

### Background row

Current row structure:

- compact `360` button
- filename field
- inline `✕` clear button

Removed:

- standalone `CLR` button

Clear behavior:

- clears background asset
- resets:
  - `environment.backgroundRotation = 0`
  - `environment.backgroundIntensity = 1`
- also sets `background = 'none'`
- `backgroundVisible = false`

### Background modes

Current modes:

- `none`
- `color`
- `environment`
- `reflections`

There is still an inline color swatch when mode is `color`.

## CAMERA Section

Key state lives in:

- `viewer` in `src/store/editorStore.ts`

Important current values:

- `viewer.focalLength`
- `viewer.exposure`
- `viewer.flightSpeed`
- DoF controls

### Focal Length

Current slider:

- `min=1`
- `max=150`

Preset buttons were removed.

Magnet behavior:

- presets: `8, 12, 17, 35, 50, 85`
- if slider value is within `±2`, it snaps to preset
- snapped value briefly highlights
- optional `navigator.vibrate(12)` feedback is used when available

Ticks:

- thin visual ticks are rendered under the slider

### Flight Speed

Store:

- `viewer.flightSpeed: number`
- default `5`

HUD:

- speed row `1..9` appears only in first-person mode
- active value gets `is-active`

Keyboard:

- `Digit1` through `Digit9` update speed

Current formula in `SceneCanvas.tsx`:

- `const speedMultiplier = Math.pow(1.7783, flightSpeed - 5)`
- `const moveSpeed = 10 * speedMultiplier * delta`

Target behavior:

- `1` is about `1.0`
- `5` is `10.0`
- `9` is about `100.0`

Important:

- do not reintroduce speed-based FOV changes
- FOV should stay fixed

## Viewport / SceneCanvas

Main file:

- `src/components/SceneCanvas.tsx`

### Fullscreen

Fullscreen button exists in the viewport shell.

Behavior:

- toggles fullscreen on `document.documentElement`
- tracks actual fullscreen state via `fullscreenchange`
- applies `.is-active` when fullscreen is real

Styling:

- anchored near the left edge of Inspector
- uses focus-corner SVG icon

### Transform Manipulation

Important recent cleanup:

- `TransformGizmo` was removed from `SceneCanvas.tsx`
- scene objects should not be draggable/manipulable with mouse gizmos anymore
- raycasting selection remains

### Pointer Missed

Canvas `onPointerMissed`:

- emits `scene-pointer-missed`
- clears selection for low-delta clicks

This is used by reset confirmation cleanup too.

## Inspector

Main file:

- `src/components/Inspector.tsx`

Recent cleanup:

- the old `TRANSFORM` block was removed
- transform editing UI for position/rotation/scale was removed
- related transform editing helpers were removed from inspector flow

Current inspector behavior:

- selected light shows light controls
- selected mesh/material shows material-related sections

## Performance HUD

Main file:

- `src/components/SceneCanvas.tsx`

Current metrics shown:

- `VERTICES`
- `TRIANGLES`
- `VRAM TEXTURES`
- `DISK`
- `DRAW CALLS`
- `FPS`

Important calculation changes:

- `DRAW CALLS` now uses mesh count from traversing root, not `gl.info.render.calls`
- texture dedupe uses `texture.image ?? texture.source ?? texture.uuid`
- VRAM estimate adds geometry approximation:
  - `(stats.totalVertices * 44) / (1024 * 1024)`
- disk size comes from `assets.fileSize`
- disk size is shown in decimal MB:
  - `(size / 1000 / 1000).toFixed(2)`

## Store Notes

Main file:

- `src/store/editorStore.ts`

Important fields already present:

- `viewer.flightSpeed`
- `AssetSourceState.fileSize`
- `AssetRequest.fileSize`

Note:

- `flightSpeed` is currently not called out as serialized config state
- `fileSize` is runtime/editor metadata for HUD, not a scene rendering parameter

## Serialization Notes

Config import/export is handled through:

- `src/features/config/buildSceneConfig.ts`
- `src/features/scene/runtime/ConfigController.tsx`

Useful reminder:

- many editor-only UI states are still not serialized
- outliner mode/search are UI-only
- `fileSize` is UI/runtime-only

Double-check before adding more viewer/environment serialization because this area has already drifted from older handoffs.

## Current CSS Structure To Remember

Main file:

- `src/styles.css`

Important current layout pieces:

- `.left-panel`
- `.project-toolbar`
- `.outliner-panel`
- `.settings-container`
- `.scene-panel`
- `.scene-panel__content`
- `.viewport-hud`
- `.fullscreen-button`
- `.tree-node.is-selected`
- `.search-clear`

## Known Risks / Watchouts

1. `CODEX_HANDOFF.md` had drifted before this rewrite, so if behavior and docs diverge again, trust the code first.
2. There are still many local modified files in the worktree.
3. Bundle size warning still exists.
4. Background/reflection clear logic is compact now; if environment state changes again, re-test those defaults.
5. The SCENE panel height is now controlled by `.scene-panel__content`; avoid reintroducing dynamic height jumps there.

## Good First Checks If Something Breaks

1. `src/components/SceneManager.tsx`
2. `src/components/SceneCanvas.tsx`
3. `src/components/Inspector.tsx`
4. `src/store/editorStore.ts`
5. `src/styles.css`

## Recommended Next Steps

1. If desired, serialize `viewer.flightSpeed` explicitly in config.
2. Decide whether the fullscreen button should change position on responsive breakpoints more aggressively.
3. Consider further bundle splitting to address the Vite warning.
4. If more environment UI is added, keep `SCENE` tab content inside the fixed-height scroll area rather than growing the whole accordion.
