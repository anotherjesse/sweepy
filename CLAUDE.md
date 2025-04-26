# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- `pnpm install` - Install dependencies
- `pnpm typecheck` - Typecheck the code
- `pnpm build` - Build for production


## Code Style Guidelines
- **TypeScript**: Use strict mode with proper type definitions
- **Imports**: Order imports - external libraries first, then local modules
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces
- **Constants**: Use uppercase for constants (e.g., BOARD_SIZE)
- **Formatting**: Use consistent indentation (2 spaces)
- **Modules**: Prefer ES modules (import/export) syntax
- **Error handling**: Use try/catch for potential runtime errors
- **Types**: types should be defined in the file where their primary state is defined
- **Functions**: Keep functions small and focused on single responsibility
- **Comments**: Add meaningful comments for complex logic only

## Project Overview
Millionsweeper is a large-scale minesweeper game using Three.js for efficient rendering of a 1000x1000 grid. It uses TypeScript, simplex-noise for procedural generation, and seedrandom for deterministic randomness.

## Tech Overview

Use Three.js InstancedMesh for fast rendering of the grid.
But the game is 2d, always looking down from a top-down perspective.

## Gameplay

- you can use the mouse or gamepad
- you can zoom in and out using the mouse wheel
- click and hold to move the camera around x/y
- right click a cell to toggle a flag
- left click a cell to reveal it
- if you die, you have to wait a few seconds before you can play again