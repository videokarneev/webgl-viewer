# Codex Handoff

Last updated: 2026-05-09

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
- `npx vite build`

Known non-blocker:

- Vite still warns about large chunks, especially `drei`.

## Active App Shell

Current shell order:

1. `<AssetController />`
2. optional `<Sidebar />`
3. `<Viewport />`
4. optional `<Inspector />`

Files:

- `src/app/App.tsx`
- `src/components/AssetController.tsx`
- `src/components/Viewport.tsx`

The old `SceneCanvas` / legacy runtime files still exist in the repo, but the active app path is the component set above.

## Camera / Auto-Fit

Main files:

- `src/components/Viewport.tsx`
- `src/features/scene/runtime/shared.ts`
- `src/store/editorStore.ts`

Current behavior:

- Default focal length is `20mm`.
- Viewer state defaults to `DEFAULT_VIEWER_FOCAL_LENGTH = 20`.
- Auto-fit now happens on the real viewport camera and real `OrbitControls`, not in a loader-side fake camera.
- `fitCameraToObject()` uses filtered useful geometry, not blind whole-root bounds.
- Utility / outlier geometry is filtered out when framing, especially giant flat helper-like meshes.
- `RESET CAMERA` returns to the latest computed framed position/target.

Important nuance:

- Auto-frame still targets the current primary root (`rootNodeId`), which is the most recently loaded model.
- In a multi-GLB scene this means the newest model becomes the active frame/reset target by default.

## Multi-GLB Scene Support

Main files:

- `src/store/editorStore.ts`
- `src/components/AssetController.tsx`
- `src/components/Viewport.tsx`
- `src/components/Outliner.tsx`

Current behavior:

- Multiple GLBs can coexist in one scene.
- Loading a new GLB no longer replaces the previous one automatically.
- Store now tracks:
  - `rootNodeId`
  - `rootNodeIds`
  - `loadedModels`
- `loadedModels` is the grouped source for the outliner and multi-root viewport rendering.
- `SceneBridge` renders every loaded root.
- GPU/performance stats aggregate across all loaded roots.

Deletion / cleanup:

- Deleting a root GLB now removes it from the store, outliner, runtime refs, and scene.
- Root deletion also disposes nested geometries/materials through the runtime cleanup path in `AssetController`.

Current limitation:

- This is reliable for sequential loading.
- File dialog load is still single-file.
- Drag-and-drop loops over all dropped files in `App.tsx`, but `modelRequest` is still singular in store, so a single multi-file drop is not yet a true queue-based batch import system.
- If proper multi-select / batch import is needed, `modelRequest` should become a queue.

## Outliner

Main file:

- `src/components/Outliner.tsx`

Current behavior:

- Each loaded GLB appears as its own root row.
- In `layers`, `meshes`, and `materials` modes, each root can be collapsed/expanded independently.
- Collapse state is tracked per mode through `collapsedRootsByMode`.
- Root GLB rows have:
  - selection
  - visibility eye
  - delete trash
- Child rows stay grouped under their parent GLB.

FX / Lights:

- `lights` and `effects` modes are still flat lists, not grouped by model.

Important recent fix:

- Root delete no longer shows the old confirm popup.
- The model should now disappear from both outliner and viewport immediately after delete.

## FX Workflow

Main files:

- `src/components/Outliner.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Viewport.tsx`
- `src/store/editorStore.ts`

Current behavior:

- Bloom is no longer enabled by default.
- Store defaults:
  - `postEffectsEnabled: false`
  - `postEffectsVisible: false`
- FX tab now shows `Add Effect` above the effect buttons.
- Only `Bloom` exists right now.
- Clicking `Bloom` creates/selects the effect.
- Bloom settings appear only when:
  - Bloom exists, and
  - Bloom is selected.

Outliner FX mode:

- Shows Bloom only if the effect exists in the scene.
- `eye` toggles visible/hidden.
- `trash` removes the effect entirely.

Viewport behavior:

- Post effects render only when both:
  - `hud.postEffectsEnabled`
  - `hud.postEffectsVisible`

## Transform / Snapping / Anchor

Main files:

- `src/components/TransformToolbar.tsx`
- `src/components/viewport/TransformTable.tsx`
- `src/components/viewport/transformShared.ts`
- `src/components/Viewport.tsx`
- `src/store/editorStore.ts`

Current toolbar order:

- `MAG`
- `MOVE`
- `ROTATE`
- coordinate table
- `UNITS`
- `ANCHOR`

Important behavior:

- `transformMode` is still `'none' | 'translate' | 'rotate'`.
- `MAG` is a dedicated button left of `MOVE`.
- The `MAG` slot is reserved so the row does not shift when translation mode changes.
- Magnet artwork now comes from `src/assets/icons/magnet.svg`.
- Right click on `MOVE` or `ROTATE` opens the step popup.
- `UNITS` is disabled during rotate mode.

Snapping:

- `MAG` only controls viewport drag snapping.
- Numeric transform fields still use step values independently.
- Grid size and translation step stay synchronized when snapping is active.

Anchor mode:

- `ANCHOR` button sits to the right of `UNITS`.
- When enabled, 8 bounding-box corner handles appear for the selected mesh or whole GLB root.
- Clicking a handle sets `selectedAnchorIndex`.
- `MOVE` translates from the selected corner anchor.
- `ROTATE` rotates around the selected corner anchor.
- Handles scale in screen-space, so they stay usable across small and large models.
- Handles now update live while the object moves.
- Hover and active states are visually distinct.

Important transform nuance:

- Whole-root GLB selection is supported.
- For root selection:
  - `MOVE` translates the real root directly.
  - `ROTATE` can still use a custom pivot.
- This split is intentional; using the same pivot math for move caused models to jump/disappear earlier.

## Viewport HUD / Flight / Fullscreen

Main files:

- `src/components/ViewportHud.tsx`
- `src/components/Viewport.tsx`
- `src/components/viewport/FlightController.tsx`
- `src/components/viewport/flightLockBridge.ts`

Current top HUD:

- `GRID`
- `ORBIT`
- `FLIGHT`
- `RESET CAMERA`

Current behavior:

- `GRID` right click opens the grid-size popup.
- Flight speed row sits below the main HUD row.
- `Esc` behavior around flight/fullscreen/orbit is still delicate and should not be simplified casually.

## Runtime Stability Note

Very important recent fix:

- The scene was crashing immediately after the multi-GLB work because `Viewport.tsx` had `zustand` selectors that created new arrays on every render.
- This was fixed by memoizing derived root arrays in:
  - `SceneBridge`
  - `PerformanceProbe`

Rule to keep:

- Do not put `map()`, `filter()`, or new object/array construction directly inside hot `useEditorStore(...)` selectors unless you are intentionally using a stable equality strategy.

## Asset Loading

Main file:

- `src/components/AssetController.tsx`

Current behavior:

- Runtime roots are tracked in `loadedRootsRef`.
- Each loaded root registers its runtime object/material refs.
- Removing a root clears refs and disposes the object tree.
- Async model loads still use request `nonce` handling to ignore stale results.

Important nuance:

- `LoadedSceneRoot.tsx` still registers refs on mount too, so runtime registration exists in more than one place.
- Be careful changing registration ownership without checking both `AssetController` and `LoadedSceneRoot`.

## Legacy / Secondary Files

Still present but not the main active path:

- `src/components/SceneCanvas.tsx`
- `src/features/scene/runtime/AssetController.tsx`
- `src/features/scene/runtime/ConfigController.tsx`
- `src/features/scene/runtime/SceneBindings.tsx`
- `src/features/scene/runtime/TransformGizmo.tsx`

If something seems duplicated, first verify whether you are in the active React app path or in an older runtime path.

## Known Watchouts

Sensitive zones right now:

1. `src/components/Viewport.tsx`
   - transform gizmo math
   - anchor math
   - multi-root rendering
   - selector stability
2. `src/components/AssetController.tsx`
   - async request cleanup
   - disposal
   - multi-root lifecycle
3. `src/store/editorStore.ts`
   - `buildDeletePatch`
   - `rootNodeIds`
   - `loadedModels`
   - selection/anchor cleanup on delete/reset
4. `src/components/Outliner.tsx`
   - grouped root sections
   - per-mode collapse state
5. `src/features/scene/runtime/shared.ts`
   - framing heuristics
   - filtering oversized helper geometry

## Dirty Workspace Notes

Workspace is dirty. Notable touched files in the current state include:

- `CODEX_HANDOFF.md`
- `src/components/AssetController.tsx`
- `src/components/Outliner.tsx`
- `src/components/SceneCanvas.tsx`
- `src/components/Sidebar.tsx`
- `src/components/Viewport.tsx`
- `src/components/ViewportHud.tsx`
- `src/components/TransformToolbar.tsx`
- `src/components/viewport/TransformTable.tsx`
- `src/components/viewport/transformShared.ts`
- `src/features/scene/runtime/AssetController.tsx`
- `src/features/scene/runtime/SceneBindings.tsx`
- `src/features/scene/runtime/TransformGizmo.tsx`
- `src/features/scene/runtime/shared.ts`
- `src/store/editorStore.ts`
- `src/styles.css`
- `src/assets/icons/magnet.svg`

Also note:

- `src/components/viewport/ViewportContactShadows.tsx` is deleted in the current worktree.

Do not blindly revert unrelated user changes.
