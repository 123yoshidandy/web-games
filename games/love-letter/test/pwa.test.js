import path from 'node:path';
import { describePwa } from 'test-kit/pwa.js';

describePwa(path.join(import.meta.dirname, '..', 'public'));
