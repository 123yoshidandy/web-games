/**
 * 禁断の砂漠の BGM：砂の蜃気楼（ニ短調。和声的短音階の C# で、砂漠の乾いた響きを出す）
 * 選んだわけ：熱い砂の上を歩き続ける、少し神秘的で落ち着いた曲。考えながら長く聞いても疲れないように、テンポは中くらい
 * A はピアノの主題とマリンバの分散和音、A' で主題をニ短調に落ち着かせ、B はヘ長調へ明るく開く
 * 休憩の C はピアノを抜き、ベルと敷いた和音だけにして、ループの頭へ戻る
 */
(function () {
    const CHORDS_A = 'Dm | Dm | Gm | A7 | Dm | Bb | Gm | A7';
    const CHORDS_A2 = 'Dm | Dm | Gm | A7 | Dm | Bb | Gm:8 A7:8 | Dm';
    const CHORDS_B = 'F | C | Bb | F | Gm | C | Bb | A7';

    const THEME_HEAD = `A4:4 D5:2 E5:2 F5:6 E5:2 | D5:4 C#5:2 D5:2 A4:8 | Bb4:4 D5:2 G5:2 F5:4 E5:2 D5:2 | E5:6 C#5:2 A4:8 |
                        A4:4 D5:2 F5:2 A5:6 G5:2 | F5:4 D5:2 F5:2 Bb5:6 A5:2`;
    const THEME_A = `${THEME_HEAD} | G5:4 F5:2 E5:2 D5:4 E5:4 | C#5:8 E5:4 A5:4`;
    // A'：終わりをニ短調に落ち着かせ、B の頭へ短い経過音でつなぐ
    const THEME_A2 = `${THEME_HEAD} | G5:4 F5:4 E5:4 C#5:4 | D5:12 E5:2 F5:2`;
    const SONG_B = `C5:4 F5:4 A5:6 G5:2 | G5:4 E5:4 C5:8 | D5:4 F5:4 Bb5:6 A5:2 | A5:8 F5:8 |
                    G5:4 Bb5:4 D6:6 C6:2 | C6:4 Bb5:2 A5:2 G5:8 | F5:4 D5:4 Bb4:4 D5:4 | E5:8 C#5:4 E5:4`;
    // A' と B でベルが答える（主題が伸ばしている所で）
    const BELL_A2 = 'r:16 | r:8 F6:4 E6:4 | r:16 | r:8 E6:4 C#6:4 | r:16 | r:8 D6:8 | r:16 | r:16';
    const BELL_B = 'r:12 C6:4 | r:16 | r:12 D6:4 | r:8 C6:8 | r:16 | r:12 E6:4 | r:16 | r:8 A5:8';
    // 休憩：ベルだけがゆっくり歌う
    const BELL_C = 'A5:8 D6:8 | F6:16 | D6:8 Bb5:8 | A5:16 | F5:8 A5:8 | D6:16 | Bb5:8 G5:8 | E5:8 C#6:8';

    const ARP = '0:2 1 2 1 3 1 2 1';
    const BASS = 'R:4 r:2 R:2 5:4 R:4';
    const DRUMS = { kick: 'x.....x.x.......', tomLow: '....x.......x...', hat: '..x...x...x...x.' };
    const DRUMS_LIGHT = { kick: 'x...............', tomLow: '........x.......' };

    const mirage = {
        title: '砂の蜃気楼',
        tags: ['神秘的', '落ち着いた'],
        genre: 'ワールド',
        melody: ['lead'],
        bpm: 92,
        gain: 0.085,
        reverb: { seconds: 2.6, tone: 0.45 },
        delay: { time: 0.75, feedback: 0.2, tone: 2200, reverb: 0.3 },
        humanize: { time: 0.004, velocity: 0.06 },
        parts: {
            lead: { instrument: 'piano', volume: 0.6, pan: -0.05, reverb: 0.25, delay: 0.1 },
            bell: { instrument: 'bell', volume: 0.4, pan: 0.3, reverb: 0.35, delay: 0.2 },
            comp: { instrument: 'marimba', mode: 'arp', from: 'D4', volume: 0.42, pan: 0.2, reverb: 0.2 },
            pad: { instrument: 'pad', mode: 'chords', center: 'F4', voices: 3, volume: 0.3, pan: -0.2, reverb: 0.4 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, brightness: 0.3, volume: 1, gate: 0.6 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.55, cutoff: 6000, levels: { tomLow: 0.8, hat: 0.4 } }
        },
        sections: {
            // イントロ：分散和音と敷いた和音だけ。A7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'Dm | Dm | Gm | A7',
                comp: ARP,
                pad: 'hold',
                drums: DRUMS_LIGHT
            },
            A: {
                chords: CHORDS_A,
                lead: THEME_A,
                comp: ARP,
                bass: BASS,
                drums: DRUMS
            },
            A2: {
                label: "A'",
                chords: CHORDS_A2,
                lead: THEME_A2,
                bell: BELL_A2,
                comp: ARP,
                pad: 'hold',
                bass: BASS,
                drums: DRUMS
            },
            B: {
                chords: CHORDS_B,
                lead: SONG_B,
                bell: BELL_B,
                comp: ARP,
                pad: 'hold',
                bass: BASS,
                drums: DRUMS
            },
            // 休憩：ピアノを抜き、ベルが歌う。ドラムは軽く。A7 でループの頭へ
            C: {
                chords: CHORDS_A,
                bell: BELL_C,
                comp: ARP,
                pad: 'hold',
                bass: 'R:8 5:8',
                drums: { kick: 'x.......x.......', tomLow: '....x.......x...' }
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C']
    };

    Sound.register('forbidden-desert', { songs: { mirage } });
})();
