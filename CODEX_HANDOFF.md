# Codex Handoff

Last updated: 2026-05-01

## Project

React + TypeScript + Vite rewrite of the old WebGL scene editor.

Current stack:

- React
- Zustand
- Three.js
- `@react-three/fiber`
- `@react-three/drei`
- `@react-three/postprocessing`

Entry point:

- [`src/main.tsx`](/d:/Work/Projects/WebGL/src/main.tsx:1)

Important:

- legacy `src/main.js` is gone
- the editor now boots entirely through React
- the store in [`src/store/editorStore.ts`](/d:/Work/Projects/WebGL/src/store/editorStore.ts:1) is the source of truth

## Validation

Passing now:

- `npx tsc --noEmit`
- `npx vite build`

Known non-blocker:

- Vite still warns about a large `drei` chunk

## Current Layout

Main shell:

- [`src/app/App.tsx`](/d:/Work/Projects/WebGL/src/app/App.tsx:1)

Current structure:

1. `<AssetController />`
2. optional `<Sidebar />`
3. `<Viewport />`
4. optional `<Inspector />`

There is no standalone top bar anymore.

The app is now a 3-column shell:

- left sidebar
- center viewport
- right inspector

Relevant layout styles:

- [`src/styles.css`](/d:/Work/Projects/WebGL/src/styles.css:1)

Important:

- `App.tsx` still owns drag-and-drop routing
- `Viewport` starts from the top edge of the app
- stats are now rendered inside the viewport, not in a global header

## Drag And Drop

Main file:

- [`src/app/App.tsx`](/d:/Work/Projects/WebGL/src/app/App.tsx:1)

Current routing:

- `.glb/.gltf` -> `requestModelLoad`
- `.hdr/.exr` -> `requestEnvironmentLoad`
- `.png/.jpg/.jpeg` dropped into app -> `requestEnvironmentLoad` as panorama
- `.json` -> `requestConfigImport`

Blob URLs are created in `App.tsx` and consumed by the asset pipeline through store requests.

Global visual state:

- `body.is-dragging`

## Key Files

- [`src/app/App.tsx`](/d:/Work/Projects/WebGL/src/app/App.tsx:1)
- [`src/components/Sidebar.tsx`](/d:/Work/Projects/WebGL/src/components/Sidebar.tsx:1)
- [`src/components/Outliner.tsx`](/d:/Work/Projects/WebGL/src/components/Outliner.tsx:1)
- [`src/components/Viewport.tsx`](/d:/Work/Projects/WebGL/src/components/Viewport.tsx:1)
- [`src/components/ViewportHud.tsx`](/d:/Work/Projects/WebGL/src/components/ViewportHud.tsx:1)
- [`src/components/Inspector.tsx`](/d:/Work/Projects/WebGL/src/components/Inspector.tsx:1)
- [`src/components/AssetController.tsx`](/d:/Work/Projects/WebGL/src/components/AssetController.tsx:1)
- [`src/components/MaterialEffectController.tsx`](/d:/Work/Projects/WebGL/src/components/MaterialEffectController.tsx:1)
- [`src/components/viewport/PostEffects.tsx`](/d:/Work/Projects/WebGL/src/components/viewport/PostEffects.tsx:1)
- [`src/components/viewport/EnvironmentManager.tsx`](/d:/Work/Projects/WebGL/src/components/viewport/EnvironmentManager.tsx:1)
- [`src/components/viewport/LightRig.tsx`](/d:/Work/Projects/WebGL/src/components/viewport/LightRig.tsx:1)
- [`src/components/viewport/ViewportContactShadows.tsx`](/d:/Work/Projects/WebGL/src/components/viewport/ViewportContactShadows.tsx:1)
- [`src/features/scene/runtime/LoadedSceneRoot.tsx`](/d:/Work/Projects/WebGL/src/features/scene/runtime/LoadedSceneRoot.tsx:1)
- [`src/features/scene/runtime/shared.ts`](/d:/Work/Projects/WebGL/src/features/scene/runtime/shared.ts:1)
- [`src/features/atlas/atlasMaterialPatch.ts`](/d:/Work/Projects/WebGL/src/features/atlas/atlasMaterialPatch.ts:1)
- [`src/features/atlas/useAtlasAnimator.ts`](/d:/Work/Projects/WebGL/src/features/atlas/useAtlasAnimator.ts:1)
- [`src/store/editorStore.ts`](/d:/Work/Projects/WebGL/src/store/editorStore.ts:1)
- [`src/styles.css`](/d:/Work/Projects/WebGL/src/styles.css:1)
- [`vite.config.ts`](/d:/Work/Projects/WebGL/vite.config.ts:1)

## Sidebar

Main file:

- [`src/components/Sidebar.tsx`](/d:/Work/Projects/WebGL/src/components/Sidebar.tsx:1)

Current responsibilities:

- left header with `GLB VIEWER`
- dynamic object/material counts
- 4-button toolbar:
  - `GLB`
  - `LOAD`
  - `SAVE`
  - `RST`
- tabbed settings panel:
  - `SCN`
  - `CAM`
  - `LGT`
  - `FX`

Important:

- the toolbar is part of the sidebar now
- no horizontal `TopBar` should be reintroduced
- scene/camera/light/fx settings are all store-driven

Current sidebar actions:

- model file load
- config import
- config export
- scene reset
- scene environment controls
- camera/navigation toggles
- light preset application and extra light creation
- post-processing controls

## Outliner

Main file:

- [`src/components/Outliner.tsx`](/d:/Work/Projects/WebGL/src/components/Outliner.tsx:1)

This is now a dedicated component used by `Sidebar`.

Current modes:

- `layers`
- `meshes`
- `materials`
- `lights`

Mode behavior:

- `layers`:
  - mesh/group/scene hierarchy
  - mesh rows can show nested material rows
- `meshes`:
  - only geometry tree
  - no material expansion
- `materials`:
  - only scene materials
  - clicking a material selects that exact material in store
- `lights`:
  - always shows `Environment` and `Ambient Light`
  - also shows all user-added extra lights

Important current details:

- filter icons are inline SVG, not text letters anymore
- active icon uses `.is-active`
- default mode is `layers`
- search is local to the outliner
- row actions still support visibility and remove flows

Store integration:

- object selection: `setSelectedObjectId`
- exact material selection: `setSelectedMaterialId`
- visibility: `toggleObjectVisibility`
- scene node removal: `removeSceneNode`
- ambient/environment/extra light remove or toggle paths stay store-driven

## Selection Flow

Main files:

- [`src/features/scene/runtime/LoadedSceneRoot.tsx`](/d:/Work/Projects/WebGL/src/features/scene/runtime/LoadedSceneRoot.tsx:1)
- [`src/components/Viewport.tsx`](/d:/Work/Projects/WebGL/src/components/Viewport.tsx:1)
- [`src/store/editorStore.ts`](/d:/Work/Projects/WebGL/src/store/editorStore.ts:1)

Current behavior:

- clicking on model content in viewport selects the nearest registered scene object
- `e.stopPropagation()` is used to avoid click-through selection
- clicking empty space clears selection
- selected object automatically resolves `selectedMaterialId`
- selected object gets a helper highlight in viewport

Important store behavior:

- `setSelectedObjectId(id)` updates `selectedObjectId` and auto-resolves the first material in branch
- `setSelectedMaterialId(id)` now exists and selects an exact material while preserving mesh context for inspector use

## Viewport

Main file:

- [`src/components/Viewport.tsx`](/d:/Work/Projects/WebGL/src/components/Viewport.tsx:1)

Viewport is fully declarative R3F.

Current scene structure:

- `<Canvas />`
- renderer bridge
- camera bridge
- performance probe
- lazy environment manager
- lazy light rig
- lazy contact shadows
- scene root / scene bridge
- material effect controller
- optional lazy post effects
- helpers and controls

Current overlay behavior:

- performance stats live inside viewport
- stats block is absolutely positioned
- no background or frame
- `pointer-events: none`

Stats source:

- `viewportMetrics` in store

Currently tracked:

- FPS
- Vertices
- Triangles
- Draw Calls
- VRAM Textures
- Disk

## Asset Loading

Main file:

- [`src/components/AssetController.tsx`](/d:/Work/Projects/WebGL/src/components/AssetController.tsx:1)

This is still the active asset ingestion layer.

It reacts to:

- `modelRequest`
- `atlasRequest`
- `environmentRequest`
- `configRequest`

Current behavior:

- GLTF loading
- atlas texture loading
- HDRI and panorama loading
- scene graph rebuild
- runtime object/material registration
- camera framing
- cleanup of previous assets and blob URLs

Important nuance:

- there are multiple similarly named runtime-era files in the repo
- the active app shell entrypoint is:
  - [`src/components/AssetController.tsx`](/d:/Work/Projects/WebGL/src/components/AssetController.tsx:1)

Environment loader support:

- HDR
- EXR
- panorama images

EXR support was added in:

- [`src/features/scene/runtime/shared.ts`](/d:/Work/Projects/WebGL/src/features/scene/runtime/shared.ts:1)

## Inspector

Main file:

- [`src/components/Inspector.tsx`](/d:/Work/Projects/WebGL/src/components/Inspector.tsx:1)

Current behavior:

- object selection shows name/type summary
- material-driven sections open automatically through `selectedMaterialId`
- light selections show light controls

Current material controls already restored:

- color
- emissive
- metalness
- roughness
- envMapIntensity
- emissiveIntensity
- clearcoat

Atlas section:

- emissive atlas controls are active again
- preview canvas exists
- atlas settings are store-driven

## Post-processing

Main file:

- [`src/components/viewport/PostEffects.tsx`](/d:/Work/Projects/WebGL/src/components/viewport/PostEffects.tsx:1)

Current stack:

- `EffectComposer`
- `Bloom`
- `ToneMapping`
- `Selection` wrapper for debug-oriented selective workflows

Driven by:

- `hud.postEffectsEnabled`
- `viewer.bloomIntensity`
- `viewer.bloomRadius`
- `viewer.bloomThreshold`
- `viewer.exposure`
- `viewer.toneMappingWhitePoint`
- `viewer.toneMappingAdaptation`

Loaded lazily:

- yes

## Environment And Lights

Main files:

- [`src/components/viewport/EnvironmentManager.tsx`](/d:/Work/Projects/WebGL/src/components/viewport/EnvironmentManager.tsx:1)
- [`src/components/viewport/LightRig.tsx`](/d:/Work/Projects/WebGL/src/components/viewport/LightRig.tsx:1)

Current behavior:

- environment/background are store-driven
- fallback city preset is used only when no custom environment texture is active
- ambient light is modeled in store as a system light
- extra lights are stored in `extraLights`
- sidebar can create:
  - ambient
  - directional
  - point
  - spot

Light preset flow:

- presets are applied from `Sidebar`
- presets update `lights.rig`

## Store Notes

Main file:

- [`src/store/editorStore.ts`](/d:/Work/Projects/WebGL/src/store/editorStore.ts:1)

Important current fields:

- `sceneGraph`
- `rootNodeId`
- `selectedObjectId`
- `selectedMaterialId`
- `objects`
- `materials`
- `environment`
- `lights`
- `extraLights`
- `hud`
- `viewer`
- `assets`
- `runtimeTextures`
- `runtime`
- `viewportMetrics`

Important current actions:

- `setSelectedObjectId`
- `setSelectedMaterialId`
- `updateObjectTransform`
- `updateMaterial`
- `updateMaterialEffect`
- `setEnvironment`
- `setLights`
- `setViewer`
- `setHud`
- `setViewportMetrics`
- `requestModelLoad`
- `requestAtlasLoad`
- `requestEnvironmentLoad`
- `requestConfigImport`
- `requestSceneReset`

Important HUD fields:

- `orbitEnabled`
- `fpsEnabled`
- `gridVisible`
- `axesVisible`
- `postEffectsEnabled`
- `sidebarVisible`
- `inspectorVisible`
- `transformMode`

Important viewer fields:

- `cameraMode`
- `flightSpeed`
- `focalLength`
- `exposure`
- `bloomIntensity`
- `bloomRadius`
- `bloomThreshold`
- `toneMappingWhitePoint`
- `toneMappingAdaptation`
- `cameraPosition`
- `orbitTarget`
- `dofEnabled`

## Build Splitting

Main file:

- [`vite.config.ts`](/d:/Work/Projects/WebGL/vite.config.ts:1)

Current manual chunks still include:

- `three`
- `postfx`
- `vendor`

Observed lazy chunks include:

- `EnvironmentManager-*`
- `LightRig-*`
- `ViewportContactShadows-*`
- `PostEffects-*`

Known issue:

- `drei` is still the largest chunk and triggers the Vite warning

## Known Risks / Watchouts

1. There are still duplicate-era files in the repo; verify imports before editing similarly named runtime files.
2. The active asset loader is [`src/components/AssetController.tsx`](/d:/Work/Projects/WebGL/src/components/AssetController.tsx:1), not the older runtime variant.
3. `selectedMaterialId` now has two entry paths:
   - auto-resolution from object selection
   - explicit `setSelectedMaterialId`
   Re-test inspector and atlas overlay flow if selection logic changes.
4. `MaterialEffectController` still patches only the selected material. Multi-material atlas playback is not implemented.
5. `Outliner.tsx` now owns view-mode logic. Do not move filtering state back into `Sidebar.tsx`.
6. The old `TopBar.tsx` may still exist in the repo but is not part of the active layout.
7. `main.js` is gone. Do not reintroduce imperative legacy UI wiring.

## Good First Checks If Something Breaks

1. [`src/store/editorStore.ts`](/d:/Work/Projects/WebGL/src/store/editorStore.ts:1)
2. [`src/components/Outliner.tsx`](/d:/Work/Projects/WebGL/src/components/Outliner.tsx:1)
3. [`src/components/Sidebar.tsx`](/d:/Work/Projects/WebGL/src/components/Sidebar.tsx:1)
4. [`src/components/Viewport.tsx`](/d:/Work/Projects/WebGL/src/components/Viewport.tsx:1)
5. [`src/components/AssetController.tsx`](/d:/Work/Projects/WebGL/src/components/AssetController.tsx:1)
6. [`src/components/MaterialEffectController.tsx`](/d:/Work/Projects/WebGL/src/components/MaterialEffectController.tsx:1)
7. [`src/features/scene/runtime/LoadedSceneRoot.tsx`](/d:/Work/Projects/WebGL/src/features/scene/runtime/LoadedSceneRoot.tsx:1)
8. [`src/components/Inspector.tsx`](/d:/Work/Projects/WebGL/src/components/Inspector.tsx:1)

## Recommended Next Steps

1. If startup size matters, keep reducing `drei` surface area or split more imports dynamically.
2. Decide whether `TopBar.tsx` should be deleted outright to reduce confusion.
3. Consider consolidating duplicate runtime-era files to reduce import ambiguity.
4. Re-test first-person controls, reset camera, and selection highlight after any viewport helper changes.
5. If outliner UX expands, keep the mode logic inside `Outliner.tsx` and keep selection store-driven.
