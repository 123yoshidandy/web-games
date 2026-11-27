/**
 * ハリガリの BGM：フルーツ・ベル（ト長調の軽快なポップス。果物の並ぶ卓をはずむように）
 * 選んだわけ：早押しのゲームなので、テンポは速め（132）。ただし目と耳をカードとベルに残すため、16分で動くパートは置かず、
 * マリンバの8分の分散和音とベースの根音でまとめる。ピアノの主題は拍の頭を休んで跳ね、長い音は和音の音にする
 * A' と B' ではベルが主題の伸ばしに答える。B はホ短調へ曇らせ、休憩の C はピアノを抜いてベルがゆっくり歌う
 * どの区間の終わりも次の頭へ進む和音（D7 → G、B7 → Em、D7 → Em の偽終止）にする
 */
(function () {
    const { repeat } = Sound;

    // A の主題（前半7小節は A' でも同じ）
    const THEME_HEAD = `r:2 B4:2 D5:2 G5:2 B5:4 A5:2 G5:2 | E5:4 G5:2 A5:2 B5:6 G5:2 |
                        r:2 C5:2 E5:2 A5:2 C6:4 B5:2 A5:2 | F#5:4 A5:2 D6:2 C6:4 A5:4 |
                        r:2 B4:2 D5:2 G5:2 B5:4 D6:2 B5:2 | A5:4 F#5:2 D5:2 B4:8 |
                        r:2 C5:2 E5:2 G5:2 C6:6 G5:2`;
    // A の終わり：D7 で A' の G へ
    const THEME = `${THEME_HEAD} | A5:4 C6:4 A5:4 F#5:4`;
    // A' の終わり：B7 で、B の Em へ
    const THEME_TURN = `${THEME_HEAD} | A5:4 C6:4 B5:4 D#5:4`;
    // ループの終わり：D7 で、頭の G へ
    const THEME_LAST = `${THEME_HEAD} | A5:4 C6:4 A5:4 D5:4`;
    const CHORDS_HEAD = 'G | Em7 | Am7 | D7 | G | Bm7 | C';
    const CHORDS_A = `${CHORDS_HEAD} | Am7:8 D7:8`;
    const CHORDS_A2 = `${CHORDS_HEAD} | Am7:8 B7:8`;

    // A' のベル：主題が B を伸ばす6小節目に答える
    const REPLY_A = 'r:16 | r:16 | r:16 | r:16 | r:16 | r:8 D6:2 F#6:2 D6:4 | r:16 | r:16';

    // B：ホ短調へ曇らせる。D7 で C（ト長調の頭）か A''（G）へ
    const CHORDS_B = 'Em | C | Am7 | B7 | Em | C | Am7 | D7';
    const SONG_B = `B5:6 G5:2 E5:4 G5:4 | G5:6 E5:2 C6:8 | C6:6 B5:2 A5:4 E5:4 | F#5:8 r:2 D#5:2 F#5:2 A5:2 |
                    G5:6 B5:2 E5:8 | E5:6 G5:2 C6:8 | C6:4 A5:4 E5:4 A5:4 | A5:8 F#5:4 D5:4`;
    // B' のベル：主題が C を伸ばす所に答える
    const REPLY_B = 'r:16 | r:8 E6:2 D6:2 C6:4 | r:16 | r:16 | r:16 | r:8 E6:2 D6:2 C6:4 | r:16 | r:16';

    // 休憩：ベルがひとりでゆっくり歌う。D7 で B'（Em）へ
    const CHORDS_C = 'G | D/F# | Em7 | C | G | D/F# | Am7 | D7';
    const BELL_C = `B5:8 D6:8 | A5:8 F#5:8 | G5:8 B5:8 | E5:8 G5:8 |
                    D5:8 B5:8 | A5:8 D6:8 | C6:8 A5:8 | F#5:8 A5:8`;

    // マリンバは8分の分散和音、ベースは根音と5度
    const ARP = '0:2 2 1 3 0 2 1 3';
    const ARP_SLOW = '0:4 2 1 3';
    const BASS = 'R:4 r:2 R:2 5:4 R:4';
    const KICK = repeat('x.......x.......', 8, '|');
    const SNARE = repeat('....x.......x...', 8, '|');
    const HAT = repeat('x.o.x.o.x.o.x.o.', 8, '|');
    const DRUMS = { kick: KICK, hat: HAT };
    const DRUMS_FULL = { kick: KICK, snare: SNARE, hat: HAT };

    const fruitbell = {
        title: 'フルーツ・ベル',
        tags: ['明るい', '軽快'],
        genre: 'ポップス',
        melody: ['lead'],
        bpm: 132,
        swing: 0.06,
        swingUnit: 2,
        gain: 0.09,
        reverb: { seconds: 1.5, tone: 0.55 },
        delay: { time: 0.75, feedback: 0.18, tone: 2400, reverb: 0.2 },
        humanize: { time: 0.005, velocity: 0.08 },
        parts: {
            lead: { instrument: 'piano', volume: 0.6, pan: -0.05, decay: 0.6, brightness: 0.8, reverb: 0.2, delay: 0.08 },
            // A'・B' で答え、休憩の C で歌うベル
            bell: { instrument: 'bell', volume: 0.36, pan: 0.25, reverb: 0.3, delay: 0.2 },
            comp: { instrument: 'marimba', mode: 'arp', from: 'D4', volume: 0.34, pan: -0.25, reverb: 0.18 },
            keys: { instrument: 'epiano', mode: 'chords', center: 'E4', voices: 4, volume: 0.42, pan: 0.2, warmth: 0.7, release: 0.4, reverb: 0.25 },
            pad: { instrument: 'pad', mode: 'chords', center: 'A3', voices: 4, volume: 0.3, reverb: 0.35 },
            bass: { instrument: 'synthBass', mode: 'bass', octave: 2, wave: 'triangle', cutoff: 400, envelope: 0.5, decay: 0.3, sustain: 0.5, release: 0.1, volume: 0.5, gate: 0.75 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.8, cutoff: 7500, levels: { kick: 0.5, snare: 0.32, hat: 0.26 } }
        },
        sections: {
            // イントロ：マリンバから、ベースとハイハットが入る。D7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'G | Em7 | Am7 | D7',
                comp: ARP,
                bass: { pattern: `r:16 | ${BASS} | ${BASS} | ${BASS}` },
                drums: { hat: '................|' + repeat('x.o.x.o.x.o.x.o.', 3, '|'), kick: '................|................|' + repeat('x.......x.......', 2, '|') }
            },
            A: {
                chords: CHORDS_A,
                lead: THEME,
                comp: ARP,
                bass: BASS,
                drums: DRUMS
            },
            // A'：スネアが入り、ベルが答える。B7 で B へ
            A2: {
                label: "A'",
                chords: CHORDS_A2,
                lead: THEME_TURN,
                bell: REPLY_A,
                comp: ARP,
                bass: BASS,
                drums: DRUMS_FULL
            },
            // B：ホ短調へ。エレピが2拍ずつ和音を置く
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
            // B'：B にベルの答えを足す。D7 で最後の A へ
            B2: {
                label: "B'",
                chords: CHORDS_B,
                lead: SONG_B,
                bell: REPLY_B,
                comp: ARP,
                keys: 'x-------x-------',
                bass: BASS,
                drums: DRUMS_FULL
            },
            // 最後の A：ベルが答え、D7 で頭の G へ戻る
            A3: {
                label: "A''",
                chords: CHORDS_A,
                lead: THEME_LAST,
                bell: REPLY_A,
                comp: ARP,
                bass: BASS,
                drums: DRUMS_FULL
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'B2', 'A3']
    };

    Sound.register('halli-galli', { songs: { fruitbell } });
})();
