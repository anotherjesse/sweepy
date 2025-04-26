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
  const canvas = document.createElement('canvas');
  canvas.width = 24;  // 3 × 8
  canvas.height = 24; // 3 × 8
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 24, 24);
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';

  let n = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++, n++) {
      ctx.fillText(n.toString(), col * 8 + 4, row * 8 + 4);
    }
  }
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
scene.background = new THREE.Color(0x333333);

// Use OrthographicCamera for a true 2D map feel
const frustumSize = 30; // Reduced frustum size for better initial zoom
const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(
  frustumSize * aspect / -2,
  frustumSize * aspect / 2,
  frustumSize / 2,
  frustumSize / -2,
  0.1,
  10000
);
// Position the camera directly above looking straight down
camera.position.set(W / 2, 10, H / 2);
camera.up.set(0, 0, -1); // Set up vector to ensure proper orientation
camera.lookAt(W / 2, 0, H / 2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// Remove grid helper as it's not needed for a 2D view
// const gridHelper = new THREE.GridHelper(Math.min(1000, W), 10);
// scene.add(gridHelper);

// OrbitControls for camera movement
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.minPolarAngle = Math.PI / 2;
controls.maxPolarAngle = Math.PI / 2;
controls.screenSpacePanning = true;
controls.enableRotate = false;

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
  // boardGeo.rotateY(Math.PI / 2);
  window.boardGeo = boardGeo;
  const boardMat = new THREE.MeshBasicMaterial({
    color: 0x444444,
  });
  const boardMesh = new THREE.Mesh(boardGeo, boardMat);
  boardMesh.position.set(W / 2, -0.1, H / 2); // Slightly below the cells
  scene.add(boardMesh);

  // Create a plane geometry for cells
  const cellGeo = new THREE.PlaneGeometry(0.9, 0.9);
  cellGeo.rotateX(-Math.PI / 2);

  // Create colored attribute for initial state
  const initialColors = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    initialColors[i * 3] = UNREVEALED_COLOR.r;
    initialColors[i * 3 + 1] = UNREVEALED_COLOR.g;
    initialColors[i * 3 + 2] = UNREVEALED_COLOR.b;
  }

  // Add colors attribute to geometry
  // cellGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * 4), 3));
  cellGeo.setAttribute(
    'color',
    new THREE.Float32BufferAttribute([
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1   // 4 vertices × RGB
    ], 3)
  );

  const cellMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  });

  // Create instanced mesh for cells
  cellMesh = new THREE.InstancedMesh(cellGeo, cellMat, N);
  cellMesh.instanceColor = new THREE.InstancedBufferAttribute(initialColors, 3);
  cellMesh.frustumCulled = true; // Only render visible cells

  // In initMeshes, after creating cellMesh
  const glyphAttr = new Uint8Array(N); // 0-8 from NUMBER bits
  cellMesh.geometry.setAttribute(
    'glyph',
    new THREE.InstancedBufferAttribute(glyphAttr, 1)
  );

  const digitTexture = createDigitAtlas();

  const mat = new THREE.RawShaderMaterial({
    uniforms: {
      map: { value: digitTexture },
      revealed: { value: 0 },    // toggled per-frame
    },
    vertexShader: `
    precision highp float;
    attribute vec3 position;
    attribute vec3 instanceColor;
    attribute float glyph;
    attribute mat4 instanceMatrix;
    attribute vec2 uv;
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;
    varying vec3 vColor;
    varying vec2 vUv;
    void main() {
      vColor = instanceColor;
      // tile selection
      float g = glyph;          // 0-8
      float col = mod(g, 3.0);
      float row = floor(g / 3.0);
      vec2 base = vec2(col, row) / 3.0;
      // incoming built-in uv (0-1) from PlaneGeometry
      vUv = base + uv / 3.0;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0);
    }
  `,
    fragmentShader: `
    precision highp float;
    uniform sampler2D map;
    uniform float revealed;   // 0 or 1
    varying vec3 vColor;
    varying vec2 vUv;
    void main() {
      vec4 digit = texture2D(map, vUv);
      // revealed==0  → just show flat vColor
      // revealed==1  → multiply digit (white digits on black atlas) with vColor
      vec3 finalColor = mix(vColor,
                            vColor * digit.r,   // digit.r = digit.g = digit.b
                            revealed);
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
  });

  cellMesh.material = mat;


  // Create a simple triangle geometry for flags
  const flagGeo = new THREE.ConeGeometry(0.3, 0.6, 3);
  const flagMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  flagMesh = new THREE.InstancedMesh(flagGeo, flagMat, N);
  flagMesh.frustumCulled = true;
  flagMesh.count = 0; // Start with no flags visible

  // Set initial transforms for cells
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const x = i % W, z = Math.floor(i / W);
    dummy.position.set(x, 0, z);
    dummy.updateMatrix();
    cellMesh.setMatrixAt(i, dummy.matrix);
  }
  cellMesh.instanceMatrix.needsUpdate = true;

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
  const colorArr = new Float32Array(N * 3);
  let flagCount = 0;

  for (let i = 0; i < N; i++) {
    const x = i % W, z = Math.floor(i / W);
    const state = states[i];

    // Set color based on cell state
    let color;
    if ((state & REVEALED) || debugMode) {
      if (state & MINE) {
        color = MINE_COLOR;
      } else {
        const adjacentMines = (state & NUMBER_MASK) ;
        color = palette[adjacentMines];
      }
    } else {
      color = UNREVEALED_COLOR;
    }

    colorArr[3 * i] = color.r;
    colorArr[3 * i + 1] = color.g;
    colorArr[3 * i + 2] = color.b;

    // Handle flags
    if (state & FLAGGED) {
      dummy.position.set(x, 0.5, z); // Raised position for flags to be visible
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      flagMesh.setMatrixAt(flagCount, dummy.matrix);
      flagCount++;
    }
  }

  // Update cell colors
  if (cellMesh.instanceColor) {
    // If we already have an instanceColor buffer, just update it
    cellMesh.instanceColor.set(colorArr);
    cellMesh.instanceColor.needsUpdate = true;
  } else {
    // Otherwise create a new one
    cellMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArr.slice(), 3);
  }

  // Update visible flag count
  flagMesh.count = flagCount;

  // Update the instance matrices
  cellMesh.instanceMatrix.needsUpdate = true;
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

function onWheel(event) {
  // Prevent default scrolling behavior
  event.preventDefault();

  // Zoom in/out with scroll wheel
  const delta = event.deltaY;

  // Adjust orthographic camera zoom with more sensitivity for better control
  const zoomSpeed = 0.05; // Reduced for smoother zooming
  const zoomFactor = 1 + (delta > 0 ? zoomSpeed : -zoomSpeed);
  camera.zoom /= zoomFactor;

  // Clamp zoom to reasonable values
  camera.zoom = Math.min(Math.max(camera.zoom, 0.01), 10);

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

  // Prevent context menu
  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  // Mouse wheel for zoom
  window.addEventListener('wheel', onWheel);

  // Window resize
  window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = frustumSize * aspect / -2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
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