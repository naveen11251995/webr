import * as THREE from 'three';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function buildStarfield(count = 1400, radius = 30) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // distribute on a sphere shell so stars never clip through the floor oddly
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius * (0.85 + Math.random() * 0.15);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 1; // keep above floor
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0x9fb4c7, size: 0.045, sizeAttenuation: true });
  return new THREE.Points(geom, mat);
}

function buildFloor() {
  const grid = new THREE.GridHelper(14, 28, 0x22303a, 0x161d24);
  grid.position.y = 0;
  const plate = new THREE.Mesh(
    new THREE.CircleGeometry(7, 48),
    new THREE.MeshBasicMaterial({ color: 0x0a0c10 })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = -0.002;
  const group = new THREE.Group();
  group.add(plate, grid);
  return group;
}

export function buildRoom(scene) {
  scene.background = new THREE.Color(0x0a0c10);
  scene.fog = new THREE.Fog(0x0a0c10, 8, 22);

  scene.add(buildStarfield());
  scene.add(buildFloor());

  const hemi = new THREE.HemisphereLight(0x445566, 0x0a0c10, 1.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xbfe9e2, 0.8);
  key.position.set(2, 4, 2);
  scene.add(key);
}
