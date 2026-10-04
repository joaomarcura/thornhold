import { fishCard } from './fishing-ui.js';

export function fishingGallery(data,{loading=false,error='',date=()=>''}={}){
  if(loading)return '<section class="loading">Carregando suas capturas…</section>';
  if(error)return '<section class="empty"><h2>Não foi possível carregar os peixes</h2><p>A coleção continua salva. Tente novamente.</p><button data-fish-profile-page="1">Tentar novamente</button></section>';
  if(!data)return '<section class="loading">Preparando coleção…</section>';
  const pages=Math.max(1,Math.ceil(data.total/data.pageSize));
  return `<section class="panel fish-profile"><div class="eyebrow">DIÁRIO DO MAR</div><h2>Suas capturas · ${data.total}</h2><p>Mais raros primeiro · depois Shiny e rating. Registros visuais, sem ouro ou peixes vendáveis entre partidas.</p><div class="fishing-gallery">${data.items.length?data.items.map(f=>`<section>${fishCard(f)}<small>${date(f.capturedAt)}</small></section>`).join(''):'<div class="empty compact">Você ainda não tem capturas individuais registradas. Pesque com sua conta conectada para começar.</div>'}</div><div class="pagination"><button class="secondary" data-fish-profile-page="${data.page-1}" ${data.page<=1?'disabled':''}>Anterior</button><span>Página ${data.page} de ${pages}</span><button class="secondary" data-fish-profile-page="${data.page+1}" ${data.page>=pages?'disabled':''}>Próxima</button></div><small>Capturas anteriores à atualização permanecem no resumo da coleção; os registros individuais começam nesta versão.</small></section>`;
}
