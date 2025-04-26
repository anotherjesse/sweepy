import { 
  setupFadeOverlay, 
  initRenderer, 
  initMeshes, 
  initUI, 
  animate, 
  handleResize 
} from './render';
import { 
  gameState, 
  cellStateConstants, 
  generateBoard, 
  generateRandomSeed 
} from './game';
import { 
  gamepadState, 
  connectGamepad, 
  disconnectGamepad, 
  pollGamepads 
} from './gamepad';
import { 
  onPointerMove, 
  onPointerDown, 
  onPointerUp, 
  onWheel 
} from './mouse';

// Make gamepadState available globally for use in the render loop
declare global {
  interface Window {
    gamepadState: typeof gamepadState;
  }
}

window.gamepadState = gamepadState;

// Initialize the application
function init() {
  // Setup rendering
  initRenderer();
  
  // Create fade overlay for death transition
  const fadeOverlay = setupFadeOverlay();
  
  // Initialize meshes
  initMeshes(gameState, cellStateConstants, gamepadState);
  
  // Setup event listeners
  initEventListeners();
  
  // Initialize UI components
  initUI(gameState, cellStateConstants, generateBoard, generateRandomSeed);

  // Generate initial board
  const seed = generateRandomSeed();
  generateBoard(seed);

  // Start animation loop
  animate(pollGamepads);
}

// Setup event listeners
function initEventListeners() {
  // Mouse events
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
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

// Start the application when DOM is ready
window.addEventListener('DOMContentLoaded', init); 