/**
 * 遊び方の文と、タイトル画面の絵
 */

import { PAYMENT, SETUP } from './data.js';
import { plantHtml, resIcon } from './art.js';

export function helpHtml() {
    const pay = PAYMENT.map((v, i) => `<td>${i}<br><b>${v}</b></td>`);
    const payRows = [pay.slice(0, 11), pay.slice(11)].map(r => `<tr>${r.join('')}</tr>`).join('');
    const setup = [2, 3, 4, 5, 6].map(n => `<tr><th>${n}人</th><td>${SETUP[n].regions}</td><td>${SETUP[n].maxPlants}</td><td>${SETUP[n].step2}</td><td>${SETUP[n].end}</td></tr>`).join('');
    return `
        <h3>目的</h3>
        <p>発電所を買い、燃料を買い、都市をつないで電気を送ります。だれかの都市が終わりの数に届いたら終わり。<b>送電できる都市の多い人の勝ち</b>（同数ならお金、さらに同数なら都市の数）。所持金は50から。</p>
        <h3>1巡の流れ</h3>
        <p><b>1. 手番の順</b>　都市の多い順（同数は大きい発電所の順）。</p>
        <p><b>2. 発電所の競り</b>　順に、上の段（今の市場）から1つ選んで番号以上の値で競りにかけるか、見送ります。ほかの人は値を上げるか降ります。1巡に買えるのは1つ。最初の巡は全員が買います。</p>
        <p><b>3. 資源を買う</b>（逆順）　${resIcon('coal')}石炭 ${resIcon('oil')}石油 ${resIcon('garbage')}ゴミ ${resIcon('uranium')}ウラン。発電所に入るのは、使う数の2倍まで。安い方から売れていきます。</p>
        <p><b>4. 都市を建てる</b>（逆順）　最初の都市は10。次からは、自分の都市から線の費用（いちばん安い道）＋建てる費用。1つの都市に建てられるのは、段階1で1人、段階2で2人（2人目は15）、段階3で3人（3人目は20）。</p>
        <p><b>5. 官僚</b>　燃料を使って送電し、送電した都市の数で収入。市場に資源を補充し、発電所の市場を入れ替えます（この画面では、送れるだけ自動で送ります）。</p>
        <table class="htable pay"><tbody>${payRows}</tbody></table>
        <h3>発電所</h3>
        <p>${plantHtml(15)}　番号（最低の値）・燃料と使う数・送電できる都市の数。両用は石炭と石油のどちらでも、風力は燃料なし。</p>
        <h3>段階</h3>
        <p>段階2：だれかの都市が決まった数に届いたら。段階3：山から「段階3」のカードが出たら（市場は6つになり、全部を競りにかけられる）。都市の数以下の番号の発電所は、市場から除かれます。</p>
        <table class="htable"><thead><tr><th>人数</th><th>地域</th><th>持てる発電所</th><th>段階2</th><th>終わり</th></tr></thead><tbody>${setup}</tbody></table>
        <h3>操作</h3>
        <p>地図は2本指で拡大、1本指で動かせます。建てる番では、光る都市（数字は費用）をタップして「建てる」。</p>`;
}

export function titleArtHtml() {
    return `<div class="t-plants">${[13, 20, 34, 46].map((n, i) => `<div class="t-plant" style="--i:${i - 1.5}">${plantHtml(n)}</div>`).join('')}</div>`;
}
