# Codex Handoff

Last updated: 2026-05-15

## Project

React + TypeScript + Vite WebGL/GLB viewer/editor.

Core stack:

- React
- Zustand
- Three.js
- `@react-three/fiber`
- `@react-three/drei`
- `@react-three/postprocessing`

Main entrypoints:

- `src/main.tsx`
- `src/app/App.tsx`

Primary source of truth:

- `src/store/editorStore.ts`

## Validation

Passing as of this handoff:

- `npx tsc --noEmit`

Known non-blocker:

- Vite still warns about large chunks, especially `drei`.

## Active App Shell

Current shell order:

1. `<AssetController />`
2. optional `<Sidebar />`
3. `<Viewport />`
4. optional `<Inspector />`

Important runtime detail:

- `App.tsx` keys major app sections by `sceneResetNonce`, so `Reset Scene` hard-remounts runtime-heavy UI and behaves closer to a page refresh.

Main files:

- `src/app/App.tsx`
- `src/components/AssetController.tsx`
- `src/components/Viewport.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Inspector.tsx`

The old `SceneCanvas` / legacy runtime files still exist, but the active path is the shell above.

## Current Big Picture

The app is currently centered around a material-first workflow:

- left panel = scene / camera / light / FX tools
- center = viewport
- right panel = material-only inspector

Most important current systems:

1. multi-GLB scene loading
2. grouped outliner with synchronized special modes
3. material-only inspector with persistent material context
4. interactive runtime preview sphere
5. per-material HDRI overrides
6. per-slot original/custom texture source selection
7. per-material flipbook effect controls
8. lightweight undo/redo for parameter editing

If a future task touches material UX, start in:

- `src/components/Inspector.tsx`
- `src/store/editorStore.ts`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Outliner.tsx`
- `src/styles.css`

## Material Inspector

Main file:

- `src/components/Inspector.tsx`

Current behavior:

- The right dock is `Material Inspector`.
- It is intentionally material-only.
- If the user selects a mesh, the inspector resolves and edits that mesh's material.
- If the user selects a material node directly, the inspector opens that material.
- If no material can be resolved, it shows:
  - `Select a mesh or material to edit its material settings.`
- The inspector should not clear itself just because the user temporarily works with a light, camera, or effect.
- `selectedMaterialId` is treated as persistent context.

Current section order:

1. `Material Summary`
2. `Base Material`
3. `Emission`
4. `Material Effects`

## Per-Material Collapsible Sections

Main file:

- `src/components/Inspector.tsx`

Current behavior:

- `Material Summary`, `Base Material`, and `Emission` have chevron toggles and default to expanded.
- `Material Effects` also has a chevron toggle but defaults to collapsed.
- Collapse state is stored per material in local inspector UI state, not globally.
- If the user collapses a section for one material, switches to another material, and later returns, the previous material keeps its own collapse state.
- New materials start with:
  - `summary` = open
  - `baseMaterial` = open
  - `emission` = open
  - `effects` = closed

## Material Summary

Main file:

- `src/components/Inspector.tsx`

Current behavior:

- The top card is named `Material Summary`.
- It contains:
  - material name
  - `Used by: N mesh(es)`
  - preview sphere
  - texture rows for non-special slots

Important recent changes:

- `Base Color` was removed from `Material Summary`.
- `Emission` was removed from `Material Summary`.
- Other applicable texture rows still appear here.

## Preview Sphere

Main file:

- `src/components/Inspector.tsx`

Current behavior:

- The preview sphere uses a cloned runtime `THREE.Material`, not a synthetic material rebuilt only from store values.
- Preview textures respect per-slot `original` / `custom` selection.
- Heavy preview material reconstruction is separated from lighter parameter updates.

Recent UX upgrade:

- The preview sphere is now mouse-interactive.
- Dragging rotates it.
- Auto-rotation pauses while dragging.
- On release, the sphere smoothly returns toward its default pose/rotation and resumes normal motion.

Helpers worth preserving:

- `resolvePreviewRuntimeMaterial()`
- `cloneMaterialForPreview()`
- `buildPreviewSphereGeometry()`
- `markPreviewTexturesForUpdate()`
- `applyPreviewEnvironment()`
- `applyPreviewMaterialState()`
- `applyPreviewTextureSelections()`

## Texture Source Workflow

Primary files:

- `src/store/editorStore.ts`
- `src/features/scene/buildSceneGraph.ts`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`
- `src/components/Inspector.tsx`

Current model:

- Every editable texture slot tracks:
  - `originalLabel`
  - `customLabel`
  - `selectedSource`
- Store types include:
  - `MaterialTextureSource`
  - `MaterialTextureSlotState`
  - `PbrMaterialState.textureSlots`

Important behavior:

1. GLB textures are registered as `original`.
2. The user may add one `custom` replacement per slot.
3. Active slot source can be `original` or `custom`.
4. Replacing a custom texture overwrites the previous custom texture for that slot.
5. The original GLB texture remains available for return-selection.
6. This is tracked per slot, independently.

## Base Material

Main file:

- `src/components/Inspector.tsx`

Current structure:

1. `Base Color`
2. `Metalness`
3. `Roughness`
4. `Material Environment (HDRI)`
5. HDRI picker row
6. `Env Map Intensity`
7. `Rotation`

Important recent changes:

- `Base Color` was moved out of `Material Summary` into the start of `Base Material`.
- `Base Color` follows the same compact row family as `Emission`.
- Extra framing around the `Base Color` row was removed.
- Spacing under `Base Color` was tuned to match the visual rhythm used in `Emission`.

Base Color rules:

- color swatch remains editable even if there is no base-color texture
- selector shows `No texture` when no map exists
- `Replace` is disabled when no base-color texture exists

## Emission

Main file:

- `src/components/Inspector.tsx`

Current structure:

1. Emissive texture row
2. `Emissive Intensity`

Current rules:

- No duplicated `Emissive` subheading above the row.
- Emissive texture row has no extra outer framed card inside the section.
- If a material has no `emissiveMap` in the original model:
  - selector shows `No texture`
  - `Replace` is disabled
  - emissive color remains editable
- New emissive texture insertion is intentionally not allowed yet when the slot did not originally exist.

## Material HDRI System

Primary files:

- `src/store/editorStore.ts`
- `src/components/Inspector.tsx`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`
- `src/components/viewport/EnvironmentManager.tsx`
- `src/features/scene/runtime/SceneBindings.tsx`

Store shape:

- `PbrMaterialState.environmentOverrideId?: string | null`
- `PbrMaterialState.environmentRotation?: number`
- `materialEnvironments: Record<string, MaterialEnvironmentAssetState>`
- `runtimeTextures.materialEnvironmentMaps: Record<string, THREE.Texture>`

Runtime material behavior:

1. If a material has `environmentOverrideId`, it uses that override texture.
2. If it has no override and scene HDRI is active, it uses scene HDRI.
3. If neither exists, it must explicitly get `material.envMap = null`.

That explicit nulling remains critical.

## Material Effects

Main files:

- `src/components/Inspector.tsx`
- `src/store/editorStore.ts`
- `src/features/atlas/useAtlasAnimator.ts`

Current effect model:

- `Material Effects` is inside the material inspector.
- Effects now have separate concepts for:
  - `isAdded`
  - `enabled`
- `isAdded` controls whether the effect exists in the material's effect list/UI.
- `enabled` is the visibility/on-off state and is controlled by the eye icon in the list.

Current section layout:

1. effect create buttons row
2. dynamic effect list
3. active effect title
4. active effect controls

Important UI details:

- The create buttons row is above the list and should stay there.
- The create button area currently has one effect button:
  - button glyph text = `FLIPBOOK`
  - button caption = `Create` or `Added`
- All effect create buttons should use the shared `.effect-create-button` sizing/design pattern.
- The list has extra horizontal divider lines.
- When no effect is added, the list still shows a single empty placeholder row.
- Added effect rows include:
  - eye toggle
  - trash remove
- The active effect title under the list is `Flipbook Animation`.
- That title uses the same label family as `BACKGROUND` via `left-controls__label`.

Naming convention now in use:

- Full effect name: `Flipbook Animation`
- Short button label: `FLIPBOOK`

## Flipbook Animation

Main files:

- `src/components/Inspector.tsx`
- `src/store/editorStore.ts`
- `src/features/atlas/useAtlasAnimator.ts`

This effect used to be the older atlas/anim block. It has since been reworked heavily.

Current top controls:

- atlas texture field on the left
- compact square `ATLAS LOAD` / swap button in the middle
- `Target Slot` compact select on the right
- `Opacity` directly under that row
- atlas preview canvas directly under `Opacity`

Important recent behavior:

- `Opacity` now also affects the atlas preview image itself, not only the material in scene.
- The preview canvas applies `ctx.globalAlpha = effect.opacity`.

Current setup row under preview:

- `Column`
- `Row`
- `Frame Order`
- `FPS`

Current rules:

- `Grid X` was renamed to `Column`.
- `Grid Y` was renamed to `Row`.
- Column/Row no longer use sliders.
- Column/Row/FPS are numeric fields only.
- `Frame Order` was moved out of `Advanced` into this compact row.
- `Current Frame` is again a separate full-width row with slider + displayed value only.

Playback row:

- `Play` is an icon button styled from the same `tool-button` family as the top app buttons.
- `Frame Blend` and `Loop` sit in the same lightweight row without extra background boxes.

Advanced:

- `Opacity` is no longer here.
- `Frame Order` is no longer here.
- The old `CLR / Remove Atlas Texture` button was removed.

Defaults in `DEFAULT_ATLAS_EFFECT`:

- `isAdded: false`
- `enabled: true`
- `frameOrder: 'column'`
- `fps: 12`
- `play: false`
- `loop: true`

Important behavioral rules:

- Loading an atlas texture should not auto-start playback.
- Users are expected to configure the effect first, then press play.
- Frame order should default to `column`.

Implementation nuance:

- `frameCount` still exists in state for compatibility, but the active UI no longer exposes it.
- Playback and preview clamping now use `gridX * gridY`.
- `clampEffect()` forces `frameCount` to full grid size and clamps `currentFrame` to that range.

## Shared Effect Create Buttons

Primary files:

- `src/components/Inspector.tsx`
- `src/components/Sidebar.tsx`
- `src/components/TabbedSettingsPanel.tsx`
- `src/styles.css`

Current rule:

- Effect create buttons should use the shared `.effect-create-button` class.

Known current usage:

- `FLIPBOOK Create` in `Material Effects`
- `BLOOM Create` in FX blocks

Important sizing note:

- This class was explicitly tuned to match the width family of the top-left `GLB / LOAD / SAVE / RST` buttons.
- Do not reintroduce custom one-off widths for individual effect buttons unless deliberately redesigning the whole pattern.

## Global Environment / Lighting Selection

Main file:

- `src/components/Sidebar.tsx`

Current behavior:

- selecting environment system node -> `LGT`
- selecting ambient system light -> `LGT`
- selecting any extra light -> `LGT`
- selecting camera -> `CAM`
- selecting effect -> `FX`

Current `LGT > Environment (HDRI)` UI:

- read-only current `Scene HDRI (...)` display
- `Load HDRI`
- `Intensity`
- `Rotation`

Important design decision:

- Scene HDRI is treated as a single global slot, not a reusable dropdown library like per-material HDRIs.

## Outliner / Sidebar Sync

Main files:

- `src/components/Outliner.tsx`
- `src/components/Sidebar.tsx`

Current behavior:

- `Sidebar` owns `outlinerViewMode`.
- `Outliner` can run in controlled mode via:
  - `viewMode`
  - `onViewModeChange`

Special mode sync:

- clicking sidebar tab `LGT` switches outliner to `lights`
- clicking sidebar tab `FX` switches outliner to `effects`
- clicking `lights` inside outliner switches sidebar to `LGT`
- clicking `effects` inside outliner switches sidebar to `FX`

Important implementation note:

- This was intentionally rewritten as direct event-driven sync, not a reactive `useEffect` loop.

Auto-selection rule in special modes:

- When entering `lights` or `effects`, the first row should auto-select if there is no valid current selection for that mode.
- Once the user has clicked a mesh/material again, the outliner should not keep stealing selection back.
- `previousViewModeRef` in `Outliner.tsx` is part of this fix.

## Outliner

Main file:

- `src/components/Outliner.tsx`

Current behavior:

- Each loaded GLB appears as its own root row.
- In `layers`, `meshes`, and `materials` modes, each root can be collapsed independently.
- Collapse state is tracked per mode through `collapsedRootsByMode`.
- Root GLB rows have:
  - selection
  - visibility eye
  - delete trash
- `lights` and `effects` remain flat lists.

Environment-specific watchout:

- hiding or deleting scene HDRI in the outliner must not leave stale reflections on materials using scene HDRI

## Scene HDRI Removal / Hide Semantics

Main files:

- `src/features/scene/runtime/LoadedSceneRoot.tsx`
- `src/components/Inspector.tsx`
- `src/store/editorStore.ts`

Correct behavior:

- If scene HDRI is hidden or removed, materials using scene HDRI must not keep the old env map.
- They must either:
  - switch to a valid custom material HDRI, or
  - become `envMap = null`

If reflections survive deletion, inspect this area first.

## Camera / Auto-Fit

Main files:

- `src/components/Viewport.tsx`
- `src/features/scene/runtime/shared.ts`
- `src/store/editorStore.ts`

Current behavior:

- Default focal length is `20mm`.
- Auto-fit happens on the real viewport camera and live controls.
- `fitCameraToObject()` uses filtered useful geometry.
- `RESET CAMERA` returns to the latest computed framed position/target.

Important nuance:

- Auto-frame still targets the current primary root (`rootNodeId`), meaning the most recently loaded model.

## Transform Defaults

Main file:

- `src/store/editorStore.ts`

Current behavior:

- Default `Rotate` step is now `15` degrees.
- `Reset Scene` should also restore `rotationStep: 15`.

Related files:

- `src/components/TransformToolbar.tsx`
- `src/components/viewport/TransformTable.tsx`
- `src/components/Viewport.tsx`

## Flight Controls

Main file:

- `src/components/viewport/FlightController.tsx`

Current behavior:

- `W/A/S/D` = horizontal movement
- `Space` = up
- `Left Ctrl` = down
- `Shift` = speed boost
- `Q` / `E` no longer drive vertical motion

## Undo / Redo

Primary files:

- `src/store/editorStore.ts`
- `src/app/App.tsx`
- `src/components/Viewport.tsx`
- `src/components/viewport/TransformTable.tsx`

Current scope:

- simple parameter-editing undo/redo only
- explicitly not intended yet for full asset lifecycle / structural scene editing

Included in history:

- object transforms
- material params
- material flipbook/effect params
- environment/light/background params
- viewer params
- transform settings
- extra light params

Excluded or intentionally limited:

- asset loading/unloading
- root scene deletion/addition
- runtime-only preview flags
- high-frequency camera sync noise

Important implementation detail:

- history is gesture-grouped
- one slider drag = one undo step
- one gizmo drag = one undo step
- coordinate spinners and decimal text fields are also grouped into single undo gestures

## Reset Scene Semantics

Main files:

- `src/store/editorStore.ts`
- `src/app/App.tsx`
- `src/components/AssetController.tsx`

Important current behavior:

- `Reset Scene` does more than wipe store values.
- `App.tsx` keys major app sections by `sceneResetNonce`, forcing hard remount of:
  - `AssetController`
  - `Sidebar`
  - `Viewport`
  - `Inspector`
  - history overlay

Why it matters:

- this clears local component state, refs, open menus, and runtime controller state that previously survived reset
- behavior is now closer to reloading the page

## Multi-GLB Scene Support

Main files:

- `src/store/editorStore.ts`
- `src/components/AssetController.tsx`
- `src/components/Viewport.tsx`
- `src/components/Outliner.tsx`

Current behavior:

- Multiple GLBs can coexist in one scene.
- Loading a new GLB does not replace previous ones.
- Store tracks:
  - `rootNodeId`
  - `rootNodeIds`
  - `loadedModels`
- Viewport renders all loaded roots.
- Outliner groups by GLB root.

Current limitation:

- file dialog loading is still effectively single-request based
- no real queue-based batch import system yet

## Asset Loading / Runtime Registration

Main files:

- `src/components/AssetController.tsx`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`

Current behavior:

- Runtime roots are tracked in `AssetController`.
- Runtime object/material refs are also registered from `LoadedSceneRoot`.
- Async model loads still use request nonce logic to ignore stale results.

Important nuance:

- Runtime registration ownership is still split across files.

## Runtime Stability Note

Very important rule:

- Do not put unstable array/object creation directly inside hot `useEditorStore(...)` selectors in viewport-heavy components unless using a stable equality strategy.

Earlier, `Viewport.tsx` crashed because selectors were constructing fresh arrays each render.

## Important Files Right Now

If another model needs fast context, show these first:

- `CODEX_HANDOFF.md`
- `src/store/editorStore.ts`
- `src/app/App.tsx`
- `src/components/Inspector.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Outliner.tsx`
- `src/components/Viewport.tsx`
- `src/components/TabbedSettingsPanel.tsx`
- `src/components/viewport/FlightController.tsx`
- `src/components/viewport/EnvironmentManager.tsx`
- `src/components/AssetController.tsx`
- `src/features/atlas/useAtlasAnimator.ts`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`
- `src/features/scene/runtime/SceneBindings.tsx`
- `src/features/scene/buildSceneGraph.ts`
- `src/styles.css`

## Known Watchouts

Sensitive zones right now:

1. `src/store/editorStore.ts`
   - undo/redo history
   - gesture batching
   - reset cleanup
   - selection persistence
   - per-slot texture source state
   - `DEFAULT_ATLAS_EFFECT`
   - `clampEffect()`
2. `src/components/Inspector.tsx`
   - runtime material resolution
   - preview sphere lifecycle and drag interaction
   - per-material collapse state
   - moved texture rows (`Base Color`, `Emissive`)
   - flipbook effect UI layout
   - atlas preview canvas behavior
3. `src/features/atlas/useAtlasAnimator.ts`
   - full-grid frame stepping
   - play/pause behavior
   - frame blending
4. `src/components/Outliner.tsx`
   - controlled mode sync
   - first-row auto-selection in `lights` / `effects`
   - selection preservation after returning to meshes/materials
5. `src/components/Sidebar.tsx`
   - `LGT` / `FX` tab sync with outliner
   - environment controls
   - shared effect create button use
6. `src/features/scene/runtime/LoadedSceneRoot.tsx`
   - original/custom texture source application
   - explicit `envMap = null`
7. `src/components/Viewport.tsx`
   - transform gizmo gesture batching
   - selector stability
   - transform rotate-step usage

## Legacy / Secondary Files

Still present but not the main active path:

- `src/components/SceneCanvas.tsx`
- `src/features/scene/runtime/AssetController.tsx`
- `src/features/scene/runtime/ConfigController.tsx`
- `src/features/scene/runtime/SceneBindings.tsx`
- `src/features/scene/runtime/TransformGizmo.tsx`

If something looks duplicated, first confirm whether it belongs to the active app path or an older runtime path.

## Dirty Workspace Note

Assume the workspace may be dirty.

Do not blindly revert unrelated user changes.

If editing files around inspector/material/effects/outliner flow, read them carefully first because this branch has moved quickly in those zones.
