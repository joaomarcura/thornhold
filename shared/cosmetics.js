// Cosmetic data deliberately has no gameplay attributes or prices.
const skin=(id,name,description,body,tunic,accent)=>Object.freeze({id,name,description,body,tunic,accent});
export const SKINS=Object.freeze({
  troll:Object.freeze([
    skin('moss','Guardião do Musgo','Verde ancestral e couro da floresta.',0x78938b,0x3a5458,0x8d7760),
    skin('ember','Titã das Brasas','Pele de cinza e ombreiras de cobre.',0x987468,0x553838,0xca864d),
    skin('frost','Predador Glacial','Pele azul e ombreiras de gelo.',0x7399ac,0x294958,0x9ed9df)
  ]),
  elf:Object.freeze([
    skin('grove','Sentinela do Bosque','Vestes verdes e detalhes de musgo.',0xa8dbbd,0x235653,0x386757),
    skin('dawn','Guardião da Aurora','Vestes marfim com detalhes dourados.',0xe3c7a2,0x776748,0xd9b768),
    skin('dusk','Batedor do Crepúsculo','Vestes violeta e detalhes prateados.',0xa7b8d0,0x454363,0x9b9aba)
  ])
});
export function cosmetic(role,id){const options=SKINS[role]||SKINS.elf;return options.find(s=>s.id===id)||options[0];}
export function normalizeCosmetics(input){return {troll:cosmetic('troll',input?.troll).id,elf:cosmetic('elf',input?.elf).id};}
