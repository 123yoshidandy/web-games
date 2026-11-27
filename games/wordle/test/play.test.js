import { describe, expect, it } from 'vitest';
import {
    BLANK, MAX_ROWS, baseKana, evaluateGuess, gameResult, keyToLetter, strongerStatus, submitError
} from '../public/js/logic.js';

const C = 'correct';
const P = 'present';
const A = 'absent';

describe('同じ字が重なるときの判定（evaluateGuess）', () => {
    it('答えに1つしかない字を2つ入れ、どちらも位置違いなら、左の1つだけ present', () => {
        expect(evaluateGuess('かかあいう', 'えおきくか')).toEqual([P, A, A, A, A]);
    });

    it('位置の合う字を先に数えるので、右にある correct が左の present を打ち消す', () => {
        expect(evaluateGuess('かかかかか', 'あいうえか')).toEqual([A, A, A, A, C]);
        expect(evaluateGuess('かあいうか', 'えおきくか')).toEqual([A, A, A, A, C]);
    });

    it('答えに2つある字は、2つまで色が付く（correct と present を1つずつ）', () => {
        expect(evaluateGuess('かきかくけ', 'かあいうか')).toEqual([C, A, P, A, A]);
    });

    it('答えに2つある字を1つだけ入れたときは、その1つが present', () => {
        expect(evaluateGuess('あかいうえ', 'かきくけか')).toEqual([A, P, A, A, A]);
    });

    it('答えに2つある字を3つ入れたら、3つ目は absent', () => {
        expect(evaluateGuess('ききあきい', 'あきうえき')).toEqual([P, C, P, A, A]);
    });

    it('判定は答えより多い字に色を付けない（どの並びでも、各字の correct + present は答えの数まで）', () => {
        const secret = 'ささきさい';
        for (const guess of ['さささささ', 'いいいいい', 'さきいさき', 'きさいささ']) {
            const result = evaluateGuess(guess, secret);
            for (const ch of new Set(guess)) {
                const colored = [...guess].filter((c, i) => c === ch && result[i] !== A).length;
                const inSecret = [...secret].filter(c => c === ch).length;
                expect(colored).toBeLessThanOrEqual(inSecret);
            }
        }
    });

    it('ポケモンモードの空白も字として数える（答えより空白が多ければ、余りは absent）', () => {
        const secret = `ピカチュウ${BLANK}`;
        expect(evaluateGuess(`ミュウ${BLANK.repeat(3)}`, secret)).toEqual([A, P, P, A, A, C]);
        expect(evaluateGuess(`イーブイ${BLANK}${BLANK}`, `ミュウ${BLANK.repeat(3)}`)).toEqual([A, A, A, A, C, C]);
    });
});

describe('物理キーボードの入力（keyToLetter）', () => {
    it('ことばモードはひらがなにそろえ、ポケモンモードはカタカナにそろえる', () => {
        expect(keyToLetter('word', 'あ')).toBe('あ');
        expect(keyToLetter('word', 'ア')).toBe('あ');
        expect(keyToLetter('pokemon', 'あ')).toBe('ア');
        expect(keyToLetter('pokemon', 'ピ')).toBe('ピ');
    });

    it('小さい字・ゔ・長音も1文字として入る', () => {
        expect(keyToLetter('word', 'ゃ')).toBe('ゃ');
        expect(keyToLetter('word', 'ゔ')).toBe('ゔ');
        expect(keyToLetter('pokemon', 'ー')).toBe('ー');
    });

    it('スペースは空白を使うモード（ポケモン）だけ空白になる', () => {
        expect(keyToLetter('pokemon', ' ')).toBe(BLANK);
        expect(keyToLetter('word', ' ')).toBe(null);
    });

    it('ひらがな・カタカナ以外のキーは入れない', () => {
        for (const key of ['a', 'Z', '1', 'Enter', 'Shift', '漢', 'ab', '']) {
            expect(keyToLetter('word', key)).toBe(null);
            expect(keyToLetter('pokemon', key)).toBe(null);
        }
    });
});

describe('決定できるか（submitError）', () => {
    it('字数が足りなければ、モードに合わせた案内で断る', () => {
        expect(submitError('word', 'あい', 5)).toBe('5文字入力してください');
        expect(submitError('word', '', 5)).toBe('5文字入力してください');
        expect(submitError('pokemon', 'ピカ', 6)).toBe('空白も入れて6文字にしてください');
    });

    it('ことばモードの1人プレイは、辞書になくても5文字なら決定できる', () => {
        expect(submitError('word', 'ああああい', 5)).toBe(null);
    });

    it('対戦では、ことばモードでもひらがなかを確かめる', () => {
        expect(submitError('word', 'ああああい', 5, { online: true })).toBe(null);
        expect(submitError('word', 'アアアアイ', 5, { online: true })).toBe('ひらがなで入力してください');
    });

    it('ポケモンモードは、図鑑の名前＋後ろの空白だけを受け付ける', () => {
        expect(submitError('pokemon', `ピカチュウ${BLANK}`, 6)).toBe(null);
        expect(submitError('pokemon', `ピカチュ${BLANK}${BLANK}`, 6)).toBe('図鑑にない名前です');
        expect(submitError('pokemon', `ミュ${BLANK}ウ${BLANK}${BLANK}`, 6)).toBe('空白は後ろにまとめてください');
    });
});

describe('勝ち負け（gameResult）', () => {
    const secret = 'さくらんぼ';
    const miss = (n) => Array.from({ length: n }, (_, i) => `ああああ${'いうえおか'[i % 5]}`);

    it('まだ当てておらず、回数が残っていれば続く', () => {
        expect(gameResult([], secret)).toBe(null);
        expect(gameResult(miss(MAX_ROWS - 1), secret)).toBe(null);
    });

    it('当てたら勝ち（1回目でも、最後の回でも）', () => {
        expect(gameResult([secret], secret)).toBe('win');
        expect(gameResult([...miss(MAX_ROWS - 1), secret], secret)).toBe('win');
    });

    it(`${MAX_ROWS}回使い切って当てられなければ負け`, () => {
        expect(gameResult(miss(MAX_ROWS), secret)).toBe('lose');
    });
});

describe('キーボードの色（strongerStatus）', () => {
    it('強い判定へは塗り替え、弱い判定では戻さない', () => {
        expect(strongerStatus(undefined, A)).toBe(A);
        expect(strongerStatus(A, P)).toBe(P);
        expect(strongerStatus(P, C)).toBe(C);
        expect(strongerStatus(C, P)).toBe(C);
        expect(strongerStatus(C, A)).toBe(C);
        expect(strongerStatus(P, A)).toBe(P);
    });

    it('同じ字が present と absent に分かれた行では、キーは present になる', () => {
        const guess = 'かかあいう';
        const result = evaluateGuess(guess, 'えおきくか');
        const keys = {};
        [...guess].forEach((ch, i) => { keys[baseKana(ch)] = strongerStatus(keys[baseKana(ch)], result[i]); });
        expect(keys['か']).toBe(P);
        expect(keys['あ']).toBe(A);
    });

    it('前の行で correct になった字は、あとで absent が出ても correct のまま', () => {
        const secret = 'かあいうえ';
        let key;
        for (const guess of ['かきくけこ', 'きかかくけ']) {
            const result = evaluateGuess(guess, secret);
            [...guess].forEach((ch, i) => { if (ch === 'か') key = strongerStatus(key, result[i]); });
        }
        expect(key).toBe(C);
    });
});
