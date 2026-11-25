/**
 * 棋譜を SGF（FF[4]）で書き出す
 * 座標は左上が aa。1文字目が列、2文字目が行。パスは B[]・W[]
 * 置き碁は AB[..] で置き石を書き、HA に数を入れる。結果は RE（B+3.5・W+R・0 は持碁）
 */

import { COLOR_NAME } from './rules.js';

const letter = (i) => String.fromCharCode(97 + i);
const point = (sq, size) => `${letter(sq % size)}${letter(Math.floor(sq / size))}`;
const escape = (text) => String(text).replace(/[\]\\]/g, ch => `\\${ch}`);

export function resultCode(result) {
    if (!result) return '';
    if (result.winner === null) return '0';
    const side = result.winner === 0 ? 'B' : 'W';
    return result.reason === 'resign' ? `${side}+R` : `${side}+${Math.abs(result.score.diff)}`;
}

// game：Game（または同じ項目を持つもの）。date：'2026-11-25' の形（省略したら書かない）
export function toSgf(game, { date } = {}) {
    const { size, komi, handicap } = game.options;
    const props = [
        'GM[1]', 'FF[4]', 'CA[UTF-8]', 'AP[go-web:1]', `SZ[${size}]`, `KM[${komi}]`, 'RU[Japanese]',
        `PB[${escape(game.players[0].name)}]`, `PW[${escape(game.players[1].name)}]`
    ];
    if (date) props.push(`DT[${date}]`);
    if (handicap >= 2) props.push(`HA[${handicap}]`, `AB${game.handicapStones.map(sq => `[${point(sq, size)}]`).join('')}`);
    const re = resultCode(game.result);
    if (re) props.push(`RE[${re}]`);
    const moves = [];
    for (const { playerId, command } of game.commands) {
        const side = playerId === 0 ? 'B' : 'W';
        if (command.type === 'move') moves.push(`;${side}[${point(command.sq, size)}]`);
        else if (command.type === 'pass') moves.push(`;${side}[]`);
    }
    return `(;${props.join('')}\n${moves.join('')})\n`;
}

// 保存するファイルの名前（例：go-19路-黒あなた-白CPU.sgf）
export function sgfFileName(game) {
    const names = game.players.map((p, i) => `${COLOR_NAME[i + 1]}${p.name}`).join('-');
    return `go-${game.options.size}路-${names}.sgf`.replace(/[\\/:*?"<>|\s]/g, '_');
}
