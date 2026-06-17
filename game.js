/* ============================================================
   HATHOUSE — top-down office (Gather Town style)
   Real tilemap engine: scrolling camera, grid collisions,
   sprite characters (Kenney RPG Urban Pack, CC0), NPCs & talk.
   ============================================================ */
(() => {
'use strict';

// ---------- viewport ----------
const VW=480, VH=320;            // internal resolution
const TS=16;                     // source tile size on the sheet
const SCALE=2;                   // render scale -> 32px tiles on screen
const T=TS*SCALE;                // on-screen tile size (32)
const WALK_SPEED=96;             // world px / sec

const canvas=document.getElementById('screen');
const ctx=canvas.getContext('2d');
canvas.width=VW; canvas.height=VH; ctx.imageSmoothingEnabled=false;

const isTouch=('ontouchstart'in window)||navigator.maxTouchPoints>0;
if(isTouch) document.body.classList.add('touch');
function fitCanvas(){ const mw=window.innerWidth-24, mh=window.innerHeight-(isTouch?220:90);
  let s=Math.min(mw/VW,mh/VH); if(s>=1)s=Math.floor(s);
  canvas.style.width=(VW*s)+'px'; canvas.style.height=(VH*s)+'px'; }
window.addEventListener('resize',fitCanvas);

// ---------- input ----------
const keys={},pressed={};
const KEYMAP={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',
  w:'up',s:'down',a:'left',d:'right',W:'up',S:'down',A:'left',D:'right',
  z:'a',Z:'a',Enter:'a',' ':'a',x:'b',X:'b',Backspace:'b',Escape:'b'};
function setKey(b,v){ if(v&&!keys[b])pressed[b]=true; keys[b]=v; }
window.addEventListener('keydown',e=>{const b=KEYMAP[e.key];if(b){setKey(b,true);e.preventDefault();}});
window.addEventListener('keyup',  e=>{const b=KEYMAP[e.key];if(b){setKey(b,false);e.preventDefault();}});
function bindTouch(id,b){const el=document.getElementById(id);if(!el)return;
  const on=e=>{e.preventDefault();setKey(b,true);},off=e=>{e.preventDefault();setKey(b,false);};
  el.addEventListener('touchstart',on,{passive:false});el.addEventListener('touchend',off,{passive:false});
  el.addEventListener('touchcancel',off,{passive:false});el.addEventListener('mousedown',on);el.addEventListener('mouseup',off);el.addEventListener('mouseleave',off);}
bindTouch('dpad-up','up');bindTouch('dpad-down','down');bindTouch('dpad-left','left');bindTouch('dpad-right','right');
bindTouch('btn-a','a');bindTouch('btn-b','b');
function consume(b){if(pressed[b]){pressed[b]=false;return true;}return false;}

// ---------- spritesheet ----------
const sheet=new Image(); let sheetReady=false;
sheet.onload=()=>{ sheetReady=true; }; sheet.src='assets/tiles/urban.png';

// ---------- map definition (HATHOUSE ground floor, rectified ~23x56 m) ----------
const W=16,H=36;
// running track (löparbanan) — stadium loop down the centre
const TRK={cx:8, top:4, bot:30, halfW:2};
// tan-room nine-slice (walls), sheet rows 3-5 cols 0-2
const NS={TL:[0,3],T:[1,3],TR:[2,3],L:[0,4],C:[1,4],R:[2,4],BL:[0,5],B:[1,5],BR:[2,5]};
function wallKey(x,y){
  if(x===0&&y===0)return'TL'; if(x===W-1&&y===0)return'TR';
  if(x===0&&y===H-1)return'BL'; if(x===W-1&&y===H-1)return'BR';
  if(y===0)return'T'; if(y===H-1)return'B'; if(x===0)return'L'; if(x===W-1)return'R';
  return'C';
}
// objects: [scol,srow,wt,ht, tx,ty]
const OBJ=[
  // top feature (around the track's top curve)
  [16,8,1,2, 2,2],[16,8,1,2,13,2],[7,12,2,1, 2,4],[7,12,2,1,12,4],
  // upper open office (left & right of the track)
  [5,10,1,1,2,7],[5,10,1,1,3,7],[5,10,1,1,2,9],[5,10,1,1,3,9],
  [5,10,1,1,12,7],[5,10,1,1,13,7],[5,10,1,1,12,9],[5,10,1,1,13,9],
  [7,10,1,1,1,6],[7,10,1,1,1,10],[7,10,1,1,14,6],[7,10,1,1,14,10],
  [5,10,1,1,2,12],[5,10,1,1,3,12],[5,10,1,1,12,12],[5,10,1,1,13,12],
  // kitchen / pentry (inside loop, top)
  [9,13,2,1,7,9],[9,9,1,1,9,10],[16,8,1,2,7,7],
  // meeting tables (inside loop, middle)
  [5,10,1,1,7,16],[5,10,1,1,8,16],[5,10,1,1,7,17],[5,10,1,1,8,17],
  // lower open office
  [5,10,1,1,2,18],[5,10,1,1,3,18],[5,10,1,1,12,18],[5,10,1,1,13,18],
  // lounge / café (lower)
  [4,12,3,1,1,24],[7,12,2,1,12,24],[5,10,1,1,3,26],[16,8,1,2,1,22],[16,8,1,2,13,22],
  [9,13,2,1,7,23],[16,8,1,2,8,21],
  // reception / entrance (bottom)
  [9,13,2,1,7,30],[16,8,1,2,6,29],[7,12,2,1,10,31],[16,8,1,2,2,31],
  // greenery
  [17,8,1,2,4,15],[17,8,1,2,11,15],[16,8,1,2,4,33],[16,8,1,2,10,33],
  // entrance door (bottom wall)
  [12,10,1,1,8,35],
];
// collision grid (true = solid)
const collide=Array.from({length:H},()=>Array(W).fill(false));
for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(wallKey(x,y)!=='C') collide[y][x]=true;
for(const [sc,sr,wt,ht,tx,ty] of OBJ){          // only the bottom row of a footprint blocks
  const by=ty+ht-1;
  for(let dx=0;dx<wt;dx++){ const X=tx+dx; if(X>=0&&X<W&&by>=0&&by<H) collide[by][X]=true; }
}

// interaction hotspots: tile center + message
const SPOTS=[
  {tx:8, ty:33,r:2.0, text:'RECEPTIONEN: Välkommen till HATHOUSE! Skriv upp dig i loggboken så bjuder vi på kaffe.'},
  {tx:8, ty:23,r:1.8, text:'CAFÉT: Espresso, bullar och en skön soffa. Dagens bästa plats.'},
  {tx:8, ty:9, r:1.8, text:'PENTRYT: Diskmaskinen är (nästan) alltid tom. Ta en kaffe! ☕'},
  {tx:8, ty:16.5,r:1.8,text:'MÖTESRUMMET: "Mötet börjar strax." Whiteboarden är full av idéer.'},
  {tx:3, ty:9, r:2.0, text:'ÖPPNA KONTORET: Full fart i dag. Tangentbordsklatter och fokus-musik.'},
  {tx:13,ty:9, r:2.0, text:'ÖPPNA KONTORET: Här sitter teamet. Säg hej till alla!'},
  {tx:2, ty:24,r:2.0, text:'LOUNGEN: Sköna soffor. Slå dig ner och ta en paus.'},
  {tx:8, ty:20,r:1.6, text:'LÖPARBANAN: Japp — en riktig löparbana rakt genom kontoret. Spring ett varv! 🏃'},
  {tx:8, ty:34,r:1.4, text:'Mot AUTOSTORE-lagret... men det är nästa uppdatering. 😉'},
];

// NPCs: tile pos, character index (1..5), facing, message
const NPCS=[
  {tx:6, ty:31,char:1, dir:'up',   text:'Hej och välkommen till HATHOUSE! Trevligt att ha dig här. 😊'},
  {tx:4, ty:8, char:3, dir:'right',text:'Deadline i dag... men det löser sig. Det gör det alltid.'},
  {tx:11,ty:8, char:4, dir:'left', text:'Vi brainstormar nya idéer. Häng på om du vill!'},
  {tx:10,ty:16,char:2, dir:'left', text:'Mötet börjar strax. Hämtar bara en kaffe först.'},
  {tx:11,ty:23,char:5, dir:'left', text:'Fikan är dagens bästa stund, om du frågar mig.'},
  {tx:10,ty:20,char:2, dir:'up',   text:'*flåsar* ...tar bara ett varv till på banan. Häng med!'},
];
// NPCs block their tile
for(const n of NPCS){ if(n.ty>=0&&n.ty<H&&n.tx>=0&&n.tx<W) collide[n.ty][n.tx]=true;
  n.x=n.tx*T+T/2; n.y=n.ty*T+T-4; }

// ---------- character sprites (Kenney urban: cols 23-26, 6 chars x 3 rows) ----------
const CHAR_ROW=[0,3,6,9,12,15];            // top sheet row per character
const DIR_COL={left:23,down:24,up:25,right:26};
const WALK_SEQ=[0,1,0,2];
function drawChar(ci,dir,frameRow,feetX,feetY,camX,camY){
  const col=DIR_COL[dir], row=CHAR_ROW[ci]+frameRow;
  const dx=Math.round(feetX-camX-T/2), dy=Math.round(feetY-camY-T+2);
  ctx.drawImage(sheet, col*TS,row*TS,TS,TS, dx,dy,T,T);
}

// ---------- player ----------
const player={ x:8*T+T/2, y:32*T+T/2, dir:'up', moving:false, walkPhase:0, char:0 };

// ---------- collision helpers ----------
function solidPx(px,py){ const tx=Math.floor(px/T), ty=Math.floor(py/T);
  if(tx<0||ty<0||tx>=W||ty>=H) return true; return collide[ty][tx]; }
function canStand(px,py){           // small feet box
  return !(solidPx(px-7,py-2)||solidPx(px+7,py-2)||solidPx(px-7,py-9)||solidPx(px+7,py-9));
}

// ---------- state ----------
let state='title', dialog=null, T_=0, titleBlink=0, camX=0, camY=0;
function say(t){ dialog={text:t,char:0}; }
function nearestSpot(){
  let best=null,bd=1e9;
  for(const s of SPOTS){ const cx=s.tx*T+T/2, cy=s.ty*T+T/2;
    const d=Math.hypot(player.x-cx, player.y-cy); if(d<s.r*T && d<bd){bd=d;best=s;} }
  for(const n of NPCS){ const d=Math.hypot(player.x-n.x, player.y-(n.y-T/2));
    if(d<1.7*T && d<bd){bd=d;best={text:n.text};} }
  return best;
}

function updateTitle(dt){ titleBlink+=dt; if(consume('a')) state='world'; }
function updateWorld(dt){
  if(dialog){ if(dialog.char<dialog.text.length){ dialog.char+=2; if(consume('a'))dialog.char=dialog.text.length; }
    else if(consume('a')||consume('b')) dialog=null; return; }
  if(consume('a')){ const s=nearestSpot(); if(s){ say(s.text); return; } }
  let dx=0,dy=0;
  if(keys.left)dx--; if(keys.right)dx++; if(keys.up)dy--; if(keys.down)dy++;
  if(dx<0)player.dir='left'; else if(dx>0)player.dir='right';
  else if(dy<0)player.dir='up'; else if(dy>0)player.dir='down';
  if(dx&&dy){dx*=0.7071;dy*=0.7071;}
  const dist=WALK_SPEED*dt; let moved=0;
  if(dx){ const nx=player.x+dx*dist; if(canStand(nx,player.y)){moved+=Math.abs(nx-player.x);player.x=nx;} }
  if(dy){ const ny=player.y+dy*dist; if(canStand(player.x,ny)){moved+=Math.abs(ny-player.y);player.y=ny;} }
  player.moving=moved>0.02;
  if(player.moving)player.walkPhase+=moved/6; else player.walkPhase=0;
}

// ---------- render ----------
function px(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
function clamp(v,a,b){return v<a?a:v>b?b:v;}

function drawTrack(camX,camY){
  const cx=TRK.cx*T-camX, top=TRK.top*T-camY, bot=TRK.bot*T-camY, hw=TRK.halfW*T;
  ctx.save(); ctx.lineJoin='round'; ctx.lineCap='round';
  // orange lane
  ctx.beginPath(); ctx.roundRect(cx-hw, top, 2*hw, bot-top, hw);
  ctx.lineWidth=1.2*T; ctx.strokeStyle='#e8822c'; ctx.stroke();
  // subtle inner lane marking
  ctx.beginPath(); ctx.roundRect(cx-hw, top, 2*hw, bot-top, hw);
  ctx.lineWidth=2; ctx.strokeStyle='rgba(255,224,180,0.65)'; ctx.setLineDash([12,12]); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();
}

function drawWorld(){
  const mapW=W*T, mapH=H*T;
  camX=clamp(Math.round(player.x-VW/2),0,mapW-VW);
  camY=clamp(Math.round(player.y-VH/2),0,mapH-VH);
  // floor + walls (only visible tiles)
  const x0=Math.floor(camX/T), x1=Math.ceil((camX+VW)/T);
  const y0=Math.floor(camY/T), y1=Math.ceil((camY+VH)/T);
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    if(x<0||y<0||x>=W||y>=H) continue;
    const [c,r]=NS[wallKey(x,y)];
    ctx.drawImage(sheet, c*TS,r*TS,TS,TS, x*T-camX, y*T-camY, T,T);
  }
  drawTrack(camX,camY);
  // depth-sorted objects + characters
  const list=[];
  for(const [sc,sr,wt,ht,tx,ty] of OBJ)
    list.push({base:(ty+ht)*T, kind:'obj', sc,sr,wt,ht,tx,ty});
  for(const n of NPCS){
    const fr=0; list.push({base:n.y, kind:'char', ci:n.char, dir:n.dir, fr, x:n.x, y:n.y});
  }
  const wf=player.moving?WALK_SEQ[Math.floor(player.walkPhase)%4]:0;
  list.push({base:player.y, kind:'char', ci:player.char, dir:player.dir, fr:wf, x:player.x, y:player.y, me:true});
  list.sort((a,b)=>a.base-b.base);
  for(const it of list){
    if(it.kind==='obj'){
      ctx.drawImage(sheet, it.sc*TS,it.sr*TS, it.wt*TS,it.ht*TS,
        it.tx*T-camX, it.ty*T-camY, it.wt*T, it.ht*T);
    } else {
      // soft shadow
      ctx.fillStyle='rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(it.x-camX, it.y-camY+1, 9,3.5,0,0,Math.PI*2); ctx.fill();
      drawChar(it.ci,it.dir,it.fr,it.x,it.y,camX,camY);
    }
  }
}

function draw(){
  ctx.setTransform(1,0,0,1,0,0);
  if(!sheetReady){ px(0,0,VW,VH,'#1b2236'); ctx.fillStyle='#9aa3c4';
    ctx.font='10px "Press Start 2P", monospace'; ctx.textAlign='center';
    ctx.fillText('LADDAR...',VW/2,VH/2); ctx.textAlign='left'; return; }
  if(state==='title'){ drawTitle(); return; }
  drawWorld();
  drawHud();
  if(dialog) drawDialog();
}
function drawTitle(){
  px(0,0,VW,VH,'#caa46a');
  // blurred peek of the room behind the title
  for(let y=0;y<10;y++)for(let x=0;x<15;x++){ const [c,r]=NS[wallKey((x+3)%W,(y+2)%H)];
    ctx.drawImage(sheet,c*TS,r*TS,TS,TS,x*T,y*T,T,T); }
  px(0,0,VW,VH,'rgba(20,24,40,0.55)');
  px(70,108,340,70,'#11141c'); px(74,112,332,62,'#2f3647');
  ctx.fillStyle='#ffd166';ctx.font='28px "Press Start 2P", monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('HATHOUSE',240,140);
  ctx.fillStyle='#cdd6f4';ctx.font='10px "Press Start 2P", monospace';ctx.fillText('KONTORET',240,164);
  if((titleBlink*2|0)%2===0){ctx.fillStyle='#fff';ctx.font='10px "Press Start 2P", monospace';ctx.fillText('TRYCK A',240,224);}
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function drawHud(){
  px(6,6,168,24,'rgba(20,24,46,0.82)');
  ctx.fillStyle='#ffd166';ctx.font='8px "Press Start 2P", monospace';ctx.textAlign='left';
  ctx.fillText('HATHOUSE',12,21); ctx.fillStyle='#9aa3c4';ctx.fillText('VÅN 1',122,21);
}
function drawDialog(){
  px(12,236,VW-24,72,'#f7f7e8');ctx.strokeStyle='#1b1f3a';ctx.lineWidth=3;ctx.strokeRect(15,239,VW-30,66);
  ctx.strokeStyle='#7a86b6';ctx.strokeRect(19,243,VW-38,58);
  ctx.fillStyle='#1b1f3a';ctx.font='10px "Press Start 2P", monospace';ctx.textAlign='left';
  wrap(dialog.text.slice(0,dialog.char),30,264,VW-60,18);
  if(dialog.char>=dialog.text.length&&(T_*3|0)%2===0)ctx.fillText('▾',VW-34,300);
}
function wrap(t,x,y,maxW,lh){const ws=t.split(' ');let l='',yy=y;
  for(const w of ws){const test=l?l+' '+w:w;if(ctx.measureText(test).width>maxW&&l){ctx.fillText(l,x,yy);l=w;yy+=lh;}else l=test;}ctx.fillText(l,x,yy);}

let last=performance.now();
function loop(now){const dt=Math.min(0.05,(now-last)/1000);last=now;T_+=dt;
  if(state==='title')updateTitle(dt);else if(sheetReady)updateWorld(dt);
  for(const k in pressed)pressed[k]=false; draw(); requestAnimationFrame(loop);}
fitCanvas(); requestAnimationFrame(loop);

})();
