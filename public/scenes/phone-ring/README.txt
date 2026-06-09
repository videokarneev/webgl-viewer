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
   If a sticky site header overlays the top of the iframe, add frameInsetTop=auto or exact frameInsetTopDesktop / frameInsetTopMobile values to pin the portal below it.

iframe example:
<div style="width:100%;height:78vh;min-height:720px;position:relative;overflow:hidden;"><iframe src="https://your-cdn.example/path/to/scene-folder/?frameInsetTop=auto" style="width:100%;height:100%;border:0;display:block;background:transparent;" allow="autoplay; fullscreen; accelerometer; gyroscope; magnetometer" allowtransparency="true" scrolling="no"></iframe></div>