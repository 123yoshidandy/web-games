/**
 * 遊び方の中身（文字列を返すだけ）
 */

import { res, coin, sci, shield, vp, COLOR_HEX } from './card-text.js';
import { COLOR_NAMES } from './cards.js';

export function helpMarkup() {
    const colors = Object.entries(COLOR_NAMES).map(([k, name]) => `<span class="color-chip" style="--c:${COLOR_HEX[k]}">${name}</span>`).join('');
    return `
    <section>
        <h3>目的</h3>
        <p>3つの時代を通して自分の都市を発展させ、最後に一番多くの勝利点を集めた人の勝ちです。同じ点なら、コインの多い人の勝ち。</p>
    </section>
    <section>
        <h3>手番</h3>
        <ol>
            <li>全員が同時に、手札から1枚を選びます。</li>
            <li>全員がそろったら公開して、選んだカードで次のどれかをします。
                <ul>
                    <li><b>建てる</b>：費用を払って、カードを自分の都市に置く</li>
                    <li><b>段階</b>：カードを伏せて使い、不思議の次の段階を建てる（段階の費用を払う）</li>
                    <li><b>捨てる</b>：カードを捨てて${coin(3)}をもらう</li>
                </ul>
            </li>
            <li>残りの手札を隣に渡します（第1・第3時代は左、第2時代は右）。6回選んだら、最後の1枚は捨てます。</li>
        </ol>
    </section>
    <section>
        <h3>費用と交易</h3>
        <p>資源（${res('W')}${res('S')}${res('C')}${res('O')} 原材料、${res('G')}${res('L')}${res('P')} 加工品）は、自分の都市の生産で払います。足りなければ、両隣が生産している資源を、1つ${coin(2)}で隣から買えます（隣の資源は減りません。交易所・市場があれば${coin(1)}）。払い方は一番安いものを選んでおくので、変えたいときは候補から選び直してください。</p>
        <p>前の時代の決まった建物を持っていれば、無料で建てられます（連鎖）。同じ名前の建物は2つ建てられません。</p>
    </section>
    <section>
        <h3>カードの色</h3>
        <p class="colors">${colors}</p>
    </section>
    <section>
        <h3>時代の終わり：軍事</h3>
        <p>両隣と盾${shield(1)}の数を比べ、多ければ時代ごとに${vp(1)}・${vp(3)}・${vp(5)}、少なければ -1 点です。</p>
    </section>
    <section>
        <h3>最後の得点</h3>
        <ul>
            <li>軍事の点、コイン3枚につき1点、不思議の段階、市民（青）の点</li>
            <li>科学（緑）：同じ記号（${sci('c')}${sci('g')}${sci('t')}）の数の2乗の合計と、3種そろうごとに7点</li>
            <li>商業（黄）とギルド（紫）の点</li>
        </ul>
    </section>
    <section>
        <h3>操作</h3>
        <ul>
            <li>手札を押すと、建てる・段階・捨てるのボタンが出ます。建てられないカードは薄く表示します。</li>
            <li>左右の隣の欄を押すと、その都市を詳しく見られます。右上のボタンで全員の都市を見られます。</li>
        </ul>
    </section>`;
}
