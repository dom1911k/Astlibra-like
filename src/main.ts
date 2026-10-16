import '@fontsource/cinzel/700.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/700.css';
import { Game } from './game';
import { ArenaScene } from './scenes/arena';
import { ExpeditionScene } from './scenes/expedition';
import { HubScene } from './scenes/hub';
import { TitleScene } from './scenes/title';

// warm up the bundled fonts so canvas text uses them from the first frame they are ready
void document.fonts?.load('700 20px Cinzel');
void document.fonts?.load('16px "Source Sans 3"');
void document.fonts?.load('bold 16px "Source Sans 3"');

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
game.setScene(new TitleScene(game));
game.start();
// exposed for automated smoke tests / debugging from the console
(window as any).__game = game;
(window as any).__scenes = { ArenaScene, ExpeditionScene, HubScene, TitleScene };
