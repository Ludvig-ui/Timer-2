/* ============================================================
   HATHOUSE — office simulator (top-down, dungeon-tilemap style)
   PLACEHOLDER FLOOR: replace with the real Hathouse floor plan.
   Internal res 480x320, scrolling camera over a larger world.
   ============================================================ */
(() => {
'use strict';

// ---------- Resolution ----------
const VW = 480, VH = 320;
const TILE = 32, W = 30, H = 20;            // world in tiles
const WORLD_W = W*TILE, WORLD_H = H*TILE;
const WALK_SPEED = 84;
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
canvas.width = VW; canvas.height = VH;
ctx.imageSmoothingEnabled = false;

const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add('touch');
function fitCanvas(){
  const maxW = window.innerWidth - 24;
  const maxH = window.innerHeight - (isTouch ? 220 : 90);
  let s = Math.min(maxW/VW, maxH/VH); if (s>=1) s=Math.floor(s);
  canvas.style.width=(VW*s)+'px'; canvas.style.height=(VH*s)+'px';
}
window.addEventListener('resize', fitCanvas);

// ---------- Input ----------
const keys={}, pressed={};
const KEYMAP={ ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',
  w:'up',s:'down',a:'left',d:'right',W:'up',S:'down',A:'left',D:'right',
  z:'a',Z:'a',Enter:'a',' ':'a', x:'b',X:'b',Backspace:'b',Escape:'b' };
function setKey(b,v){ if(v&&!keys[b]) pressed[b]=true; keys[b]=v; }
window.addEventListener('keydown',e=>{ const b=KEYMAP[e.key]; if(b){ setKey(b,true); e.preventDefault(); } });
window.addEventListener('keyup',  e=>{ const b=KEYMAP[e.key]; if(b){ setKey(b,false); e.preventDefault(); } });
function bindTouch(id,b){ const el=document.getElementById(id); if(!el) return;
  const on=e=>{e.preventDefault();setKey(b,true);}, off=e=>{e.preventDefault();setKey(b,false);};
  el.addEventListener('touchstart',on,{passive:false}); el.addEventListener('touchend',off,{passive:false});
  el.addEventListener('touchcancel',off,{passive:false}); el.addEventListener('mousedown',on); el.addEventListener('mouseup',off); el.addEventListener('mouseleave',off); }
bindTouch('dpad-up','up'); bindTouch('dpad-down','down'); bindTouch('dpad-left','left'); bindTouch('dpad-right','right');
bindTouch('btn-a','a'); bindTouch('btn-b','b');
function consume(b){ if(pressed[b]){ pressed[b]=false; return true; } return false; }

// ---------- Tiles ----------
const FLOOR=0, WALL=1, DOOR=2, CARPET=3, DESK=4, CHAIR=5, PLANT=6, SOFA=7,
      MEET=8, KITCHEN=9, SHELF=10, WINDOW=11, COOLER=12, RECEPTION=13;
const SOLID = new Set([WALL,WINDOW,DESK,PLANT,SOFA,MEET,KITCHEN,SHELF,COOLER,RECEPTION]);

// ---------- Build placeholder floor ----------
const TT=[]; for(let y=0;y<H;y++){ const r=[]; for(let x=0;x<W;x++) r.push(FLOOR); TT.push(r); }
function st(x,y,v){ if(x>=0&&y>=0&&x<W&&y<H) TT[y][x]=v; }
function gt(x,y){ return (x>=0&&y>=0&&x<W&&y<H)?TT[y][x]:WALL; }
function hwall(x1,x2,y){ for(let x=x1;x<=x2;x++) st(x,y,WALL); }
function vwall(y1,y2,x){ for(let y=y1;y<=y2;y++) st(x,y,WALL); }
function fillRect2(x1,y1,x2,y2,v){ for(let y=y1;y<=y2;y++) for(let x=x1;x<=x2;x++) st(x,y,v); }

// outer walls
hwall(0,W-1,0); hwall(0,W-1,H-1); vwall(0,H-1,0); vwall(0,H-1,W-1);
// windows on outer walls
st(8,0,WINDOW); st(14,0,WINDOW); st(0,5,WINDOW); st(0,10,WINDOW); st(0,14,WINDOW);
// Meeting Room A (top-right)
vwall(0,7,20); hwall(20,W-1,7); st(20,3,DOOR);
fillRect2(21,1,28,6,CARPET); st(24,3,MEET); st(23,3,CHAIR); st(25,3,CHAIR); st(24,2,CHAIR); st(24,4,CHAIR); st(28,1,PLANT);
// Meeting Room B (right, middle)
vwall(8,13,20); hwall(20,W-1,13); st(20,10,DOOR);
fillRect2(21,8,28,12,CARPET); st(24,10,MEET); st(23,10,CHAIR); st(25,10,CHAIR); st(24,9,CHAIR); st(24,11,CHAIR); st(21,8,PLANT);
// Kitchen (bottom-right)
vwall(14,18,20); st(20,16,DOOR);
hwall(21,28,14,KITCHEN); st(24,17,MEET); st(23,17,CHAIR); st(25,17,CHAIR); st(28,18,PLANT);
for(let x=21;x<=28;x++) st(x,14,KITCHEN);
// Open-plan desks (left/centre)
for(const r of [3,7,11]){ for(const c of [3,6,9,12,15]){ st(c,r,DESK); st(c,r+1,CHAIR); } }
// Reception + lounge (bottom-centre, by the entrance)
st(15,H-1,DOOR);                          // main entrance
st(14,16,RECEPTION); st(15,16,RECEPTION);
st(3,17,SOFA); st(4,17,SOFA); st(18,16,COOLER);
st(1,18,PLANT); st(18,18,PLANT); st(10,5,PLANT);
st(2,1,SHELF); st(3,1,SHELF);

// rooms for name banners
const ROOMS=[
  {name:'Mötesrum A', x:20,y:0,w:10,h:8},
  {name:'Mötesrum B', x:20,y:8,w:10,h:6},
  {name:'Kök',        x:20,y:13,w:10,h:7},
  {name:'Reception',  x:10,y:14,w:10,h:6},
];
function roomNameAt(tx,ty){ for(const r of ROOMS){ if(tx>=r.x&&tx<r.x+r.w&&ty>=r.y&&ty<r.y+r.h) return r.name; } return 'Kontorslandskap'; }

// ---------- NPC colleagues ----------
const NPCS=[
  {tx:3, ty:4,  dir:'down', shirt:'#c0504d', cap:'#3a3a3a', line:'Hej! Mycket att göra idag.'},
  {tx:9, ty:8,  dir:'down', shirt:'#4f81bd', cap:'#6b4a2a', line:'Kaffe? Köket är där borta.'},
  {tx:16,ty:11, dir:'left', shirt:'#9bbb59', cap:'#2a2a2a', line:'Mötet börjar snart i Mötesrum A.'},
];
function npcAtTile(tx,ty){ return NPCS.find(n=>n.tx===tx&&n.ty===ty); }

// ---------- Player ----------
const player = { x:15*TILE+16, y:18*TILE+18, dir:'up', moving:false, walkPhase:0 };
function boxSolid(cx,cy){
  const pts=[[cx-9,cy-6],[cx+9,cy-6],[cx-9,cy+3],[cx+9,cy+3]];
  for(const [pxv,pyv] of pts){ const tx=Math.floor(pxv/TILE), ty=Math.floor(pyv/TILE);
    if(SOLID.has(gt(tx,ty))) return true; if(npcAtTile(tx,ty)) return true; }
  return false;
}
function frontTile(){ const d=player.dir;
  return { tx:Math.floor((player.x+(d==='left'?-TILE:d==='right'?TILE:0))/TILE),
           ty:Math.floor((player.y+(d==='up'?-TILE:d==='down'?TILE:0))/TILE) }; }

// ---------- State ----------
let state='title', dialog=null, T=0, titleBlink=0;
let roomName='Kontorslandskap', bannerT=0;
const cam={x:0,y:0};
function say(lines,onDone){ dialog={ lines:Array.isArray(lines)?lines:[lines], i:0, char:0, onDone }; }

function updateTitle(dt){ titleBlink+=dt; if(consume('a')){ state='world'; setRoom(roomNameAt(15,18)); } }
function setRoom(n){ if(n!==roomName){ roomName=n; bannerT=2.4; } }

function updateWorld(dt){
  if(bannerT>0) bannerT-=dt;
  if(dialog){ updateDialog(); return; }
  let dx=0,dy=0;
  if(keys.left)dx--; if(keys.right)dx++; if(keys.up)dy--; if(keys.down)dy++;
  if(consume('a')) tryInteract();
  if(dx&&dy){ dx*=0.7071; dy*=0.7071; }
  const dist=WALK_SPEED*dt; let moved=0;
  if(dx){ const nx=player.x+dx*dist; if(!boxSolid(nx,player.y)){ moved+=Math.abs(nx-player.x); player.x=nx; } }
  if(dy){ const ny=player.y+dy*dist; if(!boxSolid(player.x,ny)){ moved+=Math.abs(ny-player.y); player.y=ny; } }
  if(dx<0)player.dir='left'; else if(dx>0)player.dir='right'; else if(dy<0)player.dir='up'; else if(dy>0)player.dir='down';
  player.moving=moved>0.02;
  if(player.moving) player.walkPhase+=moved/7; else player.walkPhase=0;
  setRoom(roomNameAt(Math.floor(player.x/TILE), Math.floor(player.y/TILE)));
}
function tryInteract(){
  const f=frontTile();
  const n=npcAtTile(f.tx,f.ty); if(n){ say(n.line); return; }
  const t=gt(f.tx,f.ty);
  const L={ [DESK]:'Ett skrivbord — fullt av jobb.', [KITCHEN]:'Köket. Dags för fika?',
    [MEET]:'Ett mötesbord.', [PLANT]:'En fin kontorsväxt.', [RECEPTION]:'Receptionen. Välkommen till HATHOUSE!',
    [SHELF]:'En hylla full av pärmar.', [COOLER]:'Vattenautomat. *glugg glugg*', [SOFA]:'En skön soffa.' };
  if(L[t]) say(L[t]);
}
function updateDialog(){
  const d=dialog, line=d.lines[d.i];
  if(d.char<line.length){ d.char+=2; if(d.char>line.length)d.char=line.length; if(consume('a'))d.char=line.length; }
  else if(consume('a')||consume('b')){ d.i++; if(d.i>=d.lines.length){ const cb=d.onDone; dialog=null; if(cb)cb(); } else d.char=0; }
}

// ============================================================
//  RENDER
// ============================================================
function px(x,y,w,h,c){ ctx.fillStyle=c; ctx.fillRect(x,y,w,h); }
function ell(cx,cy,rx,ry,c){ ctx.fillStyle=c; ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); ctx.fill(); }
function shadowEl(cx,cy,rx,ry){ ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); ctx.fill(); }

function draw(){
  ctx.setTransform(1,0,0,1,0,0);
  if(state==='title'){ drawTitle(); return; }
  // camera
  cam.x=Math.round(Math.max(0,Math.min(WORLD_W-VW, player.x-VW/2)));
  cam.y=Math.round(Math.max(0,Math.min(WORLD_H-VH, player.y-VH/2)));
  ctx.save(); ctx.translate(-cam.x,-cam.y);
  const x0=Math.max(0,(cam.x/TILE|0)), x1=Math.min(W-1,((cam.x+VW)/TILE|0));
  const y0=Math.max(0,(cam.y/TILE|0)), y1=Math.min(H-1,((cam.y+VH)/TILE|0));
  for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) drawTile(x,y);
  // actors (player + npcs) depth-sorted
  const actors=[{y:player.y, fn:drawPlayer}];
  for(const n of NPCS){ const cy=n.ty*TILE+16; if(cy>cam.y-40&&cy<cam.y+VH+40) actors.push({y:cy, fn:()=>drawNpc(n)}); }
  actors.sort((a,b)=>a.y-b.y).forEach(a=>a.fn());
  ctx.restore();
  drawHud();
  if(dialog) drawDialog();
}

// ---- title ----
function drawTitle(){
  px(0,0,VW,VH,'#20242e');
  for(let i=0;i<40;i++){ const x=(i*53)%VW, y=((i*97)%VH); px(x,y,2,2,'#2b303c'); }
  px(70,110,340,64,'#11141c'); px(74,114,332,56,'#2f3647');
  ctx.fillStyle='#ffd166'; ctx.font='28px "Press Start 2P", monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('HATHOUSE',240,140);
  ctx.fillStyle='#cdd6f4'; ctx.font='10px "Press Start 2P", monospace'; ctx.fillText('KONTORSSIMULATOR',240,162);
  if((titleBlink*2|0)%2===0){ ctx.fillStyle='#fff'; ctx.font='10px "Press Start 2P", monospace'; ctx.fillText('TRYCK A',240,220); }
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}

// ---- tiles ----
function drawFloorBase(X,Y,x,y){
  ctx.fillStyle=((x+y)%2)?'#cdc8b8':'#c7c2b2'; ctx.fillRect(X,Y,TILE,TILE);
  ctx.fillStyle='rgba(0,0,0,0.06)'; ctx.fillRect(X,Y+TILE-1,TILE,1); ctx.fillRect(X+TILE-1,Y,1,TILE);
  ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(X,Y,TILE,1);
  // shadow cast by a wall directly north
  if(gt(x,y-1)===WALL||gt(x,y-1)===WINDOW){ ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.fillRect(X,Y,TILE,5); }
}
function drawWall(X,Y){
  px(X,Y,TILE,TILE,'#8d94a3');
  px(X,Y,TILE,11,'#aeb6c4');                 // top face
  px(X,Y,TILE,3,'#c6ccd8');                  // top highlight
  px(X,Y+TILE-7,TILE,7,'#6b7280');           // front shadow
  ctx.fillStyle='#7c8493'; ctx.fillRect(X,Y,1,TILE); ctx.fillRect(X,Y+11,TILE,1);
}
function drawTile(x,y){
  const X=x*TILE, Y=y*TILE, t=TT[y][x];
  if(t===WALL){ drawWall(X,Y); return; }
  if(t===WINDOW){ drawWall(X,Y); px(X+5,Y+6,TILE-10,12,'#bfe0ef'); px(X+5,Y+6,TILE-10,3,'#dff1f8'); ctx.fillStyle='#6b7280'; ctx.fillRect(X+TILE/2-1,Y+6,2,12); ctx.fillRect(X+5,Y+11,TILE-10,2); return; }
  // everything else sits on floor
  drawFloorBase(X,Y,x,y);
  if(t===CARPET){ px(X,Y,TILE,TILE,'#5b7e8c'); px(X+2,Y+2,TILE-4,TILE-4,'#6a90a0'); ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(X+2,Y+2,TILE-4,2); }
  else if(t===DOOR){ px(X+4,Y+TILE-7,TILE-8,5,'#9a784a'); }
  else if(t===DESK) drawDesk(X,Y);
  else if(t===CHAIR) drawChair(X,Y);
  else if(t===PLANT) drawPlant(X,Y);
  else if(t===SOFA) drawSofa(X,Y);
  else if(t===MEET) drawMeet(X,Y);
  else if(t===KITCHEN) drawKitchen(X,Y);
  else if(t===SHELF) drawShelf(X,Y);
  else if(t===COOLER) drawCooler(X,Y);
  else if(t===RECEPTION) drawReception(X,Y);
}

// ---- furniture ----
function drawDesk(X,Y){
  shadowEl(X+16,Y+27,13,3.5);
  px(X+3,Y+9,26,17,'#b07f4a'); px(X+3,Y+9,26,3,'#c79a63'); px(X+3,Y+23,26,3,'#8a5f33');
  px(X+9,Y+4,14,9,'#23262f'); px(X+10,Y+5,12,7,'#4a86c6'); px(X+10,Y+5,5,3,'#7fb0e0'); px(X+15,Y+13,2,2,'#444');
  px(X+10,Y+19,13,4,'#dfe2e8'); px(X+11,Y+20,11,1,'#b9bcc4');
}
function drawChair(X,Y){
  shadowEl(X+16,Y+24,8,3);
  px(X+10,Y+8,12,3,'#2b303c');          // backrest
  ell(X+16,Y+17,8,6,'#39414f'); ell(X+16,Y+16,6.5,4.5,'#4a5566');
}
function drawPlant(X,Y){
  shadowEl(X+16,Y+27,9,3.5);
  px(X+11,Y+19,10,8,'#a4632e'); px(X+11,Y+19,10,2,'#bb7638'); px(X+11,Y+25,10,2,'#8a5226');
  ell(X+16,Y+12,9,8,'#2f7d44'); ell(X+12,Y+9,5,5,'#3f9a55'); ell(X+20,Y+11,4,4,'#3f9a55'); ell(X+15,Y+7,3,3,'#56b06b');
}
function drawSofa(X,Y){
  shadowEl(X+16,Y+27,14,3.5);
  px(X+2,Y+10,28,16,'#4a5b9a'); px(X+2,Y+10,28,4,'#5566a8'); px(X+2,Y+8,5,18,'#3f4f86'); px(X+25,Y+8,5,18,'#3f4f86');
  px(X+8,Y+14,7,8,'#5e6fb0'); px(X+17,Y+14,7,8,'#5e6fb0');
}
function drawMeet(X,Y){
  shadowEl(X+16,Y+24,15,5);
  ell(X+16,Y+16,15,11,'#b07f4a'); ell(X+16,Y+15,13.5,9.5,'#c08e57'); ell(X+12,Y+12,5,3,'#cfa06a');
}
function drawKitchen(X,Y){
  px(X,Y+6,TILE,14,'#cfd3da'); px(X,Y+6,TILE,3,'#e2e5ea');     // counter top
  px(X,Y+18,TILE,10,'#9aa0aa'); ctx.fillStyle='#7e8088'; ctx.fillRect(X+6,Y+20,8,6); ctx.fillRect(X+18,Y+20,8,6); // cabinets
  px(X+10,Y+9,12,7,'#8b8f98'); px(X+11,Y+10,10,5,'#b9c0c8');   // sink
}
function drawShelf(X,Y){
  px(X+3,Y+3,26,24,'#7a5230'); px(X+5,Y+5,22,20,'#9a6a3e');
  const cols=['#c0504d','#4f81bd','#9bbb59','#f0a830','#8064a2'];
  for(let r=0;r<3;r++){ for(let i=0;i<5;i++){ px(X+6+i*4,Y+6+r*7,3,5,cols[(i+r)%5]); } px(X+5,Y+11+r*7,22,1,'#6b4a2a'); }
}
function drawCooler(X,Y){
  shadowEl(X+16,Y+27,7,3);
  px(X+11,Y+12,10,15,'#e9edf2'); px(X+11,Y+12,10,3,'#cdd3da');
  px(X+12,Y+4,8,9,'#9fd0e6'); px(X+13,Y+5,6,7,'#bfe3f2'); px(X+14,Y+18,4,3,'#7fb0e0');
}
function drawReception(X,Y){
  shadowEl(X+16,Y+27,15,3.5);
  px(X,Y+10,TILE,16,'#6b4a2a'); px(X,Y+10,TILE,4,'#8a5f33'); px(X,Y+8,TILE,3,'#d8dadf'); // counter + top
  px(X+6,Y+14,20,6,'#cdd0d6');
}

// ---- characters (16-unit art scaled x2) ----
function drawTrainerSprite(x,y,cap,body,dir,frame){
  const R=(ax,ay,aw,ah,c)=>{ ctx.fillStyle=c; ctx.fillRect(x+ax,y+ay,aw,ah); };
  const skin='#f1c27d', skinD='#d9a35f', shoe='#26324a', outline='#1b2236';
  const walking=frame>=0, passing=frame===1||frame===3, lift=passing?1:0, yb=-lift;
  if(!walking||passing){ R(5,13,2.4,3,shoe); R(8.6,13,2.4,3,shoe); }
  else if(frame===0){ R(4.7,13,2.4,3,shoe); R(9.0,12.5,2.4,3,shoe); }
  else { R(9.0,13,2.4,3,shoe); R(4.7,12.5,2.4,3,shoe); }
  R(5,15.4,2.4,0.7,outline); R(8.6,15.4,2.4,0.7,outline);
  R(3.6,7.6+yb,8.8,6.8,outline);
  R(4,8+yb,8,6,body); R(4,8+yb,8,1,shade(body,0.25)); R(4,13+yb,8,1,shade(body,-0.28));
  let la=9,ra=9; if(walking&&!passing){ if(frame===0){ la=10; ra=8.2; } else { la=8.2; ra=10; } }
  R(2.8,la+yb,1.9,4,shade(body,-0.2)); R(11.3,ra+yb,1.9,4,shade(body,-0.2));
  R(4.6,2.6+yb,6.8,5.8,outline);
  R(5,3+yb,6,5,skin); R(5,7+yb,6,1,skinD);
  R(4.4,1.8+yb,7.2,3,cap); R(4.4,1.8+yb,7.2,1,shade(cap,0.3)); R(4.4,3.8+yb,7.2,1,shade(cap,-0.3));
  if(dir==='up') R(4.4,1.2+yb,7.2,1,shade(cap,-0.32));
  else if(dir==='left') R(2.6,3.8+yb,3,1.5,shade(cap,-0.32));
  else if(dir==='right') R(10.4,3.8+yb,3,1.5,shade(cap,-0.32));
  else R(4.4,4.8+yb,7.2,1.3,shade(cap,-0.32));
  if(dir==='up') R(5,3.8+yb,6,3,'#5a3a25');
  else if(dir==='left') R(5.6,5+yb,1.3,1.8,'#1b1f3a');
  else if(dir==='right') R(9.1,5+yb,1.3,1.8,'#1b1f3a');
  else { R(6,5+yb,1.3,1.8,'#1b1f3a'); R(8.7,5+yb,1.3,1.8,'#1b1f3a'); }
}
function drawPlayer(){
  const sx=player.x, sy=player.y;
  shadowEl(sx,sy+4,12,4.5);
  const bob=(!player.moving && Math.sin(T*3)<0)?-1:0;
  const wf=player.moving?(Math.floor(player.walkPhase)%4):-1;
  ctx.save(); ctx.translate(sx-16, sy-28+bob*2); ctx.scale(2,2);
  drawTrainerSprite(0,0,'#e0a040','#2f5fa0',player.dir,wf); ctx.restore();
}
function drawNpc(n){
  const cx=n.tx*TILE+16, cy=n.ty*TILE+18;
  shadowEl(cx,cy+4,12,4.5);
  const bob=(Math.sin(T*2.2+n.tx)<0)?-1:0;
  ctx.save(); ctx.translate(cx-16, cy-28+bob*2); ctx.scale(2,2);
  drawTrainerSprite(0,0,n.cap,n.shirt,n.dir,-1); ctx.restore();
}

// ---- HUD / dialog ----
function drawHud(){
  px(6,6,150,22,'rgba(20,24,46,0.82)');
  ctx.fillStyle='#ffd166'; ctx.font='8px "Press Start 2P", monospace'; ctx.textAlign='left';
  ctx.fillText('HATHOUSE',12,20);
  ctx.fillStyle='#9aa3c4'; ctx.fillText('VÅN 1',104,20);
  if(bannerT>0){ const a=Math.min(1,bannerT); ctx.globalAlpha=a;
    px(VW/2-90,34,180,24,'rgba(20,24,46,0.85)');
    ctx.fillStyle='#fff'; ctx.font='9px "Press Start 2P", monospace'; ctx.textAlign='center';
    ctx.fillText(roomName.toUpperCase(),VW/2,50); ctx.globalAlpha=1; ctx.textAlign='left'; }
}
function drawDialog(){
  const d=dialog;
  px(12,236,VW-24,72,'#f7f7e8'); ctx.strokeStyle='#1b1f3a'; ctx.lineWidth=3; ctx.strokeRect(15,239,VW-30,66);
  ctx.strokeStyle='#7a86b6'; ctx.strokeRect(19,243,VW-38,58);
  ctx.fillStyle='#1b1f3a'; ctx.font='10px "Press Start 2P", monospace'; ctx.textAlign='left';
  wrapText(d.lines[d.i].slice(0,d.char),30,266,VW-60,18);
  if(d.char>=d.lines[d.i].length && (T*3|0)%2===0) ctx.fillText('▾',VW-34,298);
}
function wrapText(text,x,y,maxW,lh){ const words=text.split(' '); let line='',yy=y;
  for(const w of words){ const test=line?line+' '+w:w; if(ctx.measureText(test).width>maxW&&line){ ctx.fillText(line,x,yy); line=w; yy+=lh; } else line=test; } ctx.fillText(line,x,yy); }

// ---- helpers ----
function shade(hex,amt){ const n=parseInt(hex.slice(1),16); let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  if(amt<0){ const f=1+amt; r*=f; g*=f; b*=f; } else { r+=(255-r)*amt; g+=(255-g)*amt; b+=(255-b)*amt; } return `rgb(${r|0},${g|0},${b|0})`; }

// ---- loop ----
let last=performance.now();
function loop(now){ const dt=Math.min(0.05,(now-last)/1000); last=now; T+=dt;
  if(state==='title') updateTitle(dt); else if(state==='world') updateWorld(dt);
  for(const k in pressed) pressed[k]=false;
  draw(); requestAnimationFrame(loop);
}
fitCanvas(); requestAnimationFrame(loop);

})();
