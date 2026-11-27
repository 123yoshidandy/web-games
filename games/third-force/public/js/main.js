/**
 * 画面の進行：タイトル → 戦術の一覧・エディタ／対戦 → 結果
 * 対戦はシードと両方の戦術で決まる。描画は requestAnimationFrame で、経過時間に合わせて決まった数の tick を進める（60 tick/秒）
 * 描画の速さ（×1・×2・×4・結果へ）は、対戦の中身に影響しない
 */

import { createBattle, step, advanceTo, summaryOf, ENGINE_VERSION } from './battle.js';
import { battleFromRecord } from './match.js';
import { TICKS_PER_SECOND, MAX_TICKS } from './arms.js';
import { emptyTactic, normalizeTactic } from './rules.js';
import { lineText, actText } from './rules-text.js';
import { BUILTIN, CPU_LEVELS, builtinTactic } from './cpu-tactics.js';
import { encodeTactic, decodeTactic, encodeRecord, decodeRecord } from './codec.js';
import { createSeed } from './random.js';
import { createBoard } from './board.js';
import { createEditor } from './editor.js';
import { armSvg } from './art.js';
import { helpMarkup } from './help.js';
import { music } from './music.js';
import { KEYS, store, loadRulesets, saveRulesets, newId, MAX_SAVED } from './storage.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const levelLabel = (id) => CPU_LEVELS.find((l) => l.id === id)?.label ?? id;
const SAVE_EVERY_TICKS = 120;

let rulesets = loadRulesets();
let settings = { tactic: 'b:sample', level: 'sample', ...store.load(KEYS.settings) };
let editing = null;   // エディタで開いている { id（保存前は null） }
let run = null;       // 再生中の対戦
let onlineController = null;
let onlineMatchShown = null; // 再生を始めたオンラインの対戦（matchId）

const board = createBoard($('board'), { reducedMotion });
const editor = createEditor({
    onChange: (draft) => store.save(KEYS.save, { kind: 'edit', id: editing?.id ?? null, draft }),
    onSound: (name) => music.play(name)
});

// ---------- 小さな道具 ----------

let toastTimer = null;
function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function showScene(name) {
    for (const id of ['title', 'tactics', 'editor', 'game', 'submit']) $(`screen-${id}`).hidden = id !== name;
    if (name === 'title') renderTitle();
    if (name === 'tactics') renderTactics();
}

const tacticRef = (ref) => {
    if (ref?.startsWith('b:')) return BUILTIN[ref.slice(2)] ? builtinTactic(ref.slice(2)) : null;
    return rulesets.find((r) => r.id === ref)?.tactic ?? null;
};
const myTactic = () => tacticRef(settings.tactic) ?? builtinTactic('sample');
const saveSettings = () => store.save(KEYS.settings, settings);

function tacticOptions(selected) {
    const own = rulesets.map((r) => `<option value="${r.id}"${r.id === selected ? ' selected' : ''}>${esc(r.tactic.name)}</option>`).join('');
    const builtin = CPU_LEVELS.map((l) => `<option value="b:${l.id}"${`b:${l.id}` === selected ? ' selected' : ''}>${esc(BUILTIN[l.id].name)}（組み込み・${l.label}）</option>`).join('');
    return `${own ? `<optgroup label="自分の戦術">${own}</optgroup>` : ''}<optgroup label="組み込み">${builtin}</optgroup>`;
}

// ---------- タイトル ----------

function drawTitleArt() {
    const units = [['tank', 0, 28, 58], ['rocket', 0, 6, 34], ['fighter', 0, 54, 14], ['infantry', 0, 66, 66],
        ['tank', 1, 178, 50], ['missile', 1, 200, 24], ['bomber', 1, 158, 8], ['cannon', 1, 196, 66]];
    const svg = units.map(([type, side, x, y]) => `<g transform="translate(${x} ${y})">${armSvg(type, side, { size: 26, flip: side === 1 })}</g>`).join('');
    $('title-art').innerHTML = `
        <rect x="0" y="0" width="240" height="96" rx="10" fill="#33453a"/>
        <path d="M0 48h240" stroke="rgba(255,255,255,.08)"/><path d="M120 0v96" stroke="rgba(255,255,255,.18)" stroke-dasharray="4 4"/>
        <rect x="0" y="0" width="6" height="96" fill="#4f9be8" opacity=".6"/><rect x="234" y="0" width="6" height="96" fill="#e2604f" opacity=".6"/>
        <path d="M58 72 L170 62" stroke="#cfe6ff" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
        <path d="M202 36 L84 26" stroke="#ffd9cf" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
        ${svg}`;
}

function renderTitle() {
    if (!tacticRef(settings.tactic)) settings.tactic = 'b:sample';
    $('my-tactic').innerHTML = tacticOptions(settings.tactic);
    $('cpu-level').innerHTML = CPU_LEVELS.map((l) => `<button type="button" role="radio" data-level="${l.id}" aria-checked="${l.id === settings.level}">${l.label}</button>`).join('');
    $('resume').hidden = !store.load(KEYS.save);
    $('online-row').hidden = !online.available;
}

// ---------- 対戦の再生 ----------

function startBattle({ tactics, seed = createSeed(), mySide = 0, mode = 'cpu', names, level = null, startTick = 0 }) {
    stopBattle();
    const battle = createBattle({ seed, tactics });
    if (startTick > 0) advanceTo(battle, startTick);
    run = {
        battle, mySide, mode, names, level, speed: run?.speed ?? 1, paused: false, last: performance.now(), acc: 0,
        record: { engine: ENGINE_VERSION, seed, tactics }, logIndex: battle.events.length, lastSaved: battle.time, sounds: {}, finished: false
    };
    $('match-title').textContent = mode === 'watch' ? '観戦' : mode === 'replay' ? 'リプレイ' : mode === 'online' ? 'オンライン対戦' : `${levelLabel(level)}と対戦`;
    $('name-own').textContent = names[mySide];
    $('name-enemy').textContent = names[1 - mySide];
    $('log').innerHTML = '';
    renderSpeed();
    showScene('game');
    board.resize();
    updateHud();
    run.raf = requestAnimationFrame(frame);
    if (mode === 'cpu') saveProgress();
}

function stopBattle() {
    if (run?.raf) cancelAnimationFrame(run.raf);
    if (run) run.raf = null;
}

function frame(now) {
    if (!run || run.raf === null) return;
    const dt = Math.min(100, now - run.last);
    run.last = now;
    if (!run.paused && !run.battle.over) {
        run.acc += (dt * TICKS_PER_SECOND * run.speed) / 1000;
        const n = Math.min(Math.floor(run.acc), 40);
        run.acc -= Math.floor(run.acc);
        for (let i = 0; i < n && !run.battle.over; i++) step(run.battle);
        processEvents(true);
        updateHud();
        if (run.mode === 'cpu' && run.battle.time - run.lastSaved >= SAVE_EVERY_TICKS) saveProgress();
        if (run.battle.over) finishBattle();
    }
    board.draw(run.battle, { mySide: run.mySide });
    run.raf = requestAnimationFrame(frame);
}

// 効果音は種類ごとに間引き、×4 では鳴らさない
function sound(name, gapMs = 250) {
    if (!run || run.speed >= 4) return;
    const now = performance.now();
    if (now - (run.sounds[name] ?? -1e9) < gapMs) return;
    run.sounds[name] = now;
    music.play(name);
}

function processEvents(withSound) {
    const { battle, mySide } = run;
    const items = [];
    for (; run.logIndex < battle.events.length; run.logIndex++) {
        const e = battle.events[run.logIndex];
        const mine = e.side === mySide;
        if (e.kind === 'spawn' && e.line >= 0 && (mine || run.mode === 'watch')) {
            const tactic = battle.tactics[e.side];
            items.push(`<li><i class="side-dot${mine ? '' : ' enemy'}"></i>ルール${e.line + 1}：${esc(actText(tactic.rules[e.line].act))}</li>`);
            if (mine && withSound) sound('place', 400);
        } else if (e.kind === 'kill' && !mine && withSound) sound('capture', 350);
        else if (e.kind === 'raid' && !mine && withSound) sound('pay', 300);
    }
    if (items.length > 0) {
        const log = $('log');
        log.insertAdjacentHTML('afterbegin', items.slice(-6).reverse().join(''));
        while (log.children.length > 8) log.lastElementChild.remove();
    }
}

function updateHud() {
    const { battle, mySide } = run;
    const own = battle.sides[mySide];
    const enemy = battle.sides[1 - mySide];
    $('life-own').style.width = `${Math.max(0, own.life) / 10}%`;
    $('life-enemy').style.width = `${Math.max(0, enemy.life) / 10}%`;
    $('life-own-n').textContent = Math.max(0, own.life);
    $('life-enemy-n').textContent = Math.max(0, enemy.life);
    $('money-own').textContent = own.money;
    $('money-enemy').textContent = enemy.money;
    $('clock').textContent = `${Math.floor(battle.time / TICKS_PER_SECOND)}秒`;
}

function renderSpeed() {
    document.querySelectorAll('#speed [data-speed]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.speed) === run.speed)));
    $('pause').setAttribute('aria-pressed', String(run.paused));
    $('pause').setAttribute('aria-label', run.paused ? '再開' : '一時停止');
}

function saveProgress() {
    if (!run || run.mode !== 'cpu') return;
    run.lastSaved = run.battle.time;
    if (run.battle.over) store.remove(KEYS.save);
    else store.save(KEYS.save, { kind: 'battle', record: run.record, tick: run.battle.time, names: run.names, level: run.level });
}

function skipToEnd() {
    if (!run || run.battle.over) return;
    while (!run.battle.over) step(run.battle);
    processEvents(false);
    updateHud();
    board.draw(run.battle, { mySide: run.mySide });
    finishBattle();
}

function finishBattle() {
    if (run.finished) return;
    run.finished = true;
    if (run.mode === 'cpu') store.remove(KEYS.save);
    const s = summaryOf(run.battle);
    const { mySide, mode } = run;
    const won = s.winner === mySide;
    if (s.winner === null) music.play('notify');
    else if (mode === 'watch' || mode === 'replay') music.play('notify');
    else music.play(won ? 'win' : 'lose');
    // CPU との対戦だけ、ログインしている人の記録に送る（観戦・リプレイは数えない。オンラインはサーバーが記録する）
    // id はシードから作る（同じ対戦を2回数えない）
    if (mode === 'cpu') recordResult({ game: GAME, id: `${GAME}-${run.record.seed}`, outcome: s.winner === null ? 'draw' : won ? 'win' : 'loss' });
    setTimeout(() => showResult(s), reducedMotion ? 0 : 700);
}

function showResult(s) {
    if (!run) return;
    const { mySide, mode, names, battle } = run;
    const title = $('result-title');
    if (s.winner === null) title.textContent = '引き分け';
    else if (mode === 'watch' || mode === 'replay') title.textContent = `${names[s.winner]}の勝ち`;
    else title.textContent = s.winner === mySide ? '勝利' : '敗北';
    title.classList.toggle('win', s.winner === mySide && mode !== 'watch');
    $('result-life').textContent = `${names[mySide]} ${Math.max(0, s.life[mySide])}　・　${names[1 - mySide]} ${Math.max(0, s.life[1 - mySide])}`;
    const st = s.stats;
    const row = (label, key) => `<tr><th>${label}</th><td>${st[mySide][key]}</td><td>${st[1 - mySide][key]}</td></tr>`;
    $('result-stats').innerHTML = `<tr><th></th><th>${esc(names[mySide])}</th><th>${esc(names[1 - mySide])}</th></tr>${row('出撃', 'spawned')}${row('撃破', 'killed')}${row('陣地への攻撃', 'raids')}${row('退却', 'retreats')}`;
    const tactic = battle.tactics[mySide];
    $('result-counts').innerHTML = tactic.rules.map((line, i) => `<li class="${line.on ? '' : 'off'}">${esc(lineText(line))}<span>${s.counts[mySide][i] ?? 0}回</span></li>`).join('') || '<li>行がありません</li>';
    $('edit-from-result').hidden = mode === 'watch' || mode === 'replay';
    $('again').textContent = mode === 'watch' ? '次の観戦' : 'もう一度';
    const dialog = $('result-dialog');
    if (!dialog.open) dialog.showModal();
}

// ---------- 対戦の始め方 ----------

function startCpu() {
    const tactic = myTactic();
    const opponent = builtinTactic(settings.level);
    startBattle({ tactics: [tactic, opponent], names: [tactic.name, levelLabel(settings.level)], level: settings.level, mode: 'cpu' });
}

let watchIndex = 0;
function startWatch() {
    const ids = CPU_LEVELS.map((l) => l.id);
    // 組み込みの戦術の組を順に回す（同じ戦術どうしにはしない）
    const a = watchIndex % ids.length;
    const b = (a + 1 + (Math.floor(watchIndex / ids.length) % (ids.length - 1))) % ids.length;
    watchIndex++;
    startBattle({ tactics: [builtinTactic(ids[a]), builtinTactic(ids[b])], names: [levelLabel(ids[a]), levelLabel(ids[b])], mode: 'watch' });
}

function playRecord(record, mode = 'replay', names = null) {
    let battle;
    try {
        battle = battleFromRecord(record);
    } catch (error) {
        toast(error.message);
        return;
    }
    startBattle({ tactics: battle.tactics, seed: record.seed, mode, names: names ?? battle.tactics.map((t) => t.name), mySide: run?.mySide ?? 0 });
}

function resume() {
    const save = store.load(KEYS.save);
    if (save?.kind === 'battle') {
        try {
            const battle = battleFromRecord(save.record);
            startBattle({ tactics: battle.tactics, seed: save.record.seed, names: save.names, level: save.level, mode: 'cpu', startTick: Math.min(save.tick, MAX_TICKS) });
            return;
        } catch {
            store.remove(KEYS.save);
        }
    } else if (save?.kind === 'edit') {
        try {
            openEditor(normalizeTactic(save.draft), save.id);
            return;
        } catch {
            store.remove(KEYS.save);
        }
    }
    renderTitle();
}

// ---------- 戦術の一覧 ----------

const ICONS = {
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.5M8.2 13.2l7.6 4.5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
};
const iconButton = (act, label, attrs = '') => `<button type="button" class="icon-button" data-act="${act}" aria-label="${label}" title="${label}" ${attrs}><svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[act === 'dup' ? 'copy' : act]}</svg></button>`;

function renderTactics() {
    $('tactic-list').innerHTML = rulesets.map((r) => `<li class="tactic-card" data-id="${r.id}">
        <div class="info"><b>${esc(r.tactic.name)}</b><span>${r.tactic.rules.length}行・編成${r.tactic.formations.length}</span></div>
        ${iconButton('edit', '直す')}${iconButton('dup', '複製', rulesets.length >= MAX_SAVED ? 'disabled' : '')}${iconButton('share', '共有')}${iconButton('trash', '削除')}
    </li>`).join('') || '<li class="empty">まだありません。＋か、組み込みの戦術の写しから作ります</li>';
    $('builtin-list').innerHTML = CPU_LEVELS.map((l) => `<li class="tactic-card" data-builtin="${l.id}">
        <div class="info"><b>${esc(BUILTIN[l.id].name)}</b><span>${l.label}・${BUILTIN[l.id].rules.length}行</span></div>
        ${iconButton('copy', '写して直す', rulesets.length >= MAX_SAVED ? 'disabled' : '')}${iconButton('share', '共有')}
    </li>`).join('');
}

function onTacticsClick(event) {
    const button = event.target.closest('[data-act]');
    if (!button || button.disabled) return;
    const card = button.closest('.tactic-card');
    const entry = rulesets.find((r) => r.id === card.dataset.id);
    const builtin = card.dataset.builtin;
    const act = button.dataset.act;
    if (act === 'edit' && entry) openEditor(entry.tactic, entry.id);
    if (act === 'copy' && builtin) openEditor({ ...builtinTactic(builtin), name: `${BUILTIN[builtin].name}の写し` }, null);
    if (act === 'dup' && entry) {
        rulesets.push({ id: newId(), tactic: { ...structuredClone(entry.tactic), name: `${entry.tactic.name}の写し`.slice(0, 16) } });
        saveRulesets(rulesets);
        renderTactics();
        music.play('place');
    }
    if (act === 'share') shareTactic(entry ? entry.tactic : builtinTactic(builtin));
    if (act === 'trash' && entry) {
        rulesets = rulesets.filter((r) => r !== entry);
        saveRulesets(rulesets);
        if (settings.tactic === entry.id) { settings.tactic = 'b:sample'; saveSettings(); }
        renderTactics();
        music.play('cancel');
        toast(`「${entry.tactic.name}」を消しました`);
    }
}

// ---------- エディタ ----------

function openEditor(tactic, id) {
    stopBattle();
    editing = { id };
    editor.open(tactic);
    $('trial-result').hidden = true;
    showScene('editor');
    store.save(KEYS.save, { kind: 'edit', id, draft: editor.draft });
}

// 保存する。だめなら false
function saveEditor({ quiet = false } = {}) {
    let tactic;
    try {
        tactic = editor.normalized();
    } catch (error) {
        toast(error.message);
        music.play('error');
        return false;
    }
    const entry = rulesets.find((r) => r.id === editing.id);
    if (entry) entry.tactic = tactic;
    else {
        if (rulesets.length >= MAX_SAVED) {
            toast(`保存できるのは ${MAX_SAVED} までです`);
            music.play('error');
            return false;
        }
        editing.id = newId();
        rulesets.push({ id: editing.id, tactic });
    }
    saveRulesets(rulesets);
    settings.tactic = editing.id;
    saveSettings();
    store.save(KEYS.save, { kind: 'edit', id: editing.id, draft: editor.draft });
    if (!quiet) { toast('保存しました'); music.play('place'); }
    return true;
}

function leaveEditor() {
    if (!saveEditor({ quiet: true })) return;
    store.remove(KEYS.save);
    editing = null;
    showScene('tactics');
    music.play('cancel');
}

// 重い計算（試す・ヒント）は Web Worker で回す。使えなければ、その場で計算する
let worker = null;
let workerSeq = 0;
const pending = new Map();
function compute(type, payload) {
    try {
        if (!worker) {
            worker = new Worker(new URL('./hint-worker.js', import.meta.url), { type: 'module' });
            worker.addEventListener('message', (event) => {
                const { id, result, error } = event.data;
                const p = pending.get(id);
                pending.delete(id);
                if (error) p?.reject(new Error(error));
                else p?.resolve(result);
            });
        }
        const id = ++workerSeq;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            worker.postMessage({ id, type, ...payload });
        });
    } catch {
        return import('./cpu-suggest.js').then((m) => (type === 'suggest' ? m.suggest(payload.tactic, payload.opponent) : m.trial(payload.tactic, payload.opponent, payload.seeds)));
    }
}

async function runTrial() {
    let tactic;
    try { tactic = editor.normalized(); } catch (error) { toast(error.message); music.play('error'); return; }
    const box = $('trial-result');
    box.hidden = false;
    box.textContent = `${levelLabel(settings.level)}と 10 回戦っています…`;
    $('trial').disabled = true;
    music.play('select');
    try {
        const r = await compute('trial', { tactic, opponent: builtinTactic(settings.level), seeds: 10 });
        box.textContent = `${levelLabel(settings.level)}に ${r.wins}勝 ${r.losses}敗 ${r.draws}分（体力の差 平均 ${Math.round(r.diff / r.games)}）`;
        music.play(r.wins > r.losses ? 'gain' : 'notify');
    } catch (error) {
        box.textContent = error.message;
    } finally {
        $('trial').disabled = false;
    }
}

let hintResult = null;
async function showHint() {
    let tactic;
    try { tactic = editor.normalized(); } catch (error) { toast(error.message); music.play('error'); return; }
    const body = $('hint-body');
    hintResult = null;
    $('hint-apply').hidden = true;
    body.innerHTML = `<p class="import-text">${levelLabel(settings.level)}を相手に、足すと良さそうな 1 行を探しています…</p>`;
    $('hint-dialog').showModal();
    music.play('select');
    $('hint').disabled = true;
    try {
        const hint = await compute('suggest', { tactic, opponent: builtinTactic(settings.level) });
        if (!$('hint-dialog').open) return;
        if (!hint) {
            body.innerHTML = '<p class="import-text">行がいっぱいです（12 行まで）。</p>';
            return;
        }
        hintResult = hint;
        const pts = (r) => r.wins + r.draws / 2;
        body.innerHTML = `<p class="import-text">${hint.index + 1} 行目に足す：</p>
            <ul class="hint-line"><li class="recommended">${esc(lineText(hint.line))}</li></ul>
            <p class="import-text">${levelLabel(settings.level)}との ${hint.result.games} 戦：勝ち点 ${pts(hint.base)} → ${pts(hint.result)}${hint.improved ? '' : '（今の戦術より良い行は見つかりませんでした）'}</p>`;
        $('hint-apply').hidden = false;
    } catch (error) {
        body.innerHTML = `<p class="import-text">${esc(error.message)}</p>`;
    } finally {
        $('hint').disabled = false;
    }
}

// ---------- 共有 ----------

const baseUrl = () => `${location.origin}${location.pathname}`;

function openShare(title, url) {
    $('share-title').textContent = title;
    $('share-url').value = url;
    $('share-copy').textContent = 'コピー';
    $('share-dialog').showModal();
}

function shareTactic(tactic) {
    openShare(`「${tactic.name}」を共有`, `${baseUrl()}#r=${encodeTactic(tactic)}`);
}

function importFromHash() {
    const hash = location.hash;
    if (!hash.startsWith('#r=') && !hash.startsWith('#b=')) return;
    history.replaceState(null, '', location.pathname + location.search);
    const code = hash.slice(3);
    const dialog = $('import-dialog');
    try {
        if (hash.startsWith('#r=')) {
            const tactic = decodeTactic(code);
            $('import-title').textContent = '共有された戦術';
            $('import-text').textContent = `「${tactic.name}」（${tactic.rules.length}行）`;
            $('import-buttons').innerHTML = `<button type="button" class="primary" data-import="save">保存する</button>
                <button type="button" class="secondary" data-import="edit">中を見る</button><button type="button" class="tertiary" data-import="close">閉じる</button>`;
            dialog.onclick = (event) => {
                const b = event.target.closest('[data-import]');
                if (!b) return;
                dialog.close();
                if (b.dataset.import === 'save') {
                    if (rulesets.length >= MAX_SAVED) { toast(`保存できるのは ${MAX_SAVED} までです`); return; }
                    const id = newId();
                    rulesets.push({ id, tactic });
                    saveRulesets(rulesets);
                    settings.tactic = id;
                    saveSettings();
                    renderTitle();
                    toast('保存しました。タイトルの「戦術」で選べます');
                    music.play('place');
                } else if (b.dataset.import === 'edit') openEditor(tactic, null);
            };
        } else {
            const record = decodeRecord(code);
            if (record.engine !== ENGINE_VERSION) throw new Error('この版では再現できない記録です');
            $('import-title').textContent = '共有された対戦';
            $('import-text').textContent = `${record.tactics[0].name} 対 ${record.tactics[1].name}`;
            $('import-buttons').innerHTML = '<button type="button" class="primary" data-import="play">見る</button><button type="button" class="tertiary" data-import="close">閉じる</button>';
            dialog.onclick = (event) => {
                const b = event.target.closest('[data-import]');
                if (!b) return;
                dialog.close();
                if (b.dataset.import === 'play') playRecord(record, 'replay');
            };
        }
        dialog.showModal();
    } catch (error) {
        toast(error.message);
    }
}

// ---------- オンライン対戦（入口とロビーは netplay-lobby.js の画面） ----------

const online = new NetplayLobby({
    title: '3rd Force',
    game: GAME,
    serverUrl: getServerUrl(),
    storageKey: 'thirdforce.online',
    allowCpu: true,
    minPlayers: 2,
    maxPlayers: 2,
    settings: [{ key: 'cpu', label: 'CPU の戦術', options: CPU_LEVELS.map((l) => ({ value: l.id, label: l.label })) }],
    onStart: (controller) => { onlineController = controller; onlineMatchShown = null; onlineUpdate(); },
    onUpdate: () => onlineUpdate(),
    onError: (message) => toast(message),
    onExit: () => {
        onlineController = null;
        onlineMatchShown = null;
        stopBattle();
        run = null;
        document.querySelectorAll('dialog[open]').forEach((d) => d.close());
        showScene('title');
    }
});

function onlineUpdate() {
    const view = onlineController?.getView();
    if (!view) return;
    if (view.phase === 'submit') {
        if (run?.mode === 'online') { stopBattle(); run = null; $('result-dialog').open && $('result-dialog').close(); }
        renderSubmit(view);
        return;
    }
    if (view.phase === 'over' && view.battle && onlineMatchShown !== onlineController.matchId) {
        onlineMatchShown = onlineController.matchId;
        let tactics;
        try {
            tactics = view.battle.tactics.map(decodeTactic);
        } catch (error) {
            toast(error.message);
            return;
        }
        if (view.battle.engine !== ENGINE_VERSION) { toast('この版では再現できない対戦です'); return; }
        $('result-dialog').open && $('result-dialog').close();
        startBattle({ tactics, seed: view.battle.seed, mySide: view.seat ?? 0, mode: 'online', names: view.players.map((p) => p.name) });
    }
}

function renderSubmit(view) {
    showScene('submit');
    const me = view.players[view.seat];
    const other = view.players[1 - view.seat];
    $('submit-vs').textContent = `${me?.name ?? 'あなた'} 対 ${other?.name ?? '相手'}`;
    const submitted = Boolean(view.mine);
    $('submit-tactic').innerHTML = tacticOptions(settings.tactic);
    $('submit-tactic').disabled = submitted;
    $('submit').disabled = submitted;
    $('submit-status').textContent = submitted
        ? (other?.submitted ? 'そろいました' : '相手が戦術を選んでいます')
        : (other?.submitted ? '相手は戦術を出しました' : '');
}

function submitOnline() {
    const tactic = tacticRef($('submit-tactic').value);
    if (!tactic || !onlineController) return;
    if (onlineController.send({ type: 'submit', tactic: encodeTactic(tactic) }) !== false) music.play('place');
}

// ---------- 起動 ----------

function setup() {
    drawTitleArt();
    $('help').innerHTML = helpMarkup();
    const openHelp = () => { $('help-dialog').showModal(); music.play('select'); };
    ['open-help-title', 'open-help-game', 'open-help-editor', 'open-help-submit'].forEach((id) => $(id).addEventListener('click', openHelp));

    $('my-tactic').addEventListener('change', (e) => { settings.tactic = e.target.value; saveSettings(); music.play('select'); });
    $('cpu-level').addEventListener('click', (e) => {
        const b = e.target.closest('[data-level]');
        if (!b) return;
        settings.level = b.dataset.level;
        saveSettings();
        renderTitle();
        music.play('select');
    });
    $('start').addEventListener('click', startCpu);
    $('resume').addEventListener('click', resume);
    $('watch').addEventListener('click', startWatch);
    $('open-tactics').addEventListener('click', () => { showScene('tactics'); music.play('select'); });
    $('online').addEventListener('click', () => online.open());

    $('tactics-back').addEventListener('click', () => { showScene('title'); music.play('cancel'); });
    $('new-tactic').addEventListener('click', () => {
        if (rulesets.length >= MAX_SAVED) { toast(`保存できるのは ${MAX_SAVED} までです`); music.play('error'); return; }
        openEditor(emptyTactic(), null);
        music.play('select');
    });
    $('screen-tactics').addEventListener('click', onTacticsClick);

    $('editor-back').addEventListener('click', leaveEditor);
    $('save-tactic').addEventListener('click', () => saveEditor());
    $('trial').addEventListener('click', runTrial);
    $('hint').addEventListener('click', showHint);
    $('hint-close').addEventListener('click', () => { $('hint-dialog').close(); music.play('cancel'); });
    $('hint-apply').addEventListener('click', () => {
        if (!hintResult) return;
        editor.insertLine(hintResult.line, hintResult.index);
        $('hint-dialog').close();
        music.play('place');
    });
    $('tactic-name').addEventListener('click', () => {
        $('name-input').value = editor.draft.name;
        $('name-dialog').showModal();
    });
    $('name-dialog').addEventListener('close', () => {
        const name = $('name-input').value.trim().slice(0, 16);
        if ($('name-dialog').returnValue === 'ok' && name) editor.rename(name);
    });

    $('speed').addEventListener('click', (e) => {
        const b = e.target.closest('[data-speed]');
        if (!b || !run) return;
        run.speed = Number(b.dataset.speed);
        renderSpeed();
        music.play('select');
    });
    $('pause').addEventListener('click', () => {
        if (!run) return;
        run.paused = !run.paused;
        renderSpeed();
    });
    $('skip').addEventListener('click', skipToEnd);
    $('home').addEventListener('click', () => {
        if (run?.mode === 'online') return online.confirmLeave();
        if (run?.mode === 'cpu' && !run.battle.over) saveProgress();
        stopBattle();
        run = null;
        showScene('title');
    });
    $('submit-home').addEventListener('click', () => online.confirmLeave());
    $('submit').addEventListener('click', submitOnline);

    $('again').addEventListener('click', () => {
        $('result-dialog').close();
        if (run?.mode === 'online') return online.rematch();
        if (run?.mode === 'watch') return startWatch();
        if (run?.mode === 'replay') return playRecord(run.record, 'replay', run.names);
        startCpu();
    });
    $('replay').addEventListener('click', () => {
        $('result-dialog').close();
        const { record, names, mode, mySide, level } = run;
        startBattle({ tactics: record.tactics, seed: record.seed, names, mySide, level, mode: mode === 'cpu' ? 'replay' : mode === 'online' ? 'replay' : mode });
    });
    $('edit-from-result').addEventListener('click', () => {
        $('result-dialog').close();
        const tactic = run.battle.tactics[run.mySide];
        const ref = settings.tactic;
        const own = rulesets.find((r) => r.id === ref);
        if (run.mode === 'online') online.leave();
        openEditor(tactic, own && JSON.stringify(own.tactic) === JSON.stringify(tactic) ? own.id : null);
    });
    $('share-battle').addEventListener('click', () => openShare('この対戦を共有', `${baseUrl()}#b=${encodeRecord(run.record)}`));
    $('result-home').addEventListener('click', () => {
        $('result-dialog').close();
        if (run?.mode === 'online') return online.leave();
        stopBattle();
        run = null;
        showScene('title');
    });
    $('share-copy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText($('share-url').value);
            $('share-copy').textContent = 'コピーしました';
        } catch {
            $('share-url').select();
        }
        music.play('select');
    });
    $('share-close').addEventListener('click', () => $('share-dialog').close());

    window.addEventListener('resize', () => { board.resize(); if (run) board.draw(run.battle, { mySide: run.mySide }); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && run?.mode === 'cpu') saveProgress(); });

    // ページの拡大を止める
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea')) e.preventDefault(); });

    showScene('title');
    importFromHash();
    window.addEventListener('hashchange', importFromHash);
    registerServiceWorker();
    // 招待URL（?room=）か、前回入っていた部屋があれば、オンライン対戦に入る
    online.boot();
    // 確かめるときに使う
    window.__app = {
        get run() { return run; }, get editor() { return editor; }, get rulesets() { return rulesets; }, online,
        startCpu, startWatch, skipToEnd, openEditor
    };
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then((registration) => {
        const urls = [location.href, ...performance.getEntriesByType('resource').map((r) => r.name)];
        const post = (w) => w?.postMessage({ type: 'cache-urls', urls });
        if (registration.active) post(registration.active);
        else navigator.serviceWorker.ready.then((r) => post(r.active));
    }).catch(() => {});
}

setup();
