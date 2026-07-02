# Codex Handoff

Last updated: 2026-07-02

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

- `d18cd51` `Add rain impact material effect`
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

- `d18cd51` is a local/latest important commit for the Rain Impacts material effect.
- `a3be82b` was pushed to `origin/main`.
- `e61248e` was pushed to `origin/main`.
- `5b0c402` became the ready Production deployment for the latest `mtg` scene update after the Vercel queue cleared.
- The user explicitly asked to update and push this handoff on 2026-06-11.

Recent local work:

- On 2026-07-02 published `mk` / Stencil first-frame jump investigation continued:
  - user reported the old Stencil scene at `https://karneev.org/mk` jumps on load: on desktop the first second has a small twitch/shift, and on phone the first frame still appears lower in the viewport before jumping to the intended framing;
  - several local fixes were attempted in `src/app/PublishedPlayerApp.tsx`, `src/components/Viewport.tsx`, `src/features/publish/buildPublishedScene.ts`, and `public/scenes/mk/scene.json`;
  - attempted fixes included layout-settle gating, `sceneApplied` gating, initial container size passed into `Viewport`, locking the first responsive preset, writing separate `landscape`/`portrait` responsive camera poses for `mk`, fallback publish logic for default responsive cameras, and synchronizing camera pose/focal/aspect in `Canvas.onCreated` plus `CameraBridge` via `useLayoutEffect`;
  - `npx tsc --noEmit` and `npx vite build` passed after these changes;
  - IMPORTANT: the user explicitly confirmed the bug is still NOT fixed after these attempts, so do not treat the earlier camera/layout changes alone as a solved state;
  - follow-up candidate fix found a likely first-frame writer inside `StencilVolume`: the root group initially rendered at origin and only received `objectState` transform in `useEffect` after paint; `src/components/viewport/effects/StencilVolume.tsx` now passes `position`/`rotation`/`scale`/`visible` directly to the root group and syncs the imperative ref in `useLayoutEffect`;
  - validation after this candidate fix: `npx tsc --noEmit` and `npx vite build` passed; local production preview with headless WebGL/SwiftShader rendered the portrait `mk` player stably at 4s and 6s (`bbox` stayed around `y=120..361`); still requires real Tilda/phone verification after deploy.
  - follow-up fix in the next session removed another first-frame delay: published `mk` uses baked stencil contours, but `StencilVolume` still moved those shapes into local `maskContour` state from `useEffect` after the first paint. Baked contour shapes now feed `contourCapGeometry` and `buildStencilVolumePreparedPrimitives(...)` synchronously during the first render, so the ray volume is not built once with an empty shape list before appearing on the next frame.
  - validation after the baked-contour sync fix: `npx tsc --noEmit` and `npx vite build` passed. Local Chrome headless screenshot attempts stayed blank in this environment even with SwiftShader/virtual-time, so real browser/Tilda verification is still required.
  - user retested on the real phone page and confirmed it still jumps, so the Stencil-only fixes were not enough.
  - follow-up runtime fix removed two more published-player jump sources: the separate `PublishedSceneController` camera-sync `useEffect` was removed so published camera is written only at final scene-apply time, and `ViewerSync` no longer writes camera position/orbit target back into zustand when `allowSelection=false` (published player). This avoids a Three camera -> store -> CameraBridge feedback loop in the iframe.
  - follow-up mobile layout fix added `lockContainerSize` for the published `Viewport`: after `PublishedPlayerApp` waits for a settled container measurement, the internal canvas/frame rect stops responding to later mobile `ResizeObserver` changes from Tilda/browser viewport chrome. Editor resize behavior remains live.
  - validation after the camera/layout lock fix: `npx tsc --noEmit` and `npx vite build` passed; still needs deploy and real phone verification.
- On 2026-06-21 SCN Director work continued:
  - compact Director controls were moved into the left `SCN` panel under the selected Director button;
  - the bottom Director dock is now reserved for large editors and currently opens only for `ANIM`;
  - `BG` now has a compact Background Builder MVP with none/color/gradient/360/reflections modes;
  - static CSS gradient background was added with start/end colors and angle;
  - `UI` now has a first overlay text-button MVP with anchor, x/y offset, width/height, font size, label, visibility, shape, action URL, target, and remove controls;
  - overlay UI renders above the viewport in editor and published player;
  - selected overlay elements now open a right-side `Interface Inspector`;
  - UI button shape supports editable rectangle radius, oval, and custom SVG shape import;
  - imported SVG shapes are normalized by their rendered geometry bbox into a new viewBox, so original canvas placement/coordinates are ignored and the editor centers the shape like standard forms;
  - published overlay buttons execute their stored `action`; editor overlay buttons select the UI element;
  - `Add Phone Showcase` was removed from the user-facing `SCN` panel for now, but the underlying phone showcase logic remains in the project.
- On 2026-06-22 `UI` work expanded beyond the first overlay MVP:
  - `interfaceElements` gained `renderMode: 'overlay' | 'screen3d'` plus nested `overlay` and `screen3d` layout/material state;
  - `screen3d` is a camera-facing 3D HUD button rendered inside the Three scene, not in DOM;
  - `screen3d` currently supports a rectangle body, camera-facing placement, `distance`, `width`, `height`, and material presets/controls;
  - the right `Interface Inspector` now has `Render` mode switching and richer `3D Material` controls including `type`, `preset`, `opacity`, `roughness`, `metalness`, `clearcoat`, `clearcoat roughness`, `transmission`, `ior`, `emissive`, and `glow`;
  - the Outliner now has an `Interface` list/mode so UI elements can be reselected there;
  - selecting a UI element now routes back to the right inspector again after earlier selection-state conflicts were fixed;
  - editor-side drag for `screen3d` translate now works by changing `screen3d.offsetX/offsetY` relative to the current `anchor`;
  - editor drag jitter was reduced by stopping repeated texture rebuilds and re-binding pointer listeners on every offset update;
  - editor-side drag now appears stable, but `local run` still shows residual jitter / shake when moving a `screen3d` button.
- Rain Impacts MVP was implemented and visually confirmed by the user on 2026-06-11.
- On 2026-06-12 Rain Impacts was iterated further for wet material realism:
  - user confirmed the current look is excellent after switching `Noise/Flow` to full-surface animated wet-noise rather than moving spots;
  - `Rate` was removed from the user-facing model and replaced by `Drops`;
  - active ripple count now comes directly from `Drops`, while legacy/publish `rate` is derived from `Drops / Lifetime`.
- The confirmed working path uses `CanvasTexture` overlays and a combined normal canvas, not the earlier shader-only path.
- Modified files:
  - `src/store/editorStore.ts`
  - `src/components/Sidebar.tsx`
  - `src/components/Viewport.tsx`
  - `src/components/SceneDirectorDock.tsx`
  - `src/components/viewport/EnvironmentManager.tsx`
  - `src/components/Inspector.tsx`
  - `src/components/MaterialEffectController.tsx`
  - `src/features/publish/buildPublishedScene.ts`
  - `public/scenes/mk/scene.json`
  - `src/app/PublishedPlayerApp.tsx`
  - `src/app/App.tsx`
  - `src/styles.css`
  - `CODEX_HANDOFF.md`
  - `src/components/Outliner.tsx`
  - `src/components/viewport/InterfaceScreen3DOverlay.tsx`
  - `src/features/scene/runtime/interfaceElementActions.ts`

## Validation

Passing after the latest SCN Director / BG / UI / screen3d UI work:

- `npx tsc --noEmit`
- `npx vite build`

Vite still prints the usual chunk-size warning, but the build succeeds.

User confirmed the Rain Impacts visual after the canvas-overlay fix. The confirmed preview showed clear animated circular ripples on the MTG card.

User later confirmed the updated wet-noise look after `Noise/Flow` became a full-surface animated wet shimmer instead of moving spots.

Current published `mk` / Stencil first-frame jump status:

- As of 2026-07-02, local candidate fixes have been applied in `StencilVolume`, `PublishedPlayerApp`, `Viewport`, and `ViewerSync`: Stencil transform/contours are first-frame safe, published camera is no longer rewritten by a separate sync effect, published `ViewerSync` no longer writes camera back into the store, and the published canvas size is locked after the settled first measurement.
- Earlier symptoms: desktop started near the intended position then made a small initial twitch/shift; phone first frame appeared too low, then jumped to correct framing.
- Do not claim this is confirmed fixed until the user verifies on the real phone page after deploy.

Current UI validation status:

- `Overlay` UI selection path now works again through viewport clicks, `SCN -> UI`, and the Outliner `Interface` list.
- `screen3d` button movement is stable in the editor after drag/render cleanup.
- `local run` still has a remaining bug: when moving a `screen3d` button, the button still jitters/shakes.
- Next Codex session should start by fixing this `local run` / published-runtime `screen3d` drag jitter before adding more UI features.

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
  - `Drops`
  - `Size`
  - `Strength`
  - `Opacity`
  - `Normal`
  - `Wetness`
  - `Noise`
  - `Flow`
  - `Lifetime`

Important behavior:

- There is no Play button for Rain Impacts.
- The effect should animate automatically whenever `rainImpactsAdded` and `rainImpactsEnabled` are true.
- The eye button in the effect row toggles `rainImpactsEnabled`.
- The trash button removes it with `rainImpactsAdded: false`.
- `Drops` is the user-facing number of simultaneously active ripple circles.
- `Lifetime` is how long each ripple lives.
- `Rate` is now legacy/internal/publish compatibility only; when UI changes `Drops` or `Lifetime`, `rainImpactRate` is synchronized as `Drops / Lifetime`.
- `Noise` is the amount/strength of animated wet micro-shimmer.
- `Flow` is the speed of that shimmer. It changes the procedural noise phase, not UV position.

Implementation:

- State is currently added onto `AtlasEffectState`:
  - `rainImpactsAdded`
  - `rainImpactsEnabled`
  - `rainImpactRate`
  - `rainImpactSize`
  - `rainImpactStrength`
  - `rainImpactOpacity`
  - `rainImpactNormalStrength`
  - `rainImpactWetness`
  - `rainImpactNoise`
  - `rainImpactFlow`
  - `rainImpactLifetime`
  - `rainImpactCount`
- `MaterialEffectController` now uses a runtime `CanvasTexture` overlay for the working MVP.
- The canvas redraws the selected original/custom base color texture and paints animated circular wet rings on top.
- A second runtime canvas is used as a combined RGB normal map:
  - if the material has an original/custom `normalMap`, the rain normal canvas first draws that normal map;
  - rain ripple normals and wet-noise normals are then drawn over it;
  - this preserves the original material normal instead of replacing it.
- `normalMap`/`normalScale`, roughness, and clearcoat are backed up and restored when Rain is removed/disabled.
- `Wetness` lowers roughness and can increase clearcoat response where supported.
- `Noise/Flow` currently use a small procedural full-surface noise texture:
  - it is regenerated each frame;
  - coordinates stay fixed in UV;
  - only the noise phase changes;
  - this avoids the earlier "flying bugs" look from moving wet spots.
- The old `onBeforeCompile` shader path remains in the file but is no longer the active render path after the selected mesh kept disappearing.
- It uses fixed effect capacity of 32 rings.
- Active visible ring count is now `rainImpactCount`/`Drops`, capped at 32.
- Uses one reusable canvas texture per affected material; no particle meshes.
- Requires mesh UVs; if none are found for the material's mesh IDs, the effect is skipped.
- Earlier shader notes are historical only; the active path is canvas base-color overlay plus combined normal canvas.

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
- Fourth follow-up iteration added:
  - `Opacity`, `Normal`, and `Wetness` controls;
  - rain normal initially used `bumpMap`, then was corrected to `normalMap`;
  - user correctly noticed replacing the material normal is wrong;
  - implementation was corrected to draw original material normal first, then rain normals over it.
- Fifth follow-up iteration added:
  - `Noise` and `Flow` controls;
  - first attempts used moving wet spots and streaks, which the user described as flying bugs/sticks;
  - those were replaced with a full-surface animated procedural wet-noise field;
  - user confirmed this version looks excellent.
- Sixth follow-up iteration changed UI semantics:
  - `Rate` was removed from the visible controls;
  - `Drops` now directly controls simultaneous ripple count;
  - legacy `rainImpactRate` is still stored/serialized for compatibility and is derived as `Drops / Lifetime`.

Publish/runtime:

- Published scene version is now `19` for UI element `action` serialization.
- `effects.rainImpacts` serializes:
  - `enabled`
  - `rate`
  - `size`
  - `strength`
  - `opacity`
  - `normalStrength`
  - `wetness`
  - `noise`
  - `flow`
  - `lifetime`
  - `count`
- `PublishedPlayerApp` restores those values into `updateMaterialEffect()`.
- `buildPublishedScene` now writes `rate` as `count / lifetime` for compatibility with the existing published schema.

Retest checklist:

1. Hard refresh `localhost:5173`.
2. Load/select a material with base color and, ideally, normal map.
3. Add `RAIN`.
4. Verify the original base color texture remains visible.
5. Verify the original material normal detail is preserved when `Normal` is enabled.
6. Verify `Drops` changes the number of simultaneous ripple circles.
7. Verify `Lifetime` changes how long ripples stay alive.
8. Verify `Noise` changes the amount of full-surface wet shimmer.
9. Verify `Flow` changes the shimmer speed without creating moving spots/streaks.
10. Verify rings/noise animate without any Play button.

Future realism plan:

- Keep the current visible canvas-overlay plus combined-normal MVP as the stable baseline.
- Consider renaming/structuring this internally as a distinct `Rain Layer` concept later:
  - base-color overlay canvas for visible rings and wet shimmer;
  - combined normal canvas for original material normal plus rain/wet normal contribution;
  - roughness/clearcoat response controlled by `Wetness`.
- Improve wetness realism later:
  - local wet mask rather than whole-material roughness/clearcoat changes;
  - better roughness/clearcoat response per wet region;
  - optional layer opacity/intensity separation if current `Opacity`/`Strength` semantics become confusing.
- Add water streaks/poteki as a later material sub-effect:
  - UV/world-gravity direction;
  - length, speed, and flow controls;
  - occasional merging/dripping behavior.
- Add masking:
  - material-level mask first;
  - later optional brush/paint mask;
  - edge fade so water does not look pasted over card borders.
- Keep falling rain in the air separate from material rain:
  - scene-level rain streak emitter is a future FX tool;
  - it should not be mixed into the material `Rain Impacts` implementation.
- Publish/runtime fields to consider later:
  - `roughnessImpact`
  - `layerOpacity`
  - material-level wet mask data

## Planned SCN Director / Interaction System

Last discussed with the user: 2026-06-21.

Initial implementation started:

- `SCN` now has a `Director` launch grid for `BG`, `UI`, `CALL`, `ACT`, `STATE`, and `ANIM`.
- Compact Director controls now render in the left `SCN` panel under the active Director button.
- A bottom viewport dock component exists:
  - `src/components/SceneDirectorDock.tsx`
  - rendered from `src/app/App.tsx`;
  - editor UI state is stored in `hud.directorDockOpen` / `hud.directorMode`;
  - published player closes the dock explicitly through `PublishedPlayerApp`.
- The bottom dock is currently reserved for the larger `ANIM` editor shell only.
- `BG` no longer opens the bottom dock.
- `UI`, `CALL`, `ACT`, and `STATE` currently stay in the left panel.
- This is still mostly an editor/runtime UI shell; it does not yet introduce the final first-class `director` scene schema.

Current `BG` implementation:

- Lives in `src/components/Sidebar.tsx` under `SCN -> Director -> BG`.
- Modes:
  - `NONE`;
  - `COLOR`;
  - `GRADIENT`;
  - `360 IMAGE`;
  - `REFLECTIONS`.
- Existing background/environment fields are still used:
  - `backgroundMode`;
  - `backgroundColor`;
  - `backgroundRotation`;
  - `environment.background`;
  - `environment.backgroundVisible`;
  - `environment.backgroundIntensity`;
  - `environment.backgroundBlur`.
- New gradient fields were added to `src/store/editorStore.ts`:
  - `backgroundGradientStart`;
  - `backgroundGradientEnd`;
  - `backgroundGradientAngle`.
- Gradient rendering is CSS-based in `src/components/Viewport.tsx`:
  - `backgroundMode === 'gradient'` applies a CSS `linear-gradient(...)` to `viewport-wrap`;
  - the WebGL canvas clear alpha is made transparent for gradient mode;
  - `transparentBackground` remains a separate published-player concept;
  - `EnvironmentManager` clears `scene.background` for `gradient` so stale Three backgrounds do not remain.
- Publish/runtime:
  - `src/features/publish/buildPublishedScene.ts` writes optional `gradientStart`, `gradientEnd`, and `gradientAngle` under `scene.background`;
  - `src/app/PublishedPlayerApp.tsx` restores those values and falls back to defaults for older scene JSON.

Current `UI` / Interface state:

- Data lives in `src/store/editorStore.ts` as `interfaceElements`.
- Selection lives in `selectedInterfaceElementId`.
- Store API:
  - `addInterfaceElement`;
  - `updateInterfaceElement`;
  - `removeInterfaceElement`;
  - `replaceInterfaceElements`;
  - `setSelectedInterfaceElementId`.
- `interfaceElements` now support two render paths:
  - `renderMode: 'overlay'`;
  - `renderMode: 'screen3d'`.
- Shared element fields still include:
  - `id`;
  - `label`;
  - `visible`;
  - `shape` with `type`, `cornerRadius`, `svgMarkup`, and `svgLabel`;
  - `action` with `type`, `url`, and `target`;
  - legacy `url`;
  - legacy `openInNewTab`.
- `overlay` layout state includes:
  - `anchor`;
  - `offsetX`;
  - `offsetY`;
  - `width`;
  - `height`;
  - `fontSize`.
- `screen3d` state includes:
  - `anchor`;
  - `offsetX`;
  - `offsetY`;
  - `distance`;
  - `width`;
  - `height`;
  - `scaleMode`;
  - `depthMode`;
  - `billboard`;
  - `material` with `type`, `preset`, `color`, `opacity`, `metalness`, `roughness`, `envMapIntensity`, `clearcoat`, `clearcoatRoughness`, `transmission`, `ior`, `emissive`, and `emissiveIntensity`.
- UI controls currently live in:
  - `SCN -> Director -> UI` for the compact list and basic controls;
  - the right `Interface Inspector` for render mode, shape, layout, action, and 3D material controls.
- Runtime render paths:
  - `InterfaceOverlay` in `src/components/Viewport.tsx` renders `overlay` UI above the canvas inside `viewport-stage`;
  - `InterfaceScreen3DOverlay` in `src/components/viewport/InterfaceScreen3DOverlay.tsx` renders `screen3d` UI inside the Three scene as a camera-facing HUD plane;
  - in editor (`allowSelection=true`) clicking a UI element selects it;
  - in published/local run (`allowSelection=false`) clicking executes `action`; legacy `url` remains a fallback.
- Outliner support:
  - `src/components/Outliner.tsx` now has an `Interface` mode/list for UI elements.
- Current `screen3d` limitations / known issue:
  - body shape is still effectively rectangle-only in 3D; `oval`/`svg` are not yet true 3D shapes;
  - editor drag is usable;
  - `local run` still has residual jitter when dragging a `screen3d` button.

Important UX correction from the user after seeing the first prototype:

- The bottom dock should not be used for every Director button.
- Simple settings should stay in the left `SCN` block, under the selected Director button, just like the existing compact settings panels.
- Use the bottom dock only when the editor needs a larger working surface.
- Decision rule:
  - if the tool is mostly "set a value", keep it in the left panel;
  - if the tool is "edit over time, space, layout, paths, or many relationships", open the bottom dock.
- `BG` should usually live in the left panel:
  - background mode;
  - color;
  - image/gradient selection;
  - blur/intensity/visibility;
  - simple crop/focal controls later.
- Compact `BG` controls have already been moved back into the left panel.
- `ANIM` is the clearest first real dock use case because timeline/keyframes need width.
- The user noticed and corrected two visual details:
  - compact Director panels need a small top gap from the Director button grid;
  - do not add a decorative left border/vertical line to the new compact panels.
- Keep `Add Phone Showcase` hidden from the user for now; logic remains but the user wants to return to it later.

High-level goal:

- Build a broader scene-director system, not just an animation tab.
- The user wants published iframes that can combine:
  - animated 3D objects;
  - animated cameras;
  - clickable/hoverable buttons;
  - responsive UI overlays;
  - animated backgrounds;
  - callouts, labels, leader lines, and highlights;
  - scroll, click, hover, load, and state-driven behavior;
  - external links and possible parent-page communication.
- Think of this as `SCN` owning the composition and behavior of the final published scene.

UI placement / product model:

- Keep the main settings row compact. Prefer `SCN` as the main entry for this work instead of adding many permanent top-level buttons.
- `CAM`, `LGT`, and `FX` should stay separate:
  - `SCN` = final scene composition, iframe behavior, layout, background, interface, interactions, timeline entry;
  - `CAM` = camera settings and framing controls;
  - `LGT` = lighting;
  - `FX` = post-processing, scene effects, material/visual effects.
- Inside `SCN`, expose sections such as:
  - `Frame / Formats`;
  - `Background`;
  - `Interface Elements`;
  - `Callouts / Highlights`;
  - `Actions / Triggers`;
  - `States`;
  - `Animation Timeline`.
- Compact section controls should render in the left panel under the active Director button.
- Large editors should open in a bottom dock over the viewport, roughly where the user highlighted the lower-center viewport area in the screenshot.
- Good left-panel candidates:
  - `BG`: background mode, color, images, simple gradient, blur/intensity/visibility;
  - `UI`: list of elements, add button, selected element basics;
  - `CALL`: callout list, add callout, trigger mode;
  - `ACT`: simple action binding rows;
  - `STATE`: state list and basic visibility settings;
  - `ANIM`: clip list, add clip, play/enable basics.
- Good bottom-dock candidates:
  - `Animator`;
  - `Interface Layout Editor`;
  - `Callout Placement Editor`;
  - `Actions / States Graph`;
  - `Path Editor`;
  - `Layout`.
- The right inspector should remain the property editor for the currently selected object/UI element/background/action/clip.
- The dock should be closable/resizable so the editor can return to a clean viewport.

Core architecture to preserve:

- Keep these concepts separate in data and runtime:
  - `Target`: object, group, material, camera, light, UI element, hotspot, background, callout, highlight.
  - `Clip`: keyframes/path/material/UI/background/camera animation.
  - `Driver` / `Trigger`: time, click, hover, press, load, scroll, visibility, state change.
  - `Action`: play, reverse, toggle, scrub, open URL, show/hide, set state, switch scene, focus camera, send event.
  - `Layout`: responsive placement rules for landscape/portrait/square/AUTO.
  - `State`: named scene state such as `default`, `doorOpen`, `detailsVisible`, `cardFlipped`.
- Do not hard-code a button to a specific animation implementation. Buttons and hotspots should call actions; actions should drive clips/states/links.
- This separation is important so a single animation can be triggered by a button, object click, hover, scroll, or future API call.

Layer model:

- Treat the published iframe as a layered composition:
  - `Background Layer`: transparent/solid/image/generated gradient/animated gradient/video later.
  - `Scene Layer`: GLB, materials, lights, camera, scene effects.
  - `3D Interaction Layer`: 3D planes, GLB buttons, hotspots, invisible hit areas.
  - `Callout Layer`: highlights, labels, leader lines, annotations.
  - `Overlay UI Layer`: PNG/GIF/SVG/text buttons and panels above the scene.
  - `Logic Layer`: actions, triggers, states, animation drivers.
- This does not need to be shown so technically in the UI, but the implementation should respect it.

Responsive formats:

- Support at least:
  - landscape;
  - portrait;
  - square;
  - AUTO using actual iframe/container aspect.
- For UI, callouts, and backgrounds, support per-format overrides.
- Use anchors and safe areas rather than raw absolute pixels only:
  - top-left, top-center, top-right;
  - center-left, center, center-right;
  - bottom-left, bottom-center, bottom-right;
  - x/y offset;
  - size, min/max size, keep aspect ratio;
  - show/hide per format.
- Background images should support per-format asset or crop/focal settings:
  - landscape background image;
  - portrait background image;
  - square background image;
  - shared image with focal point and crop when possible.

Background Builder:

- Background is a first-class scene target, not just a static scene setting.
- Supported background types to plan for:
  - transparent;
  - solid color;
  - generated gradient;
  - animated gradient;
  - image: jpg/png/webp/gif;
  - video later.
- Image controls:
  - fit mode: cover/contain/fill/custom;
  - focal point;
  - scale;
  - position;
  - opacity;
  - blur;
  - brightness/contrast/saturation;
  - per-format asset/crop.
- Animated gradient controls:
  - linear/radial/conic/simple mesh-like later;
  - color stops;
  - angle/scale;
  - motion mode: none, slow drift, orbit, wave, noise flow;
  - speed;
  - blur/grain/noise if useful.
- Backgrounds should be animatable:
  - blur on hover/click/state;
  - opacity transitions;
  - image scale/parallax;
  - gradient phase/motion;
  - brightness/contrast changes.

Interface Elements:

- User wants animated interfaces inside/over the iframe.
- Support these element types over time:
  - PNG image button;
  - GIF button;
  - SVG/icon/text button;
  - panel/popup;
  - 3D plane button;
  - GLB object as button;
  - invisible hit area;
  - hotspot pinned to a 3D point/object.
- UI elements should be valid animation targets:
  - position;
  - scale;
  - rotation where relevant;
  - opacity;
  - color/tint;
  - blur/glow;
  - hover/press/idle animation clips.
- Click actions should include:
  - play/toggle/reverse animation;
  - open URL;
  - open URL in iframe / new tab / parent page via `postMessage`;
  - show/hide element;
  - set state;
  - switch scene later;
  - focus camera on object;
  - send analytics/custom event later.

Callouts / Highlights:

- User wants to highlight details such as car parts and attach animated labels with leader lines.
- Callouts can be:
  - always visible;
  - hover-triggered;
  - click-triggered;
  - scroll/state-triggered later.
- Highlight styles to support:
  - outline;
  - material tint;
  - emissive/glow pulse;
  - dim rest of scene later;
  - animated marker/hotspot.
- Leader line behavior:
  - line starts from a 3D point, object center, or custom anchor;
  - line ends at a label/panel in overlay or 3D;
  - line animates in with "draw" progress;
  - label fades/slides/scales in;
  - placement should have per-format overrides.
- Callouts should use the same action/trigger/state system as buttons and animations.

Animation / Motion:

- Build animation as a shared system for scene objects, UI, backgrounds, callouts, materials, lights, and camera.
- Keyframed properties:
  - position;
  - rotation;
  - scale;
  - opacity;
  - material params;
  - light intensity/color;
  - camera position/FOV/lookAt;
  - background blur/scale/opacity/gradient phase;
  - callout/line/highlight intensity.
- Easing:
  - linear;
  - ease in;
  - ease out;
  - ease in-out;
  - custom curves later.
- Default user-facing movement should usually use ease-in-out so animations start and end smoothly.
- Add pivot support for doors, lids, cards, boxes:
  - object origin;
  - bounding-box presets;
  - custom pivot point;
  - pivot gizmo;
  - runtime wrapper group rather than destructive geometry edits.
- Path animation:
  - user draws points in the viewport;
  - support straight segments first;
  - support smooth Catmull-Rom paths for rounded corners;
  - Bezier handles later;
  - orientation modes: keep rotation, follow tangent, look at target, keyframed rotation.
- Camera animation:
  - camera keyframes;
  - camera path;
  - "drive to object" / focus-on-detail action;
  - lookAt target;
  - scroll-driven camera later.
- Preserve existing Focus/Floating ownership behavior when introducing animation ownership.

Implementation roadmap:

1. Audit and schema design:
   - inspect current store, publish schema, runtime restore path, selection/outliner IDs;
   - design scene JSON additions with migration/versioning;
   - keep current scenes loading.
2. SCN dock shell:
   - make `SCN` the entry point;
   - keep compact Director sections in the left panel;
   - keep the bottom dock container for large editor modes only;
   - keep right inspector for selected item details.
3. Background Builder MVP:
   - implemented primarily in the left `SCN` panel, not as a default dock editor;
   - transparent/solid/image/static gradient baseline is started;
   - per-format settings;
   - fit/crop/focal point basics;
   - editor preview and published player support.
4. Interface Elements MVP:
   - compact left-panel list/add/basic settings are started;
   - add a larger layout dock only when manual responsive placement needs more space;
   - first overlay text button is implemented;
   - anchor layout with landscape/portrait/square overrides;
   - click action now uses the first `action` model (`none` / `openUrl`) instead of reading only raw `url`;
   - next step should introduce a shared action model instead of adding more hard-coded button behaviors;
   - open URL action;
   - publish/runtime support.
5. Action/Trigger core:
   - common action data model;
   - click, hover, load;
   - play/reverse/toggle action hooks;
   - show/hide;
   - set state;
   - open URL, including parent-page option planning.
6. Animator core:
   - first major bottom-dock use case;
   - clips;
   - target bindings;
   - transform keyframes;
   - easing;
   - preview playback in editor;
   - runtime playback in published player.
7. Pivot tool:
   - preset pivots;
   - custom pivot;
   - wrapper-group runtime implementation;
   - door/card/lid validation cases.
8. Button/UI animations:
   - hover/press/idle clips for interface elements;
   - opacity/scale/tint/glow basics.
9. Callouts / Highlights MVP:
   - target highlight;
   - label;
   - leader line;
   - always/hover/click modes;
   - animated fade/slide/line draw.
10. Scroll driver:
   - map scroll progress to clip progress;
   - smoothing;
   - reverse/bidirectional support;
   - iframe/Tilda-friendly `postMessage` strategy later.
11. Path animation:
   - draw/edit path points;
   - straight and smooth path modes;
   - path preview line;
   - object path playback.
12. Camera animator:
   - camera clips;
   - path/focus moves;
   - lookAt target;
   - interaction-triggered camera transitions.
13. Timeline editor:
   - clip list;
   - tracks;
   - playhead;
   - draggable keyframes;
   - copy/delete keys;
   - easing selector;
   - current-time preview.

Open published `mk` / Stencil issue to verify next time:

- Candidate local fix: `StencilVolume` root transform is now applied before first paint via JSX props plus `useLayoutEffect`; this targets the phone symptom where the first frame appeared too low because the effect root initially rendered at origin instead of `y=1.5`.
- User has already tried/seen separate vertical and horizontal format settings; those did not fix the jump, so treat this as a runtime first-frame transform issue, not a responsive preset issue.
- Next step is deploy/retest on the real `https://karneev.org/mk` phone page. If it still jumps, inspect any remaining first-frame writers in `PublishedPlayerApp`, `Viewport` / `CameraBridge`, `ViewerSync`, `SceneAnimationController`, production scene JSON, and the Tilda iframe/container sizing path.

Open UI issue to resume first next time:

- First task next session: fix residual `screen3d` button drag jitter in `local run` / published-style runtime.
- Current editor path is much better after stopping texture rebuilds and separating interface drag from orbit drag, but runtime still shakes.
- Suspect next place to inspect first: `src/components/viewport/InterfaceScreen3DOverlay.tsx` drag update path vs camera-facing recompute in `applyScreen3dTransform(...)`, and whether store writes during runtime drag should be buffered locally until pointer-up.

Important constraints for this future work:

- Keep `Frame Format = AUTO` behavior intact.
- Keep current published scenes loading.
- Do not break Focus/Floating ownership.
- Do not mix material Rain Impacts with scene-level falling rain; that remains separate.
- Keep editor and published runtime behavior aligned from the first MVP, because most of the value is in the iframe output.
- Start with a useful MVP instead of trying to build a full Blender/Premiere clone in one pass.

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
