/**
 * 画面（タイトル・ゲーム・取引のダイアログ・人の畑・終わり・遊び方）
 * 画面はビューだけを見て描く。操作は controller.send() に送る
 */

import { BEANS, coinsFor, legalFieldsFor, canHarvestField, FIELD_PRICE } from './cards.js';
import LocalGameController, { loadSavedGame, clearSavedGame } from './game-controller.js';
import { CPU_LEVELS, pickHand, suggest } from './cpu-player.js';
import { symbolsSvg, sym, amountHtml, beanCard, fieldHtml } from './art.js';
import { helpHtml, titleArtHtml } from './help.js';
import { music } from './music.js';

const SETTINGS_KEY = 'bohnanza.settings';
const CPU_NAMES = ['ハルカ', 'ソウタ', 'ミオ', 'レン'];
export const COLORS = ['#d9473b', '#3d7dd8', '#9a5ad1', '#e2a52a', '#2fa39a'];
const RESULT_DELAY_MS = 900;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const names = (cards) => cards.map(t => BEANS[t].name).join('・');

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
        return { count: [3, 4, 5].includes(saved.count) ? saved.count : 4, level: CPU_LEVELS.includes(saved.level) ? saved.level : 'easy' };
    } catch {
        return { count: 4, level: 'easy' };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* 保存できない環境でも遊べるようにする */ }
}

export default class UI {
    constructor() {
        this.settings = loadSettings();
        this.controller = null;
        this.view = null;
        this.pick = 0;              // 植えるカード（もらった豆の何枚目か）
        this.form = null;           // 取引のダイアログの中身
        this.answeredKey = null;    // 答えた提案（返事が来るまで同じ提案を出し直さない）
        this.resultTimer = null;
        $('#symbols').innerHTML = symbolsSvg();
        $('#title-art').innerHTML = titleArtHtml();
        $('#help-body').innerHTML = helpHtml();
        this.bindStatic();
    }

    // ---- 画面の切り替え ----

    showTitle() {
        this.stopGame();
        $('#screen-game').hidden = true;
        $('#screen-title').hidden = false;
        $('#resume').hidden = !loadSavedGame();
        this.renderSetup();
    }

    startGame(setup) {
        this.stopGame();
        try {
            this.controller = new LocalGameController(setup, {
                onUpdate: () => this.render(),
                onError: (message) => {
                    music.play('error');
                    this.toast(message);
                }
            });
        } catch (error) {
            console.error(error);
            clearSavedGame();
            this.showTitle();
            return;
        }
        this.view = null;
        this.form = null;
        this.answeredKey = null;
        this.soundSeq = this.controller.getView().events.at(-1)?.seq ?? 0;
        $('#screen-title').hidden = true;
        $('#screen-game').hidden = false;
        this.render();
        this.controller.scheduleCpu();
    }

    newGame() {
        const { count, level } = this.settings;
        const players = [{ name: 'あなた', isCPU: false },
            ...CPU_NAMES.slice(0, count - 1).map(name => ({ name, isCPU: true, cpuLevel: level }))];
        this.startGame({ players, options: {} });
    }

    stopGame() {
        this.controller?.stop();
        this.controller = null;
        clearTimeout(this.resultTimer);
        this.resultTimer = null;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
    }

    send(command) {
        if (!this.controller) return false;
        return this.controller.send(command);
    }

    bindStatic() {
        $('#player-count').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-count]');
            if (!button) return;
            this.settings.count = Number(button.dataset.count);
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#cpu-level').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-level]');
            if (!button) return;
            this.settings.level = button.dataset.level;
            saveSettings(this.settings);
            this.renderSetup();
        });
        $('#start').addEventListener('click', () => this.newGame());
        $('#resume').addEventListener('click', () => {
            const saved = loadSavedGame();
            if (saved) this.startGame(saved);
        });
        $('#again').addEventListener('click', () => this.newGame());
        $('#result-home').addEventListener('click', () => this.showTitle());
        $('#home').addEventListener('click', () => this.showTitle());
        $('#open-help-title').addEventListener('click', () => $('#help').showModal());
        $('#open-help-game').addEventListener('click', () => $('#help').showModal());
        $('#open-log').addEventListener('click', () => this.showLog());

        document.querySelectorAll('dialog').forEach(dialog => {
            dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
            if (dialog.id === 'result') {
                dialog.addEventListener('cancel', event => event.preventDefault());
                return;
            }
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        });
        // 提案のダイアログを閉じたら、提案はやめる。答えのダイアログを閉じたら、下の「答える」で開き直す
        $('#decide').addEventListener('close', () => {
            this.form = null;
            this.render();
        });

        $('#fields').addEventListener('click', (event) => {
            const sell = event.target.closest('[data-sell]');
            if (sell) {
                this.send({ type: 'harvest', field: Number(sell.dataset.sell) });
                return;
            }
            if (event.target.closest('[data-buy]')) {
                this.send({ type: 'buyField' });
                return;
            }
            const field = event.target.closest('[data-field]');
            if (field) this.tapField(Number(field.dataset.field));
        });
        $('#hint').addEventListener('click', () => this.showHint());
        $('#toplant').addEventListener('click', (event) => {
            const card = event.target.closest('[data-pick]');
            if (!card) return;
            this.pick = Number(card.dataset.pick);
            this.render();
        });
        $('#players').addEventListener('click', (event) => {
            const row = event.target.closest('[data-seat]');
            if (row) this.showPlayer(Number(row.dataset.seat));
        });
        $('#actions').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-act]');
            if (!button || button.disabled) return;
            const act = button.dataset.act;
            if (act === 'next') this.send({ type: 'next' });
            if (act === 'end-trade') this.send({ type: 'endTrade' });
            if (act === 'pass') this.send({ type: 'pass' });
            if (act === 'propose') this.openPropose();
            if (act === 'answer') this.openAnswer();
        });
        $('#decide').addEventListener('click', (event) => {
            const button = event.target.closest('[data-act]');
            if (!button || button.disabled) return;
            this.decideButton(button.dataset);
        });
    }

    me() {
        return this.view.players[this.view.you];
    }

    // ヒント：CPU（ふつう）が選ぶ操作。押す畑やボタンに印を付ける
    showHint() {
        const v = this.view;
        const command = v && suggest(v);
        if (!command) return this.toast('自分が操作する番になったら、おすすめを出せます');
        const mark = (selector) => document.querySelectorAll(selector).forEach(el => el.classList.add('recommended'));
        const me = this.me();
        let text;
        switch (command.type) {
            case 'plant':
                mark(`#fields [data-field="${command.field}"]`);
                text = `${BEANS[me.hand[0]].name}を${command.field + 1}番目の畑に植える`;
                break;
            case 'plantPending':
                this.pick = command.index;
                this.render();
                mark(`#fields [data-field="${command.field}"]`);
                text = `${BEANS[me.toPlant[command.index]].name}を${command.field + 1}番目の畑に植える`;
                break;
            case 'harvest':
                mark(`#fields [data-sell="${command.field}"]`);
                text = `${command.field + 1}番目の畑を売る`;
                break;
            case 'buyField':
                mark('#fields [data-buy]');
                text = '3つ目の畑を買う';
                break;
            case 'next':
                mark('#actions [data-act="next"]');
                text = '表をめくる';
                break;
            case 'endTrade':
                mark('#actions [data-act="end-trade"]');
                text = '取引をおえる';
                break;
            case 'pass':
                mark('#actions [data-act="pass"]');
                text = '取引しない';
                break;
            case 'offer':
                mark('#actions [data-act="propose"]');
                text = '取引を提案する';
                break;
            case 'respond':
                mark('#actions [data-act="answer"]');
                mark(`#decide [data-act="${command.accept ? 'accept' : 'decline'}"]`);
                text = !command.accept ? '提案を断る' : command.hand.length ? `提案を受ける（${names(command.hand.map(i => me.hand[i]))}を渡す）` : '提案を受ける';
                break;
            default:
                text = '光るところを押す';
        }
        this.toast(`おすすめ：${text}`);
    }

    // 植える：手番の初めは手札の一番前、もらった豆は選んだもの
    tapField(i) {
        const v = this.view;
        const me = this.me();
        if (v.phase === 'plant' && v.active === v.you && me.hand.length) {
            if (legalFieldsFor(me.fields, me.hand[0]).includes(i)) this.send({ type: 'plant', field: i });
            return;
        }
        if (v.phase === 'plantTraded' && me.toPlant.length) {
            const k = Math.min(this.pick, me.toPlant.length - 1);
            if (legalFieldsFor(me.fields, me.toPlant[k]).includes(i)) this.send({ type: 'plantPending', index: k, field: i });
        }
    }

    // 今植えようとしているカード
    plantingCard() {
        const v = this.view;
        const me = this.me();
        if (v.phase === 'plant' && v.active === v.you && me.hand.length) return me.hand[0];
        if (v.phase === 'plantTraded' && me.toPlant.length) return me.toPlant[Math.min(this.pick, me.toPlant.length - 1)];
        return null;
    }

    // ---- タイトル ----

    renderSetup() {
        document.querySelectorAll('#player-count button').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.count) === this.settings.count)));
        document.querySelectorAll('#cpu-level button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.level === this.settings.level)));
    }

    // ---- ゲーム画面 ----

    render() {
        if (!this.controller) return;
        const v = this.controller.getView();
        this.view = v;
        const me = v.players[v.you];
        if (this.pick >= me.toPlant.length) this.pick = 0;
        this.renderStatus(v);
        this.renderPlayers(v);
        this.renderTable(v);
        this.renderFields(v);
        this.renderToPlant(v);
        this.renderHand(v);
        this.syncAnswer(v);
        this.renderActions(v);
        this.playSounds(v);
        if ($('#log').open) this.renderLog();
        if (v.phase === 'end' && !$('#result').open && !this.resultTimer) {
            this.resultTimer = setTimeout(() => {
                this.resultTimer = null;
                this.showResult();
            }, RESULT_DELAY_MS);
        }
    }

    // 効果音：前の描画からのできごとを見て、1回の更新に1つだけ、大事な順に選んで鳴らす
    // ほかの人が植える・売るのは鳴らさない（自分に関わる取引と申し出だけ知らせる）
    playSounds(v) {
        const fresh = v.events.filter(e => e.seq > this.soundSeq);
        if (!fresh.length) return;
        this.soundSeq = fresh.at(-1).seq;
        const me = v.you;
        const mine = (type) => fresh.some(e => e.type === type && e.seat === me);
        const end = fresh.find(e => e.type === 'end');
        if (end) {
            if (!end.winners.includes(me)) return music.play('lose');
            return music.play(end.winners.length > 1 ? 'notify' : 'win');
        }
        if (fresh.some(e => e.type === 'trade' && (e.to === me || e.from === me))) return music.play('gain');
        if (mine('sell')) return music.play('gain');
        if (mine('buyField')) return music.play('pay');
        if (mine('plant')) return music.play('place');
        if (fresh.some(e => e.type === 'reshuffle')) return music.play('shuffle');
        if (fresh.some(e => e.type === 'turn' && e.seat === me)) return music.play('turn');
        if (fresh.some(e => e.type === 'faceUp') && v.active === me) return music.play('draw');
        if (fresh.some(e => e.type === 'offer' && e.from !== me)) music.play('notify');
    }

    renderStatus(v) {
        const phase = { plant: '植える', trade: '取引', plantTraded: 'もらった豆を植える', end: '終わり' }[v.phase];
        const who = v.phase === 'end' ? '' : v.active === v.you ? 'あなたの番' : `${escapeHtml(v.players[v.active].name)}の番`;
        $('#status').innerHTML = `<span class="who ${v.active === v.you ? 'me' : ''}">${who}</span><span class="phase">${phase}</span>`;
    }

    renderPlayers(v) {
        const others = v.players.filter(p => p.id !== v.you);
        $('#players').innerHTML = others.map(p => {
            const active = v.actors.includes(p.id) && v.phase !== 'end';
            const fields = p.fields.map(f => (f ? `<span class="fchip">${sym(f.type)}<b>${f.n}</b></span>` : '<span class="fchip empty"></span>')).join('');
            const pending = p.toPlant.length ? `<span class="pend">${p.toPlant.map(t => sym(t)).join('')}</span>` : '';
            return `<button type="button" class="pl ${active ? 'active' : ''} ${p.id === v.active ? 'turn' : ''}" data-seat="${p.id}" style="--c:${COLORS[p.id]}">
                <span class="pl-name">${escapeHtml(p.name)}</span>
                ${amountHtml('coin', p.coins)}${amountHtml('card', p.handCount)}
                <span class="pl-fields">${fields}</span>${pending}
            </button>`;
        }).join('');
    }

    offerText(v, o) {
        const from = v.players[o.from].name;
        const to = v.players[o.to].name;
        const give = o.give.length ? names(o.give) : '';
        const want = o.want.length ? names(o.want) : '';
        const body = give && want ? `${give} ⇄ ${want}` : give ? `${give}をあげる` : `${want}をください`;
        return `${escapeHtml(from)}→${escapeHtml(to)}：${body}`;
    }

    renderTable(v) {
        const deck = `<div class="deck">${sym('card')}<b>${v.deckCount}</b><small>${v.exhausted}/${v.exhaustLimit}</small></div>`;
        const face = v.faceUp.map((t, i) => beanCard(t, { cls: 'face', attrs: `data-face="${i}"` })).join('');
        let banner = '';
        if (v.offer) {
            banner = `<div class="banner">${this.offerText(v, v.offer)}</div>`;
        } else if (v.phase === 'trade') {
            const last = v.turnOffers.at(-1);
            if (last) banner = `<div class="banner done">${this.offerText(v, last)}　${last.accepted ? '成立' : '不成立'}</div>`;
        }
        $('#table').innerHTML = `${deck}<div class="faceup">${face || (v.phase === 'trade' ? '<span class="none">表のカードなし</span>' : '')}</div>${banner}`;
    }

    renderFields(v) {
        const me = v.players[v.you];
        const card = this.plantingCard();
        const legal = card ? legalFieldsFor(me.fields, card) : [];
        const boxes = me.fields.map((f, i) => {
            const sell = f && canHarvestField(me.fields, i) && v.phase !== 'end'
                ? `<button type="button" class="sell" data-sell="${i}">売る ${coinsFor(f.type, f.n)}金</button>` : '';
            return `<div class="field ${legal.includes(i) ? 'can' : ''}" data-field="${i}" role="button" aria-label="畑${i + 1}">${fieldHtml(f) || '<span class="empty-field">空き</span>'}${sell}</div>`;
        }).join('');
        const buy = v.canBuyField && me.fields.length < 3
            ? `<button type="button" class="field buy" data-buy ${me.coins >= FIELD_PRICE ? '' : 'disabled'}>${sym('field')}<span>畑を買う<br>${FIELD_PRICE}金</span></button>` : '';
        $('#fields').innerHTML = `${boxes}${buy}<div class="mycoins">${amountHtml('coin', me.coins)}</div>`;
        $('#fields').style.setProperty('--n', String(me.fields.length + (buy ? 1 : 0)));
    }

    renderToPlant(v) {
        const me = v.players[v.you];
        const el = $('#toplant');
        el.hidden = !me.toPlant.length;
        el.innerHTML = me.toPlant.length
            ? `<span class="label">植える</span>${me.toPlant.map((t, k) => beanCard(t, { cls: `small ${k === this.pick ? 'sel' : ''}`, attrs: `data-pick="${k}"`, table: false })).join('')}` : '';
    }

    renderHand(v) {
        const me = v.players[v.you];
        const el = $('#hand');
        el.style.setProperty('--count', String(Math.max(me.hand.length, 1)));
        // 枚数が多いときは、名前を消して豆の絵だけにする
        el.classList.toggle('tight', me.hand.length >= 8);
        el.innerHTML = me.hand.length
            ? me.hand.map((t, i) => beanCard(t, { cls: `hcard ${i === 0 ? 'front' : ''}`, table: false })).join('')
            : '<span class="none">手札なし</span>';
    }

    renderActions(v) {
        const el = $('#actions');
        const me = v.players[v.you];
        const news = `<span class="desc news">${escapeHtml(v.logs.at(-1) ?? '')}</span>`;
        if (v.phase === 'end') {
            el.innerHTML = news;
            return;
        }
        if (v.offer && v.offer.to === v.you) {
            el.innerHTML = `<span class="desc">${this.offerText(v, v.offer)}</span><button class="btn primary" data-act="answer">答える</button>`;
            return;
        }
        if (v.offer && v.offer.from === v.you) {
            el.innerHTML = `<span class="desc">${escapeHtml(v.players[v.offer.to].name)}の答えを待っています</span>`;
            return;
        }
        if (v.phase === 'plant' && v.active === v.you) {
            const card = me.hand[0];
            const stuck = card && !legalFieldsFor(me.fields, card).length;
            const desc = card ? `${BEANS[card].name}を植える${stuck ? '（畑を売って空ける）' : ''}` : '';
            el.innerHTML = `<span class="desc">${desc}</span><button class="btn primary" data-act="next" ${v.planted >= 1 || !me.hand.length ? '' : 'disabled'}>表をめくる</button>`;
            return;
        }
        if (v.phase === 'trade' && v.actors.includes(v.you)) {
            if (v.active === v.you) {
                el.innerHTML = `<span class="desc">取引する？</span><button class="btn secondary" data-act="propose" ${v.offersLeft[v.you] > 0 ? '' : 'disabled'}>提案</button><button class="btn primary" data-act="end-trade">取引おわり</button>`;
            } else {
                el.innerHTML = `<span class="desc">${escapeHtml(v.players[v.active].name)}と取引する？</span><button class="btn secondary" data-act="propose">提案</button><button class="btn primary" data-act="pass">取引しない</button>`;
            }
            return;
        }
        if (v.phase === 'plantTraded' && me.toPlant.length) {
            const card = me.toPlant[Math.min(this.pick, me.toPlant.length - 1)];
            const stuck = !legalFieldsFor(me.fields, card).length;
            el.innerHTML = `<span class="desc">${BEANS[card].name}を植える${stuck ? '（畑を売るか買って空ける）' : ''}</span>`;
            return;
        }
        el.innerHTML = news;
    }

    // ---- 取引のダイアログ ----

    // 自分への提案があれば、答えのダイアログを開く（一度閉じたら開き直さない）
    syncAnswer(v) {
        const key = v.offer && v.offer.to === v.you ? `${v.commandCount}` : null;
        if (!key) {
            if (this.form?.kind === 'answer') {
                this.form = null;
                if ($('#decide').open) $('#decide').close();
            }
            return;
        }
        if (this.answeredKey === key || this.form) return;
        this.answeredKey = key;
        this.openAnswer();
    }

    openAnswer() {
        const v = this.view;
        if (!v.offer || v.offer.to !== v.you) return;
        this.form = { kind: 'answer' };
        this.renderDecide();
        if (!$('#decide').open) $('#decide').showModal();
    }

    openPropose() {
        const v = this.view;
        const others = v.players.filter(p => p.id !== v.you);
        this.form = {
            kind: 'propose',
            to: v.active === v.you ? others[0].id : v.active,
            giveFace: new Set(), giveHand: new Set(), wantFace: new Set(), wantTypes: {}
        };
        this.renderDecide();
        $('#decide').showModal();
    }

    renderDecide() {
        const v = this.view;
        const me = this.me();
        const f = this.form;
        if (f.kind === 'answer') {
            const o = v.offer;
            const picks = pickHand(me, o.wantTypes);
            const giveFace = o.wantFaceUp.map(i => v.faceUp[i]);
            const giveHand = picks ? picks.map(i => me.hand[i]) : [];
            const missing = !picks;
            $('#decide-title').textContent = `${v.players[o.from].name}からの提案`;
            $('#decide-body').innerHTML = `
                <p class="tlabel">もらう</p><div class="cards">${o.give.map(t => beanCard(t, { cls: 'small', table: false })).join('') || '<span class="none">なし</span>'}</div>
                <p class="tlabel">渡す</p><div class="cards">${[...giveFace, ...giveHand].map(t => beanCard(t, { cls: 'small', table: false })).join('') || '<span class="none">なし</span>'}</div>
                ${missing ? `<p class="note">求められた豆（${names(Object.entries(o.wantTypes).flatMap(([t, n]) => Array(n).fill(t)))}）を持っていません</p>` : ''}`;
            $('#decide-buttons').innerHTML = `<button class="btn primary" data-act="accept" ${missing ? 'disabled' : ''}>受ける</button><button class="btn secondary" data-act="decline">断る</button>`;
            f.picks = picks;
            return;
        }
        const active = v.active === v.you;
        const partner = v.players[f.to];
        const toggle = (set, i, t, kind) => beanCard(t, { cls: `small tg ${set.has(i) ? 'on' : ''}`, attrs: `data-act="${kind}" data-i="${i}"`, table: false });
        const partners = active ? `<div class="segmented small">${v.players.filter(p => p.id !== v.you).map(p => `<button type="button" role="radio" aria-checked="${p.id === f.to}" data-act="to" data-i="${p.id}">${escapeHtml(p.name)}</button>`).join('')}</div>` : `<p class="note">${escapeHtml(partner.name)}（手番の人）と</p>`;
        const giveFace = active ? v.faceUp.map((t, i) => toggle(f.giveFace, i, t, 'gface')).join('') : '';
        const giveHand = me.hand.map((t, i) => toggle(f.giveHand, i, t, 'ghand')).join('');
        const wantFace = !active ? v.faceUp.map((t, i) => toggle(f.wantFace, i, t, 'wface')).join('') : '';
        const types = v.types.map(t => `<button type="button" class="tchip ${f.wantTypes[t] ? 'on' : ''}" data-act="wtype" data-t="${t}">${sym(t)}${BEANS[t].name}${f.wantTypes[t] ? `<b>×${f.wantTypes[t]}</b>` : ''}</button>`).join('');
        const count = f.giveFace.size + f.giveHand.size + f.wantFace.size + Object.values(f.wantTypes).reduce((s, n) => s + n, 0);
        $('#decide-title').textContent = '提案';
        $('#decide-body').innerHTML = `${partners}
            <p class="tlabel">出す</p>
            ${giveFace ? `<div class="cards"><small>表</small>${giveFace}</div>` : ''}
            <div class="cards"><small>手札</small>${giveHand || '<span class="none">なし</span>'}</div>
            <p class="tlabel">もらう</p>
            ${wantFace ? `<div class="cards"><small>表</small>${wantFace}</div>` : ''}
            <div class="tchips">${types}</div>
            <p class="note">${escapeHtml(partner.name)}の手札から欲しい豆を押す（押すたびに1枚ずつ、3枚で0に戻る）</p>`;
        $('#decide-buttons').innerHTML = `<button class="btn primary" data-act="send" ${count ? '' : 'disabled'}>提案する</button><button class="btn secondary" data-act="cancel">やめる</button>`;
    }

    decideButton(data) {
        const f = this.form;
        if (!f) return;
        const act = data.act;
        if (f.kind === 'answer') {
            const command = act === 'accept' ? { type: 'respond', accept: true, hand: f.picks } : { type: 'respond', accept: false };
            this.form = null;
            $('#decide').close();
            this.send(command);
            return;
        }
        const i = Number(data.i);
        if (act === 'to') f.to = i;
        if (act === 'gface') f.giveFace.has(i) ? f.giveFace.delete(i) : f.giveFace.add(i);
        if (act === 'ghand') f.giveHand.has(i) ? f.giveHand.delete(i) : f.giveHand.add(i);
        if (act === 'wface') f.wantFace.has(i) ? f.wantFace.delete(i) : f.wantFace.add(i);
        if (act === 'wtype') {
            const n = ((f.wantTypes[data.t] ?? 0) + 1) % 3;
            if (n) f.wantTypes[data.t] = n;
            else delete f.wantTypes[data.t];
        }
        if (act === 'cancel') {
            $('#decide').close();
            return;
        }
        if (act === 'send') {
            const command = { type: 'offer', to: f.to, give: { faceUp: [...f.giveFace], hand: [...f.giveHand] }, want: { faceUp: [...f.wantFace], types: { ...f.wantTypes } } };
            this.form = null;
            $('#decide').close();
            this.send(command);
            return;
        }
        this.renderDecide();
    }

    // ---- 人の畑・記録・終わり ----

    showPlayer(seat) {
        const v = this.view;
        if (!v) return;
        const p = v.players[seat];
        $('#player-title').textContent = seat === v.you ? 'あなた' : p.name;
        $('#player-body').innerHTML = `
            <p class="pstats">${amountHtml('coin', p.coins)}${amountHtml('card', p.handCount)}</p>
            <div class="fields small">${p.fields.map(f => `<div class="field">${fieldHtml(f) || '<span class="none">空き</span>'}</div>`).join('')}</div>
            ${p.toPlant.length ? `<p class="tlabel">植える前</p><div class="cards">${p.toPlant.map(t => beanCard(t, { cls: 'small', table: false })).join('')}</div>` : ''}`;
        $('#player').showModal();
    }

    showResult() {
        const v = this.view;
        if (!v || v.phase !== 'end') return;
        const winners = v.winners.map(id => v.players[id].name);
        $('#result-title').textContent = v.winners.includes(v.you) ? (v.winners.length > 1 ? '同点で勝ち' : 'あなたの勝ち') : `${winners.join('と')}の勝ち`;
        const ranked = [...v.players].sort((a, b) => b.coins - a.coins || b.handCount - a.handCount);
        $('#result-table').innerHTML = `<table><thead><tr><th></th><th>金</th><th>手札</th></tr></thead><tbody>
            ${ranked.map(p => `<tr class="${v.winners.includes(p.id) ? 'win' : ''} ${p.id === v.you ? 'you' : ''}"><th><i class="dot" style="--c:${COLORS[p.id]}"></i>${escapeHtml(p.name)}</th><td class="total">${p.coins}</td><td>${p.handCount}</td></tr>`).join('')}
        </tbody></table>`;
        document.querySelectorAll('dialog[open]').forEach(d => d.close());
        $('#result').showModal();
    }

    showLog() {
        if (!this.view) return;
        this.renderLog();
        $('#log').showModal();
        const list = $('#log-list');
        list.scrollTop = list.scrollHeight;
    }

    renderLog() {
        $('#log-list').innerHTML = this.view.logs.slice(-200).map(text => `<li>${escapeHtml(text)}</li>`).join('');
    }

    toast(message) {
        const el = $('#toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }
}
