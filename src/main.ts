import { Game } from "./game/Game";

const host = document.getElementById("game");
if (!host) throw new Error("#game missing");

try {
  const game = new Game(host);
  game.startLoop();
} catch (error) {
  // Most likely WebGL is unavailable (very old device or disabled GPU).
  console.error(error);
  const message = document.createElement("div");
  message.className = "panel";
  message.innerHTML =
    '<div class="dialog"><h1>Oops</h1><p class="note">This device or browser could not start 3D graphics (WebGL). ' +
    "Try an up-to-date Chrome, Safari, Edge or Firefox.</p></div>";
  document.body.appendChild(message);
}
