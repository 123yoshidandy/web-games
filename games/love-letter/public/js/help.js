/**
 * 遊び方の中身（文字列を返すだけ）
 */

import { CARDS, TOKENS_TO_WIN } from './cards.js';
import { cardFace } from './card-art.js';

export function helpMarkup() {
    const cards = CARDS.map(c => `<tr><td>${cardFace(c.value, { size: 'mini' })}</td><th>${c.name}<small>×${c.count}</small></th><td>${c.text}</td></tr>`).join('');
    const tokens = Object.entries(TOKENS_TO_WIN).map(([n, t]) => `${n}人で${t}つ`).join('、');
    return `
    <section>
        <h3>目的</h3>
        <p>姫にラブレターを届けるため、手札を1枚だけ持ってラウンドを生き残ります。ラウンドに勝つと好意の印を1つもらい、先に決まった数（${tokens}）を集めた人の勝ちです。</p>
    </section>
    <section>
        <h3>準備</h3>
        <p>21枚をよく切り、1枚を見ないで除外します（2人のときは、さらに3枚を表にして除外）。全員に1枚ずつ配ります。</p>
    </section>
    <section>
        <h3>手番</h3>
        <ol>
            <li>山札から1枚引きます（自動）。</li>
            <li>2枚のうち1枚を出し、そのカードの効果を使います。出したカードは自分の前に並べ、全員に見えます。</li>
        </ol>
        <p>効果で選べる人がいない（全員が僧侶で守られている、など）ときは、効果なしで出します。魔術師は、ほかに選べる人がいなければ自分を選びます。</p>
    </section>
    <section>
        <h3>カード</h3>
        <table class="help-cards">${cards}</table>
    </section>
    <section>
        <h3>ラウンドの終わり</h3>
        <ul>
            <li>残りが1人になったら、その人の勝ち。</li>
            <li>山札がなくなったら、残っている人が手札を見せ、一番大きい人の勝ち。同じなら、出したカードの合計が大きい人。それも同じなら、全員が好意の印をもらいます。</li>
            <li>スパイ：ラウンドの終わりに残っている人のうち、スパイを出したか捨てたのが1人だけなら、その人は勝ち負けとは別に好意の印を1つもらいます。</li>
        </ul>
        <p>次のラウンドは、前のラウンドの勝者から始めます。</p>
    </section>
    <section>
        <h3>操作</h3>
        <ul>
            <li>手札を押して選び、相手を選び（兵士は言い当てるカードも）、<b>出す</b>。</li>
            <li>相手の手札を道化などで見ると、その人の欄に小さく表で出ます（自分にだけ見えます）。</li>
            <li>右上の記録で、これまでに起きたことを、カード一覧で見えていない残りの枚数を見られます。</li>
        </ul>
    </section>`;
}
