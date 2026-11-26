import { describe, expect, it } from 'vitest';
import { loadEngine } from '../tools/lint-songs.mjs';
import { fakeContext } from './fake-audio.js';

const sandbox = {};
const Sound = loadEngine([], sandbox);

describe('楽器', () => {
    it.each(Sound.instruments.filter(name => name !== 'drums'))('%s を鳴らせる', (instrument) => {
        const context = fakeContext();
        // 効果音の形で、高い音・低い音・和音・滑らせる音を鳴らす
        const effect = [{ instrument, notes: 'C3:4 C6:4 [E4,G4]:8 C5~G5:4', unit: 0.1 }];
        expect(() => runEffect(context, effect)).not.toThrow();
        expect(context.counts.oscillators + context.counts.sources).toBeGreaterThan(0);
    });

    it.each(Object.entries(Sound.drumKits).flatMap(([kit, drums]) => drums.map(drum => [kit, drum])))('ドラム %s の %s を鳴らせる', (kit, drum) => {
        const context = fakeContext();
        expect(() => runEffect(context, [{ instrument: { instrument: 'drums', kit }, notes: `${drum}:1` }])).not.toThrow();
    });
});

// renderEffect は OfflineAudioContext を使うので、偽の context で同じ処理を通す
function runEffect(context, effect) {
    sandbox.OfflineAudioContext = function () { return Object.assign(context, { startRendering: () => Promise.resolve(null), destination: {} }); };
    try {
        Sound.renderEffect(effect);
    } finally {
        delete sandbox.OfflineAudioContext;
    }
}
