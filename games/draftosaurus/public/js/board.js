/**
 * 公園の盤面の描画（自分の公園・ほかの人の公園・遊び方の図で共通に使う）
 * 川を真ん中に縦に流し、左（カフェの側）と右（トイレの側）に 3 つずつ囲いを置く。各列は森の側を上、草原の側を下にする
 */

import { ZONES, ENCLOSURES, SPECIES } from './dinos.js';
import { dinoSvg, faceSvg } from './art.js';

// 列ごとの囲いの並び（データの区分から決める）
export function columns() {
    const order = side => ENCLOSURES.filter(k => ZONES[k].side === side)
        .sort((a, b) => (ZONES[a].area === ZONES[b].area ? 0 : ZONES[a].area === 'woods' ? -1 : 1));
    return { left: order('left'), right: order('right') };
}

// 置いたときの今の点の増え方（島の点が消えるなど、減ることもある）
const gainHtml = gain => (gain === null ? '' : `<span class="gain${gain > 0 ? '' : gain < 0 ? ' minus' : ' zero'}">${gain > 0 ? '+' : ''}${gain}</span>`);

// 恋人の草原は、同じ種類を並べて、組ができているのが分かるようにする
function displayOrder(zone, dinos) {
    if (zone !== 'love') return dinos.map((d, i) => ({ d, i }));
    return dinos.map((d, i) => ({ d, i })).sort((a, b) => Object.keys(SPECIES).indexOf(a.d) - Object.keys(SPECIES).indexOf(b.d) || a.i - b.i);
}

/**
 * player：ビューの players[i]（park と zoneScores）
 * options：
 *   interactive：押せる盤面にする
 *   legal：Map(zone → 今の点の増え方)。選んだ恐竜を置ける場所
 *   preview：{ zone, dino } 置こうとしている場所（薄く描く）
 *   dieZones：Set(zone) ダイスの決まりで置ける囲い（恐竜を選ぶ前の目安）
 *   just：{ zone } さっき置いた場所（落ちてくる動き）
 */
export function boardHtml(player, options = {}) {
    const { interactive = false, legal = null, preview = null, dieZones = null, just = null } = options;
    const park = player.park;
    const cols = columns();
    const zoneHtml = (zone, row, col) => {
        const z = ZONES[zone];
        const dinos = park[zone];
        const isLegal = legal?.has(zone);
        const cls = ['zone', `z-${zone}`, `area-${z.area}`,
            legal ? (isLegal ? 'legal' : 'dim') : '',
            !legal && dieZones?.has(zone) ? 'die-ok' : '',
            preview?.zone === zone ? 'previewing' : ''].filter(Boolean).join(' ');
        const slots = [];
        displayOrder(zone, dinos).forEach(({ d, i }) => {
            const isJust = just?.zone === zone && i === dinos.length - 1;
            slots.push(`<span class="slot filled${isJust ? ' just' : ''}">${dinoSvg(d)}</span>`);
        });
        if (preview?.zone === zone) slots.push(`<span class="slot ghost">${dinoSvg(preview.dino)}</span>`);
        // 上限のない恋人の草原は 6 枠を基本に、入りきらなければ 3 列のまま行を足す
        const shown = Number.isFinite(z.capacity) ? z.capacity : Math.max(6, Math.ceil(slots.length / 3) * 3);
        while (slots.length < shown) slots.push('<span class="slot"></span>');
        const gain = isLegal ? legal.get(zone) : null;
        const tag = interactive ? 'button' : 'div';
        return `<${tag} class="${cls}" data-zone="${zone}" style="grid-area:${row} / ${col}" ${interactive ? `aria-label="${z.name}"` : ''}>
            <span class="zone-head">${faceSvg(z.area, 'zone-area')}<span class="zone-name">${z.name}</span><span class="zone-pts">${player.zoneScores[zone]}</span></span>
            <span class="slots ${Number.isFinite(z.capacity) ? `cap-${z.capacity}` : 'cap-many'}">${slots.join('')}</span>
            ${gainHtml(gain)}
        </${tag}>`;
    };
    const riverLegal = legal?.has('river');
    const riverCls = ['zone', 'z-river', legal ? (riverLegal ? 'legal' : 'dim') : '', preview?.zone === 'river' ? 'previewing' : ''].filter(Boolean).join(' ');
    const riverDinos = park.river.map((d, i) => `<span class="slot filled${just?.zone === 'river' && i === park.river.length - 1 ? ' just' : ''}">${dinoSvg(d)}</span>`).join('');
    const riverGhost = preview?.zone === 'river' ? `<span class="slot ghost">${dinoSvg(preview.dino)}</span>` : '';
    const riverGain = riverLegal ? legal.get('river') : null;
    const tag = interactive ? 'button' : 'div';
    return `<div class="park">
        <div class="side-label left">${faceSvg('cafe', 'side-icon')}カフェの側</div>
        <div class="side-label right">トイレの側${faceSvg('toilet', 'side-icon')}</div>
        ${cols.left.map((k, i) => zoneHtml(k, i + 2, 1)).join('')}
        <${tag} class="${riverCls}" data-zone="river" style="grid-area:1 / 2 / 5 / 3" ${interactive ? 'aria-label="川"' : ''}>
            <span class="zone-head"><span class="zone-name">川</span><span class="zone-pts">${player.zoneScores.river}</span></span>
            <span class="river-dinos">${riverDinos}${riverGhost}</span>
            ${gainHtml(riverGain)}
        </${tag}>
        ${cols.right.map((k, i) => zoneHtml(k, i + 2, 3)).join('')}
    </div>`;
}
