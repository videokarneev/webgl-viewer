# Codex Handoff

Last updated: 2026-04-24

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
   - dedicated top outliner panel
   - separate scrollable control stack
   - export / config footer
2. Center:
   - R3F viewport
   - floating viewport HUD
   - technical performance HUD overlay
3. Right panel:
   - contextual inspector for selected object only

Important direction:

- professional editor-style layout
- not the earlier "minimal hidden UI" direction

## Key Files

- `src/app/App.tsx`
- `src/components/SceneCanvas.tsx`
- `src/components/SceneManager.tsx`
- `src/components/ViewportHud.tsx`
- `src/components/Inspector.tsx`
- `src/components/InspectorDock.tsx`
- `src/components/AtlasVisualizer.tsx`
- `src/store/editorStore.ts`
- `src/features/scene/buildSceneGraph.ts`
- `src/features/scene/runtime/AssetController.tsx`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`
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

Main file:

- `src/components/SceneManager.tsx`

Current structure:

1. fixed top `OUTLINER` panel
2. independent scrollable accordion stack:
   - `ASSETS`
   - `SCENE`
   - `CAMERA`
   - `EFFECTS`
3. footer `EXPORT / CONFIG`

### OUTLINER

Current behavior:

- permanent non-collapsible panel at the top of the left sidebar
- root technical container (`Loaded Model`) is hidden from the UI
- top-level entries are promoted children of the loaded model
- identity wrapper groups are flattened when they only add a useless transform shell
- rows use icons only:
  - mesh: cube icon
  - material: circle icon
  - light/camera/group: subdued SVG icons
- rows render as:
  - `[icon] [label] [quick actions]`

Quick actions currently implemented:

- mesh row:
  - eye / eye-off toggles object visibility
  - trash removes mesh node from scene graph/runtime and removes linked material node when orphaned
- material row:
  - eye toggles "system material" preview mode
  - trash resets material state to default white PBR values and clears texture maps

Important:

- action buttons use `stopPropagation()` on both `pointerdown` and `click`
- clicking the row itself still updates global selection normally
- selection/highlight in viewport still works because outliner uses real `nodeId`s

### ASSETS

Contains:

- `Load GLB`
- `Load Config`
- `Reset Scene`

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

Current defaults:

- `environment.intensity = 1.5`

Current slider ranges:

- `Rotation`: `-180..180`
- `Intensity`: `0..10`, step `0.1`

Important behavior:

- reflections preview while dragging rotation still works via `previewReflections`
- temporary background preview during rotation is now allowed only for real custom HDRI loads
- default preset rotation no longer flashes the fallback `city` background
- `Clear` resets back to fallback lighting instead of leaving a dead custom HDRI state

#### HDRI runtime notes

Important files:

- `src/features/scene/runtime/AssetController.tsx`
- `src/features/scene/runtime/SceneBindings.tsx`
- `src/components/SceneManager.tsx`

Current intended pipeline:

- uploaded HDRI files are converted to blob URLs with `URL.createObjectURL(file)`
- custom HDRI loading goes through the internal runtime pipeline in `AssetController`
- `AssetController` loads HDR with `RGBELoader`, converts with PMREM, and stores result in `runtimeTextures.environmentMap`
- `SceneBindings` uses `<Environment preset="city" />` only as fallback when no custom `environmentMap` exists
- `SceneBindings` does not use Drei `<Environment files={...}>` for custom HDRI

Current fallback logic:

- if no custom HDRI is loaded, fallback is Drei `Environment preset="city"`
- if custom HDRI load fails, state resets back to fallback

#### BACKGROUND tab

Contains:

- inline row for:
  - background mode selector
  - conditional color swatch when mode is `color`
- current background file label
- `Load Background` / `Replace`
- `Clear`
- `Background Rotation`
- `Background Intensity`
- `Blur`
- `Visible`

Background modes:

- `none`
- `color`
- `environment`
- `reflections`

Current background defaults:

- `backgroundColor = #808080`
- scene-level fallback color in canvas is also `#808080`

Current slider ranges:

- `Background Intensity`: `0..5`
- `Blur`: `0..1`

Important:

- when mode is `color`, `SceneBindings` applies `scene.background = new THREE.Color(environment.backgroundColor)`

## Camera / Viewport State

Files:

- `src/components/SceneCanvas.tsx`
- `src/components/ViewportHud.tsx`
- `src/features/scene/runtime/shared.ts`
- `src/store/editorStore.ts`

### CAMERA section UI

Contains:

- `Exposure`
- focal length presets:
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
- DoF subsection starts collapsed

Current exposure slider range:

- `0..10`, step `0.1`

### Viewport HUD

File:

- `src/components/ViewportHud.tsx`

Current controls:

- `Grid`
- `Axes`
- `Orbit`
- `Flight`
- `Reset Camera`

Important:

- HUD now stops event propagation on wrapper and buttons to prevent click-through into the canvas
- this was required to stop unwanted pointer-lock re-engagement when switching away from flight mode

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
- computes required fit distance from FOV
- preserves current camera angle by using the normalized direction from center to camera
- moves camera to `center + direction * distance`
- updates orbit target and viewer state

Current camera defaults:

- canvas default camera position: `[4, 3, 5]`
- reset fallback camera position: `[4, 3, 5]`

### Flight Mode

Main file:

- `src/components/SceneCanvas.tsx`

Current behavior:

- orbit and flight controls are conditionally mounted
- flight mode uses a custom `FlightControls` wrapper around `PointerLockControls`
- pointer lock is requested on mount
- viewport click attempts to re-lock when flight mode is active and not currently locked
- `pointerlockchange` is used to detect a real unlock after a successful lock
- pressing `Esc` returns the app to `orbit` via the pointer-lock lifecycle, not via raw keydown

Movement:

- `W/S`: local forward/backward via `camera.translateZ()`
- `A/D`: local strafe via `camera.translateX()`
- `Q/E`: global down/up via `camera.position.y`
- current default speed is back to `10`
- key handling uses `event.code`, so layout is independent of OS keyboard language

Important:

- `lockInitialized` ref is required to avoid the race where `pointerlockchange` fires before the first successful lock and instantly reverts flight mode

## Performance HUD

Main file:

- `src/components/SceneCanvas.tsx`

Styling file:

- `src/styles.css`

Current implementation:

- top-left viewport overlay
- absolute positioned
- no boxed background container
- monospace styling
- 3-column grid:
  - label
  - total
  - selected

Current metrics:

- `VERTICES`
- `TRIANGLES`
- `VRAM TEXTURES`
- `DRAW CALLS`
- `FPS`

Data rules:

- `TOTAL` is calculated by traversing the loaded GLB root only
- `SELECTED` is calculated from the currently selected mesh/runtime object
- texture counting is now asset-only and does not use `gl.info.memory.textures`
- asset texture profiler collects:
  - PBR map slots from loaded GLB materials:
    - `map`
    - `normalMap`
    - `roughnessMap`
    - `metalnessMap`
    - `aoMap`
    - `emissiveMap`
  - active environment/background textures when they are actual published assets
- runtime render targets, post-processing buffers, and shadow maps are intentionally excluded from this texture budget

Adaptive HUD color:

- uses the same luminance logic as the scene grid
- if background mode is `color` and luminance is light, HUD switches to dark text with no text-shadow
- if background is dark or an HDRI/environment is active, HUD remains white with subtle shadow

Positioning:

- HUD is offset right of the fixed left panel using CSS `left: calc(sidebar width + margin)`
- `pointer-events: none` is enabled so it never blocks viewport interaction

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

Default UX:

- `EFFECTS` accordion starts collapsed

### Depth of Field

DoF lives in Zustand `viewer`:

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
- bokeh strength is derived from aperture preset mapping plus `dofManualBlur`

## Focus Plane Visualizer

File:

- `src/components/SceneCanvas.tsx`

Current implementation:

- standalone mesh in scene graph
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

- exposure affects the whole final frame, not only the model

## Lighting

Files:

- `src/components/SceneCanvas.tsx`
- `src/store/editorStore.ts`

Current behavior:

- no legacy ambient/directional preset rig remains
- lighting now comes from:
  - environment lighting
  - user-added extra point lights only

Extra lights:

- Zustand-backed
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

Important:

- background color/rotation/intensity/blur are still not fully serialized unless someone adds them next

## Current Known Risks

1. Custom HDRI crash may still need one more pass if the uploaded `.hdr` itself is malformed or unsupported.
   - The double-loading conflict was removed, but malformed user files may still need better surfaced diagnostics.
2. Material reset / delete actions are now runtime-capable but should be watched if someone later introduces material sharing edge cases beyond the current graph assumptions.
3. Bundle size warning still exists.

## If Something Breaks First

Check in this order:

1. `src/components/SceneManager.tsx`
2. `src/components/SceneCanvas.tsx`
3. `src/features/scene/runtime/LoadedSceneRoot.tsx`
4. `src/features/scene/runtime/SceneBindings.tsx`
5. `src/features/scene/runtime/AssetController.tsx`
6. `src/features/scene/runtime/shared.ts`
7. `src/store/editorStore.ts`

## Recommended Next Steps

Most likely useful next passes:

1. If custom HDRI still crashes with a real user file, instrument `loadHdri` / `RGBELoader` with explicit error diagnostics.
2. Decide whether outliner destructive actions should gain confirmation UI or undo support.
3. Consider serializing more background settings:
   - `backgroundColor`
   - `backgroundRotation`
   - `backgroundIntensity`
   - `backgroundBlur`
4. Consider code-splitting heavy viewport/editor chunks to reduce the Vite warning.
