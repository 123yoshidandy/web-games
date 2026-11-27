/**
 * CPU どうしの対戦：協力ゲームなので、2人とも同じ強さの CPU にして着陸できた割合（勝率）を測る
 * 使い方：npm run cpu-match -- [試合数=40] [強さ=easy,normal,hard] [空港=YUL,HND,KUL]
 * どの試合も最後まで進む（止まらない）ことも確かめる
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { AIRPORT_KEYS, REASON_TEXT } from '../public/js/rules.js';

const games = Number(process.argv[2] ?? 40);
const levels = (process.argv[3] ?? 'easy,normal,hard').split(',');
const airports = (process.argv[4] ?? AIRPORT_KEYS.join(',')).split(',');
const MAX_STEPS = 200;

let stalls = 0;
for (const airport of airports) {
    for (const level of levels) {
        let wins = 0;
        const reasons = {};
        const started = Date.now();
        for (let seed = 1; seed <= games; seed++) {
            const game = new Game([{ name: '機長', isCPU: true }, { name: '副操縦士', isCPU: true }], { seed, airport });
            let steps = 0;
            while (!game.isOver() && steps++ < MAX_STEPS) {
                if (!runCpuStep(game, game.turn, () => level)) break;
            }
            if (!game.isOver()) {
                stalls++;
                console.log(`止まった：${airport} ${level} シード${seed}`);
                continue;
            }
            if (game.won) wins++;
            else game.board.result.reasons.forEach(r => { reasons[r] = (reasons[r] ?? 0) + 1; });
        }
        const ms = Date.now() - started;
        const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${REASON_TEXT[r]} ${n}`).join('、');
        console.log(`${airport} ${level.padEnd(6)} 勝率 ${(100 * wins / games).toFixed(1)}%（${wins}/${games}） ${(ms / games).toFixed(0)}ms/試合${top ? `  負けの理由：${top}` : ''}`);
    }
}
if (stalls) {
    console.log(`止まった試合：${stalls}`);
    process.exit(1);
}
