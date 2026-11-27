/**
 * SET の BGM：クイック・アイ（ニ短調の軽いポップス。目を走らせながら聞ける、前へ進む拍）
 * 選んだわけ：速さを競うゲームなので、テンポはやや速め（120）。ただし考える邪魔をしないよう、16分で動くパートは置かず、8分の刻みでまとめる
 * マリンバの分散和音とシンセのベースが土台を作り、ピアノの主題が拍の頭を休んで跳ねる。A' でベルが伸ばしに答える
 * B はヘ長調へ明るく開き、エレピが和音を置く。休憩の C はピアノとスネアを抜き、ベルがゆっくり歌う。最後の A' は A7 で頭の Dm7 へ戻る
 */
(function () {
    const { repeat } = Sound;

    // A の主題（前半7小節は A' でも同じ）。拍の頭を休み、長い音は和音の音にする
    const THEME_HEAD = `r:2 A5:2 F5:2 A5:2 D6:6 C6:2 | Bb5:4 A5:2 G5:2 D5:8 |
                        r:2 E5:2 G5:2 Bb5:2 C6:6 Bb5:2 | A5:4 G5:2 F5:2 C5:8 |
                        r:2 D5:2 F5:2 A5:2 D6:6 C6:2 | Bb5:4 A5:2 G5:2 E5:8 |
                        r:2 C#5:2 E5:2 G5:2 A5:4 G5:2 E5:2`;
    const THEME = `${THEME_HEAD} | F5:4 D5:4 E5:4 r:4`;
    // A' の終わり：C7 で、B の Fmaj7 へ
    const THEME_TURN = `${THEME_HEAD} | F5:4 D5:4 E5:4 G5:4`;
    // ループの終わり：A7 で、頭の Dm7 へ
    const THEME_LAST = `${THEME_HEAD} | F5:4 D5:4 E5:4 C#5:4`;
    const CHORDS_HEAD = 'Dm7 | Gm7 | C7 | Fmaj7 | Bbmaj7 | Em7b5 | A7';
    const CHORDS_A = `${CHORDS_HEAD} | Dm7:8 A7:8`;
    const CHORDS_A2 = `${CHORDS_HEAD} | Dm7:8 C7:8`;

    // A' のベル：主題が伸ばしている所に、短く答える
    const REPLY = `r:16 | r:12 F5:2 A5:2 | r:16 | r:12 A5:2 C6:2 |
                   r:16 | r:12 G5:2 Bb5:2 | r:16 | r:16`;

    // B：ヘ長調へ明るく開く（主題が根音を伸ばす小節は、伴奏に長7度を入れない6の和音）。A7 で休憩へ
    const CHORDS_B = 'F6 | Am7 | Bb6 | C7 | Fmaj7 | Dm7 | Gm7 | A7';
    const SONG_B = `C6:6 A5:2 F5:4 A5:4 | E5:6 G5:2 C6:8 | D6:6 C6:2 Bb5:4 F5:4 | G5:8 r:2 E5:2 G5:2 Bb5:2 |
                    A5:6 C6:2 E5:8 | F5:6 A5:2 D6:8 | D6:4 Bb5:4 G5:4 F5:4 | E5:8 C#5:4 E5:4`;

    // 休憩：ベルがひとりでゆっくり歌う。A7 で最後の A' へ
    const CHORDS_C = 'Dm7 | Bbmaj7 | Gm7 | A7 | Dm7 | Bbmaj7 | Em7b5 | A7';
    const BELL_C = `A5:8 F5:8 | D6:8 A5:8 | Bb5:8 D6:8 | C#6:8 E5:8 |
                    F5:8 A5:8 | D6:8 F5:8 | E5:8 G5:8 | A5:8 C#6:8`;

    // マリンバは8分の分散和音、ベースは根音と5度
    const ARP = '0:2 2 1 3 0 2 1 3';
    const ARP_SLOW = '0:4 2 1 3';
    const BASS = 'R:4 r:2 R:2 5:4 R:4';
    const KICK = repeat('x.......x.x.....', 8, '|');
    const SNARE = repeat('....x.......x...', 8, '|');
    const HAT = repeat('x.o.x.o.x.o.x.o.', 8, '|');
    const DRUMS = { kick: KICK, hat: HAT };
    const DRUMS_FULL = { kick: KICK, snare: SNARE, hat: HAT };

    const quickeye = {
        title: 'クイック・アイ',
        tags: ['軽快', '緊張感'],
        genre: 'ポップス',
        melody: ['lead'],
        bpm: 120,
        swing: 0.05,
        swingUnit: 2,
        gain: 0.091,
        reverb: { seconds: 1.6, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.2, tone: 2200, reverb: 0.2 },
        humanize: { time: 0.005, velocity: 0.08 },
        parts: {
            lead: { instrument: 'piano', volume: 0.6, pan: -0.05, decay: 0.7, brightness: 0.75, reverb: 0.2, delay: 0.1 },
            // A' で答え、休憩の C で歌うベル
            bell: { instrument: 'bell', volume: 0.38, pan: 0.25, reverb: 0.3, delay: 0.2 },
            comp: { instrument: 'marimba', mode: 'arp', from: 'D4', volume: 0.33, pan: -0.25, reverb: 0.18 },
            keys: { instrument: 'epiano', mode: 'chords', center: 'E4', voices: 4, volume: 0.45, pan: 0.2, warmth: 0.7, release: 0.4, reverb: 0.25 },
            pad: { instrument: 'pad', mode: 'chords', center: 'A3', voices: 4, volume: 0.3, reverb: 0.35 },
            bass: { instrument: 'synthBass', mode: 'bass', octave: 2, wave: 'triangle', cutoff: 380, envelope: 0.5, decay: 0.35, sustain: 0.5, release: 0.1, volume: 0.5, gate: 0.8 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.8, cutoff: 7500, levels: { kick: 0.5, snare: 0.35, hat: 0.28 } }
        },
        sections: {
            // イントロ：マリンバから、ベースとハイハットが入る。A7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'Dm7 | Gm7 | Bbmaj7 | A7',
                comp: ARP,
                bass: { pattern: `r:16 | ${BASS} | ${BASS} | ${BASS}` },
                drums: { hat: '................|' + repeat('x.o.x.o.x.o.x.o.', 3, '|'), kick: '................|................|' + repeat('x.......x.x.....', 2, '|') }
            },
            A: {
                chords: CHORDS_A,
                lead: THEME,
                comp: ARP,
                bass: BASS,
                drums: DRUMS
            },
            // A'：スネアが入り、ベルが答える。C7 で B へ
            A2: {
                label: "A'",
                chords: CHORDS_A2,
                lead: THEME_TURN,
                bell: REPLY,
                comp: ARP,
                bass: BASS,
                drums: DRUMS_FULL
            },
            // B：ヘ長調へ開き、エレピが2拍ずつ和音を置く
            B: {
                chords: CHORDS_B,
                lead: SONG_B,
                comp: ARP,
                keys: 'x-------x-------',
                bass: BASS,
                drums: DRUMS_FULL
            },
            // 休憩：ピアノとスネアを抜き、ベルがひとりで歌う。分散和音はゆっくり、パッドを薄く敷く
            C: {
                chords: CHORDS_C,
                bell: BELL_C,
                comp: ARP_SLOW,
                pad: 'hold',
                bass: 'R:8 5:8',
                drums: { hat: HAT }
            },
            // 最後の A'：ベルが答え、A7 で頭の Dm7 へ戻る
            A3: {
                label: "A'",
                chords: CHORDS_A,
                lead: THEME_LAST,
                bell: REPLY,
                comp: ARP,
                bass: BASS,
                drums: DRUMS_FULL
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A3']
    };

    Sound.register('set', { songs: { quickeye } });
})();
