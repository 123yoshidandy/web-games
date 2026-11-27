/**
 * スピリット・アイランドの BGM：島の精霊（ニ短調。マリンバの分散和音の上で、ピアノが息の長い旋律を歌う）
 * 選んだわけ：侵略者に抗う島の、静かで少し神秘的な空気。考えながら長く聞いても疲れないよう、ドラムは手で叩く程度に抑える
 * A は主題、A' でベルが答え、B で平行調のヘ長調へ明るく開き、休憩の C でフルートとパッドだけに静まる
 * ループの最後（C の終わり）は A7 にして、頭の Dm へ戻る
 */
(function () {
    const CHORDS_A = 'Dm | Bb | F | C | Dm | Bb | Gm7 | A7sus4:8 A7:8';
    const THEME = `A4:4 D5:4 F5:4 E5:2 D5:2 | D5:6 C5:2 Bb4:4 D5:4 | C5:4 F5:4 A5:6 G5:2 | G5:8 E5:4 C5:4 |
                   A4:4 D5:4 F5:4 A5:4 | Bb5:6 A5:2 F5:4 D5:4 | G5:4 F5:4 D5:4 Bb4:4 | E5:8 C#5:4 E5:4`;
    // A' のベル：主題が伸ばす所に、短く答える
    const BELL = 'r:12 F6:4 | r:16 | r:12 C6:4 | r:16 | r:12 A5:4 | r:16 | r:12 D6:4 | r:16';
    const CHORDS_B = 'F | C/E | Dm | Bb | F | C | Bb | A7';
    const SONG_B = `C6:6 A5:2 F5:4 A5:4 | G5:8 E5:4 G5:4 | F5:6 E5:2 D5:4 F5:4 | D5:12 r:4 |
                    A5:4 C6:4 A5:4 G5:4 | G5:6 F5:2 E5:4 C5:4 | D5:4 F5:4 Bb5:4 G5:4 | A5:8 E5:4 C#5:4`;
    const CHORDS_C = 'Dm | Dm | Bb | Bb | Gm | Gm | A7sus4 | A7';
    const FLUTE_C = 'A5:16 | F5:16 | D5:16 | F5:8 E5:8 | D5:16 | G5:16 | E5:16 | C#5:8 E5:8';
    const ARP = '0:2 1 2 3 2 1 2 1';
    const BASS = 'R:4 r:2 R:2 5:4 R:4';
    const DRUMS = { kick: 'x.......x.....x.', snare: '....o.......o...', hat: 'x.o.x.o.x.o.x.o.' };

    const island = {
        title: '島の精霊',
        tags: ['神秘的', '落ち着いた'],
        genre: 'ワールド',
        melody: ['lead'],
        bpm: 92,
        gain: 0.09,
        reverb: { seconds: 2.6, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.2, tone: 2200, reverb: 0.25 },
        humanize: { time: 0.005, velocity: 0.07 },
        parts: {
            lead: { instrument: 'piano', volume: 0.62, pan: -0.06, reverb: 0.28, delay: 0.1 },
            bell: { instrument: 'bell', volume: 0.32, pan: 0.3, reverb: 0.4, delay: 0.2 },
            flute: { instrument: 'flute', volume: 0.42, pan: 0.15, vibrato: 8, breath: 0.04, reverb: 0.4, delay: 0.15 },
            comp: { instrument: 'marimba', mode: 'arp', from: 'D4', volume: 0.42, pan: 0.18, reverb: 0.25 },
            pad: { instrument: 'pad', mode: 'chords', center: 'F4', voices: 3, volume: 0.28, pan: -0.15, reverb: 0.5 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, brightness: 0.3, volume: 0.7, gate: 0.6 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.4, cutoff: 6000, levels: { hat: 0.35, snare: 0.5 } }
        },
        sections: {
            // イントロ：マリンバとベースだけ。A7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'Dm | Bb | Gm7 | A7',
                comp: ARP,
                bass: 'R:16'
            },
            A: { chords: CHORDS_A, lead: THEME, comp: ARP, bass: BASS, drums: DRUMS },
            // A'：ベルが答え、パッドを薄く敷く
            A2: { label: "A'", chords: CHORDS_A, lead: THEME, bell: BELL, comp: ARP, pad: 'hold', bass: BASS, drums: DRUMS },
            // B：ヘ長調へ開く。A7 で休憩へ
            B: { chords: CHORDS_B, lead: SONG_B, comp: ARP, pad: 'hold', bass: BASS, drums: DRUMS },
            // 休憩：ドラムとピアノを抜き、フルートとパッドだけ。A7 で頭の Dm へ
            C: { chords: CHORDS_C, flute: FLUTE_C, comp: '0:4 1 2 1', pad: 'hold', bass: 'R:16' }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C']
    };

    Sound.register('spirit-island', { songs: { island } });
})();
