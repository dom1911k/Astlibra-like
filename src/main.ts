import { Game } from './game';
import { ArenaScene } from './scenes/arena';
import { ExpeditionScene } from './scenes/expedition';
import { HubScene } from './scenes/hub';
import { TitleScene } from './scenes/title';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
game.setScene(new TitleScene(game));
game.start();
// exposed for automated smoke tests / debugging from the console
(window as any).__game = game;
(window as any).__scenes = { ArenaScene, ExpeditionScene, HubScene, TitleScene };
