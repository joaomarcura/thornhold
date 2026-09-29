import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE as B } from '../shared/config.js';
import { STRUCTURE_VISUAL_TIERS, structureVisualProgress, structureVisualSignature, structureVisualTier } from '../client/structure-visuals.js';
import { building } from '../client/renderer.js';
import { createHeldItem } from '../client/held-item.js';

test('progressão visual possui cinco faixas estáveis até o nível 30',()=>{
  assert.equal(B.maxStructureTier,30);assert.equal(STRUCTURE_VISUAL_TIERS.length,5);
  assert.deepEqual([1,5,6,10,11,15,16,20,21,30].map(level=>structureVisualTier(level).id),[1,1,2,2,3,3,4,4,5,5]);
  assert.deepEqual(structureVisualProgress(8),{tier:STRUCTURE_VISUAL_TIERS[1],level:8,step:2,steps:5,ratio:.5});
  assert.notEqual(structureVisualSignature('core',21),structureVisualSignature('core',30));
  assert.notEqual(structureVisualSignature('core',1),structureVisualSignature('core',5));
  assert.notEqual(structureVisualSignature('core',20),structureVisualSignature('core',21));
});

test('cada estrutura muda de silhueta nas cinco faixas',()=>{
  for(const kind of ['core','wall','tower','mine','workshop','refinery','bastion','arcaneTower']){
    const samples=[1,6,11,16,21].map(level=>building(kind,level));
    assert.deepEqual(samples.map(model=>model.userData.visualTier),[1,2,3,4,5]);
    const silhouettes=samples.map(model=>model.userData.buildMeshes.map(mesh=>[
      mesh.geometry.type,
      mesh.position.x.toFixed(2),mesh.position.y.toFixed(2),mesh.position.z.toFixed(2),
      mesh.scale.x.toFixed(2),mesh.scale.y.toFixed(2),mesh.scale.z.toFixed(2)
    ].join(':')).join('|'));
    assert.equal(new Set(silhouettes).size,5,`${kind} precisa de cinco silhuetas distintas`);
  }
});

test('cada nível acrescenta evolução física e todas as obras possuem andaime',()=>{
  for(const kind of ['core','wall','tower','mine','workshop']){
    const samples=[1,2,3,4,5].map(level=>building(kind,level));
    assert.deepEqual(samples.map(model=>model.userData.levelStep),[0,1,2,3,4]);
    assert.equal(new Set(samples.map(model=>model.userData.buildMeshes.length)).size,5,`${kind} precisa evoluir dentro da faixa`);
    for(const model of samples){
      assert.ok(model.userData.constructionRig);
      assert.equal(model.userData.constructionRig.visible,false);
      assert.ok(model.userData.buildMeshes.every(mesh=>Number.isInteger(mesh.userData.buildPhase)));
    }
  }
});

test('equipamento do Troll evolui visualmente sem trocar sua identidade',()=>{
  for(const weapon of ['maul','claws','edge']){
    const common=createHeldItem('troll',{weapon},'',1),epic=createHeldItem('troll',{weapon},'',5);
    assert.equal(common.userData.heldItemKey,weapon);assert.equal(epic.userData.heldItemKey,weapon);
    assert.equal(epic.userData.visualLevel,5);assert.ok(epic.children.length>common.children.length);
  }
});
