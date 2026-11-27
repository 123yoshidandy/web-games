/**
 * ラッキーナンバーの BGM：四つ葉の野原（ヘ長調・のどかに）
 * 選んだわけ：クローバーの庭に数のタイルを並べていく、のんびりした運だめしのゲームなので、野原を歩くような素朴な曲にした
 * フルートの主題に、ギターの刻みとはじく弦のベース、ブラシのドラムが軽く添う。A' でハープの分散和音とブラシのスネアが入り、終わりを Gm7・C7 にする
 * B は変ロ長調の和音から開いて、ストリングスを敷く。休憩の C はドラムを抜き、フルートが長い音でゆっくり歌う
 */
(function () {
    const { repeat } = Sound;

    // 主題（前半6小節は A' でも同じ）
    const THEME_HEAD = `C5:4 F5:4 A5:6 G5:2 | F5:4 D5:4 A5:8 | Bb5:4 A5:2 G5:2 F5:4 D5:4 | E5:4 G5:4 C6:6 r:2 |
                        A5:4 C6:4 A5:2 G5:2 F5:4 | E5:4 G5:4 C6:8`;
    const THEME = `${THEME_HEAD} | D6:4 C6:2 Bb5:2 F5:8 | G5:4 E5:4 C5:8`;
    // A' の終わり：Gm7・C7 で B へ
    const THEME_TURN = `${THEME_HEAD} | D6:4 Bb5:4 G5:4 F5:4 | E5:4 G5:4 C6:4 Bb5:4`;

    // B：変ロ長調の和音から開き、C7 で休憩へ
    const SONG_B = `D6:6 C6:2 A5:8 | G5:6 E5:2 C6:8 | C6:4 A5:4 E5:8 | F5:4 A5:4 D6:8 |
                    Bb5:6 A5:2 G5:8 | E5:4 G5:4 C6:8 | A5:4 C6:4 E6:4 C6:4 | Bb5:8 G5:8`;
    // 休憩の C：長い音でゆっくり
    const REST = 'A5:16 | F5:16 | A5:8 C6:8 | G5:16 | F5:8 A5:8 | D6:16 | Bb5:8 G5:8 | E5:8 G5:8';

    const CHORDS_A = 'F | Dm7 | Bb | C | F | Am7 | Bb | C7';
    const CHORDS_A2 = 'F | Dm7 | Bb | C | F | Am7 | Gm7 | C7';
    const CHORDS_B = 'Bbmaj7 | C | Am7 | Dm7 | Gm7 | C | Fmaj7 | C7';
    const CHORDS_C = 'Dm7 | Bbmaj7 | F | C | Dm7 | Bbmaj7 | Gm7 | C7';

    const STRUM = 'x---x-x-x---x-x-';
    const BASS = 'R:4 r:2 5:2 R:4 5:4';
    const DRUMS_A = {
        kick: repeat('x.......x.......', 8, '|'),
        hat: repeat('x.o.x.o.x.o.x.o.', 8, '|')
    };
    const DRUMS = { ...DRUMS_A, swish: repeat('....x.......x...', 8, '|') };

    const meadow = {
        title: '四つ葉の野原',
        tags: ['明るい', '落ち着いた'],
        genre: 'ワールド',
        melody: ['lead'],
        bpm: 96,
        gain: 0.086,
        reverb: { seconds: 2.4, tone: 0.45 },
        delay: { time: 0.75, feedback: 0.2, tone: 2000, reverb: 0.25 },
        humanize: { time: 0.008, velocity: 0.08 },
        parts: {
            lead: { instrument: 'flute', volume: 0.65, pan: -0.05, reverb: 0.3, delay: 0.12 },
            guitar: { instrument: 'guitar', mode: 'chords', center: 'A3', voices: 4, strum: 0.012, volume: 0.45, pan: 0.2, reverb: 0.2 },
            harp: { instrument: 'pluck', brightness: 0.75, mode: 'arp', from: 'F4', volume: 0.5, pan: -0.25, reverb: 0.3 },
            strings: { instrument: 'strings', mode: 'chords', center: 'C4', voices: 3, volume: 0.35, pan: 0.1, reverb: 0.4 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, volume: 1 },
            drums: { instrument: 'drums', kit: 'brush', mode: 'drums', volume: 1.2, cutoff: 5000, levels: { kick: 0.45, swish: 0.5, hat: 0.4 } }
        },
        sections: {
            // イントロ：ギターとベースだけで4小節。C7 で主題へ
            intro: { label: 'イントロ', chords: 'F | Bbmaj7 | Gm7 | C7', guitar: STRUM, bass: BASS },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, guitar: STRUM, bass: BASS, drums: DRUMS_A },
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_TURN, guitar: STRUM, harp: '0:2 1 2 3 2 1 2 1', bass: BASS, drums: DRUMS },
            B: { label: 'B', chords: CHORDS_B, lead: SONG_B, guitar: STRUM, strings: 'hold', bass: BASS, drums: DRUMS },
            // 休憩：ドラムとギターを抜き、ハープとストリングスで伸ばす
            C: { label: 'C', chords: CHORDS_C, lead: REST, harp: '0:4 1 2 1', strings: 'hold', bass: 'R:16' }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A2']
    };

    Sound.register('lucky-numbers', { songs: { meadow } });
})();
