/**
 * リコシェロボットの BGM：跳ね返る歯車（ニ短調・116。軽快で少し緊張感のある、考えるための曲）
 * 選んだわけ：ロボットが壁で跳ね返るのを、マリンバの分散和音とピアノの短い動きで表し、砂時計に追われる感じを短調で少しだけ出す
 * A はピアノの主題、A' はベルが主題の伸ばしに答える。B は ヘ長調の方へ開き、パッドで厚くする
 * 休憩の C はピアノを抜き、ベルとパッドだけでゆっくり。最後の A' は A7 で頭の Dm7 へ戻る
 */
(function () {
    const { repeat } = Sound;

    // A の主題（前半7小節は A' でも同じ）。長い音は和音の音にする
    const THEME_HEAD = `A4:4 D5:2 F5:2 E5:2 D5:2 A4:4 | F5:6 D5:2 A5:8 | G5:4 F5:2 D5:2 Bb4:4 D5:4 | E5:6 D5:2 C#5:4 E5:4 |
                        A4:2 D5:2 F5:2 A5:2 C6:4 A5:4 | Bb5:6 A5:2 F5:4 D5:4 | D5:4 G5:4 E5:4 C5:4`;
    const THEME = `${THEME_HEAD} | F5:6 E5:2 C#5:4 A4:4`;
    // A' の終わり：A7 の根音へ上がって、B の Gm7 へ
    const THEME_TURN = `${THEME_HEAD} | F5:6 G5:2 A5:8`;
    // ループの終わり：A7 で止めて、頭の Dm7 へ
    const THEME_LAST = `${THEME_HEAD} | F5:6 E5:2 C#5:4 E5:4`;
    const CHORDS_A = 'Dm7 | Bbmaj7 | Gm7 | A7sus4:8 A7:8 | Dm7 | Bbmaj7 | Gm7:8 C7:8 | Fmaj7:8 A7:8';

    // A' のベル：主題が伸ばしている所に、短く答える
    const REPLY = `r:16 | r:8 C6:4 A5:4 | r:16 | r:8 G5:4 E5:4 | r:16 | r:8 F5:4 D5:4 | r:16 | r:16`;

    // B：ヘ長調の方へ開き、Em7b5・A7 でニ短調へ戻る
    const CHORDS_B = 'Gm7 | C7 | Fmaj7 | Bbmaj7 | Em7b5 | A7 | Dm7 | A7';
    const SONG_B = `D6:4 C6:2 Bb5:2 A5:4 G5:4 | G5:6 E5:2 C5:8 | A5:4 C6:4 E6:6 D6:2 | D6:8 F5:8 |
                    E5:4 G5:4 Bb5:6 A5:2 | A5:8 G5:4 E5:4 | F5:4 A5:4 D6:8 | C#6:6 A5:2 E5:4 G5:4`;

    // 休憩：ベルがひとりで、ゆっくり
    const CHORDS_C = 'Dm7 | Bbmaj7 | Gm7 | A7sus4 | Dm7 | Bbmaj7 | Gm7 | A7';
    const BELL_C = 'r:8 A5:8 | F5:16 | r:8 D5:8 | E5:16 | r:8 A5:8 | D6:16 | r:8 Bb5:8 | C#6:16';

    const ARP = '0:2 1 2 1 3 1 2 1';
    const BASS = 'R:4 r:2 R:2 5:4 R:4';
    const KICK = repeat('x.....x...x.....', 8, '|');
    const SNARE = repeat('....x.......x...', 8, '|');
    const HAT = repeat('x.x.x.x.x.x.x.x.', 8, '|');
    const DRUMS = { kick: KICK, hat: HAT };
    const DRUMS_FULL = { kick: KICK, snare: SNARE, hat: HAT };

    const ricochet = {
        title: '跳ね返る歯車',
        tags: ['軽快', '緊張感'],
        genre: 'エレクトロ',
        melody: ['lead'],
        bpm: 116,
        gain: 0.077,
        reverb: { seconds: 1.6, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.2, tone: 2200, reverb: 0.2 },
        humanize: { time: 0.005, velocity: 0.08 },
        parts: {
            lead: { instrument: 'piano', volume: 0.62, pan: -0.06, reverb: 0.2, delay: 0.1 },
            reply: { instrument: 'bell', volume: 0.32, pan: 0.3, reverb: 0.3, delay: 0.2 },
            bell: { instrument: 'bell', volume: 0.42, pan: 0.1, reverb: 0.35, delay: 0.25 },
            comp: { instrument: 'marimba', mode: 'arp', from: 'D4', volume: 0.42, pan: 0.22, reverb: 0.18 },
            pad: { instrument: 'pad', mode: 'chords', center: 'A3', voices: 4, volume: 0.28, pan: -0.1, reverb: 0.3 },
            bass: { instrument: 'synthBass', mode: 'bass', octave: 2, wave: 'triangle', cutoff: 340, envelope: 0.5, decay: 0.35, sustain: 0.5, release: 0.1, volume: 0.48, gate: 0.8 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.75, cutoff: 7000, levels: { kick: 0.5, snare: 0.35, hat: 0.28 } }
        },
        sections: {
            // イントロ：マリンバとハイハットから、ベースが入る。A7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'Dm7 | Bbmaj7 | Gm7 | A7',
                comp: ARP,
                bass: { pattern: `r:16 | ${BASS} | ${BASS} | ${BASS}` },
                drums: { hat: repeat('x.x.x.x.x.x.x.x.', 4, '|'), kick: '................|' + repeat('x.....x...x.....', 3, '|') }
            },
            A: { chords: CHORDS_A, lead: THEME, comp: ARP, bass: BASS, drums: DRUMS },
            // A'：スネアが入り、ベルが答える
            A2: { label: "A'", chords: CHORDS_A, lead: THEME_TURN, reply: REPLY, comp: ARP, bass: BASS, drums: DRUMS_FULL },
            // B：パッドで厚くする
            B: { chords: CHORDS_B, lead: SONG_B, comp: ARP, pad: 'hold', bass: BASS, drums: DRUMS_FULL },
            // 休憩：ピアノとドラムを抜き、ベルとパッドだけ。分散和音はゆっくり
            C: { chords: CHORDS_C, bell: BELL_C, pad: 'hold', comp: '0:4 1 2 1', bass: 'R:8 5:8' },
            // 最後の A'：ベルが答え、A7 で頭の Dm7 へ戻る
            A3: { label: "A'", chords: CHORDS_A, lead: THEME_LAST, reply: REPLY, comp: ARP, bass: BASS, drums: DRUMS_FULL }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A3']
    };

    Sound.register('ricochet-robots', { songs: { ricochet } });
})();
