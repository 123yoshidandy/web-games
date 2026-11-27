/**
 * MINE BLOCKS の BGM：積み木の工房（ハ長調・弾むように）
 * 選んだわけ：ピースを置いては外して形を探すパズルなので、考える邪魔をしない、軽く弾む曲にした。
 * 前のチップチューンの BGM（矩形波で13秒のループ）の主題をそのまま残し、1オクターブ下のマリンバで柔らかく弾く
 * A はマリンバの主題とエレピの和音。A' はフルートが主題の伸ばしに答え、終わりを Dm7・G7 にする。
 * B はフルートが主旋律を受け取り、ハープの分散和音が入る。休憩の C はドラムを抜き、マリンバがゆっくり歌う
 */
(function () {
    const { repeat } = Sound;

    // 主題（前の BGM のメロディを1オクターブ下げたもの）。前半6小節は A' でも同じ
    const THEME_HEAD = `E4:2 G4:2 C5:3 B4:1 C5:2 G4:2 E4:4 | A4:2 C5:2 E5:3 D5:1 C5:2 A4:2 E4:4 |
                        F4:2 A4:2 C5:2 A4:2 D5:4 C5:2 A4:2 | B4:2 D5:2 G4:2 B4:2 D5:4 r:4 |
                        E5:2 D5:2 C5:2 G4:2 A4:2 G4:2 E4:4 | C5:2 B4:2 A4:2 E4:2 A4:2 B4:2 C5:4`;
    const THEME = `${THEME_HEAD} | A4:2 C5:2 F5:2 E5:2 D5:2 C5:2 A4:2 C5:2 | D5:2 B4:2 G4:2 B4:2 D5:4 G5:4`;
    // A' の終わり：Dm7・G7 で次の区間へ
    const THEME_TURN = `${THEME_HEAD} | A4:2 C5:2 F5:2 E5:2 D5:2 C5:2 A4:2 C5:2 | B4:2 D5:2 F5:2 D5:2 B4:4 G4:4`;
    // A' のフルート：主題が伸ばしている所に、短く答える
    const REPLY = 'r:12 G5:2 A5:2 | r:12 G5:4 | r:16 | r:12 A5:2 B5:2 | r:12 C6:4 | r:12 E5:4 | r:16 | r:8 B5:4 D6:4';

    // B：フルートが伸ばす旋律。ヘ長調の方へ開き、Gsus4・G でハ長調へ戻る
    const SONG_B = `A4:4 C5:4 E5:6 D5:2 | G4:4 B4:4 D5:6 C5:2 | F4:4 A4:4 C5:4 D5:4 | B4:8 D5:4 G4:4 |
                    C5:4 E5:4 A5:6 G5:2 | G5:4 E5:4 B4:6 D5:2 | C5:4 E5:4 A5:4 G5:4 | F5:4 D5:4 B4:8`;
    // 休憩の C：マリンバがゆっくり歌う
    const REST = 'E5:8 C5:8 | A4:8 C5:8 | G4:8 E5:8 | D5:16 | C5:8 E5:8 | A5:8 G5:8 | F5:8 D5:8 | B4:8 D5:4 F5:4';

    const CHORDS_A = 'C | Am | F | G | C | Am | F | G';
    const CHORDS_A2 = 'C | Am | F | G | C | Am | Dm7 | G7';
    const CHORDS_B = 'Fmaj7 | Em7 | Dm7 | G | Fmaj7 | Em7 | Am7 | Gsus4:8 G:8';
    const CHORDS_C = 'Am7 | Fmaj7 | C | G | Am7 | Fmaj7 | Dm7 | G7';

    const KEYS = 'x-------x---x---';
    const BASS = 'R:4 r:2 R:2 5:4 R+:4';
    const DRUMS_A = {
        kick: repeat('x.....x...x.....', 8, '|'),
        rim: repeat('....x.......x...', 8, '|'),
        hat: repeat('x.o.x.o.x.o.x.o.', 8, '|')
    };
    const DRUMS = {
        kick: repeat('x.....x...x.....', 8, '|'),
        snare: repeat('....x.......x...', 8, '|'),
        hat: repeat('x.o.x.o.x.o.x.o.', 8, '|')
    };
    const DRUMS_B = { ...DRUMS, shaker: repeat('.o.o.o.o.o.o.o.o', 8, '|') };

    const workshop = {
        title: '積み木の工房',
        tags: ['明るい', '軽快'],
        genre: 'ゲーム音楽',
        melody: ['lead', 'flute'],
        bpm: 112,
        gain: 0.071,
        reverb: { seconds: 2, tone: 0.5 },
        delay: { time: 0.75, feedback: 0.2, tone: 2200, reverb: 0.2 },
        humanize: { time: 0.006, velocity: 0.08 },
        parts: {
            lead: { instrument: 'marimba', volume: 0.7, pan: -0.1, reverb: 0.2, delay: 0.08 },
            flute: { instrument: 'flute', volume: 0.85, pan: 0.2, reverb: 0.3, delay: 0.12 },
            keys: { instrument: 'epiano', mode: 'chords', center: 'E4', voices: 4, volume: 0.6, pan: 0.15, reverb: 0.25 },
            harp: { instrument: 'pluck', brightness: 0.75, mode: 'arp', from: 'C4', volume: 0.6, pan: -0.25, reverb: 0.3 },
            bass: { instrument: 'synthBass', wave: 'triangle', cutoff: 900, mode: 'bass', octave: 2, volume: 0.6, gate: 0.85 },
            drums: { instrument: 'drums', kit: 'soft', mode: 'drums', volume: 1.1, cutoff: 5000, levels: { kick: 0.45, snare: 0.3, rim: 0.35, hat: 0.3, shaker: 0.4 } }
        },
        sections: {
            // イントロ：和音とベースと、ハイハットだけで4小節。G7 で主題へ
            intro: { label: 'イントロ', chords: 'Fmaj7 | Em7 | Dm7 | G7', keys: KEYS, bass: BASS, drums: { hat: repeat('x.o.x.o.x.o.x.o.', 4, '|') } },
            A: { label: 'A', chords: CHORDS_A, lead: THEME, keys: KEYS, bass: BASS, drums: DRUMS_A },
            A2: { label: "A'", chords: CHORDS_A2, lead: THEME_TURN, flute: REPLY, keys: KEYS, bass: BASS, drums: DRUMS },
            B: { label: 'B', chords: CHORDS_B, flute: SONG_B, harp: '0:2 1 2 3 2 1 2 1', keys: 'x---------------', bass: BASS, drums: DRUMS_B },
            // 休憩：ドラムを抜き、和音を伸ばす
            C: { label: 'C', chords: CHORDS_C, lead: REST, keys: 'x---------------', harp: '0:4 1 2 1', bass: 'R:16' }
        },
        intro: ['intro'],
        loop: ['A', 'A2', 'B', 'C', 'A2']
    };

    Sound.register('mine-blocks', { songs: { workshop } });
})();
