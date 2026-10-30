import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from '../vendor/pdf-lib.mjs';
import {createTableCardPdf,createAllTableCardsPdf,tableCardAssets} from '../table-card-pdf.mjs';

const assets=await Promise.all(tableCardAssets.map(path=>readFile(new URL('../'+path,import.meta.url))));
test('Tafelkaart is één echte A5-pdf met ingebedde opmaak en de gekozen teamnaam',async()=>{
  for(const name of ['B&B (Claudine Berends)','Après-ski helden '.repeat(5),' ']){
    const bytes=await createTableCardPdf(name,assets);
    const pdf=await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(),1);
    const page=pdf.getPages()[0];
    assert.ok(Math.abs(page.getWidth()*25.4/72-148)<0.01);
    assert.ok(Math.abs(page.getHeight()*25.4/72-210)<0.01);
    assert.equal(pdf.getTitle(),'Après-ski tafelkaart - '+(name.trim().slice(0,80)||'Jullie teamnaam'));
    assert.equal(pdf.getAuthor(),'T.V. Heynkensort');
  }
});

test('Alle tafelkaarten printen geeft één A5-pagina per actief team in de bestaande volgorde',async()=>{
  const bytes=await createAllTableCardsPdf([{name:'Berggeiten',active:true},{name:'Uitgesloten',active:false},{name:'Sneeuwhelden',active:true}],assets);
  const doc=await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(),2);assert.equal(doc.getTitle(),'Alle tafelkaarten - Pubquiz');
  for(const page of doc.getPages()){assert.ok(Math.abs(page.getWidth()*25.4/72-148)<.01);assert.ok(Math.abs(page.getHeight()*25.4/72-210)<.01);}
  await assert.rejects(()=>createAllTableCardsPdf([{name:'Uit',active:false}],assets),/geen actieve teams/);
});
