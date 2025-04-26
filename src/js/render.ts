import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BOARD_SIZE, W, H, N, states } from './game';
import type { GameState, CellStateConstants } from './game';
import type { GamepadState } from './gamepad';
import type { KeyboardState } from './keyboard';

// Extended OrbitControls type to add missing properties
export type ExtendedOrbitControls = OrbitControls & {
  isPanning?: boolean;
};

// Render state type
export type RenderState = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  controls: ExtendedOrbitControls;
  cellMesh: THREE.InstancedMesh | null;
  keyboardCursorMesh: THREE.Mesh | null;
};

// Sprite constants 
export type SpriteConstants = {
  SPRITE_CELL_WIDTH: number;
  SPRITE_CELL_HEIGHT: number;
};

// Sprite sheet constants - will be used in shader
export const SPRITE_CELL_WIDTH = 0.25; // 1/4 (for 4x4 sprite atlas)
export const SPRITE_CELL_HEIGHT = 0.25; // 1/4 (for 4x4 sprite atlas)

// Create render state object
export const renderState: RenderState = {
  scene: new THREE.Scene(),
  camera: new THREE.OrthographicCamera(
    -window.innerWidth / 2,
    window.innerWidth / 2,
    window.innerHeight / 2,
    -window.innerHeight / 2,
    0.1,
    10000
  ),
  renderer: new THREE.WebGLRenderer({ antialias: false }),
  controls: null!,
  cellMesh: null,
  keyboardCursorMesh: null
};

// Initialize the renderer
export function initRenderer() {
  renderState.scene.background = new THREE.Color(0x333333);
  
  // Position the camera directly above looking straight down (z-axis is height)
  renderState.camera.position.set(W / 2, 100, H / 2);
  renderState.camera.lookAt(W / 2, 0, H / 2);
  renderState.camera.zoom = 20; // Set a higher default zoom level
  
  // Apply zoom
  renderState.camera.updateProjectionMatrix();
  
  renderState.renderer.setPixelRatio(2);
  renderState.renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderState.renderer.domElement);
  
  // Create OrbitControls
  renderState.controls = new OrbitControls(renderState.camera, renderState.renderer.domElement);
  renderState.controls.enableDamping = true;
  renderState.controls.dampingFactor = 0.05;
  renderState.controls.enableZoom = true;
  renderState.controls.enableRotate = false;
  renderState.controls.screenSpacePanning = true;
  renderState.controls.target.set(W / 2, 0, H / 2); // Set target to center of board
  renderState.controls.mouseButtons = {
    LEFT: THREE.MOUSE.LEFT,
    MIDDLE: THREE.MOUSE.MIDDLE,
    RIGHT: THREE.MOUSE.PAN  // Allow right click to pan
  };
}

// Load sprite atlas
function loadSpriteAtlas(): THREE.Texture {
  const textureLoader = new THREE.TextureLoader();
  return textureLoader.load('/sprite.png', (texture) => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
  });
}

// Initialize meshes
export function initMeshes(
  gameState: GameState, 
  cellConstants: CellStateConstants,
  gamepadState: GamepadState
) {
  console.log("Initializing meshes");

  const { scene, cellMesh: currentCellMesh, keyboardCursorMesh: currentKeyboardCursorMesh } = renderState;

  // Remove any existing meshes
  if (currentCellMesh) scene.remove(currentCellMesh);
  if (gamepadState.gamepadCursorMesh) scene.remove(gamepadState.gamepadCursorMesh);
  if (currentKeyboardCursorMesh) scene.remove(currentKeyboardCursorMesh);

  // Create a checkerboard background (optional)
  const boardGeo = new THREE.PlaneGeometry(W, H);
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
  const offsets = new Float32Array(N * 2); // x, z offsets
  const uvs = new Float32Array(N * 2); // texture atlas offsets

  // Initialize all cells as hidden (use empty tile at position (2,2) in atlas)
  for (let i = 0; i < N; i++) {
    const x = i % W, z = Math.floor(i / W);
    offsets[i * 2] = x;
    offsets[i * 2 + 1] = z;
    uvs[i * 2] = 2; // Empty tile (col 3, 0-indexed)
    uvs[i * 2 + 1] = 2; // Bottom row (row 3, 0-indexed)
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
  const newCellMesh = new THREE.InstancedMesh(cellGeo, cellMat, N);
  newCellMesh.frustumCulled = true; // Only render visible cells

  // Update instance matrices
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const x = i % W, z = Math.floor(i / W);
    dummy.position.set(x, 0, z);
    dummy.updateMatrix();
    newCellMesh.setMatrixAt(i, dummy.matrix);
  }
  newCellMesh.instanceMatrix.needsUpdate = true;

  // Manually compute and set bounding box for proper frustum culling
  newCellMesh.geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(0, -0.1, 0),
    new THREE.Vector3(W, 0.1, H),
  );
  newCellMesh.geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(W / 2, 0, H / 2),
    Math.sqrt(W * W + H * H) / 2,
  );

  scene.add(newCellMesh);
  renderState.cellMesh = newCellMesh;

  // Create gamepad cursor indicator (a bright highlighted square)
  const cursorGeo = new THREE.PlaneGeometry(1, 1);
  cursorGeo.translate(0.5, -0.45, 0); // Slightly above cells
  cursorGeo.rotateX(-Math.PI / 2);

  const gamepadCursorMat = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.5,
    wireframe: false,
    side: THREE.DoubleSide,
  });

  const newGamepadCursorMesh = new THREE.Mesh(cursorGeo, gamepadCursorMat);
  newGamepadCursorMesh.position.set(
    gamepadState.gamepadCursorX, 
    0.1, 
    gamepadState.gamepadCursorZ
  );
  newGamepadCursorMesh.visible = gamepadState.hasGamepad;
  scene.add(newGamepadCursorMesh);
  gamepadState.gamepadCursorMesh = newGamepadCursorMesh;

  // Create keyboard cursor indicator (a bright highlighted square with different color)
  const keyboardCursorMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff, // Cyan color for keyboard cursor
    transparent: true,
    opacity: 0.7, // Make it more visible
    wireframe: false,
    side: THREE.DoubleSide,
  });

  // Create a slightly larger cursor to make it more visible
  const keyboardCursorGeo = new THREE.PlaneGeometry(1.05, 1.05);
  keyboardCursorGeo.translate(0.5, -0.4, 0); // Slightly above cells and gamepad cursor
  keyboardCursorGeo.rotateX(-Math.PI / 2);

  const keyboardCursorMesh = new THREE.Mesh(keyboardCursorGeo, keyboardCursorMat);
  
  // Initialize keyboard cursor at center of the board or at current keyboard position
  const keyboardState = window.keyboardState;
  if (keyboardState) {
    keyboardCursorMesh.position.set(
      keyboardState.cursorX,
      0.15, // Slightly higher than gamepad cursor
      keyboardState.cursorZ
    );
    console.log(`Initialized keyboard cursor at (${keyboardState.cursorX}, ${keyboardState.cursorZ})`);
  } else {
    keyboardCursorMesh.position.set(W / 2, 0.15, H / 2);
    console.log(`Initialized keyboard cursor at default center (${W/2}, ${H/2})`);
  }
  
  // Always make sure keyboard cursor is visible
  keyboardCursorMesh.visible = true;
  
  scene.add(keyboardCursorMesh);
  renderState.keyboardCursorMesh = keyboardCursorMesh;

  console.log("Meshes added to scene");
}

export function updateMeshes(
  gameState: GameState, 
  cellConstants: CellStateConstants
) {
  console.log("Updating meshes with states array");
  const { cellMesh } = renderState;
  
  if (!cellMesh) {
    console.error("Meshes not initialized");
    return;
  }

  const { NUMBER_MASK, REVEALED, FLAGGED, MINE, FINISHED } = cellConstants;
  const { debugMode } = gameState;
  // Get attribute and handle it safely
  const uvAttribute = cellMesh.geometry.getAttribute("aUV");
  
  // This type assertion is necessary because THREE.js typings are sometimes incomplete
  // BufferAttribute and InterleavedBufferAttribute both have array, but the union type
  // in THREE.js doesn't capture this correctly
  const uvArray = (uvAttribute as THREE.BufferAttribute).array as number[];

  for (let i = 0; i < N; i++) {
    const state = states[i];

    // Update UV coordinates based on cell state
    if ((state & REVEALED) || debugMode) {
      if (state & MINE) {
        // Bomb sprite at position (2,0) in the atlas (bottom row, third column)
        uvArray[i * 2] = 2;
        uvArray[i * 2 + 1] = 1;
      } else {
        // Number tiles (1-8) in first two rows
        const adjacentMines = state & NUMBER_MASK;
        if (adjacentMines === 0) {
          // Empty revealed cell - using empty tile at (3,2)
          uvArray[i * 2] = 3;
          uvArray[i * 2 + 1] = 0;
        } else if (adjacentMines <= 4) {
          // Numbers 1-4 in top row (columns 0-3)
          uvArray[i * 2] = adjacentMines - 1; // 0-based index (0,1,2,3)
          uvArray[i * 2 + 1] = 3; // Top row
        } else {
          // Numbers 5-8 in middle row (columns 0-3)
          uvArray[i * 2] = adjacentMines - 5; // 0-based index (0,1,2,3)
          uvArray[i * 2 + 1] = 2; // Middle row
        }
      }
    } else {
      // Unrevealed tile (hidden) - using the dark gray cell at (3,0)
      uvArray[i * 2] = 3;
      uvArray[i * 2 + 1] = 1;

      // Handle flags (using the sprite atlas)
      if (state & FLAGGED) {
        // Red flag at (0,2)
        uvArray[i * 2] = 0;
        uvArray[i * 2 + 1] = 1;
      }

      // Handle finished mines (completely boxed in)
      // Blue flag sprite to the right of red flag (1,1)
      if ((state & MINE) && (state & FINISHED)) {
        uvArray[i * 2] = 1;
        uvArray[i * 2 + 1] = 1;
      }
    }
  }

  // Update UV attribute
  uvAttribute.needsUpdate = true;
  console.log("Meshes updated successfully");
}

export function handleResize() {
  const h = window.innerHeight, w = window.innerWidth;
  renderState.camera.left = -w / 2;
  renderState.camera.right = w / 2;
  renderState.camera.top = h / 2;
  renderState.camera.bottom = -h / 2;
  renderState.camera.updateProjectionMatrix();
  renderState.renderer.setSize(window.innerWidth, window.innerHeight);
}

export function animate(inputPollFunction: () => void) {
  requestAnimationFrame(() => animate(inputPollFunction));
  renderState.controls.update();
  inputPollFunction();
  
  // Add pulsing animation to gamepad cursor
  const { gamepadCursorMesh } = window.gamepadState;
  if (gamepadCursorMesh && gamepadCursorMesh.visible) {
    // Pulse the opacity between 0.2 and 0.7
    const pulseFactor = (Math.sin(Date.now() * 0.005) + 1) / 2; // 0 to 1 value
    (gamepadCursorMesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + pulseFactor * 0.5;
  }
  
  // Update keyboard cursor position
  const { keyboardCursorMesh } = renderState;
  const { keyboardState } = window;
  if (keyboardCursorMesh && keyboardState) {
    // Ensure keyboard cursor is correctly positioned
    keyboardCursorMesh.position.set(
      keyboardState.cursorX,
      0.15, // Keep consistent with initialization
      keyboardState.cursorZ
    );
    
    // Add pulsing animation to keyboard cursor with different timing
    const keyboardPulseFactor = (Math.sin(Date.now() * 0.006) + 1) / 2; // 0 to 1 value
    (keyboardCursorMesh.material as THREE.MeshBasicMaterial).opacity = 0.3 + keyboardPulseFactor * 0.5; // Higher base opacity
    
    // Make sure the cursor is visible by default (unless player is disabled)
    if (!keyboardCursorMesh.visible && !window.gameState?.disablePlayer) {
      keyboardCursorMesh.visible = true;
    }
  }
  
  renderState.renderer.render(renderState.scene, renderState.camera);
}

// Setup UI components
export function initUI(
  gameState: GameState, 
  cellConstants: CellStateConstants,
  generateBoardFunction: (seed: string) => void,
  generateRandomSeedFunction: () => string
) {
  const generateButton = document.getElementById('generateButton');
  if (generateButton) {
    generateButton.addEventListener('click', () => {
      console.log("Generate button clicked");
      // use entered seed or generate random
      const seed = generateRandomSeedFunction();
      // Reset game state
      gameState.firstClick = true;
      gameState.gameStarted = false;
  
      // Generate new board
      generateBoardFunction(seed);
    });
  }
  
  // Add debug toggle button
  const debugButton = document.createElement('button');
  debugButton.id = 'debugButton';
  debugButton.textContent = 'Debug Mode: OFF';
  debugButton.addEventListener('click', () => {
    gameState.debugMode = !gameState.debugMode;
    debugButton.textContent = `Debug: ${gameState.debugMode ? 'ON' : 'OFF'}`;
    updateMeshes(gameState, cellConstants);
  
    // Show/hide info box based on debug mode
    const infoBox = document.getElementById('infoBox');
    if (infoBox) {
      infoBox.style.display = gameState.debugMode ? 'block' : 'none';
    }
  });
  
  const controls = document.querySelector('.controls');
  if (controls) {
    controls.appendChild(debugButton);
  }
  
  // Create info box for hover information
  const infoBox = document.createElement('div');
  infoBox.id = 'infoBox';
  infoBox.style.position = 'absolute';
  infoBox.style.bottom = '10px';
  infoBox.style.left = '10px';
  infoBox.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  infoBox.style.color = 'white';
  infoBox.style.padding = '10px';
  infoBox.style.borderRadius = '5px';
  infoBox.style.fontFamily = 'monospace';
  infoBox.style.display = gameState.debugMode ? 'block' : 'none';
  document.body.appendChild(infoBox);
}

// Function to update hover info for debug mode
export function updateHoverInfo(index: number) {
  const infoBox = document.getElementById('infoBox');
  if (!infoBox) return;
  
  const x = index % W;
  const z = Math.floor(index / W);
  const state = states[index];
  
  infoBox.innerHTML = `
    Position: (${x}, ${z})<br>
    Index: ${index}<br>
    State: ${state.toString(2).padStart(8, '0')}<br>
  `;
}

export function clearHoverInfo() {
  const infoBox = document.getElementById('infoBox');
  if (infoBox) {
    infoBox.innerHTML = '';
  }
}

// Function to setup fade overlay
export function setupFadeOverlay(): HTMLDivElement {
  const fadeOverlay = document.createElement('div');
  fadeOverlay.id = 'fadeOverlay';
  Object.assign(fadeOverlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.25s ease',
    zIndex: '9999',
  });
  document.body.appendChild(fadeOverlay);
  return fadeOverlay;
}
