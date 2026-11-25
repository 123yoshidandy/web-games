/**
 * 動き：材料が袋から飛び出して鍋に入る・鍋が爆発する
 * 動きを減らす設定のときは動かさない
 */

const FLY_MS = 420;

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const rectOf = (el) => {
    const rect = el?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
};

// html を from から to へ放物線で飛ばす。着いたら onLand を呼ぶ
export function fly(html, from, to, { size = 40, onLand = null } = {}) {
    if (!from || !to || reducedMotion()) {
        onLand?.();
        return;
    }
    const el = document.createElement('div');
    el.className = 'flyer';
    el.innerHTML = html;
    Object.assign(el.style, {
        left: `${from.left + from.width / 2 - size / 2}px`, top: `${from.top + from.height / 2 - size / 2}px`,
        width: `${size}px`, height: `${size}px`
    });
    document.body.appendChild(el);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(0.4, Math.min(1.4, to.width / size));
    // 袋から上へ放り上げて、鍋に落とす
    const lift = -Math.min(140, 50 + Math.abs(dy) * 0.35);
    const animation = el.animate([
        { transform: 'translate(0, 0) scale(.6) rotate(0deg)', offset: 0 },
        { transform: `translate(${dx * 0.45}px, ${Math.min(0, dy) * 0.45 + lift}px) scale(${(1.3 + scale) / 2}) rotate(200deg)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(360deg)`, offset: 1 }
    ], { duration: FLY_MS, easing: 'cubic-bezier(.35,.1,.45,1)' });
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        el.remove();
        onLand?.();
    };
    animation.finished.then(finish, finish);
    // 裏のタブなどで終わりが来なくても、必ず消す
    setTimeout(finish, FLY_MS + 300);
}

// 着いた札を弾ませる
export function land(el) {
    if (!el || reducedMotion()) return;
    el.animate([
        { transform: 'scale(1.35)' }, { transform: 'scale(.88)', offset: 0.45 }, { transform: 'scale(1.06)', offset: 0.75 }, { transform: 'scale(1)' }
    ], { duration: 320, easing: 'ease-out' });
}

// 鍋の爆発：揺らして、閃光と煙を出す
export function explode(container, { big = true } = {}) {
    if (!container) return;
    if (reducedMotion()) return;
    container.animate([
        { transform: 'translate(0,0) rotate(0)' }, { transform: 'translate(-7px,3px) rotate(-1.5deg)' }, { transform: 'translate(6px,-4px) rotate(1.5deg)' },
        { transform: 'translate(-5px,-2px) rotate(-1deg)' }, { transform: 'translate(4px,3px) rotate(.8deg)' }, { transform: 'translate(0,0) rotate(0)' }
    ], { duration: big ? 520 : 380, easing: 'ease-out' });
    const rect = rectOf(container);
    if (!rect) return;
    const flash = document.createElement('div');
    flash.className = `boom ${big ? 'big' : 'small'}`;
    const size = Math.min(rect.width, rect.height);
    Object.assign(flash.style, {
        left: `${rect.left + rect.width / 2 - size / 2}px`, top: `${rect.top + rect.height / 2 - size / 2}px`, width: `${size}px`, height: `${size}px`
    });
    const puffs = Array.from({ length: big ? 9 : 5 }, (_, i) => {
        const angle = (i / (big ? 9 : 5)) * Math.PI * 2 + Math.random() * 0.5;
        return `<i style="--dx:${(Math.cos(angle) * 46).toFixed(0)}%;--dy:${(Math.sin(angle) * 46 - 10).toFixed(0)}%;--d:${(i * 25)}ms"></i>`;
    }).join('');
    flash.innerHTML = `<b></b>${puffs}${big ? '<span class="boom-text">ドカン！</span>' : ''}`;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), big ? 1400 : 900);
}

// 小さく弾ませる（点やルビーが増えた欄など）
export function bump(el, delay = 0) {
    if (!el || reducedMotion()) return;
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 300, delay });
}
