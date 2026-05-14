# Codex Handoff

Last updated: 2026-05-14

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

Important recent detail:

- `App.tsx` keys major app sections by `sceneResetNonce`, so `Reset Scene` hard-remounts runtime-heavy UI and behaves closer to a page refresh.

Main files:

- `src/app/App.tsx`
- `src/components/AssetController.tsx`
- `src/components/Viewport.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Inspector.tsx`

The old `SceneCanvas` / legacy runtime files still exist, but the active path is the shell above.

## Current Big Picture

The app is centered around a material-editing workflow:

- left panel = scene / camera / light / FX controls
- center = viewport
- right panel = material-only inspector

Most important current systems:

1. multi-GLB scene loading
2. grouped outliner
3. material-only inspector
4. runtime material preview sphere
5. per-material HDRI overrides
6. per-slot original/custom texture source selection
7. atlas effect controls on materials
8. lightweight undo/redo for parameter editing

If a future task touches material UX, start in:

- `src/components/Inspector.tsx`
- `src/store/editorStore.ts`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`
- `src/features/scene/buildSceneGraph.ts`
- `src/components/viewport/EnvironmentManager.tsx`

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
- The dock title styling was aligned with the `Outliner` header style.

Current section order:

1. `Material Summary`
2. `Base Material`
3. `Emission`
4. `Material Effects`

Important UX rule:

- The inspector should not clear itself just because the user temporarily works with a light, camera, or effect.
- `selectedMaterialId` is treated as persistent context.

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

Important nuance:

- The inspector container uses `align-content: start` so collapsed cards keep compact height and do not stretch vertically.

## Material Summary

Main file:

- `src/components/Inspector.tsx`

Current behavior:

- The top card is named `Material Summary`.
- It uses the same section header/body pattern as the other inspector sections.
- It contains:
  - material name
  - `Used by: N mesh(es)`
  - preview sphere
  - texture rows shown under the preview

## Preview Sphere

Main file:

- `src/components/Inspector.tsx`

Current behavior:

- The preview sphere uses a cloned runtime `THREE.Material`, not a synthetic material rebuilt only from store values.
- Preview textures respect per-slot `original` / `custom` selection.
- `cloneMaterialForPreview()` explicitly copies `originalTextureSlots` and `customTextureSlots`.
- Preview texture selection also reads directly from the source runtime material so `Original` fallback does not get lost.
- Heavy preview material reconstruction is separated from lighter parameter updates:
  - texture/source changes trigger a heavier rebuild
  - common sliders like `metalness`, `roughness`, `emissiveIntensity`, etc. update the existing preview material in place

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

Important publish-oriented rule already established in UX:

- The future publish/export path should include only the actually selected texture source per slot.
- Non-selected custom replacements should not be shipped.

## Texture Rows Under Preview

Main file:

- `src/components/Inspector.tsx`

Current behavior:

- `Base Color` always appears.
- If a material has no base-color texture:
  - the row still appears
  - color swatch remains editable
  - selector shows `No texture`
  - `Replace` is disabled
- Non-base slots appear only when they actually exist, except for special moved controls like `Emissive`.

Current placement:

- `Base Color`, `Normal`, `Roughness`, `Metalness`, `AO`, etc. stay under `Material Summary`
- `Emissive` texture row was moved out of the summary block and into the `Emission` section

## Base Color / Emissive Row Pattern

Main file:

- `src/components/Inspector.tsx`

Current UI pattern:

- color swatch
- texture source selector with filename
- `Replace`

Current rules:

- `Base Color` color swatch remains active even when there is no base-color texture.
- `Emissive` row follows the same visual pattern as `Base Color`.
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

Store actions:

- `upsertMaterialEnvironment(entry, texture)`
- `removeMaterialEnvironment(id)`

Runtime material behavior:

1. If a material has `environmentOverrideId`, it uses that override texture.
2. If it has no override and scene HDRI is active, it uses scene HDRI.
3. If neither exists, it must explicitly get `material.envMap = null`.

That explicit nulling remains critical.

## Base Material Block

Main file:

- `src/components/Inspector.tsx`

Current structure:

1. `Metalness`
2. `Roughness`
3. `Material Environment (HDRI)`
4. HDRI picker row
5. `Env Map Intensity`
6. `Rotation`

Important recent change:

- The old separate `Environment Map` section was merged into `Base Material`.
- `Metalness` and `Roughness` are now separate full-width rows, not a side-by-side pair.
- Material HDRI spacing was tuned to match the global HDRI block more closely.

Recent wording choice:

- Material-local HDRI label is now `Material Environment (HDRI)` to distinguish it from global `Environment (HDRI)`.

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

## Slider Styling

Primary files:

- `src/styles.css`
- `src/components/Inspector.tsx`
- `src/components/Sidebar.tsx`

Current behavior:

- Range sliders are visually unified across the app.
- Current slider style goals:
  - thinner track
  - smaller thumb
  - compact spacing
  - value aligned right on the same row as the label
- Global CSS also strips text-input-like background/border/padding from range controls so sliders do not inherit field chrome.

Important nuance:

- There are still two markup families:
  - `.left-slider`
  - `.field` with range input
- They are visually aligned through CSS rather than fully merged into one React abstraction.

Watchout:

- `Sidebar.tsx` has a clean `formatDegrees()` using `${value.toFixed(0)}°`.
- `Inspector.tsx` may still contain an encoding-damaged degree string in source from earlier edits.
- If degree labels look wrong again, inspect `formatDegrees()` in both files first.

## Emission

Main file:

- `src/components/Inspector.tsx`

Current structure:

1. Emissive texture row
2. `Emissive Intensity`

Current rules:

- No duplicated `Emissive` subheading above the row.
- Emissive texture row has no extra outer framed card inside the section.
- Spacing under the emissive texture row was manually tuned to match the material HDRI block rhythm.

## Atlas Effect Workflow

Main files:

- `src/components/Inspector.tsx`
- `src/store/editorStore.ts`

Current behavior:

- Atlas is part of the material inspector.
- `Material Effects` contains:
  - `Add Effect`
  - `Atlas`
- Visible v1 controls:
  - Enabled
  - Target Slot
  - Load Atlas Texture
  - Grid X
  - Grid Y
  - Frame Count
  - FPS
  - Current Frame
  - Play
  - Loop
- Advanced section holds the rest.

## Material Selection Persistence

Important invariant:

- Switching to lights / FX / other non-material work should not wipe material inspector context.

How it works:

- `setSelectedObjectId()` in `src/store/editorStore.ts` preserves `selectedMaterialId` when the new object does not resolve to a material.
- `Inspector` and `InspectorContent` in `src/components/Inspector.tsx` fall back to the last valid material.

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

Lights / FX:

- `lights` and `effects` modes remain flat lists.

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
- material atlas/effect params
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

## Performance Stats Overlay

Main files:

- `src/components/Viewport.tsx`
- `src/store/editorStore.ts`
- `src/styles.css`

Current behavior:

- The custom stats text overlay can be hidden/shown by a small chevron button beside it.
- HUD state field:
  - `hud.performanceStatsVisible`
- The chevron remains visible even when the stats block is hidden.

## Reset Scene Semantics

Main files:

- `src/store/editorStore.ts`
- `src/app/App.tsx`
- `src/components/AssetController.tsx`

Important recent change:

- `Reset Scene` now does more than wipe store values.
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
- `src/components/viewport/FlightController.tsx`
- `src/components/viewport/EnvironmentManager.tsx`
- `src/components/AssetController.tsx`
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
2. `src/components/Inspector.tsx`
   - runtime material resolution
   - preview sphere lifecycle
   - per-material collapse state
   - moved texture rows (`Base Color`, `Emissive`)
   - custom HDRI dropdown logic
   - degree-format helper
3. `src/features/scene/runtime/LoadedSceneRoot.tsx`
   - original/custom texture source application
   - explicit `envMap = null`
4. `src/components/Sidebar.tsx`
   - `LGT` environment controls
   - global `Intensity` / `Rotation` order
   - degree-format helper
5. `src/components/Viewport.tsx`
   - transform gizmo gesture batching
   - selector stability
   - stats overlay
6. `src/app/App.tsx`
   - reset remount behavior
   - global history shortcut handling
   - slider/field gesture hooks
7. `src/components/AssetController.tsx`
   - runtime cleanup
   - nonce-based loading

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

If editing files around inspector/material/HDRI/texture flow, read them carefully first because this branch has moved quickly in those zones.
