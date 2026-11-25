/**
 * 物件カード・小切手・コインの絵（自作の SVG と HTML）
 * コインと建物は symbol としてページに一度だけ入れ、use で使い回す
 * 物件は数の大きさで3段階に描き分ける（1〜10：テント・11〜20：家・21〜30：塔のある屋敷）
 */

// コイン（縁に刻みのある丸い札）
const COIN = `<symbol id="coin" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11" fill="#a8741a"/>
    <circle cx="12" cy="12" r="11" fill="none" stroke="#f2c14e" stroke-width="3" stroke-dasharray="3.1 2.66"/>
    <circle cx="12" cy="12" r="7.6" fill="#f2c14e"/>
    <path d="M12 7.6v8.8M14.2 9.4c-.5-.7-1.3-1-2.3-1-1.3 0-2.2.7-2.2 1.6 0 2.2 4.7 1.2 4.7 3.6 0 .9-1 1.7-2.4 1.7-1.1 0-2-.4-2.5-1.1" fill="none" stroke="#a8741a" stroke-width="1.3" stroke-linecap="round"/>
</symbol>`;

// テント（1〜10）
const TENT = `<symbol id="b1" viewBox="0 0 40 30">
    <path d="M4 27 20 4l16 23z" fill="#d9774a"/>
    <path d="M20 4 26 27H14z" fill="#f0a36f"/>
    <path d="M20 13l-4 14h8z" fill="#4a2f22"/>
    <path d="M2 27.5h36" stroke="#6b5440" stroke-width="2" stroke-linecap="round"/>
    <path d="M20 4V1.5l5 1.5-5 1.4" fill="#e24b4b"/>
</symbol>`;

// 家（11〜20）
const HOUSE = `<symbol id="b2" viewBox="0 0 40 30">
    <path d="M8 14h24v14H8z" fill="#f3e6c8"/>
    <path d="M4 15 20 3l16 12z" fill="#c4473a"/>
    <path d="M27 6h4v6l-4-3z" fill="#8b5a3c"/>
    <path d="M17 19h6v9h-6z" fill="#6b4630"/>
    <path d="M10.5 17.5h4.5v4h-4.5zM25 17.5h4.5v4H25z" fill="#7ec3e0"/>
    <path d="M2 28.5h36" stroke="#5c7a3c" stroke-width="2" stroke-linecap="round"/>
</symbol>`;

// 塔のある屋敷（21〜30）
const MANSION = `<symbol id="b3" viewBox="0 0 40 30">
    <path d="M9 12h22v16H9z" fill="#e9eef6"/>
    <path d="M7 13 20 5l13 8z" fill="#3c5a8c"/>
    <path d="M2 10h7v18H2zM31 10h7v18h-7z" fill="#cfd9e8"/>
    <path d="M1 11 5.5 2 10 11zM30 11l4.5-9 4.5 9z" fill="#2f4a78"/>
    <path d="M17.5 19h5v9h-5z" fill="#6b4630"/>
    <path d="M11.5 15h3.5v3.5h-3.5zM25 15h3.5v3.5H25zM4 14h3v3H4zM33 14h3v3h-3zM4 20h3v3H4zM33 20h3v3h-3z" fill="#f6d36b"/>
    <path d="M5.5 2V0M34.5 2V0" stroke="#2f4a78" stroke-width="1.2"/>
    <path d="M0 28.5h40" stroke="#5c7a3c" stroke-width="2" stroke-linecap="round"/>
</symbol>`;

export const symbolsSvg = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${COIN}${TENT}${HOUSE}${MANSION}</svg>`;

export const coinIcon = (cls = '') => `<svg class="coin ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#coin"/></svg>`;

export const tierOf = (card) => (card <= 10 ? 1 : card <= 20 ? 2 : 3);

// 金額（千ドル単位）を「$13,000」の形にする
export const money = (n) => (n === 0 ? '$0' : `$${n},000`);

// 物件カード。上に大きく数、下に建物
export function propertyHtml(card, { cls = '', attrs = '' } = {}) {
    const tier = tierOf(card);
    return `<div class="card prop t${tier} ${cls}" data-card="${card}" ${attrs} role="img" aria-label="物件${card}">
        <span class="prop-num">${card}</span>
        <svg class="prop-art" viewBox="0 0 40 30" aria-hidden="true"><use href="#b${tier}"/></svg>
    </div>`;
}

// 小切手。0 は「無効」の斜線
export function checkHtml(value, { cls = '', attrs = '' } = {}) {
    return `<div class="card check ${value === 0 ? 'void' : ''} ${cls}" data-check="${value}" ${attrs} role="img" aria-label="小切手${money(value)}">
        <span class="check-label">CHECK</span>
        <span class="check-amount"><span class="check-num">${value}</span><span class="check-unit">${value === 0 ? ' VOID' : ',000'}</span></span>
    </div>`;
}

export const backHtml = (cls = '') => `<div class="card back ${cls}" aria-hidden="true"></div>`;

// 小さな札（持っている物件・小切手の一覧に使う）
export const propTagHtml = (card, cls = '') => `<span class="tag prop-tag t${tierOf(card)} ${cls}" data-tag="${card}">${card}</span>`;
export const checkTagHtml = (value) => `<span class="tag check-tag">${value}</span>`;
