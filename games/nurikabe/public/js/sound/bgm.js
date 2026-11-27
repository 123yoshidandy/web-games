/**
 * ぬりかべの BGM：石庭（ニ短調・ゆったりと）
 * 選んだわけ：壁を塗って島を浮かび上がらせる、白と黒の静かな遊びなので、砂紋と石の庭のような和の響きにした。考えを止めないよう、ゆっくりで音を少なく
 * フルートの主題に、琴のようなはじく弦の分散和音と、低いベース。A' は弦を敷き、B は明るい長調の和音へ、休憩の C はドラムを抜いて分散和音をゆっくりにする
 */
(function () {
    const { repeat } = Sound;

    const HEAD = 'A4:4 D5:4 F5:8 | G5:2 F5:2 D5:4 A5:8 | G5:4 C6:4 G5:8 | E5:4 G5:4 A5:8 | D6:4 C6:4 A5:8 | F5:4 A5:4 F5:4 D5:4';
    const THEME = `${HEAD} | D5:4 F5:4 G5:8 | E5:8 C#5:4 E5:4`;
    const THEME_END = `${HEAD} | D5:4 G5:4 E5:4 C#5:4 | D5:16`;
    const BRIDGE = 'C6:4 A5:4 F5:8 | E5:4 G5:4 C6:8 | D6:4 C6:4 A5:8 | C6:4 A5:4 E5:8 | D6:4 A5:4 F5:8 | C6:4 A5:4 C6:8 | A#5:4 G5:4 D5:8 | E5:8 G5:4 A5:4';
    const REST = 'A5:16 | E5:8 G5:8 | F5:16 | E5:8 C5:8 | D5:16 | F5:8 A5:8 | D6:16 | E5:8 C#5:8';

    const CHORDS_A = 'Dm7 | A#maj7 | C | Am7 | Dm7 | A#maj7 | Gm7 | A7sus4:8 A7:8';
    const CHORDS_A2 = 'Dm7 | A#maj7 | C | Am7 | Dm7 | A#maj7 | Gm7:8 A7:8 | Dm7';
    const CHORDS_B = 'F | C | Dm7 | Am7 | A#maj7 | F | Gm7 | A7';
    const CHORDS_C = 'Dm7 | Am7 | A#maj7 | Fmaj7 | Gm7 | Dm7 | A#maj7 | A7sus4:8 A7:8';

    const KOTO = '0:2 1 2 3 2 1 2 1';
    const KOTO_SLOW = '0:4 1 2 1';
    const BASS = 'R:8 5:8';
    const DRUMS = {
        kick: repeat('x.......x.......', 8, '|'),
        snare: repeat('............o...', 8, '|'),
        hat: repeat('x...x...x...x...', 8, '|')
    };

    const stoneGarden = {
        title: '石庭',
        tags: ['落ち着いた', '神秘的'],
        genre: '和風',
        melody: ['lead'],
        bpm: 76,
        gain: 0.092,
        swing: 0,
        reverb: { seconds: 2.6, tone: 0.45 },
        delay: { time: 0.75, feedback: 0.22, tone: 2000, reverb: 0.3 },
        humanize: { time: 0.008, velocity: 0.08 },
        parts: {
            lead: { instrument: 'flute', volume: 0.6, pan: -0.05, reverb: 0.3, delay: 0.12 },
            koto: { instrument: 'pluck', mode: 'arp', from: 'A3', brightness: 0.75, volume: 0.95, pan: 0.25, reverb: 0.3 },
            strings: { instrument: 'strings', mode: 'chords', center: 'D4', voices: 3, volume: 0.3, pan: -0.2, attack: 0.6, release: 0.9, reverb: 0.45 },
            pad: { instrument: 'pad', mode: 'chords', center: 'A3', voices: 3, volume: 0.3, pan: 0.1, reverb: 0.45 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, volume: 1.1, gate: 0.9 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.85, cutoff: 5000, levels: { kick: 0.4, snare: 0.25, hat: 0.25 } }
        },
        sections: {
            // イントロ：分散和音とベースだけで4小節。A7 で主題へ
            intro: { label: 'イントロ', chords: 'Dm7 | A#maj7 | Gm7 | A7', koto: KOTO, bass: BASS },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, koto: KOTO, bass: BASS, drums: DRUMS },
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_END, koto: KOTO, strings: 'hold', bass: BASS, drums: DRUMS },
            B: { label: 'B', chords: CHORDS_B, lead: BRIDGE, koto: KOTO, pad: 'hold', bass: BASS, drums: DRUMS },
            // 休憩：ドラムを抜き、分散和音をゆっくりにしてパッドを敷く
            C: { label: 'C', chords: CHORDS_C, lead: REST, koto: KOTO_SLOW, pad: 'hold', bass: 'R:16' }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C']
    };

    Sound.register('nurikabe', { songs: { stoneGarden } });
})();
