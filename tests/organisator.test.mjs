import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../organisator.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/refresh\(true\);\s*setInterval\([\s\S]*$/,'');
function setup(){
  const listeners={};
  const root={addEventListener:(name,fn)=>listeners[name]=fn,querySelector:()=>{throw new Error('Gebruik de teamregel, geen globale selector');}};
  const context={document:{getElementById:id=>id==='organizer'?root:id==='sync-status'?null:{addEventListener(){}}},location:{search:'?tab=nakijken&ronde=1',hash:''},localStorage:{getItem(){return null;},removeItem(){}},window:{addEventListener(){}},URLSearchParams,Map,Date,Intl,setTimeout,clearTimeout,formatPoints:c=>String(c/100),roundPodium:()=>'',trophy:rank=>`<svg data-cup="${rank}"></svg>`};
  vm.runInNewContext(source+`\nthis.harness={listeners:null,setState(value){state=value;},gradingView,teamScoresView,expandedTeamQuestions,setTeam(value){selectedTeam=value;tab='perteam';},roundCorrectTeams,teamsView,teamDrafts,bingoWinOrder,setTimingMode(value){bingoTimingMode=value;},questionStanding,questionCard,expandedQuestions,saveAnswer,answerDrafts,getAnswer,answerKey,setConfirmation(accepted){confirmAction=async()=>accepted;},setMutation(fn){mutation=fn;refresh=async()=>{};notice=()=>{};saveIndicator=()=>{};}};`,context);
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

test('Inklapstand toont juiste teams en onthoudt welke vraag openstaat',()=>{
  const app=setup();
  const state={rounds:[{id:'1',title:'Ronde',closed:false}],teams:[{id:'a',name:'Alpen',active:true},{id:'b',name:'Bergen',active:true}],questions:[{round_id:'1',id:'1',prompt:'Vraag',correct:'Model',alternatives:[],max_cents:100}],answers:[{team_id:'b',round_id:'1',question_id:'1',points_cents:100}]};
  app.setState(state);
  let html=app.gradingView();
  assert.match(html,/Goed beantwoord/);assert.match(html,/1\/2 nagekeken/);assert.match(html,/data-cup="1"/);
  assert.doesNotMatch(html,/data-question-fold="1\/1" open/);
  app.listeners.toggle({target:{dataset:{questionFold:'1/1'},open:true}});
  html=app.gradingView();assert.match(html,/data-question-fold="1\/1" open/);
  app.listeners.toggle({target:{dataset:{questionFold:'1/1'},open:false}});
  assert.equal(app.expandedQuestions.size,0);
});

test('Ingeklapt verschijnen alleen volledig goed gerekende teams, geen foute of gedeeltelijke antwoorden',()=>{
  const app=setup();
  const teams=['Alpen','Bergen','Fout','Deels','Onbeoordeeld'].map((name,index)=>({id:String(index),name,active:true}));
  app.setState({teams,answers:[{team_id:'0',round_id:'1',question_id:'1',points_cents:100},{team_id:'1',round_id:'1',question_id:'1',points_cents:100},{team_id:'2',round_id:'1',question_id:'1',points_cents:0},{team_id:'3',round_id:'1',question_id:'1',points_cents:50}]});
  const html=app.questionStanding({id:'1',max_cents:100},teams);
  assert.match(html,/Alpen/);assert.match(html,/Bergen/);
  assert.doesNotMatch(html,/Fout|Deels|Onbeoordeeld/);
  assert.equal((html.match(/data-cup=/g)||[]).length,1);
  assert.match(app.questionStanding({id:'1',max_cents:0},teams),/Nog geen teams goed gerekend/);
});

test('Ingevuld telt opgeslagen antwoordtekst los van de beoordeling, ook bij foute antwoorden',()=>{
  const app=setup();
  const teams=['Goed','Fout','Nog nakijken','Alleen punten','Leeg'].map((name,index)=>({id:String(index),name,active:true}));
  app.setState({teams,answers:[{team_id:'0',round_id:'1',question_id:'1',answer:'1973',points_cents:100},{team_id:'1',round_id:'1',question_id:'1',answer:'1980',points_cents:0},{team_id:'2',round_id:'1',question_id:'1',answer:'1973',points_cents:null},{team_id:'3',round_id:'1',question_id:'1',answer:'',points_cents:100},{team_id:'4',round_id:'1',question_id:'1',answer:'  ',points_cents:null}]});
  const html=app.questionCard({id:'1',prompt:'Vraag',correct:'1973',alternatives:[],max_cents:100},teams,false);
  assert.match(html,/3\/5 ingevuld · 3\/5 nagekeken/);
});

test('Teamnaam en leden hebben aparte velden en concepten blijven gescheiden',()=>{
  const app=setup();
  const form={dataset:{id:'a'},elements:{name:{value:'Berggeiten'},members:{value:'Anna\nBram'}}};
  const field={dataset:{},closest:selector=>selector==='.team-rename' || selector==='form'?form:null};
  app.listeners.input({target:field});
  assert.equal(app.teamDrafts.get('a').name,'Berggeiten');
  assert.equal(app.teamDrafts.get('a').members,'Anna\nBram');
  const html=app.teamsView();
  assert.match(html,/name="members"/);
  assert.match(html,/id="name-a" name="name" value="Berggeiten"/);
  assert.match(html,/Anna\nBram/);
  assert.doesNotMatch(html,/team=Berggeiten.*Anna/);
});

test('Verwijderen voert zonder bevestiging geen wijziging uit en gebruikt daarna de teamversie',async()=>{
  const app=setup();
  app.setState({teams:[{id:'a',name:'Alpen',version:7,active:true}],answers:[],questions:[],rounds:[]});
  let calls=0,sent;
  app.setMutation(async(path,body)=>{calls++;sent={path,body};return {ok:true};});
  const button={dataset:{action:'delete-team',id:'a'},disabled:false};
  const event={target:{closest:selector=>selector==='button'?button:null}};
  app.setConfirmation(false);
  await app.listeners.click(event);
  assert.equal(calls,0);
  app.setConfirmation(true);
  await app.listeners.click(event);
  assert.equal(calls,1);
  assert.equal(sent.path,'/teams/delete');
  assert.equal(sent.body.id,'a');assert.equal(sent.body.version,7);
});

function scoringFixture(){
  const app=setup();
  app.setState({rounds:[{id:'5',title:'Muziekbingo',closed:false}],teams:[],answers:[],questions:[1,2,3].map(id=>({round_id:'5',id:String(id),max_cents:0,version:1}))});
  const submit={disabled:false},total={textContent:''};
  const form={dataset:{round:'5'},elements:{uniform:{name:'uniform',value:'10',dataset:{},checkValidity:()=>true},existing_scores:{value:'keep'}},matches:selector=>selector==='.scoring-form',querySelector:selector=>selector==='[data-round-total]'?total:submit,querySelectorAll:()=>fields};
  const fields=[1,2,3].map(id=>({dataset:{scoringQuestion:String(id)},name:'question-'+id,value:'0',closest:()=>form}));
  form.elements.uniform.closest=()=>form;
  let saved;
  app.setMutation(async(path,body)=>{saved={path,body};return {changed:3};});
  return {app,form,fields,total,saved:()=>saved};
}

test('Eén puntenaantal invullen en opslaan werkt direct zonder aparte toepasknop',async()=>{
  const f=scoringFixture();
  f.app.listeners.input({target:f.form.elements.uniform});
  assert.deepEqual(f.fields.map(field=>field.value),['10','10','10']);
  assert.equal(f.total.textContent,'maximaal 30 punten');
  await f.app.listeners.submit({preventDefault(){},target:f.form});
  assert.equal(f.saved().path,'/settings/scoring');
  assert.deepEqual(Array.from(f.saved().body.questions,q=>q.max_points),[10,10,10]);
});

test('Afzonderlijke punten blijven behouden na een wijziging op één onderdeel',async()=>{
  const f=scoringFixture();f.app.listeners.input({target:f.form.elements.uniform});
  f.fields[0].value='5';f.app.listeners.input({target:f.fields[0]});
  assert.equal(f.form.elements.uniform.value,'');
  await f.app.listeners.submit({preventDefault(){},target:f.form});
  assert.deepEqual(Array.from(f.saved().body.questions,q=>q.max_points),[5,10,10]);
});

test('Bingo toont echte kaartvolgorde en gekoppelde teams, gescheiden van het voorstel',()=>{
  const app=setup();
  app.setState({teams:[{id:'a',name:'Alpen',active:true,bingo_card:2},{id:'b',name:'Bergen',active:true,bingo_card:1}],bingo:{completions:{K1:{first:null,second:40,full:null},K2:{first:54,second:47,full:null},K3:{first:55,second:43,full:null}},proposal:{completions:{K1:{first:58,second:43,full:58},K2:{first:20,second:47,full:59},K3:{first:60,second:40,full:60}}}}});
  let html=app.bingoWinOrder('1');
  assert.ok(html.indexOf('Kaart K2')<html.indexOf('Kaart K3'));
  assert.match(html,/Alpen/);assert.match(html,/Vanaf nummer 54/);assert.match(html,/Niet haalbaar/);
  assert.match(app.bingoWinOrder('2'),/geen afzonderlijke tweede winronde/);
  assert.match(app.bingoWinOrder('3'),/volle bingokaart niet haalbaar/);
  app.setTimingMode('proposal');html=app.bingoWinOrder('2');
  assert.match(html,/nog niet actief/);assert.match(html,/Vanaf nummer 40/);
  assert.ok(html.indexOf('Kaart K3')<html.indexOf('Kaart K1'));
  assert.doesNotMatch(html,/geen afzonderlijke tweede winronde/);
});

test('Rondecontrole toont juiste teams eenmaal, zonder ranglijst, punten of onjuiste teams',()=>{
  const app=setup();
  const teams=[{id:'a',name:'Alpen',active:true},{id:'b',name:'Bergen',active:true},{id:'c',name:'Fout',active:true},{id:'d',name:'Deels',active:true},{id:'e',name:'Uitgesloten',active:false}];
  const list=[{id:'1',max_cents:100},{id:'2',max_cents:200},{id:'3',max_cents:0}];
  app.setState({teams,answers:[{team_id:'a',round_id:'1',question_id:'1',points_cents:100},{team_id:'a',round_id:'1',question_id:'2',points_cents:200},{team_id:'b',round_id:'1',question_id:'2',points_cents:200},{team_id:'c',round_id:'1',question_id:'1',points_cents:0},{team_id:'d',round_id:'1',question_id:'2',points_cents:100},{team_id:'e',round_id:'1',question_id:'1',points_cents:100}]});
  const html=app.roundCorrectTeams(teams,list);
  assert.equal((html.match(/<li>Alpen<\/li>/g)||[]).length,1);
  assert.match(html,/<li>Bergen<\/li>/);
  assert.doesNotMatch(html,/Fout|Deels|Uitgesloten|Top 3|data-cup|pt|plek/);
});

test('Scores per team toont alleen het gekozen team en telt ronde, totaal en bonus afzonderlijk',()=>{
  const app=setup();app.setTeam('b');
  app.setState({rounds:[{id:'1',title:'Club',closed:false},{id:'bonus',title:'Bonus',closed:false}],teams:[{id:'a',name:'Alpen',active:true},{id:'b',name:'Bergen',active:true}],questions:[{round_id:'1',id:'1',prompt:'Vraag',correct:'Model',alternatives:[],max_cents:100},{round_id:'1',id:'2',prompt:'Tweede',correct:'Model',alternatives:[],max_cents:100}],answers:[{team_id:'b',round_id:'1',question_id:'1',points_cents:100},{team_id:'b',round_id:'1',question_id:'2',points_cents:0},{team_id:'b',round_id:'bonus',question_id:'1',points_cents:200},{team_id:'a',round_id:'1',question_id:'1',points_cents:100}]});
  const html=app.teamScoresView();
  assert.match(html,/id="grading-team"/);assert.match(html,/value="b" selected/);assert.doesNotMatch(html,/team-round-scores/);
  assert.match(html,/data-team="b"/);assert.doesNotMatch(html,/data-team="a"/);
  assert.match(html,/<strong>1<\/strong><span>punten in deze ronde/);
  assert.match(html,/<strong>3<\/strong><span>totaal inclusief bonus/);
  assert.equal((html.match(/answer-correct/g)||[]).length,1);
  assert.equal((html.match(/class="team-answer-row team-score-entry/g)||[]).length,2);
});


test('Een teamvraag klapt open met de volledige vraag en het modelantwoord',()=>{
  const app=setup();app.setTeam('b');
  let html=app.teamScoresView();
  assert.match(html,/aria-expanded="false"/);assert.match(html,/id="team-question-b-1" hidden/);
  app.expandedTeamQuestions.add('b/1/1');html=app.teamScoresView();
  assert.match(html,/aria-expanded="true"/);assert.match(html,/id="team-question-b-1" >/);
  assert.match(html,/<p>Vraag een<\/p>/);assert.match(html,/<p>Model<\/p>/);
});
