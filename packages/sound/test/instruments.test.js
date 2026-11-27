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

describe('耳につく高域をなだめる', () => {
    const lowpasses = (context) => context.filters.filter(f => f.type === 'lowpass').map(f => Math.round(f.frequency.value));

    it('チップは、音の高さに合わせたローパスで丸める（1800〜3500Hz）', () => {
        const context = fakeContext();
        runEffect(context, [{ instrument: 'chip', notes: 'C3:1 C5:1 C7:1', unit: 0.1 }]);
        expect(lowpasses(context)).toEqual([1800, 3140, 3500]);
    });

    it('チップは cutoff: 0 で丸めない（昔の音）', () => {
        const context = fakeContext();
        runEffect(context, [{ instrument: { instrument: 'chip', cutoff: 0 }, notes: 'C5:1', unit: 0.1 }]);
        expect(lowpasses(context)).toEqual([]);
    });

    it('曲の出口で高域を下げ、tone で変えたり外したりできる', () => {
        const shelves = (tone) => {
            const context = fakeContext();
            const song = { bpm: 100, tone, parts: { p: { instrument: 'piano' } }, sections: { A: { bars: 1, p: 'C5:4' } }, loop: ['A'] };
            run(context, () => Sound.renderSong(song));
            return context.filters.filter(f => f.type === 'highshelf').map(f => [f.frequency.value, f.gain.value]);
        };
        expect(shelves(undefined)).toEqual([[5000, -3]]);
        expect(shelves({ gain: -6 })).toEqual([[5000, -6]]);
        expect(shelves(false)).toEqual([]);
    });
});

// renderEffect・renderSong は OfflineAudioContext を使うので、偽の context で同じ処理を通す
function run(context, render) {
    sandbox.OfflineAudioContext = function () { return Object.assign(context, { startRendering: () => Promise.resolve(null), destination: {} }); };
    try {
        render();
    } finally {
        delete sandbox.OfflineAudioContext;
    }
}

function runEffect(context, effect) {
    run(context, () => Sound.renderEffect(effect));
}
