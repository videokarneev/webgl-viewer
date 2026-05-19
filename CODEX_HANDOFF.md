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
- `0a78fbb` Add WebGL transparency diagnostic and embed background fallback
- `85e76f8` Report WebGL alpha diagnostic data
- `9a045d0` Add Vite DOM transparency diagnostic

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

### Transparent diagnostics

- `https://webgl-viewer-jet.vercel.app/?player=1&transparent=1&diag=canvas`
- `https://webgl-viewer-jet.vercel.app/?player=1&transparent=1&diag=rawthree`
- `https://webgl-viewer-jet.vercel.app/?player=1&transparent=1&diag=webgl`
- `https://webgl-viewer-jet.vercel.app/?player=1&transparent=1&diag=dom`

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

### Very Important Diagnostic Results

Strongest findings so far:

- `iframe-transparency-test.html` is fully transparent in the same site/embed context
- `?player=1&transparent=1&diag=canvas` still showed the opaque dark square
- `?player=1&transparent=1&diag=rawthree` still showed the opaque dark square
- `?player=1&transparent=1&diag=webgl` still showed the opaque dark square, but reported `context alpha: true`, `clear alpha: 0`, and `corner pixel rgba: 0,0,0,0`
- `?player=1&transparent=1&diag=dom` still showed the dark square even with no canvas/WebGL at all

This means:

- the browser can display a transparent iframe in that context
- WebGL itself is producing transparent pixels
- the remaining dark rectangle is not caused by Three, R3F, Bloom, scene JSON, or WebGL clear alpha
- the remaining source is either the Vite document/root DOM background or the page/container behind the iframe

## Current Transparency Debugging State

### Changes already made in code / currently in progress

Published player transparency work touched:

- `src/main.tsx`
- `src/app/PublishedPlayerApp.tsx`
- `src/components/TransparentPublishedViewport.tsx`
- `src/components/TransparentCanvasDiagnostic.tsx`
- `src/components/TransparentDomDiagnostic.tsx`
- `src/components/TransparentRawThreeDiagnostic.tsx`
- `src/components/TransparentRawWebGlDiagnostic.tsx`
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

Because `diag=dom` still shows the dark square:

- this is not caused by exported scene data
- not caused by environment background wiring
- not caused by bloom/postprocessing
- not caused by R3F/Three/WebGL renderer alpha
- not caused by the canvas pixels themselves

The likely remaining source is one of:

1. a remaining opaque root/background layer in the Vite app document
2. the `iframe` becoming transparent correctly and revealing a black center wrapper/background on the host page
3. browser/site CSS around the iframe setting the iframe slot/background to black

## Files Most Relevant To Continue Transparency Debugging

- `src/main.tsx`
- `src/app/PublishedPlayerApp.tsx`
- `src/components/TransparentPublishedViewport.tsx`
- `src/components/TransparentCanvasDiagnostic.tsx`
- `src/components/TransparentDomDiagnostic.tsx`
- `src/components/TransparentRawWebGlDiagnostic.tsx`
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
3. Do not keep blaming WebGL/R3F alone because raw WebGL reports transparent pixels and `diag=dom` reproduces the dark square without canvas.

Most promising next moves:

1. deploy the root DOM transparent reset in `src/main.tsx` and `src/styles.css`
2. test `?player=1&transparent=1&diag=dom` again after Vercel deploy
3. if `diag=dom` still shows black, inspect/adjust the host page iframe wrapper because the Vite app content is transparent and the black is behind it
4. if `diag=dom` becomes transparent but the real player does not, return to the dedicated transparent player viewport path

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
