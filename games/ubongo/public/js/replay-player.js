/**
 * 記録を見る：操作の記録とピースの動きの記録から、ラウンドごとに時刻どおりに再生する
 * コントローラーと同じ getView()・clock() を持ち、画面はふつうのプレイと同じ描き方で描く（操作はできない）
 */

import { createGame, applyCommand, viewFor } from './game.js';

const FRAME_MS = 50;
const LEAD_MS = 1200;   // ラウンドの前に、カウントを見せる時間
const TAIL_MS = 1500;   // 最後の人が解いたあと、次のラウンドまで
const SPEEDS = [1, 2, 4];

export default class ReplayPlayer {
    constructor(record, { onUpdate = () => {}, onEnd = () => {} } = {}) {
        this.isOnline = false;
        this.isReplay = true;
        this.handlers = { onUpdate, onEnd };
        this.rounds = buildRounds(record);
        this.index = 0;
        this.speed = 2;
        this.tau = -LEAD_MS;
        this.lastFrame = performance.now();
        this.timer = setInterval(() => this.frame(), FRAME_MS);
    }

    frame() {
        const now = performance.now();
        this.tau += (now - this.lastFrame) * this.speed;
        this.lastFrame = now;
        if (this.tau > this.rounds[this.index].length + TAIL_MS) this.nextRound();
        else this.handlers.onUpdate();
    }

    nextRound() {
        if (this.index + 1 >= this.rounds.length) {
            this.stop();
            this.handlers.onEnd();
            return;
        }
        this.index += 1;
        this.tau = -LEAD_MS;
        this.handlers.onUpdate();
    }

    toggleSpeed() {
        this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length];
        return this.speed;
    }

    stop() {
        clearInterval(this.timer);
    }

    clock() {
        return { elapsed: this.tau, countdown: this.tau < 0, paused: false };
    }

    // ラウンドの始まりのビューに、今の時刻までに解いた人の結果だけを入れる
    getView() {
        const round = this.rounds[this.index];
        const view = structuredClone(round.view);
        view.players.forEach((player, seat) => {
            const result = round.results[seat];
            const time = result?.solved ? result.t ?? result.time : null;
            player.result = time !== null && this.tau >= time ? result : null;
        });
        return view;
    }

    // 自分のピースの、今の時刻の位置
    placements() {
        const round = this.rounds[this.index];
        const pieces = {};
        round.view.puzzle.pieces.forEach(id => { pieces[id] = { rot: 0, flip: 0, x: 0, y: 0, on: false }; });
        for (const [t, id, rot, flip, x, y] of round.trace) {
            if (t > this.tau || !pieces[id]) continue;
            pieces[id] = rot === undefined ? { ...pieces[id], on: false } : { rot, flip, x, y, on: true };
        }
        return pieces;
    }
}

function buildRounds(record) {
    const state = createGame(record.options);
    const starts = [viewFor(state, 0)];
    for (const { seat, command } of record.commands) {
        const round = state.round;
        applyCommand(state, seat, command);
        if (state.round !== round && state.phase === 'play') starts.push(viewFor(state, 0));
    }
    return starts.map((view, i) => {
        const results = state.history[i]?.results ?? [];
        const trace = record.traces?.[view.round] ?? [];
        const times = [...results.filter(r => r.solved).map(r => r.t ?? r.time), ...trace.map(entry => entry[0])];
        const length = Math.min(view.timeLimit ?? Infinity, Math.max(3000, ...times));
        return { view, results, trace, length };
    });
}
