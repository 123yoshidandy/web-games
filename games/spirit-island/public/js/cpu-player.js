/**
 * CPU の精霊（協力の仲間）と、ヒントのおすすめの手
 * DOM にもゲームの乱数にも依存しない。同じ局面からは、いつも同じ手を選ぶ
 * 成長と存在の置き場は目安の点数で、カードの使い方と力の対象は、盤面の写しで試して良さ（evaluate）で選ぶ
 * 良さは、次の荒らしと建設を写しの上で本物のルールで起こしてから測る。遅い力は、このターンの侵略者フェイズのあとの盤面で測る
 */

import { SPIRITS, CARD, INVADER_DAMAGE, ELEMENTS } from './data.js';
import {
    availablePowers, powerTargets, powerInfo, usePower, landsInRange, presenceSources, energyValue, cardPlays,
    matchesCard, isSacred, innateLevel, elementsOf, meets, silent, presenceTotal, topology, ravage, build, terrorLevel
} from './rules.js';

const INV_VALUE = { E: 1, T: 2.6, C: 4 };
// 判断の重み（cpu-match で勝率を測って決めた値）
// 2体・各難易度で、勝率を見比べて選んだ（scripts/cpu-match.mjs）。majorEnergy：毎ターンのエネルギーがこれ以上なら大いなる力を取る
export const TUNING = { energyCost: 0.45, presenceTurns: 3, cardTrack: 0, fear: 0.8, blightPool: 1.5, blightLand: 2, range0: 0.6, placeThreat: 0.25, majorEnergy: 4 };

// 状態の写し（CPU の先読み用。structuredClone より速い）
export function cloneState(s) {
    return {
        ...s,
        lands: s.lands.map(L => ({ ...L, inv: L.inv.map(p => ({ ...p })), dahan: [...L.dahan], presence: [...L.presence], flags: { ...L.flags } })),
        spirits: s.spirits.map(sp => ({ ...sp, hand: [...sp.hand], discard: [...sp.discard], played: [...sp.played], used: [...sp.used], repeat: sp.repeat ? { ...sp.repeat } : null })),
        invader: { ...s.invader },
        fear: { ...s.fear, earned: [...s.fear.earned], deck: [...s.fear.deck] },
        blight: { ...s.blight },
        turnFlags: { ...s.turnFlags }
    };
}

// 盤面の良さ（大きいほど精霊に良い）
// 次の荒らしと建設を、本物のルールで写しの上に起こしてから測る（隠れた山はのぞかない。探検は先が分からないので起こさない）
// 遅い力のフェイズでは、次の荒らしまでにターンが終わるので、今の防御と印を消してから起こす
export function evaluate(s) {
    if (s.result) return staticEval(s);
    const t = cloneState(s);
    if (t.phase === 'slow') {
        t.lands.forEach(L => { L.defend = 0; L.flags = {}; });
        t.turnFlags = {};
    }
    const ctx = silent(t);
    if (t.invader.ravage) ravage(ctx, t.invader.ravage);
    if (!t.result && t.invader.build) build(ctx, t.invader.build);
    return staticEval(t);
}

function staticEval(s) {
    let score = s.result ? (s.result.won ? 500 : -500) : 0;
    const tl = terrorLevel(s);
    s.lands.forEach(L => {
        const strength = L.inv.reduce((a, p) => a + INVADER_DAMAGE[p.k], 0);
        score -= L.inv.reduce((a, p) => a + INV_VALUE[p.k], 0);
        // 勝ちの条件に残っている侵略者
        score -= L.inv.filter(p => (tl === 1 ? true : tl === 2 ? p.k !== 'E' : p.k === 'C')).length * 0.6;
        score -= L.blight * TUNING.blightLand;
        score += L.dahan.length * 1.2;
        score += presenceTotal(L) * 0.8;
        // 建設のカードの土地は、次のターンに荒らされる
        if (L.inv.length && matchesCard(s, L, s.invader.build)) {
            const vitality = s.spirits.some((sp, seat) => sp.key === 'earth' && isSacred(s, seat, L)) ? 3 : 0;
            if (strength - vitality >= 2) score -= 2.5 + (L.blight ? 2 : 0) + presenceTotal(L);
        }
    });
    score += s.blight.pool * (s.blight.flipped ? 4 : TUNING.blightPool);
    score += (s.fear.earnedCount * s.fear.pool + s.fear.gen) * TUNING.fear + s.fear.earnedCount * 2;
    score += s.spirits.reduce((a, sp) => a + sp.energy, 0) * 0.4;
    score -= s.spirits.reduce((a, sp) => a + sp.destroyed, 0) * 1.5;
    return score;
}

// 対象を試す土地を絞る（何も起きない土地は試さない）
function interesting(s, id) {
    const L = s.lands[id];
    if (L.inv.length || L.dahan.length || L.blight) return true;
    return L.adj.some(a => s.lands[a].inv.length || s.lands[a].dahan.length);
}

// 力の手の候補 { command, gain }
export function powerMoves(s, seat) {
    const base = evaluate(s);
    const moves = [];
    availablePowers(s, seat).forEach(({ power }) => {
        const info = powerInfo(s, seat, power);
        const targets = powerTargets(s, seat, power);
        if (info.target === 'spirit') {
            targets.forEach(({ spirit }) => {
                const t = cloneState(s);
                usePower(silent(t), seat, { power, spirit });
                moves.push({ command: { type: 'power', power, spirit }, gain: evaluate(t) - base + spiritBonus(s, seat, info, spirit) });
            });
            return;
        }
        const lands = targets.filter(t => interesting(s, t.land));
        (lands.length ? lands : targets.slice(0, 1)).forEach(({ land }) => {
            const L = s.lands[land];
            const dests = info.push && (L.inv.length || L.dahan.length) ? L.adj : [undefined];
            dests.forEach(dest => {
                const t = cloneState(s);
                const command = { type: 'power', power, land, ...(dest !== undefined ? { dest } : {}) };
                usePower(silent(t), seat, command);
                moves.push({ command, gain: evaluate(t) - base });
            });
        });
    });
    return moves;
}

// 盤面に出ない効果（遅い力を速く使える・くり返し）の目安
function spiritBonus(s, seat, info, spirit) {
    if (info.id === 'lboon') {
        if (s.phase !== 'fast') return 0;
        const slowLeft = s.spirits[spirit].played.filter(id => CARD[id].speed === 'slow' && !s.spirits[spirit].used.includes(`c:${id}`)).length;
        return Math.min(2, slowLeft) * 0.8;
    }
    if (info.id === 'gift') {
        const sp = s.spirits[spirit];
        return sp.played.length ? 0.6 + (spirit === seat ? 0 : 0.2) : 0;
    }
    return 0;
}

const better = (a, b) => (b === null || a.gain > b.gain + 1e-9 ? a : b);

// 成長の選び方：手札が尽きそうなら取り戻し、序盤は存在を増やし、手札が少なければカードを得る
function growthScore(s, seat, parts) {
    const sp = s.spirits[seat];
    const usable = sp.hand.filter(id => CARD[id].cost <= sp.energy + energyValue(s, seat) + 2).length;
    const count = (p) => parts.filter(x => x.startsWith(p)).length;
    const canPlace = presenceSources(s, seat).length > 0;
    let score = 0;
    if (parts.includes('reclaim')) score += usable <= 1 && sp.discard.length >= 2 ? 10 : sp.discard.length * 0.5 - 2;
    // 範囲0の存在は今いる土地に重ねるだけで、届く土地が広がらない
    parts.filter(p => p.startsWith('presence')).forEach(p => {
        const reach = Number(p.slice(8)) === 0 ? TUNING.range0 : 1;
        score += canPlace ? (s.turn <= TUNING.presenceTurns ? 4 : 2.2) * reach : 0;
    });
    score += count('power') * (sp.hand.length + sp.discard.length < 5 ? 3 : 1.6);
    parts.filter(p => p.startsWith('energy')).forEach(p => { score += Number(p.slice(6)) * 0.8; });
    return score;
}

function presenceMove(s, seat, range) {
    const sp = s.spirits[seat];
    const def = SPIRITS[sp.key];
    const sources = presenceSources(s, seat);
    let track = 'destroyed';
    const tracks = sources.filter(x => x !== 'destroyed');
    if (tracks.length) {
        const plays = cardPlays(s, seat);
        const gainE = tracks.includes('energy') ? def.energy[sp.energyIdx] - energyValue(s, seat) + (energyValue(s, seat) <= 2 ? 0.8 : 0) : -99;
        const nextC = def.cards[sp.cardIdx];
        // エネルギーが余っているなら、使えるカードの枚数を増やす方へ
        const spare = Math.max(0, sp.energy + energyValue(s, seat) - plays * 2);
        const gainC = tracks.includes('cards') ? (nextC === 'R' ? 0.7 : (nextC - plays) * 1.3) + (sp.hand.length > plays ? 0.4 : 0) + Math.min(3, spare / 2) : -99;
        track = gainC + TUNING.cardTrack > gainE ? 'cards' : 'energy';
    }
    const { dist } = topology(s.n);
    const threat = (L) => L.inv.reduce((a, p) => a + INVADER_DAMAGE[p.k], 0);
    let best = null;
    landsInRange(s, seat, range).forEach(id => {
        const L = s.lands[id];
        let score = 0;
        s.lands.forEach(M => {
            if (dist[id][M.id] <= 1) score += threat(M) * TUNING.placeThreat + M.dahan.length * 0.1;
        });
        if (L.presence[seat] === 1) score += sp.key === 'earth' ? 2.5 : 1.4;
        if (sp.key === 'river' && L.terrain === 'W' && L.presence[seat] === 0) score += 1.5;
        if (L.presence[seat] === 0) score += 0.8;
        if (L.presence[seat] >= 2) score -= 1.5;
        const danger = (matchesCard(s, L, s.invader.ravage) || matchesCard(s, L, s.invader.build)) && threat(L) >= 2;
        if (danger) score -= 2;
        score -= threat(L) * 0.35;
        if (L.blight) score -= 1;
        if (best === null || score > best.score + 1e-9) best = { score, land: id };
    });
    return { type: 'presence', track, land: best.land };
}

// カードの目安の値（得るカードを選ぶ・忘れるカードを選ぶ）
function cardValue(id) {
    const c = CARD[id];
    const words = c.text;
    let v = 1 + c.cost * 0.6;
    if (/ダメージ/.test(words)) v += 1.5;
    if (/破壊/.test(words)) v += 1.2;
    if (/恐怖/.test(words)) v += 0.8;
    if (/荒廃を/.test(words)) v += 1;
    if (c.speed === 'fast') v += 0.4;
    if (c.major) v += 2;
    return v;
}

// このターンの侵略者フェイズ（恐怖カードと探検は先が分からないので除く）が済んだあとの盤面の写し
function afterInvaderPhase(s) {
    const t = cloneState(s);
    const ctx = silent(t);
    if (t.invader.ravage) ravage(ctx, t.invader.ravage);
    if (!t.result && t.invader.build) build(ctx, t.invader.build);
    t.invader.ravage = t.invader.build;
    t.invader.build = null;
    return t;
}

// カードを使う段：手札の組み合わせを、盤面で試した良さで選ぶ
function playMove(s, seat) {
    const sp = s.spirits[seat];
    const plays = cardPlays(s, seat);
    const hand = sp.hand;
    // カードごとの良さ（そのカードだけを使ったとき）。遅い力は、このターンの荒らしと建設が済んだ盤面で測る
    const afterInvaders = afterInvaderPhase(s);
    const boardFor = (speed) => {
        const t = cloneState(speed === 'slow' ? afterInvaders : s);
        t.phase = speed;
        return t;
    };
    const gainOf = {};
    hand.forEach(id => {
        const t = boardFor(CARD[id].speed);
        t.spirits[seat].played = [id];
        t.spirits[seat].used = [];
        t.spirits[seat].done = false;
        t.spirits.forEach(x => { x.repeat = null; });
        const moves = powerMoves(t, seat).filter(m => m.command.power === `c:${id}`);
        const best = moves.reduce((a, m) => better(m, a), null);
        gainOf[id] = best ? Math.max(0, best.gain) : 0;
        if (id === 'lboon') gainOf[id] = 0.8;
    });
    const innate = SPIRITS[sp.key].innate;
    const innateGain = {};
    const innateFor = (cards) => {
        const t = boardFor(innate.speed);
        t.spirits[seat].played = cards;
        const level = innateLevel(t, seat);
        if (!level) return 0;
        if (innateGain[level] !== undefined) return innateGain[level];
        t.spirits[seat].used = cards.map(c => `c:${c}`);
        t.spirits[seat].done = false;
        const best = powerMoves(t, seat).filter(m => m.command.power === `i:${innate.id}`).reduce((a, m) => better(m, a), null);
        innateGain[level] = best ? Math.max(0, best.gain) : 0;
        return innateGain[level];
    };
    let best = { gain: 0, cards: [] };
    const n = hand.length;
    for (let mask = 1; mask < (1 << n); mask++) {
        const cards = hand.filter((_, i) => mask & (1 << i));
        if (cards.length > plays) continue;
        const cost = cards.reduce((a, c) => a + CARD[c].cost, 0);
        if (cost > sp.energy) continue;
        const gain = cards.reduce((a, c) => a + gainOf[c], 0) + innateFor(cards) - cost * TUNING.energyCost + cards.length * 0.05;
        if (gain > best.gain + 1e-9) best = { gain, cards };
    }
    return { type: 'play', cards: best.cards };
}

// その席のおすすめの手（状態は変えない）。打てる手がなければ null
export function suggest(game, seat) {
    const s = game.s ?? game;
    if (s.result || !s.spirits[seat]) return null;
    if (game.actors && !game.actors().includes(seat)) return null;
    const sp = s.spirits[seat];
    if (s.phase === 'spirit') {
        if (sp.step === 'growth') {
            const options = SPIRITS[sp.key].growth;
            let best = 0;
            options.forEach((parts, i) => { if (growthScore(s, seat, parts) > growthScore(s, seat, options[best]) + 1e-9) best = i; });
            return { type: 'growth', option: best };
        }
        if (sp.prompt?.kind === 'presence') return presenceMove(s, seat, sp.prompt.range);
        if (sp.prompt?.kind === 'deck') {
            const minorOk = s.minor.deck.length + s.minor.discard.length > 0;
            const majorOk = s.major.deck.length + s.major.discard.length > 0 && sp.hand.length + sp.discard.length > 0;
            const wantMajor = energyValue(s, seat) >= TUNING.majorEnergy && s.turn >= 3 && sp.hand.length + sp.discard.length >= 5;
            return { type: 'deck', deck: (wantMajor && majorOk) || !minorOk ? 'major' : 'minor' };
        }
        if (sp.prompt?.kind === 'pick') {
            const card = [...sp.prompt.cards].sort((a, b) => cardValue(b) - cardValue(a) || CARD[a].cost - CARD[b].cost || a.localeCompare(b))[0];
            return { type: 'pick', card };
        }
        if (sp.prompt?.kind === 'forget') {
            const pool = [...sp.hand, ...sp.discard].filter(c => c !== sp.prompt.gained);
            const card = pool.sort((a, b) => cardValue(a) - cardValue(b) || a.localeCompare(b))[0];
            return { type: 'forget', card };
        }
        if (sp.step === 'play') return playMove(s, seat);
        return null;
    }
    if (s.phase === 'fast' || s.phase === 'slow') {
        if (sp.done) return null;
        const best = powerMoves(s, seat).reduce((a, m) => better(m, a), null);
        if (best && best.gain > -0.05) return best.command;
        return { type: 'done' };
    }
    return null;
}

export const cpuSeatsToAct = (game) => game.actors().filter(seat => game.players[seat].isCPU);
export const isCpuTurn = (game) => cpuSeatsToAct(game).length > 0;

// CPU の席を1手進める（seat を省くと、待っている CPU の最初の席）。進めたら true
export function runCpuStep(game, seat = cpuSeatsToAct(game)[0]) {
    if (seat === undefined || game.isOver()) return false;
    const command = suggest(game, seat);
    if (command && game.applyCommand(seat, command)) return true;
    // 思わぬ形で通らなければ、いちばん単純な手で必ず進める
    for (const fallback of fallbackMoves(game, seat)) {
        if (game.applyCommand(seat, fallback)) return true;
    }
    return false;
}

function fallbackMoves(game, seat) {
    const s = game.s;
    const sp = s.spirits[seat];
    const list = [{ type: 'done' }, { type: 'play', cards: [] }, { type: 'growth', option: 0 }, { type: 'deck', deck: 'minor' }, { type: 'deck', deck: 'major' }];
    if (sp.prompt?.kind === 'pick') list.push({ type: 'pick', card: sp.prompt.cards[0] });
    if (sp.prompt?.kind === 'forget') list.push({ type: 'forget', card: [...sp.hand, ...sp.discard].find(c => c !== sp.prompt.gained) });
    if (sp.prompt?.kind === 'presence') {
        const land = landsInRange(s, seat, sp.prompt.range)[0];
        presenceSources(s, seat).forEach(track => list.push({ type: 'presence', track, land }));
    }
    return list;
}

export { ELEMENTS, elementsOf, meets };
