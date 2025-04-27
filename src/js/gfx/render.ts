import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { gameState, states } from "../game";
import * as config from "../config";
import { connectCamera, updateCamera } from "./camera";

let cellMesh: THREE.InstancedMesh | null = null;
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: false });
scene.background = new THREE.Color(0x333333);
renderer.setPixelRatio(2);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const { camera, controls } = connectCamera(renderer.domElement);
window.addEventListener("resize", handleResize);

// Sprite sheet constants - will be used in shader
const SPRITE_CELL_WIDTH = 1 / 4;
const SPRITE_CELL_HEIGHT = 1 / 3; // 1/4 (for 4x4 sprite atlas)

// Load sprite atlas
function loadSpriteAtlas(): THREE.Texture {
    const textureLoader = new THREE.TextureLoader();
    return textureLoader.load("/new.gif", (texture) => {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
    });
}


// This type assertion is necessary because THREE.js typings are sometimes incomplete
// BufferAttribute and InterleavedBufferAttribute both have array, but the union type
// in THREE.js doesn't capture this correctly
const uvAttribute = cellMesh.geometry.getAttribute("aUV");
const uvArray = (uvAttribute as THREE.BufferAttribute).array as number[];
function updateUV(i: number, u: number, v: number) {
    uvArray[i * 2] = u;
    uvArray[i * 2 + 1] = v;
}

// Initialize meshes
export function initMeshes() {
    console.log("Initializing meshes");

    // Create a checkerboard background (optional)
    const boardGeo = new THREE.PlaneGeometry(config.W, config.H);
    // Make sure board is flat on XZ plane
    boardGeo.rotateX(-Math.PI / 2);
    (window as any).boardGeo = boardGeo;

    // Create a plane geometry for cells - ensure they're square
    const cellGeo = new THREE.PlaneGeometry(1, 1);
    // Make sure cells are flat on XZ plane
    cellGeo.translate(0.5, -0.5, 0);
    cellGeo.rotateX(-Math.PI / 2);

    // Load the sprite texture
    const spriteTexture = loadSpriteAtlas();

    // Create custom attributes for the instanced mesh
    const offsets = new Float32Array(config.N * 2); // x, z offsets
    const uvs = new Float32Array(config.N * 2); // texture atlas offsets

    // Initialize all cells as hidden (use empty tile at position (2,2) in atlas)
    for (let i = 0; i < config.N; i++) {
        const x = i % config.W, z = Math.floor(i / config.W);
        offsets[i * 2] = x;
        offsets[i * 2 + 1] = z;
        uvs[i * 2] = 2; // Empty tile (col 3, 0-indexed)
        uvs[i * 2 + 1] = 1; // Bottom row (row 3, 0-indexed)
    }

    // Add attributes to geometry
    cellGeo.setAttribute(
        "aOffset",
        new THREE.InstancedBufferAttribute(offsets, 2),
    );
    cellGeo.setAttribute("aUV", new THREE.InstancedBufferAttribute(uvs, 2));

    // Create shader material for the sprite sheet
    const cellMat = new THREE.ShaderMaterial({
        uniforms: {
            atlas: { value: spriteTexture },
        },
        vertexShader: `
    attribute vec2 aOffset;
    attribute vec2 aUV;
    varying vec2 vUv;
    void main() {
      // Use the built-in uv attribute from THREE.PlaneGeometry
      // Map to 4x4 grid (SPRITE_COLS=4, SPRITE_ROWS=4)
      vUv = vec2(aUV.x * ${SPRITE_CELL_WIDTH} + uv.x * ${SPRITE_CELL_WIDTH}, 
                 aUV.y * ${SPRITE_CELL_HEIGHT} + uv.y * ${SPRITE_CELL_HEIGHT});
      vec3 pos = position;
      // Position cells in XZ plane
      pos.x += aOffset.x;
      pos.z += aOffset.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
    `,
        fragmentShader: `
    uniform sampler2D atlas;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(atlas, vUv);
    }
    `,
        side: THREE.DoubleSide,
    });

    // Create instanced mesh for cells
    const newCellMesh = new THREE.InstancedMesh(cellGeo, cellMat, config.N);
    newCellMesh.frustumCulled = true; // Only render visible cells

    // Update instance matrices
    const dummy = new THREE.Object3D();
    for (let i = 0; i < config.N; i++) {
        const x = i % config.W, z = Math.floor(i / config.W);
        dummy.position.set(x, 0, z);
        dummy.updateMatrix();
        newCellMesh.setMatrixAt(i, dummy.matrix);
    }
    newCellMesh.instanceMatrix.needsUpdate = true;

    // Manually compute and set bounding box for proper frustum culling
    newCellMesh.geometry.boundingBox = new THREE.Box3(
        new THREE.Vector3(0, -0.1, 0),
        new THREE.Vector3(config.W, 0.1, config.H),
    );
    newCellMesh.geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(config.W / 2, 0, config.H / 2),
        Math.sqrt(config.W * config.W + config.H * config.H) / 2,
    );

    scene.add(newCellMesh);
    cellMesh = newCellMesh;
}

export function updateMeshes() {
    console.log("Updating meshes with states array");

    if (!cellMesh) {
        console.error("Meshes not initialized");
        return;
    }

    const { NUMBER_MASK, REVEALED, FLAGGED, MINE, FINISHED } =
        config.cellStateConstants;
    const { debugMode } = gameState;


    for (let i = 0; i < config.N; i++) {
        const state = states[i];

        // Update UV coordinates based on cell state
        if ((state & REVEALED) || debugMode) {
            if (state & MINE) {
                // Bomb sprite at position (2,0) in the atlas (bottom row, third column)
                updateUV(i, 1, 0);
            } else {
                // Number tiles (1-8) in first two rows
                const adjacentMines = state & NUMBER_MASK;
                if (adjacentMines === 0) {
                    // Empty revealed cell - using empty tile at (3,2)
                    updateUV(i, 3, 0);
                } else if (adjacentMines <= 4) {
                    // Numbers 1-4 in top row (columns 0-3)
                    updateUV(i, adjacentMines - 1, 2); // 0-based index (0,1,2,3)
                } else {
                    // Numbers 5-8 in middle row (columns 0-3)
                    updateUV(i, adjacentMines - 5, 1); // 0-based index (0,1,2,3)
                }
            }
        } else {
            // Unrevealed tile (hidden) - using the dark gray cell at (3,0)
            updateUV(i, 3, 0);

            // Handle flags (using the sprite atlas)
            if (state & FLAGGED) {
                // Red flag at (0,2)
                updateUV(i, 0, 0);
            }

            // Handle finished mines (completely boxed in)
            // Blue flag sprite to the right of red flag (1,1)
            if ((state & MINE) && (state & FINISHED)) {
                updateUV(i, 1, 0);
            }
        }
    }

    // Update UV attribute
    uvAttribute.needsUpdate = true;
    console.log("Meshes updated successfully");
}

export function handleResize() {
    const h = window.innerHeight, w = window.innerWidth;
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

export function animate(inputPollFunction: () => void) {
    requestAnimationFrame(() => animate(inputPollFunction));
    controls.update();
    inputPollFunction();
    updateCamera();

    // // Add pulsing animation to gamepad cursor
    // const { gamepadCursorMesh } = gamepadState;
    // if (gamepadCursorMesh && gamepadCursorMesh.visible) {
    //     // Pulse the opacity between 0.2 and 0.7
    //     const pulseFactor = (Math.sin(Date.now() * 0.005) + 1) / 2; // 0 to 1 value
    //     (gamepadCursorMesh.material as THREE.MeshBasicMaterial).opacity = 0.2 +
    //         pulseFactor * 0.5;
    // }

    // // Update keyboard cursor position
    // const { keyboardCursorMesh } = renderState;
    // if (keyboardCursorMesh && keyboardState) {
    //     // Ensure keyboard cursor is correctly positioned
    //     keyboardCursorMesh.position.set(
    //         keyboardState.cursorX,
    //         0.15, // Keep consistent with initialization
    //         keyboardState.cursorZ,
    //     );

    //     // Add pulsing animation to keyboard cursor with different timing
    //     const keyboardPulseFactor = (Math.sin(Date.now() * 0.006) + 1) / 2; // 0 to 1 value
    //     (keyboardCursorMesh.material as THREE.MeshBasicMaterial).opacity = 0.3 +
    //         keyboardPulseFactor * 0.5; // Higher base opacity

    //     // // Make sure the cursor is visible by default (unless player is disabled)
    //     // if (!keyboardCursorMesh.visible && !gameState?.disablePlayer) {
    //         keyboardCursorMesh.visible = true;
    //     // }
    // }

    renderer.render(scene, camera);
}
