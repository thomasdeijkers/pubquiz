import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../updates.mjs',import.meta.url),'utf8').replace('export function','function').replace('import.meta.url',"'https://example.test/updates.mjs'");
function setup(){
  let check,dirty=false,latest='bbbbbbbbbbbb',reloaded='',before=0;
  const document={hidden:false,activeElement:{tagName:'BODY'},querySelector:selector=>selector.startsWith('meta')?{content:'aaaaaaaaaaaa'}:null,addEventListener(){}};
  const location={href:'https://example.test/organisator.html?ronde=4&team=alpen',replace:url=>{reloaded=url;}};
  const context={document,location,window:{addEventListener(){}},URL,setInterval:fn=>{check=fn;},fetch:async()=>({ok:true,json:async()=>({version:latest})})};
  vm.runInNewContext(source+'\nthis.watch=watchForUpdates;',context);
  context.watch({canReload:()=>!dirty,beforeReload:()=>{before++;}});
  return {document,check:()=>check(),setDirty:v=>{dirty=v;},setLatest:v=>{latest=v;},result:()=>({reloaded,before})};
}
test('Nieuwe publicatie haalt verse HTML op en behoudt team en ronde',async()=>{
  const app=setup();await app.check();const result=app.result();
  assert.equal(result.before,1);
  const url=new URL(result.reloaded);
  assert.equal(url.searchParams.get('versie'),'bbbbbbbbbbbb');
  assert.equal(url.searchParams.get('ronde'),'4');assert.equal(url.searchParams.get('team'),'alpen');
});
test('Geen herladen bij onopgeslagen werk, invoerfocus of dezelfde versie',async()=>{
  const app=setup();app.setDirty(true);await app.check();assert.equal(app.result().reloaded,'');
  app.setDirty(false);app.document.activeElement.tagName='INPUT';await app.check();assert.equal(app.result().reloaded,'');
  app.document.activeElement.tagName='BODY';app.setLatest('aaaaaaaaaaaa');await app.check();assert.equal(app.result().reloaded,'');
});
