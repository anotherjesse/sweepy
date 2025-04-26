import { gameState, generateBoard, states } from "../game";
import { updateMeshes } from "../gfx/render";
import * as config from "../config";

let fadeOverlay: HTMLDivElement | null = null;

// Function to setup fade overlay
export function setupFadeOverlay() {
    fadeOverlay = document.createElement("div");
    fadeOverlay.id = "fadeOverlay";
    fadeOverlay.style.position = "fixed";
    fadeOverlay.style.top = "0";
    fadeOverlay.style.left = "0";
    fadeOverlay.style.width = "100%";
    fadeOverlay.style.height = "100%";
    fadeOverlay.style.backgroundColor = "black";
    fadeOverlay.style.opacity = "0";
    fadeOverlay.style.pointerEvents = "none";
    fadeOverlay.style.transition = "opacity 0.25s ease";
    fadeOverlay.style.zIndex = "9999";
    document.body.appendChild(fadeOverlay);
}

export function fade() {
    if (fadeOverlay) fadeOverlay.style.opacity = "1";
}

export function unfade() {
    if (fadeOverlay) fadeOverlay.style.opacity = "0";
}

// Setup UI components
export function initUI() {
    const generateButton = document.getElementById("generateButton");
    if (generateButton) {
        generateButton.addEventListener("click", () => {
            generateBoard();
        });
    }

    // Add debug toggle button
    const debugButton = document.createElement("button");
    debugButton.id = "debugButton";
    debugButton.textContent = "Debug Mode: OFF";
    debugButton.addEventListener("click", () => {
        gameState.debugMode = !gameState.debugMode;
        debugButton.textContent = `Debug: ${
            gameState.debugMode ? "ON" : "OFF"
        }`;
        updateMeshes();

        // Show/hide info box based on debug mode
        const infoBox = document.getElementById("infoBox");
        if (infoBox) {
            infoBox.style.display = gameState.debugMode ? "block" : "none";
        }
    });

    const controls = document.querySelector(".controls");
    if (controls) {
        controls.appendChild(debugButton);
    }

    // Create info box for hover information
    const infoBox = document.createElement("div");
    infoBox.id = "infoBox";
    infoBox.style.position = "absolute";
    infoBox.style.bottom = "10px";
    infoBox.style.left = "10px";
    infoBox.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    infoBox.style.color = "white";
    infoBox.style.padding = "10px";
    infoBox.style.borderRadius = "5px";
    infoBox.style.fontFamily = "monospace";
    infoBox.style.display = gameState.debugMode ? "block" : "none";
    document.body.appendChild(infoBox);
}

// Function to update hover info for debug mode
export function updateHoverInfo(index: number) {
    const infoBox = document.getElementById("infoBox");
    if (!infoBox) return;

    const x = index % config.W;
    const z = Math.floor(index / config.W);
    const state = states[index];

    infoBox.innerHTML = `
      Position: (${x}, ${z})<br>
      Index: ${index}<br>
      State: ${state.toString(2).padStart(8, "0")}<br>
    `;
}

export function clearHoverInfo() {
    const infoBox = document.getElementById("infoBox");
    if (infoBox) {
        infoBox.innerHTML = "";
    }
}
