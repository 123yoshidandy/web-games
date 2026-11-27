/**
 * デューン 砂の惑星：インペリウムの BGM：砂の海と香料の風（ゲーム音楽・ニ短調の4拍子で、ゆっくり、神秘的に）
 * 選んだわけ：砂の惑星で勢力が駆け引きをするので、乾いた砂漠の広さと、静かな緊張
 * ピアノの主題は短調で上ってはため息をつき、はじく弦が8分で砂を刻む。パッドが熱い空気のように和音を敷く
 * B は変ロ長調の方へ開け、遠くに水を見るように明るくなる。休憩の C は弦が低く歌い、ドラムを抜く
 * 最後の A' はベルが主題に答え、A7 で頭の Dm へ戻る
 */
(function () {
    // A の主題（前半4小節は A' でも同じ）
    const THEME_HEAD = `D5:4 E5:2 F5:2 A5:8 | Bb5:4 A5:4 F5:4 D5:4 | G5:6 F5:2 E5:4 D5:4 | E5:8 C#5:8`;
    const THEME = `${THEME_HEAD} | F5:4 A5:4 D6:8 | C6:6 A5:2 F5:8 | G5:4 Bb5:4 D6:4 Bb5:4 | A5:16`;
    // A' の後半：A7 で次へ渡す
    const THEME_TURN = `${THEME_HEAD} | F5:4 A5:4 D6:8 | C6:6 A5:2 F5:8 | G5:4 Bb5:4 D6:4 Bb5:4 | A5:8 C#6:4 E5:4`;
    const CHORDS_A = 'Dm | Bb | Gm | A7 | Dm | F | Gm | A';
    const CHORDS_A2 = 'Dm | Bb | Gm | A7 | Dm | F | Gm | A7';
    // ベルの合いの手（主題が伸ばしているところに答える）
    const BELL = `r:8 A5:4 r:4 | r:16 | r:8 D6:4 r:4 | r:16 | r:8 F6:4 r:4 | r:16 | r:12 F6:4 | r:16`;

    // B：変ロ長調の方へ開ける。A7 で休憩へ
    const CHORDS_B = 'Bb | C | Am | Dm | Gm | C | F | A7';
    const SONG_B = `D6:4 C6:4 Bb5:8 | C6:4 E5:4 G5:8 | A5:4 C6:4 E5:8 | D5:8 F5:8 |
                    Bb5:4 A5:4 G5:8 | G5:4 E5:4 C5:8 | A5:6 F5:2 C6:8 | C#6:4 A5:4 E5:8`;

    // 休憩：弦が低くゆっくり歌う。A7 で最後の A' へ
    const CHORDS_C = 'Dm | Bb | Gm | A7 | Dm | Bb | Gm | A7';
    const SOLO_C = `A4:8 D5:8 | D5:8 F5:8 | D5:8 Bb4:8 | C#5:8 E5:8 |
                    A4:8 F5:8 | F5:8 D5:8 | Bb4:8 G4:8 | E5:8 C#5:8`;

    // はじく弦は8分の分散和音。休憩では4分にゆるめる
    const ARP = '0:2 1 2 1 3 1 2 1';
    const DRUMS = { kick: 'x.......x.......', snare: '............x...', hat: '..x...x...x...x.' };
    const DRUMS_B = { kick: 'x.....x.x.......', snare: '....x.......x...', hat: '..x...x...x...xx' };

    const sands = {
        title: '砂の海と香料の風',
        tags: ['神秘的', '緊張感'],
        genre: 'ゲーム音楽',
        melody: ['lead'],
        bpm: 90,
        gain: 0.13,
        reverb: { seconds: 3.2, tone: 0.4 },
        delay: { time: 0.75, feedback: 0.28, tone: 1800, reverb: 0.35 },
        humanize: { time: 0.01, velocity: 0.1 },
        parts: {
            lead: { instrument: 'piano', volume: 0.55, pan: -0.08, decay: 0.9, brightness: 0.65, reverb: 0.32, delay: 0.12 },
            // 休憩の C で歌う弦
            solo: { instrument: 'strings', volume: 1.0, pan: 0.15, attack: 0.35, release: 0.7, brightness: 0.6, vibrato: 8, reverb: 0.4 },
            // 最後の A' で答えるベル
            bell: { instrument: 'bell', volume: 0.22, pan: 0.3, reverb: 0.4, delay: 0.2 },
            harp: { instrument: 'pluck', mode: 'arp', from: 'D4', volume: 0.4, pan: 0.22, brightness: 0.45, reverb: 0.25 },
            // 熱い空気のつもり：低めのパッド
            pad: { instrument: 'pad', mode: 'chords', center: 'D4', voices: 3, volume: 0.22, cutoff: 800, attack: 1.4, release: 2, pan: -0.15, reverb: 0.5 },
            bass: { instrument: 'synthBass', mode: 'bass', octave: 2, wave: 'triangle', cutoff: 240, envelope: 0.4, decay: 0.8, sustain: 0.6, release: 0.5, volume: 0.3, gate: 0.95 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.3, levels: { hat: 0.35, snare: 0.5 } }
        },
        sections: {
            // イントロ：パッドとはじく弦から、A7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'Dm | Bb | Gm | A7',
                harp: ARP,
                pad: 'hold',
                bass: 'R:16'
            },
            A: {
                chords: CHORDS_A,
                lead: THEME,
                harp: ARP,
                bass: 'R:8 5:8',
                drums: DRUMS
            },
            // A'：パッドが和音を敷き、A7 で B へ
            A2: {
                label: "A'",
                chords: CHORDS_A2,
                lead: THEME_TURN,
                harp: ARP,
                pad: 'hold',
                bass: 'R:8 5:8',
                drums: DRUMS
            },
            // B：変ロ長調の方へ開ける。ドラムが少し動く
            B: {
                chords: CHORDS_B,
                lead: SONG_B,
                harp: ARP,
                pad: 'hold',
                bass: 'R:6 R:2 5:8',
                drums: DRUMS_B
            },
            // 休憩：ピアノとドラムを抜き、弦が低く歌う。はじく弦は4分
            C: {
                chords: CHORDS_C,
                solo: SOLO_C,
                harp: '0:4 1 2 1',
                pad: 'hold',
                bass: 'R:16'
            },
            // 最後の A'：ベルが主題に答え、A7 で頭の Dm へ戻る
            A3: {
                label: "A'",
                chords: CHORDS_A2,
                lead: THEME_TURN,
                bell: BELL,
                harp: ARP,
                pad: 'hold',
                bass: 'R:8 5:8',
                drums: DRUMS
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A3']
    };

    Sound.register('dune-imperium', { songs: { sands } });
})();
