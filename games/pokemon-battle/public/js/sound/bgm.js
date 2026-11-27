/**
 * ポケモン6対6の BGM：バトルフィールド（イ短調・4拍子。刻むエレピとドラムの上で、ピアノが跳ねる主題を歌う）
 * 選んだわけ：マス目の上で6体ずつがにらみ合う、軽い緊張と高揚。考えながら長く聞くので、うるさくしない
 * A はピアノとエレピ、A' でベルが答え、B は長調の方へ開いて弦を敷き、
 * 休憩の C でドラムとピアノを抜き、ベルと弦だけでループの頭へ戻る
 */
(function () {
    const CHORDS_A = 'Am | F | G | E7 | Am | F | Dm7 | E7';
    const CHORDS_B = 'F | G | Em7 | Am | Dm7 | G | C | E7';
    const CHORDS_C = 'Am | F | Dm7 | E7 | Am | F | Dm7 | E7sus4:8 E7:8';

    const HEAD = 'A5:4 E5:2 A5:2 C6:4 B5:4 | A5:6 G5:2 F5:4 C5:4 | B5:4 D6:4 B5:2 A5:2 G5:4 | G#5:8 E5:4 r:4 | A5:4 E5:2 A5:2 C6:8 | A5:4 C6:4 A5:4 F5:4';
    const THEME_A = `${HEAD} | F5:4 A5:4 C6:4 A5:4 | B5:6 G#5:2 E5:8`;
    const THEME_A2 = `${HEAD} | D6:4 C6:4 A5:4 F5:4 | E5:4 G#5:4 B5:8`;
    const THEME_B = 'C6:8 A5:4 F5:4 | D6:8 B5:4 G5:4 | E5:4 G5:4 B5:4 D6:4 | C6:12 r:4 | A5:4 F5:4 D5:4 F5:4 | G5:4 B5:4 D6:8 | C6:4 B5:4 G5:4 E5:4 | B5:8 G#5:4 E5:4';
    // A' のベル：主題が伸ばす所に短く答える
    const BELL_A2 = 'r:16 | r:8 C6:2 A5:2 r:4 | r:16 | r:8 B5:2 E6:2 r:4 | r:16 | r:8 F6:2 C6:2 r:4 | r:16 | r:16';
    // C のベル：ゆっくり鳴らして、ループの頭の A へ
    const BELL_C = 'r:8 E6:8 | r:8 C6:8 | r:8 A5:8 | r:8 G#5:8 | r:8 E6:8 | r:8 C6:8 | r:8 F6:8 | E6:8 B5:8';

    const KEYS = 'x---x---x-x-x---';
    const KEYS_SOFT = 'x-------x-------';
    const BASS = 'R:2 R:2 r:2 R:2 5:2 5:2 R:4';
    const DRUMS_A = { kick: 'x.......x.......', hat: 'x.x.x.x.x.x.x.x.' };
    const DRUMS_B = { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' };

    const field = {
        title: 'バトルフィールド',
        tags: ['軽快', '高揚'],
        genre: 'ゲーム',
        melody: ['lead'],
        bpm: 128,
        gain: 0.12,
        reverb: { seconds: 1.6, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.18, tone: 2200, reverb: 0.2 },
        humanize: { time: 0.004, velocity: 0.08 },
        parts: {
            lead: { instrument: 'piano', volume: 0.46, pan: -0.05, decay: 0.85, brightness: 0.75, reverb: 0.2, delay: 0.1 },
            bell: { instrument: 'bell', volume: 0.24, pan: 0.3, reverb: 0.35, delay: 0.2 },
            keys: { instrument: 'epiano', mode: 'chords', center: 'E4', voices: 4, volume: 0.28, pan: 0.15, reverb: 0.2 },
            strings: { instrument: 'strings', mode: 'chords', center: 'G4', voices: 3, volume: 0.24, pan: -0.2, attack: 0.5, release: 0.9, brightness: 0.5, reverb: 0.45 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, brightness: 0.3, sustain: 0.994, release: 0.08, volume: 0.75, gate: 0.55 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.5, cutoff: 6000, levels: { hat: 0.35, kick: 0.75, snare: 0.5 } }
        },
        sections: {
            // イントロ：エレピとベースだけ。E7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'Am | F | Dm7 | E7',
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
            // B：ハ長調の方へ。弦を敷き、バスドラムを4つ打ちに
            B: {
                chords: CHORDS_B,
                lead: THEME_B,
                keys: KEYS,
                strings: 'hold',
                bass: BASS,
                drums: DRUMS_B
            },
            // 休憩：ドラムとピアノを抜き、ベルと弦だけ。E7 で頭へ戻る
            C: {
                chords: CHORDS_C,
                bell: BELL_C,
                keys: KEYS_SOFT,
                strings: 'hold',
                bass: 'R:8 5:8'
            }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'A', 'C']
    };

    Sound.register('pokemon-battle', { songs: { field } });
})();
