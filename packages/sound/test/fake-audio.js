// Web Audio のノードの形だけをまねた、音を出さない AudioContext（呼び出しの書き間違いを見つけるため）
export function fakeContext() {
    const param = () => ({
        value: 0,
        setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
        setTargetAtTime() {}, cancelScheduledValues() {}
    });
    const node = (extra = {}) => ({
        connect(target) { return target; },
        disconnect() {},
        ...extra
    });
    const source = (extra = {}) => node({ start() {}, stop() {}, ...extra });
    const counts = { oscillators: 0, sources: 0 };
    const filters = []; // 作ったフィルター（種類と周波数を確かめるため）
    const context = {
        sampleRate: 48000,
        currentTime: 0,
        counts,
        filters,
        createOscillator: () => { counts.oscillators++; return source({ type: 'sine', frequency: param(), detune: param(), setPeriodicWave() {} }); },
        createGain: () => node({ gain: param() }),
        createBiquadFilter: () => { const filter = node({ type: 'lowpass', frequency: param(), Q: param(), gain: param() }); filters.push(filter); return filter; },
        createBufferSource: () => { counts.sources++; return source({ buffer: null, loop: false, playbackRate: param() }); },
        createBuffer: (channels, length) => {
            const data = Array.from({ length: channels }, () => new Float32Array(length));
            return { duration: length / 48000, getChannelData: (c) => data[c] };
        },
        createPeriodicWave: () => ({}),
        createDelay: () => node({ delayTime: param() }),
        createStereoPanner: () => node({ pan: param() }),
        createChannelMerger: () => node(),
        createConvolver: () => node({ buffer: null }),
        createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() })
    };
    return context;
}
