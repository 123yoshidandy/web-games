/**
 * 遊び方と、タイトルの絵
 */

import { RACES, POWERS, TERRAINS, ROUNDS } from './data.js';
import { getMap, cellNeighbor } from './map.js';
import { HEX_R, HEX_W, PLAYER_COLORS, PLAYER_LINES, PLAYER_TEXT, markSvg, terrainHex, tokenSvg, coinIcon } from './art.js';

export function helpHtml() {
    const races = Object.values(RACES).map(r => `<li><b>${r.name}</b><span class="n">${r.tokens}</span>${r.text}</li>`).join('');
    const powers = Object.values(POWERS).map(p => `<li><b>${p.name}</b><span class="n">+${p.tokens}</span>${p.text}</li>`).join('');
    const terrains = ['farm', 'forest', 'hill', 'swamp', 'mountain', 'sea', 'lake'].map(t => `<span class="chip">${terrainHex(t, 20)}${TERRAINS[t].name}</span>`).join('');
    return `
        <h3>目的</h3>
        <p>小さすぎる世界を、種族と特殊能力の組で奪い合う。決まったラウンド（2・3人 ${ROUNDS[2]}、4人 ${ROUNDS[4]}、5人 ${ROUNDS[5]}）が終わったとき、コイン ${coinIcon()} が一番多い人の勝ち。</p>
        <h3>組を選ぶ</h3>
        <p>並んだ6組から1つ選ぶ。上から順に0金・1金・2金…で、飛ばした組には1金ずつ置いていく。選んだ組に乗っていたコインはもらえる。部隊の数は、種族と特殊能力の数の合計。</p>
        <h3>征服</h3>
        <p>領域を取るには <b>2＋そこにいる部隊＋山・トロルの巣・砦・野営地</b> の数だけ部隊を置く。最初は地図の縁（縁の海に面した領域を含む）から入り、そのあとは自分の領域の隣を取っていく。海と湖は取れない。</p>
        <p>部隊が足りなくなったら、最後に1回だけ援軍のサイコロ（0・0・0・1・2・3）に賭けられる。足りれば、手の部隊を全部置いて征服する。</p>
        <p>攻められた側は1体を失い、残りは手に戻って、攻めた人の番の終わりに自分の領域へ置き直される。</p>
        <p>番の初めには、各領域に1体ずつ残して部隊を手に戻してから征服する。征服の前なら、領域を放棄して部隊を手に戻せる。</p>
        <h3>再配置</h3>
        <p>征服を終えたら、手の部隊を自分の領域に置き直す。自分の領域を選び、＋−で数を変える。英雄・野営地・砦もここで置く。</p>
        <h3>衰退</h3>
        <p>部隊が減って伸びなくなったら、番の初めに征服の代わりに衰退する。各領域に1体だけ残り、種族も特殊能力も（書いてあるもの以外は）力を失う。前に衰退していた種族は地図から消える。その番はそのまま得点し、次の番に新しい組を選ぶ。</p>
        <h3>得点</h3>
        <p>番の終わりに、自分の種族（衰退した種族も）がいる領域1つにつき1金。種族や特殊能力のボーナスも、ここでもらう。</p>
        <h3>地形と特別な領域</h3>
        <div class="chips">${terrains}</div>
        <div class="chips">
            <span class="chip">${markSvg('magic')}魔法の源</span><span class="chip">${markSvg('mine')}鉱山</span><span class="chip">${markSvg('cavern')}洞窟</span>
            <span class="chip">${markSvg('lost')}失われた部族（1体）</span>
        </div>
        <div class="chips">
            <span class="chip">${markSvg('lair')}トロルの巣</span><span class="chip">${markSvg('fort')}砦</span><span class="chip">${markSvg('camp')}野営地</span>
            <span class="chip">${markSvg('hero')}英雄</span><span class="chip">${markSvg('hole')}穴</span><span class="chip">${markSvg('dragon')}竜</span>
        </div>
        <p>${tokenSvg(0, 3)} は部隊の数。灰色 ${tokenSvg(0, 1, true)} は衰退した種族。</p>
        <h3>種族</h3>
        <ul class="hlist">${races}</ul>
        <h3>特殊能力</h3>
        <ul class="hlist">${powers}</ul>`;
}

// タイトルの絵：2人用の地図に、いくつか部隊を置いたもの
export function titleArtHtml() {
    const map = getMap(2);
    const { cols, rows } = map;
    const center = (cell) => {
        const r = Math.floor(cell / cols);
        const c = cell % cols;
        return [HEX_W * (c + (r % 2 ? 0.5 : 0)) + HEX_W / 2 + 2, HEX_R + 1.5 * HEX_R * r + 2];
    };
    const hex = (cell) => {
        const [x, y] = center(cell);
        return `M${[0, 1, 2, 3, 4, 5].map(k => {
            const a = Math.PI / 180 * (60 * k - 90);
            return `${(x + HEX_R * Math.cos(a)).toFixed(1)} ${(y + HEX_R * Math.sin(a)).toFixed(1)}`;
        }).join('L')}Z`;
    };
    const fills = map.regions.map(region => {
        const color = TERRAINS[region.terrain].color;
        return `<path d="${region.cells.map(hex).join('')}" fill="${color}" stroke="${color}" stroke-width=".7"/>`;
    }).join('');
    // 領域の境目
    const edges = [];
    for (let cell = 0; cell < cols * rows; cell++) {
        const [x, y] = center(cell);
        for (let dir = 0; dir < 6; dir++) {
            const n = cellNeighbor(cols, rows, cell, dir);
            if (n >= 0 && (n < cell || map.owner[n] === map.owner[cell])) continue;
            const [a, b] = [dir, dir + 1].map(k => Math.PI / 180 * (60 * k - 90));
            edges.push(`M${(x + HEX_R * Math.cos(a)).toFixed(1)} ${(y + HEX_R * Math.sin(a)).toFixed(1)}L${(x + HEX_R * Math.cos(b)).toFixed(1)} ${(y + HEX_R * Math.sin(b)).toFixed(1)}`);
        }
    }
    const borders = `<path d="${edges.join('')}" fill="none" stroke="#2a2017" stroke-width="1.1" stroke-linecap="round"/>`;
    const placed = [[3, 0, 3], [8, 1, 4], [12, 0, 2], [17, 1, 2], [5, 3, 1]];
    const tokens = placed.map(([id, seat, n]) => {
        const region = map.regions[id];
        if (!region || region.terrain === 'sea' || region.terrain === 'lake') return '';
        const [x, y] = center(region.anchors[0]);
        return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="6.6" fill="${PLAYER_COLORS[seat]}" stroke="${PLAYER_LINES[seat]}" stroke-width="1"/><text y="2.8" text-anchor="middle" font-size="8" font-weight="800" fill="${PLAYER_TEXT[seat]}">${n}</text></g>`;
    }).join('');
    const w = HEX_W * (cols + 0.5) + 4;
    const h = 1.5 * HEX_R * (rows - 1) + HEX_R * 2 + 4;
    return `<svg class="t-art" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" aria-hidden="true">${fills}${borders}${tokens}</svg>`;
}
