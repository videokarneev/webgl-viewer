# Codex Handoff

Last updated: 2026-04-23

## Project

React + TypeScript + Vite refactor of the legacy monolithic `Three.js` configurator from `src/main.js`.

Active stack:

- React
- React Three Fiber
- Zustand
- Drei
- Three.js
- `@react-three/postprocessing`

Main entry:

- `src/main.tsx`

Legacy reference:

- `src/main.js`

## Current Product Shape

The app is now a real 3-column editor:

1. Left panel:
   - assets
   - structure / outliner
   - scene
   - camera
   - effects
   - export / config footer
2. Center:
   - R3F viewport
   - floating viewport HUD
   - performance stats
3. Right panel:
   - contextual inspector for selected object only

Important direction:

- professional editor-style layout
- not the earlier “minimal hidden UI” direction

## Key Files

- `src/app/App.tsx`
- `src/components/SceneCanvas.tsx`
- `src/components/SceneManager.tsx`
- `src/components/ViewportHud.tsx`
- `src/components/Inspector.tsx`
- `src/components/InspectorDock.tsx`
- `src/components/AtlasVisualizer.tsx`
- `src/store/editorStore.ts`
- `src/features/scene/runtime/AssetController.tsx`
- `src/features/scene/runtime/SceneBindings.tsx`
- `src/features/scene/runtime/ViewerSync.tsx`
- `src/features/scene/runtime/ConfigController.tsx`
- `src/features/scene/runtime/shared.ts`
- `src/features/viewport/ViewportPresentationContext.tsx`
- `src/features/config/buildSceneConfig.ts`
- `src/styles.css`

## Validation

Currently passing:

- `npx tsc --noEmit`
- `npx vite build`

Known non-blocker:

- Vite large chunk warning remains

## Left Panel State

File:

- `src/components/SceneManager.tsx`

Current order:

1. `ASSETS`
2. `STRUCTURE`
3. `SCENE`
4. `CAMERA`
5. `EFFECTS`
6. footer `EXPORT / CONFIG`

### ASSETS

Contains:

- `Load GLB`
- `Load Config`
- `Reset Scene`

### STRUCTURE

Contains:

- `Add Light`
- model hierarchy / outliner tree
- material nodes
- extra lights subgroup

Important:

- `STRUCTURE` is still the flexible panel
- `left-accordion--structure` uses flex growth so the tree expands vertically

### SCENE

Uses local tab state:

- `REFLECTIONS`
- `BACKGROUND`

The old `ENVIRONMENT` tab is gone.

#### REFLECTIONS tab

Contains:

- current HDRI label
- `Load HDRI` / `Replace`
- `Clear`
- `Rotation`
- `Intensity`

Current slider ranges:

- `Rotation`: `-180..180`
- `Intensity`: `0..10`, step `0.1`

Important behavior:

- reflections preview while dragging rotation still works via `previewReflections`
- `Clear` now resets back to default fallback lighting instead of leaving a dead custom HDRI state

#### HDRI runtime notes

Important files:

- `src/features/scene/runtime/AssetController.tsx`
- `src/features/scene/runtime/SceneBindings.tsx`
- `src/app/App.tsx`
- `src/components/SceneManager.tsx`

Current intended pipeline:

- uploaded HDRI files are converted to blob URLs with `URL.createObjectURL(file)`
- custom HDRI loading goes through the internal runtime pipeline in `AssetController`
- `AssetController` loads HDR with `RGBELoader`, converts with PMREM, and stores result in `runtimeTextures.environmentMap`
- `SceneBindings` uses `<Environment preset="city" />` only as fallback when no custom `environmentMap` exists
- `SceneBindings` no longer uses `<Environment files={blobUrl}>` for custom HDRI

Important:

- this was changed because the previous setup loaded the same custom HDRI through two competing pipelines:
  - internal PMREM pipeline
  - Drei `<Environment files={...}>`
- that double-loading path was the main suspected crash source

Current fallback logic:

- if no custom HDRI is loaded, fallback is Drei `Environment preset="city"`
- if custom HDRI load fails, state resets back to fallback

#### BACKGROUND tab

Contains:

- background mode selector:
  - `none`
  - `color`
  - `environment`
  - `reflections`
- conditional color picker when mode is `color`
- current background file label
- `Load Background` / `Replace`
- `Clear`
- `Background Rotation`
- `Background Intensity`
- `Blur`
- `Visible`

Current background defaults:

- `backgroundColor` default is now `#808080`
- scene-level fallback color in canvas was also moved to `#808080`

Current slider ranges:

- `Background Intensity`: `0..5`
- `Blur`: `0..1`

Important:

- when mode is `color`, `SceneBindings` applies `scene.background = new THREE.Color(environment.backgroundColor)`

## Camera State

Files:

- `src/components/SceneManager.tsx`
- `src/components/SceneCanvas.tsx`
- `src/features/scene/runtime/shared.ts`

### CAMERA section UI

Contains:

- `Exposure` slider at the top
- focal length preset row:
  - `8`
  - `12`
  - `17`
  - `35`
  - `50`
  - `85`
- manual focal length slider:
  - `8..200mm`
- collapsible `Depth of Field` subsection

Current defaults:

- `viewer.focalLength = 12`
- `viewer.exposure = 1`

Current exposure slider range:

- `0..10`, step `0.1`

### Viewport HUD

File:

- `src/components/ViewportHud.tsx`

Current controls in floating HUD:

- `Grid`
- `Axes`
- `Orbit`
- `First Person`
- `Reset Camera`

Important:

- HUD now lives inside viewport overlay, not as a global fixed strip
- HUD uses `pointer-events: none` on wrapper and `pointer-events: auto` on buttons

### Reset Camera / Fit Logic

Files:

- `src/features/scene/runtime/shared.ts`
- `src/components/SceneCanvas.tsx`
- `src/features/scene/runtime/AssetController.tsx`

Current helper:

- `fitCameraToObject(camera, controls, object, margin = 1.95)`

Behavior:

- calculates `Box3`
- gets `center`
- gets max dimension
- computes distance from current camera FOV
- sets camera position to `center.z + distance`
- points camera at center
- updates orbit target
- updates viewer state

Trigger points:

- automatically after successful model load
- when user presses `Reset Camera` in the HUD

Important:

- margin was recently increased by 50%, from `1.3` to `1.95`
- this was done to push the default framing farther back, especially with `12mm`

### First Person

Current behavior:

- controls are conditionally mounted
- only one control system exists at a time:
  - `OrbitControls` for orbit mode
  - `PointerLockControls` for first person mode
- on entering first person:
  - camera is moved to `[0, 1.6, 5]`

Important:

- this fixed the earlier bug where orbit and first-person controls fought over the same camera

## Effects State

Files:

- `src/components/SceneManager.tsx`
- `src/components/SceneCanvas.tsx`
- `src/features/viewport/ViewportPresentationContext.tsx`

### EFFECTS accordion

Now contains only Bloom controls:

- enabled
- threshold
- intensity
- luminance smoothing

### Depth of Field

DoF was moved out of `EFFECTS` and into `CAMERA`.

State now lives in Zustand `viewer`:

- `dofEnabled`
- `dofVisualizerEnabled`
- `dofFocusDistance`
- `dofAperture`
- `dofManualBlur`

DoF defaults:

- `dofEnabled = false`
- `dofVisualizerEnabled = false`
- `dofFocusDistance = 5`
- `dofAperture = 2`
- `dofManualBlur = 1.2`

Current aperture preset buttons:

- `1.0`
- `1.2`
- `1.4`
- `1.8`
- `2.0`
- `2.8`

Current DoF implementation:

- `EffectComposer` always mounts
- global `ToneMapping` pass is always mounted
- `DepthOfField` effect mounts only when `viewer.dofEnabled`
- bokeh strength is derived from:
  - aperture preset mapping
  - plus `dofManualBlur`

## Focus Plane Visualizer

File:

- `src/components/SceneCanvas.tsx`

Current implementation:

- uses a standalone mesh in scene graph
- updates in `useFrame`
- copies camera position and rotation each frame
- then moves forward with `translateZ(-focusDistance)`
- uses:
  - `planeGeometry args={[500, 500]}`
  - green `meshBasicMaterial`
  - `transparent`
  - `opacity={0.3}`
  - `depthWrite={false}`
  - `DoubleSide`
  - `toneMapped={false}`

Important:

- this replaced the earlier camera-portal parenting approach because that version could become invisible
- if the focus plane disappears again, inspect `FocusAreaVisualizer` in `SceneCanvas.tsx` first

## Global Tone Mapping / Exposure

Files:

- `src/components/SceneCanvas.tsx`
- `src/features/scene/runtime/SceneBindings.tsx`

Current pipeline:

- renderer:
  - `outputColorSpace = THREE.SRGBColorSpace`
  - `toneMapping = THREE.NoToneMapping`
  - `toneMappingExposure = 1`
- final exposure is handled globally through postprocessing `ToneMapping`

Important:

- this was introduced to avoid desync where model responded to exposure but background did not
- exposure now affects the whole final frame

## Lighting

Files:

- `src/components/SceneCanvas.tsx`
- `src/store/editorStore.ts`

Current behavior:

- legacy light presets are removed
- no default ambient / directional preset rig remains in React app
- lighting now comes from:
  - environment lighting
  - user-added extra lights only

Extra lights:

- still Zustand-backed
- still only `point` lights
- selectable in outliner
- visible in viewport
- editable in inspector

## Serialization / Config

Files:

- `src/features/config/buildSceneConfig.ts`
- `src/features/scene/runtime/ConfigController.tsx`

Currently exported / imported camera-related fields:

- `cameraMode`
- `focalLength`
- `exposure`
- `cameraPosition`
- `orbitTarget`
- `dofEnabled`
- `dofVisualizerEnabled`
- `dofFocusDistance`
- `dofAperture`
- `dofManualBlur`

Still exported:

- `envIntensity`
- material settings
- model transform
- selected material effect

## Current Known Risks

1. Custom HDRI crash may still need one more pass if the uploaded `.hdr` itself is malformed or unsupported.
   - The double-loading conflict was removed, but if crashes persist, next step is to capture the exact `RGBELoader` failure path and surface better diagnostics.
2. `SceneBindings` creates `new THREE.Color(environment.backgroundColor)` during render.
   - This is acceptable for now, but could be memoized later.
3. Bundle size warning still exists.

## If Something Breaks First

Check in this order:

1. `src/features/scene/runtime/SceneBindings.tsx`
2. `src/features/scene/runtime/AssetController.tsx`
3. `src/components/SceneCanvas.tsx`
4. `src/components/SceneManager.tsx`
5. `src/features/scene/runtime/shared.ts`
6. `src/features/scene/runtime/ViewerSync.tsx`
7. `src/store/editorStore.ts`

## Recommended Next Steps

Most likely useful next passes:

1. If custom HDRI still crashes with a real user file, instrument `loadHdri` / `RGBELoader` with more explicit error reporting.
2. Consider removing `AssetDock.tsx` entirely if it is no longer used, or keep its HDRI path aligned with the main left panel path.
3. Consider exporting / importing more background settings:
   - `backgroundColor`
   - `backgroundRotation`
   - `backgroundIntensity`
   - `backgroundBlur`
4. Consider code-splitting heavy viewport/editor chunks to reduce the Vite warning.
