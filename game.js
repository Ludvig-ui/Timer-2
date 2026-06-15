/* ============================================================
   CapQuest — a tiny cap-catching RPG (Pokémon-style demo)
   World renders at 480x320; UI/battle authored in a 240x160
   "design space" and scaled x2 so layout stays consistent.
   ============================================================ */
(() => {
'use strict';

// ---------- Resolution ----------
const VW = 480, VH = 320;          // real internal screen
const DW = 240, DH = 160;          // UI/battle design space (x2 -> screen)
const TILE = 32, MAP_W = 15, MAP_H = 10;
const WALK_SPEED = 80;             // px/sec — free movement
const ENC_STEP = 26, ENC_CHANCE = 0.16;
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
canvas.width = VW; canvas.height = VH;
ctx.imageSmoothingEnabled = false;

const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add('touch');
function fitCanvas() {
  const maxW = window.innerWidth - 24;
  const maxH = window.innerHeight - (isTouch ? 220 : 90);
  let s = Math.min(maxW / VW, maxH / VH);
  if (s >= 1) s = Math.floor(s);
  canvas.style.width = (VW * s) + 'px';
  canvas.style.height = (VH * s) + 'px';
}
window.addEventListener('resize', fitCanvas);

// ---------- Input ----------
const keys = {};
const KEYMAP = {
  ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
  w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right',
  z:'a', Z:'a', Enter:'a', ' ':'a',
  x:'b', X:'b', Backspace:'b', Escape:'b'
};
const pressed = {};
function setKey(btn, val){ if (val && !keys[btn]) pressed[btn]=true; keys[btn]=val; }
window.addEventListener('keydown', e => { const b=KEYMAP[e.key]; if(b){ setKey(b,true); e.preventDefault(); } });
window.addEventListener('keyup',   e => { const b=KEYMAP[e.key]; if(b){ setKey(b,false); e.preventDefault(); } });
function bindTouch(id, btn){
  const el = document.getElementById(id); if(!el) return;
  const on = e => { e.preventDefault(); setKey(btn,true); };
  const off= e => { e.preventDefault(); setKey(btn,false); };
  el.addEventListener('touchstart',on,{passive:false});
  el.addEventListener('touchend',off,{passive:false});
  el.addEventListener('touchcancel',off,{passive:false});
  el.addEventListener('mousedown',on); el.addEventListener('mouseup',off); el.addEventListener('mouseleave',off);
}
bindTouch('dpad-up','up'); bindTouch('dpad-down','down');
bindTouch('dpad-left','left'); bindTouch('dpad-right','right');
bindTouch('btn-a','a'); bindTouch('btn-b','b');
function consume(btn){ if(pressed[btn]){ pressed[btn]=false; return true; } return false; }

// ---------- Sprite manager (image with drawn fallback) ----------
const SPRITES = {};
function loadSprite(name, src){
  const img = new Image();
  img.onload = () => { SPRITES[name]=img; };
  img.onerror = () => {};
  img.src = src;
}
loadSprite('cap_snapback','assets/cap_snapback.png');
loadSprite('cap_camp','assets/cap_camp.png');
loadSprite('cap_bucket','assets/cap_bucket.png');
loadSprite('player','assets/player.png');
loadSprite('capsule','assets/capsule.png');
function drawSpriteFit(name,x,y,w,h,fallback){
  const img = SPRITES[name];
  if (img && img.complete && img.naturalWidth) ctx.drawImage(img,x,y,w,h);
  else if (fallback) fallback(x,y,w,h);
}

// ---------- Species / moves ----------
const TYPES = { Street:'#e76f51', Outdoor:'#2a9d8f', Classic:'#e9c46a' };
function typeMultiplier(atk,def){
  if (atk===def) return 1;
  const wins = { Street:'Outdoor', Outdoor:'Classic', Classic:'Street' };
  return wins[atk]===def ? 1.5 : 0.66;
}
const SPECIES = {
  snapback:{ id:'snapback', name:'SNAPBACK', sprite:'cap_snapback', type:'Street',
    color:'#26416b', accent:'#ffffff', base:{hp:32,atk:12,def:8,spd:11}, moves:['flatbrim','taunt'] },
  camp:{ id:'camp', name:'5-PANEL', sprite:'cap_camp', type:'Outdoor',
    color:'#5f6f3a', accent:'#cdd6a0', base:{hp:30,atk:10,def:11,spd:9}, moves:['trailgust','taunt'] },
  bucket:{ id:'bucket', name:'BUCKET', sprite:'cap_bucket', type:'Classic',
    color:'#c9b187', accent:'#8a7250', base:{hp:36,atk:9,def:12,spd:7}, moves:['brimslam','taunt'] }
};
const MOVES = {
  flatbrim:{ name:'FLAT BRIM', type:'Street',  power:11, acc:0.95 },
  trailgust:{name:'TRAIL GUST',type:'Outdoor', power:11, acc:0.95 },
  brimslam:{ name:'BRIM SLAM', type:'Classic', power:12, acc:0.9  },
  taunt:{    name:'STYLE FLEX',type:'none',    power:6,  acc:1.0  }
};
function statAt(base,level){ return Math.floor(base + base*(level-1)*0.18); }
function makeCap(speciesId,level){
  const sp=SPECIES[speciesId];
  const maxHp=statAt(sp.base.hp,level)+level*2;
  return { species:sp, level, maxHp, hp:maxHp,
    atk:statAt(sp.base.atk,level), def:statAt(sp.base.def,level), spd:statAt(sp.base.spd,level),
    xp:0, xpNext:level*12, moves:sp.moves.map(m=>MOVES[m]) };
}

// ---------- Player (free pixel position; x,y = feet point) ----------
const player = {
  x: 7*TILE+16, y: 7*TILE+18,
  dir:'down', moving:false, walkPhase:0, grassDist:0,
  party:[], capsule:8, caught:{}
};

// ---------- Map ----------
// 0 grass, 1 tall grass, 2 tree (solid), 3 path, 4 fence (solid)
// 5 water (solid), 6 bush (solid), 7 sign (solid), 8 flower patch (walkable)
const M = [
 [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
 [2,0,0,0,1,1,1,1,1,0,0,6,6,0,2],
 [2,0,8,1,1,1,1,1,1,1,0,6,2,0,2],
 [2,0,0,1,1,1,1,1,1,1,1,0,0,0,2],
 [2,0,0,0,1,1,1,1,1,0,0,0,8,0,2],
 [2,0,5,5,0,3,3,3,0,0,0,0,0,0,2],
 [2,0,5,5,0,3,0,3,0,0,0,0,8,0,2],
 [2,0,0,0,0,3,0,3,3,3,3,0,0,0,2],
 [2,0,7,0,0,3,3,3,0,0,0,2,0,0,2],
 [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
];
function tileAt(tx,ty){ if(tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) return 2; return M[ty][tx]; }
function boxSolid(cx,cy){
  const pts=[[cx-9,cy-6],[cx+9,cy-6],[cx-9,cy+3],[cx+9,cy+3]];
  for(const [pxv,pyv] of pts){
    const tx=Math.floor(pxv/TILE), ty=Math.floor(pyv/TILE);
    const t=tileAt(tx,ty);
    if(t===2||t===4||t===5||t===6||t===7) return true;
    if(npc.active && tx===npc.tx && ty===npc.ty) return true;
  }
  return false;
}
function feetTile(){ return tileAt(Math.floor(player.x/TILE), Math.floor(player.y/TILE)); }

// ---------- NPC trainer ----------
const npc = { active:true, defeated:false, tx:10, ty:7, name:'KEPS-KENT', capId:'camp', capLevel:6 };
function npcCenter(){ return { x:npc.tx*TILE+16, y:npc.ty*TILE+16 }; }
function nearNpc(){ if(!npc.active) return false; const c=npcCenter(); return Math.hypot(player.x-c.x, player.y-c.y) < TILE*1.15; }

// ============================================================
//  STATE MACHINE
// ============================================================
let state='title';     // title|choose|world|battle
let battle=null;
let dialog=null;
let T=0;               // animation clock
function say(lines,onDone){ dialog={ lines:Array.isArray(lines)?lines:[lines], i:0, char:0, t:0, onDone }; }

let titleBlink=0;
function updateTitle(dt){ titleBlink+=dt; if(consume('a')){ state='choose'; chooseIdx=0; } }

let chooseIdx=0;
const STARTERS=['snapback','camp','bucket'];
function updateChoose(){
  if(consume('left'))  chooseIdx=(chooseIdx+2)%3;
  if(consume('right')) chooseIdx=(chooseIdx+1)%3;
  if(consume('a')){
    const id=STARTERS[chooseIdx];
    player.party=[ makeCap(id,5) ];
    player.caught[id]=true;
    state='world';
    say([`Du valde ${SPECIES[id].name}!`,'Gå i det höga gräset för','att hitta vilda kepsar.']);
  }
}

// ============================================================
//  OVERWORLD — free movement
// ============================================================
function updateWorld(dt){
  if(dialog){ updateDialog(); return; }
  let dx=0,dy=0;
  if(keys.left)dx--; if(keys.right)dx++; if(keys.up)dy--; if(keys.down)dy++;
  if(consume('a')) tryInteract();
  if(dx&&dy){ dx*=0.7071; dy*=0.7071; }

  // walking into an undefeated trainer starts the duel
  if((dx||dy) && npc.active && !npc.defeated){
    const aheadTx=Math.floor((player.x+dx*10)/TILE), aheadTy=Math.floor((player.y+dy*10)/TILE);
    if(aheadTx===npc.tx && aheadTy===npc.ty){ faceTrainer(); return; }
  }

  const dist=WALK_SPEED*dt; let moved=0;
  if(dx){ const nx=player.x+dx*dist; if(!boxSolid(nx,player.y)){ moved+=Math.abs(nx-player.x); player.x=nx; } }
  if(dy){ const ny=player.y+dy*dist; if(!boxSolid(player.x,ny)){ moved+=Math.abs(ny-player.y); player.y=ny; } }
  if(dx<0)player.dir='left'; else if(dx>0)player.dir='right'; else if(dy<0)player.dir='up'; else if(dy>0)player.dir='down';

  player.moving = moved>0.02;
  if(player.moving){
    player.walkPhase += moved/7;
    if(feetTile()===1){
      player.grassDist += moved;
      if(player.grassDist>=ENC_STEP){ player.grassDist=0; if(Math.random()<ENC_CHANCE){ startWildBattle(); return; } }
    }
  } else player.walkPhase=0;
}
function frontTile(){
  const d=player.dir;
  const fx=player.x+(d==='left'?-TILE:d==='right'?TILE:0);
  const fy=player.y+(d==='up'?-TILE:d==='down'?TILE:0);
  return { tx:Math.floor(fx/TILE), ty:Math.floor(fy/TILE) };
}
function tryInteract(){
  if(nearNpc()){ faceTrainer(); return; }
  const f=frontTile();
  if(tileAt(f.tx,f.ty)===7) say(['ROUTE 1','Vilda kepsar gömmer sig','i det höga gräset!']);
}
function faceTrainer(){
  if(npc.defeated) say([`${npc.name}: Snyggt fångat!`,'Samla alla kepsarna!']);
  else say([`${npc.name}: En keps-duell!`,'Visa vad din keps går för!'], ()=>startTrainerBattle());
}

// ============================================================
//  BATTLE (logic unchanged; coords live in 240x160 design space)
// ============================================================
function startWildBattle(){
  const pool=['snapback','camp','bucket'];
  const id=pool[(Math.random()*pool.length)|0];
  const lvl=3+(Math.random()*4|0);
  beginBattle(makeCap(id,lvl),true,null);
  say([`En vild ${SPECIES[id].name} dök upp!`]);
}
function startTrainerBattle(){
  beginBattle(makeCap(npc.capId,npc.capLevel),false,npc.name);
  say([`${npc.name} skickar ut`,`${SPECIES[npc.capId].name}!`]);
}
function activeCap(){ return player.party.find(c=>c.hp>0)||player.party[0]; }
function beginBattle(enemy,isWild,trainerName){
  state='battle';
  battle={ enemy,isWild,trainerName, me:activeCap(), phase:'intro',
    menuIdx:0, moveIdx:0, shake:0, flashMe:0, flashEn:0,
    introT:0, flash:1, lunge:null, popups:[], faintEn:0, faintMe:0, cap:null,
    result:null, enemyMaxHp:enemy.maxHp, meHpShown:enemy?0:0, enHpShown:0 };
  battle.meHpShown=battle.me.hp; battle.enHpShown=enemy.hp;
}
const BMENU=['STRID','FÅNGA','BYT','FLY'];
function updateBattle(dt){
  const b=battle;
  if(b.shake>0) b.shake=Math.max(0,b.shake-dt*60);
  if(b.flashMe>0) b.flashMe-=dt; if(b.flashEn>0) b.flashEn-=dt;
  b.introT+=dt;
  if(b.flash>0) b.flash-=dt*2.2;
  if(b.lunge){ b.lunge.t+=dt; if(b.lunge.t>0.3) b.lunge=null; }
  for(const p of b.popups) p.t+=dt;
  if(b.popups.length) b.popups=b.popups.filter(p=>p.t<0.9);
  if(b.enemy.hp<=0 && !b.cap) b.faintEn=Math.min(1,b.faintEn+dt*2);
  if(b.me.hp<=0) b.faintMe=Math.min(1,b.faintMe+dt*2);
  b.meHpShown+=clampAbs(b.me.hp-b.meHpShown,dt*40);
  b.enHpShown+=clampAbs(b.enemy.hp-b.enHpShown,dt*40);

  if(dialog){ updateDialog(); return; }

  switch(b.phase){
    case 'intro': b.phase='menu'; break;
    case 'capture': {
      const c=b.cap; c.t+=dt;
      if(c.t>=0.85){
        const wig=Math.floor((c.t-0.85)/0.55);
        if(wig>=3 && !c.done){
          c.done=true;
          if(c.success){
            const caught=b.enemy;
            player.party.push(makeCap(caught.species.id,caught.level));
            const isNew=!player.caught[caught.species.id];
            player.caught[caught.species.id]=true;
            b.result='caught'; b.phase='end';
            const lines=[`${caught.species.name} fångades!`];
            if(isNew) lines.push('Ny post i CAPDEX!');
            say(lines);
          } else {
            b.cap=null;
            say([`${b.enemy.species.name} slet sig loss!`], ()=>{ b.phase='resolve'; runActions([['en',enemyMove()]],0); });
          }
        }
      }
      break;
    }
    case 'menu': {
      if(consume('left')  && b.menuIdx%2===1) b.menuIdx--;
      if(consume('right') && b.menuIdx%2===0) b.menuIdx++;
      if(consume('up')    && b.menuIdx>=2)    b.menuIdx-=2;
      if(consume('down')  && b.menuIdx<2)     b.menuIdx+=2;
      if(consume('a')){
        if(b.menuIdx===0){ b.phase='fight'; b.moveIdx=0; }
        else if(b.menuIdx===1) tryCatch();
        else if(b.menuIdx===2) trySwitch();
        else if(b.menuIdx===3) tryRun();
      }
      break;
    }
    case 'fight': {
      const n=b.me.moves.length;
      if(consume('up')   && b.moveIdx>=2) b.moveIdx-=2;
      if(consume('down') && b.moveIdx+2<n) b.moveIdx+=2;
      if(consume('left') && b.moveIdx%2===1) b.moveIdx--;
      if(consume('right')&& b.moveIdx%2===0 && b.moveIdx+1<n) b.moveIdx++;
      if(consume('b')) b.phase='menu';
      if(consume('a')) doTurn(b.me.moves[b.moveIdx]);
      break;
    }
    case 'end': if(consume('a')) finishBattle(); break;
  }
}
function enemyMove(){ const b=battle; return b.enemy.moves[(Math.random()*b.enemy.moves.length)|0]; }
function calcDamage(attacker,defender,move){
  if(move.power<=0) return {dmg:0,mult:1};
  const mult=move.type==='none'?1:typeMultiplier(move.type,defender.species.type);
  const base=(attacker.atk*move.power)/(defender.def+18);
  return { dmg:Math.max(1,Math.floor(base*mult*(0.85+Math.random()*0.3))), mult };
}
function doTurn(myMove){
  const b=battle; b.phase='resolve';
  const enMove=enemyMove();
  const order = b.me.spd>=b.enemy.spd ? [['me',myMove],['en',enMove]] : [['en',enMove],['me',myMove]];
  runActions(order,0);
}
function runActions(order,i){
  const b=battle;
  if(i>=order.length){ if(b.me.hp<=0||b.enemy.hp<=0) checkBattleEnd(); else b.phase='menu'; return; }
  const [who,move]=order[i];
  const atk=who==='me'?b.me:b.enemy, def=who==='me'?b.enemy:b.me;
  if(atk.hp<=0){ runActions(order,i+1); return; }
  const name=who==='me'?atk.species.name:(b.isWild?'Vild ':'Fiendens ')+atk.species.name;
  if(Math.random()>move.acc){ say([`${name} använde ${move.name}!`,'Men det missade!'], ()=>runActions(order,i+1)); return; }
  const {dmg,mult}=calcDamage(atk,def,move);
  def.hp=Math.max(0,def.hp-dmg);
  b.lunge={who,t:0};
  b.popups.push(who==='me'?{x:176,y:42,val:dmg,t:0}:{x:60,y:96,val:dmg,t:0});
  if(who==='me'){ b.flashEn=0.25; b.shake=6; } else { b.flashMe=0.25; b.shake=6; }
  const eff=mult>1?' Träffsäkert!':(mult<1?' Föga effektivt...':'');
  const lines=[`${name} använde ${move.name}!`]; if(eff) lines.push(eff.trim());
  say(lines, ()=>{ if(def.hp<=0) checkBattleEnd(); else runActions(order,i+1); });
}
function checkBattleEnd(){
  const b=battle;
  if(b.enemy.hp<=0){
    const xp=b.enemy.level*6+4; gainXp(b.me,xp); b.result='win';
    const lines=[`${b.isWild?'Vild ':''}${b.enemy.species.name} föll!`,`${b.me.species.name} fick ${xp} EP.`];
    if(b._leveled) lines.push(`${b.me.species.name} gick upp till nivå ${b.me.level}!`);
    b.phase='end'; say(lines);
  } else if(b.me.hp<=0){
    const next=player.party.find(c=>c.hp>0);
    if(next){ b.me=next; b.meHpShown=next.hp; say([`${b.me.species.name}, din tur!`], ()=>b.phase='menu'); }
    else { b.result='lose'; b.phase='end'; say(['Alla dina kepsar svimmade...','Du skyndar hem och vårdar dem.']); }
  } else b.phase='menu';
}
function gainXp(cap,amount){
  battle._leveled=false; cap.xp+=amount;
  while(cap.xp>=cap.xpNext && cap.level<50){
    cap.xp-=cap.xpNext; cap.level++; cap.xpNext=cap.level*12;
    const sp=cap.species, newMax=statAt(sp.base.hp,cap.level)+cap.level*2;
    cap.hp+=(newMax-cap.maxHp); cap.maxHp=newMax;
    cap.atk=statAt(sp.base.atk,cap.level); cap.def=statAt(sp.base.def,cap.level); cap.spd=statAt(sp.base.spd,cap.level);
    battle._leveled=true;
  }
}
function tryCatch(){
  const b=battle;
  if(!b.isWild){ say(['Man kan inte fånga','en annan tränares keps!']); return; }
  if(player.capsule<=0){ say(['Du har inga CAPSULES kvar!']); return; }
  player.capsule--; b.phase='resolve';
  const hpFrac=b.enemy.hp/b.enemyMaxHp;
  const chance=Math.min(0.92,0.45+(1-hpFrac)*0.5);
  say(['Du kastar en CAPSULE!'], ()=>{ b.phase='capture'; b.cap={ t:0, success:Math.random()<chance, done:false }; });
}
function trySwitch(){
  const b=battle;
  const others=player.party.filter(c=>c!==b.me && c.hp>0);
  if(others.length===0){ say(['Du har ingen annan','frisk keps!']); return; }
  b.me=others[0]; b.meHpShown=b.me.hp;
  say([`Kom igen, ${b.me.species.name}!`], ()=>{ b.phase='resolve'; runActions([['en',enemyMove()]],0); });
}
function tryRun(){
  const b=battle;
  if(!b.isWild){ say(['Man kan inte fly från','en keps-duell!']); return; }
  if(Math.random()<0.7){ b.result='run'; b.phase='end'; say(['Du kom undan!']); }
  else say(['Du kom inte undan!'], ()=>{ b.phase='resolve'; runActions([['en',enemyMove()]],0); });
}
function finishBattle(){
  const b=battle;
  if(b.result==='win' && !b.isWild && !npc.defeated){ npc.defeated=true; state='world'; healParty(); say([`Du besegrade ${npc.name}!`,'Dina kepsar vilade upp sig.']); battle=null; return; }
  if(b.result==='lose') healParty();
  state='world'; battle=null;
}
function healParty(){ player.party.forEach(c=>c.hp=c.maxHp); }

// ============================================================
//  DIALOG
// ============================================================
function updateDialog(){
  const d=dialog, line=d.lines[d.i]; d.t+=1;
  if(d.char<line.length){
    d.char+=2; if(d.char>line.length) d.char=line.length;
    if(consume('a')) d.char=line.length;
  } else if(consume('a')||consume('b')){
    d.i++;
    if(d.i>=d.lines.length){ const cb=d.onDone; dialog=null; if(cb) cb(); }
    else d.char=0;
  }
}

// ============================================================
//  RENDERING
// ============================================================
function px(x,y,w,h,c){ ctx.fillStyle=c; ctx.fillRect(x,y,w,h); }
function shadowEl(cx,cy,rx,ry){ ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); ctx.fill(); }

function draw(){
  ctx.setTransform(1,0,0,1,0,0);
  if(state==='title'){ scaledUI(drawTitle); return; }
  if(state==='choose'){ scaledUI(drawChoose); return; }
  if(state==='battle'){ scaledUI(drawBattle); if(dialog) scaledUI(drawDialog); return; }
  drawWorld();
  if(dialog) scaledUI(drawDialog);
}
function scaledUI(fn){ ctx.save(); ctx.scale(VW/DW, VH/DH); fn(); ctx.restore(); }

// ---- Title (design space) ----
function drawTitle(){
  ctx.fillStyle='#9ad07a'; ctx.fillRect(0,0,DW,DH);
  for(let i=0;i<8;i++){ const x=((i*53)%240), y=20+((i*37)%80); drawCapMini(x,y,['#26416b','#5f6f3a','#c9b187'][i%3]); }
  px(20,52,200,42,'#1b1f3a'); px(22,54,196,38,'#2b3566');
  ctx.fillStyle='#ffd166'; ctx.font='16px "Press Start 2P", monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('CapQuest',120,70);
  ctx.fillStyle='#cdd6f4'; ctx.font='6px "Press Start 2P", monospace';
  ctx.fillText('FÅNGA · DUELLERA · SAMLA',120,84);
  if((titleBlink*2|0)%2===0){ ctx.fillStyle='#fff'; ctx.font='7px "Press Start 2P", monospace'; ctx.fillText('TRYCK A FÖR ATT BÖRJA',120,120); }
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
function drawCapMini(x,y,color){ px(x+1,y+3,12,4,color); px(x+1,y+6,16,2,'#1b1f3a'); px(x+4,y+1,7,3,color); }

// ---- Choose (design space) ----
function drawChoose(){
  ctx.fillStyle='#2b3566'; ctx.fillRect(0,0,DW,DH);
  ctx.fillStyle='#fff'; ctx.font='8px "Press Start 2P", monospace'; ctx.textAlign='center';
  ctx.fillText('VÄLJ DIN FÖRSTA KEPS',120,22);
  STARTERS.forEach((id,i)=>{
    const sp=SPECIES[id], x=40+i*66, y=64, sel=i===chooseIdx;
    if(sel) px(x-26,y-30,52,62,'#ffd166');
    px(x-23,y-27,46,56,'#1b1f3a');
    const bob=sel?Math.sin(T*4)*1.6:0;
    drawCapBig(id,x-16,y-22+bob,32);
    ctx.fillStyle=sel?'#ffd166':'#9aa3c4'; ctx.font='6px "Press Start 2P", monospace';
    ctx.fillText(sp.name,x,y+24);
    ctx.fillStyle=TYPES[sp.type]; ctx.fillText(sp.type,x,y+40);
  });
  ctx.fillStyle='#cdd6f4'; ctx.font='6px "Press Start 2P", monospace';
  ctx.fillText('◀ ▶ välj   A bekräfta',120,132);
  ctx.textAlign='left';
}

// ---- World (real 480x320) ----
function drawWorld(){
  ctx.fillStyle='#79b35a'; ctx.fillRect(0,0,VW,VH);
  for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++) drawTile(x,y,M[y][x]);
  // draw actors sorted by feet-Y for simple depth
  const actors=[];
  if(npc.active){ const c=npcCenter(); actors.push({y:c.y, fn:()=>drawTrainer(c.x,c.y)}); }
  actors.push({y:player.y, fn:()=>drawPlayer()});
  actors.sort((a,b)=>a.y-b.y).forEach(a=>a.fn());
  drawBug();
  // soft vignette for depth
  const vg=ctx.createRadialGradient(VW/2,VH/2,VH*0.34,VW/2,VH/2,VH*0.78);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(20,30,16,0.24)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,VW,VH);
  drawWorldHud();
}
// Unified grass field used under every ground tile so everything blends.
// Texture is placed on a world-aligned grid of cells so tufts tile seamlessly.
function hash2(a,b){ let n=(a*374761393 + b*668265263)|0; n=(n^(n>>13))*1274126177; return (n>>>0); }
function grassBase(X,Y,x,y){
  ctx.fillStyle='#7ab35b'; ctx.fillRect(X,Y,TILE,TILE);
  const CELL=8;
  for(let gy=Y; gy<Y+TILE; gy+=CELL){
    for(let gx=X; gx<X+TILE; gx+=CELL){
      const h=hash2(gx,gy);
      const kind=h%9;
      if(kind>=4) continue;                 // many cells stay smooth
      const jx=gx+1+(h%4), jy=gy+2+((h>>3)%4);
      ctx.fillStyle = (kind===0)?'#88bf68':'#69a44b';   // a small grass tuft
      ctx.fillRect(jx, jy, 1, 3);
      ctx.fillRect(jx-1, jy+1, 1, 2);
      ctx.fillRect(jx+1, jy+1, 1, 2);
    }
  }
}
function drawTile(x,y,t){
  const X=x*TILE, Y=y*TILE;
  grassBase(X,Y,x,y);                 // same base for all ground tiles
  if(t===2){ // tree
    shadowEl(X+16,Y+28,13,4.5);
    px(X+13,Y+16,6,13,'#6b4a2a'); px(X+13,Y+16,2,13,'#7d5733'); // trunk
    // layered canopy
    ctx.fillStyle='#245327'; ctx.beginPath(); ctx.ellipse(X+16,Y+13,14,12,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#2f6b34'; ctx.beginPath(); ctx.ellipse(X+16,Y+12,12.5,10.5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#3f7d42'; ctx.beginPath(); ctx.ellipse(X+15,Y+10,9,7.5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#58a352'; ctx.beginPath(); ctx.ellipse(X+12,Y+8,4.5,3.5,0,0,Math.PI*2); ctx.fill();
  } else if(t===3){ // path
    px(X,Y,TILE,TILE,'#caa771');
    px(X,Y,TILE,2,'#d8b988'); px(X,Y+TILE-2,TILE,2,'#b8945e');
    ctx.fillStyle='#b8945e'; ctx.fillRect(X+6,Y+10,3,3); ctx.fillRect(X+20,Y+18,3,3); ctx.fillRect(X+14,Y+5,2,2);
    ctx.fillStyle='#d8b988'; ctx.fillRect(X+7,Y+10,1,1); ctx.fillRect(X+21,Y+18,1,1);
  } else if(t===1){ // tall grass — a tidy bushy tuft on the shared field
    const sway=Math.sin(T*2 + x*0.7 + y*0.5)*1.5;
    ctx.fillStyle='rgba(40,80,38,0.20)'; ctx.beginPath(); ctx.ellipse(X+16,Y+25,12,3.5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#3f8a39'; ctx.beginPath(); ctx.ellipse(X+16,Y+20,12,8,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#4f9b45'; ctx.beginPath(); ctx.ellipse(X+16,Y+19,10,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#357a30';
    for(let i=0;i<6;i++){ const gx=X+5+i*4.4, s=sway*((i%2)?1:-1); ctx.fillRect(gx+s,Y+9,2,9); }
    ctx.fillStyle='#5aa64e';
    for(let i=0;i<5;i++){ const gx=X+7+i*4.4, s=sway*((i%2)?1:-1)*0.6; ctx.fillRect(gx+s,Y+11,1.4,7); }
  } else if(t===5){ // water (animated)
    px(X,Y,TILE,TILE,'#3b6ea5');
    ctx.fillStyle='#4f86c6';
    for(let i=0;i<3;i++){ const ry=Y+6+i*9, off=Math.sin(T*1.5+i+x)*3; ctx.fillRect(X+3+off,ry,10,2); }
    ctx.fillStyle='rgba(255,255,255,0.5)';
    const gx=X+6+Math.sin(T+y)*3; ctx.fillRect(gx,Y+5,5,1); ctx.fillRect(X+18,Y+20+Math.cos(T*1.2)*2,4,1);
    px(X,Y,TILE,2,'#2f5b88');
  } else if(t===6){ // bush
    shadowEl(X+16,Y+27,12,4);
    ctx.fillStyle='#245327'; ctx.beginPath(); ctx.ellipse(X+16,Y+18,13,11,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#2f6b34'; ctx.beginPath(); ctx.ellipse(X+16,Y+17,11,9,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#3f7d42'; ctx.beginPath(); ctx.ellipse(X+13,Y+14,5,4,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#e05a6b'; ctx.fillRect(X+10,Y+18,2,2); ctx.fillRect(X+20,Y+22,2,2);
  } else if(t===7){ // sign
    px(X+14,Y+16,4,12,'#6b4a2a');
    px(X+6,Y+8,20,12,'#8a5a2a'); px(X+6,Y+8,20,2,'#a86f3a');
    ctx.fillStyle='#5a3a1c'; ctx.fillRect(X+9,Y+12,14,1.5); ctx.fillRect(X+9,Y+15,10,1.5);
  } else if(t===8){ // flower patch (on shared field)
    flower(X+8,Y+10,'#ffd166','#fff0b3'); flower(X+20,Y+14,'#e98fb5','#ffd0e2'); flower(X+13,Y+22,'#9bb8ff','#dce6ff');
  } else { // plain grass with occasional flower
    const hsh=(x*7+y*13)%9;
    if(hsh===0){ flower(X+11,Y+12,'#ffd166','#fff0b3'); }
    else if(hsh===3){ flower(X+20,Y+19,'#e98fb5','#ffd0e2'); }
    else if(hsh===6){ flower(X+9,Y+21,'#9bb8ff','#dce6ff'); }
  }
}
function flower(cx,cy,c,hi){
  ctx.fillStyle='#3f7d42'; ctx.fillRect(cx,cy+3,1,4);
  ctx.fillStyle=c; ctx.fillRect(cx-2,cy,2,2); ctx.fillRect(cx+1,cy,2,2); ctx.fillRect(cx-1,cy-2,3,2); ctx.fillRect(cx-1,cy+2,3,2);
  ctx.fillStyle=hi; ctx.fillRect(cx,cy,1,1);
}
function drawWorldHud(){
  px(6,6,196,30,'rgba(20,24,46,0.85)');
  drawCapsuleBig(22,21);
  ctx.fillStyle='#fff'; ctx.font='12px "Press Start 2P", monospace'; ctx.textAlign='left';
  ctx.fillText('x'+player.capsule,34,25);
  const dex=Object.keys(player.caught).length;
  ctx.fillStyle='#ffd166'; ctx.fillText('CAPDEX '+dex+'/3',90,25);
}
function drawBug(){
  const bx=24+(Math.sin(T*0.6)*0.5+0.5)*420;
  const by=44+Math.sin(T*1.9)*14+(Math.cos(T*0.4)*0.5+0.5)*60;
  const f=(T*12|0)%2;
  ctx.fillStyle='#3a2a1a'; ctx.fillRect(bx,by,2,3);
  ctx.fillStyle='#ffd166';
  if(f){ ctx.fillRect(bx-4,by-2,4,4); ctx.fillRect(bx+2,by-2,4,4); }
  else { ctx.fillRect(bx-4,by,4,4); ctx.fillRect(bx+2,by,4,4); }
}

// ---- Trainer sprite (16-unit art; scaled x2 in overworld) ----
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
  drawTrainerSprite(0,0,'#e63946','#2f5fa0',player.dir,wf); ctx.restore();
}
function drawTrainer(cx,cy){
  shadowEl(cx,cy+8,12,4.5);
  const bob=(Math.sin(T*2.4)<0)?-1:0;
  ctx.save(); ctx.translate(cx-16, cy-24+bob*2); ctx.scale(2,2);
  drawTrainerSprite(0,0,'#4f5f2f','#8a5a2a','down',-1); ctx.restore();
  if(!npc.defeated && (T*2|0)%2===0){ ctx.fillStyle='#ffd166'; ctx.font='16px "Press Start 2P", monospace'; ctx.textAlign='center'; ctx.fillText('!',cx,cy-22); ctx.textAlign='left'; }
}

// ---- Cap creatures (16-unit art with outline + shading) ----
function capFallback(id){
  return (x,y,w,h)=>{
    const sp=SPECIES[id], u=w/16, outline='#141d33';
    const R=(ax,ay,aw,ah,c)=>{ ctx.fillStyle=c; ctx.fillRect(x+ax*u,y+ay*u,aw*u,ah*u); };
    const RB=(ax,ay,aw,ah,c)=>{ ctx.fillStyle=outline; ctx.fillRect(x+(ax-0.45)*u,y+(ay-0.45)*u,(aw+0.9)*u,(ah+0.9)*u); ctx.fillStyle=c; ctx.fillRect(x+ax*u,y+ay*u,aw*u,ah*u); };
    const dark=shade(sp.color,-0.3), darker=shade(sp.color,-0.5), light=shade(sp.color,0.25);
    ctx.fillStyle='rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.ellipse(x+8*u,y+15.2*u,5.5*u,1.6*u,0,0,Math.PI*2); ctx.fill();
    RB(5,13.6,2.4,2,'#3a2c1c'); RB(8.2,13.6,2.4,2,'#3a2c1c');
    let ey;
    if(id==='snapback'){
      ey=6;
      RB(2,10,12.5,2,dark); R(2,11.6,13,1.2,darker);
      RB(4,2.6,8,7.4,sp.color); R(4,2.6,8,2,light); R(4,8.6,8,1.4,dark);
      R(5,4.6,6,4,sp.accent); R(5,4.6,6,1,'#dfe6ef');
      R(7.6,1.7,0.9,1.1,light); R(7.7,2.6,0.6,7,dark);
    } else if(id==='camp'){
      ey=6.6;
      RB(3,10,10,2,dark); R(4,11.4,8.5,1.1,darker);
      RB(4,3.6,8,6.6,sp.color); R(4,3.6,8,2,light); R(4,9.2,8,1,dark);
      R(5,6,6,3,sp.accent); R(7.7,3.6,0.6,6.4,dark); R(5.6,4,0.5,6,dark); R(9.9,4,0.5,6,dark);
    } else {
      ey=7.2;
      RB(4,3.6,8,6.4,sp.color); R(4,3.6,8,2,light); R(4,6,8,0.5,dark); R(4,7.6,8,0.5,dark);
      RB(1.4,9.2,13.2,2,dark); R(1.2,10.8,13.6,2,sp.color); R(1.2,12.4,13.6,1.2,darker);
    }
    R(5.4,ey,2.1,2.4,'#fff'); R(8.6,ey,2.1,2.4,'#fff');
    R(6.0,ey+0.5,1.1,1.5,'#1b1f3a'); R(9.2,ey+0.5,1.1,1.5,'#1b1f3a');
    R(6.0,ey+0.4,0.5,0.5,'#fff'); R(9.2,ey+0.4,0.5,0.5,'#fff');
    R(5.0,ey+2.5,1.2,0.9,'#ff9bb0'); R(9.9,ey+2.5,1.2,0.9,'#ff9bb0');
  };
}
function drawCapBig(id,x,y,size){ drawSpriteFit(SPECIES[id].sprite,x,y,size,size,capFallback(id)); }

// ---- Battle (design space) ----
function drawBattle(){
  const b=battle, W=DW, H=DH;
  const sh=b.shake>0?(Math.random()*b.shake-b.shake/2):0;
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#bfe3f0'); g.addColorStop(0.55,'#dcefcf'); g.addColorStop(1,'#e9f3d6');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#cfe39f'; ctx.beginPath(); ctx.moveTo(0,98); ctx.lineTo(W,72); ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.75)'; cloud(38+Math.sin(T*0.2)*4,18,9); cloud(150,12,7); cloud(212+Math.sin(T*0.15)*3,26,8);
  ctx.fillStyle='#a9cd7a'; ctx.beginPath(); ctx.ellipse(176,60,42,11,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#9bc36b'; ctx.beginPath(); ctx.ellipse(60,122,48,13,0,0,Math.PI*2); ctx.fill();

  const intro=Math.min(1,b.introT/0.5), enSlide=(1-ease(intro))*130, meSlide=(1-ease(intro))*-130;
  const enBob=Math.sin(T*2.5)*1.5, meBob=Math.sin(T*2.5+1)*1.5;
  let meDX=0,meDY=0,enDX=0,enDY=0;
  if(b.lunge){ const k=Math.sin(Math.min(1,b.lunge.t/0.3)*Math.PI)*8; if(b.lunge.who==='me'){ meDX=k; meDY=-k*0.5; } else { enDX=-k; enDY=k*0.5; } }

  const enHidden=b.cap && b.cap.t>=0.45;
  if(!enHidden && (b.flashEn<=0||(b.flashEn*20|0)%2===0)){
    ctx.save(); if(b.faintEn>0) ctx.globalAlpha=Math.max(0,1-b.faintEn);
    drawCapBig(b.enemy.species.id,154+enSlide+enDX+sh,24+enDY+enBob+b.faintEn*22,44); ctx.restore();
  }
  if(b.cap){
    const c=b.cap, tgtX=176, tgtY=40;
    if(c.t<0.45){ const k=c.t/0.45; drawCapsuleBig(lerp(46,tgtX,k), lerp(116,tgtY,k)-Math.sin(k*Math.PI)*34, 0); }
    else { const wt=c.t-0.85, settled=c.done||wt>=3*0.55; const wob=(c.t>=0.85&&!settled)?Math.sin(wt*16)*2.4:0; drawCapsuleBig(tgtX,tgtY,wob);
      if(c.done&&c.success){ for(let i=0;i<4;i++){ const a=T*4+i*1.6; drawSparkle(tgtX+Math.cos(a)*12,tgtY+Math.sin(a)*9,2,'#ffd166'); } } }
  }
  if(b.flashMe<=0||(b.flashMe*20|0)%2===0){
    ctx.save(); if(b.faintMe>0) ctx.globalAlpha=Math.max(0,1-b.faintMe);
    drawCapBig(b.me.species.id,34+meSlide+meDX,86+meDY+meBob+b.faintMe*22,52); ctx.restore();
  }
  if(b.flashEn>0) hitSpark(176,42);
  if(b.flashMe>0) hitSpark(60,96);
  for(const p of b.popups){ const a=Math.max(0,1-p.t/0.9); ctx.globalAlpha=a; ctx.fillStyle='#e63946'; ctx.font='8px "Press Start 2P", monospace'; ctx.textAlign='center'; ctx.fillText('-'+p.val,p.x,p.y-p.t*16); }
  ctx.globalAlpha=1; ctx.textAlign='left';

  drawHpBox(12,12,b.enemy,b.enHpShown,false);
  drawHpBox(128,78,b.me,b.meHpShown,true);
  drawPanel(0,118,W,42);
  if(dialog){}
  else if(b.phase==='menu') drawBattleMenu();
  else if(b.phase==='fight') drawMoveMenu();
  else if(b.phase==='end'){ ctx.fillStyle='#1b1f3a'; ctx.font='7px "Press Start 2P", monospace'; ctx.textAlign='left'; if((T*2|0)%2===0) ctx.fillText('Tryck A...',12,142); }

  if(b.flash>0){ ctx.fillStyle=`rgba(255,255,255,${Math.min(1,b.flash)})`; ctx.fillRect(0,0,W,H); }
}
function drawHpBox(x,y,cap,shown,mine){
  drawPanel(x,y,100,26);
  ctx.fillStyle='#1b1f3a'; ctx.font='6px "Press Start 2P", monospace'; ctx.textAlign='left';
  ctx.fillText(cap.species.name,x+6,y+9); ctx.fillText('N'+cap.level,x+78,y+9);
  px(x+6,y+14,80,5,'#1b1f3a'); px(x+7,y+15,78,3,'#5a5a5a');
  const frac=Math.max(0,shown/cap.maxHp), col=frac>0.5?'#3ddc84':frac>0.2?'#ffd166':'#e63946';
  px(x+7,y+15,(78*frac)|0,3,col);
  if(mine){ ctx.fillStyle='#1b1f3a'; ctx.fillText(Math.ceil(shown)+'/'+cap.maxHp,x+44,y+25); }
}
function drawPanel(x,y,w,h){ px(x,y,w,h,'#f7f7e8'); ctx.strokeStyle='#1b1f3a'; ctx.lineWidth=2; ctx.strokeRect(x+1,y+1,w-2,h-2); ctx.strokeStyle='#7a86b6'; ctx.strokeRect(x+3,y+3,w-6,h-6); }
function drawBattleMenu(){
  const b=battle; ctx.font='7px "Press Start 2P", monospace'; ctx.textAlign='left';
  BMENU.forEach((label,i)=>{ const cx=130+(i%2)*54, cy=134+((i/2)|0)*16; ctx.fillStyle=i===b.menuIdx?'#e63946':'#1b1f3a'; if(i===b.menuIdx) ctx.fillText('▶',cx-9,cy); ctx.fillText(label,cx,cy); });
  ctx.fillStyle='#1b1f3a'; ctx.fillText('Vad ska du',10,134); ctx.fillText('göra?',10,148);
}
function drawMoveMenu(){
  const b=battle; ctx.font='6px "Press Start 2P", monospace'; ctx.textAlign='left';
  b.me.moves.forEach((m,i)=>{ const cx=14+(i%2)*112, cy=134+((i/2)|0)*16; ctx.fillStyle=i===b.moveIdx?'#e63946':'#1b1f3a'; if(i===b.moveIdx) ctx.fillText('▶',cx-8,cy); ctx.fillText(m.name,cx,cy); });
  const m=b.me.moves[b.moveIdx]; ctx.fillStyle=TYPES[m.type]||'#888'; ctx.fillText('TYP: '+(m.type==='none'?'STYLE':m.type.toUpperCase()),150,150);
}

// ---- Dialog (design space) ----
function drawDialog(){
  const d=dialog;
  drawPanel(4,118,DW-8,38);
  ctx.fillStyle='#1b1f3a'; ctx.font='7px "Press Start 2P", monospace'; ctx.textAlign='left';
  wrapText(d.lines[d.i].slice(0,d.char),14,134,DW-28,12);
  if(d.char>=d.lines[d.i].length && (T*3|0)%2===0) ctx.fillText('▾',DW-18,150);
}
function wrapText(text,x,y,maxW,lh){
  const words=text.split(' '); let line='', yy=y;
  for(const w of words){ const test=line?line+' '+w:w; if(ctx.measureText(test).width>maxW && line){ ctx.fillText(line,x,yy); line=w; yy+=lh; } else line=test; }
  ctx.fillText(line,x,yy);
}

// ---- shared draw helpers ----
function drawCapsuleBig(cx,cy,wob){
  const s=12, x=cx-s/2+(wob||0), y=cy-s/2;
  px(x,y,s,s/2,'#e63946'); px(x,y+s/2,s,s/2,'#f4f4f4'); px(x,y+s/2-1,s,2,'#1b1f3a');
  px(x+1,y+1,s-4,1,'#ff8a94'); px(x+s/2-2,y+s/2-2,4,4,'#cdd6f4'); px(x+s/2-1,y+s/2-1,2,2,'#7a86b6');
  ctx.strokeStyle='#1b1f3a'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,s-1,s-1);
}
function drawSparkle(x,y,r,c){ ctx.fillStyle=c; ctx.fillRect(x-1,y-r,2,r*2); ctx.fillRect(x-r,y-1,r*2,2); }
function hitSpark(cx,cy){ for(let i=0;i<5;i++){ const a=i/5*Math.PI*2+T*10; drawSparkle(cx+Math.cos(a)*6,cy+Math.sin(a)*6,3,'#fff'); } drawSparkle(cx,cy,4,'#ffd166'); }
function cloud(cx,cy,r){ ctx.beginPath(); ctx.ellipse(cx,cy,r,r*0.6,0,0,Math.PI*2); ctx.ellipse(cx+r,cy+2,r*0.8,r*0.5,0,0,Math.PI*2); ctx.ellipse(cx-r,cy+2,r*0.7,r*0.45,0,0,Math.PI*2); ctx.fill(); }

// ---------- math helpers ----------
function lerp(a,b,t){ return a+(b-a)*t; }
function ease(t){ return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2; }
function clampAbs(v,max){ return Math.max(-max,Math.min(max,v)); }
function shade(hex,amt){ const n=parseInt(hex.slice(1),16); let r=(n>>16)&255,g=(n>>8)&255,b=n&255; if(amt<0){ const f=1+amt; r*=f; g*=f; b*=f; } else { r+=(255-r)*amt; g+=(255-g)*amt; b+=(255-b)*amt; } return `rgb(${r|0},${g|0},${b|0})`; }

// ---------- main loop ----------
let last=performance.now();
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now; T+=dt;
  if(state==='title') updateTitle(dt);
  else if(state==='choose') updateChoose();
  else if(state==='world') updateWorld(dt);
  else if(state==='battle') updateBattle(dt);
  for(const k in pressed) pressed[k]=false;
  draw();
  requestAnimationFrame(loop);
}
fitCanvas();
requestAnimationFrame(loop);

})();
