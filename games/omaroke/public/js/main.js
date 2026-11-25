/**
 * 画面の進行：タイトル → ゲーム → 結果
 * ゲームの状態はコントローラーのビューだけを見て描く（オンライン対戦のコントローラーに差し替えられるように）
 */

import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CARDS, POKEMON, ROLES, STATUSES, TYPES, ABILITIES, WEATHERS } from './data.js';
import { spritesMarkup, icon, cardArt, monArt, titleArt } from './art.js';
import { helpMarkup } from './help.js';
import { createSeed } from './random.js';

const $ = id => document.getElementById(id);
const SETTINGS_KEY = 'omaroke.settings.v1';
const CPU_NAMES = ['カスミ', 'タケシ', 'マチス', 'エリカ', 'ナツメ'];
const RESULT_DELAY_MS = 900;
// 確かめるときだけ、URL の ?cpuDelay=ミリ秒 で CPU の間隔を変えられる
const CPU_DELAY = Number(new URLSearchParams(location.search).get('cpuDelay')) || undefined;

const store = {
    load(key) {
        try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    save(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ }
    }
};

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let settings = { count: 5, mode: 'basic', level: 'normal', ...store.load(SETTINGS_KEY) };
let controller = null;
let view = null;
let prevView = null;
let ui = freshUi();
let resultTimer = null;

function freshUi() {
    return { key: null, card: null, band: false, picks: [], choose: [] };
}

const nameOf = seat => (seat === view.you ? 'あなた' : escapeHtml(view.players[seat].name));
const monOf = seat => {
    const p = view.players[seat];
    return p.pokemon[p.battle] ?? null;
};
const cardInHand = id => view.hand.find(c => c.id === id);
const handHas = key => view.hand.some(c => c.key === key);

// ---------- 画面の切り替え ----------

function showScene(name) {
    $('screen-title').hidden = name !== 'title';
    $('screen-game').hidden = name !== 'game';
    if (name === 'title') renderTitle();
}

function renderTitle() {
    const mark = (id, attr, value) => document.querySelectorAll(`#${id} button`).forEach(b => b.setAttribute('aria-checked', String(b.dataset[attr] === String(value))));
    mark('player-count', 'count', settings.count);
    mark('rule-mode', 'mode', settings.mode);
    mark('cpu-level', 'level', settings.level);
    $('resume').hidden = !loadSavedGame();
}

// ---------- ゲームの開始 ----------

function newSetup() {
    const players = [{ name: 'あなた', isCPU: false }];
    for (let i = 1; i < settings.count; i++) players.push({ name: CPU_NAMES[i - 1], isCPU: true });
    return { players, options: { seed: createSeed(), mode: settings.mode, level: settings.level } };
}

function startGame(setup) {
    controller?.stop();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    clearTimeout(resultTimer);
    try {
        controller = new LocalGameController(setup, { onUpdate, onError }, { cpuDelay: CPU_DELAY });
    } catch (error) {
        console.warn(error);
        clearSavedGame();
        controller = new LocalGameController(newSetup(), { onUpdate, onError }, { cpuDelay: CPU_DELAY });
    }
    view = controller.getView();
    prevView = null;
    ui = freshUi();
    showScene('game');
    render();
    if (view.phase === 'end') showResult();
}

function goHome() {
    controller?.stop();
    controller = null;
    clearTimeout(resultTimer);
    showScene('title');
}

// ---------- 更新 ----------

function onUpdate() {
    if (!controller) return;
    prevView = view;
    view = controller.getView();
    render();
    if (view.phase === 'end' && prevView?.phase !== 'end') {
        clearTimeout(resultTimer);
        resultTimer = setTimeout(showResult, RESULT_DELAY_MS);
    }
}

function onError(message) {
    const prompt = $('action').querySelector('.prompt');
    if (prompt) prompt.textContent = message;
}

function send(command) {
    ui = { ...freshUi(), key: ui.key };
    controller.send(command);
}

// ---------- 選ぶ操作 ----------

// 今、相手を選んでいるカード（または ちからのハチマキ）で選べる席
function targetSeats() {
    if (!view.options) return [];
    if (ui.band) return ui.picks.length === 2 ? view.options.bandTargets : [];
    if (ui.card === null) return [];
    return view.options.cards[ui.card]?.targets ?? [];
}

function selectCard(id) {
    if (view.prompt?.kind === 'trim' && view.myAction) {
        togglePick(id, view.prompt.count);
        return;
    }
    if (!view.options) return;
    if (ui.band) {
        togglePick(id, 2);
        return;
    }
    ui.card = ui.card === id ? null : id;
    ui.picks = [];
    render();
}

function togglePick(id, max) {
    if (ui.picks.includes(id)) ui.picks = ui.picks.filter(x => x !== id);
    else if (ui.picks.length < max) ui.picks = [...ui.picks, id];
    render();
}

function selectSeat(seat) {
    const seats = targetSeats();
    if (!seats.includes(seat)) {
        openDetail(seat);
        return;
    }
    if (ui.band) {
        send({ type: 'band', discards: ui.picks, target: seat });
        return;
    }
    const card = cardInHand(ui.card);
    if (card.key === 'zapdos') {
        ui.picks = ui.picks.includes(seat) ? ui.picks.filter(x => x !== seat) : [...ui.picks, seat].slice(-2);
        render();
        return;
    }
    const opt = view.options.cards[ui.card];
    const command = { type: 'play', card: ui.card, target: seat };
    // 玄人のキズぐすり：バトルポケモンに使えなければ、ベンチのポケモンに使う
    if (opt.slots) {
        const slots = opt.slots[seat] ?? [];
        command.slot = slots.includes(view.players[seat].battle) ? view.players[seat].battle : slots[0];
    }
    send(command);
}

function useCard() {
    const card = cardInHand(ui.card);
    if (!card) return;
    if (card.key === 'zapdos') {
        if (ui.picks.length > 0) send({ type: 'play', card: card.id, targets: ui.picks });
        return;
    }
    const opt = view.options.cards[card.id];
    const command = { type: 'play', card: card.id };
    if (opt.slots) {
        const me = view.players[view.you];
        command.slot = opt.slots.includes(me.battle) ? me.battle : opt.slots[0];
    }
    send(command);
}

function act(name) {
    const pr = view.prompt;
    switch (name) {
        case 'use': useCard(); break;
        case 'cancel': ui = { ...freshUi(), key: ui.key }; render(); break;
        case 'band': ui = { ...freshUi(), key: ui.key, band: true }; render(); break;
        case 'switch': send({ type: 'switch' }); break;
        case 'end': send({ type: 'end' }); break;
        case 'evolve': {
            const slots = view.options.evolveSlots;
            const me = view.players[view.you];
            send({ type: 'end', evolve: slots.includes(me.battle) ? me.battle : slots[0] });
            break;
        }
        case 'trim': if (ui.picks.length === pr.count) send({ type: 'respond', discards: ui.picks }); break;
        case 'choose': if (ui.choose.length === view.pick) send({ type: 'choose', picks: ui.choose }); break;
        default:
            // 答え：yokete・articuno・kurae・take・pass、またはカードの id
            send({ type: 'respond', choice: /^\d+$/.test(name) ? Number(name) : name });
    }
}

// ---------- 描画 ----------

function render() {
    if (!view) return;
    const key = `${view.phase}:${view.turn?.number}:${view.turn?.seat}:${view.prompt?.kind}:${view.myAction}`;
    if (ui.key !== key) ui = { ...freshUi(), key, choose: ui.choose };
    // 選んでいたカードが手札からなくなったら、選び直す
    if (ui.card !== null && !view.hand?.some(c => c.id === ui.card)) ui.card = null;
    renderTop();
    renderRivals();
    renderTicker();
    renderMe();
    renderAction();
    renderHand();
    renderChoose();
}

function renderTop() {
    let text;
    if (view.phase === 'choose') text = '相棒を選ぶ';
    else if (view.phase === 'end') text = '決着';
    else text = view.turn.seat === view.you ? 'あなたの番' : `${nameOf(view.turn.seat)}の番`;
    $('turn-info').innerHTML = `<b>${text}</b>`;
    const w = view.lastWeather;
    $('deck-info').innerHTML = `${w ? `<span class="weather" title="さっきのおてんき：${WEATHERS[w.weather].name}">${icon(w.weather)}</span>` : ''}<span class="deck">${icon('deck')}${view.deckCount}</span>`;
}

function roleIcon(p) {
    if (p.role) return `<span class="role-badge r-${p.role}" title="${ROLES[p.role].name}">${icon(p.role)}</span>`;
    return `<span class="role-badge r-unknown" title="役割は分からない">${icon('unknown')}</span>`;
}

function hpClass(seat, slot) {
    const before = prevView?.players[seat]?.pokemon[slot];
    const now = view.players[seat].pokemon[slot];
    if (!before || !now || before.id !== now.id) return '';
    return now.hp < before.hp ? ' hit' : now.hp > before.hp ? ' healed' : '';
}

function statusChip(m) {
    return m?.status ? `<span class="status s-${m.status}">${STATUSES[m.status].name}</span>` : '';
}

function renderRivals() {
    const n = view.players.length;
    const order = Array.from({ length: n - 1 }, (_, i) => (view.you + 1 + i) % n);
    const targets = targetSeats();
    $('rivals').style.setProperty('--cols', order.length <= 3 ? order.length : 3);
    $('rivals').innerHTML = order.map(seat => {
        const p = view.players[seat];
        const m = monOf(seat);
        const cls = ['rival',
            view.turn?.seat === seat && view.phase === 'play' ? 'turn' : '',
            !p.alive ? 'out' : '',
            targets.includes(seat) ? 'targetable' : '',
            ui.picks.includes(seat) && cuiCardKey() === 'zapdos' ? 'picked' : '',
            view.waitingOn === seat && view.prompt ? 'asked' : ''
        ].filter(Boolean).join(' ');
        let body;
        if (view.phase === 'choose') body = `<span class="rv-wait">${p.ready ? '選んだ' : '選んでいる…'}</span>`;
        else if (!m) body = '';
        else {
            const bench = p.pokemon.length > 1 ? p.pokemon[1 - p.battle] : null;
            body = `<span class="rv-mon">${monArt(m.id, 'mon-art small')}<span class="rv-mon-name">${POKEMON[m.id].name}</span></span>
                <span class="rv-foot">${statusChip(m)}${m.item ? `<span class="item-chip" title="${CARDS[m.item].name}">${icon(m.item)}</span>` : ''}${bench ? `<span class="bench-chip${bench.fainted ? ' fainted' : ''}${hpClass(seat, 1 - p.battle)}">${monArt(bench.id, 'mon-art tiny')}${bench.fainted ? '×' : bench.hp}</span>` : ''}<span class="rv-hand">${icon('hand')}${p.handCount}</span></span>`;
        }
        const hp = m && view.phase !== 'choose' ? `<span class="rv-hp${hpClass(seat, p.battle)}">${m.hp}<small>/${m.maxHp}</small></span>` : '';
        return `<button type="button" class="${cls}" data-seat="${seat}">
            <span class="rv-head">${roleIcon(p)}<span class="rv-name">${escapeHtml(p.name)}</span>${hp}</span>
            ${body}
        </button>`;
    }).join('');
}

const cuiCardKey = () => (ui.card !== null ? cardInHand(ui.card)?.key : null);

function renderTicker() {
    const logs = view.logs.filter(l => l.kind !== 'turn').slice(-8);
    $('ticker').innerHTML = logs.map(l => `<p>${escapeHtml(l.text)}</p>`).join('');
}

function monLines(m) {
    const d = POKEMON[m.id];
    const move = `${d.move.name} ${d.move.damage}${d.move.hits > 1 ? `×${d.move.hits}` : ''}`;
    return { d, move };
}

function renderMe() {
    const me = view.players[view.you];
    const role = me.role;
    const roleHtml = `<span class="my-role r-${role}">${icon(role)}<b>${ROLES[role].name}</b></span>`;
    if (view.phase === 'choose' || me.pokemon.length === 0) {
        $('me').innerHTML = `<div class="me-card waiting">${roleHtml}</div>`;
        return;
    }
    const m = me.pokemon[me.battle];
    const { d, move } = monLines(m);
    const targets = targetSeats();
    const bench = me.pokemon.length > 1 ? me.pokemon[1 - me.battle] : null;
    const canSwitch = view.options?.canSwitch && ui.card === null && !ui.band;
    $('me').innerHTML = `<button type="button" class="me-card${targets.includes(view.you) ? ' targetable' : ''}${!me.alive ? ' out' : ''}${view.turn?.seat === view.you && view.phase === 'play' ? ' turn' : ''}" data-seat="${view.you}">
        <span class="me-top">${roleHtml}<span class="me-hand">${icon('hand')}${me.handCount}</span></span>
        <span class="me-mon${hpClass(view.you, me.battle)}">
            ${monArt(m.id)}
            <span class="me-info">
                <span class="me-name">${d.name}<small>Lv${d.level}・${TYPES[d.type]}</small></span>
                <span class="me-move">${move}${d.ability ? `<small>${ABILITIES[d.ability].name}</small>` : ''}</span>
                <span class="me-chips">${statusChip(m)}${m.item ? `<span class="item-chip wide">${icon(m.item)}${CARDS[m.item].name}</span>` : ''}</span>
            </span>
            <span class="me-hp"><b>${m.hp}</b><small>/${m.maxHp}</small></span>
        </span>
    </button>
    ${bench ? `<div class="me-bench"><span class="bench-label">ベンチ</span>${monArt(bench.id, 'mon-art small')}<span class="bench-name">${POKEMON[bench.id].name}</span><span class="bench-hp${hpClass(view.you, 1 - me.battle)}">${bench.fainted ? 'ひんし' : `${bench.hp}/${bench.maxHp}`}</span>${canSwitch ? `<button type="button" class="small-button" data-act="switch">${icon('swap')}交代</button>` : ''}</div>` : ''}`;
}

function buttons(list) {
    return list.map(([act, label, cls = 'primary', disabled = false]) => `<button type="button" class="${cls}" data-act="${act}"${disabled ? ' disabled' : ''}>${label}</button>`).join('');
}

function renderAction() {
    const el = $('action');
    const pr = view.prompt;
    let text = '';
    let list = [];
    if (view.phase === 'end') {
        text = view.winners.includes(view.you) ? 'あなたの勝ち' : '決着';
        list = [['result', '結果']];
    } else if (view.phase === 'choose') {
        text = view.offers ? '' : 'ほかの人を待っています';
    } else if (view.myAction && pr) {
        ({ text, list } = promptAction(pr));
    } else if (view.myAction && view.options) {
        ({ text, list } = turnAction());
    } else {
        text = view.waitingOn !== null ? `${nameOf(view.waitingOn)}が考えています` : 'ほかの人の答えを待っています';
    }
    el.innerHTML = `<div class="prompt">${text}</div><div class="buttons">${buttons(list)}</div>`;
}

// 答え待ちの案内で使う、イベントの短い呼び名
const EVENT_SHORT = { mewtwo: 'ミュウツー', zapdos: 'サンダー', moltres: 'ファイヤー', mrMime: 'バリヤード', farfetchd: 'カモネギ', jigglypuff: 'プリン', rival: 'ライバル' };

function promptAction(pr) {
    const from = pr.from !== undefined ? nameOf(pr.from) : '';
    switch (pr.kind) {
        case 'dodge': {
            const head = pr.event ? `${EVENT_SHORT[pr.card]}の攻撃` : `${from}の${POKEMON[monOf(pr.from).id].move.name}${pr.hits > 1 ? `（${pr.hit + 1}/${pr.hits}）` : ''}`;
            const list = [];
            if (handHas('yokete') && monOf(view.you)?.status !== 'sleep') list.push(['yokete', 'よけて！']);
            if (pr.event && handHas('articuno')) list.push(['articuno', 'フリーザー', 'secondary']);
            list.push(['take', '受ける', 'danger']);
            return { text: head, list };
        }
        case 'discardAttack': {
            const head = pr.card === 'rival' ? `${from}とライバル対決` : 'ファイヤーの試練';
            const list = [];
            if (handHas('kurae')) list.push(['kurae', 'くらえ！']);
            if (pr.canShield && handHas('articuno')) list.push(['articuno', 'フリーザー', 'secondary']);
            list.push(['take', '受ける', 'danger']);
            return { text: head, list };
        }
        case 'shield':
            return { text: `${from}の${EVENT_SHORT[pr.card]}`, list: [['articuno', 'フリーザー'], ['pass', '使わない', 'secondary']] };
        case 'rescue': {
            const victim = view.players[pr.victim];
            const m = victim.pokemon[pr.slot];
            const list = [];
            for (const key of ['potion', 'revive']) {
                const card = view.hand.find(c => c.key === key);
                if (card) list.push([String(card.id), CARDS[key].name]);
            }
            list.push(['pass', '見送る', 'secondary']);
            return { text: `${nameOf(pr.victim)}の${POKEMON[m.id].name}がひんしになる`, list };
        }
        case 'pick':
            return { text: 'きのみ大豊作：1 枚取る', list: [] };
        case 'trim':
            return { text: `手札を ${pr.count} 枚捨てる`, list: [['trim', '捨てる', 'primary', ui.picks.length !== pr.count]] };
        default:
            return { text: '', list: [] };
    }
}

function turnAction() {
    const opt = view.options;
    if (ui.band) {
        const text = ui.picks.length < 2 ? 'ちからのハチマキ：捨てる 2 枚を選ぶ' : '攻撃する相手を選ぶ';
        return { text, list: [['cancel', 'やめる', 'secondary']] };
    }
    if (ui.card !== null) {
        const card = cardInHand(ui.card);
        const def = CARDS[card.key];
        const o = opt.cards[card.id];
        if (card.key === 'zapdos') return { text: def.text, list: [['use', '使う', 'primary', ui.picks.length === 0], ['cancel', 'やめる', 'secondary']] };
        if (o.targets) return { text: o.targets.length ? `${def.name}：相手を選ぶ` : def.text, list: [['cancel', 'やめる', 'secondary']] };
        return { text: def.text, list: [['use', '使う', 'primary', !o.usable], ['cancel', 'やめる', 'secondary']] };
    }
    const list = [];
    if (opt.bandTargets.length > 0) list.push(['band', 'ハチマキ', 'secondary']);
    if (opt.evolveSlots.length > 0) list.push(['evolve', `${icon('up')}進化して終える`, 'secondary']);
    list.push(['end', '番を終える']);
    return { text: '', list };
}

function renderHand() {
    const hand = view.hand ?? [];
    const pr = view.prompt;
    const picking = view.myAction && pr?.kind === 'pick';
    if (picking) {
        $('hand').innerHTML = (view.cardRefs ?? []).map(c => cardButton(c, ['pickable'], `data-act="${c.id}"`)).join('');
        return;
    }
    const trimming = view.myAction && pr?.kind === 'trim';
    $('hand').innerHTML = hand.map(c => {
        const o = view.options?.cards[c.id];
        const usable = o && (o.usable || o.targets?.length > 0);
        const cls = [
            ui.card === c.id ? 'selected' : '',
            ui.picks.includes(c.id) && (trimming || ui.band) ? 'marked' : '',
            view.options && !ui.band && !usable ? 'idle' : '',
            !view.options && !trimming ? 'idle' : ''
        ];
        return cardButton(c, cls, `data-card="${c.id}"`);
    }).join('');
}

function cardButton(c, cls, attr) {
    const def = CARDS[c.key];
    return `<button type="button" class="card k-${def.kind} ${cls.filter(Boolean).join(' ')}" ${attr} aria-label="${def.name}">
        <span class="card-weather">${icon(c.weather)}</span>${cardArt(c.key)}<span class="card-name">${def.name}</span>
    </button>`;
}

function renderChoose() {
    const el = $('choose');
    if (view.phase !== 'choose' || !view.offers) {
        el.hidden = true;
        return;
    }
    el.hidden = false;
    const me = view.players[view.you];
    el.innerHTML = `<div class="choose-box">
        <p class="choose-role"><span class="r-${me.role}">${icon(me.role)}</span>あなたは<b class="r-${me.role}">${ROLES[me.role].name}</b></p>
        <p class="choose-lead">${view.pick === 1 ? '相棒を 1 匹選ぶ' : '相棒を 2 匹選ぶ（先に選んだ方がバトル）'}</p>
        <div class="offers">${view.offers.map(id => {
            const d = POKEMON[id];
            const order = ui.choose.indexOf(id);
            const hp = view.mode === 'basic' ? d.hp : d.hpX;
            return `<button type="button" class="offer${order >= 0 ? ' selected' : ''}" data-offer="${id}">
                ${order >= 0 && view.pick > 1 ? `<span class="offer-order">${order === 0 ? 'バトル' : 'ベンチ'}</span>` : ''}
                ${monArt(id)}<span class="offer-name">${d.name}</span>
                <span class="offer-hp">HP ${hp}</span>
                <span class="offer-move">${d.move.name} ${d.move.damage}${d.move.hits > 1 ? `×${d.move.hits}` : ''}</span>
                <span class="offer-ability">${d.ability ? ABILITIES[d.ability].name : TYPES[d.type]}</span>
            </button>`;
        }).join('')}</div>
        <div class="buttons">${buttons([['choose', '決定', 'primary', ui.choose.length !== view.pick]])}</div>
    </div>`;
}

function toggleOffer(id) {
    if (ui.choose.includes(id)) ui.choose = ui.choose.filter(x => x !== id);
    else if (view.pick === 1) ui.choose = [id];
    else if (ui.choose.length < view.pick) ui.choose = [...ui.choose, id];
    render();
}

// ---------- ダイアログ ----------

function openDialog(id) {
    const dialog = $(id);
    if (dialog.open) return;
    controller?.pause();
    dialog.showModal();
}

function openDetail(seat) {
    const p = view.players[seat];
    $('detail-title').textContent = seat === view.you ? 'あなた' : p.name;
    const role = p.role ? `<p class="detail-role r-${p.role}">${icon(p.role)}${ROLES[p.role].name}${p.alive ? '' : '（退場）'}</p>` : '<p class="muted">役割は分からない</p>';
    const mons = p.pokemon.map((m, i) => {
        const { d, move } = monLines(m);
        const lines = [
            `<b>${d.name}</b>　Lv${d.level}・${TYPES[d.type]}　HP ${m.fainted ? 'ひんし' : `${m.hp}/${m.maxHp}`}${p.pokemon.length > 1 ? `（${i === p.battle ? 'バトル' : 'ベンチ'}）` : ''}`,
            `わざ：${move}${d.move.effect ? `（${effectText(d.move.effect)}）` : ''}`,
            d.ability ? `特性 ${ABILITIES[d.ability].name}：${ABILITIES[d.ability].text}` : '',
            m.item ? `${CARDS[m.item].name}：${CARDS[m.item].text}` : '',
            m.status ? `${STATUSES[m.status].name}：${STATUSES[m.status].text}` : ''
        ].filter(Boolean);
        return `<div class="detail-mon">${monArt(m.id)}<div>${lines.map(l => `<p>${l}</p>`).join('')}</div></div>`;
    }).join('');
    $('detail-body').innerHTML = `${role}<p class="muted">手札 ${p.handCount} 枚</p>${mons}`;
    openDialog('detail-dialog');
}

function effectText(effect) {
    const [cond, status] = effect.includes(':') ? effect.split(':') : [null, effect];
    return `${cond ? `おてんきチェックが「${WEATHERS[cond].name}」なら` : ''}${STATUSES[status].name}にする`;
}

function openLog() {
    $('log-list').innerHTML = view.logs.map(l => `<li class="${l.kind ? `l-${l.kind}` : ''}">${escapeHtml(l.text)}</li>`).join('');
    openDialog('log-dialog');
    $('log-list').scrollTop = $('log-list').scrollHeight;
}

function showResult() {
    if (!view || view.phase !== 'end' || $('screen-game').hidden) return;
    const label = { gym: 'ジムリーダーとジムトレーナー', challenger: '挑戦者', rocket: 'ロケット団員' }[view.winnerSide];
    $('result-title').textContent = view.winners.includes(view.you) ? 'あなたの勝ち' : `${label}の勝ち`;
    $('result-list').innerHTML = view.players.map(p => `<li class="${view.winners.includes(p.id) ? 'win' : ''}">
        <span class="role-badge r-${p.role}">${icon(p.role)}</span><span class="res-name">${p.id === view.you ? 'あなた' : escapeHtml(p.name)}</span>
        <span class="res-role">${ROLES[p.role].name}</span><span class="res-state">${view.winners.includes(p.id) ? '勝ち' : ''}</span>
    </li>`).join('');
    openDialog('result-dialog');
}

// ---------- 準備 ----------

function setup() {
    $('sprites').innerHTML = spritesMarkup();
    $('title-art').innerHTML = titleArt();
    $('home').innerHTML = icon('home');
    $('open-help').innerHTML = icon('help');
    $('open-log').innerHTML = icon('log');
    document.querySelectorAll('.close').forEach(b => { b.innerHTML = icon('close'); });
    $('help-content').innerHTML = helpMarkup();
    document.querySelectorAll('dialog').forEach(dialog => {
        dialog.addEventListener('click', e => {
            if ((e.target === dialog && dialog.id !== 'result-dialog') || e.target.closest('[data-close]')) dialog.close();
        });
        dialog.addEventListener('close', () => {
            if (![...document.querySelectorAll('dialog')].some(d => d.open)) controller?.resume();
        });
    });
    const segment = (id, apply) => $(id).addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        apply(b.dataset);
        store.save(SETTINGS_KEY, settings);
        renderTitle();
    });
    segment('player-count', d => { settings.count = Number(d.count); });
    segment('rule-mode', d => { settings.mode = d.mode; });
    segment('cpu-level', d => { settings.level = d.level; });
    $('start').addEventListener('click', () => startGame(newSetup()));
    $('resume').addEventListener('click', () => startGame(loadSavedGame() ?? newSetup()));
    $('open-help-title').addEventListener('click', () => openDialog('help-dialog'));
    $('open-help').addEventListener('click', () => openDialog('help-dialog'));
    $('open-log').addEventListener('click', openLog);
    $('home').addEventListener('click', goHome);
    $('screen-game').addEventListener('click', e => {
        if (!view) return;
        const actEl = e.target.closest('[data-act]');
        if (actEl) {
            if (actEl.dataset.act === 'result') showResult();
            else act(actEl.dataset.act);
            return;
        }
        const offer = e.target.closest('[data-offer]');
        if (offer) return toggleOffer(offer.dataset.offer);
        const card = e.target.closest('[data-card]');
        if (card) return selectCard(Number(card.dataset.card));
        const seat = e.target.closest('[data-seat]');
        if (seat) selectSeat(Number(seat.dataset.seat));
    });
    $('again').addEventListener('click', () => {
        $('result-dialog').close();
        startGame(newSetup());
    });
    $('result-home').addEventListener('click', () => {
        $('result-dialog').close();
        goHome();
    });

    // ページの拡大と長押しのメニューを止める
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => {
        if (!e.target.closest('input, textarea')) e.preventDefault();
    });

    showScene('title');
    registerServiceWorker();
    // 確かめるときに使う
    window.__app = { get controller() { return controller; }, get view() { return view; }, get ui() { return ui; }, startGame, newSetup, showResult, openDetail };
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then(registration => {
        const urls = [location.href, ...performance.getEntriesByType('resource').map(r => r.name)];
        const post = worker => worker?.postMessage({ type: 'cache-urls', urls });
        if (registration.active) post(registration.active);
        else navigator.serviceWorker.ready.then(r => post(r.active));
    }).catch(() => {});
}

setup();
