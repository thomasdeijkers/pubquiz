import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from '../vendor/pdf-lib.mjs';
import {createMasterQuestionsPdf,masterCardPaths} from '../master-questions-pdf.mjs';
const quiz={rounds:[{id:1,cards:[{src:'assets/clublogo-heynkensort-blauw-print.png',label:'Vraagkaart'}]}],bonus:{image:'assets/bonus.png'}};
const state={rounds:[{id:'1',title:'Ronde een'},{id:'bonus',title:'Bonus'}],questions:[{round_id:'1',id:'1',prompt:'Hoeveel?',correct:'28',alternatives:[],max_cents:100},{round_id:'bonus',id:'1',prompt:'Wie?',correct:'',alternatives:[],max_cents:200}]};
test('Masterprint bevat iedere ronde inclusief bonus en optioneel de originele vraagkaarten',async()=>{
  const plain=await PDFDocument.load(await createMasterQuestionsPdf(state,quiz,{}, {cards:false}));
  assert.equal(plain.getPageCount(),2);assert.equal(plain.getTitle(),'Pubquizmaster - alle vragen');
  const image=await readFile(new URL('../assets/clublogo-heynkensort-blauw-print.png',import.meta.url));
  const withCards=await PDFDocument.load(await createMasterQuestionsPdf(state,quiz,{'assets/clublogo-heynkensort-blauw-print.png':image}));
  assert.equal(withCards.getPageCount(),3);
  assert.deepEqual(masterCardPaths(quiz),['assets/clublogo-heynkensort-blauw-print.png','assets/bonus.png']);
});
test('Lange vragen en antwoorden lopen door op extra A4-pagina’s',async()=>{
  const large={rounds:[state.rounds[0]],questions:Array.from({length:20},(_,i)=>({...state.questions[0],id:String(i+1),prompt:'Een lange vraag '.repeat(10),correct:'Een lang antwoord '.repeat(10)}))};
  const full=await PDFDocument.load(await createMasterQuestionsPdf(large,quiz,{}, {cards:false}));
  const questionsOnly=await PDFDocument.load(await createMasterQuestionsPdf(large,quiz,{}, {cards:false,answers:false}));
  assert.ok(full.getPageCount()>questionsOnly.getPageCount());
  for(const page of full.getPages()){assert.ok(Math.abs(page.getWidth()-595.28)<.01);assert.ok(Math.abs(page.getHeight()-841.89)<.01);}
});
