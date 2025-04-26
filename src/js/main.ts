import { 
  setupFadeOverlay, 
  initRenderer, 
  initMeshes, 
  initUI, 
  animate, 
  handleResize,
  renderState
} from './render';
import { 
  gameState, 
  cellStateConstants, 
  generateBoard, 
  generateRandomSeed,
  loadGameData 
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
import {
  keyboardState,
  onKeyDown,
  onKeyUp,
  processKeyboardInput
} from './keyboard';

// Make states available globally for use in the render loop
declare global {
  interface Window {
    gamepadState: typeof gamepadState;
    keyboardState: typeof keyboardState;
    gameState: typeof gameState;
  }
}

window.gamepadState = gamepadState;
window.keyboardState = keyboardState;
window.gameState = gameState;

// Initialize the application
async function init() {
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

  // Try to load saved game or generate a new board if no saved game exists
  const loadedGame = await loadGameData();
  if (!loadedGame) {
    const seed = generateRandomSeed();
    generateBoard(seed);
  }

  // Start animation loop with both gamepad and keyboard polling
  animate(() => {
    pollGamepads();
    processKeyboardInput();
  });
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

  // Keyboard events
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  
  // Debug key for keyboard cursor visibility
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyK' && event.ctrlKey) {
      if (window.keyboardState && renderState.keyboardCursorMesh) {
        renderState.keyboardCursorMesh.visible = !renderState.keyboardCursorMesh.visible;
        console.log(`Keyboard cursor ${renderState.keyboardCursorMesh.visible ? 'shown' : 'hidden'}`);
      }
    }
  });

  // Window resize
  window.addEventListener('resize', handleResize);
  
  // Gamepad events
  window.addEventListener('gamepadconnected', connectGamepad);
  window.addEventListener('gamepaddisconnected', disconnectGamepad);
}

// Check system preference for dark mode
function setupColorScheme() {
  const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (prefersDarkMode) {
    document.body.classList.add('dark-mode');
  }

  // Listen for system changes to color scheme
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    if (event.matches) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  });
}

// Start the application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  setupColorScheme();
  init();
}); 