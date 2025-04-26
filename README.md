# Millionsweeper

A large minesweeper-style board renderer with procedural generation.

## Gameplay

- you can zoom in and out using the mouse wheel
- click and hold to move the camera around x/y
- right click a cell to toggle a flag
- left click a cell to reveal it
- if you die, you have to wait a few seconds before you can play again
- the game is generated procedurally, so no two games are the same
- the seed should be stored in the url as a hash link - and read on page load
- when all the a flag is added 

## Tech

### Tools
- for debug add a toggle to ignoring the "revealed" bit and show all cells

### Graphics
- built with threejs - but it is not 3d
- 2d map of quads using InstancedMesh
- the camera is always looking straight down
- 16x16 texture atlas for the quads
- 1000x1000 grid of cells

#### Camera Setup
- Uses THREE.OrthographicCamera for a top-down view
- Frustum setup on resize:
  ```js
  const h = window.innerHeight, w = window.innerWidth;
  camera.left = -w/2; camera.right = w/2;
  camera.top = h/2; camera.bottom = -h/2;
  ```
- Camera position: `camera.position.set(0, 0, 100)` (z-axis is "height" above the board)
- Default up-vector (0,1,0) is kept
- Zoom: mouse-wheel multiplies camera.zoom by 0.9 or 1.1, clamped between 0.5 and 20
- Re-centering: updateProjectionMatrix() called after every pan
- Creates an infinite-sky view that never tilts; only x/y translate and zoom change

#### Board/Cell Rendering
- Geometry: a single PlaneGeometry(cellSize, cellSize)
- Instancing: `new THREE.InstancedMesh(planeGeo, atlasMaterial, BOARD_SIZE*BOARD_SIZE)`
- Each instance's transform matrix is translated by integer multiples of cellSize
- Per-instance data uses two custom attributes:
  ```js
  aOffset : vec2   // integer cell coordinate 
  aUV     : vec2   // the bottom-left tile inside the 16×16 atlas
  ```
- Fragment shader calculates final UV: `vUv = aUV + baseUv/16.0`
- A 256×256 RGBA atlas holds all sprites (hidden, flag, numbers 0-8, mine, etc.)
- State changes update `atlasMaterial.instanceMatrix.needsUpdate = true` when the bit-field array is modified

#### Controls
- Based on OrbitControls with rotation disabled:
  ```js
  controls.enableRotate = false;
  controls.enableKeys = false;
  controls.screenSpacePanning = true;
  controls.enableDamping = true;
  ```
- Zoom handled by wheel delta mapped to camera.zoom
- Damping set to default 0.05 for "inertial" feel on release
- Pan via left-mouse drag
- "Right-click flag" handled by checking event.button === 2
- World-space to board-space conversion via raycaster.intersectObject()

#### Number/Sprite Generation
- Atlas: /public/atlas.png (256 × 256)
- 16 × 16 tiles layout:
  ```
  row 0 : hidden, flag, mine, error
  row 1 : 0, 1, 2, 3, 4, 5, 6, 7, 8
  row 2 : hover, explode, ...
  ```
- Built at startup by:
  1. Creating an off-screen canvas 256 × 256
  2. Drawing a grey rounded-rect for "hidden"
  3. Drawing an SVG path for "flag" (blue fill)
  4. For numbers: setting fillStyle = palette[i] and calling fillText()
  5. Converting to CanvasTexture with NearestFilter for min/mag filters
- Numbers are generated programmatically, not loaded as separate PNGs

### Game Gen
- simplex-noise - for noise
- seedrandom - for random number generation
- store values of seen cells in 1000x1000 array of Uint8 (1 byte)
  - 4 bits for the number of adjacent mines
  - 1 bit for "unknown"
  - 1 bit for "mine"
  - 1 bit for "flagged"

## Project Setup

We use pnpm to install the dependencies.

```bash
pnpm install
```

And to run the dev server in watch mode:

```bash
pnpm dev
```