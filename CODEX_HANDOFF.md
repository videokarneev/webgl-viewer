# Codex Handoff

Last updated: 2026-05-20

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

## Current Git State

Working tree was clean at the time of this handoff.

Recent commits relevant to current debugging:

- `a555ac6` Update demo-01 scene audio
- `93dec8d` Add dedicated transparent published viewport
- `8c642c0` Add transparent canvas diagnostic mode
- `04fd7fa` Force alpha renderer for transparent canvases

## What Is Working

### 1. Published player mode exists

The app can boot into a clean player mode from the same Vite app:

- `src/main.tsx` checks `?player=1`
- editor mounts `App`
- player mounts `PublishedPlayerApp`

Main file:

- `src/app/PublishedPlayerApp.tsx`

### 2. Local publish preview works

There is a local preview path:

- `RUN Local` builds publish JSON
- saves it to `localStorage`
- opens a clean tab with `?player=1&preview=...`

### 3. Web package export exists

There is now a web package export flow:

- `WEB Package` builds a zip
- writes `scene.json`
- copies referenced assets into `assets/...`
- rewrites asset URLs in `scene.json` to relative package paths

Main file:

- `src/features/publish/exportWebPackage.ts`

### 4. Vercel deploy is live

Current deployed viewer domain:

- `https://webgl-viewer-jet.vercel.app`

Current published demo scene URL:

- `https://webgl-viewer-jet.vercel.app/scenes/demo-01/scene.json`

Current player URL format:

- `https://webgl-viewer-jet.vercel.app/?player=1&scene=...`
- transparent embed attempts use `transparent=1`

### 5. Manual web scene update flow works

User now updates published web scene by replacing files in:

- `public/scenes/demo-01/scene.json`
- `public/scenes/demo-01/assets/...`

Then:

- `git add public/scenes/demo-01`
- `git commit -m "..."`
- `git push origin main`

Vercel autodeploys from `main`.

### 6. Scene package / content updates work

Confirmed working recently:

- replacing scene package in `public/scenes/demo-01`
- republishing atlas/audio
- player pulling updated files from Vercel

### 7. Previous material/runtime issues already fixed

Fixed in earlier work:

- relative asset URLs in published `scene.json` are resolved relative to the JSON URL
- original material textures such as `normalMap` are preserved during flipbook overrides
- scene audio updates and playback work in published player

## Important Current URLs

### Live player

- `https://webgl-viewer-jet.vercel.app/?player=1&scene=https%3A%2F%2Fwebgl-viewer-jet.vercel.app%2Fscenes%2Fdemo-01%2Fscene.json`

### Live transparent player attempt

- `https://webgl-viewer-jet.vercel.app/?player=1&transparent=1&scene=https%3A%2F%2Fwebgl-viewer-jet.vercel.app%2Fscenes%2Fdemo-01%2Fscene.json`

### iframe transparency diagnostic HTML

- `https://webgl-viewer-jet.vercel.app/iframe-transparency-test.html`

### R3F/WebGL transparent canvas diagnostic

- `https://webgl-viewer-jet.vercel.app/?player=1&transparent=1&diag=canvas`

## The Big Unresolved Problem

### Transparent iframe player still shows an opaque dark square

The user wants:

- black site section background from the site itself
- only the ring rendered on top
- embed must remain an `iframe`

What still happens:

- inside the `iframe`, a centered dark opaque square remains
- the ring is rendered inside that square
- this happens even after many transparent player changes

## What Was Already Tested

### Confirmed NOT the problem

1. The site block / iframe container itself

- diagnostic plain HTML iframe page proved full iframe transparency works
- user tested two variants and confirmed transparency was 100%

2. Scene export JSON by itself

- issue still reproduces even outside the normal scene path

3. Bloom / postprocessing in the published scene path

- transparent path was already isolated from old `Viewport` post-FX
- the issue still remained

4. Regular scene background setup alone

- we already tried:
  - transparent CSS for `html`, `body`, `#app`
  - skipping scene background assets
  - forcing `backgroundMode = none`
  - forcing environment background off
  - bypassing environment/background manager logic

5. Old `Viewport` wrapper as the only cause

- a dedicated transparent published viewport path was added
- the issue still remained

### Very Important Diagnostic Result

The strongest finding so far:

- `iframe-transparency-test.html` is fully transparent in the same site/embed context
- but `?player=1&transparent=1&diag=canvas` still shows the opaque dark square

This means:

- the browser can display a transparent iframe in that context
- the site/container can show transparency
- the remaining problem is inside the current WebGL/R3F canvas path or how that canvas is composited

## Current Transparency Debugging State

### Changes already made in code

Published player transparency work touched:

- `src/app/PublishedPlayerApp.tsx`
- `src/components/TransparentPublishedViewport.tsx`
- `src/components/TransparentCanvasDiagnostic.tsx`
- `src/styles.css`

Important things now in repo:

1. `TransparentPublishedViewport`

- dedicated transparent published canvas path for `transparent=1`
- intended to bypass old `Viewport` editor/runtime scaffolding

2. `TransparentCanvasDiagnostic`

- minimal R3F torus render
- no published scene loading
- no export scene JSON dependency
- no material runtime/state hydration complexity

3. `iframe-transparency-test.html`

- plain HTML/CSS diagnostic page
- confirmed transparent in iframe

### Current conclusion from diagnostics

Because even `diag=canvas` still shows the dark square:

- this is likely not caused by exported scene data
- not caused by environment background wiring
- not caused by bloom
- not caused by the outer iframe itself

The likely remaining source is one of:

1. browser/WebGL canvas alpha compositing behavior in this exact R3F setup
2. how R3F/Canvas is creating or owning the renderer/canvas
3. some remaining opaque render target / canvas clear path despite the explicit alpha config

## Files Most Relevant To Continue Transparency Debugging

- `src/app/PublishedPlayerApp.tsx`
- `src/components/TransparentPublishedViewport.tsx`
- `src/components/TransparentCanvasDiagnostic.tsx`
- `src/styles.css`

Secondary but still relevant:

- `src/components/Viewport.tsx`
- `src/components/SceneCanvas.tsx`
- `src/features/scene/runtime/LoadedSceneRoot.tsx`
- `src/components/viewport/EnvironmentManager.tsx`
- `src/components/viewport/PostEffects.tsx`

## Good Next Steps

The next debugging pass should start from this exact conclusion:

1. Do not keep blaming iframe/container/CSS alone.
2. Do not keep blaming bloom alone.
3. Treat this as a WebGL/R3F transparency/compositing issue because `diag=canvas` reproduces it.

Most promising next moves:

1. inspect whether the actual canvas produced by `@react-three/fiber` is composited opaque despite `alpha: true`
2. compare with a raw manual `THREE.WebGLRenderer` mount outside `Canvas`
3. if needed, create a no-R3F pure Three.js transparent diagnostic route
4. if raw Three.js is transparent but R3F is not, the problem is in the current `Canvas` stack/config

## User Workflow / Collaboration Notes

The user is now comfortable with this manual publish flow:

- replace files in `public/scenes/demo-01`
- commit/push
- wait for Vercel
- test on site

The user specifically asked that this handoff be updated before continuing further transparency work.

## Validation

Passing before this handoff:

- `npx tsc --noEmit`
- `npx vite build`
