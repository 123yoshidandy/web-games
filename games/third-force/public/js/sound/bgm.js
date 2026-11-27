/**
 * 3rd Force の BGM：前線の行進曲（ヘ長調・きびきびした行進曲）
 * 選んだわけ：兵器が左右から行進してぶつかり合うゲームなので、小太鼓とブラスの行進曲
 * 低音が「ブン・チャッ」と2拍で刻み、ブラスが小節の頭で吹く。主題はピアノ
 * A' はベルが答え、B は弦を敷いて高く上がる。休憩の C は小太鼓を抜き、長い音でゆったり歌う
 */
(function () {
    const { repeat } = Sound;

    // A の主題（前半6小節は A' と最後の A でも同じ）
    const THEME_HEAD = `C5:4 F5:4 A5:6 G5:2 | F5:4 C5:4 A4:8 | A#4:4 C5:4 E5:4 G5:4 | A5:8 F5:8 |
                        D5:4 F5:4 A#5:6 A5:2 | A5:4 G5:2 F5:2 C5:8`;
    const THEME = `${THEME_HEAD} | G5:4 E5:4 C5:4 A#4:4 | F5:12 r:4`;
    // A' の終わり：C7 に止まって、B の Bb へ
    const THEME_TURN = `${THEME_HEAD} | G5:4 A#5:4 A5:4 G5:4 | E5:8 C5:4 G5:4`;
    // ループの終わり：C7 で止めて、頭の F へ戻る
    const THEME_LAST = `${THEME_HEAD} | G5:4 E5:4 C5:4 A#4:4 | C5:8 E5:4 G5:4`;

    const CHORDS_A = 'F | F | C7 | F | A# | F | C7 | F';
    const CHORDS_TURN = 'F | F | C7 | F | A# | F | C7 | C7';

    // A' のベル：主題が伸ばしている所に答える
    const BELL = 'r:16 | r:8 F6:4 C6:4 | r:16 | r:8 C6:4 A5:4 | r:16 | r:8 F6:4 C6:4 | r:16 | r:16';

    // ブン・チャッ（低音は2拍で根音と5度、エレピは裏拍）
    const BASS = 'R:4 5:4 R:4 5:4';
    const OFFBEAT = '....x-......x-..';
    const BRASS_BAR = 'x-----..........';
    const BRASS_TURN = 'x--.x--.x-------';
    const BRASS_A = repeat(BRASS_BAR, 7, '|') + '|' + BRASS_TURN;

    const MARCH = { kick: 'x.......x.......', snare: '....x..x....x.xx', hat: 'x.x.x.x.x.x.x.x.' };
    const MARCH_FILL = {
        kick: repeat('x.......x.......', 8, '|'),
        snare: repeat('....x..x....x.xx', 7, '|') + '|x.x.x.x.xxxxxxxx',
        hat: repeat('x.x.x.x.x.x.x.x.', 8, '|')
    };
    const CRASH = 'x...............|' + repeat('................', 7, '|');

    const march = {
        title: '前線の行進曲',
        tags: ['明るい', '軽快'],
        genre: 'ゲーム音楽',
        melody: ['lead'],
        bpm: 116,
        gain: 0.1,
        reverb: { seconds: 2.0, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.18, tone: 2200, reverb: 0.2 },
        humanize: { time: 0.004, velocity: 0.06 },
        parts: {
            lead: { instrument: 'piano', volume: 0.6, pan: -0.08, decay: 0.8, brightness: 0.85, reverb: 0.22, delay: 0.06 },
            bell: { instrument: 'bell', volume: 0.28, pan: 0.35, reverb: 0.4, delay: 0.2 },
            flute: { instrument: 'flute', volume: 0.5, pan: 0.2, vibrato: 10, breath: 0.04, reverb: 0.35, delay: 0.15 },
            keys: { instrument: 'epiano', mode: 'chords', center: 'A4', voices: 3, volume: 0.6, pan: 0.2, reverb: 0.2 },
            brass: { instrument: 'brass', mode: 'chords', center: 'F4', voices: 3, volume: 0.45, pan: -0.2, brightness: 3.2, release: 0.12, reverb: 0.3 },
            strings: { instrument: 'strings', mode: 'chords', center: 'C4', voices: 3, volume: 0.32, pan: -0.25, attack: 0.4, release: 0.7, brightness: 0.75, vibrato: 8, reverb: 0.45 },
            bass: { instrument: 'synthBass', mode: 'bass', octave: 2, wave: 'triangle', cutoff: 320, envelope: 0.5, decay: 0.5, sustain: 0.4, release: 0.12, volume: 0.55, gate: 0.6 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.9, cutoff: 7000, levels: { kick: 0.5, snare: 0.45, hat: 0.3, crash: 0.35 } }
        },
        sections: {
            // イントロ：小太鼓の連打とブラスで始め、C7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'F | A# | F | C7',
                brass: 'x--.x-x-x-------|x--.x-x-x-------|x--.x-x-x-------|x-------x--.x---',
                bass: BASS,
                drums: {
                    crash: 'x...............|................|x...............|................',
                    snare: 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.|x.x.x.x.xxxxxxxx',
                    kick: repeat('x.......x.......', 4, '|')
                }
            },
            A: {
                chords: CHORDS_A,
                lead: THEME,
                keys: OFFBEAT,
                bass: BASS,
                drums: { ...MARCH, crash: CRASH }
            },
            // A'：ベルが答え、ブラスが小節の頭で吹く。C7 で B へ
            A2: {
                label: "A'",
                chords: CHORDS_TURN,
                lead: THEME_TURN,
                bell: BELL,
                keys: OFFBEAT,
                brass: BRASS_A,
                bass: BASS,
                drums: MARCH_FILL
            },
            // B：Bb から高く上がる。弦を敷く
            B: {
                chords: 'A# | F/A | Gm7 | C7 | A# | F/A | Gm7:8 C7:8 | F',
                lead: `D6:6 C6:2 A#5:8 | A5:6 G5:2 F5:8 | G5:4 A#5:4 D6:8 | C6:8 A#5:4 G5:4 |
                       D6:6 C6:2 A#5:4 F5:4 | A5:4 C6:4 A5:8 | G5:4 A#5:4 E5:4 G5:4 | F5:12 r:4`,
                keys: OFFBEAT,
                strings: 'hold',
                brass: BRASS_A,
                bass: BASS,
                drums: { ...MARCH_FILL, crash: CRASH }
            },
            // 休憩：小太鼓とピアノを抜き、フルートが長い音で歌う
            C: {
                chords: 'Dm | A# | F | C | Dm | A# | Gm7 | C7',
                flute: 'A5:16 | F5:16 | A5:8 C6:8 | G5:16 | F5:16 | D5:16 | A#4:16 | C5:8 E5:8',
                strings: 'hold',
                bass: 'R:8 5:8',
                drums: { kick: repeat('x...............', 7, '|') + '|x.......x.x.x.x.' }
            },
            // 最後の A：ブラスと弦を足して、C7 で頭の F へ戻る
            A3: {
                label: 'A',
                chords: CHORDS_TURN,
                lead: THEME_LAST,
                keys: OFFBEAT,
                brass: BRASS_A,
                strings: 'hold',
                bass: BASS,
                drums: MARCH_FILL
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A', 'A3']
    };

    Sound.register('third-force', { songs: { march } });
})();
