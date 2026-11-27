/**
 * バーグルブロスの BGM：真夜中の忍び足（ホ短調・4拍子。弱いドラムとはじくベースの上で、ピアノが短くささやく主題を歌う）
 * 選んだわけ：夜のビルに忍び込み、見張りの足音をうかがいながら金庫へ近づく。少しおどけた緊張を、休符の多い主題とエレピの刻みで
 * A はピアノとエレピ、A' でベルが答え、B は長調の方へ開いて弦を敷き、
 * 休憩の C でドラムとピアノを抜き、フルートが長く歌ってループの頭へ戻る
 */
(function () {
    const CHORDS_A = 'Em7 | Am7 | Em7 | B7 | Cmaj7 | Am7 | F#m7b5 | B7';
    const CHORDS_B = 'Cmaj7 | D7 | Bm7 | Em7 | Am7 | D7 | Gmaj7 | B7';
    const CHORDS_C = 'Em7 | Cmaj7 | Am7 | B7sus4:8 B7:8 | Em7 | Cmaj7 | Am7 | B7sus4:8 B7:8';

    const HEAD = 'r:2 E5:2 G5:2 A5:2 B5:6 A5:2 | G5:4 E5:4 C5:4 r:4 | r:2 E5:2 G5:2 A5:2 B5:4 D6:4 | B5:4 A5:2 F#5:2 D#5:8 | r:2 G5:2 B5:2 C6:2 E6:6 D6:2 | C6:4 A5:4 E5:4 G5:4';
    const THEME_A = `${HEAD} | A5:6 G5:2 F#5:4 E5:4 | D#5:8 F#5:4 B4:4`;
    const THEME_A2 = `${HEAD} | A5:4 C6:4 B5:4 A5:4 | F#5:12 r:4`;
    const THEME_B = 'E5:4 G5:4 B5:8 | A5:4 F#5:4 D5:8 | D5:2 F#5:2 A5:4 B5:8 | G5:6 F#5:2 E5:8 | C6:4 B5:4 A5:4 E5:4 | F#5:4 A5:4 C6:8 | B5:6 A5:2 B5:4 D5:4 | D#5:4 F#5:4 A5:4 B5:4';
    // A' のベル：主題が伸ばす所に短く答える
    const BELL_A2 = 'r:16 | r:8 E6:2 G6:2 r:4 | r:16 | r:8 B5:2 D#6:2 r:4 | r:16 | r:8 A5:2 C6:2 r:4 | r:16 | r:16';
    // C のフルート：長く伸ばして、ループの頭の E5 へ
    const FLUTE_C = 'B5:16 | G5:16 | E5:8 A5:8 | F#5:16 | B5:8 G5:8 | E5:16 | C6:8 A5:8 | B5:12 D#5:4';

    const KEYS = 'x-..x-..x-..x-..';
    const KEYS_SOFT = 'x-------x-------';
    const BASS = 'R:4 r:2 R:2 5:4 R:4';
    const DRUMS_A = { kick: 'x.......x.......', hat: '..x...x...x...x.' };
    const DRUMS_B = { kick: 'x.......x..x....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' };

    const heist = {
        title: '真夜中の忍び足',
        tags: ['ひそやか', '軽快'],
        genre: 'ジャズ',
        melody: ['lead'],
        bpm: 104,
        gain: 0.117,
        reverb: { seconds: 1.8, tone: 0.45 },
        delay: { time: 0.75, feedback: 0.2, tone: 2000, reverb: 0.25 },
        humanize: { time: 0.005, velocity: 0.08 },
        parts: {
            lead: { instrument: 'piano', volume: 0.55, pan: -0.06, decay: 0.9, brightness: 0.75, reverb: 0.2, delay: 0.1 },
            bell: { instrument: 'bell', volume: 0.25, pan: 0.3, reverb: 0.35, delay: 0.2 },
            flute: { instrument: 'flute', volume: 0.4, pan: 0.18, vibrato: 7, breath: 0.04, reverb: 0.35, delay: 0.12 },
            keys: { instrument: 'epiano', mode: 'chords', center: 'E4', voices: 4, volume: 0.3, pan: 0.15, reverb: 0.2 },
            strings: { instrument: 'strings', mode: 'chords', center: 'G4', voices: 3, volume: 0.24, pan: -0.2, attack: 0.6, release: 0.9, brightness: 0.5, reverb: 0.45 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, brightness: 0.3, sustain: 0.994, release: 0.08, volume: 0.8, gate: 0.55 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.5, cutoff: 6000, levels: { hat: 0.4, kick: 0.75, snare: 0.5 } }
        },
        sections: {
            // イントロ：エレピとベースだけ。B7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'Em7 | Am7 | Cmaj7 | B7',
                keys: KEYS,
                bass: BASS
            },
            // A：ピアノとエレピ
            A: {
                chords: CHORDS_A,
                lead: THEME_A,
                keys: KEYS,
                bass: BASS,
                drums: DRUMS_A
            },
            // A'：ベルが答え、小太鼓を足す
            A2: {
                label: "A'",
                chords: CHORDS_A,
                lead: THEME_A2,
                bell: BELL_A2,
                keys: KEYS,
                bass: BASS,
                drums: { ...DRUMS_A, snare: '....x.......x...' }
            },
            // B：ト長調の方へ。弦を敷いて明るく
            B: {
                chords: CHORDS_B,
                lead: THEME_B,
                keys: KEYS,
                strings: 'hold',
                bass: BASS,
                drums: DRUMS_B
            },
            // 休憩：ドラムとピアノを抜き、フルートと弦だけ。B7 で頭へ戻る
            C: {
                chords: CHORDS_C,
                flute: FLUTE_C,
                keys: KEYS_SOFT,
                strings: 'hold',
                bass: 'R:8 5:8'
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C']
    };

    Sound.register('burgle-bros', { songs: { heist } });
})();
