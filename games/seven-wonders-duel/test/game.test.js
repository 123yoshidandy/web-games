import { describe, it, expect } from 'vitest';
import Game, { payment } from '../public/js/game.js';
import { CARDS, WONDERS, AGE_CARDS, GUILDS, layoutSlots, parseCost } from '../public/js/cards.js';
import { newGame, playGame, skipDraft, setCity, placeCard, openSlots, snapshot } from './helpers.js';

const build = (game, seat, slot) => game.applyCommand(seat, { type: 'build', slot });
const first = (game) => openSlots(game)[0];

describe('カードのデータ', () => {
    it('時代ごとに23枚、ギルド7枚、七不思議12枚、名前と効果がある', () => {
        expect(AGE_CARDS.map(list => list.length)).toEqual([23, 23, 20]);
        expect(GUILDS).toHaveLength(7);
        expect(Object.keys(WONDERS)).toHaveLength(12);
        Object.values(CARDS).forEach(c => expect(c.name, c.key).toBeTruthy());
    });

    it('色ごとの枚数（時代I：茶6・灰2・青3・緑4・赤4・黄4）', () => {
        const count = (age, color) => AGE_CARDS[age - 1].filter(k => CARDS[k].color === color).length;
        expect(['brown', 'grey', 'blue', 'green', 'red', 'yellow'].map(c => count(1, c))).toEqual([6, 2, 3, 4, 4, 4]);
        expect(['brown', 'grey', 'blue', 'green', 'red', 'yellow'].map(c => count(2, c))).toEqual([3, 2, 5, 4, 5, 4]);
        expect(['brown', 'grey', 'blue', 'green', 'red', 'yellow'].map(c => count(3, c))).toEqual([0, 0, 6, 4, 5, 5]);
    });

    it('連鎖の印は、渡す側と受ける側がそろっている', () => {
        const chains = Object.values(CARDS).filter(c => c.chain).map(c => c.chain);
        const frees = Object.values(CARDS).filter(c => c.free).map(c => c.free);
        expect(new Set(chains).size).toBe(chains.length);
        frees.forEach(f => expect(chains, f).toContain(f));
        chains.forEach(c => expect(frees, c).toContain(c));
        // 受ける側は、渡す側より後の時代
        Object.values(CARDS).filter(c => c.free).forEach(c => {
            const from = Object.values(CARDS).find(x => x.chain === c.free);
            expect(from.age, c.key).toBeLessThan(c.age);
        });
    });

    it('科学の印は6種類が2枚ずつ', () => {
        const symbols = Object.values(CARDS).map(c => c.science).filter(Boolean);
        expect(symbols).toHaveLength(12);
        expect(new Set(symbols).size).toBe(6);
    });

    it('費用の文字列を読む', () => {
        expect(parseCost('3C')).toMatchObject({ coins: 3, clay: 1, wood: 0 });
        expect(parseCost('SSWG')).toMatchObject({ coins: 0, stone: 2, wood: 1, glass: 1 });
        expect(parseCost('')).toMatchObject({ coins: 0, stone: 0 });
    });
});

describe('準備', () => {
    it('各自7コイン、盤に進歩トークン5枚、各時代20枚（時代IIIはギルド3枚）', () => {
        const game = newGame(3);
        expect(game.players.map(p => p.coins)).toEqual([7, 7]);
        expect(game.tokensBoard).toHaveLength(5);
        expect(game.tokensOut).toHaveLength(5);
        [1, 2, 3].forEach(age => {
            expect(game.decks[age]).toHaveLength(20);
            expect(game.removed[age]).toHaveLength(age === 3 ? 7 : 3);
        });
        expect(game.decks[3].filter(k => CARDS[k].color === 'purple')).toHaveLength(3);
        expect(game.decks[3].filter(k => CARDS[k].color !== 'purple' && CARDS[k].age === 3)).toHaveLength(17);
        expect(new Set([...game.decks[1], ...game.removed[1]]).size).toBe(23);
    });

    it('七不思議のドラフト：先手1枚 → 後手2枚 → 先手が残り、2回目は逆。終わったら先手から時代I', () => {
        const game = new Game([{ name: 'A' }, { name: 'B' }], { seed: 4, startPlayer: 1 });
        const pickers = [];
        while (game.phase === 'draft') {
            const seat = game.actors()[0];
            pickers.push(seat);
            expect(game.applyCommand(seat, { type: 'pickWonder', wonder: game.draft.offer[0] })).toBe(true);
        }
        // 3枚目と6枚目は自動で渡るので、選ぶのは各回3回
        expect(pickers).toEqual([1, 0, 0, 0, 1, 1]);
        expect(game.players.map(p => p.wonders.length)).toEqual([4, 4]);
        expect(game.phase).toBe('play');
        expect(game.age).toBe(1);
        expect(game.current).toBe(1);
        const all = game.players.flatMap(p => p.wonders.map(w => w.key));
        expect(new Set(all).size).toBe(8);
    });

    it('ドラフトで出ていない七不思議は選べない', () => {
        const game = newGame(1);
        const other = Object.keys(WONDERS).find(k => !game.draft.offer.includes(k));
        expect(game.applyCommand(0, { type: 'pickWonder', wonder: other })).toBe(false);
        expect(game.applyCommand(1, { type: 'pickWonder', wonder: game.draft.offer[0] })).toBe(false);
    });
});

describe('カードの並べ方と取れるカード', () => {
    it('時代Iは 2・3・4・5・6 枚で、表と裏の行が交互。取れるのは一番下の6枚', () => {
        const slots = layoutSlots(1);
        expect([0, 1, 2, 3, 4].map(r => slots.filter(s => s.row === r).length)).toEqual([2, 3, 4, 5, 6]);
        expect([0, 1, 2, 3, 4].map(r => slots.find(s => s.row === r).faceUp)).toEqual([true, false, true, false, true]);
        const game = playGame(2);
        expect(openSlots(game).map(i => game.structure[i].row)).toEqual([4, 4, 4, 4, 4, 4]);
    });

    it('時代IIは 6・5・4・3・2 枚。取れるのは一番下の2枚', () => {
        const slots = layoutSlots(2);
        expect([0, 1, 2, 3, 4].map(r => slots.filter(s => s.row === r).length)).toEqual([6, 5, 4, 3, 2]);
        const game = playGame(2);
        game.startAge(2, 0);
        expect(openSlots(game)).toEqual([18, 19]);
    });

    it('時代IIIは 2・3・4・2・4・3・2 枚。真ん中の2枚の行は、左右に分かれる', () => {
        const slots = layoutSlots(3);
        expect([0, 1, 2, 3, 4, 5, 6].map(r => slots.filter(s => s.row === r).length)).toEqual([2, 3, 4, 2, 4, 3, 2]);
        expect(slots.filter(s => s.row === 3).map(s => s.x)).toEqual([1, 5]);
        expect([0, 1, 2, 3, 4, 5, 6].map(r => slots.find(s => s.row === r).faceUp)).toEqual([true, false, true, false, true, false, true]);
        const game = playGame(2);
        game.startAge(3, 0);
        expect(openSlots(game)).toEqual([18, 19]);
        // 真ん中の行の左のカード（x=1）は、下の行の x=0 と x=2 に覆われる
        const middle = game.structure.findIndex(s => s.row === 3 && s.x === 1);
        game.structure.forEach(s => { if (s.row >= 5) s.taken = true; });
        game.structure.filter(s => s.row === 4 && s.x === 0).forEach(s => { s.taken = true; });
        expect(game.isAccessible(middle)).toBe(false);
        game.structure.filter(s => s.row === 4 && s.x === 2).forEach(s => { s.taken = true; });
        expect(game.isAccessible(middle)).toBe(true);
        // 2つ上の行のカード（x=2）は、真ん中の行の x=1 だけに覆われる
        const upper = game.structure.findIndex(s => s.row === 2 && s.x === 2);
        expect(game.isAccessible(upper)).toBe(false);
        game.structure[middle].taken = true;
        expect(game.isAccessible(upper)).toBe(true);
    });

    it('覆いがなくなった裏のカードは表になる', () => {
        const game = playGame(5);
        const covered = game.structure.findIndex(s => s.row === 3 && s.x === 1);
        expect(game.structure[covered].faceUp).toBe(false);
        game.applyCommand(0, { type: 'discard', slot: 14 });
        expect(game.structure[covered].faceUp).toBe(false);
        game.applyCommand(1, { type: 'discard', slot: 15 });
        expect(game.structure[covered].faceUp).toBe(true);
        expect(game.events.some(e => e.type === 'reveal' && e.slots.includes(covered))).toBe(true);
    });

    it('覆われているカードは取れない', () => {
        const game = playGame(5);
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'discard', slot: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', slot: 99 })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', slot: '15' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('カードの使い方', () => {
    it('建てる：コインを払い、都市に置く', () => {
        const game = playGame(1);
        const slot = first(game);
        placeCard(game, slot, 'loggingCamp');
        expect(build(game, 0, slot)).toBe(true);
        expect(game.players[0].cards).toEqual(['loggingCamp']);
        expect(game.players[0].coins).toBe(6);
        expect(game.current).toBe(1);
    });

    it('捨てる：2コイン＋自分の黄のカードの数', () => {
        const game = playGame(1);
        setCity(game, 0, { cards: ['tavern', 'woodReserve'] });
        const slot = first(game);
        const key = game.structure[slot].key;
        expect(game.applyCommand(0, { type: 'discard', slot })).toBe(true);
        expect(game.players[0].coins).toBe(7 + 4);
        expect(game.discardPile).toEqual([key]);
    });

    it('資源は 2＋相手の茶と灰が生む数 のコインで買う。黄の「どれか1つ」は相手の値段に数えない', () => {
        const game = playGame(1);
        setCity(game, 1, { cards: ['clayPool', 'brickyard', 'forum', 'caravansery'] });
        const slot = first(game);
        placeCard(game, slot, 'garrison');
        expect(game.cardPrice(0, 'garrison').coins).toBe(5);
        expect(game.cardPrice(0, 'baths').coins).toBe(2);
        expect(build(game, 0, slot)).toBe(true);
        expect(game.players[0].coins).toBe(2);
    });

    it('蓄え（黄）があれば、その資源は1コイン', () => {
        const game = playGame(1);
        setCity(game, 1, { cards: ['clayPool', 'brickyard'] });
        setCity(game, 0, { cards: ['clayReserve'] });
        expect(game.cardPrice(0, 'statue').coins).toBe(2);
        setCity(game, 0, { cards: ['customsHouse'] });
        expect(game.cardPrice(0, 'laboratory').coins).toBe(2 + 1 + 1);
    });

    it('「どれか1つ」は、足りない資源に一番得になるように当てる', () => {
        const game = playGame(1);
        setCity(game, 0, { cards: ['caravansery', 'forum', 'lumberYard'] });
        setCity(game, 1, { cards: ['quarry', 'quarry'] });
        // 図書館 S1W1G1：木は自分、石は隊商宿、ガラスは広場
        expect(game.cardPrice(0, 'library').coins).toBe(0);
        // 水道橋 S3：隊商宿で石1つ、残りの2つを 2+2=4 で買う
        expect(game.cardPrice(0, 'aqueduct').coins).toBe(8);
    });

    it('連鎖の印があれば無料。都市計画なら4コイン', () => {
        const game = playGame(1);
        game.startAge(2, 0);
        setCity(game, 0, { cards: ['theater'], coins: 0, tokens: ['urbanism'] });
        const slot = first(game);
        placeCard(game, slot, 'statue');
        expect(game.cardPrice(0, 'statue')).toMatchObject({ coins: 0, chain: true });
        expect(build(game, 0, slot)).toBe(true);
        expect(game.players[0].coins).toBe(4);
    });

    it('コインが足りなければ建てられず、状態は変わらない', () => {
        const game = playGame(1);
        setCity(game, 0, { coins: 1 });
        const slot = first(game);
        placeCard(game, slot, 'baths');
        const before = snapshot(game);
        expect(build(game, 0, slot)).toBe(false);
        expect(game.lastError).toBe('コインが足りません');
        expect(snapshot(game)).toBe(before);
    });

    it('石工：青の資源が2つ少なくて済む。一番高いものから減らす', () => {
        const game = playGame(1);
        setCity(game, 1, { cards: ['quarry', 'quarry', 'quarry'] });
        setCity(game, 0, { tokens: ['masonry'] });
        // 水道橋 S3：石は1つ5コイン、1つだけ買う
        expect(game.cardPrice(0, 'aqueduct').coins).toBe(5);
        // 赤には効かない
        expect(game.cardPrice(0, 'walls').coins).toBe(10);
    });

    it('経済：相手が資源を買って払ったコインを受け取る（カードのコインの費用は含まない）', () => {
        const game = playGame(1);
        setCity(game, 1, { tokens: ['economy'], coins: 0 });
        const slot = first(game);
        placeCard(game, slot, 'caravansery'); // 2コイン＋ガラス＋パピルス
        game.startAge(2, 0);
        placeCard(game, first(game), 'caravansery');
        expect(build(game, 0, first(game))).toBe(true);
        expect(game.players[0].coins).toBe(7 - 6);
        expect(game.players[1].coins).toBe(4);
    });
});

describe('七不思議', () => {
    it('カードを使って建てる。効果（コイン・もう1手）', () => {
        const game = playGame(1);
        setCity(game, 0, { wonders: ['templeOfArtemis'], cards: ['lumberYard', 'quarry', 'glassworks', 'press'] });
        const slot = first(game);
        const key = game.structure[slot].key;
        expect(game.applyCommand(0, { type: 'wonder', slot, wonder: 'templeOfArtemis' })).toBe(true);
        expect(game.players[0].wonders[0]).toMatchObject({ built: true, card: key });
        expect(game.players[0].coins).toBe(7 + 12);
        expect(game.discardPile).toEqual([]);
        expect(game.current).toBe(0); // もう1手
    });

    it('持っていない七不思議と、建てた七不思議は建てられない', () => {
        const game = playGame(1);
        setCity(game, 0, { wonders: [{ key: 'pyramids', built: true }], coins: 50 });
        expect(game.applyCommand(0, { type: 'wonder', slot: first(game), wonder: 'pyramids' })).toBe(false);
        expect(game.applyCommand(0, { type: 'wonder', slot: first(game), wonder: 'sphinx' })).toBe(false);
    });

    it('2人合わせて7つ建ったら、残りの1つは建てられなくなる', () => {
        const game = playGame(1);
        setCity(game, 0, { coins: 50, wonders: ['pyramids', ...['sphinx', 'colossus', 'piraeus'].map(key => ({ key, built: true }))] });
        setCity(game, 1, { wonders: ['mausoleum', ...['appianWay', 'circusMaximus', 'greatLibrary'].map(key => ({ key, built: true }))] });
        expect(game.applyCommand(0, { type: 'wonder', slot: first(game), wonder: 'pyramids' })).toBe(true);
        expect(game.wondersBuiltTotal()).toBe(7);
        expect(game.players[1].wonders.map(w => w.key)).not.toContain('mausoleum');
        expect(game.players[1].wonders).toHaveLength(3);
    });

    it('アッピア街道：3コイン、相手は3コインを失う（足りない分は失わない）', () => {
        const game = playGame(1);
        setCity(game, 0, { coins: 30, wonders: ['appianWay'] });
        setCity(game, 1, { coins: 2 });
        game.applyCommand(0, { type: 'wonder', slot: first(game), wonder: 'appianWay' });
        expect(game.players[1].coins).toBe(0);
        expect(game.current).toBe(0);
    });

    it('大競技場：相手の灰のカードを1枚選んで捨てさせ、盾1つ', () => {
        const game = playGame(1);
        setCity(game, 0, { coins: 30, wonders: ['circusMaximus'] });
        setCity(game, 1, { cards: ['glassworks', 'press', 'quarry'] });
        game.applyCommand(0, { type: 'wonder', slot: first(game), wonder: 'circusMaximus' });
        expect(game.phase).toBe('destroy');
        expect(game.military).toBe(1);
        expect(game.applyCommand(0, { type: 'destroy', card: 'quarry' })).toBe(false);
        expect(game.applyCommand(0, { type: 'destroy', card: 'press' })).toBe(true);
        expect(game.players[1].cards).toEqual(['glassworks', 'quarry']);
        expect(game.discardPile).toContain('press');
        expect(game.current).toBe(1);
    });

    it('相手にその色がなければ、捨てさせる選択は飛ばす', () => {
        const game = playGame(1);
        setCity(game, 0, { coins: 30, wonders: ['statueOfZeus'] });
        game.applyCommand(0, { type: 'wonder', slot: first(game), wonder: 'statueOfZeus' });
        expect(game.phase).toBe('play');
        expect(game.current).toBe(1);
    });

    it('霊廟：捨て札から1枚を無料で建て、その効果も働く', () => {
        const game = playGame(1);
        setCity(game, 0, { coins: 30, wonders: ['mausoleum'] });
        game.discardPile = ['tavern', 'garrison'];
        game.applyCommand(0, { type: 'wonder', slot: first(game), wonder: 'mausoleum' });
        expect(game.phase).toBe('revive');
        const coins = game.players[0].coins;
        expect(game.applyCommand(0, { type: 'revive', card: 'tavern' })).toBe(true);
        expect(game.players[0].cards).toContain('tavern');
        expect(game.players[0].coins).toBe(coins + 4);
        expect(game.discardPile).toEqual(['garrison']);
    });

    it('大図書館：使われていない進歩トークンから3枚を引き、1枚を取る。残りは戻す', () => {
        const game = playGame(1);
        setCity(game, 0, { coins: 30, wonders: ['greatLibrary'] });
        game.applyCommand(0, { type: 'wonder', slot: first(game), wonder: 'greatLibrary' });
        expect(game.phase).toBe('library');
        expect(game.libraryDraw).toHaveLength(3);
        game.libraryDraw.forEach(t => expect(game.tokensOut).toContain(t));
        expect(game.applyCommand(0, { type: 'progress', token: game.tokensBoard[0] })).toBe(false);
        const token = game.libraryDraw[1];
        expect(game.applyCommand(0, { type: 'progress', token })).toBe(true);
        expect(game.players[0].tokens).toEqual([token]);
        expect(game.tokensOut).toHaveLength(4);
        expect(game.libraryDraw).toEqual([]);
    });

    it('建築：七不思議の資源が2つ少なくて済む。神学：七不思議にもう1手が付く', () => {
        const game = playGame(1);
        setCity(game, 0, { wonders: ['pyramids'], tokens: ['architecture', 'theology'] });
        expect(game.wonderPrice(0, 'pyramids').coins).toBe(4); // 石3パピルス1のうち2つ減って、2つを2コインずつ
        game.applyCommand(0, { type: 'wonder', slot: first(game), wonder: 'pyramids' });
        expect(game.current).toBe(0);
    });
});

describe('軍事', () => {
    it('盾1つで1マス。3マス目で相手は2コイン、6マス目で5コインを失う（1回だけ）', () => {
        const game = playGame(1);
        game.military = 2;
        const slot = first(game);
        placeCard(game, slot, 'guardTower');
        build(game, 0, slot);
        expect(game.military).toBe(3);
        expect(game.players[1].coins).toBe(5);
        game.military = 1;
        game.moveMilitary(0, 2);
        expect(game.players[1].coins).toBe(5);
        game.moveMilitary(0, 3);
        expect(game.military).toBe(6);
        expect(game.players[1].coins).toBe(0);
    });

    it('相手側にも同じトークンがある', () => {
        const game = playGame(1);
        game.moveMilitary(1, 3);
        expect(game.military).toBe(-3);
        expect(game.players[0].coins).toBe(5);
    });

    it('戦略：これから建てる赤は盾が1つ多い', () => {
        const game = playGame(1);
        setCity(game, 0, { tokens: ['strategy'] });
        const slot = first(game);
        placeCard(game, slot, 'guardTower');
        build(game, 0, slot);
        expect(game.military).toBe(2);
    });

    it('相手の都（9マス目）に着いたら、その場で軍事の勝利', () => {
        const game = playGame(1);
        game.military = -7;
        game.current = 1;
        setCity(game, 1, { coins: 20 });
        const slot = first(game);
        placeCard(game, slot, 'walls');
        game.age = 2;
        expect(build(game, 1, slot)).toBe(true);
        expect(game.military).toBe(-9);
        expect(game.isOver()).toBe(true);
        expect(game.winner).toBe(1);
        expect(game.victory).toBe('military');
        expect(game.applyCommand(0, { type: 'discard', slot: first(game) })).toBe(false);
    });
});

describe('科学と進歩トークン', () => {
    it('同じ印を2つそろえたら、盤の進歩トークンを1枚取る', () => {
        const game = playGame(1);
        setCity(game, 0, { cards: ['apothecary'], coins: 20 });
        const slot = first(game);
        placeCard(game, slot, 'school');
        build(game, 0, slot);
        expect(game.phase).toBe('progress');
        expect(game.actors()).toEqual([0]);
        expect(game.applyCommand(0, { type: 'discard', slot: first(game) })).toBe(false);
        const token = game.tokensBoard.find(t => t !== 'agriculture') ?? game.tokensBoard[0];
        expect(game.applyCommand(0, { type: 'progress', token })).toBe(true);
        expect(game.players[0].tokens).toEqual([token]);
        expect(game.tokensBoard).toHaveLength(4);
        expect(game.current).toBe(1);
    });

    it('農業・都市計画は6コイン', () => {
        const game = playGame(1);
        game.tokensBoard = ['agriculture', 'urbanism'];
        game.pending = [{ type: 'progress', seat: 0 }];
        game.phase = 'progress';
        game.applyCommand(0, { type: 'progress', token: 'urbanism' });
        expect(game.players[0].coins).toBe(13);
    });

    it('盤に進歩トークンが残っていなければ、何もない', () => {
        const game = playGame(1);
        game.tokensBoard = [];
        setCity(game, 0, { cards: ['apothecary'], coins: 20 });
        const slot = first(game);
        placeCard(game, slot, 'school');
        build(game, 0, slot);
        expect(game.phase).toBe('play');
        expect(game.current).toBe(1);
    });

    it('違う印を6種類そろえたら、その場で科学の勝利（法のトークンも数える）', () => {
        const game = playGame(1);
        setCity(game, 0, { cards: ['apothecary', 'workshop', 'scriptorium', 'pharmacist'], tokens: ['law'], coins: 20 });
        const slot = first(game);
        placeCard(game, slot, 'academy');
        game.age = 3;
        build(game, 0, slot);
        expect(game.isOver()).toBe(true);
        expect(game.winner).toBe(0);
        expect(game.victory).toBe('science');
    });

    it('5種類では勝たない', () => {
        const game = playGame(1);
        setCity(game, 0, { cards: ['apothecary', 'workshop', 'scriptorium'], coins: 20 });
        const slot = first(game);
        placeCard(game, slot, 'academy');
        build(game, 0, slot);
        game.players[0].tokens = ['law'];
        expect(game.isOver()).toBe(false);
    });
});

describe('時代の終わり', () => {
    // 時代の最後の1枚まで進める（どちらも捨てる）
    function playToLastCard(game) {
        while (game.structure.filter(s => !s.taken).length > 1) game.applyCommand(game.current, { type: 'discard', slot: first(game) });
    }

    it('軍事で負けている方が、次の時代の先手を決める', () => {
        const game = playGame(1);
        game.military = 2;
        playToLastCard(game);
        game.applyCommand(game.current, { type: 'discard', slot: first(game) });
        expect(game.phase).toBe('starter');
        expect(game.actors()).toEqual([1]);
        expect(game.applyCommand(1, { type: 'starter', seat: 0 })).toBe(true);
        expect(game.age).toBe(2);
        expect(game.current).toBe(0);
        expect(openSlots(game)).toHaveLength(2);
    });

    it('並んでいれば、最後のカードを取った人が決める', () => {
        const game = playGame(1);
        playToLastCard(game);
        const last = game.current;
        game.applyCommand(last, { type: 'discard', slot: first(game) });
        expect(game.actors()).toEqual([last]);
        expect(game.applyCommand(last, { type: 'starter', seat: 2 })).toBe(false);
    });

    it('時代の最後のカードで「もう1手」を得ても、もう1手はない', () => {
        const game = playGame(1);
        game.military = -1;
        playToLastCard(game);
        const seat = game.current;
        setCity(game, seat, { coins: 50, wonders: ['sphinx'] });
        game.applyCommand(seat, { type: 'wonder', slot: first(game), wonder: 'sphinx' });
        expect(game.phase).toBe('starter');
        expect(game.actors()).toEqual([0]);
    });
});

describe('点と勝ち負け', () => {
    it('点の内訳：青・緑・黄・ギルド・七不思議・進歩トークン・軍事・3コインで1点', () => {
        const game = playGame(1);
        setCity(game, 0, {
            cards: ['palace', 'academy', 'lighthouse', 'magistratesGuild', 'theater', 'tavern'],
            coins: 10,
            tokens: ['mathematics', 'philosophy'],
            wonders: [{ key: 'pyramids', built: true }]
        });
        setCity(game, 1, { cards: ['altar', 'baths', 'tribunal'] });
        game.military = 4;
        expect(game.score(0)).toEqual({
            blue: 10, green: 3, yellow: 3, purple: 3, wonders: 9, tokens: 6 + 7, coins: 3, military: 5, total: 49
        });
        expect(game.score(1).military).toBe(0);
    });

    it('ギルド：建てたときのコインと、終わりの点は、多い方の都市で数える', () => {
        const game = playGame(1);
        game.age = 3;
        setCity(game, 0, { cards: ['woodReserve'], coins: 20 });
        setCity(game, 1, { cards: ['tavern', 'clayReserve', 'stoneReserve'] });
        const slot = first(game);
        placeCard(game, slot, 'merchantsGuild');
        build(game, 0, slot);
        expect(game.players[0].coins).toBe(20 - (game.cardPrice(0, 'merchantsGuild').coins) + 3);
        expect(game.score(0).purple).toBe(3);
    });

    it('金貸しのギルドは、コインの多い方の都市の3コインにつき1点。建築家のギルドは七不思議の多い方の1つにつき2点', () => {
        const game = playGame(1);
        setCity(game, 0, { cards: ['moneylendersGuild', 'buildersGuild'], coins: 4, wonders: [{ key: 'sphinx', built: true }] });
        setCity(game, 1, { coins: 13, wonders: [{ key: 'pyramids', built: true }, { key: 'colossus', built: true }] });
        expect(game.score(0).purple).toBe(4 + 4);
    });

    it('時代IIIの終わりに、点の多い方の勝ち。同点なら青の点、それも同じなら引き分け', () => {
        const finishWith = (a, b) => {
            const game = playGame(1);
            game.age = 3;
            setCity(game, 0, a);
            setCity(game, 1, b);
            game.finish();
            return game;
        };
        let game = finishWith({ cards: ['palace'], coins: 0 }, { cards: ['obelisk'], coins: 0 });
        expect([game.winner, game.victory]).toEqual([0, 'civil']);
        game = finishWith({ cards: ['theater', 'apothecary', 'workshop'], coins: 0 }, { cards: ['tribunal'], coins: 0 });
        expect(game.score(0).total).toBe(game.score(1).total);
        expect(game.winner).toBe(1);
        game = finishWith({ cards: ['theater'], coins: 0 }, { cards: ['altar'], coins: 0 });
        expect([game.winner, game.victory]).toEqual([null, 'draw']);
    });

    it('時代IIIの最後のカードで終わり、点の勝利が決まる', () => {
        const game = playGame(1);
        game.startAge(3, 0);
        while (!game.isOver()) game.applyCommand(game.current, { type: 'discard', slot: first(game) });
        expect(['civil', 'draw']).toContain(game.victory);
    });
});

describe('断る操作', () => {
    it('番でない人・知らない操作・今はできない操作は断り、状態を変えない', () => {
        const game = playGame(3);
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'discard', slot: first(game) })).toBe(false);
        expect(game.applyCommand(0, { type: 'bogus' })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(game.applyCommand(0, { type: 'progress', token: game.tokensBoard[0] })).toBe(false);
        expect(game.applyCommand(0, { type: 'starter', seat: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'wonder', slot: first(game), wonder: 'nothing' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('支払いの計算は、相手の都市を変えない', () => {
        const game = skipDraft(newGame(8));
        const before = snapshot(game);
        payment(game.players[0], game.players[1], parseCost('SSSWWGP'), 2);
        expect(snapshot(game)).toBe(before);
    });
});
