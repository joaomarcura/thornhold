import { PlatformDatabase } from '../server/database.js';
import { grantGameAdmin } from '../server/game-admin.js';
const identifier=process.argv[2];if(!identifier)throw new Error('Uso: node scripts/grant-game-admin.js <login existente>');
const database=new PlatformDatabase();
try{const user=grantGameAdmin(database,identifier);console.log('Comandos admin habilitados para '+user.username+' no banco '+database.filename);}finally{database.close();}
