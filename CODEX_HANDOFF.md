# Codex Handoff

Last updated: 2026-05-21

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

## Current Status

The core publish / embed workflow is still working, and the latest change was focused on `Flipbook Animation`.

Confirmed working:

- local scene editing in the GLB Viewer
- `RUN Local` preview flow
- `Publish` flow
- `WEB Package` export flow
- deployed published player on Vercel
- transparent `iframe` embedding for published scenes
- manual scene replacement in `public/scenes/demo-01`
- bloom support in transparent published player
- flipbook animation with arbitrary atlas grid sizes

Still intentionally left as-is:

- audio autoplay in iframe is improved but still limited by browser autoplay policy
- there is no forced click-to-enable audio UI because the user explicitly does not want buttons

## Current Live URLs

Viewer domain:

- `https://webgl-viewer-jet.vercel.app`

Current demo scene JSON:

- `https://webgl-viewer-jet.vercel.app/scenes/demo-01/scene.json`

Current published player:

- `https://webgl-viewer-jet.vercel.app/?player=1&scene=https%3A%2F%2Fwebgl-viewer-jet.vercel.app%2Fscenes%2Fdemo-01%2Fscene.json`

Transparent published player:

- `https://webgl-viewer-jet.vercel.app/?player=1&transparent=1&scene=https%3A%2F%2Fwebgl-viewer-jet.vercel.app%2Fscenes%2Fdemo-01%2Fscene.json`

Useful diagnostics:

- `https://webgl-viewer-jet.vercel.app/?player=1&transparent=1&diag=dom`
- `https://webgl-viewer-jet.vercel.app/?player=1&transparent=1&diag=canvas`
- `https://webgl-viewer-jet.vercel.app/?player=1&transparent=1&diag=rawthree`
- `https://webgl-viewer-jet.vercel.app/?player=1&transparent=1&diag=webgl`
- `https://webgl-viewer-jet.vercel.app/iframe-transparency-test.html`

## What Was Solved Recently

### 1. Transparent iframe player really works

This remains the main published-player milestone from the previous session.

Current result:

- published scenes can be embedded through `iframe`
- the internal opaque rectangle problem is gone
- the site background can show through transparent player mode

Important implementation pieces:

- transparent published player uses the main shared `Viewport` path instead of a divergent special renderer
- DOM/root background reset is applied for transparent published player
- an early pre-React transparent reset runs in `index.html` to prevent startup flashing

Most relevant files:

- `index.html`
- `src/app/PublishedPlayerApp.tsx`
- `src/components/Viewport.tsx`
- `src/styles.css`

### 2. Startup flash was reduced/fixed

The brief dark-blue / editor-like flash at scene startup was addressed with an early transparent bootstrap in `index.html` before React mounts:

- if `?player=1&transparent=1` is present
- `html/body/#app` are immediately forced to transparent or to `bg=...` override
- editor gradient / blue startup background is suppressed for transparent published mode

### 3. Bloom works in transparent published player

This remains fixed.

Cause that was found previously:

- transparent published mode had been explicitly disabling post effects in code

Fix that remains in place:

- `scene.viewer.postEffectsEnabled` is allowed to pass through in transparent mode
- `Viewport` can render `PostEffects` even when `transparentBackground` is true

Relevant files:

- `src/app/PublishedPlayerApp.tsx`
- `src/components/Viewport.tsx`

### 4. Editor dark-blue viewport background was restored

Current intended split:

- the editor / GLB Viewer keeps its dark-blue editor clear color
- published transparent player stays transparent

This separation is intentional and working.

### 5. Flipbook Animation defaults and arbitrary grid sizes were fixed

This was the latest change on 2026-05-21.

User-reported issue:

- `Flipbook Animation` appeared to work only with the old default atlas settings of `2` columns and `25` rows
- those defaults were inherited from a ring asset and were wrong for most other models / atlases

What changed:

- the default flipbook grid is now `1` column and `1` row
- default `frameCount` now starts at `1`
- users are expected to set the real atlas grid manually for each asset

Why the animation could fail before:

- frame extraction used integer-truncated cell sizes via `Math.floor(image.width / columns)` and `Math.floor(image.height / rows)`
- that could break sampling on atlas textures whose dimensions were not evenly divisible by the configured grid

What was fixed in runtime:

- frame extraction now uses fractional source cell sizes instead of truncating them early
- the extracted canvas frame is sized from the computed cell dimensions and marked with `needsUpdate`
- runtime playback still clamps safely to the active grid and works for arbitrary `gridX/gridY` values

Relevant files:

- `src/store/editorStore.ts`
- `src/features/atlas/useAtlasAnimator.ts`

## Audio State

Audio autoplay was tightened, but not fully "solved" because browser policy is the real limiter.

What was improved earlier:

- more aggressive retry points for autoplay
- better retry timing when media becomes ready
- better chances to start playback earlier in published mode

What remains true:

- in iframe embeds, autoplay may still begin 5-15 seconds late depending on browser policy and user interaction
- this is not primarily caused by MP3 size
- this is not something we can guarantee away without a user gesture

User decision:

- leave audio behavior as-is
- do not add any "Enable sound" button

Relevant file:

- `src/components/BackgroundAudioController.tsx`

## Manual Web Scene Update Flow

This is the user's current working flow for replacing a published web scene:

1. Replace files in:
   - `public/scenes/demo-01/scene.json`
   - `public/scenes/demo-01/assets/...`
2. Run:
   - `git add public/scenes/demo-01`
   - `git commit -m "Update demo-01 scene"`
   - `git push origin main`
3. Wait for Vercel auto-deploy
4. Test live player / site embed

This flow is confirmed working.

## Important Behavior Guarantees Going Forward

All current viewer-level fixes should apply to new scenes too, not just `demo-01`.

That includes:

- transparent published iframe support
- no opaque internal background in transparent mode
- early anti-flash startup reset
- transparent-mode bloom support
- editor dark-blue viewport background separation
- improved audio autoplay retry behavior
- flipbook animation defaulting to neutral `1x1`
- flipbook playback working across arbitrary atlas grid sizes

What remains scene-specific:

- camera framing
- whether bloom is enabled in the exported `scene.json`
- environment/background settings
- audio asset itself
- the correct flipbook `gridX/gridY` values for a particular atlas

## Most Relevant Recent Commits

Recent commits that matter for the current state:

- `304fb51` Update demo-01 scene
- `4f9850a` Restore editor viewport clear color
- `21c4e8e` Enable bloom in transparent published player
- `b1ae713` Prevent transparent player startup background flash

Other important older commits from the same debugging arc:

- `21e5c31` Use shared viewport path for transparent published player
- `f95d421` Tighten published audio autoplay retries

## Files Most Relevant If Work Continues

- `CODEX_HANDOFF.md`
- `index.html`
- `src/app/PublishedPlayerApp.tsx`
- `src/components/Viewport.tsx`
- `src/components/BackgroundAudioController.tsx`
- `src/components/viewport/PostEffects.tsx`
- `src/styles.css`
- `src/store/editorStore.ts`
- `src/features/atlas/useAtlasAnimator.ts`
- `public/scenes/demo-01/scene.json`

## Current Git State

Working tree included the latest flipbook-default and atlas-grid runtime fix at the time of this handoff update.

## Validation

Passing during the latest changes:

- `npx tsc --noEmit`
- `npx vite build`
