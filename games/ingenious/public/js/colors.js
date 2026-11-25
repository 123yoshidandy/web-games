/**
 * 6色の記号とタイルの内訳
 * 色覚に配慮して、色ごとに形も変える（絵は art.js）
 */

export const COLORS = {
    red: { name: '赤', shape: '星', hex: '#e2453c' },
    green: { name: '緑', shape: '丸', hex: '#3aa65a' },
    blue: { name: '青', shape: '六芒星', hex: '#3b82e0' },
    orange: { name: '橙', shape: '六角', hex: '#ef8a2c' },
    yellow: { name: '黄', shape: '太陽', hex: '#e8c11f' },
    purple: { name: '紫', shape: '輪', hex: '#9b59c9' }
};
export const COLOR_ORDER = Object.keys(COLORS);

export const SAME_COPIES = 5;  // 同じ色の組（赤赤など）は各5枚
export const MIXED_COPIES = 6; // 違う色の組（赤緑など）は各6枚

// 120枚のタイル（[色, 色]。違う色の組は COLOR_ORDER の順に並べる）
export function allTiles() {
    const tiles = [];
    COLOR_ORDER.forEach((a, i) => COLOR_ORDER.slice(i).forEach(b => {
        const copies = a === b ? SAME_COPIES : MIXED_COPIES;
        for (let k = 0; k < copies; k++) tiles.push([a, b]);
    }));
    return tiles;
}

export const HAND_SIZE = 6;
export const MAX_SCORE = 18;        // 得点の上限（ふつうの得点板）
export const MAX_SCORE_DOUBLE = 36; // 1人用と組み合わせ戦（得点板を2枚つなげる）
