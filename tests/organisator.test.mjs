import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../organisator.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/refresh\(true\);\s*setInterval\([\s\S]*$/,'');
function setup(){
  const listeners={};
  const root={addEventListener:(name,fn)=>listeners[name]=fn,querySelector:()=>{throw new Error('Gebruik de teamregel, geen globale selector');}};
  const context={document:{getElementById:id=>id==='organizer'?root:id==='sync-status'?null:{addEventListener(){}}},location:{search:'?tab=nakijken&ronde=1',hash:''},localStorage:{getItem(){return null;},removeItem(){}},window:{addEventListener(){}},URLSearchParams,Map,Date,Intl,setTimeout,clearTimeout,formatPoints:c=>String(c/100),roundPodium:()=>''};
  vm.runInNewContext(source+`\nthis.harness={listeners:null,setState(value){state=value;},gradingView,saveAnswer,answerDrafts,getAnswer,answerKey,setMutation(fn){mutation=fn;refresh=async()=>{};notice=()=>{};saveIndicator=()=>{};}};`,context);
  const harness=context.harness;
  harness.setState({rounds:[{id:'1',title:'Ronde',closed:false}],teams:[{id:'a',name:'Alpen',active:true},{id:'b',name:'Bergen',active:true}],questions:[{round_id:'1',id:'1',prompt:'Vraag een',correct:'Model',alternatives:[],max_cents:100}],answers:[]});
  return {...harness,listeners};
}
function row(team,answer){
  const points={value:'',checkValidity:()=>true};
  const area={value:answer,dataset:{answer:'1'},closest:selector=>selector==='.team-answer-row'?container:null};
  const container={dataset:{team},querySelector:selector=>selector.startsWith('[data-answer')?area:points};
  return {area,points,container,button:{disabled:false,closest:()=>container}};
}
test('Iedere vraag bevat een eigen antwoordveld en Goed/Fout-knoppen voor alle actieve teams',()=>{
  const app=setup(),html=app.gradingView();
  assert.match(html,/data-team="a"/);assert.match(html,/data-team="b"/);
  assert.match(html,/id="answer-1-a"/);assert.match(html,/id="answer-1-b"/);
  assert.match(html,/Goed Alpen vraag 1/);assert.match(html,/Fout Bergen vraag 1/);
  assert.doesNotMatch(html,/id="grading-team"/);
});
test('Opslaan gebruikt het team van de gekozen regel en behoudt de concepten van andere teams',async()=>{
  const app=setup(),a=row('a','Antwoord A'),b=row('b','Antwoord B');
  app.listeners.input({target:a.area});app.listeners.input({target:b.area});
  let sent;
  app.setMutation(async(path,body)=>{sent=body;return {...body,points_cents:100,version:1};});
  await app.saveAnswer('1',1,b.button,'b');
  assert.equal(sent.team_id,'b');assert.equal(sent.answer,'Antwoord B');assert.equal(sent.points,1);
  assert.equal(app.answerDrafts.get('a/1/1').answer,'Antwoord A');
  assert.equal(app.answerDrafts.has('b/1/1'),false);
  assert.equal(app.getAnswer('1','b').points_cents,100);
  assert.equal(app.getAnswer('1','a'),undefined);
});
