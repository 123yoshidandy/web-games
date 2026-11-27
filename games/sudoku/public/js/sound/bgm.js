/**
 * 数独の BGM：数字のワルツ（ヘ長調・3拍子）
 * 選んだわけ：数字を1つずつ当てはめていく、規則正しい手順の遊びなので、1・2・3 と数える3拍子にした。考えるのを邪魔しないよう、街角の楽団のような軽いミュゼット風
 * ピアノの主題に、1拍目のベースと 2・3拍目のアコーディオンの刻み。A' はオルゴールが答え、B は弦を敷いて少し高く。2周目は A・B にも合いの手を足す。休憩の C はドラムと刻みを抜く
 */
(function () {
    const { repeat } = Sound;

    const HEAD = 'C5:4 F5:4 A5:4 | A5:6 G5:2 F5:4 | G5:4 A#5:4 D6:4 | C6:8 A#5:4 | A5:4 C6:4 A5:4 | G5:6 E5:2 C5:4';
    const THEME = `${HEAD} | D5:4 F5:4 A#5:4 | G5:8 r:4`;
    const THEME_END = `${HEAD} | A#5:6 E5:6 | F5:8 r:4`;
    // オルゴールの合いの手（メロディが伸ばしている小節の 3拍目に答える）
    const ANSWER_A = 'r:12 | r:8 C6:4 | r:12 | r:8 E6:4 | r:12 | r:8 E6:4 | r:12 | r:8 E6:4';
    const ANSWER_A2 = 'r:12 | r:8 C6:4 | r:12 | r:8 E6:4 | r:12 | r:8 E6:4 | r:12 | r:8 C6:4';
    const ANSWER_B = 'r:12 | r:8 E6:4 | r:12 | r:8 D6:4 | r:12 | r:8 E6:4 | r:12 | r:8 E6:4';
    const BRIDGE = 'F5:4 A5:4 D6:4 | C6:8 G5:4 | E5:4 A5:4 C6:4 | A5:8 F5:4 | D5:4 G5:4 A#5:4 | C6:6 A5:2 G5:4 | F5:4 D5:4 F5:4 | E5:8 G5:4';
    const REST = 'A5:12 | F5:6 D5:6 | C5:12 | E5:6 G5:6 | F5:12 | D6:6 A5:6 | A#5:6 G5:6 | E5:6 G5:6';

    const CHORDS_A = 'F | Dm7 | Gm7 | C7 | F | Am7 | A# | C7';
    const CHORDS_A2 = 'F | Dm7 | Gm7 | C7 | F | Am7 | Gm7:6 C7:6 | F';
    const CHORDS_B = 'A#maj7 | C | Am7 | Dm7 | Gm7 | Am7 | A# | C7';
    const CHORDS_C = 'Dm7 | A#maj7 | F | C | Dm7 | A#maj7 | Gm7 | C7';

    // 1拍目にベース、2・3拍目に和音（ワルツの刻み）
    const BASS = 'R:4 r:8';
    const OOMPAH = '....x---x---';
    const DRUMS = {
        kick: repeat('x...........', 8, '|'),
        hat: repeat('....o...o...', 8, '|')
    };

    const numberWaltz = {
        title: '数字のワルツ',
        tags: ['軽快', 'おしゃれ'],
        genre: 'ワルツ',
        melody: ['lead'],
        stepsPerBar: 12,
        bpm: 120,
        gain: 0.097,
        swing: 0,
        reverb: { seconds: 1.8, tone: 0.55 },
        delay: { time: 0.75, feedback: 0.15, tone: 2400, reverb: 0.2 },
        humanize: { time: 0.006, velocity: 0.07 },
        parts: {
            lead: { instrument: 'piano', volume: 0.55, pan: -0.05, reverb: 0.22, delay: 0.08 },
            answer: { instrument: 'musicBox', volume: 0.3, pan: 0.3, reverb: 0.35, delay: 0.15 },
            comp: { instrument: 'accordion', mode: 'chords', center: 'C4', voices: 3, volume: 1.1, pan: 0.2, gate: 0.7, reverb: 0.2 },
            strings: { instrument: 'strings', mode: 'chords', center: 'D4', voices: 3, volume: 0.3, pan: -0.2, attack: 0.5, release: 0.8, reverb: 0.45 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, volume: 1.3, gate: 0.8 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.8, cutoff: 6000, levels: { kick: 0.4, hat: 0.3 } }
        },
        sections: {
            // イントロ：刻みとベースだけで4小節。C7 で主題へ
            intro: { label: 'イントロ', chords: 'F | Dm7 | Gm7 | C7', comp: OOMPAH, bass: BASS },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, comp: OOMPAH, bass: BASS, drums: DRUMS },
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_END, answer: ANSWER_A2, comp: OOMPAH, bass: BASS, drums: DRUMS },
            B: { label: 'B', chords: CHORDS_B, lead: BRIDGE, comp: OOMPAH, strings: 'hold', bass: BASS, drums: DRUMS },
            // 2周目：A に合いの手と弦、B に合いの手を足す
            A3: { label: 'A（2回目）', chords: CHORDS_A, lead: THEME, answer: ANSWER_A, comp: OOMPAH, strings: 'hold', bass: BASS, drums: DRUMS },
            B2: { label: 'B（2回目）', chords: CHORDS_B, lead: BRIDGE, answer: ANSWER_B, comp: OOMPAH, strings: 'hold', bass: BASS, drums: DRUMS },
            // 休憩：ドラムと刻みを抜き、弦を伸ばす
            C: { label: 'C', chords: CHORDS_C, lead: REST, strings: 'hold', bass: 'R:12' }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A3', 'A2', 'B2', 'C']
    };

    Sound.register('sudoku', { songs: { numberWaltz } });
})();
