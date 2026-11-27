/**
 * 盤のルール（DOM にも乱数にも依存しない純粋な関数）
 * ゲーム本体（game.js）と CPU の先読み（cpu-player.js）が、同じ関数で盤を進める
 * 盤：進入路（飛行機の位置と、ほかの飛行機の数）・軸の傾き・着陸装置・フラップ・ブレーキ・コーヒー・振り直し・この回の置き場
 */

export const PILOT = 0;
export const COPILOT = 1;
export const ROLE_NAMES = ['機長', '副操縦士'];

// 空港（進入路の長さ、マスごとのほかの飛行機、振り直しをもらう回）
// 原作の空港を参考にした配置（マスの数と飛行機の数は、遊びやすさを測って決めた近似）
export const AIRPORTS = {
    YUL: { key: 'YUL', name: 'モントリオール', level: '入門', planes: [0, 0, 1, 2, 1, 2, 0], rerolls: [2, 5] },
    HND: { key: 'HND', name: '東京・羽田', level: '中級', planes: [0, 1, 1, 2, 2, 1, 2, 0], rerolls: [4] },
    KUL: { key: 'KUL', name: 'クアラルンプール', level: '上級', planes: [0, 1, 2, 2, 1, 3, 2, 0], rerolls: [] }
};
export const AIRPORT_KEYS = Object.keys(AIRPORTS);
export const ROUNDS = 7; // 高度 6000 フィートから 1000 ずつ降りて、7 回目が着陸

// 置き場。seat が null なら、どちらも置ける。values はその目だけ置ける
export const SLOTS = {
    axisP: { seat: PILOT, kind: 'axis', mandatory: true },
    axisC: { seat: COPILOT, kind: 'axis', mandatory: true },
    engineP: { seat: PILOT, kind: 'engine', mandatory: true },
    engineC: { seat: COPILOT, kind: 'engine', mandatory: true },
    radioP: { seat: PILOT, kind: 'radio' },
    radioC1: { seat: COPILOT, kind: 'radio' },
    radioC2: { seat: COPILOT, kind: 'radio' },
    gear1: { seat: PILOT, kind: 'gear', index: 0, values: [1, 2] },
    gear2: { seat: PILOT, kind: 'gear', index: 1, values: [3, 4] },
    gear3: { seat: PILOT, kind: 'gear', index: 2, values: [5, 6] },
    brake1: { seat: PILOT, kind: 'brake', index: 0, values: [2] },
    brake2: { seat: PILOT, kind: 'brake', index: 1, values: [4] },
    brake3: { seat: PILOT, kind: 'brake', index: 2, values: [6] },
    flap1: { seat: COPILOT, kind: 'flap', index: 0, values: [1, 2] },
    flap2: { seat: COPILOT, kind: 'flap', index: 1, values: [2, 3] },
    flap3: { seat: COPILOT, kind: 'flap', index: 2, values: [4, 5] },
    flap4: { seat: COPILOT, kind: 'flap', index: 3, values: [5, 6] },
    coffee1: { seat: null, kind: 'coffee', index: 0 },
    coffee2: { seat: null, kind: 'coffee', index: 1 },
    coffee3: { seat: null, kind: 'coffee', index: 2 }
};
export const SLOT_IDS = Object.keys(SLOTS);
export const MANDATORY = [['axisP', 'engineP'], ['axisC', 'engineC']];
export const MAX_COFFEE = 3;
export const AXIS_LIMIT = 3; // 傾きがこの値に届いたら墜落
export const BRAKE_VALUES = [0, 2, 4, 6];
export const BASE_BLUE = 4;   // 速度がこれ以下なら進まない（着陸装置1つで +1）
export const BASE_ORANGE = 8; // 速度がこれより大きければ 2 マス進む（フラップ1つで +1）

export function createBoard(airportKey = 'YUL') {
    const airport = AIRPORTS[airportKey] ?? AIRPORTS.YUL;
    return {
        airport: airport.key,
        round: 1,
        rounds: ROUNDS,
        pos: 0,
        planes: [...airport.planes],
        axis: 0,
        gear: [false, false, false],
        flaps: 0,
        brakes: 0,
        coffee: 0,
        rerolls: airport.rerolls.includes(1) ? 1 : 0,
        slots: {},
        speed: null,
        advance: null,
        result: null
    };
}

export const cloneBoard = b => ({ ...b, planes: [...b.planes], gear: [...b.gear], slots: { ...b.slots }, result: b.result ? { ...b.result } : null });
export const trackEnd = b => b.planes.length - 1;
export const gearCount = b => b.gear.filter(Boolean).length;
export const blueOf = b => BASE_BLUE + gearCount(b);
export const orangeOf = b => BASE_ORANGE + b.flaps;
export const brakeValueOf = b => BRAKE_VALUES[b.brakes];
export const altitudeOf = b => (b.rounds - b.round) * 1000;
export const isFinalRound = b => b.round === b.rounds;
export const firstSeatOf = round => (round % 2 === 1 ? PILOT : COPILOT);
export const planesLeft = b => b.planes.reduce((a, n) => a + n, 0);

// 速度から進むマスの数
export const advanceFor = (b, speed) => (speed <= blueOf(b) ? 0 : speed <= orangeOf(b) ? 1 : 2);

// その席が、まだ埋めていない必須の置き場
export const openMandatory = (b, seat) => MANDATORY[seat].filter(id => !b.slots[id]);

// 置き場にその目を置けるか（必須の置き場を残す決まりは、残りのダイスの数を知っている呼び手が見る）
export function canPlace(b, seat, slotId, value) {
    const slot = SLOTS[slotId];
    if (!slot || b.slots[slotId] || value < 1 || value > 6) return false;
    if (slot.seat !== null && slot.seat !== seat) return false;
    if (slot.values && !slot.values.includes(value)) return false;
    if (slot.kind === 'gear') return !b.gear[slot.index];
    if (slot.kind === 'brake') return slot.index === b.brakes;
    if (slot.kind === 'flap') return slot.index === b.flaps;
    return true;
}

// diceLeft：置く前の、その席の残りのダイスの数
export function canPlaceWithReserve(b, seat, slotId, value, diceLeft) {
    if (!canPlace(b, seat, slotId, value)) return false;
    return SLOTS[slotId].mandatory || diceLeft > openMandatory(b, seat).length;
}

/**
 * 置く（目は、コーヒーで変えたあとの値）。盤を変え、起きたことの配列を返す
 * 軸とエンジンは、2つ目のダイスが置かれたときに決まる
 */
export function place(b, seat, slotId, value) {
    const slot = SLOTS[slotId];
    const out = [];
    b.slots[slotId] = { seat, value };
    if (slot.kind === 'axis' && b.slots.axisP && b.slots.axisC) {
        b.axis += b.slots.axisP.value - b.slots.axisC.value;
        out.push({ type: 'axis', axis: b.axis });
        if (Math.abs(b.axis) >= AXIS_LIMIT) lose(b, 'axis', out);
    } else if (slot.kind === 'engine' && b.slots.engineP && b.slots.engineC) {
        const speed = b.slots.engineP.value + b.slots.engineC.value;
        b.speed = speed;
        if (isFinalRound(b)) {
            b.advance = 0;
            out.push({ type: 'engine', speed, advance: 0, pos: b.pos, final: true });
        } else {
            const advance = advanceFor(b, speed);
            b.advance = advance;
            for (let i = 0; i < advance; i++) {
                if (b.planes[b.pos] > 0) {
                    out.push({ type: 'engine', speed, advance, pos: b.pos });
                    lose(b, 'collision', out);
                    return out;
                }
                if (b.pos + 1 > trackEnd(b)) {
                    out.push({ type: 'engine', speed, advance, pos: b.pos });
                    lose(b, 'overshoot', out);
                    return out;
                }
                b.pos++;
            }
            out.push({ type: 'engine', speed, advance, pos: b.pos });
        }
    } else if (slot.kind === 'radio') {
        const target = b.pos + value - 1;
        const cleared = target <= trackEnd(b) && b.planes[target] > 0;
        if (cleared) b.planes[target]--;
        out.push({ type: 'radio', target, cleared });
    } else if (slot.kind === 'gear') {
        b.gear[slot.index] = true;
        out.push({ type: 'switch', kind: 'gear', blue: blueOf(b) });
    } else if (slot.kind === 'flap') {
        b.flaps++;
        out.push({ type: 'switch', kind: 'flap', orange: orangeOf(b) });
    } else if (slot.kind === 'brake') {
        b.brakes++;
        out.push({ type: 'switch', kind: 'brake', brake: brakeValueOf(b) });
    } else if (slot.kind === 'coffee') {
        const gained = b.coffee < MAX_COFFEE;
        if (gained) b.coffee++;
        out.push({ type: 'coffee', gained, coffee: b.coffee });
    }
    return out;
}

function lose(b, reason, out) {
    b.result = { win: false, reasons: [reason] };
    out.push({ type: 'end', win: false, reasons: [reason] });
}

// 着陸の条件のうち、満たしていないもの（最後の回のエンジンと軸が決まったあとに見る）
export function landingFailures(b) {
    const reasons = [];
    if (b.pos !== trackEnd(b)) reasons.push('short');
    if (planesLeft(b) > 0) reasons.push('traffic');
    if (gearCount(b) < 3) reasons.push('gear');
    if (b.flaps < 4) reasons.push('flaps');
    if (b.axis !== 0) reasons.push('tilt');
    if (b.speed === null || b.speed >= brakeValueOf(b)) reasons.push('brakes');
    return reasons;
}

/**
 * 回の終わり（全員のダイスを置いた）。最後の回なら着陸の判定、そうでなければ次の回へ（高度を下げる）
 */
export function endRound(b) {
    const out = [];
    if (b.result) return out;
    if (isFinalRound(b)) {
        const reasons = landingFailures(b);
        b.result = { win: reasons.length === 0, reasons };
        out.push({ type: 'end', win: b.result.win, reasons });
        return out;
    }
    b.round++;
    b.slots = {};
    b.speed = null;
    b.advance = null;
    if (AIRPORTS[b.airport].rerolls.includes(b.round)) {
        b.rerolls++;
        out.push({ type: 'rerollToken' });
    }
    out.push({ type: 'round', round: b.round, altitude: altitudeOf(b) });
    return out;
}

export const REASON_TEXT = {
    axis: '機体が傾きすぎて墜落',
    collision: 'ほかの飛行機とぶつかった',
    overshoot: '空港を通り過ぎた',
    short: '空港に届いていない',
    traffic: '進入路にほかの飛行機が残っている',
    gear: '着陸装置が出ていない',
    flaps: 'フラップが出きっていない',
    tilt: '機体が水平でない',
    brakes: '速度がブレーキより速い'
};
