import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fetchContent } from '../content/providers.js';
import { drawLoading, drawMessage, drawText, drawList, drawNavButtons, THEME } from '../content/panel-content.js';

const CANVAS_W = 1024;
const CANVAS_H = 640;
const PANEL_W = 1.0;
const PANEL_H = (CANVAS_H / CANVAS_W) * PANEL_W;
const TITLE_FRAC = 64 / CANVAS_H; // fraction of panel height used by the title/nav bar

const gltfLoader = new GLTFLoader();
const imageCache = new Map();

function loadImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
}

let panelCount = 0;

export class Panel {
  constructor({ position, quaternion } = {}) {
    this.id = `panel-${++panelCount}`;
    this.history = [];
    this.historyIndex = -1;
    this.contentRects = []; // hit regions in canvas-pixel space, for list rows
    this.navRects = [];
    this.extra = null; // secondary mesh/group for video or model kinds
    this.onClose = null;

    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const geometry = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
    const material = new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.userData.panel = this;
    this.mesh.userData.selectable = true;
    this.mesh.userData.draggable = true;

    // thin backing plate for a little depth / shadow-catcher feel
    const backGeom = new THREE.PlaneGeometry(PANEL_W + 0.04, PANEL_H + 0.04);
    const backMat = new THREE.MeshBasicMaterial({ color: 0x05070a, side: THREE.DoubleSide });
    const back = new THREE.Mesh(backGeom, backMat);
    back.position.z = -0.01;

    this.group = new THREE.Group();
    this.group.add(back, this.mesh);
    if (position) this.group.position.copy(position);
    if (quaternion) this.group.quaternion.copy(quaternion);

    this._drawLoading('Spatial Reader');
  }

  /** Local-space rect (x,y in meters, plane-centered) of the body area below the title bar. */
  bodyRectLocal() {
    const top = PANEL_H / 2 - PANEL_H * TITLE_FRAC;
    return { x: -PANEL_W / 2, y: -PANEL_H / 2, width: PANEL_W, height: top - -PANEL_H / 2 };
  }

  _drawLoading(label) {
    drawLoading(this.ctx, CANVAS_W, CANVAS_H, label);
    this.navRects = drawNavButtons(this.ctx, CANVAS_W, { canBack: false, canForward: false });
    this.texture.needsUpdate = true;
  }

  _clearExtra() {
    if (this.extra) {
      this.group.remove(this.extra);
      this.extra.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose?.();
      });
      if (this.extra.material?.map?.dispose) this.extra.material.map.dispose();
      this.extra = null;
    }
  }

  async navigate(entry, { pushHistory = true } = {}) {
    this.currentEntry = entry;
    this._drawLoading(entry.label || entry.query || 'Loading');
    this._clearExtra();

    if (entry.type === 'home') {
      this._homeCatalog = entry.catalog;
      await this._render({
        status: 'ok',
        kind: 'list',
        title: 'Home \u2014 curated destinations',
        items: entry.catalog.map((e) => ({ label: e.label, meta: e.type }))
      });
    } else if (entry.type === '__unsupported__') {
      await this._render({
        status: 'blocked',
        title: entry.label,
        message:
          'This is a static site, so arbitrary pages can\u2019t be embedded here. ' +
          'Try a curated destination from Home, or open it outside VR.'
      });
    } else {
      const result = await fetchContent(entry);
      await this._render(result);
    }

    if (pushHistory) {
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(entry);
      this.historyIndex = this.history.length - 1;
    }
  }

  async _render(result) {
    this.lastResult = result;
    this.contentRects = [];

    if (result.status === 'blocked' || result.status === 'error') {
      this.contentRects = drawMessage(this.ctx, CANVAS_W, CANVAS_H, result, result.status === 'blocked' ? 'warn' : 'error');
    } else if (result.kind === 'text') {
      const img = result.imageUrl ? await loadImage(result.imageUrl) : null;
      drawText(this.ctx, CANVAS_W, CANVAS_H, result, img);
    } else if (result.kind === 'list') {
      this.contentRects = drawList(this.ctx, CANVAS_W, CANVAS_H, result);
    } else if (result.kind === 'model') {
      drawText(this.ctx, CANVAS_W, CANVAS_H, { title: result.title, body: 'Native 3D content \u2014 drag the panel; the model turns slowly in front of it.', sourceUrl: result.sourceUrl });
      this._attachModel(result);
    } else if (result.kind === 'video') {
      drawText(this.ctx, CANVAS_W, CANVAS_H, { title: result.title, body: 'Playing inline below.', sourceUrl: result.sourceUrl });
      this._attachVideo(result);
    }

    this.navRects = drawNavButtons(this.ctx, CANVAS_W, {
      canBack: this.historyIndex > 0,
      canForward: this.historyIndex < this.history.length - 1
    });
    this.texture.needsUpdate = true;
  }

  _attachModel(result) {
    gltfLoader.load(
      result.modelUrl,
      (gltf) => {
        const body = this.bodyRectLocal();
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const targetSize = Math.min(body.width, body.height) * 0.8 * (result.scale || 1);
        const s = targetSize / maxDim;
        gltf.scene.scale.setScalar(s);
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
        gltf.scene.position.set(
          body.x + body.width / 2 - center.x,
          body.y + body.height / 2 - center.y,
          0.12 - center.z
        );
        gltf.scene.userData.spin = true;
        this.extra = gltf.scene;
        this.group.add(this.extra);
      },
      undefined,
      () => {
        drawMessage(this.ctx, CANVAS_W, CANVAS_H,
          { title: result.title, message: 'The glTF model failed to load (network or CORS).' }, 'error');
        this.texture.needsUpdate = true;
      }
    );
  }

  _attachVideo(result) {
    const video = document.createElement('video');
    video.src = result.videoUrl;
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.play().catch(() => {});

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;

    const body = this.bodyRectLocal();
    const geom = new THREE.PlaneGeometry(body.width * 0.9, body.height * 0.82);
    const mat = new THREE.MeshBasicMaterial({ map: videoTexture });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(body.x + body.width / 2, body.y + body.height / 2 - 0.01, 0.01);
    this.extra = mesh;
    this._video = video;
    this.group.add(this.extra);
  }

  /** Slow idle spin for native 3D model content — the one deliberate ambient motion in the scene. */
  tick(dt) {
    if (this.extra?.userData?.spin) this.extra.rotation.y += dt * 0.4;
  }

  goBack() {
    if (this.historyIndex > 0) {
      this.historyIndex -= 1;
      this.navigate(this.history[this.historyIndex], { pushHistory: false });
    }
  }

  goForward() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
      this.navigate(this.history[this.historyIndex], { pushHistory: false });
    }
  }

  /**
   * uv: THREE intersection.uv (0,0 bottom-left .. 1,1 top-right) against the
   * front mesh. Returns an action descriptor or null.
   */
  hitTest(uv) {
    const px = uv.x * CANVAS_W;
    const py = (1 - uv.y) * CANVAS_H;

    for (const r of this.navRects) {
      if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) {
        return { kind: 'nav', action: r.action, enabled: r.enabled };
      }
    }
    for (const r of this.contentRects) {
      if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) {
        if (r.external) return { kind: 'external', url: r.url };
        return { kind: 'item', index: r.index };
      }
    }
    return null;
  }

  dispose() {
    this._clearExtra();
    this._video?.pause?.();
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export { PANEL_W, PANEL_H };
