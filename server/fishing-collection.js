// Only authoritative catches enter the visual collection. No fish, currency,
// inventory or sale entitlement is carried to another match.
export class FishingCollection{
  constructor(database){this.database=database;}
  list(userId){return this.database.db.prepare('SELECT collection_key AS key,count,best_json FROM fishing_collection WHERE user_id=? ORDER BY collection_key').all(userId).map(row=>({key:row.key,count:row.count,best:JSON.parse(row.best_json)}));}
  catches(userId,{page=1,pageSize=12}={}){
    page=Math.max(1,Math.floor(Number(page))||1);pageSize=Math.min(48,Math.max(1,Math.floor(Number(pageSize))||12));
    const total=this.database.db.prepare('SELECT COUNT(*) AS n FROM fishing_captures WHERE user_id=? AND fish_json IS NOT NULL').get(userId).n;
    page=Math.min(page,Math.max(1,Math.ceil(total/pageSize)));
    const rows=this.database.db.prepare(`SELECT fish_json,captured_at FROM fishing_captures WHERE user_id=? AND fish_json IS NOT NULL
      ORDER BY CASE json_extract(fish_json,'$.rarity') WHEN 'mythic' THEN 6 WHEN 'legendary' THEN 5 WHEN 'epic' THEN 4 WHEN 'rare' THEN 3 WHEN 'uncommon' THEN 2 ELSE 1 END DESC,
      json_extract(fish_json,'$.shiny') DESC,json_extract(fish_json,'$.rating') DESC,captured_at DESC,capture_id LIMIT ? OFFSET ?`).all(userId,pageSize,(page-1)*pageSize);
    return {items:rows.map(r=>({...JSON.parse(r.fish_json),capturedAt:r.captured_at})),page,pageSize,total};
  }
  record(userId,captureId,fish){
    return this.database.transaction(()=>{
      const inserted=this.database.db.prepare('INSERT OR IGNORE INTO fishing_captures(capture_id,user_id,fish_json,captured_at) VALUES(?,?,?,?)').run(captureId,userId,JSON.stringify(fish),new Date().toISOString());
      if(!inserted.changes)return false;
      const key=`${fish.species}:${fish.rarity}:${fish.shiny?'shiny':'normal'}`,old=this.database.db.prepare('SELECT count,best_json FROM fishing_collection WHERE user_id=? AND collection_key=?').get(userId,key);
      const previous=old&&JSON.parse(old.best_json),best=previous&&previous.rating>=fish.rating?previous:fish;
      this.database.db.prepare('INSERT INTO fishing_collection(user_id,collection_key,count,best_json) VALUES(?,?,?,?) ON CONFLICT(user_id,collection_key) DO UPDATE SET count=excluded.count,best_json=excluded.best_json').run(userId,key,(old?.count||0)+1,JSON.stringify(best));return true;
    });
  }
}
