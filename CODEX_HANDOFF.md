# Codex Handoff

Last updated: 2026-05-19

## Project

React + TypeScript + Vite scene editor / GLB viewer built on:

- React
- Zustand
- Three.js
- `@react-three/fiber`
- `@react-three/drei`

Primary store / source of truth:

- `src/store/editorStore.ts`

Main entrypoints:

- editor: `src/main.tsx` -> `src/app/App.tsx`
- published player: `src/main.tsx` -> `src/app/PublishedPlayerApp.tsx`

## What We Actually Did

This branch is now focused on 5 things:

1. local published-scene preview in a clean player mode
2. publish JSON carrying asset URLs, not just labels
3. frame aspect presets + viewport frame guides
4. standard HDRI presets + cleaner material environment override flow
5. background scene audio with editor preview + published autoplay support

Recent base commits before current dirty worktree:

- `a0b1d63` Refine scene animation, publish JSON, and material effect runtime
- `35e928a` Refine material effects workflow and outliner sync
- `f1ec98c` Refine material inspector layout and scene editing workflows
- `83b77a4` Add multi-model scene editing and anchor transform tools

## Current Dirty Worktree

There are active uncommitted changes in:

- `src/app/App.tsx`
- `src/app/PublishedPlayerApp.tsx`
- `src/main.tsx`
- `src/store/editorStore.ts`
- `src/components/BackgroundAudioController.tsx`
- `src/components/Viewport.tsx`
- `src/components/Sidebar.tsx`
- `src/components/TopBar.tsx`
- `src/components/Inspector.tsx`
- `src/components/AssetController.tsx`
- `src/components/AssetDock.tsx`
- `src/components/Outliner.tsx`
- `src/components/MaterialEffectController.tsx`
- `src/features/publish/buildPublishedScene.ts`
- `src/features/publish/publishNodeIds.ts`
- `src/features/scene/buildSceneGraph.ts`
- `src/features/scene/runtime/AssetController.tsx`
- `src/features/scene/runtime/ConfigController.tsx`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`
- `src/features/environment/standardEnvironmentPresets.ts`
- `src/styles.css`
- `public/textures/City_Night_Lights.hdr`

## Main Features Now

### 1. Published player mode exists again

The app can now boot into a clean player mode from the same Vite app:

- `src/main.tsx` checks `?player=1`
- editor mounts `App`
- player mounts `PublishedPlayerApp`

The player route:

- resets editor state
- loads published scene JSON from `localStorage` preview key or `?scene=...`
- loads model / atlas / environment assets from published URLs
- applies transforms, material settings, material overrides, flipbook effect, rotate animation, lights, camera, viewer, and scene audio
- renders without editor chrome
- disables selection and gizmo interaction
- enforces exported frame aspect

Main files:

- `src/app/PublishedPlayerApp.tsx`
- `src/components/Viewport.tsx`
- `src/features/publish/publishNodeIds.ts`

### 2. `RUN Local` preview works

There is now a local preview path for published scenes:

- `openPublishedScenePreview()` builds publish JSON
- saves it into `localStorage`
- opens a clean tab with `?player=1&preview=...`

Buttons were wired in:

- `src/components/Sidebar.tsx`
- `src/components/TopBar.tsx`

This is the best current verification path for publish/player behavior.

### 3. Publish JSON is richer now

`buildPublishedScene.ts` now exports actual URLs alongside labels for:

- model
- environment
- background
- material environment override
- material custom textures
- flipbook atlas
- background audio

It also exports:

- `camera.frameAspectPreset`
- `viewer.postEffectsEnabled` without coupling it to editor HUD visibility
- scene audio block

Important file:

- `src/features/publish/buildPublishedScene.ts`

### 4. Viewport framing/composition is much better

Viewer state now includes:

- `frameAspectPreset`
- `frameGuidesEnabled`

Supported aspect presets:

- `1:1`
- `3:2`
- `2:3`
- `16:9`
- `9:16`

Current behavior:

- editor viewport can show frame guides/masks
- published player can hard-enforce the frame window
- player disables auto-framing on load so it respects exported camera state

Main files:

- `src/store/editorStore.ts`
- `src/components/Viewport.tsx`
- `src/components/Sidebar.tsx`
- `src/features/scene/runtime/ConfigController.tsx`

### 5. Standard HDRI presets are now formalized

Built-in environment presets:

- `Studio`
- `City Night Lights`

Source:

- `src/features/environment/standardEnvironmentPresets.ts`

Assets:

- `public/textures/Studio.exr`
- `public/textures/City_Night_Lights.hdr`

The default environment URL now comes from the preset list instead of a hardcoded string.

### 6. Material environment override flow was cleaned up

The material HDRI override UI was reworked:

- native `select` instead of the older custom dropdown behavior
- built-in HDRI presets are shown as standard options
- scene environment label is normalized better
- standard HDRI detection works by URL too, not only label
- only active custom material HDRI can be deleted
- built-in presets and scene HDRI are not deletable

Runtime side:

- equirectangular material env textures are PMREM-converted in runtime asset controller
- published player can recreate material env overrides from exported asset URLs

Main files:

- `src/components/Inspector.tsx`
- `src/features/scene/runtime/AssetController.tsx`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`

### 7. Background scene audio exists

A new `backgroundAudio` state block was added to the store.

Current capabilities:

- audio can be added/removed at scene level
- editor has preview play/pause and scrub state
- volume and loop are configurable
- player can autoplay when published scene says audio is enabled
- blocked autoplay retries on first user interaction

Main files:

- `src/components/BackgroundAudioController.tsx`
- `src/components/Sidebar.tsx`
- `src/store/editorStore.ts`
- `src/app/PublishedPlayerApp.tsx`

## Important Runtime/Data Changes

### Asset state now stores URLs and file sizes

The store now tracks URL metadata for loaded assets:

- `modelUrl`
- `atlasUrl`
- `reflectionsUrl`
- `backgroundUrl`
- file sizes where available

Material texture slot state now also tracks:

- `originalUrl`
- `customUrl`
- `customFileSize`

Material environment assets now can store:

- `assetUrl`
- `fileSize`

### Blob URL lifetime got safer

`src/components/AssetController.tsx` now tracks whether a URL is owned and should be revoked later.

This avoids revoking preview/runtime asset URLs too early and is important for:

- `RUN Local`
- published player
- user-loaded atlas / HDRI / model assets

### Publish IDs were extracted

Publish node ID generation now lives in:

- `src/features/publish/publishNodeIds.ts`

This is used both by:

- publish export
- published player reverse mapping back into runtime/store IDs

### Extra lights can be replaced wholesale

Store now has:

- `replaceExtraLights()`

This is used by the published player to rebuild scene lights from published JSON.

## Current UX State

### Player mode intentionally removes editor behavior

Published player currently uses:

- `showChrome={false}`
- `allowSelection={false}`
- `enforceFrameAspect`
- `autoFrameOnLoad={false}`

This means:

- no inspector/sidebar
- no transform toolbar
- no selection highlight
- no anchor handles
- no transform gizmo
- no click-to-select on meshes

### Local preview is still not a real export package

What works:

- open local preview in clean tab
- hydrate scene from publish JSON
- use live URLs / blob URLs

What is still missing:

- packaging/copying assets into standalone export output
- producing a portable self-contained published bundle
- cleanup policy for preview `localStorage` entries

## Best Files To Start From Next Time

If next task is publish/player:

- `src/app/PublishedPlayerApp.tsx`
- `src/features/publish/buildPublishedScene.ts`
- `src/features/publish/publishNodeIds.ts`
- `src/components/Viewport.tsx`
- `src/store/editorStore.ts`

If next task is material HDRI:

- `src/components/Inspector.tsx`
- `src/features/environment/standardEnvironmentPresets.ts`
- `src/features/scene/runtime/AssetController.tsx`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`

If next task is scene audio:

- `src/components/BackgroundAudioController.tsx`
- `src/components/Sidebar.tsx`
- `src/store/editorStore.ts`
- `src/app/PublishedPlayerApp.tsx`

If next task is frame/composition UI:

- `src/components/Viewport.tsx`
- `src/components/Sidebar.tsx`
- `src/store/editorStore.ts`
- `src/features/scene/runtime/ConfigController.tsx`

## Risks / Sensitive Areas

The most fragile parts right now are:

1. publish/player still depend on live asset URLs rather than packaged assets
2. material environment override logic is much cleaner, but still concentrated in `src/components/Inspector.tsx`
3. background audio behavior depends on browser autoplay policy
4. published player currently assumes the first published model is the primary runtime load path
5. preview data in `localStorage` is not automatically cleaned up

## Validation

Passing on current dirty worktree:

- `npx tsc --noEmit`
