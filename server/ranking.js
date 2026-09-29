import { randomUUID } from 'node:crypto';
import { RANK_CONFIG, tierForRating } from '../shared/rank-config.js';
import { performanceScores } from '../shared/performance-scores.js';

const iso=()=>new Date().toISOString();
const round=value=>Math.round(Number(value)||0);
const json=value=>JSON.stringify(value??{});

export class RankingEngine{
  constructor(database,{config=RANK_CONFIG,log=console.log}={}){this.database=database;this.db=database.db;this.config=config;this.log=log;}
  expected(a,b){return 1/(1+10**((b-a)/400));}
  delta(a,b,score){return Math.round(this.config.kFactor*(score-this.expected(a,b)));}
  ensurePlayer(identity){
    const timestamp=iso(),id=identity.playerId||(identity.userId?'user:'+identity.userId:'bot:'+identity.botId);
    this.db.prepare('INSERT OR IGNORE INTO players(id,user_id,bot_id,display_name,player_type,strategy,version,faction,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,identity.userId||null,identity.botId||null,identity.displayName,identity.type,identity.strategy||null,identity.version||null,identity.role||null,timestamp,timestamp);
    this.db.prepare('UPDATE players SET display_name=?,strategy=COALESCE(?,strategy),version=COALESCE(?,version),faction=COALESCE(?,faction),updated_at=? WHERE id=?').run(identity.displayName,identity.strategy||null,identity.version||null,identity.role||null,timestamp,id);return id;
  }
  ensureRank(playerId,seasonId){const timestamp=iso(),tier=tierForRating(this.config.initialRating,this.config).key;this.db.prepare('INSERT OR IGNORE INTO player_ranks(id,player_id,season_id,rating,mmr,rank_tier,peak_rating,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),playerId,seasonId,this.config.initialRating,this.config.initialMmr,tier,this.config.initialRating,timestamp,timestamp);return this.db.prepare('SELECT * FROM player_ranks WHERE player_id=? AND season_id=?').get(playerId,seasonId);}
  processMatch({matchId,seasonId,result,participants,rankedStatus},{transaction=true}={}){
    const existing=this.db.prepare('SELECT status FROM ranked_events WHERE match_id=?').get(matchId);if(existing?.status==='completed')return {processed:false,idempotent:true};
    const process=()=>{
      const repeated=this.db.prepare('SELECT status FROM ranked_events WHERE match_id=?').get(matchId);if(repeated?.status==='completed')return {processed:false,idempotent:true};
      const started=iso();this.db.prepare("INSERT OR REPLACE INTO ranked_events(match_id,status,payload_json,created_at) VALUES(?,'processing',?,?)").run(matchId,json({rankedStatus}),started);this.log(JSON.stringify({event:'RANK_PROCESSING_STARTED',matchId,seasonId,rankedStatus}));
      const rows=participants.map(identity=>{const playerId=this.ensurePlayer(identity),rank=this.ensureRank(playerId,seasonId);return {identity,playerId,rank};}),troll=rows.filter(row=>row.identity.role==='troll'),elves=rows.filter(row=>row.identity.role==='elf');
      if(!troll.length||!elves.length)throw new Error('Ranked match requires one Troll team and one Elf team.');
      const average=list=>list.reduce((sum,row)=>sum+row.rank.mmr,0)/Math.max(1,list.length),trollAverage=average(troll),elfAverage=average(elves),winner=result.winner==='elves'?'elf':result.winner;
      const updates=[];
      for(const row of rows){
        const won=row.identity.role===winner,opponent=row.identity.role==='troll'?elfAverage:trollAverage,score=won?1:0,delta=this.delta(row.rank.mmr,opponent,score),newMmr=Math.max(0,row.rank.mmr+delta),newRating=Math.max(0,row.rank.rating+delta),tier=tierForRating(newRating,this.config).key,winStreak=won?row.rank.current_win_streak+1:0,lossStreak=won?0:row.rank.current_loss_streak+1,peak=Math.max(row.rank.peak_rating,newRating),timestamp=iso();
        this.db.prepare('UPDATE player_ranks SET rating=?,mmr=?,rank_tier=?,wins=wins+?,losses=losses+?,games_played=games_played+1,current_win_streak=?,current_loss_streak=?,peak_rating=?,updated_at=? WHERE id=?').run(newRating,newMmr,tier,won?1:0,won?0:1,winStreak,lossStreak,peak,timestamp,row.rank.id);
        this.db.prepare('INSERT INTO rank_history(id,player_id,season_id,match_id,old_rating,new_rating,rating_delta,old_mmr,new_mmr,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),row.playerId,seasonId,matchId,row.rank.rating,newRating,delta,row.rank.mmr,newMmr,timestamp);
        const player=result.players.find(player=>player.id===row.identity.unitId)||{},scores=performanceScores(player,result);
        this.db.prepare('INSERT INTO match_players(id,match_id,player_id,role,team,won,rating_before,rating_after,rating_delta,stats_json,performance_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),matchId,row.playerId,row.identity.role,row.identity.role,won?1:0,row.rank.rating,newRating,delta,json(player),json(scores));
        this.updateStatistics(row.playerId,row.identity.role,won,player,result,matchId);
        updates.push({playerId:row.playerId,displayName:row.identity.displayName,role:row.identity.role,oldRating:row.rank.rating,newRating,delta,tier});this.log(JSON.stringify({event:row.identity.type==='bot'?'BOT_RANK_UPDATED':'RANK_UPDATED',matchId,playerId:row.playerId,userId:row.identity.userId||undefined,botId:row.identity.botId||undefined,oldRating:row.rank.rating,newRating,delta,seasonId,rankedStatus}));
      }
      this.db.prepare("UPDATE ranked_events SET status='completed',payload_json=? WHERE match_id=?").run(json(updates),matchId);this.db.prepare("UPDATE matches SET rank_processed_at=?,rank_processing_status='completed' WHERE id=?").run(iso(),matchId);return {processed:true,updates};
    };
    return transaction?this.database.transaction(process):process();
  }
  updateStatistics(playerId,role,won,player,result,matchId){
    const timestamp=iso();this.db.prepare('INSERT OR IGNORE INTO player_statistics(player_id,updated_at) VALUES(?,?)').run(playerId,timestamp);
    const deaths=player.alive?0:1,survival=player.alive?result.duration:(result.telemetry?.eliminations||[]).find(row=>row.id===player.id)?.time||result.duration;
    const firstKill=Number.isFinite(player.firstKillAt)?player.firstKillAt:null,firstTower=Number.isFinite(player.firstTowerDestroyedAt)?player.firstTowerDestroyedAt:null;
    this.db.prepare(`UPDATE player_statistics SET games=games+1,troll_games=troll_games+?,elf_games=elf_games+?,wins=wins+?,losses=losses+?,duration_total=duration_total+?,damage_dealt=damage_dealt+?,damage_taken=damage_taken+?,healing=healing+?,gold_generated=gold_generated+?,wood_generated=wood_generated+?,gold_spent=gold_spent+?,wood_spent=wood_spent+?,kills=kills+?,deaths=deaths+?,structures_built=structures_built+?,structures_destroyed=structures_destroyed+?,towers_built=towers_built+?,towers_destroyed=towers_destroyed+?,walls_lost=walls_lost+?,upgrades=upgrades+?,survival_seconds=survival_seconds+?,xp_earned=xp_earned+?,highest_tech_tier=MAX(highest_tech_tier,?),first_kill_seconds_total=first_kill_seconds_total+?,first_kill_samples=first_kill_samples+?,first_tower_seconds_total=first_tower_seconds_total+?,first_tower_samples=first_tower_samples+?,updated_at=? WHERE player_id=?`).run(role==='troll'?1:0,role==='elf'?1:0,won?1:0,won?0:1,result.duration,player.damage||0,player.damageTaken||0,player.healing||0,player.goldGenerated||0,player.woodGenerated||0,player.goldSpent||0,player.woodSpent||0,player.kills||0,deaths,player.structuresBuilt||0,player.structuresDestroyed||0,player.towersBuilt||0,player.towersDestroyed||0,player.wallsLost||0,player.upgrades||0,survival,player.xpEarned||0,player.highestTechTier||0,firstKill||0,firstKill===null?0:1,firstTower||0,firstTower===null?0:1,timestamp,playerId);
    this.unlockAchievements(playerId,role,won);
    this.log(JSON.stringify({event:'PLAYER_STATS_UPDATED',matchId,playerId,matchDuration:result.duration}));
  }
  unlockAchievements(playerId,role,won){
    const stats=this.db.prepare('SELECT games,wins FROM player_statistics WHERE player_id=?').get(playerId),keys=[];
    if(won)keys.push('first_victory',role==='troll'?'troll_victory':'elf_victory');
    if(stats.games>=10)keys.push('battle_tested');if(stats.games>=50)keys.push('veteran');
    const insert=this.db.prepare('INSERT OR IGNORE INTO player_achievements(player_id,achievement_id,unlocked_at) SELECT ?,id,? FROM achievements WHERE key=?');
    for(const key of keys)insert.run(playerId,iso(),key);
  }
}
