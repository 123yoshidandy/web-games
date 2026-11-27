/**
 * フラッシュポイントの BGM：残り火の中で（ニ短調・4拍子。急ぎ足の分散和音の上で、ピアノが前向きに歌う）
 * 選んだわけ：燃える家に飛び込む緊張と、仲間で助け出す前向きさ
 * A はピアノとマリンバだけ、A' で弦楽器を敷く、B で和音をヘ長調の方へ開き、休憩の C はベルとパッドだけ。B' でベルが答える
 */
(function () {
    // A の主題
    const THEME = `D5:4 F5:2 A5:2 G5:4 F5:4 | D5:6 F5:2 Bb5:8 | A5:4 C6:4 A5:2 G5:2 F5:4 | E5:8 G5:4 r:4 |
                   D5:4 F5:2 A5:2 D6:4 A5:4 | Bb5:6 G5:2 F5:8 | G5:4 Bb5:4 D6:4 Bb5:4 | A5:8 C#6:4 E5:4`;
    const CHORDS_A = 'Dm | Bb | F | C | Dm | Bb | Gm | A7';

    // B の主題：ヘ長調の方へ開き、A7 で頭の Dm へ戻る
    const SONG_B = `F5:4 D5:4 F5:4 Bb5:4 | C6:8 G5:8 | A5:4 E5:4 A5:4 C6:4 | D6:12 r:4 |
                    D6:4 Bb5:4 G5:4 Bb5:4 | C6:6 G5:2 E5:8 | A5:4 F5:4 C6:8 | C#6:8 A5:4 E5:4`;
    const CHORDS_B = 'Bb | C | Am | Dm | Gm | C | F | A7';

    // 休憩のベル：伸ばした音で、主題の和音をなぞる
    const BELL_C = 'A5:16 | F5:16 | A5:16 | G5:16 | F5:16 | D5:16 | D5:16 | E5:16';

    const ARP = '0:2 1 2 1 3 1 2 1';
    const BASS = 'R:4 r:2 R:2 5:4 R:4';
    const KICK = 'x.......x.x.....';
    const SNARE = '....x.......x...';
    const HAT = 'x.x.x.x.x.x.x.x.';

    const ember = {
        title: '残り火の中で',
        tags: ['緊張感', '明るい'],
        genre: 'ポップ',
        melody: ['lead'],
        bpm: 112,
        gain: 0.094,
        reverb: { seconds: 1.8, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.18, tone: 2200, reverb: 0.2 },
        humanize: { time: 0.004, velocity: 0.06 },
        parts: {
            lead: { instrument: 'piano', volume: 0.55, pan: -0.06, decay: 1, brightness: 0.8, reverb: 0.22, delay: 0.08 },
            comp: { instrument: 'marimba', mode: 'arp', from: 'D4', volume: 0.3, pan: 0.2, reverb: 0.18 },
            strings: { instrument: 'strings', mode: 'chords', center: 'F4', voices: 3, volume: 0.28, pan: -0.2, attack: 0.3, release: 0.5, reverb: 0.4 },
            bell: { instrument: 'bell', volume: 0.3, pan: 0.15, reverb: 0.4, delay: 0.15 },
            pad: { instrument: 'pad', mode: 'chords', center: 'E4', voices: 3, volume: 0.22, reverb: 0.4 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, brightness: 0.3, sustain: 0.994, release: 0.08, volume: 0.6, gate: 0.6 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.6, cutoff: 6500, levels: { hat: 0.5 } }
        },
        sections: {
            // イントロ：マリンバとドラムだけ。A7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'Dm | Dm | Bb | A7',
                comp: ARP,
                bass: BASS,
                drums: { kick: KICK, hat: HAT }
            },
            A: {
                chords: CHORDS_A,
                lead: THEME,
                comp: ARP,
                bass: BASS,
                drums: { kick: KICK, snare: SNARE, hat: HAT }
            },
            A2: {
                label: "A'",
                chords: CHORDS_A,
                lead: THEME,
                comp: ARP,
                strings: 'hold',
                bass: BASS,
                drums: { kick: KICK, snare: SNARE, hat: HAT }
            },
            B: {
                chords: CHORDS_B,
                lead: SONG_B,
                comp: ARP,
                strings: 'hold',
                bass: BASS,
                drums: { kick: KICK, snare: SNARE, hat: HAT }
            },
            // B'：ベルが、主題の伸ばす所に短く答える
            B2: {
                label: "B'",
                chords: CHORDS_B,
                lead: SONG_B,
                bell: 'r:16 | r:8 E6:8 | r:16 | r:12 A5:4 | r:16 | r:8 E6:8 | r:16 | r:8 E6:8',
                comp: ARP,
                strings: 'hold',
                bass: BASS,
                drums: { kick: KICK, snare: SNARE, hat: HAT }
            },
            // 休憩：ドラムとピアノを抜き、ベルとパッドで静かに。A7 で頭へ
            C: {
                chords: CHORDS_A,
                bell: BELL_C,
                pad: 'hold',
                comp: '0:4 1 2 1',
                bass: 'R:16'
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A2', 'B2']
    };

    Sound.register('flash-point', { songs: { ember } });
})();
