Web Package Export

Contents:
- scene.json
- index.html
- assets/... referenced by scene.json

How to host:
1. Upload the entire unzipped folder to a static host or CDN.
2. Keep scene.json and assets/ together.
3. Open the viewer with:
   https://your-viewer-host.example/?player=1&scene=https://your-cdn.example/path/to/scene.json&transparent=1
4. Or open the pretty scene URL:
   https://your-cdn.example/path/to/scene-folder/
   The pretty scene URL preserves query params and enables transparent mode automatically inside iframes.
   If you want phone tilt / gyroscope interaction inside an iframe, keep accelerometer, gyroscope, and magnetometer in the allow list.
   If a fixed page header overlaps the iframe, add frameInsetTop=<header-height> to the player URL.

iframe example:
<iframe src="https://your-cdn.example/path/to/scene-folder/" width="100%" height="700" style="border:0;" allow="autoplay; fullscreen; accelerometer; gyroscope; magnetometer"></iframe>