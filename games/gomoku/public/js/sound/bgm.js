/**
 * 五目並べの BGM：縁側の午後（ニ長調で、ゆったり、明るく）
 * 選んだわけ：縁側で碁盤を挟み、石を並べていく昼下がりの、のんびりした明るさ
 * はじく弦が琴のように和音を分けて鳴らし、その上でピアノがニ長調の五音（レ・ミ・ファ#・ラ・シ）を中心に歌う
 * A' からフルートが長い音で寄り添い、B は Gmaj7 から少しせつなく回る。休憩の C はピアノとドラムを抜き、カリンバがぽつりと答える
 * ループの終わりは A7sus4 → A7 で、頭の D へ戻る
 */
(function () {
    const CHORDS_A = 'D | Bm7 | Gmaj7 | A | D | Bm7 | Em7 | A7sus4:8 A7:8';
    // A の主題（前半7小節は A' でも同じ）
    const THEME_HEAD = `F#5:4 A5:4 B5:4 A5:4 | D6:6 B5:2 A5:8 | B5:4 A5:2 F#5:2 E5:8 | E5:4 F#5:2 A5:2 E5:8 |
                        F#5:4 A5:4 D6:4 A5:4 | B5:6 D6:2 F#5:8 | G5:4 F#5:2 E5:2 B4:8`;
    const THEME = `${THEME_HEAD} | A5:8 G5:4 E5:4`;
    const THEME2 = `${THEME_HEAD} | A5:6 G5:2 E5:8`;
    // A' のフルート：小節の後半に、和音の音を長く
    const FLUTE_A = 'r:8 D5:8 | r:8 D5:8 | r:8 D5:8 | r:8 C#5:8 | r:8 D5:8 | r:8 D5:8 | r:8 B4:8 | r:8 C#5:8';

    // B：Gmaj7 から少しせつなく回り、A7 で頭へ
    const CHORDS_B = 'Gmaj7 | F#m7 | Em7 | Bm7 | Gmaj7 | F#m7 | Em7 | A7';
    const SONG_B = `D6:4 B5:4 A5:4 B5:4 | A5:6 F#5:2 E5:8 | G5:4 B5:4 D6:4 B5:4 | A5:6 F#5:2 D5:8 |
                    B5:4 D6:4 E6:4 D6:4 | C#6:6 A5:2 F#5:8 | G5:4 F#5:4 E5:4 G5:4 | A5:8 C#6:4 E5:4`;
    const FLUTE_B = 'B4:16 | C#5:16 | B4:16 | D5:16 | B4:16 | C#5:16 | B4:16 | C#5:16';

    // 休憩：ピアノとドラムを抜き、カリンバがぽつりと答える
    const CHORDS_C = 'Gmaj7 | D/F# | Em7 | D | Gmaj7 | D/F# | Em7 | A7sus4:8 A7:8';
    const KALIMBA_C = `r:4 B5:4 r:4 D6:4 | r:4 A5:4 r:4 F#5:4 | r:4 G5:4 r:4 B5:4 | r:4 F#5:4 r:4 A5:4 |
                       r:4 D6:4 r:4 B5:4 | r:4 F#5:4 r:4 A5:4 | r:4 E5:4 r:4 G5:4 | A5:8 r:8`;

    const garden = {
        title: '縁側の午後',
        tags: ['明るい', '落ち着いた'],
        genre: '和風ポップ',
        melody: ['lead'],
        bpm: 84,
        gain: 0.13,
        reverb: { seconds: 2.4, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.25, tone: 2200, reverb: 0.3 },
        humanize: { time: 0.008, velocity: 0.1 },
        parts: {
            lead: { instrument: 'piano', volume: 0.55, pan: -0.06, decay: 0.85, brightness: 0.7, reverb: 0.28, delay: 0.1 },
            flute: { instrument: 'flute', volume: 0.25, pan: 0.25, attack: 0.15, release: 0.4, reverb: 0.35 },
            kalimba: { instrument: 'kalimba', volume: 0.5, pan: 0.2, reverb: 0.35, delay: 0.2 },
            // 琴のつもり：はじく弦の分散和音
            comp: { instrument: 'pluck', mode: 'arp', from: 'D4', volume: 0.62, pan: 0.18, brightness: 0.6, reverb: 0.3 },
            pad: { instrument: 'pad', mode: 'chords', center: 'C4', voices: 3, volume: 0.3, cutoff: 1000, attack: 1, release: 1.6, pan: -0.15, reverb: 0.45 },
            bass: { instrument: 'synthBass', mode: 'bass', octave: 2, wave: 'triangle', cutoff: 280, envelope: 0.4, decay: 0.8, sustain: 0.6, release: 0.4, volume: 0.3, gate: 0.9 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.28, levels: { hat: 0.5 } }
        },
        sections: {
            // イントロ：パッドと分散和音から。A7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'D | Bm7 | Gmaj7 | A7sus4:8 A7:8',
                pad: 'hold',
                comp: '0:2 1 2 3 2 1 2 1',
                bass: { pattern: 'r:16 | r:16 | R:16 | R:8 5:8' }
            },
            A: {
                chords: CHORDS_A,
                lead: THEME,
                comp: '0:2 1 2 3 2 1 2 1',
                bass: 'R:8 5:8',
                drums: { kick: 'x.......x.......', hat: '....x.......x...' }
            },
            // A'：フルートが寄り添い、パッドを足す
            A2: {
                label: "A'",
                chords: CHORDS_A,
                lead: THEME2,
                flute: FLUTE_A,
                comp: '0:2 1 2 3 2 1 2 1',
                pad: 'hold',
                bass: 'R:8 5:8',
                drums: { kick: 'x.......x.......', hat: '..x...x...x...x.' }
            },
            // B：分散和音をゆっくりにし、フルートが下で支える
            B: {
                chords: CHORDS_B,
                lead: SONG_B,
                flute: FLUTE_B,
                comp: '0:4 2 1 3',
                pad: 'hold',
                bass: 'R:16',
                drums: { kick: 'x...............', hat: '........x.......' }
            },
            // 休憩：カリンバとパッドだけ
            C: {
                chords: CHORDS_C,
                kalimba: KALIMBA_C,
                pad: 'hold',
                comp: '0:4 1 2 1',
                bass: 'R:16'
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C']
    };

    Sound.register('gomoku', { songs: { garden } });
})();
