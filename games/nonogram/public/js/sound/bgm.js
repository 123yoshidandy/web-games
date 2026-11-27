/**
 * お絵かきロジックの BGM：スケッチブック（ト長調・ゆったりと）
 * 選んだわけ：方眼を1マスずつ塗って絵を浮かび上がらせる手作業なので、考えるのを邪魔しない、鉛筆の音のような軽い曲にした
 * ピアノの主題に、エレピの刻みとブラシのドラム。B はマリンバの分散和音で少し上へ、休憩の C はドラムを抜いて弦とパッドを敷く
 */
(function () {
    const { repeat } = Sound;

    const HEAD = 'B4:4 D5:4 G5:6 F#5:2 | F#5:4 D5:4 B4:8 | E5:4 D5:2 E5:2 G5:8 | F#5:8 r:4 A4:4 | B4:4 E5:4 G5:6 F#5:2 | E5:4 C5:4 A4:8';
    const THEME = `${HEAD} | G5:4 E5:4 C5:4 E5:4 | D5:12 r:4`;
    const THEME_END = `${HEAD} | C5:4 E5:4 F#5:4 A5:4 | G5:12 r:4`;
    const BRIDGE = 'E5:4 G5:4 B5:6 A5:2 | A5:8 F#5:8 | D5:4 F#5:4 A5:6 B5:2 | G5:12 r:4 | C5:4 E5:4 A5:6 G5:2 | F#5:8 D5:8 | E5:4 G5:4 C6:6 B5:2 | A5:8 F#5:4 D5:4';
    const REST = 'r:8 B5:8 | G5:16 | r:8 D6:8 | B5:8 G5:8 | r:8 C6:8 | B5:8 A5:8 | G5:16 | F#5:8 E5:4 D5:4';

    const CHORDS_A = 'G | Bm7 | Cmaj7 | D | Em7 | Am7 | C | D7';
    const CHORDS_A2 = 'G | Bm7 | Cmaj7 | D | Em7 | Am7 | Am7:8 D7:8 | G';
    const CHORDS_B = 'Cmaj7 | D | Bm7 | Em7 | Am7 | Bm7 | Cmaj7 | D7';
    const CHORDS_C = 'Gmaj7 | Cmaj7 | Gmaj7 | Cmaj7 | Am7 | Bm7 | Cmaj7 | D7';

    const KEYS = 'x---x-x-----x---';
    const BASS = 'R:6 5:2 R:8';
    const DRUMS = {
        kick: repeat('x.......x.......', 8, '|'),
        snare: repeat('....o.......o...', 8, '|'),
        hat: repeat('x.o.x.o.x.o.x.o.', 8, '|')
    };
    const DRUMS_FILL = {
        kick: repeat('x.......x.......', 8, '|'),
        snare: repeat('....o.......o...', 7, '|') + '|....o.......o.oo',
        hat: repeat('x.o.x.o.x.o.x.o.', 8, '|')
    };

    const sketchbook = {
        title: 'スケッチブック',
        tags: ['落ち着いた'],
        genre: 'カフェ',
        melody: ['lead'],
        bpm: 96,
        gain: 0.102,
        swing: 0.06,
        swingUnit: 2,
        reverb: { seconds: 2, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.18, tone: 2200, reverb: 0.25 },
        humanize: { time: 0.005, velocity: 0.06 },
        parts: {
            lead: { instrument: 'piano', volume: 0.6, pan: -0.05, reverb: 0.22, delay: 0.08 },
            keys: { instrument: 'epiano', mode: 'chords', center: 'D4', voices: 3, volume: 0.45, pan: 0.2, reverb: 0.25 },
            arp: { instrument: 'marimba', mode: 'arp', from: 'B3', volume: 0.3, pan: 0.25, reverb: 0.25 },
            strings: { instrument: 'strings', mode: 'chords', center: 'D4', voices: 3, volume: 0.32, pan: -0.2, attack: 0.5, release: 0.8, reverb: 0.45 },
            pad: { instrument: 'pad', mode: 'chords', center: 'B3', voices: 3, volume: 0.3, pan: 0.1, reverb: 0.4 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, volume: 1.1, gate: 0.85 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.9, cutoff: 6000, levels: { kick: 0.4, snare: 0.3, hat: 0.35 } }
        },
        sections: {
            // イントロ：エレピとベースだけで4小節。D7 で主題へ
            intro: { label: 'イントロ', chords: 'G | Em7 | Cmaj7 | D7', keys: KEYS, bass: BASS },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, keys: KEYS, bass: BASS, drums: DRUMS },
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_END, keys: KEYS, bass: BASS, drums: DRUMS_FILL, strings: 'hold' },
            B: { label: 'B', chords: CHORDS_B, lead: BRIDGE, arp: '0:2 1 2 1 3 1 2 1', bass: BASS, drums: DRUMS },
            // 休憩：ドラムを抜き、弦とパッドをゆっくり
            C: { label: 'C', chords: CHORDS_C, lead: REST, strings: 'hold', pad: 'hold', bass: 'R:16' }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C']
    };

    Sound.register('nonogram', { songs: { sketchbook } });
})();
