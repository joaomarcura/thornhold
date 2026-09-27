import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotDelta, applySnapshotDelta } from '../shared/snapshot-delta.js';

test('snapshot delta reproduces additions, patches, removals and quiet events',()=>{
  const before={time:1,state:'ACTIVE',events:[{id:1}],units:[{id:'t',x:1,hp:10,effects:[]}],structures:[{id:'a',hp:5}],trees:[]};
  const after={time:1.1,state:'ACTIVE',events:[],units:[{id:'t',x:2,hp:10,effects:[]},{id:'e',x:4,hp:8}],structures:[],trees:[]};
  const delta=createSnapshotDelta(before,after,2),restored=applySnapshotDelta(before,delta);
  assert.deepEqual(restored,after);
  assert.equal(delta.collections.units.patch[0].set.x,2);
  assert.deepEqual(delta.collections.structures.remove,['a']);
});
