import * as THREE from 'three';
import * as config from './config';
import {  gameState, revealCell, toggleFlag } from './game';
import { renderState,  zoomIn, zoomOut } from './render';
import { updateHoverInfo, clearHoverInfo } from './ui';
import { gamepadState } from './gamepad';


// Mouse state interface
export type MouseState = {
  isMouseDown: boolean;
  initialPointerX: number;
  initialPointerY: number;
  initialCellIndex: number;
  pointer: THREE.Vector2;
  raycaster: THREE.Raycaster;
}

// Create mouse state object
export const mouseState: MouseState = {
  isMouseDown: false,
  initialPointerX: 0,
  initialPointerY: 0,
  initialCellIndex: -1,
  pointer: new THREE.Vector2(),
  raycaster: new THREE.Raycaster()
};

// Set raycaster threshold
if (mouseState.raycaster.params.Points) {
  mouseState.raycaster.params.Points.threshold = 0.1;
}
if (mouseState.raycaster.params.Line) {
  mouseState.raycaster.params.Line.threshold = 0.1;
}

// Pixel threshold to consider a mouse move as a drag
const DRAG_THRESHOLD = 5;

// Handler for mouse move events
export function onPointerMove(event: MouseEvent) {
  // If right mouse button is down, we're panning
  if (event.buttons === 2) {
    renderState.controls.isPanning = true;
  }

  // Calculate normalized device coordinates
  mouseState.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseState.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // If in debug mode, update hovered cell info
  if (gameState.debugMode) {
    // Raycast to find intersected cell
    mouseState.raycaster.setFromCamera(mouseState.pointer, renderState.camera);
    const intersects = mouseState.raycaster.intersectObject(renderState.cellMesh!);

    if (intersects.length > 0) {
      // Get the point of intersection in world coordinates
      const point = intersects[0].point;

      // Convert world coordinates to cell indices
      const x = Math.floor(point.x);
      const z = Math.floor(point.z);

      // Calculate the cell index from x,z coordinates
      gameState.hoveredCellIndex = x + z * config.W;

      // Ensure cell index is valid
      if (gameState.hoveredCellIndex >= 0 && gameState.hoveredCellIndex < config.N) {
        updateHoverInfo(gameState.hoveredCellIndex);
      } else {
        gameState.hoveredCellIndex = -1;
        clearHoverInfo();
      }
    } else {
      gameState.hoveredCellIndex = -1;
      clearHoverInfo();
    }
  }
}

// Handler for mouse down events
export function onPointerDown(event: MouseEvent) {
  // Store initial pointer position for drag detection
  mouseState.initialPointerX = event.clientX;
  mouseState.initialPointerY = event.clientY;
  mouseState.isMouseDown = true;

  // Update pointer position
  mouseState.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseState.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Only continue if not already panning
  if (renderState.controls.isPanning) return;

  // Raycast to find intersected cell and store it
  mouseState.raycaster.setFromCamera(mouseState.pointer, renderState.camera);
  const intersects = mouseState.raycaster.intersectObject(renderState.cellMesh!);
  
  if (intersects.length === 0) {
    mouseState.initialCellIndex = -1;
    return;
  }

  const hit = intersects[0];
  mouseState.initialCellIndex = hit.instanceId !== undefined ? hit.instanceId : -1; // Store the cell index for later use on mouse up
}

// Handler for mouse up events
export function onPointerUp(event: MouseEvent) {
  renderState.controls.isPanning = false;

  // Only handle cell actions if the mouse was down
  if (!mouseState.isMouseDown) return;
  mouseState.isMouseDown = false;

  // Check if mouse has moved beyond the drag threshold
  const deltaX = Math.abs(event.clientX - mouseState.initialPointerX);
  const deltaY = Math.abs(event.clientY - mouseState.initialPointerY);
  const hasMoved = deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD;

  // If mouse has moved too much, don't trigger the action
  if (hasMoved || mouseState.initialCellIndex === -1) return;

  // Update pointer position
  mouseState.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseState.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Raycast again to ensure we're still over the same cell
  mouseState.raycaster.setFromCamera(mouseState.pointer, renderState.camera);
  const intersects = mouseState.raycaster.intersectObject(renderState.cellMesh!);
  
  if (intersects.length === 0) return;

  const hit = intersects[0];
  const currentCellIndex = hit.instanceId;

  // Only trigger actions if we're still over the same cell
  if (currentCellIndex === mouseState.initialCellIndex) {
    // We need the fadeOverlay from the main file
    const fadeOverlay = document.getElementById('fadeOverlay') as HTMLDivElement;
    
    if (event.button === 0) {
      revealCell(currentCellIndex);
    } else if (event.button === 2) {
      toggleFlag(currentCellIndex);
    }
  }
}

// Handler for mouse wheel events
export function onWheel(event: WheelEvent) {
  event.preventDefault();

  const delta = event.deltaY;

  (delta > 0) ? zoomOut() : zoomIn();
}
