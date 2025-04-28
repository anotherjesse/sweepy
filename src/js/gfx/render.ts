import * as THREE from "three";
import { states, gameState } from "../game";
import * as config from "../config";
import { initCamera, updateCamera, camera } from "./camera";
import { players } from "../players";

let cellMesh: THREE.InstancedMesh | null = null;
const scene = new THREE.Scene();
export const renderer = new THREE.WebGLRenderer({ antialias: false });
scene.background = new THREE.Color(0x333333);
renderer.setPixelRatio(2);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
initCamera(renderer);
window.addEventListener("resize", handleResize);

export function handleResize() {
  const h = window.innerHeight, w = window.innerWidth;
  camera.left = -w / 2;
  camera.right = w / 2;
  camera.top = h / 2;
  camera.bottom = -h / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
// Sprite sheet constants - will be used in shader
const SPRITE_CELL_WIDTH = 1 / 4;
const SPRITE_CELL_HEIGHT = 1 / 3; // 1/3 (for 4x3 sprite atlas)

// Load sprite atlas
function loadSpriteAtlas(): THREE.Texture {
  const textureLoader = new THREE.TextureLoader();
  return textureLoader.load("/new.gif", (texture) => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
  });
}

// Initialize meshes
export function initMeshes() {
  console.log("Initializing meshes");

  // Create a checkerboard background (optional)
  const boardGeo = new THREE.PlaneGeometry(config.W, config.H);
  // Make sure board is flat on XZ plane
  boardGeo.rotateX(-Math.PI / 2);
  (window as any).boardGeo = boardGeo;
  
  // Initialize player meshes
  initPlayerMeshes();

  // Create a plane geometry for cells - ensure they're square
  const cellGeo = new THREE.PlaneGeometry(1, 1);
  // Make sure cells are flat on XZ plane
  cellGeo.translate(0.5, -0.5, 0);
  cellGeo.rotateX(-Math.PI / 2);

  // Load the sprite texture
  const spriteTexture = loadSpriteAtlas();

  // Create custom attributes for the instanced mesh
  const offsets = new Float32Array(config.N * 2); // x, z offsets

  // Initialize all cell offsets
  for (let i = 0; i < config.N; i++) {
    const x = i % config.W, z = Math.floor(i / config.W);
    offsets[i * 2] = x;
    offsets[i * 2 + 1] = z;
  }

  // Add attributes to geometry
  cellGeo.setAttribute(
    "aOffset",
    new THREE.InstancedBufferAttribute(offsets, 2),
  );

  // Create an InstancedBufferAttribute that mirrors the Uint8Array "states"
  // (WebGL attributes must be floats, so we copy the bytes into a Float32Array)
  const stateArray = new Float32Array(config.N);
  stateArray.set(states);
  const aState = new THREE.InstancedBufferAttribute(stateArray, 1);
  cellGeo.setAttribute('aState', aState);

  // Create shader material for the sprite sheet
  const cellMat = new THREE.ShaderMaterial({
    uniforms: {
      atlas: { value: spriteTexture },
    },
    defines: {
      GRID_W: config.W.toFixed(1),
      GRID_H: config.H.toFixed(1),
      TILE_COLS: "4.0",
      TILE_ROWS: "3.0",
    },
    vertexShader: `
    attribute vec2 aOffset;
    attribute float aState;
    varying vec2 vUv;
    
    uniform sampler2D atlas;
    
    void main() {
      // 1) figure out which texel (cell) we are
      vec2 texCoord = (aOffset + 0.5) / vec2(GRID_W, GRID_H);
      float rawState = aState;
      
      // 2) decode bits
      bool revealed = mod(rawState, 32.0) >= 16.0;
      bool flagged  = mod(floor(rawState / 32.0), 2.0) > 0.5;
      bool mine     = mod(floor(rawState / 64.0), 2.0) > 0.5;
      float adj     = mod(rawState, 16.0);
      
      // Import from JS
      bool debugMode = false;
      #ifdef DEBUG_MODE
        debugMode = true;
      #endif
      
      // 3) pick your atlas cell (u,v) based on that
      vec2 tileUV;
      
      if (debugMode) {
        // In debug mode, show all mines and numbers regardless of revealed state
        if (mine) {
          tileUV = vec2(1.0, 0.0);      // mine at col=1,row=0
        } else {
          // numbers 0-8
          if (adj == 0.0) {
            tileUV = vec2(3.0, 0.0);    // empty cell
          } else if (adj <= 4.0) {
            tileUV = vec2(adj - 1.0, 2.0);  // numbers 1-4 at row 2
          } else {
            tileUV = vec2(adj - 5.0, 1.0);  // numbers 5-8 at row 1
          }
        }
      } else {
        // Normal game mode
        if (!revealed) {
          if (flagged) {
            tileUV = vec2(0.0, 0.0);    // flag at col=0,row=0
          } else {
            tileUV = vec2(3.0, 0.0);    // hidden tile
          }
        } else if (mine) {
          tileUV = vec2(1.0, 0.0);      // exploded mine at col=1,row=0
        } else {
          // numbers 1–8: pick row/col
          if (adj == 0.0) {
            tileUV = vec2(3.0, 0.0);    // empty revealed cell
          } else if (adj <= 4.0) {
            tileUV = vec2(adj - 1.0, 2.0);  // numbers 1-4 at row 2
          } else {
            tileUV = vec2(adj - 5.0, 1.0);  // numbers 5-8 at row 1
          }
        }
      }
      
      // compute final UV into atlas
      vec2 baseUv  = uv; // the built-in 0–1 range within one tile
      vec2 tileSz  = vec2(1.0/TILE_COLS, 1.0/TILE_ROWS);
      vUv = tileUV * tileSz + baseUv * tileSz;
      
      // standard instancing logic
      vec3 pos = position + vec3(aOffset.x, 0.0, aOffset.y);
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

  // Get the shader material
  const material = cellMesh.material as THREE.ShaderMaterial;
  
  // Set debug mode define
  if (material.defines) {
    if (gameState.debugMode) {
      material.defines.DEBUG_MODE = true;
    } else {
      delete material.defines.DEBUG_MODE;
    }
    material.needsUpdate = true;
  }

  // Copy the changed bytes into the float attribute and flag it dirty
  const arr = (cellMesh.geometry.getAttribute('aState') as THREE.InstancedBufferAttribute);
  const arrData = arr.array as Float32Array;
  for (let i = 0; i < config.N; ++i) arrData[i] = states[i];
  arr.needsUpdate = true;
  
  // Update player meshes
  updatePlayerMeshes();
  
  console.log("Meshes updated successfully");
}

// Initialize player meshes
function initPlayerMeshes() {
  // Create player meshes for all existing players
  Object.values(players).forEach(player => {
    if (!player.mesh) {
      createPlayerMesh(player);
    }
  });
}

// Create a mesh for a player
function createPlayerMesh(player: any) {
  // Create a simple cube as player avatar
  const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const material = new THREE.MeshBasicMaterial({ color: player.color });
  const mesh = new THREE.Mesh(geometry, material);
  
  // Position at player's coordinates (slightly above ground)
  mesh.position.set(player.x + 0.5, 0.4, player.z + 0.5);
  
  // Add to scene
  scene.add(mesh);
  
  // Assign mesh to player
  player.mesh = mesh;
}

// Update player meshes
function updatePlayerMeshes() {
  // Check for new players and create meshes for them
  Object.values(players).forEach(player => {
    if (!player.mesh) {
      createPlayerMesh(player);
    } else {
      // Update existing mesh position
      player.mesh.position.set(player.x + 0.5, 0.4, player.z + 0.5);
    }
  });
}

export function animate(inputPoll: () => void) {
  requestAnimationFrame(() => animate(inputPoll));

  inputPoll(); // players move
  updateCamera(); // ⬅ NEW: make the camera chase them
  // maybeSaveCameraState();  // ⬅ optional: persist ~1×/s

  renderer.render(scene, camera);
}
