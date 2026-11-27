/**
 * スカイチームの BGM：夕方の進入路（ヘ長調・落ち着いて、少し晴れやかに）
 * 選んだわけ：2人で静かに集中して着陸させるゲームなので、夕焼けの空をゆっくり降りていくような曲
 * エレピの刻みとやわらかいドラムに、ピアノの主旋律。A' は終わりを変えて B の B♭ へ、B はパッドを敷いて高く上がる
 * 休憩の C はドラムとピアノを抜き、ベルが遠くで鳴る。最後の A は弦を足して、C7 で頭の F へ戻る
 */
(function () {
    const { repeat } = Sound;

    const HEAD = `A4:4 C5:4 F5:6 E5:2 | E5:4 C5:4 G5:8 | F5:4 D5:4 A5:6 G5:2 | G5:8 E5:4 C5:4 |
                  D5:4 F5:4 A5:6 C6:2 | D6:8 Bb5:4 F5:4`;
    const THEME = `${HEAD} | G5:4 Bb5:4 D6:4 C6:4 | C6:8 Bb5:4 G5:4`;
    // A' の終わり：F7 で B の B♭ へ
    const THEME_TURN = `${HEAD} | Bb5:4 A5:4 G5:4 E5:4 | F5:12 r:4`;

    const CHORDS_A = 'F | Am7 | Bbmaj7 | C | Dm7 | Bb | Gm7 | C7';
    const CHORDS_A2 = 'F | Am7 | Bbmaj7 | C | Dm7 | Bb | Gm7:8 C7:8 | F:8 F7:8';

    const KEYS = 'x-----x---x-----';
    const BASS = 'R:4 r:2 R:2 5:4 R:4';
    const DRUMS = {
        kick: repeat('x.......x.......', 8, '|'),
        snare: repeat('....o.......o...', 8, '|'),
        hat: repeat('x.x.x.x.x.x.x.x.', 8, '|')
    };
    const DRUMS_FILL = {
        kick: repeat('x.......x.......', 8, '|'),
        snare: repeat('....o.......o...', 7, '|') + '|....o.......o.oo',
        hat: repeat('x.x.x.x.x.x.x.x.', 8, '|')
    };

    const approach = {
        title: '夕方の進入路',
        tags: ['落ち着いた', '明るい'],
        genre: 'ゲーム音楽',
        melody: ['lead'],
        bpm: 96,
        gain: 0.095,
        swing: 0.06,
        swingUnit: 2,
        reverb: { seconds: 2.4, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.22, tone: 2400, reverb: 0.25 },
        humanize: { time: 0.004, velocity: 0.06 },
        parts: {
            lead: { instrument: 'piano', volume: 0.56, pan: -0.08, reverb: 0.25, delay: 0.1 },
            bell: { instrument: 'bell', volume: 0.3, pan: 0.3, reverb: 0.4, delay: 0.25 },
            keys: { instrument: 'epiano', mode: 'chords', center: 'E4', voices: 4, volume: 0.5, pan: 0.15, reverb: 0.25 },
            arp: { instrument: 'pluck', mode: 'arp', from: 'A3', volume: 0.45, pan: 0.25, reverb: 0.3, delay: 0.15 },
            pad: { instrument: 'pad', mode: 'chords', center: 'D4', voices: 3, volume: 0.25, pan: -0.2, reverb: 0.5 },
            strings: { instrument: 'strings', mode: 'chords', center: 'E4', voices: 3, volume: 0.3, pan: -0.25, attack: 0.4, release: 0.7, reverb: 0.45 },
            bass: { instrument: 'synthBass', mode: 'bass', octave: 2, wave: 'triangle', cutoff: 320, volume: 0.5, gate: 0.85 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.8, cutoff: 7000, levels: { kick: 0.5, snare: 0.35, hat: 0.3 } }
        },
        sections: {
            // イントロ：エレピとベースだけで4小節。C7 で主題へ
            intro: {
                label: 'イントロ',
                chords: 'F | Bbmaj7 | Gm7 | C7',
                keys: KEYS,
                bass: BASS,
                drums: { hat: repeat('x.x.x.x.x.x.x.x.', 4, '|') }
            },
            A: { chords: CHORDS_A, lead: THEME, keys: KEYS, bass: BASS, drums: DRUMS },
            // A'：ベルが主題の伸ばしに答え、F7 で B へ
            A2: {
                label: "A'",
                chords: CHORDS_A2,
                lead: THEME_TURN,
                bell: 'r:16 | r:8 E6:4 C6:4 | r:16 | r:8 G5:4 C6:4 | r:16 | r:8 F6:4 D6:4 | r:16 | r:16',
                keys: KEYS,
                bass: BASS,
                drums: DRUMS_FILL
            },
            // B：B♭ から高く上がる。パッドを敷き、C7 で休憩へ
            B: {
                chords: 'Bbmaj7 | C | Am7 | Dm7 | Gm7 | C | Bbmaj7:8 C:8 | C7',
                lead: `D6:6 C6:2 A5:8 | G5:6 E5:2 C5:8 | C6:4 A5:4 E5:4 G5:4 | F5:12 r:4 |
                       Bb5:6 A5:2 G5:8 | E5:4 G5:4 C6:8 | D6:4 F5:4 E5:4 G5:4 | G5:8 Bb5:4 C6:4`,
                keys: KEYS,
                pad: 'hold',
                bass: BASS,
                drums: DRUMS_FILL
            },
            // 休憩：ピアノとドラムを抜き、ベルとゆっくりの分散和音
            C: {
                chords: 'Dm7 | Bbmaj7 | F | C | Dm7 | Bbmaj7 | Gm7 | C7',
                bell: 'A5:8 F5:8 | D6:16 | C6:8 A5:8 | G5:16 | F5:8 A5:8 | D6:8 C6:8 | Bb5:16 | G5:8 E5:8',
                arp: '0:4 1 2 1',
                pad: 'hold',
                bass: 'R:16'
            },
            // 最後の A：弦を足して、C7 で頭の F へ戻る
            A3: { label: 'A', chords: CHORDS_A, lead: THEME, keys: KEYS, strings: 'hold', bass: BASS, drums: DRUMS_FILL }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A3']
    };

    Sound.register('sky-team', { songs: { approach } });
})();
