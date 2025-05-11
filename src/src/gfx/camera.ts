/*  sweepy ─ camera.ts
 *  Keeps every active player in view.
 *  – Computes the players’ bounding box each frame.
 *  – Picks the *smaller* of (a) the zoom a user asked for and
 *    (b) the zoom required to keep the box on-screen.
 *  – Smoothly lerps camera position, controls.target and zoom so it
 *    feels elastic (≈ iOS bounce-back) instead of snapping.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import * as config from "../config";
import { loadPreferences, updatePreferences } from "../persist";
import { players } from "../players";

/* ------------------------------------------------------------------ */
/*  Constants & internal state                                        */
/* ------------------------------------------------------------------ */

const POS_LERP = 0.01; // How quickly we chase the centroid
const ZOOM_LERP = 0.15; // How quickly we chase the target zoom
const PAD = 2; // Extra cells around the bounding box
const ZOOM_EPS = 1e-3; // Threshold before we call updateProjection

/** value the *user* asked for (mouse wheel / gamepad shoulder etc.)  */
let requestedZoom = 20;

/* ------------------------------------------------------------------ */
/*  Camera + controls skeleton (mostly as before)                      */
/* ------------------------------------------------------------------ */

export const camera = new THREE.OrthographicCamera(
  -globalThis.innerWidth / 2,
  globalThis.innerWidth / 2,
  globalThis.innerHeight / 2,
  -globalThis.innerHeight / 2,
  0.1,
  10_000,
);

/** Lerped-to target the camera & OrbitControls should look at. */
const desiredPos = new THREE.Vector3();

/* Will be filled by initCamera() and used in updateCamera() */
let controls: OrbitControls;

/* ------------------------------------------------------------------ */
/*  Public helpers                                                     */
/* ------------------------------------------------------------------ */

/** User intent: multiply current zoom by a factor (e.g. wheel). */
export function zoomBy(factor: number) {
  requestedZoom = THREE.MathUtils.clamp(
    requestedZoom * factor,
    config.ZOOM_MIN,
    config.ZOOM_MAX,
  );
}

/** User intent: jump to an explicit zoom. (Seldom used, but nice.) */
export function setZoom(level: number) {
  requestedZoom = THREE.MathUtils.clamp(
    level,
    config.ZOOM_MIN,
    config.ZOOM_MAX,
  );
}

/* ------------------------------------------------------------------ */
/*  Initialise from saved prefs (called once by render.ts)             */
/* ------------------------------------------------------------------ */

export async function initCamera(renderer: THREE.WebGLRenderer) {
  const prefs = await loadPreferences();

  // Default centre of the board – y only matters for perspective cams
  const startX = prefs?.cameraPosition?.x ?? config.W / 2;
  const startZ = prefs?.cameraPosition?.z ?? config.H / 2;

  requestedZoom = prefs?.zoom ?? 20;

  camera.position.set(startX, 100, startZ);
  camera.lookAt(startX, 0, startZ);
  camera.zoom = requestedZoom;
  camera.updateProjectionMatrix();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enableRotate = false;
  controls.screenSpacePanning = true;
  controls.target.set(startX, 0, startZ);

  // mouse: L-click drag pan • wheel zoom • no rotation
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.LEFT,
    MIDDLE: THREE.MOUSE.MIDDLE,
    RIGHT: THREE.MOUSE.PAN,
  };

  globalThis.addEventListener(
    "wheel",
    (e) => zoomBy(e.deltaY > 0 ? 0.99 : 1.01),
    {
      passive: true,
    },
  );
}

/* ------------------------------------------------------------------ */
/*  Main per-frame updater                                             */
/* ------------------------------------------------------------------ */

/**
 * Called once every animation frame by render.ts AFTER gamepad / keyboard
 * movement has happened but BEFORE controls.update() and renderer.render().
 */
export function updateCamera() {
  /* ---------- 1. Work out where the players are ------------------- */
  const list = Object.values(players);
  if (!list.length) {
    desiredPos.set(config.W / 2, 0, config.H / 2);
  } else {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity,
      sumX = 0,
      sumZ = 0;

    for (const p of list) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
      sumX += p.x;
      sumZ += p.z;
    }

    // Centroid (desired camera/target centre)
    desiredPos.set(sumX / list.length, 0, sumZ / list.length);

    // World-space size we must fit (add a small pad so players aren’t flush)
    const width = Math.max(1, maxX - minX + PAD * 2);
    const height = Math.max(1, maxZ - minZ + PAD * 2);

    // For an OrthographicCamera, visible width  = winWidth  / zoom
    //                                visible height = winHeight / zoom
    const zoomToFitX = globalThis.innerWidth / width;
    const zoomToFitY = globalThis.innerHeight / height;
    const zoomToFit = THREE.MathUtils.clamp(
      Math.min(zoomToFitX, zoomToFitY),
      config.ZOOM_MIN,
      config.ZOOM_MAX,
    );

    // Our “goal” zoom is whichever is SMALLER:
    //  – user’s request (could be huge)  vs  – what still keeps everyone on-screen
    const goalZoom = Math.min(requestedZoom, zoomToFit);

    /* ---------- 2. Smoothly chase that goal ----------------------- */
    // Position (x,z) first – y stays fixed (orthographic depth doesn’t matter)
    camera.position.x = THREE.MathUtils.lerp(
      camera.position.x,
      desiredPos.x,
      POS_LERP,
    );
    camera.position.z = THREE.MathUtils.lerp(
      camera.position.z,
      desiredPos.z,
      POS_LERP,
    );

    controls.target.lerp(desiredPos, POS_LERP);

    // Zoom
    camera.zoom = THREE.MathUtils.lerp(camera.zoom, goalZoom, ZOOM_LERP);

    // Only touch projection matrix if zoom changed noticeably – otherwise
    // we’d be wasting mat4 multiplies every frame.
    if (Math.abs(camera.zoom - goalZoom) > ZOOM_EPS) {
      camera.updateProjectionMatrix();
    }
  }

  /* ---------- 3. Let OrbitControls add its own gentle damping ----- */
  controls.update();
}

/* ------------------------------------------------------------------ */
/*  Persist state every second (debounced)                             */
/* ------------------------------------------------------------------ */

let lastSave = 0;
export async function maybeSaveCameraState() {
  const now = Date.now();
  if (now - lastSave < config.CAMERA_SAVE_INTERVAL) return;
  lastSave = now;

  await updatePreferences({
    cameraPosition: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
    zoom: requestedZoom,
  });
}
