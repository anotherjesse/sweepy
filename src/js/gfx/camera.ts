import * as config from "../config";
import { loadPreferences, updatePreferences } from "../persist";
import * as THREE from "three";
import { renderState } from "./render";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export const camera = new THREE.OrthographicCamera(
    -window.innerWidth / 2,
    window.innerWidth / 2,
    window.innerHeight / 2,
    -window.innerHeight / 2,
    0.1,
    10000,
);

// Save camera state to preferences
export async function saveCameraState() {
    await updatePreferences({
        cameraPosition: {
            x: renderState.camera.position.x,
            y: renderState.camera.position.y,
            z: renderState.camera.position.z,
        },
        zoom: renderState.camera.zoom,
    });
}

// Zoom control functions
export function zoomIn(factor: number = config.ZOOM_IN_FACTOR) {
    camera.zoom *= factor;
    applyZoomConstraints();
}

export function zoomOut(factor: number = config.ZOOM_OUT_FACTOR) {
    camera.zoom *= factor;
    applyZoomConstraints();
    saveCameraState();
}

export function setZoom(level: number) {
    renderState.camera.zoom = level;
    applyZoomConstraints();
    saveCameraState();
}

function applyZoomConstraints() {
    renderState.camera.zoom = Math.min(
        Math.max(renderState.camera.zoom, config.ZOOM_MIN),
        config.ZOOM_MAX,
    );
    renderState.camera.updateProjectionMatrix();
}

export const initCamera = async () => {
    // Try to load saved camera position from preferences
    const prefs = await loadPreferences();
    console.log("prefs", prefs);

    // Default position (center of board looking down)
    const defaultPosition = { x: config.W / 2, y: 100, z: config.H / 2 };

    const camPos = defaultPosition; // prefs?.cameraPosition ??

    renderState.camera.position.set(camPos.x, camPos.y, camPos.z);
    renderState.camera.lookAt(camPos.x, 0, camPos.z);
    // Set zoom level from preferences or use default
    renderState.camera.zoom = prefs?.zoom ?? 20; // Default zoom level if not found
    console.log("renderState.camera.zoom", renderState.camera.zoom);

    // Apply zoom
    renderState.camera.updateProjectionMatrix();

    // Create OrbitControls
    renderState.controls = new OrbitControls(
        renderState.camera,
        renderState.renderer.domElement,
    );
    renderState.controls.enableDamping = true;
    renderState.controls.dampingFactor = 0.05;
    renderState.controls.enableZoom = true;
    renderState.controls.enableRotate = false;
    renderState.controls.screenSpacePanning = true;

    renderState.controls.target.set(defaultPosition.x, 0, defaultPosition.z);

    renderState.controls.mouseButtons = {
        LEFT: THREE.MOUSE.LEFT,
        MIDDLE: THREE.MOUSE.MIDDLE,
        RIGHT: THREE.MOUSE.PAN,
    };
};
