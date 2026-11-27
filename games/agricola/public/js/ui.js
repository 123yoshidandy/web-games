/**
 * 画面（タイトル・ゲーム・ダイアログ）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 * 行動スペースを選ぶと、行動に合わせて「下の欄の操作」「農場のマスの選択」「ダイアログ」のどれかになる
 */

import { SPACES, SHORT, MAJOR, MAJORS, FIREPLACES, GOOD_NAME, BUILDING_RES, hasAll } from './cards.js';
import {
    CELLS, ANIMALS, canPlow, canRoom, canStable, addPastures, ROOM_COST, renovationCost, NEXT_HOUSE, fieldAt, fits, fenceCount, MAX_FENCES
} from './farm.js';
import { cookRates, bakeFood, maxBake, crafts } from './cooking.js';
import { scoreBreakdown, SCORE_LABELS } from './scoring.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS, chooseCommand, suggest } from './cpu-player.js';
import { symbolsSvg, sym, amountHtml, majorIcon } from './art.js';
import { farmHtml } from './farm-view.js';
import { helpHtml, titleArtHtml } from './help.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl } from './online-config.js';
import * as Motion from './motion/motion.js';
import { snapshot, animateDiff, flyIn } from './anim.js';
import { MAX_PLAYERS } from './game.js';

const GAME = 'agricola';
const SETTINGS_KEY = 'agricola.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
export const COLORS = ['#d9473b', '#3d7dd8', '#9a5ad1', '#e2a52a'];
const RESULT_DELAY_MS = 900;

// 動きの目印：行動スペースは「使われているか｜たまった資源」、数は欄ごとの何番目か、農場はマスの中身
const SPACE_MOTION = {
    key: el => el.dataset.space,
    value: el => `${el.classList.contains('taken') ? 'taken' : 'free'}|${el.querySelector('.sp-goods')?.textContent ?? ''}`
};
const AMOUNTS = '#players .pl-stats > .amt, #me .me-row > .amt';
const amountKey = el => `${el.closest('.pl')?.dataset.seat ?? 'me'}:${[...el.parentElement.querySelectorAll(':scope > .amt')].indexOf(el)}`;
const FARM_MOTION = { key: el => el.dataset.cell, value: el => el.innerHTML };
const HOUSE_NAME = { wood: '木の家', clay: 'レンガの家', stone: '石の家' };
const RES_ORDER = ['wood', 'clay', 'reed', 'stone', 'grain', 'veg'];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const costHtml = (cost) => Object.entries(cost).filter(([, n]) => n > 0).map(([k, n]) => amountHtml(k, n)).join('');
const goodsHtml = (goods) => Object.entries(goods).filter(([, n]) => n > 0).map(([k, n]) => amountHtml(k, n)).join('');

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [1, 2, 3, 4].includes(saved.count) ? saved.count : 2,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 2, level: 'easy' };
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
        this.sel = null;            // 選んでいる行動スペースと、その選び方
        this.info = null;           // 説明を見ている行動スペース
        this.form = null;           // ダイアログの中身
        this.decideKey = null;
        this.dismissedKey = null;
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        $('#title-art').innerHTML = titleArtHtml();
        $('#help-body').innerHTML = helpHtml();
        this.bindStatic();
        Motion.mountSpeedSetting($('#motion-setting'), { label: '' });
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'アグリコラ',
            game: 'agricola',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 650,
            minPlayers: 2,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.begin(controller),
            onUpdate: () => {
                this.hintSpace = null;
                this.render();
            },
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => this.showTitle()
        });
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        $('#online-button').hidden = !this.online.available;
        this.renderSetup();
    }

    startGame(setup) {
        let controller;
        try {
            controller = new LocalGameController(setup, {
                onUpdate: () => {
                    this.hintSpace = null;
                    this.render();
                },
                onError: (message) => {
                    music.play('error');
                    this.toast(message);
                }
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.begin(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    begin(controller) {
        if (this.controller !== controller) this.stopGame();
        this.controller = controller;
        this.view = null;
        this.soundSeq = controller.getView()?.events.at(-1)?.seq ?? 0;
        this.sel = null;
        this.info = null;
        this.decideKey = null;
        this.dismissedKey = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        if (!controller.isOnline) controller.scheduleCpu();
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
        this.resultTimer?.();
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    send(command) {
        if (!this.controller) return false;
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
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            $('#result').close();
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());
        $('#hint').addEventListener('click', () => this.showHint());

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        // 決めるダイアログを閉じたら、盤面を見る扱いにする（下の「選ぶ」で開き直す）
        $('#decide').addEventListener('close', () => {
            if (this.decideKey) this.dismissedKey = this.decideKey;
            this.decideKey = null;
            if (this.form?.kind === 'major') {
                this.sel = null;
                this.form = null;
                this.render();
                return;
            }
            this.renderActions(this.view);
        });

        $('#board').addEventListener('click', (event) => {
            const tile = event.target.closest('[data-space]');
            if (tile) this.tapSpace(tile.dataset.space);
        });
        $('#farm').addEventListener('click', (event) => {
            const cell = event.target.closest('[data-cell]');
            if (cell) this.tapCell(Number(cell.dataset.cell));
        });
        $('#players').addEventListener('click', (event) => {
            const row = event.target.closest('[data-seat]');
            if (row) this.showPlayer(Number(row.dataset.seat));
        });
        $('#me').addEventListener('click', (event) => {
            if (event.target.closest('[data-act=me]')) this.showPlayer(this.view.you);
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.actionButton(button.dataset.act, button.dataset);
        });
        $('#decide').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.decideButton(button.dataset.act, button.dataset);
        });
    }

    myTurn() {
        const v = this.view;
        return !!v && v.phase === 'work' && !v.pending && v.current === v.you;
    }

    me() {
        return this.view.players[this.view.you];
    }

    // ---- 行動スペースを選ぶ ----

    tapSpace(space) {
        const v = this.view;
        if (!v) return;
        if (this.myTurn() && v.legalSpaces.includes(space)) {
            if (this.sel?.space === space && this.sel.mode === 'simple') {
                this.confirm();
                return;
            }
            music.play('select');
            this.select(space);
            return;
        }
        this.sel = null;
        this.info = this.info === space ? null : space;
        this.render();
    }

    select(space) {
        const kind = SPACES[space].kind;
        const me = this.me();
        this.info = null;
        if (kind === 'major' || kind === 'renoMajor') {
            this.sel = { space, mode: 'major' };
            this.openMajor(space);
            this.render();
            return;
        }
        const modes = {
            plow: { mode: 'plow', cell: null },
            build: { mode: 'build', tool: hasAll(me.res, ROOM_COST[me.farm.house]) ? 'room' : 'stable', rooms: [], stables: [] },
            sowBake: { mode: 'sow', crops: {}, bake: 0 },
            plowSow: { mode: 'plowSow', plow: null, crops: {} },
            fences: { mode: 'fence', current: [], list: [] },
            renoFences: { mode: 'fence', current: [], list: [], reno: true },
            laborer: { mode: 'laborer' }
        };
        this.sel = { space, ...(modes[kind] ?? { mode: 'simple' }) };
        this.render();
    }

    // 試しの農場（選んだ部屋・厩・牧場を入れた形）
    previewFarm() {
        const me = this.me();
        const s = this.sel;
        if (!s) return null;
        if (s.mode === 'build') return { ...me.farm, rooms: [...me.farm.rooms, ...s.rooms], stables: [...me.farm.stables, ...s.stables] };
        if (s.mode === 'fence') {
            const list = s.current.length ? [...s.list, s.current] : s.list;
            const r = addPastures(me.farm, list);
            if (!r.error) return r.farm;
            const fallback = addPastures(me.farm, s.list);
            return fallback.error ? me.farm : fallback.farm;
        }
        if (s.mode === 'plowSow' && s.plow !== null) return { ...me.farm, fields: [...me.farm.fields, { cell: s.plow, crop: null, n: 0 }] };
        return null;
    }

    tapCell(c) {
        const s = this.sel;
        if (!s || !this.myTurn()) {
            if (!this.myTurn()) this.showPlayer(this.view.you);
            return;
        }
        const me = this.me();
        const farm = me.farm;
        if (s.mode === 'plow') {
            if (canPlow(farm, c)) s.cell = s.cell === c ? null : c;
        } else if (s.mode === 'build') {
            if (s.tool === 'room') {
                if (s.rooms.includes(c)) s.rooms = s.rooms.filter(x => x !== c).filter((x, i, list) => canRoom(farm, x, list.slice(0, i)));
                else if (canRoom(farm, c, s.rooms) && !s.stables.includes(c)) s.rooms.push(c);
            } else if (s.stables.includes(c)) {
                s.stables = s.stables.filter(x => x !== c);
            } else if (canStable(farm, c) && !s.rooms.includes(c) && farm.stables.length + s.stables.length < 4) {
                s.stables.push(c);
            }
        } else if (s.mode === 'sow' || s.mode === 'plowSow') {
            const empty = (fieldAt(farm, c) && !fieldAt(farm, c).crop) || (s.mode === 'plowSow' && s.plow === c);
            if (s.mode === 'plowSow' && !empty && canPlow(farm, c)) {
                if (s.plow !== null) delete s.crops[s.plow];
                s.plow = c;
            } else if (empty) {
                this.cycleCrop(c);
            }
        } else if (s.mode === 'fence') {
            if (farm.rooms.includes(c) || fieldAt(farm, c)) return;
            s.current = s.current.includes(c) ? s.current.filter(x => x !== c) : [...s.current, c];
        }
        this.render();
    }

    // まくもの：なし → 穀物 → 野菜 → なし（手元にあるものだけ）
    cycleCrop(c) {
        const s = this.sel;
        const me = this.me();
        const used = (crop) => Object.values(s.crops).filter(x => x === crop).length;
        const order = [undefined, 'grain', 'veg'];
        let i = order.indexOf(s.crops[c]);
        for (let k = 0; k < 3; k++) {
            i = (i + 1) % 3;
            const crop = order[i];
            if (!crop || used(crop) - (s.crops[c] === crop ? 1 : 0) < me.res[crop]) {
                if (crop) s.crops[c] = crop;
                else delete s.crops[c];
                return;
            }
        }
    }

    actionButton(act, data) {
        const s = this.sel;
        if (act === 'decide') {
            this.dismissedKey = null;
            this.render();
            return;
        }
        if (act === 'cancel') {
            this.sel = null;
            this.render();
            return;
        }
        if (!s) return;
        if (act === 'tool') {
            s.tool = data.tool;
        } else if (act === 'bake-minus' || act === 'bake-plus') {
            s.bake = Math.max(0, s.bake + (act === 'bake-plus' ? 1 : -1));
        } else if (act === 'pasture') {
            const r = addPastures(addPastures(this.me().farm, s.list).farm ?? this.me().farm, [s.current]);
            if (r.error) {
                this.toast(r.error);
                return;
            }
            s.list.push(s.current);
            s.current = [];
        } else if (act === 'res') {
            this.sel = null;
            this.send({ type: 'act', space: s.space, res: data.res });
            return;
        } else if (act === 'go') {
            this.confirm();
            return;
        }
        this.render();
    }

    // 選んだ行動を送る
    confirm() {
        const s = this.sel;
        if (!s) return;
        let command = { type: 'act', space: s.space };
        if (s.mode === 'plow') command.cell = s.cell;
        if (s.mode === 'build') command = { ...command, rooms: s.rooms, stables: s.stables };
        if (s.mode === 'sow') command = { ...command, sow: Object.entries(s.crops).map(([cell, crop]) => ({ cell: Number(cell), crop })), bake: s.bake };
        if (s.mode === 'plowSow') command = { ...command, cell: s.plow, sow: Object.entries(s.crops).map(([cell, crop]) => ({ cell: Number(cell), crop })) };
        if (s.mode === 'fence') command.pastures = s.current.length ? [...s.list, s.current] : s.list;
        this.sel = null;
        if (!this.send(command)) this.render();
    }

    // 効果音：前の更新からのできごとを見て、1回の更新に1つだけ鳴らす
    // 自分の手は置いた音（子が生まれたら得た音、物乞いは払った音）、ほかの人の手のあとは自分の番か知らせの音、終局は勝ち・負けの音
    playSounds(v) {
        const fresh = v.events.filter(e => e.seq > this.soundSeq);
        if (!fresh.length) return;
        this.soundSeq = fresh.at(-1).seq;
        const end = fresh.find(e => e.type === 'end');
        if (end) {
            if (!end.winners.includes(v.you)) return music.play('lose');
            return music.play(end.winners.length > 1 ? 'notify' : 'win');
        }
        const others = fresh.some(e => e.seat !== undefined && e.seat !== v.you);
        if (!others && fresh.some(e => e.seat === v.you)) {
            if (fresh.some(e => e.type === 'beg' && e.seat === v.you)) return music.play('pay');
            if (fresh.some(e => e.type === 'born' && e.seat === v.you)) return music.play('gain');
            return music.play('place');
        }
        music.play(this.myTurn() ? 'turn' : 'notify');
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const v = this.controller.getView();
        // 手が進んだときだけ、描き直す前の画面を測って、描いたあとに差を動かす
        const prev = this.view;
        const moved = Boolean(prev) && v.commandCount !== prev.commandCount;
        const before = moved ? this.captureMotion() : null;
        this.view = v;
        $('#hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        if (this.sel && (!this.myTurn() || !v.legalSpaces.includes(this.sel.space))) this.sel = null;
        this.renderStatus(v);
        this.renderPlayers(v);
        this.renderBoard(v);
        this.renderFarm(v);
        this.renderMe(v);
        this.syncDecide(v);
        this.renderActions(v);
        if ($('#log').open) this.renderLog();
        this.playSounds(v);
        if (moved) this.animateMotion(v, before);
        // 結果の画面は、最後の手の動きが終わってから出す
        if (v.phase === 'end' && !$('#result').open && !this.resultTimer) {
            this.resultTimer = Motion.afterIdle(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    // ---- 動き（描き直しの前後の差） ----

    // 描き直す前：行動スペース（置いた人とたまった資源）・各プレイヤーの数・農場のマス
    captureMotion() {
        return {
            spaces: snapshot($('#board'), '.space', SPACE_MOTION),
            amounts: snapshot(document, AMOUNTS, { key: amountKey }),
            farm: snapshot($('#farm'), '[data-cell]', FARM_MOTION)
        };
    }

    // 描いたあと：置いたワーカーはその人の欄から飛ばし、たまった資源・数が変わったら目立たせ、
    // 農場の変わったマスと、新しく出たラウンドのスペースは、はねて出す
    animateMotion(v, before) {
        animateDiff(before.spaces, $('#board'), '.space', {
            ...SPACE_MOTION,
            change: (el, id, old) => {
                const by = v.spaces.find(s => s.id === id)?.by ?? null;
                if (by !== null && !old.value.startsWith('taken')) flyIn(el.querySelector('.tok'), this.playerPanel(v, by));
                else Motion.pulse(el.querySelector('.sp-goods') ?? el, { duration: 380, scale: 1.15 });
            }
        });
        animateDiff(before.amounts, document, AMOUNTS, { key: amountKey });
        animateDiff(before.farm, $('#farm'), '[data-cell]', { ...FARM_MOTION, enter: null, change: el => Motion.popIn(el, { duration: 320 }) });
    }

    playerPanel(v, seat) {
        return seat === v.you ? $('#me .me-row') : $(`#players .pl[data-seat="${seat}"]`);
    }

    renderStatus(v) {
        const next = v.harvestRounds.find(r => r >= v.round);
        const harvest = v.phase === 'end' ? '' : next === v.round ? '収穫' : `収穫まで${next - v.round}`;
        let who = '';
        if (v.phase === 'feed') who = v.feeding.includes(v.you) ? '食事' : '食事を待つ';
        else if (v.phase === 'work') {
            const actor = v.actors[0];
            who = actor === v.you ? 'あなたの番' : `${escapeHtml(v.players[actor].name)}の番`;
        } else who = '終わり';
        $('#status').innerHTML = `<span class="round">R${v.round}</span><span class="harvest">${harvest}</span><span class="who ${v.actors.includes(v.you) ? 'me' : ''}">${who}</span>`;
    }

    renderPlayers(v) {
        const others = v.players.filter(p => p.id !== v.you);
        $('#players').innerHTML = others.map(p => {
            const active = v.actors.includes(p.id) && v.phase !== 'end';
            return `<button type="button" class="pl ${active ? 'active' : ''}" data-seat="${p.id}" style="--c:${COLORS[p.id]}">
                <span class="pl-name">${p.id === v.startPlayer ? '<i class="first" title="スタートプレイヤー"></i>' : ''}${escapeHtml(p.name)}</span>
                <span class="pl-stats">
                    ${amountHtml('person', v.phase === 'work' ? `${p.available}/${p.members}` : p.members, 'people')}
                    ${amountHtml('food', p.food)}
                    ${RES_ORDER.map(r => amountHtml(r, p.res[r], p.res[r] ? '' : 'none')).join('')}
                    ${ANIMALS.map(t => amountHtml(t, p.animals[t], p.animals[t] ? '' : 'none')).join('')}
                    ${p.begging ? amountHtml('beg', p.begging) : ''}
                </span>
            </button>`;
        }).join('');
    }

    renderBoard(v) {
        const legal = this.myTurn() ? v.legalSpaces : [];
        $('#board').innerHTML = v.spaces.map(s => {
            const cls = ['space', s.isRound ? 'round' : '', legal.includes(s.id) ? 'can' : '', this.sel?.space === s.id ? 'sel' : '',
                this.info === s.id ? 'info' : '', s.by !== null ? 'taken' : '', this.hintSpace === s.id && legal.includes(s.id) ? 'recommended' : ''].filter(Boolean).join(' ');
            const token = s.by !== null ? `<span class="tok" style="color:${COLORS[s.by]}">${sym('person')}</span>` : '';
            return `<button type="button" class="${cls}" data-space="${s.id}"><span class="sp-name">${SHORT[s.id]}</span><span class="sp-goods">${SPACES[s.id].take ? Object.entries(SPACES[s.id].take).map(([k, n]) => (n > 1 ? amountHtml(k, n) : sym(k))).join('') : goodsHtml(s.goods)}</span>${token}</button>`;
        }).join('');
    }

    renderFarm(v) {
        const me = v.players[v.you];
        const s = this.myTurn() ? this.sel : null;
        const opts = { color: COLORS[v.you] };
        const farm = me.farm;
        const all = Array.from({ length: CELLS }, (_, c) => c);
        if (s) {
            const preview = this.previewFarm();
            if (preview) opts.farm = preview;
            if (s.mode === 'plow') {
                opts.can = new Set(all.filter(c => canPlow(farm, c)));
                opts.sel = new Set(s.cell === null ? [] : [s.cell]);
                opts.plowed = s.cell;
            } else if (s.mode === 'build') {
                opts.can = new Set(all.filter(c => (s.tool === 'room' ? canRoom(farm, c, s.rooms) : canStable(farm, c) && !s.stables.includes(c)) && !s.rooms.includes(c)));
                opts.sel = new Set([...s.rooms, ...s.stables]);
            } else if (s.mode === 'sow' || s.mode === 'plowSow') {
                opts.can = new Set(all.filter(c => (fieldAt(farm, c) && !fieldAt(farm, c).crop) || (s.mode === 'plowSow' && canPlow(farm, c))));
                opts.crops = s.crops;
                opts.sel = new Set(Object.keys(s.crops).map(Number));
                if (s.mode === 'plowSow') opts.plowed = s.plow;
            } else if (s.mode === 'fence') {
                opts.can = new Set(all.filter(c => !farm.rooms.includes(c) && !fieldAt(farm, c)));
                opts.sel = new Set(s.current);
            }
        }
        $('#farm').classList.toggle('picking', !!opts.can);
        $('#farm').innerHTML = farmHtml(me, opts);
    }

    renderMe(v) {
        const me = v.players[v.you];
        const active = v.actors.includes(v.you) && v.phase !== 'end';
        $('#me').innerHTML = `<button type="button" class="me-row ${active ? 'active' : ''}" data-act="me" style="--c:${COLORS[v.you]}">
            ${v.startPlayer === v.you ? '<i class="first" title="スタートプレイヤー"></i>' : ''}
            ${amountHtml('person', v.phase === 'work' ? `${me.available}/${me.members}` : me.members, 'people')}
            ${amountHtml('food', me.food)}
            ${RES_ORDER.map(r => amountHtml(r, me.res[r], me.res[r] ? '' : 'none')).join('')}
            ${me.begging ? amountHtml('beg', me.begging) : ''}
            <span class="majors">${me.majors.map(id => majorIcon(id)).join('')}</span>
        </button>`;
    }

    spaceDesc(v, id) {
        const s = v.spaces.find(x => x.id === id);
        const goods = s && Object.values(s.goods).some(n => n > 0) ? `（今 ${Object.entries(s.goods).filter(([, n]) => n).map(([k, n]) => `${GOOD_NAME[k]}${n}`).join('・')}）` : '';
        const taken = s?.by !== null && s?.by !== undefined ? `　${v.players[s.by].name}が使用中` : '';
        return `${SPACES[id].name}：${SPACES[id].text}${goods}${taken}`;
    }

    renderActions(v) {
        if (!v) return;
        const el = $('#actions');
        const pendingMine = (v.pending && v.pending.seat === v.you) || (v.phase === 'feed' && v.feeding.includes(v.you));
        if (v.phase === 'end') {
            el.innerHTML = '';
            return;
        }
        if (pendingMine && !$('#decide').open) {
            el.innerHTML = `<span class="desc">${v.pending ? '入りきらない動物がいます' : '収穫の食事'}</span><button class="btn primary" data-act="decide">選ぶ</button>`;
            return;
        }
        const s = this.sel;
        const cancel = '<button class="x" data-act="cancel" aria-label="やめる">×</button>';
        if (s && this.myTurn()) {
            const me = this.me();
            const desc = (text) => `<span class="desc">${text}</span>`;
            if (s.mode === 'simple') {
                el.innerHTML = `${desc(escapeHtml(this.spaceDesc(v, s.space)))}${cancel}<button class="btn primary" data-act="go">置く</button>`;
            } else if (s.mode === 'laborer') {
                el.innerHTML = `${desc('食料1と')}${BUILDING_RES.map(r => `<button class="res-btn" data-act="res" data-res="${r}" aria-label="${GOOD_NAME[r]}">${sym(r)}</button>`).join('')}${cancel}`;
            } else if (s.mode === 'plow') {
                el.innerHTML = `${desc('畑にするマス')}${cancel}<button class="btn primary" data-act="go" ${s.cell === null ? 'disabled' : ''}>耕す</button>`;
            } else if (s.mode === 'build') {
                const cost = { ...Object.fromEntries(Object.entries(ROOM_COST[me.farm.house]).map(([k, n]) => [k, n * s.rooms.length])) };
                cost.wood = (cost.wood ?? 0) + 2 * s.stables.length;
                const ok = (s.rooms.length || s.stables.length) && hasAll(me.res, cost);
                const tool = (t, label) => `<button type="button" role="radio" aria-checked="${s.tool === t}" data-act="tool" data-tool="${t}">${label}</button>`;
                el.innerHTML = `<span class="segmented small">${tool('room', '部屋')}${tool('stable', '厩')}</span>${desc(costHtml(cost) || '　')}${cancel}<button class="btn primary" data-act="go" ${ok ? '' : 'disabled'}>建てる</button>`;
            } else if (s.mode === 'sow' || s.mode === 'plowSow') {
                const n = Object.keys(s.crops).length;
                const canBake = s.mode === 'sow' && bakeFood(me.majors, 1) !== null;
                const grainLeft = me.res.grain - Object.values(s.crops).filter(x => x === 'grain').length;
                if (s.bake > Math.min(grainLeft, maxBake(me.majors))) s.bake = Math.max(0, Math.min(grainLeft, maxBake(me.majors)));
                const food = s.bake ? bakeFood(me.majors, s.bake) : 0;
                const bake = canBake ? `<span class="stepper">${sym('grain')}<button class="step" data-act="bake-minus" ${s.bake ? '' : 'disabled'} aria-label="減らす">−</button><b>${s.bake}</b><button class="step" data-act="bake-plus" ${s.bake < Math.min(grainLeft, maxBake(me.majors)) ? '' : 'disabled'} aria-label="増やす">＋</button></span>` : '';
                const text = s.mode === 'plowSow' ? `${s.plow !== null ? '耕す1・' : ''}まく${n}` : `まく${n}${s.bake ? `・パン→食料${food}` : ''}`;
                const ok = n || s.bake || (s.mode === 'plowSow' && s.plow !== null);
                el.innerHTML = `${desc(text)}${bake}${cancel}<button class="btn primary" data-act="go" ${ok ? '' : 'disabled'}>決める</button>`;
            } else if (s.mode === 'fence') {
                const preview = this.previewFarm();
                const added = fenceCount(preview) - fenceCount(me.farm);
                const reno = s.reno ? renovationCost(me.farm) : null;
                const wood = me.res.wood - (reno?.wood ?? 0);
                const valid = !s.current.length || !addPastures(addPastures(me.farm, s.list).farm ?? me.farm, [s.current]).error;
                const ok = valid && added <= wood && (s.reno || s.list.length || s.current.length);
                const text = `${s.reno ? `${HOUSE_NAME[NEXT_HOUSE[me.farm.house]]}に・` : ''}柵+${added}（残り${MAX_FENCES - fenceCount(preview)}）`;
                el.innerHTML = `${desc(escapeHtml(text))}<button class="btn secondary small" data-act="pasture" ${s.current.length && valid ? '' : 'disabled'}>牧場に</button>${cancel}<button class="btn primary" data-act="go" ${ok ? '' : 'disabled'}>決める</button>`;
            }
            return;
        }
        if (this.info) {
            el.innerHTML = `<span class="desc">${escapeHtml(this.spaceDesc(v, this.info))}</span>`;
            return;
        }
        el.innerHTML = `<span class="desc news">${escapeHtml(v.logs.at(-1) ?? '')}</span>`;
    }

    // ---- ダイアログ（大きな進歩・残す動物・食事） ----

    pendingKey(v) {
        if (v.pending?.seat === v.you) return `keep:${JSON.stringify(v.pending)}`;
        if (v.phase === 'feed' && v.feeding.includes(v.you)) return `feed:${v.round}`;
        return null;
    }

    syncDecide(v) {
        const dialog = $('#decide');
        if (this.form?.kind === 'major') return;
        const key = this.pendingKey(v);
        if (!key) {
            if (dialog.open && this.decideKey) {
                this.decideKey = null;
                dialog.close();
            }
            this.dismissedKey = null;
            return;
        }
        if (key === this.decideKey && dialog.open) return;
        if (key === this.dismissedKey) return;
        this.decideKey = key;
        const suggestion = chooseCommand(v, 'normal');
        if (v.pending) this.form = { kind: 'keep', keep: { ...(suggestion?.animals ?? { sheep: 0, boar: 0, cattle: 0 }) } };
        else this.form = { kind: 'feed', convert: { grain: 0, veg: 0, sheep: 0, boar: 0, cattle: 0, ...(suggestion?.convert ?? {}) }, crafts: new Set(suggestion?.crafts ?? []) };
        this.renderDecide();
        if (!dialog.open) dialog.showModal();
    }

    openMajor(space) {
        this.form = { kind: 'major', space, reno: SPACES[space].kind === 'renoMajor', chosen: null, payWith: null, bake: 0 };
        this.decideKey = null;
        this.renderDecide();
        if (!$('#decide').open) $('#decide').showModal();
    }

    stepRow(name, n, max, { label = GOOD_NAME[name], note = '' } = {}) {
        return `<div class="srow">${sym(name)}<span class="sname">${label}${note ? `<small>${note}</small>` : ''}</span>
            <button class="step" data-act="dec" data-key="${name}" ${n > 0 ? '' : 'disabled'} aria-label="${label}を減らす">−</button>
            <b>${n}</b>
            <button class="step" data-act="inc" data-key="${name}" ${n < max ? '' : 'disabled'} aria-label="${label}を増やす">＋</button></div>`;
    }

    renderDecide() {
        const v = this.view;
        const me = v.players[v.you];
        const f = this.form;
        let title = '';
        let body = '';
        let buttons = '';
        if (f.kind === 'major') {
            const reno = f.reno ? renovationCost(me.farm) : null;
            const res = { ...me.res };
            if (reno) Object.entries(reno).forEach(([k, n]) => { res[k] -= n; });
            title = f.reno ? '改築と大きな進歩' : '大きな進歩';
            const renoLine = reno ? `<p class="note">改築：${costHtml(reno)} → ${HOUSE_NAME[NEXT_HOUSE[me.farm.house]]}</p>` : '';
            if (f.chosen) {
                const max = Math.min(res.grain, maxBake([...me.majors.filter(m => m !== f.payWith), f.chosen]));
                const food = f.bake ? bakeFood([...me.majors, f.chosen], f.bake) : 0;
                body = `${renoLine}<p class="note">${MAJOR[f.chosen].name}を建てて、すぐにパンを焼けます</p>${this.stepRow('grain', f.bake, max, { label: 'パンにする穀物', note: f.bake ? `→ 食料${food}` : '' })}`;
                buttons = '<button class="btn primary" data-act="buy-go">決める</button>';
            } else {
                const fireplace = me.majors.find(m => FIREPLACES.includes(m));
                const rows = MAJORS.filter(m => v.majorsLeft.includes(m.id)).map(m => {
                    const can = hasAll(res, m.cost);
                    const trade = m.upgrade && fireplace ? `<button class="btn secondary small" data-act="buy" data-id="${m.id}" data-pay="${fireplace}">かまどと交換</button>` : '';
                    return `<div class="mrow">${majorIcon(m.id, 'mid')}<div class="minfo"><b>${m.name}</b><span class="mcost">${costHtml(m.cost)}</span><small>${escapeHtml(majorText(m))}</small></div>
                        <span class="mpts">${m.points}点</span><span class="mbtns"><button class="btn primary small" data-act="buy" data-id="${m.id}" ${can ? '' : 'disabled'}>買う</button>${trade}</span></div>`;
                }).join('');
                body = `${renoLine}<div class="mlist">${rows}</div>`;
                buttons = f.reno ? '<button class="btn primary" data-act="reno-only">改築だけ</button><button class="btn secondary" data-act="close">やめる</button>' : '<button class="btn secondary" data-act="close">やめる</button>';
            }
        } else if (f.kind === 'keep') {
            const p = v.pending;
            title = '入りきらない動物';
            const ok = fits(me.farm, f.keep);
            const rates = cookRates(me.majors);
            const food = ANIMALS.reduce((s, t) => s + (p.animals[t] - f.keep[t]) * rates[t], 0);
            body = `<p class="note">残す数を選びます。残さない動物は${rates.sheep ? '食料にします' : '逃がします'}。</p>
                ${ANIMALS.map(t => this.stepRow(t, f.keep[t], p.animals[t], { note: `（${p.animals[t]}）` })).join('')}
                <p class="sum">${ok ? '入ります' : '入りきりません'}${food ? `・食料+${food}` : ''}</p>`;
            buttons = `<button class="btn primary" data-act="keep" ${ok ? '' : 'disabled'}>残す</button>`;
        } else if (f.kind === 'feed') {
            title = '収穫の食事';
            const rates = cookRates(me.majors);
            const own = crafts(me.majors);
            let food = me.food;
            ['grain', 'veg', ...ANIMALS].forEach(k => { food += f.convert[k] * rates[k]; });
            own.forEach(c => { if (f.crafts.has(c.id)) food += c.food; });
            const need = me.foodNeed;
            const beg = Math.max(0, need - food);
            const rows = ['grain', 'veg', ...ANIMALS].filter(k => rates[k] > 0 && (ANIMALS.includes(k) ? me.animals[k] : me.res[k]) > 0)
                .map(k => this.stepRow(k, f.convert[k], ANIMALS.includes(k) ? me.animals[k] : me.res[k], { note: `→${rates[k]}（${ANIMALS.includes(k) ? me.animals[k] : me.res[k]}）` })).join('');
            const craftRows = own.filter(c => me.res[c.res] > 0).map(c => `<button class="toggle ${f.crafts.has(c.id) ? 'on' : ''}" data-act="craft" data-id="${c.id}" aria-pressed="${f.crafts.has(c.id)}">${majorIcon(c.id)}${GOOD_NAME[c.res]}1 → 食料${c.food}</button>`).join('');
            body = `<p class="note">家族の食事に食料${need}（いま${me.food}）。食料にするもの：</p>${rows}${craftRows ? `<div class="crafts">${craftRows}</div>` : ''}
                <p class="sum">食料 <b>${food}</b> / ${need}${beg ? `　物乞いカード${beg}枚` : ''}</p>`;
            buttons = '<button class="btn primary" data-act="feed">食べさせる</button>';
        }
        $('#decide-title').textContent = title;
        $('#decide-body').innerHTML = body;
        $('#decide-buttons').innerHTML = buttons;
    }

    decideButton(act, data) {
        const f = this.form;
        const v = this.view;
        const me = v.players[v.you];
        if (act === 'inc' || act === 'dec') {
            const d = act === 'inc' ? 1 : -1;
            if (f.kind === 'major') f.bake += d;
            else if (f.kind === 'keep') f.keep[data.key] += d;
            else f.convert[data.key] += d;
            this.renderDecide();
            return;
        }
        if (act === 'craft') {
            if (f.crafts.has(data.id)) f.crafts.delete(data.id);
            else f.crafts.add(data.id);
            this.renderDecide();
            return;
        }
        if (act === 'close') {
            $('#decide').close();
            return;
        }
        if (act === 'buy') {
            f.chosen = data.id;
            f.payWith = data.pay ?? null;
            const reno = f.reno ? renovationCost(me.farm) : {};
            const grain = me.res.grain - (reno.grain ?? 0);
            if (MAJOR[f.chosen].oven && grain > 0) {
                this.renderDecide();
                return;
            }
            act = 'buy-go';
        }
        let command = null;
        if (act === 'buy-go') command = { type: 'act', space: f.space, major: f.chosen, payWith: f.payWith, bake: f.bake };
        if (act === 'reno-only') command = { type: 'act', space: f.space };
        if (act === 'keep') command = { type: 'keep', animals: { ...f.keep } };
        if (act === 'feed') command = { type: 'feed', convert: { ...f.convert }, crafts: [...f.crafts] };
        if (!command) return;
        this.decideKey = null;
        this.dismissedKey = null;
        this.form = null;
        this.sel = null;
        if ($('#decide').open) $('#decide').close();
        this.send(command);
        this.render();
    }

    // ---- 人の農場・記録・終わり ----

    showPlayer(seat) {
        const v = this.view;
        if (!v) return;
        const p = v.players[seat];
        const s = p.final ?? scoreBreakdown(p);
        const rows = Object.entries(SCORE_LABELS).map(([k, label]) => `<span>${label}<b>${s[k]}</b></span>`).join('');
        $('#player-title').textContent = seat === v.you ? 'あなたの農場' : `${p.name}の農場`;
        $('#player-body').innerHTML = `
            <div class="farm small">${farmHtml(p, { color: COLORS[seat] })}</div>
            <p class="pstats">${amountHtml('person', p.members)}${amountHtml('food', p.food)}${RES_ORDER.map(r => amountHtml(r, p.res[r])).join('')}${ANIMALS.map(t => amountHtml(t, p.animals[t])).join('')}</p>
            <p class="note">${HOUSE_NAME[p.farm.house]}・柵${fenceCount(p.farm)}本${p.majors.length ? '・' : ''}${p.majors.map(id => MAJOR[id].name).join('・')}</p>
            <div class="score-grid">${rows}<span class="total">${v.phase === 'end' ? '得点' : 'いま終わると'}<b>${s.total}</b></span></div>`;
        $('#player').showModal();
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !view || !(view.phase === 'end')) return;
        const id = `${GAME}-${controller.game.options.seed}`;
        if (this.recordedId === id) return;
        this.recordedId = id;
        recordResult({ game: GAME, id, outcome: outcomeFromWinners(view.winners, view.you, view.players.length) });
    }

    showResult() {
        this.recordLocalResult(this.view);
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        const names = v.winners.map(id => v.players[id].name);
        $('#result-title').textContent = v.players.length === 1 ? `${v.players[0].final.total}点`
            : v.winners.includes(v.you) ? (v.winners.length > 1 ? '同点で勝ち' : 'あなたの勝ち') : `${names.join('と')}の勝ち`;
        const ps = v.players;
        $('#result-table').innerHTML = `<table><thead><tr><th></th>${ps.map(p => `<th class="${v.winners.includes(p.id) ? 'win' : ''}"><i class="dot" style="--c:${COLORS[p.id]}"></i>${escapeHtml(p.name)}</th>`).join('')}</tr></thead><tbody>
            ${Object.entries(SCORE_LABELS).map(([k, label]) => `<tr><th>${label}</th>${ps.map(p => `<td>${p.final[k]}</td>`).join('')}</tr>`).join('')}
            <tr class="total"><th>計</th>${ps.map(p => `<td class="${v.winners.includes(p.id) ? 'win' : ''}">${p.final.total}</td>`).join('')}</tr>
        </tbody></table>`;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    showLog() {
        if (!this.view) return;
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    // ヒント：CPU（ふつう）が自分の番に選ぶ場所に印を付ける。CPU はこのビュー（自分に見えるもの）だけで決める
    showHint() {
        const v = this.view;
        if (!v || !this.myTurn()) return this.toast('自分の番になったら、おすすめを出せます');
        const command = suggest(v);
        if (command?.type !== 'act') return this.toast('おすすめの内容を、最初から選んであります');
        this.hintSpace = command.space;
        this.render();
        this.toast(`おすすめ：「${SHORT[command.space]}」に置く`);
    }

    renderLog() {
        $('#log-list').innerHTML = this.view.logs.slice(-200).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}

function majorText(m) {
    if (m.cook) return `調理：野菜${m.cook.veg}・羊${m.cook.sheep}・猪${m.cook.boar}・牛${m.cook.cattle}、パン${m.bake.food}`;
    if (m.oven) return `パン：穀物${m.bake.max}つまで、1つ食料${m.bake.food}`;
    if (m.craft) return `収穫に${GOOD_NAME[m.craft.res]}1→食料${m.craft.food}。終わりに${GOOD_NAME[m.bonus.res]}${m.bonus.steps.join('/')}で1/2/3点`;
    if (m.well) return '次の5ラウンド、食料1ずつ';
    return '';
}
