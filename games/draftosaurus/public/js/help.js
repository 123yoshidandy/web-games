/**
 * 遊び方の中身（得点の表は dinos.js のデータから作る）
 */

import { ZONES, DIE_FACES, FOREST_POINTS, MEADOW_POINTS, LOVE_PAIR_POINTS, TRIO_POINTS, KING_POINTS, ISLAND_POINTS, SPECIES } from './dinos.js';
import { dinoSvg, faceSvg } from './art.js';

const pointsRow = points => points.slice(1).map((p, i) => `<td>${i + 1}匹<b>${p}</b></td>`).join('');

export function helpMarkup() {
    const zone = (key, text) => `<li><b>${ZONES[key].name}</b>${faceSvg(ZONES[key].area, 'help-icon')}：${text}</li>`;
    return `
    <section>
        <h3>目的</h3>
        <p>恐竜を自分の公園の囲いに置いて、12 匹を置き終えたときに一番点の多い人が勝ち。</p>
        <p class="species">${Object.entries(SPECIES).map(([k, s]) => `<span>${dinoSvg(k, 'dino mini')}${s.short}</span>`).join('')}</p>
    </section>
    <section>
        <h3>流れ</h3>
        <ol>
            <li>袋に入れる恐竜は人数で変わる（5 人 60 匹・4 人 48 匹・3 人 36 匹・2 人 48 匹）。ラウンドの初めに、全員が袋から 6 匹を取る</li>
            <li>ダイスを振る人が、配置ダイスを振る。ほかの人は、置く場所にダイスの決まりを受ける（振った人は受けない）</li>
            <li>全員が同時に 1 匹を選んで、自分の公園に置く。そろったら公開</li>
            <li>残りの恐竜を左の人へ渡す（どのラウンドも左）。ダイスも左の人へ</li>
            <li>6 回でラウンドが終わる。2 ラウンドで終わり</li>
        </ol>
        <p><b>2 人のとき</b>：4 ラウンド×3 手番。置いて公開したあと、それぞれが手からもう 1 匹を選んで箱に戻し、残りの手を交換する。ダイスは交互に振る。</p>
    </section>
    <section>
        <h3>配置ダイス</h3>
        <ul class="faces">${Object.entries(DIE_FACES).map(([k, f]) => `<li>${faceSvg(k, 'help-icon')}<b>${f.name}</b>：${f.long}</li>`).join('')}</ul>
        <p>川には、ダイスに関係なくいつでも置ける。</p>
    </section>
    <section>
        <h3>囲いと点</h3>
        <ul>
            ${zone('forest', '同じ種類だけを、左から置く')}
        </ul>
        <table class="points"><tr>${pointsRow(FOREST_POINTS)}</tr></table>
        <ul>
            ${zone('meadow', '違う種類だけを、左から置く')}
        </ul>
        <table class="points"><tr>${pointsRow(MEADOW_POINTS)}</tr></table>
        <ul>
            ${zone('love', `どの種類でも、何匹でも。同じ種類の 2 匹の組ごとに ${LOVE_PAIR_POINTS} 点`)}
            ${zone('trio', `ちょうど 3 匹で ${TRIO_POINTS} 点（種類は問わない）`)}
            ${zone('king', `1 匹だけ。その種類を、あなたより多く持っている人がいなければ ${KING_POINTS} 点（同じ数なら点になる。相手 1 人ずつと比べる）`)}
            ${zone('island', `1 匹だけ。その種類が公園（川も含む）にその 1 匹だけなら ${ISLAND_POINTS} 点`)}
            <li><b>川</b>：1 匹 1 点</li>
            <li><b>ティラノサウルス</b>：ティラノがいる囲い 1 つごとに +1 点（2 匹いても +1。川は数えない）</li>
        </ul>
        <p>同点なら、ティラノサウルスの少ない方が上。</p>
    </section>
    <section>
        <h3>操作</h3>
        <p>手の恐竜を押すと、置ける場所が光り、今置いたら増える点（+の数）が出る。場所を押して「置く」（同じ場所をもう一度押しても置ける）。</p>
        <p>上の欄は全員の点と、最後に置いたもの。押すと、その人の公園を見られる。</p>
    </section>`;
}
