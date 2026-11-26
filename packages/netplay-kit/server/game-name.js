/**
 * 接続の URL（?game=）で受け取るゲームの名前の形（router.js と dev-server.js で使う）
 * games/ のフォルダ名と同じ形だけを受け付け、import のパスに使っても外へ出られないようにする
 */

export const GAME_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const isGameName = (name) => typeof name === 'string' && GAME_NAME_PATTERN.test(name);

// load(name) の結果（ゲームの定義・handler・そのモジュール）から、default があればそれを取り出す
export const unwrapModule = (loaded) => loaded?.default ?? loaded ?? null;
