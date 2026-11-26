/**
 * ゲームの判定（画面とオンライン対戦のサーバーで共通）。DOM には触らない
 */

import { ANSWER_WORDS } from './words.js';
import { POKEMON_NAMES } from './pokemon-names.js';

export const MAX_ROWS = 10;
export const MODES = ['word', 'pokemon'];

const POKEMON_NAME_SET = new Set(POKEMON_NAMES);

// ひらがな⇔カタカナの変換（1文字）
export function toKatakana(ch) {
    const code = ch.charCodeAt(0);
    return code >= 0x3041 && code <= 0x3096 ? String.fromCharCode(code + 0x60) : ch;
}

export function toHiragana(ch) {
    const code = ch.charCodeAt(0);
    return code >= 0x30A1 && code <= 0x30F6 ? String.fromCharCode(code - 0x60) : ch;
}

// モードに合わせた文字にそろえる
export function normalizeLetter(mode, ch) {
    return mode === 'pokemon' ? toKatakana(ch) : toHiragana(ch);
}

// 「゛゜小」キーで切り替わる字（清音 → 濁音・半濁音・小さい字 → 清音 の順に回る）
const VARIANTS = {
    'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご',
    'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
    'た': 'だ', 'ち': 'ぢ', 'つ': 'っづ', 'て': 'で', 'と': 'ど',
    'は': 'ばぱ', 'ひ': 'びぴ', 'ふ': 'ぶぷ', 'へ': 'べぺ', 'ほ': 'ぼぽ',
    'あ': 'ぁ', 'い': 'ぃ', 'う': 'ぅゔ', 'え': 'ぇ', 'お': 'ぉ',
    'や': 'ゃ', 'ゆ': 'ゅ', 'よ': 'ょ', 'わ': 'ゎ'
};
const FAMILY = {};
for (const [base, variants] of Object.entries(VARIANTS)) {
    const family = [base, ...variants];
    family.forEach(ch => { FAMILY[ch] = family; });
}

const isKatakana = (ch) => ch !== toHiragana(ch);

// 清音の字（が → か、ッ → ツ）。切り替えのない字はそのまま
export function baseKana(ch) {
    const family = FAMILY[toHiragana(ch)];
    if (!family) return ch;
    return isKatakana(ch) ? toKatakana(family[0]) : family[0];
}

// 「゛゜小」で次の字にする。切り替えのない字なら null
export function cycleVariant(ch) {
    const hira = toHiragana(ch);
    const family = FAMILY[hira];
    if (!family) return null;
    const next = family[(family.indexOf(hira) + 1) % family.length];
    return isKatakana(ch) ? toKatakana(next) : next;
}

// 空白：答えの文字数を伏せるため、短い答えの後ろをこの字で埋める。空白も当てる字の1つとして判定する
export const BLANK = '_';

const answerList = (mode) => (mode === 'pokemon' ? POKEMON_NAMES : ANSWER_WORDS);

// マスの数（そのモードで一番長い答えの文字数）
export function boardWidth(mode) {
    return Math.max(...answerList(mode).map(word => word.length));
}

// 空白を使うモードか（答えの文字数がそろっていないモードだけ、空白のキーを出す）
export function usesBlank(mode) {
    return answerList(mode).some(word => word.length !== boardWidth(mode));
}

// 空白を除いた答え（正解の表示に使う）
export function trimBlanks(word) {
    return word.replaceAll(BLANK, '');
}

// シードから決まる乱数（mulberry32）。0 以上 1 未満を返す関数を作る。同じシードなら同じ答えになる
export function createRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 答えを選び、マスの数まで後ろを空白で埋める（random は 0 以上 1 未満を返す関数。1人プレイは createRandom(シード)、対戦はサーバーの乱数）
export function pickAnswer(mode, random) {
    const answers = answerList(mode);
    const answer = answers[Math.floor(random() * answers.length)];
    return answer + BLANK.repeat(boardWidth(mode) - answer.length);
}

// 決定できる入力か。だめなら理由を返し、よければ null
export function checkGuess(mode, guess, length) {
    if (typeof guess !== 'string' || guess.length !== length) {
        return usesBlank(mode) ? `空白も入れて${length}文字にしてください` : `${length}文字入力してください`;
    }
    const word = guess.replace(/_+$/, '');
    if (word.includes(BLANK)) return '空白は後ろにまとめてください';
    if (mode === 'pokemon') {
        return POKEMON_NAME_SET.has(word) ? null : '図鑑にない名前です';
    }
    return /^[ぁ-ゖー]+$/.test(word) ? null : 'ひらがなで入力してください';
}

// 1文字ずつの判定：correct（位置も合う）・present（含まれるが位置が違う）・absent（含まれない）
export function evaluateGuess(guess, secret) {
    const result = Array(guess.length).fill('absent');
    const remaining = {};

    // 正しい位置の文字を先に数え、残った文字で位置違いを判定する
    for (let i = 0; i < secret.length; i++) {
        if (guess[i] === secret[i]) {
            result[i] = 'correct';
        } else {
            remaining[secret[i]] = (remaining[secret[i]] || 0) + 1;
        }
    }
    for (let i = 0; i < guess.length; i++) {
        if (result[i] !== 'correct' && remaining[guess[i]] > 0) {
            result[i] = 'present';
            remaining[guess[i]]--;
        }
    }
    return result;
}
