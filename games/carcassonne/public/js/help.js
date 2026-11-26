/**
 * 遊び方の中身（文字列を返すだけ。タイルの絵は sprite の symbol を使う）
 */

import { tileUse, meepleUse } from './tile-art.js';

// 小さな盤面の図。tiles：[x, y, 種類, 向き, コマ [席, x, y, 寝かせる]]
function picture(tiles, { w, h, marks = '' }) {
    const body = tiles.map(([x, y, type, rot, meeple]) => {
        let m = '';
        if (meeple) m = meepleUse(x * 100 + meeple[1], y * 100 + meeple[2], meeple[0], { size: 30, lying: meeple[3] });
        return tileUse(type, rot, x, y) + m;
    }).join('');
    return `<svg class="help-pic" viewBox="-4 -4 ${w * 100 + 8} ${h * 100 + 8}" aria-hidden="true">${body}${marks}</svg>`;
}

// 2 枚の境目に出す ○ と ×
const OK_MARK = '<circle cx="100" cy="50" r="15" class="ok-mark"/>';
const NG_MARK = '<path d="M89 39l22 22M111 39 89 61" class="ng-mark"/>';

export function helpMarkup() {
    return `
    <section>
        <h3>目的</h3>
        <p>タイルをつないで土地を広げ、道・都市・修道院・草原にコマを置いて得点を集めます。タイルがなくなったとき、得点の一番多い人の勝ちです。</p>
    </section>
    <section>
        <h3>手番</h3>
        <ol>
            <li><b>タイルを置く</b>：引いたタイルを、辺の絵（道・都市・草原）がすべてつながるように置きます。</li>
            <li><b>コマを置く</b>（置かなくてもよい）：置いたタイルの道・都市・修道院・草原のどれかに、手元のコマ（7つ）を1つ置けます。つながった先に誰かのコマがいる所には置けません。</li>
            <li><b>得点</b>：道・都市・修道院が完成したら、すぐに数えてコマを手元に戻します。</li>
        </ol>
        <div class="help-pics">
            <figure>${picture([[0, 0, 'D', 0], [1, 0, 'V', 0]], { w: 2, h: 1, marks: OK_MARK })}<figcaption>道どうし・草原どうしがつながる</figcaption></figure>
            <figure>${picture([[0, 0, 'D', 0], [1, 0, 'E', 3]], { w: 2, h: 1, marks: NG_MARK })}<figcaption>道と都市はつながらない</figcaption></figure>
        </div>
        <p>どこにも置けないタイルを引いたら、そのタイルは取り除いて引き直します。</p>
    </section>
    <section>
        <h3>得点</h3>
        <table class="help-table">
            <tr><th></th><th>完成したとき</th><th>終了時に未完成</th></tr>
            <tr><th>道</th><td>1枚1点</td><td>1枚1点</td></tr>
            <tr><th>都市</th><td>1枚2点、紋章1つ2点</td><td>1枚1点、紋章1つ1点</td></tr>
            <tr><th>修道院</th><td>周りの8マスが埋まると9点</td><td>1点＋周りのタイル1枚1点</td></tr>
            <tr><th>草原</th><td>—</td><td>接している完成した都市1つにつき3点</td></tr>
        </table>
        <div class="help-pics">
            <figure>${picture([[0, 0, 'E', 2, [0, 50, 86]], [0, 1, 'D', 0, [1, 74, 50]]], { w: 1, h: 2 })}<figcaption>都市が閉じて完成</figcaption></figure>
            <figure>${picture([[0, 0, 'E', 2], [0, 1, 'D', 0, [3, 24, 33, true]]], { w: 1, h: 2 })}<figcaption>草原のコマ（農夫）は寝かせて置き、終了時まで戻らない</figcaption></figure>
        </div>
        <p>1つの道・都市・草原に何人ものコマがいるときは、コマの一番多い人が得点します。同じ数なら、全員が同じ得点をもらいます。別々の道や都市が、あとからタイルでつながることはあります。</p>
    </section>
    <section>
        <h3>操作</h3>
        <ul>
            <li>光っているマスを押すと、タイルを仮に置きます。もう一度押すか <b>回す</b> で向きを変え、<b>置く</b> で決めます。</li>
            <li>続けて、コマを置く場所の丸を押して <b>決定</b>。置かないときは、そのまま <b>コマなし</b>。</li>
            <li>盤面は指でずらし、2本指で拡大・縮小できます（パソコンはホイール）。</li>
            <li>残りの枚数を押すと、袋に残っているタイルが見られます。</li>
            <li>電球のボタンを押すと、おすすめの場所と向きに仮置きします（コマの場所も選んでおきます）。</li>
        </ul>
    </section>`;
}
