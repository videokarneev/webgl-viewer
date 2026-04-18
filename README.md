# WebGL Viewer

Local WebGL scene editor for `.glb/.gltf` models built with `Three.js` and `Vite`.

This repository is currently a working prototype focused on:
- loading 3D models
- loading HDRI environments
- inspecting and switching scene materials
- orbit and first-person navigation
- applying atlas / flipbook overlays to materials
- saving and restoring scene configuration

## Stack

- `Three.js`
- `Vite`
- vanilla `JavaScript`

## Local Run

Install dependencies:

```bash
npm install
```

Run dev server:

```bash
npm run dev
```

Build production bundle:

```bash
npm run build
```

Run local preview on `127.0.0.1:4174`:

```bash
npm run preview:local
```

Or build and preview in one step:

```bash
npm run serve
```

## Project Structure

- `src/main.js` - main viewer/editor logic
- `src/styles.css` - UI styles
- `public/assets/ring.glb` - demo ring model
- `public/assets/fire.jpg` - demo atlas
- `public/assets/One_Ring_inscription_NRM.jpg` - inscription normal map

## Current Features

- empty startup state without auto-loading a model
- manual loading of model, atlas, and HDRI
- demo ring loading by button
- target material selection
- atlas frame preview with numbering
- manual atlas frame scrubber
- UV offset / scale / rotation controls
- scene config export / import
- viewer link generation

## Current Status

Atlas overlay support is partially implemented, but the atlas-to-material shader patching is still under active development.

At the current checkpoint:
- atlas assets can be loaded
- atlas preview works
- some atlas configurations are visible on the model
- some shader paths are still unstable depending on target slot and blend mode

This means the project is not yet a final production viewer. It is an R&D prototype and a base for further atlas / inscription tooling work.

## Git

The current prototype state has been committed as a checkpoint so development can continue from a stable base.
