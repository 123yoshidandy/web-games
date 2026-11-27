/**
 * このゲームのパズルの種類（1つのゲームに1種類。ゲームの js/game.js の type）
 * 問題の組・記録・オンラインでは、問題に種類の id を付けて持つ（getType で引く）
 *
 * 種類（js/puzzles/<id>/index.js の default export）の形。DOM に触れるのは render だけ（サーバーとテストも同じファイルを読む）
 *   id            英小文字とハイフン（フォルダの名前と同じ）。保存・記録・オンラインで使うので、決めたら変えない
 *   name          名前（日本語）
 *   rules         遊び方の文（1段落ずつの配列）
 *   controls      操作の説明（1文）
 *   difficulties  { easy, normal, hard } のそれぞれの説明（「5×5」など。難しさの名前は共通）
 *   cpuSecondsPerStep  CPU（ふつう）がヒント1つ分の手にかける秒数の目安
 *   generate(seed, difficulty)        問題（JSON にできる値。答えとシードは入れない）。同じ引数なら同じ問題。解は必ず1つ
 *   solve(puzzle, limit = 2)          { count（limit まで数えた解の数）, solution（1つ目の解を「状態」の形で。なければ null）}
 *   initialState(puzzle)              何も書いていない状態（JSON にできる値）
 *   applyInput(puzzle, state, input)  入力を当てた新しい状態。state は書き換えない。何も変わらない・おかしい入力なら state をそのまま返す
 *   check(puzzle, state)              { solved, errors }。ルールだけで判定する（オンラインでサーバーが、端末から届いた状態を確かめる）
 *                                     state がおかしな形でも投げずに { solved: false, errors: [] } を返す
 *   hint(puzzle, state)               次の一手 { input, cells, message }（input は applyInput に渡せる形、cells は光らせるマス）。解けていれば null
 *                                     まちがいがある状態からでも、ヒントを当て続ければ必ず解ける
 *   randomInput(puzzle, state, random)  試験用のでたらめな入力（random は [0, 1) の乱数の関数）
 *   render(container, puzzle, state, { onInput, readOnly })
 *                                     盤面を描き、{ update(state, { highlight, errors, solved }), destroy() } を返す
 *                                     入力は onInput(input) で知らせるだけで、状態は変えない（画面の側が applyInput して update を呼ぶ）
 *                                     highlight のマスには class="recommended" を付ける。CSS は common/dom.js の injectStyle で入れる
 */

import game from '../game.js';

export const PUZZLE_TYPE = game.type;
export const PUZZLE_TYPES = [game.type];

export const getType = (id) => (id === PUZZLE_TYPE.id ? PUZZLE_TYPE : null);

// 難しさ（どの種類も同じ3段階）
export const DIFFICULTIES = [
    { id: 'easy', label: 'やさしい' },
    { id: 'normal', label: 'ふつう' },
    { id: 'hard', label: 'むずかしい' }
];
export const DIFFICULTY_IDS = DIFFICULTIES.map(d => d.id);
export const difficultyLabel = (id) => DIFFICULTIES.find(d => d.id === id)?.label ?? id;
