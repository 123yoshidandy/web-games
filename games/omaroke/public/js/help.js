/**
 * 遊び方の中身（カードの効果と特殊状態は data.js から作る）
 */

import { CARDS, STATUSES, WEATHERS, HAND_LIMIT } from './data.js';
import { icon, cardArt } from './art.js';

const KIND_NAMES = { attack: '攻撃', dodge: 'よける', tool: 'どうぐ', item: 'もちもの（バトルポケモンに 1 つ）', event: 'イベント' };

export function helpMarkup() {
    const byKind = kind => Object.entries(CARDS).filter(([, c]) => c.kind === kind)
        .map(([k, c]) => `<li>${cardArt(k)}<span><b>${c.name}</b>（${c.count}）：${c.text}</span></li>`).join('');
    return `
    <section>
        <h3>役割と勝ち方</h3>
        <p>役割は配られて、ジムリーダーだけが公開される。ほかの人の役割は、行動から見抜く。</p>
        <ul class="roles">
            <li>${icon('leader', 'help-icon')}<span><b>ジムリーダー</b>・${icon('trainer', 'help-icon')}<b>ジムトレーナー</b>：挑戦者とロケット団員を全員退場させる（トレーナーは退場していても勝つ）</span></li>
            <li>${icon('challenger', 'help-icon')}<span><b>挑戦者</b>：ジムリーダーを退場させる</span></li>
            <li>${icon('rocket', 'help-icon')}<span><b>ロケット団員</b>：ジムリーダー以外を退場させ、最後にジムリーダーを退場させる</span></li>
        </ul>
        <p>4 人は 1 人ずつ。5 人は挑戦者 2 人、6 人は挑戦者 3 人。ジムリーダーのポケモンは、5 人で HP +1、6 人で HP +2（玄人は 5 人以上で各 +1）。</p>
    </section>
    <section>
        <h3>相棒のポケモン</h3>
        <p><b>基本ルール</b>：Lv3 のポケモンを 2 枚から 1 匹選ぶ。<b>玄人ルール</b>：Lv1 を 4 枚から 2 匹選ぶ（先に選んだ方がバトル、もう 1 匹がベンチ）。玄人は番に 1 回交代でき、攻撃しなかった番の終わりに 1 匹を進化させられる。</p>
        <p>攻撃は、バトルポケモンのわざで行う。ポケモンの HP が 0 になると、持ち主から順にキズぐすりで助けられる。誰も助けなければひんし。ポケモンが全員ひんしになったら退場し、役割を公開する。わざでひんしにした人は 1 枚引く。</p>
    </section>
    <section>
        <h3>手番</h3>
        <ol>
            <li>山札から 2 枚引く</li>
            <li>カードを好きなだけ使う（「くらえ！」は番に 1 回）</li>
            <li>手札を ${HAND_LIMIT} 枚まで捨てる</li>
        </ol>
        <p>ジムリーダーから順に回る。残りが 2 人になると、キズぐすり・げんきのかけらは使えない。</p>
    </section>
    <section>
        <h3>おてんきチェック</h3>
        <p>山札の上を 1 枚めくり、左上のマーク（${Object.entries(WEATHERS).map(([k, w]) => `${icon(k, 'help-icon')}${w.name}`).join('・')}）で効果が決まる。わざの追加効果や特性で使う。</p>
    </section>
    <section>
        <h3>特殊状態</h3>
        <ul>${Object.values(STATUSES).map(s => `<li><b>${s.name}</b>：${s.text}</li>`).join('')}</ul>
        <p>ポケモンがなれる特殊状態は 1 つだけ。</p>
    </section>
    ${['attack', 'dodge', 'tool', 'item', 'event'].map(kind => `<section><h3>${KIND_NAMES[kind]}</h3><ul class="cards">${byKind(kind)}</ul></section>`).join('')}
    <section>
        <h3>操作</h3>
        <p>手札のカードを押し、光った人を押して使う。上の欄を押すと、その人のポケモンの説明が見られる。</p>
    </section>`;
}
