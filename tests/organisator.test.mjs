import test from 'node:test';
import {roundPodium} from '../scoreboard.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../organisator.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/refresh\(true\);\s*setInterval\([\s\S]*$/,'');
function setup(search='?tab=nakijken&ronde=1'){
  const listeners={};
  const root={addEventListener:(name,fn)=>listeners[name]=fn,querySelector:()=>{throw new Error('Gebruik de teamregel, geen globale selector');}};
  const context={document:{getElementById:id=>id==='organizer'?root:id==='sync-status'?null:{addEventListener(){}}},location:{search,hash:''},localStorage:{getItem(){return null;},removeItem(){}},window:{addEventListener(){}},URLSearchParams,Map,Date,Intl,setTimeout,clearTimeout,formatPoints:c=>String(c/100),roundPodium,trophy:rank=>`<svg data-cup="${rank}"></svg>`};
  vm.runInNewContext(source+`\nthis.harness={listeners:null,setState(value){state=value;},gradingView,teamScoresView,expandedTeamQuestions,setRound(value){selectedRound=value;},gradeButtons,setTeam(value){selectedTeam=value;tab='perteam';},teamsView,teamDrafts,bingoWinOrder,bingoView,setTimingMode(value){bingoTimingMode=value;},questionStanding,questionCard,expandedQuestions,saveAnswer,answerDrafts,getAnswer,answerKey,setConfirmation(accepted){confirmAction=async()=>accepted;},setMutation(fn){mutation=fn;refresh=async()=>{};notice=()=>{};saveIndicator=()=>{};}};`,context);
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
test('Iedere vraag toont volledige teamnamen en alleen Goed/Fout-knoppen',()=>{
  const app=setup(),html=app.gradingView();
  assert.match(html,/data-team="a"/);assert.match(html,/data-team="b"/);
  assert.match(html,/Alpen/);assert.match(html,/Bergen/);assert.doesNotMatch(html,/<textarea|data-action="save-answer"|team-extra-points/);
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

test('Alleen nagekeken telt; foute antwoorden en beoordelingen zonder tekst tellen ook mee',()=>{
  const app=setup();
  const teams=['Goed','Fout','Nog nakijken','Alleen punten','Leeg'].map((name,index)=>({id:String(index),name,active:true}));
  app.setState({teams,answers:[{team_id:'0',round_id:'1',question_id:'1',answer:'1973',points_cents:100},{team_id:'1',round_id:'1',question_id:'1',answer:'1980',points_cents:0},{team_id:'2',round_id:'1',question_id:'1',answer:'1973',points_cents:null},{team_id:'3',round_id:'1',question_id:'1',answer:'',points_cents:100},{team_id:'4',round_id:'1',question_id:'1',answer:'  ',points_cents:null}]});
  const html=app.questionCard({id:'1',prompt:'Vraag',correct:'1973',alternatives:[],max_cents:100},teams,false);
  assert.match(html,/3\/5 nagekeken/);assert.doesNotMatch(html,/3\/5 ingevuld|Volledig nagekeken/);
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

test('Bingo bewaart de oorspronkelijke kaartvolgorde als vergelijking',()=>{
  const app=setup();
  app.setState({teams:[{id:'a',name:'Alpen',active:true,bingo_card:2},{id:'b',name:'Bergen',active:true,bingo_card:1}],bingo:{completions:{K1:{first:null,second:40,full:null},K2:{first:54,second:47,full:null},K3:{first:55,second:43,full:null}},proposal:{completions:{K1:{first:58,second:43,full:58},K2:{first:20,second:47,full:59},K3:{first:60,second:40,full:60}}}}});
  app.setTimingMode('current');
  let html=app.bingoWinOrder('1');
  assert.ok(html.indexOf('Kaart K2')<html.indexOf('Kaart K3'));
  assert.match(html,/Alpen/);assert.match(html,/Vanaf nummer 54/);assert.match(html,/Niet haalbaar/);
  assert.match(app.bingoWinOrder('2'),/geen afzonderlijke tweede winronde/);
  assert.match(app.bingoWinOrder('3'),/volle bingokaart niet haalbaar/);
  app.setTimingMode('proposal');html=app.bingoWinOrder('2');
  assert.match(html,/gecontroleerde afspeelvolgorde/);assert.match(html,/Vanaf nummer 40/);
  assert.ok(html.indexOf('Kaart K3')<html.indexOf('Kaart K1'));
  assert.doesNotMatch(html,/geen afzonderlijke tweede winronde/);
});

test('Rondecontrole toont het podium op rondepunten met goud, zilver en brons',()=>{
  const app=setup();
  const teams=['Alpen','Bergen','Sneeuw','Uitgesloten'].map((name,i)=>({id:String(i),name,active:i!==3}));
  app.setState({rounds:[{id:'1',title:'Club',sort_order:0,closed:false}],teams,questions:[{round_id:'1',id:'1',prompt:'Vraag',correct:'Model',alternatives:[],max_cents:300}],answers:teams.map((t,i)=>({team_id:t.id,round_id:'1',question_id:'1',points_cents:(4-i)*100}))});
  const html=app.gradingView();
  assert.match(html,/Top 3 · deze ronde/);assert.doesNotMatch(html,/Teams met juiste antwoorden/);
  for(const kleur of ['gouden','zilveren','bronzen'])assert.match(html,new RegExp(kleur+' beker'));
  const panel=html.split('round-podium-panel')[1].split('grading-summary')[0];
  assert.match(panel,/Alpen/);assert.match(panel,/Bergen/);assert.match(panel,/Sneeuw/);assert.doesNotMatch(panel,/Uitgesloten/);
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

test('Goed of Fout zonder invoerveld behoudt het eerder opgeslagen antwoord',async()=>{
  const app=setup();app.setState({rounds:[{id:'1'}],teams:[],questions:[],answers:[{team_id:'b',round_id:'1',question_id:'1',answer:'Bestaand antwoord',points_cents:0,version:4}]});
  let sent;app.setMutation(async(path,body)=>{sent=body;return {...body,points_cents:100,version:5};});
  const button={disabled:false,closest:()=>({querySelector:()=>null})};
  await app.saveAnswer('1',1,button,'b');
  assert.equal(sent.answer,'Bestaand antwoord');assert.equal(sent.points,1);assert.equal(sent.version,4);
});

test('Een vraag krijgt pas een groen vinkje als alle teams zijn nagekeken',()=>{
  const app=setup(),teams=[{id:'a',name:'A',active:true},{id:'b',name:'B',active:true}],q={id:'1',prompt:'Vraag',correct:'Model',alternatives:[],max_cents:100};
  app.setState({teams,answers:[{team_id:'a',round_id:'1',question_id:'1',points_cents:0},{team_id:'b',round_id:'1',question_id:'1',points_cents:100}]});
  const html=app.questionCard(q,teams,false);
  assert.match(html,/question-review-complete/);assert.match(html,/aria-label="Volledig nagekeken">✓/);assert.match(html,/2\/2 nagekeken/);
  app.setState({teams:[],answers:[]});assert.doesNotMatch(app.questionCard(q,[],false),/Volledig nagekeken/);
});

test('Een directe vraaglink klapt precies de gevraagde vraag in de geselecteerde ronde open',()=>{
  const app=setup('?tab=teams&ronde=1&vraag=1');
  assert.equal(app.expandedQuestions.has('1/1'),true);
  assert.match(app.gradingView(),/data-question-fold="1\/1" open/);
});

test('DJ-scherm toont de gecontroleerde volgorde, kaartvermeldingen, winmomenten en de juiste Happy-link',()=>{
  const app=setup();
  const tracks=Array.from({length:60},(_,index)=>({position:index+1,spotify_position:60-index,title:index===14?'Happy - From Despicable Me 2':`Nummer ${index+1}`,artists:'Artiest',cards:['K1','K3'],url:index===14?'https://open.spotify.com/track/happy-original':`https://open.spotify.com/track/${index+1}`}));
  app.setState({bingo:{playlist_url:'https://open.spotify.com/playlist/test',verified:{checked_date:'29 oktober 2026',tracks,completions:{K1:{first:58,second:43,full:58},K2:{first:20,second:47,full:59},K3:{first:60,second:40,full:60}}}},teams:[]});
  const html=app.bingoView();
  assert.equal((html.match(/id="bingo-track-/g)||[]).length,60);
  assert.equal((html.match(/class="bingo-win-track"/g)||[]).length,3);
  assert.match(html,/K2 · na nummer 20/);assert.match(html,/K3 · na nummer 40/);assert.match(html,/K1 · na nummer 58/);
  assert.match(html,/href="https:\/\/open.spotify.com\/track\/happy-original"/);
  assert.match(html,/niet automatisch aangepast/);assert.match(html,/huidige ensembleversie/);
  assert.match(html,/<span>K1<\/span><span>K3<\/span>/);
  assert.doesNotMatch(html,/nieuwe DJ-kaart is leidend|nummering is leidend/);
  const timing=app.bingoWinOrder('1');assert.match(timing,/Vanaf nummer 20/);assert.doesNotMatch(timing,/Niet haalbaar/);
});

test('Muziek biedt 0, 1 en 2 punten en beerpong biedt 0, 2, 4 en 6; deelscores blijven zichtbaar',()=>{
  const app=setup(),team={id:'a',name:'Alpen'};
  app.setRound('3');
  let html=app.gradeButtons({id:'1',max_cents:200},team,100,false);
  assert.deepEqual([...html.matchAll(/data-value="(\d+)"/g)].map(m=>Number(m[1])),[0,1,2]);
  assert.match(html,/partial chosen/);assert.match(html,/Alleen titel of artiest goed/);assert.match(html,/aria-pressed="true"/);
  app.setRound('7');html=app.gradeButtons({id:'2',max_cents:600},team,400,true);
  assert.deepEqual([...html.matchAll(/data-value="(\d+)"/g)].map(m=>Number(m[1])),[0,2,4,6]);
  assert.match(html,/2 geraakte bekers/);assert.equal((html.match(/ disabled/g)||[]).length,4);
  html=app.gradeButtons({id:'1',max_cents:1000},team,0,false);
  assert.match(html,/Goed · 10/);assert.doesNotMatch(html,/partial-score-buttons/);
});
test('Een muziekdeelbeoordeling en beerpongdeelscore worden voor het juiste team opgeslagen',async()=>{
  const app=setup(),r=row('a','');let sent;
  app.setMutation(async(path,body)=>{sent=body;return {...body,points_cents:body.points*100,version:1};});
  app.setRound('3');await app.saveAnswer('1',1,r.button,'a');
  assert.equal(sent.round_id,'3');assert.equal(sent.team_id,'a');assert.equal(sent.points,1);assert.equal(app.getAnswer('1','a').points_cents,100);
  app.setRound('7');await app.saveAnswer('2',4,r.button,'a');
  assert.equal(sent.round_id,'7');assert.equal(sent.points,4);assert.equal(app.getAnswer('2','a').points_cents,400);
});
