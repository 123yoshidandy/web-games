/**
 * ホラーファイドの BGM：月夜のワルツ（ニ短調の3拍子。古い映画の怪奇もののような、少し不気味で品のあるワルツ）
 * 選んだわけ：霧の村を怪物がうろつく夜。怖がらせすぎず、考えながら長く聞ける落ち着いた暗さにする
 * 3拍子なので、1小節は12ステップ。ハープの分散和音とピアノの主題で始め、A' でベルが答え、
 * B でヘ長調の方へ明るくなって弦と合唱が支え、休憩の C でクラリネットだけが低く歌う
 */
(function () {
    const { repeat } = Sound;

    // A の主題（ニ短調）
    const THEME = `A5:6 F5:2 D5:4 | G5:6 A#5:2 D6:4 | E5:4 G5:4 C6:4 | A5:8 F5:4 |
                   D6:6 C6:2 A#5:4 | G5:6 A5:2 A#5:4 | A5:8 C#6:4 | E5:8 r:4`;
    const CHORDS_A = 'Dm | Gm | C | F | Bb | Gm | A7sus4:8 A7:4 | A7';

    // A' のベル：主題が伸ばす所に短く答える
    const BELL_A2 = 'r:8 D6:4 | r:8 G6:4 | r:8 E6:4 | r:8 C6:4 | r:8 F6:4 | r:8 D6:4 | r:8 E6:4 | r:8 C#6:4';

    // B の主題（ヘ長調の方へ。A7 で止めて次の区間の Dm へ）
    const SONG_B = `F5:6 D5:2 A#4:4 | C5:4 F5:4 A5:4 | A#5:8 G5:4 | A5:6 F5:2 D5:4 |
                    D6:4 C6:4 A#5:4 | G5:6 E5:2 C5:4 | E5:4 G5:4 C#6:4 | A5:12`;
    const CHORDS_B = 'Bb | F | Gm | Dm | Bb | C | A7 | A7';

    // 休憩：クラリネットだけが低く歌う
    const CLARINET_C = 'D4:12 | F4:12 | G4:12 | A#4:12 | D5:8 C5:4 | A#4:12 | A4:8 G4:4 | E4:12';
    const CHORDS_C = 'Dm | Dm | Gm | Gm | Bb | Bb | A7 | A7';

    const HARP = '0:2 1 2 3 2 1';
    const BASS = 'R:4 5:4 5:4';
    const DRUMS = { kick: repeat('x...........', 8, '|'), hat: repeat('....x...x...', 8, '|') };

    const waltz = {
        title: '月夜のワルツ',
        tags: ['神秘的', '落ち着いた'],
        genre: 'ワルツ',
        melody: ['lead'],
        bpm: 84,
        stepsPerBar: 12,
        gain: 0.124,
        reverb: { seconds: 2.8, tone: 0.42 },
        delay: { time: 0.75, feedback: 0.18, tone: 1800, reverb: 0.3 },
        humanize: { time: 0.005, velocity: 0.07 },
        parts: {
            lead: { instrument: 'piano', volume: 0.5, pan: -0.06, decay: 1.1, brightness: 0.75, reverb: 0.28, delay: 0.08 },
            bell: { instrument: 'bell', volume: 0.22, pan: 0.3, reverb: 0.4, delay: 0.2 },
            clarinet: { instrument: 'clarinet', volume: 0.5, pan: 0.1, attack: 0.1, release: 0.3, vibrato: 5, reverb: 0.35 },
            harp: { instrument: 'pluck', mode: 'arp', from: 'D4', brightness: 0.6, volume: 0.5, pan: 0.18, reverb: 0.3 },
            strings: { instrument: 'strings', mode: 'chords', center: 'D4', voices: 3, volume: 0.3, pan: -0.2, attack: 0.5, release: 0.7, brightness: 0.6, vibrato: 7, reverb: 0.45 },
            choir: { instrument: 'choir', mode: 'chords', center: 'F4', voices: 3, volume: 0.24, pan: 0.15, attack: 0.5, release: 0.8, reverb: 0.55 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, brightness: 0.3, sustain: 0.994, release: 0.08, volume: 0.8, gate: 0.5 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.6, cutoff: 5000, levels: { kick: 0.7, hat: 0.35 } }
        },
        sections: {
            // イントロ：ハープの分散和音とベースだけ。A7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'Dm | Gm | Dm | A7',
                harp: HARP,
                bass: BASS
            },
            A: {
                chords: CHORDS_A,
                lead: THEME,
                harp: HARP,
                bass: BASS,
                drums: DRUMS
            },
            // A'：ベルが答え、弦が薄く支える
            A2: {
                label: "A'",
                chords: CHORDS_A,
                lead: THEME,
                bell: BELL_A2,
                harp: HARP,
                strings: 'hold',
                bass: BASS,
                drums: DRUMS
            },
            // B：ヘ長調の方へ。弦と合唱が支える
            B: {
                chords: CHORDS_B,
                lead: SONG_B,
                harp: HARP,
                strings: 'hold',
                choir: 'hold',
                bass: BASS,
                drums: DRUMS
            },
            // B'：ベルを足して、もう一度
            B2: {
                label: "B'",
                chords: CHORDS_B,
                lead: SONG_B,
                bell: 'r:8 A6:4 | r:8 F6:4 | r:8 D6:4 | r:8 F6:4 | r:8 F6:4 | r:8 E6:4 | r:8 E6:4 | r:12',
                harp: HARP,
                strings: 'hold',
                choir: 'hold',
                bass: BASS,
                drums: DRUMS
            },
            // 休憩：ドラムを抜き、ハープをゆっくりにして、クラリネットだけが歌う。A7 で頭の Dm へ
            C: {
                chords: CHORDS_C,
                clarinet: CLARINET_C,
                harp: '0:4 1 2',
                bass: 'R:12'
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'B2', 'C']
    };

    Sound.register('horrified', { songs: { waltz } });
})();
