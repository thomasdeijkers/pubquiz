import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from '../vendor/pdf-lib.mjs';
import {createMasterQuestionsPdf,masterCardPaths,createQuestionCardsPdf,cardOnA5} from '../master-questions-pdf.mjs';
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

test('Kaartenprint bevat uitsluitend twee afbeeldingen per A4; een oneven laatste kaart blijft compleet',async()=>{
  const quiz={rounds:[{id:1,cards:[{src:'a.png'},{src:'b.png'}]}],bonus:{image:'c.png'}};
  const image=await readFile(new URL('../assets/clublogo-heynkensort-blauw-print.png',import.meta.url));
  const pdf=await PDFDocument.load(await createQuestionCardsPdf(quiz,{'a.png':image,'b.png':image,'c.png':image}));
  assert.equal(pdf.getPageCount(),2);assert.equal(pdf.getTitle(),'Pubquiz vraagkaarten - 2 op A4');
  for(const page of pdf.getPages()){assert.ok(Math.abs(page.getWidth()-595.28)<.01);assert.ok(Math.abs(page.getHeight()-841.89)<.01);}
});
test('Liggende en staande kaarten blijven volledig binnen hun eigen A5-vlak zonder vervorming',()=>{
  for(const [w,h] of [[1491,1054],[1054,1492]])for(const slot of [0,1]){
    const p=cardOnA5(w,h,slot),b=p.bounds;
    assert.ok(b.left>=14 && b.left+b.width<=595.28-14);
    assert.ok(b.bottom>=(slot===0?841.89/2:0)+14);
    assert.ok(b.bottom+b.height<=(slot===0?841.89:841.89/2)-14);
    assert.ok(Math.abs(p.width/p.height-w/h)<.0001);
    assert.equal(p.rotation,h>w?90:0);
  }
});
