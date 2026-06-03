# Codex Handoff

Last updated: 2026-06-04

## Project

React + TypeScript + Vite scene editor / GLB viewer built on:

- React
- Zustand
- Three.js
- `@react-three/fiber`
- `@react-three/drei`

Primary state:

- `src/store/editorStore.ts`

Main entrypoints:

- editor: `src/main.tsx` -> `src/app/App.tsx`
- published player: `src/main.tsx` -> `src/app/PublishedPlayerApp.tsx`

## Current Git State

Current branch:

- `main`

Latest confirmed working commit:

- `b4aba9d` `Tune showcase header auto inset`

Recent showcase commits:

- `b4aba9d` `Tune showcase header auto inset`
- `a77e171` `Pin transparent showcase below page header`
- `0d62c47` `Remove locked showcase edge overscan`
- `3bea647` `Fit locked showcase directly to iframe`
- `78a9e3b` `Force locked showcase to fill iframe`
- `9a894b8` `Clarify auto frame format selection state`
- `3cddb1b` `Tune showcase inset and parallax strength`
- `8fac5f3` `Add showcase frame insets and motion fallback`
- `ff783bf` `Render locked showcase as interior planes`
- `fe3a371` `Fit locked showcase to published iframe bounds`

Current worktree expectation after writing this file:

- `CODEX_HANDOFF.md` is intentionally dirty until committed.
- No scene republish is required for the current player framing changes.

## Validation

Passing at the end of the working showcase pass:

- `npx tsc --noEmit`
- `npx vite build`

Vite still prints the usual chunk-size warning, but the build succeeds.

## Critical Publish Reminder

`WEB` scene publish and player/app deployment are different things.

- Scene data lives under `public/scenes/<slug>`.
- Player code changes must be committed and pushed so Vercel deploys the app.
- The current framing fixes are player-code fixes, not scene-data fixes.
- Do not republish `demo-03` just to pick up these latest framing changes.

If something works locally but not on `karneev.org`:

1. Verify Vercel deployed the latest app commit.
2. Hard refresh the browser.
3. Verify the Tilda iframe points at the direct player URL.
4. Only then consider scene republish.

## Current Live Showcase Setup

Current scene:

- `public/scenes/demo-03/scene.json`
- published scene schema version: `17`
- contains one `Phone Box`
- contains `assets/model/scene-model-ring.glb`
- `camera.frameAspectPreset = "auto"`
- `phoneScreenBoxes[0].screenBinding.lockToFrame = true`
- `phoneScreenBoxes[0].screenBinding.margin = 0`

Recommended iframe for Tilda:

```html
<iframe src="https://webgl-viewer-jet.vercel.app/?player=1&scene=https%3A%2F%2Fwebgl-viewer-jet.vercel.app%2Fscenes%2Fdemo-03%2Fscene.json&transparent=1" width="100%" height="700" style="border:0;display:block;width:100%;" allow="autoplay; fullscreen; accelerometer; gyroscope; magnetometer"></iframe>
```

Important:

- The iframe should not need a scene republish.
- `allow` should keep `accelerometer`, `gyroscope`, and `magnetometer`.
- Current player auto-applies a top safe-area for transparent iframes.
- If the visual alignment changes again, tune the auto inset before changing geometry.

## Phone Showcase Current Behavior

The desired illusion:

- The iframe/phone screen is a portal.
- The nearest opening/rim is visually locked to the screen.
- Motion should affect the interior depth, not rotate the whole box.
- The user should feel there is a recessed space inside the phone.

What is implemented now:

- Locked showcase uses only five interior planes, not thick exterior box slabs.
- The exterior shell was removed for locked rendering.
- The closest four opening points are fitted to the iframe/player safe area.
- The far plane and side/floor/ceiling planes create depth.
- Mouse can imitate gyro locally through `mouse+gyro`.
- Device orientation and device motion fallback are wired.
- Phone Box content can now explicitly attach scene object ids through
  `phoneScreenBoxes[].content.attachedObjectIds`.
- Attached objects are not deformed. In locked showcase mode they are restored
  from their stored transform each frame and receive a depth-based portal
  offset/tilt according to their local Y position inside the box.
- Editor UI exposes this first pass in `SCN -> Primitives -> Phone Content`:
  select a model/mesh, then use `Attach selected` for the target Phone Box.
- In the editor viewport, locked showcase camera behavior is active only while
  a Phone Box or its material is selected. Published/transparent runtime still
  auto-runs the locked showcase camera.
- Published player keeps stable root ids for Phone Box/effects during publish
  id normalization so they do not collide with the loaded GLB root.
- Published locked Phone Box camera is preferred over saved responsive camera
  presets, including scenes with attached model content.
- Attached content motion has a minimum depth ratio so models whose pivot sits
  near the portal opening still respond visibly to mouse/gyro parallax.
- `ShowcaseInteractionController` must run after material and animation
  controllers in both `Viewport` and `TransparentPublishedViewport`, so the
  Phone Box portal transform is the final visual transform for attached
  content in a frame.
- Attached content is restored to its saved base transform before each portal
  update. The previous frame's portal targets are also restored, so objects do
  not keep temporary offsets after the active showcase changes.
- In the editor, selected attached content still receives portal motion while
  a transform mode is active; portal motion is suspended only while the gizmo is
  actively being dragged, to avoid writing temporary parallax into saved object
  transforms.
- If published attached object ids fail to resolve back to loaded GLB runtime
  ids, the player falls back to the single loaded model root instead of clearing
  Phone Box content.
- In published/runtime mode, a single loaded model root is also used as Phone
  Box content when `attachedObjectIds` is empty. Editor mode does not do this
  because `lockOnlyWhenSelected` is true there.
- Motion sensor listens to both `deviceorientation` and
  `deviceorientationabsolute`, with `devicemotion` fallback still present.
- `devicemotion` fallback is no longer suppressed by recent orientation events;
  some Android/WebView browsers emit orientation events that are present but too
  flat/zeroed for useful content parallax.
- Motion sample now carries `yaw` from `DeviceOrientationEvent.alpha`, measured
  as a baseline-relative signed delta. Attached Phone Box content uses that yaw
  as an extra rotation around the screen vertical axis, with mouse horizontal
  movement as a weaker desktop fallback.

Most relevant files:

- `src/features/scene/runtime/phoneScreenBoxRuntime.ts`
- `src/features/scene/runtime/CustomSceneBoxes.tsx`
- `src/features/scene/runtime/ShowcaseInteractionController.tsx`
- `src/features/scene/runtime/useShowcaseMotionSensor.ts`
- `src/components/Viewport.tsx`
- `src/components/Sidebar.tsx`
- `src/app/PublishedPlayerApp.tsx`

## Framing And Inset Notes

Important framing decisions:

- `Frame Format = AUTO` means the scene uses the actual container/iframe aspect.
- `AUTO` is highlighted green and excludes other frame format highlights.
- Locked showcase bypasses fixed preset letterboxing in published transparent mode.
- `LOCKED_OPENING_EDGE_FILL` is currently `1`, not `1.01` or `1.22`.
- Avoid reintroducing overscan unless the user explicitly asks for cropping beyond the iframe.

Current auto top safe-area:

- desktop: `64px`
- mobile: `52px`
- defined in `getPublishedViewportFrameInsets` in `src/components/Viewport.tsx`

Why this exists:

- On `karneev.org`, the site header visually competes with the top of the showcase.
- The current user-approved result uses a tuned top inset so the top portal edge sits correctly near the menu boundary.
- Earlier values `80px / 92px` created a visible black gap.

If the top alignment needs more tuning:

- Change only the `autoTopInset` values first.
- Use explicit URL params only for testing:
  - `frameInsetTopDesktop=<px>`
  - `frameInsetTopMobile=<px>`
  - `frameInsetTop=<px>` or `frameInsetTop=auto`
- Do not move the iframe block in Tilda unless the user explicitly wants layout changes outside WebGL.

## Gyro And Parallax

Current parallax:

- `LOCKED_FRAME_PARALLAX_SCALE = 1.625`
- file: `src/features/scene/runtime/ShowcaseInteractionController.tsx`

Current behavior:

- For locked showcase, the camera stays fixed.
- Geometry is sheared by depth ratio so near vertices remain fixed and far vertices move.
- This prevents the whole box from rotating like a tray.

If continuing motion work:

- Keep the closest opening/rim pinned.
- Move only depth/far geometry.
- Do not restore whole-object rotation.
- Be careful with vertical axis behavior; previous attempts made the whole box drift vertically.

## Material / Lighting Notes

Current locked showcase geometry is planar interior geometry:

- back plane
- left wall
- right wall
- top/ceiling plane
- bottom/floor plane

The user disliked polygons in one plane having visibly different lighting. Keep planar faces consistent and avoid splitting same-plane lighting into visibly unrelated chunks unless intentionally stylized.

## Live Debugging Lessons From This Pass

Several mistakes were corrected:

- Do not assume the scene needs republishing when the player code changed.
- Do not assume Tilda menu overlap if the iframe is already below the menu.
- Do not use large overscan to hide black gutters; it clips the top portal edge.
- Do not treat `frameInsetTop` as a physical iframe shift unless that is explicitly intended.
- If a black gap appears between menu and scene, the top inset is too large.

## Other Features To Preserve

God Rays:

- Preserve global direction/noise behavior.
- Preserve published runtime restoration.
- Relevant files: `src/components/viewport/effects/GodRays.tsx`, `src/features/publish/buildPublishedScene.ts`, `src/app/PublishedPlayerApp.tsx`.

Stencil Volume:

- Preserve editor support and publish/runtime support.
- Relevant files: `src/components/viewport/effects/StencilVolume.tsx`, `src/features/publish/buildPublishedScene.ts`, `src/app/PublishedPlayerApp.tsx`.

Flipbook:

- Runtime preview frame state should stay separate from persisted material settings.
- Atlas source/frame-grid changes must reset texture state correctly.
- Relevant files: `src/features/atlas/useAtlasAnimator.ts`, `src/components/MaterialEffectController.tsx`, `src/components/Inspector.tsx`, `src/components/AtlasVisualizer.tsx`, `src/store/editorStore.ts`.

## Immediate Next Steps

If showcase work resumes:

1. Verify live Vercel deployment has latest commit.
2. Check desktop and mobile with the existing Tilda iframe.
3. If the top edge is off, tune `autoTopInset` in `src/components/Viewport.tsx`.
4. If motion needs refinement, tune `ShowcaseInteractionController` shear/parallax, not object rotation.
5. Only republish `demo-03` if scene content changes, not for player framing code.
