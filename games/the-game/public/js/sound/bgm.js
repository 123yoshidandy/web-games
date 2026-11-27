/**
 * ザ・ゲームの BGM：夜更けのカードテーブル（ジャズ・ニ短調で、落ち着いて、少し張りつめて）
 * 選んだわけ：数字を口にできないまま、仲間と目配せでカードを出し合う。夜のテーブルの静かな緊張に、小さなジャズのコンボ
 * エレピが和音を刻み、ピアノが歌い、はじく弦のベースとブラシのような柔らかいドラムが支える。8分の裏を少し跳ねる
 * A' はベルが合いの手を入れ、B は Bbmaj7 から上がって A7 で戻る。休憩の C はピアノとドラムを抜き、弦がゆっくり歌う
 */
(function () {
    const { repeat } = Sound;

    // A の主題：Dm7 から Gm7・C7 と下りて、A7 で戻る
    const CHORDS_A = 'Dm7 | Gm7 | C7 | Fmaj7 | Bbmaj7 | Em7b5 | A7sus4:8 A7:8 | Dm7';
    const THEME = `A4:4 C5:2 D5:2 F5:6 E5:2 | D5:4 F5:4 Bb4:6 A4:2 | C5:2 E5:2 G5:4 Bb5:4 G5:4 | A5:6 G5:2 E5:4 C5:4 |
                   D5:4 F5:4 A5:6 G5:2 | G5:4 Bb5:4 D6:4 C6:4 | D5:4 E5:4 C#5:4 E5:4 | D5:12 r:4`;
    // A' でベルが答える（ピアノが伸ばしているところ）
    const BELL = 'r:12 A5:4 | r:16 | r:12 G5:4 | r:16 | r:12 A5:4 | r:16 | r:16 | r:8 F5:4 A5:4';

    // B：Bbmaj7 から上がっていき、A7 で次へ
    const CHORDS_B = 'Bbmaj7 | C7 | Am7 | Dm7 | Gm7 | C7 | Fmaj7 | A7';
    const SONG_B = `F5:4 A5:4 D6:8 | C6:6 Bb5:2 G5:8 | E5:4 G5:4 C6:8 | A5:6 G5:2 F5:8 |
                    Bb5:4 D6:4 F5:8 | E5:4 G5:4 Bb5:8 | A5:6 C6:2 A5:8 | G5:4 E5:4 C#5:8`;

    // 休憩：弦が全音符で歌う
    const STRINGS_C = 'A5:16 | Bb5:16 | G5:16 | A5:16 | F5:16 | G5:16 | E5:16 | F5:16';

    // エレピの刻み（2拍目の裏と4拍目）とベース
    const COMP = 'x-----x---x-----';
    const BASS = 'R:4 r:2 5:2 R:4 5:4';

    const KICK = repeat('x.......x.......', 8, '|');
    const SNARE = repeat('....x.......x...', 8, '|');
    const HAT = repeat('x.x.x.x.x.x.x.x.', 8, '|');
    const DRUMS = { kick: KICK, snare: SNARE, hat: HAT };
    // 最後の小節でスネアを細かくして、次の区間へ
    const DRUMS_FILL = { kick: KICK, hat: HAT, snare: repeat('....x.......x...', 7, '|') + '|....x.....x.x.xx' };

    const jazz = {
        title: '夜更けのカードテーブル',
        tags: ['落ち着いた', '緊張感'],
        genre: 'ジャズ',
        melody: ['lead'],
        bpm: 92,
        gain: 0.121,
        swing: 0.12,
        swingUnit: 2,
        reverb: { seconds: 2.2, tone: 0.45 },
        delay: { time: 0.75, feedback: 0.22, tone: 2200, reverb: 0.2 },
        humanize: { time: 0.006, velocity: 0.08 },
        parts: {
            lead: { instrument: 'piano', volume: 0.5, pan: -0.08, decay: 0.9, brightness: 0.8, reverb: 0.22, delay: 0.1 },
            bell: { instrument: 'bell', volume: 0.32, pan: 0.3, reverb: 0.35, delay: 0.25 },
            strings: { instrument: 'strings', volume: 0.9, pan: 0.2, attack: 0.25, release: 0.6, brightness: 0.7, vibrato: 8, reverb: 0.4 },
            keys: { instrument: 'epiano', mode: 'chords', center: 'E4', voices: 4, volume: 0.36, pan: 0.18, gate: 0.8, reverb: 0.2 },
            pad: { instrument: 'pad', mode: 'chords', center: 'D4', voices: 3, volume: 0.22, cutoff: 1100, pan: -0.2, reverb: 0.45 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, brightness: 0.35, sustain: 0.994, release: 0.08, volume: 0.9, gate: 0.8 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.6, cutoff: 7000, levels: { kick: 0.55, snare: 0.35, hat: 0.3 } }
        },
        sections: {
            // イントロ：エレピとベースだけで、A7 で止める
            intro: {
                label: 'イントロ',
                chords: 'Dm7 | Gm7 | Em7b5 | A7',
                keys: COMP,
                bass: 'R:8 5:8'
            },
            A: {
                chords: CHORDS_A,
                lead: THEME,
                keys: COMP,
                bass: BASS,
                drums: DRUMS
            },
            // A'：ベルが合いの手を入れる
            A2: {
                label: "A'",
                chords: CHORDS_A,
                lead: THEME,
                bell: BELL,
                keys: COMP,
                bass: BASS,
                drums: DRUMS_FILL
            },
            // B：Bbmaj7 から上がる。パッドを敷いて少し厚く
            B: {
                chords: CHORDS_B,
                lead: SONG_B,
                keys: COMP,
                pad: 'hold',
                bass: BASS,
                drums: DRUMS_FILL
            },
            // 休憩：ピアノとドラムを抜き、弦が歌う。エレピは全音符で
            C: {
                chords: CHORDS_A,
                strings: STRINGS_C,
                keys: 'x---------------',
                pad: 'hold',
                bass: 'R:16'
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C']
    };

    Sound.register('the-game', { songs: { jazz } });
})();
