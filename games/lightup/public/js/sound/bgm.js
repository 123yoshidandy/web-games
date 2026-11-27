/**
 * ライトアップの BGM：灯りの回廊（変ホ長調・3拍子・ゆったりと）
 * 選んだわけ：暗い美術館に明かりを1つずつ置いていく遊びなので、夜の回廊を灯りを持って歩くような、静かなワルツにした
 * フルートの主題に、ハープの分散和音と弦。B は少し高く、休憩の C はドラムを抜く。2回目の A は弦を足し、最後の A' はベルで答える
 */
(function () {
    const { repeat } = Sound;

    const HEAD = 'G5:6 Bb5:3 G5:3 | G5:6 Eb5:6 | C6:6 Bb5:3 Ab5:3 | F5:9 r:3 | G5:6 Bb5:3 C6:3 | D6:6 Bb5:6';
    const THEME = `${HEAD} | C6:3 Bb5:3 Ab5:3 G5:3 | F5:9 r:3`;
    const THEME_END = `${HEAD} | Ab5:3 G5:3 F5:3 D5:3 | Eb5:9 r:3`;
    const BRIDGE = 'Eb5:3 Ab5:3 C6:6 | D6:6 Bb5:3 F5:3 | G5:3 Bb5:3 D6:6 | C6:6 G5:6 | C6:6 Ab5:6 | Bb5:6 F5:6 | G5:3 Bb5:3 G5:3 Eb5:3 | F5:3 Ab5:3 D5:3 F5:3';
    const REST = 'r:6 Bb5:6 | G5:12 | r:6 C6:6 | Bb5:6 G5:6 | r:6 G5:6 | Ab5:6 F5:6 | Eb5:12 | D5:6 F5:3 r:3';
    // 最後の A' で、主旋律の伸ばしている所にベルで短く答える
    const ECHO = 'r:12 | r:6 Bb5:6 | r:12 | r:6 D6:3 Bb5:3 | r:12 | r:6 D6:6 | r:12 | r:6 Eb6:3 r:3';

    const CHORDS_A = 'Eb | Cm7 | Abmaj7 | Bb | Eb | Gm7 | Abmaj7 | Bb7';
    const CHORDS_A2 = 'Eb | Cm7 | Abmaj7 | Bb | Eb | Gm7 | Fm7:6 Bb7:6 | Eb';
    const CHORDS_B = 'Abmaj7 | Bb | Gm7 | Cm7 | Fm7 | Bb | Gm7:6 Cm7:6 | Fm7:6 Bb7:6';
    const CHORDS_C = 'Ebmaj7 | Abmaj7 | Ebmaj7 | Abmaj7 | Cm7 | Fm7 | Abmaj7 | Bb7';

    const ARP = '0:2 1 2 3 2 1';
    const BASS = 'R:6 5:6';
    const DRUMS = {
        kick: repeat('x...........', 8, '|'),
        hat: repeat('....o...o...', 8, '|')
    };

    const lantern = {
        title: '灯りの回廊',
        tags: ['落ち着いた', '神秘的'],
        genre: 'ワルツ',
        melody: ['lead'],
        stepsPerBar: 12,
        bpm: 96,
        gain: 0.1,
        reverb: { seconds: 2.6, tone: 0.45 },
        delay: { time: 0.75, feedback: 0.22, tone: 2000, reverb: 0.3 },
        humanize: { time: 0.006, velocity: 0.07 },
        parts: {
            lead: { instrument: 'flute', volume: 0.5, pan: -0.05, reverb: 0.3, delay: 0.1 },
            bell: { instrument: 'bell', volume: 0.28, pan: 0.3, reverb: 0.35, delay: 0.15 },
            arp: { instrument: 'pluck', brightness: 0.75, mode: 'arp', from: 'C4', volume: 0.6, pan: 0.2, reverb: 0.3 },
            strings: { instrument: 'strings', mode: 'chords', center: 'Bb3', voices: 3, volume: 0.3, pan: -0.2, attack: 0.5, release: 0.8, reverb: 0.45 },
            bass: { instrument: 'pluck', mode: 'bass', octave: 2, volume: 1, gate: 0.85 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 0.8, cutoff: 5000, levels: { kick: 0.4, hat: 0.3 } }
        },
        sections: {
            // イントロ：ハープとベースだけで4小節。Bb7 で主題へ
            intro: { label: 'イントロ', chords: 'Eb | Cm7 | Abmaj7 | Bb7', arp: ARP, bass: BASS },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, arp: ARP, bass: BASS, drums: DRUMS },
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_END, arp: ARP, bass: BASS, drums: DRUMS },
            B: { label: 'B', chords: CHORDS_B, lead: BRIDGE, arp: ARP, bass: BASS, drums: DRUMS, strings: 'hold' },
            // 休憩：ドラムを抜き、弦と遅い分散和音
            C: { label: 'C', chords: CHORDS_C, lead: REST, arp: '0:6 2', strings: 'hold', bass: 'R:12' },
            A3: { label: 'A（弦）', chords: CHORDS_A, lead: THEME, arp: ARP, bass: BASS, drums: DRUMS, strings: 'hold' },
            A4: { label: "A'（ベル）", chords: CHORDS_A2, lead: THEME_END, bell: ECHO, arp: ARP, bass: BASS, drums: DRUMS, strings: 'hold' }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A3', 'A4']
    };

    Sound.register('lightup', { songs: { lantern } });
})();
