/**
 * 終わりの得点（得点表どおり）
 * 畑・牧場・穀物・野菜・羊・猪・牛（なければ −1）、空きマス −1、柵の中の厩 +1、レンガの部屋 +1・石の部屋 +2、
 * 家族 +3、物乞いカード −3、大きな進歩の点とボーナス
 * 穀物と野菜は、手元と畑の上の両方を数える
 */

import { SCORE, MAJOR, BEGGING_PENALTY } from './cards.js';
import { CELLS, usedCells, pastureIndex } from './farm.js';

export function scoreBreakdown(player) {
    const farm = player.farm;
    const onFields = (crop) => farm.fields.filter(f => f.crop === crop).reduce((s, f) => s + f.n, 0);
    const grain = player.res.grain + onFields('grain');
    const veg = player.res.veg + onFields('veg');
    const majors = player.majors.reduce((s, id) => s + MAJOR[id].points, 0);
    const bonus = player.majors.reduce((s, id) => {
        const b = MAJOR[id].bonus;
        if (!b) return s;
        return s + b.steps.filter(k => player.res[b.res] >= k).length;
    }, 0);
    const rows = {
        fields: SCORE.fields(farm.fields.length),
        pastures: SCORE.pastures(farm.pastures.length),
        grain: SCORE.grain(grain),
        veg: SCORE.veg(veg),
        sheep: SCORE.sheep(player.animals.sheep),
        boar: SCORE.boar(player.animals.boar),
        cattle: SCORE.cattle(player.animals.cattle),
        unused: -(CELLS - usedCells(farm)),
        stables: farm.stables.filter(c => pastureIndex(farm, c) >= 0).length,
        rooms: farm.rooms.length * ({ wood: 0, clay: 1, stone: 2 }[farm.house]),
        family: player.members * 3,
        begging: -player.begging * BEGGING_PENALTY,
        majors,
        bonus
    };
    rows.total = Object.values(rows).reduce((s, v) => s + v, 0);
    return rows;
}

export const SCORE_LABELS = {
    fields: '畑', pastures: '牧場', grain: '穀物', veg: '野菜', sheep: '羊', boar: '猪', cattle: '牛',
    unused: '空きマス', stables: '柵の中の厩', rooms: '部屋', family: '家族', begging: '物乞い', majors: '進歩', bonus: 'ボーナス'
};
