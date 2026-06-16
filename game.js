/* ============================================================
   HATHOUSE — office sim (style demo)
   Backdrop = AI office art (style 2). Top-down character walks
   over it with simple bounds + obstacle collision.
   NOTE: backdrop is isometric; movement is screen x/y (diorama).
   ============================================================ */
(() => {
'use strict';

const VW=480, VH=320, WALK_SPEED=70;
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

// ---------- backdrop image ----------
const office=new Image(); let officeReady=false;
office.onload=()=>{ officeReady=true; }; office.onerror=()=>{}; office.src='assets/office.jpg';

// ---------- world: bounds + obstacles (screen coords, tuned to variant 1) ----------
const BOUNDS={x:34,y:74,w:412,h:228};
const OBSTACLES=[
  {x:14,y:150,w:256,h:120, label:'Skrivborden — full fart idag.'},
  {x:196,y:36,w:120,h:74,  label:'Mötesbordet. Mötet börjar snart.'},
  {x:336,y:26,w:144,h:92,  label:'Köket. Dags för fika?'},
  {x:268,y:118,w:92,h:72,  label:'Receptionen. Välkommen till HATHOUSE!'},
  {x:352,y:198,w:128,h:84, label:'En skön soffa.'},
];
function blocked(cx,cy){
  if(cx<BOUNDS.x||cy<BOUNDS.y||cx>BOUNDS.x+BOUNDS.w||cy>BOUNDS.y+BOUNDS.h) return true;
  for(const o of OBSTACLES){ if(cx>o.x&&cx<o.x+o.w&&cy>o.y&&cy<o.y+o.h) return true; }
  return false;
}
function nearObstacle(){ for(const o of OBSTACLES){ const cx=o.x+o.w/2, cy=o.y+o.h/2;
  if(Math.abs(player.x-cx)<o.w/2+22 && Math.abs(player.y-cy)<o.h/2+22) return o; } return null; }

// ---------- player ----------
const player={ x:300, y:255, dir:'up', moving:false, walkPhase:0 };

// ---------- state ----------
let state='title', dialog=null, T=0, titleBlink=0;
function say(t){ dialog={ text:t, char:0 }; }
function updateTitle(dt){ titleBlink+=dt; if(consume('a')) state='world'; }
function updateWorld(dt){
  if(dialog){ if(dialog.char<dialog.text.length){ dialog.char+=2; if(consume('a'))dialog.char=dialog.text.length; }
    else if(consume('a')||consume('b')) dialog=null; return; }
  let dx=0,dy=0;
  if(keys.left)dx--;if(keys.right)dx++;if(keys.up)dy--;if(keys.down)dy++;
  if(consume('a')){ const o=nearObstacle(); if(o){ say(o.label); return; } }
  if(dx&&dy){dx*=0.7071;dy*=0.7071;}
  const dist=WALK_SPEED*dt; let moved=0;
  if(dx){ const nx=player.x+dx*dist; if(!blocked(nx,player.y)){moved+=Math.abs(nx-player.x);player.x=nx;} }
  if(dy){ const ny=player.y+dy*dist; if(!blocked(player.x,ny)){moved+=Math.abs(ny-player.y);player.y=ny;} }
  if(dx<0)player.dir='left';else if(dx>0)player.dir='right';else if(dy<0)player.dir='up';else if(dy>0)player.dir='down';
  player.moving=moved>0.02;
  if(player.moving)player.walkPhase+=moved/7; else player.walkPhase=0;
}

// ---------- render ----------
function px(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
function shadowEl(cx,cy,rx,ry){ctx.fillStyle='rgba(0,0,0,0.22)';ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fill();}
function draw(){
  ctx.setTransform(1,0,0,1,0,0);
  if(state==='title'){ drawTitle(); return; }
  if(officeReady) ctx.drawImage(office,0,0,VW,VH); else { px(0,0,VW,VH,'#caa06a'); }
  drawPlayer();
  drawHud();
  if(dialog) drawDialog();
}
function drawTitle(){
  px(0,0,VW,VH,'#20242e');
  if(officeReady){ ctx.globalAlpha=0.5; ctx.drawImage(office,0,0,VW,VH); ctx.globalAlpha=1; px(0,0,VW,VH,'rgba(20,24,40,0.45)'); }
  px(70,110,340,64,'#11141c'); px(74,114,332,56,'#2f3647');
  ctx.fillStyle='#ffd166';ctx.font='28px "Press Start 2P", monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('HATHOUSE',240,140);
  ctx.fillStyle='#cdd6f4';ctx.font='10px "Press Start 2P", monospace';ctx.fillText('KONTORSSIMULATOR',240,162);
  if((titleBlink*2|0)%2===0){ctx.fillStyle='#fff';ctx.font='10px "Press Start 2P", monospace';ctx.fillText('TRYCK A',240,220);}
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function drawPlayer(){
  const sx=player.x, sy=player.y;
  shadowEl(sx,sy+4,12,4.5);
  const bob=(!player.moving&&Math.sin(T*3)<0)?-1:0;
  const wf=player.moving?(Math.floor(player.walkPhase)%4):-1;
  ctx.save();ctx.translate(sx-16,sy-28+bob*2);ctx.scale(2,2);
  drawTrainerSprite(0,0,'#e0a040','#2f5fa0',player.dir,wf);ctx.restore();
}
function drawTrainerSprite(x,y,cap,body,dir,frame){
  const R=(ax,ay,aw,ah,c)=>{ctx.fillStyle=c;ctx.fillRect(x+ax,y+ay,aw,ah);};
  const skin='#f1c27d',skinD='#d9a35f',shoe='#26324a',outline='#1b2236';
  const walking=frame>=0,passing=frame===1||frame===3,lift=passing?1:0,yb=-lift;
  if(!walking||passing){R(5,13,2.4,3,shoe);R(8.6,13,2.4,3,shoe);}
  else if(frame===0){R(4.7,13,2.4,3,shoe);R(9.0,12.5,2.4,3,shoe);}
  else{R(9.0,13,2.4,3,shoe);R(4.7,12.5,2.4,3,shoe);}
  R(5,15.4,2.4,0.7,outline);R(8.6,15.4,2.4,0.7,outline);
  R(3.6,7.6+yb,8.8,6.8,outline);
  R(4,8+yb,8,6,body);R(4,8+yb,8,1,shade(body,0.25));R(4,13+yb,8,1,shade(body,-0.28));
  let la=9,ra=9;if(walking&&!passing){if(frame===0){la=10;ra=8.2;}else{la=8.2;ra=10;}}
  R(2.8,la+yb,1.9,4,shade(body,-0.2));R(11.3,ra+yb,1.9,4,shade(body,-0.2));
  R(4.6,2.6+yb,6.8,5.8,outline);
  R(5,3+yb,6,5,skin);R(5,7+yb,6,1,skinD);
  R(4.4,1.8+yb,7.2,3,cap);R(4.4,1.8+yb,7.2,1,shade(cap,0.3));R(4.4,3.8+yb,7.2,1,shade(cap,-0.3));
  if(dir==='up')R(4.4,1.2+yb,7.2,1,shade(cap,-0.32));
  else if(dir==='left')R(2.6,3.8+yb,3,1.5,shade(cap,-0.32));
  else if(dir==='right')R(10.4,3.8+yb,3,1.5,shade(cap,-0.32));
  else R(4.4,4.8+yb,7.2,1.3,shade(cap,-0.32));
  if(dir==='up')R(5,3.8+yb,6,3,'#5a3a25');
  else if(dir==='left')R(5.6,5+yb,1.3,1.8,'#1b1f3a');
  else if(dir==='right')R(9.1,5+yb,1.3,1.8,'#1b1f3a');
  else{R(6,5+yb,1.3,1.8,'#1b1f3a');R(8.7,5+yb,1.3,1.8,'#1b1f3a');}
}
function drawHud(){
  px(6,6,150,22,'rgba(20,24,46,0.82)');
  ctx.fillStyle='#ffd166';ctx.font='8px "Press Start 2P", monospace';ctx.textAlign='left';
  ctx.fillText('HATHOUSE',12,20); ctx.fillStyle='#9aa3c4';ctx.fillText('VÅN 1',104,20);
}
function drawDialog(){
  px(12,236,VW-24,72,'#f7f7e8');ctx.strokeStyle='#1b1f3a';ctx.lineWidth=3;ctx.strokeRect(15,239,VW-30,66);
  ctx.strokeStyle='#7a86b6';ctx.strokeRect(19,243,VW-38,58);
  ctx.fillStyle='#1b1f3a';ctx.font='10px "Press Start 2P", monospace';ctx.textAlign='left';
  wrap(dialog.text.slice(0,dialog.char),30,266,VW-60,18);
  if(dialog.char>=dialog.text.length&&(T*3|0)%2===0)ctx.fillText('▾',VW-34,298);
}
function wrap(t,x,y,maxW,lh){const ws=t.split(' ');let l='',yy=y;
  for(const w of ws){const test=l?l+' '+w:w;if(ctx.measureText(test).width>maxW&&l){ctx.fillText(l,x,yy);l=w;yy+=lh;}else l=test;}ctx.fillText(l,x,yy);}
function shade(hex,amt){const n=parseInt(hex.slice(1),16);let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  if(amt<0){const f=1+amt;r*=f;g*=f;b*=f;}else{r+=(255-r)*amt;g+=(255-g)*amt;b+=(255-b)*amt;}return`rgb(${r|0},${g|0},${b|0})`;}

let last=performance.now();
function loop(now){const dt=Math.min(0.05,(now-last)/1000);last=now;T+=dt;
  if(state==='title')updateTitle(dt);else updateWorld(dt);
  for(const k in pressed)pressed[k]=false; draw(); requestAnimationFrame(loop);}
fitCanvas(); requestAnimationFrame(loop);

})();
