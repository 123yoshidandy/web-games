import { describe } from 'vitest';
import { testReplay } from 'puzzle-kit/testing.js';
import * as session from '../public/js/session.js';
import * as puzzleSet from '../public/js/puzzle-set.js';

// 1人用の遊びは、操作を applyCommand に通して記録し、replay(setup, commands) で同じ局面に戻す（「続きから」もこれ）
describe('記録からの再現', () => {
    testReplay({ session, puzzleSet });
});
