/**
 * 画面（タイトル・ゲーム・種族・記録・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { RACES, POWERS, TERRAINS, SPECIALS, comboName } from './data.js';
import { getMap } from './map.js';
import {
    conquestTargets, dragonTargets, sorceryTargets, canAbandon, canDecline, canRoll, readyHand, redeployChecks,
    canFinishRedeploy, peaceOptions, canStoutDecline, defenseOf, conquestCost, regionsOf
} from './rules.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS } from './cpu-player.js';
import BoardView from './board-view.js';
import { symbolsSvg, icon, coinIcon, tokenSvg, PLAYER_COLORS } from './art.js';
import { helpHtml, titleArtHtml } from './help.js';

const SETTINGS_KEY = 'small-world.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ', 'レン'];
const RESULT_DELAY_MS = 1200;
const AUTO_MS = 700;
const STAGE_NAMES = { pick: '組を選ぶ', conquer: '征服', redeploy: '再配置' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: [2, 3, 4, 5].includes(saved.count) ? saved.count : 3, level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy' };
    } catch {
        return { count: 3, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.selected = -1;
        this.lastSeq = 0;
        this.pickShownAt = -1;
        this.resultTimer = null;
        this.autoTimer = null;
        this.toastTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        $('#title-art').innerHTML = titleArtHtml();
        $('#help-body').innerHTML = helpHtml();
        this.board = new BoardView($('#map'), { onTap: (id) => this.tap(id) });
        this.bindStatic();
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        this.renderSetup();
    }

    startGame(setup) {
        this.stopGame();
        try {
            this.controller = new LocalGameController(setup, {
                onUpdate: () => this.render(),
                onError: (message) => this.toast(message)
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.selected = -1;
        this.pickShownAt = -1;
        this.lastSeq = Infinity;      // 始めたときのイベントは見せない
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.board.setMap(getMap(setup.players.length));
        this.render();
        this.board.resize();
        this.board.resetZoom();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        clearTimeout(this.autoTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    send(command) {
        if (!this.controller) return false;
        clearTimeout(this.autoTimer);
        return this.controller.send(command);
    }

    bindStatic() {
        $('#player-count').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-count]');
            if (!button) return;
            this.settings.count = Number(button.dataset.count);
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#cpu-level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-home').addEventListener('click', () => this.showTitle());
        $('#result-board').addEventListener('click', () => $('#result').close());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-races').addEventListener('click', () => this.openRaces());
        $('#players').addEventListener('click', () => this.openRaces());
        $('#open-log').addEventListener('click', () => {
            const list = $('#log-list');
            list.innerHTML = (this.view?.logs ?? []).map(text => `<li>${escapeHtml(text)}</li>`).join('');
            $('#log').showModal();
            list.scrollTop = list.scrollHeight;
        });
        $('#zoom-in').addEventListener('click', () => this.board.zoomBy(1.6));
        $('#zoom-out').addEventListener('click', () => this.board.zoomBy(1 / 1.6));
        $('#zoom-fit').addEventListener('click', () => this.board.resetZoom());
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (button && !button.disabled) this.act(button.dataset.act);
        });
        $('#races-body').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-pick]');
            if (!button) return;
            $('#races').close();
            this.send({ type: 'pick', index: Number(button.dataset.pick) });
        });
        $('#peace-list').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-peace]');
            if (!button) return;
            $('#peace').close();
            const seat = Number(button.dataset.peace);
            this.send(seat >= 0 ? { type: 'done', peace: seat } : { type: 'done' });
        });
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.addEventListener('click', (event) => {
                if (event.target === dialog) dialog.close();
                if (event.target.closest('[data-close]')) dialog.close();
            });
        });
    }

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    // ---- 操作 ----

    isMine() {
        const v = this.view;
        return !!v && v.phase === 'play' && v.current === v.you;
    }

    tap(id) {
        if (!this.view) return;
        const v = this.view;
        // 選んでいる征服先をもう一度タップしたら、征服する
        if (id >= 0 && id === this.selected && this.isMine() && v.stage === 'conquer') {
            const target = conquestTargets(v).find(t => t.id === id);
            if (target && !target.final) {
                this.selected = -1;
                this.send({ type: 'conquer', region: id });
                return;
            }
        }
        this.selected = id === this.selected ? -1 : id;
        this.render();
    }

    act(action) {
        const id = this.selected;
        const v = this.view;
        switch (action) {
            case 'pick-open': this.openRaces(); return;
            case 'conquer': case 'dragon': case 'sorcery': case 'abandon':
                this.selected = -1;
                this.send({ type: action, region: id });
                return;
            case 'roll': case 'decline': case 'redeploy':
                this.send({ type: action });
                return;
            case 'place': case 'lift': case 'hero': case 'camp': case 'uncamp': case 'fort':
                this.send({ type: action, region: id });
                return;
            case 'done': {
                const options = peaceOptions(v);
                if (options.length) {
                    $('#peace-list').innerHTML = options.map(seat => `<button class="btn secondary" data-peace="${seat}">${escapeHtml(v.players[seat].name)}</button>`).join('')
                        + '<button class="btn secondary" data-peace="-1">結ばない</button>';
                    $('#peace').showModal();
                    return;
                }
                this.send({ type: 'done' });
                return;
            }
            case 'stout':
                this.send({ type: 'done', decline: true });
                return;
        }
    }

    // ---- 描画 ----

    render() {
        if (!this.controller) return;
        const v = this.controller.getView();
        const prev = this.view;
        this.view = v;
        if (prev && (prev.current !== v.current || prev.stage !== v.stage)) this.selected = -1;
        if (this.selected >= 0 && this.selected >= v.regions.length) this.selected = -1;
        this.board.setMap(getMap(v.players.length));
        this.renderBoard();
        this.renderStatus();
        this.renderPlayers();
        this.renderPanel();
        this.showEvents(v);
        clearTimeout(this.autoTimer);
        if (this.isMine() && v.stage === 'pick' && this.pickShownAt !== v.commandCount && !document.querySelector('dialog[open]')) {
            this.pickShownAt = v.commandCount;
            this.openRaces();
        }
        // 征服でできることが残っていなければ、少し間を置いて再配置に移る
        if (this.isMine() && v.stage === 'conquer' && !canDecline(v) && !canRoll(v)
            && conquestTargets(v).length === 0 && dragonTargets(v).length === 0 && sorceryTargets(v).length === 0) {
            this.autoTimer = setTimeout(() => {
                if (this.view === v) this.send({ type: 'redeploy' });
            }, AUTO_MS);
        }
        if (v.phase === 'end' && !this.resultTimer) {
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    renderBoard() {
        const v = this.view;
        const targets = new Map();
        if (this.isMine() && v.stage === 'conquer') {
            conquestTargets(v).forEach(t => targets.set(t.id, { label: t.final ? `${t.cost}` : `${t.need}`, kind: t.final ? 'dice' : 'go' }));
            dragonTargets(v).forEach(id => { if (!targets.has(id)) targets.set(id, { label: '1', kind: 'special' }); });
            sorceryTargets(v).forEach(id => targets.set(id, { label: '1', kind: 'special' }));
        }
        const recent = new Set(v.players.filter(p => p.id !== v.you).flatMap(p => p.lastConquered));
        this.board.render({ regions: v.regions, bands: v.bands, targets, selected: this.selected, recent });
    }

    renderStatus() {
        const v = this.view;
        let html;
        if (v.phase === 'end') {
            html = '<span class="who">終わり</span>';
        } else {
            const p = v.players[v.current];
            const me = v.current === v.you;
            const ghoul = v.step?.ghoul ? '（グール）' : '';
            html = `<span class="dot" style="--c:${PLAYER_COLORS[v.current]}"></span><span class="who${me ? ' me' : ''}">${me ? 'あなたの番' : `${escapeHtml(p.name)}の番`}</span>`
                + `<span class="what">${STAGE_NAMES[v.stage] ?? ''}${ghoul}</span>`;
        }
        html += `<span class="round">${Math.min(v.round, v.rounds)}<small>/${v.rounds}</small></span>`;
        $('#status').innerHTML = html;
    }

    renderPlayers() {
        const v = this.view;
        const el = $('#players');
        el.style.setProperty('--n', v.players.length);
        el.innerHTML = v.players.map(p => {
            const active = p.active ? RACES[p.active].name : '';
            const declined = p.declined.map(r => RACES[r].name).join('・');
            return `<div class="pl${p.id === v.current && v.phase === 'play' ? ' active' : ''}${v.winners.includes(p.id) ? ' win' : ''}" style="--c:${PLAYER_COLORS[p.id]}">
                <div class="pl-top"><span class="pl-name">${escapeHtml(p.name)}</span></div>
                <div class="pl-bottom"><span class="pl-coins">${coinIcon(12)}${p.coins}</span>${active ? `<span class="pl-race">${active}</span>` : ''}${declined ? `<span class="pl-dec">${declined}</span>` : ''}</div>
            </div>`;
        }).join('');
    }

    regionInfo(id) {
        const v = this.view;
        const info = getMap(v.players.length).regions[id];
        const r = v.regions[id];
        const parts = [TERRAINS[info.terrain].name + (info.special ? `・${SPECIALS[info.special].name}` : '')];
        if (r.race === 'lost') parts.push('失われた部族');
        else if (r.race) {
            const band = v.bands[r.race];
            parts.push(`${escapeHtml(v.players[band.seat].name)}の${band.declined ? `${RACES[r.race].name}（衰退）` : comboName(r.race, band.power)} ${r.count}体`);
        }
        const marks = [r.lair && '巣', r.fort && '砦', r.camps && `野営${r.camps}`, r.hero && '英雄', r.hole && '穴', r.dragon && '竜'].filter(Boolean);
        if (marks.length) parts.push(marks.join('・'));
        const water = info.terrain === 'sea' || info.terrain === 'lake';
        if (!water || r.race) parts.push(`守り ${defenseOf(v, id)}`);
        if (this.isMine() && v.stage === 'conquer' && v.acting && v.regions[id].race !== v.acting) {
            const t = conquestTargets(v).find(x => x.id === id);
            if (t) parts.push(t.final ? `あと${t.cost - readyHand(v)}をサイコロで` : `${t.need}体で征服`);
            else if (!water) parts.push(`要 ${conquestCost(v, v.acting, id)}`);
        }
        return parts.join('　');
    }

    renderPanel() {
        const v = this.view;
        const me = v.players[v.you];
        const head = $('#panel-head');
        const infoEl = $('#panel-info');
        const actions = [];
        const button = (act, label, cls = 'secondary', disabled = false) => actions.push(`<button class="btn ${cls}" data-act="${act}"${disabled ? ' disabled' : ''}>${label}</button>`);
        const mine = this.isMine();
        const id = this.selected;
        let headHtml;
        if (mine && v.stage !== 'pick' && v.acting) {
            const band = v.bands[v.acting];
            const name = band.declined ? `${RACES[v.acting].name}（衰退）` : comboName(v.acting, band.power);
            const hand = v.stage === 'conquer' ? readyHand(v) : band.hand;
            const roll = v.step.roll !== null && v.step.roll !== undefined ? `<span class="chip dice">${icon('dice')}+${v.step.roll}</span>` : '';
            headHtml = `<span class="race">${name}</span>${roll}<span class="hand">${tokenSvg(v.you, '', band.declined, 18)}手持ち <b>${hand}</b></span>`;
        } else if (me.active || me.declined.length) {
            const list = [me.active && comboName(me.active, v.bands[me.active].power), ...me.declined.map(r => `${RACES[r].name}（衰退）`)].filter(Boolean);
            headHtml = `<span class="race">${list.join('　')}</span><span class="hand">${coinIcon(16)}<b>${me.coins}</b></span>`;
        } else {
            headHtml = `<span class="race muted">まだ種族がない</span><span class="hand">${coinIcon(16)}<b>${me.coins}</b></span>`;
        }
        head.innerHTML = headHtml;
        infoEl.innerHTML = id >= 0 ? this.regionInfo(id) : mine ? this.hint() : '';

        if (mine && v.stage === 'pick') {
            button('pick-open', `${icon('banner')}組を選ぶ`, 'primary');
        } else if (mine && v.stage === 'conquer') {
            const target = conquestTargets(v).find(t => t.id === id);
            if (target) button('conquer', target.final ? `${icon('dice')}賭ける` : `征服 ${target.need}`, 'primary');
            if (dragonTargets(v).includes(id)) button('dragon', '竜で征服', 'primary');
            if (sorceryTargets(v).includes(id)) button('sorcery', '魔術で奪う', 'primary');
            if (id >= 0 && canAbandon(v, id)) button('abandon', '放棄');
            if (canRoll(v)) button('roll', `${icon('dice')}振る`, 'primary');
            if (canDecline(v)) button('decline', '衰退');
            button('redeploy', '征服を終える');
        } else if (mine && v.stage === 'redeploy') {
            const checks = id >= 0 ? redeployChecks(v, id) : null;
            if (checks) {
                actions.push(`<div class="stepper"><button class="icon-btn" data-act="lift" aria-label="減らす"${checks.lift ? '' : ' disabled'}>${icon('sub')}</button><b>${v.regions[id].count}</b><button class="icon-btn" data-act="place" aria-label="増やす"${checks.place ? '' : ' disabled'}>${icon('add')}</button></div>`);
                const power = v.bands[v.acting].power;
                if (!v.step.ghoul && power === 'heroic') button('hero', v.regions[id].hero ? '英雄を外す' : '英雄', 'secondary', !checks.hero);
                if (!v.step.ghoul && power === 'bivouacking') {
                    button('camp', '野営＋', 'secondary', !checks.camp);
                    button('uncamp', '野営−', 'secondary', !checks.uncamp);
                }
                if (!v.step.ghoul && power === 'fortified') button('fort', v.step.fortRegion === id ? '砦を外す' : '砦', 'secondary', !checks.fort);
            }
            if (canStoutDecline(v)) button('stout', '衰退して終える', 'secondary', !canFinishRedeploy(v));
            button('done', v.step.ghoul ? '次へ' : '番を終える', 'primary', !canFinishRedeploy(v));
        }
        $('#actions').innerHTML = actions.join('');
    }

    hint() {
        const v = this.view;
        if (v.stage === 'conquer') {
            if (canRoll(v)) return '征服の前にサイコロを振る';
            return conquestTargets(v).length ? '光る領域を征服できる（数は置く部隊）' : '';
        }
        if (v.stage === 'redeploy') {
            const band = v.bands[v.acting];
            return band.hand > 0 && regionsOf(v, v.acting).length ? `あと${band.hand}体を置く` : '自分の領域を選ぶと、部隊を置き直せる';
        }
        return '';
    }

    // ---- 種族の一覧 ----

    openRaces() {
        const v = this.view;
        if (!v) return;
        const me = v.players[v.you];
        const canPick = this.isMine() && v.stage === 'pick';
        const row = v.row.map((c, i) => {
            const tokens = RACES[c.race].tokens + POWERS[c.power].tokens;
            const pick = canPick ? `<button class="btn primary small" data-pick="${i}"${i > me.coins ? ' disabled' : ''}>選ぶ</button>` : '';
            return `<li class="combo">
                <div class="c-top"><span class="c-cost">${coinIcon(13)}${i}</span><b class="c-name">${comboName(c.race, c.power)}</b><span class="c-tok">${tokenSvg(v.you, tokens, false, 20)}</span>${c.coins ? `<span class="c-bonus">+${c.coins}${coinIcon(12)}</span>` : ''}${pick}</div>
                <div class="c-text"><span>${POWERS[c.power].name.replace(/の$/, '')}</span>${POWERS[c.power].text}</div>
                <div class="c-text"><span>${RACES[c.race].name}</span>${RACES[c.race].text}</div>
            </li>`;
        }).join('');
        const field = v.players.map(p => {
            const items = [p.active && { race: p.active, declined: false }, ...p.declined.map(r => ({ race: r, declined: true }))].filter(Boolean);
            if (!items.length) return '';
            return `<li class="combo"><div class="c-top"><span class="dot" style="--c:${PLAYER_COLORS[p.id]}"></span><b>${escapeHtml(p.name)}</b></div>${items.map(({ race, declined }) => {
                const band = v.bands[race];
                return `<div class="c-text"><span>${declined ? `${RACES[race].name}（衰退）` : comboName(race, band.power)}</span>${declined ? RACES[race].text : `${POWERS[band.power].text}。${RACES[race].text}`}</div>`;
            }).join('')}</li>`;
        }).join('');
        $('#races-body').innerHTML = `<ul class="combos">${row}</ul>${field ? `<h3>場の種族</h3><ul class="combos">${field}</ul>` : ''}`;
        $('#races-title').textContent = canPick ? '組を選ぶ' : '種族';
        $('#races').showModal();
    }

    // ---- 演出と結果 ----

    showEvents(v) {
        const events = v.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = v.events.reduce((m, e) => Math.max(m, e.seq), this.lastSeq === Infinity ? 0 : this.lastSeq);
        const messages = [];
        events.forEach(e => {
            const name = e.seat === v.you ? 'あなた' : v.players[e.seat]?.name;
            if (e.type === 'dice') {
                messages.push(e.berserk ? `${name}のサイコロ ${e.value}` : `${name}の援軍のサイコロ ${e.value}。${e.success ? '征服' : '届かず'}`);
            } else if (e.type === 'income' && e.seat === v.you) {
                messages.push(`+${e.coins}金（${e.parts.filter(p => p.coins).map(p => `${p.label}${p.coins}`).join('・')}）`);
            } else if (e.type === 'decline' && e.seat !== v.you) {
                messages.push(`${name}の${RACES[e.race].name}が衰退`);
            }
        });
        if (messages.length) this.toast(messages.join('\n'));
    }

    showResult() {
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        const order = [...v.players].sort((a, b) => b.coins - a.coins || b.tokens - a.tokens);
        const youWin = v.winners.includes(v.you);
        $('#result-title').textContent = youWin ? (v.winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${v.players[v.winners[0]].name}の勝ち`;
        $('#result-table').innerHTML = `<table><thead><tr><th></th><th>コイン</th><th>部隊</th></tr></thead><tbody>${order.map(p => `
            <tr class="${v.winners.includes(p.id) ? 'win' : ''}${p.id === v.you ? ' you' : ''}"><th><span class="dot" style="--c:${PLAYER_COLORS[p.id]}"></span>${escapeHtml(p.name)}</th><td class="total">${p.coins}</td><td>${p.tokens}</td></tr>`).join('')}</tbody></table>`;
        $('#result').showModal();
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
    }
}
