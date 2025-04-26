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
// Track currently hovered cell
let hoveredCellIndex = -1;

// Cell state bitfield flags
const NUMBER_MASK = 0x0f; // 00001111 (4 bits for adjacent mines, bits 0-3)
const REVEALED = 0x10;   // 00010000
const FLAGGED = 0x20;    // 00100000
const MINE = 0x40;       // 01000000
const FINISHED = 0x80;   // 10000000 (for completely boxed-in mines)

// Use Uint8Array for memory efficiency (1 byte per cell) as specified in README
const states = new Uint8Array(N);

// after your other globals, before init():
let fadeOverlay = null;
const initialZoom = 20;

// Gamepad support
let gamepads = {};
let hasGamepad = false;
let gamepadCursorX = 500; // Start at center of board
let gamepadCursorZ = 500;
let gamepadCursorIndex = gamepadCursorX + gamepadCursorZ * W;
let gamepadCursorMesh = null;
let lastGamepadTimestamp = 0;
const gamepadThrottleMS = 150; // Time between movements in ms

// Mouse tracking variables for click vs drag detection
let isMouseDown = false;
let initialPointerX = 0;
let initialPointerY = 0;
let initialCellIndex = -1;
const dragThreshold = 5; // Pixel threshold to consider as a drag

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
camera.zoom = initialZoom; // Set a higher default zoom level

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
  if (gamepadCursorMesh) scene.remove(gamepadCursorMesh);

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
  cellGeo.translate(0.5, -0.5, 0);
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

  // Create gamepad cursor indicator (a bright highlighted square)
  const cursorGeo = new THREE.PlaneGeometry(1, 1);
  cursorGeo.translate(0.5, -0.45, 0); // Slightly above cells
  cursorGeo.rotateX(-Math.PI / 2);
  
  const cursorMat = new THREE.MeshBasicMaterial({ 
    color: 0xffff00, 
    transparent: true,
    opacity: 0.5,
    wireframe: false,
    side: THREE.DoubleSide
  });
  
  gamepadCursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
  gamepadCursorMesh.position.set(gamepadCursorX, 0.1, gamepadCursorZ);
  gamepadCursorMesh.visible = hasGamepad;
  scene.add(gamepadCursorMesh);

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

      // Handle finished mines (completely boxed in)
      // Blue flag sprite to the right of red flag (1,1)
      if ((state & MINE) && (state & FINISHED)) {
        uvArray[i * 2] = 1;
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

  // FIXME(ja): the board layout isn't good right now... too many mines touching each other

  // Distribute mines using simplex noise for more natural clustering
  const noiseScale = 0.25; // Scale factor for noise
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
      camera.zoom = initialZoom; // Set a higher default zoom level

      // Update camera and controls
      camera.updateProjectionMatrix();
      controls.update();

      // MOVE GAMEPAD CURSOR TO NEW POSITION
      gamepadCursorX = randomX + viewRange / 2;
      gamepadCursorZ = randomZ + viewRange / 2;
      gamepadCursorIndex = gamepadCursorX + gamepadCursorZ * W;

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

  // Check for mines that are now completely boxed in
  checkForBoxedInMines();

  // Update display
  updateMeshes();
}

// Function to check for mines that are completely boxed in
function checkForBoxedInMines() {
  for (let i = 0; i < N; i++) {
    // Skip if not a mine or already marked as finished
    if (!(states[i] & MINE) || (states[i] & FINISHED)) continue;

    const x = i % W, z = Math.floor(i / W);
    let allRevealed = true;

    // Check all 8 adjacent cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue; // Skip self

        const nx = x + dx;
        const nz = z + dz;

        // Check bounds
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;

        const ni = nx + nz * W;
        // If any adjacent cell is not revealed, the mine is not boxed in
        if (!(states[ni] & REVEALED)) {
          allRevealed = false;
          break;
        }
      }
      if (!allRevealed) break;
    }

    // If all adjacent cells are revealed, mark the mine as finished
    if (allRevealed) {
      states[i] |= FINISHED;
    }
  }
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

  // Check for any boxed-in mines that may need updating
  checkForBoxedInMines();
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
  // Store initial pointer position for drag detection
  initialPointerX = event.clientX;
  initialPointerY = event.clientY;
  isMouseDown = true;

  // Update pointer position
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Only continue if not already panning
  if (controls.isPanning) return;

  // Raycast to find intersected cell and store it
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObject(cellMesh);
  if (intersects.length === 0) {
    initialCellIndex = -1;
    return;
  }

  const hit = intersects[0];
  initialCellIndex = hit.instanceId; // Store the cell index for later use on mouse up
}

// Detect when panning starts/ends
function onPointerUp(event) {
  controls.isPanning = false;
  
  // Only handle cell actions if the mouse was down
  if (!isMouseDown) return;
  isMouseDown = false;

  // Check if mouse has moved beyond the drag threshold
  const deltaX = Math.abs(event.clientX - initialPointerX);
  const deltaY = Math.abs(event.clientY - initialPointerY);
  const hasMoved = deltaX > dragThreshold || deltaY > dragThreshold;

  // If mouse has moved too much, don't trigger the action
  if (hasMoved || initialCellIndex === -1) return;

  // Update pointer position
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Raycast again to ensure we're still over the same cell
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObject(cellMesh);
  if (intersects.length === 0) return;

  const hit = intersects[0];
  const currentCellIndex = hit.instanceId;

  // Only trigger actions if we're still over the same cell
  if (currentCellIndex === initialCellIndex) {
    if (event.button === 0) revealCell(currentCellIndex);
    else if (event.button === 2) toggleFlag(currentCellIndex);
  }
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
  pollGamepads();
  
  // Add pulsing animation to gamepad cursor
  if (gamepadCursorMesh && gamepadCursorMesh.visible) {
    // Pulse the opacity between 0.2 and 0.7
    const pulseFactor = (Math.sin(Date.now() * 0.005) + 1) / 2; // 0 to 1 value
    gamepadCursorMesh.material.opacity = 0.2 + pulseFactor * 0.5;
  }
  
  renderer.render(scene, camera);
}

// Gamepad functions
function connectGamepad(e) {
  console.log("Gamepad connected:", e.gamepad);
  gamepads[e.gamepad.index] = e.gamepad;
  hasGamepad = true;
  
  if (gamepadCursorMesh) {
    gamepadCursorMesh.visible = true;
    
    // Move cursor to center of current view
    const centerX = Math.floor(camera.position.x);
    const centerZ = Math.floor(camera.position.z);
    gamepadCursorX = Math.min(Math.max(centerX, 0), W - 1);
    gamepadCursorZ = Math.min(Math.max(centerZ, 0), H - 1);
    gamepadCursorIndex = gamepadCursorX + gamepadCursorZ * W;
    updateGamepadCursor();
  }
}

function disconnectGamepad(e) {
  console.log("Gamepad disconnected:", e.gamepad);
  delete gamepads[e.gamepad.index];
  
  // Check if any gamepads remain connected
  hasGamepad = Object.keys(gamepads).length > 0;
  
  if (gamepadCursorMesh) {
    gamepadCursorMesh.visible = hasGamepad;
  }
}

function updateGamepadCursor() {
  if (!gamepadCursorMesh) return;
  
  gamepadCursorMesh.position.set(gamepadCursorX, 0.1, gamepadCursorZ);
  gamepadCursorIndex = gamepadCursorX + gamepadCursorZ * W;
  
  // Move camera if cursor approaches edge of view
  const padding = 5; // Cells from edge to trigger camera move
  const moveAmount = 3; // Cells to move camera by
  
  const viewportWidth = window.innerWidth / camera.zoom;
  const viewportHeight = window.innerHeight / camera.zoom;
  
  const leftEdge = camera.position.x - viewportWidth / 2;
  const rightEdge = camera.position.x + viewportWidth / 2;
  const topEdge = camera.position.z - viewportHeight / 2;
  const bottomEdge = camera.position.z + viewportHeight / 2;
  
  if (gamepadCursorX < leftEdge + padding) {
    camera.position.x -= moveAmount;
    controls.target.x -= moveAmount;
  } else if (gamepadCursorX > rightEdge - padding) {
    camera.position.x += moveAmount;
    controls.target.x += moveAmount;
  }
  
  if (gamepadCursorZ < topEdge + padding) {
    camera.position.z -= moveAmount;
    controls.target.z -= moveAmount;
  } else if (gamepadCursorZ > bottomEdge - padding) {
    camera.position.z += moveAmount;
    controls.target.z += moveAmount;
  }
}

function pollGamepads() {
  if (!hasGamepad) return;
  
  // Only poll at a reasonable rate to prevent ultra-fast movement
  const now = Date.now();
  if (now - lastGamepadTimestamp < gamepadThrottleMS) return;
  
  // Get fresh gamepad data
  const freshGamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  
  for (let i = 0; i < freshGamepads.length; i++) {
    const gamepad = freshGamepads[i];
    if (!gamepad) continue;
    
    // D-pad movement
    // Standard mapping usually has D-pad as buttons 12-15
    let moved = false;
    
    // Up (button 12 or left stick/d-pad up)
    if (gamepad.buttons[12]?.pressed || gamepad.axes[1] < -0.5) {
      gamepadCursorZ = Math.max(0, gamepadCursorZ - 1);
      moved = true;
    }
    // Down (button 13 or left stick/d-pad down)
    if (gamepad.buttons[13]?.pressed || gamepad.axes[1] > 0.5) {
      gamepadCursorZ = Math.min(H - 1, gamepadCursorZ + 1);
      moved = true;
    }
    // Left (button 14 or left stick/d-pad left)
    if (gamepad.buttons[14]?.pressed || gamepad.axes[0] < -0.5) {
      gamepadCursorX = Math.max(0, gamepadCursorX - 1);
      moved = true;
    }
    // Right (button 15 or left stick/d-pad right)
    if (gamepad.buttons[15]?.pressed || gamepad.axes[0] > 0.5) {
      gamepadCursorX = Math.min(W - 1, gamepadCursorX + 1);
      moved = true;
    }
    
    if (moved) {
      lastGamepadTimestamp = now;
      updateGamepadCursor();
    }
    
    // Zoom controls with shoulder buttons (L1/R1 or LB/RB)
    // Button 4 (L1 on PlayStation, LB on Xbox) - Zoom out
    if (gamepad.buttons[4]?.pressed) {
      camera.zoom *= 0.95; // Zoom out
      camera.zoom = Math.min(Math.max(camera.zoom, 10), 50); // Clamp zoom
      camera.updateProjectionMatrix();
    }
    
    // Button 5 (R1 on PlayStation, RB on Xbox) - Zoom in
    if (gamepad.buttons[5]?.pressed) {
      camera.zoom *= 1.05; // Zoom in
      camera.zoom = Math.min(Math.max(camera.zoom, 10), 50); // Clamp zoom
      camera.updateProjectionMatrix();
    }
    
    // Button actions
    // Button 0 (A on Xbox, X on PlayStation) - Reveal cell
    if (gamepad.buttons[0]?.pressed && !gamepad.buttons[0].previouslyPressed) {
      revealCell(gamepadCursorIndex);
      gamepad.buttons[0].previouslyPressed = true;
    } else if (!gamepad.buttons[0]?.pressed) {
      gamepad.buttons[0].previouslyPressed = false;
    }
    
    // Button 1 (B on Xbox, Circle on PlayStation) - Toggle flag
    if (gamepad.buttons[1]?.pressed && !gamepad.buttons[1].previouslyPressed) {
      toggleFlag(gamepadCursorIndex);
      gamepad.buttons[1].previouslyPressed = true;
    } else if (!gamepad.buttons[1]?.pressed) {
      gamepad.buttons[1].previouslyPressed = false;
    }
  }
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
  
  // Gamepad events
  window.addEventListener('gamepadconnected', connectGamepad);
  window.addEventListener('gamepaddisconnected', disconnectGamepad);
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