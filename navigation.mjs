export function headerMenu({admin=false,active=''}={}){
  const demo=new URLSearchParams(location.search).get('demo')==='1';
  const items=[['teams','Teams'],['perteam','Scores invullen'],['model','Antwoordmodel'],['settings','Instellingen & punten']];
  const tabs={settings:'instellingen',model:'model',bingo:'bingo',teams:'teams',perteam:'perteam',nakijken:'nakijken',stand:'stand'};
  return `<details class="header-menu"><summary class="header-menu-toggle" aria-label="Navigatiemenu"><span class="hamburger-icon" aria-hidden="true"><i></i><i></i><i></i></span><span>Menu</span></summary><nav class="header-menu-panel" aria-label="Alle pagina’s"><div class="menu-panel-heading"><strong>Organisatie</strong></div><div class="menu-group">${items.map(([id,label])=>admin?`<button type="button" data-tab="${id}" ${active===id?'aria-current="page"':''}>${label}</button>`:`<a href="organisator.html?tab=${tabs[id]}">${label}</a>`).join('')}</div><div class="menu-group menu-version-links"><a href="./?demo=1" class="${demo?'version-active':''}">Demo bekijken${demo?'<span>Actief</span>':''}</a><a href="./" data-exit-demo="true" class="${!demo?'version-active':''}">Echte quiz${!demo?'<span>Actief</span>':''}</a></div></nav></details>`;
}
// Native details provides keyboard activation and the expanded state.
document.addEventListener('click',event=>{
  const menu=document.querySelector('.header-menu[open]');
  if(!menu)return;
  if(!menu.contains(event.target) || event.target.closest('.header-menu-panel a,.header-menu-panel button'))menu.open=false;
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const menu=document.querySelector('.header-menu[open]');
  if(menu){menu.open=false;menu.querySelector('summary').focus();event.preventDefault();}
});
