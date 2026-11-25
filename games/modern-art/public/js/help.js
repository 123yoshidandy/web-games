/**
 * 遊び方の文と、タイトル画面の絵
 */

import { ARTISTS, TYPES, TYPE_IDS, DISTRIBUTION, DEAL } from './cards.js';
import { artistMark, typeIcon, cardHtml } from './art.js';
import { CARDS } from './cards.js';

export function helpHtml() {
    const artists = ARTISTS.map((a, i) => `<tr><th>${artistMark(i, 16)}${a.name}</th>${DISTRIBUTION[i].map(n => `<td>${n}</td>`).join('')}<td>${DISTRIBUTION[i].reduce((x, y) => x + y, 0)}</td></tr>`).join('');
    const types = TYPE_IDS.map(t => `<li>${typeIcon(t, 'ticon big')}<span><b>${TYPES[t].name}</b>　${TYPES[t].text}</span></li>`).join('');
    return `
        <h3>目的</h3>
        <p>画廊の主として絵を競りにかけ、買い、売って、4回の終わりにいちばんお金の多い人の勝ち。所持金は100から。自分の所持金はほかの人に見えません。</p>
        <h3>手番</h3>
        <p>出す人が手札の絵を1枚出し、カードのしるしの方法で競ります。<b>ほかの人が買ったら出した人に払い、出した人が自分で買ったら銀行に払います。</b>だれも値を付けなければ、出した人が無料でもらいます。次は左隣の人が出します。</p>
        <ul class="hlist">${types}</ul>
        <h3>回の終わり</h3>
        <p>ある画家の<b>5枚目</b>が出たら、その回は終わり（5枚目は競りません）。その回に出た枚数の多い3人の画家に、30・20・10を足します。同数なら左の画家が上です。</p>
        <p>買った絵は銀行に売ります。値は、<b>その回に3位までに入った画家だけ、これまでの回の合計</b>。入らなかった画家の絵は0です。売った絵は片付け、手札は次の回に持ち越します。</p>
        <h3>画家とカード</h3>
        <table class="htable"><thead><tr><th>画家</th>${TYPE_IDS.map(t => `<th>${typeIcon(t)}</th>`).join('')}<th>計</th></tr></thead><tbody>${artists}</tbody></table>
        <p class="note">配る枚数：3人 ${DEAL[3].join('・')}、4人 ${DEAL[4].join('・')}、5人 ${DEAL[5].join('・')}（1〜4回目）</p>
        <h3>操作</h3>
        <p>出す番では手札の絵を選んで「出す」。競りでは、値を −10・−1・+1・+10 で決めて「入札」か「降りる」。公開の競りは、左から順に値を上げるか降ります（降りたら戻れません）。</p>`;
}

export function titleArtHtml() {
    const picks = ARTISTS.map((_, a) => CARDS.find(c => c.artist === a && c.index === 2).id);
    return `<div class="t-fan">${picks.map((id, i) => `<div class="t-card" style="--i:${i - 2}">${cardHtml(id)}</div>`).join('')}</div>`;
}
