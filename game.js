/* ============================================================
   CapQuest — a tiny cap-catching RPG (Pokémon-style demo)
   Internal resolution: 240x160 (GBA). Pixel-perfect upscaling.
   ============================================================ */
(() => {
'use strict';

// ---------- Canvas & scaling ----------
const VW = 240, VH = 160;          // virtual screen size
const TILE = 16, MAP_W = 15, MAP_H = 10;
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function fitCanvas() {
  const pad = 24;
  const maxW = window.innerWidth - pad;
  const maxH = window.innerHeight - (isTouch ? 220 : 90);
  let scale = Math.max(1, Math.floor(Math.min(maxW / VW, maxH / VH)));
  canvas.style.width = (VW * scale) + 'px';
  canvas.style.height = (VH * scale) + 'px';
}
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add('touch');
window.addEventListener('resize', fitCanvas);

// ---------- Input ----------
const keys = {};               // logical buttons: up,down,left,right,a,b
const KEYMAP = {
  ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
  w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right',
  z:'a', Z:'a', Enter:'a', ' ':'a',
  x:'b', X:'b', Backspace:'b', Escape:'b'
};
const pressed = {};            // edge-triggered (just pressed this frame)
function setKey(btn, val) {
  if (val && !keys[btn]) pressed[btn] = true;
  keys[btn] = val;
}
window.addEventListener('keydown', e => {
  const b = KEYMAP[e.key];
  if (b) { setKey(b, true); e.preventDefault(); }
});
window.addEventListener('keyup', e => {
  const b = KEYMAP[e.key];
  if (b) { setKey(b, false); e.preventDefault(); }
});
function bindTouch(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const on = e => { e.preventDefault(); setKey(btn, true); };
  const off = e => { e.preventDefault(); setKey(btn, false); };
  el.addEventListener('touchstart', on, {passive:false});
  el.addEventListener('touchend', off, {passive:false});
  el.addEventListener('touchcancel', off, {passive:false});
  el.addEventListener('mousedown', on);
  el.addEventListener('mouseup', off);
  el.addEventListener('mouseleave', off);
}
bindTouch('dpad-up','up'); bindTouch('dpad-down','down');
bindTouch('dpad-left','left'); bindTouch('dpad-right','right');
bindTouch('btn-a','a'); bindTouch('btn-b','b');
function consume(btn) { if (pressed[btn]) { pressed[btn] = false; return true; } return false; }

// ---------- Sprite manager (image with drawn fallback) ----------
const SPRITES = {};
function loadSprite(name, src) {
  const img = new Image();
  img.onload = () => { SPRITES[name] = img; };
  img.onerror = () => {};      // fall back to drawn art
  img.src = src;
}
loadSprite('cap_snapback', 'assets/cap_snapback.png');
loadSprite('cap_camp',     'assets/cap_camp.png');
loadSprite('cap_bucket',   'assets/cap_bucket.png');
loadSprite('player',       'assets/player.png');
loadSprite('capsule',      'assets/capsule.png');

function drawSpriteFit(name, x, y, w, h, fallback) {
  const img = SPRITES[name];
  if (img && img.complete && img.naturalWidth) {
    ctx.drawImage(img, x, y, w, h);
  } else if (fallback) {
    fallback(x, y, w, h);
  }
}

// ---------- Cap species data ----------
// Three starter-able species. Types form a cycle: Street > Outdoor > Classic > Street
const TYPES = { Street:'#e76f51', Outdoor:'#2a9d8f', Classic:'#e9c46a' };
function typeMultiplier(atk, def) {
  if (atk === def) return 1;
  const wins = { Street:'Outdoor', Outdoor:'Classic', Classic:'Street' };
  if (wins[atk] === def) return 1.5;
  return 0.66;
}

const SPECIES = {
  snapback: {
    id:'snapback', name:'SNAPBACK', sprite:'cap_snapback', type:'Street',
    color:'#26416b', accent:'#ffffff',
    base:{hp:32, atk:12, def:8, spd:11},
    moves:['flatbrim','taunt']
  },
  camp: {
    id:'camp', name:'5-PANEL', sprite:'cap_camp', type:'Outdoor',
    color:'#5f6f3a', accent:'#cdd6a0',
    base:{hp:30, atk:10, def:11, spd:9},
    moves:['trailgust','taunt']
  },
  bucket: {
    id:'bucket', name:'BUCKET', sprite:'cap_bucket', type:'Classic',
    color:'#c9b187', accent:'#8a7250',
    base:{hp:36, atk:9, def:12, spd:7},
    moves:['brimslam','taunt']
  }
};

const MOVES = {
  flatbrim:  { name:'FLAT BRIM', type:'Street',  power:11, acc:0.95 },
  trailgust: { name:'TRAIL GUST',type:'Outdoor', power:11, acc:0.95 },
  brimslam:  { name:'BRIM SLAM', type:'Classic', power:12, acc:0.9  },
  taunt:     { name:'STYLE FLEX',type:'none',    power:6,  acc:1.0  }
};

// ---------- Cap instance ----------
function statAt(base, level) { return Math.floor(base + base * (level-1) * 0.18); }
function makeCap(speciesId, level) {
  const sp = SPECIES[speciesId];
  const maxHp = statAt(sp.base.hp, level) + level * 2;
  return {
    species: sp, level,
    maxHp, hp: maxHp,
    atk: statAt(sp.base.atk, level),
    def: statAt(sp.base.def, level),
    spd: statAt(sp.base.spd, level),
    xp: 0, xpNext: level * 12,
    moves: sp.moves.map(m => MOVES[m])
  };
}

// ---------- Player / save state ----------
const player = {
  tx: 7, ty: 7,           // tile position
  px: 7*TILE, py: 7*TILE, // pixel position (for smooth walking)
  dir: 'down',
  moving: false, mvFrom:null, mvTo:null, mvT:0,
  walkFrame: 0, walkTimer: 0,
  party: [],              // owned caps
  capsule: 8,             // catch items
  caught: {}              // species id -> true (capdex)
};

// ---------- Map ----------
// 0 grass, 1 tall grass (encounter), 2 tree (solid), 3 path, 4 fence (solid)
const M = [
 [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
 [2,0,0,0,1,1,1,1,1,0,0,0,0,0,2],
 [2,0,0,1,1,1,1,1,1,1,0,0,2,0,2],
 [2,0,1,1,1,1,1,1,1,1,1,0,0,0,2],
 [2,0,0,1,1,1,1,1,1,1,0,0,0,0,2],
 [2,0,0,0,1,1,1,1,1,0,0,0,0,0,2],
 [2,0,0,0,0,3,3,3,0,0,0,0,0,0,2],
 [2,0,0,0,0,3,0,3,0,0,0,2,0,0,2],
 [2,0,0,0,0,3,3,3,0,0,0,0,0,0,2],
 [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
];
function tileAt(tx, ty) {
  if (tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) return 2;
  return M[ty][tx];
}
function solid(tx, ty) {
  const t = tileAt(tx, ty);
  if (t === 2 || t === 4) return true;
  if (npc.active && npc.tx===tx && npc.ty===ty) return true;
  return false;
}

// ---------- NPC trainer ----------
const npc = {
  active: true, defeated: false,
  tx: 11, ty: 7, dir:'down',
  name:'KEPS-KENT',
  capId:'camp', capLevel:6
};

// ============================================================
//  GAME STATE MACHINE
// ============================================================
let state = 'title';   // title | choose | world | battle
let battle = null;
let dialog = null;     // {lines:[], i, char, t, onDone}

function say(lines, onDone) {
  dialog = { lines: Array.isArray(lines)?lines:[lines], i:0, char:0, t:0, onDone };
}

// ---------- Title ----------
let titleBlink = 0;
function updateTitle(dt) {
  titleBlink += dt;
  if (consume('a')) { state = 'choose'; chooseIdx = 0; }
}

// ---------- Starter choice ----------
let chooseIdx = 0;
const STARTERS = ['snapback','camp','bucket'];
function updateChoose() {
  if (consume('left'))  chooseIdx = (chooseIdx+2)%3;
  if (consume('right')) chooseIdx = (chooseIdx+1)%3;
  if (consume('a')) {
    const id = STARTERS[chooseIdx];
    player.party = [ makeCap(id, 5) ];
    player.caught[id] = true;
    state = 'world';
    say([`Du valde ${SPECIES[id].name}!`,
         'Gå i det höga gräset för',
         'att hitta vilda kepsar.']);
  }
}

// ============================================================
//  OVERWORLD
// ============================================================
const STEP_TIME = 0.14;
function updateWorld(dt) {
  if (dialog) { updateDialog(); return; }

  if (player.moving) {
    player.mvT += dt / STEP_TIME;
    player.walkTimer += dt;
    if (player.walkTimer > 0.07) { player.walkTimer = 0; player.walkFrame ^= 1; }
    if (player.mvT >= 1) {
      player.moving = false; player.mvT = 0; player.walkFrame = 0;
      player.tx = player.mvTo.x; player.ty = player.mvTo.y;
      player.px = player.tx*TILE; player.py = player.ty*TILE;
      // arrived: encounter check
      if (tileAt(player.tx, player.ty) === 1 && Math.random() < 0.16) {
        startWildBattle();
        return;
      }
    } else {
      player.px = lerp(player.mvFrom.x, player.mvTo.x, ease(player.mvT)) * TILE;
      player.py = lerp(player.mvFrom.y, player.mvTo.y, ease(player.mvT)) * TILE;
      return;
    }
  }

  let d = null;
  if (keys.up) d='up'; else if (keys.down) d='down';
  else if (keys.left) d='left'; else if (keys.right) d='right';

  // A button interacts with facing tile (talk to trainer)
  if (consume('a')) tryInteract();

  if (d) {
    player.dir = d;
    const nx = player.tx + (d==='left'?-1:d==='right'?1:0);
    const ny = player.ty + (d==='up'?-1:d==='down'?1:0);
    if (!solid(nx, ny)) {
      player.moving = true; player.mvT = 0;
      player.mvFrom = {x:player.tx, y:player.ty};
      player.mvTo   = {x:nx, y:ny};
    } else if (npc.active && npc.tx===nx && npc.ty===ny) {
      faceTrainer();
    }
  }
}

function facingTile() {
  const d = player.dir;
  return { x: player.tx + (d==='left'?-1:d==='right'?1:0),
           y: player.ty + (d==='up'?-1:d==='down'?1:0) };
}
function tryInteract() {
  const f = facingTile();
  if (npc.active && npc.tx===f.x && npc.ty===f.y) faceTrainer();
}
function faceTrainer() {
  if (npc.defeated) {
    say([`${npc.name}: Snyggt fångat!`, 'Samla alla kepsarna!']);
  } else {
    say([`${npc.name}: En keps-duell!`, 'Visa vad din keps går för!'],
        () => startTrainerBattle());
  }
}

// ============================================================
//  BATTLE
// ============================================================
function startWildBattle() {
  const pool = ['snapback','camp','bucket'];
  const id = pool[(Math.random()*pool.length)|0];
  const lvl = 3 + (Math.random()*4|0);
  beginBattle(makeCap(id, lvl), true, null);
  say([`En vild ${SPECIES[id].name} dök upp!`]);
}
function startTrainerBattle() {
  beginBattle(makeCap(npc.capId, npc.capLevel), false, npc.name);
  say([`${npc.name} skickar ut`, `${SPECIES[npc.capId].name}!`]);
}
function activeCap() { return player.party.find(c => c.hp > 0) || player.party[0]; }

function beginBattle(enemy, isWild, trainerName) {
  state = 'battle';
  battle = {
    enemy, isWild, trainerName,
    me: activeCap(),
    phase: 'intro',         // intro|menu|fight|run|resolve|catch|end
    menuIdx: 0, moveIdx: 0,
    msg: null, msgQueue: [],
    shake: 0, flashMe:0, flashEn:0,
    capAnim: 0, result: null,
    enemyMaxHp: enemy.maxHp,
    meHpShown: 0, enHpShown: 0
  };
  battle.meHpShown = battle.me.hp;
  battle.enHpShown = enemy.hp;
}

const BMENU = ['STRID','FÅNGA','BYT','FLY'];
function updateBattle(dt) {
  const b = battle;
  if (b.shake>0) b.shake = Math.max(0, b.shake - dt*60);
  if (b.flashMe>0) b.flashMe -= dt; if (b.flashEn>0) b.flashEn -= dt;
  // animate hp bars toward real value
  b.meHpShown += clampAbs(b.me.hp - b.meHpShown, dt*40);
  b.enHpShown += clampAbs(b.enemy.hp - b.enHpShown, dt*40);

  if (dialog) { updateDialog(); return; }

  switch (b.phase) {
    case 'intro':
      b.phase = 'menu'; break;

    case 'menu': {
      const cols = 2;
      if (consume('left')  && b.menuIdx%2===1) b.menuIdx--;
      if (consume('right') && b.menuIdx%2===0) b.menuIdx++;
      if (consume('up')    && b.menuIdx>=2)    b.menuIdx-=2;
      if (consume('down')  && b.menuIdx<2)     b.menuIdx+=2;
      if (consume('a')) {
        if (b.menuIdx===0) { b.phase='fight'; b.moveIdx=0; }
        else if (b.menuIdx===1) tryCatch();
        else if (b.menuIdx===2) trySwitch();
        else if (b.menuIdx===3) tryRun();
      }
      break;
    }
    case 'fight': {
      const n = b.me.moves.length;
      if (consume('up')   && b.moveIdx>=2) b.moveIdx-=2;
      if (consume('down') && b.moveIdx+2<n) b.moveIdx+=2;
      if (consume('left') && b.moveIdx%2===1) b.moveIdx--;
      if (consume('right')&& b.moveIdx%2===0 && b.moveIdx+1<n) b.moveIdx++;
      if (consume('b')) b.phase='menu';
      if (consume('a')) doTurn(b.me.moves[b.moveIdx]);
      break;
    }
    case 'end':
      if (consume('a')) finishBattle();
      break;
  }
}

function enemyMove() {
  const b = battle;
  return b.enemy.moves[(Math.random()*b.enemy.moves.length)|0];
}

function calcDamage(attacker, defender, move) {
  if (move.power<=0) return 0;
  const mult = move.type==='none' ? 1 : typeMultiplier(move.type, defender.species.type);
  const base = (attacker.atk * move.power) / (defender.def + 18);
  const dmg = Math.max(1, Math.floor(base * mult * (0.85 + Math.random()*0.3)));
  return { dmg, mult };
}

function doTurn(myMove) {
  const b = battle;
  b.phase = 'resolve';
  const enMove = enemyMove();
  const meFirst = b.me.spd >= b.enemy.spd;
  const order = meFirst
    ? [['me', myMove], ['en', enMove]]
    : [['en', enMove], ['me', myMove]];
  runActions(order, 0);
}

function runActions(order, i) {
  const b = battle;
  if (i >= order.length) {
    if (b.me.hp<=0 || b.enemy.hp<=0) { checkBattleEnd(); }
    else b.phase = 'menu';
    return;
  }
  const [who, move] = order[i];
  const atk = who==='me' ? b.me : b.enemy;
  const def = who==='me' ? b.enemy : b.me;
  if (atk.hp<=0) { runActions(order, i+1); return; }

  const name = who==='me' ? atk.species.name : (b.isWild?'Vild ':'Fiendens ')+atk.species.name;
  const hit = Math.random() <= move.acc;
  if (!hit) {
    say([`${name} använde ${move.name}!`, 'Men det missade!'], () => runActions(order, i+1));
    return;
  }
  const { dmg, mult } = calcDamage(atk, def, move);
  def.hp = Math.max(0, def.hp - dmg);
  if (who==='me') { b.flashEn = 0.25; b.shake = 6; } else { b.flashMe = 0.25; b.shake = 6; }
  const eff = mult>1 ? ' Träffsäkert!' : (mult<1 ? ' Föga effektivt...' : '');
  const lines = [`${name} använde ${move.name}!`];
  if (eff) lines.push(eff.trim());
  say(lines, () => {
    if (def.hp<=0) checkBattleEnd();
    else runActions(order, i+1);
  });
}

function checkBattleEnd() {
  const b = battle;
  if (b.enemy.hp<=0) {
    const xp = b.enemy.level * 6 + 4;
    gainXp(b.me, xp);
    b.result = 'win';
    const lines = [`${b.isWild?'Vild ':''}${b.enemy.species.name} föll!`,
                   `${b.me.species.name} fick ${xp} EP.`];
    if (b._leveled) lines.push(`${b.me.species.name} gick upp till nivå ${b.me.level}!`);
    b.phase='end';
    say(lines);
  } else if (b.me.hp<=0) {
    // try next cap
    const next = player.party.find(c => c.hp>0);
    if (next) {
      b.me = next; b.meHpShown = next.hp;
      say([`${b.me.species.name}, din tur!`], () => b.phase='menu');
    } else {
      b.result='lose'; b.phase='end';
      say(['Alla dina kepsar svimmade...','Du skyndar hem och vårdar dem.']);
    }
  } else {
    b.phase='menu';
  }
}

function gainXp(cap, amount) {
  battle._leveled = false;
  cap.xp += amount;
  while (cap.xp >= cap.xpNext && cap.level < 50) {
    cap.xp -= cap.xpNext;
    cap.level++;
    cap.xpNext = cap.level * 12;
    const sp = cap.species;
    const newMax = statAt(sp.base.hp, cap.level) + cap.level*2;
    cap.hp += (newMax - cap.maxHp);
    cap.maxHp = newMax;
    cap.atk = statAt(sp.base.atk, cap.level);
    cap.def = statAt(sp.base.def, cap.level);
    cap.spd = statAt(sp.base.spd, cap.level);
    battle._leveled = true;
  }
}

function tryCatch() {
  const b = battle;
  if (!b.isWild) { say(['Man kan inte fånga','en annan tränares keps!']); return; }
  if (player.capsule<=0) { say(['Du har inga CAPSULES kvar!']); return; }
  player.capsule--;
  b.phase='resolve';
  // catch chance: higher when enemy HP low
  const hpFrac = b.enemy.hp / b.enemyMaxHp;
  const chance = Math.min(0.92, 0.45 + (1 - hpFrac) * 0.5);
  b.capAnim = 1;
  say(['Du kastar en CAPSULE!'], () => {
    if (Math.random() < chance) {
      const caught = b.enemy;
      caught.hp = caught.maxHp;
      const fresh = makeCap(caught.species.id, caught.level);
      player.party.push(fresh);
      const isNew = !player.caught[caught.species.id];
      player.caught[caught.species.id] = true;
      b.result='caught'; b.phase='end';
      const lines = [`${caught.species.name} fångades!`];
      if (isNew) lines.push('Ny post i CAPDEX!');
      say(lines);
    } else {
      b.capAnim = 0;
      say([`${b.enemy.species.name} slet sig loss!`], () => {
        // enemy gets a turn
        b.phase='resolve';
        runActions([['en', enemyMove()]], 0);
      });
    }
  });
}

function trySwitch() {
  const b = battle;
  const others = player.party.filter(c => c!==b.me && c.hp>0);
  if (others.length===0) { say(['Du har ingen annan','frisk keps!']); return; }
  // simple: cycle to next healthy cap
  b.me = others[0]; b.meHpShown = b.me.hp;
  say([`Kom igen, ${b.me.species.name}!`], () => {
    b.phase='resolve';
    runActions([['en', enemyMove()]], 0);
  });
}

function tryRun() {
  const b = battle;
  if (!b.isWild) { say(['Man kan inte fly från','en keps-duell!']); return; }
  if (Math.random() < 0.7) {
    b.result='run'; b.phase='end';
    say(['Du kom undan!']);
  } else {
    say(['Du kom inte undan!'], () => {
      b.phase='resolve';
      runActions([['en', enemyMove()]], 0);
    });
  }
}

function finishBattle() {
  const b = battle;
  if (b.result==='win' && !b.isWild && !npc.defeated) {
    npc.defeated = true;
    state='world';
    healParty();
    say([`Du besegrade ${npc.name}!`, 'Dina kepsar vilade upp sig.']);
    battle=null; return;
  }
  if (b.result==='lose') healParty();
  state='world';
  battle=null;
}
function healParty(){ player.party.forEach(c=>c.hp=c.maxHp); }

// ============================================================
//  DIALOG
// ============================================================
function updateDialog() {
  const d = dialog;
  const line = d.lines[d.i];
  d.t += 1;
  if (d.char < line.length) {
    if (d.t % 1 === 0) d.char += 2;             // typewriter speed
    if (d.char > line.length) d.char = line.length;
    if (consume('a')) d.char = line.length;     // skip to full line
  } else if (consume('a') || consume('b')) {
    d.i++;
    if (d.i >= d.lines.length) {
      const cb = d.onDone; dialog = null;
      if (cb) cb();
    } else { d.char = 0; }
  }
}

// ============================================================
//  RENDERING
// ============================================================
function clear(c){ ctx.fillStyle=c; ctx.fillRect(0,0,VW,VH); }
function px(x,y,w,h,c){ ctx.fillStyle=c; ctx.fillRect(x|0,y|0,w,h); }

function draw() {
  if (state==='title') return drawTitle();
  if (state==='choose') return drawChoose();
  drawWorld();
  if (state==='battle') drawBattle();
  if (dialog) drawDialog();
}

// ---- Title ----
function drawTitle() {
  clear('#9ad07a');
  // playful background of caps
  for (let i=0;i<8;i++){
    const x = ((i*53)%240), y=20+((i*37)%80);
    drawCapMini(x, y, ['#26416b','#5f6f3a','#c9b187'][i%3]);
  }
  // banner
  px(20,52,200,42,'#1b1f3a'); px(22,54,196,38,'#2b3566');
  ctx.fillStyle='#ffd166'; ctx.font='16px "Press Start 2P", monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('CapQuest', 120, 70);
  ctx.fillStyle='#cdd6f4'; ctx.font='6px "Press Start 2P", monospace';
  ctx.fillText('FÅNGA · DUELLERA · SAMLA', 120, 84);
  if ((titleBlink*2|0)%2===0){
    ctx.fillStyle='#fff'; ctx.font='7px "Press Start 2P", monospace';
    ctx.fillText('TRYCK A FÖR ATT BÖRJA', 120, 120);
  }
  ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}

// ---- Choose starter ----
function drawChoose() {
  clear('#2b3566');
  ctx.fillStyle='#fff'; ctx.font='8px "Press Start 2P", monospace';
  ctx.textAlign='center';
  ctx.fillText('VÄLJ DIN FÖRSTA KEPS', 120, 22);
  STARTERS.forEach((id,i)=>{
    const sp=SPECIES[id];
    const x=40+i*66, y=64;
    const sel=i===chooseIdx;
    if (sel){ px(x-26,y-30,52,62,'#ffd166'); }
    px(x-23,y-27,46,56,'#1b1f3a');
    drawCapBig(id, x-16, y-22, 32, 0);
    ctx.fillStyle = sel?'#ffd166':'#9aa3c4';
    ctx.font='6px "Press Start 2P", monospace';
    ctx.fillText(sp.name, x, y+24);
    ctx.fillStyle=TYPES[sp.type];
    ctx.fillText(sp.type, x, y+40);
  });
  ctx.fillStyle='#cdd6f4'; ctx.font='6px "Press Start 2P", monospace';
  ctx.fillText('◀ ▶ välj   A bekräfta', 120, 132);
  ctx.textAlign='left';
}

// ---- World ----
function drawWorld() {
  clear('#79b35a');
  for (let y=0;y<MAP_H;y++) for (let x=0;x<MAP_W;x++) drawTile(x,y,M[y][x]);
  // NPC
  if (npc.active) drawTrainer(npc.tx*TILE, npc.ty*TILE);
  // Player
  drawPlayer(player.px, player.py);
  // HUD: capsule + capdex
  drawWorldHud();
}

function drawTile(x,y,t){
  const X=x*TILE, Y=y*TILE;
  if (t===2){ // tree
    px(X,Y,TILE,TILE,'#5a8a44');
    px(X+2,Y+1,12,11,'#2f6b34');
    px(X+4,Y+3,8,7,'#3f7d42');
    px(X+6,Y+12,4,4,'#6b4a2a');
  } else if (t===3){ // path
    px(X,Y,TILE,TILE,'#caa771');
    px(X+3,Y+5,2,2,'#b8945e'); px(X+10,Y+9,2,2,'#b8945e');
  } else if (t===1){ // tall grass
    px(X,Y,TILE,TILE,'#5fa047');
    ctx.fillStyle='#3c7a32';
    for (let i=0;i<5;i++){ const gx=X+2+i*3; ctx.fillRect(gx,Y+8,2,7); ctx.fillRect(gx+1,Y+5,1,4); }
  } else { // grass
    px(X,Y,TILE,TILE,'#79b35a');
    px(X+4,Y+10,2,1,'#6aa34d'); px(X+11,Y+4,2,1,'#6aa34d');
  }
}

function drawWorldHud(){
  px(2,2,86,14,'rgba(20,24,46,0.85)');
  drawCapsuleIcon(5,5);
  ctx.fillStyle='#fff'; ctx.font='6px "Press Start 2P", monospace'; ctx.textAlign='left';
  ctx.fillText('x'+player.capsule, 16, 11);
  const dex = Object.keys(player.caught).length;
  ctx.fillStyle='#ffd166';
  ctx.fillText('CAPDEX '+dex+'/3', 38, 11);
}

// ---- Sprites (drawn fallbacks + image override) ----
function drawCapsuleIcon(x,y){
  drawSpriteFit('capsule', x, y, 9, 9, ()=>{
    px(x,y,9,9,'#1b1f3a'); px(x,y,9,4,'#e63946'); px(x,y+4,9,1,'#1b1f3a');
    px(x+3,y+3,3,3,'#fff');
  });
}
function drawCapMini(x,y,color){
  px(x+1,y+3,12,4,color); px(x+1,y+6,16,2,'#1b1f3a'); px(x+4,y+1,7,3,color);
}
function capFallback(id){
  return (x,y,w,h)=>{
    const sp=SPECIES[id]; const u=w/16;
    // crown
    ctx.fillStyle=sp.color; ctx.fillRect(x+3*u,y+3*u,10*u,6*u);
    ctx.fillRect(x+4*u,y+2*u,8*u,2*u);
    // front panel / accent
    ctx.fillStyle=sp.accent; ctx.fillRect(x+5*u,y+4*u,6*u,4*u);
    // brim
    ctx.fillStyle=sp.color; ctx.fillRect(x+2*u,y+9*u,13*u,2*u);
    // eyes
    ctx.fillStyle='#1b1f3a'; ctx.fillRect(x+6*u,y+5*u,1.5*u,2*u); ctx.fillRect(x+9*u,y+5*u,1.5*u,2*u);
    // feet
    ctx.fillStyle='#3a2a1a'; ctx.fillRect(x+5*u,y+12*u,2*u,2*u); ctx.fillRect(x+9*u,y+12*u,2*u,2*u);
  };
}
function drawCapBig(id,x,y,size){
  drawSpriteFit(SPECIES[id].sprite, x, y, size, size, capFallback(id));
}

function drawPlayer(px_,py_){
  const x=px_, y=py_;
  drawSpriteFit('player', x-2, y-6, 20, 22, (X,Y)=>{
    // fallback chibi trainer
    px(x+4,y-4,8,6,'#e63946');           // cap
    px(x+3,y-1,10,2,'#e63946');          // brim
    px(x+5,y+1,6,4,'#f1c27d');           // face
    px(x+6,y+2,1,1,'#000'); px(x+9,y+2,1,1,'#000');
    px(x+4,y+5,8,6,'#3a6ea5');           // body
    px(x+4,y+11,3,3,'#222'); px(x+9,y+11,3,3,'#222'); // legs
  });
}
function drawTrainer(x,y){
  drawSpriteFit('npc', x-2, y-6, 20, 22, (X,Y)=>{
    px(x+4,y-4,8,6,'#5f6f3a');
    px(x+3,y-1,10,2,'#5f6f3a');
    px(x+5,y+1,6,4,'#f1c27d');
    px(x+6,y+2,1,1,'#000'); px(x+9,y+2,1,1,'#000');
    px(x+4,y+5,8,6,'#7a4a2a');
    px(x+4,y+11,3,3,'#222'); px(x+9,y+11,3,3,'#222');
  });
  if (!npc.defeated){
    ctx.fillStyle='#ffd166'; ctx.font='8px "Press Start 2P", monospace'; ctx.textAlign='center';
    if ((performance.now()/400|0)%2===0) ctx.fillText('!', x+8, y-7);
    ctx.textAlign='left';
  }
}

// ---- Battle ----
function drawBattle(){
  const b=battle;
  const sh = b.shake>0 ? (Math.random()*b.shake-b.shake/2) : 0;
  clear('#e8f0d8');
  // ground arcs
  px(0,0,VW,VH,'#dfeac8');
  ctx.fillStyle='#bcd49a'; ctx.beginPath();
  ctx.ellipse(176,56,40,12,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(58,120,46,14,0,0,Math.PI*2); ctx.fill();

  // enemy (top right)
  if (b.flashEn<=0 || (b.flashEn*20|0)%2===0){
    if (b.capAnim>0){
      // shrinking into capsule
    } else {
      drawCapBig(b.enemy.species.id, 154+sh, 24, 44);
    }
  }
  // capsule throw anim
  if (b.capAnim>0) drawCapsuleIcon(170, 36);

  // me (bottom left, back) — reuse sprite a bit bigger
  if (b.flashMe<=0 || (b.flashMe*20|0)%2===0){
    drawCapBig(b.me.species.id, 34, 86, 52);
  }

  // info boxes
  drawHpBox(12, 12, b.enemy, b.enHpShown, false);
  drawHpBox(128, 78, b.me, b.meHpShown, true);

  // bottom panel
  drawPanel(0,118,VW,42);
  if (dialog){ /* dialog drawn separately */ }
  else if (b.phase==='menu') drawBattleMenu();
  else if (b.phase==='fight') drawMoveMenu();
  else if (b.phase==='end'){
    ctx.fillStyle='#1b1f3a'; ctx.font='7px "Press Start 2P", monospace'; ctx.textAlign='left';
    ctx.fillText('Tryck A...', 12, 142);
  }
}

function drawHpBox(x,y,cap,shown,mine){
  drawPanel(x,y,100,26);
  ctx.fillStyle='#1b1f3a'; ctx.font='6px "Press Start 2P", monospace'; ctx.textAlign='left';
  ctx.fillText(cap.species.name, x+6, y+9);
  ctx.fillText('N'+cap.level, x+78, y+9);
  // hp bar
  px(x+6,y+14,80,5,'#1b1f3a'); px(x+7,y+15,78,3,'#5a5a5a');
  const frac = Math.max(0, shown/cap.maxHp);
  const col = frac>0.5?'#3ddc84':frac>0.2?'#ffd166':'#e63946';
  px(x+7,y+15, (78*frac)|0, 3, col);
  if (mine){
    ctx.fillStyle='#1b1f3a';
    ctx.fillText(Math.ceil(shown)+'/'+cap.maxHp, x+44, y+25);
  }
}

function drawPanel(x,y,w,h){
  px(x,y,w,h,'#f7f7e8');
  ctx.strokeStyle='#1b1f3a'; ctx.lineWidth=2;
  ctx.strokeRect(x+1,y+1,w-2,h-2);
  ctx.strokeStyle='#7a86b6';
  ctx.strokeRect(x+3,y+3,w-6,h-6);
}

function drawBattleMenu(){
  const b=battle;
  ctx.font='7px "Press Start 2P", monospace'; ctx.textAlign='left';
  BMENU.forEach((label,i)=>{
    const cx=130+(i%2)*54, cy=134+((i/2)|0)*16;
    ctx.fillStyle = i===b.menuIdx?'#e63946':'#1b1f3a';
    if (i===b.menuIdx) ctx.fillText('▶', cx-9, cy);
    ctx.fillText(label, cx, cy);
  });
  // prompt
  ctx.fillStyle='#1b1f3a';
  ctx.fillText('Vad ska du', 10, 134);
  ctx.fillText('göra?', 10, 148);
}

function drawMoveMenu(){
  const b=battle;
  ctx.font='6px "Press Start 2P", monospace'; ctx.textAlign='left';
  b.me.moves.forEach((m,i)=>{
    const cx=14+(i%2)*112, cy=134+((i/2)|0)*16;
    ctx.fillStyle = i===b.moveIdx?'#e63946':'#1b1f3a';
    if (i===b.moveIdx) ctx.fillText('▶', cx-8, cy);
    ctx.fillText(m.name, cx, cy);
  });
  const m=b.me.moves[b.moveIdx];
  ctx.fillStyle=TYPES[m.type]||'#888';
  ctx.fillText('TYP: '+(m.type==='none'?'STYLE':m.type.toUpperCase()), 150, 150);
}

// ---- Dialog box ----
function drawDialog(){
  const d=dialog;
  drawPanel(4,118,VW-8,38);
  ctx.fillStyle='#1b1f3a'; ctx.font='7px "Press Start 2P", monospace'; ctx.textAlign='left';
  const line=d.lines[d.i].slice(0,d.char);
  wrapText(line, 14, 134, VW-28, 12);
  if (d.char>=d.lines[d.i].length && (performance.now()/300|0)%2===0){
    ctx.fillText('▾', VW-18, 150);
  }
}
function wrapText(text,x,y,maxW,lh){
  const words=text.split(' '); let line=''; let yy=y;
  for (const w of words){
    const test=line?line+' '+w:w;
    if (ctx.measureText(test).width>maxW && line){ ctx.fillText(line,x,yy); line=w; yy+=lh; }
    else line=test;
  }
  ctx.fillText(line,x,yy);
}

// ---------- helpers ----------
function lerp(a,b,t){ return a+(b-a)*t; }
function ease(t){ return t; }
function clampAbs(v,max){ return Math.max(-max, Math.min(max, v)); }

// ---------- main loop ----------
let last=performance.now();
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  if (state==='title') updateTitle(dt);
  else if (state==='choose') updateChoose();
  else if (state==='world') updateWorld(dt);
  else if (state==='battle') updateBattle(dt);
  // clear edge-press leftovers
  for (const k in pressed) pressed[k]=false;
  draw();
  requestAnimationFrame(loop);
}
fitCanvas();
requestAnimationFrame(loop);

})();
