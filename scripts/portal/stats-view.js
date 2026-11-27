// 入口のページの「自分の記録」の表示（文字と HTML を作るだけ。画面へのつなぎは stats.js）
// 記録の形は netplay-kit の stats.js の statsFromItem：{ name, games: { <ゲーム>: { plays, wins, losses, draws, online, vs: [...] } } }

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 勝ち負けの短い文字：「2勝1敗」「1分」を足す。勝ち負けのないゲーム（回数だけ）は空
export function winLossText({ wins = 0, losses = 0, draws = 0 }) {
    if (wins + losses + draws === 0) return '';
    return `${wins}勝${losses}敗${draws ? `${draws}分` : ''}`;
}

// カードに添える回数：「3回・2勝1敗」。遊んでいなければ空
export function cardBadgeText(stats) {
    if (!stats?.plays) return '';
    const record = winLossText(stats);
    return record ? `${stats.plays}回・${record}` : `${stats.plays}回`;
}

// 遊んだゲームを、回数の多い順に並べる（同じなら名前の順）
export function sortedGames(record, names = {}) {
    return Object.entries(record?.games ?? {})
        .filter(([, stats]) => stats.plays > 0)
        .map(([game, stats]) => ({ game, name: names[game] ?? game, ...stats }))
        .sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name, 'ja'));
}

// 「自分の記録」の中身の HTML。ゲームごとの回数・勝ち・負け・引き分けと、オンラインの相手ごとの勝ち負け
export function statsHtml(record, names = {}) {
    const games = sortedGames(record, names);
    if (games.length === 0) return '<p class="stats-empty">まだ記録はありません。ゲームを最後まで遊ぶと、ここに数が出ます</p>';
    const total = games.reduce((sum, g) => ({
        plays: sum.plays + g.plays, wins: sum.wins + g.wins, losses: sum.losses + g.losses, draws: sum.draws + g.draws
    }), { plays: 0, wins: 0, losses: 0, draws: 0 });
    const rows = games.map((g) => {
        const opponents = g.vs.length === 0 ? '' : `<ul class="vs">${g.vs.map((o) => `<li><span class="vs-name">${escapeHtml(o.name)}</span>${o.cpu ? '<span class="cpu">CPU</span>' : ''}<span class="vs-record">${o.plays}戦 ${winLossText(o) || '―'}</span></li>`).join('')}</ul>`;
        return `<tr><th scope="row"><a href="${encodeURIComponent(g.game)}/">${escapeHtml(g.name)}</a>${g.online ? `<small>オンライン ${g.online}回</small>` : ''}${opponents}</th>`
            + `<td>${g.plays}</td><td>${g.wins}</td><td>${g.losses}</td><td>${g.draws}</td></tr>`;
    }).join('');
    return `<p class="stats-total">${games.length} 本・${total.plays}回（${winLossText(total) || '勝ち負けなし'}）</p>`
        + '<table class="stats-table"><thead><tr><th scope="col">ゲーム</th><th scope="col">回数</th><th scope="col">勝ち</th><th scope="col">負け</th><th scope="col">引分</th></tr></thead>'
        + `<tbody>${rows}</tbody></table>`;
}
