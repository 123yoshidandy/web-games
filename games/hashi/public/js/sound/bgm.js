/**
 * 橋をかけろの BGM：港の朝（ヘ長調・8分の6拍子・ゆったりと）
 * 選んだわけ：島から島へ橋を渡していくパズルなので、波に揺られるような舟歌の拍子にした。考えるのを邪魔しないよう、ゆっくりにした
 * ピアノの主題に、ギターのかき鳴らしとはじく弦のベース。休憩の C はドラムを抜いて弦とパッドを敷き、最後の A は鈴の合いの手と弦を足す
 */
(function () {
    const { repeat } = Sound;

    const HEAD = 'C5:4 F5:2 A5:4 G5:2 | F5:6 D5:4 E5:2 | D5:4 G5:2 Bb5:4 A5:2 | G5:9 r:3 | A5:4 C6:2 A5:4 F5:2 | E5:6 C5:4 E5:2';
    const THEME = `${HEAD} | D5:4 F5:2 A5:4 Bb5:2 | G5:6 E5:4 r:2`;
    const THEME_END = `${HEAD} | Bb5:4 A5:2 G5:4 E5:2 | F5:9 r:3`;
    const BRIDGE = 'D6:6 C6:4 Bb5:2 | C6:6 G5:6 | C6:4 A5:2 E5:4 G5:2 | F5:9 r:3 | Bb5:6 A5:4 G5:2 | A5:6 C6:6 | D6:4 C6:2 Bb5:4 A5:2 | G5:6 Bb5:4 r:2';
    const REST = 'r:6 A5:6 | F5:12 | r:6 C6:6 | A5:12 | r:6 F5:6 | D5:12 | r:6 F5:6 | G5:12';
    const BELL = 'r:12 | r:6 A5:6 | r:12 | r:6 C6:2 D6:2 E6:2 | r:12 | r:6 G5:6 | r:12 | r:6 E6:6';

    const CHORDS_A = 'F | Dm7 | Gm7 | C7 | F | Am7 | Bbmaj7 | C7';
    const CHORDS_A2 = 'F | Dm7 | Gm7 | C7 | F | Am7 | Gm7:6 C7:6 | F';
    const CHORDS_B = 'Bbmaj7 | C | Am7 | Dm7 | Gm7 | Am7 | Bb | C7';
    const CHORDS_C = 'Fmaj7 | Bbmaj7 | Fmaj7 | Bbmaj7 | Dm7 | Gm7 | Bbmaj7 | C7';

    // 8分の6拍子：1拍目と4拍目に重み
    const STRUM = 'x---x-x---x-';
    const BASS = 'R:6 5:6';
    const DRUMS = {
        kick: repeat('x.....x.....', 8, '|'),
        snare: repeat('......o.....', 8, '|'),
        hat: repeat('x.o.o.x.o.o.', 8, '|')
    };

    const harbor = {
        title: '港の朝',
        tags: ['落ち着いた', '明るい'],
        genre: '舟歌',
        melody: ['lead'],
        meter: '6/8',
        bpm: 84,
        stepsPerBar: 12,
        gain: 0.097,
        reverb: { seconds: 2.4, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.2, tone: 2200, reverb: 0.25 },
        humanize: { time: 0.006, velocity: 0.06 },
        parts: {
            lead: { instrument: 'piano', volume: 0.5, pan: -0.05, reverb: 0.25, delay: 0.1 },
            guitar: { instrument: 'guitar', mode: 'chords', center: 'A3', voices: 4, strum: 0.025, brightness: 0.5, volume: 0.4, pan: 0.25, reverb: 0.25 },
            bell: { instrument: 'bell', volume: 0.3, pan: 0.3, reverb: 0.35, delay: 0.15 },
            strings: { instrument: 'strings', mode: 'chords', center: 'C4', voices: 3, volume: 0.3, pan: -0.25, attack: 0.6, release: 0.9, reverb: 0.45 },
            pad: { instrument: 'pad', mode: 'chords', center: 'A3', voices: 3, volume: 0.3, pan: 0.1, reverb: 0.4 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, brightness: 0.3, volume: 1, gate: 0.8 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.85, cutoff: 6000, levels: { kick: 0.4, snare: 0.28, hat: 0.3 } }
        },
        sections: {
            // イントロ：ギターとベースだけで4小節。C7 で主題へ
            intro: { label: 'イントロ', chords: 'F | Bbmaj7 | Gm7 | C7', guitar: STRUM, bass: BASS },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, guitar: STRUM, bass: BASS, drums: DRUMS },
            B: { label: 'B', chords: CHORDS_B, lead: BRIDGE, guitar: STRUM, bass: BASS, drums: DRUMS, strings: 'hold' },
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_END, guitar: STRUM, bass: BASS, drums: DRUMS },
            // 休憩：ドラムとギターを抜き、弦とパッドをゆっくり
            C: { label: 'C', chords: CHORDS_C, lead: REST, strings: 'hold', pad: 'hold', bass: 'R:12' },
            // 最後の A：鈴の合いの手と弦を足す。C7 でループの頭へ
            A3: { label: 'A', chords: CHORDS_A, lead: THEME, bell: BELL, guitar: STRUM, bass: BASS, drums: DRUMS, strings: 'hold' }
        },
        intro: ['intro'],
        loop: ['A', 'B', 'A2', 'C', 'A3']
    };

    Sound.register('hashi', { songs: { harbor } });
})();
