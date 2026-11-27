import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import {
    ARCHETYPES, mutateDeck, buildPool, evolutionLine, orphanCount, deckIssue, deckKey, seedDeckFor, keyPokemon,
    evaluateDeck, createRunner, search, wilson, mixSeed
} from '../scripts/deck-search.mjs';
import { DECKS } from '../public/js/decks.js';
import { CARDS } from '../public/js/card-data.js';
import { createRandom } from '../public/js/random.js';
import { bestDecksHtml, bestDecksDate, readBestDecks, changedCount, savedName } from '../public/js/ui/best-decks.js';
import { MAX_NAME_LENGTH } from '../public/js/deck-store.js';

const preset = id => ({ ...DECKS.find(deck => deck.id === id).cards });
const inline = createRunner(0);
const workers = createRunner(2);
afterAll(() => workers.close());

describe('デッキの変え方', () => {
    it('どの型でも、何度変えても構築の決まりに合い、進化元のない進化ポケモンが増えず、軸のカードが残る', () => {
        for (const arch of ARCHETYPES) {
            const random = createRandom(mixSeed('test', arch.id));
            const pool = buildPool(evolutionLine(arch.key));
            const start = preset(arch.id);
            const orphans = orphanCount(start);
            let cards = start;
            for (let i = 0; i < 150; i++) {
                cards = mutateDeck(cards, random, { pool, key: arch.key });
                expect(deckIssue(cards)).toBeNull();
                expect(orphanCount(cards)).toBeLessThanOrEqual(orphans);
                expect(cards[arch.key]).toBeGreaterThanOrEqual(Math.min(2, start[arch.key]));
            }
            expect(deckKey(cards)).not.toBe(deckKey(start));
        }
    });

    it('同じ乱数なら同じように変わる', () => {
        const pool = buildPool();
        const a = mutateDeck(preset('garchomp'), createRandom(7), { pool });
        const b = mutateDeck(preset('garchomp'), createRandom(7), { pool });
        expect(a).toEqual(b);
    });

    it('型の一覧にない軸のカードでも、決まりに合う元のデッキを作れる', () => {
        const key = Object.values(CARDS).find(card => card.kind === 'pokemon' && card.stage === 2 && card.supported
            && ['H', 'I', 'J'].includes(card.regulation) && !DECKS.some(deck => deck.cards[card.id])).id;
        const { cards } = seedDeckFor(key);
        expect(deckIssue(cards)).toBeNull();
        evolutionLine(key).forEach(id => expect(cards[id]).toBeGreaterThan(0));
        expect(keyPokemon(cards, key)[0]).toBe(key);
    });

    it('勝率の信頼区間は、勝率を挟み、試合が多いほど狭い', () => {
        const [lo, hi] = wilson(30, 50);
        expect(lo).toBeLessThan(0.6);
        expect(hi).toBeGreaterThan(0.6);
        const [lo2, hi2] = wilson(300, 500);
        expect(hi2 - lo2).toBeLessThan(hi - lo);
    });
});

describe('勝率の測り方', () => {
    const opponents = [{ id: 'dragapult', cards: preset('dragapult') }, { id: 'mega-lucario', cards: preset('mega-lucario') }];

    it('同じシードなら、ほかの試合をはさんでも、並べて流しても、同じ結果になる', async () => {
        const options = { games: 2, seedParts: ['test', 1] };
        const first = await evaluateDeck(preset('garchomp'), opponents, { ...options, runner: inline });
        await evaluateDeck(preset('alakazam'), opponents.slice(0, 1), { games: 1, seedParts: ['other'], runner: inline });
        const again = await evaluateDeck(preset('garchomp'), opponents, { ...options, runner: inline });
        const parallel = await evaluateDeck(preset('garchomp'), opponents, { ...options, runner: workers });
        expect(first.games).toBe(4);
        expect(again).toEqual(first);
        expect(parallel).toEqual(first);
    });
});

describe('探索', () => {
    const base = {
        archetypeIds: ['garchomp'], presetIds: ['garchomp', 'dragapult'], finalGames: 2,
        date: '2026-11-27', engine: 'test', minutes: 60, runner: workers
    };

    it('同じシード・同じ回数なら、同じ結果になる', async () => {
        const a = await search({ ...base, seed: 3, rounds: 1 });
        const b = await search({ ...base, seed: 3, rounds: 1 });
        expect(b).toEqual(a);
        expect(a.decks).toHaveLength(1);
        expect(a.decks[0].rounds).toBe(1);
        expect(deckIssue(a.decks[0].cards)).toBeNull();
    });

    it('前の結果から続ける（デッキ・回数・走らせた数を引き継ぎ、決まりに合わないデッキは元のデッキに戻す）', async () => {
        const random = createRandom(11);
        const pool = buildPool(evolutionLine(ARCHETYPES.find(arch => arch.id === 'garchomp').key));
        let changed = preset('garchomp');
        for (let i = 0; i < 5; i++) changed = mutateDeck(changed, random, { pool });
        const previous = {
            version: 1, runs: 4,
            decks: [
                { archetype: 'garchomp', cards: changed, rounds: 9, accepted: 2 },
                { archetype: 'dragapult', cards: { 'basic-fire-energy': 60 }, rounds: 3, accepted: 1 }
            ]
        };
        // ガブリアスの構築済みデッキは相手に入れない（総当たりで構築済みと比べて戻す関門を通さず、引き継ぎだけを見る）
        const result = await search({ ...base, archetypeIds: ['garchomp', 'dragapult'], presetIds: ['dragapult'], previous, rounds: 0 });
        expect(result.runs).toBe(5);
        expect(result.seed).toBe(5);
        const garchomp = result.decks.find(deck => deck.archetype === 'garchomp');
        expect(deckKey(garchomp.cards)).toBe(deckKey(changed));
        expect(garchomp.rounds).toBe(9);
        expect(garchomp.accepted).toBe(2);
        expect(garchomp.sameAsPreset).toBe(false);
        // たねポケモンのない（決まりに合わない）デッキは、構築済みデッキから始め直す
        const dragapult = result.decks.find(deck => deck.archetype === 'dragapult');
        expect(deckKey(dragapult.cards)).toBe(deckKey(preset('dragapult')));
        expect(dragapult.sameAsPreset).toBe(true);
        // 総当たり：構築済みのドラパルトと、変えたガブリアス
        expect(result.gauntlet.map(entry => entry.id)).toEqual(['dragapult', 'best-garchomp']);
        expect(garchomp.games).toBe(2);
    });

    it('総当たりで構築済みデッキより勝率が低かった型は、構築済みデッキに戻す', async () => {
        // トレーナーズを基本エネルギーに替えた、明らかに弱いデッキ
        const weak = preset('garchomp');
        Object.keys(weak).filter(id => CARDS[id].kind === 'trainer').forEach(id => {
            weak['basic-fighting-energy'] = (weak['basic-fighting-energy'] ?? 0) + weak[id];
            delete weak[id];
        });
        expect(deckIssue(weak)).toBeNull();
        const previous = { version: 1, runs: 1, decks: [{ archetype: 'garchomp', cards: weak, rounds: 5, accepted: 3 }] };
        const result = await search({ ...base, previous, rounds: 0, finalGames: 4 });
        const garchomp = result.decks[0];
        expect(result.revertedThisRun).toBe(1);
        expect(garchomp.sameAsPreset).toBe(true);
        expect(deckKey(garchomp.cards)).toBe(deckKey(preset('garchomp')));
        expect(garchomp.rounds).toBe(5);
    });
});

describe('最強のデッキの画面', () => {
    const changed = { ...preset('garchomp') };
    const [firstId] = Object.keys(changed);
    changed[firstId]--;
    changed['basic-fighting-energy'] = (changed['basic-fighting-energy'] ?? 0) + 1;
    const sample = {
        version: 1,
        updatedAt: '2026-11-27',
        presets: { garchomp: { winRate: 0.6, wins: 60, games: 100 } },
        decks: [
            {
                archetype: 'garchomp', name: 'シロナのガブリアスex', base: 'garchomp', key: 'SV-P-255',
                keyPokemon: ['SV-P-255', 'SV9a-065'], cards: changed,
                winRate: 0.645, wins: 122.5, games: 190, ci95: [0.574, 0.71], sameAsPreset: false
            },
            {
                archetype: 'dragapult', name: 'ドラパルトex', base: 'dragapult', key: 'SV6-120',
                keyPokemon: ['SV6-120'], cards: preset('dragapult'),
                winRate: 0.5, wins: 95, games: 190, ci95: [0.43, 0.57], sameAsPreset: true
            },
            // 知らないカードのあるデッキは出さない
            { archetype: 'broken', name: 'こわれた', cards: { 'no-such-card': 60 }, winRate: 0.9, wins: 9, games: 10 }
        ]
    };

    it('デッキ・勝率と試合の数・目立つポケモン・使うボタン・計算した日を描く', () => {
        const html = bestDecksHtml(sample);
        expect(html).toContain('シロナのガブリアスex');
        expect(html).toContain('64.5%');
        expect(html).toContain('190試合で122.5勝');
        expect(html).toContain('57%〜71%');
        expect(html).toContain('構築済みは 60.0%');
        expect(html).toContain('構築済みから1枚変更');
        expect(html).toContain('構築済みのまま');
        expect(html).toContain(CARDS['SV9a-065'].name);
        expect(html).not.toContain('こわれた');
        expect(html.match(/data-best-use=/g)).toHaveLength(2);
        expect(html).toContain('このデッキを使う');
        expect(bestDecksDate(sample)).toBe('2026/11/27 の計算');
        expect(changedCount(readBestDecks(sample)[0])).toBe(1);
    });

    it('結果がないときは、その知らせを出す', () => {
        expect(bestDecksHtml({ decks: [] })).toContain('まだ結果がありません');
        expect(bestDecksHtml(null)).toContain('まだ結果がありません');
    });

    it('保存するときの名前は、名前の長さの上限に収まる', () => {
        expect(savedName({ name: 'シロナのガブリアスex' }).length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
        expect(savedName({ name: 'ドラパルトex' })).toBe('最強 ドラパルトex');
    });

    it('公開する結果のファイルは、どのデッキも遊べる', () => {
        const data = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'best-decks.json'), 'utf8'));
        expect(data.version).toBe(1);
        expect(data.decks.length).toBeGreaterThan(0);
        expect(readBestDecks(data)).toHaveLength(data.decks.length);
        data.decks.forEach(deck => {
            expect(deck.games).toBeGreaterThan(0);
            expect(deck.ci95[0]).toBeLessThanOrEqual(deck.winRate);
            expect(deck.ci95[1]).toBeGreaterThanOrEqual(deck.winRate);
        });
    });
});
