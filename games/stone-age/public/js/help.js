/**
 * 遊び方の文と、タイトル画面の絵
 */

import { sym, multHtml, civCardHtml, buildingFaceHtml } from './art.js';
import { CIV_CARDS, BUILDINGS } from './cards.js';

const PLACES = [
    ['food', '狩り場', '何人でも。サイコロの合計÷2の食料'],
    ['wood', '森', '合計÷3の木'],
    ['clay', '粘土採り場', '合計÷4の粘土'],
    ['stone', '石切り場', '合計÷5の石'],
    ['gold', '川', '合計÷6の金'],
    ['agri', '畑', '1人。畑が1段上がり、毎ラウンド食料が増える（10段まで）'],
    ['tool', '道具作り', '1人。道具が増える（3つまで。そのあとは1つずつ値が上がり、4まで）'],
    ['hut', '小屋', 'ちょうど2人。人が1人増える（10人まで）']
];

export function helpHtml() {
    const places = PLACES.map(([s, name, text]) => `<li>${sym(s)}<div><strong>${name}</strong>　${text}</div></li>`).join('');
    const sample = CIV_CARDS.find(c => c.top.kind === 'food' && c.top.n === 7).id;
    const sand = CIV_CARDS.find(c => c.bottom.mult === 'farmer' && c.top.kind === 'agri').id;
    return `
        <h3>目的</h3>
        <p>石器時代の村を育て、いちばん多くの点を取った人の勝ち。点は、建物・文明カード・ゲームの終わりの得点で集めます。</p>
        <h3>ラウンドの流れ</h3>
        <p><b>1. 人を置く</b>　最初の番の人から順に、1か所に1人以上を置きます。全員が置き終えるまで続けます。同じ場所に2回は置けません。</p>
        <p><b>2. 行動する</b>　最初の番の人から順に、置いた場所を好きな順で使います。</p>
        <p><b>3. 食べさせる</b>　畑の段の分だけ食料を得て、人1人に食料1つ。足りなければ食料を全部出し、残りを資源で払うか −10点。</p>
        <p>最初の番は、ラウンドごとに次の人へ移ります。</p>
        <h3>場所</h3>
        <ul class="help-list">${places}</ul>
        <p>森・粘土採り場・石切り場・川は、合わせて7人まで。2人のときは1人だけ、3人のときは2人までしか置けません。2〜3人のときは、畑・道具作り・小屋のうち2か所しか使えません。</p>
        <h3>道具</h3>
        <p>サイコロを振ったあと、道具の値を合計に足せます。道具は1ラウンドに1回ずつ。1回だけの道具（文明カード）は、使うとなくなります。</p>
        <h3>文明カード</h3>
        <div class="help-row">${civCardHtml(sample, { cost: 2, cls: 'small' })}<p>上の数の資源（木・粘土・石・金のどれでも。食料は不可）を払って取ります。左ほど高く、右端は資源1つ。上半分はすぐ受け取り、下半分は終わりの得点になります。</p></div>
        <p><b>緑（文化）</b>　違う種類の組ごとに、種類の数の2乗（8種で64点）。同じ種類の2枚目は次の組に入ります。</p>
        <div class="help-row">${civCardHtml(sand, { cls: 'small' })}<p><b>砂色（職業）</b>　人の数 × もとになる数。${multHtml('farmer', 1)}農民＝畑の段、${multHtml('toolmaker', 1)}道具職人＝道具の値の合計、${multHtml('builder', 1)}小屋の建築家＝建物の数、${multHtml('shaman', 1)}シャーマン＝人の数。</p></div>
        <p>ダイスのカードは、人数分のサイコロを振り、取った人から順に1つずつ選びます（1 木・2 粘土・3 石・4 金・5 道具・6 畑）。</p>
        <h3>建物</h3>
        <div class="help-row"><div class="bld small"><span class="bld-face">${buildingFaceHtml(BUILDINGS[0].id)}</span></div><p>描かれた資源を払って建て、すぐに点が入ります。「?」の建物は、決まった数と種類の資源を選んで払い、資源の値（木3・粘土4・石5・金6）の合計が点です。</p></div>
        <h3>終わり</h3>
        <p>建物の山が1つでも空になったら、そのラウンドの終わりに終了。文明カードを4枚に補充できなくなったときも終了です。</p>
        <p>終わりに、文化と職業の得点と、残った資源（1つ1点、食料は数えない）を足します。同点なら、畑の段＋道具の値の合計＋人の数が多い人の勝ち。</p>
        <h3>操作</h3>
        <p>光っている場所を押して選び、下の「置く」「振る」などで決めます。人数は −／＋ で変えます。上の欄の人を押すと、その人のカードと見込みの点が見られます。</p>`;
}

// タイトルの絵：小屋と人、資源とサイコロ
export function titleArtHtml() {
    const people = ['#d9473b', '#3d7dd8', '#3c9f4b', '#e2b72a'].map(c => `<span class="t-person" style="color:${c}">${sym('person')}</span>`).join('');
    return `<div class="t-scene">
        <span class="t-hut">${sym('hut')}</span>
        <span class="t-people">${people}</span>
        <span class="t-res">${['wood', 'clay', 'stone', 'gold', 'food'].map(r => sym(r)).join('')}</span>
    </div>`;
}
