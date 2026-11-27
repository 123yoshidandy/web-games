// 入口のページから開く外のページ（build-site.mjs が HTML に書く）

export const REPOSITORY = '123yoshidandy/web-games';
export const ISSUE_TITLE_PREFIX = '【要望・不具合】';

// GitHub の新しい Issue のページ。タイトルの頭を入れておく
export function newIssueUrl({ repository = REPOSITORY, titlePrefix = ISSUE_TITLE_PREFIX } = {}) {
    return `https://github.com/${repository}/issues/new?${new URLSearchParams({ title: `${titlePrefix} ` })}`;
}
