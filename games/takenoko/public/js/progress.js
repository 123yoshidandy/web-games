/**
 * 目標カードの達成の見込み（0〜1）と、短い説明。CPU と画面の両方で使う
 * game はゲームの状態（Game）か、それと同じ形の盤面の情報を持つもの
 */

import { CARDS, SHAPES } from './data.js';
import { rotations } from './game.js';

export function progressOf(game, seat, cardId) {
    const card = CARDS[cardId];
    const player = game.players[seat];
    if (card.type === 'panda') {
        const need = card.need.green + card.need.yellow + card.need.pink;
        const have = ['green', 'yellow', 'pink'].reduce((s, c) => s + Math.min(player.eaten[c], card.need[c]), 0);
        return { ratio: have / need, text: `${have}/${need}` };
    }
    if (card.type === 'gardener') {
        const plots = game.plots().filter(t => t.color === card.color && (
            card.improvement === 'any' || (card.improvement === 'none' ? !t.improvement : t.improvement === card.improvement)));
        if (card.count === 1) {
            const best = plots.reduce((m, t) => Math.max(m, t.bamboo), 0);
            return { ratio: best / card.height, text: plots.length ? `最高 ${best}/${card.height}` : '区画なし' };
        }
        const exact = plots.filter(t => t.bamboo === card.height).length;
        const near = plots.filter(t => t.bamboo > 0 && t.bamboo < card.height).length;
        return { ratio: Math.min(1, (exact + near * 0.4) / card.count), text: `${exact}/${card.count}本` };
    }
    // 区画：形に合う区画（色が合い、灌漑済み）の数の最大
    const cells = SHAPES[card.shape];
    let best = 0;
    for (const t of game.plots()) {
        for (const form of rotations(cells)) {
            for (let anchor = 0; anchor < form.length; anchor++) {
                let count = 0;
                for (let i = 0; i < form.length; i++) {
                    const q = t.q + form[i][0] - form[anchor][0];
                    const r = t.r + form[i][1] - form[anchor][1];
                    const tile = game.tileAt(q, r);
                    if (tile && tile.color === card.colors[i] && game.isIrrigated(q, r)) count++;
                    else if (tile && tile.color !== card.colors[i]) { count = -1; break; }
                }
                best = Math.max(best, count);
            }
        }
    }
    return { ratio: best / cells.length, text: `${best}/${cells.length}枚` };
}
