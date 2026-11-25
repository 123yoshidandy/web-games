/**
 * 農場（15マス）を描く。自分の農場（操作できる）と、ほかの人の農場（ダイアログ）で同じ描き方を使う
 * 柵は、マスの4辺の太い線で描く。これから建てる柵（preview）は点線
 */

import { CELLS, cellKind, cellFences, fieldAt, pastureIndex, arrangeAnimals } from './farm.js';
import { sym } from './art.js';

const SIDES = ['top', 'right', 'bottom', 'left'];

// player：ビューのプレイヤー。opts：{ farm（試しの形）, animals, color, can: Set, sel: Set, crops: { cell: crop }, plowed }
export function farmHtml(player, opts = {}) {
    const base = player.farm;
    const farm = opts.farm ?? base;
    const arrange = arrangeAnimals(farm, opts.animals ?? player.animals);
    const animalAt = new Map();
    farm.pastures.forEach((cells, i) => {
        const a = arrange.pastures[i];
        if (a?.type) animalAt.set(Math.min(...cells), { type: a.type, n: a.n });
    });
    const free = farm.stables.filter(c => pastureIndex(farm, c) < 0);
    free.forEach((c, i) => {
        const t = arrange.stables[i];
        if (t) animalAt.set(c, { type: t, n: 1 });
    });
    const rooms = [...farm.rooms].sort((a, b) => a - b);
    if (arrange.pet) animalAt.set(rooms[0], { type: arrange.pet, n: 1, pet: true });
    // 家にいる家族（置いていない人）を部屋に1人ずつ
    const home = player.available ?? 0;
    const people = new Map();
    rooms.forEach((c, i) => {
        const n = i === rooms.length - 1 ? Math.max(0, home - i) : (i < home ? 1 : 0);
        if (n) people.set(c, n);
    });
    let html = '';
    for (let c = 0; c < CELLS; c++) {
        const kind = cellKind(farm, c);
        const newRoom = !base.rooms.includes(c) && farm.rooms.includes(c);
        const now = cellFences(farm, c);
        const before = cellFences(base, c);
        const fenceCls = SIDES.map(s => (now[s] ? (before[s] ? ` f-${s}` : ` n-${s}`) : '')).join('');
        const cls = [`cell k-${kind}`, kind === 'room' ? `h-${farm.house}` : '', newRoom ? 'new' : '', fenceCls,
            opts.can?.has(c) ? 'can' : '', opts.sel?.has(c) ? 'sel' : ''].filter(Boolean).join(' ');
        let inner = '';
        if (kind === 'room') {
            const n = people.get(c);
            if (n) inner += `<span class="who" style="color:${opts.color ?? '#fff'}">${sym('person')}${n > 1 ? `<b>${n}</b>` : ''}</span>`;
        }
        if (kind === 'field') {
            const f = fieldAt(farm, c);
            const crop = opts.crops?.[c] ?? f.crop;
            const n = opts.crops?.[c] ? (crop === 'grain' ? 3 : 2) : f.n;
            if (crop) inner += `<span class="crop ${opts.crops?.[c] ? 'planned' : ''}">${sym(crop)}<b>${n}</b></span>`;
        } else if (opts.crops?.[c]) {
            inner += `<span class="crop planned">${sym(opts.crops[c])}<b>${opts.crops[c] === 'grain' ? 3 : 2}</b></span>`;
        }
        if (opts.plowed === c) inner += '<span class="plowed"></span>';
        if (farm.stables.includes(c)) inner += `<span class="stable ${base.stables.includes(c) ? '' : 'planned'}">${sym('stable')}</span>`;
        const animal = animalAt.get(c);
        if (animal) inner += `<span class="animal ${animal.pet ? 'pet' : ''}">${sym(animal.type)}${animal.n > 1 ? `<b>${animal.n}</b>` : ''}</span>`;
        html += `<button type="button" class="${cls}" data-cell="${c}" aria-label="マス${c + 1}">${inner}</button>`;
    }
    return html;
}
