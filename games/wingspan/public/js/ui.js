/**
 * 画面：タイトル → ゲーム → 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 * 選択待ちの種類ごとに、押せるものを光らせ、下の欄に短い文とボタンを出す。選ぶものが多いときはシートで選ぶ
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { LEVELS, suggestSetup } from './cpu-player.js';
import { paymentOptions, MIN_PLAYERS, MAX_PLAYERS } from './game.js';
import {
    birdOf, goalOf, FOODS, FOOD_NAMES, HABITATS, HABITAT_NAMES, EGG_COST, ROW_SIZE, ACTION_AMOUNTS, BONUS_COLUMNS, GOAL_POINTS
} from './birds.js';
import {
    esc, installSymbols, foodIcon, habitatIcon, eggIcon, icon, dieFace, cardHtml, slotHtml, cardDetailHtml, bonusHtml, powerAsk, birdArt
} from './art.js';
import { createSeed } from './random.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { recordResult, outcomeFromWinners } from './netplay/user-stats.js';
import { getServerUrl, GAME } from './online-config.js';

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = 'wingspan.settings';
const CPU_NAMES = ['アオイ', 'ハル', 'ソラ', 'ミナト'];
const ACTION_WORD = { forest: '餌', grassland: '卵', wetland: '札' };
const ACTION_VERB = { forest: '餌を取る', grassland: '卵を産む', wetland: 'カードを引く' };
const BONUS_WORD = { forest: 'カード1枚 → 餌', grassland: '餌1つ → 卵', wetland: '卵1個 → カード' };
const params = new URLSearchParams(location.search);
const CPU_DELAY = params.has('cpuDelay') ? Number(params.get('cpuDelay')) : null;

const store = {
    load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ } }
};

const refKey = (r) => `${r.h}:${r.i}`;
const sameRef = (a, b) => a && b && a.h === b.h && a.i === b.i;

export default class UI {
    constructor() {
        installSymbols($('symbols'));
        this.settings = { cpus: 2, level: 'normal', ...store.load(SETTINGS_KEY) };
        if (![1, 2, 3, 4].includes(this.settings.cpus)) this.settings.cpus = 2;
        if (!LEVELS[this.settings.level]) this.settings.level = 'normal';
        this.controller = null;
        this.view = null;
        this.sel = {};
        this.selStep = -1;
        this.sheetKind = null;
        this.lastSeq = 0;
        this.resultShown = false;
        this.bind();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'ウイングスパン',
            game: 'wingspan',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 650,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            settings: [],
            onStart: (controller) => this.begin(controller),
            onUpdate: () => this.update(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => this.showTitle()
        });
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.controller?.stop();
        this.controller = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('screen-game').hidden = true;
        $('screen-title').hidden = false;
        this.renderTitle();
    }

    renderTitle() {
        $('cpu-count').innerHTML = [1, 2, 3, 4].map(n => `<button role="radio" data-cpus="${n}" aria-checked="${n === this.settings.cpus}">${n}</button>`).join('');
        $('level').innerHTML = Object.entries(LEVELS).map(([key, name]) => `<button role="radio" data-level="${key}" aria-checked="${key === this.settings.level}">${name}</button>`).join('');
        $('resume').hidden = !loadSavedGame();
        $('online-button').hidden = !this.online?.available;
        $('title-art').innerHTML = titleArt();
    }

    newSetup() {
        const players = [{ name: 'あなた', isCPU: false }];
        for (let i = 0; i < this.settings.cpus; i++) players.push({ name: CPU_NAMES[i], isCPU: true });
        return { players, options: { seed: createSeed() }, level: this.settings.level };
    }

    startGame(setup) {
        this.controller?.stop();
        this.controller = null;
        const listeners = {
            onUpdate: () => this.update(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            }
        };
        let controller;
        try {
            controller = new LocalGameController({ ...setup, cpuDelay: CPU_DELAY }, listeners);
        } catch (error) {
            console.warn(error);
            clearSavedGame();
            controller = new LocalGameController({ ...this.newSetup(), cpuDelay: CPU_DELAY }, listeners);
        }
        this.begin(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    begin(controller) {
        if (this.controller !== controller) this.controller?.stop();
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        this.resultShown = false;
        this.sel = {};
        this.selStep = -1;
        this.sheetKind = null;
        this.hintCommand = null;
        this.controller = controller;
        this.view = this.controller.getView();
        this.lastSeq = this.view.events.at(-1)?.seq ?? 0;
        $('screen-title').hidden = true;
        $('screen-game').hidden = false;
        this.render();
    }

    update() {
        if (!this.controller) return;
        this.prevSeat = this.view?.decision?.seat ?? null;
        this.view = this.controller.getView();
        this.render();
    }

    send(command) {
        if (!this.controller) return false;
        return this.controller.send(command);
    }

    // ---- 調べる ----

    get me() { return this.view.players[this.view.you]; }

    myDecision() {
        const d = this.view.decision;
        return d && d.seat === this.view.you ? d : null;
    }

    eggTotal() {
        return HABITATS.reduce((s, h) => s + this.me.board[h].reduce((t, slot) => t + slot.eggs, 0), 0);
    }

    // その鳥をその生息地に出せるか
    playInfo(birdId, habitat) {
        const bird = birdOf(birdId);
        const row = this.me.board[habitat];
        if (!bird.habitats.includes(habitat)) return { ok: false, why: '住めません' };
        if (row.length >= ROW_SIZE) return { ok: false, why: 'いっぱいです' };
        const eggCost = EGG_COST[row.length];
        if (this.eggTotal() < eggCost) return { ok: false, why: `卵が${eggCost}個要ります` };
        const pays = paymentOptions(bird.cost, this.me.food);
        if (!pays.length) return { ok: false, why: '餌が足りません' };
        return { ok: true, eggCost, pays };
    }

    canPlay(birdId, only = null) {
        return HABITATS.some(h => (!only || h === only) && this.playInfo(birdId, h).ok);
    }

    // 選択待ちが変わったら、画面の側の選択を消す
    syncSel() {
        if (this.selStep !== this.view.step) {
            this.selStep = this.view.step;
            this.sel = {};
        }
    }

    // ---- 描く ----

    render() {
        const v = this.view;
        if (!v) return;
        $('hint').hidden = Boolean(this.controller?.isOnline); // ヒントはローカル対戦だけ
        this.syncSel();
        this.playEvents();
        this.renderTop();
        this.renderOpponents();
        this.renderShared();
        this.renderBoard();
        this.renderMine();
        this.renderHand();
        this.renderPrompt();
        this.autoSheets();
        this.markHint();
    }

    // 新しい出来事から効果音を1つ鳴らす。自分の手はその音、自分の番になったら turn、終わりは勝ち負け
    // CPU は1手ずつ速く打つので、CPU の手ごとには鳴らさない
    playSound(fresh) {
        const v = this.view;
        if (fresh.length === 0) return;
        const end = fresh.find(e => e.type === 'end');
        if (end) return music.play(end.winners.includes(v.you) ? 'win' : 'lose');
        const mine = fresh.filter(e => e.seat === v.you);
        const types = mine.map(e => e.type);
        if (mine.some(e => (e.type === 'hunt' || e.type === 'predator') && e.hit)) return music.play('capture');
        if (types.includes('play')) return music.play('place');
        if (types.includes('reroll')) return music.play('dice');
        if (['lay', 'take', 'bonus', 'trade'].some(t => types.includes(t))) return music.play('gain');
        if (types.includes('draw')) return music.play('draw');
        if (types.includes('tuck') || types.includes('power')) return music.play('place');
        if (types.includes('discardEgg')) return music.play('pay');
        if (types.length) return music.play('select');
        if (fresh.some(e => e.type === 'roundEnd')) return music.play('notify');
        if (v.decision?.seat === v.you && this.prevSeat !== v.you) music.play('turn');
    }

    // ---- ヒント ----

    showHint() {
        const command = this.controller?.hint();
        if (!command) return this.toast('いまはあなたの番ではありません');
        this.hintCommand = { key: this.lastSeq, command };
        this.render();
        const c = command;
        const text = {
            play: c.bird && `「${birdOf(c.bird).name}」を${HABITAT_NAMES[c.habitat]}に出す`,
            action: `${HABITAT_NAMES[c.habitat]}の行動`,
            take: '印の付いたさいころの餌を取る', reroll: 'さいころを振り直す', skip: '使わない', power: '能力を使う',
            lay: '卵をおまかせで置く', draw: 'カードを引く', setup: '準備（おまかせで選べます）', bonus: '印の付いたボーナスカード'
        }[c.type] ?? '';
        this.toast(`おすすめ：${text}`);
    }

    // おすすめの手に印を付ける（前の印を外してから）
    markHint() {
        document.querySelectorAll('.recommended').forEach(el => el.classList.remove('recommended'));
        const h = this.hintCommand;
        if (!h) return;
        if (h.key !== this.lastSeq) {
            this.hintCommand = null;
            return;
        }
        const c = h.command;
        const selector = {
            action: `[data-act="${c.habitat}"]`,
            play: `[data-card="${this.me.hand.indexOf(c.bird)}"]`,
            reroll: '[data-prompt="reroll"]', skip: '[data-prompt="skip"]', lay: '[data-prompt="auto-lay"]',
            setup: '[data-prompt="open-setup"]', bonus: '[data-prompt="open-bonus"]'
        }[c.type];
        if (selector) document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
    }

    // 新しく起きたことを、短い表示と光で見せる
    playEvents() {
        const fresh = this.view.events.filter(e => e.seq > this.lastSeq);
        this.lastSeq = this.view.events.at(-1)?.seq ?? this.lastSeq;
        this.playSound(fresh);
        this.flash = new Set();
        this.flashSeats = new Set();
        for (const e of fresh) {
            if (e.seat != null && e.seat !== this.view.you) this.flashSeats.add(e.seat);
            if (e.seat === this.view.you) {
                if (e.type === 'play') this.flash.add(refKey(e.ref));
                if (e.type === 'lay') e.targets.forEach(r => this.flash.add(refKey(r)));
                if (['tuck', 'predator', 'hunt', 'power', 'take'].includes(e.type) && e.ref) this.flash.add(refKey(e.ref));
            }
            if (e.type === 'roundEnd') {
                const mine = e.points[this.view.you];
                this.toast(`第${e.round}ラウンド終了　目標「${goalOf(e.goal).name}」${mine}点`, 2600);
            }
        }
    }

    renderTop() {
        const v = this.view;
        if (v.phase === 'setup') {
            $('round-info').textContent = '準備';
        } else if (v.phase === 'end') {
            $('round-info').textContent = '終了';
        } else {
            $('round-info').innerHTML = `第${v.round}R <small>${Math.min(this.me.actions + 1, v.turnsThisRound)}/${v.turnsThisRound}</small>`;
        }
        const goal = v.goals[Math.min(v.round, 4) - 1];
        const now = v.goalNow ? v.goalNow[v.you] : null;
        $('goal-chip').innerHTML = `<small>目標</small><span class="goal-name">${esc(goal.name)}</span>${now != null ? `<b>${now}</b>` : ''}`;
    }

    renderOpponents() {
        const v = this.view;
        const active = v.decision?.seat;
        $('opponents').innerHTML = v.players.filter(p => p.id !== v.you).map(p => {
            const turn = v.phase === 'play' ? active === p.id : (v.phase === 'setup' && !p.setupDone);
            const birds = HABITATS.reduce((s, h) => s + p.board[h].length, 0);
            return `<button class="opp ${turn ? 'turn' : ''} ${this.flashSeats?.has(p.id) ? 'flash' : ''}" data-peek="${p.id}">
                <span class="opp-name">${v.firstPlayer === p.id && v.phase === 'play' ? '<i class="first" title="先手"></i>' : ''}${esc(p.name)}</span>
                <span class="opp-score">${p.score}<small>点</small></span>
                <span class="opp-sub">鳥${birds} 手${p.handCount} 餌${p.foodTotal}</span>
            </button>`;
        }).join('');
    }

    renderShared() {
        const v = this.view;
        const d = this.myDecision();
        const food = d?.kind === 'food';
        $('feeder').innerHTML = v.feeder.map((face, i) => {
            const usable = food && (!d.only || d.only.includes(face) || (face === 'invseed' && d.only.some(f => f === 'inv' || f === 'seed')));
            return `<button class="die ${usable ? 'glow' : ''}" data-die="${i}" aria-label="${face === 'invseed' ? '虫か種' : FOOD_NAMES[face]}">${dieFace(face)}</button>`;
        }).join('') + Array.from({ length: 5 - v.feeder.length }, () => '<span class="die empty"></span>').join('');
        const draw = d?.kind === 'draw';
        const picked = this.sel.tray ?? [];
        const full = draw && picked.length + (this.sel.deck ?? 0) >= d.n;
        $('tray').innerHTML = v.tray.map((id, i) => cardHtml(id, {
            cls: `${draw && !picked.includes(i) && !full ? 'glow' : ''} ${picked.includes(i) ? 'picked' : ''}`,
            attrs: `data-tray="${i}"`
        })).join('') + Array.from({ length: 3 - v.tray.length }, () => '<span class="card empty"></span>').join('');
        const deckN = this.sel.deck ?? 0;
        $('deck').className = `deck ${draw && !full && v.deckCount > deckN ? 'glow' : ''} ${deckN ? 'picked' : ''}`;
        $('deck').innerHTML = `${icon('i-card', 'ic deck-ic')}<b>${v.deckCount}</b>${deckN ? `<em>+${deckN}</em>` : ''}`;
    }

    // 自分の場で、光らせる鳥と押したときの動き
    slotMode(ref, slot) {
        const d = this.myDecision();
        if (!d) return null;
        const bird = birdOf(slot.bird);
        if (d.kind === 'lay') {
            const pending = (this.sel.lay ?? []).filter(r => sameRef(r, ref)).length;
            const room = slot.eggs + pending < bird.eggs && (this.sel.lay ?? []).length < d.n && (!d.only || d.only.some(r => sameRef(r, ref)));
            return room ? 'lay' : null;
        }
        if (d.kind === 'power') {
            if (d.power === 'layAny') return slot.eggs < bird.eggs ? 'layAny' : null;
            if (d.power === 'discardEggFood' || d.power === 'discardEggCards') return slot.eggs > 0 && !sameRef(ref, d.ref) ? 'discardEgg' : null;
        }
        return null;
    }

    renderBoard() {
        const me = this.me;
        const d = this.myDecision();
        const myTurn = d?.kind === 'turn';
        $('board').innerHTML = HABITATS.map(h => {
            const row = me.board[h];
            const column = row.length;
            const amount = ACTION_AMOUNTS[h][column];
            const bonus = BONUS_COLUMNS.includes(column);
            const powerRef = d?.ref && d.ref.h === h ? d.ref.i : -1;
            const slots = Array.from({ length: ROW_SIZE }, (_, i) => {
                const slot = row[i];
                if (!slot) {
                    const cost = EGG_COST[i];
                    return `<span class="slot empty ${i === column ? 'next' : ''}">${i === column && cost ? `<span class="egg-cost">${eggIcon('ic tiny')}${cost}</span>` : ''}</span>`;
                }
                const ref = { h, i };
                const mode = this.slotMode(ref, slot);
                const pending = (this.sel.lay ?? []).filter(r => sameRef(r, ref)).length;
                const cls = [mode ? 'glow' : '', i === powerRef ? 'acting' : '', this.flash.has(refKey(ref)) ? 'flash' : ''].join(' ');
                return slotHtml(slot, { cls, attrs: `data-ref="${h}:${i}"`, pending });
            }).join('');
            return `<div class="row hab-${h}">
                <button class="act ${myTurn ? 'glow' : ''}" data-act="${h}" aria-label="${HABITAT_NAMES[h]}：${ACTION_VERB[h]}">
                    ${habitatIcon(h, 'ic act-ic')}<span class="act-name">${HABITAT_NAMES[h]}</span>
                    <span class="act-amount">${ACTION_WORD[h]}${amount}${bonus ? '<i class="plus">+</i>' : ''}</span>
                </button>
                <div class="slots">${slots}</div>
            </div>`;
        }).join('');
    }

    renderMine() {
        const me = this.me;
        const v = this.view;
        const foods = FOODS.map(f => `<span class="token ${me.food[f] ? '' : 'zero'}">${foodIcon(f)}<b>${me.food[f]}</b></span>`).join('');
        const bonusPts = (me.bonus ?? []).reduce((s, b) => s + b.points, 0);
        $('mine').innerHTML = `<div class="tokens">${foods}</div>
            <button class="my-bonus" id="my-bonus">${icon('i-card', 'ic')}<span>ボーナス<b>${bonusPts}</b></span></button>
            <span class="my-score">${v.firstPlayer === v.you && v.phase === 'play' ? '<i class="first" title="先手"></i>' : ''}<b>${me.score}</b><small>点</small></span>`;
    }

    handMode(birdId) {
        const d = this.myDecision();
        if (!d) return null;
        if (d.kind === 'turn') return this.canPlay(birdId) ? 'play' : null;
        if (d.kind === 'playExtra') return this.canPlay(birdId, d.habitat) ? 'play' : null;
        if (d.kind === 'power' && ['tuckDraw', 'tuckFood', 'tuckEgg'].includes(d.power)) return 'tuck';
        return null;
    }

    renderHand() {
        const me = this.me;
        const list = me.hand ?? [];
        $('hand').innerHTML = list.length
            ? list.map((id, i) => {
                const mode = this.handMode(id);
                const picked = this.sel.card === i;
                return cardHtml(id, { cls: `${mode && !picked ? 'glow' : ''} ${picked ? 'picked' : ''}`, attrs: `data-card="${i}"` });
            }).join('')
            : '<span class="hand-empty">手札なし</span>';
    }

    renderPrompt() {
        const v = this.view;
        const d = this.myDecision();
        let text = '';
        let buttons = [];
        if (v.phase === 'end') {
            text = v.winners.includes(v.you) ? 'あなたの勝ちです' : `${v.winners.map(s => esc(v.players[s].name)).join('と')}の勝ちです`;
            buttons = [['show-result', '結果', 'primary']];
        } else if (v.phase === 'setup') {
            text = this.me.offer ? '鳥とボーナスカードを選んで始めます' : 'ほかの人が選んでいます';
            if (this.me.offer) buttons = [['open-setup', '選ぶ', 'primary']];
        } else if (!d) {
            const who = v.decision ? v.players[v.decision.seat].name : '';
            text = `<span class="muted">${esc(v.logs.at(-1) ?? '')}</span>${who ? `<span class="waiting">${esc(who)}の番</span>` : ''}`;
        } else {
            switch (d.kind) {
                case 'turn':
                    text = 'あなたの番　鳥を出すか、生息地で行動';
                    break;
                case 'food':
                    text = `餌箱から餌を取る　<b>あと${d.left}</b>`;
                    if (v.feeder.length && v.feeder.every(f => f === v.feeder[0])) buttons.push(['reroll', '振り直す', 'secondary']);
                    break;
                case 'lay': {
                    const k = (this.sel.lay ?? []).length;
                    text = `卵を産む　<b>${k}/${d.n}</b>`;
                    buttons.push(['undo', '戻す', 'secondary', k === 0], ['auto-lay', 'おまかせ', 'secondary'], ['confirm-lay', '決定', 'primary', k !== d.n]);
                    break;
                }
                case 'draw': {
                    const k = (this.sel.tray ?? []).length + (this.sel.deck ?? 0);
                    text = `カードを引く　<b>${k}/${d.n}</b>`;
                    buttons.push(['undo', '戻す', 'secondary', k === 0], ['confirm-draw', '決定', 'primary', k !== d.n]);
                    break;
                }
                case 'power': {
                    const bird = birdOf(d.bird);
                    text = `<b>${esc(bird.name)}</b><br>${esc(powerAsk(bird))}`;
                    if (['tuckDraw', 'tuckFood', 'tuckEgg'].includes(d.power)) {
                        buttons.push(['skip', '使わない', 'secondary'], ['confirm-tuck', '差し込む', 'primary', this.sel.card == null]);
                    } else if (d.power === 'discardFoodTuck') {
                        buttons.push(['skip', '使わない', 'secondary'], ['use', '使う', 'primary']);
                    } else if (d.power === 'tradeFood') {
                        buttons.push(['skip', '使わない', 'secondary'], ['open-trade', '替える', 'primary']);
                    } else {
                        buttons.push(['skip', '使わない', 'secondary']);
                    }
                    break;
                }
                case 'bonus':
                    text = 'ボーナスカードを1枚残す';
                    buttons.push(['open-bonus', '選ぶ', 'primary']);
                    break;
                case 'playExtra':
                    text = `${HABITAT_NAMES[d.habitat]}にもう1羽出せます`;
                    buttons.push(['skip', '出さない', 'secondary']);
                    break;
                default:
                    break;
            }
        }
        $('prompt-text').innerHTML = text;
        $('prompt-buttons').innerHTML = buttons.map(([act, label, kind, disabled]) => `<button class="btn ${kind} small" data-prompt="${act}" ${disabled ? 'disabled' : ''}>${label}</button>`).join('');
    }

    // 選ぶものが多い選択待ちは、シートを自動で開く（閉じたら下の欄のボタンで開き直せる）
    autoSheets() {
        const v = this.view;
        if (v.phase === 'end' && !this.resultShown) {
            this.resultShown = true;
            setTimeout(() => this.showResult(), 700);
            return;
        }
        const d = this.myDecision();
        const key = `${v.step}`;
        if (v.phase === 'setup' && this.me.offer && this.autoOpened !== `setup:${key}`) {
            this.autoOpened = `setup:${key}`;
            this.openSetup();
        } else if (d?.kind === 'bonus' && this.autoOpened !== `bonus:${key}`) {
            this.autoOpened = `bonus:${key}`;
            this.openBonusPick();
        } else if (this.sheetKind && !['detail', 'peek', 'goals', 'log', 'mybonus'].includes(this.sheetKind) && !this.sheetStillValid()) {
            this.closeSheet();
        }
    }

    sheetStillValid() {
        const d = this.myDecision();
        if (this.sheetKind === 'setup') return this.view.phase === 'setup' && !!this.me.offer;
        if (this.sheetKind === 'play') return d && (d.kind === 'turn' || d.kind === 'playExtra');
        if (this.sheetKind === 'action') return d?.kind === 'turn';
        if (this.sheetKind === 'bonus') return d?.kind === 'bonus';
        if (this.sheetKind === 'choice') return !!d;
        return true;
    }

    // ---- シート ----

    openSheet(kind, body, buttons = [['close', '閉じる', 'secondary']]) {
        this.sheetKind = kind;
        $('sheet-body').innerHTML = body;
        $('sheet-buttons').innerHTML = buttons.map(([act, label, cls, disabled]) => `<button class="btn ${cls}" data-sheet="${act}" ${disabled ? 'disabled' : ''}>${label}</button>`).join('');
        const sheet = $('sheet');
        if (!sheet.open) sheet.showModal();
        $('sheet-body').scrollTop = 0;
    }

    closeSheet() {
        this.sheetKind = null;
        if ($('sheet').open) $('sheet').close();
    }

    openDetail(birdId, extra = '') {
        this.openSheet('detail', cardDetailHtml(birdId) + extra);
    }

    // 鳥を出すシート：生息地・餌の払い方・卵を取る鳥を選ぶ
    openPlay(birdId) {
        const d = this.myDecision();
        const only = d?.kind === 'playExtra' ? d.habitat : null;
        const bird = birdOf(birdId);
        const options = bird.habitats.filter(h => !only || h === only).map(h => ({ h, info: this.playInfo(birdId, h) }));
        const okList = options.filter(o => o.info.ok);
        if (!okList.length) {
            this.openDetail(birdId, `<p class="why">${options.map(o => `${HABITAT_NAMES[o.h]}：${o.info.why}`).join('<br>')}</p>`);
            return;
        }
        const p = this.sel.play?.bird === birdId ? this.sel.play : { bird: birdId, habitat: okList[0].h, pay: 0, eggs: null };
        if (!okList.some(o => o.h === p.habitat)) p.habitat = okList[0].h;
        const info = this.playInfo(birdId, p.habitat);
        if (p.pay >= info.pays.length) p.pay = 0;
        if (!p.eggs || p.eggs.length !== info.eggCost) p.eggs = this.autoEggs(info.eggCost);
        this.sel.play = p;
        const habs = options.map(o => `<button role="radio" data-play-hab="${o.h}" aria-checked="${o.h === p.habitat}" ${o.info.ok ? '' : 'disabled'}>${habitatIcon(o.h)}${HABITAT_NAMES[o.h]}</button>`).join('');
        const pays = info.pays.length > 1
            ? `<div class="pick-label">餌の払い方</div><div class="choices">${info.pays.map((pay, k) => `<button class="choice ${k === p.pay ? 'on' : ''}" data-play-pay="${k}">${pay.map(f => foodIcon(f)).join('')}</button>`).join('')}</div>`
            : `<div class="pick-label">払う餌 ${info.pays[0].map(f => foodIcon(f)).join('')}</div>`;
        let eggs = '';
        if (info.eggCost) {
            const sources = [];
            HABITATS.forEach(h => this.me.board[h].forEach((slot, i) => { if (slot.eggs > 0) sources.push({ h, i, slot }); }));
            eggs = `<div class="pick-label">卵を${info.eggCost}個払う（押して選ぶ）</div><div class="choices">${sources.map(({ h, i, slot }) => {
                const used = p.eggs.filter(r => r.h === h && r.i === i).length;
                return `<button class="choice egg-src ${used ? 'on' : ''}" data-play-egg="${h}:${i}">${esc(birdOf(slot.bird).name)} ${eggIcon('ic tiny')}${slot.eggs}${used ? `<em>−${used}</em>` : ''}</button>`;
            }).join('')}</div>`;
        }
        const body = `${cardDetailHtml(birdId)}<div class="play-form">
            <div class="segment" role="radiogroup" aria-label="出す生息地">${habs}</div>${pays}${eggs}</div>`;
        this.openSheet('play', body, [['close', 'やめる', 'secondary'], ['play', '出す', 'primary', p.eggs.length !== info.eggCost]]);
    }

    autoEggs(count) {
        const list = [];
        HABITATS.forEach(h => this.me.board[h].forEach((slot, i) => { list.push({ h, i, eggs: slot.eggs }); }));
        list.sort((a, b) => b.eggs - a.eggs);
        const out = [];
        for (const s of list) {
            for (let k = 0; k < s.eggs && out.length < count; k++) out.push({ h: s.h, i: s.i });
        }
        return out;
    }

    toggleEgg(ref) {
        const p = this.sel.play;
        const info = this.playInfo(p.bird, p.habitat);
        const slot = this.me.board[ref.h][ref.i];
        const used = p.eggs.filter(r => sameRef(r, ref)).length;
        if (p.eggs.length < info.eggCost && used < slot.eggs) {
            p.eggs.push(ref);
        } else if (used > 0) {
            p.eggs.splice(p.eggs.findIndex(r => sameRef(r, ref)), 1);
        } else if (p.eggs.length >= info.eggCost) {
            p.eggs.shift();
            p.eggs.push(ref);
        }
        this.openPlay(p.bird);
    }

    confirmPlay() {
        const p = this.sel.play;
        const info = this.playInfo(p.bird, p.habitat);
        if (!info.ok) return;
        this.closeSheet();
        this.send({ type: 'play', bird: p.bird, habitat: p.habitat, food: info.pays[p.pay], eggs: p.eggs });
    }

    // 生息地の行動。ボーナスの交換ができるときは、シートで選ぶ
    openAction(habitat) {
        const me = this.me;
        const column = me.board[habitat].length;
        const amount = ACTION_AMOUNTS[habitat][column];
        const bonus = BONUS_COLUMNS.includes(column);
        let choices = '';
        if (bonus) {
            if (habitat === 'forest') {
                choices = (me.hand ?? []).map((id, i) => `<button class="choice" data-bonus-card="${i}">${esc(birdOf(id).name)}</button>`).join('');
            } else if (habitat === 'grassland') {
                const room = HABITATS.reduce((s, h) => s + me.board[h].reduce((t, slot) => t + birdOf(slot.bird).eggs - slot.eggs, 0), 0);
                if (room > amount) choices = FOODS.filter(f => me.food[f] > 0).map(f => `<button class="choice" data-bonus-food="${f}">${foodIcon(f)}${FOOD_NAMES[f]}</button>`).join('');
            } else {
                const sources = [];
                HABITATS.forEach(h => me.board[h].forEach((slot, i) => { if (slot.eggs > 0) sources.push(`<button class="choice" data-bonus-egg="${h}:${i}">${esc(birdOf(slot.bird).name)} ${eggIcon('ic tiny')}${slot.eggs}</button>`); }));
                if (this.view.deckCount + this.view.tray.length > amount) choices = sources.join('');
            }
        }
        if (!choices) {
            this.send({ type: 'action', habitat });
            return;
        }
        const body = `<h3 class="sheet-title">${habitatIcon(habitat)}${HABITAT_NAMES[habitat]}：${ACTION_VERB[habitat]}（${amount}）</h3>
            <p class="muted">ボーナスの交換（${BONUS_WORD[habitat]}）をすると、${amount + 1}になります。</p>
            <div class="pick-label">交換に使うもの</div><div class="choices">${choices}</div>`;
        this.sel.actionHabitat = habitat;
        this.openSheet('action', body, [['close', 'やめる', 'secondary'], ['act-plain', `交換しない（${amount}）`, 'primary']]);
    }

    // 準備：残す鳥・餌・ボーナスカード
    openSetup() {
        const offer = this.me.offer;
        if (!offer) return;
        if (!this.sel.setup) {
            const s = suggestSetup(offer);
            this.sel.setup = { birds: [...s.birds], food: [...s.food], bonus: s.bonus };
        }
        const s = this.sel.setup;
        const total = s.birds.length + s.food.length;
        const body = `<h3 class="sheet-title">準備</h3>
            <p class="muted">鳥を残した数だけ餌を捨てます（鳥と餌を合わせて5つ）。</p>
            <div class="pick-label">鳥 <b>${s.birds.length}</b></div>
            <div class="setup-cards">${offer.birds.map(id => cardHtml(id, { cls: s.birds.includes(id) ? 'picked' : 'dim', attrs: `data-setup-bird="${id}"` })).join('')}</div>
            <div class="pick-label">餌 <b>${s.food.length}</b></div>
            <div class="choices">${FOODS.map(f => `<button class="choice ${s.food.includes(f) ? 'on' : 'dim'}" data-setup-food="${f}">${foodIcon(f)}${FOOD_NAMES[f]}</button>`).join('')}</div>
            <div class="pick-label">ボーナスカード（1枚残す）</div>
            <div class="bonus-list">${offer.bonus.map(id => bonusHtml(id, { cls: s.bonus === id ? 'picked' : '', attrs: `data-setup-bonus="${id}"` })).join('')}</div>
            <p class="setup-count ${total === 5 ? '' : 'bad'}">鳥${s.birds.length}・餌${s.food.length}${total === 5 ? '' : '（合わせて5つにします）'}</p>`;
        this.openSheet('setup', body, [['close', '盤面を見る', 'secondary'], ['setup', '始める', 'primary', total !== 5 || !s.bonus]]);
    }

    openBonusPick() {
        const d = this.myDecision();
        if (d?.kind !== 'bonus') return;
        const body = `<h3 class="sheet-title">ボーナスカードを1枚残す</h3>
            <div class="bonus-list">${d.options.map(id => bonusHtml(id, { attrs: `data-pick-bonus="${id}"` })).join('')}</div>`;
        this.openSheet('bonus', body, [['close', '盤面を見る', 'secondary']]);
    }

    // 卵を捨てて好きな餌を得る：餌を選ぶ
    openFoodPick(target) {
        const d = this.myDecision();
        const n = birdOf(d.bird).power.arg;
        this.sel.eggTarget = target;
        this.sel.get = this.sel.get ?? [];
        const body = `<h3 class="sheet-title">得る餌を${n}つ選ぶ</h3>
            <div class="choices">${FOODS.map(f => `<button class="choice" data-get-food="${f}">${foodIcon(f)}${FOOD_NAMES[f]}</button>`).join('')}</div>
            <p class="picked-foods">${this.sel.get.map(f => foodIcon(f)).join('') || '&nbsp;'}</p>`;
        this.openSheet('choice', body, [['clear-get', '戻す', 'secondary', !this.sel.get.length], ['get', '決定', 'primary', this.sel.get.length !== n]]);
    }

    openTrade() {
        const t = this.sel.trade ?? (this.sel.trade = {});
        const me = this.me;
        const body = `<h3 class="sheet-title">餌を替える</h3>
            <div class="pick-label">渡す餌</div>
            <div class="choices">${FOODS.filter(f => me.food[f] > 0).map(f => `<button class="choice ${t.give === f ? 'on' : ''}" data-give="${f}">${foodIcon(f)}${FOOD_NAMES[f]}</button>`).join('')}</div>
            <div class="pick-label">もらう餌</div>
            <div class="choices">${FOODS.filter(f => f !== t.give).map(f => `<button class="choice ${t.get === f ? 'on' : ''}" data-get="${f}">${foodIcon(f)}${FOOD_NAMES[f]}</button>`).join('')}</div>`;
        this.openSheet('choice', body, [['close', 'やめる', 'secondary'], ['trade', '替える', 'primary', !t.give || !t.get]]);
    }

    openInvSeed(die) {
        const body = `<h3 class="sheet-title">どちらを取りますか</h3>
            <div class="choices big">${['inv', 'seed'].map(f => `<button class="choice" data-take-as="${f}" data-take-die="${die}">${foodIcon(f)}${FOOD_NAMES[f]}</button>`).join('')}</div>`;
        this.openSheet('choice', body, [['close', 'やめる', 'secondary']]);
    }

    // 相手（や自分）の場
    openPeek(seat) {
        const p = this.view.players[seat];
        const rows = HABITATS.map(h => `<div class="peek-row hab-${h}">${habitatIcon(h, 'ic act-ic')}<div class="slots">${Array.from({ length: ROW_SIZE }, (_, i) => (p.board[h][i] ? slotHtml(p.board[h][i], { attrs: `data-peek-bird="${p.board[h][i].bird}"` }) : '<span class="slot empty"></span>')).join('')}</div></div>`).join('');
        const foods = FOODS.map(f => `<span class="token ${p.food[f] ? '' : 'zero'}">${foodIcon(f)}<b>${p.food[f]}</b></span>`).join('');
        const bonus = p.bonus ? `<div class="bonus-list">${p.bonus.map(b => bonusHtml(b.id, { points: b.points })).join('')}</div>` : `<p class="muted">ボーナスカード ${p.bonusCount}枚（伏せてあります）</p>`;
        const body = `<h3 class="sheet-title">${esc(p.name)}　${p.score}点</h3>
            <div class="peek">${rows}</div>
            <div class="tokens">${foods}<span class="muted">手札 ${p.handCount}枚</span></div>${bonus}`;
        this.openSheet('peek', body);
    }

    openGoals() {
        const v = this.view;
        const rows = v.goals.map((g, k) => {
            const r = v.goalResults[k];
            const pts = GOAL_POINTS[k].join('・');
            const cells = v.players.map(p => {
                if (r) return `<td>${r[p.id].value}<small>${g.unit}</small> <b>${r[p.id].points}点</b></td>`;
                if (k === v.round - 1 && v.goalNow) return `<td class="now">${v.goalNow[p.id]}<small>${g.unit}</small></td>`;
                return '<td class="muted">—</td>';
            }).join('');
            return `<tr class="${k === v.round - 1 && v.phase !== 'end' ? 'current' : ''}"><th>第${k + 1}R<br><span>${esc(g.name)}</span><small>${pts}点</small></th>${cells}</tr>`;
        }).join('');
        const body = `<h3 class="sheet-title">ラウンドの目標</h3>
            <div class="table-wrap"><table class="goal-table"><thead><tr><th></th>${v.players.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
            <p class="muted">ラウンドの終わりに数を比べ、1〜3位に点が入ります。同じ数なら点を分け合い、0の人は点なしです。</p>`;
        this.openSheet('goals', body);
    }

    openLog() {
        const logs = this.view.logs.slice(-120);
        this.openSheet('log', `<h3 class="sheet-title">記録</h3><ol class="log-list">${logs.map(l => `<li>${esc(l)}</li>`).join('')}</ol>`);
        const list = $('sheet-body');
        list.scrollTop = list.scrollHeight;
    }

    openMyBonus() {
        const me = this.me;
        const body = `<h3 class="sheet-title">あなたのボーナスカード</h3>
            <div class="bonus-list">${(me.bonus ?? []).map(b => bonusHtml(b.id, { points: b.points })).join('')}</div>`;
        this.openSheet('mybonus', body);
    }

    // ローカル対戦（人1人と CPU）の結果を、ログインしている人の記録に送る。オンライン対戦はサーバーが記録する
    // id はシードから作る（同じ対戦を2回数えない）。ひとり用は勝ち負けがないので、回数だけ
    recordLocalResult(view) {
        const controller = this.controller;
        if (!controller || controller.isOnline || !controller.game) return;
        if (controller.game.players.filter(p => !p.isCPU).length !== 1) return;
        recordResult({
            game: GAME,
            id: `${GAME}-${controller.game.options.seed}`,
            outcome: view.players.length === 1 ? null : outcomeFromWinners(view.winners, view.you, view.players.length)
        });
    }

    showResult() {
        const v = this.view;
        if (!v?.results) return;
        this.recordLocalResult(v);
        const rows = [['鳥', 'birds'], ['ボーナス', 'bonus'], ['目標', 'goals'], ['卵', 'eggs'], ['貯えた餌', 'cache'], ['差し込み', 'tucked']];
        const order = [...v.results].sort((a, b) => b.total - a.total || b.food - a.food);
        $('result-title').textContent = v.winners.includes(v.you) ? 'あなたの勝ち' : `${v.winners.map(s => v.players[s].name).join('と')}の勝ち`;
        $('result-table').innerHTML = `<table class="result-table"><thead><tr><th></th>${order.map(r => `<th class="${v.winners.includes(r.seat) ? 'win' : ''}">${esc(v.players[r.seat].name)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(([name, key]) => `<tr><th>${name}</th>${order.map(r => `<td>${r[key]}</td>`).join('')}</tr>`).join('')}
            <tr class="total"><th>合計</th>${order.map(r => `<td>${r.total}</td>`).join('')}</tr>
            <tr class="sub"><th>残った餌</th>${order.map(r => `<td>${r.food}</td>`).join('')}</tr></tbody></table>`;
        if (!$('result').open) $('result').showModal();
    }

    // ---- 入力 ----

    bind() {
        // タイトル
        $('cpu-count').addEventListener('click', (e) => {
            const b = e.target.closest('[data-cpus]');
            if (!b) return;
            this.settings.cpus = Number(b.dataset.cpus);
            store.save(SETTINGS_KEY, this.settings);
            this.renderTitle();
        });
        $('level').addEventListener('click', (e) => {
            const b = e.target.closest('[data-level]');
            if (!b) return;
            this.settings.level = b.dataset.level;
            store.save(SETTINGS_KEY, this.settings);
            this.renderTitle();
        });
        $('start').addEventListener('click', () => this.startGame(this.newSetup()));
        $('online-button').addEventListener('click', () => this.online.open());
        $('resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        // オンライン対戦は、確かめてから部屋を出る（抜けた席は CPU が引き継ぐ）
        $('home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle()));
        $('open-help-title').addEventListener('click', () => $('help').showModal());
        $('open-help-game').addEventListener('click', () => $('help').showModal());
        $('hint').addEventListener('click', () => this.showHint());
        $('open-log').addEventListener('click', () => this.openLog());
        $('goal-chip').addEventListener('click', () => this.openGoals());
        $('help').querySelector('.close').addEventListener('click', () => $('help').close());
        $('again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.startGame(this.newSetup());
            document.querySelectorAll('dialog[open]').forEach(d => d.close());
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('result-home').addEventListener('click', () => (this.controller?.isOnline ? this.online.leave() : this.showTitle()));
        $('result-board').addEventListener('click', () => $('result').close());
        // ダイアログの外を押したら閉じる（選択待ちは消さない）
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    if (dialog.id === 'sheet') this.closeSheet();
                    else dialog.close();
                }
            });
        });
        $('sheet').addEventListener('close', () => { this.sheetKind = null; });

        $('opponents').addEventListener('click', (e) => {
            const b = e.target.closest('[data-peek]');
            if (b) this.openPeek(Number(b.dataset.peek));
        });
        $('feeder').addEventListener('click', (e) => this.onDie(e));
        $('tray').addEventListener('click', (e) => this.onTray(e));
        $('deck').addEventListener('click', () => this.onDeck());
        $('board').addEventListener('click', (e) => this.onBoard(e));
        $('hand').addEventListener('click', (e) => this.onHand(e));
        $('mine').addEventListener('click', (e) => {
            if (e.target.closest('#my-bonus')) this.openMyBonus();
        });
        $('prompt-buttons').addEventListener('click', (e) => this.onPrompt(e));
        $('sheet').addEventListener('click', (e) => this.onSheet(e));
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('input, textarea')) e.preventDefault();
        });
    }

    onDie(e) {
        const b = e.target.closest('[data-die]');
        if (!b) return;
        const d = this.myDecision();
        if (d?.kind !== 'food') return;
        const die = Number(b.dataset.die);
        const face = this.view.feeder[die];
        if (face === 'invseed') {
            const only = d.only?.filter(f => f === 'inv' || f === 'seed');
            if (only?.length === 1) this.send({ type: 'take', die, as: only[0] });
            else this.openInvSeed(die);
            return;
        }
        this.send({ type: 'take', die });
    }

    onTray(e) {
        const b = e.target.closest('[data-tray]');
        if (!b) return;
        const i = Number(b.dataset.tray);
        const d = this.myDecision();
        if (d?.kind === 'draw') {
            const tray = this.sel.tray ?? (this.sel.tray = []);
            if (tray.includes(i)) tray.splice(tray.indexOf(i), 1);
            else if (tray.length + (this.sel.deck ?? 0) < d.n) tray.push(i);
            this.render();
            return;
        }
        this.openDetail(this.view.tray[i]);
    }

    onDeck() {
        const d = this.myDecision();
        if (d?.kind !== 'draw') return;
        const k = (this.sel.tray ?? []).length + (this.sel.deck ?? 0);
        if (k < d.n && this.view.deckCount > (this.sel.deck ?? 0)) this.sel.deck = (this.sel.deck ?? 0) + 1;
        this.render();
    }

    onBoard(e) {
        const act = e.target.closest('[data-act]');
        if (act) {
            const d = this.myDecision();
            if (d?.kind === 'turn') this.openAction(act.dataset.act);
            return;
        }
        const b = e.target.closest('[data-ref]');
        if (!b) return;
        const [h, i] = b.dataset.ref.split(':');
        const ref = { h, i: Number(i) };
        const slot = this.me.board[h][ref.i];
        const mode = this.slotMode(ref, slot);
        const d = this.myDecision();
        if (mode === 'lay') {
            (this.sel.lay ?? (this.sel.lay = [])).push(ref);
            this.render();
        } else if (mode === 'layAny') {
            this.send({ type: 'power', target: ref });
        } else if (mode === 'discardEgg') {
            if (d.power === 'discardEggFood') {
                this.sel.get = [];
                this.openFoodPick(ref);
            } else {
                this.send({ type: 'power', target: ref });
            }
        } else {
            const cache = Object.entries(slot.cache).filter(([, n]) => n > 0).map(([f, n]) => `${foodIcon(f)}${n}`).join(' ');
            const extra = `<p class="slot-info">${eggIcon()}卵 ${slot.eggs}${cache ? `　貯えた餌 ${cache}` : ''}${slot.tucked ? `　差し込み ${slot.tucked}枚` : ''}</p>`;
            this.openDetail(slot.bird, extra);
        }
    }

    onHand(e) {
        const b = e.target.closest('[data-card]');
        if (!b) return;
        const i = Number(b.dataset.card);
        const id = this.me.hand[i];
        const mode = this.handMode(id);
        if (mode === 'tuck') {
            this.sel.card = this.sel.card === i ? null : i;
            this.render();
            return;
        }
        const d = this.myDecision();
        if (d?.kind === 'turn' || d?.kind === 'playExtra') {
            this.sel.play = null;
            this.openPlay(id);
            return;
        }
        this.openDetail(id);
    }

    onPrompt(e) {
        const b = e.target.closest('[data-prompt]');
        if (!b || b.disabled) return;
        const d = this.myDecision();
        switch (b.dataset.prompt) {
            case 'show-result': this.showResult(); break;
            case 'open-setup': this.openSetup(); break;
            case 'open-bonus': this.openBonusPick(); break;
            case 'open-trade': this.openTrade(); break;
            case 'reroll': this.send({ type: 'reroll' }); break;
            case 'skip': this.send({ type: 'skip' }); break;
            case 'use': this.send({ type: 'power' }); break;
            case 'undo':
                if (d?.kind === 'lay') this.sel.lay?.pop();
                if (d?.kind === 'draw') {
                    if (this.sel.deck) this.sel.deck--;
                    else this.sel.tray?.pop();
                }
                this.render();
                break;
            case 'auto-lay': this.send({ type: 'lay', targets: this.autoLay(d.n) }); break;
            case 'confirm-lay': this.send({ type: 'lay', targets: this.sel.lay ?? [] }); break;
            case 'confirm-draw': this.send({ type: 'draw', tray: this.sel.tray ?? [], deck: this.sel.deck ?? 0 }); break;
            case 'confirm-tuck': this.send({ type: 'power', card: this.me.hand[this.sel.card] }); break;
            default: break;
        }
    }

    // おまかせ：空きの多い鳥から順に置く
    autoLay(n) {
        const room = [];
        HABITATS.forEach(h => this.me.board[h].forEach((slot, i) => room.push({ h, i, free: birdOf(slot.bird).eggs - slot.eggs })));
        const out = [];
        while (out.length < n) {
            room.sort((a, b) => b.free - a.free);
            if (!room[0] || room[0].free <= 0) break;
            room[0].free--;
            out.push({ h: room[0].h, i: room[0].i });
        }
        return out;
    }

    onSheet(e) {
        const t = e.target.closest('button');
        if (!t || t.disabled) return;
        const ds = t.dataset;
        if (ds.sheet) {
            switch (ds.sheet) {
                case 'close': this.closeSheet(); break;
                case 'play': this.confirmPlay(); break;
                case 'act-plain': this.closeSheet(); this.send({ type: 'action', habitat: this.sel.actionHabitat }); break;
                case 'setup': {
                    const s = this.sel.setup;
                    this.closeSheet();
                    this.send({ type: 'setup', birds: s.birds, food: s.food, bonus: s.bonus });
                    break;
                }
                case 'get':
                    this.closeSheet();
                    this.send({ type: 'power', target: this.sel.eggTarget, get: this.sel.get });
                    break;
                case 'clear-get': this.sel.get = []; this.openFoodPick(this.sel.eggTarget); break;
                case 'trade':
                    this.closeSheet();
                    this.send({ type: 'power', give: this.sel.trade.give, get: this.sel.trade.get });
                    break;
                default: break;
            }
            return;
        }
        if (ds.playHab) { this.sel.play.habitat = ds.playHab; this.sel.play.eggs = null; this.sel.play.pay = 0; this.openPlay(this.sel.play.bird); return; }
        if (ds.playPay) { this.sel.play.pay = Number(ds.playPay); this.openPlay(this.sel.play.bird); return; }
        if (ds.playEgg) { const [h, i] = ds.playEgg.split(':'); this.toggleEgg({ h, i: Number(i) }); return; }
        if (ds.bonusCard != null) { this.closeSheet(); this.send({ type: 'action', habitat: 'forest', bonus: { card: this.me.hand[Number(ds.bonusCard)] } }); return; }
        if (ds.bonusFood) { this.closeSheet(); this.send({ type: 'action', habitat: 'grassland', bonus: { food: ds.bonusFood } }); return; }
        if (ds.bonusEgg) { const [h, i] = ds.bonusEgg.split(':'); this.closeSheet(); this.send({ type: 'action', habitat: 'wetland', bonus: { egg: { h, i: Number(i) } } }); return; }
        if (ds.setupBird) {
            const s = this.sel.setup;
            const id = ds.setupBird;
            if (s.birds.includes(id)) s.birds.splice(s.birds.indexOf(id), 1);
            else {
                s.birds.push(id);
                // 合わせて5つを超えたら、餌を1つ戻す
                if (s.birds.length + s.food.length > 5) s.food.pop();
            }
            this.openSetup();
            return;
        }
        if (ds.setupFood) {
            const s = this.sel.setup;
            if (s.food.includes(ds.setupFood)) s.food.splice(s.food.indexOf(ds.setupFood), 1);
            else if (s.birds.length + s.food.length < 5) s.food.push(ds.setupFood);
            this.openSetup();
            return;
        }
        if (ds.setupBonus) { this.sel.setup.bonus = ds.setupBonus; this.openSetup(); return; }
        if (ds.pickBonus) { this.closeSheet(); this.send({ type: 'bonus', id: ds.pickBonus }); return; }
        if (ds.getFood) {
            const n = birdOf(this.myDecision().bird).power.arg;
            if (this.sel.get.length < n) this.sel.get.push(ds.getFood);
            // 1つだけなら、選んだらそのまま決める
            if (n === 1) {
                this.closeSheet();
                this.send({ type: 'power', target: this.sel.eggTarget, get: this.sel.get });
                return;
            }
            this.openFoodPick(this.sel.eggTarget);
            return;
        }
        if (ds.give) { this.sel.trade.give = ds.give; if (this.sel.trade.get === ds.give) this.sel.trade.get = null; this.openTrade(); return; }
        if (ds.get) { this.sel.trade.get = ds.get; this.openTrade(); return; }
        if (ds.takeDie) { this.closeSheet(); this.send({ type: 'take', die: Number(ds.takeDie), as: ds.takeAs }); return; }
        if (ds.peekBird) { this.openDetail(ds.peekBird); }
    }

    toast(message, ms = 1800) {
        const el = $('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
    }
}

// タイトルの絵：3つの生息地に鳥が並ぶ
function titleArt() {
    const picks = ['northern_cardinal', 'american_kestrel', 'great_blue_heron'];
    return `<div class="title-rows">${HABITATS.map((h, k) => `<div class="title-row hab-${h}">${habitatIcon(h, 'ic act-ic')}${birdArt(birdOf(picks[k]))}</div>`).join('')}</div>`;
}

