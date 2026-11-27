// packages/sound 0.4.0 からコピーしたファイル。ここでは直さず、packages/sound で直してから同期する
/**
 * すべてのゲームで使う共通の効果音（packages/sound）
 * engine.js のあとに読む。Sound.register('common', { effects }) で登録し、どのゲームのプレイヤーからも sound.play('<名前>') で鳴らせる
 * ゲームの bgm.js の effects に同じ名前を書けば、そのゲームだけ差し替えられる
 *
 * 名前と意味（ゲームのできごとへの当て方は README の表）:
 *   select  選ぶ・押す        place  置く・動かす      capture  取る・ひっくり返す
 *   cancel  取り消す・戻す    error  できない操作      turn     自分の番になった
 *   notify  相手が動いた・知らせ
 *   dice    さいころを振る    draw   カードを引く・めくる  shuffle  カードを切る
 *   gain    点・資源を得る    pay    払う・失う
 *   win     勝ち・クリア      lose   負け
 *
 * 音量（targets）は、鳴らしたときの最大の瞬間ラウドネス（LUFS）の目安。よく鳴る音ほど小さい（docs/composing.md の音量の目安）
 * tools/measure.mjs --common とテストが、この目安から 2dB 以内か・ピークが -1dBFS より下かを確かめる
 * 層の音量は db(-26) のように dB で書く（楽器は volume 1 で -20 LUFS 前後と大きいので、20〜35dB 下げる）
 */
(function () {
    const db = (value) => 10 ** (value / 20);
    const soft = { instrument: 'drums', kit: 'soft' };
    const brush = { instrument: 'drums', kit: 'brush' };

    const effects = {
        // 選ぶ：小さく短い木の音
        select: [
            { instrument: { instrument: 'marimba', decay: 0.5 }, notes: 'A5:1', unit: 0.04, volume: db(-26) }
        ],
        // 置く：駒を盤に置く、低めの木の音
        place: [
            { instrument: { instrument: 'marimba', decay: 0.6 }, notes: 'E4:1', unit: 0.05, volume: db(-29) },
            { instrument: soft, notes: 'rim:1@0.35', volume: db(-33) }
        ],
        // 取る：相手の駒を取る・ひっくり返す。短く2つ下がる
        capture: [
            { instrument: 'xylophone', notes: 'E5:1 B4:2', unit: 0.06, volume: db(-30) },
            { instrument: soft, notes: 'rim:1@0.5', volume: db(-31) }
        ],
        // 取り消す：選ぶのを逆に、そっと下がる
        cancel: [
            { instrument: { instrument: 'marimba', decay: 0.5 }, notes: 'E5:1 A4:2', unit: 0.06, volume: db(-34) }
        ],
        // できない：低めの音を2回。責めない程度に
        error: [
            { instrument: 'clarinet', notes: 'Bb3:2 r:1 Bb3:3', unit: 0.05, volume: db(-20), gate: 0.8 }
        ],
        // 自分の番：明るい2音のチャイム
        turn: [
            { instrument: { instrument: 'vibes', decay: 0.6, ring: 0.1 }, notes: 'G5:2 C6:4', unit: 0.08, volume: db(-24), reverb: 0.2 }
        ],
        // 知らせ：相手が動いた・メッセージが来た。turn より控えめ
        notify: [
            { instrument: { instrument: 'kalimba', decay: 0.5 }, notes: 'E5:1 A5:3', unit: 0.06, volume: db(-29), reverb: 0.15 }
        ],
        // さいころ：盤の上を転がって止まる
        dice: [
            { instrument: soft, notes: 'rim:1@0.6 r:1 rim:1@0.9 rim:1@0.5 r:2 rim:1@0.8 r:3 rim:1@0.45 r:4 rim:1@0.3', unit: 0.025, volume: db(-12) },
            { instrument: soft, notes: 'shaker:1@0.6 r:3 shaker:1@0.4', unit: 0.05, volume: db(-14), cutoff: 4000 }
        ],
        // 引く・めくる：カードがこすれる音
        draw: [
            { instrument: brush, notes: 'swish:1', volume: db(-7), cutoff: 2500 },
            { instrument: soft, notes: 'r:1 hat:1@0.4', unit: 0.08, volume: db(-12), cutoff: 4000 }
        ],
        // 切る：カードをぱらぱらと何度もこする
        shuffle: [
            { instrument: brush, notes: 'swish:1@0.6 swish:1@0.8 swish:1@0.6 swish:1@0.9 swish:1@0.7', unit: 0.08, volume: db(-9), cutoff: 2500 },
            { instrument: soft, notes: 'hat:1@0.3 hat:1@0.4 hat:1@0.3 hat:1@0.4 hat:1@0.3 hat:1@0.5', unit: 0.06, volume: db(-15), cutoff: 4000 }
        ],
        // 得る：上がる3音と、きらっとするベル
        gain: [
            { instrument: 'marimba', notes: 'C5:1 E5:1 G5:2', unit: 0.05, volume: db(-32) },
            { instrument: { instrument: 'bell', decay: 0.8 }, notes: 'C6:2', at: 0.1, volume: db(-39), reverb: 0.15 }
        ],
        // 払う・失う：得るの逆に、下がる3音
        pay: [
            { instrument: { instrument: 'kalimba', decay: 0.5 }, notes: 'G5:1 E5:1 C5:2', unit: 0.05, volume: db(-34) }
        ],
        // 勝ち・クリア：上がる分散和音から、和音で締める
        win: [
            { instrument: 'marimba', notes: 'C5:1 E5:1 G5:1 C6:2 r:1 G5:1 C6:6', unit: 0.08, volume: db(-17), reverb: 0.2 },
            { instrument: 'epiano', notes: 'r:7 [C4,E4,G4,C5]:10', unit: 0.08, volume: db(-20), reverb: 0.25 },
            { instrument: { instrument: 'bell', decay: 1.5 }, notes: 'r:7 E6:8', unit: 0.08, volume: db(-24), reverb: 0.3 }
        ],
        // 負け：短調でゆっくり下がる。重くしすぎない
        lose: [
            { instrument: 'epiano', notes: 'C5:2 G4:2 Eb4:2 [C4,Eb4,G4]:8', unit: 0.11, volume: db(-15), reverb: 0.25 }
        ]
    };

    // 最大の瞬間ラウドネス（LUFS）の目安
    const targets = {
        select: -47, place: -44, capture: -42, cancel: -47, error: -38, turn: -37, notify: -41,
        dice: -42, draw: -45, shuffle: -43, gain: -40, pay: -43, win: -24, lose: -28
    };

    Sound.register(Sound.commonLibrary, { effects, targets });
})();
