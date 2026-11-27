/**
 * カックロの BGM：和の小道（ホ短調・ゆっくりと）
 * 選んだわけ：和の組み合わせを頭の中で足し引きしながら、マスを一つずつ埋めていく遊びなので、ゆっくり跳ねるローファイの刻みで、計算の邪魔をしない曲にした
 * カリンバの主題に、ビブラフォンの和音とシンセのベース、軽く跳ねるドラム。A' はベルが合いの手、B はパッドを敷いて明るい長調の和音へ、休憩の C はドラムを抜く
 */
(function () {
    const { repeat } = Sound;

    const HEAD = 'B4:4 E5:2 F#5:2 G5:8 | E5:4 G5:4 B5:8 | C6:4 B5:2 A5:2 E5:8 | F#5:8 D#5:4 F#5:4 | B4:4 E5:2 F#5:2 G5:4 B5:4 | C6:4 B5:4 G5:8';
    const THEME = `${HEAD} | A5:4 G5:4 E5:4 C5:4 | D#5:8 r:8`;
    const THEME_END = `${HEAD} | A5:4 C6:4 B5:4 A5:4 | G5:4 E5:12`;
    // ベルの合いの手（主題が伸ばしているところで短く答える）
    const ANSWER = 'r:12 B5:4 | r:16 | r:12 E6:4 | r:16 | r:12 B5:4 | r:16 | r:16 | r:8 B5:8';
    const BRIDGE = 'G5:4 E5:4 B5:8 | A5:4 F#5:4 D6:8 | D6:4 B5:4 F#5:8 | G5:4 F#5:4 E5:8 | C6:4 A5:4 E5:8 | F#5:4 A5:4 D6:8 | B5:4 D6:4 F#5:8 | D#5:8 F#5:8';
    const REST = 'E5:16 | F#5:8 D5:8 | G5:16 | F#5:8 B4:8 | C5:8 E5:8 | D5:8 F#5:8 | E5:8 G5:8 | F#5:8 D#5:8';

    const CHORDS_A = 'Em7 | Cmaj7 | Am7 | B7sus4:8 B7:8 | Em7 | Cmaj7 | Am7 | B7';
    const CHORDS_A2 = 'Em7 | Cmaj7 | Am7 | B7sus4:8 B7:8 | Em7 | Cmaj7 | Am7:8 B7:8 | Em7';
    const CHORDS_B = 'Cmaj7 | D | Bm7 | Em7 | Am7 | D | Gmaj7 | B7';
    const CHORDS_C = 'Am7 | Bm7 | Cmaj7 | Bm7 | Am7 | Bm7 | Cmaj7 | B7sus4:8 B7:8';

    const KEYS = 'x-------x---x---';
    const BASS = 'R:8 r:4 5:4';
    const DRUMS = {
        kick: repeat('x.....x...x.....', 8, '|'),
        snare: repeat('....x.......x...', 8, '|'),
        hat: repeat('x.o.x.o.x.o.x.o.', 8, '|')
    };
    const DRUMS_INTRO = { hat: repeat('x.o.x.o.x.o.x.o.', 4, '|') };

    const sumTrail = {
        title: '和の小道',
        tags: ['落ち着いた', 'おしゃれ'],
        genre: 'ローファイ',
        melody: ['lead'],
        bpm: 84,
        gain: 0.095,
        swing: 0.12,
        swingUnit: 2,
        reverb: { seconds: 2.2, tone: 0.45 },
        delay: { time: 0.75, feedback: 0.2, tone: 2000, reverb: 0.25 },
        humanize: { time: 0.008, velocity: 0.08 },
        parts: {
            lead: { instrument: 'kalimba', volume: 0.7, pan: -0.05, reverb: 0.25, delay: 0.12 },
            answer: { instrument: 'bell', volume: 0.35, pan: 0.3, reverb: 0.35, delay: 0.15 },
            keys: { instrument: 'vibes', mode: 'chords', center: 'D4', voices: 4, volume: 0.32, pan: 0.2, reverb: 0.3 },
            pad: { instrument: 'pad', mode: 'chords', center: 'B3', voices: 3, volume: 0.3, pan: -0.1, reverb: 0.4 },
            bass: { instrument: 'synthBass', mode: 'bass', octave: 2, volume: 0.6, gate: 0.85 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.85, cutoff: 5000, levels: { kick: 0.45, snare: 0.3, hat: 0.3 } }
        },
        sections: {
            // イントロ：和音とベースと、ハイハットだけで4小節。B7 で主題へ
            intro: { label: 'イントロ', chords: 'Em7 | Cmaj7 | Am7 | B7', keys: KEYS, bass: BASS, drums: DRUMS_INTRO },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, keys: KEYS, bass: BASS, drums: DRUMS },
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_END, answer: ANSWER, keys: KEYS, bass: BASS, drums: DRUMS },
            B: { label: 'B', chords: CHORDS_B, lead: BRIDGE, keys: KEYS, pad: 'hold', bass: BASS, drums: DRUMS },
            // 休憩：ドラムを抜き、パッドとベースを伸ばす
            C: { label: 'C', chords: CHORDS_C, lead: REST, keys: 'x---------------', pad: 'hold', bass: 'R:16' }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C']
    };

    Sound.register('kakuro', { songs: { sumTrail } });
})();
