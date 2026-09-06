import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

const LASER_LENGTH = 6;

function buildLaser() {
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -LASER_LENGTH)
  ]);
  const mat = new THREE.LineBasicMaterial({ color: 0x4fd1c5, transparent: true, opacity: 0.85 });
  const line = new THREE.Line(geom, mat);
  line.name = 'laser';
  line.scale.z = 0.35; // resting length; stretched to hit point when something is under it
  return line;
}

/**
 * Wires up VR controller input (ray-cast select + grip drag) and a flat-mode
 * mouse/click fallback that exercises the same panel.hitTest()/drag path.
 *
 * `getPanels()` should return the live array of Panel instances.
 * `onActivate(panel, uv)` fires on trigger click / mouse click over a panel.
 */
export function setupInput(renderer, scene, camera, { getPanels, onActivate }) {
  const raycaster = new THREE.Raycaster();
  const controllerModelFactory = new XRControllerModelFactory();
  const controllers = [];
  let dragging = null; // { controller, group, offset: Matrix4 }

  function meshesOf(panels) {
    return panels.map((p) => p.mesh);
  }

  function intersectFromController(controller) {
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    const panels = getPanels();
    const hits = raycaster.intersectObjects(meshesOf(panels), false);
    return hits[0] || null;
  }

  function handleSelect(controller) {
    const hit = intersectFromController(controller);
    if (!hit || !hit.uv) return;
    const panel = hit.object.userData.panel;
    onActivate(panel, hit.uv);
  }

  function handleSqueezeStart(controller) {
    const hit = intersectFromController(controller);
    if (!hit) return;
    const panel = hit.object.userData.panel;
    if (!panel?.group) return;
    const offset = new THREE.Matrix4()
      .copy(controller.matrixWorld)
      .invert()
      .multiply(panel.group.matrix);
    dragging = { controller, panel, offset };
  }

  function handleSqueezeEnd() {
    dragging = null;
  }

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    controller.addEventListener('selectstart', () => handleSelect(controller));
    controller.addEventListener('squeezestart', () => handleSqueezeStart(controller));
    controller.addEventListener('squeezeend', handleSqueezeEnd);
    controller.add(buildLaser());
    scene.add(controller);
    controllers.push(controller);

    const grip = renderer.xr.getControllerGrip(i);
    grip.add(controllerModelFactory.createControllerModel(grip));
    scene.add(grip);
  }

  // --- flat-mode mouse fallback -------------------------------------------
  const mouse = new THREE.Vector2();
  const dom = renderer.domElement;
  function onClick(event) {
    if (renderer.xr.isPresenting) return;
    const rect = dom.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const panels = getPanels();
    const hits = raycaster.intersectObjects(meshesOf(panels), false);
    if (hits[0]?.uv) {
      onActivate(hits[0].object.userData.panel, hits[0].uv);
    }
  }
  dom.addEventListener('click', onClick);

  function update() {
    if (!dragging) return;
    const m = new THREE.Matrix4().copy(dragging.controller.matrixWorld).multiply(dragging.offset);
    m.decompose(dragging.panel.group.position, dragging.panel.group.quaternion, dragging.panel.group.scale);
  }

  return { update, controllers };
}
