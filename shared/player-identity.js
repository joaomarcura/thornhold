// Stable team identity shared by the simulation, renderer and tactical map.
// Slot ids are deterministic, so the same player keeps the same color for the match.
export const PLAYER_COLORS = Object.freeze([
  { id: 'blue', label: 'Azul', hex: 0x56a8ff, css: '#56a8ff' },
  { id: 'red', label: 'Vermelho', hex: 0xff7068, css: '#ff7068' },
  { id: 'green', label: 'Verde', hex: 0x62d391, css: '#62d391' },
  { id: 'yellow', label: 'Amarelo', hex: 0xf2cf61, css: '#f2cf61' },
  { id: 'purple', label: 'Roxo', hex: 0xb995ff, css: '#b995ff' },
  { id: 'orange', label: 'Laranja', hex: 0xffa45b, css: '#ffa45b' },
  { id: 'cyan', label: 'Ciano', hex: 0x55d8d1, css: '#55d8d1' },
  { id: 'pink', label: 'Rosa', hex: 0xff8cc8, css: '#ff8cc8' }
]);

export function playerColor(id) {
  const match = String(id || '').match(/(\d+)$/);
  const index = match ? Number(match[1]) + (String(id).startsWith('t') ? 0 : 1) : 0;
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}
