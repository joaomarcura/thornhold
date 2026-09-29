import test from 'node:test';
import assert from 'node:assert/strict';
import { PlatformDatabase } from '../server/database.js';
import { AuthService } from '../server/auth.js';
import { PlatformService } from '../server/platform.js';
import { RankingEngine } from '../server/ranking.js';
import { createGameServer } from '../server/index.js';

const silent=()=>{};
const account=async(auth,suffix='one')=>(await auth.register({username:`player_${suffix}`,email:`${suffix}@thornhold.test`,displayName:`Player ${suffix}`,password:'StrongPass123'})).user;
const room=({id='ROOM01',mode='normal',local=false,user=null}={})=>({
  id,created:Date.now()-60_000,matchSequence:1,settings:{mode,local},
  slots:[
    {id:'t0',role:'troll',occupant:{type:'bot',name:'Grum · Predador',botId:'BOT_TROLL_ADAPTIVE_V1',strategy:'adaptive',version:'v1',difficulty:'normal'}},
    {id:'e0',role:'elf',occupant:user?{type:'human',name:user.displayName,userId:user.id,clientId:'client-one'}:{type:'bot',name:'Elyra · Guardiã',botId:'BOT_ELF_DEFENSIVE_V1',strategy:'defensive',version:'v1',difficulty:'normal'}},
    {id:'e1',role:'elf',occupant:{type:'bot',name:'Faelar · Mercador',botId:'BOT_ELF_ECONOMY_V1',strategy:'economy',version:'v1',difficulty:'normal'}}
  ]
});
const player=(id,role,overrides={})=>({id,name:id,role,alive:true,damage:1000,goldGenerated:500,woodGenerated:role==='elf'?250:0,goldSpent:200,woodSpent:100,kills:0,structuresBuilt:role==='elf'?3:0,structuresDestroyed:role==='troll'?2:0,upgrades:2,healing:50,...overrides});
const result=(winner='elves')=>({completed:true,seed:'PLATFORM-TEST',winner,endReason:'score-limit',duration:900,players:[player('t0','troll'),player('e0','elf'),player('e1','elf')],telemetry:{timeline:[],eliminations:[]},teamScores:{troll:1000,elves:2000}});

test('account creation validates uniqueness and restores valid credentials',async()=>{
  const database=new PlatformDatabase({filename:':memory:'}),auth=new AuthService(database),session=await auth.register({username:'Forest_One',email:'forest@example.com',displayName:'Forest One',password:'StrongPass123'});
  assert.notEqual(database.db.prepare("SELECT password_hash FROM users WHERE username_norm='forest_one'").get().password_hash,'StrongPass123');
  assert.equal(auth.authenticate(session.token).username,'Forest_One');
  assert.equal((await auth.login('forest_one','StrongPass123')).user.email,'forest@example.com');
  await assert.rejects(auth.login('forest_one','wrong-password'),/Credenciais inválidas/);
  await assert.rejects(auth.register({username:'Forest_One',email:'other@example.com',displayName:'Other',password:'StrongPass123'}),/usuário já está em uso/i);
  await assert.rejects(auth.register({username:'Forest_Two',email:'forest@example.com',displayName:'Other',password:'StrongPass123'}),/e-mail já está em uso/i);
  database.close();
});

test('protected profile API rejects anonymous requests',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false,databasePath:':memory:'});
  try{const response=await fetch(`http://127.0.0.1:${app.port}/api/profile`);assert.equal(response.status,401);}finally{await app.close();}
});

test('HTTP authentication persists by secure server session and rejects cross-origin mutations',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false,databasePath:':memory:'}),base=`http://127.0.0.1:${app.port}`;
  try{
    const registration=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'HttpPlayer',email:'http@thornhold.test',displayName:'HTTP Player',password:'StrongPass123'})});
    assert.equal(registration.status,201);const cookie=registration.headers.get('set-cookie').split(';')[0];assert.match(cookie,/thornhold_session=/);
    const restored=await fetch(base+'/api/auth/session',{headers:{cookie}});assert.equal((await restored.json()).user.username,'HttpPlayer');
    const profile=await fetch(base+'/api/profile',{headers:{cookie}});assert.equal(profile.status,200);
    const csrf=await fetch(base+'/api/profile',{method:'PATCH',headers:{cookie,'Content-Type':'application/json',Origin:'https://attacker.invalid'},body:JSON.stringify({displayName:'Stolen'})});assert.equal(csrf.status,403);
    const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie},body:'{}'});assert.equal(logout.status,200);
    assert.equal((await (await fetch(base+'/api/auth/session',{headers:{cookie}})).json()).user,null);
  }finally{await app.close();}
});

test('Elf victory updates every participant, history, achievements and is idempotent',async()=>{
  const database=new PlatformDatabase({filename:':memory:'}),auth=new AuthService(database),user=await account(auth),platform=new PlatformService(database,{simulationEnabled:true,log:silent}),gameRoom=room({user}),gameResult=result('elves');
  const first=platform.recordMatch(gameRoom,gameResult);assert.equal(first.ranked,true);assert.equal(first.updates.length,3);
  const human=platform.profile(user.id);assert.equal(human.rank.wins,1);assert.equal(human.rank.rating,1216);assert.equal(human.statistics.games,1);assert.equal(human.statistics.damage_dealt,1000);assert.equal(human.statistics.gold_generated,500);assert.equal(human.statistics.wood_generated,250);assert.ok(human.achievements.some(row=>row.key==='first_victory'));
  const troll=database.db.prepare("SELECT r.* FROM player_ranks r JOIN players p ON p.id=r.player_id WHERE p.bot_id='BOT_TROLL_ADAPTIVE_V1'").get();assert.equal(troll.rating,1184);assert.equal(troll.losses,1);
  const repeated=platform.recordMatch(gameRoom,gameResult);assert.equal(repeated.idempotent,true);assert.equal(platform.profile(user.id).rank.gamesPlayed,1);assert.equal(database.db.prepare('SELECT COUNT(*) count FROM rank_history').get().count,3);
  database.close();
});

test('rating math handles equal and different MMR and crosses tier boundaries',async()=>{
  const database=new PlatformDatabase({filename:':memory:'}),engine=new RankingEngine(database,{log:silent});
  assert.equal(engine.delta(1200,1200,1),16);assert.equal(engine.delta(1200,1200,0),-16);assert.ok(engine.delta(1600,1200,1)<16);assert.ok(engine.delta(800,1200,1)>16);
  const auth=new AuthService(database),user=await account(auth,'tier'),platform=new PlatformService(database,{simulationEnabled:true,log:silent}),firstRoom=room({id:'PROMO',user});
  platform.recordMatch(firstRoom,result('elves'));const playerRow=platform.playerForUser(user.id);database.db.prepare("UPDATE player_ranks SET rating=1395,mmr=1395,rank_tier='silver' WHERE player_id=?").run(playerRow.id);
  platform.recordMatch(room({id:'PROMO2',user}),result('elves'));assert.equal(platform.profile(user.id).rank.tier.key,'gold');
  database.db.prepare("UPDATE player_ranks SET rating=1405,mmr=1405,rank_tier='gold' WHERE player_id=?").run(playerRow.id);
  platform.recordMatch(room({id:'DEMOTE',user}),result('troll'));assert.equal(platform.profile(user.id).rank.tier.key,'silver');assert.ok(platform.profile(user.id).rank.peakRating>=1400);
  database.close();
});

test('bot identity retains rating and simulated ranking covers bot and custom matches',()=>{
  const database=new PlatformDatabase({filename:':memory:'}),platform=new PlatformService(database,{simulationEnabled:true,log:silent});
  const realShape={...result('troll'),release:{game:'0.3.0',protocol:7,balance:'v3.14'},buildHash:'abc123'};
  const first=platform.recordMatch(room({id:'BOTS'}),realShape);assert.equal(first.ranked,true);assert.match(database.db.prepare("SELECT release FROM matches WHERE external_id LIKE 'BOTS:%'").get().release,/protocol/);
  const initial=database.db.prepare("SELECT r.rating,r.games_played FROM player_ranks r JOIN players p ON p.id=r.player_id WHERE p.bot_id='BOT_TROLL_ADAPTIVE_V1'").get();assert.deepEqual({...initial},{rating:1216,games_played:1});
  platform.recordMatch(room({id:'BOTS2',mode:'custom'}),result('troll'));const retained=database.db.prepare("SELECT r.rating,r.games_played FROM player_ranks r JOIN players p ON p.id=r.player_id WHERE p.bot_id='BOT_TROLL_ADAPTIVE_V1'").get();assert.equal(retained.games_played,2);assert.ok(retained.rating>initial.rating);
  const custom=database.db.prepare("SELECT match_type,ranked_status FROM matches WHERE external_id LIKE 'BOTS2:%'").get();assert.equal(custom.match_type,'custom');assert.equal(custom.ranked_status,'simulated_ranked');
  database.close();
});

test('disabled simulation skips custom ranking and leaderboard supports ordering, pagination, role and season',()=>{
  const database=new PlatformDatabase({filename:':memory:'}),unranked=new PlatformService(database,{simulationEnabled:false,log:silent});unranked.recordMatch(room({id:'SKIP',mode:'custom'}),result('troll'));assert.equal(database.db.prepare("SELECT rank_processing_status FROM matches WHERE external_id LIKE 'SKIP:%'").get().rank_processing_status,'skipped');
  const ranked=new PlatformService(database,{simulationEnabled:true,log:silent});for(let index=0;index<4;index++)ranked.recordMatch(room({id:`PAGE${index}`}),result(index%2?'elves':'troll'));
  const pageOne=ranked.leaderboard({page:1,pageSize:2,players:'bots'}),pageTwo=ranked.leaderboard({page:2,pageSize:2,players:'bots'});assert.equal(pageOne.items.length,2);assert.equal(pageTwo.items[0].position,3);assert.ok(pageOne.items[0].rating>=pageOne.items[1].rating);
  assert.ok(ranked.leaderboard({role:'troll',players:'bots'}).items.every(row=>row.bot_id?.includes('TROLL')));assert.equal(ranked.leaderboard({season:'all',players:'bots'}).total,3);assert.equal(ranked.leaderboard({season:'missing'}).total,0);
  database.close();
});

test('leaderboard players expose public profiles without private account or MMR data',async()=>{
  const database=new PlatformDatabase({filename:':memory:'}),auth=new AuthService(database),user=await account(auth,'public'),platform=new PlatformService(database,{simulationEnabled:true,devMode:true,log:silent});
  platform.recordMatch(room({id:'PUBLIC',user}),result('elves'));
  const humanId=platform.playerForUser(user.id).id,human=platform.publicProfile(humanId),botId=platform.leaderboard({players:'bots'}).items[0].id,bot=platform.publicProfile(botId);
  assert.equal(human.player.username,'player_public');assert.equal(human.rank.rating,1216);assert.equal(human.history.items.length,1);assert.equal(human.player.email,undefined);assert.equal(human.rank.mmr,undefined);
  assert.equal(bot.player.playerType,'bot');assert.ok(bot.player.botId);assert.ok(bot.player.strategy);assert.equal(bot.history.items.length,1);assert.equal(platform.publicProfile('missing-player'),null);
  database.close();
});

test('public profile HTTP endpoint is readable without a session and returns 404 for unknown players',async()=>{
  const app=await createGameServer({port:0,host:'127.0.0.1',telemetry:false,databasePath:':memory:'}),base=`http://127.0.0.1:${app.port}`;
  try{
    app.platform.recordMatch(room({id:'PUBLIC-HTTP'}),result('troll'));
    const playerId=app.platform.leaderboard({players:'bots'}).items[0].id,response=await fetch(`${base}/api/players/${encodeURIComponent(playerId)}/profile`),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.player.id,playerId);assert.equal(body.rank.mmr,undefined);
    assert.equal((await fetch(base+'/api/players/missing/profile')).status,404);
  }finally{await app.close();}
});

test('history filters are server-side and developer diagnostics expose bot competition',async()=>{
  const database=new PlatformDatabase({filename:':memory:'}),auth=new AuthService(database),user=await account(auth,'filters'),platform=new PlatformService(database,{simulationEnabled:true,devMode:true,log:silent});
  platform.recordMatch(room({id:'FILTER-WIN',user}),result('elves'));platform.recordMatch(room({id:'FILTER-LOSS',mode:'custom',user}),result('troll'));
  assert.equal(platform.history(user.id,{result:'victory'}).total,1);assert.equal(platform.history(user.id,{result:'defeat'}).total,1);assert.equal(platform.history(user.id,{role:'troll'}).total,0);assert.equal(platform.history(user.id,{role:'elf'}).total,2);assert.equal(platform.history(user.id,{matchType:'custom'}).total,1);
  const debug=platform.debugSummary();assert.equal(debug.games,2);assert.equal(debug.bots.length,2);assert.ok(debug.bots.every(bot=>Number.isFinite(bot.winRate)&&bot.rankTier));assert.equal(platform.history(user.id,{result:'invalid'}).filters.result,'all');
  database.close();
});

test('ranking transaction rolls back match and all participant updates on failure',()=>{
  const database=new PlatformDatabase({filename:':memory:'}),platform=new PlatformService(database,{simulationEnabled:true,log:silent}),broken=room({id:'ROLLBACK'});broken.slots[2].occupant={...broken.slots[1].occupant};
  assert.throws(()=>platform.recordMatch(broken,result('troll')));
  assert.equal(database.db.prepare('SELECT COUNT(*) count FROM matches').get().count,0);assert.equal(database.db.prepare('SELECT COUNT(*) count FROM rank_history').get().count,0);
  database.close();
});
