/**
 * テントの BGM：たき火（ニ長調・軽やかに）
 * 選んだわけ：森の木のそばにテントを張っていく遊びなので、キャンプ場のたき火のそばで鳴らすような、素朴な曲にした
 * オカリナの主題に、ギターのかき鳴らしとはじく弦のベース。B はアコーディオンを足し、休憩の C はドラムを抜く。最後の A' はベルで答える
 */
(function () {
    const { repeat } = Sound;

    const HEAD = 'A4:4 D5:4 F#5:6 E5:2 | D5:4 G5:4 B5:8 | A5:2 B5:2 F#5:4 D5:8 | E5:4 C#5:4 A4:8 | A4:4 D5:4 F#5:6 A5:2 | B5:4 A5:4 G5:8';
    const THEME = `${HEAD} | G5:4 F#5:2 E5:2 D5:8 | E5:12 r:4`;
    const THEME_END = `${HEAD} | G5:4 B5:4 A5:4 G5:4 | F#5:4 D5:8 r:4`;
    const BRIDGE = 'B5:4 G5:4 D5:8 | C#6:4 A5:4 E5:8 | A5:4 F#5:4 C#5:8 | D5:4 F#5:4 B5:8 | G5:4 B5:4 D6:8 | C#6:4 B5:2 A5:2 E5:8 | D5:4 G5:4 E5:4 A5:4 | F#5:4 D5:4 E5:4 C#5:4';
    const REST = 'r:8 A5:8 | B5:16 | r:8 F#5:8 | B5:8 A5:8 | r:8 D6:8 | B5:8 G5:8 | F#5:16 | E5:8 C#5:4 r:4';
    // 最後の A' で、主旋律の伸ばしている所にベルで短く答える
    const ECHO = 'r:16 | r:8 D6:4 B5:4 | r:16 | r:8 C#6:4 A5:4 | r:16 | r:8 D6:8 | r:16 | r:8 A5:4 r:4';

    const CHORDS_A = 'D | G | Bm | A | D | G | Em7 | A7';
    const CHORDS_A2 = 'D | G | Bm | A | D | G | Em7:8 A7:8 | D';
    const CHORDS_B = 'G | A | F#m7 | Bm | Em7 | A | G:8 A:8 | Bm7:8 A7:8';
    const CHORDS_C = 'Dmaj7 | Gmaj7 | Dmaj7 | Gmaj7 | Bm7 | Em7 | Gmaj7 | A7';

    const STRUM = 'x---x-x-x---x-x-';
    const BASS = 'R:4 r:4 5:4 r:4';
    const DRUMS = {
        kick: repeat('x.......x.......', 8, '|'),
        snare: repeat('....x.......x...', 8, '|'),
        hat: repeat('x...x...x...x.o.', 8, '|')
    };
    const DRUMS_FILL = {
        kick: repeat('x.......x.......', 8, '|'),
        snare: repeat('....x.......x...', 7, '|') + '|....x.......x.xx',
        hat: repeat('x...x...x...x.o.', 8, '|')
    };

    const campfire = {
        title: 'たき火',
        tags: ['明るい', '落ち着いた'],
        genre: 'フォーク',
        melody: ['lead'],
        bpm: 120,
        gain: 0.1,
        reverb: { seconds: 1.6, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.18, tone: 2200, reverb: 0.2 },
        humanize: { time: 0.006, velocity: 0.08 },
        parts: {
            lead: { instrument: 'ocarina', volume: 0.5, pan: 0.05, reverb: 0.22, delay: 0.08 },
            bell: { instrument: 'bell', volume: 0.28, pan: -0.3, reverb: 0.3, delay: 0.12 },
            strum: { instrument: 'guitar', mode: 'chords', center: 'E4', voices: 3, strum: 0.014, brightness: 0.4, gate: 0.9, volume: 0.42, pan: -0.2, reverb: 0.2 },
            accordion: { instrument: 'accordion', mode: 'chords', center: 'A3', voices: 3, volume: 0.4, pan: 0.25, reverb: 0.3 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, volume: 1.1, gate: 0.8 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.85, cutoff: 6000, levels: { kick: 0.4, snare: 0.28, hat: 0.3 } }
        },
        sections: {
            // イントロ：ギターとベースだけで4小節。A7 で主題へ
            intro: { label: 'イントロ', chords: 'D | G | Em7 | A7', strum: STRUM, bass: BASS },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, strum: STRUM, bass: BASS, drums: DRUMS },
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_END, strum: STRUM, bass: BASS, drums: DRUMS_FILL },
            B: { label: 'B', chords: CHORDS_B, lead: BRIDGE, strum: STRUM, accordion: 'hold', bass: BASS, drums: DRUMS },
            // 休憩：ドラムを抜き、ギターをゆっくりにしてアコーディオンを敷く
            C: { label: 'C', chords: CHORDS_C, lead: REST, strum: 'x-------x-------', accordion: 'hold', bass: 'R:16' },
            A3: { label: 'A（アコーディオン）', chords: CHORDS_A, lead: THEME, strum: STRUM, accordion: 'hold', bass: BASS, drums: DRUMS },
            A4: { label: "A'（ベル）", chords: CHORDS_A2, lead: THEME_END, bell: ECHO, strum: STRUM, bass: BASS, drums: DRUMS_FILL }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A3', 'A4']
    };

    Sound.register('tents', { songs: { campfire } });
})();
