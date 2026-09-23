// Original, single-stroke symbols shared by the command bar and inventory.
const paths={
  core:'M12 2 21 9v12H3V9Zm0 0v19M3 9h18M7 21v-6h10v6',
  wall:'M3 21V5h4v16M10 21V3h4v18M17 21V5h4v16M3 10h18M3 17h18',
  tower:'M5 3v5h14V3h-4v3H9V3ZM7 8l-2 13h14L17 8M10 21v-5h4v5',
  mine:'m12 2 9 10-9 10-9-10Zm-9 10h18M8 7l4 15 4-15',
  workshop:'m4 3 4 1 1 5-3 3-4-2V6l3 3 3-3M9 11l11 9M15 4l5 5M17 6 6 20',
  wisp:'M12 3c-7 5-9 9-6 14 3 5 12 3 13-3 1-4-2-6-3-8 0 4-3 5-4 6-2-2-2-5 0-9Z',
  sword:'m5 20 3-6M3 13l8 5M8 14 18 3h3v3L11 17',
  heavy:'m3 7 5-4 10 9-5 5ZM12 13 5 21M16 5l3-3M19 9l3-1',
  dash:'m3 6 8 6-8 6M11 6l8 6-8 6M3 12h18',
  roar:'M8 8h5l7-5v18l-7-5H8ZM4 8v8M1 10v4',
  armor:'M12 2 21 6l-2 10-7 6-7-6L3 6ZM12 2v20',
  leaf:'M20 3C7 2 1 8 5 15s17 3 15-12ZM4 21 16 8M8 16l-1-5M12 12h5',
  relic:'m12 2 4 7 6 3-6 3-4 7-4-7-6-3 6-3ZM12 7v10M7 12h10',
  gold:'M12 2 21 7v10l-9 5-9-5V7ZM3 7l9 5 9-5M12 12v10',
  wood:'m5 5 12-3 5 12-12 7-8-8Zm5 16 3-13 9 6M5 5l8 3',
  target:'M12 2v4M12 18v4M2 12h4M18 12h4M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  upgrade:'m5 14 7-8 7 8M12 6v15M5 3h14',
  close:'m6 6 12 12M6 18 18 6',
};
export function icon(name,extra=''){return `<svg class="game-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.relic}"/></svg>`;}
