import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Extended OrbitControls interface to add missing properties
interface ExtendedOrbitControls extends OrbitControls {
  isPanning?: boolean;
}

// Window with custom properties
interface Window {
  boardGeo: THREE.PlaneGeometry;
}

// Extend GamepadButton interface
interface GamepadButton {
  pressed: boolean;
  previouslyPressed?: boolean;
}

// Extend HTMLLinkElement for favicon
interface CustomHTMLLinkElement extends HTMLElement {
  rel: string;
  href: string;
}

// Interface for fade overlay
interface FadeOverlay extends HTMLDivElement {
  style: CSSStyleDeclaration;
}

// Game state interfaces
interface GameState {
  disablePlayer: boolean;
  gameStarted: boolean;
  firstClick: boolean;
  debugMode: boolean;
  hoveredCellIndex: number;
}

// Render state interfaces
interface RenderState {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  controls: ExtendedOrbitControls;
  cellMesh: THREE.InstancedMesh | null;
}

// Gamepad state interface
interface GamepadState {
  gamepadCursorX: number;
  gamepadCursorZ: number;
  gamepadCursorIndex: number;
  gamepadCursorMesh: THREE.Mesh | null;
  lastGamepadTimestamp: number;
  gamepads: Record<number, Gamepad>;
  hasGamepad: boolean;
}

// Cell state constants interface
interface CellStateConstants {
  NUMBER_MASK: number;
  REVEALED: number;
  FLAGGED: number;
  MINE: number;
  FINISHED: number;
}

// Mouse state interface
interface MouseState {
  isMouseDown: boolean;
  initialPointerX: number;
  initialPointerY: number;
  initialCellIndex: number;
  pointer: THREE.Vector2;
  raycaster: THREE.Raycaster;
}

// Sprite constants interface 
interface SpriteConstants {
  SPRITE_CELL_WIDTH: number;
  SPRITE_CELL_HEIGHT: number;
}

// Make TypeScript happy with simplex-noise
declare module 'simplex-noise' {
  export default class SimplexNoise {
    constructor(random?: any);
    noise2D(x: number, y: number): number;
    noise3D(x: number, y: number, z: number): number;
    noise4D(x: number, y: number, z: number, w: number): number;
  }
} 