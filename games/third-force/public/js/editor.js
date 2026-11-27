/**
 * 戦術のエディタ（スマホ向け。文字の入力なしで、区切りのボタンとステッパーだけで組む）
 * - 出撃ルール：行を押すと下からシートが出て、条件・行動・待ち時間を選ぶ。並べ替えは ↑↓ のボタン
 * - 兵器の動き：兵種ごとのカードで、進む先・間合い・退却を選ぶ
 * - 編成：兵種と高さの組を最大 8 つ、編成は最大 4 つ
 * 状態は draft（戦術のオブジェクト）だけ。変えるたびに onChange で知らせる（続きからの保存）
 */

import { ARMS, ARM_TYPES, HEIGHT } from './arms.js';
import {
    CLASSES, NEAR_CLASSES, THREAT_DISTS, MONEY_STEP, MONEY_MAX, COUNT_MAX, LIFE_STEP, LIFE_MIN, LIFE_MAX, TIME_STEP, TIME_MAX,
    CHANCE_STEP, WAITS, UNITS, POSITIONS, ADVANCES, KEEP_FROM, KEEP_DISTS, LOW_LIFES, MAX_RULES, MAX_CONDS, MAX_FORMATIONS,
    MAX_FORMATION_SIZE, COND_KINDS, lineHasThreat, normalizeTactic
} from './rules.js';
import {
    condText, actText, armName, unitName, COND_NAMES, COND_HELP, ACT_NAMES, POSITION_NAMES, ADVANCE_NAMES, OP_NAMES,
    WHO_NAMES, LIFE_WHO_NAMES, FORMATION_NAMES, CLASS_NAMES
} from './rules-text.js';
import { armSvg } from './art.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const COND_DEFAULTS = {
    always: () => ({ k: 'always' }),
    money: () => ({ k: 'money', op: 'lt', n: 2000 }),
    threat: () => ({ k: 'threat', cls: 'air', dist: 50, unless: [] }),
    near: () => ({ k: 'near', cls: 'antiAir', has: true }),
    count: () => ({ k: 'count', who: 'enemy', cls: 'all', op: 'ge', n: 3 }),
    life: () => ({ k: 'life', who: 'diff', op: 'le', n: 0 }),
    time: () => ({ k: 'time', op: 'ge', n: 30 }),
    chance: () => ({ k: 'chance', n: 20 })
};
const ACT_DEFAULTS = {
    spawn: () => ({ k: 'spawn', unit: 'infantry', at: 'random' }),
    formation: () => ({ k: 'formation', i: 0 }),
    save: () => ({ k: 'save' })
};

const segmented = (arg, options, current, label = (v) => v) => `<div class="segmented" role="radiogroup">${options.map((v) =>
    `<button type="button" role="radio" data-arg="${arg}" data-value="${esc(JSON.stringify(v))}" aria-checked="${v === current}">${esc(label(v))}</button>`).join('')}</div>`;
const choices = (arg, options, current, label = (v) => v, sub = () => '') => `<div class="choices">${options.map((v) =>
    `<button type="button" data-arg="${arg}" data-value="${esc(JSON.stringify(v))}" aria-pressed="${v === current}">${esc(label(v))}${sub(v) ? `<small>${esc(sub(v))}</small>` : ''}</button>`).join('')}</div>`;
const stepper = (arg, value, step, text = String(value), big = 0) => `<div class="stepper">
    ${big ? `<button type="button" class="wide" data-arg="${arg}" data-delta="${-big}">−${big}</button>` : ''}
    <button type="button" data-arg="${arg}" data-delta="${-step}" aria-label="減らす">−</button>
    <output>${esc(text)}</output>
    <button type="button" data-arg="${arg}" data-delta="${step}" aria-label="増やす">＋</button>
    ${big ? `<button type="button" class="wide" data-arg="${arg}" data-delta="${big}">＋${big}</button>` : ''}</div>`;
const arg = (label, body) => `<div class="arg"><span>${esc(label)}</span>${body}</div>`;

export function createEditor({ onChange = () => {}, onSound = () => {} } = {}) {
    let draft = null;
    let tab = 'rules';
    let lineIndex = -1;     // シートで開いている行
    let slot = null;        // シートで直している部分（'c0'・'c1'・'act'）
    let recommended = -1;   // ヒントで足した行（印を付ける）

    const changed = () => onChange(draft);

    // ---------- 出撃ルール ----------

    function ruleRow(line, i) {
        const conds = line.when.length > 0 ? line.when : [{ k: 'always' }];
        const warn = line.act.k === 'spawn' && line.act.at === 'target' && !lineHasThreat(line);
        return `<li><button type="button" class="rule-row${line.on ? '' : ' off'}${i === recommended ? ' recommended' : ''}" data-line="${i}">
            <span class="no">${i + 1}</span>
            <span class="chips">${conds.map((c) => `<span class="chip cond">${esc(condText(c))}</span>`).join('')}<span class="arrow">→</span><span class="chip act${warn ? ' warn' : ''}">${esc(actText(line.act))}</span>${line.wait ? `<span class="chip wait">${line.wait}秒休む</span>` : ''}</span>
        </button></li>`;
    }

    function renderRules() {
        const rows = draft.rules.map(ruleRow).join('');
        return `<ul class="rule-list">${rows || '<li class="empty">行がありません</li>'}</ul>
            <button type="button" id="add-line" class="secondary add-row"${draft.rules.length >= MAX_RULES ? ' disabled' : ''}>行を足す（${draft.rules.length}/${MAX_RULES}）</button>
            <p class="note">上から見て、条件の合った最初の 1 行だけが動きます。お金が足りない行で止まって貯めます。最後の行が「いつでも」なら、足す行はその上に入ります。</p>`;
    }

    // ---------- 兵器の動き ----------

    function renderArms() {
        return ARM_TYPES.map((type) => {
            const a = ARMS[type];
            const card = draft.arms[type];
            const keepOptions = KEEP_FROM.map((k) => `<option value="${k}"${k === card.keepFrom ? ' selected' : ''}>${esc(armName(k))}</option>`).join('');
            const seg = (key, options, current, label) => `<div class="segmented" role="radiogroup">${options.map((v) =>
                `<button type="button" role="radio" data-arm="${type}" data-key="${key}" data-value="${esc(JSON.stringify(v))}" aria-checked="${v === current}">${esc(label(v))}</button>`).join('')}</div>`;
            return `<div class="arm-card">
                <div class="arm-head">${armSvg(type, 0, { size: 32 })}<b>${a.name}</b><span class="cost">${a.cost}</span></div>
                <div class="arm-stats">体力 ${a.life}・攻撃 ${a.attack}・射程 ${a.range}・弾 ${a.bullets}・速さ ${a.speed}${a.onAir ? '・空' : ''}　${esc(a.note)}</div>
                <div class="setting"><span>進む先</span>${seg('advance', ADVANCES, card.advance, (v) => ADVANCE_NAMES[v])}</div>
                <div class="setting"><span>間合い</span><select class="select" data-arm="${type}" data-key="keepFrom" aria-label="間合いを取る相手">${keepOptions}</select>
                    ${card.keepFrom === 'none' ? '' : seg('keepDist', KEEP_DISTS, card.keepDist, (v) => v)}</div>
                <div class="setting"><span>退却</span><div class="toggles">
                    <button type="button" class="toggle" data-arm="${type}" data-flag="empty" aria-pressed="${card.retreat.empty}">弾切れ</button>
                    ${type === 'bomber' ? '' : `<button type="button" class="toggle" data-arm="${type}" data-flag="noTarget" aria-pressed="${card.retreat.noTarget}">撃てる敵なし</button>`}
                </div></div>
                <div class="setting"><span>体力</span>${seg('lowLife', LOW_LIFES, card.retreat.lowLife, (v) => (v ? `${v}%以下で退却` : 'なし'))}</div>
            </div>`;
        }).join('');
    }

    // ---------- 編成 ----------

    function renderFormations() {
        const used = (i) => draft.rules.some((line) => line.act.k === 'formation' && line.act.i === i);
        const blocks = draft.formations.map((f, i) => {
            const members = f.map((m, j) => `<div class="member">
                <select class="select" data-form="${i}" data-member="${j}" data-key="type" aria-label="兵種">${ARM_TYPES.map((t) => `<option value="${t}"${t === m.type ? ' selected' : ''}>${ARMS[t].name}</option>`).join('')}</select>
                <div class="stepper"><button type="button" data-form="${i}" data-member="${j}" data-dy="-10" class="wide">−10</button><button type="button" data-form="${i}" data-member="${j}" data-dy="-1" aria-label="上へ">−</button><output>${m.y}</output><button type="button" data-form="${i}" data-member="${j}" data-dy="1" aria-label="下へ">＋</button><button type="button" data-form="${i}" data-member="${j}" data-dy="10" class="wide">＋10</button></div>
                <button type="button" class="icon-button" data-form="${i}" data-member="${j}" data-remove="member" aria-label="外す" title="外す"${f.length <= 1 ? ' disabled' : ''}><svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
            </div>`).join('');
            const cost = f.reduce((sum, m) => sum + ARMS[m.type].cost, 0);
            return `<div class="formation">
                <div class="formation-head"><span>${FORMATION_NAMES[i]}（${cost}）</span>
                    <button type="button" class="icon-button" data-form="${i}" data-remove="formation" aria-label="編成を消す" title="${used(i) ? '使っている行があるので消せません' : '編成を消す'}"${used(i) || i !== draft.formations.length - 1 ? ' disabled' : ''}><svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
                </div>
                ${members}
                <button type="button" class="tertiary small" data-form="${i}" data-add="member"${f.length >= MAX_FORMATION_SIZE ? ' disabled' : ''}>兵器を足す（${f.length}/${MAX_FORMATION_SIZE}）</button>
            </div>`;
        }).join('');
        return `${blocks || '<p class="empty">編成はまだありません</p>'}
            <button type="button" id="add-formation" class="secondary add-row"${draft.formations.length >= MAX_FORMATIONS ? ' disabled' : ''}>編成を足す</button>
            <p class="note">高さは 0（上端）〜 ${HEIGHT}（下端）。出撃ルールの行動「編成」で、全員を一度に出します（費用は全員分）。消せるのは最後の編成だけです。</p>`;
    }

    function render() {
        if (!draft) return;
        document.querySelectorAll('#screen-editor .tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
        $('tactic-name').textContent = draft.name;
        const body = $('editor-body');
        body.innerHTML = tab === 'rules' ? renderRules() : tab === 'arms' ? renderArms() : renderFormations();
    }

    // ---------- 1行のシート ----------

    function partOf(line, name) {
        if (name === 'act') return line.act;
        return line.when[Number(name.slice(1))] ?? null;
    }

    function condArgs(c) {
        switch (c.k) {
            case 'money': return arg('比べ方', segmented('op', ['ge', 'lt'], c.op, (v) => OP_NAMES[v])) + arg('お金', stepper('n', c.n, MONEY_STEP, String(c.n), 5000));
            case 'threat': return arg('敵の種類', choices('cls', CLASSES, c.cls, armName))
                + arg('自陣からの距離', segmented('dist', THREAT_DISTS, c.dist, (v) => `${v}以内`))
                + arg('この兵種で迎撃していない（どれもなければ、いつでも）', `<div class="toggles">${ARM_TYPES.map((t) => `<button type="button" class="toggle" data-unless="${t}" aria-pressed="${c.unless.includes(t)}">${ARMS[t].name}</button>`).join('')}</div>`);
            case 'near': return arg('敵の種類', choices('cls', NEAR_CLASSES, c.cls, armName)) + arg('', segmented('has', [true, false], c.has, (v) => (v ? 'いる' : 'いない')));
            case 'count': return arg('どちら', segmented('who', ['own', 'enemy'], c.who, (v) => WHO_NAMES[v])) + arg('種類', choices('cls', CLASSES, c.cls, armName))
                + arg('比べ方', segmented('op', ['ge', 'le'], c.op, (v) => OP_NAMES[v])) + arg('数', stepper('n', c.n, 1));
            case 'life': return arg('どちら', segmented('who', ['own', 'enemy', 'diff'], c.who, (v) => LIFE_WHO_NAMES[v]))
                + arg('比べ方', segmented('op', ['ge', 'le'], c.op, (v) => OP_NAMES[v])) + arg('体力', stepper('n', c.n, LIFE_STEP));
            case 'time': return arg('', segmented('op', ['ge', 'lt'], c.op, (v) => (v === 'ge' ? 'から' : 'まで'))) + arg('秒', stepper('n', c.n, TIME_STEP, `${c.n}秒`));
            case 'chance': return arg('確率', stepper('n', c.n, CHANCE_STEP, `${c.n}%`));
            default: return '';
        }
    }

    function actArgs(a, line) {
        if (a.k === 'spawn') {
            const warn = a.at === 'target' && !lineHasThreat(line) ? '<p class="note warn">「対象の高さ」は、同じ行に「脅威」の条件があるときに使えます（ないときは中に出します）</p>' : '';
            return arg('兵種', choices('unit', UNITS, a.unit, unitName, (u) => (u === 'random' ? '' : String(ARMS[u].cost))))
                + arg('位置', choices('at', POSITIONS, a.at, (v) => POSITION_NAMES[v])) + warn;
        }
        if (a.k === 'formation') return arg('編成', choices('i', draft.formations.map((_, i) => i), a.i, (i) => FORMATION_NAMES[i]));
        return '';
    }

    function renderSheet() {
        const line = draft.rules[lineIndex];
        if (!line) return;
        const body = $('line-body');
        if (slot) {
            const part = partOf(line, slot);
            const isAct = slot === 'act';
            const kinds = isAct ? Object.keys(ACT_DEFAULTS).filter((k) => k !== 'formation' || draft.formations.length > 0) : COND_KINDS;
            body.innerHTML = `<div class="sheet-head"><h2>${isAct ? '行動' : `条件 ${Number(slot.slice(1)) + 1}`}</h2>
                    <button type="button" class="icon-button" data-sheet="back" aria-label="戻る" title="戻る"><svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></button></div>
                ${choices('kind', kinds, part?.k, (k) => (isAct ? ACT_NAMES[k] : COND_NAMES[k]), (k) => (isAct ? '' : COND_HELP[k]))}
                <div class="args">${part ? (isAct ? actArgs(part, line) : condArgs(part)) : ''}</div>
                <button type="button" class="primary" data-sheet="back" style="width:100%">決める</button>`;
            return;
        }
        const conds = line.when.map((c, j) => `<div class="part"><span>条件 ${j + 1}</span><button type="button" class="part-button cond" data-slot="c${j}">${esc(condText(c))}</button>
            <button type="button" class="icon-button" data-remove-cond="${j}" aria-label="条件を外す" title="条件を外す"><svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`).join('');
        const addCond = line.when.length < MAX_CONDS ? `<div class="part"><span>条件 ${line.when.length + 1}</span><button type="button" class="part-button" data-slot="c${line.when.length}">＋ 条件を足す（AND）</button></div>` : '';
        body.innerHTML = `<div class="sheet-head"><h2>ルール ${lineIndex + 1}</h2>
                <button type="button" class="icon-button" data-sheet="close" aria-label="閉じる" title="閉じる"><svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
            ${conds}${addCond}
            <div class="part"><span>行動</span><button type="button" class="part-button act" data-slot="act">${esc(actText(line.act))}</button></div>
            <div class="part"><span>休み</span>${segmented('wait', WAITS, line.wait, (v) => (v ? `${v}秒` : 'なし'))}</div>
            <div class="line-ops">
                <button type="button" data-op="up"${lineIndex === 0 ? ' disabled' : ''}>↑ 上へ</button>
                <button type="button" data-op="down"${lineIndex === draft.rules.length - 1 ? ' disabled' : ''}>↓ 下へ</button>
                <button type="button" data-op="toggle">${line.on ? 'OFF' : 'ON'}</button>
                <button type="button" data-op="copy"${draft.rules.length >= MAX_RULES ? ' disabled' : ''}>複製</button>
                <button type="button" data-op="delete">削除</button>
            </div>`;
    }

    function openLine(i) {
        lineIndex = i;
        slot = null;
        renderSheet();
        const sheet = $('line-sheet');
        if (!sheet.open) sheet.showModal();
    }

    function applyArg(part, key, value, delta) {
        if (delta !== undefined) {
            const n = part.n + delta;
            const ranges = { money: [0, MONEY_MAX], count: [0, COUNT_MAX], life: [LIFE_MIN, LIFE_MAX], time: [0, TIME_MAX], chance: [CHANCE_STEP, 100 - CHANCE_STEP] };
            const [min, max] = ranges[part.k];
            part.n = clamp(n, min, max);
            return;
        }
        part[key] = value;
    }

    function onSheetClick(event) {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        const line = draft.rules[lineIndex];
        const d = button.dataset;
        if (d.sheet === 'close') { $('line-sheet').close(); onSound('cancel'); return; }
        if (d.sheet === 'back') { slot = null; renderSheet(); render(); onSound('select'); return; }
        if (d.slot) { slot = d.slot; if (slot !== 'act' && !partOf(line, slot)) line.when.push(COND_DEFAULTS.chance()); renderSheet(); onSound('select'); changed(); return; }
        if (d.removeCond !== undefined) { line.when.splice(Number(d.removeCond), 1); afterEdit('cancel'); return; }
        if (d.op) {
            const i = lineIndex;
            if (d.op === 'up' && i > 0) { [draft.rules[i - 1], draft.rules[i]] = [draft.rules[i], draft.rules[i - 1]]; lineIndex--; }
            if (d.op === 'down' && i < draft.rules.length - 1) { [draft.rules[i + 1], draft.rules[i]] = [draft.rules[i], draft.rules[i + 1]]; lineIndex++; }
            if (d.op === 'toggle') line.on = !line.on;
            if (d.op === 'copy') { draft.rules.splice(i + 1, 0, structuredClone(line)); lineIndex++; }
            if (d.op === 'delete') { draft.rules.splice(i, 1); recommended = -1; $('line-sheet').close(); afterEdit('cancel'); return; }
            afterEdit('place');
            return;
        }
        if (d.unless) {
            const part = partOf(line, slot);
            part.unless = part.unless.includes(d.unless) ? part.unless.filter((t) => t !== d.unless) : ARM_TYPES.filter((t) => t === d.unless || part.unless.includes(t));
            afterEdit('select');
            return;
        }
        if (d.arg) {
            const value = d.value !== undefined ? JSON.parse(d.value) : undefined;
            if (d.arg === 'wait') { line.wait = value; afterEdit('select'); return; }
            if (d.arg === 'kind') {
                const fresh = slot === 'act' ? ACT_DEFAULTS[value]() : COND_DEFAULTS[value]();
                const part = partOf(line, slot);
                if (part?.k !== value) {
                    if (slot === 'act') line.act = fresh;
                    else line.when[Number(slot.slice(1))] = fresh;
                }
                afterEdit('select');
                return;
            }
            applyArg(partOf(line, slot), d.arg, value, d.delta !== undefined ? Number(d.delta) : undefined);
            afterEdit('select');
        }
    }

    function afterEdit(sound) {
        renderSheet();
        render();
        changed();
        onSound(sound);
    }

    // ---------- 本体のクリック ----------

    function onBodyClick(event) {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        const d = button.dataset;
        if (d.line !== undefined) { openLine(Number(d.line)); onSound('select'); return; }
        if (button.id === 'add-line') {
            // 最後の行が「いつでも」の受け皿なら、その上に足す（下に足すと、まず動かない）
            const last = draft.rules.at(-1);
            const catchAll = last?.on && last.when.every((c) => c.k === 'always');
            const at = catchAll ? draft.rules.length - 1 : draft.rules.length;
            draft.rules.splice(at, 0, { on: true, when: [{ k: 'always' }], act: ACT_DEFAULTS.spawn(), wait: 0 });
            changed();
            render();
            openLine(at);
            onSound('place');
            return;
        }
        if (button.id === 'add-formation') {
            draft.formations.push([{ type: 'infantry', y: 40 }, { type: 'infantry', y: 60 }]);
            return finish('place');
        }
        if (d.arm) {
            const card = draft.arms[d.arm];
            if (d.flag) card.retreat[d.flag] = !card.retreat[d.flag];
            else if (d.key === 'lowLife') card.retreat.lowLife = JSON.parse(d.value);
            else card[d.key] = JSON.parse(d.value);
            return finish('select');
        }
        if (d.form !== undefined) {
            const f = draft.formations[Number(d.form)];
            if (d.dy) f[Number(d.member)].y = clamp(f[Number(d.member)].y + Number(d.dy), 0, HEIGHT);
            else if (d.add === 'member') f.push({ type: 'infantry', y: clamp((f.at(-1)?.y ?? 40) + 10, 0, HEIGHT) });
            else if (d.remove === 'member') f.splice(Number(d.member), 1);
            else if (d.remove === 'formation') draft.formations.splice(Number(d.form), 1);
            return finish(d.remove ? 'cancel' : 'select');
        }
    }

    function onBodyChange(event) {
        const select = event.target.closest('select');
        if (!select) return;
        const d = select.dataset;
        if (d.arm) draft.arms[d.arm][d.key] = select.value;
        else if (d.form !== undefined) draft.formations[Number(d.form)][Number(d.member)].type = select.value;
        finish('select');
    }

    function finish(sound) {
        render();
        changed();
        onSound(sound);
    }

    $('editor-body').addEventListener('click', onBodyClick);
    $('editor-body').addEventListener('change', onBodyChange);
    $('line-body').addEventListener('click', onSheetClick);
    $('line-sheet').addEventListener('close', () => { slot = null; render(); });
    document.querySelector('#screen-editor .tabs').addEventListener('click', (event) => {
        const b = event.target.closest('[data-tab]');
        if (!b) return;
        tab = b.dataset.tab;
        render();
        $('editor-body').scrollTop = 0;
        onSound('select');
    });

    return {
        open(tactic, { tab: firstTab = 'rules' } = {}) {
            draft = structuredClone(tactic);
            tab = firstTab;
            recommended = -1;
            render();
        },
        get draft() { return draft; },
        // 保存する形（正規化して返す。だめなら例外）
        normalized: () => normalizeTactic(draft),
        rename(name) { draft.name = name; changed(); render(); },
        // ヒントの行を足す（印を付ける）
        insertLine(line, index) {
            draft.rules.splice(index, 0, structuredClone(line));
            recommended = index;
            tab = 'rules';
            changed();
            render();
        },
        render
    };
}

export { CLASS_NAMES };
