import {PDFDocument,StandardFonts,rgb,pushGraphicsState,popGraphicsState,concatTransformationMatrix,rectangle,clip,endPath} from './vendor/pdf-lib.mjs';
import fontkit from './vendor/fontkit.mjs';

const mm=72/25.4;
export const tableCardAssets=['assets/apres-ski-sfeer-print.jpg','assets/clublogo-heynkensort-blauw-print.png','assets/Anton-Regular.ttf'];

function wrapped(text,font,size,width){
  const words=text.trim().split(/\s+/),lines=[];
  let line='';
  for(const word of words){
    const candidate=line?line+' '+word:word;
    if(font.widthOfTextAtSize(candidate,size)<=width){line=candidate;continue;}
    if(line)lines.push(line);
    line='';
    for(const char of word){
      if(line && font.widthOfTextAtSize(line+char,size)>width){lines.push(line);line='';}
      line+=char;
    }
  }
  if(line)lines.push(line);
  return lines;
}

export async function createTableCardPdf(teamName,assets){
  const name=String(teamName ?? '').replace(/[\x00-\x1f]/g,' ').trim().slice(0,80) || 'Jullie teamnaam';
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  doc.setTitle(`Après-ski tafelkaart - ${name}`);doc.setAuthor('T.V. Heynkensort');
  const [background,logo,font,small]=await Promise.all([doc.embedJpg(assets[0]),doc.embedPng(assets[1]),doc.embedFont(assets[2],{subset:true}),doc.embedFont(StandardFonts.Helvetica)]);
  const W=148*mm,H=210*mm,F=H/2;
  const page=doc.addPage([W,H]);
  const cream=rgb(1,.96,.85),navy=rgb(.025,.09,.18),wood=rgb(.35,.19,.08);
  const centered=(text,y,size,faceFont=font,color=cream)=>page.drawText(text,{x:(W-faceFont.widthOfTextAtSize(text,size))/2,y,size,font:faceFont,color});
  function face(upsideDown){
    page.pushOperators(pushGraphicsState(),concatTransformationMatrix(upsideDown?-1:1,0,0,upsideDown?-1:1,upsideDown?W:0,upsideDown?H:0),rectangle(0,0,W,F),clip(),endPath());
    const scale=Math.max(W/background.width,F/background.height);
    page.drawImage(background,{x:(W-background.width*scale)/2,y:(F-background.height*scale)/2,width:background.width*scale,height:background.height*scale});
    page.drawRectangle({x:0,y:0,width:W,height:F,color:navy,opacity:.24});
    page.drawRectangle({x:9,y:9,width:W-18,height:F-18,borderColor:cream,borderWidth:.6,opacity:.5,borderOpacity:.65});
    // Warm festive bulbs along the snowy chalet edge.
    page.drawLine({start:{x:18,y:F-21},end:{x:W-18,y:F-21},color:navy,thickness:1.3});
    for(let i=0;i<11;i++){
      const x=26+i*(W-52)/10;
      page.drawLine({start:{x,y:F-21},end:{x,y:F-27},color:navy,thickness:.8});
      page.drawCircle({x,y:F-29,size:3.6,color:rgb(1,.77,.31)});
    }
    page.drawCircle({x:W/2,y:F-63,size:25,color:cream,opacity:.95});
    page.drawImage(logo,{x:W/2-23,y:F-86,width:46,height:46});
    centered('APRÈS-SKI PUBQUIZ',F-109,17);
    const bx=24,by=68,bw=W-48,bh=112;
    page.drawRectangle({x:bx+3,y:by-4,width:bw,height:bh,color:rgb(.08,.04,.02),opacity:.65});
    page.drawRectangle({x:bx,y:by,width:bw,height:bh,color:wood,borderColor:rgb(.78,.57,.32),borderWidth:2});
    for(let y=by+20;y<by+bh;y+=22)page.drawLine({start:{x:bx+2,y},end:{x:bx+bw-2,y:y+2},color:rgb(.19,.095,.035),thickness:1,opacity:.5});
    for(const x of [bx+8,bx+bw-8])for(const y of [by+8,by+bh-8])page.drawCircle({x,y,size:1.8,color:rgb(.12,.1,.07)});
    // Snow cap, drawn as vectors so the edge stays sharp in print.
    page.drawRectangle({x:bx,y:by+bh-1,width:bw,height:3,color:cream});
    for(let i=0;i<17;i++)page.drawEllipse({x:bx+8+i*(bw-16)/16,y:by+bh,xScale:11,yScale:3+(i%3),color:cream});
    let size=35,lines=wrapped(name,font,size,bw-32);
    while((lines.length*size*1.2>79 || lines.length>3) && size>13){size--;lines=wrapped(name,font,size,bw-32);}
    const lineHeight=size*1.2,top=by+bh/2+(lines.length-1)*lineHeight/2-size*.36;
    lines.forEach((line,index)=>centered(line,top-index*lineHeight,size));
    centered('T.V. HEYNKENSORT',49,10);
    page.drawRectangle({x:24,y:21,width:W-48,height:18,color:navy,opacity:.83});
    centered('Ons team? Altijd op de top van de gezelligheid!',27,8,small);
    page.pushOperators(popGraphicsState());
  }
  face(false);face(true);
  page.drawLine({start:{x:0,y:F},end:{x:W,y:F},color:cream,thickness:1,dashArray:[3,3]});
  page.drawRectangle({x:W/2-27,y:F-5,width:54,height:10,color:cream});
  centered('VOUW HIER',F-2,6,small,navy);
  return doc.save();
}
