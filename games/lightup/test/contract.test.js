// パズルの種類の共通の決まり（puzzle-kit の registry.js の先頭のコメント）を確かめる
import { testPuzzleType } from 'puzzle-kit/testing.js';
import game from '../public/js/game.js';

testPuzzleType(game.type);
