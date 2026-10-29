import {PDFDocument,StandardFonts,rgb} from './vendor/pdf-lib.mjs';

export function masterCardPaths(quiz){
  return [...new Set([...quiz.rounds.flatMap(round=>round.cards.map(card=>card.src).filter(src=>src.endsWith('.png'))),quiz.bonus.image])];
}
export async function createMasterQuestionsPdf(state,quiz,images={},options={}){
  const answers=options.answers!==false,cards=options.cards!==false;
  const doc=await PDFDocument.create();doc.setTitle('Pubquizmaster - alle vragen');doc.setAuthor('T.V. Heynkensort');
  const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const W=595.28,H=841.89,M=42,width=W-2*M,navy=rgb(.07,.19,.32),gray=rgb(.35,.4,.45);
  const clean=value=>String(value??'').replace(/[\x00-\x08\x0b-\x1f]/g,'').split('').map(c=>{
    if(c==='\n')return c;
    try{font.encodeText(c);return c;}catch{return c.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?');}
  }).join('');
  function lines(text,size=10,face=font){
    const output=[];
    for(const paragraph of clean(text).split('\n')){
      let line='';
      for(const word of paragraph.split(/\s+/)){
        const next=line?line+' '+word:word;
        if(face.widthOfTextAtSize(next,size)<=width){line=next;continue;}
        if(line)output.push(line);line='';
        for(const char of word){if(face.widthOfTextAtSize(line+char,size)>width){output.push(line);line='';}line+=char;}
      }
      output.push(line);
    }
    return output;
  }
  let page,y,label;
  function newPage(){
    page=doc.addPage([W,H]);y=H-94;
    page.drawText('PUBQUIZMASTER - T.V. HEYNKENSORT',{x:M,y:H-35,size:8,font:bold,color:gray});
    page.drawText(clean(label),{x:M,y:H-62,size:17,font:bold,color:navy});
    page.drawLine({start:{x:M,y:H-75},end:{x:W-M,y:H-75},thickness:1,color:navy});
  }
  function text(value,{size=10,face=font,color=navy}={}){
    for(const line of lines(value,size,face)){
      if(y<65)newPage();
      page.drawText(line,{x:M,y,size,font:face,color});y-=size+4;
    }
  }
  for(const round of state.rounds){
    label=round.id==='bonus'?'Bonusronde':`Ronde ${round.id} - ${round.title}`;newPage();
    if(round.id==='3'){
      text('Beoordeling: 1 punt voor de titel + 1 punt voor de artiest. Herkenbare spelling is goed; een ontbrekende gastartiest kost geen punt.',{size:9});y-=7;
      if(state.questions.some(q=>q.round_id===round.id && !q.correct.trim())){text('LET OP: de definitieve muziekfragmenten en modelantwoorden ontbreken nog.',{size:10,face:bold,color:rgb(.65,.18,.1)});y-=8;}
    }
    if(round.id==='7'){text('Beerpong: 1 punt per beker waarin een balletje komt, maximaal 9 punten.',{size:9});y-=7;}
    if(round.id==='5'){
      const plan=state.bingo?.verified || state.bingo?.proposal;
      if(plan){text('Winplanning: K2 diagonaal linksboven-rechtsonder na 20; K3 diagonaal rechtsboven-linksonder na 40; K1 volle kaart na 58. Zonder shuffle, blijf afstrepen.',{size:9});y-=7;}
    }
    const questions=state.questions.filter(q=>q.round_id===round.id).sort((a,b)=>Number(a.id)-Number(b.id));
    for(const q of questions){
      const question=`${q.id}. ${q.prompt}`;
      const answer=`Antwoord: ${q.correct.trim() || 'Nog niet aangeleverd'}`;
      const alt=q.alternatives?.length?`Ook goed: ${q.alternatives.join(' / ')}`:'';
      const height=lines(question,11,bold).length*15+(answers?lines(answer,10).length*14+(alt?lines(alt,9).length*13:0):0)+28;
      if(y-height<65 && height<650)newPage();
      text(question,{size:11,face:bold});
      if(answers){text(answer,{size:10});if(alt)text(alt,{size:9,color:gray});}
      text(`Maximaal ${q.max_cents/100} ${q.max_cents===100?'punt':'punten'}`,{size:8,color:gray});y-=12;
    }
    if(cards){
      const source=round.id==='bonus'?[{src:quiz.bonus.image,label:'30 beeldvragen'}]:(quiz.rounds.find(r=>String(r.id)===String(round.id))?.cards || []);
      for(const card of source){
        if(!images[card.src])continue;
        label=(round.id==='bonus'?'Bonusronde':`Ronde ${round.id}`)+' - '+card.label;newPage();
        const image=await doc.embedPng(images[card.src]),scale=Math.min(width/image.width,(H-152)/image.height);
        const iw=image.width*scale,ih=image.height*scale;
        page.drawImage(image,{x:(W-iw)/2,y:y-ih,width:iw,height:ih});
      }
    }
  }
  const pages=doc.getPages();
  pages.forEach((p,index)=>{
    p.drawLine({start:{x:M,y:43},end:{x:W-M,y:43},thickness:.4,color:rgb(.8,.83,.86)});
    p.drawText('Organisatie-exemplaar - actuele beoordeling staat op het rondeblad',{x:M,y:29,size:8,font,color:gray});
    const count=`${index+1} / ${pages.length}`;p.drawText(count,{x:W-M-font.widthOfTextAtSize(count,8),y:29,size:8,font,color:gray});
  });
  return doc.save();
}
