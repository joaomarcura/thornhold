import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RANK_CONFIG } from '../shared/rank-config.js';

const root=fileURLToPath(new URL('../',import.meta.url));

const migrations=[
  `CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS users(
     id TEXT PRIMARY KEY, username TEXT NOT NULL, username_norm TEXT NOT NULL UNIQUE,
     email TEXT NOT NULL, email_norm TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
     display_name TEXT NOT NULL, avatar TEXT, region TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS auth_sessions(
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
   CREATE TABLE IF NOT EXISTS seasons(
     id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, starts_at TEXT NOT NULL,
     ends_at TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS players(
     id TEXT PRIMARY KEY, user_id TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
     bot_id TEXT UNIQUE, display_name TEXT NOT NULL, player_type TEXT NOT NULL,
     strategy TEXT, version TEXT, faction TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS matches(
     id TEXT PRIMARY KEY, external_id TEXT NOT NULL UNIQUE, season_id TEXT NOT NULL REFERENCES seasons(id),
     match_type TEXT NOT NULL, ranked_status TEXT NOT NULL, mode TEXT NOT NULL, seed TEXT,
     winner TEXT, duration INTEGER NOT NULL, completed INTEGER NOT NULL, end_reason TEXT,
     release TEXT, build_hash TEXT, result_json TEXT NOT NULL, rank_processed_at TEXT,
     rank_processing_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, completed_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_matches_season_completed ON matches(season_id,completed_at DESC);
   CREATE TABLE IF NOT EXISTS match_players(
     id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
     player_id TEXT NOT NULL REFERENCES players(id), role TEXT NOT NULL, team TEXT NOT NULL,
     won INTEGER NOT NULL, rating_before INTEGER, rating_after INTEGER, rating_delta INTEGER,
     stats_json TEXT NOT NULL, performance_json TEXT NOT NULL, UNIQUE(match_id,player_id)
   );
   CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id,match_id);
   CREATE TABLE IF NOT EXISTS player_ranks(
     id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), season_id TEXT NOT NULL REFERENCES seasons(id),
     rating INTEGER NOT NULL, mmr REAL NOT NULL, rank_tier TEXT NOT NULL, division INTEGER NOT NULL DEFAULT 1,
     wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, games_played INTEGER NOT NULL DEFAULT 0,
     current_win_streak INTEGER NOT NULL DEFAULT 0, current_loss_streak INTEGER NOT NULL DEFAULT 0,
     peak_rating INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
     UNIQUE(player_id,season_id)
   );
   CREATE INDEX IF NOT EXISTS idx_ranks_board ON player_ranks(season_id,rating DESC,games_played DESC);
   CREATE TABLE IF NOT EXISTS rank_history(
     id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), season_id TEXT NOT NULL REFERENCES seasons(id),
     match_id TEXT NOT NULL REFERENCES matches(id), old_rating INTEGER NOT NULL, new_rating INTEGER NOT NULL,
     rating_delta INTEGER NOT NULL, old_mmr REAL NOT NULL, new_mmr REAL NOT NULL, created_at TEXT NOT NULL,
     UNIQUE(match_id,player_id)
   );
   CREATE TABLE IF NOT EXISTS player_statistics(
     player_id TEXT PRIMARY KEY REFERENCES players(id), games INTEGER NOT NULL DEFAULT 0,
     troll_games INTEGER NOT NULL DEFAULT 0, elf_games INTEGER NOT NULL DEFAULT 0,
     wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
     duration_total REAL NOT NULL DEFAULT 0, damage_dealt REAL NOT NULL DEFAULT 0,
     damage_taken REAL NOT NULL DEFAULT 0, healing REAL NOT NULL DEFAULT 0,
     gold_generated REAL NOT NULL DEFAULT 0, wood_generated REAL NOT NULL DEFAULT 0,
     gold_spent REAL NOT NULL DEFAULT 0, wood_spent REAL NOT NULL DEFAULT 0,
     kills INTEGER NOT NULL DEFAULT 0, deaths INTEGER NOT NULL DEFAULT 0,
     structures_built INTEGER NOT NULL DEFAULT 0, structures_destroyed INTEGER NOT NULL DEFAULT 0,
     towers_built INTEGER NOT NULL DEFAULT 0, towers_destroyed INTEGER NOT NULL DEFAULT 0,
     walls_lost INTEGER NOT NULL DEFAULT 0, upgrades INTEGER NOT NULL DEFAULT 0,
     survival_seconds REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS match_statistics(
     match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
     summary_json TEXT NOT NULL, timeline_json TEXT NOT NULL, created_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS ranked_events(
     match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
     status TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS achievements(id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS player_achievements(player_id TEXT NOT NULL REFERENCES players(id), achievement_id TEXT NOT NULL REFERENCES achievements(id), unlocked_at TEXT NOT NULL, PRIMARY KEY(player_id,achievement_id));`,
  `ALTER TABLE player_statistics ADD COLUMN xp_earned REAL NOT NULL DEFAULT 0;
   ALTER TABLE player_statistics ADD COLUMN highest_tech_tier INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE player_statistics ADD COLUMN first_kill_seconds_total REAL NOT NULL DEFAULT 0;
   ALTER TABLE player_statistics ADD COLUMN first_kill_samples INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE player_statistics ADD COLUMN first_tower_seconds_total REAL NOT NULL DEFAULT 0;
   ALTER TABLE player_statistics ADD COLUMN first_tower_samples INTEGER NOT NULL DEFAULT 0;`
];

const achievements=[
  ['first-victory','first_victory','Primeira vitória','Vença sua primeira partida competitiva.'],
  ['troll-victory','troll_victory','Predador da floresta','Vença uma partida como Troll.'],
  ['elf-victory','elf_victory','Guardião da clareira','Vença uma partida como Elfo.'],
  ['battle-tested','battle_tested','Testado em batalha','Conclua 10 partidas.'],
  ['veteran','veteran','Veterano de Thornhold','Conclua 50 partidas.']
];

export class PlatformDatabase{
  constructor({filename=process.env.DATABASE_PATH||path.join(process.env.DATA_DIR||path.join(root,'data'),'thornhold.sqlite')}={}){
    if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
    const journalMode=['WAL','DELETE'].includes(String(process.env.DATABASE_JOURNAL_MODE||'').toUpperCase())?String(process.env.DATABASE_JOURNAL_MODE).toUpperCase():(filename===':memory:'?'MEMORY':'WAL');
    this.filename=filename;this.db=new DatabaseSync(filename);this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=${journalMode}; PRAGMA busy_timeout=5000;`);this.migrate();
  }
  migrate(){
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    const applied=new Set(this.db.prepare('SELECT version FROM schema_migrations').all().map(row=>row.version));
    migrations.forEach((sql,index)=>{const version=index+1;if(applied.has(version))return;this.transaction(()=>{this.db.exec(sql);this.db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(version,new Date().toISOString());});});
    const now=new Date().toISOString();this.db.prepare('INSERT OR IGNORE INTO seasons(id,name,kind,starts_at,active,created_at) VALUES(?,?,?,?,1,?)').run(RANK_CONFIG.seasonId,'Temporada 0 — Desenvolvimento','development',now,now);
    const insertAchievement=this.db.prepare('INSERT OR IGNORE INTO achievements(id,key,name,description) VALUES(?,?,?,?)');
    for(const row of achievements)insertAchievement.run(...row);
  }
  transaction(callback){this.db.exec('BEGIN IMMEDIATE');try{const value=callback();this.db.exec('COMMIT');return value;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  close(){this.db.close();}
}
