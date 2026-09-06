import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRenderer, buildRoom } from './scene.js';
import { initXR } from './xr.js';
import { setupInput } from './input.js';
import { Panel, PANEL_H } from './panels/Panel.js';
import { resolveInput } from './content/providers.js';

const logEl = document.getElementById('log-text');
const flatHint = document.getElementById('flat-hint');
const log = (msg) => { logEl.textContent = msg; };

// ---- scene bootstrap -------------------------------------------------
const canvas = document.getElementById('scene-canvas');
const renderer = createRenderer(canvas);
const scene = new THREE.Scene();
buildRoom(scene);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 60);
camera.position.set(0, 1.6, 1.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, -1.2);
controls.enableDamping = true;
controls.minDistance = 0.5;
controls.maxDistance = 6;
controls.update();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- panel manager -----------------------------------------------------
/** @type {Panel[]} */
const panels = [];
let activePanel = null;
let spawnIndex = 0;

function nextSpawnTransform() {
  // arc the panels out to the right/left of the home panel, slightly angled
  // toward the user, so a growing workspace stays legible.
  const i = spawnIndex++;
  const side = i % 2 === 0 ? 1 : -1;
  const rank = Math.floor(i / 2) + 1;
  const angle = side * rank * 0.42;
  const radius = 1.5;
  const pos = new THREE.Vector3(Math.sin(angle) * radius, 1.55 - rank * 0.03, -Math.cos(angle) * radius);
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0));
  return { position: pos, quaternion: quat };
}

function spawnPanel(entry, transform) {
  const panel = new Panel(transform || { position: new THREE.Vector3(0, 1.6, -1.4) });
  scene.add(panel.group);
  panels.push(panel);
  activePanel = panel;
  panel.navigate(entry).then(() => log(`Opened ${entry.label || entry.query}`));
  return panel;
}

function closePanel(panel) {
  scene.remove(panel.group);
  panel.dispose();
  const idx = panels.indexOf(panel);
  if (idx >= 0) panels.splice(idx, 1);
  if (activePanel === panel) activePanel = panels[panels.length - 1] || null;
}

function openExternal(url) {
  const doOpen = () => window.open(url, '_blank', 'noopener');
  if (renderer.xr.isPresenting) {
    renderer.xr.getSession().end().then(doOpen);
  } else {
    doOpen();
  }
}

// ---- load the curated catalog, then seed the room -----------------------
let catalog = { entries: [] };
fetch(`${import.meta.env.BASE_URL}sites.json`)
  .then((r) => r.json())
  .then((data) => {
    catalog = data;
    const homeEntry = { id: 'home', type: 'home', label: 'Home', catalog: catalog.entries };
    spawnPanel(homeEntry, { position: new THREE.Vector3(0, 1.6, -1.4) });
    spawnIndex = 1;
    const first = catalog.entries.find((e) => e.type === 'wiki');
    if (first) spawnPanel(first, nextSpawnTransform());
    log('Room ready. Grip to drag a panel, trigger to click.');
  })
  .catch((err) => log(`Couldn\u2019t load sites.json: ${err.message}`));

// ---- interaction dispatch (shared by VR trigger and flat-mode mouse click)
function onActivate(panel, uv) {
  if (!panel) return;
  activePanel = panel;
  const hit = panel.hitTest(uv);
  if (!hit) return;

  if (hit.kind === 'nav') {
    if (!hit.enabled) return;
    if (hit.action === 'back') panel.goBack();
    else if (hit.action === 'forward') panel.goForward();
    else if (hit.action === 'home') {
      panel.navigate({ id: 'home', type: 'home', label: 'Home', catalog: catalog.entries });
    } else if (hit.action === 'close') closePanel(panel);
  } else if (hit.kind === 'external') {
    openExternal(hit.url);
  } else if (hit.kind === 'item') {
    if (panel.currentEntry?.type === 'home') {
      const target = panel._homeCatalog[hit.index];
      if (target) spawnPanel(target, nextSpawnTransform());
    } else if (panel.currentEntry?.type === 'headlines') {
      const item = panel.lastResult?.items?.[hit.index];
      if (item?.url) openExternal(item.url);
    }
  }
}

const input = setupInput(renderer, scene, camera, {
  getPanels: () => panels,
  onActivate
});

// ---- XR session lifecycle ------------------------------------------------
initXR(renderer, {
  onSessionStart: () => {
    flatHint.style.display = 'none';
    controls.enabled = false;
  },
  onSessionEnd: () => {
    flatHint.style.display = '';
    controls.enabled = true;
  }
});

// ---- flat-mode address bar ------------------------------------------------
const navForm = document.getElementById('nav-form');
const navInput = document.getElementById('nav-input');
const backBtn = document.getElementById('nav-back');
const fwdBtn = document.getElementById('nav-fwd');
const homeBtn = document.getElementById('nav-home');

function refreshChromeButtons() {
  backBtn.disabled = !activePanel || activePanel.historyIndex <= 0;
  fwdBtn.disabled = !activePanel || activePanel.historyIndex >= activePanel.history.length - 1;
}

navForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const entry = resolveInput(navInput.value, catalog.entries || []);
  if (!entry) return;
  if (activePanel) activePanel.navigate(entry);
  else spawnPanel(entry, nextSpawnTransform());
  navInput.value = '';
});
backBtn.addEventListener('click', () => activePanel?.goBack());
fwdBtn.addEventListener('click', () => activePanel?.goForward());
homeBtn.addEventListener('click', () => {
  activePanel?.navigate({ id: 'home', type: 'home', label: 'Home', catalog: catalog.entries });
});

// ---- render loop -----------------------------------------------------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  input.update();
  for (const p of panels) p.tick(dt);
  if (!renderer.xr.isPresenting) controls.update();
  refreshChromeButtons();
  renderer.render(scene, camera);
});

export { PANEL_H };
