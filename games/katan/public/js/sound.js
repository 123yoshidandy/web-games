/**
 * 効果音（音声ファイルを使わず、Web Audio API で合成する）
 * ブラウザの制限で、最初に画面を触るまでは鳴らない（unlockSound を操作の中で呼ぶ）
 * ON/OFF は BGM と同じ共通のプレイヤー（music.js）の設定に従う。.sound-toggle のボタン1つで、BGM と一緒に切り替える
 */

import { music } from './music.js';

const LEGACY_KEY = 'katan.sound'; // 前の版の、効果音だけの ON/OFF

let context = null;

// 前の版で効果音を消していたら、共通の設定の効果音も消して始める（移すのは1回だけ）
try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === 'off' && music.getSettings().effects) music.toggle('effects');
    if (legacy !== null) localStorage.removeItem(LEGACY_KEY);
} catch {
    // 保存を読めなくても遊べる
}

export const isSoundOn = () => music.getSettings().effects;

// BGM と効果音をまとめて切り替える（サウンドのボタンと同じ）
export const toggleSound = () => music.toggleAll();

export const onSoundChange = (listener) => music.onChange(settings => {
    if (settings.effects) unlockSound();
    listener(settings.effects);
});

// ユーザー操作の中で呼ぶ（AudioContext を作る・再開する）
export function unlockSound() {
    if (!isSoundOn()) return;
    try {
        context ??= new (window.AudioContext || window.webkitAudioContext)();
        if (context.state === 'suspended') context.resume();
    } catch {
        context = null;
    }
}

function tone({ frequency, type = 'sine', start = 0, duration = 0.15, volume = 0.2, slide = null }) {
    const t = context.currentTime + start;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(context.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
}

function noise({ start = 0, duration = 0.05, volume = 0.25, frequency = 1800 }) {
    const t = context.currentTime + start;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(t);
}

const EFFECTS = {
    // サイコロが転がる（木の机に当たる音を数回）
    dice: () => [0, 0.07, 0.15, 0.24, 0.31].forEach((start, i) => noise({ start, duration: 0.04, volume: 0.35 - i * 0.05, frequency: 1400 + i * 180 })),
    // 建てる（木を置く音）
    build: () => {
        tone({ frequency: 180, type: 'triangle', duration: 0.12, volume: 0.3, slide: 90 });
        noise({ duration: 0.03, volume: 0.2, frequency: 900 });
    },
    // 資源をもらう
    gain: () => [880, 1320].forEach((frequency, i) => tone({ frequency, start: i * 0.07, duration: 0.18, volume: 0.1 })),
    // 盗賊・7
    robber: () => tone({ frequency: 220, type: 'sawtooth', duration: 0.4, volume: 0.08, slide: 110 }),
    // 自分の番
    turn: () => [523, 784].forEach((frequency, i) => tone({ frequency, start: i * 0.12, duration: 0.22, volume: 0.12 })),
    // 交換・カード
    card: () => noise({ duration: 0.08, volume: 0.2, frequency: 3000 }),
    // 勝利
    win: () => [523, 659, 784, 1047].forEach((frequency, i) => tone({ frequency, type: 'triangle', start: i * 0.13, duration: 0.35, volume: 0.15 }))
};

export function playEffect(name, { delay = 0 } = {}) {
    if (!isSoundOn() || !context || context.state !== 'running') return;
    const effect = EFFECTS[name];
    if (!effect) return;
    if (delay > 0) setTimeout(() => effect(), delay * 1000);
    else effect();
}
