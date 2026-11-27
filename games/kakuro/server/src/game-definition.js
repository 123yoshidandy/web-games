/**
 * カックロのオンライン対戦（早解きレース）の定義（netplay-kit）
 * 中身は puzzle-kit の共通の定義（public/js/race-definition.js）で、このゲームの種類（public/js/game.js）の問題を N 問、全員で解く
 */

import { GameError } from 'netplay-kit/server/room-service.js';
import { createRaceDefinition } from '../../public/js/race-definition.js';

export default createRaceDefinition({ GameError });
