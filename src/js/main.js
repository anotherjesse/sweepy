import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import seedrandom from 'seedrandom';
import SimplexNoise from 'simplex-noise';

// after your other globals, before init():
let fadeOverlay = null;

function setupFadeOverlay() {
  fadeOverlay = document.createElement('div');
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
}
// --- CONFIG ---
// Use a 1000x1000 grid as specified in README
const BOARD_SIZE = 1000;
const W = BOARD_SIZE, H = BOARD_SIZE, N = W * H;

// Debug mode flag
let debugMode = false;
// Track currently hovered cell
let hoveredCellIndex = -1;

// Cell state bitfield flags
const NUMBER_MASK = 0x0f; // 00001111 (4 bits for adjacent mines, bits 0-3)
const REVEALED = 0x10;   // 00010000
const FLAGGED = 0x20;    // 00100000
const MINE = 0x40;       // 01000000

// Use Uint8Array for memory efficiency (1 byte per cell) as specified in README
const states = new Uint8Array(N);

// Sprite info - 128x128 with 4x4 grid
const SPRITE_COLS = 4;
const SPRITE_ROWS = 4;
const SPRITE_CELL_WIDTH = 1 / SPRITE_COLS;  // 0.25
const SPRITE_CELL_HEIGHT = 1 / SPRITE_ROWS; // 0.25

function loadSpriteAtlas() {
  const texture = new THREE.TextureLoader().load('sprite.png');
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

// --- Three.js SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);

// Use OrthographicCamera for a true 2D map feel as specified in README
const camera = new THREE.OrthographicCamera(
  -window.innerWidth / 2,
  window.innerWidth / 2,
  window.innerHeight / 2,
  -window.innerHeight / 2,
  0.1,
  10000
);
// Position the camera directly above looking straight down (z-axis is height)
camera.position.set(W / 2, 100, H / 2); // Center above the board
camera.lookAt(W / 2, 0, H / 2); // Look at center of board
camera.zoom = 20; // Set a higher default zoom level

// Call this to apply the zoom
camera.updateProjectionMatrix();

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(2);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// Remove grid helper as it's not needed for a 2D view
// const gridHelper = new THREE.GridHelper(Math.min(1000, W), 10);
// scene.add(gridHelper);

// Window resize handler - ensure this is separately defined so it can be reused
function handleResize() {
  const h = window.innerHeight, w = window.innerWidth;
  camera.left = -w / 2;
  camera.right = w / 2;
  camera.top = h / 2;
  camera.bottom = -h / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Call initially to ensure correct setup
handleResize();

// OrbitControls for camera movement
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.enableRotate = false;
controls.screenSpacePanning = true;
controls.enableKeys = false;
controls.target.set(W / 2, 0, H / 2); // Set target to center of board
controls.mouseButtons = {
  LEFT: THREE.MOUSE.LEFT,
  MIDDLE: THREE.MOUSE.MIDDLE,
  RIGHT: THREE.MOUSE.PAN  // Allow right click to pan
};

// Game state
let disablePlayer = false;
let gameStarted = false;
let firstClick = true;

// Meshes for cells and flags
let cellMesh;
let flagMesh;

// Raycaster for mouse interaction
const raycaster = new THREE.Raycaster();
// Set raycaster threshold to 0.1 to improve cell detection
raycaster.params.Points.threshold = 0.1;
raycaster.params.Line.threshold = 0.1;
const pointer = new THREE.Vector2();

function initMeshes() {
  console.log("Initializing meshes");

  // Remove any existing meshes
  if (cellMesh) scene.remove(cellMesh);

  // Create a checkerboard background (optional)
  const boardGeo = new THREE.PlaneGeometry(W, H);
  // Make sure board is flat on XZ plane
  boardGeo.rotateX(-Math.PI / 2);
  window.boardGeo = boardGeo;
  const boardMat = new THREE.MeshBasicMaterial({
    color: 0x0088ff,
  });
  const boardMesh = new THREE.Mesh(boardGeo, boardMat);
  boardMesh.position.set(W / 2, -0.1, H / 2); // Slightly below the cells
  // scene.add(boardMesh);

  // Create a plane geometry for cells - ensure they're square
  const cellGeo = new THREE.PlaneGeometry(1, 1);
  // Make sure cells are flat on XZ plane
  cellGeo.translate( 0.5, -0.5, 0 );
  cellGeo.rotateX(-Math.PI / 2);

  // Load the sprite texture
  const spriteTexture = loadSpriteAtlas();

  // Create custom attributes for the instanced mesh
  const offsets = new Float32Array(N * 2); // x, z offsets
  const uvs = new Float32Array(N * 2);     // texture atlas offsets

  // Initialize all cells as hidden (use empty tile at position (2,2) in atlas)
  for (let i = 0; i < N; i++) {
    const x = i % W, z = Math.floor(i / W);
    offsets[i * 2] = x;
    offsets[i * 2 + 1] = z;
    uvs[i * 2] = 2;     // Empty tile (col 3, 0-indexed)
    uvs[i * 2 + 1] = 2; // Bottom row (row 3, 0-indexed)
  }

  // Add attributes to geometry
  cellGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  cellGeo.setAttribute('aUV', new THREE.InstancedBufferAttribute(uvs, 2));

  // Create shader material for the sprite sheet
  const cellMat = new THREE.ShaderMaterial({
    uniforms: {
      atlas: { value: spriteTexture }
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
    side: THREE.DoubleSide
  });

  // Create instanced mesh for cells
  cellMesh = new THREE.InstancedMesh(cellGeo, cellMat, N);
  cellMesh.frustumCulled = true; // Only render visible cells

  // Update instance matrices
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const x = i % W, z = Math.floor(i / W);
    dummy.position.set(x, 0, z);
    dummy.updateMatrix();
    cellMesh.setMatrixAt(i, dummy.matrix);
  }
  cellMesh.instanceMatrix.needsUpdate = true;

  // Manually compute and set bounding box for proper frustum culling
  cellMesh.geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(0, -0.1, 0),
    new THREE.Vector3(W, 0.1, H)
  );
  cellMesh.geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(W / 2, 0, H / 2),
    Math.sqrt(W * W + H * H) / 2
  );

  // We no longer need the 3D flag mesh since we're using sprites

  scene.add(cellMesh);
  console.log("Meshes added to scene");
}

function updateMeshes() {
  console.log("Updating meshes with states array");
  if (!cellMesh) {
    console.error("Meshes not initialized, initializing now");
    initMeshes();
  }

  const uvArray = cellMesh.geometry.getAttribute('aUV').array;

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
        const adjacentMines = (state & NUMBER_MASK);
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
    }
  }

  // Update UV attribute
  cellMesh.geometry.getAttribute('aUV').needsUpdate = true;

  console.log("Meshes updated successfully");
}

function generateBoard(seed, minePercentage = 0.3) {
  console.log(`Generating board with seed: ${seed}`);
  const rng = seedrandom(seed);
  const simplex = new SimplexNoise(rng);

  // Clear existing state
  states.fill(0);

  // Distribute mines using simplex noise for more natural clustering
  const noiseScale = 0.5; // Scale factor for noise
  const threshold = 1 - minePercentage; // Threshold value for mine placement

  let mineCount = 0;

  for (let i = 0; i < N; i++) {
    const x = i % W, z = Math.floor(i / W);

    // Use noise to determine mine placement
    const noiseValue = (simplex.noise2D(x * noiseScale, z * noiseScale) + 1) / 2; // Convert to 0-1 range

    if (noiseValue > threshold) {
      states[i] |= MINE;
      mineCount++;
    }
  }

  console.log(`Generated ${mineCount} mines (${(mineCount / N * 100).toFixed(2)}%)`);

  // Calculate adjacent mines for each cell
  for (let i = 0; i < N; i++) {
    if (states[i] & MINE) continue; // Skip if this is a mine

    const x = i % W, z = Math.floor(i / W);
    let count = 0;

    // Check all 8 adjacent cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue; // Skip self

        const nx = x + dx;
        const nz = z + dz;

        // Check bounds
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;

        const ni = nx + nz * W;
        if (states[ni] & MINE) count++;
      }
    }

    // Store adjacent mine count in the NUMBER_MASK bits
    states[i] |= (count);
  }

  updateMeshes();
}

function revealCell(index) {
  if (disablePlayer) return;
  if (!gameStarted) {
    gameStarted = true;
  }

  // Handle first click
  if (firstClick) {
    // Ensure first click is never a mine
    if (states[index] & MINE) {
      // Remove the mine
      states[index] &= ~MINE;

      // Find a new spot for the mine
      let newIndex;
      do {
        newIndex = Math.floor(Math.random() * N);
      } while ((newIndex === index) || (states[newIndex] & MINE));

      // Place the mine in the new spot
      states[newIndex] |= MINE;

      // Recalculate adjacent mine counts
      for (let i = 0; i < N; i++) {
        if (states[i] & MINE) continue; // Skip mines

        const x = i % W, z = Math.floor(i / W);
        let count = 0;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;

            const nx = x + dx;
            const nz = z + dz;

            if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;

            const ni = nx + nz * W;
            if (states[ni] & MINE) count++;
          }
        }

        // Reset number bits and set new count
        states[i] &= ~NUMBER_MASK;
        states[i] |= (count);
      }
    }
    firstClick = false;
  }

  const state = states[index];

  // Skip if already revealed or flagged
  if (state & REVEALED || state & FLAGGED) return;

  // Mark as revealed
  states[index] |= REVEALED;

  // Check if mine
  if (state & MINE) {
    disablePlayer = true;
    // set favicon to a red cross
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = 'red.png';
    if (fadeOverlay) fadeOverlay.style.opacity = '1';

    // Allow restart after a delay
    setTimeout(() => {
      // Move the player to a random location on the board
      // Choose a new random position within a reasonable range (not the entire board)
      const viewRange = 100; // A more reasonable view range
      const randomX = Math.floor(Math.random() * (W - viewRange));
      const randomZ = Math.floor(Math.random() * (H - viewRange));

      // Move both camera position and target coherently
      camera.position.set(randomX + viewRange / 2, camera.position.y, randomZ + viewRange / 2);
      controls.target.set(randomX + viewRange / 2, 0, randomZ + viewRange / 2);

      // Update camera and controls
      camera.updateProjectionMatrix();
      controls.update();

      if (fadeOverlay) fadeOverlay.style.opacity = '0';

      // Re-enable player
      disablePlayer = false;
      favicon = document.querySelector('link[rel="icon"]');
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      favicon.href = 'sprite.png';
    }, 1000);

    return;
  }

  // Auto-reveal empty cells
  const adjacentMines = (state & NUMBER_MASK);
  if (adjacentMines === 0) {
    // Flood fill to reveal adjacent empty cells
    const queue = [index];
    const visited = new Set([index]);

    while (queue.length > 0) {
      const currentIndex = queue.shift();
      const x = currentIndex % W;
      const z = Math.floor(currentIndex / W);

      // Check all adjacent cells
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) continue;

          const nx = x + dx;
          const nz = z + dz;

          // Check bounds
          if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;

          const ni = nx + nz * W;

          // Skip if already visited, revealed, or flagged
          if (visited.has(ni) || (states[ni] & REVEALED) || (states[ni] & FLAGGED)) continue;

          // Mark as visited
          visited.add(ni);

          // Reveal this cell
          states[ni] |= REVEALED;

          // If this is also an empty cell, add to queue
          const adjacentMinesNi = (states[ni] & NUMBER_MASK);
          if (adjacentMinesNi === 0) {
            queue.push(ni);
          }
        }
      }
    }
  }

  // Update display
  updateMeshes();

}

function toggleFlag(index) {
  if (disablePlayer) return;
  if (!gameStarted) {
    gameStarted = true;
  }

  // Skip if already revealed
  if (states[index] & REVEALED) return;

  // Toggle flag
  states[index] ^= FLAGGED;

  // Update display
  updateMeshes();
}

function onPointerMove(event) {
  // If right mouse button is down, we're panning
  if (event.buttons === 2) {
    controls.isPanning = true;
  }

  // Calculate normalized device coordinates properly
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // If in debug mode, update hovered cell info
  if (debugMode) {
    // Raycast to find intersected cell
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(cellMesh);

    if (intersects.length > 0) {
      // Get the point of intersection in world coordinates
      const point = intersects[0].point;

      // Convert world coordinates to cell indices
      // Add a small offset to ensure we're hitting the center of cells
      const x = Math.floor(point.x);
      const z = Math.floor(point.z);

      // Calculate the cell index from x,z coordinates
      hoveredCellIndex = x + z * W;

      // Ensure cell index is valid
      if (hoveredCellIndex >= 0 && hoveredCellIndex < N) {
        updateHoverInfo(hoveredCellIndex);
      } else {
        hoveredCellIndex = -1;
        clearHoverInfo();
      }
    } else {
      hoveredCellIndex = -1;
      clearHoverInfo();
    }
  }
}

function updateHoverInfo(cellIndex) {
  const infoBox = document.getElementById('infoBox');
  if (!infoBox) return;

  if (cellIndex >= 0 && cellIndex < N) {
    const state = states[cellIndex];
    const x = cellIndex % W;
    const z = Math.floor(cellIndex / W);

    let cellType = '';
    if (state & MINE) {
      cellType = 'MINE';
    } else {
      const adjacentMines = (state & NUMBER_MASK);
      cellType = adjacentMines === 0 ? 'Empty' : `Number ${adjacentMines}`;
    }

    const revealed = (state & REVEALED) ? 'Revealed' : 'Hidden';
    const flagged = (state & FLAGGED) ? 'Flagged' : 'Not flagged';

    infoBox.textContent = `Cell [${x},${z}]: ${cellType} | ${revealed} | ${flagged}`;
    infoBox.style.display = 'block';
  }
}

function clearHoverInfo() {
  const infoBox = document.getElementById('infoBox');
  if (infoBox) {
    infoBox.style.display = 'none';
  }
}

function onPointerDown(event) {
  // Update pointer position
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Only handle clicks if not dragging/panning
  if (controls.isPanning) return;

  // Raycast to find intersected cell
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObject(cellMesh);
  if (intersects.length === 0) return;

  const hit = intersects[0];
  const i = hit.instanceId; // ← this is the cell index 0…N-1
  if (i === undefined) return;

  if (event.button === 0) revealCell(i);
  else if (event.button === 2) toggleFlag(i);
}

// Detect when panning starts/ends
function onPointerUp(event) {
  controls.isPanning = false;
}

function onWheel(event) {
  // Prevent default scrolling behavior
  event.preventDefault();

  // Zoom in/out with scroll wheel as specified in README
  const delta = event.deltaY;

  // Apply zoom factor: multiply camera.zoom by 0.9 or 1.1
  camera.zoom *= (delta > 0) ? 0.9 : 1.1;

  // Clamp zoom between 0.5 and 20 as specified in README
  camera.zoom = Math.min(Math.max(camera.zoom, 10), 50);

  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function initEventListeners() {
  // Mouse move
  window.addEventListener('pointermove', onPointerMove);

  // Mouse click
  window.addEventListener('pointerdown', onPointerDown);

  // Mouse up
  window.addEventListener('pointerup', onPointerUp);

  // Prevent context menu
  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  // Mouse wheel for zoom
  window.addEventListener('wheel', onWheel);

  // Window resize
  window.addEventListener('resize', handleResize);
}

function initUI() {
  document.getElementById('generateButton').addEventListener('click', () => {
    console.log("Generate button clicked");
    // use entered seed or generate random
    const seed = generateRandomSeed();
    // Reset game state
    firstClick = true;
    gameStarted = false;

    // Generate new board
    generateBoard(seed);
  });

  // Add debug toggle button
  const debugButton = document.createElement('button');
  debugButton.id = 'debugButton';
  debugButton.textContent = 'Debug Mode: OFF';
  debugButton.addEventListener('click', () => {
    debugMode = !debugMode;
    debugButton.textContent = `Debug: ${debugMode ? 'ON' : 'OFF'}`;
    updateMeshes();

    // Show/hide info box based on debug mode
    const infoBox = document.getElementById('infoBox');
    if (infoBox) {
      infoBox.style.display = debugMode ? 'block' : 'none';
    }
  });
  document.querySelector('.controls').appendChild(debugButton);

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
  infoBox.style.display = debugMode ? 'block' : 'none';
  document.body.appendChild(infoBox);
}

function generateRandomSeed() {
  const seed = Math.floor(Math.random() * 1000000000).toString();
  window.location.hash = seed;
  return seed;
}

function init() {
  setupFadeOverlay();
  initMeshes();
  initEventListeners();
  initUI();

  // Generate initial board
  const seed = generateRandomSeed();
  generateBoard(seed);

  // Start animation loop
  animate();
}

// Start the application when DOM is ready
window.addEventListener('DOMContentLoaded', init); 