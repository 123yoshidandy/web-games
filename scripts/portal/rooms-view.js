// 入口のページの「いま立っている部屋」の表示（文字と HTML を作るだけ。画面へのつなぎは rooms.js）
// 部屋の形は netplay-kit の GET /rooms：{ game, roomCode, hostName, players, maxPlayers, createdAt }

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 部屋に入るリンク：招待URLと同じ <ゲーム>/?room=<部屋番号>。接続先の ?server=（手元で試すとき）は引き継ぐ
export function roomHref(room, search = '') {
    const params = new URLSearchParams({ room: room.roomCode });
    const server = new URLSearchParams(search).get('server');
    if (server) params.set('server', server);
    return `${encodeURIComponent(room.game)}/?${params}`;
}

// 一覧の HTML。入口のページにないゲーム（names にない）と、形の違う部屋は出さない。出す部屋がなければ空
export function roomsHtml(rooms, names = {}, search = '') {
    const shown = (Array.isArray(rooms) ? rooms : [])
        .filter((room) => names[room?.game] && /^\d+$/.test(String(room.roomCode ?? '')));
    return shown.map((room) => `<li><a href="${escapeHtml(roomHref(room, search))}">`
        + `<span class="room-game">${escapeHtml(names[room.game])}</span>`
        + `<span class="room-host">${escapeHtml(room.hostName || 'だれか')} の部屋</span>`
        + `<span class="room-count">${Number(room.players) || 0}/${Number(room.maxPlayers) || '?'}人</span>`
        + '</a></li>').join('');
}
