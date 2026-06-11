# Codex Handoff

Last updated: 2026-06-11

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

Branch:

- `main`

Latest important commits:

- `a3be82b` `Update Codex handoff notes`
- `e61248e` `Update scene mk dust tuning`
- `5b0c402` `Update scene mtg`
- `24f9129` `Stabilize focus return with floating animation`
- `d9ed66a` `Refine focus framing within published viewport`
- `1215d61` `Update scene mtg`
- `117d6f2` `Update scene mtg`
- `5872d75` `Fix published player focus and animation interactions`
- `fdb2f51` `Stabilize volumetric dust particle sampling`
- `06b43e5` `Anchor volumetric dust noise in world space`

Latest push/deploy notes:

- `a3be82b` was pushed to `origin/main`.
- `e61248e` was pushed to `origin/main`.
- `5b0c402` became the ready Production deployment for the latest `mtg` scene update after the Vercel queue cleared.
- The user explicitly asked to update and push this handoff on 2026-06-11.

Recent local work:

- Rain Impacts MVP is implemented and visually confirmed by the user on 2026-06-11.
- The confirmed working path uses a `CanvasTexture` overlay, not the earlier shader-only path.
- Modified files:
  - `src/store/editorStore.ts`
  - `src/components/Inspector.tsx`
  - `src/components/MaterialEffectController.tsx`
  - `src/features/publish/buildPublishedScene.ts`
  - `src/app/PublishedPlayerApp.tsx`
  - `src/features/scene/runtime/materialRuntime.ts`
  - `CODEX_HANDOFF.md`

## Validation

Passing after the latest Rain Impacts work:

- `npx tsc --noEmit`
- `npx vite build`

Vite still prints the usual chunk-size warning, but the build succeeds.

User confirmed the Rain Impacts visual after the canvas-overlay fix. The confirmed preview showed clear animated circular ripples on the MTG card.

## Current Published Site Setup

Current portfolio test page for MTG:

- `https://karneev.org/page147752943.html`

The Tilda page embeds the Vercel player iframe with scene `mtg`:

```text
https://webgl-viewer-jet.vercel.app/?player=1&scene=https%3A%2F%2Fwebgl-viewer-jet.vercel.app%2Fscenes%2Fmtg%2Fscene.json&transparent=1&frameInsetTop=auto
```

Latest confirmed production scene hash for `mtg` matched local after the deployment queue was fixed:

```text
2C25BA7985378DB3ACF615570B8E60F74446EA803BD6A6608D0E2E35C52EE091
```

Earlier phone-ring page:

- `https://karneev.org/ring`

Phone-ring iframe:

```text
https://webgl-viewer-jet.vercel.app/?player=1&scene=https%3A%2F%2Fwebgl-viewer-jet.vercel.app%2Fscenes%2Fphone-ring%2Fscene.json&transparent=1&frameInsetTop=auto
```

The public phone scene is `phone-ring`, not `thelordoftherings`.

Gyro tuning panel is hidden for normal visitors. It appears only with:

```text
&gyroTune=1
```

## MTG Focus / Floating

Relevant file:

- `src/components/SceneAnimationController.tsx`

Current behavior confirmed by the user:

- `Floating` + `Focus` on the same root card now works.
- First click focuses the card toward the camera.
- Second click returns it without the card snapping or getting its transform broken.
- Focus framing now stays much closer to the visible iframe/safe area.

Implementation details to preserve:

- Focus computes a screen-space safe rect from the actual published viewport.
- Safe rect respects `frameInsetTop`, `frameInsetTopDesktop`, `frameInsetTopMobile`, `frameInsetRight`, `frameInsetBottom`, and `frameInsetLeft`.
- Transparent published iframes with `frameInsetTop=auto` get a conservative top inset for desktop/mobile headers.
- Focus fits the object's bounding box by projecting bbox corners into NDC and choosing distance plus X/Y offsets.
- While Focus owns a target, Floating continues its internal phase/progress but does not write object pose for that same target.
- Focus return computes the live Floating world pose from phase instead of trusting the current object transform.

Important constants currently used for safer iframe framing:

```text
FOCUS_FRAME_EDGE_MARGIN_RATIO = 0.09
FOCUS_FRAME_MIN_EDGE_MARGIN_PX = 24
FOCUS_FRAME_MAX_EDGE_MARGIN_PX = 96
autoTopInset mobile = 72
autoTopInset desktop = 96
```

Current `mtg` animation setup:

- Floating target: loaded model/root
- Floating height: `0.04`
- Floating speed: `0.08`
- Floating tilt: `1`
- Focus target: loaded model/root
- Focus front face: `+Z`
- Focus distance: `1.25`
- Focus duration: `1.00s`

If this regresses, do not patch by adding random offsets. First inspect the Focus/Floating ownership path in `SceneAnimationController.tsx`.

## Material Rain Impacts

Goal:

- First MVP of a rain material effect: animated circular ripples from water drops on a selected material.
- This belongs in `Material Effects`, not scene-level FX.
- Falling rain streaks are intentionally deferred to a later separate emitter/tool.

Relevant files:

- `src/store/editorStore.ts`
- `src/components/Inspector.tsx`
- `src/components/MaterialEffectController.tsx`
- `src/features/publish/buildPublishedScene.ts`
- `src/app/PublishedPlayerApp.tsx`

Current UI:

- Select a material.
- Open `Material Effects`.
- Click `RAIN`.
- Active effect row is `Rain Impacts`.
- Controls:
  - `Rate`
  - `Size`
  - `Strength`
  - `Lifetime`
  - `Max Rings`

Important behavior:

- There is no Play button for Rain Impacts.
- The effect should animate automatically whenever `rainImpactsAdded` and `rainImpactsEnabled` are true.
- The eye button in the effect row toggles `rainImpactsEnabled`.
- The trash button removes it with `rainImpactsAdded: false`.

Implementation:

- State is currently added onto `AtlasEffectState`:
  - `rainImpactsAdded`
  - `rainImpactsEnabled`
  - `rainImpactRate`
  - `rainImpactSize`
  - `rainImpactStrength`
  - `rainImpactLifetime`
  - `rainImpactCount`
- `MaterialEffectController` now uses a runtime `CanvasTexture` overlay for the working MVP.
- The canvas redraws the selected original/custom base color texture and paints animated circular wet rings on top.
- The old `onBeforeCompile` shader path remains in the file but is no longer the active render path after the selected mesh kept disappearing.
- It uses fixed effect capacity of 32 rings.
- Active visible ring count is computed from `rate * lifetime`, capped by `Max Rings` and 32.
- Uses one reusable canvas texture per affected material; no particle meshes.
- Requires mesh UVs; if none are found for the material's mesh IDs, the effect is skipped.
- Shader adds both:
  - normal perturbation for ripple relief;
  - subtle color mask so the rings are visible even without strong reflections.

Recent bug and fixes:

- User enabled `RAIN` and the MTG card texture disappeared while no visible rain appeared.
- First likely cause: `ensureMaterialTextureBackup()` could store null original texture slots too early, then restore material maps to null.
- First fix added: when a real texture is later present and is not the custom texture, original backup is repaired.
- User clarified the center white rectangle is a normal separate mesh and should not be fixed.
- Actual remaining symptom after enabling `RAIN`: the selected mesh becomes transparent/invisible and no visible drops appear.
- Follow-up fix added:
  - original texture backups now verify against `originalLabel` / `originalUrl`, so stale white backups can be replaced by the current real original texture;
  - the same backup repair logic was added to `src/features/scene/runtime/materialRuntime.ts` for runtime/published material restores;
  - the rain ring shader no longer uses reversed-edge `smoothstep`, which is undefined GLSL behavior and could produce NaN/white output on some GPUs.
- Second follow-up fix added:
  - rain shader no longer sets custom `USE_UV` in `material.defines`;
  - it now injects its own `vRainImpactUv` varying in vertex/fragment shader chunks and reads directly from geometry `uv`;
  - shader signature includes `RAIN_IMPACT_SHADER_VERSION` so Three recompiles after shader-internal fixes;
  - color overlay was strengthened so rings are visible even before a stronger normal/reflection pass.
- User retested and still saw no visible rain/divorces on the card.
- Third follow-up fix added:
  - active Rain preview now bypasses shader patching and uses a `CanvasTexture` overlay;
  - frame loop order was changed so base/flipbook texture restoration runs before rain overlay drawing, otherwise the rain map could be immediately overwritten;
  - the canvas overlay draws high-contrast dark/light circular ripples directly over `MTG.jpg`.
- User confirmed this canvas-overlay version looked very good.
- Confirmed example settings:
  - Rate: `48.0/s`
  - Size: `0.14`
  - Strength: `0.82`
  - Lifetime: `0.70s`
  - Max Rings: `24`
- Shader was also changed from normal-only to normal plus subtle wet/color ring overlay.

Publish/runtime:

- Published scene version is now `18`.
- `effects.rainImpacts` serializes:
  - `enabled`
  - `rate`
  - `size`
  - `strength`
  - `lifetime`
  - `count`
- `PublishedPlayerApp` restores those values into `updateMaterialEffect()`.

Retest checklist:

1. Hard refresh `localhost:5173`.
2. Load/select MTG material with `Original: MTG.jpg`.
3. Add `RAIN`.
4. Verify the original card texture remains visible.
5. Use the confirmed settings above if the ripples are subtle.
6. Verify rings animate without any Play button.

## Vercel / Publish Workflow

The `WEB` button publishes a scene package into:

- `public/scenes/<scene-slug>`

Scene publishing and runtime/app deployment are different:

- scene content/camera changes need republishing the scene;
- runtime/player code fixes need a normal app commit/push;
- Vercel deploys from GitHub.

The WEB publish status uses `vite.config.ts` endpoint:

```text
/__publish/web-package-status
```

That endpoint compares local scene JSON with production:

```text
https://webgl-viewer-jet.vercel.app/scenes/<slug>/scene.json?verify=...
```

It polls briefly, then may show that Vercel is still pending. That message means production has not matched the local scene yet; it does not necessarily mean git push failed.

Vercel Hobby deployment behavior seen on 2026-06-11:

- only one production build ran at a time;
- one older `Initializing` deployment blocked newer queued deployments;
- after the stuck older deployment was cancelled, the latest build became Ready/Production;
- if this happens again, check the Vercel Deployments list and cancel stuck older builds, then let the latest commit finish.

Publish dialog behavior:

- lists existing scenes;
- defaults to overwriting the latest scene;
- allows selecting an existing scene to replace;
- allows typing a new scene name;
- sanitizes scene slugs.

## Scene Notes

`public/scenes/mtg/scene.json`:

- latest useful pushed commit: `5b0c402`;
- used by the portfolio test page;
- contains the Focus/Floating MTG card interaction described above.

`public/scenes/mk/scene.json`:

- latest pushed commit: `e61248e`;
- dust tuning changed speed from `0.01` to `0.0005555555555555556`;
- dust tuning changed drift from `0.18` to `0.06`.

## Phone Ring Motion

Relevant files:

- `src/features/scene/runtime/useShowcaseMotionSensor.ts`
- `src/features/scene/runtime/ShowcaseInteractionController.tsx`
- `src/features/scene/runtime/showcaseGyroTuning.ts`
- `src/features/scene/runtime/TouchObjectRotationController.tsx`
- `src/components/Viewport.tsx`
- `src/styles.css`

Current gyro tuning defaults chosen by the user:

```text
side=0.30
top=-1.05
tiltX=-0.85
tiltY=-0.45
travel=1.05
smooth=0.80
```

Storage key:

```text
webgl-viewer:showcase-gyro-tuning:v4
```

Current behavior:

- mobile motion uses `deviceorientation` first and treats `devicemotion` as fallback;
- sensor input has gating, smoothing, deadzone, and max-step limiting;
- yaw is used for side reveal;
- vertical phone tilt has an additional `top` surface reveal;
- published/non-editor player allows finger/mouse rotation of the ring;
- touch rotation composes over gyro motion, so gyro continues during and after manual rotation;
- touch rotation is enabled only when `allowSelection` is false and the locked Phone Box/showcase object is visible.

The user did not love the final feel, but asked to stop there and keep that version pushed.

## God Rays / Stencil Dust

Relevant files:

- `src/components/viewport/effects/GodRaysVolume.tsx`
- `src/components/viewport/effects/GodRaysDust.tsx`
- `src/components/viewport/effects/StencilVolume.tsx`
- `src/components/viewport/effects/godRaysShared.ts`

Current partial dust behavior:

- raymarched volume noise samples in world space through `uLocalToWorld`;
- this makes the volumetric dust/noise feel more like fixed air being lit by the moving beam;
- dust point sampling is deterministic via `createSeededRandom()`;
- God Rays and Stencil dust points were changed to be anchored without inheriting the full gizmo rotation;
- this is not the final desired behavior.

Known unresolved dust issues reported by the user:

- when the beam rotates, fixed dust can leave the ray underpopulated;
- the user wants particles that exit the current beam to unload/respawn so visible count stays near `Dust Count`;
- moving the gizmo can still make particles feel like they move with it;
- Stencil dust outside the visible stencil/beam can remain visible instead of disappearing;
- Stencil needs stricter visibility/respawn tied to the stencil shape, not only the volume box.

Next intended dust work is a particle streaming / respawn model. Reread `GodRaysDust.tsx` and `StencilVolume.tsx` before implementing it.

## Frame Format / AUTO Behavior

User-confirmed rule:

- `Frame Format = AUTO` is the normal mode for responsive iframe publishing.
- New scenes and scene reset default to `Frame Format = AUTO`.
- AUTO means the published player uses the actual iframe/container aspect.
- Fixed formats are only needed when the user wants a specific social/video ratio.

Important implementation details:

- `src/components/Viewport.tsx` keeps the Canvas stable when toggling `Show Frame Guides`.
- `CameraBridge` syncs camera aspect from actual R3F size.
- `Show Frame Guides + AUTO` must not shrink/remount the scene into a square.
- `src/components/TransparentPublishedViewport.tsx` also syncs camera aspect.
- `src/app/PublishedPlayerApp.tsx` has a safe desktop fallback for AUTO published cameras.

If desktop crop returns, first check Tilda wrapper height and scene camera, not the GLB.

## Scene Manager

The top-left toolbar includes:

- `GLB`
- `RUN`
- `WEB`
- `SCNS`
- `RST`

`SCNS` opens the published scene manager.

Current behavior:

- modal is centered over the app via `createPortal(..., document.body)`;
- it shows published scenes newest-first;
- it has a close `X`;
- each scene row has an `X` delete button;
- deleting asks for confirmation.

## Things To Preserve

Focus / Floating:

- preserve Focus ownership over the target while focused or returning;
- preserve Floating phase updates even while pose writes are paused;
- preserve safe-rect fitting for transparent iframes.

God Rays:

- preserve global direction/noise behavior;
- preserve published runtime restoration.

Stencil Volume:

- preserve editor support and publish/runtime support;
- do not break mask upload/preview/runtime serialization.

Flipbook:

- runtime preview frame state should stay separate from persisted material settings;
- atlas source/frame-grid changes must reset texture state correctly.

Phone Box:

- preserve attached-content behavior if touching showcase runtime files;
- preserve touch rotation + gyro composition.
