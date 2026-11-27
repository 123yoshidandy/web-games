/**
 * 盤面の絵（SVG。絵柄は自作）
 * 1マスを 10 の大きさで描く（盤面は 160×160）。壁・目標・真ん中のような動かないものは盤面ごとに1回だけ文字列で作り、
 * ロボットは要素を残したまま transform で動かす（作り直すと、滑る動きが出ない）
 */

import { SIZE, CELLS, WALL, CENTER, VORTEX, xOf, yOf, targetInfo, ROBOT_NAMES } from './board.js';

export const UNIT = 10;
export const COLORS = ['#e0525f', '#3b7fd9', '#2ea76c', '#e3a81f', '#9aa4b1'];
const DARK = ['#9e2633', '#1f4f99', '#17704a', '#9c6c05', '#5f6874'];
const TINTS = ['#f6d6da', '#d5e3f7', '#d3efe0', '#f8e7bf', '#e3e6ea'];

export const centerOf = cell => [xOf(cell) * UNIT + UNIT / 2, yOf(cell) * UNIT + UNIT / 2];

// 目標の記号（中心 (0,0)、大きさ s）
export function symbolPath(symbol, s = 1) {
    const r = 3 * s;
    switch (symbol) {
        case 'ring':
            return `<circle r="${(2.4 * s).toFixed(2)}" fill="none" stroke-width="${(1.25 * s).toFixed(2)}"/>`;
        case 'triangle':
            return `<path d="M0 ${-r} L${(r * 0.92).toFixed(2)} ${(r * 0.62).toFixed(2)} H${(-r * 0.92).toFixed(2)} Z" stroke="none"/>`;
        case 'diamond':
            return `<path d="M0 ${-r} L${r * 0.85} 0 L0 ${r} L${-r * 0.85} 0 Z" stroke="none"/>`;
        case 'star': {
            const points = [];
            for (let i = 0; i < 10; i++) {
                const radius = i % 2 ? r * 0.45 : r * 1.05;
                const angle = -Math.PI / 2 + i * Math.PI / 5;
                points.push(`${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`);
            }
            return `<polygon points="${points.join(' ')}" stroke="none"/>`;
        }
        default: {
            // 渦：4色の弧
            const arcs = [0, 1, 2, 3].map(i => {
                const a = i * Math.PI / 2;
                const x1 = Math.cos(a) * r * 0.95, y1 = Math.sin(a) * r * 0.95;
                const x2 = Math.cos(a + 1.35) * r * 0.35, y2 = Math.sin(a + 1.35) * r * 0.35;
                return `<path d="M${x1.toFixed(2)} ${y1.toFixed(2)} Q${(Math.cos(a + 0.9) * r).toFixed(2)} ${(Math.sin(a + 0.9) * r).toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${COLORS[i]}" stroke-width="${(1.15 * s).toFixed(2)}" stroke-linecap="round"/>`;
            });
            return arcs.join('');
        }
    }
}

// 目標の絵（色の付いた記号）。中心 (0,0)
export function targetMark(id, s = 1) {
    const info = targetInfo(id);
    if (id === VORTEX) return `<g class="mark vortex">${symbolPath('vortex', s)}</g>`;
    return `<g class="mark" fill="${COLORS[info.color]}" stroke="${COLORS[info.color]}">${symbolPath(info.symbol, s)}</g>`;
}

// 単独の小さな SVG（状態の表示・チップ・ログ）
export function targetIcon(id, className = 'target-icon') {
    return `<svg class="${className}" viewBox="-5 -5 10 10" aria-hidden="true">${targetMark(id, 1.15)}</svg>`;
}

export function robotIcon(robot, className = 'robot-icon') {
    return `<svg class="${className}" viewBox="-5 -5 10 10" aria-hidden="true">${robotBody(robot)}</svg>`;
}

// ロボット：丸い体に目と頭のアンテナ（中心 (0,0)）
export function robotBody(robot) {
    return `<g class="robot-body">
        <ellipse cx="0" cy="3.3" rx="3.2" ry="0.9" fill="rgba(0,0,0,.22)"/>
        <line x1="0" y1="-3.6" x2="0" y2="-4.6" stroke="${DARK[robot]}" stroke-width="0.7" stroke-linecap="round"/>
        <circle cx="0" cy="-4.7" r="0.65" fill="${COLORS[robot]}" stroke="${DARK[robot]}" stroke-width="0.35"/>
        <circle r="3.6" fill="${COLORS[robot]}" stroke="${DARK[robot]}" stroke-width="0.6"/>
        <path d="M-2.6 -0.9 A2.6 2.6 0 0 1 2.6 -0.9" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="0.7" stroke-linecap="round"/>
        <rect x="-2.3" y="-0.9" width="4.6" height="2.1" rx="1.05" fill="#fdfbf6"/>
        <circle cx="-1.05" cy="0.15" r="0.55" fill="#1d2230"/>
        <circle cx="1.05" cy="0.15" r="0.55" fill="#1d2230"/>
    </g>`;
}

// 動かない部分（マス・壁・目標・真ん中）
export function staticBoard(view) {
    const parts = [];
    parts.push(`<rect x="-1" y="-1" width="${SIZE * UNIT + 2}" height="${SIZE * UNIT + 2}" rx="2" class="frame"/>`);
    parts.push(`<rect x="0" y="0" width="${SIZE * UNIT}" height="${SIZE * UNIT}" class="floor"/>`);
    // マスの溝
    const grid = [];
    for (let i = 1; i < SIZE; i++) grid.push(`M${i * UNIT} 0V${SIZE * UNIT}M0 ${i * UNIT}H${SIZE * UNIT}`);
    parts.push(`<path d="${grid.join('')}" class="grid"/>`);
    // 目標のマス
    for (const target of view.board.targets) {
        const [cx, cy] = centerOf(target.cell);
        const tint = target.id === VORTEX ? '#ece4f6' : TINTS[Math.floor(target.id / 4)];
        parts.push(`<g class="target" data-target="${target.id}" transform="translate(${cx} ${cy})">
            <rect x="-4.4" y="-4.4" width="8.8" height="8.8" rx="1.6" fill="${tint}"/>${targetMark(target.id)}</g>`);
    }
    // 真ん中
    const [c0x, c0y] = [xOf(CENTER[0]) * UNIT, yOf(CENTER[0]) * UNIT];
    parts.push(`<rect x="${c0x}" y="${c0y}" width="${UNIT * 2}" height="${UNIT * 2}" rx="1.5" class="center"/>`);
    parts.push(`<g id="center-target" transform="translate(${c0x + UNIT} ${c0y + UNIT})"></g>`);
    // 壁（右と下の辺を描く。外周は枠で描く）
    const walls = [];
    for (let cell = 0; cell < CELLS; cell++) {
        const x = xOf(cell) * UNIT, y = yOf(cell) * UNIT;
        const bits = view.board.walls[cell];
        if ((bits & WALL.E) && xOf(cell) < SIZE - 1) walls.push(`M${x + UNIT} ${y - 0.4}V${y + UNIT + 0.4}`);
        if ((bits & WALL.S) && yOf(cell) < SIZE - 1) walls.push(`M${x - 0.4} ${y + UNIT}H${x + UNIT + 0.4}`);
    }
    parts.push(`<path d="${walls.join('')}" class="walls"/>`);
    parts.push(`<rect x="0" y="0" width="${SIZE * UNIT}" height="${SIZE * UNIT}" class="outer"/>`);
    parts.push('<g id="layer-trail"></g><g id="layer-ghosts"></g><g id="layer-robots"></g><g id="layer-overlay"></g>');
    return parts.join('');
}

// ロボットの要素（盤面ごとに1回作る）
export function robotElements(count) {
    return [...Array(count).keys()].map(robot =>
        `<g class="robot" data-robot="${robot}" aria-label="${ROBOT_NAMES[robot]}のロボット"><g class="robot-scale">${robotBody(robot)}</g></g>`).join('');
}

// 動いた道筋（手ごとの線）
export function trailPath(path) {
    return path.map(({ robot, from, to }, i) => {
        const [x1, y1] = centerOf(from);
        const [x2, y2] = centerOf(to);
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLORS[robot]}" class="trail" style="--i:${i}"/>`
            + `<circle cx="${x2}" cy="${y2}" r="1.1" fill="${COLORS[robot]}" class="trail-end"/>`;
    }).join('');
}

export function ghostRobots(robots, moved) {
    return robots.map((cell, robot) => {
        if (!moved[robot]) return '';
        const [cx, cy] = centerOf(cell);
        return `<circle cx="${cx}" cy="${cy}" r="3.3" class="ghost" stroke="${COLORS[robot]}"/>`;
    }).join('');
}

// 選んだロボットの矢印（動ける向きだけ）と、止まる先の印
export function arrowsFor(cell, targets, recommendedDir = null) {
    const [cx, cy] = centerOf(cell);
    return targets.map(({ dir, to }) => {
        if (to === cell) return '';
        const [tx, ty] = centerOf(to);
        const ax = cx + [0, 1, 0, -1][dir] * UNIT * 0.98;
        const ay = cy + [-1, 0, 1, 0][dir] * UNIT * 0.98;
        const rotate = dir * 90;
        const recommended = dir === recommendedDir ? ' recommended' : '';
        return `<circle cx="${tx}" cy="${ty}" r="1.4" class="dest"/>`
            + `<g class="arrow${recommended}" data-dir="${dir}" transform="translate(${ax} ${ay}) rotate(${rotate})">`
            + '<circle r="4.4" class="arrow-hit"/><circle r="3.2" class="arrow-bg"/><path d="M0 -1.8 L1.7 0.6 H-1.7 Z" class="arrow-head"/></g>';
    }).join('');
}

// タイトルの絵：小さな盤の一部を、ロボットが跳ね返って目標に着く様子
export function titleArt() {
    const cells = 8;
    const u = UNIT;
    // 青が右へ滑って壁で止まり、下へ、左へ滑って目標に着く（止まる壁を描く）
    const walls = 'M70 10V20M60 60H70M30 0V10M0 50H10M20 70H30M20 70V80';
    const trail = [[1, 1, 6, 1], [6, 1, 6, 5], [6, 5, 4, 5]].map(([x1, y1, x2, y2]) =>
        `<line x1="${x1 * u + 5}" y1="${y1 * u + 5}" x2="${x2 * u + 5}" y2="${y2 * u + 5}" stroke="${COLORS[1]}" class="trail"/>`).join('');
    return `<svg viewBox="-2 -2 84 84" class="art-board">
        <rect x="-1" y="-1" width="82" height="82" rx="2" class="frame"/>
        <rect x="0" y="0" width="${cells * u}" height="${cells * u}" class="floor"/>
        <path d="${[...Array(cells - 1).keys()].map(i => `M${(i + 1) * u} 0V80M0 ${(i + 1) * u}H80`).join('')}" class="grid"/>
        <g transform="translate(45 55)"><rect x="-4.4" y="-4.4" width="8.8" height="8.8" rx="1.6" fill="${TINTS[1]}"/>${targetMark(5)}</g>
        <g transform="translate(15 35)"><rect x="-4.4" y="-4.4" width="8.8" height="8.8" rx="1.6" fill="${TINTS[0]}"/>${targetMark(2)}</g>
        <path d="${walls} M40 50H50 M40 50V60" class="walls"/>
        ${trail}
        <g transform="translate(45 55)">${robotBody(1)}</g>
        <g transform="translate(25 25)">${robotBody(0)}</g>
        <g transform="translate(65 65)">${robotBody(3)}</g>
        <g transform="translate(15 75)">${robotBody(2)}</g>
        <rect x="0" y="0" width="80" height="80" class="outer"/>
    </svg>`;
}
