import { mkdir, writeFile } from 'node:fs/promises';
import { BALANCE } from '../shared/config.js';
import { RELEASE } from '../shared/version.js';
import { ITEMS } from '../shared/equipment.js';
import { TROLL_CARDS } from '../shared/cards.js';
import { CONSTRUCTION_SPECIALIZATIONS } from '../shared/structure-specializations.js';
import { FISHING_GEAR, ROD_UPGRADES, FISH_SPECIES } from '../shared/fishing.js';

const directory = new URL('../unity/Thornhold/Assets/StreamingAssets/', import.meta.url);
await mkdir(directory, {recursive:true});
const contract = {release:RELEASE, balance:BALANCE, items:ITEMS, cards:TROLL_CARDS,
  specializations:CONSTRUCTION_SPECIALIZATIONS, fishingGear:FISHING_GEAR, fishingUpgradeCosts:ROD_UPGRADES, fishSpecies:FISH_SPECIES};
await writeFile(new URL('thornhold-contract.json', directory), JSON.stringify(contract, null, 2)+'\n');
console.log(`Unity contract exported: ${RELEASE.game} / protocol ${RELEASE.protocol}. No gameplay rules were ported.`);
