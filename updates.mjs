// Open tabbladen halen nieuwe publicaties op zodra dat veilig kan.
export function watchForUpdates({canReload=()=>true,beforeReload=()=>{}}={}){
  const current=document.querySelector('meta[name="pubquiz-version"]')?.content;
  if(!current)return;
  let checking=false;
  const safe=()=>!document.hidden && canReload() && !document.querySelector('dialog[open]') && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  async function check(){
    if(checking || !safe())return;
    checking=true;
    try{
      const response=await fetch(new URL('version.json',import.meta.url),{cache:'no-store'});
      if(!response.ok)return;
      const latest=await response.json();
      if(!/^[a-f0-9]{12}$/.test(latest.version) || latest.version===current || !safe())return;
      beforeReload();
      const target=new URL(location.href);
      target.searchParams.set('versie',latest.version);
      location.replace(target.href);
    }catch{
      // Een verbroken verbinding mag het nakijken niet onderbreken.
    }finally{checking=false;}
  }
  setInterval(check,30000);
  document.addEventListener('visibilitychange',check);
  window.addEventListener('focus',check);
}
