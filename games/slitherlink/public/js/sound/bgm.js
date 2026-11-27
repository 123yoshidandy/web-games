/**
 * スリザーリンクの BGM：夜の散歩（イ短調・ゆったりと）
 * 選んだわけ：点から点へ線をたどって、1つの輪に閉じていくパズルなので、夜道を歩くような、静かで少し跳ねる曲にした
 * ビブラフォンの主題に、エレピの刻みとはじく弦のベース。B は弦を足し、A' はカリンバの合いの手を足し、休憩の C はドラムを抜いてパッドを敷く
 */
(function () {
    const { repeat } = Sound;

    const HEAD = 'E5:4 G5:4 A5:6 G5:2 | F5:8 r:4 D5:4 | B4:4 D5:4 F5:6 E5:2 | E5:12 r:4 | A5:4 C6:4 A5:4 F5:4 | D5:6 E5:2 F5:8';
    const THEME = `${HEAD} | E5:4 A5:4 B5:8 | G#5:12 r:4`;
    const THEME_END = `${HEAD} | F5:4 D5:4 E5:4 G#5:4 | A5:12 r:4`;
    const BRIDGE = 'C6:6 A5:2 F5:8 | B5:6 G5:2 D5:8 | G5:6 B5:2 E5:8 | A5:6 C6:2 E5:8 | F5:4 A5:4 C6:8 | B5:4 D6:4 G5:8 | G5:4 E5:4 G5:8 | G#5:6 B5:2 D6:8';
    const REST = 'r:8 A5:8 | G5:16 | r:8 F5:8 | E5:16 | r:8 C6:8 | B5:16 | r:8 A5:8 | G#5:16';
    const COUNTER = 'r:16 | r:8 A5:4 C6:4 | r:16 | r:4 G5:4 C6:8 | r:16 | r:8 A5:8 | r:16 | r:4 C6:4 E6:8';

    const CHORDS_A = 'Am7 | Dm7 | G7 | Cmaj7 | F | Dm7 | Esus4 | E7';
    const CHORDS_A2 = 'Am7 | Dm7 | G7 | Cmaj7 | F | Dm7 | Dm7:8 E7:8 | Am7';
    const CHORDS_B = 'F | G | Em7 | Am7 | Dm7 | G | Cmaj7 | E7';
    const CHORDS_C = 'Fmaj7 | Em7 | Dm7 | Cmaj7 | Fmaj7 | Em7 | Dm7 | E7';

    const KEYS = 'x-----x---x-----';
    const BASS = 'R:6 R:2 r:2 5:2 R:4';
    const DRUMS = {
        kick: repeat('x.....x...x.....', 8, '|'),
        snare: repeat('....o.......o...', 8, '|'),
        hat: repeat('x.o.x.o.x.o.x.o.', 8, '|')
    };

    const nightwalk = {
        title: '夜の散歩',
        tags: ['落ち着いた', 'おしゃれ'],
        genre: 'ローファイ',
        melody: ['lead'],
        bpm: 88,
        gain: 0.12,
        swing: 0.1,
        swingUnit: 2,
        reverb: { seconds: 2.6, tone: 0.45 },
        delay: { time: 0.75, feedback: 0.22, tone: 2000, reverb: 0.3 },
        humanize: { time: 0.006, velocity: 0.07 },
        parts: {
            lead: { instrument: 'vibes', volume: 0.62, pan: -0.05, reverb: 0.28, delay: 0.12 },
            keys: { instrument: 'epiano', mode: 'chords', center: 'D4', voices: 3, volume: 0.45, pan: 0.2, reverb: 0.25 },
            counter: { instrument: 'kalimba', volume: 0.35, pan: 0.3, reverb: 0.3, delay: 0.15 },
            strings: { instrument: 'strings', mode: 'chords', center: 'C4', voices: 3, volume: 0.3, pan: -0.25, attack: 0.6, release: 0.9, reverb: 0.45 },
            pad: { instrument: 'pad', mode: 'chords', center: 'A3', voices: 3, volume: 0.25, pan: 0.1, reverb: 0.4 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, brightness: 0.25, volume: 0.7, gate: 0.8 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.85, cutoff: 5500, levels: { kick: 0.45, snare: 0.28, hat: 0.28 } }
        },
        sections: {
            // イントロ：エレピとベースだけで4小節。E7 で主題へ
            intro: { label: 'イントロ', chords: 'Am7 | Fmaj7 | Dm7 | E7', keys: KEYS, bass: BASS },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, keys: KEYS, bass: BASS, drums: DRUMS },
            B: { label: 'B', chords: CHORDS_B, lead: BRIDGE, keys: KEYS, bass: BASS, drums: DRUMS, strings: 'hold' },
            // A'：カリンバの合いの手を足し、Am7 で落ち着く
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_END, counter: COUNTER, keys: KEYS, bass: BASS, drums: DRUMS },
            // 休憩：ドラムとエレピを抜き、パッドと弦をゆっくり。E7 でループの頭へ
            C: { label: 'C', chords: CHORDS_C, lead: REST, strings: 'hold', pad: 'hold', bass: 'R:16' }
        },
        intro: ['intro'],
        loop: ['A', 'B', 'A2', 'C']
    };

    Sound.register('slitherlink', { songs: { nightwalk } });
})();
