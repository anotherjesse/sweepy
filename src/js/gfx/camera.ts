import * as config from "../config";
import { loadPreferences, updatePreferences } from "../persist";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { players } from "../players";

// Main orthographic camera
export const camera = new THREE.OrthographicCamera(
  -window.innerWidth / 2,
  window.innerWidth / 2,
  window.innerHeight / 2,
  -window.innerHeight / 2,
  0.1,
  10000,
);

export let controls: OrbitControls | null = null;

// Smoothing factor for interpolation (0 < SMOOTH_FACTOR <= 1)
const SMOOTH_FACTOR = 0.1;

// Desired state for target and zoom
const desiredTarget = new THREE.Vector3(config.W / 2, 0, config.H / 2);
const desiredPosition = new THREE.Vector3();
let requestedZoom = config.ZOOM_MIN;

// Save interval tracking
let lastCameraSave = 0;

// Load initial preferences and set up camera + controls
export const connectCamera = (domElement: HTMLCanvasElement) => {
  // Default center of board
  const centerX = config.W / 2;
  const centerZ = config.H / 2;

  // Set initial camera position and target
  camera.position.set(centerX, 100, centerZ);
  controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enableZoom = false; // disable default wheel zoom
  controls.enableRotate = false;
  controls.screenSpacePanning = true;
  controls.target.set(centerX, 0, centerZ);

  // FIXME(ja): Initialize requestedZoom from preferences or default
  requestedZoom = 20;
  camera.zoom = requestedZoom;
  camera.updateProjectionMatrix();

  window.addEventListener("wheel", onWheel, { passive: true });
  return { camera, controls };
};

// Mouse wheel handler to request zoom change
function onWheel(event: WheelEvent) {
  const factor = event.deltaY > 0
    ? config.ZOOM_OUT_FACTOR
    : config.ZOOM_IN_FACTOR;
  requestZoomBy(factor);
}

// Request a zoom change (does not immediately apply)
export function requestZoomBy(factor: number) {
  requestedZoom *= factor;
  requestedZoom = THREE.MathUtils.clamp(
    requestedZoom,
    config.ZOOM_MIN,
    config.ZOOM_MAX,
  );
}

// Immediately set zoom level (requests override)
export function requestZoomTo(level: number) {
  requestedZoom = THREE.MathUtils.clamp(
    level,
    config.ZOOM_MIN,
    config.ZOOM_MAX,
  );
}

// Persist camera state (position.y and zoom)
async function saveCameraState() {
  const now = Date.now();
  if (now - lastCameraSave < config.CAMERA_SAVE_INTERVAL) return;
  lastCameraSave = now;

  await updatePreferences({
    cameraPosition: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
    zoom: requestedZoom,
  });
}

// Call this each frame to smoothly update camera based on players
export function updateCamera() {
  const playerList = Object.values(players);
  if (playerList.length > 0) {
    // Compute centroid and bounding box
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let sumX = 0, sumZ = 0;

    for (const p of playerList) {
      sumX += p.x;
      sumZ += p.z;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const cx = sumX / playerList.length;
    const cz = sumZ / playerList.length;
    desiredTarget.set(cx, 0, cz);

    // Determine zoom to fit all players
    const margin = 10; // world units around group
    const groupWidth = maxX - minX + margin;
    const groupHeight = maxZ - minZ + margin;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const fitZoomX = viewW / groupWidth;
    const fitZoomZ = viewH / groupHeight;
    const fitZoom = Math.min(fitZoomX, fitZoomZ);

    // Ensure requestedZoom does not exceed fitting requirement
    requestedZoom = Math.min(requestedZoom, fitZoom);
    requestedZoom = THREE.MathUtils.clamp(
      requestedZoom,
      config.ZOOM_MIN,
      config.ZOOM_MAX,
    );
  }

  // Smoothly interpolate zoom
  camera.zoom += (requestedZoom - camera.zoom) * SMOOTH_FACTOR;
  camera.updateProjectionMatrix();

  // Smoothly interpolate position (maintain camera.height)
  desiredPosition.copy(desiredTarget);
  desiredPosition.y = camera.position.y;
  camera.position.lerp(desiredPosition, SMOOTH_FACTOR);

  // Smoothly interpolate controls.target
  controls?.target.lerp(desiredTarget, SMOOTH_FACTOR);

  // Update controls (damping)
  controls?.update();
  saveCameraState();
}
