// Admin privileges are explicit persistent grants to authenticated user IDs,
// never inferred from display names, lobby nicknames or client flags.
export function isGameAdmin(database,userId){return !!userId&&!!database.db.prepare('SELECT 1 FROM game_admins WHERE user_id=?').get(userId);}
export function grantGameAdmin(database,identifier){
  const key=String(identifier||'').trim().toLowerCase(),user=database.db.prepare('SELECT id,username FROM users WHERE id=? OR username_norm=?').get(key,key);
  if(!user)throw new Error('Conta existente não encontrada; nenhuma conta foi criada.');
  database.db.prepare('INSERT OR IGNORE INTO game_admins(user_id,granted_at) VALUES(?,?)').run(user.id,new Date().toISOString());
  return user;
}
