/**
 * 利用者ごとの記録モジュール
 * ローカルの結果（ひとり用の問題・チャレンジ）を、ログインしている人の記録に送ります
 * オンライン対戦の結果は、サーバー（netplay-kit）が記録するので、ここからは送りません
 * netplay-kit の user-stats.js は ES モジュールなので、通常のスクリプトからは動的 import で使います
 * ログインしていなければ何もしません。id は同じ問題なら同じになるもの（シードなど）にします
 */

function recordLocalResult(id, outcome) {
    import('./netplay/user-stats.js')
        .then(stats => stats.recordResult({ game: 'mine-blocks', id, outcome }))
        .catch(() => {});
}
