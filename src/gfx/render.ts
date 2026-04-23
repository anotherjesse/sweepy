import * as THREE from "three";
import { gameState, states } from "../game";
import * as config from "../config";
import { camera, initCamera, updateCamera } from "./camera";
import { Player, players } from "../players";
import { on, PLAYER_ADDED, PLAYER_REMOVED } from "../eventBus";

let cellMesh: THREE.InstancedMesh | null = null;
const scene = new THREE.Scene();
export const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance
scene.background = new THREE.Color(0x808080);

globalThis.document.body.appendChild(renderer.domElement);
globalThis.addEventListener("resize", handleResize);

export function handleResize() {
  const h = globalThis.innerHeight;
  const w = globalThis.innerWidth;

  // Update camera properties (these use logical width/height)
  camera.left = -w / 2;
  camera.right = w / 2;
  camera.top = h / 2;
  camera.bottom = -h / 2;
  camera.updateProjectionMatrix();

  // Update pixel ratio (in case it changed, e.g. user moved window between displays)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Set the drawing buffer size (canvas.width and canvas.height attributes)
  renderer.setSize(w, h);

  // Set the CSS display size of the canvas to match the logical width and height
  renderer.domElement.style.width = `${w}px`;
  renderer.domElement.style.height = `${h}px`;
}
// Make sure handleResize() is still called once initially
handleResize();
initCamera(renderer);

on(PLAYER_ADDED, updateMeshes);
on(PLAYER_REMOVED, updateMeshes);

// Load sprite atlas
function loadSpriteAtlas(): THREE.Texture {
  const textureLoader = new THREE.TextureLoader();
  return textureLoader.load("./new.gif", (texture) => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
  });
}

// Initialize meshes
export function initMeshes() {
  // Create a checkerboard background (optional)
  const boardGeo = new THREE.PlaneGeometry(config.W, config.H);
  // Make sure board is flat on XZ plane
  // boardGeo.rotateX(-Math.PI / 2);

  // Initialize player meshes
  initPlayerMeshes();

  // Create a plane geometry for cells - ensure they're square
  const cellGeo = new THREE.PlaneGeometry(1.02, 1.02);
  // Make sure cells are flat on XZ plane
  cellGeo.translate(0, 0, 0);
  cellGeo.rotateX(-Math.PI / 2);
  // cellGeo.rotateY(Math.PI / 2); // Fix sprite orientation

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
  cellGeo.setAttribute("aState", aState);

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
      bool finished = mod(floor(rawState / 128.0), 2.0) > 0.5;
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
            tileUV = vec2(2.0, 0.0);    // empty cell
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
            tileUV = vec2(2.0, 0.0);    // empty revealed cell
          } else if (adj <= 4.0) {
            tileUV = vec2(adj - 1.0, 2.0);  // numbers 1-4 at row 2
          } else {
            tileUV = vec2(adj - 5.0, 1.0);  // numbers 5-8 at row 1
          }
        }
        
        // Override for finished mines (mines that are surrounded by revealed cells)
        if (mine && finished) {
          tileUV = vec2(1.0, 0.0);     // finished mines at col=1,row=0
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
      // Get original texture color (black/white/transparent)
      vec4 texColor = texture2D(atlas, vUv);
      
      // Calculate the sprite position we're in (0-3 x, 0-2 y)
      float spriteX = floor(vUv.x * 4.0);
      float spriteY = floor(vUv.y * 3.0);
      
      // Skip coloring if fully transparent
      if (texColor.a < 0.1) {
        gl_FragColor = texColor;
        return;
      }
      
      // Define colors for each number and flag/mine
      vec3 flagColor = vec3(1.0, 0.0, 0.0);        // Red for flag (0,0)
      vec3 emptyColor = vec3(0.0, 0.0, 0.0);       // Light gray for empty (3,0)
      
      vec3 num1Color = vec3(0.0, 0.0, 1.0);        // Blue for 1
      vec3 num2Color = vec3(0.0, 1.0, 0.0);        // Green for 2
      vec3 num3Color = vec3(1.0, 0.0, 0.0);        // Red for 3
      vec3 num4Color = vec3(0.0, 0.5, 1.0);        // light blue for 4
      vec3 num5Color = vec3(0.5, 1.0, 0.0);        // Brown for 5
      vec3 num6Color = vec3(1.0, 0.5, 0.0);        // Teal for 6
      vec3 num7Color = vec3(0.5, 0.5, 1.0);        // Black for 7
      vec3 num8Color = vec3(1.0, 0.0, 0.5);        // Gray for 8
      
      // Default to black
      vec3 finalColor = vec3(0.0, 0.0, 0.0);

      if (spriteX == 1.0 && spriteY == 0.0) {
        gl_FragColor = texColor;
        return;
      }
      
      // Coloring logic based on sprite position
      if (spriteY == 0.0) {
        // Top row
        if (spriteX == 0.0) finalColor = flagColor;       // Flag
        else if (spriteX == 3.0) finalColor = emptyColor; // Empty cell
      } else if (spriteY == 2.0) {
        // Bottom row - numbers 1-4
        if (spriteX == 0.0) finalColor = num1Color;
        else if (spriteX == 1.0) finalColor = num2Color;
        else if (spriteX == 2.0) finalColor = num3Color;
        else if (spriteX == 3.0) finalColor = num4Color;
      } else if (spriteY == 1.0) {
        // Middle row - numbers 5-8
        if (spriteX == 0.0) finalColor = num5Color;
        else if (spriteX == 1.0) finalColor = num6Color;
        else if (spriteX == 2.0) finalColor = num7Color;
        else if (spriteX == 3.0) finalColor = num8Color;
      }
      
      // Apply color based on texture intensity
      gl_FragColor = vec4(finalColor * texColor.r, texColor.a);
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
  const arr = cellMesh.geometry.getAttribute(
    "aState",
  ) as THREE.InstancedBufferAttribute;
  const arrData = arr.array as Float32Array;
  for (let i = 0; i < config.N; ++i) arrData[i] = states[i];
  arr.needsUpdate = true;

  // Update player meshes
  updatePlayerMeshes();


}

// Initialize player meshes
function initPlayerMeshes() {
  // Create player meshes for all existing players
  Object.values(players).forEach((player) => {
    if (!player.mesh) {
      createPlayerMesh(player);
    }
  });
}

// Create a mesh for a player
function createPlayerMesh(player: Player) {
  // Create a simple cube as player avatar
  const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const material = new THREE.MeshBasicMaterial({
    color: player.color,
    transparent: true,
    opacity: 0.7,
  });

  // Create player mesh
  const mesh = new THREE.Mesh(geometry, material);

  // Position at player's coordinates (slightly above ground)
  mesh.position.set(player.x + 0.5, 0.4, player.z + 0.5);

  // Apply initial scale - start large and diffuse
  mesh.scale.set(5, 5, 5);

  // Store initial creation time for animation
  mesh.userData.creationTime = Date.now();

  // Add to scene
  scene.add(mesh);

  // Assign mesh to player
  player.mesh = mesh;
}

// Update player meshes
function updatePlayerMeshes() {
  // Check for new players and create meshes for them
  Object.values(players).forEach((player) => {
    if (!player.mesh) {
      createPlayerMesh(player);
    } else {
      // Update existing mesh position
      player.mesh.position.set(player.x + 0.5, 0.4, player.z + 0.5);
    }
  });
}

// Animate player mesh with pulsing effect
function animatePlayerMeshes() {
  // Get current time for animation
  const time = Date.now();

  // Update each player mesh
  Object.values(players).forEach((player) => {
    if (player.mesh) {
      // Calculate age of the player mesh since creation
      const age = time - (player.mesh.userData.creationTime || time);

      // Scale animation - converge to normal size (1,1,1) over 1 second
      if (age < 1000) {
        // Ease-out animation curve
        const progress = 1 - Math.pow(1 - age / 1000, 3);
        const targetScale = 1;
        const currentScale = 5 * (1 - progress) + targetScale * progress;
        player.mesh.scale.set(currentScale, currentScale, currentScale);

        // Gradually increase opacity as it scales down
        const material = player.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = 0.3 + 0.4 * progress;
      } else {
        // Regular pulsing effect once animation is complete
        const pulse = 0.4 + 0.4 * Math.sin(age * 0.003); // slower pulse

        // Update material opacity
        const material = player.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = 0.4 + pulse * 0.4; // base opacity 0.4, pulsing by 0.4

        // Slightly bounce up and down
        player.mesh.position.y = 0.4 + 0.05 * Math.sin(age * 0.005);
      }
    }
  });
}

export function animate(inputPoll: () => void) {
  requestAnimationFrame(() => animate(inputPoll));

  inputPoll(); // players move
  updateCamera(); // make the camera chase them
  animatePlayerMeshes(); // animate player meshes with pulsing effect
  // maybeSaveCameraState();  // optional: persist ~1×/s

  renderer.render(scene, camera);
}
