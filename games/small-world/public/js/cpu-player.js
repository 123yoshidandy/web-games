/**
 * CPU。見える情報（盤面・種族・コイン・並び）だけで決める。山の並びとサイコロの先は見ない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。揺れには、状態から作った別の乱数を使う
 *
 * - 組を選ぶ：部隊の数＋種族と特殊能力の強さの目安＋上に乗ったコイン−払うコイン が一番大きい組
 * - 征服：領域の値打ち（毎番のコイン・種族や特殊能力のボーナス・相手を削る分・守りやすさ）から、要る部隊の数を引いた点が一番高い領域
 *         部隊が足りなくなったら、届く見込みが一番高い領域にサイコロで賭ける（外れても失うものはない）
 * - 衰退：この番に取れそうな領域が少なく、持っている領域が多いとき。最後のラウンドでは衰退しない
 * 強さ：やさしい（揺れが大きく、ときどき早めに止まる）・ふつう
 */

import { createRandom } from './random.js';
import { RACES, POWERS, isWater } from './data.js';
import {
    mapOf, regionsOf, powerOf, readyHand, conquestTargets, dragonTargets, sorceryTargets, canDecline, canRoll,
    canFinishRedeploy, peaceOptions, canStoutDecline, threatOf, seatOf, canAttack, conquestCost
} from './rules.js';

export const CPU_LEVELS = ['easy', 'normal'];

export const PROFILES = {
    easy: { level: 'easy', jitter: 1.2, stopEarly: 0.12, costWeight: 0.35 },
    normal: { level: 'normal', jitter: 0.05, stopEarly: 0, costWeight: 0.45 }
};

const RACE_BONUS = {
    amazons: 3, dwarves: 0.5, elves: 1, ghouls: 1, giants: 1, halflings: 1.5, humans: 1, orcs: 1,
    ratmen: 0, skeletons: 1.5, sorcerers: 2, tritons: 1, trolls: 1.5, wizards: 1
};
const POWER_BONUS = {
    alchemist: 0, berserk: 1.5, bivouacking: 1.5, commando: 2, diplomat: 0.5, dragon: 2, flying: 2, forest: 1,
    fortified: 1, heroic: 1.5, hill: 1, merchant: 1.5, mounted: 1.5, pillaging: 1.5, seafaring: 1, spirit: 1.5,
    stout: 1.5, swamp: 1, underworld: 1, wealthy: 4.5
};

const profileOf = (game, seat) => PROFILES[game.players[seat]?.cpuLevel] ?? PROFILES.normal;

export const isCpuTurn = (game) => game.phase === 'play' && game.players[game.current].isCPU;
export const cpuActors = (game) => (isCpuTurn(game) ? [game.current] : []);

// 状態から作る乱数（同じ状態なら同じ判断になる）
const rngFor = (game, seat) => createRandom((Math.imul(game.commands.length + 1, 2654435761) ^ Math.imul(seat + 7, 40503) ^ (game.eventSeq ?? 0)) >>> 0);

// 一番コインの多いほかの人
function leaderOf(game, seat) {
    const others = game.players.filter(p => p.id !== seat);
    return others.reduce((a, b) => (b.coins > a.coins ? b : a), others[0]).id;
}

// 領域の値打ち（この種族で持ったとき）
function regionValue(game, race, id) {
    const map = mapOf(game);
    const info = map.regions[id];
    const r = game.regions[id];
    const band = game.bands[race];
    const seat = band.seat;
    const power = powerOf(game, race);
    let v = 1;
    if (!band.declined) {
        if (race === 'humans' && info.terrain === 'farm') v += 1;
        if (race === 'wizards' && info.special === 'magic') v += 1;
        if (race === 'dwarves' && info.special === 'mine') v += 1;
        if ((power === 'forest' && info.terrain === 'forest') || (power === 'hill' && info.terrain === 'hill') || (power === 'swamp' && info.terrain === 'swamp')) v += 1;
        if (power === 'merchant') v += 0.8;
        if (r.count > 0 && (race === 'orcs' || power === 'pillaging')) v += 1;
        if (r.count > 0 && race === 'skeletons') v += 0.5;
    }
    const owner = seatOf(game, id);
    if (owner >= 0 && owner !== seat) {
        const other = game.bands[r.race];
        v += other.declined ? 0.3 : 0.4 + 0.15 * r.count;
        if (owner === leaderOf(game, seat)) v += 0.3;
    } else if (owner === seat) {
        v -= 1.3;      // 自分の衰退した種族の領域を取ると、1金を失う
    }
    if (info.terrain === 'mountain') v += 0.3;
    if (isWater(info.terrain)) v += 0.2;
    v += 0.15 * info.adj.filter(a => game.regions[a].race === race).length;
    return v;
}

function bestOf(list, score) {
    let best = null;
    let bestScore = -Infinity;
    for (const item of list) {
        const s = score(item);
        if (s > bestScore) {
            best = item;
            bestScore = s;
        }
    }
    return best;
}

// この番に取れそうな領域の数（隣り合いの変化は見ない、ざっくりの見積もり）
function estimateConquests(game, race, hand) {
    const costs = game.regions.map((_, id) => id)
        .filter(id => game.regions[id].race !== race)
        .filter(id => canAttack(game, race, id))
        .map(id => conquestCost(game, race, id))
        .sort((a, b) => a - b);
    let left = hand;
    let count = 0;
    for (const cost of costs) {
        if (cost > left) {
            if (cost - left <= 1) count += 0.5;
            break;
        }
        left -= cost;
        count++;
    }
    return count;
}

function shouldDecline(game, seat, profile, random) {
    const race = game.players[seat].active;
    if (!race || game.round >= game.rounds) return false;
    const hand = readyHand(game, race);
    const mine = regionsOf(game, race).length;
    const est = estimateConquests(game, race, hand);
    if (mine === 0) return hand < 3;
    if (profile.level === 'easy') return est < 1 || (est <= 1 && random() < 0.3);
    return (est <= 1 && mine >= 3) || (est <= 2 && hand <= 3 && mine >= 5);
}

function pickCombo(game, seat, profile, random) {
    const player = game.players[seat];
    const roundsLeft = game.rounds - game.round + 1;
    const options = game.row.map((c, i) => ({ ...c, i })).filter(c => c.i <= player.coins);
    const value = (c) => {
        let v = RACES[c.race].tokens + POWERS[c.power].tokens + RACE_BONUS[c.race] + POWER_BONUS[c.power] + c.coins - c.i;
        if (c.power === 'alchemist') v += Math.min(roundsLeft, 4) * 0.8;
        if (roundsLeft <= 2 && c.power === 'spirit') v -= 1;
        return v + (random() - 0.5) * profile.jitter * 4;
    };
    return { type: 'pick', index: bestOf(options, value).i };
}

function conquerStep(game, seat, profile, random) {
    if (canDecline(game) && shouldDecline(game, seat, profile, random)) return { type: 'decline' };
    const race = game.acting;
    const sorcery = sorceryTargets(game);
    if (sorcery.length) return { type: 'sorcery', region: bestOf(sorcery, id => regionValue(game, race, id)) };
    if (canRoll(game)) return { type: 'roll' };
    const hand = readyHand(game, race);
    const targets = conquestTargets(game);
    const normal = targets.filter(t => !t.final);
    const dragon = dragonTargets(game);
    // 竜は、守りの固い領域に使う
    if (dragon.length) {
        const best = bestOf(dragon, id => regionValue(game, race, id) + conquestCost(game, race, id) * 0.6);
        if (conquestCost(game, race, best) >= 3 || normal.length === 0) return { type: 'dragon', region: best };
    }
    if (game.step.conquered.length > 0 && random() < profile.stopEarly) return { type: 'redeploy' };
    if (normal.length) {
        const best = bestOf(normal, t => regionValue(game, race, t.id) - profile.costWeight * t.need + (random() - 0.5) * profile.jitter);
        return { type: 'conquer', region: best.id };
    }
    const finals = targets.filter(t => t.final);
    if (finals.length && hand >= 1) {
        if (profile.level === 'easy' && random() < 0.4) return { type: 'redeploy' };
        const best = bestOf(finals, t => regionValue(game, race, t.id) * 0.3 - (t.cost - hand));
        return { type: 'conquer', region: best.id };
    }
    return { type: 'redeploy' };
}

function redeployStep(game, seat, profile) {
    if (!canFinishRedeploy(game)) {
        // 自動の配置のあとで手に残ることはないが、念のため一番脅かされている領域に置く
        const race = game.acting;
        const mine = regionsOf(game, race);
        return { type: 'place', region: bestOf(mine, id => threatOf(game, race, id)) };
    }
    if (game.step.ghoul) return { type: 'done' };
    const command = { type: 'done' };
    const peace = peaceOptions(game);
    if (peace.length) {
        // 自分の領域の隣に、一番多くの部隊を置いている人と和平を結ぶ
        const map = mapOf(game);
        const mine = regionsOf(game, game.acting);
        const pressure = (s) => mine.reduce((sum, id) => sum + map.regions[id].adj
            .filter(a => seatOf(game, a) === s && !game.bands[game.regions[a].race].declined)
            .reduce((t, a) => t + game.regions[a].count, 0), 0);
        command.peace = bestOf(peace, pressure);
    }
    if (canStoutDecline(game) && game.round < game.rounds) {
        const race = game.acting;
        const mine = regionsOf(game, race);
        const spare = mine.reduce((s, id) => s + game.regions[id].count - 1, 0);
        if (mine.length >= 3 && spare <= (profile.level === 'easy' ? 1 : 2)) command.decline = true;
    }
    return command;
}

// CPU の次の操作
export function chooseCommand(game, seat = game.current, profile = profileOf(game, seat)) {
    const random = rngFor(game, seat);
    switch (game.stage) {
        case 'pick': return pickCombo(game, seat, profile, random);
        case 'conquer': return conquerStep(game, seat, profile, random);
        case 'redeploy': return redeployStep(game, seat, profile);
        default: return null;
    }
}

// CPU に1手打たせる。思わぬ理由で断られたら、いちばん単純な手で進める
// 人の席のおすすめの手（ヒント）。CPU（ふつう）と同じ判断（見える情報だけ）。画面に出すだけで、記録には入れない
export function suggest(game, seat) {
    if (game.phase !== 'play' || game.current !== seat) return null;
    return chooseCommand(game, seat, PROFILES.normal);
}

export function runCpuStep(game, seat = game.current, profile = profileOf(game, seat)) {
    if (game.phase !== 'play' || game.current !== seat) return false;
    const command = chooseCommand(game, seat, profile);
    if (command && game.applyCommand(seat, command)) return true;
    const fallbacks = [{ type: 'redeploy' }, { type: 'done' }, { type: 'pick', index: 0 }, { type: 'decline' }];
    if (game.stage === 'redeploy' && game.bands[game.acting]?.hand > 0) {
        const mine = regionsOf(game, game.acting);
        if (mine.length) fallbacks.unshift({ type: 'place', region: mine[0] });
    }
    return fallbacks.some(c => game.applyCommand(seat, c));
}
