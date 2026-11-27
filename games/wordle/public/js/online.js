/**
 * オンライン対戦の部屋（作成・参加・ロビー・対戦後）と通信
 * 通信は netplay-kit の NetplayClient が行い、盤面の表示は main.js に任せる（onView）
 * 対戦の終わりは、ビュー（state）と部屋の状態（lobby）のどちらが先に届いても同じ表示になるようにする
 */

import NetplayClient from './netplay/netplay-client.mjs';
import { getServerUrl } from './online-config.js';

const NAME_STORAGE_KEY = 'wordle.name';
const RESULT_PANEL_DELAY_MS = 3500; // 最後の行をめくって結果を見せてから、部屋の画面を開くまで
const MODE_LABELS = { word: 'ことば', pokemon: 'ポケモン' }; // 一覧に出す、部屋の答えの種類

// 対戦の結果の文
export function resultMessage(view, seat) {
    const names = view.winners.map(s => view.players[s].name);
    if (view.winners.length === 0) return `引き分け！ 正解は ${view.secret}`;
    if (view.winners.includes(seat)) {
        const others = names.filter((_, i) => view.winners[i] !== seat);
        return others.length === 0 ? '正解！ あなたの勝ち' : `正解！ ${others.join('・')}さんと同着`;
    }
    return `${names.join('・')}さんの勝ち！ 正解は ${view.secret}`;
}

export function setupOnline({ onView, onExit, showMessage }) {
    const el = (id) => document.getElementById(id);
    const modal = el('online-modal');
    let net = null;
    let lobby = null;
    let view = null;
    let panelTimer = null;
    let invitedCode = null; // 招待URLの部屋（画面には出さない）

    function client() {
        if (net) return net;
        net = new NetplayClient({
            serverUrl: getServerUrl(),
            storageKey: 'wordle.online'
        });

        net.on('lobby', (message) => {
            const previous = lobby?.status;
            lobby = message;
            invitedCode = null;
            net.setRoomUrl(message.roomCode);
            document.body.classList.add('in-room');
            // 対戦が始まったら部屋の画面を閉じる。ロビーに戻ったら開く
            if (message.status === 'playing' && previous !== 'playing') close();
            if (message.status === 'lobby' && previous && previous !== 'lobby') open();
            render();
        });

        net.on('state', (message) => {
            view = message.view;
            onView({ view, seat: net.seat, matchId: message.matchId ?? net.matchId });
            if (view.phase === 'end') {
                clearTimeout(panelTimer);
                panelTimer = setTimeout(open, RESULT_PANEL_DELAY_MS);
            }
            render();
        });

        net.on('error', ({ message }) => showMessage(message));
        net.on('left', reset);
        net.on('connection', (connected) => {
            if (!connected && net.session) showMessage('再接続しています');
        });
        return net;
    }

    // 部屋を出た・入れなかった
    function reset() {
        clearTimeout(panelTimer);
        lobby = null;
        view = null;
        net?.setRoomUrl(null);
        document.body.classList.remove('in-room');
        onExit();
        render();
    }

    function open() {
        render();
        modal.classList.remove('hidden');
        if (!lobby) findRooms();
    }

    // 参加できる部屋の一覧（部屋はすべて公開。部屋番号は出さない）
    async function findRooms() {
        const list = el('online-rooms');
        const note = (text) => {
            const item = document.createElement('li');
            item.className = 'room-empty';
            item.textContent = text;
            return item;
        };
        list.replaceChildren(note('探しています…'));
        try {
            const rooms = await client().listRooms();
            if (lobby) return; // 返事を待つ間に部屋に入った
            if (rooms.length === 0) {
                list.replaceChildren(note('待っている部屋はありません'));
                return;
            }
            list.replaceChildren(...rooms.map(room => {
                const item = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button';
                const host = document.createElement('span');
                host.textContent = `${room.hostName} の部屋`;
                const meta = document.createElement('span');
                meta.className = 'room-meta';
                meta.textContent = [`${room.players}/${room.maxPlayers}人`, MODE_LABELS[room.settings?.mode]].filter(Boolean).join('・');
                button.append(host, meta);
                button.addEventListener('click', () => join(room.roomCode));
                item.appendChild(button);
                return item;
            }));
        } catch (e) {
            if (!lobby) list.replaceChildren(note(e.message));
        }
    }

    // 一覧の部屋か、招待URLの部屋に入る。断られたら一覧を取り直す（サーバーの断りは error の知らせで出る）
    async function join(roomCode) {
        try {
            await client().enterRoom(roomCode, playerName());
        } catch (e) {
            if (e.fromServer) {
                invitedCode = null;
                net.setRoomUrl(null);
            } else {
                showMessage(e.message);
            }
            render();
            findRooms();
        }
    }

    function close() {
        modal.classList.add('hidden');
    }

    function playerName() {
        const name = el('online-name').value.trim();
        try {
            localStorage.setItem(NAME_STORAGE_KEY, name);
        } catch (e) {
            // 保存できなくても遊べる
        }
        return name;
    }

    // 部屋に入る前と入ったあとで、見せる部分を切り替える
    function render() {
        el('online-entry').classList.toggle('hidden', Boolean(lobby));
        el('online-room').classList.toggle('hidden', !lobby);
        el('online-invited').classList.toggle('hidden', !invitedCode);
        if (!lobby) return;

        const isHost = net.isHost();
        const status = lobby.status;

        const ended = status === 'ended' && view?.phase === 'end';
        el('online-result').classList.toggle('hidden', !ended);
        if (ended) el('online-result').textContent = resultMessage(view, net.seat);

        const list = el('online-players');
        list.innerHTML = '';
        lobby.players.filter(player => !player.left).forEach(player => {
            const item = document.createElement('li');
            const name = document.createElement('span');
            name.textContent = player.name;
            item.appendChild(name);
            const tags = [];
            if (player.seat === lobby.hostSeat) tags.push('ホスト');
            if (!player.connected) tags.push('切断中');
            if (status === 'ended' && player.ready) tags.push('もう1回');
            tags.forEach(text => {
                const tag = document.createElement('span');
                tag.className = 'player-tag';
                tag.textContent = text;
                item.appendChild(tag);
            });
            item.classList.toggle('me', player.seat === net.seat);
            list.appendChild(item);
        });

        const canChangeMode = isHost && status === 'lobby';
        document.querySelectorAll('[data-online-mode]').forEach(button => {
            button.classList.toggle('active', button.dataset.onlineMode === lobby.settings.mode);
            button.disabled = !canChangeMode;
        });
        document.querySelector('.online-mode').classList.toggle('hidden', status === 'playing');

        const me = lobby.players.find(player => player.seat === net.seat);
        el('online-start').classList.toggle('hidden', !(isHost && status === 'lobby'));
        el('online-ready').classList.toggle('hidden', status !== 'ended');
        el('online-ready').textContent = me?.ready ? '取り消す' : 'もう1回';
        el('online-back').classList.toggle('hidden', status !== 'ended');
    }

    function setupButtons() {
        el('online-button').addEventListener('click', open);
        el('room-button').addEventListener('click', open);
        el('online-close').addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });

        el('online-create').addEventListener('click', async () => {
            try {
                await client().createRoom(playerName());
            } catch (e) {
                showMessage(e.message);
            }
        });

        el('online-invited').addEventListener('click', () => join(invitedCode));
        el('online-refresh').addEventListener('click', findRooms);

        // 招待URLを送る。URL には部屋番号が入るが、文字では出さない
        el('online-invite').addEventListener('click', async () => {
            const url = net.inviteUrl();
            try {
                await navigator.clipboard.writeText(url);
                showMessage('招待URLをコピーしました');
            } catch (e) {
                // コピーできなければ、このページの URL を招待URLにする（アドレスバーから送ってもらう）
                net.setRoomUrl(lobby?.roomCode);
                showMessage('コピーできませんでした。このページのURLを送ると、この部屋に招待できます');
            }
        });

        document.querySelectorAll('[data-online-mode]').forEach(button => {
            button.addEventListener('click', () => net.setSettings({ mode: button.dataset.onlineMode }));
        });
        el('online-start').addEventListener('click', () => net.start());
        el('online-ready').addEventListener('click', () => {
            const me = lobby?.players.find(player => player.seat === net.seat);
            net.ready(!me?.ready);
        });
        el('online-back').addEventListener('click', () => net.backToLobby());
        el('online-leave').addEventListener('click', () => {
            if (lobby?.status === 'playing' && !confirm('対戦の途中で部屋を出ますか？')) return;
            net.leave();
            reset();
        });
    }

    return {
        init() {
            // つなぐサーバーがまだなければ（デプロイ前の公開ページ）、対戦の入口を出さない
            if (!client().serverUrl) {
                el('online-button').classList.add('hidden');
                return;
            }
            setupButtons();
            try {
                el('online-name').value = localStorage.getItem(NAME_STORAGE_KEY) || '';
            } catch (e) {
                // 読めなくても遊べる
            }

            // 前の部屋に入っていれば戻る。招待URLから開いたら、「招待された部屋に参加」を出して部屋の画面を開く
            const code = NetplayClient.inviteRoomCode();
            const session = client().session;
            if (session && (!code || code === session.roomCode)) {
                client().resume().catch(() => showMessage('サーバーに接続できませんでした'));
            } else if (code) {
                invitedCode = code;
                open();
            }
        },

        // このラウンドの答えを送る。送れなければ false
        submit(round, word) {
            return Boolean(net?.send('guess', { round, word }));
        }
    };
}
