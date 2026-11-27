/**
 * 四角に切れの BGM：折り紙（ニ長調・軽快に）
 * 選んだわけ：盤面を長方形に切り分けていく、はさみと紙の手仕事なので、マリンバの軽い主題で、手が進むような明るい曲にした
 * マリンバの主題に、はじく弦の分散和音とシンセのベース。B はエレピの裏拍を足し、休憩の C はドラムを抜いて弦とパッドを敷き、最後の A は鈴の合いの手を足す
 */
(function () {
    const { repeat } = Sound;

    const HEAD = 'F#5:2 A5:2 D6:4 A5:2 F#5:2 A5:4 | B5:6 A5:2 F#5:8 | G5:2 B5:2 D6:4 B5:2 G5:2 B5:4 | A5:6 E5:2 C#5:8 | D5:2 F#5:2 A5:4 B5:2 A5:2 F#5:4 | A5:6 C#6:2 E5:8';
    const THEME = `${HEAD} | G5:4 B5:4 D6:4 B5:4 | C#6:8 r:4 A5:4`;
    const THEME_END = `${HEAD} | G5:4 B5:4 E5:4 C#5:4 | D5:12 r:4`;
    const BRIDGE = 'B5:4 D6:4 G5:8 | E5:4 A5:4 C#6:8 | C#6:6 A5:2 F#5:8 | D6:6 B5:2 F#5:4 A5:4 | G5:6 B5:2 E5:8 | A5:6 C#6:2 F#5:8 | B5:4 A5:2 G5:2 D6:8 | C#6:6 B5:2 A5:4 G5:4';
    const REST = 'r:8 B5:8 | A5:16 | r:8 D6:8 | F#5:16 | r:8 G5:8 | A5:16 | r:8 B5:8 | C#6:12 r:4';
    const BELL = 'r:16 | r:8 D6:4 C#6:4 | r:16 | r:8 E6:8 | r:16 | r:8 E6:8 | r:16 | r:8 E6:4 G6:4';

    const CHORDS_A = 'D | Bm7 | Gmaj7 | A | D | F#m7 | Em7 | A7';
    const CHORDS_A2 = 'D | Bm7 | Gmaj7 | A | D | F#m7 | Em7:8 A7:8 | D';
    const CHORDS_B = 'Gmaj7 | A | F#m7 | Bm7 | Em7 | F#m7 | Gmaj7 | A7';
    const CHORDS_C = 'Gmaj7 | Dmaj7 | Gmaj7 | Dmaj7 | Em7 | F#m7 | Gmaj7 | A7';

    const ARP = '0:2 1 2 3 2 1 2 1';
    const KEYS = '..x...x...x...x.';
    const BASS = 'R:4 r:2 R:2 5:4 R:4';
    const DRUMS = {
        kick: repeat('x.......x.x.....', 8, '|'),
        snare: repeat('....o.......o...', 8, '|'),
        hat: repeat('x.o.x.o.x.o.x.o.', 8, '|')
    };

    const origami = {
        title: '折り紙',
        tags: ['明るい', '軽快'],
        genre: 'ポップ',
        melody: ['lead'],
        bpm: 112,
        gain: 0.11,
        reverb: { seconds: 1.8, tone: 0.55 },
        delay: { time: 0.75, feedback: 0.18, tone: 2400, reverb: 0.2 },
        humanize: { time: 0.004, velocity: 0.07 },
        parts: {
            lead: { instrument: 'marimba', volume: 0.57, pan: -0.1, reverb: 0.22, delay: 0.12 },
            arp: { instrument: 'pluck', mode: 'arp', from: 'A3', brightness: 0.5, volume: 0.5, pan: 0.25, reverb: 0.2 },
            keys: { instrument: 'epiano', mode: 'chords', center: 'E4', voices: 3, volume: 0.5, pan: -0.25, reverb: 0.25 },
            bell: { instrument: 'bell', volume: 0.28, pan: 0.3, reverb: 0.35, delay: 0.15 },
            strings: { instrument: 'strings', mode: 'chords', center: 'D4', voices: 3, volume: 0.27, pan: -0.2, attack: 0.5, release: 0.8, reverb: 0.45 },
            pad: { instrument: 'pad', mode: 'chords', center: 'B3', voices: 3, volume: 0.27, pan: 0.1, reverb: 0.4 },
            bass: { instrument: 'synthBass', mode: 'bass', octave: 2, volume: 0.48, gate: 0.7 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.85, cutoff: 6500, levels: { kick: 0.4, snare: 0.28, hat: 0.3 } }
        },
        sections: {
            // イントロ：分散和音とベースだけで4小節。A で主題へ
            intro: { label: 'イントロ', chords: 'D | Gmaj7 | Em7 | A', arp: ARP, bass: BASS },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, arp: ARP, bass: BASS, drums: DRUMS },
            B: { label: 'B', chords: CHORDS_B, lead: BRIDGE, arp: ARP, keys: KEYS, bass: BASS, drums: DRUMS },
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_END, arp: ARP, bass: BASS, drums: DRUMS, strings: 'hold' },
            // 休憩：ドラムと分散和音を抜き、弦とパッドをゆっくり
            C: { label: 'C', chords: CHORDS_C, lead: REST, strings: 'hold', pad: 'hold', bass: 'R:16' },
            // 最後の A：鈴の合いの手を足す。A7 でループの頭へ
            A3: { label: 'A', chords: CHORDS_A, lead: THEME, bell: BELL, arp: ARP, bass: BASS, drums: DRUMS }
        },
        intro: ['intro'],
        loop: ['A', 'B', 'A2', 'C', 'A3']
    };

    Sound.register('shikaku', { songs: { origami } });
})();
