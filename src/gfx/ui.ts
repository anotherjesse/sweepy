import { gameState, generateBoard, states } from "../game";
import { updateMeshes } from "./render";
import * as config from "../config";
import { players } from "../players";

let fadeOverlay: HTMLDivElement | null = null;
let instructionsOverlay: HTMLDivElement | null = null;

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

  // Create instructions overlay
  instructionsOverlay = document.createElement("div");
  instructionsOverlay.id = "instructionsOverlay";
  instructionsOverlay.style.position = "fixed";
  instructionsOverlay.style.top = "50%";
  instructionsOverlay.style.left = "50%";
  instructionsOverlay.style.transform = "translate(-50%, -50%)";
  instructionsOverlay.style.color = "white";
  instructionsOverlay.style.textAlign = "center";
  instructionsOverlay.style.fontSize = "24px";
  instructionsOverlay.style.fontFamily = "Arial, sans-serif";
  instructionsOverlay.style.zIndex = "10000";
  instructionsOverlay.style.opacity = "0";
  instructionsOverlay.style.transition = "opacity 0.5s ease";
  instructionsOverlay.innerHTML = `
        <h2>Press arrow keys, space, enter, or press A/B on a gamepad to join</h2>
        <p>WASD/Arrows: Move</p>
        <p>Space/Enter: Reveal cell</p>
        <p>F: Place flag</p>
    `;
  document.body.appendChild(instructionsOverlay);
}

export function fade() {
  if (fadeOverlay) fadeOverlay.style.opacity = "1";
}

export function unfade() {
  if (fadeOverlay) fadeOverlay.style.opacity = "0";
  updateJoinInstructions();
}

// Check for players and show/hide instructions
export function updateJoinInstructions() {
  const playerCount = Object.keys(players).length;

  if (playerCount === 0) {
    // No players, show the fade and instructions
    if (fadeOverlay) fadeOverlay.style.opacity = "0.8";
    if (instructionsOverlay) instructionsOverlay.style.opacity = "1";
  } else {
    // Players exist, hide the fade and instructions
    if (fadeOverlay) fadeOverlay.style.opacity = "0";
    if (instructionsOverlay) instructionsOverlay.style.opacity = "0";
  }
}

// Setup UI components
export function initUI() {
  // disable right click
  globalThis.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

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
    debugButton.textContent = `Debug: ${gameState.debugMode ? "ON" : "OFF"}`;
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

  // Initial check for players
  updateJoinInstructions();
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

export function toggleUI() {
  const ui = document.getElementById("ui");
  if (ui) {
    ui.classList.toggle("visible");

    // If UI is now visible, show player info
    if (ui.classList.contains("visible")) {
      updatePlayerInfo();
    }
  }
}

// Create and update player info display
export function updatePlayerInfo() {
  // Get or create player info container
  let playerInfo = document.getElementById("playerInfo");
  if (!playerInfo) {
    playerInfo = document.createElement("div");
    playerInfo.id = "playerInfo";
    playerInfo.style.position = "absolute";
    playerInfo.style.top = "10px";
    playerInfo.style.right = "10px";
    playerInfo.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    playerInfo.style.color = "white";
    playerInfo.style.padding = "10px";
    playerInfo.style.borderRadius = "5px";
    playerInfo.style.fontFamily = "monospace";
    playerInfo.style.zIndex = "10000";
    document.body.appendChild(playerInfo);
  }

  // Generate player list with colored squares
  const playerList = Object.values(players).map((player) => {
    if (player.disabled) return "";

    const colorHex = "#" + player.color.toString(16).padStart(6, "0");
    return `
            <div style="margin-bottom: 5px; display: flex; align-items: center;">
                <span style="display: inline-block; width: 15px; height: 15px; background-color: ${colorHex}; margin-right: 8px;"></span>
                <span>${player.name}: (${Math.floor(player.x)}, ${
      Math.floor(player.z)
    })</span>
            </div>
        `;
  }).join("");

  playerInfo.innerHTML = `<h3 style="margin-top: 0;">Players</h3>${
    playerList || "<div>No active players</div>"
  }`;
}
