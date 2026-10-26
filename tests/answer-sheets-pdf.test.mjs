import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from '../vendor/pdf-lib.mjs';
import {createAnswerSheetsPdf} from '../answer-sheets-pdf.mjs';
import {tableCardAssets} from '../table-card-pdf.mjs';

test('Complete invulbladenset bevat elf A4-pagina’s inclusief de tafelkaart',async()=>{
  const quiz=JSON.parse(await readFile(new URL('../data/quiz.json',import.meta.url),'utf8'));
  const assets=await Promise.all([...tableCardAssets,'assets/bingo-kaart-1.png'].map(path=>readFile(new URL('../'+path,import.meta.url))));
  const bytes=await createAnswerSheetsPdf(quiz,'B&B (Claudine Berends)',assets);
  const pdf=await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),11);
  assert.equal(pdf.getTitle(),'Pubquiz invulbladen - B&B (Claudine Berends)');
  for(const page of pdf.getPages()){
    assert.ok(Math.abs(page.getWidth()*25.4/72-210)<0.01);
    assert.ok(Math.abs(page.getHeight()*25.4/72-297)<0.01);
  }
});
