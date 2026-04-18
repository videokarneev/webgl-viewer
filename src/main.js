import './styles.css';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const DEFAULT_MODEL_URL = '/assets/ring.glb';
const CLOCK = new THREE.Clock();
const DEFAULT_EFFECT_STATE = {
  enabled: true,
  targetSlot: 'emissive',
  blendMode: 'screen',
  frameOrder: 'row',
  gridX: 2,
  gridY: 25,
  fps: 18,
  frameCount: 50,
  currentFrame: 0,
  opacity: 0.85,
  maskByRelief: false,
  reliefStrength: 8,
  play: true,
  loop: true,
  uvChannel: 'uv',
  wrapMode: 'repeat',
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
};

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="layout">
    <aside class="sidebar">
      <section class="panel hero-panel">
        <div>
          <p class="eyebrow">Karneev WebGL Scene Editor</p>
          <h1>GLB scene configurator</h1>
          <p class="muted">
            Загружай GLB, выбирай материал, добавляй atlas overlay в Base Color или Emission и публикуй конфиг сцены.
          </p>
        </div>
        <div class="dropzone" id="dropzone">
          <strong>Перетащи сюда model, atlas или environment</strong>
          <span>Поддерживаются .glb, .gltf, .hdr, .png, .jpg, .webp, .json</span>
        </div>
      </section>

      <section class="panel">
        <div class="section-head">
          <h2>Assets</h2>
          <button id="loadDemoButton" class="ghost small">Load demo ring</button>
        </div>
        <div class="asset-summary muted">
          <div><strong>Model:</strong> <span id="modelStatus">none</span></div>
          <div><strong>Atlas:</strong> <span id="atlasStatus">none</span></div>
          <div><strong>HDRI:</strong> <span id="hdriStatus">default studio</span></div>
        </div>
        <label class="field">
          <span>Model URL</span>
          <input id="modelUrlInput" type="text" placeholder="/assets/ring.glb or https://..." />
        </label>
        <div class="inline-actions">
          <input id="modelInput" class="hidden-input" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" />
          <button id="openModelButton">Open model file</button>
          <button id="loadModelUrlButton" class="ghost">Load model URL</button>
        </div>

        <label class="field">
          <span>Atlas URL</span>
          <input id="atlasUrlInput" type="text" placeholder="/assets/fire.jpg or https://..." />
        </label>
        <div class="inline-actions">
          <input id="atlasInput" class="hidden-input" type="file" accept="image/*" />
          <button id="openAtlasButton">Open atlas file</button>
          <button id="loadAtlasUrlButton" class="ghost">Load atlas URL</button>
          <button id="resetAtlasButton" class="ghost">Reset atlas</button>
        </div>

        <label class="field">
          <span>HDRI URL</span>
          <input id="hdriUrlInput" type="text" placeholder="Optional .hdr environment" />
        </label>
        <div class="inline-actions">
          <input id="hdriInput" class="hidden-input" type="file" accept=".hdr,image/vnd.radiance" />
          <button id="openHdriButton">Open HDRI file</button>
          <button id="loadHdriUrlButton" class="ghost">Load HDRI URL</button>
        </div>
      </section>

      <section class="panel">
        <h2>Viewer</h2>
        <div class="field">
          <span>Navigation mode</span>
          <div class="segmented">
            <button data-camera-mode="orbit" class="mode-button is-active">Orbit</button>
            <button data-camera-mode="firstPerson" class="mode-button">First person</button>
          </div>
        </div>
        <div class="inline-actions">
          <button id="focusModelButton">Frame model</button>
          <button id="resetCameraButton" class="ghost">Reset camera</button>
          <button id="lockPointerButton" class="ghost">Lock pointer</button>
        </div>
        <p class="small-muted">WASD + mouse look в режиме first person. Пока без коллизий, чтобы не превращать редактор в движок игры.</p>
        <label class="field">
          <span>Exposure <output id="exposureValue">1.00</output></span>
          <input id="exposureInput" type="range" min="0" max="3" step="0.01" value="1" />
        </label>
        <label class="field">
          <span>Environment intensity <output id="envIntensityValue">1.00</output></span>
          <input id="envIntensityInput" type="range" min="0" max="5" step="0.01" value="1" />
        </label>
        <div class="toggle-row">
          <label><input id="gridToggle" type="checkbox" checked /> Grid</label>
          <label><input id="axesToggle" type="checkbox" /> Axes</label>
        </div>
      </section>

      <section class="panel">
        <div class="section-head">
          <h2>Scene Config</h2>
          <button id="copyConfigButton" class="ghost small">Copy JSON</button>
        </div>
        <div class="inline-actions">
          <button id="downloadConfigButton">Download config</button>
          <button id="copyViewerLinkButton" class="ghost">Copy viewer link</button>
        </div>
        <label class="field">
          <span>Import config</span>
          <input id="configInput" type="file" accept=".json,application/json" />
        </label>
        <label class="field">
          <span>Generated config</span>
          <textarea id="configOutput" rows="8" spellcheck="false"></textarea>
        </label>
      </section>

      <section class="panel">
        <h2>Materials</h2>
        <label class="field">
          <span>Target material</span>
          <select id="materialSelect">
            <option value="">Сначала загрузи модель</option>
          </select>
        </label>
        <div id="materialMeta" class="material-meta muted">Материалы сцены пока не найдены.</div>
      </section>

      <section class="panel">
        <h2>Atlas Effect</h2>
        <label class="checkbox">
          <input id="effectEnabledInput" type="checkbox" checked />
          <span>Enable atlas overlay</span>
        </label>
        <div class="inline-actions">
          <button id="playPauseAtlasButton">Pause atlas</button>
        </div>
        <div class="grid-two">
          <label class="field">
            <span>Target slot</span>
            <select id="targetSlotSelect">
              <option value="baseColor">Base Color</option>
              <option value="emissive" selected>Emission</option>
            </select>
          </label>
          <label class="field">
            <span>Blend mode</span>
            <select id="blendModeSelect">
              <option value="replace">Normal / Replace</option>
              <option value="screen" selected>Screen</option>
              <option value="mix">Mix</option>
              <option value="add">Add</option>
              <option value="multiply">Multiply</option>
              <option value="debug">Debug overlay</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>Frame order</span>
          <select id="frameOrderSelect">
            <option value="row">Rows left to right</option>
            <option value="column">Columns top to bottom</option>
          </select>
        </label>
        <div class="grid-two">
          <label class="field">
            <span>Grid X</span>
            <input id="gridXInput" type="number" min="1" step="1" value="2" />
          </label>
          <label class="field">
            <span>Grid Y</span>
            <input id="gridYInput" type="number" min="1" step="1" value="25" />
          </label>
        </div>
        <div class="grid-two">
          <label class="field">
            <span>FPS</span>
            <input id="fpsInput" type="number" min="1" step="1" value="18" />
          </label>
          <label class="field">
            <span>Frame count</span>
            <input id="frameCountInput" type="number" min="1" step="1" value="50" />
          </label>
        </div>
        <label class="field">
          <span>Opacity / intensity <output id="opacityValue">1.00</output></span>
            <input id="opacityInput" type="range" min="0" max="2" step="0.01" value="0.85" />
        </label>
        <label class="checkbox">
          <input id="maskByReliefInput" type="checkbox" />
          <span>Mask by normal relief</span>
        </label>
        <label class="field">
          <span>Relief mask strength <output id="reliefStrengthValue">8.0</output></span>
          <input id="reliefStrengthInput" type="range" min="0" max="24" step="0.1" value="8" />
        </label>
        <div class="toggle-row">
          <label><input id="playToggle" type="checkbox" checked /> Play</label>
          <label><input id="loopToggle" type="checkbox" checked /> Loop</label>
        </div>
        <label class="field">
          <span>Current frame <output id="currentFrameValue">1 / 50</output></span>
          <input id="currentFrameInput" type="range" min="0" max="49" step="1" value="0" />
        </label>
        <div class="atlas-preview-wrap">
          <canvas id="atlasPreview" width="360" height="220"></canvas>
        </div>
      </section>

      <section class="panel">
        <h2>UV Transform</h2>
        <div class="grid-two">
          <label class="field">
            <span>UV channel</span>
            <select id="uvChannelSelect">
              <option value="uv">uv</option>
              <option value="uv2">uv2</option>
            </select>
          </label>
          <label class="field">
            <span>Wrap mode</span>
            <select id="wrapModeSelect">
              <option value="repeat">Repeat</option>
              <option value="clamp">Clamp</option>
            </select>
          </label>
        </div>
        <div class="grid-two">
          <label class="field">
            <span>Offset X</span>
            <input id="offsetXInput" type="number" step="0.01" value="0" />
          </label>
          <label class="field">
            <span>Offset Y</span>
            <input id="offsetYInput" type="number" step="0.01" value="0" />
          </label>
        </div>
        <div class="grid-two">
          <label class="field">
            <span>Scale X</span>
            <input id="scaleXInput" type="number" min="0.01" step="0.01" value="1" />
          </label>
          <label class="field">
            <span>Scale Y</span>
            <input id="scaleYInput" type="number" min="0.01" step="0.01" value="1" />
          </label>
        </div>
        <label class="field">
          <span>Rotation <output id="rotationValue">0°</output></span>
          <input id="rotationInput" type="range" min="-180" max="180" step="1" value="0" />
        </label>
      </section>
    </aside>

    <main class="viewport-wrap">
      <canvas id="viewport"></canvas>
      <div class="hud">
        <span id="statusLabel">Сцена готова. Загрузи модель и atlas, чтобы собрать web-представление.</span>
      </div>
    </main>
  </div>
`;

const elements = {
  canvas: document.querySelector('#viewport'),
  statusLabel: document.querySelector('#statusLabel'),
  modelInput: document.querySelector('#modelInput'),
  atlasInput: document.querySelector('#atlasInput'),
  hdriInput: document.querySelector('#hdriInput'),
  configInput: document.querySelector('#configInput'),
  modelUrlInput: document.querySelector('#modelUrlInput'),
  atlasUrlInput: document.querySelector('#atlasUrlInput'),
  hdriUrlInput: document.querySelector('#hdriUrlInput'),
  materialSelect: document.querySelector('#materialSelect'),
  materialMeta: document.querySelector('#materialMeta'),
  modelStatus: document.querySelector('#modelStatus'),
  atlasStatus: document.querySelector('#atlasStatus'),
  hdriStatus: document.querySelector('#hdriStatus'),
  configOutput: document.querySelector('#configOutput'),
  exposureInput: document.querySelector('#exposureInput'),
  exposureValue: document.querySelector('#exposureValue'),
  envIntensityInput: document.querySelector('#envIntensityInput'),
  envIntensityValue: document.querySelector('#envIntensityValue'),
  opacityInput: document.querySelector('#opacityInput'),
  opacityValue: document.querySelector('#opacityValue'),
  maskByReliefInput: document.querySelector('#maskByReliefInput'),
  reliefStrengthInput: document.querySelector('#reliefStrengthInput'),
  reliefStrengthValue: document.querySelector('#reliefStrengthValue'),
  currentFrameInput: document.querySelector('#currentFrameInput'),
  currentFrameValue: document.querySelector('#currentFrameValue'),
  rotationInput: document.querySelector('#rotationInput'),
  rotationValue: document.querySelector('#rotationValue'),
  playPauseAtlasButton: document.querySelector('#playPauseAtlasButton'),
  frameOrderSelect: document.querySelector('#frameOrderSelect'),
  atlasPreview: document.querySelector('#atlasPreview'),
  effectEnabledInput: document.querySelector('#effectEnabledInput'),
  targetSlotSelect: document.querySelector('#targetSlotSelect'),
  blendModeSelect: document.querySelector('#blendModeSelect'),
  gridXInput: document.querySelector('#gridXInput'),
  gridYInput: document.querySelector('#gridYInput'),
  fpsInput: document.querySelector('#fpsInput'),
  frameCountInput: document.querySelector('#frameCountInput'),
  playToggle: document.querySelector('#playToggle'),
  loopToggle: document.querySelector('#loopToggle'),
  uvChannelSelect: document.querySelector('#uvChannelSelect'),
  wrapModeSelect: document.querySelector('#wrapModeSelect'),
  offsetXInput: document.querySelector('#offsetXInput'),
  offsetYInput: document.querySelector('#offsetYInput'),
  scaleXInput: document.querySelector('#scaleXInput'),
  scaleYInput: document.querySelector('#scaleYInput'),
  gridToggle: document.querySelector('#gridToggle'),
  axesToggle: document.querySelector('#axesToggle'),
};

const renderer = new THREE.WebGLRenderer({ canvas: elements.canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.debug.checkShaderErrors = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#101820');

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(3.4, 2.2, 5.6);

const orbitControls = new OrbitControls(camera, elements.canvas);
orbitControls.enableDamping = true;
orbitControls.target.set(0, 1, 0);

const pointerControls = new PointerLockControls(camera, document.body);
scene.add(pointerControls.object);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const defaultEnvironment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = defaultEnvironment;
scene.environmentIntensity = 0.8;

const gltfLoader = new GLTFLoader();
const rgbeLoader = new RGBELoader();
const textureLoader = new THREE.TextureLoader();

const gridHelper = new THREE.GridHelper(20, 20, '#50606b', '#232d34');
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(2);
axesHelper.visible = false;
scene.add(axesHelper);

const ambientLight = new THREE.AmbientLight('#ffffff', 0.34);
const hemisphereLight = new THREE.HemisphereLight('#eaf4ff', '#182028', 0.9);

const keyLight = new THREE.DirectionalLight('#fff5e8', 1.8);
keyLight.position.set(6, 7, 5);

const fillLight = new THREE.DirectionalLight('#d8ebff', 0.85);
fillLight.position.set(-5, 3.5, 6);

const rimLight = new THREE.DirectionalLight('#cfe4ff', 0.65);
rimLight.position.set(-4, 6, -5);

scene.add(ambientLight, hemisphereLight, keyLight, fillLight, rimLight);

const state = {
  modelRoot: null,
  currentModelSource: '',
  currentAtlasSource: '',
  currentHdriSource: '',
  materials: [],
  selectedMaterialId: '',
  envIntensity: 0.8,
  cameraMode: 'orbit',
  firstPerson: {
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    movement: { forward: false, backward: false, left: false, right: false },
    speed: 5.5,
  },
  effect: {
    ...DEFAULT_EFFECT_STATE,
  },
  atlasTexture: null,
  debugBoundsHelper: null,
};

function setStatus(message) {
  elements.statusLabel.textContent = message;
}

renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
  const vertexLog = gl.getShaderInfoLog(vertexShader);
  const fragmentLog = gl.getShaderInfoLog(fragmentShader);
  console.error(`Shader compile error\nVertex:\n${vertexLog || '(none)'}\nFragment:\n${fragmentLog || '(none)'}`);
  console.error('Shader program', program);
  setStatus('Atlas shader compile error. Open console with F12.');
};

function formatAssetLabel(source, fallback = 'none') {
  if (!source) {
    return fallback;
  }
  return source.startsWith('blob:') ? 'local file' : source;
}

function updateAssetSummary() {
  elements.modelStatus.textContent = formatAssetLabel(state.currentModelSource);
  elements.atlasStatus.textContent = formatAssetLabel(state.currentAtlasSource);
  elements.hdriStatus.textContent = formatAssetLabel(state.currentHdriSource, 'default studio');
}

function sanitizeNumber(value, fallback, min = -Infinity) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, numeric);
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function buildSceneConfig() {
  return {
    version: 1,
    assets: {
      model: state.currentModelSource || null,
      atlas: state.currentAtlasSource || null,
      hdri: state.currentHdriSource || null,
    },
    viewer: {
      cameraMode: state.cameraMode,
      exposure: renderer.toneMappingExposure,
      envIntensity: state.envIntensity,
      cameraPosition: camera.position.toArray(),
      orbitTarget: orbitControls.target.toArray(),
    },
    materialEffect: {
      materialId: state.selectedMaterialId || null,
      materialName: getSelectedMaterialEntry()?.material.name || null,
      ...state.effect,
    },
  };
}

function syncConfigOutput() {
  elements.configOutput.value = JSON.stringify(buildSceneConfig(), null, 2);
  updateAssetSummary();
}

function createObjectUrl(file) {
  return URL.createObjectURL(file);
}

function revokeIfBlob(url) {
  if (typeof url === 'string' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function disposeTexture(texture) {
  if (texture?.isTexture) {
    texture.dispose();
  }
}

function getWrapMode(mode) {
  return mode === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
}

function ensureAtlasTextureOptions(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = getWrapMode(state.effect.wrapMode);
  texture.wrapT = getWrapMode(state.effect.wrapMode);
  texture.needsUpdate = true;
}

function getFrameCoordinates(index, gridX, gridY, order) {
  const columns = Math.max(1, gridX);
  const rows = Math.max(1, gridY);
  if (order === 'column') {
    return {
      column: Math.floor(index / rows),
      row: index % rows,
    };
  }

  return {
    column: index % columns,
    row: Math.floor(index / columns),
  };
}

function updateAtlasPreview() {
  const canvas = elements.atlasPreview;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0d141b';
  ctx.fillRect(0, 0, width, height);

  if (!state.atlasTexture?.image) {
    ctx.fillStyle = '#9cb0bf';
    ctx.font = '16px Inter, system-ui, sans-serif';
    ctx.fillText('Atlas preview appears here', 20, 36);
    return;
  }

  const image = state.atlasTexture.image;
  const imageAspect = image.width / image.height;
  const canvasAspect = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (imageAspect > canvasAspect) {
    drawHeight = width / imageAspect;
    offsetY = (height - drawHeight) * 0.5;
  } else {
    drawWidth = height * imageAspect;
    offsetX = (width - drawWidth) * 0.5;
  }

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const columns = Math.max(1, state.effect.gridX);
  const rows = Math.max(1, state.effect.gridY);
  const cellWidth = drawWidth / columns;
  const cellHeight = drawHeight / rows;
  const maxFrames = Math.min(state.effect.frameCount, columns * rows);

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= columns; x += 1) {
    const drawX = offsetX + x * cellWidth;
    ctx.beginPath();
    ctx.moveTo(drawX, offsetY);
    ctx.lineTo(drawX, offsetY + drawHeight);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y += 1) {
    const drawY = offsetY + y * cellHeight;
    ctx.beginPath();
    ctx.moveTo(offsetX, drawY);
    ctx.lineTo(offsetX + drawWidth, drawY);
    ctx.stroke();
  }

  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  for (let frame = 0; frame < maxFrames; frame += 1) {
    const { column, row } = getFrameCoordinates(frame, columns, rows, state.effect.frameOrder);
    const labelX = offsetX + column * cellWidth + 6;
    const labelY = offsetY + row * cellHeight + 6;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(labelX - 3, labelY - 2, 28, 18);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(frame + 1), labelX, labelY);
  }

  const activeFrame = Math.min(state.effect.currentFrame, Math.max(0, maxFrames - 1));
  const { column: activeColumn, row: activeRow } = getFrameCoordinates(activeFrame, columns, rows, state.effect.frameOrder);
  ctx.strokeStyle = '#6ae2b6';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    offsetX + activeColumn * cellWidth + 1,
    offsetY + activeRow * cellHeight + 1,
    Math.max(0, cellWidth - 2),
    Math.max(0, cellHeight - 2),
  );
}

function createDemoScene() {
  clearCurrentModel();

  const root = new THREE.Group();
  root.name = 'Demo Scene';

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(5.5, 80),
    new THREE.MeshStandardMaterial({ color: '#394650', roughness: 0.92, metalness: 0.06 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.8;
  root.add(floor);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.22, 48, 120),
    new THREE.MeshPhysicalMaterial({
      name: 'Demo Ring Material',
      color: '#b48b35',
      roughness: 0.28,
      metalness: 0.82,
      clearcoat: 0.25,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.8;
  root.add(ring);

  scene.add(root);
  state.modelRoot = root;
  state.currentModelSource = 'demo://ring';
  collectMaterials(root);
  frameObject(root);
  setStatus('Открыта demo-сцена. Можно тестировать material patching без внешней модели.');
}

function clearCurrentModel() {
  if (!state.modelRoot) {
    return;
  }

  state.modelRoot.traverse((child) => {
    if (!child.isMesh) {
      return;
    }
    child.geometry?.dispose();
  });

  scene.remove(state.modelRoot);
  state.modelRoot = null;
  if (state.debugBoundsHelper) {
    scene.remove(state.debugBoundsHelper);
    state.debugBoundsHelper = null;
  }
  state.materials = [];
  state.selectedMaterialId = '';
  state.currentModelSource = '';
  elements.materialSelect.innerHTML = '<option value="">Сначала загрузи модель</option>';
  elements.materialMeta.textContent = 'Материалы сцены пока не найдены.';
  updateAssetSummary();
}

function frameObject(object) {
  if (!object) {
    return;
  }

  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    return;
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const fitHeightDistance = maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = 1.55 * Math.max(fitHeightDistance, fitWidthDistance, maxSize);
  const direction = new THREE.Vector3(1.1, 0.8, 1).normalize();
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  camera.position.copy(center).add(direction.multiplyScalar(distance));
  camera.near = Math.max(sphere.radius / 500, 0.01);
  camera.far = Math.max(sphere.radius * 40, 100);
  camera.updateProjectionMatrix();
  orbitControls.target.copy(center);
  orbitControls.minDistance = Math.max(sphere.radius * 0.35, 0.05);
  orbitControls.maxDistance = Math.max(sphere.radius * 18, 20);
  orbitControls.update();

  if (state.cameraMode === 'firstPerson') {
    pointerControls.object.position.copy(camera.position);
  }

  if (state.debugBoundsHelper) {
    scene.remove(state.debugBoundsHelper);
  }
  state.debugBoundsHelper = new THREE.Box3Helper(box, new THREE.Color('#6ae2b6'));
  state.debugBoundsHelper.visible = false;
  scene.add(state.debugBoundsHelper);
  syncConfigOutput();
}

function updateEnvironmentIntensity() {
  state.materials.forEach(({ material }) => {
    if ('envMapIntensity' in material) {
      material.envMapIntensity = state.envIntensity;
      material.needsUpdate = true;
    }
  });
}

function getSelectedMaterialEntry() {
  return state.materials.find((entry) => entry.id === state.selectedMaterialId) ?? null;
}

function describeMaterial(entry) {
  const { material, meshes } = entry;
  const mapFlags = [
    ['baseColor', Boolean(material.map)],
    ['emissive', Boolean(material.emissiveMap)],
    ['normal', Boolean(material.normalMap)],
    ['ao', Boolean(material.aoMap)],
    ['roughness', Boolean(material.roughnessMap)],
    ['metalness', Boolean(material.metalnessMap)],
  ]
    .map(([label, present]) => `${label}: ${present ? 'yes' : 'no'}`)
    .join(' | ');

  elements.materialMeta.textContent = `${material.name || 'Unnamed material'} | ${material.type} | meshes: ${meshes.join(', ')} | ${mapFlags}`;
}

function collectMaterials(root) {
  const seen = new Map();

  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material, index) => {
      if (!material) {
        return;
      }

      if (!seen.has(material.uuid)) {
        seen.set(material.uuid, {
          id: material.uuid,
          material,
          label: material.name || `${child.name || 'Mesh'} / Material ${index + 1}`,
          meshes: [child.name || `Mesh ${index + 1}`],
        });
      } else {
        seen.get(material.uuid).meshes.push(child.name || `Mesh ${index + 1}`);
      }
    });
  });

  state.materials = Array.from(seen.values());
  elements.materialSelect.innerHTML = '';

  if (!state.materials.length) {
    elements.materialSelect.innerHTML = '<option value="">Материалы не найдены</option>';
    elements.materialMeta.textContent = 'Материалы сцены пока не найдены.';
    return;
  }

  state.materials.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    elements.materialSelect.append(option);
  });

  state.selectedMaterialId = state.materials[0].id;
  elements.materialSelect.value = state.selectedMaterialId;
  describeMaterial(getSelectedMaterialEntry());
  elements.playPauseAtlasButton.textContent = state.effect.play ? 'Pause atlas' : 'Play atlas';
  updateAtlasPreview();
  applyEffectToAllMaterials();
}

function loadTextureFromUrl(url) {
  return new Promise((resolve, reject) => {
    textureLoader.load(url, resolve, undefined, reject);
  });
}

function loadHdriFromUrl(url) {
  return new Promise((resolve, reject) => {
    rgbeLoader.load(url, resolve, undefined, reject);
  });
}

function loadGltfFromUrl(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject);
  });
}

async function loadAtlasSource(url, label = url, revokeAfter = false) {
  try {
    const texture = await loadTextureFromUrl(url);
    disposeTexture(state.atlasTexture);
    ensureAtlasTextureOptions(texture);
    state.atlasTexture = texture;
    state.currentAtlasSource = label;
    state.effect.enabled = true;
    clampFrameCount();
    fillControlsFromState();
    applyEffectToAllMaterials();
    updateAtlasPreview();
    setStatus(`Atlas loaded: ${label}. Safe overlay mode: Emission + Screen.`);
  } catch (error) {
    console.error(error);
    setStatus(`Не удалось загрузить atlas: ${label}`);
  } finally {
    if (revokeAfter) {
      revokeIfBlob(url);
    }
    syncConfigOutput();
  }
}

async function loadHdriSource(url, label = url, revokeAfter = false) {
  try {
    const texture = await loadHdriFromUrl(url);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
    if (scene.environment && scene.environment !== defaultEnvironment) {
      disposeTexture(scene.environment);
    }
    scene.environment = envMap;
    state.currentHdriSource = label;
    updateEnvironmentIntensity();
    texture.dispose();
    setStatus(`Environment loaded: ${label}`);
  } catch (error) {
    console.error(error);
    setStatus(`Не удалось загрузить HDRI: ${label}`);
  } finally {
    if (revokeAfter) {
      revokeIfBlob(url);
    }
    syncConfigOutput();
  }
}

async function loadModelSource(url, label = url, revokeAfter = false) {
  clearCurrentModel();
  setStatus(`Загружаю модель: ${label}`);

  try {
    const gltf = await loadGltfFromUrl(url);
    const root = gltf.scene;
    root.traverse((child) => {
      if (!child.isMesh) {
        return;
      }
      child.castShadow = true;
      child.receiveShadow = true;
    });

    scene.add(root);
    state.modelRoot = root;
    state.currentModelSource = label;
    collectMaterials(root);
    frameObject(root);
    orbitControls.saveState();
    updateEnvironmentIntensity();
    setStatus(`Модель загружена: ${label}`);
  } catch (error) {
    console.error(error);
    setStatus(`Не удалось загрузить модель: ${label}`);
  } finally {
    if (revokeAfter) {
      revokeIfBlob(url);
    }
    syncConfigOutput();
  }
}

function getActiveUv(vUv, vUv2) {
  return state.effect.uvChannel === 'uv2' ? vUv2 : vUv;
}

function getBlendFunction(mode) {
  switch (mode) {
    case 'replace':
      return 'mix(baseColor, overlayColor, overlayAlpha)';
    case 'debug':
      return 'mix(baseColor, vec3(0.0, 1.0, 1.0), overlayAlpha)';
    case 'mix':
      return 'mix(baseColor, overlayColor, overlayAlpha)';
    case 'add':
      return 'baseColor + overlayColor * overlayAlpha';
    case 'multiply':
      return 'mix(baseColor, baseColor * overlayColor, overlayAlpha)';
    case 'screen':
      return '1.0 - (1.0 - baseColor) * (1.0 - overlayColor * overlayAlpha)';
    default:
      return 'mix(baseColor, overlayColor, overlayAlpha)';
  }
}

function getOverlayAlphaExpression(mode) {
  if (mode === 'replace') {
    return 'smoothstep(0.04, 0.35, max(atlasSample.r, max(atlasSample.g, atlasSample.b))) * uAtlasOpacity';
  }
  if (mode === 'debug') {
    return 'max(0.2, max(atlasSample.r, max(atlasSample.g, atlasSample.b)) * uAtlasOpacity)';
  }
  return 'max(atlasSample.a, max(atlasSample.r, max(atlasSample.g, atlasSample.b))) * uAtlasOpacity';
}

function clampFrameCount() {
  const maxFrames = Math.max(1, state.effect.gridX * state.effect.gridY);
  state.effect.frameCount = Math.min(Math.max(1, state.effect.frameCount), maxFrames);
  state.effect.currentFrame = Math.min(Math.max(0, state.effect.currentFrame), state.effect.frameCount - 1);
}

function updateCurrentFrameUi() {
  const maxFrame = Math.max(1, state.effect.frameCount);
  elements.currentFrameInput.max = String(Math.max(0, maxFrame - 1));
  elements.currentFrameInput.value = String(
    Math.min(Math.max(0, state.effect.currentFrame), Math.max(0, maxFrame - 1)),
  );
  elements.currentFrameValue.textContent = `${state.effect.currentFrame + 1} / ${maxFrame}`;
}

function applyPatchToMaterial(material) {
  if (!material || !('onBeforeCompile' in material)) {
    return;
  }

  if (!material.userData.originalOnBeforeCompile) {
    material.userData.originalOnBeforeCompile = material.onBeforeCompile;
  }
  if (!material.userData.originalCustomProgramCacheKey) {
    material.userData.originalCustomProgramCacheKey = material.customProgramCacheKey;
  }

  const shouldPatch = material.uuid === state.selectedMaterialId && Boolean(state.atlasTexture);
  material.userData.atlasEffectActive = shouldPatch;

  material.customProgramCacheKey = () =>
    JSON.stringify({
      atlas: shouldPatch,
      slot: state.effect.targetSlot,
      blend: state.effect.blendMode,
      uvChannel: state.effect.uvChannel,
      frameOrder: state.effect.frameOrder,
      wrapMode: state.effect.wrapMode,
    });

  material.onBeforeCompile = (shader) => {
    if (!material.userData.atlasEffectActive || !state.atlasTexture) {
      return;
    }

    shader.uniforms.uAtlasTexture = { value: state.atlasTexture };
    shader.uniforms.uAtlasGrid = { value: new THREE.Vector2(state.effect.gridX, state.effect.gridY) };
    shader.uniforms.uAtlasFrame = { value: 0 };
    shader.uniforms.uAtlasOpacity = { value: state.effect.opacity };
    shader.uniforms.uAtlasMaskByRelief = { value: state.effect.maskByRelief ? 1 : 0 };
    shader.uniforms.uAtlasReliefStrength = { value: state.effect.reliefStrength };
    shader.uniforms.uAtlasTransform = {
      value: new THREE.Vector4(state.effect.offsetX, state.effect.offsetY, state.effect.scaleX, state.effect.scaleY),
    };
    shader.uniforms.uAtlasRotation = { value: toRadians(state.effect.rotation) };
    shader.uniforms.uAtlasEnabled = { value: state.effect.enabled ? 1 : 0 };
    shader.uniforms.uAtlasUseUv2 = { value: state.effect.uvChannel === 'uv2' ? 1 : 0 };
    shader.uniforms.uAtlasOrder = { value: state.effect.frameOrder === 'column' ? 1 : 0 };
    shader.uniforms.uAtlasTargetSlot = { value: state.effect.targetSlot === 'emissive' ? 1 : 0 };
    material.userData.atlasUniforms = shader.uniforms;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_pars_vertex>',
      `#include <uv_pars_vertex>
varying vec2 vAtlasUv;
varying vec2 vAtlasUv2;`,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
vAtlasUv = vec2(0.0);
vAtlasUv2 = vec2(0.0);
#ifdef USE_UV
  vAtlasUv = uv;
#endif
#ifdef USE_UV2
  vAtlasUv2 = uv2;
#else
  vAtlasUv2 = vAtlasUv;
#endif`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform sampler2D uAtlasTexture;
uniform vec2 uAtlasGrid;
uniform float uAtlasFrame;
uniform float uAtlasOpacity;
uniform float uAtlasMaskByRelief;
uniform float uAtlasReliefStrength;
uniform vec4 uAtlasTransform;
uniform float uAtlasRotation;
uniform float uAtlasEnabled;
uniform float uAtlasUseUv2;
uniform float uAtlasOrder;
uniform float uAtlasTargetSlot;
varying vec2 vAtlasUv;
varying vec2 vAtlasUv2;

vec2 rotateAtlasUv(vec2 uv, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  uv -= 0.5;
  uv = mat2(c, -s, s, c) * uv;
  uv += 0.5;
  return uv;
}

vec2 getAtlasSampleUv() {
  vec2 sourceUv = mix(vAtlasUv, vAtlasUv2, step(0.5, uAtlasUseUv2));
  vec2 transformed = sourceUv * uAtlasTransform.zw + uAtlasTransform.xy;
  transformed = rotateAtlasUv(transformed, uAtlasRotation);

  vec2 tiledUv = transformed;
  if (${state.effect.wrapMode === 'clamp' ? 'true' : 'false'}) {
    tiledUv = clamp(tiledUv, 0.0, 1.0);
  } else {
    tiledUv = fract(tiledUv);
  }

  float frame = uAtlasFrame;
  float columns = max(uAtlasGrid.x, 1.0);
  float rows = max(uAtlasGrid.y, 1.0);
  float column = 0.0;
  float row = 0.0;
  if (uAtlasOrder > 0.5) {
    row = mod(frame, rows);
    column = floor(frame / rows);
  } else {
    column = mod(frame, columns);
    row = floor(frame / columns);
  }
  vec2 tileSize = vec2(1.0 / columns, 1.0 / rows);
  return vec2(column, rows - 1.0 - row) * tileSize + tiledUv * tileSize;
}

vec4 sampleAtlasColor() {
  vec4 atlasSample = texture2D(uAtlasTexture, getAtlasSampleUv());
  return atlasSample;
}

vec2 getAtlasMaskUv() {
  return mix(vAtlasUv, vAtlasUv2, step(0.5, uAtlasUseUv2));
}

float sampleReliefMask() {
  return 1.0;
}`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
if (uAtlasEnabled > 0.5 && uAtlasTargetSlot < 0.5) {
  vec4 atlasSample = sampleAtlasColor();
  vec3 overlayColor = atlasSample.rgb;
  float overlayAlpha = ${getOverlayAlphaExpression(state.effect.blendMode)} * sampleReliefMask();
  vec3 baseColor = diffuseColor.rgb;
  diffuseColor.rgb = ${getBlendFunction(state.effect.blendMode)};
}`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      `if (uAtlasEnabled > 0.5 && uAtlasTargetSlot > 0.5) {
  vec4 atlasSample = sampleAtlasColor();
  vec3 overlayColor = atlasSample.rgb;
  float overlayAlpha = ${getOverlayAlphaExpression(state.effect.blendMode)} * sampleReliefMask();
  vec3 baseColor = outgoingLight;
  outgoingLight = ${getBlendFunction(state.effect.blendMode)};
}
#include <output_fragment>`,
    );
  };

  material.needsUpdate = true;
}

function clearPatchFromMaterial(material) {
  if (!material || !('onBeforeCompile' in material)) {
    return;
  }
  material.userData.atlasEffectActive = false;
  material.userData.atlasUniforms = null;
  material.onBeforeCompile = material.userData.originalOnBeforeCompile ?? (() => {});
  material.customProgramCacheKey =
    material.userData.originalCustomProgramCacheKey ?? material.customProgramCacheKey;
  material.needsUpdate = true;
}

function applyEffectToAllMaterials() {
  state.materials.forEach(({ material }) => {
    if (material.uuid === state.selectedMaterialId && state.atlasTexture && state.effect.enabled) {
      applyPatchToMaterial(material);
    } else {
      clearPatchFromMaterial(material);
    }
  });
  describeMaterial(getSelectedMaterialEntry() ?? { material: { name: '-', type: '-' }, meshes: [] });
  syncConfigOutput();
}

function updateMaterialUniforms() {
  const entry = getSelectedMaterialEntry();
  const uniforms = entry?.material.userData.atlasUniforms;
  if (!uniforms) {
    return;
  }

  uniforms.uAtlasTexture.value = state.atlasTexture;
  uniforms.uAtlasGrid.value.set(state.effect.gridX, state.effect.gridY);
  uniforms.uAtlasOpacity.value = state.effect.opacity;
  uniforms.uAtlasMaskByRelief.value = state.effect.maskByRelief ? 1 : 0;
  uniforms.uAtlasReliefStrength.value = state.effect.reliefStrength;
  uniforms.uAtlasTransform.value.set(
    state.effect.offsetX,
    state.effect.offsetY,
    state.effect.scaleX,
    state.effect.scaleY,
  );
  uniforms.uAtlasRotation.value = toRadians(state.effect.rotation);
  uniforms.uAtlasEnabled.value = state.effect.enabled ? 1 : 0;
  uniforms.uAtlasUseUv2.value = state.effect.uvChannel === 'uv2' ? 1 : 0;
  uniforms.uAtlasOrder.value = state.effect.frameOrder === 'column' ? 1 : 0;
  uniforms.uAtlasTargetSlot.value = state.effect.targetSlot === 'emissive' ? 1 : 0;
  uniforms.uAtlasFrame.value = state.effect.currentFrame;
}

function setCameraMode(mode) {
  state.cameraMode = mode;
  document.querySelectorAll('[data-camera-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.cameraMode === mode);
  });

  if (mode === 'orbit') {
    pointerControls.unlock();
    orbitControls.enabled = true;
  } else {
    orbitControls.enabled = false;
    pointerControls.object.position.copy(camera.position);
  }
  syncConfigOutput();
}

function updateEffectStateFromControls() {
  state.effect.enabled = elements.effectEnabledInput.checked;
  state.effect.targetSlot = elements.targetSlotSelect.value;
  state.effect.blendMode = elements.blendModeSelect.value;
  state.effect.gridX = sanitizeNumber(elements.gridXInput.value, 1, 1);
  state.effect.gridY = sanitizeNumber(elements.gridYInput.value, 1, 1);
  state.effect.fps = sanitizeNumber(elements.fpsInput.value, 1, 1);
  state.effect.frameCount = sanitizeNumber(elements.frameCountInput.value, 1, 1);
  state.effect.currentFrame = sanitizeNumber(elements.currentFrameInput.value, 0, 0);
  state.effect.opacity = sanitizeNumber(elements.opacityInput.value, 1, 0);
  state.effect.maskByRelief = elements.maskByReliefInput.checked;
  state.effect.reliefStrength = sanitizeNumber(elements.reliefStrengthInput.value, 8, 0);
  state.effect.play = elements.playToggle.checked;
  state.effect.loop = elements.loopToggle.checked;
  state.effect.frameOrder = elements.frameOrderSelect.value;
  state.effect.uvChannel = elements.uvChannelSelect.value;
  state.effect.wrapMode = elements.wrapModeSelect.value;
  state.effect.offsetX = sanitizeNumber(elements.offsetXInput.value, 0);
  state.effect.offsetY = sanitizeNumber(elements.offsetYInput.value, 0);
  state.effect.scaleX = sanitizeNumber(elements.scaleXInput.value, 1, 0.01);
  state.effect.scaleY = sanitizeNumber(elements.scaleYInput.value, 1, 0.01);
  state.effect.rotation = sanitizeNumber(elements.rotationInput.value, 0);
  clampFrameCount();

  if (state.atlasTexture) {
    ensureAtlasTextureOptions(state.atlasTexture);
  }

  elements.opacityValue.textContent = state.effect.opacity.toFixed(2);
  elements.reliefStrengthValue.textContent = state.effect.reliefStrength.toFixed(1);
  elements.rotationValue.textContent = `${state.effect.rotation.toFixed(0)}°`;

  elements.frameCountInput.value = String(state.effect.frameCount);
  updateCurrentFrameUi();
  elements.playPauseAtlasButton.textContent = state.effect.play ? 'Pause atlas' : 'Play atlas';
  applyEffectToAllMaterials();
  updateMaterialUniforms();
  updateAtlasPreview();
  syncConfigOutput();
}

function fillControlsFromState() {
  elements.effectEnabledInput.checked = state.effect.enabled;
  elements.targetSlotSelect.value = state.effect.targetSlot;
  elements.blendModeSelect.value = state.effect.blendMode;
  elements.gridXInput.value = String(state.effect.gridX);
  elements.gridYInput.value = String(state.effect.gridY);
  elements.fpsInput.value = String(state.effect.fps);
  elements.frameCountInput.value = String(state.effect.frameCount);
  updateCurrentFrameUi();
  elements.opacityInput.value = String(state.effect.opacity);
  elements.maskByReliefInput.checked = state.effect.maskByRelief;
  elements.reliefStrengthInput.value = String(state.effect.reliefStrength);
  elements.reliefStrengthValue.textContent = state.effect.reliefStrength.toFixed(1);
  elements.playToggle.checked = state.effect.play;
  elements.loopToggle.checked = state.effect.loop;
  elements.frameOrderSelect.value = state.effect.frameOrder;
  elements.uvChannelSelect.value = state.effect.uvChannel;
  elements.wrapModeSelect.value = state.effect.wrapMode;
  elements.offsetXInput.value = String(state.effect.offsetX);
  elements.offsetYInput.value = String(state.effect.offsetY);
  elements.scaleXInput.value = String(state.effect.scaleX);
  elements.scaleYInput.value = String(state.effect.scaleY);
  elements.rotationInput.value = String(state.effect.rotation);
  elements.playPauseAtlasButton.textContent = state.effect.play ? 'Pause atlas' : 'Play atlas';
  updateAtlasPreview();
  elements.opacityValue.textContent = state.effect.opacity.toFixed(2);
  elements.reliefStrengthValue.textContent = state.effect.reliefStrength.toFixed(1);
  elements.rotationValue.textContent = `${state.effect.rotation.toFixed(0)}°`;
}

async function importConfig(file) {
  try {
    const parsed = JSON.parse(await file.text());
    await applyConfig(parsed);
    setStatus(`Config imported: ${file.name}`);
  } catch (error) {
    console.error(error);
    setStatus(`Не удалось импортировать config: ${file.name}`);
  }
}

async function applyConfig(config) {
  if (config?.assets?.model) {
    elements.modelUrlInput.value = config.assets.model;
    await loadModelSource(config.assets.model, config.assets.model);
  }
  if (config?.assets?.atlas) {
    elements.atlasUrlInput.value = config.assets.atlas;
    await loadAtlasSource(config.assets.atlas, config.assets.atlas);
  }
  if (config?.assets?.hdri) {
    elements.hdriUrlInput.value = config.assets.hdri;
    await loadHdriSource(config.assets.hdri, config.assets.hdri);
  }

  if (config?.viewer) {
    renderer.toneMappingExposure = sanitizeNumber(config.viewer.exposure, renderer.toneMappingExposure, 0);
    state.envIntensity = sanitizeNumber(config.viewer.envIntensity, state.envIntensity, 0);
    elements.exposureInput.value = String(renderer.toneMappingExposure);
    elements.exposureValue.textContent = renderer.toneMappingExposure.toFixed(2);
    elements.envIntensityInput.value = String(state.envIntensity);
    elements.envIntensityValue.textContent = state.envIntensity.toFixed(2);
    updateEnvironmentIntensity();

    if (Array.isArray(config.viewer.cameraPosition) && config.viewer.cameraPosition.length === 3) {
      camera.position.fromArray(config.viewer.cameraPosition);
    }
    if (Array.isArray(config.viewer.orbitTarget) && config.viewer.orbitTarget.length === 3) {
      orbitControls.target.fromArray(config.viewer.orbitTarget);
      orbitControls.update();
    }
    if (config.viewer.cameraMode === 'firstPerson' || config.viewer.cameraMode === 'orbit') {
      setCameraMode(config.viewer.cameraMode);
    }
  }

  if (config?.materialEffect) {
    Object.assign(state.effect, {
      enabled: config.materialEffect.enabled ?? state.effect.enabled,
      targetSlot: config.materialEffect.targetSlot ?? state.effect.targetSlot,
      blendMode: config.materialEffect.blendMode ?? state.effect.blendMode,
      frameOrder: config.materialEffect.frameOrder ?? state.effect.frameOrder,
      gridX: sanitizeNumber(config.materialEffect.gridX, state.effect.gridX, 1),
      gridY: sanitizeNumber(config.materialEffect.gridY, state.effect.gridY, 1),
      fps: sanitizeNumber(config.materialEffect.fps, state.effect.fps, 1),
      frameCount: sanitizeNumber(config.materialEffect.frameCount, state.effect.frameCount, 1),
      currentFrame: sanitizeNumber(config.materialEffect.currentFrame, state.effect.currentFrame, 0),
      opacity: sanitizeNumber(config.materialEffect.opacity, state.effect.opacity, 0),
      maskByRelief: config.materialEffect.maskByRelief ?? state.effect.maskByRelief,
      reliefStrength: sanitizeNumber(config.materialEffect.reliefStrength, state.effect.reliefStrength, 0),
      play: config.materialEffect.play ?? state.effect.play,
      loop: config.materialEffect.loop ?? state.effect.loop,
      uvChannel: config.materialEffect.uvChannel ?? state.effect.uvChannel,
      wrapMode: config.materialEffect.wrapMode ?? state.effect.wrapMode,
      offsetX: sanitizeNumber(config.materialEffect.offsetX, state.effect.offsetX),
      offsetY: sanitizeNumber(config.materialEffect.offsetY, state.effect.offsetY),
      scaleX: sanitizeNumber(config.materialEffect.scaleX, state.effect.scaleX, 0.01),
      scaleY: sanitizeNumber(config.materialEffect.scaleY, state.effect.scaleY, 0.01),
      rotation: sanitizeNumber(config.materialEffect.rotation, state.effect.rotation),
    });
    clampFrameCount();

    if (config.materialEffect.materialId && state.materials.some((entry) => entry.id === config.materialEffect.materialId)) {
      state.selectedMaterialId = config.materialEffect.materialId;
      elements.materialSelect.value = config.materialEffect.materialId;
    }
  }

  fillControlsFromState();
  updateEffectStateFromControls();
}

function downloadConfig() {
  const blob = new Blob([JSON.stringify(buildSceneConfig(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'scene-config.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyJsonToClipboard() {
  const json = JSON.stringify(buildSceneConfig(), null, 2);
  await navigator.clipboard.writeText(json);
  setStatus('JSON config copied to clipboard.');
}

async function copyViewerLink() {
  const config = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(buildSceneConfig())))));
  const url = `${window.location.origin}${window.location.pathname}?config=${config}`;
  await navigator.clipboard.writeText(url);
  setStatus('Viewer link copied. Работает корректно, если assets доступны по URL, а не только как локальные blob-файлы.');
}

function resetAtlasEffect() {
  disposeTexture(state.atlasTexture);
  state.atlasTexture = null;
  state.currentAtlasSource = '';
  Object.assign(state.effect, DEFAULT_EFFECT_STATE, { enabled: false });
  elements.atlasUrlInput.value = '';
  fillControlsFromState();
  updateAtlasPreview();
  applyEffectToAllMaterials();
  setStatus('Atlas reset.');
}

function handleMovement(delta) {
  if (state.cameraMode !== 'firstPerson' || !pointerControls.isLocked) {
    return;
  }

  state.firstPerson.direction.z = Number(state.firstPerson.movement.backward) - Number(state.firstPerson.movement.forward);
  state.firstPerson.direction.x = Number(state.firstPerson.movement.right) - Number(state.firstPerson.movement.left);
  state.firstPerson.direction.normalize();

  const moveSpeed = state.firstPerson.speed * delta;
  if (state.firstPerson.movement.forward || state.firstPerson.movement.backward) {
    pointerControls.moveForward(-state.firstPerson.direction.z * moveSpeed);
  }
  if (state.firstPerson.movement.left || state.firstPerson.movement.right) {
    pointerControls.moveRight(state.firstPerson.direction.x * moveSpeed);
  }
}

function updateAtlasFrame() {
  const entry = getSelectedMaterialEntry();
  const uniforms = entry?.material.userData.atlasUniforms;
  if (!uniforms) {
    return;
  }

  let frame = state.effect.currentFrame;
  if (state.effect.play) {
    frame = Math.floor(CLOCK.elapsedTime * state.effect.fps);
    if (state.effect.loop) {
      frame %= state.effect.frameCount;
    } else {
      frame = Math.min(frame, state.effect.frameCount - 1);
    }
    state.effect.currentFrame = frame;
    updateCurrentFrameUi();
    updateAtlasPreview();
  }
  uniforms.uAtlasFrame.value = frame;
}

function bindEvents() {
  document.querySelector('#openModelButton').addEventListener('click', () => elements.modelInput.click());
  document.querySelector('#openAtlasButton').addEventListener('click', () => elements.atlasInput.click());
  document.querySelector('#openHdriButton').addEventListener('click', () => elements.hdriInput.click());
  document.querySelector('#resetAtlasButton').addEventListener('click', resetAtlasEffect);

  document.querySelector('#loadModelUrlButton').addEventListener('click', () => {
    const url = elements.modelUrlInput.value.trim();
    if (url) {
      loadModelSource(url, url);
    }
  });
  document.querySelector('#loadAtlasUrlButton').addEventListener('click', () => {
    const url = elements.atlasUrlInput.value.trim();
    if (url) {
      loadAtlasSource(url, url);
    }
  });
  document.querySelector('#loadHdriUrlButton').addEventListener('click', () => {
    const url = elements.hdriUrlInput.value.trim();
    if (url) {
      loadHdriSource(url, url);
    }
  });

  elements.modelInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const url = createObjectUrl(file);
    loadModelSource(url, file.name, true);
  });

  elements.atlasInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const url = createObjectUrl(file);
    loadAtlasSource(url, file.name, true);
  });

  elements.hdriInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const url = createObjectUrl(file);
    loadHdriSource(url, file.name, true);
  });

  elements.configInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) {
      importConfig(file);
    }
  });

  document.querySelector('#loadDemoButton').addEventListener('click', async () => {
    elements.modelUrlInput.value = DEFAULT_MODEL_URL;
    elements.atlasUrlInput.value = '';
    resetAtlasEffect();
    await loadModelSource(DEFAULT_MODEL_URL, DEFAULT_MODEL_URL);
    setStatus('Demo ring loaded. Load atlas separately.');
  });

  document.querySelector('#focusModelButton').addEventListener('click', () => frameObject(state.modelRoot));
  document.querySelector('#resetCameraButton').addEventListener('click', () => {
    if (state.modelRoot) {
      frameObject(state.modelRoot);
    }
    orbitControls.reset();
    setStatus('Camera reset.');
  });
  document.querySelector('#lockPointerButton').addEventListener('click', () => {
    if (state.cameraMode === 'firstPerson') {
      pointerControls.lock();
    }
  });
  elements.playPauseAtlasButton.addEventListener('click', () => {
    state.effect.play = !state.effect.play;
    elements.playToggle.checked = state.effect.play;
    elements.playPauseAtlasButton.textContent = state.effect.play ? 'Pause atlas' : 'Play atlas';
    updateMaterialUniforms();
    syncConfigOutput();
  });

  elements.currentFrameInput.addEventListener('input', () => {
    state.effect.currentFrame = sanitizeNumber(elements.currentFrameInput.value, 0, 0);
    state.effect.play = false;
    elements.playToggle.checked = false;
    updateCurrentFrameUi();
    elements.playPauseAtlasButton.textContent = 'Play atlas';
    updateMaterialUniforms();
    updateAtlasPreview();
    syncConfigOutput();
  });

  document.querySelector('#downloadConfigButton').addEventListener('click', downloadConfig);
  document.querySelector('#copyConfigButton').addEventListener('click', () => {
    copyJsonToClipboard().catch((error) => {
      console.error(error);
      setStatus('Не удалось скопировать JSON config.');
    });
  });
  document.querySelector('#copyViewerLinkButton').addEventListener('click', () => {
    copyViewerLink().catch((error) => {
      console.error(error);
      setStatus('Не удалось скопировать viewer link.');
    });
  });

  elements.materialSelect.addEventListener('change', () => {
    state.selectedMaterialId = elements.materialSelect.value;
    describeMaterial(getSelectedMaterialEntry());
    applyEffectToAllMaterials();
  });

  [
    elements.effectEnabledInput,
    elements.targetSlotSelect,
    elements.blendModeSelect,
    elements.gridXInput,
    elements.gridYInput,
    elements.fpsInput,
    elements.frameCountInput,
    elements.currentFrameInput,
    elements.opacityInput,
    elements.maskByReliefInput,
    elements.reliefStrengthInput,
    elements.playToggle,
    elements.loopToggle,
    elements.frameOrderSelect,
    elements.uvChannelSelect,
    elements.wrapModeSelect,
    elements.offsetXInput,
    elements.offsetYInput,
    elements.scaleXInput,
    elements.scaleYInput,
    elements.rotationInput,
  ].forEach((input) => input.addEventListener('input', updateEffectStateFromControls));

  elements.exposureInput.addEventListener('input', () => {
    renderer.toneMappingExposure = sanitizeNumber(elements.exposureInput.value, 1, 0);
    elements.exposureValue.textContent = renderer.toneMappingExposure.toFixed(2);
    syncConfigOutput();
  });

  elements.envIntensityInput.addEventListener('input', () => {
    state.envIntensity = sanitizeNumber(elements.envIntensityInput.value, 1, 0);
    elements.envIntensityValue.textContent = state.envIntensity.toFixed(2);
    updateEnvironmentIntensity();
    syncConfigOutput();
  });

  elements.gridToggle.addEventListener('change', (event) => {
    gridHelper.visible = event.target.checked;
  });
  elements.axesToggle.addEventListener('change', (event) => {
    axesHelper.visible = event.target.checked;
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyF') {
      frameObject(state.modelRoot);
    }
    if (event.code === 'KeyR' && state.cameraMode === 'orbit') {
      orbitControls.reset();
    }
  });

  document.querySelectorAll('[data-camera-mode]').forEach((button) => {
    button.addEventListener('click', () => setCameraMode(button.dataset.cameraMode));
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyW') state.firstPerson.movement.forward = true;
    if (event.code === 'KeyS') state.firstPerson.movement.backward = true;
    if (event.code === 'KeyA') state.firstPerson.movement.left = true;
    if (event.code === 'KeyD') state.firstPerson.movement.right = true;
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'KeyW') state.firstPerson.movement.forward = false;
    if (event.code === 'KeyS') state.firstPerson.movement.backward = false;
    if (event.code === 'KeyA') state.firstPerson.movement.left = false;
    if (event.code === 'KeyD') state.firstPerson.movement.right = false;
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    window.addEventListener(eventName, (event) => {
      event.preventDefault();
      document.querySelector('#dropzone').classList.add('active');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    window.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (eventName === 'drop') {
        const files = Array.from(event.dataTransfer?.files ?? []);
        files.forEach((file) => {
          if (file.name.endsWith('.json')) {
            importConfig(file);
            return;
          }
          if (file.name.match(/\.(glb|gltf)$/i)) {
            loadModelSource(createObjectUrl(file), file.name, true);
            return;
          }
          if (file.name.match(/\.hdr$/i)) {
            loadHdriSource(createObjectUrl(file), file.name, true);
            return;
          }
          if (file.name.match(/\.(png|jpg|jpeg|webp)$/i)) {
            loadAtlasSource(createObjectUrl(file), file.name, true);
          }
        });
      }
      document.querySelector('#dropzone').classList.remove('active');
    });
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

async function bootstrapFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const configParam = params.get('config');
  if (configParam) {
    try {
      const decoded = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(configParam)))));
      await applyConfig(decoded);
      setStatus('Сцена восстановлена из URL config.');
      return;
    } catch (error) {
      console.error(error);
    }
  }
  state.envIntensity = 0.8;
  elements.envIntensityInput.value = String(state.envIntensity);
  elements.envIntensityValue.textContent = state.envIntensity.toFixed(2);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = CLOCK.getDelta();

  if (state.cameraMode === 'orbit') {
    orbitControls.update();
  } else {
    handleMovement(delta);
  }

  updateMaterialUniforms();
  updateAtlasFrame();
  renderer.render(scene, camera);
}

bindEvents();
fillControlsFromState();
elements.exposureInput.value = String(renderer.toneMappingExposure);
elements.exposureValue.textContent = renderer.toneMappingExposure.toFixed(2);
elements.envIntensityInput.value = String(state.envIntensity);
elements.envIntensityValue.textContent = state.envIntensity.toFixed(2);
elements.playPauseAtlasButton.textContent = state.effect.play ? 'Pause atlas' : 'Play atlas';
updateAssetSummary();
updateAtlasPreview();
setCameraMode('orbit');
bootstrapFromUrl().finally(() => {
  syncConfigOutput();
  animate();
});
