/**
 * ゴーストストーリーズの BGM：灯籠の夜（ニ短調の五音音階で、笛が歌い、琴のような分散和音が支える）
 * 選んだわけ：古い村の夜に、僧が灯籠をともして幽霊を待つ、静かで少し怪しい東洋の雰囲気
 * A は笛と琴と寺の太鼓、A' で弦とベルの合いの手を足す。B は和音を変えて高く歌い、パッドを敷く
 * 休憩の C は太鼓と笛を抜き、ベルと琴だけで静まり、A7 でループの頭の Dm へ戻る
 */
(function () {
    const MELODY_A = `A4:4 D5:4 F5:6 G5:2 | A5:8 G5:4 F5:4 | F5:6 D5:2 C5:4 D5:4 | C5:4 E5:4 G5:8 |
                      A5:6 C6:2 A5:4 G5:4 | F5:8 A5:4 C6:4 | D6:6 C6:2 Bb5:4 G5:4 | A5:12 r:4`;
    const MELODY_B = `D6:8 C6:4 Bb5:4 | A5:8 F5:8 | G5:6 E5:2 C5:8 | D5:12 F5:4 |
                      F5:4 Bb5:4 D6:8 | C6:8 A5:8 | Bb5:6 A5:2 G5:8 | E5:8 A5:8`;
    const CHORDS_A = 'Dm | Dm | Bb | C | Dm | F | Gm | A7';
    const CHORDS_B = 'Bb | F | C | Dm | Bb | F | Gm | A7';
    // A' のベル：笛が伸ばしている所に短く答える
    const BELL_A2 = 'r:12 F6:4 | r:12 D6:4 | r:16 | r:12 E6:4 | r:12 C6:4 | r:12 F6:4 | r:16 | r:8 E6:4 C#6:4';
    const ZHENG = '0:2 1 2 3 2 1 2 1';
    const ZHENG_SLOW = '0:4 1 2 3';
    const BASS = 'R:8 5:6 R:2';
    const TEMPLE = { tomLow: 'x.......x...x...', hat: '..o...o...o...o.' };

    const lanterns = {
        title: '灯籠の夜',
        tags: ['神秘的', '落ち着いた'],
        genre: '和風・東洋',
        melody: ['lead'],
        bpm: 80,
        gain: 0.11,
        reverb: { seconds: 2.8, tone: 0.45 },
        delay: { time: 0.75, feedback: 0.22, tone: 2200, reverb: 0.3 },
        humanize: { time: 0.005, velocity: 0.07 },
        parts: {
            lead: { instrument: 'flute', volume: 0.55, pan: -0.05, vibrato: 12, breath: 0.06, reverb: 0.35, delay: 0.18 },
            zheng: { instrument: 'pluck', mode: 'arp', from: 'A3', brightness: 0.7, volume: 0.66, pan: 0.25, reverb: 0.3, delay: 0.1 },
            bell: { instrument: 'bell', volume: 0.3, pan: 0.3, reverb: 0.45, delay: 0.2 },
            strings: { instrument: 'strings', mode: 'chords', center: 'D4', voices: 3, volume: 0.28, pan: -0.2, attack: 0.5, release: 0.8, vibrato: 6, reverb: 0.45 },
            pad: { instrument: 'pad', mode: 'chords', center: 'F4', voices: 3, volume: 0.22, reverb: 0.5 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, brightness: 0.3, sustain: 0.994, release: 0.1, volume: 0.8, gate: 0.6 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.6, cutoff: 5000, levels: { tomLow: 0.8, hat: 0.35 } }
        },
        sections: {
            // イントロ：琴だけで始め、A7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'Dm | Dm | Bb | A7',
                zheng: ZHENG_SLOW,
                bass: 'R:16'
            },
            // A：笛と琴と寺の太鼓
            A: { chords: CHORDS_A, lead: MELODY_A, zheng: ZHENG, bass: BASS, drums: TEMPLE },
            // A'：弦楽器とベルを足す
            A2: { label: "A'", chords: CHORDS_A, lead: MELODY_A, bell: BELL_A2, strings: 'hold', zheng: ZHENG, bass: BASS, drums: TEMPLE },
            // B：和音を変えて高く歌う。パッドを敷く
            B: { chords: CHORDS_B, lead: MELODY_B, pad: 'hold', strings: 'hold', zheng: ZHENG, bass: BASS, drums: { ...TEMPLE, tomLow: 'x.......x.x.x...' } },
            // 休憩：太鼓と笛を抜き、ベルと琴と弦だけで静まる。A7 でループの頭へ
            C: {
                chords: 'Dm | Bb | F | C | Dm | Bb | Gm | A7',
                bell: 'D6:16 | r:16 | C6:16 | r:16 | A5:16 | r:16 | G5:8 Bb5:8 | A5:16',
                pad: 'hold',
                strings: 'hold',
                zheng: ZHENG_SLOW,
                bass: 'R:16'
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C']
    };

    Sound.register('ghost-stories', { songs: { lanterns } });
})();
