/**
 * 盤面の描画（canvas）。対戦の状態を読むだけで、書き換えない
 * mySide が 1 のとき（オンラインで B の席）は盤面を 180 度回して、自分がいつも左・青に見えるようにする
 */

import { WIDTH, HEIGHT } from './arms.js';
import { armImage, SIDE_COLORS } from './art.js';

const UNIT = 11;         // 兵器の絵の大きさ（盤面の座標で）
const MARGIN = 5;        // 盤面の上下の余白（端の兵器の絵が切れないように）
const SHOT_TICKS = 6;

export function createBoard(canvas, { reducedMotion = false } = {}) {
    const ctx = canvas.getContext('2d');
    let scale = 1;
    let width = 0;
    let height = 0;

    function resize() {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        scale = Math.min(width / (WIDTH + MARGIN * 2), height / (HEIGHT + MARGIN * 2));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // 盤面の座標 → 画面の座標
    const toScreen = (x, y, flip) => {
        const bx = flip ? WIDTH - x : x;
        const by = flip ? HEIGHT - y : y;
        return [(width - WIDTH * scale) / 2 + bx * scale, (height - HEIGHT * scale) / 2 + by * scale];
    };

    function drawGround(mySide) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#3a4b3e');
        grad.addColorStop(1, '#2a382f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        const [x0, y0] = toScreen(0, 0, false);
        ctx.strokeStyle = 'rgba(255,255,255,.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= WIDTH; x += 20) { ctx.moveTo(x0 + x * scale, y0); ctx.lineTo(x0 + x * scale, y0 + HEIGHT * scale); }
        for (let y = 0; y <= HEIGHT; y += 20) { ctx.moveTo(x0, y0 + y * scale); ctx.lineTo(x0 + WIDTH * scale, y0 + y * scale); }
        ctx.stroke();
        // 中央の線
        ctx.strokeStyle = 'rgba(255,255,255,.12)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x0 + (WIDTH / 2) * scale, 0);
        ctx.lineTo(x0 + (WIDTH / 2) * scale, height);
        ctx.stroke();
        ctx.setLineDash([]);
        // 陣地（左が自軍の色）
        const baseW = 4 * scale;
        ctx.fillStyle = SIDE_COLORS[0].body;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(0, 0, x0 + baseW, height);
        ctx.fillStyle = SIDE_COLORS[1].body;
        ctx.fillRect(x0 + WIDTH * scale - baseW, 0, width, height);
        ctx.globalAlpha = 1;
        return mySide;
    }

    function draw(battle, { mySide = 0 } = {}) {
        if (!width) resize();
        const flip = mySide === 1;
        ctx.clearRect(0, 0, width, height);
        drawGround(mySide);
        const colorOf = (side) => (side === mySide ? 0 : 1);
        const size = UNIT * scale;
        // 地上 → 空の順に描く（空の兵器を上に）
        for (const air of [false, true]) {
            for (const s of battle.sides) {
                for (const arm of s.arms) {
                    if (arm.onAir !== air) continue;
                    const [sx, sy] = toScreen(arm.x, arm.y, flip);
                    const facingLeft = (arm.side === 0) === flip;
                    if (air) {
                        ctx.fillStyle = 'rgba(0,0,0,.25)';
                        ctx.beginPath();
                        ctx.ellipse(sx + size * 0.15, sy + size * 0.35, size * 0.35, size * 0.14, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    const image = armImage(arm.type, colorOf(arm.side), facingLeft);
                    if (image.complete) ctx.drawImage(image, sx - size / 2, sy - size / 2 - (air ? size * 0.15 : 0), size, size);
                    if (arm.life < arm.maxLife) {
                        const w = size * 0.8;
                        ctx.fillStyle = 'rgba(0,0,0,.5)';
                        ctx.fillRect(sx - w / 2, sy + size * 0.42, w, 2);
                        ctx.fillStyle = arm.life * 2 > arm.maxLife ? '#9be36a' : '#ffcf4a';
                        ctx.fillRect(sx - w / 2, sy + size * 0.42, (w * Math.max(0, arm.life)) / arm.maxLife, 2);
                    }
                }
            }
        }
        // 射撃の線
        ctx.lineCap = 'round';
        for (const shot of battle.shots) {
            const age = battle.time - shot.t;
            if (age > SHOT_TICKS) continue;
            const [x1, y1] = toScreen(shot.x1, shot.y1, flip);
            const [x2, y2] = toScreen(shot.x2, shot.y2, flip);
            ctx.globalAlpha = 1 - age / (SHOT_TICKS + 1);
            ctx.strokeStyle = colorOf(shot.side) === 0 ? '#cfe6ff' : '#ffd9cf';
            ctx.lineWidth = Math.max(1, scale * 0.6);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // 陣地への攻撃
        for (const blast of battle.blasts) {
            const age = battle.time - blast.t;
            const [bx, by] = toScreen(blast.x, blast.y, flip);
            const r = reducedMotion ? 6 * scale : (3 + age * 0.4) * scale;
            ctx.globalAlpha = Math.max(0, 1 - age / (SHOT_TICKS * 4));
            ctx.fillStyle = '#ffb347';
            ctx.beginPath();
            ctx.arc(bx, by, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    return { resize, draw };
}
