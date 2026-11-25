/**
 * 絵と文言の部品：餌・巣・生息地・卵の図柄（symbol を一度だけ入れて use で使う）、鳥のカード、能力の説明
 */

import {
    birdOf, bonusOf, bonusRule, FOOD_NAMES, FOOD_LONG, HABITAT_NAMES, NEST_NAMES, EGG_COST
} from './birds.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 図柄（24×24 の座標）
const SYMBOLS = `
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="f-inv" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#b4566a"/><path d="M6 15c1.5-4 4-4 5-1s3.5 3 5 0 2-4 2.5-5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></symbol>
  <symbol id="f-seed" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#c39a3d"/><path d="M12 19V7" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="9.4" cy="10" rx="1.7" ry="2.8" fill="#fff" transform="rotate(-25 9.4 10)"/><ellipse cx="14.6" cy="10" rx="1.7" ry="2.8" fill="#fff" transform="rotate(25 14.6 10)"/><ellipse cx="9.4" cy="14.6" rx="1.7" ry="2.8" fill="#fff" transform="rotate(-25 9.4 14.6)"/><ellipse cx="14.6" cy="14.6" rx="1.7" ry="2.8" fill="#fff" transform="rotate(25 14.6 14.6)"/><ellipse cx="12" cy="6.6" rx="1.6" ry="2.6" fill="#fff"/></symbol>
  <symbol id="f-fish" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#3b78b0"/><path d="M5 12c2.5-3.6 7-4 10-1.2l3.2-2.6v7.6L15 13.2C12 16 7.5 15.6 5 12z" fill="#fff"/><circle cx="8.6" cy="11.4" r=".9" fill="#3b78b0"/></symbol>
  <symbol id="f-fruit" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#c23f36"/><path d="M12.5 5.5c-.3 3 -1.8 5-3.6 6.5M12.5 5.5c.8 2.8 2.6 4.6 4.2 5.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><circle cx="8.6" cy="15" r="3.4" fill="#fff"/><circle cx="16" cy="14.4" r="3.4" fill="#fff"/></symbol>
  <symbol id="f-rodent" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#6f6a66"/><path d="M5.5 15.5c0-3.6 2.8-6 6.2-6 3 0 5.2 1.8 5.8 4.4l1.5.4-1.4 1.2H5.5z" fill="#fff"/><circle cx="12.5" cy="8.6" r="2" fill="#fff"/><path d="M5.5 15.5c-1.4 0-2 1-1.4 2" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/><circle cx="15.2" cy="12.4" r=".8" fill="#6f6a66"/></symbol>
  <symbol id="f-any" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#8a7f72"/><path d="M12 5.5l1.9 4.2 4.6.4-3.5 3 1.1 4.5-4.1-2.4-4.1 2.4 1.1-4.5-3.5-3 4.6-.4z" fill="#fff"/></symbol>
  <symbol id="n-bowl" viewBox="0 0 24 24"><path d="M3.5 10.5h17c0 5-3.8 8-8.5 8s-8.5-3-8.5-8z" fill="#9b7a52"/><path d="M6 13.5h12" stroke="#c9ab80" stroke-width="1.3"/></symbol>
  <symbol id="n-cavity" viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="3" fill="#8c6a45"/><circle cx="12" cy="11" r="3.6" fill="#3a2a1c"/></symbol>
  <symbol id="n-ground" viewBox="0 0 24 24"><ellipse cx="12" cy="15" rx="9" ry="4" fill="#a78c5b"/><path d="M5 13c2-1.4 4-1.6 7-1.6s5 .2 7 1.6" stroke="#6f5a35" stroke-width="1.3" fill="none"/></symbol>
  <symbol id="n-platform" viewBox="0 0 24 24"><path d="M3 12.5l18-2M3.5 15.5l17-1.5M4 9.5l16 3M5 17.5l14-4.5" stroke="#8a6a45" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="n-star" viewBox="0 0 24 24"><path d="M12 3.5l2.5 5.5 6 .6-4.5 4 1.3 5.9L12 16.4l-5.3 3.1L8 13.6l-4.5-4 6-.6z" fill="#b59a3a"/></symbol>
  <symbol id="h-forest" viewBox="0 0 24 24"><path d="M12 3l6 9h-3l4 6H5l4-6H6z" fill="#3f7a4c"/><rect x="11" y="18" width="2" height="3" fill="#6b4d2e"/></symbol>
  <symbol id="h-grassland" viewBox="0 0 24 24"><path d="M4 20c1-5 2-8 3.5-10M9 20c0-5 .8-9 2.6-12M14 20c.4-4.6 1.6-8 3.8-10.4M18.5 20c.2-2.6 1-4.6 2-6" stroke="#b08a1e" stroke-width="2.2" fill="none" stroke-linecap="round"/></symbol>
  <symbol id="h-wetland" viewBox="0 0 24 24"><path d="M3 9c2.2-1.6 4.2-1.6 6 0s3.8 1.6 6 0 4.2-1.6 6 0M3 14c2.2-1.6 4.2-1.6 6 0s3.8 1.6 6 0 4.2-1.6 6 0M3 19c2.2-1.6 4.2-1.6 6 0s3.8 1.6 6 0 4.2-1.6 6 0" stroke="#2f73a8" stroke-width="2" fill="none" stroke-linecap="round"/></symbol>
  <symbol id="i-egg" viewBox="0 0 24 24"><path d="M12 3c3.8 0 7 6.4 7 10.6A7 7 0 0 1 5 13.6C5 9.4 8.2 3 12 3z" fill="#f4ead3" stroke="#a8946a" stroke-width="1.4"/></symbol>
  <symbol id="i-card" viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2.4" fill="#e9dfc9" stroke="#7d6c50" stroke-width="1.4"/><path d="M9 9.5c1.5-1.5 4.5-1.5 6 0" stroke="#7d6c50" stroke-width="1.4" fill="none"/></symbol>
</svg>`;

export function installSymbols(container) {
    container.innerHTML = SYMBOLS;
}

export const icon = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
export const foodIcon = (f, cls = 'ic') => icon(`f-${f}`, cls);
export const nestIcon = (n, cls = 'ic') => icon(`n-${n}`, cls);
export const habitatIcon = (h, cls = 'ic') => icon(`h-${h}`, cls);
export const eggIcon = (cls = 'ic') => icon('i-egg', cls);

// サイコロの面（虫か種の面は2つの図柄を並べる）
export function dieFace(face) {
    if (face === 'invseed') return `<span class="die-split">${foodIcon('inv', 'ic half')}${foodIcon('seed', 'ic half')}</span>`;
    return foodIcon(face, 'ic die-ic');
}

// 鳥の餌の図柄（/ はどれか1つ）
export function costHtml(bird) {
    const sep = bird.cost.or ? '<i class="or">/</i>' : '';
    return bird.cost.items.map(f => foodIcon(f, 'ic cost')).join(sep);
}

const FOOD = (f) => FOOD_NAMES[f];

// 能力の説明
export function powerText(bird) {
    const p = bird.power;
    if (!p) return '';
    const a = p.arg;
    switch (p.kind) {
        case 'gainFeeder': return `餌箱から${FOOD(a)}を1つ取る（あれば）。`;
        case 'cacheFeeder': return `餌箱から${FOOD(a)}を1つ取り、この鳥に貯える（あれば）。`;
        case 'cacheSupply': return `${FOOD(a)}を1つ、この鳥に貯える。`;
        case 'hunt': return `餌箱の外のサイコロを全部振る。${FOOD(a)}が出たら、${FOOD(a)}を1つこの鳥に貯える。`;
        case 'predator': return `山札を1枚めくる。翼開長が${a}cm未満なら、この鳥に差し込む。それ以外は捨てる。`;
        case 'tuckDraw': return '手札を1枚この鳥に差し込む。そうしたら1枚引く。';
        case 'tuckFood': return `手札を1枚この鳥に差し込む。そうしたら${FOOD(a)}を1つ得る。`;
        case 'tuckEgg': return '手札を1枚この鳥に差し込む。そうしたら、この鳥に卵を1つ産む。';
        case 'layThis': return 'この鳥に卵を1つ産む。';
        case 'layAny': return '好きな鳥に卵を1つ産む。';
        case 'drawCard': return 'カードを1枚引く。';
        case 'allFood': return `全員が${FOOD(a)}を1つ得る。`;
        case 'allDraw': return '全員がカードを1枚引く。';
        case 'fewestDraw': return `${HABITAT_NAMES[a]}の鳥がいちばん少ない人が、カードを1枚引く。`;
        case 'discardEggFood': return `ほかの鳥の卵を1つ捨てて、好きな餌を${a}つ得る。`;
        case 'discardEggCards': return `ほかの鳥の卵を1つ捨てて、カードを${a}枚引く。`;
        case 'discardFoodTuck': return `${FOOD(a)}を1つ捨てて、山札から2枚この鳥に差し込む。`;
        case 'tradeFood': return '餌を1つ、ほかの種類の餌1つと替える。';
        case 'gainSupply': return `${FOOD(a)}を3つ得る。`;
        case 'gainAllFeeder': return `餌箱の${FOOD(a)}を全部取る。`;
        case 'laySameNest': return `${NEST_NAMES[a]}の巣の鳥すべてに、卵を1つずつ産む（この鳥も）。`;
        case 'drawCards': return `カードを${a}枚引く。`;
        case 'bonusDraw': return `ボーナスカードを${a}枚引き、1枚残す。`;
        case 'playAnother': return `${HABITAT_NAMES[a]}に、もう1羽出せる（ふつうに払う）。`;
        default: return '';
    }
}

// 選ぶときの短い文
export function powerAsk(bird) {
    const { kind, arg } = bird.power;
    return {
        tuckDraw: '1枚差し込んで、1枚引く',
        tuckFood: `1枚差し込んで、${FOOD(arg)}を得る`,
        tuckEgg: '1枚差し込んで、卵を産む',
        discardEggFood: `ほかの鳥の卵を捨てて、餌を${arg}つ得る`,
        discardEggCards: `ほかの鳥の卵を捨てて、${arg}枚引く`,
        discardFoodTuck: `${FOOD(arg)}を捨てて、2枚差し込む`,
        tradeFood: '餌を1つ、ほかの種類に替える',
        layAny: '好きな鳥に卵を1つ産む'
    }[kind] ?? powerText(bird);
}

export const powerLabel = (bird) => (bird.power?.color === 'white' ? '出したとき' : '行動のとき');

// 鳥ごとの色（名前から決める。カードの絵の鳥の色）
function birdHue(bird) {
    let h = 0;
    for (const c of bird.id) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
}

// カードの小さな鳥の絵
export function birdArt(bird) {
    const hue = birdHue(bird);
    const big = bird.wingspan >= 90;
    const body = `hsl(${hue} 38% 46%)`;
    const wing = `hsl(${hue} 34% 32%)`;
    const belly = `hsl(${(hue + 40) % 360} 45% 78%)`;
    return big
        ? `<svg class="bird-art" viewBox="0 0 40 24" aria-hidden="true"><path d="M3 12c6-5 10-6 14-4l3-1 3 1c4-2 8-1 14 4-6-1-10 0-13 2l-4 3-4-3c-3-2-7-3-13-2z" fill="${wing}"/><ellipse cx="20" cy="12" rx="3" ry="5" fill="${body}"/><circle cx="20" cy="7" r="2.2" fill="${body}"/><path d="M20 5.2l2.6.8-2.6.8z" fill="#e0a72a"/></svg>`
        : `<svg class="bird-art" viewBox="0 0 40 24" aria-hidden="true"><ellipse cx="19" cy="14" rx="9" ry="6.5" fill="${body}"/><ellipse cx="17" cy="16" rx="6" ry="3.6" fill="${belly}"/><path d="M14 12c3 0 7 1 9 4-4 1-7 0-9-4z" fill="${wing}"/><circle cx="27" cy="9.5" r="4.4" fill="${body}"/><circle cx="28.4" cy="8.6" r=".9" fill="#1d1a16"/><path d="M31 9.2l4 1.2-4 1z" fill="#e0a72a"/><path d="M10.5 13l-6 -2 2.6 4z" fill="${wing}"/><path d="M19 20.4v2.4M22 20.2v2.4" stroke="#6b5a40" stroke-width="1"/></svg>`;
}

// 手札・場の3枚のカード
export function cardHtml(birdId, { cls = '', attrs = '' } = {}) {
    const bird = birdOf(birdId);
    const pc = bird.power ? `pc-${bird.power.color}` : 'pc-none';
    return `<button type="button" class="card hab-${bird.habitats[0]} ${pc} ${cls}" ${attrs}>
        <span class="card-top">${costHtml(bird)}</span>
        <span class="card-name">${esc(bird.name)}</span>
        <span class="card-bottom"><span class="card-habs">${bird.habitats.map(h => habitatIcon(h, 'ic hab')).join('')}</span><b class="pts">${bird.points}</b></span>
    </button>`;
}

// 場の鳥（卵・貯えた餌・差し込んだカード）
export function slotHtml(slot, { cls = '', attrs = '', pending = 0 } = {}) {
    const bird = birdOf(slot.bird);
    const pc = bird.power ? `pc-${bird.power.color}` : 'pc-none';
    const cache = Object.entries(slot.cache).filter(([, n]) => n > 0);
    const cacheN = cache.reduce((s, [, n]) => s + n, 0);
    const eggs = Array.from({ length: bird.eggs }, (_, k) => `<i class="pip ${k < slot.eggs ? 'on' : k < slot.eggs + pending ? 'new' : ''}"></i>`).join('');
    return `<button type="button" class="slot bird hab-${bird.habitats[0]} ${pc} ${cls}" ${attrs}>
        <span class="slot-name">${esc(bird.name)}</span>
        <span class="slot-art">${birdArt(bird)}</span>
        <span class="slot-marks">${cacheN ? `<span class="mark">${foodIcon(cache[0][0], 'ic tiny')}${cacheN}</span>` : ''}${slot.tucked ? `<span class="mark">${icon('i-card', 'ic tiny')}${slot.tucked}</span>` : ''}</span>
        <span class="slot-bottom"><span class="pips">${eggs}</span><b class="pts">${bird.points}</b></span>
    </button>`;
}

// カードの詳しい中身（ダイアログ）
export function cardDetailHtml(birdId) {
    const bird = birdOf(birdId);
    const power = bird.power
        ? `<div class="power pc-${bird.power.color}"><small>${powerLabel(bird)}</small>${esc(powerText(bird))}</div>`
        : '<div class="power pc-none">能力なし</div>';
    return `<div class="detail hab-${bird.habitats[0]}">
        <div class="detail-head">${birdArt(bird)}<div><h3>${esc(bird.name)}</h3>
        <div class="detail-habs">${bird.habitats.map(h => `${habitatIcon(h)}${HABITAT_NAMES[h]}`).join(' ')}</div></div><b class="pts big">${bird.points}</b></div>
        <dl class="facts">
            <dt>餌</dt><dd>${costHtml(bird)}<span class="muted">${bird.cost.items.map(f => (f === 'any' ? 'どれでも' : FOOD_LONG[f])).join(bird.cost.or ? ' か ' : '・')}</span></dd>
            <dt>巣</dt><dd>${nestIcon(bird.nest)}${NEST_NAMES[bird.nest]}・卵 ${bird.eggs}個まで</dd>
            <dt>翼開長</dt><dd>${bird.wingspan}cm</dd>
        </dl>
        ${power}
    </div>`;
}

export function bonusHtml(id, { points = null, cls = '', attrs = '' } = {}) {
    const card = bonusOf(id);
    return `<button type="button" class="bonus-card ${cls}" ${attrs}>
        <b>${esc(card.name)}</b><span>${esc(card.text)}</span><small>${esc(bonusRule(card))}${points != null ? ` <em>今 ${points}点</em>` : ''}</small>
    </button>`;
}

export const eggCostText = (column) => (EGG_COST[column] ? `卵${EGG_COST[column]}` : '');
