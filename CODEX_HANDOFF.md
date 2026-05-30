# Codex Handoff

Last updated: 2026-05-31

## Project

React + TypeScript + Vite scene editor / GLB viewer built on:

- React
- Zustand
- Three.js
- `@react-three/fiber`
- `@react-three/drei`

Primary source of truth:

- `src/store/editorStore.ts`

Main entrypoints:

- editor: `src/main.tsx` -> `src/app/App.tsx`
- published player: `src/main.tsx` -> `src/app/PublishedPlayerApp.tsx`

## Validation

Passing at the end of this session:

- `npx tsc --noEmit`
- `npx vite build`

Vite still prints the usual chunk-size warning, but the build succeeds.

## Current Git State

Latest important commits:

- `fcbdbfc` `Refine camera workflow and atlas runtime preview`
- `66cdc9b` `Publish scene demo-03`
- `f1e3bc8` `Fix web publish build check on Windows`
- `1c87b64` `Verify production build before web publish`
- `9a6795e` `Restore web publish status event export`
- `44c3d86` `Update scene demo-02`

Current worktree state:

- only `CODEX_HANDOFF.md` is dirty right now

## Big Picture

Four tracks matter right now:

1. `God Rays` remain the reference volumetric behavior.
2. `Stencil Volume` remains a real editor + publish/runtime feature and should not be regressed.
3. `Flipbook` now has important runtime-preview / performance fixes that should not be regressed.
4. `Published player / WEB publish` was materially upgraded and now includes responsive camera support, viewport deploy feedback, `iframe` copy support, and preflight build verification.

## Camera Workflow

Current intended camera behavior:

- fixed frame presets now include:
  - `1:1`
  - `3:2`
  - `2:3`
  - `16:9`
  - `21:9`
  - `9:16`
- `AUTO` was tried and then removed
- do not assume any `auto-fit` frame mode exists right now

Responsive camera behavior now:

- there is no separate `Enable Responsive Camera` toggle anymore
- there are no preview buttons like `Desktop / Phone / Square`
- `CAM` tab always shows three preset cards:
  - `Landscape`
  - `Portrait`
  - `Square / Fallback`
- each preset stores:
  - `frameAspectPreset`
  - `cameraPosition`
  - `orbitTarget`
  - `focalLength`
- `Save current camera` stores the current viewer camera into that preset
- the button turns green when current view already matches the saved preset
- if camera / target / focal length / frame format changes, the button goes back to normal

Published player preset selection:

- `containerAspect > 1.2` -> `landscape`
- `containerAspect < 0.85` -> `portrait`
- otherwise -> `square`

Important camera decisions to preserve:

- published/local player camera must respect both camera position and orbit target correctly
- if future changes touch camera sync, verify all three:
  - editor viewport
  - `RUN Local`
  - published pretty scene URL

Most relevant files:

- `src/store/editorStore.ts`
- `src/components/Sidebar.tsx`
- `src/features/scene/runtime/ConfigController.tsx`
- `src/features/scene/runtime/ViewerSync.tsx`
- `src/app/PublishedPlayerApp.tsx`
- `src/components/Viewport.tsx`

## WEB Publish Flow

`WEB` is no longer just an export button.

Current behavior:

- packages the published scene and referenced assets
- writes them into `public/scenes/<slug>`
- stages and commits only that scene directory
- pushes to `origin/<current-branch>`
- returns pretty scene URLs like `/scenes/<slug>/`

Critical distinction:

- `WEB` publishes scene content to Git
- `WEB` does **not** deploy app/player code unless those source files are separately committed and pushed

This matters a lot:

- new `scene.json` can be live while old player JS is still deployed
- if iframe behavior looks stale, verify whether the app code was actually pushed

Terminology that must stay clear:

- `scene slug`
  - example: `demo-02`
  - means the folder under `public/scenes/demo-02`
- published `schema version`
  - example: `version: 15` inside `scene.json`
  - means JSON format version, not publish count
- `git commit`
  - example: `fcbdbfc`
  - means repository revision
- `Vercel deployment`
  - means production build for a git commit

## WEB Preflight Build Check

This session added a protective preflight before `WEB` scene publish.

Current intended behavior:

- before scene publish commits anything, local Vite middleware runs a production build check
- if production build fails, `WEB` stops before git push
- this prevents the old failure mode where a scene was published but Vercel then failed on broken app code

Implementation detail:

- preflight is server-side inside Vite middleware, not a frontend-only check
- it runs Vite build through the Vite CLI entry, not through the old Windows-spawn-prone approach
- Windows `spawn EINVAL` issue was fixed in `f1e3bc8`

If `WEB` fails immediately with a build message:

- treat it as a real production-build issue first
- not as a scene-export issue

Most relevant files:

- `vite.config.ts`
- `src/features/publish/exportWebPackage.ts`
- `src/components/Sidebar.tsx`

## WEB Deploy Status Overlay

Current intended UI:

- `WEB DEPLOY` status appears inside the viewport, not under the toolbar
- it is a dismissable popup below `GRID / ORBIT / FLIGHT / RESET CAMERA`
- it closes by:
  - `x`
  - clicking empty viewport space
- it reopens on the next new publish status event

Current status phases:

- `preparing`
- `git-pushed`
- `checking`
- `ready`
- `timeout`
- `error`

Current payload shown there can include:

- short git SHA
- live scene link
- ready-to-copy `iframe` snippet
- `Copy iframe` action

Important implementation detail:

- viewport listens for `WEB_PUBLISH_STATUS_EVENT`
- if that export disappears again, production build breaks with `MISSING_EXPORT`
- this already happened once and was fixed in `9a6795e`

Current local middleware endpoints:

- `GET /__publish/scenes`
- `POST /__publish/web-package`
- `GET /__publish/web-package-status`

Current deploy-origin behavior:

- default is `https://webgl-viewer-jet.vercel.app`
- override via env var `WEB_PUBLISH_DEPLOY_ORIGIN`

Important troubleshooting note:

- `timeout` does not necessarily mean scene publish failed
- it often means:
  - git push succeeded
  - but local polling did not confirm fresh Vercel output in time
- if needed, check Vercel deploy separately

Most relevant files:

- `src/features/publish/exportWebPackage.ts`
- `src/components/Sidebar.tsx`
- `src/components/Viewport.tsx`
- `src/styles.css`
- `vite.config.ts`

## Transparent Published Embeds

Transparent iframe behavior was fixed and should be preserved.

Current intended behavior:

- pretty scene URL `/scenes/<slug>/` preserves query params
- when opened inside an iframe, transparent mode auto-enables
- transparent published player should not flash an opaque background at startup

If transparency breaks again, check these first:

- whether embed uses the pretty scene URL
- whether deployed `index.html` inside `public/scenes/<slug>/` is current
- whether Vercel is serving fresh player code or stale code

Most relevant files:

- `src/features/publish/exportWebPackage.ts`
- `src/main.tsx`
- `src/app/PublishedPlayerApp.tsx`
- `src/components/TransparentPublishedViewport.tsx`
- `src/styles.css`

## Flipbook: Current Status

Flipbook still carries important fixes that should not be regressed.

Main outcomes already in code:

- severe FPS drop when combining flipbook with `God Rays` was reduced substantially
- live atlas preview frame highlight works during playback
- swapping atlas textures and then changing `Column` / `Row` no longer needs a `Wrap Mode` toggle
- active material should not briefly fall back to showing the entire raw atlas sheet

Important implementation decisions:

- playback should not spam `updateMaterialEffect(...currentFrame...)` into Zustand every frame
- live preview frame state is tracked separately in runtime state via `runtime.materialEffectPreviewFrameById`
- inspector preview and atlas visualizer read runtime preview frame instead of only persisted `effect.currentFrame`
- `useAtlasAnimator` draws the active frame into a single `CanvasTexture`
- when atlas source changes, animator resets cached frame texture state
- when frame output size changes because `Column` / `Row` changed, the `CanvasTexture` is disposed and recreated instead of reused with stale dimensions
- runtime flipbook material sync now avoids redundant re-application when the current override is already active

Current runtime texture-loading decision:

- `loadTexture()` in `src/features/scene/runtime/shared.ts` no longer uses the old `THREE.TextureLoader`
- it now loads through `Image`, waits for decode when possible, then wraps into `THREE.Texture`

Current known reality:

- very large atlases can still hitch during browser decode / first upload
- that residual hitch is expected to some extent

Most relevant files:

- `src/features/atlas/useAtlasAnimator.ts`
- `src/components/MaterialEffectController.tsx`
- `src/components/Inspector.tsx`
- `src/components/AtlasVisualizer.tsx`
- `src/features/scene/runtime/shared.ts`
- `src/store/editorStore.ts`

## Stencil Volume: Preserve Current Architecture

`Stencil Volume` is still in a strong usable state.

Keep these facts in mind:

- editor support is real, not scaffold-level
- runtime / publish path is real
- published runtime should restore baked effect geometry state and should not depend on live mask contour extraction

Current published/baked support still matters:

- baked runtime payloads include:
  - `bakedContourShapes`
  - `bakedPrimitiveShapeGroups`
  - `bakedPreparedPrimitives`

Preserve these architectural decisions:

- `Stencil Volume` should stay aligned with `God Rays` control language, not collapse back into simple box geometry
- `extrudeEnd` remains internal effect geometry state, not object transform state
- do not reintroduce published-player dependence on raw mask extraction or editor-only helper workflows

Relevant files:

- `src/store/editorStore.ts`
- `src/components/viewport/effects/StencilVolume.tsx`
- `src/components/viewport/effects/StencilVolumes.tsx`
- `src/features/stencilVolume/maskContour.ts`
- `src/features/publish/buildPublishedScene.ts`
- `src/app/PublishedPlayerApp.tsx`

## God Rays: Stable Reference

`God Rays` remain the visual and behavior reference for volumetric lighting.

Semantics that should be preserved:

- pivot at lower-plane center
- height from object `scale.y`
- width / depth from object scale
- `DIR` editing is rotate-based
- global/local noise semantics stay intact
- global/local dust direction semantics stay intact
- roll is not clamped away during direction editing

Dust status that must not regress:

- dust uses world-space motion behavior
- rotating the effect should not rotate the perceived dust motion pattern

Relevant files:

- `src/components/viewport/effects/GodRaysBox.tsx`
- `src/components/viewport/effects/GodRaysBoxes.tsx`
- `src/components/viewport/effects/GodRaysVolume.tsx`
- `src/components/viewport/effects/GodRaysDust.tsx`
- `src/components/viewport/effects/godRaysShared.ts`

## Important Decisions To Preserve

### 1. Do not regress God Rays semantics

Especially:

- global/local noise rules
- global/local direction rules
- rotate-based `DIR`
- unrestricted roll during direction edit
- world-space dust motion

### 2. Keep Stencil Volume tied to God Rays behavior language, not God Rays geometry

Do not collapse `Stencil Volume` back into:

- a plain rectangular God Rays box
- a flat projected mask slab

### 3. Keep active flipbook rendering based on frame extraction, not raw atlas display

Especially:

- do not make active playback depend on showing the whole atlas and UV-cropping it later
- do not reintroduce per-frame store churn for `currentFrame`
- do not reuse stale `CanvasTexture` dimensions after `Column` / `Row` changes

### 4. Treat WEB scene publish and app-code deploy as separate concerns

Especially:

- `WEB` scene push does not guarantee the deployed player JS is fresh
- if new published-scene features seem ignored in iframe, verify player code deploy separately

### 5. Preserve current responsive camera model

Especially:

- keep the three explicit presets `landscape / portrait / square`
- do not reintroduce half-working `AUTO` framing without a very deliberate design
- keep `21:9` support working in editor, local preview, and published player

## Recommended Next Steps

Most sensible future work from here:

1. Add a calmer `pending / timeout` visual treatment in `WEB DEPLOY`, because it currently reads a bit too error-like.
2. If atlas loading still feels too hitchy on very large sheets, investigate deeper optimization such as `createImageBitmap` and/or `OffscreenCanvas`.
3. If heavy scenes still struggle, add an explicit lighter editor-preview mode for flipbook + volumetrics together.

What is not the best next step:

- reverting flipbook back to raw-atlas-first behavior
- reintroducing per-frame store churn for preview convenience
- bringing back `AUTO` framing in an ambiguous state
- assuming `WEB` implies full production deploy of all app code

## Most Relevant Files Right Now

- `CODEX_HANDOFF.md`
- `vite.config.ts`
- `src/store/editorStore.ts`
- `src/components/Sidebar.tsx`
- `src/components/Viewport.tsx`
- `src/app/PublishedPlayerApp.tsx`
- `src/features/publish/exportWebPackage.ts`
- `src/features/publish/buildPublishedScene.ts`
- `src/features/scene/runtime/ConfigController.tsx`
- `src/features/scene/runtime/ViewerSync.tsx`
- `src/styles.css`
- `src/components/Inspector.tsx`
- `src/components/AtlasVisualizer.tsx`
- `src/components/MaterialEffectController.tsx`
- `src/features/atlas/useAtlasAnimator.ts`
- `src/features/scene/runtime/shared.ts`
- `src/components/viewport/effects/GodRaysVolume.tsx`
- `src/components/viewport/effects/GodRaysDust.tsx`
- `src/components/viewport/effects/StencilVolume.tsx`
