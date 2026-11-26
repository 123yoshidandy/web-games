/**
 * 画面（タイトル・ゲーム・決めるダイアログ・カード・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import {
    CIV_CARDS, BUILDINGS, RESOURCES, RESOURCE_NAME, GATHER, RESOURCE_SPOTS, VILLAGE, PLACE_NAME,
    DIE_REWARD, MULTIPLIERS, MULTIPLIER_NAME, MULTIPLIER_BASE, resourceCount, buildingPoints
} from './cards.js';
import LocalGameController, { loadSavedGame, clearSavedGame, CPU_DELAY_MS } from './game-controller.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { MIN_PLAYERS as ONLINE_MIN, MAX_PLAYERS as ONLINE_MAX } from './game.js';
import { CPU_LEVELS, bestBuildingPay } from './cpu-player.js';
import { finalBonus, multiplierCounts, multiplierBase } from './scoring.js';
import { symbolsSvg, sym, civCardHtml, buildingFaceHtml, buildingText, cardText, dieHtml, amountHtml } from './art.js';
import { helpHtml, titleArtHtml } from './help.js';
import { music } from './music.js';

const SETTINGS_KEY = 'stone-age.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
export const COLORS = ['#d9473b', '#3d7dd8', '#3c9f4b', '#e2b72a'];
const RESULT_DELAY_MS = 900;
const AUTO_DELAY_MS = 600;
const PHASE_NAME = { place: '人を置く', action: '行動', feed: '食べさせる', end: '終わり' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const zero = () => ({ wood: 0, clay: 0, stone: 0, gold: 0 });

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return {
            count: [2, 3, 4].includes(saved.count) ? saved.count : 3,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy'
        };
    } catch {
        return { count: 3, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

// 道具の初めの選び方：道具のタイルだけで得る数が一番多くなる、いちばん少ない足し方（1回だけの道具は選ばない）
function defaultTools(pending, me) {
    const tiles = me.tools.map((v, i) => ({ i, v })).filter(t => !me.toolsUsed[t.i]);
    let best = { units: Math.floor(pending.sum / pending.divisor), added: 0, use: [] };
    for (let mask = 1; mask < 1 << tiles.length; mask++) {
        const use = tiles.filter((_, b) => mask & (1 << b));
        const added = use.reduce((s, t) => s + t.v, 0);
        const units = Math.floor((pending.sum + added) / pending.divisor);
        if (units > best.units || (units === best.units && units > Math.floor(pending.sum / pending.divisor) && added < best.added)) {
            best = { units, added, use: use.map(t => t.i) };
        }
    }
    return best.use;
}

// 安い資源から n 個
function cheapest(res, n) {
    const pay = zero();
    let left = n;
    RESOURCES.forEach(r => {
        const k = Math.min(res[r], left);
        pay[r] = k;
        left -= k;
    });
    return pay;
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.sel = null;            // 置く段階で選んだ場所 { place, count }
        this.info = null;           // 説明を見ている場所
        this.form = null;           // 決めるダイアログの中身
        this.decideKey = null;      // 開いている（開いた）決めごとの印
        this.dismissedKey = null;   // 盤面を見るために閉じた決めごと
        this.resultTimer = null;
        this.autoTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        $('#title-art').innerHTML = titleArtHtml();
        $('#help-body').innerHTML = helpHtml();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'ストーンエイジ',
            game: 'stone-age',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: CPU_DELAY_MS,
            minPlayers: ONLINE_MIN,
            maxPlayers: ONLINE_MAX,
            settings: [],
            onStart: (controller) => this.beginGame(controller),
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => {
                this.controller = null;
                this.showTitle();
            }
        });
        this.bindStatic();
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
                onUpdate: () => this.render(),
                onError: (message) => {
                    music.play('error');
                    this.toast(message);
                }
            });
        } catch (error) {
            // 保存が壊れていたら消して、タイトルに戻る
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.beginGame(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    beginGame(controller) {
        if (this.controller !== controller) this.stopGame();
        else document.querySelectorAll('dialog[open]').forEach(d => d.close());
        this.controller = controller;
        this.hintCommand = null;
        // ヒント（と待った）はローカル対戦だけ
        document.querySelectorAll('#hint, #undo').forEach(el => { el.hidden = Boolean(controller.isOnline); });
        this.view = null;
        this.lastSeq = null;
        this.sel = null;
        this.info = null;
        this.decideKey = null;
        this.dismissedKey = null;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        if (!this.controller.isOnline) this.controller.scheduleCpu();
    }

    // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
    goHome() {
        if (this.controller?.isOnline) return this.online.confirmLeave();
        this.showTitle();
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
        this.hintCommand = null;
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
            document.querySelectorAll('dialog[open]').forEach(d => d.close());
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('#home').addEventListener('click', () => this.goHome());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#hint').addEventListener('click', () => this.showHint());
        $('#open-log').addEventListener('click', () => this.showLog());

        // ダイアログは外側のタップと「閉じる」で閉じる（終わりの画面は、外側では閉じない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        // 決めるダイアログを閉じたら、盤面を見る扱いにする（選択は消さない。下の「選ぶ」で開き直す）
        $('#decide').addEventListener('close', () => {
            if (this.decideKey) this.dismissedKey = this.decideKey;
            this.decideKey = null;
            this.renderActions(this.view);
        });

        $('#board').addEventListener('click', (event) => {
            const tile = event.target.closest('[data-place]');
            if (tile) this.tapPlace(tile.dataset.place);
        });
        $('#players').addEventListener('click', (event) => {
            const row = event.target.closest('[data-seat]');
            if (row) this.showCards(Number(row.dataset.seat));
        });
        $('#me').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button) return;
            if (button.dataset.act === 'cards') this.showCards(this.view.you);
            if (button.dataset.act === 'choice2') this.openChoice2();
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.actionButton(button.dataset.act);
        });
        $('#decide').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            this.decideButton(button.dataset.act, button.dataset);
        });
    }

    // ---- 入力 ----

    myTurn() {
        const v = this.view;
        return !!v && v.actors.includes(v.you) && !v.pending;
    }

    tapPlace(place) {
        const v = this.view;
        if (!v) return;
        if (v.phase === 'place' && this.myTurn()) {
            const counts = v.placements.filter(p => p.place === place).map(p => p.count);
            if (counts.length) {
                const onlyGather = v.placements.every(p => GATHER[p.place]);
                const count = this.sel?.place === place ? this.sel.count : (onlyGather ? Math.max(...counts) : Math.min(...counts));
                this.sel = { place, count };
                this.info = null;
                this.render();
                return;
            }
        }
        if (v.phase === 'action' && this.myTurn() && v.resolvable.includes(place)) {
            if (this.sel?.place === place) {
                this.resolve(place);
                return;
            }
            this.sel = { place, count: v.placed[v.you][place] };
            this.info = null;
            music.play('select');
            this.render();
            return;
        }
        this.sel = null;
        this.info = this.info === place ? null : place;
        this.render();
    }

    actionButton(act) {
        const v = this.view;
        if (act === 'minus' || act === 'plus') {
            const counts = v.placements.filter(p => p.place === this.sel?.place).map(p => p.count);
            const next = this.sel.count + (act === 'minus' ? -1 : 1);
            if (counts.includes(next)) this.sel.count = next;
            music.play(counts.includes(next) ? 'select' : 'error');
            this.renderActions(v);
        } else if (act === 'place' && this.sel) {
            const { place, count } = this.sel;
            this.sel = null;
            this.send({ type: 'place', place, count });
        } else if (act === 'resolve' && this.sel) {
            this.resolve(this.sel.place);
        } else if (act === 'decide') {
            this.dismissedKey = null;
            this.render();
        } else if (act === 'choice2') {
            this.openChoice2();
        }
    }

    resolve(place) {
        clearTimeout(this.autoTimer);
        this.sel = null;
        this.send({ type: 'resolve', place });
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    // ---- ゲーム画面 ----

    // 新しい出来事から効果音を1つ鳴らす。自分の手はその音、ラウンドの始まりは notify、自分の番に戻ったら turn、終わりは勝ち負け
    // CPU は1手ずつ速く打つので、CPU の手ごとには鳴らさない
    playSound(v, prev, fresh) {
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(v.you) ? 'win' : 'lose');
        const mine = fresh.filter(e => e.seat === v.you).map(e => e.type);
        if (mine.includes('roll') || mine.includes('diceAll')) return music.play('dice');
        if (mine.includes('starve')) return music.play('pay');
        if (['gain', 'civ', 'building', 'pickDie', 'choice2'].some(t => mine.includes(t))) return music.play('gain');
        if (mine.includes('place')) return music.play('place');
        if (fresh.some(e => e.type === 'round')) return music.play('notify');
        if (v.actors.includes(v.you) && !prev.actors.includes(prev.you)) music.play('turn');
    }

    render() {
        if (!this.controller) return;
        const v = this.controller.getView();
        const prev = this.view;
        this.view = v;
        // 始めた時点までの出来事は鳴らさない
        const lastSeq = this.lastSeq;
        this.lastSeq = v.events.at(-1)?.seq ?? 0;
        if (lastSeq !== null && prev) this.playSound(v, prev, v.events.filter(e => e.seq > lastSeq));
        // 選んだ場所が、もう使えなくなっていたら消す
        if (this.sel) {
            const ok = v.phase === 'place' ? v.placements.some(p => p.place === this.sel.place) : v.resolvable.includes(this.sel.place);
            if (!ok || !this.myTurn()) this.sel = null;
        }
        this.renderStatus(v);
        this.renderPlayers(v);
        this.renderBoard(v);
        this.renderMe(v);
        this.syncDecide(v);
        this.renderActions(v);
        if (!this.myTurn()) this.hintCommand = null;
        this.markHint();
        if ($('#log').open) this.renderLog();
        this.scheduleAuto(v);
        if (v.phase === 'end' && !$('#result').open && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    // 使える場所が1つだけなら、少し間を置いて自動で使う
    scheduleAuto(v) {
        clearTimeout(this.autoTimer);
        if (v.phase !== 'action' || !this.myTurn() || v.resolvable.length !== 1) return;
        const place = v.resolvable[0];
        this.autoTimer = setTimeout(() => {
            const now = this.controller?.getView();
            if (now && now.phase === 'action' && now.resolvable.length === 1 && now.resolvable[0] === place && now.actors.includes(now.you) && !now.pending) {
                this.resolve(place);
            }
        }, AUTO_DELAY_MS);
    }

    renderStatus(v) {
        const actor = v.actors[0];
        let who = '';
        if (v.phase !== 'end' && actor !== undefined) {
            who = actor === v.you ? 'あなたの番' : `${escapeHtml(v.players[actor].name)}の番`;
            if (v.pending?.kind === 'dice') who = actor === v.you ? 'サイコロを選ぶ' : `${escapeHtml(v.players[actor].name)}がサイコロを選ぶ`;
        }
        $('#status').innerHTML = `<span class="round">R${v.round}</span><span class="phase">${PHASE_NAME[v.phase]}</span><span class="who ${actor === v.you ? 'me' : ''}">${who}</span>`;
    }

    renderPlayers(v) {
        const others = v.players.filter(p => p.id !== v.you);
        $('#players').innerHTML = others.map(p => {
            const active = v.actors.includes(p.id) && v.phase !== 'end';
            const tools = p.tools.reduce((s, t) => s + t, 0);
            const cards = p.cards.length + p.hiddenCount;
            return `<button type="button" class="pl ${active ? 'active' : ''}" data-seat="${p.id}" style="--c:${COLORS[p.id]}">
                <span class="pl-name">${p.id === v.startPlayer ? '<i class="first" title="最初の番"></i>' : ''}${escapeHtml(p.name)}</span>
                <span class="pl-score">${sym('star')}<b>${p.score}</b></span>
                <span class="pl-stats">
                    ${amountHtml('person', v.phase === 'place' ? `${p.available}/${p.people}` : p.people, 'people')}
                    ${amountHtml('food', p.food)}${amountHtml('agri', p.agri)}${amountHtml('tool', tools)}
                    ${RESOURCES.map(r => amountHtml(r, p.res[r], p.res[r] ? '' : 'none')).join('')}
                    ${amountHtml('card', cards)}
                </span>
            </button>`;
        }).join('');
    }

    tokensHtml(v, place) {
        return v.placed.map((m, seat) => (m[place]
            ? `<span class="tok" style="--c:${COLORS[seat]}">${sym('person')}${m[place] > 1 ? `<b>${m[place]}</b>` : ''}</span>`
            : '')).join('');
    }

    placeClass(v, place) {
        const cls = [];
        if (v.phase === 'place' && this.myTurn() && v.placements.some(p => p.place === place)) cls.push('can');
        if (v.phase === 'action' && this.myTurn() && v.resolvable.includes(place)) cls.push('ready');
        if (this.sel?.place === place) cls.push('sel');
        if (this.info === place) cls.push('info');
        return cls.join(' ');
    }

    renderBoard(v) {
        const gather = ['hunt', ...RESOURCE_SPOTS].map(place => {
            const g = GATHER[place];
            return `<button type="button" class="tile gather ${this.placeClass(v, place)}" data-place="${place}">
                <span class="tile-head">${sym(g.resource, 'big')}<span class="div">÷${g.divisor}</span></span>
                <span class="tile-name">${PLACE_NAME[place]}</span>
                <span class="toks">${this.tokensHtml(v, place)}</span></button>`;
        }).join('');
        const villageIcon = { field: 'agri', toolmaker: 'tool', hut: 'hut' };
        const village = VILLAGE.map(place => `<button type="button" class="tile village ${this.placeClass(v, place)}" data-place="${place}">
                ${sym(villageIcon[place], 'mid')}<span class="tile-name">${PLACE_NAME[place]}</span>
                <span class="toks">${this.tokensHtml(v, place)}</span></button>`).join('');
        const deck = `<div class="tile deck" aria-label="文明カードの山">${sym('card', 'mid')}<span class="tile-name">${v.civDeckCount}枚</span></div>`;
        // 文明カードは、費用4（左）から費用1（右）の順に並べる（盤面と同じ）
        const civs = [3, 2, 1, 0].map(slot => {
            const place = `civ${slot}`;
            const id = v.civSlots[slot];
            const inner = id === null ? `<div class="civ empty"><span class="cost">${'<i></i>'.repeat(slot + 1)}</span></div>` : civCardHtml(id, { cost: slot + 1 });
            return `<button type="button" class="slot ${this.placeClass(v, place)}" data-place="${place}">${inner}<span class="toks">${this.tokensHtml(v, place)}</span></button>`;
        }).join('');
        const blds = v.stacks.map((stack, k) => {
            const place = `bld${k}`;
            const face = stack.top === null ? '<span class="empty-stack">空</span>' : buildingFaceHtml(stack.top);
            return `<button type="button" class="bld ${this.placeClass(v, place)}" data-place="${place}">
                <span class="bld-face">${face}</span><span class="left">${stack.count}</span>
                <span class="toks">${this.tokensHtml(v, place)}</span></button>`;
        }).join('');
        $('#board').innerHTML = `<div class="row r-gather">${gather}</div>
            <div class="row r-village">${village}${deck}</div>
            <div class="row r-civ">${civs}</div>
            <div class="row r-bld" style="--n:${v.stacks.length}">${blds}</div>`;
    }

    renderMe(v) {
        const me = v.players[v.you];
        const tools = me.tools.length
            ? me.tools.map((t, i) => `<span class="tooltile ${me.toolsUsed[i] ? 'used' : ''}">${t}</span>`).join('')
            : '<span class="tooltile none">0</span>';
        const oneUse = me.oneUse.map(id => `<span class="tooltile once" title="1回だけの道具">${CIV_CARDS[id].top.n}</span>`).join('');
        const canChoice = me.choice2.length && v.actors.includes(v.you) && v.phase !== 'place' && v.phase !== 'end';
        const choice = me.choice2.length
            ? `<button type="button" class="chip" data-act="choice2" ${canChoice ? '' : 'disabled'} aria-label="好きな資源2つ">${sym('any')}<b>2</b></button>` : '';
        const active = v.actors.includes(v.you) && v.phase !== 'end';
        $('#me').innerHTML = `<div class="me-row ${active ? 'active' : ''}" style="--c:${COLORS[v.you]}">
                <span class="pl-score">${sym('star')}<b>${me.score}</b></span>
                ${amountHtml('person', v.phase === 'place' ? `${me.available}/${me.people}` : me.people, 'people')}
                ${amountHtml('food', me.food)}${amountHtml('agri', me.agri)}
                <span class="tools">${sym('tool')}${tools}${oneUse}</span>
                ${v.startPlayer === v.you ? '<i class="first" title="最初の番"></i>' : ''}
            </div>
            <div class="me-row">
                ${RESOURCES.map(r => amountHtml(r, me.res[r], me.res[r] ? '' : 'none')).join('')}
                ${choice}
                <button type="button" class="chip cards-btn" data-act="cards" aria-label="取ったカード">${sym('card')}<b>${me.cards.length}</b>${sym('hut')}<b>${me.buildings.length}</b></button>
            </div>`;
    }

    placeDesc(v, place) {
        if (place === 'hunt') return '狩り場：サイコロの合計÷2の食料';
        if (GATHER[place]) {
            const left = GATHER[place].cap - v.placed.reduce((s, m) => s + (m[place] ?? 0), 0);
            return `${PLACE_NAME[place]}：合計÷${GATHER[place].divisor}の${RESOURCE_NAME[GATHER[place].resource]}${v.phase === 'place' ? `（あと${left}人）` : ''}`;
        }
        if (place === 'field') return '畑：1段上げる（毎ラウンド食料+1）';
        if (place === 'toolmaker') return '道具作り：道具が1つ増える（4つ目からは上がる）';
        if (place === 'hut') return '小屋：2人で入り、人が1人増える';
        if (place.startsWith('civ')) {
            const slot = Number(place.slice(3));
            const id = v.civSlots[slot];
            return id === null ? '文明カード：なし' : `資源${slot + 1}つ：${cardText(id)}`;
        }
        const stack = v.stacks[Number(place.slice(3))];
        return stack?.top === null || !stack ? '建物：山は空' : `建物：${buildingText(stack.top)}（残り${stack.count}）`;
    }

    renderActions(v) {
        if (!v) return;
        const el = $('#actions');
        const myPending = v.pending && v.pending.seat === v.you;
        if (v.phase === 'end') {
            el.innerHTML = '';
            return;
        }
        if (myPending && !$('#decide').open) {
            el.innerHTML = `<span class="desc">${escapeHtml(this.pendingTitle(v))}</span><button class="btn primary" data-act="decide">選ぶ</button>`;
            return;
        }
        if (this.sel && this.myTurn()) {
            const desc = escapeHtml(this.placeDesc(v, this.sel.place));
            if (v.phase === 'place') {
                const counts = v.placements.filter(p => p.place === this.sel.place).map(p => p.count);
                const stepper = counts.length > 1
                    ? `<span class="stepper"><button class="step" data-act="minus" ${this.sel.count <= Math.min(...counts) ? 'disabled' : ''} aria-label="減らす">−</button><b>${this.sel.count}人</b><button class="step" data-act="plus" ${this.sel.count >= Math.max(...counts) ? 'disabled' : ''} aria-label="増やす">＋</button></span>`
                    : `<b class="fixed-count">${this.sel.count}人</b>`;
                el.innerHTML = `<span class="desc">${desc}</span>${stepper}<button class="btn primary" data-act="place">置く</button>`;
            } else {
                const place = this.sel.place;
                const label = GATHER[place] ? '振る' : place.startsWith('civ') ? '取る' : place.startsWith('bld') ? '建てる' : '使う';
                el.innerHTML = `<span class="desc">${desc}</span><button class="btn primary" data-act="resolve">${label}</button>`;
            }
            return;
        }
        if (this.info) {
            el.innerHTML = `<span class="desc">${escapeHtml(this.placeDesc(v, this.info))}</span>`;
            return;
        }
        // 何も選んでいなければ、最新の記録を1行出す
        el.innerHTML = `<span class="desc news">${escapeHtml(v.logs.at(-1) ?? '')}</span>`;
    }

    // ---- 決める ----

    pendingKey(v) {
        return v.pending && v.pending.seat === v.you ? JSON.stringify(v.pending) : null;
    }

    pendingTitle(v) {
        const kind = v.pending?.kind;
        return { tools: '道具を使う？', civ: '文明カードを取る？', building: '建物を建てる？', dice: 'サイコロを1つ選ぶ', feed: '食料が足りない' }[kind] ?? '';
    }

    // 自分の決めごとがあれば、ダイアログを開く（閉じて盤面を見ている間は開かない）
    syncDecide(v) {
        const key = this.pendingKey(v);
        const dialog = $('#decide');
        if (this.form?.kind === 'choice2' && dialog.open) return;
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
        this.form = this.makeForm(v);
        this.renderDecide();
        if (!dialog.open) dialog.showModal();
    }

    makeForm(v) {
        const p = v.pending;
        const me = v.players[v.you];
        if (p.kind === 'tools') return { kind: 'tools', tools: new Set(defaultTools(p, me)), oneUse: new Set() };
        if (p.kind === 'civ') return { kind: 'civ', pay: cheapest(me.res, Math.min(p.cost, resourceCount(me.res))) };
        if (p.kind === 'building') {
            const b = BUILDINGS[v.stacks[p.stack].top];
            return { kind: 'building', pay: bestBuildingPay(b, me.res) ?? (b.kind === 'fixed' ? zero() : cheapest(me.res, Math.min(b.kind === 'count' ? b.n : 1, resourceCount(me.res)))) };
        }
        if (p.kind === 'feed') return { kind: 'feed', pay: cheapest(me.res, Math.min(p.short, resourceCount(me.res))) };
        return { kind: p.kind };
    }

    openChoice2() {
        const v = this.view;
        const me = v.players[v.you];
        if (!me.choice2.length || !v.actors.includes(v.you) || v.phase === 'place') return;
        this.form = { kind: 'choice2', take: zero() };
        this.decideKey = null;
        this.renderDecide();
        if (!$('#decide').open) $('#decide').showModal();
    }

    stepperRows(amounts, { have = null, max = null } = {}) {
        return `<div class="steppers">${RESOURCES.map(r => {
            const n = amounts[r];
            const limit = have ? have[r] : Infinity;
            const total = resourceCount(amounts);
            const plusOk = n < limit && (max === null || total < max);
            return `<div class="srow">${sym(r)}<span class="sname">${RESOURCE_NAME[r]}${have ? `<small>（${have[r]}）</small>` : ''}</span>
                <button class="step" data-act="dec" data-res="${r}" ${n > 0 ? '' : 'disabled'} aria-label="${RESOURCE_NAME[r]}を減らす">−</button>
                <b>${n}</b>
                <button class="step" data-act="inc" data-res="${r}" ${plusOk ? '' : 'disabled'} aria-label="${RESOURCE_NAME[r]}を増やす">＋</button></div>`;
        }).join('')}</div>`;
    }

    renderDecide() {
        const v = this.view;
        const me = v.players[v.you];
        const f = this.form;
        const p = v.pending;
        const choiceButton = me.choice2.length ? '<button class="btn secondary" data-act="open-choice2">資源2つ</button>' : '';
        let title = this.pendingTitle(v);
        let body = '';
        let buttons = '';
        if (f.kind === 'choice2') {
            title = '好きな資源2つ';
            body = `<p class="note">資源を2つ選んで受け取ります。</p>${this.stepperRows(f.take, { max: 2 })}`;
            buttons = `<button class="btn primary" data-act="take2" ${resourceCount(f.take) === 2 ? '' : 'disabled'}>受け取る</button>
                <button class="btn secondary" data-act="back">戻る</button>`;
        } else if (f.kind === 'tools') {
            const added = [...f.tools].reduce((s, i) => s + me.tools[i], 0) + [...f.oneUse].reduce((s, id) => s + CIV_CARDS[id].top.n, 0);
            const total = p.sum + added;
            const tiles = me.tools.map((t, i) => (me.toolsUsed[i] ? '' : `<button class="tooltile big ${f.tools.has(i) ? 'on' : ''}" data-act="tile" data-i="${i}" aria-pressed="${f.tools.has(i)}">${t}</button>`)).join('');
            const cards = me.oneUse.map(id => `<button class="tooltile big once ${f.oneUse.has(id) ? 'on' : ''}" data-act="once" data-id="${id}" aria-pressed="${f.oneUse.has(id)}">${CIV_CARDS[id].top.n}</button>`).join('');
            body = `<div class="dice-row">${p.dice.map(d => dieHtml(d)).join('')}</div>
                <div class="tools-row">${sym('tool')}${tiles}${cards}</div>
                <p class="sum">${p.sum}${added ? ` + ${added}` : ''} = <b>${total}</b>　÷${p.divisor}　→ ${amountHtml(p.resource, Math.floor(total / p.divisor), 'gain')}</p>`;
            buttons = '<button class="btn primary" data-act="tools">受け取る</button>';
        } else if (f.kind === 'civ') {
            const id = v.civSlots[p.slot];
            const n = resourceCount(f.pay);
            body = `<div class="decide-card">${civCardHtml(id, { cost: p.cost, cls: 'large' })}<p>${escapeHtml(cardText(id))}</p></div>
                <p class="note">資源を${p.cost}つ払う（${n}/${p.cost}）</p>${this.stepperRows(f.pay, { have: me.res, max: p.cost })}`;
            buttons = `<button class="btn primary" data-act="pay" ${n === p.cost ? '' : 'disabled'}>取る</button>${choiceButton}<button class="btn secondary" data-act="decline">取らない</button>`;
        } else if (f.kind === 'building') {
            const id = v.stacks[p.stack].top;
            const b = BUILDINGS[id];
            const points = buildingPoints(b, f.pay);
            const steppers = b.kind === 'fixed' ? '' : this.stepperRows(f.pay, { have: me.res, max: b.kind === 'count' ? b.n : b.max });
            body = `<div class="decide-card"><div class="bld large"><span class="bld-face">${buildingFaceHtml(id)}</span></div><p>${escapeHtml(buildingText(id))}</p></div>
                ${steppers}<p class="sum">${points === null ? (b.kind === 'fixed' ? '資源が足りません' : '払い方が合っていません') : `<b>${points}</b>点`}</p>`;
            buttons = `<button class="btn primary" data-act="pay" ${points === null ? 'disabled' : ''}>建てる</button>${choiceButton}<button class="btn secondary" data-act="decline">建てない</button>`;
        } else if (f.kind === 'dice') {
            body = `<p class="note">${p.seat === p.buyer ? '振った目から1つを取ります。残りは次の人へ。' : `${escapeHtml(v.players[p.buyer].name)}が振った目から1つを取ります。`}</p>
                <div class="pick-dice">${p.dice.map((d, i) => `<button class="pick" data-act="pick" data-i="${i}">${dieHtml(d)}${sym(DIE_REWARD[d], 'mid')}</button>`).join('')}</div>`;
        } else if (f.kind === 'feed') {
            const n = resourceCount(f.pay);
            body = `<p class="note">あと${p.short}つ足りない。資源で払うか −10点</p>${this.stepperRows(f.pay, { have: me.res, max: p.short })}`;
            buttons = `<button class="btn primary" data-act="feed" ${n === p.short ? '' : 'disabled'}>払う</button>${choiceButton}<button class="btn secondary" data-act="starve">−10点</button>`;
        }
        $('#decide-title').textContent = title;
        $('#decide-body').innerHTML = body;
        $('#decide-buttons').innerHTML = buttons;
    }

    decideButton(act, data) {
        const f = this.form;
        const target = f.kind === 'choice2' ? f.take : f.pay;
        if (act === 'inc' || act === 'dec') {
            target[data.res] += act === 'inc' ? 1 : -1;
            this.renderDecide();
            return;
        }
        if (act === 'tile' || act === 'once') {
            const set = act === 'tile' ? f.tools : f.oneUse;
            const key = Number(act === 'tile' ? data.i : data.id);
            if (set.has(key)) set.delete(key);
            else set.add(key);
            this.renderDecide();
            return;
        }
        if (act === 'open-choice2') {
            this.openChoice2();
            return;
        }
        if (act === 'back') {
            this.closeDecide();
            return;
        }
        let command = null;
        if (act === 'tools') command = { type: 'tools', tools: [...f.tools], oneUse: [...f.oneUse] };
        if (act === 'pay') command = { type: 'pay', pay: { ...f.pay } };
        if (act === 'decline') command = { type: 'decline' };
        if (act === 'pick') command = { type: 'pickDie', die: Number(data.i) };
        if (act === 'feed') command = { type: 'feed', pay: { ...f.pay } };
        if (act === 'starve') command = { type: 'feed', pay: null };
        if (act === 'take2') command = { type: 'choice2', take: { ...f.take } };
        if (!command) return;
        this.closeDecide();
        this.send(command);
    }

    // 決めるダイアログを閉じる（盤面を見る扱いにはしない）
    closeDecide() {
        this.decideKey = null;
        this.dismissedKey = null;
        this.form = null;
        if ($('#decide').open) $('#decide').close();
        this.render();
    }

    // ---- カード・記録・終わり ----

    showCards(seat) {
        const v = this.view;
        if (!v) return;
        const p = v.players[seat];
        const bonus = finalBonus(p);
        const counts = multiplierCounts(p.cards);
        const base = multiplierBase(p);
        const mults = MULTIPLIERS.filter(k => counts[k]).map(k => `<li>${MULTIPLIER_NAME[k]} ${counts[k]}人 × ${MULTIPLIER_BASE[k]} ${base[k]} = <b>${counts[k] * base[k]}</b></li>`).join('');
        const cards = [...p.cards].sort((a, b) => (CIV_CARDS[a].bottom.culture ? 0 : 1) - (CIV_CARDS[b].bottom.culture ? 0 : 1) || a - b);
        const hiddenNote = p.hiddenCount ? `<p class="note">伏せたカード ${p.hiddenCount}枚</p>` : '';
        $('#cards-title').textContent = seat === v.you ? 'あなたのカード' : `${p.name}のカード`;
        $('#cards-body').innerHTML = `
            <div class="card-list">${cards.map(id => civCardHtml(id, { cls: `small ${p.hidden.includes(id) ? 'was-hidden' : ''}` })).join('') || '<p class="note">まだありません</p>'}</div>
            ${hiddenNote}
            <div class="card-list blds">${p.buildings.map(id => `<div class="bld small"><span class="bld-face">${buildingFaceHtml(id)}</span></div>`).join('')}</div>
            <ul class="bonus">
                <li>文化 <b>${bonus.culture}</b></li>${mults}<li>残った資源 <b>${bonus.resources}</b></li>
                <li class="total">${v.phase === 'end' ? '終わりに足した点' : 'いま終わると'} <b>+${bonus.total}</b></li>
            </ul>`;
        $('#cards').showModal();
    }

    showResult() {
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        const names = v.winners.map(id => v.players[id].name);
        $('#result-title').textContent = v.winners.includes(v.you)
            ? (v.winners.length > 1 ? '同点で勝ち' : 'あなたの勝ち')
            : `${names.join('と')}の勝ち`;
        $('#result-reason').textContent = v.endReason ?? '';
        const ranked = [...v.players].sort((a, b) => b.score - a.score);
        $('#result-table').innerHTML = `<table><thead><tr><th></th><th>途中</th><th>文化</th><th>倍率</th><th>資源</th><th>計</th></tr></thead><tbody>
            ${ranked.map(p => {
                const f = p.final;
                const mult = f.farmer + f.toolmaker + f.builder + f.shaman;
                return `<tr class="${p.id === v.you ? 'you' : ''} ${v.winners.includes(p.id) ? 'win' : ''}"><th><i class="dot" style="--c:${COLORS[p.id]}"></i>${escapeHtml(p.name)}</th>
                    <td>${f.track}</td><td>${f.culture}</td><td>${mult}</td><td>${f.resources}</td><td class="total">${p.score}</td></tr>`;
            }).join('')}
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

    renderLog() {
        $('#log-list').innerHTML = this.view.logs.slice(-200).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    // ---- ヒント ----

    // おすすめの手を、場所を選んだ状態にして、押すボタンに印を付ける（画面だけ。記録には入れず、自分が動いたら消す）
    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = command;
        const v = this.view;
        if (command.type === 'place') this.sel = { place: command.place, count: command.count };
        if (command.type === 'resolve') this.sel = { place: command.place, count: v.placed[v.you][command.place] };
        this.render();
        const res = (pay) => Object.entries(pay ?? {}).filter(([, n]) => n > 0).map(([r, n]) => `${RESOURCE_NAME[r]}${n}`).join('・');
        const used = (command.tools?.length ?? 0) + (command.oneUse?.length ?? 0);
        const text = {
            place: () => `${this.placeDesc(v, command.place).split('：')[0]}に${command.count}人置く`,
            resolve: () => `${this.placeDesc(v, command.place).split('：')[0]}を使う`,
            tools: () => (used ? `道具を${used}つ使う` : '道具を使わない'),
            pay: () => `${res(command.pay)}を払う`,
            decline: () => '払わずに見送る',
            pickDie: () => `目が${v.pending?.dice?.[command.die] ?? ''}のサイコロを取る`,
            feed: () => (res(command.pay) ? `食料の代わりに${res(command.pay)}を払う` : '食べさせる')
        }[command.type]?.() ?? '';
        this.toast(`おすすめ：${text}`);
    }

    markHint() {
        const c = this.hintCommand;
        if (!c) return;
        const act = { place: 'place', resolve: 'resolve' }[c.type] ?? 'decide';
        document.querySelector(`#actions [data-act="${act}"]`)?.classList.add('recommended');
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}

