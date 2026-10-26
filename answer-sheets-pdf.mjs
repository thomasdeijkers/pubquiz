import {PDFDocument,StandardFonts,rgb} from './vendor/pdf-lib.mjs';
import fontkit from './vendor/fontkit.mjs';
import {createTableCardPdf} from './table-card-pdf.mjs';
import {sheetCheers} from './answer-sheets.mjs';

const mm=72/25.4;
export async function createAnswerSheetsPdf(quiz,teamName,assets){
  const name=String(teamName ?? '').replace(/[\x00-\x1f]/g,' ').trim().slice(0,80)||'____________________________';
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  doc.setTitle(`Pubquiz invulbladen - ${name}`);doc.setAuthor('T.V. Heynkensort');
  const [logo,titleFont,textFont,italic,bingo]=await Promise.all([doc.embedPng(assets[1]),doc.embedFont(assets[2],{subset:true}),doc.embedFont(StandardFonts.Helvetica),doc.embedFont(StandardFonts.HelveticaOblique),doc.embedPng(assets[3])]);
  const W=210*mm,H=297*mm,M=14*mm,navy=rgb(.07,.18,.3),gray=rgb(.49,.49,.49),line=rgb(.65,.7,.74);
  const rounds=[...quiz.rounds,{id:'bonus',title:'Bonusronde',answerCount:quiz.bonus.answerCount}];
  function footer(page,cheer,index){
    page.drawLine({start:{x:M,y:42},end:{x:W-M,y:42},color:rgb(.82,.82,.82),thickness:.4});
    if(index<=10)page.drawText('Punten: __________________',{x:M,y:51,size:9,font:textFont,color:navy});
    const count=`Blad ${index} / 11`;
    page.drawText(count,{x:W-M-textFont.widthOfTextAtSize(count,8),y:51,size:8,font:textFont,color:gray});
    page.drawText(cheer,{x:(W-italic.widthOfTextAtSize(cheer,8))/2,y:23,size:8,font:italic,color:gray});
  }
  for(const [index,round] of rounds.entries()){
    const page=doc.addPage([W,H]),title=round.id==='bonus'?'Bonusronde':`Ronde ${round.id} - ${round.title}`;
    page.drawImage(logo,{x:M,y:H-68,width:43,height:43});
    page.drawText('APRÈS-SKI PUBQUIZ - T.V. HEYNKENSORT',{x:M+55,y:H-35,font:textFont,size:8,color:navy});
    let titleSize=22;
    while(titleFont.widthOfTextAtSize(title,titleSize)>W-M*2-70 && titleSize>14)titleSize--;
    page.drawText(title,{x:M+55,y:H-62,font:titleFont,size:titleSize,color:navy});
    page.drawLine({start:{x:M,y:H-80},end:{x:W-M,y:H-80},color:navy,thickness:1.2});
    page.drawText('Teamnaam',{x:M,y:H-105,font:textFont,size:9,color:navy});
    let nameSize=17;while(titleFont.widthOfTextAtSize(name,nameSize)>W-M*2-65 && nameSize>8)nameSize--;
    page.drawText(name,{x:M+65,y:H-107,font:titleFont,size:nameSize,color:navy});
    page.drawLine({start:{x:M,y:H-119},end:{x:W-M,y:H-119},color:line,thickness:.5});
    const music=round.id===3,activity=round.id===7;
    const note=music?'1-5: clips zonder geluid | 6-9: achterstevoren | 10: voorgelezen songtekst.':round.id===5?'Streep de herkende nummers af. Bewaar deze kaart voor alle bingo\'s.':activity?'Laat de organisatie het resultaat van de activiteiten invullen.':'Vul het antwoord bij het juiste vraagnummer in.';
    page.drawText(note,{x:M,y:H-138,font:textFont,size:9,color:navy});
    const top=H-154;
    if(round.id===5){
      const scale=Math.min((W-M*2)/bingo.width,(top-72)/bingo.height);
      const width=bingo.width*scale,height=bingo.height*scale;
      page.drawImage(bingo,{x:(W-width)/2,y:top-height,width,height});
    }else{
      const count=activity?2:round.answerCount,cols=count>18?2:1,rows=Math.ceil(count/cols),gap=23,colWidth=(W-M*2-gap*(cols-1))/cols;
      const rowHeight=activity?90:Math.min(music?45:36,(top-76)/rows);
      for(let i=0;i<count;i++){
        const col=Math.floor(i/rows),row=i%rows,x=M+col*(colWidth+gap),y=top-row*rowHeight;
        page.drawText(activity?['Hoogste toren','Beerpong'][i]:String(i+1),{x,y:y-14,font:textFont,size:activity?11:10,color:navy});
        if(music){
          page.drawText('Titel:',{x:x+25,y:y-14,font:textFont,size:9,color:gray});
          page.drawText('Artiest:',{x:x+colWidth/2+8,y:y-14,font:textFont,size:9,color:gray});
        }
        if(activity)page.drawText('Resultaat / punten:',{x:x+125,y:y-14,font:textFont,size:9,color:gray});
        page.drawLine({start:{x,y:y-rowHeight+3},end:{x:x+colWidth,y:y-rowHeight+3},color:line,thickness:.45});
      }
    }
    footer(page,sheetCheers[round.id],index+1);
  }
  const tentBytes=await createTableCardPdf(teamName,assets);
  const [tent]=await doc.embedPdf(tentBytes),last=doc.addPage([W,H]);
  last.drawText('Tafelkaart - knip langs de buitenrand en vouw op de stippellijn.',{x:M,y:H-35,size:10,font:textFont,color:navy});
  const x=(W-tent.width)/2,y=(H-tent.height)/2;
  last.drawPage(tent,{x,y,width:tent.width,height:tent.height});
  last.drawRectangle({x,y,width:tent.width,height:tent.height,borderColor:line,borderWidth:.5});
  footer(last,sheetCheers.tafelkaart,11);
  return doc.save();
}
