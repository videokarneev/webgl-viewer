Web Package Export

Contents:
- scene.json
- assets/... referenced by scene.json

How to host:
1. Upload the entire unzipped folder to a static host or CDN.
2. Keep scene.json and assets/ together.
3. Open the viewer with:
   https://your-viewer-host.example/?player=1&scene=https://your-cdn.example/path/to/scene.json

iframe example:
<iframe src="https://your-viewer-host.example/?player=1&scene=https%3A%2F%2Fyour-cdn.example%2Fpath%2Fto%2Fscene.json" width="100%" height="700" style="border:0;" allow="autoplay; fullscreen"></iframe>