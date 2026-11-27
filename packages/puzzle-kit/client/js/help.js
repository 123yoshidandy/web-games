/**
 * 遊び方の中身（種類の rules・controls・difficulties と、遊び方の種類の説明）
 */

import { PUZZLE_TYPE, DIFFICULTIES } from './puzzles/registry.js';
import { HINT_PENALTY_MS } from './session.js';
import { WRONG_PENALTY_MS } from './race.js';

const escape = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function helpHtml() {
    const type = PUZZLE_TYPE;
    const hint = HINT_PENALTY_MS / 1000;
    return `
        <h3>ルール</h3>
        ${type.rules.map(text => `<p>${escape(text)}</p>`).join('')}
        <h3>操作</h3>
        <p>${escape(type.controls)}</p>
        <p class="sizes">${DIFFICULTIES.map(d => `${d.label} ${escape(type.difficulties[d.id])}`).join('・')}</p>
        <h3>遊び方の種類</h3>
        <ul>
            <li><b>フリー</b>：難しさを選んで、1問ずつ解きます。</li>
            <li><b>今日のパズル</b>：日付で決まる3問（やさしい・ふつう・むずかしい）です。誰が開いても同じ問題になります。</li>
            <li><b>タイムアタック</b>：続けて解いた合計の時間を競います。CPU のライバルも付けられます。</li>
            <li><b>オンライン</b>：同じ問題を全員で解き、合計の時間の短い人が勝ちです。</li>
        </ul>
        <p>電球のボタンでヒント（次に決まるマス）が光ります。時間を計る遊びでは、ヒント1回につき ${hint} 秒を足します（オンラインで、まちがった盤面を送ったときは ${WRONG_PENALTY_MS / 1000} 秒）。</p>
        <p>どの問題も、答えは1つに決まります。</p>`;
}
