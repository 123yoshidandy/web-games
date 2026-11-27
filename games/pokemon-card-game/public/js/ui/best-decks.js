/**
 * 最強のデッキの画面：CPU 同士の対戦でさがした、勝率の高いデッキの一覧（data/best-decks.json。scripts/deck-search.mjs が作る）
 * 「このデッキを使う」で、自分のデッキに保存して、使うデッキにする
 */

import { CARDS, getCard, resolveCardId } from '../card-data.js';
import { DECKS } from '../decks.js';
import { deckProblem, sortedEntries } from '../deck-builder.js';
import { MAX_NAME_LENGTH } from '../deck-store.js';
import { pokemonArt } from './card-view.js';
import { showDetail, showPile } from './sheets.js';

export const DATA_URL = 'data/best-decks.json';

function escape(text) {
    return String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

const percent = value => `${(value * 100).toFixed(1)}%`;
const wholePercent = value => `${Math.round(value * 100)}%`;
const count = value => (Number.isInteger(value) ? String(value) : value.toFixed(1));

// 前の版のカードIDは今のIDに読み替え、知らないカードのあるデッキは出さない
export function readBestDecks(data) {
    if (!data || !Array.isArray(data.decks)) return [];
    return data.decks.flatMap(deck => {
        const cards = {};
        for (const [id, n] of Object.entries(deck.cards ?? {})) {
            const current = resolveCardId(id);
            if (!Object.hasOwn(CARDS, current) || !Number.isInteger(n) || n <= 0) return [];
            cards[current] = (cards[current] ?? 0) + n;
        }
        if (deckProblem({ cards })) return [];
        return [{ ...deck, cards, keyPokemon: (deck.keyPokemon ?? []).map(resolveCardId).filter(id => Object.hasOwn(CARDS, id)) }];
    });
}

// 構築済みデッキから変えた枚数
export function changedCount(deck) {
    const base = DECKS.find(item => item.id === deck.base);
    if (!base) return null;
    const ids = new Set([...Object.keys(base.cards), ...Object.keys(deck.cards)]);
    return [...ids].reduce((sum, id) => sum + Math.max(0, (deck.cards[id] ?? 0) - (base.cards[id] ?? 0)), 0);
}

// 「2026-11-27」→「2026/11/27」
const dateText = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll('-', '/') : '');

export function bestDecksHtml(data) {
    const decks = readBestDecks(data);
    if (!decks.length) return '<li class="best-empty note">まだ結果がありません</li>';
    return decks.map((deck, index) => {
        const changed = changedCount(deck);
        const preset = deck.base ? data.presets?.[deck.base] : null;
        const origin = deck.sameAsPreset || changed === 0
            ? '構築済みのまま'
            : changed === null ? '新しい型' : `構築済みから${changed}枚変更`;
        const presetNote = preset && !deck.sameAsPreset ? `（構築済みは ${percent(preset.winRate)}）` : '';
        const ci = Array.isArray(deck.ci95) ? `・95%の範囲 ${wholePercent(deck.ci95[0])}〜${wholePercent(deck.ci95[1])}` : '';
        const pokemon = deck.keyPokemon.map(id => {
            const card = getCard(id);
            return `<span class="best-mon type-${card.type}">${pokemonArt(card, 'best-mon-art')}<span class="best-mon-name">${escape(card.name)}</span></span>`;
        }).join('');
        return `<li class="best-row">
            <div class="best-rank">${index + 1}</div>
            <div class="best-main">
                <div class="best-head">
                    <span class="best-name">${escape(deck.name)}</span>
                    <span class="badge badge-muted">${origin}</span>
                </div>
                <div class="best-mons">${pokemon}</div>
                <div class="best-detail note">${count(deck.games)}試合で${count(deck.wins)}勝${ci}${presetNote}</div>
                <div class="best-buttons">
                    <button type="button" class="btn btn-secondary btn-small" data-best-view="${index}">中身</button>
                    <button type="button" class="btn btn-primary btn-small" data-best-use="${index}">このデッキを使う</button>
                </div>
            </div>
            <div class="best-rate">${percent(deck.winRate)}</div>
        </li>`;
    }).join('');
}

export function bestDecksDate(data) {
    const date = dateText(data?.updatedAt);
    return date ? `${date} の計算` : '';
}

// 保存するときの名前（「最強 〇〇」。長ければ詰める）
export function savedName(deck) {
    return `最強 ${deck.name}`.slice(0, MAX_NAME_LENGTH);
}

const $ = id => document.getElementById(id);

export default class BestDecksScreen {
    // store：createDeckStore() / handlers：show(scene) / onBack() / onUse(deckId, name) / toast(message)
    constructor(store, handlers, { fetchData = () => fetch(DATA_URL, { cache: 'no-cache' }).then(response => (response.ok ? response.json() : null)) } = {}) {
        this.store = store;
        this.handlers = handlers;
        this.fetchData = fetchData;
        this.data = null;
        this.decks = [];
        $('best-back').addEventListener('click', () => this.handlers.onBack());
        $('best-list').addEventListener('click', event => {
            const view = event.target.closest('[data-best-view]');
            const use = event.target.closest('[data-best-use]');
            if (view) {
                const deck = this.decks[Number(view.dataset.bestView)];
                showPile($('pile'), escape(deck.name), sortedEntries(deck).map(([id, n]) => ({ id, count: n })), cardId => showDetail($('detail'), { cardId }));
            }
            if (use) this.use(this.decks[Number(use.dataset.bestUse)]);
        });
    }

    async open() {
        this.handlers.show('best');
        if (!this.data) {
            $('best-date').textContent = '';
            $('best-list').innerHTML = '<li class="best-empty note">読み込んでいます…</li>';
        }
        try {
            const data = await this.fetchData();
            if (data) this.data = data;
        } catch {
            // つながらないときは、前に読んだ結果（なければ、読めなかった知らせ）
        }
        this.render();
    }

    render() {
        if (!this.data) {
            $('best-date').textContent = '';
            $('best-list').innerHTML = '<li class="best-empty note">結果を読み込めませんでした</li>';
            return;
        }
        this.decks = readBestDecks(this.data);
        $('best-date').textContent = bestDecksDate(this.data);
        $('best-list').innerHTML = bestDecksHtml(this.data);
    }

    use(deck) {
        const saved = this.store.save({ ...this.store.create(), name: savedName(deck), cards: { ...deck.cards } });
        this.handlers.onUse(saved.id, saved.name);
    }
}
