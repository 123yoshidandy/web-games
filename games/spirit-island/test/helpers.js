import { expect } from 'vitest';
import Game from '../public/js/game.js';
import { INVADER_HEALTH } from '../public/js/data.js';

export const players = (n = 1, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 1, { seed = 1, level = 'normal', spirits } = {}) => new Game(players(n), { seed, level, spirits });

// 土地の番号（'A1' など）
export const land = (game, name) => game.s.lands.find(L => `${'ABCD'[L.board]}${L.num}` === name).id;
export const L = (game, name) => game.s.lands[land(game, name)];

// 盤面を空にする（侵略者・ダハン・荒廃）。存在は残す
export function clearBoard(game) {
    game.s.lands.forEach(x => {
        x.inv = [];
        x.dahan = [];
        x.blight = 0;
    });
}

// 駒を置く：put(game, 'A3', { E: 1, T: 2, D: 1, B: 1 })
export function put(game, name, { E = 0, T = 0, C = 0, D = 0, B = 0 } = {}) {
    const x = L(game, name);
    for (let i = 0; i < C; i++) x.inv.push({ k: 'C', hp: INVADER_HEALTH.C });
    for (let i = 0; i < T; i++) x.inv.push({ k: 'T', hp: INVADER_HEALTH.T });
    for (let i = 0; i < E; i++) x.inv.push({ k: 'E', hp: INVADER_HEALTH.E });
    for (let i = 0; i < D; i++) x.dahan.push(2);
    x.blight += B;
}

export const count = (game, name, k) => L(game, name).inv.filter(p => p.k === k).length;

export const snapshot = (game) => JSON.stringify({ s: game.s, commands: game.commands, logs: game.logs });

// 成長からカードを使うまでを、決まった手で進める（成長は option、存在は置ける最初の土地、カードは使わない）
export function growAll(game, option = 2) {
    game.s.spirits.forEach((sp, seat) => {
        if (sp.step === 'growth') expect(game.applyCommand(seat, { type: 'growth', option }), game.lastError).toBe(true);
    });
}
