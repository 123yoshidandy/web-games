/**
 * 兵器と盤面の値（原作の ARM_TYPES と同じ値）
 * 盤面は幅 200 × 高さ 100。A（席0）の陣地は x=0、B（席1）の陣地は x=200
 */

export const WIDTH = 200;
export const HEIGHT = 100;
export const FIRE_RANGE = 10;      // 撃てる縦の幅（|dy| がこれ以下）
export const OVERLAP = 5;          // 味方と重なるとみなす距離
export const MAX_TICKS = 5000;     // 打ち切りの tick
export const TICKS_PER_SECOND = 60;
export const START_LIFE = 1000;
export const START_MONEY = 1000;
export const INCOME = 50;          // 奇数 tick ごとに両軍が得るお金

export const ARM_TYPES = ['infantry', 'tank', 'rocket', 'missile', 'cannon', 'attacker', 'fighter', 'bomber'];

export const ARMS = {
    infantry: { name: '歩兵', short: '歩', onAir: false, vsEarth: true, vsAir: false, life: 100, attack: 100, range: 10, cooltime: 10, bullets: 4, speed: 0.8, cost: 500, note: '弱いが、敵陣に着くと陣地を攻撃できる' },
    tank: { name: '戦車', short: '戦', onAir: false, vsEarth: true, vsAir: false, life: 400, attack: 200, range: 20, cooltime: 15, bullets: 4, speed: 1.0, cost: 1000, note: '硬くて強い、地上戦の要' },
    rocket: { name: 'ロケット砲', short: 'ロ', onAir: false, vsEarth: true, vsAir: false, life: 200, attack: 100, range: 40, cooltime: 10, bullets: 8, speed: 1.0, cost: 1000, note: '地上を遠くから撃つ' },
    missile: { name: '対空ミサイル', short: 'ミ', onAir: false, vsEarth: false, vsAir: true, life: 200, attack: 200, range: 40, cooltime: 25, bullets: 4, speed: 1.0, cost: 1000, note: '空を遠くから撃つ' },
    cannon: { name: '機関砲', short: '機', onAir: false, vsEarth: true, vsAir: true, life: 300, attack: 100, range: 20, cooltime: 10, bullets: 8, speed: 1.0, cost: 1000, note: '地上も空も撃てる' },
    attacker: { name: '攻撃機', short: '攻', onAir: true, vsEarth: true, vsAir: false, life: 200, attack: 400, range: 20, cooltime: 10, bullets: 4, speed: 1.5, cost: 2000, note: '空から地上を強く撃つ' },
    fighter: { name: '戦闘機', short: '闘', onAir: true, vsEarth: false, vsAir: true, life: 400, attack: 400, range: 40, cooltime: 10, bullets: 4, speed: 2.0, cost: 2000, note: '空の敵を強く撃つ' },
    bomber: { name: '爆撃機', short: '爆', onAir: true, vsEarth: false, vsAir: false, life: 200, attack: 100, range: 0, cooltime: 10, bullets: 4, speed: 2.0, cost: 2000, note: '撃てないが、速く飛んで陣地を攻撃する' }
};

// 敵陣に着くと陣地を攻撃する兵器
export const RAIDERS = ['infantry', 'bomber'];

// 撃てる相手か
export const canHit = (shooter, target) => (shooter.vsAir && target.onAir) || (shooter.vsEarth && !target.onAir);

// 近くの兵器だけを見るための帯（座標を幅 BAND で区切る）。帯の中は元の順なので、見る順も決まる（対戦の決定性は変わらない）
export const BAND = 10;
export function bandsOf(arms, key) {
    const bands = [];
    for (const arm of arms) (bands[Math.floor(arm[key] / BAND)] ??= []).push(arm);
    return bands;
}
