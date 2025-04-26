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

## tech

### tools
- for debug add a toggle to ignoring the "revealed" bit and show all cells

### graphics
- built with threejs - but it is not 3d
- 2d map of quads using InstancedMesh
- the camera is always looking straight down
- 16x16 texture atlas for the quads
- 1000x1000 grid of cells

### game gen
- simplex-noise - for noise
- seedrandom - for random number generation
- store values of seen cells in 1000x1000 array of Uint8 (1 byte)
  - 4 bits for the number of adjacent mines
  - 1 bit for "unknown"
  - 1 bit for "mine"
  - 1 bit for "flagged"

## Project Setup

we use pnpm to install the dependencies.

```bash
pnpm install
```

and to run the dev server in watch mode:

```bash
pnpm dev
```