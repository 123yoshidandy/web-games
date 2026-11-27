/**
 * 禁断の島の BGM：潮の満ちる島（ニ短調・4拍子。マリンバの分散和音の上で、ピアノが冒険の主題を歌う）
 * 選んだわけ：沈みゆく島を、仲間と歩いて宝を探す。神秘と少しの急ぎを、マリンバと弱いドラムで
 * A はピアノとマリンバだけ、A' でベルが答え、B は長調の方へ明るく開いてパッドを敷き、
 * 休憩の C でドラムとメロディを抜き、フルートが長く歌ってループの頭へ戻る
 */
(function () {
    const CHORDS_A = 'Dm | Bb | C | Am | Dm | Bb | Gm7 | A7';
    const CHORDS_A2 = 'Dm | Bb | C | Am | Dm | Bb | Gm | A7sus4:8 A7:8';
    const CHORDS_B = 'F | C | Dm | Bb | F | C | Gm | A7';
    const CHORDS_C = 'Bb | C | Dm | Dm | Bb | C | Gm7 | A7';

    const HEAD = 'A4:4 D5:4 F5:6 E5:2 | D5:4 F5:4 Bb5:6 A5:2 | G5:6 F5:2 E5:4 C5:4 | E5:12 r:4 | A4:4 D5:4 F5:4 A5:4 | D6:6 C6:2 Bb5:4 F5:4';
    const THEME_A = `${HEAD} | G5:4 Bb5:4 A5:4 F5:4 | E5:8 A4:4 C#5:4`;
    const THEME_A2 = `${HEAD} | G5:4 F5:4 D5:4 Bb4:4 | D5:8 C#5:8`;
    const THEME_B = 'C5:4 F5:4 A5:8 | G5:6 E5:2 C5:8 | D5:4 F5:4 A5:4 D6:4 | D6:8 C6:4 Bb5:4 | A5:6 G5:2 F5:4 C5:4 | E5:4 G5:4 C6:8 | Bb5:6 A5:2 G5:4 D5:4 | C#5:8 E5:8';
    // A' のベル：メロディが伸ばす所に短く答える
    const BELL_A2 = 'r:16 | r:16 | r:16 | r:8 A5:2 C6:2 E6:4 | r:16 | r:16 | r:16 | r:16';
    // C のフルート：長く伸ばして、ループの頭の A4 へ
    const FLUTE_C = 'F5:16 | E5:16 | F5:16 | A5:8 F5:8 | D5:16 | E5:8 G5:8 | F5:16 | E5:12 C#5:4';

    const ARP = '0:2 1 2 1 3 1 2 1';
    const BASS = 'R:4 r:2 R:2 5:4 R:4';

    const tides = {
        title: '潮の満ちる島',
        tags: ['神秘的', '軽快'],
        genre: 'アドベンチャー',
        melody: ['lead'],
        bpm: 96,
        gain: 0.105,
        reverb: { seconds: 2.2, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.18, tone: 2200, reverb: 0.25 },
        humanize: { time: 0.004, velocity: 0.07 },
        parts: {
            lead: { instrument: 'piano', volume: 0.55, pan: -0.06, decay: 1, brightness: 0.8, reverb: 0.22, delay: 0.08 },
            bell: { instrument: 'bell', volume: 0.27, pan: 0.3, reverb: 0.35, delay: 0.2 },
            flute: { instrument: 'flute', volume: 0.4, pan: 0.2, vibrato: 8, breath: 0.04, reverb: 0.35, delay: 0.12 },
            comp: { instrument: 'marimba', mode: 'arp', from: 'D4', volume: 0.33, pan: 0.18, reverb: 0.2 },
            pad: { instrument: 'pad', mode: 'chords', center: 'F4', voices: 3, volume: 0.26, pan: -0.2, attack: 0.5, release: 0.8, reverb: 0.45 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, brightness: 0.3, sustain: 0.994, release: 0.08, volume: 0.8, gate: 0.6 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.55, cutoff: 6500, levels: { hat: 0.45, kick: 0.8, snare: 0.6 } }
        },
        sections: {
            // イントロ：マリンバとパッドだけ。A7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'Dm | Bb | C | A7',
                comp: ARP,
                pad: 'hold'
            },
            // A：ピアノとマリンバ
            A: {
                chords: CHORDS_A,
                lead: THEME_A,
                comp: ARP,
                bass: BASS,
                drums: { kick: 'x.......x.......', hat: '..x...x...x...x.' }
            },
            // A'：ベルが答え、ドラムに小太鼓を足す
            A2: {
                label: "A'",
                chords: CHORDS_A2,
                lead: THEME_A2,
                bell: BELL_A2,
                comp: ARP,
                bass: BASS,
                drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.' }
            },
            // B：ヘ長調の方へ。パッドを敷いて明るく
            B: {
                chords: CHORDS_B,
                lead: THEME_B,
                comp: ARP,
                pad: 'hold',
                bass: BASS,
                drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }
            },
            // 休憩：ドラムとピアノを抜き、フルートとパッドだけ。A7 で頭へ戻る
            C: {
                chords: CHORDS_C,
                flute: FLUTE_C,
                comp: '0:4 2 1 2',
                pad: 'hold',
                bass: 'R:8 5:8'
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C']
    };

    Sound.register('forbidden-island', { songs: { tides } });
})();
