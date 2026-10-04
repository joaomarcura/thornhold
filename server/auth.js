import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { isGameAdmin } from './game-admin.js';
import { promisify } from 'node:util';

const now=()=>new Date().toISOString();
const normalize=value=>String(value||'').trim().toLowerCase();
const clean=(value,max)=>String(value||'').trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,max);
const tokenHash=token=>createHash('sha256').update(String(token)).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const deriveKey=promisify(scrypt);

export function validateAccount(input={}){
  const username=clean(input.username,24),email=normalize(input.email).slice(0,254),displayName=clean(input.displayName,32),password=String(input.password||''),region=clean(input.region,8).toUpperCase()||null;
  if(!/^[A-Za-z0-9_]{3,24}$/.test(username))throw fail('Usuário deve ter 3–24 caracteres: letras, números ou _.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('E-mail inválido.');
  if(displayName.length<2)throw fail('Nome de exibição deve ter pelo menos 2 caracteres.');
  if(password.length<10||password.length>128||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))throw fail('Senha deve ter 10–128 caracteres, maiúscula, minúscula e número.');
  const avatar=typeof input.avatar==='string'&&/^https:\/\//i.test(input.avatar)?input.avatar.slice(0,300):null;
  return {username,email,displayName,password,region,avatar};
}

export async function hashPassword(password){const salt=randomBytes(16),hash=await deriveKey(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});return `scrypt$16384$8$1$${salt.toString('hex')}$${Buffer.from(hash).toString('hex')}`;}
export async function verifyPassword(password,encoded){
  try{const[type,n,r,p,saltHex,hashHex]=String(encoded).split('$');if(type!=='scrypt')return false;const expected=Buffer.from(hashHex,'hex'),actual=await deriveKey(String(password),Buffer.from(saltHex,'hex'),expected.length,{N:Number(n),r:Number(r),p:Number(p),maxmem:64*1024*1024});return timingSafeEqual(Buffer.from(actual),expected);}catch{return false;}
}

export function parseCookies(header=''){return Object.fromEntries(String(header).split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const at=part.indexOf('=');return at<0?[part,'']:[part.slice(0,at),decodeURIComponent(part.slice(at+1))];}));}

export class AuthService{
  constructor(database,{sessionDays=30}={}){this.database=database;this.db=database.db;this.sessionDays=sessionDays;}
  publicUser(row){return row?{id:row.id,username:row.username,email:row.email,displayName:row.display_name,avatar:row.avatar,region:row.region,createdAt:row.created_at,gameAdmin:isGameAdmin(this.database,row.id)}:null;}
  async register(input){
    const data=validateAccount(input),id=randomUUID(),timestamp=now(),passwordHash=await hashPassword(data.password);
    try{this.database.transaction(()=>{this.db.prepare('INSERT INTO users(id,username,username_norm,email,email_norm,password_hash,display_name,avatar,region,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,data.username,normalize(data.username),data.email,normalize(data.email),passwordHash,data.displayName,data.avatar,data.region,timestamp,timestamp);this.db.prepare('INSERT INTO players(id,user_id,display_name,player_type,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('user:'+id,id,data.displayName,'human',timestamp,timestamp);});}
    catch(error){if(String(error.message).includes('username_norm'))throw fail('Nome de usuário já está em uso.',409);if(String(error.message).includes('email_norm'))throw fail('E-mail já está em uso.',409);throw error;}
    return this.createSession(this.db.prepare('SELECT * FROM users WHERE id=?').get(id));
  }
  async login(identifier,password){const key=normalize(identifier),user=this.db.prepare('SELECT * FROM users WHERE username_norm=? OR email_norm=?').get(key,key);if(!user||!await verifyPassword(password,user.password_hash))throw fail('Credenciais inválidas.',401);return this.createSession(user);}
  createSession(user){const token=randomBytes(32).toString('base64url'),id=randomUUID(),created=new Date(),expires=new Date(created.getTime()+this.sessionDays*86400000);this.db.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?,?)').run(id,user.id,tokenHash(token),created.toISOString(),expires.toISOString(),created.toISOString());return {user:this.publicUser(user),token,expiresAt:expires.toISOString()};}
  authenticate(token){if(!token)return null;const row=this.db.prepare('SELECT u.*,s.id session_id,s.expires_at FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(tokenHash(token));if(!row)return null;if(Date.parse(row.expires_at)<=Date.now()){this.db.prepare('DELETE FROM auth_sessions WHERE id=?').run(row.session_id);return null;}this.db.prepare('UPDATE auth_sessions SET last_seen_at=? WHERE id=?').run(now(),row.session_id);return this.publicUser(row);}
  logout(token){if(token)this.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(tokenHash(token));}
  updateProfile(userId,input={}){const displayName=clean(input.displayName,32),region=clean(input.region,8).toUpperCase()||null,avatar=typeof input.avatar==='string'&&/^https:\/\//i.test(input.avatar)?input.avatar.slice(0,300):null;if(displayName.length<2)throw fail('Nome de exibição inválido.');const timestamp=now();this.database.transaction(()=>{this.db.prepare('UPDATE users SET display_name=?,region=?,avatar=?,updated_at=? WHERE id=?').run(displayName,region,avatar,timestamp,userId);this.db.prepare('UPDATE players SET display_name=?,updated_at=? WHERE user_id=?').run(displayName,timestamp,userId);});return this.publicUser(this.db.prepare('SELECT * FROM users WHERE id=?').get(userId));}
}

export function sessionCookie(token,{secure=process.env.NODE_ENV==='production',maxAge=2592000}={}){return `thornhold_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;}
export function clearSessionCookie({secure=process.env.NODE_ENV==='production'}={}){return `thornhold_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`;}
