/**
 * ナンバーリンクの BGM：糸つむぎ（ヘ長調・軽快に）
 * 選んだわけ：数字から数字へ線を1本ずつ引いていく遊びなので、糸をたぐるような、まっすぐ進む軽い曲にした
 * ビブラフォンの主題に、はじく弦の分散和音とシンセベース。B は和音を下へたどって少し高く、休憩の C はドラムを抜いてパッドを敷く
 */
(function () {
    const { repeat } = Sound;

    const HEAD = 'C5:4 A4:2 C5:2 F5:6 E5:2 | D5:4 F5:4 A5:8 | G5:2 F5:2 D5:4 F5:8 | E5:4 G5:4 C5:8 | C5:4 A4:2 C5:2 F5:6 G5:2 | A5:4 G5:4 E5:8';
    const THEME = `${HEAD} | D5:4 F5:4 Bb5:4 A5:4 | G5:12 r:4`;
    const THEME_END = `${HEAD} | D5:4 F5:4 G5:4 E5:4 | F5:12 r:4`;
    const BRIDGE = 'F5:4 D5:4 F5:8 | E5:4 G5:4 C6:8 | C6:4 A5:4 E5:8 | F5:4 A5:4 D6:8 | D6:4 Bb5:4 G5:8 | A5:2 G5:2 E5:4 C5:8 | E5:4 C5:4 F5:4 A5:4 | Bb5:4 G5:4 E5:8';
    const REST = 'r:8 A5:8 | F5:16 | r:8 C6:8 | A5:8 F5:8 | r:8 D6:8 | Bb5:8 G5:8 | F5:16 | E5:8 G5:4 r:4';

    const CHORDS_A = 'F | Dm7 | Bbmaj7 | C | F | Am7 | Bbmaj7 | C7';
    const CHORDS_A2 = 'F | Dm7 | Bbmaj7 | C | F | Am7 | Gm7:8 C7:8 | F';
    const CHORDS_B = 'Bbmaj7 | C | Am7 | Dm7 | Gm7 | C | Am7:8 Dm7:8 | Gm7:8 C7:8';
    const CHORDS_C = 'Fmaj7 | Bbmaj7 | Fmaj7 | Bbmaj7 | Dm7 | Gm7 | Bbmaj7 | C7';

    const ARP = '0:2 1 2 3 2 1 2 1';
    const BASS = 'R:4 r:2 R:2 5:4 R:4';
    const DRUMS = {
        kick: repeat('x.....x...x.....', 8, '|'),
        snare: repeat('....x.......x...', 8, '|'),
        hat: repeat('x.x.x.x.x.x.x.x.', 8, '|')
    };
    const DRUMS_FILL = {
        kick: repeat('x.....x...x.....', 8, '|'),
        snare: repeat('....x.......x...', 7, '|') + '|....x.......x.xx',
        hat: repeat('x.x.x.x.x.x.x.x.', 8, '|')
    };

    const threads = {
        title: '糸つむぎ',
        tags: ['軽快'],
        genre: 'ポップ',
        melody: ['lead'],
        bpm: 108,
        gain: 0.1,
        reverb: { seconds: 1.8, tone: 0.55 },
        delay: { time: 0.75, feedback: 0.2, tone: 2400, reverb: 0.25 },
        humanize: { time: 0.004, velocity: 0.06 },
        parts: {
            lead: { instrument: 'vibes', volume: 0.65, pan: 0.05, reverb: 0.22, delay: 0.1 },
            arp: { instrument: 'pluck', mode: 'arp', from: 'C4', volume: 0.6, pan: -0.25, reverb: 0.2 },
            pad: { instrument: 'pad', mode: 'chords', center: 'A3', voices: 3, volume: 0.3, pan: 0.15, reverb: 0.4 },
            bass: { instrument: 'synthBass', mode: 'bass', octave: 2, volume: 0.55, gate: 0.8 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.9, cutoff: 6000, levels: { kick: 0.4, snare: 0.28, hat: 0.3 } }
        },
        sections: {
            // イントロ：分散和音とベースだけで4小節。C7 で主題へ
            intro: { label: 'イントロ', chords: 'F | Dm7 | Bbmaj7 | C7', arp: ARP, bass: BASS },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, arp: ARP, bass: BASS, drums: DRUMS },
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_END, arp: ARP, bass: BASS, drums: DRUMS_FILL, pad: 'hold' },
            B: { label: 'B', chords: CHORDS_B, lead: BRIDGE, arp: '0:4 2 1 3', bass: BASS, drums: DRUMS, pad: 'hold' },
            // 休憩：ドラムを抜き、パッドと遅い分散和音
            C: { label: 'C', chords: CHORDS_C, lead: REST, arp: '0:8 2', pad: 'hold', bass: 'R:16' }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C']
    };

    Sound.register('numberlink', { songs: { threads } });
})();
