/**
 * 絵（品物・ルビー・リラ・駒）。すべて SVG の文字列で返す
 */

export const GOOD_COLORS = { red: '#d2463c', green: '#4f9a3c', yellow: '#e6b52c', blue: '#3b74c9' };
// 席ごとの色（品物の色と見分けやすいもの）
export const PLAYER_COLORS = ['#f08a3a', '#36b8cc', '#d4559f', '#ece6da', '#9a6a3f'];

// 品物（色の付いた四角に、小さな形）
const GOOD_MARKS = {
    red: '<path d="M5 7h10M5 10h10M5 13h10" stroke="#fff" stroke-opacity=".75" stroke-width="1.4"/>',
    green: '<circle cx="10" cy="10.5" r="3.4" fill="#fff" fill-opacity=".7"/>',
    yellow: '<path d="M6 13c2-6 6-7 8-6-1 4-4 6-8 6z" fill="#fff" fill-opacity=".75"/>',
    blue: '<path d="M10 5l4 5-4 5-4-5z" fill="#fff" fill-opacity=".8"/>'
};
export const goodIcon = (good, cls = 'good') =>
    `<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true"><rect x="1.5" y="1.5" width="17" height="17" rx="4" fill="${GOOD_COLORS[good]}"/>${GOOD_MARKS[good]}</svg>`;

// 好きな品物（4色の四角）
export const anyIcon = (cls = 'good') => `<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true">
<rect x="1.5" y="1.5" width="8.5" height="8.5" rx="2" fill="${GOOD_COLORS.red}"/><rect x="10" y="1.5" width="8.5" height="8.5" rx="2" fill="${GOOD_COLORS.green}"/>
<rect x="1.5" y="10" width="8.5" height="8.5" rx="2" fill="${GOOD_COLORS.yellow}"/><rect x="10" y="10" width="8.5" height="8.5" rx="2" fill="${GOOD_COLORS.blue}"/></svg>`;

export const rubyIcon = (cls = 'ruby') => `<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true">
<path d="M5 3h10l4 5-9 10L1 8z" fill="#c8173a"/><path d="M5 3l2 5h6l2-5M1 8h18M7 8l3 10 3-10" fill="none" stroke="#ff8fa6" stroke-width="1" stroke-opacity=".8"/></svg>`;

export const coinIcon = (cls = 'coin') => `<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true">
<circle cx="10" cy="10" r="8.5" fill="#d9a441"/><circle cx="10" cy="10" r="6" fill="none" stroke="#fbe3a0" stroke-width="1.2"/></svg>`;

export const cardIcon = (cls = 'card-icon') => `<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true">
<rect x="4" y="2" width="12" height="16" rx="2" fill="#5d7fa3"/><path d="M7 7h6M7 10h6M7 13h4" stroke="#dbe8f5" stroke-width="1.2"/></svg>`;

// 商人（大きい丸）。中の数は、連れている助手の数
export const merchantToken = (color, stack, cls = 'tok merchant') =>
    `<span class="${cls}" style="--c:${color}"><b>${stack}</b></span>`;
export const assistantToken = (color) => `<span class="tok assistant" style="--c:${color}"></span>`;
export const familyToken = (color) => `<span class="tok family" style="--c:${color}"></span>`;
