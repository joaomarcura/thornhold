// Patch matching nodes instead of replacing the panel: native selects, keyboard
// focus and a pointer held over an action survive authoritative snapshot updates.
export function updatePanel(panel,html){
  const template=document.createElement('template');template.innerHTML=html;
  function patch(parent,fresh){
    const incoming=[...fresh.childNodes];
    incoming.forEach((next,i)=>{
      const old=parent.childNodes[i];
      if(!old){parent.append(next.cloneNode(true));return;}
      if(old.nodeType!==next.nodeType||old.nodeName!==next.nodeName){old.replaceWith(next.cloneNode(true));return;}
      if(old.nodeType===3){if(old.nodeValue!==next.nodeValue)old.nodeValue=next.nodeValue;return;}
      if(old.nodeType!==1)return;
      const value=old.tagName==='SELECT'?old.value:null;
      for(const a of [...old.attributes])if(!next.hasAttribute(a.name))old.removeAttribute(a.name);
      for(const a of next.attributes)if(old.getAttribute(a.name)!==a.value)old.setAttribute(a.name,a.value);
      patch(old,next);
      if(value!==null&&[...old.options].some(o=>o.value===value))old.value=value;
    });
    while(parent.childNodes.length>incoming.length)parent.lastChild.remove();
  }
  patch(panel,template.content);
}
