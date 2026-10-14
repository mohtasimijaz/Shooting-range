import { Game } from "./game/Game";

const host = document.getElementById("game");
if (!host) throw new Error("#game missing");

const game = new Game(host);
game.startLoop();
