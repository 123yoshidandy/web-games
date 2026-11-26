// netplay-kit 1.10.0（74a9d2b）からコピーしたファイル。ここでは直さず、netplay-kit で直してから同期する
/**
 * オンライン対戦の入口とロビーの画面（どのゲームでも同じ見た目と流れ）と、ローカル対戦と同じ形のコントローラー
 * 画面は自分で作る（body の下に重ねて出す）。ゲームの側は、始まった・更新された・抜けた、の知らせを受けて盤面を描くだけ
 *
 * 使い方（ゲームの main.js。ES モジュール）:
 *   import { NetplayLobby, resolveOnlineServerUrl } from './netplay/netplay-lobby.js';
 *   const online = new NetplayLobby({
 *       title: 'アズール', game: 'azul',
 *       serverUrl: resolveOnlineServerUrl({ game: 'azul', deployed: DEPLOYED_SERVER_URL }), // null ならオンラインのボタンを隠す
 *       cpuStepDelayMs: 650, allowCpu: true, minPlayers: 2, maxPlayers: 4,
 *       settings: [{ key: 'level', label: 'CPU', options: [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }] }],
 *       onStart: (controller) => { app.controller = controller; showScene('game'); update(); }, // 対戦が始まった（再戦・再接続でも呼ぶ）
 *       onUpdate: () => update(),                 // 対戦中にビューが届いた
 *       onError: (message) => showNote(message),  // 対戦中に操作を断られた・接続が切れた
 *       onExit: () => showScene('title')          // 部屋を出た
 *   });
 *   online.open();           // 「オンラインで遊ぶ」のボタンで
 *   await online.boot();     // 起動時に1回。招待URL（?room=）か、前回の部屋があれば入る（入ったら true）
 *   online.rematch();        // 結果の「もう一度」で（ロビーを出す。ホストが開始を押すと再戦）
 *   online.confirmLeave();   // 対戦中の「ホーム」で（確認してから部屋を出る）
 *
 * コントローラー（onStart で受け取る）は LocalGameController と同じく getView()・send(command) を持つ
 * hint・pause・resume・stop・undo は何もしない（オンラインではヒントと待ったを出さない。isOnline で見分ける）
 */

import NetplayClient from './netplay-client.mjs';

const LOCAL_SERVER_URL = 'ws://localhost:8787';
const NAME_KEY = 'netplay.name';           // 名前は全ゲームで共有する（同じサイトなので）
const REPLY_TIMEOUT_MS = 8000;             // 操作の返事がこれだけ来なければ、取りこぼしとみなして状態を取り直す
const MAX_NAME_LENGTH = 12;

// 接続先：?server= があればそれ、手元（localhost）なら手元のテスト用サーバー、なければ配備先（空なら null：オンラインなし）
// どれにも ?game=<ゲーム> を付ける（1つのサーバーで全ゲームを受け持つため。付いていればそのまま）
export function resolveOnlineServerUrl({ game, deployed = '', local = LOCAL_SERVER_URL } = {}) {
    if (typeof location === 'undefined') return deployed ? withGame(deployed, game) : null;
    const override = new URLSearchParams(location.search).get('server');
    if (override) return withGame(override, game);
    if (['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:') return withGame(local, game);
    return deployed ? withGame(deployed, game) : null;
}

function withGame(url, game) {
    if (!game) return url;
    const parsed = new URL(url);
    if (!parsed.searchParams.has('game')) parsed.searchParams.set('game', game);
    return parsed.toString();
}

// ===== コントローラー（ローカル対戦の LocalGameController と同じ形） =====

export class OnlineGameController {
    constructor({ serverUrl, storageKey, cpuStepDelayMs = 0, hydrate = (view) => view }) {
        this.isOnline = true;
        this.view = null;
        this.awaitingResponse = false; // 操作を送ってから返事が届くまで（二重に送らない）
        this.hydrate = hydrate;
        this.listeners = new Map();
        this.replyTimer = null;
        this.net = new NetplayClient({ serverUrl, storageKey, cpuStepDelayMs });
        this.net.on('state', ({ view }) => {
            this.settle();
            this.view = this.hydrate(view);
            this.emit('update');
        });
        this.net.on('error', (error) => {
            this.settle();
            this.emit('error', error);
        });
    }

    on(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
    }

    emit(type, payload) {
        this.listeners.get(type)?.forEach(listener => listener(payload));
    }

    settle() {
        this.awaitingResponse = false;
        clearTimeout(this.replyTimer);
    }

    get seat() { return this.net.seat; }
    get lobby() { return this.net.lobby; }
    isHost() { return this.net.isHost(); }

    getView() {
        return this.view;
    }

    // 送れたら true（返事を待つ間と、つながっていないときは false）
    send(command) {
        if (this.awaitingResponse) return false;
        if (!this.net.send('command', { command })) {
            this.emit('error', { message: 'サーバーとの接続が切れています。つなぎ直しています…', code: 'not_connected' });
            return false;
        }
        this.awaitingResponse = true;
        clearTimeout(this.replyTimer);
        this.replyTimer = setTimeout(() => {
            this.awaitingResponse = false;
            this.net.resume().catch(() => {});
        }, REPLY_TIMEOUT_MS);
        return true;
    }

    // ローカル対戦にだけある操作（画面が ?. で呼んでも困らないように置く）
    hint() { return null; }
    undo() { return false; }
    pause() {}
    resume() {}
    stop() {}
}

// ===== 入口とロビーの画面 =====

const STYLE = `
.netplay-lobby{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;box-sizing:border-box;
  padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  background:rgba(10,14,20,.55);font-family:inherit;touch-action:manipulation;overscroll-behavior:contain;-webkit-tap-highlight-color:transparent}
.netplay-lobby[hidden]{display:none}
.netplay-lobby *{box-sizing:border-box}
.np-card{width:min(420px,100%);max-height:100%;overflow:auto;overscroll-behavior:contain;background:var(--np-bg,#fffdf8);color:var(--np-fg,#1f2328);
  border-radius:16px;padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.35);font-size:16px;line-height:1.5}
.np-title{margin:0 0 12px;font-size:20px;font-weight:700;text-align:center}
.np-panel[hidden],.np-card [hidden]{display:none!important}
.np-field{display:flex;align-items:center;gap:10px;margin:10px 0}
.np-field>span{flex:0 0 auto;min-width:4.5em;font-size:14px;color:var(--np-muted,#57606a)}
.np-field input[type=text]{flex:1 1 auto;min-width:0;height:44px;padding:0 12px;font:inherit;font-size:16px;color:inherit;background:var(--np-input,#fff);
  border:1px solid var(--np-line,#c9ced6);border-radius:10px}
.np-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:12px 0}
.np-row>button{flex:1 1 0}
.netplay-lobby button{min-height:44px;padding:8px 14px;font:inherit;font-size:15px;font-weight:600;color:var(--np-fg,#1f2328);background:var(--np-button,#eef1f4);
  border:1px solid var(--np-line,#c9ced6);border-radius:10px;cursor:pointer}
.netplay-lobby button.np-primary{color:var(--np-accent-fg,#fff);background:var(--np-accent,#2f6fde);border-color:transparent}
.netplay-lobby button:disabled{opacity:.45;cursor:default}
.np-check{display:inline-flex;align-items:center;gap:6px;min-height:44px;font-size:14px}
.np-check input{width:20px;height:20px}
.np-message{margin:8px 0;padding:8px 10px;border-radius:8px;font-size:14px;background:var(--np-warn-bg,#fff1e5);color:var(--np-warn-fg,#8a3b00)}
.np-note{margin:8px 0;font-size:14px;color:var(--np-muted,#57606a);text-align:center}
.np-rooms,.np-players{list-style:none;margin:8px 0;padding:0}
.np-rooms li{margin:6px 0}
.np-rooms button{width:100%;text-align:left}
.np-players li{display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 10px;margin:6px 0;border-radius:10px;background:var(--np-button,#eef1f4)}
.np-players .np-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.np-players .np-tag{flex:0 0 auto;font-size:12px;padding:2px 8px;border-radius:999px;background:var(--np-bg,#fffdf8);color:var(--np-muted,#57606a)}
.np-players button{min-height:36px;padding:4px 10px;font-size:13px}
.np-code{margin:0 0 4px;text-align:center;font-size:15px}
.np-code b{font-size:26px;letter-spacing:.12em;margin:0 4px}
.np-badge{font-size:12px;padding:2px 8px;border-radius:999px;background:var(--np-accent,#2f6fde);color:var(--np-accent-fg,#fff);vertical-align:middle}
.np-setting{margin:10px 0}
.np-setting>span{display:block;font-size:14px;color:var(--np-muted,#57606a);margin-bottom:4px}
.np-segment{display:flex;gap:6px}
.np-segment button{flex:1 1 0}
.np-segment button[aria-pressed=true]{color:var(--np-accent-fg,#fff);background:var(--np-accent,#2f6fde);border-color:transparent}
.netplay-offline{position:fixed;left:50%;top:max(8px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483001;padding:6px 14px;border-radius:999px;
  font-size:13px;color:#fff;background:rgba(180,40,40,.92);pointer-events:none}
.netplay-offline[hidden]{display:none}
`;

const HTML = `
<div class="np-card" role="dialog" aria-modal="true" aria-labelledby="np-title">
  <h2 class="np-title" id="np-title"></h2>
  <p class="np-message" data-ref="message" hidden></p>
  <section class="np-panel" data-panel="menu">
    <label class="np-field"><span>名前</span><input type="text" data-ref="name" maxlength="${MAX_NAME_LENGTH}" autocomplete="nickname" enterkeyhint="done"></label>
    <div class="np-row" data-ref="create-row">
      <button type="button" class="np-primary" data-act="create">部屋を作る</button>
      <label class="np-check" title="公開の部屋の一覧に出し、部屋番号を知らない人も入れるようにします"><input type="checkbox" data-ref="public">公開</label>
    </div>
    <label class="np-field" data-ref="code-row"><span>部屋番号</span><input type="text" data-ref="code" inputmode="numeric" autocomplete="off" enterkeyhint="go"></label>
    <div class="np-row"><button type="button" class="np-primary" data-act="join">参加する</button></div>
    <div data-ref="find-row">
      <div class="np-row"><button type="button" data-act="find">公開の部屋を探す</button></div>
      <ul class="np-rooms" data-ref="rooms"></ul>
    </div>
    <div class="np-row"><button type="button" data-act="close">戻る</button></div>
  </section>
  <section class="np-panel" data-panel="lobby" hidden>
    <p class="np-code">部屋<b data-ref="room-code"></b><span class="np-badge" data-ref="room-public">公開</span></p>
    <p class="np-note" data-ref="count"></p>
    <div class="np-row"><button type="button" data-act="invite">招待URLを共有</button></div>
    <ul class="np-players" data-ref="players"></ul>
    <div data-ref="settings"></div>
    <div class="np-row" data-ref="host-row">
      <button type="button" data-act="add-cpu">CPUを追加</button>
      <button type="button" class="np-primary" data-act="start">ゲーム開始</button>
    </div>
    <p class="np-note" data-ref="guest-note">部屋を作った人がゲームを始めるまでお待ちください</p>
    <div class="np-row">
      <button type="button" data-act="back-to-game" hidden>盤面を見る</button>
      <button type="button" data-act="leave">部屋を出る</button>
    </div>
  </section>
  <section class="np-panel" data-panel="wait" hidden>
    <p class="np-note" data-ref="wait-text">つないでいます…</p>
    <div class="np-row"><button type="button" data-act="cancel">やめる</button></div>
  </section>
  <section class="np-panel" data-panel="leave" hidden>
    <p class="np-note">部屋を出ます。対戦中なら、あなたの席は CPU が引き継ぎます。</p>
    <div class="np-row">
      <button type="button" data-act="back-to-game">戻る</button>
      <button type="button" class="np-primary" data-act="leave">部屋を出る</button>
    </div>
  </section>
</div>`;

const ERROR_TEXT = {
    not_connected: 'サーバーにつながりません。時間をおいてやり直してください',
    disconnected: 'サーバーとの接続が切れました',
    timeout: 'サーバーから返事がありません',
    room_not_found: 'その部屋は見つかりません'
};
const errorText = (error) => (error?.fromServer ? error.message : ERROR_TEXT[error?.code] ?? error?.message ?? 'うまくいきませんでした');

export class NetplayLobby {
    constructor({
        title = 'オンライン対戦', game = '', serverUrl, storageKey = `${game || 'game'}.online`, cpuStepDelayMs = 0, hydrate,
        allowCpu = true, minPlayers = 2, maxPlayers = 4, settings = [],
        onStart = () => {}, onUpdate = () => {}, onError = () => {}, onExit = () => {}, onLobby = () => {}
    } = {}) {
        Object.assign(this, { title, serverUrl, storageKey, cpuStepDelayMs, hydrate, allowCpu, minPlayers, maxPlayers, settings });
        this.callbacks = { onStart, onUpdate, onError, onExit, onLobby };
        this.controller = null;
        this.mode = 'closed';   // closed（使っていない）/ menu / wait / lobby（ロビーの画面を出している）/ playing（盤面）
        this.matchId = null;    // onStart を呼んだ対戦
        this.root = null;
    }

    // オンライン対戦ができるか（接続先がなければ、ゲームの側でボタンを隠す）
    get available() {
        return Boolean(this.serverUrl);
    }

    // 部屋に入っているか（対戦中・ロビー・再接続中）
    get active() {
        return this.mode !== 'closed' && this.mode !== 'menu';
    }

    // ===== ゲームから呼ぶ =====

    // 起動時に1回：招待URLか、前回の部屋に戻る。入ったら true
    async boot() {
        if (!this.available) return false;
        const invited = NetplayClient.inviteRoomCode();
        const session = this.connect().net.session;
        if (session && (!invited || invited === session.roomCode)) {
            this.showWait('前回の部屋に戻っています…');
            this.pending = 'resume';
            try {
                await this.controller.net.resume();
                return true;
            } catch {
                this.close();
                return false;
            }
        }
        if (invited) {
            this.open({ roomCode: invited, invited: true });
            if (this.savedName()) await this.join();
            return true;
        }
        return false;
    }

    // 入口（名前・部屋を作る・部屋番号で入る・公開の部屋）を出す
    open({ roomCode = '', invited = false } = {}) {
        if (!this.available) return;
        this.mount();
        this.ref('name').value = this.savedName();
        this.ref('code').value = roomCode;
        this.ref('code').maxLength = NetplayClient.ROOM_CODE_LENGTH;
        this.ref('code').placeholder = `${NetplayClient.ROOM_CODE_LENGTH}桁の数字`;
        this.ref('rooms').replaceChildren();
        this.root.querySelector('#np-title').textContent = invited ? `部屋 ${roomCode} に参加` : `${this.title}：オンライン対戦`;
        ['create-row', 'code-row', 'find-row'].forEach(name => { this.ref(name).hidden = invited; });
        this.show('menu');
        if (invited && !this.savedName()) this.ref('name').focus();
    }

    // 結果の「もう一度」：ロビーを出す（ホストが「ゲーム開始」で再戦する）
    rematch() {
        if (!this.controller?.lobby) return;
        this.show('lobby');
        this.renderLobby(this.controller.lobby);
    }

    // 対戦中の「ホーム」：確認してから部屋を出る
    confirmLeave() {
        if (!this.controller) return this.callbacks.onExit();
        this.mount();
        this.show('leave');
    }

    // 部屋を出て、オンライン対戦を終える
    leave() {
        const net = this.controller?.net;
        if (net && (net.isInRoom() || net.session)) net.leave();
        else net?.close();
        this.close();
        this.callbacks.onExit();
    }

    // ===== 接続 =====

    connect() {
        if (this.controller) return this.controller;
        const controller = new OnlineGameController({
            serverUrl: this.serverUrl, storageKey: this.storageKey, cpuStepDelayMs: this.cpuStepDelayMs, hydrate: this.hydrate
        });
        controller.net.on('lobby', (lobby) => this.onLobby(lobby));
        controller.net.on('connection', (connected) => this.showOffline(!connected && this.active));
        controller.on('update', () => this.onState());
        // サーバーの error（enterRoom の失敗は reject でも届くので、そちらで知らせる）
        controller.on('error', (error) => {
            const message = error?.message ?? 'うまくいきませんでした';
            const pending = this.pending;
            this.pending = null;
            if (this.mode === 'playing') this.callbacks.onError(message);
            else if (pending === 'resume') this.close();          // 前回の部屋はもうない（参加情報は NetplayClient が消す）
            else if (pending === 'create') {
                this.show('menu');
                this.showMessage(message);
            } else if (pending !== 'join' && this.mode !== 'closed') this.showMessage(message);
        });
        this.controller = controller;
        return controller;
    }

    get net() {
        return this.connect().net;
    }

    close() {
        this.controller?.settle();
        this.controller = null;
        this.matchId = null;
        this.pending = null;  // 返事を待っている入口の操作（resume・create・join）
        this.mode = 'closed';
        if (this.root) this.root.hidden = true;
        this.showOffline(false);
    }

    onLobby(lobby) {
        this.pending = null;
        this.callbacks.onLobby(lobby);
        if (this.mode === 'closed') return;
        if (lobby.status === 'lobby') {
            if (this.mode === 'playing') this.matchId = null;
            this.show('lobby');
            this.renderLobby(lobby);
            return;
        }
        if (this.mode === 'lobby' || this.mode === 'leave') this.renderLobby(lobby);
        this.onState();
    }

    // 対戦の状態が届いた：新しい対戦なら onStart、続きなら onUpdate
    onState() {
        const controller = this.controller;
        const lobby = controller?.lobby;
        if (!controller?.view || !lobby || lobby.status === 'lobby' || this.mode === 'closed') return;
        if (this.matchId !== lobby.matchId) {
            this.matchId = lobby.matchId;
            this.mode = 'playing';
            this.root.hidden = true;
            this.callbacks.onStart(controller);
            return;
        }
        if (this.mode === 'wait') {
            this.mode = 'playing';
            this.root.hidden = true;
        }
        this.callbacks.onUpdate(controller);
    }

    // ===== 入口の操作 =====

    savedName() {
        try {
            return localStorage.getItem(NAME_KEY) ?? '';
        } catch {
            return '';
        }
    }

    readName() {
        const name = this.ref('name').value.trim().slice(0, MAX_NAME_LENGTH);
        if (!name) {
            this.showMessage('名前を入れてください');
            this.ref('name').focus();
            return null;
        }
        try {
            localStorage.setItem(NAME_KEY, name);
        } catch {
            // 保存できなくても遊べる
        }
        return name;
    }

    async create() {
        const name = this.readName();
        if (!name) return;
        const isPublic = this.ref('public').checked;
        this.showWait('部屋を作っています…');
        this.pending = 'create';
        try {
            await this.net.createRoom(name, { public: isPublic });
        } catch (error) {
            this.show('menu');
            this.showMessage(errorText(error));
        }
    }

    async join(roomCode = this.ref('code').value.trim()) {
        const name = this.readName();
        if (!name) return;
        if (!NetplayClient.isRoomCode(roomCode)) {
            this.showMessage(`部屋番号は${NetplayClient.ROOM_CODE_LENGTH}桁の数字です`);
            return;
        }
        this.showWait('部屋に入っています…');
        this.pending = 'join';
        try {
            await this.net.enterRoom(roomCode, name);
        } catch (error) {
            this.pending = null;
            if (error.fromServer) this.net.setRoomUrl(null);
            this.open({ roomCode });
            this.showMessage(errorText(error));
        }
    }

    async findRooms() {
        const list = this.ref('rooms');
        list.replaceChildren(this.item('探しています…'));
        try {
            const rooms = await this.net.listRooms();
            if (!rooms.length) {
                list.replaceChildren(this.item('待っている部屋はありません'));
                return;
            }
            list.replaceChildren(...rooms.map(room => {
                const li = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = `${room.hostName} の部屋（${room.players}/${room.maxPlayers}人）`;
                button.addEventListener('click', () => this.join(room.roomCode));
                li.append(button);
                return li;
            }));
        } catch (error) {
            list.replaceChildren(this.item(errorText(error)));
        }
    }

    async invite() {
        const url = this.controller?.net.inviteUrl();
        if (!url) return;
        try {
            if (navigator.share) {
                await navigator.share({ title: this.title, text: `${this.title}で遊ぼう（部屋 ${this.controller.lobby?.roomCode}）`, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            this.showMessage('招待URLをコピーしました');
        } catch (error) {
            if (error?.name !== 'AbortError') this.showMessage(`招待URL: ${url}`);
        }
    }

    // ===== 描画 =====

    mount() {
        if (this.root) return;
        if (!document.getElementById('netplay-lobby-style')) {
            const style = document.createElement('style');
            style.id = 'netplay-lobby-style';
            style.textContent = STYLE;
            document.head.append(style);
        }
        this.root = document.createElement('div');
        this.root.className = 'netplay-lobby';
        this.root.hidden = true;
        this.root.innerHTML = HTML;
        this.offline = document.createElement('div');
        this.offline.className = 'netplay-offline';
        this.offline.hidden = true;
        this.offline.textContent = '接続が切れました。つなぎ直しています…';
        document.body.append(this.root, this.offline);

        this.root.addEventListener('click', (event) => {
            const action = event.target.closest('[data-act]')?.dataset.act;
            if (!action) return;
            this.showMessage(null);
            const net = this.controller?.net;
            if (action === 'create') this.create();
            if (action === 'join') this.join();
            if (action === 'find') this.findRooms();
            if (action === 'invite') this.invite();
            if (action === 'add-cpu') net?.addCpu();
            if (action === 'start') net?.start();
            if (action === 'leave') this.leave();
            if (action === 'back-to-game') this.backToGame();
            if (action === 'close' || action === 'cancel') {
                if (this.controller) this.leave();
                else this.close();
            }
        });
        this.root.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.isComposing) return;
            if (event.target === this.ref('code')) this.join();
        });
    }

    ref(name) {
        return this.root.querySelector(`[data-ref="${name}"]`);
    }

    item(text) {
        const li = document.createElement('li');
        li.className = 'np-note';
        li.textContent = text;
        return li;
    }

    show(panel) {
        this.mount();
        this.mode = panel;
        this.root.hidden = false;
        this.root.querySelectorAll('[data-panel]').forEach(section => { section.hidden = section.dataset.panel !== panel; });
        if (panel !== 'menu') this.root.querySelector('#np-title').textContent = this.title;
    }

    showWait(text) {
        this.show('wait');
        this.ref('wait-text').textContent = text;
    }

    showMessage(text) {
        if (!this.root) return;
        this.ref('message').hidden = !text;
        this.ref('message').textContent = text ?? '';
    }

    showOffline(visible) {
        if (this.offline) this.offline.hidden = !visible;
    }

    // ロビーの画面を閉じて盤面に戻る（対戦中・対戦後だけ）
    backToGame() {
        const status = this.controller?.lobby?.status;
        if (status === 'playing' || status === 'ended') {
            this.mode = 'playing';
            this.root.hidden = true;
        } else {
            this.show('lobby');
        }
    }

    renderLobby(lobby) {
        const me = lobby.seat;
        const isHost = me === lobby.hostSeat;
        const players = lobby.players.filter(player => !player.left);
        const inGame = lobby.status !== 'lobby';
        this.ref('room-code').textContent = lobby.roomCode;
        this.ref('room-public').hidden = !lobby.public;
        this.ref('count').textContent = `${players.length}/${this.maxPlayers}人（${this.minPlayers === this.maxPlayers ? this.minPlayers : `${this.minPlayers}〜${this.maxPlayers}`}人で遊べます）`;
        this.ref('players').replaceChildren(...players.map(player => {
            const li = document.createElement('li');
            const name = document.createElement('span');
            name.className = 'np-name';
            name.textContent = player.name;
            li.append(name);
            const tags = [];
            if (player.seat === lobby.hostSeat) tags.push('ホスト');
            if (player.seat === me) tags.push('あなた');
            if (player.isCPU) tags.push('CPU');
            else if (!player.connected) tags.push('切断中');
            tags.forEach(text => {
                const tag = document.createElement('span');
                tag.className = 'np-tag';
                tag.textContent = text;
                li.append(tag);
            });
            if (isHost && player.isCPU && !inGame) {
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.textContent = '外す';
                remove.addEventListener('click', () => this.controller?.net.removeCpu(player.seat));
                li.append(remove);
            }
            return li;
        }));
        this.renderSettings(lobby, isHost && !inGame);
        this.ref('host-row').hidden = !isHost;
        this.root.querySelector('[data-act="add-cpu"]').hidden = !this.allowCpu || inGame;
        this.root.querySelector('[data-act="add-cpu"]').disabled = players.length >= this.maxPlayers;
        this.root.querySelector('[data-act="start"]').textContent = inGame ? 'もう一度' : 'ゲーム開始';
        this.root.querySelector('[data-act="start"]').disabled = lobby.status === 'playing';
        this.ref('guest-note').hidden = isHost;
        this.ref('guest-note').textContent = inGame ? '部屋を作った人が次の対戦を始めるまでお待ちください' : '部屋を作った人がゲームを始めるまでお待ちください';
        this.root.querySelectorAll('[data-panel="lobby"] [data-act="back-to-game"]').forEach(button => { button.hidden = !inGame; });
    }

    renderSettings(lobby, editable) {
        const container = this.ref('settings');
        container.replaceChildren(...this.settings.map(({ key, label, options }) => {
            const wrap = document.createElement('div');
            wrap.className = 'np-setting';
            const caption = document.createElement('span');
            caption.textContent = label;
            const segment = document.createElement('div');
            segment.className = 'np-segment';
            options.forEach(option => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = option.label;
                button.setAttribute('aria-pressed', String(lobby.settings?.[key] === option.value));
                button.disabled = !editable;
                button.addEventListener('click', () => this.controller?.net.setSettings({ [key]: option.value }));
                segment.append(button);
            });
            wrap.append(caption, segment);
            return wrap;
        }));
    }
}

export default NetplayLobby;
