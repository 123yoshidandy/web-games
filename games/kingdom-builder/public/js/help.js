/**
 * 遊び方の文と、タイトル画面の絵
 */

import { TERRAINS, BUILDABLE, LOCATIONS, KING_CARDS } from './boards.js';
import { terrainHex, locationHex, HEX_POINTS, PLAYER_COLORS, PLAYER_LINES } from './art.js';

export function helpHtml() {
    const terrains = BUILDABLE.map(t => `<span class="chip">${terrainHex(t, 20)}${TERRAINS[t].name}</span>`).join('');
    const tiles = Object.entries(LOCATIONS).map(([id, l]) => `<li>${locationHex(id, 22)}<span><b>${l.name}</b>　${l.text}</span></li>`).join('');
    const cards = Object.values(KING_CARDS).map(c => `<li><span><b>${c.name}</b>　${c.text}</span></li>`).join('');
    return `
        <h3>目的</h3>
        <p>家を建てて王国を広げ、金貨（点）を集めます。点になる条件は、毎回3枚の<b>王のカード</b>で変わります。城に隣接して建てると、城1つにつき3点。</p>
        <h3>手番</h3>
        <p>手札の地形カード1枚の地形に、家を<b>3軒</b>建てます。建てられる地形は5種類です。</p>
        <p class="chips">${terrains}</p>
        <p>1軒ずつ、<b>自分の家に隣接するマスがあれば必ずそこに</b>。なければ、その地形のどこにでも建てられます。水・山・城・場所には建てられません。</p>
        <p>建て終えたらカードを捨て、1枚引きます。</p>
        <h3>場所タイル</h3>
        <p>場所のマスに隣接して建てると、そこのタイルを1枚もらえます（1つの場所から1枚まで）。<b>次の手番から</b>、3軒の前か後に、タイル1枚につき1回使えます。動かして場所の隣に自分の家がなくなると、タイルを失います。</p>
        <ul class="hlist">${tiles}</ul>
        <h3>王のカード</h3>
        <ul class="hlist">${cards}</ul>
        <p class="note">集落：隣り合う自分の家のかたまり。盤面：4枚の盤のそれぞれ（太線で区切ってあります）。</p>
        <h3>終わり</h3>
        <p>だれかが40軒目を建てたら、その巡の最後の人まで続けて終わり。点のいちばん多い人の勝ち（同点なら分け合う）。</p>
        <h3>操作</h3>
        <p>光るマスをタップして建てます。盤は2本指で拡大、1本指で動かせます。小さいままでも、近くに光るマスが1つならそこに建て、2つ以上なら拡大します。場所タイルは下のボタンから。自分の番の中なら、1手戻せます。</p>`;
}

// タイトルの絵：小さな王国（地形の六角形に家を建てたところ）
export function titleArtHtml() {
    const W = Math.sqrt(3) * 10;
    const cells = [
        [0, 1, 'T'], [0, 2, 'G'], [0, 3, 'F'],
        [1, 0, 'W'], [1, 1, 'G', 0], [1, 2, 'K'], [1, 3, 'G', 0], [1, 4, 'M'],
        [2, 1, 'F', 1], [2, 2, 'G', 0], [2, 3, 'C'], [2, 4, 'D', 2]
    ];
    const hexes = cells.map(([r, c, t, owner]) => {
        const x = W * (c + (r % 2 ? 0.5 : 0));
        const y = 15 * r;
        const house = owner === undefined ? '' : `<use href="#house" transform="translate(0 .4) scale(1.15)" fill="${PLAYER_COLORS[owner]}" stroke="${PLAYER_LINES[owner]}" stroke-width=".8"/>`;
        return `<g transform="translate(${x.toFixed(2)} ${y})"><use href="#t-${t}"/><polygon points="${HEX_POINTS}" class="t-line"/>${house}</g>`;
    }).join('');
    return `<svg class="t-art" viewBox="-11 -12 ${(W * 5.6).toFixed(1)} 54" aria-hidden="true">${hexes}</svg>`;
}

