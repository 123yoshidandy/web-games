/**
 * 戦術と対戦の共有コード（URL の #r= と #b=、オンラインの提出）
 * 戦術を短い数の並び（語彙の番号）にしてバイト列にし、base64url で文字にする。12 行で 300 字ほど
 * 読み込みは型と範囲を厳しく確かめ、少しでも外れていれば例外を投げる（最後に normalizeTactic も通す）
 */

import { ARM_TYPES, HEIGHT } from './arms.js';
import {
    COND_KINDS, CLASSES, NEAR_CLASSES, THREAT_DISTS, MONEY_STEP, LIFE_STEP, LIFE_MIN, TIME_STEP, CHANCE_STEP, WAITS,
    ACT_KINDS, UNITS, POSITIONS, ADVANCES, KEEP_FROM, KEEP_DISTS, LOW_LIFES, MAX_RULES, MAX_CONDS, MAX_FORMATIONS,
    MAX_FORMATION_SIZE, MAX_NAME_LENGTH, normalizeTactic
} from './rules.js';
import { ENGINE_VERSION } from './battle.js';

const TACTIC_FORMAT = 1;
const RECORD_FORMAT = 1;
const MAX_CODE_LENGTH = 1200;

const OPS2 = { money: ['ge', 'lt'], time: ['ge', 'lt'], count: ['ge', 'le'], life: ['ge', 'le'] };
const WHO = { count: ['own', 'enemy'], life: ['own', 'enemy', 'diff'] };

// ---------- base64url ----------

function toBase64Url(bytes) {
    let text = '';
    for (const b of bytes) text += String.fromCharCode(b);
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code) {
    if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('共有コードの形が正しくありません');
    const text = atob(code.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.length % 4)) % 4));
    return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

// ---------- 書く・読む道具 ----------

const index = (list, value) => {
    const i = list.indexOf(value);
    if (i < 0) throw new Error('書けない値です');
    return i;
};

function reader(bytes) {
    let pos = 0;
    const byte = () => {
        if (pos >= bytes.length) throw new Error('共有コードが途中で切れています');
        return bytes[pos++];
    };
    const pick = (list) => {
        const i = byte();
        if (i >= list.length) throw new Error('共有コードの値が範囲の外です');
        return list[i];
    };
    const upto = (max) => {
        const n = byte();
        if (n > max) throw new Error('共有コードの値が範囲の外です');
        return n;
    };
    return { byte, pick, upto, bytes: (n) => { const out = bytes.slice(pos, pos + n); if (out.length < n) throw new Error('共有コードが途中で切れています'); pos += n; return out; }, done: () => pos === bytes.length, get pos() { return pos; } };
}

// ---------- 戦術 ----------

function tacticBytes(input) {
    const t = normalizeTactic(input);
    const out = [TACTIC_FORMAT];
    const name = new TextEncoder().encode(t.name);
    out.push(name.length, ...name);
    out.push(t.rules.length);
    for (const line of t.rules) {
        out.push((line.on ? 1 : 0) | (index(WAITS, line.wait) << 1) | (line.when.length << 4));
        for (const c of line.when) {
            out.push(index(COND_KINDS, c.k));
            if (c.k === 'money') out.push(index(OPS2.money, c.op), c.n / MONEY_STEP);
            else if (c.k === 'threat') out.push(index(CLASSES, c.cls), index(THREAT_DISTS, c.dist), c.unless.reduce((m, type) => m | (1 << index(ARM_TYPES, type)), 0));
            else if (c.k === 'near') out.push(index(NEAR_CLASSES, c.cls), c.has ? 1 : 0);
            else if (c.k === 'count') out.push(index(WHO.count, c.who), index(CLASSES, c.cls), index(OPS2.count, c.op), c.n);
            else if (c.k === 'life') out.push(index(WHO.life, c.who), index(OPS2.life, c.op), (c.n - LIFE_MIN) / LIFE_STEP);
            else if (c.k === 'time') out.push(index(OPS2.time, c.op), c.n / TIME_STEP);
            else if (c.k === 'chance') out.push(c.n / CHANCE_STEP);
        }
        out.push(index(ACT_KINDS, line.act.k));
        if (line.act.k === 'spawn') out.push(index(UNITS, line.act.unit), index(POSITIONS, line.act.at));
        else if (line.act.k === 'formation') out.push(line.act.i);
    }
    for (const type of ARM_TYPES) {
        const a = t.arms[type];
        out.push(index(ADVANCES, a.advance), index(KEEP_FROM, a.keepFrom), index(KEEP_DISTS, a.keepDist),
            (a.retreat.empty ? 1 : 0) | (a.retreat.noTarget ? 2 : 0) | (index(LOW_LIFES, a.retreat.lowLife) << 2));
    }
    out.push(t.formations.length);
    for (const f of t.formations) {
        out.push(f.length);
        for (const e of f) out.push(index(ARM_TYPES, e.type), e.y);
    }
    return out;
}

function readTactic(r) {
    if (r.byte() !== TACTIC_FORMAT) throw new Error('この版では読めない共有コードです');
    const nameLength = r.upto(MAX_NAME_LENGTH * 4);
    const name = new TextDecoder('utf-8', { fatal: true }).decode(r.bytes(nameLength));
    const ruleCount = r.upto(MAX_RULES);
    const rules = [];
    for (let i = 0; i < ruleCount; i++) {
        const flags = r.byte();
        if (flags >> 6) throw new Error('共有コードの値が範囲の外です');
        const wait = WAITS[(flags >> 1) & 7];
        const condCount = flags >> 4;
        if (wait === undefined || condCount > MAX_CONDS) throw new Error('共有コードの値が範囲の外です');
        const when = [];
        for (let j = 0; j < condCount; j++) {
            const k = r.pick(COND_KINDS);
            if (k === 'always') when.push({ k });
            else if (k === 'money') when.push({ k, op: r.pick(OPS2.money), n: r.byte() * MONEY_STEP });
            else if (k === 'threat') {
                const cls = r.pick(CLASSES);
                const dist = r.pick(THREAT_DISTS);
                const mask = r.byte();
                when.push({ k, cls, dist, unless: ARM_TYPES.filter((_, b) => mask & (1 << b)) });
            } else if (k === 'near') {
                const cls = r.pick(NEAR_CLASSES);
                when.push({ k, cls, has: r.pick([false, true]) });
            } else if (k === 'count') {
                const who = r.pick(WHO.count);
                const cls = r.pick(CLASSES);
                const op = r.pick(OPS2.count);
                when.push({ k, who, cls, op, n: r.byte() });
            } else if (k === 'life') {
                const who = r.pick(WHO.life);
                const op = r.pick(OPS2.life);
                when.push({ k, who, op, n: r.byte() * LIFE_STEP + LIFE_MIN });
            } else if (k === 'time') {
                const op = r.pick(OPS2.time);
                when.push({ k, op, n: r.byte() * TIME_STEP });
            } else when.push({ k, n: r.byte() * CHANCE_STEP });
        }
        const k = r.pick(ACT_KINDS);
        let act = { k };
        if (k === 'spawn') {
            const unit = r.pick(UNITS);
            act = { k, unit, at: r.pick(POSITIONS) };
        } else if (k === 'formation') act = { k, i: r.upto(MAX_FORMATIONS - 1) };
        rules.push({ on: (flags & 1) === 1, when, act, wait });
    }
    const arms = {};
    for (const type of ARM_TYPES) {
        const advance = r.pick(ADVANCES);
        const keepFrom = r.pick(KEEP_FROM);
        const keepDist = r.pick(KEEP_DISTS);
        const bits = r.byte();
        const lowLife = LOW_LIFES[bits >> 2];
        if (lowLife === undefined) throw new Error('共有コードの値が範囲の外です');
        arms[type] = { advance, keepFrom, keepDist, retreat: { empty: (bits & 1) === 1, noTarget: (bits & 2) === 2, lowLife } };
    }
    const formationCount = r.upto(MAX_FORMATIONS);
    const formations = [];
    for (let i = 0; i < formationCount; i++) {
        const size = r.upto(MAX_FORMATION_SIZE);
        const f = [];
        for (let j = 0; j < size; j++) {
            const type = r.pick(ARM_TYPES);
            f.push({ type, y: r.upto(HEIGHT) });
        }
        formations.push(f);
    }
    return normalizeTactic({ name, rules, arms, formations });
}

export const encodeTactic = (tactic) => toBase64Url(tacticBytes(tactic));

export function decodeTactic(code) {
    const r = reader(fromBase64Url(code));
    const tactic = readTactic(r);
    if (!r.done()) throw new Error('共有コードの終わりに余分なものがあります');
    return tactic;
}

// ---------- 対戦（シードと両方の戦術） ----------

export function encodeRecord({ engine = ENGINE_VERSION, seed, tactics }) {
    const a = tacticBytes(tactics[0]);
    const b = tacticBytes(tactics[1]);
    const s = seed >>> 0;
    return toBase64Url([RECORD_FORMAT, engine, s >>> 24, (s >>> 16) & 255, (s >>> 8) & 255, s & 255, a.length >> 8, a.length & 255, ...a, ...b]);
}

export function decodeRecord(code) {
    const r = reader(fromBase64Url(code));
    if (r.byte() !== RECORD_FORMAT) throw new Error('この版では読めない共有コードです');
    const engine = r.byte();
    const seed = ((r.byte() << 24) | (r.byte() << 16) | (r.byte() << 8) | r.byte()) >>> 0;
    const lengthA = (r.byte() << 8) | r.byte();
    const start = r.pos;
    const a = readTactic(r);
    if (r.pos - start !== lengthA) throw new Error('共有コードの形が正しくありません');
    const b = readTactic(r);
    if (!r.done()) throw new Error('共有コードの終わりに余分なものがあります');
    return { engine, seed, tactics: [a, b] };
}
