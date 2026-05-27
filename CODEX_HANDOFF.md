# Codex Handoff

Last updated: 2026-05-28

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

## Dirty Worktree

The worktree is dirty. Do not blindly revert files.

Especially read carefully before changing:

- `CODEX_HANDOFF.md`
- `src/store/editorStore.ts`
- `src/components/Sidebar.tsx`
- `src/components/Outliner.tsx`
- `src/components/SceneManager.tsx`
- `src/components/TopBar.tsx`
- `src/components/Viewport.tsx`
- `src/components/viewport/TransformTable.tsx`
- `src/components/viewport/effects/GodRaysBox.tsx`
- `src/components/viewport/effects/GodRaysBoxes.tsx`
- `src/components/viewport/effects/GodRaysDust.tsx`
- `src/components/viewport/effects/GodRaysVolume.tsx`
- `src/components/viewport/effects/StencilVolume.tsx`
- `src/components/viewport/effects/StencilVolumes.tsx`
- `src/features/stencilVolume/maskContour.ts`
- `src/features/publish/buildPublishedScene.ts`
- `src/features/publish/exportWebPackage.ts`
- `src/app/PublishedPlayerApp.tsx`
- `src/styles.css`

There are also effect / stencil directories that may still be shown as new/untracked depending on local git state:

- `src/components/viewport/effects/`
- `src/features/stencilVolume/`

## Big Picture

Two effect tracks matter:

1. `God Rays` are stable and are the reference behavior model.
2. `Stencil Volume` is now feature-complete enough for editor + publish/runtime use.

Important distinction:

- `God Rays` are the canonical simple volumetric beam.
- `Stencil Volume` is the complex mask-derived grouped beam system that mirrors God Rays semantics where possible.

## God Rays: Stable Reference

`God Rays` are the visual / behavior reference for volumetric lighting.

Semantics that should be preserved:

- pivot at lower-plane center
- height from object `scale.y`
- width / depth from object scale
- `DIR` editing is rotate-based
- global/local noise semantics stay intact
- global/local dust direction semantics stay intact
- roll is not clamped away during direction editing

Relevant files:

- `src/components/viewport/effects/GodRaysBox.tsx`
- `src/components/viewport/effects/GodRaysBoxes.tsx`
- `src/components/viewport/effects/GodRaysVolume.tsx`
- `src/components/viewport/effects/GodRaysDust.tsx`
- `src/components/viewport/effects/godRaysShared.ts`

## Dust: Important Current Status

This session changed dust behavior in an important way.

For both `God Rays` and `Stencil Volume`:

- dust now uses world-space motion behavior
- rotating the effect should no longer rotate the perceived dust movement pattern
- this is not just a global direction fix; the actual dust simulation path was moved toward world-space behavior

Relevant files:

- `src/components/viewport/effects/GodRaysDust.tsx`
- `src/components/viewport/effects/StencilVolume.tsx`
- `src/store/editorStore.ts`

If future changes touch dust:

- do not accidentally regress back to local-space motion
- especially test by rotating the effect object and confirming dust motion still reads global

## Naming / Outliner Status

Effect naming was normalized.

Current intended naming:

- first effect: `God Rays` / `Stencil Volume`
- second effect: `God Rays 2` / `Stencil Volume 2`
- there should be no unnecessary `1` suffix on the first instance

Also:

- `Stencil Volume` now appears in the effects outliner list like `God Rays`
- the add-effect button label was changed from `MASK` to `STENCIL`

Relevant files:

- `src/store/editorStore.ts`
- `src/components/Outliner.tsx`
- `src/components/Sidebar.tsx`

## Stencil Volume: Current Editor State

`Stencil Volume` is no longer a scaffold. In the editor it now supports:

- mask loading
- silhouette contour extraction
- contour simplify / smooth / min-area filtering
- `END` editing
- contour debug
- projection plane preview
- grouped irregular ray primitives
- God Rays-style noise semantics
- God Rays-style dust semantics

Important editor UX decisions already made:

- add-effect button is `STENCIL`
- upload row shows `Load MASK` + filename
- there is a square mask preview area in the sidebar
- `Extrude` sits directly under the mask preview
- `Show Helper` defaults to enabled
- `Invert Mask` was removed from the sidebar UI
- `Width` / `Height` are compact numeric inputs in one row
- default source size is `200 x 200 cm` in cm mode
- `RAYS` and `DUST` are collapsible sections
- `DUST` is collapsed by default

Important helper behavior:

- grey helper visuals should not linger after deselection
- `Stencil Volume` guide rendering now depends on selection or active `END` editing, not just `helperVisible`

Relevant files:

- `src/components/Sidebar.tsx`
- `src/styles.css`
- `src/components/viewport/effects/StencilVolume.tsx`
- `src/components/Viewport.tsx`
- `src/components/viewport/TransformTable.tsx`

## Stencil Volume: Runtime / Architecture Status

Current mental model remains:

- `mask -> closed contours -> grouped irregular beam primitives`

What is true now in editor/runtime code:

- contour authoring and primitive prep were separated from `END` transforms
- expensive primitive prep no longer needs to rebuild just because `END` moved
- runtime can consume baked contour/primitive data when present

Important store fields added for baked runtime support:

- `bakedContourShapes`
- `bakedPrimitiveShapeGroups`
- `bakedPreparedPrimitives`

These are optional runtime-oriented cached payloads on `StencilVolumeState`.

Relevant files:

- `src/store/editorStore.ts`
- `src/components/viewport/effects/StencilVolume.tsx`
- `src/features/stencilVolume/maskContour.ts`

## Stencil Volume: Publish / Player Status

This is the biggest status change from the previous handoff.

`Stencil Volume` now has a real publish/runtime path.

Current facts:

- publish schema was advanced to `version: 14`
- publish output now carries `stencilVolumes`
- publish builder now bakes stencil contour/runtime data asynchronously
- published player restores `Stencil Volume`
- published runtime does not need live mask contour extraction from the original mask asset

Current baked publish payload for `Stencil Volume` includes:

1. `bakedContourShapes`
2. `bakedPrimitiveShapeGroups`
3. `bakedPreparedPrimitives`

That means published runtime skips:

- live contour extraction
- live contour clustering
- most primitive authoring preparation

This is true for both:

- local published preview
- web package export

Important consequence:

- editor-side `END` editing remains an authoring feature
- published runtime restores the already-baked effect geometry state instead of needing editor workflows

Relevant files:

- `src/features/publish/buildPublishedScene.ts`
- `src/features/publish/exportWebPackage.ts`
- `src/app/PublishedPlayerApp.tsx`
- `src/components/SceneManager.tsx`
- `src/components/TopBar.tsx`

## Stencil Volume: What Is Still Not “Final Final”

`Stencil Volume` is now in a strong usable state, but the absolute next optimization ceiling would be deeper bake work, for example:

- serializing reusable field / SDF runtime data
- serializing even more compact per-primitive runtime assets

That would reduce published runtime cost further, but it is a larger follow-up task and not necessary for the current project state.

In other words:

- current implementation is already solid for editor + local publish + web publish
- next improvements would be optional optimization work, not blockers

## Important Decisions To Preserve

### 1. Do not regress God Rays semantics

Especially:

- global/local noise rules
- global/local direction rules
- rotate-based `DIR`
- unrestricted roll during direction edit

### 2. Keep Stencil Volume tied to God Rays behavior language, not God Rays geometry

The goal remains:

- shared control language
- more complex mask-derived beam shapes

Do not collapse `Stencil Volume` back into:

- a plain rectangular God Rays box
- or a flat projected mask slab

### 3. Keep `END` as internal effect geometry state

`extrudeEnd` is not the object transform.

That separation is still correct.

### 4. Preserve baked publish/runtime path

Do not reintroduce published-player dependence on:

- raw mask contour extraction
- editor-only helper workflows
- editor-only debug state

### 5. Preserve world-space dust behavior

This applies to both:

- `God Rays`
- `Stencil Volume`

## Recommended Next Steps

If someone continues from here, the most sensible future work is:

1. add runtime animation ideas for `Stencil Volume` if the user revisits `END` animation
2. add per-ray selection / per-ray overrides if finer beam control is needed
3. optionally deepen bake/serialization if published runtime needs to be even lighter

What is *not* the best next step:

- random small polish passes on `Stencil Volume` without a product goal
- undoing the baked publish path
- reverting dust motion back to object-local behavior

## Most Relevant Files Right Now

- `CODEX_HANDOFF.md`
- `src/store/editorStore.ts`
- `src/components/Sidebar.tsx`
- `src/components/Outliner.tsx`
- `src/components/Viewport.tsx`
- `src/components/viewport/TransformTable.tsx`
- `src/components/viewport/effects/GodRaysBox.tsx`
- `src/components/viewport/effects/GodRaysBoxes.tsx`
- `src/components/viewport/effects/GodRaysDust.tsx`
- `src/components/viewport/effects/GodRaysVolume.tsx`
- `src/components/viewport/effects/StencilVolume.tsx`
- `src/components/viewport/effects/StencilVolumes.tsx`
- `src/features/stencilVolume/maskContour.ts`
- `src/features/publish/buildPublishedScene.ts`
- `src/features/publish/exportWebPackage.ts`
- `src/app/PublishedPlayerApp.tsx`
