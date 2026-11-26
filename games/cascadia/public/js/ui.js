/**
 * 画面（タイトル・ゲーム・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 *
 * 置き方：場の組（タイルかトークン）を押して選ぶ。自分の地の光る空きマスを押すと、タイルの下書きが出る。
 * 同じマスをもう一度押すか回転のボタンで向きを変える。光るタイルを押すとトークンの置き場になる（「袋へ」で置かない）。「決定」で決める。
 * 自分の地は、1本指で動かし、2本指（PC はホイール）で拡大・縮小できる。右上のボタンで全体に戻る
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS, bestRotation, suggest } from './cpu-player.js';
import { TILES } from './tiles.js';
import { CARD_IDS, scoreEnv } from './scoring.js';
import { CARD_TEXT, CARD_TITLES } from './cards.js';
import { music } from './music.js';
import { NetplayLobby } from './netplay/netplay-lobby.js';
import { getServerUrl } from './online-config.js';
import { key, parseKey, toPixel, fromPixel, neighbors } from './hex.js';
import { symbolsSvg, tileSvg, tokenSvg, tileOnlySvg, habitatSwatch, natureSvg, hexPoints, ANIMALS, HABITATS, HABITAT_ORDER, ANIMAL_ORDER } from './art.js';

const SETTINGS_KEY = 'cascadia.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ'];
const RESULT_DELAY_MS = 1200;
const S = 10;               // マスの中心から角まで（地の座標）
const MAX_SCALE = 4.6;      // これより大きくは自動で広げない（1マスの幅 約80px）
const MIN_SCALE = 1.2;
const TAP_SLOP = 8;         // これより動いたら、タップではなく動かす操作

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function loadSettings() {
    const fallback = { count: 2, level: 'normal', cardMode: 'A', picked: { bear: 'A', elk: 'A', salmon: 'A', hawk: 'A', fox: 'A' } };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        const picked = {};
        ANIMAL_ORDER.forEach(a => { picked[a] = CARD_IDS.includes(saved.picked?.[a]) ? saved.picked[a] : 'A'; });
        return {
            count: [1, 2, 3, 4].includes(saved.count) ? saved.count : fallback.count,
            level: CPU_LEVELS.includes(saved.level) ? saved.level : fallback.level,
            cardMode: ['A', 'random', 'pick'].includes(saved.cardMode) ? saved.cardMode : 'A',
            picked
        };
    } catch {
        return fallback;
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
        this.lastSeq = 0;
        this.viewSeat = 0;     // 地を見ている人
        this.sel = null;       // 選んだ組 { tile, token }（場の枠）
        this.draft = null;     // タイルの下書き { q, r, rot }
        this.tokenAt = undefined; // トークンの置き場 [q, r]・null（袋へ）・undefined（まだ）
        this.wiping = null;    // 自然トークンで流し直す枠（Set）
        this.cam = { s: 2, tx: 0, ty: 0 };
        this.userCam = false;  // 指で動かしたら、自動で合わせない
        this.fresh = new Set(); // 今描くときに落とすタイル
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        this.bindStatic();
        // オンライン対戦（入口とロビーは netplay-lobby.js の画面）
        this.online = new NetplayLobby({
            title: 'カスカディア',
            game: 'cascadia',
            serverUrl: getServerUrl(),
            cpuStepDelayMs: 1100,
            minPlayers: 2,
            maxPlayers: 4,
            settings: [],
            onStart: (controller) => this.begin(controller),
            onUpdate: () => this.render(),
            onError: (message) => {
                music.play('error');
                this.toast(message);
            },
            onExit: () => this.showTitle()
        });
        this.bindEnv();
        this.renderTitleArt();
        this.renderHelp();
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
        this.begin(controller);
    }

    // ローカル対戦とオンライン対戦で同じ：前の対戦の表示を消して、コントローラーのビューを描く
    begin(controller) {
        if (this.controller !== controller) this.stopGame();
        this.controller = controller;
        this.view = null;
        this.clearSelection();
        this.userCam = false;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        const view = this.controller.getView();
        this.viewSeat = view.you;
        this.lastSeq = view.events.at(-1)?.seq ?? 0; // 始めた時点までの出来事は動かさない
        this.render();
        if (view.phase === 'end') this.showResult();
        if (!controller.isOnline) controller.scheduleCpu();
    }

    newGame() {
        const { count, level, cardMode, picked } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        let cards = { bear: 'A', elk: 'A', salmon: 'A', hawk: 'A', fox: 'A' };
        if (cardMode === 'pick') cards = { ...picked };
        if (cardMode === 'random') ANIMAL_ORDER.forEach(a => { cards[a] = CARD_IDS[Math.floor(Math.random() * CARD_IDS.length)]; });
        this.startGame({ players, options: { cards } });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    // ヒント：CPU（ふつう）が選ぶ組・場所・向き・トークンの置き場を、選んだ状態にする
    showHint() {
        const v = this.view;
        const command = v && this.isMyTurn() ? suggest(v) : null;
        if (!command || command.type !== 'place') return this.toast('自分の番になったら、おすすめを出せます');
        this.clearSelection();
        this.viewSeat = v.you;
        this.sel = { tile: command.tile, token: command.token };
        this.draft = { q: command.q, r: command.r, rot: command.rot };
        this.tokenAt = command.at ? [...command.at] : null;
        this.hint = command;
        this.render();
        this.toast(command.at ? 'おすすめ：この置き方で「決定」' : 'おすすめ：この置き方で「決定」（トークンは戻す）');
    }

    // 選んだ置き方がヒントのままか
    followsHint() {
        const h = this.hint;
        const d = this.draft;
        if (!h || !d || !this.sel || this.sel.tile !== h.tile || this.sel.token !== h.token) return false;
        const at = this.tokenAt ?? null;
        return d.q === h.q && d.r === h.r && d.rot === h.rot && JSON.stringify(at) === JSON.stringify(h.at ?? null);
    }

    // 効果音：新しいできごとを見て、1回の更新に1つだけ鳴らす
    // 自分が置いたら置いた音（自然トークンを得たら得た音）、流し直しは切る音、ほかの人の手のあとは自分の番か知らせ
    playSounds(view, fresh) {
        if (!fresh.length) return;
        const me = view.you;
        const end = fresh.find(e => e.type === 'end');
        if (end) {
            if (!end.winners.includes(me)) return music.play('lose');
            return music.play(end.winners.length > 1 ? 'notify' : 'win');
        }
        const place = fresh.find(e => e.type === 'place' && e.seat === me);
        if (place) return music.play(place.nature ? 'gain' : 'place');
        if (fresh.some(e => e.type === 'wipe' && (e.seat === me || e.auto))) return music.play('shuffle');
        if (fresh.some(e => e.type === 'turn' && e.seat === me)) return music.play('turn');
        if (fresh.some(e => e.type === 'place')) music.play('notify');
    }

    clearSelection() {
        this.hint = null;
        this.sel = null;
        this.draft = null;
        this.tokenAt = undefined;
        this.wiping = null;
    }

    bindStatic() {
        const segment = (selector, attr, apply) => $(selector).addEventListener('click', (event) => {
            const button = event.target.closest(`button[${attr}]`);
            if (!button) return;
            apply(button.getAttribute(attr), button);
            saveSettings(this.settings);
            this.renderSetup();
        });
        segment('#player-count', 'data-count', (v) => { this.settings.count = Number(v); });
        segment('#cpu-level', 'data-level', (v) => { this.settings.level = v; });
        segment('#card-mode', 'data-mode', (v) => { this.settings.cardMode = v; });
        segment('#card-pick', 'data-card', (v, button) => { this.settings.picked[button.dataset.animal] = v; });
        $('#start').addEventListener('click', () => this.newGame());
        $('#online-button').addEventListener('click', () => this.online.open());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#home').addEventListener('click', () => (this.controller?.isOnline ? this.online.confirmLeave() : this.showTitle())); // オンラインは確かめてから部屋を出る
        $('#again').addEventListener('click', () => {
            if (!this.controller?.isOnline) return this.newGame();
            document.querySelectorAll('dialog[open]').forEach(d => d.close());
            this.online.rematch(); // ロビーを出し、ホストの「もう一度」で再戦する
        });
        $('#result-close').addEventListener('click', () => $('#result').close());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.openLog());
        $('#open-cards').addEventListener('click', () => this.openCards());
        $('#fit').addEventListener('click', () => {
            this.userCam = false;
            this.renderEnv();
        });
        $('#rotate').addEventListener('click', () => this.rotateDraft());
        $('#hint').addEventListener('click', () => this.showHint());
        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.addEventListener('click', (event) => {
                if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
            });
        });
        $('#players').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-seat]');
            if (!button || !this.view) return;
            this.viewSeat = Number(button.dataset.seat);
            this.userCam = false;
            this.render();
        });
        $('#market').addEventListener('click', (event) => this.onMarket(event));
        $('#act').addEventListener('click', (event) => this.onAct(event));
        window.addEventListener('resize', () => { if (this.view) this.renderEnv(); });
    }

    // ---- タイトル ----

    renderSetup() {
        const { count, level, cardMode, picked } = this.settings;
        const check = (selector, attr, value) => document.querySelectorAll(`${selector} button[${attr}]`).forEach(b => {
            b.setAttribute('aria-checked', String(b.getAttribute(attr) === String(value)));
        });
        check('#player-count', 'data-count', count);
        check('#cpu-level', 'data-level', level);
        check('#card-mode', 'data-mode', cardMode);
        $('#row-level').style.visibility = count === 1 ? 'hidden' : '';
        const pick = $('#card-pick');
        pick.hidden = cardMode !== 'pick';
        pick.innerHTML = ANIMAL_ORDER.map(a => `<span class="who">${tokenSvg(a, 24)}${ANIMALS[a].name}</span>
            <div class="segmented mini" role="radiogroup" aria-label="${ANIMALS[a].name}">${CARD_IDS.map(c => `<button type="button" role="radio" data-card="${c}" data-animal="${a}" aria-checked="${picked[a] === c}">${c}</button>`).join('')}</div>`).join('');
        // 選ぶ欄を開くと高さが足りないので、絵を隠す
        $('#title-art').hidden = cardMode === 'pick';
    }

    renderTitleArt() {
        // 最初のタイルのような小さな地に、動物を置いた絵
        const sample = [
            { q: 0, r: 0, tile: { habitats: ['forest'], wildlife: ['bear'], keystone: true }, token: 'bear', rot: 0 },
            { q: 1, r: 0, tile: { habitats: ['river', 'wetland'], wildlife: ['salmon'] }, token: 'salmon', rot: 1 },
            { q: -1, r: 1, tile: { habitats: ['prairie', 'forest'], wildlife: ['fox'] }, token: 'fox', rot: 4 },
            { q: 0, r: 1, tile: { habitats: ['prairie', 'river'], wildlife: ['elk'] }, token: 'elk', rot: 5 },
            { q: 1, r: -1, tile: { habitats: ['mountain', 'river'], wildlife: ['hawk'] }, token: 'hawk', rot: 3 },
            { q: -1, r: 0, tile: { habitats: ['mountain', 'forest'], wildlife: ['elk', 'bear'] }, token: null, rot: 2 },
            { q: 0, r: -1, tile: { habitats: ['mountain'], wildlife: ['hawk'], keystone: true }, token: null, rot: 0 }
        ];
        const body = sample.map(t => {
            const { x, y } = toPixel(t.q, t.r, S);
            return tileSvg(t.tile, t.rot, x, y, S, { token: t.token });
        }).join('');
        $('#title-art').innerHTML = `<svg viewBox="-30 -28 60 52">${body}</svg>`;
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const view = this.controller.getView();
        const prev = this.view;
        this.view = view;
        $('#hint').hidden = Boolean(this.controller.isOnline); // ヒントはローカル対戦だけ
        // 新しく置かれたタイルを落とす
        this.fresh = new Set();
        this.playSounds(view, view.events.filter(e => e.seq > this.lastSeq));
        view.events.filter(e => e.seq > this.lastSeq).forEach(e => {
            if (e.type === 'place') this.fresh.add(`${e.seat}:${key(e.q, e.r)}`);
        });
        this.lastSeq = view.events.at(-1)?.seq ?? this.lastSeq;
        const myTurn = this.isMyTurn();
        if (!myTurn) this.clearSelection();
        // 場が変わったら（流し直し）、選びを確かめ直す
        if (this.sel && prev && JSON.stringify(prev.display) !== JSON.stringify(view.display)) this.clearSelection();
        if (myTurn && prev && prev.current !== view.current) this.viewSeat = view.you;
        this.renderStatus();
        this.renderPlayers();
        this.renderEnv();
        this.renderMarket();
        this.renderAct();
        this.renderNote();
        if (view.phase === 'end' && prev && prev.phase !== 'end') {
            clearTimeout(this.resultTimer);
            this.resultTimer = setTimeout(() => this.showResult(), RESULT_DELAY_MS);
        }
    }

    isMyTurn() {
        const v = this.view;
        return !!v && v.phase !== 'end' && v.current === v.you;
    }

    renderStatus() {
        const v = this.view;
        const me = v.players[v.you];
        const left = v.turns - me.turns;
        let text;
        if (v.phase === 'end') text = '終わり';
        else if (v.current === v.you) text = 'あなたの番';
        else text = `${escapeHtml(v.players[v.current].name)}の番`;
        $('#status').innerHTML = `<span>${text}</span><span class="left">残り${left}手</span>`;
    }

    renderPlayers() {
        const v = this.view;
        // 途中は地の点＋自然トークン（最大のつながりのボーナスは終わりに足す）。終わったら合計
        const scores = v.result ? v.result.players.map(s => s.total) : v.players.map(p => scoreEnv(p.env, v.cards).total + p.nature);
        $('#players').innerHTML = v.players.map((p, i) => `<button type="button" class="player${i === v.current && v.phase !== 'end' ? ' current' : ''}${i === this.viewSeat ? ' viewing' : ''}" data-seat="${i}" aria-label="${escapeHtml(p.name)}の地">
            <span class="who">${escapeHtml(p.name)}</span><span class="meta"><span class="pts">${scores[i]}点</span><span class="nat">${natureSvg(13)}${p.nature}</span></span></button>`).join('');
    }

    // 地を描く
    renderEnv() {
        const v = this.view;
        if (!v) return;
        const seat = this.viewSeat;
        const env = v.players[seat].env;
        const mine = seat === v.you && this.isMyTurn();
        const placing = mine && this.sel;
        const lastPlace = [...v.events].reverse().find(e => e.type === 'place' && e.seat === seat);
        const tiles = Object.entries(env).map(([k, spot]) => {
            const [q, r] = parseKey(k);
            const { x, y } = toPixel(q, r, S);
            const cls = [lastPlace && key(lastPlace.q, lastPlace.r) === k ? 'last' : '', this.fresh.has(`${seat}:${k}`) ? 'drop' : ''].join(' ');
            return tileSvg(TILES[spot.tile], spot.rot, x, y, S, { token: spot.token, cls, attrs: `data-key="${k}"` });
        });
        let spots = '';
        let marks = '';
        const bounds = Object.keys(env).map(parseKey);
        if (placing) {
            const open = openSpots(env);
            open.forEach(([q, r]) => bounds.push([q, r]));
            spots = open.map(([q, r]) => {
                const { x, y } = toPixel(q, r, S);
                return `<polygon class="spot${this.draft ? '' : ' on'}" points="${hexPoints(x, y, S * 0.88)}" data-key="${key(q, r)}"/>`;
            }).join('');
            const tileId = v.display.tiles[this.sel.tile];
            const animal = v.display.tokens[this.sel.token];
            if (this.draft) {
                const { q, r, rot } = this.draft;
                const { x, y } = toPixel(q, r, S);
                const onDraft = this.tokenAt && this.tokenAt[0] === q && this.tokenAt[1] === r;
                tiles.push(tileSvg(TILES[tileId], rot, x, y, S, { cls: 'draft', token: onDraft ? animal : null }));
                // トークンを置けるタイル
                targetsFor(env, this.draft, tileId, animal).forEach(([tq, tr]) => {
                    const p = toPixel(tq, tr, S);
                    const chosen = this.tokenAt && this.tokenAt[0] === tq && this.tokenAt[1] === tr;
                    if (!chosen) marks += `<circle class="target" cx="${p.x}" cy="${p.y}" r="${S * 0.78}" data-key="${key(tq, tr)}"/>`;
                });
                if (this.tokenAt && !onDraft) {
                    const p = toPixel(...this.tokenAt, S);
                    const rr = S * 0.62;
                    marks += `<use class="token-draft" href="#a-${animal}" x="${p.x - rr}" y="${p.y - rr}" width="${2 * rr}" height="${2 * rr}"/>`;
                }
            }
        }
        $('#env-spots').innerHTML = spots;
        $('#env-tiles').innerHTML = tiles.join('');
        $('#env-marks').innerHTML = marks;
        const label = $('#env-label');
        label.hidden = seat === v.you;
        label.textContent = seat === v.you ? '' : `${v.players[seat].name}の地`;
        $('#rotate').hidden = !(placing && this.draft && TILES[v.display.tiles[this.sel.tile]].habitats.length > 1);
        if (!this.userCam) this.fitCamera(bounds);
        this.applyCamera();
    }

    // 地の全体が入るように合わせる
    fitCamera(cells) {
        const svg = $('#env');
        const w = svg.clientWidth || 300;
        const h = svg.clientHeight || 300;
        const pts = cells.map(([q, r]) => toPixel(q, r, S));
        const minX = Math.min(...pts.map(p => p.x)) - S;
        const maxX = Math.max(...pts.map(p => p.x)) + S;
        const minY = Math.min(...pts.map(p => p.y)) - S * 1.1;
        const maxY = Math.max(...pts.map(p => p.y)) + S * 1.1;
        const pad = 10;
        const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY)));
        this.cam = { s, tx: w / 2 - s * (minX + maxX) / 2, ty: h / 2 - s * (minY + maxY) / 2 };
    }

    applyCamera() {
        const { s, tx, ty } = this.cam;
        $('#env-root').setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})`);
    }

    // 指の操作（動かす・拡大・タップ）
    bindEnv() {
        const svg = $('#env');
        const pointers = new Map();
        let gesture = null;
        const local = (event) => {
            const rect = svg.getBoundingClientRect();
            return { x: event.clientX - rect.left, y: event.clientY - rect.top };
        };
        svg.addEventListener('pointerdown', (event) => {
            svg.setPointerCapture?.(event.pointerId);
            pointers.set(event.pointerId, local(event));
            if (pointers.size === 1) gesture = { start: local(event), cam: { ...this.cam }, moved: false };
            else gesture = { pinch: true, cam: { ...this.cam }, pts: [...pointers.values()].map(p => ({ ...p })), moved: true };
        });
        svg.addEventListener('pointermove', (event) => {
            if (!pointers.has(event.pointerId) || !gesture) return;
            pointers.set(event.pointerId, local(event));
            if (gesture.pinch && pointers.size >= 2) {
                const [a, b] = [...pointers.values()];
                const [a0, b0] = gesture.pts;
                const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1;
                const d1 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
                const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                const s = clamp(gesture.cam.s * d1 / d0, 0.6, 9);
                const wx = (m0.x - gesture.cam.tx) / gesture.cam.s;
                const wy = (m0.y - gesture.cam.ty) / gesture.cam.s;
                this.cam = { s, tx: m1.x - wx * s, ty: m1.y - wy * s };
                this.userCam = true;
                this.applyCamera();
                return;
            }
            const p = local(event);
            const dx = p.x - gesture.start.x;
            const dy = p.y - gesture.start.y;
            if (!gesture.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
            gesture.moved = true;
            this.cam = { ...gesture.cam, tx: gesture.cam.tx + dx, ty: gesture.cam.ty + dy };
            this.userCam = true;
            this.applyCamera();
        });
        const end = (event) => {
            if (!pointers.has(event.pointerId)) return;
            const p = local(event);
            pointers.delete(event.pointerId);
            if (gesture && !gesture.moved && !gesture.pinch && event.type === 'pointerup') this.onEnvTap(p);
            if (pointers.size === 0) gesture = null;
            else if (pointers.size === 1) {
                const [rest] = [...pointers.values()];
                gesture = { start: { ...rest }, cam: { ...this.cam }, moved: true };
            }
        };
        svg.addEventListener('pointerup', end);
        svg.addEventListener('pointercancel', end);
        svg.addEventListener('wheel', (event) => {
            event.preventDefault();
            const p = local(event);
            const s = clamp(this.cam.s * Math.exp(-event.deltaY * 0.0015), 0.6, 9);
            const wx = (p.x - this.cam.tx) / this.cam.s;
            const wy = (p.y - this.cam.ty) / this.cam.s;
            this.cam = { s, tx: p.x - wx * s, ty: p.y - wy * s };
            this.userCam = true;
            this.applyCamera();
        }, { passive: false });
    }

    // 地のタップ：空きマスならタイルの下書き、光るタイルならトークンの置き場
    onEnvTap(p) {
        const v = this.view;
        if (!v || !this.isMyTurn() || this.viewSeat !== v.you || !this.sel) return;
        const wx = (p.x - this.cam.tx) / this.cam.s;
        const wy = (p.y - this.cam.ty) / this.cam.s;
        const [q, r] = fromPixel(wx, wy, S);
        const k = key(q, r);
        const env = v.players[v.you].env;
        const tileId = v.display.tiles[this.sel.tile];
        const animal = v.display.tokens[this.sel.token];
        if (this.draft) {
            const isTarget = targetsFor(env, this.draft, tileId, animal).some(([tq, tr]) => tq === q && tr === r);
            const onDraft = this.draft.q === q && this.draft.r === r;
            if (isTarget) {
                // 光るタイル：トークンの置き場を切り替える
                const same = this.tokenAt && this.tokenAt[0] === q && this.tokenAt[1] === r;
                this.tokenAt = same ? undefined : [q, r];
                this.render();
                return;
            }
            if (onDraft) {
                this.rotateDraft();
                return;
            }
        }
        if (!env[k] && neighbors(q, r).some(([x, y]) => env[key(x, y)])) {
            this.draft = { q, r, rot: bestRotation(env, TILES[tileId], q, r) };
            // 前の下書きに置いていたトークンは外す
            if (this.tokenAt && !env[key(...this.tokenAt)]) this.tokenAt = undefined;
            if (!targetsFor(env, this.draft, tileId, animal).length) this.tokenAt = null;
            else if (this.tokenAt === null) this.tokenAt = undefined;
            this.render();
        }
    }

    rotateDraft() {
        if (!this.draft) return;
        this.draft = { ...this.draft, rot: (this.draft.rot + 5) % 6 };
        this.render();
    }

    renderMarket() {
        const v = this.view;
        const mine = this.isMyTurn();
        $('#market').classList.toggle('choose', mine && !this.sel && !this.wiping);
        $('#market').innerHTML = v.display.tiles.map((tileId, i) => {
            const animal = v.display.tokens[i];
            const tileSel = this.sel?.tile === i;
            const tokenSel = this.sel?.token === i;
            const wipe = this.wiping?.has(i);
            const taken = this.sel && !tileSel && !tokenSel;
            return `<div class="pair${taken ? ' taken' : ''}">
                <button type="button" class="m-tile${tileSel ? ' sel' : ''}" data-slot="${i}" data-part="tile" ${mine ? '' : 'disabled'} aria-label="${tileLabel(tileId)}">${tileId == null ? '' : tileOnlySvg(TILES[tileId], 0, 54)}</button>
                <button type="button" class="m-token${tokenSel ? ' sel' : ''}${wipe ? ' wipe' : ''}" data-slot="${i}" data-part="token" ${mine ? '' : 'disabled'} aria-label="${animal ? ANIMALS[animal].name : ''}">${animal ? tokenSvg(animal, 32) : ''}</button>
            </div>`;
        }).join('');
    }

    onMarket(event) {
        const button = event.target.closest('button[data-slot]');
        if (!button || !this.isMyTurn()) return;
        const v = this.view;
        const slot = Number(button.dataset.slot);
        const part = button.dataset.part;
        const me = v.players[v.you];
        if (this.wiping) {
            if (part !== 'token') return;
            music.play('select');
            if (this.wiping.has(slot)) this.wiping.delete(slot);
            else this.wiping.add(slot);
            this.render();
            return;
        }
        const prevAnimal = this.sel ? v.display.tokens[this.sel.token] : null;
        if (part === 'tile' || !this.sel) {
            const keepToken = this.sel && part === 'tile' && this.sel.token !== this.sel.tile ? this.sel.token : null;
            this.sel = { tile: slot, token: keepToken ?? slot };
            if (this.sel.tile !== this.sel.token && me.nature < 1) this.sel.token = slot;
        } else if (slot !== this.sel.tile) {
            if (me.nature < 1) {
                music.play('error');
                this.toast('別々の組から取るには、自然トークンが要ります');
                return;
            }
            this.sel = { ...this.sel, token: this.sel.token === slot ? this.sel.tile : slot };
        } else {
            this.sel = { ...this.sel, token: slot };
        }
        music.play('select');
        if (v.display.tokens[this.sel.token] !== prevAnimal) this.tokenAt = undefined;
        if (this.draft) {
            const env = me.env;
            const tileId = v.display.tiles[this.sel.tile];
            const targets = targetsFor(env, this.draft, tileId, v.display.tokens[this.sel.token]);
            if (this.tokenAt && !targets.some(([q, r]) => q === this.tokenAt[0] && r === this.tokenAt[1])) this.tokenAt = undefined;
            if (!targets.length) this.tokenAt = null;
        }
        this.render();
    }

    renderAct() {
        const v = this.view;
        const me = v.players[v.you];
        const mine = this.isMyTurn();
        const nature = `<span class="nature" title="自然トークン">${natureSvg(22)}${me.nature}</span>`;
        let buttons = '';
        if (mine && this.wiping) {
            buttons = `<button class="btn small secondary" data-act="wipe-cancel">やめる</button>
                <button class="btn small primary" data-act="wipe-go" ${this.wiping.size ? '' : 'disabled'}>流す</button>`;
        } else if (mine && this.sel) {
            const back = this.tokenAt === null;
            buttons = `<button class="btn small secondary" data-act="cancel">やめる</button>
                <button class="btn small secondary" data-act="bag" ${this.draft ? '' : 'disabled'} aria-pressed="${back}">${back ? 'トークンを置く' : '袋へ'}</button>
                <button class="btn small primary${this.followsHint() ? ' recommended' : ''}" data-act="place" ${this.draft && this.tokenAt !== undefined ? '' : 'disabled'}>${'<svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>'}決定</button>`;
        } else if (mine) {
            if (v.canReplace3) buttons += '<button class="btn small secondary" data-act="replace3">3つ流す</button>';
            if (me.nature > 0) buttons += '<button class="btn small secondary" data-act="wipe">自然トークンで流す</button>';
        }
        $('#act').innerHTML = nature + buttons;
    }

    onAct(event) {
        const button = event.target.closest('button[data-act]');
        if (!button || !this.isMyTurn()) return;
        const act = button.dataset.act;
        const v = this.view;
        if (act === 'replace3') this.send({ type: 'replace3' });
        else if (act === 'wipe') {
            this.clearSelection();
            this.wiping = new Set();
            this.render();
        } else if (act === 'wipe-cancel') {
            this.wiping = null;
            this.render();
        } else if (act === 'wipe-go') {
            const slots = [...this.wiping].sort((a, b) => a - b);
            this.wiping = null;
            this.send({ type: 'wipe', slots });
        } else if (act === 'cancel') {
            this.clearSelection();
            this.render();
        } else if (act === 'bag') {
            if (this.tokenAt === null) {
                const env = v.players[v.you].env;
                const targets = targetsFor(env, this.draft, v.display.tiles[this.sel.tile], v.display.tokens[this.sel.token]);
                if (!targets.length) {
                    this.toast('この動物を置けるタイルがありません');
                    return;
                }
                this.tokenAt = undefined;
            } else this.tokenAt = null;
            this.render();
        } else if (act === 'place') {
            if (!this.draft || this.tokenAt === undefined) return;
            const { q, r, rot } = this.draft;
            const command = { type: 'place', tile: this.sel.tile, token: this.sel.token, q, r, rot, at: this.tokenAt };
            this.clearSelection();
            this.send(command);
        }
    }

    send(command) {
        if (!this.controller) return;
        if (!this.controller.send(command)) this.render();
    }

    // 下の1行：選んだ組と、置いたときの得点の見込み
    renderNote() {
        const v = this.view;
        const note = $('#note');
        if (v.phase === 'end') {
            note.textContent = '';
            return;
        }
        if (!this.isMyTurn()) {
            const last = [...v.events].reverse().find(e => e.type === 'place');
            note.textContent = last ? `${v.players[last.seat].name}：${tileLabel(last.tile)}・${ANIMALS[last.animal].name}${last.at ? '' : 'は袋へ'}` : '';
            return;
        }
        if (this.wiping) {
            note.textContent = '流すトークンを選んでください';
            return;
        }
        if (!this.sel) {
            note.textContent = '組を選んでください';
            return;
        }
        const me = v.players[v.you];
        const split = this.sel.tile !== this.sel.token;
        if (!this.draft) {
            note.textContent = split ? '自然トークンを1つ使って、別々に取ります' : 'タイルを置く場所を選んでください';
            return;
        }
        // 得点の見込み
        const env = structuredClone(me.env);
        const tileId = v.display.tiles[this.sel.tile];
        const animal = v.display.tokens[this.sel.token];
        const before = scoreEnv(me.env, v.cards);
        env[key(this.draft.q, this.draft.r)] = { tile: tileId, rot: this.draft.rot, token: null };
        if (this.tokenAt) env[key(...this.tokenAt)].token = animal;
        const after = scoreEnv(env, v.cards);
        const gain = after.total - before.total;
        if (this.tokenAt === undefined) note.textContent = 'トークンを置くタイルを選んでください';
        else note.textContent = `この手で ${gain >= 0 ? '+' : ''}${gain}点${split ? '（自然トークン −1）' : ''}`;
    }

    // ---- ダイアログ ----

    openLog() {
        const v = this.view;
        $('#log-list').innerHTML = (v?.logs ?? []).map(t => `<li>${escapeHtml(t)}</li>`).join('');
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    openCards() {
        const v = this.view;
        if (!v) return;
        const mine = scoreEnv(v.players[this.viewSeat].env, v.cards);
        $('#cards-body').innerHTML = ANIMAL_ORDER.map(a => cardHtml(a, v.cards[a], mine.wildlife[a])).join('')
            + `<p class="card-note">地形は、それぞれのいちばん大きいつながりのタイル数が点になります。${v.players.length === 1 ? '' : v.players.length === 2 ? 'つながりが相手より大きい地形は +2点（同じなら +1点ずつ）。' : 'つながりがいちばん大きい人は +3点、2番目の人は +1点。'}</p>`;
        $('#cards').showModal();
    }

    showResult() {
        const v = this.view;
        if (!v?.result) return;
        const res = v.result;
        const winners = new Set(res.winners);
        const title = v.solo ? `${res.players[0].total}点` : res.winners.includes(v.you) ? (res.winners.length > 1 ? '引き分け' : 'あなたの勝ち') : `${res.winners.map(i => v.players[i].name).join('と')}の勝ち`;
        $('#result-title').textContent = title;
        const cols = v.players.map((p, i) => `<th class="${winners.has(i) ? 'win' : ''}">${escapeHtml(p.name)}</th>`).join('');
        const row = (label, values) => `<tr><td><span class="ic">${label}</span></td>${values.map(x => `<td>${x}</td>`).join('')}</tr>`;
        const rows = [
            ...ANIMAL_ORDER.map(a => row(`${tokenSvg(a, 18)}${ANIMALS[a].name}<small>${v.cards[a]}</small>`, res.players.map(s => s.wildlife[a]))),
            ...HABITAT_ORDER.map(h => row(`${habitatSwatch(h, 16)}${HABITATS[h].name}`, res.players.map(s => `${s.habitat[h]}${s.bonus[h] ? `<span class="bonus">+${s.bonus[h]}</span>` : ''}`))),
            row(`${natureSvg(16)}自然`, res.players.map(s => s.nature)),
            `<tr class="total"><td>合計</td>${res.players.map((s, i) => `<td class="${winners.has(i) ? 'win' : ''}">${s.total}</td>`).join('')}</tr>`
        ];
        $('#result-table').innerHTML = `<table><thead><tr><th></th>${cols}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
        $('#result').showModal();
    }

    renderHelp() {
        const legendH = HABITAT_ORDER.map(h => `<span>${habitatSwatch(h, 24)}${HABITATS[h].name}</span>`).join('');
        const legendA = ANIMAL_ORDER.map(a => `<span>${tokenSvg(a, 26)}${ANIMALS[a].name}</span>`).join('');
        $('#help-body').innerHTML = `
            <h3>目的</h3>
            <p>タイルをつなげて自分の地を広げ、動物を住まわせます。20手番のあと、<strong>動物の得点カード</strong>と<strong>地形のつながり</strong>の点の合計が多い人の勝ちです。</p>
            <div class="help-legend">${legendH}</div>
            <div class="help-legend">${legendA}</div>
            <h3>手番</h3>
            <p>場の4組から、タイルとトークンの組を1つ取ります。タイルは自分の地のとなりに好きな向きで置き、トークンはその動物の印があって、まだトークンのないタイルに置きます（取ったタイルでなくてよい）。置かずに袋へ戻してもかまいません。</p>
            <h3>キーストーンと自然トークン</h3>
            <p>1つの地形だけのタイル（キーストーン）に動物を置くと、自然トークン ${natureSvg(16)} を1つもらえます。自然トークンを1つ使うと、<strong>タイルとトークンを別々の組から</strong>取るか、<strong>好きなトークンを好きな数だけ流し直せ</strong>ます。残った自然トークンは1つ1点です。</p>
            <h3>流し直し</h3>
            <p>場のトークンが4つとも同じ動物なら、自動で流し直します。3つ同じなら、手番の初めに1回だけ、その3つを流し直せます。</p>
            <h3>得点</h3>
            <p>動物は、各動物の得点カード（A〜D のどれか）の形に並べると点になります（右上のカードのボタンで確かめられます）。地形は、それぞれの<strong>いちばん大きいつながり</strong>のタイル数が点になり、その大きさで勝った人にボーナスがあります（2人：+2、同じなら +1ずつ。3〜4人：1番 +3、2番 +1）。</p>
            <h3>操作</h3>
            <p>場の組を押して選び、自分の地の光るマスを押すとタイルが出ます。同じマスをもう一度押すか ${'<svg class="ico" style="--ico:16px" aria-hidden="true"><use href="#i-rotate"/></svg>'} で回します。光るタイルを押してトークンを置き、「決定」。別の組のトークンを押すと、自然トークンを使って別々に取れます。地は指で動かし、2本指で広げられます。相手の名前を押すと、相手の地が見られます。電球のボタンを押すと、おすすめの置き方を選んだ状態にします。</p>`;
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}

// ---- 地の計算（ビューから） ----

function openSpots(env) {
    const spots = new Map();
    Object.keys(env).forEach(k => {
        const [q, r] = parseKey(k);
        neighbors(q, r).forEach(([x, y]) => {
            const nk = key(x, y);
            if (!env[nk]) spots.set(nk, [x, y]);
        });
    });
    return [...spots.values()];
}

// トークンを置けるタイル（下書きのタイルも含む）
function targetsFor(env, draft, tileId, animal) {
    const out = [];
    Object.entries(env).forEach(([k, spot]) => {
        if (!spot.token && TILES[spot.tile].wildlife.includes(animal)) out.push(parseKey(k));
    });
    if (draft && TILES[tileId].wildlife.includes(animal)) out.push([draft.q, draft.r]);
    return out;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function tileLabel(tileId) {
    if (tileId == null) return '';
    const t = TILES[tileId];
    return t.habitats.map(h => HABITATS[h].name).join('と');
}

function cardHtml(animal, id, points) {
    return `<div class="card">
        <div class="head">${tokenSvg(animal, 30)}<span>${id}</span></div>
        <div class="title">${ANIMALS[animal].name}：${escapeHtml(CARD_TITLES[animal][id])} <span class="mine">${points}点</span></div>
        <div class="text">${CARD_TEXT[animal][id]}</div>
    </div>`;
}

