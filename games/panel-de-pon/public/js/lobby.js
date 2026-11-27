// オンライン対戦の画面（名前の入力・部屋の作成と参加、部屋の画面）

import NetplayClient from './netplay/netplay-client.mjs';

const NAME_KEY = 'panel-de-pon.name';

let screen = null;

function loadName() {
    try {
        return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
        return '';
    }
}

function saveName(name) {
    try {
        localStorage.setItem(NAME_KEY, name);
    } catch {
        // 保存できなくても遊べる
    }
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function ensureScreen() {
    if (!screen) {
        screen = document.createElement('div');
        screen.id = 'online-screen';
        document.body.append(screen);
    }
    return screen;
}

// data-action を持つボタンに処理を割り当てる
function bindActions(element, actions) {
    for (const button of element.querySelectorAll('[data-action]')) {
        button.addEventListener('click', () => actions[button.dataset.action]?.());
    }
}

// 招待URLの部屋番号（?room=1234）
export function getInvitedRoomCode() {
    const code = (new URLSearchParams(location.search).get('room') ?? '').trim();
    return NetplayClient.isRoomCode(code) ? code : '';
}

// URL から招待の部屋番号を外す（入れなかった・タイトルへ戻ったときに。読み込み直しで、また招待の画面を出さない）
export function clearInvite() {
    const url = new URL(location.href);
    if (!url.searchParams.has('room')) return;
    url.searchParams.delete('room');
    history.replaceState(history.state, '', url);
}

// 入口の画面。onCreate(name) / onJoin(roomCode, name) / onRefresh() / onBack()
// 部屋はすべて公開で、下の「参加できる部屋」の一覧から入る（一覧は showRoomList で描く）。部屋番号は出さない
// 招待URLで開いたときは、その部屋に入る「招待された部屋に参加する」だけを出す
export function showOnlineEntry({ onCreate, onJoin, onRefresh, onBack }) {
    const element = ensureScreen();
    const invitedCode = getInvitedRoomCode();
    element.dataset.view = 'entry';
    element.innerHTML = `
        <div class="title-content online-content">
            <h2 class="online-title">${invitedCode ? '招待された部屋に参加' : 'オンライン対戦'}</h2>
            <label class="online-field">名前
                <input class="online-name" maxlength="12" autocomplete="nickname" value="${escapeHtml(loadName())}">
            </label>
            ${invitedCode ? `
            <button type="button" class="online-button" data-action="join">参加する</button>
            ` : `
            <button type="button" class="online-button" data-action="create">部屋を作る</button>
            <div class="online-or">または、参加できる部屋を押して入る</div>
            <ul class="lobby-players online-rooms"></ul>
            <button type="button" class="online-button sub" data-action="refresh">一覧を更新</button>
            `}
            <p class="online-message"></p>
            <button type="button" class="online-link" data-action="back">タイトルへ</button>
        </div>
    `;
    const name = () => {
        const value = element.querySelector('.online-name').value.trim();
        saveName(value);
        return value;
    };
    // 一覧の部屋を押したときも、入口の名前の欄の名前で入る
    element.onJoinRoom = (roomCode) => onJoin(roomCode, name());
    bindActions(element, {
        create: () => onCreate(name()),
        join: () => onJoin(invitedCode, name()),
        refresh: onRefresh,
        back: onBack
    });
}

// 入口の「参加できる部屋」の一覧を描く（rooms が null の間は取りに行っている）。押すとその部屋に入る
// 名前は参加者が入れた文字なので textContent で描く
export function showRoomList(rooms) {
    const list = screen?.dataset.view === 'entry' ? screen.querySelector('.online-rooms') : null;
    if (!list) return;
    const note = (text) => {
        const item = document.createElement('li');
        item.className = 'lobby-player empty';
        item.textContent = text;
        return item;
    };
    if (!rooms) {
        list.replaceChildren(note('探しています…'));
        return;
    }
    if (rooms.length === 0) {
        list.replaceChildren(note('待っている部屋はありません'));
        return;
    }
    list.replaceChildren(...rooms.map(room => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lobby-player online-room';
        const host = document.createElement('span');
        host.className = 'lobby-name';
        host.textContent = `${room.hostName} の部屋`;
        const count = document.createElement('span');
        count.className = 'lobby-note';
        count.textContent = `${room.players}/${room.maxPlayers}人`;
        button.append(host, count);
        button.addEventListener('click', () => screen?.onJoinRoom?.(room.roomCode));
        item.append(button);
        return item;
    }));
}

// 入口（参加できる部屋の一覧）を出しているか
export function isRoomListShown() {
    return Boolean(screen?.dataset.view === 'entry' && screen.querySelector('.online-rooms'));
}

// 部屋の画面。lobby はサーバーから届いた部屋の状態（seat は自分の席）、isHost は部屋を作った人（の役）か、
// winsOf(playerId) は通算の勝ち数。onStart() / onLeave() / onAbort() / onBackToLobby()
export function showLobby({ lobby, isHost, winsOf, onStart, onLeave, onAbort, onBackToLobby }) {
    const element = ensureScreen();
    const seat = lobby.seat;
    const players = [0, 1].map(i => lobby.players[i]);
    const ready = players.every(player => player?.connected);

    let guide;
    let action = '';
    if (lobby.status === 'playing') {
        guide = '対戦中です';
        action = '<button type="button" class="online-button" data-action="abort">対戦をやめる</button>';
    } else if (lobby.status === 'ended') {
        guide = '対戦が終わりました';
        action = '<button type="button" class="online-button" data-action="lobby">部屋に戻る</button>';
    } else if (!players[1]) {
        guide = '参加できる部屋の一覧で相手を待っています（招待URLを送っても呼べます）';
    } else if (!ready) {
        guide = '相手の接続が切れています';
    } else if (isHost) {
        guide = '';
        action = '<button type="button" class="start-button" data-action="start">対戦スタート</button>';
    } else {
        guide = 'ホストの開始を待っています';
    }

    const slot = (player, i) => {
        if (!player) return '<li class="lobby-player empty">空き</li>';
        const status = player.left ? '退出' : player.connected ? '' : '切断中';
        const notes = [i === seat ? 'あなた' : '', status].filter(Boolean).join('・');
        return `<li class="lobby-player">
            <span class="lobby-name">${escapeHtml(player.name)}</span>
            <span class="lobby-wins">${winsOf(player.id)}勝</span>
            ${notes ? `<span class="lobby-note">${notes}</span>` : ''}
        </li>`;
    };

    element.dataset.view = 'room';
    element.innerHTML = `
        <div class="title-content online-content">
            <h2 class="online-title">対戦の部屋</h2>
            <button type="button" class="online-link" data-action="invite">招待URLを送る</button>
            <ul class="lobby-players">${players.map(slot).join('')}</ul>
            <p class="online-guide">${guide}</p>
            ${action}
            <p class="online-message"></p>
            <button type="button" class="online-link" data-action="leave">部屋を出る</button>
        </div>
    `;
    bindActions(element, {
        invite: () => shareInvite(lobby.roomCode),
        start: onStart,
        leave: onLeave,
        abort: onAbort,
        lobby: onBackToLobby
    });
}

// 招待URLを共有する（共有メニューがなければクリップボードにコピー）。部屋番号は URL の中にだけ入れ、文字では出さない
async function shareInvite(roomCode) {
    const url = `${location.origin}${location.pathname}?room=${roomCode}`;
    try {
        if (navigator.share) {
            await navigator.share({ title: 'パネルでポン 対戦の招待', text: 'パネルでポンの部屋に招待します', url });
        } else {
            await navigator.clipboard.writeText(url);
            setOnlineMessage('招待URLをコピーしました');
        }
    } catch {
        // 共有をやめた場合など
    }
}

export function setOnlineMessage(text) {
    const message = screen?.querySelector('.online-message');
    if (message) message.textContent = text;
}

export function hideOnline() {
    screen?.remove();
    screen = null;
}
