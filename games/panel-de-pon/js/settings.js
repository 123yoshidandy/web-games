// 設定（難易度・サウンド）
// サウンドは BGM と効果音をまとめて ON/OFF する。保存は今までどおり sound（効果音）と bgm の2つに同じ値を入れる
export const SETTING_OPTIONS = [
    {
        key: 'difficulty',
        label: '難易度',
        // raiseTime: せり上がりの速さ（1段にかかるフレーム数）、colorCount: ブロックの色数、cpu: CPU 対戦の CPU の強さ（cpu.js）
        choices: [
            { value: 'practice', label: '練習', raiseTime: 900, colorCount: 5, cpu: 'practice' },
            { value: 'normal', label: 'ノーマル', raiseTime: 600, colorCount: 5, cpu: 'normal' },
            { value: 'hard', label: 'ハード', raiseTime: 360, colorCount: 6, cpu: 'hard' }
        ]
    },
    {
        key: 'sound',
        label: 'サウンド',
        choices: [
            { value: 'on', label: 'ON' },
            { value: 'off', label: 'OFF' }
        ]
    }
];

export const DEFAULT_SETTINGS = { difficulty: 'normal', sound: 'on', bgm: 'on' };

const STORAGE_KEY = 'panel-de-pon-settings';

// 選択中の項目の定義を返す
export function getChoice(settings, key) {
    const option = SETTING_OPTIONS.find(o => o.key === key);
    return option.choices.find(c => c.value === settings[key]);
}

// 保存された設定を読み込む（不正な値は既定値にする）
export function loadSettings() {
    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
        // 読めなければ既定値を使う
    }
    // 旧設定（せり上がり速度・お邪魔ゲージの速さ・お邪魔ブロックの有無）からの移行
    if (!saved.difficulty && (saved.raiseSpeed || saved.gaugeSpeed || saved.garbage)) {
        const byRaiseSpeed = { slow: 'normal', normal: 'normal', fast: 'hard' };
        saved.difficulty = saved.gaugeSpeed === 'off' || saved.garbage === 'off'
            ? 'practice'
            : byRaiseSpeed[saved.raiseSpeed] ?? 'normal';
    }

    const settings = { ...DEFAULT_SETTINGS };
    for (const option of SETTING_OPTIONS) {
        if (option.choices.some(c => c.value === saved[option.key])) {
            settings[option.key] = saved[option.key];
        }
    }
    // 前の版は効果音と BGM を別々に選べた。どちらかが ON なら、両方 ON にそろえる
    const bgm = ['on', 'off'].includes(saved.bgm) ? saved.bgm : DEFAULT_SETTINGS.bgm;
    settings.sound = settings.bgm = settings.sound === 'on' || bgm === 'on' ? 'on' : 'off';
    return settings;
}

export function saveSettings(settings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // 保存できなくてもゲームは続ける
    }
}
