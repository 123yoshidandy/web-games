import { testOnline } from 'test-kit/online.js';
import { testRace } from 'puzzle-kit/testing.js';
import definition from '../server/src/game-definition.js';
import game from '../public/js/game.js';
import * as race from '../public/js/race.js';
import * as session from '../public/js/session.js';

// 手は定義の CPU（cpu.step が答えを送る）に選ばせる。全員が同時に解くので、どの席もいつでも打てる
testOnline({ definition });
testRace({ definition, type: game.type, race, session });
