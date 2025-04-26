import * as THREE from 'three';

// Window with custom properties
type Window = {
  boardGeo: THREE.PlaneGeometry;
  gamepadState: any;
};

// Extend HTMLLinkElement for favicon
type CustomHTMLLinkElement = HTMLElement & {
  rel: string;
  href: string;
};

// Type for fade overlay
type FadeOverlay = HTMLDivElement & {
  style: CSSStyleDeclaration;
};

// Make TypeScript happy with simplex-noise
declare module 'simplex-noise' {
  export default class SimplexNoise {
    constructor(random?: any);
    noise2D(x: number, y: number): number;
    noise3D(x: number, y: number, z: number): number;
    noise4D(x: number, y: number, z: number, w: number): number;
  }
} 