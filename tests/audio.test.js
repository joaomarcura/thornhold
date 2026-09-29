import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CATEGORIES, HEROIC_PROGRESSION, normalizeVolume } from '../client/audio.js';

test('Volume do mixer é normalizado e mantém um padrão audível',()=>{
  assert.equal(normalizeVolume(-1),0);
  assert.equal(normalizeVolume(.42),.42);
  assert.equal(normalizeVolume(9),1);
  assert.equal(normalizeVolume('inválido'),.55);
});

test('Trilha heroica possui uma progressão completa e frequências válidas',()=>{
  assert.equal(HEROIC_PROGRESSION.length,4);
  assert.ok(HEROIC_PROGRESSION.every(chord=>chord.length===4&&chord.every(frequency=>frequency>100&&frequency<500)));
});
test('Mixer expõe todas as categorias persistentes',()=>assert.deepEqual(AUDIO_CATEGORIES,['master','music','sfx','ambient','ui']));
