#!/usr/bin/env node
/**
 * 曲の書き間違いを、音を聞かずに探す
 *
 *   node tools/lint-songs.mjs [--games abalone,azul] [<曲のファイル> ...]
 *     ゲームを指定しないと、曲を持つすべてのゲーム（games/<ゲーム>/…/sound/bgm.js）を調べる。ファイルのパスは、実行した場所から見たもの
 *   node tools/lint-songs.mjs --list
 *     ゲームごとの曲の一覧（フォルダ・曲の ID・曲名・ジャンル）を出す
 *   node tools/lint-songs.mjs --common
 *     共通の効果音（src/effects.js）だけを調べる（ゲームもファイルも指定しないときは、最後に一緒に調べる）
 *
 * - 避けたい音：メロディの長めの音（8分音符以上）が、和音の構成音の半音上にあって、構成音でない（例：C の上で伸ばす F）
 * - 同時に鳴る音のぶつかり：メロディと、ほかのパートの伸ばしている音が、半音（短9度を含む）で重なる
 * - パートごとの音域と、1秒あたりの音の数（うるささの目安）
 * - 共通の効果音：楽器・記法・長さ・音量の目安があるか（決まりは tools/effects.mjs）
 * 曲は、見つかっても終了コードは 0（意図した経過音もあるので、目で確かめる）。共通の効果音が決まりに合わなければ 1
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { findSongFiles, registeredName } from './songs.mjs';
import { COMMON_LIBRARY, EFFECTS_FILE, definitionProblems } from './effects.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// 本体と曲のファイルを読み、Sound を返す
// sandbox：本体から見えるグローバル（テストで、偽の OfflineAudioContext を置くときに使う）
export function loadEngine(files, sandbox = {}) {
    const context = vm.createContext(Object.assign(sandbox, { console }));
    context.globalThis = context;
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/engine.js'), 'utf8'), context);
    files.forEach(file => vm.runInContext(fs.readFileSync(path.resolve(file), 'utf8'), context));
    return context.Sound;
}

function noteName(midi) {
    const rounded = Math.round(midi);
    return `${NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

// 和音の構成音（ピッチクラス）を、区間の和音の並びから探す
function chordTracks(Sound, song) {
    const tracks = [];
    let start = 0;
    const stepsPerBar = song.stepsPerBar ?? 16;
    for (const name of [...(song.intro ?? []), ...song.loop]) {
        const section = song.sections[name];
        if (section.chords) {
            section.chords.split('|').forEach((bar, barIndex) => {
                const tokens = bar.trim().split(/\s+/);
                const fixed = tokens.reduce((sum, t) => sum + Number(t.split(':')[1] ?? 0), 0);
                const free = tokens.filter(t => !t.includes(':')).length;
                let position = start + barIndex * stepsPerBar;
                tokens.forEach(token => {
                    const [symbol, length] = token.split(':');
                    const chord = Sound.parseChord(symbol);
                    const steps = length ? Number(length) : (stepsPerBar - fixed) / free;
                    tracks.push({ start: position, end: position + steps, chord, section: name, bar: barIndex + 1 });
                    position += steps;
                });
            });
            start += section.chords.split('|').length * stepsPerBar;
        } else {
            start += (section.bars ?? 0) * stepsPerBar;
        }
    }
    return tracks;
}

export function lintSong(Sound, song) {
    const compiled = Sound.compileSong(song);
    const tracks = chordTracks(Sound, song);
    const warnings = [];
    const melodic = Object.entries(song.parts).filter(([, part]) => (part.mode ?? 'notes') === 'notes').map(([name]) => name);

    for (const event of compiled.events) {
        if (!melodic.includes(event.part) || event.midi === undefined) continue;
        const track = tracks.find(t => event.start >= t.start && event.start < t.end);
        if (!track) continue;
        const { chord } = track;
        const tones = chord.intervals.map(i => (chord.root + i) % 12);
        const pc = ((Math.round(event.midi) % 12) + 12) % 12;
        const strong = event.start % 4 === 0;
        const long = event.length >= 4 || (strong && event.length >= 2);
        if (long && !tones.includes(pc) && tones.some(t => (t + 1) % 12 === pc)) {
            const where = `${track.section} ${track.bar}小節 ${(event.start - Math.floor(event.start / 16) * 16) / 4 + 1}拍`;
            warnings.push(`避けたい音: ${event.part} ${noteName(event.midi)}（${event.length}）が ${chord.symbol} の上 [${where}]`);
        }
    }

    // メロディと、ほかのパートで同時に鳴っている音の半音のぶつかり（両方が4分音符以上）
    const sustained = compiled.events.filter(e => e.midi !== undefined && e.length >= 4);
    for (const a of sustained.filter(e => melodic.includes(e.part))) {
        for (const b of sustained) {
            if (b.part === a.part || b.start >= a.start + a.length || a.start >= b.start + b.length) continue;
            const interval = Math.abs(Math.round(a.midi) - Math.round(b.midi));
            if (interval === 1 || interval === 13) {
                const track = tracks.find(t => a.start >= t.start && a.start < t.end);
                warnings.push(`ぶつかり: ${a.part} ${noteName(a.midi)} と ${b.part} ${noteName(b.midi)}（${track?.chord.symbol ?? ''}）[${track?.section ?? ''} ${track?.bar ?? ''}小節]`);
            }
        }
    }

    const seconds = compiled.length * compiled.stepSeconds;
    const parts = Object.keys(song.parts).map(name => {
        const events = compiled.events.filter(e => e.part === name);
        const midis = events.filter(e => e.midi !== undefined).map(e => e.midi);
        const range = midis.length ? `${noteName(Math.min(...midis))}〜${noteName(Math.max(...midis))}` : '-';
        return { name, range, perSecond: (events.length / seconds).toFixed(1) };
    });
    return { warnings: [...new Set(warnings)], parts, seconds };
}

function parseArgs(argv) {
    const args = { games: null, files: [], list: false, common: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--games') args.games = argv[++i].split(',');
        else if (argv[i] === '--list') args.list = true;
        else if (argv[i] === '--common') args.common = true;
        else args.files.push(argv[i]);
    }
    return args;
}

function main(argv) {
    const args = parseArgs(argv);
    if (args.common) return lintCommonEffects(loadEngine([EFFECTS_FILE]));
    const files = args.files.length && !args.games ? args.files : [...findSongFiles({ games: args.games }).map(s => s.file), ...args.files];
    const Sound = loadEngine([EFFECTS_FILE, ...files]);
    const seen = new Set();
    for (const file of files) {
        const name = registeredName(file);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        for (const [id, song] of Object.entries(Sound.library(name).songs)) {
            if (args.list) {
                console.log(`${name.padEnd(24)} ${id.padEnd(14)} ${song.title}（${song.genre ?? '-'}）`);
                continue;
            }
            if (song.file) continue;
            const { warnings, parts, seconds } = lintSong(Sound, song);
            console.log(`\n# ${name}/${id}（${song.title}、${seconds.toFixed(1)} 秒）`);
            parts.forEach(p => console.log(`  ${p.name.padEnd(8)} ${p.range.padEnd(10)} ${p.perSecond} 音/秒`));
            warnings.forEach(w => console.log(`  ! ${w}`));
            if (warnings.length === 0) console.log('  （気になる音はありません）');
        }
    }
    if (seen.size === 0) console.log('曲のファイルが見つかりません');
    return args.list || args.games || args.files.length ? 0 : lintCommonEffects(Sound);
}

function lintCommonEffects(Sound) {
    let failed = false;
    console.log('\n# 共通の効果音（src/effects.js）');
    for (const id of Object.keys(Sound.library(COMMON_LIBRARY).effects)) {
        let problems, length = '-';
        try {
            problems = definitionProblems(Sound, id);
            length = Sound.effectLength(Sound.library(COMMON_LIBRARY).effects[id]).toFixed(2);
        } catch (error) {
            problems = [error.message];
        }
        console.log(`  ${id.padEnd(8)} ${length} 秒`);
        problems.forEach(problem => console.log(`  ! ${problem}`));
        if (problems.length) failed = true;
    }
    return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
