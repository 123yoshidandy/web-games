/**
 * 絵：恐竜 6 種とダイスの面の図柄（自作の SVG）
 * ページに symbol として一度だけ入れ、<use href="#dino-trex"> のように使い回す
 */

import { SPECIES } from './dinos.js';

// 恐竜の形（viewBox 0 0 48 36、右向き）。胴体・模様（濃い色）・目の位置
const SHAPES = {
    trex: {
        body: 'M2 23C8 20 13 17 19 16C23 15 26 12 28 9C29 6 32 5 36 5L43 6C45.5 6.3 46.3 8.2 45 10L44 12H38V14H42L41 16L35 17C33 19 32 21 30 23L29 28L32.5 32.5H26L25 26C23 27 21 27 19 26L20 32.5H14.5L15 25C10 25 6 24.5 2 23Z',
        mark: 'M32 19.5L36.5 21.5L35.5 23Z',
        eye: [38.5, 8.6]
    },
    tri: {
        body: 'M2 22C6 18 11 15 18 14C24 13 29 14 32 16L33 10C34 6.5 38 6 39.5 9L40.5 12.5L46.5 13L43 16.5L45 19.5L39 21C37 23 35 24 33.5 24.5L33.5 32.5H28V26.5H16.5V32.5H11V25.5C7 25 4 24 2 22Z',
        mark: 'M33 10C33.5 6 38 5.5 39.5 9L40.5 12.5L37 13.5L34.5 16Z M40 11.5L46 7.5L42 12.5Z',
        eye: [37.6, 15.4]
    },
    stego: {
        body: 'M2 20C6 18 10 14 18 12.5C26 11.5 32 13 36 17L42.5 19.8C44.6 20.8 44.3 23.2 42 23.2H36.5L35.5 32.5H30V26.5H18.5L17.5 32.5H12V25.2C8 24.5 5 22.5 2 20Z',
        mark: 'M11 15L13.5 7.5L17 13Z M16.5 12.8L20 4L23.5 12Z M23 12L26.5 5L29.5 12.8Z M29 13L32 8L33.5 15Z M4 19.2L1.5 14.5L6 18Z M6.5 17.6L5.5 12.8L9 16.5Z',
        eye: [39.6, 19.4]
    },
    brachio: {
        body: 'M2 26C6 24 10 21 16 20C22 19 28 19 31 20L33 10C34 5 37 2 41 2L45 3C46.5 3.8 46.4 6 44.5 6.2L40 7L38.5 20C38.5 23 37 25 35.5 26L35.5 33H30V28.5H18.5V33H13V27.5C9 28 5 27.5 2 26Z',
        mark: 'M20 23C24 21.5 28 21.5 31 22.5L30.5 25C27 24 24 24 20.5 25.2Z',
        eye: [41.6, 4.1]
    },
    para: {
        body: 'M2 22C8 20 13 18 18 17C23 16 27 14 29 11C30 8 33 7 36 8L43 10C45.2 10.8 45.2 13 43 13.2L38 14C36 17 34 20 31 22L30 27L33.5 32.5H27L26 26C23 27 21 27 19 26L20 32.5H14.5L15 25C10 25 6 24 2 22Z',
        mark: 'M33.5 8.3C30 4 25.5 2 21 2.2C25.5 4.2 28.5 6.5 30.8 9.6Z',
        eye: [37.8, 10.4]
    },
    spino: {
        body: 'M2 23C8 20.5 13 18 19 17C23.5 16.3 27 14 29 11.5C30.5 9 33 8.2 36 8.6L46 10.2C47.2 10.6 47 12.4 45.6 12.4L38 12.8C36 17 33.5 20.5 30.5 23L29.5 28L33 32.5H26.5L25.5 26.5C23 27.3 21 27.3 19 26.5L20 32.5H14.5L15 25.2C10 25.2 6 24.5 2 23Z',
        mark: 'M12.5 18.6C13 9.5 18 4 23.5 5.2C27.5 6 29.5 9.5 28.4 12.6C25 15.5 19 17.2 12.5 18.6Z',
        eye: [36.4, 10.4]
    }
};

// ダイスの面の図柄（viewBox 0 0 24 24 の線画）
const FACES = {
    woods: '<path d="M12 3 6.5 11h3L5.5 17h13l-4-6h3Z"/><path d="M12 17v4"/>',
    grass: '<path d="M4 20c1-4 2.5-6 4-7M8 20c0-5 1.5-9 4-11M12 20c.5-4 2.5-7 5-8M16 20c1-3 2.5-4.5 4-5"/><path d="M3 20h18"/>',
    toilet: '<rect x="4" y="3" width="6" height="8.5" rx="1.5"/><path d="M4 11.5h16a6 6 0 0 1-6 6h-4.5A5.5 5.5 0 0 1 4 12Z"/><path d="M9.5 17.5 8.5 21h7l-1-3.5"/>',
    cafe: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8.5 3.5c-.8 1 .8 2 0 3M12 3.5c-.8 1 .8 2 0 3"/>',
    empty: '<rect x="4.5" y="4.5" width="15" height="15" rx="3" stroke-dasharray="3 2.6"/>',
    notrex: '<path d="M5.5 15.5c2-1.2 3.5-2 5-2.3 1.3-.3 2-1.4 2.4-2.7.3-1.2 1.3-1.8 2.6-1.6l3 .4c.8.1 1 1 .4 1.4l-1.6.4-.2 1.3-2.4.6c-.7 1.5-1.4 2.6-2.4 3.4l-.3 2.6M10.4 17l.2 2.6"/><path d="M4 4l16 16"/>'
};

export function spritesMarkup() {
    const dinos = Object.entries(SHAPES).map(([key, s]) => {
        const { color, dark } = SPECIES[key];
        return `<symbol id="dino-${key}" viewBox="0 0 48 36">
            <path d="${s.body}" fill="${color}" stroke="${dark}" stroke-width="1.6" stroke-linejoin="round"/>
            <path d="${s.mark}" fill="${dark}" stroke="${dark}" stroke-width="1" stroke-linejoin="round"/>
            <circle cx="${s.eye[0]}" cy="${s.eye[1]}" r="1.9" fill="#fff"/><circle cx="${s.eye[0] + 0.4}" cy="${s.eye[1]}" r="1" fill="#1b1b1b"/>
        </symbol>`;
    }).join('');
    const faces = Object.entries(FACES).map(([key, d]) => `<symbol id="face-${key}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</g></symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${dinos}${faces}</svg>`;
}

export const dinoSvg = (key, cls = 'dino') => `<svg class="${cls}" viewBox="0 0 48 36" aria-hidden="true"><use href="#dino-${key}"/></svg>`;
export const faceSvg = (key, cls = 'face-icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#face-${key}"/></svg>`;

export { SHAPES };
