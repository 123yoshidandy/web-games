import path from 'node:path';
import { describePwa } from 'test-kit/pwa.js';
import { testPrecache } from 'puzzle-kit/testing.js';

describePwa(path.join(import.meta.dirname, '..', 'public'), { css: ['css/style.css', 'css/theme.css'] });
testPrecache(path.join(import.meta.dirname, '..'));
