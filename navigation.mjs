export function headerMenu({admin=false,active=''}={}){
  const items=[['teams','Teams toevoegen'],['nakijken','Antwoorden & punten'],['stand','Tussenstand per team'],['model','Antwoordmodel'],['bingo','Muziekbingo · DJ'],['settings','Instellingen & punten']];
  const tabs={settings:'instellingen',model:'model',bingo:'bingo',teams:'teams',nakijken:'nakijken',stand:'stand'};
  return `<details class="header-menu"><summary class="header-menu-toggle" aria-label="Navigatiemenu"><span class="hamburger-icon" aria-hidden="true"><i></i><i></i><i></i></span><span>Menu</span></summary><nav class="header-menu-panel" aria-label="Alle pagina’s"><div class="menu-panel-heading"><strong>De pubquiz</strong><small>Alles voor een gezellige quizavond</small></div><div class="menu-group"><h2>Quiz & spelen</h2><a href="./">Homepage</a><a href="./#rondes">Rondes & vraagkaarten</a><a href="./#tussenstand">Live scorebord</a><a href="./#bonus">Bonusronde</a><a href="organisator.html?tab=bingo">Muziekbingo & playlist</a></div><div class="menu-group"><h2>Organisatie</h2>${items.map(([id,label])=>admin?`<button type="button" data-tab="${id}" ${active===id?'aria-current="page"':''}>${label}</button>`:`<a href="organisator.html?tab=${tabs[id]}">${label}</a>`).join('')}</div>${admin?'<div class="menu-group menu-utilities"><h2>Beheerhulpmiddelen</h2><button type="button" data-action="share">Beheerlink kopiëren</button><button type="button" data-action="backup">Reservekopie downloaden</button><button type="button" data-action="change-actor">Naam wijzigen</button></div>':''}</nav></details>`;
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
