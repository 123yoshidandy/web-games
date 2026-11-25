/**
 * 記録（ログ）の文：ビューのイベントから、日本語の 1 行を作る。DOM に依存しない
 * 自分だけが知っている中身（secret）は「（あなただけ）」を付けて書く
 */

import { cardName } from './cards.js';

const ONLY_YOU = '（あなただけ）';

export function describeEvent(event, view) {
    const name = seat => (seat === view.seat ? 'あなた' : view.players[seat].name);
    const c = value => `「${cardName(value)}」`;
    const s = event.secret;
    switch (event.type) {
        case 'round':
            return `ラウンド ${event.round} 開始（${name(event.starter)}から）${event.faceUp.length ? `。表で除外：${event.faceUp.map(cardName).join('・')}` : ''}`;
        case 'draw':
            return s ? `あなたは${c(s.card)}を引いた` : null;
        case 'play': {
            const target = event.target === null ? '' : event.target === event.seat ? '（自分）' : `（→ ${name(event.target)}）`;
            const guess = event.guess !== null && event.guess !== undefined ? `、${c(event.guess)}と言った` : '';
            return `${name(event.seat)}が${c(event.card)}を出した${target}${guess}`;
        }
        case 'noEffect':
            return '選べる人がいないので、効果なし';
        case 'guard':
            return event.hit ? '当たり' : 'はずれ';
        case 'priest':
            return s ? `${name(event.target)}の手札は${c(s.card)}${ONLY_YOU}` : `${name(event.seat)}が${name(event.target)}の手札を見た`;
        case 'baron': {
            const cards = s ? `：${name(event.seat)} ${cardName(s.cards[event.seat])}、${name(event.target)} ${cardName(s.cards[event.target])}${ONLY_YOU}` : '';
            if (event.loser === null) return `${name(event.seat)}と${name(event.target)}が手札を比べて、同じ数${cards}`;
            return `${name(event.seat)}と${name(event.target)}が手札を比べた${cards}`;
        }
        case 'prince': {
            const drew = s ? `。引いたのは${c(s.card)}${ONLY_YOU}` : '';
            return `${name(event.target)}が${c(event.discarded)}を捨てた${event.fromSetAside ? '（除外したカードを引いた）' : ''}${drew}`;
        }
        case 'chancellor':
            return `${name(event.seat)}が山札から${event.count}枚引いた${s ? `：${s.cards.map(cardName).join('・')}${ONLY_YOU}` : ''}`;
        case 'keep':
            return `${name(event.seat)}が${event.count}枚を山札の下に戻した`;
        case 'king':
            if (s) {
                const gave = event.seat === view.seat ? s.gave : s.got;
                const got = event.seat === view.seat ? s.got : s.gave;
                return `${name(event.seat)}と${name(event.target)}が手札を交換：あなたは${c(gave)}を渡し、${c(got)}を受け取った`;
            }
            return `${name(event.seat)}と${name(event.target)}が手札を交換した`;
        case 'out':
            return `${name(event.seat)}が脱落（${event.cards.map(cardName).join('・') || '手札なし'}）`;
        case 'roundEnd': {
            const winners = event.winners.map(name).join('と');
            const spy = event.spy !== null ? `。スパイで${name(event.spy)}に好意の印` : '';
            return `${winners}がラウンドに勝った${spy}`;
        }
        case 'end':
            return `${name(event.winner)}の勝ち`;
        default:
            return null;
    }
}
