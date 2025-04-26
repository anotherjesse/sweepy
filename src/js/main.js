import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import seedrandom from 'seedrandom';
import SimplexNoise from 'simplex-noise';

// --- CONFIG ---
// Use a 1000x1000 grid as specified in README
const BOARD_SIZE = 1000;
const W = BOARD_SIZE, H = BOARD_SIZE, N = W * H;

// Debug mode flag
let debugMode = false;

// Cell state bitfield flags
const NUMBER_MASK = 0x0f; // 00001111 (4 bits for adjacent mines, bits 0-3)
const REVEALED = 0x10;   // 00010000
const FLAGGED = 0x20;    // 00100000
const MINE = 0x40;       // 01000000

// Use Uint8Array for memory efficiency (1 byte per cell) as specified in README
const states = new Uint8Array(N);

function createDigitAtlas() {
  // Create a 256×256 texture atlas as specified in README
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Fill with black background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  
  const tileSize = 16; // 16×16 tiles in a 256×256 atlas
  
  // Row 0: hidden, flag, mine, error
  // Hidden cell
  ctx.fillStyle = '#777';
  ctx.beginPath();
  ctx.roundRect(0, 0, tileSize, tileSize, 2);
  ctx.fill();
  
  // Flag
  ctx.fillStyle = '#00f';
  ctx.beginPath();
  ctx.moveTo(tileSize + 4, 2);
  ctx.lineTo(tileSize + 12, 6);
  ctx.lineTo(tileSize + 4, 10);
  ctx.fill();
  ctx.fillRect(tileSize + 4, 2, 2, 12);
  
  // Mine
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(tileSize * 2 + 8, 8, 6, 0, Math.PI * 2);
  ctx.fill();
  
  // Error (placeholder)
  ctx.fillStyle = '#f00';
  ctx.fillRect(tileSize * 3, 0, tileSize, tileSize);
  
  // Row 1: Numbers 0-8
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  for (let i = 0; i <= 8; i++) {
    const x = i * tileSize;
    const y = tileSize;
    
    // Background
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, tileSize, tileSize);
    
    // Number
    ctx.fillStyle = palette[i].getStyle();
    ctx.fillText(i.toString(), x + tileSize/2, y + tileSize/2);
  }
  
  // Row 2: hover, explode (placeholders)
  ctx.fillStyle = '#aaa';
  ctx.fillRect(0, tileSize * 2, tileSize, tileSize);
  ctx.fillStyle = '#faa';
  ctx.fillRect(tileSize, tileSize * 2, tileSize, tileSize);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

// Simple color palette for values 0–8
const palette = [
  new THREE.Color(0.9, 0.9, 0.9), // 0 - Empty
  new THREE.Color(0.0, 0.0, 0.8), // 1 - Blue
  new THREE.Color(0.0, 0.5, 0.0), // 2 - Green
  new THREE.Color(0.8, 0.0, 0.0), // 3 - Red
  new THREE.Color(0.0, 0.0, 0.5), // 4 - Dark Blue
  new THREE.Color(0.5, 0.0, 0.0), // 5 - Dark Red
  new THREE.Color(0.0, 0.5, 0.5), // 6 - Cyan
  new THREE.Color(0.5, 0.0, 0.5), // 7 - Purple
  new THREE.Color(0.3, 0.3, 0.3), // 8 - Dark Gray
];

// Additional colors
const UNREVEALED_COLOR = new THREE.Color(0.7, 0.7, 0.7);
const MINE_COLOR = new THREE.Color(0.0, 0.0, 0.0);
const FLAG_COLOR = new THREE.Color(1.0, 0.0, 0.0);

// --- Three.js SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xff8800);

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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// Remove grid helper as it's not needed for a 2D view
// const gridHelper = new THREE.GridHelper(Math.min(1000, W), 10);
// scene.add(gridHelper);

// Window resize handler - ensure this is separately defined so it can be reused
function handleResize() {
  const h = window.innerHeight, w = window.innerWidth;
  camera.left = -w/2;
  camera.right = w/2;
  camera.top = h/2;
  camera.bottom = -h/2;
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
controls.enableRotate = true; // Disable rotation again to keep top-down view
controls.screenSpacePanning = true;
controls.enableKeys = false;
controls.target.set(W / 2, 0, H / 2); // Set target to center of board
controls.mouseButtons = {
  LEFT: THREE.MOUSE.LEFT,
  MIDDLE: THREE.MOUSE.MIDDLE,
  RIGHT: THREE.MOUSE.PAN  // Allow right click to pan
};

// Game state
let gameOver = false;
let gameStarted = false;
let gameStartTime = 0;
let firstClick = true;

// Meshes for cells and flags
let cellMesh;
let flagMesh;

// Raycaster for mouse interaction
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function initMeshes() {
  console.log("Initializing meshes");

  // Remove any existing meshes
  if (cellMesh) scene.remove(cellMesh);
  if (flagMesh) scene.remove(flagMesh);

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
  scene.add(boardMesh);

  // Create a plane geometry for cells - ensure they're square
  const cellGeo = new THREE.PlaneGeometry(0.9, 0.9);
  // Make sure cells are flat on XZ plane
  cellGeo.rotateX(-Math.PI / 2);

  // Create the texture atlas
  const digitTexture = createDigitAtlas();

  // Create custom attributes for the instanced mesh
  const offsets = new Float32Array(N * 2); // x, z offsets
  const uvs = new Float32Array(N * 2);     // texture atlas offsets

  // Initialize all cells as hidden (0,0 in atlas)
  for (let i = 0; i < N; i++) {
    const x = i % W, z = Math.floor(i / W);
    offsets[i * 2] = x;
    offsets[i * 2 + 1] = z;
    uvs[i * 2] = 0;     // Hidden tile (default)
    uvs[i * 2 + 1] = 0; // Top row of atlas
  }

  // Add attributes to geometry
  cellGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  cellGeo.setAttribute('aUV', new THREE.InstancedBufferAttribute(uvs, 2));

  // Create shader material as specified in README
  const cellMat = new THREE.ShaderMaterial({
    uniforms: {
      atlas: { value: digitTexture }
    },
    vertexShader: `
      attribute vec2 aOffset;
      attribute vec2 aUV;
      varying vec2 vUv;
      void main() {
        // Use the built-in uv attribute from THREE.PlaneGeometry
        vUv = aUV + uv / 16.0; // 16x16 tiles in atlas
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
    new THREE.Vector3(W/2, 0, H/2),
    Math.sqrt(W*W + H*H)/2
  );

  // Simple flag mesh for now (can be replaced with sprite later)
  const flagGeo = new THREE.ConeGeometry(0.3, 0.6, 3);
  flagGeo.rotateX(Math.PI);
  const flagMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  flagMesh = new THREE.InstancedMesh(flagGeo, flagMat, N);
  flagMesh.frustumCulled = true;
  flagMesh.count = 0; // Start with no flags visible
  
  // Set bounding box for flags too
  flagMesh.geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(W, 1, H)
  );
  flagMesh.geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(W/2, 0.5, H/2),
    Math.sqrt(W*W + H*H)/2
  );

  scene.add(cellMesh);
  scene.add(flagMesh);
  console.log("Meshes added to scene");
}

function updateMeshes() {
  console.log("Updating meshes with states array");
  if (!cellMesh || !flagMesh) {
    console.error("Meshes not initialized, initializing now");
    initMeshes();
  }

  const dummy = new THREE.Object3D();
  let flagCount = 0, uvArray = cellMesh.geometry.getAttribute('aUV').array;

  for (let i = 0; i < N; i++) {
    const x = i % W, z = Math.floor(i / W);
    const state = states[i];

    // Update UV coordinates based on cell state
    if ((state & REVEALED) || debugMode) {
      if (state & MINE) {
        // Mine tile at position (2,0) in the atlas
        uvArray[i * 2] = 2;
        uvArray[i * 2 + 1] = 0;
      } else {
        // Number tiles (0-8) at row 1
        const adjacentMines = (state & NUMBER_MASK);
        uvArray[i * 2] = adjacentMines;
        uvArray[i * 2 + 1] = 1;
      }
    } else {
      // Unrevealed tile (hidden) at position (0,0)
      uvArray[i * 2] = 0;
      uvArray[i * 2 + 1] = 0;
    }

    // Handle flags
    if (state & FLAGGED) {
      // Flag position in atlas (1,0)
      if (!((state & REVEALED) || debugMode)) {
        uvArray[i * 2] = 1;
        uvArray[i * 2 + 1] = 0;
      }
      
      // Add physical flag for 3D effect (optional)
      dummy.position.set(x, 0.5, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      flagMesh.setMatrixAt(flagCount, dummy.matrix);
      flagCount++;
    }
  }

  // Update UV attribute
  cellMesh.geometry.getAttribute('aUV').needsUpdate = true;

  // Update visible flag count
  flagMesh.count = flagCount;
  flagMesh.instanceMatrix.needsUpdate = true;

  console.log("Meshes updated successfully");
}

function generateBoard(seed, minePercentage = 0.15) {
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
  if (gameOver) return;
  if (!gameStarted) {
    gameStarted = true;
    gameStartTime = Date.now();
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
    // Game over
    gameOver = true;

    // Reveal all mines
    for (let i = 0; i < N; i++) {
      if (states[i] & MINE) {
        states[i] |= REVEALED;
      }
    }

    // Update display
    updateMeshes();

    // Show game over message
    console.log("Game over! You hit a mine!");

    // Allow restart after a delay
    setTimeout(() => {
      gameOver = false;
      firstClick = true;
      gameStarted = false;
    }, 3000);

    return;
  }

  // Auto-reveal empty cells
  const adjacentMines = (state & NUMBER_MASK) ;
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
          const adjacentMinesNi = (states[ni] & NUMBER_MASK) ;
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
  if (gameOver) return;
  if (!gameStarted) {
    gameStarted = true;
    gameStartTime = Date.now();
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
  
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onPointerDown(event) {
  // Update pointer position
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Raycast to find intersected cell
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObject(cellMesh);

  if (intersects.length > 0) {
    // Only handle clicks if not dragging/panning
    if (!controls.isPanning) {
      // Get instance ID
      const instanceId = intersects[0].instanceId;

      // Left click = reveal, Right click = flag
      if (event.button === 0) {
        // Left click
        revealCell(instanceId);
      } else if (event.button === 2) {
        // Right click
        toggleFlag(instanceId);
      }
    }
  }
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
  camera.zoom = Math.min(Math.max(camera.zoom, 0.5), 20);

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
    gameOver = false;
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
  });
  document.querySelector('.controls').appendChild(debugButton);
}

function generateRandomSeed() {
  const seed = Math.floor(Math.random() * 1000000000).toString();
  window.location.hash = seed;
  return seed;
}

function init() {
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