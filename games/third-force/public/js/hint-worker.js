// ヒントと「試す」を画面の外で回す Web Worker（重い計算で画面を止めない）
import { suggest, trial } from './cpu-suggest.js';

self.addEventListener('message', (event) => {
    const { id, type, tactic, opponent, seeds } = event.data ?? {};
    try {
        const result = type === 'suggest' ? suggest(tactic, opponent) : trial(tactic, opponent, seeds);
        self.postMessage({ id, result });
    } catch (error) {
        self.postMessage({ id, error: String(error.message ?? error) });
    }
});
