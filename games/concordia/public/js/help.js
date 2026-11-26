/**
 * 遊び方の中身（カードと品のデータから作る）
 */

import { CARD_TYPES, GOODS, GOOD_NAMES, PRICE, BUILD_VALUE, GODS, GOD_NAMES } from './cards.js';
import { goodIcon, cardText, GOD_COLORS } from './art.js';

const KINDS = ['tribune', 'architect', 'prefect', 'mercator', 'senator', 'diplomat', 'consul', 'colonist', 'mason'];

const GOD_HELP = {
    vesta: 'お金と品の値（商人の値段）の合計 10 につき 1 点',
    jupiter: 'れんが以外の都市の家 1 軒につき 1 点（最大 15）',
    saturnus: '家のある州 1 つにつき 1 点（最大 12）',
    mercurius: '家で生産する品の種類 1 つにつき 2 点（最大 10）',
    mars: '盤上の植民者 1 人につき 2 点（最大 12）',
    minerva: '職人カードごとに、その品の都市の家 1 軒につき 3〜5 点'
};

export function helpHtml() {
    const cards = KINDS.map(id => {
        const t = CARD_TYPES[id];
        const name = id === 'mason' ? '職人（石工・農夫・鍛冶・ぶどう酒造り・織工）' : t.name;
        return `<li><strong>${name}</strong>：${cardText(id)}</li>`;
    }).join('');
    const goods = GOODS.map(g => `<tr><td>${goodIcon(g)}${GOOD_NAMES[g]}</td><td>${BUILD_VALUE[g]}</td><td>${PRICE[g]}</td></tr>`).join('');
    const gods = GODS.map(g => `<li><span class="god-dot" style="--god:${GOD_COLORS[g]}"></span><strong>${GOD_NAMES[g]}</strong>：${GOD_HELP[g]}</li>`).join('');
    return `
        <h3>目的</h3>
        <p>地中海の都市に植民者を送り、家を建て、品を生産して交易し、人物のカードを集めます。得点はゲームの終わりに、持っているカードの神ごとに数えます。</p>
        <h3>手番</h3>
        <p>手札から1枚を使い、効果を行います。使ったカードは自分の捨て札になり、護民官で手札に戻します。</p>
        <ul class="help-list">${cards}</ul>
        <h3>家を建てる</h3>
        <p>植民者のいる道の両端の都市に建てられます（1つの都市に自分の家は1軒、ローマには建てられない）。品は れんが1＋その都市の品1（れんがの都市は食料1）。お金は下の表の値 ×（建てたあとの家の数）。</p>
        <table class="help-table"><thead><tr><th>品</th><th>建てるお金</th><th>売り買いの値</th></tr></thead><tbody>${goods}</tbody></table>
        <p>倉庫は12マス。植民者も1マスを使います。入りきらない品は受け取れません。</p>
        <h3>終わり</h3>
        <p>市場の最後のカードを買うか、15軒目の家を建てた人がコンコルディアのカード（7点）を受け取ります。ほかの人が1回ずつ手番を行って終わりです。同点なら、プラエフェクトゥス・マグヌス（王冠）を持つ人か、次に受け取る人の勝ちです。</p>
        <h3>得点</h3>
        <p>神ごとに、1枚あたりの点 × その神のカードの枚数。</p>
        <ul class="help-list">${gods}</ul>
        <h3>操作</h3>
        <p>手札を押すと、説明と使い方が出ます。建築家では、光る植民者を押してから行き先の道を押し、光る都市を押して家を建てます。市場のカードや、上の欄の人を押すと、詳しく見られます。電球のボタンを押すと、おすすめの操作（使うカード、動かす道、建てる都市）が光ります。</p>`;
}
