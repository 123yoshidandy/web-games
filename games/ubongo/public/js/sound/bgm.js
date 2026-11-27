/**
 * ウボンゴの BGM：サバンナの早解き（ハ長調・126。マリンバが8分で転がり、タムとシェイカーが軽く跳ねる）
 * 選んだわけ：アフリカの大地で宝石を集める早解きのパズル。急かしすぎず、手が止まらない明るさにする
 * 主題はピアノ。マリンバが分散和音を刻み、はじく弦のベースが根音と5度を踏む
 * A' では、はじく弦の高い音が主題の伸ばしに答え、E7 でイ短調の B へ。B は少し陰って、G7 で休憩へ
 * 休憩の C は、ピアノを抜いてビブラフォンが長く歌い、ドラムはシェイカーだけ。最後の A は、ベルの対旋律を足して G で頭へ戻る
 */
(function () {
    const { repeat } = Sound;

    // A の主題（前半6小節は A' でも同じ）。長い音は和音の音にする
    const THEME_HEAD = `E5:2 G5:2 A5:2 G5:2 E5:4 C5:4 | F5:2 A5:2 C6:4 A5:4 F5:4 |
                        G5:2 B5:2 D6:4 B5:2 A5:2 G5:4 | E5:6 D5:2 C5:8 |
                        C6:2 B5:2 A5:4 E5:4 A5:4 | C6:4 A5:2 F5:2 A5:4 C6:4`;
    const THEME = `${THEME_HEAD} | D6:4 C6:2 A5:2 F5:4 D5:4 | D5:2 G5:2 B5:4 A5:4 G5:4`;
    // A' の終わり：E7 で、B の Am へ
    const THEME_TURN = `${THEME_HEAD} | D6:4 C6:2 A5:2 F5:4 D5:4 | E5:4 G#5:4 B5:4 D6:4`;
    const CHORDS_HEAD = 'C | F | G | C | Am | F';
    const CHORDS_A = `${CHORDS_HEAD} | Dm7 | G`;
    const CHORDS_A2 = `${CHORDS_HEAD} | Dm7 | E7`;

    // A' の答え：主題が伸ばしている所に、高い弦が短く答える
    const REPLY = `r:12 G5:2 A5:2 | r:12 C6:2 A5:2 | r:12 D6:2 B5:2 | r:8 G5:2 A5:2 C6:4 |
                   r:12 E6:2 C6:2 | r:12 F5:2 A5:2 | r:12 A5:2 F5:2 | r:16`;
    // 最後の A のベル：主題の上で、拍の頭に和音の音を置く
    const BELL = `G5:8 E5:8 | A5:8 F5:8 | B5:8 G5:8 | G5:16 | A5:8 E5:8 | A5:8 F5:8 | F5:8 A5:8 | B5:8 D6:8`;

    // B：イ短調の方へ陰らせ、G7 で休憩へ
    const CHORDS_B = 'Am | Em | F | C | Dm | Em | F | G7';
    const SONG_B = `A5:4 C6:4 B5:2 A5:2 E5:4 | G5:4 B5:4 E5:8 | F5:2 A5:2 C6:4 A5:4 F5:4 | E5:4 G5:4 C6:8 |
                    D6:4 A5:4 F5:4 A5:4 | B5:4 G5:4 E5:8 | A5:4 C6:4 A5:4 F5:4 | G5:4 B5:4 D6:4 F5:4`;

    // 休憩：ビブラフォンが長く歌う。G で最後の A へ
    const CHORDS_C = 'F | C | Dm | G | F | C | Dm7 | G';
    const VIBES_C = 'A5:16 | G5:16 | F5:16 | D5:16 | C6:16 | E5:16 | F5:16 | D5:8 B4:8';

    // マリンバは8分の分散和音（16分で動くのはシェイカーだけ）。ベースは根音と5度
    const ARP = '0:2 1 2 1 3 1 2 1';
    const ARP_SLOW = '0:4 1 2 1';
    const BASS = 'R:6 R:2 5:4 R:4';
    const KICK = repeat('x.......x.x.....', 8, '|');
    const TOM = repeat('......x.....x.x.', 8, '|');
    const RIM = repeat('..x...x...x..x..', 8, '|');
    const SHAKER = repeat('xoxoxoxoxoxoxoxo', 8, '|');
    const DRUMS = { kick: KICK, tom: TOM, shaker: SHAKER };
    const DRUMS_RIM = { ...DRUMS, rim: RIM };

    const savanna = {
        title: 'サバンナの早解き',
        tags: ['明るい', '軽快'],
        genre: 'ワールド',
        melody: ['lead'],
        bpm: 126,
        swing: 0.06,
        swingUnit: 1,
        gain: 0.09,
        reverb: { seconds: 1.6, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.2, tone: 2200, reverb: 0.2 },
        humanize: { time: 0.006, velocity: 0.1 },
        parts: {
            lead: { instrument: 'piano', volume: 0.6, pan: -0.05, decay: 0.7, brightness: 0.8, reverb: 0.2, delay: 0.08 },
            // A' で答える、はじく弦の高い音（カリンバのつもり）
            reply: { instrument: 'pluck', volume: 0.42, pan: 0.3, brightness: 0.6, reverb: 0.3, delay: 0.2 },
            bell: { instrument: 'bell', volume: 0.28, pan: 0.25, reverb: 0.35, delay: 0.15 },
            vibes: { instrument: 'vibes', volume: 0.5, pan: -0.1, reverb: 0.35, delay: 0.15 },
            comp: { instrument: 'marimba', mode: 'arp', from: 'C4', volume: 0.55, pan: 0.18, reverb: 0.18 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, volume: 0.5, brightness: 0.4, gate: 0.8 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.8, cutoff: 7500, levels: { kick: 0.5, tom: 0.45, rim: 0.4, shaker: 0.28 } }
        },
        sections: {
            // イントロ：マリンバとシェイカーから、ベースとタムが入る。G で主題へ
            intro: {
                label: 'イントロ',
                chords: 'C | F | C | G',
                comp: ARP,
                bass: { pattern: `r:16 | ${BASS} | ${BASS} | ${BASS}` },
                drums: {
                    shaker: repeat('xoxoxoxoxoxoxoxo', 4, '|'),
                    tom: '................|................|' + repeat('......x.....x.x.', 2, '|')
                }
            },
            A: {
                chords: CHORDS_A,
                lead: THEME,
                comp: ARP,
                bass: BASS,
                drums: DRUMS
            },
            // A'：リムが入り、はじく弦が答える。E7 で B へ
            A2: {
                label: "A'",
                chords: CHORDS_A2,
                lead: THEME_TURN,
                reply: REPLY,
                comp: ARP,
                bass: BASS,
                drums: DRUMS_RIM
            },
            B: {
                chords: CHORDS_B,
                lead: SONG_B,
                comp: ARP,
                bass: BASS,
                drums: DRUMS_RIM
            },
            // 休憩：ピアノを抜き、ビブラフォンが長く歌う。マリンバはゆっくり、ドラムはシェイカーだけ
            C: {
                chords: CHORDS_C,
                vibes: VIBES_C,
                comp: ARP_SLOW,
                bass: 'R:8 5:8',
                drums: { shaker: SHAKER }
            },
            // 最後の A：ベルの対旋律を足し、G で頭の C へ戻る
            A3: {
                label: 'A',
                chords: CHORDS_A,
                lead: THEME,
                bell: BELL,
                comp: ARP,
                bass: BASS,
                drums: DRUMS_RIM
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A3']
    };

    Sound.register('ubongo', { songs: { savanna } });
})();
