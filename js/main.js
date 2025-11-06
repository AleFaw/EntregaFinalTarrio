// js/main.js
// Katana Neón - Versión extendida: SweetAlert2 name input, música, mejores alturas, win message, guardado con nombre.

// -------- CONFIG --------
const LOCAL_KEY = 'neonKatanaHighscores'; // guarda array de {name,score,date}
const GAME_DURATION = 90; // segundos
const INITIAL_LIVES = 3;
const SPAWN_MIN_MS = 600;
const SPAWN_MAX_MS = 1200;

// assets (opcional: si colocas imágenes en assets/fruits/ se usarán)
const ASSETS = {
  apple: 'assets/fruits/apple.png',
  orange: 'assets/fruits/orange.png',
  banana: 'assets/fruits/banana.png',
  rotten: 'assets/fruits/rotten.png',
  bomb: 'assets/fruits/bomb.png',
  music: 'assets/music/loop.mp3' // opcional
};

// -------- UI ELEMENTS --------
const menu = document.getElementById('menu');
const btnPlay = document.getElementById('btnPlay');
const btnScores = document.getElementById('btnScores');
const btnHow = document.getElementById('btnHow');
const scoreboard = document.getElementById('scoreboard');
const btnBackFromScores = document.getElementById('btnBackFromScores');
const btnClearScores = document.getElementById('btnClearScores');
const scoresList = document.getElementById('scoresList');
const menuHighscore = document.getElementById('menuHighscore');

const hudBigTimer = document.getElementById('bigTimer');
const scoreDisplay = document.getElementById('scoreDisplay');
const livesContainer = document.getElementById('lives');

const gameArea = document.getElementById('gameArea');

// -------- PIXI SETUP --------
const app = new PIXI.Application({ width: innerWidth, height: innerHeight, backgroundAlpha: 0, antialias: true, resolution: devicePixelRatio || 1 });
gameArea.appendChild(app.view);
app.view.style.position = 'fixed'; app.view.style.inset = '0'; app.view.style.zIndex = '0';

const fruitsLayer = new PIXI.Container(); app.stage.addChild(fruitsLayer);
const effectsLayer = new PIXI.Container(); app.stage.addChild(effectsLayer);
const trailLayer = new PIXI.Container(); app.stage.addChild(trailLayer);

// cached textures / loaders
const loadedTextures = {}; // name -> PIXI.Texture
const fruitTextureNames = ['apple','orange','banana','rotten','bomb'];

// helper: convert kind -> color (robusto)
function kindToColor(kindOrColor) {
  if (typeof kindOrColor === 'number') return kindOrColor;
  const map = {
    apple: 0xff6b6b,
    orange: 0xffa94d,
    banana: 0xfff07a,
    rotten: 0x9a9a9a,
    bomb: 0xff3c6b
  };
  if (typeof kindOrColor === 'string') {
    const lower = kindOrColor.toLowerCase();
    if (map[lower] !== undefined) return map[lower];
    const hex = lower.replace('#','');
    if (/^[0-9a-f]{6}$/i.test(hex)) return parseInt(hex, 16);
  }
  return 0xffffff;
}

// create fallback simple textures now (used if images missing)
function makeFruitTextureVariant(typeName){
  const g = new PIXI.Graphics();
  const r = 40;
  const palette = {
    apple: [0xff6b6b, 0xffb3b3],
    orange: [0xffa94d, 0xffd9b3],
    banana: [0xfff07a, 0xfff9c4],
    rotten: [0x8a8a8a, 0xbfbfbf],
    bomb: [0x111111, 0x444444]
  };
  const c = palette[typeName] || [0x9be9d7, 0xdafef6];
  g.beginFill(c[0]);
  g.drawCircle(0,0,r);
  g.endFill();
  g.beginFill(c[1],0.85);
  g.drawEllipse(-r*0.35, -r*0.35, r*0.6, r*0.45);
  g.endFill();
  g.beginFill(0xffffff,0.6); g.drawCircle(-r*0.45, -r*0.48, r*0.12); g.endFill();
  return app.renderer.generateTexture(g);
}
for (const n of fruitTextureNames) loadedTextures[n] = makeFruitTextureVariant(n);

// try load actual images (non-blocking). Pixi v7: PIXI.Assets
if (PIXI.Assets && typeof PIXI.Assets.load === 'function') {
  Object.entries(ASSETS).forEach(([key,url])=>{
    if (key === 'music') return; // skip music here
    PIXI.Assets.load(url).then(tex=>{
      if (tex && (tex.baseTexture || tex instanceof PIXI.Texture)) loadedTextures[key] = tex;
    }).catch(()=>{/* fallback keep */});
  });
} else {
  Object.entries(ASSETS).forEach(([key,url])=>{
    if (key === 'music') return;
    try { loadedTextures[key] = PIXI.Texture.from(url); } catch(e) {}
  });
}

// -------- GAME STATE --------
const STATE = {
  running: false,
  score: 0,
  lives: INITIAL_LIVES,
  fruits: [],
  swipes: [],
  maxSwipeLen: 20,
  spawnTimer: null,
  timeLeft: GAME_DURATION,
  timerInterval: null,
  playerName: null
};

let pointerDown = false;

// -------- SweetAlert2 loader ----------
function loadSwal(){
  return new Promise((resolve, reject) => {
    if (window.Swal) return resolve(window.Swal);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
    s.onload = () => resolve(window.Swal);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// -------- UI helpers & scores (now with name)--------
function showMenu(){ menu.classList.remove('hidden'); scoreboard.classList.add('hidden'); }
function showScores(){ menu.classList.add('hidden'); scoreboard.classList.remove('hidden'); renderScoresList(); }
function updateMenuHighscore(){ const arr = loadScores(); const top = arr.length ? arr[0] : null; menuHighscore.textContent = top ? `Mejor: ${top.name} — ${top.score} pts` : 'Aún no hay puntajes'; }
function renderScoresList(){
  const arr = loadScores();
  scoresList.innerHTML = '';
  if (!arr.length) { scoresList.innerHTML = '<div class="entry">No hay puntajes aún</div>'; return; }
  arr.slice(0,10).forEach((e,i)=>{
    const d = new Date(e.date);
    const el = document.createElement('div'); el.className='entry';
    el.innerHTML = `<div>#${i+1} <strong>${e.name}</strong> — ${e.score} pts</div><div style="opacity:0.7;font-size:12px">${d.toLocaleString()}</div>`;
    scoresList.appendChild(el);
  });
}

function loadScores(){
  try{
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveScore(score){
  const name = STATE.playerName || 'Jugador';
  const arr = loadScores();
  arr.push({name, score, date: new Date().toISOString()});
  arr.sort((a,b)=>b.score - a.score);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(arr.slice(0,50)));
  updateMenuHighscore();
}

btnClearScores.addEventListener('click', ()=>{ localStorage.removeItem(LOCAL_KEY); renderScoresList(); updateMenuHighscore(); });
btnBackFromScores.addEventListener('click', ()=> showMenu());
// Reemplaza el handler actual de "Cómo jugar" por este (usa loadSwal() definida arriba)
btnHow.addEventListener('click', async () => {
  try {
    await loadSwal(); // se asegura que Swal esté cargado
    const html = `
      <div style="display:flex;flex-direction:column;gap:12px;align-items:center;text-align:left">
        <div style="display:flex;gap:12px;align-items:center">
          <img src="assets/fruits/apple.png" alt="Manzana" style="width:56px;height:56px;object-fit:contain;border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,0.5)"/>
          <div>
            <strong>Manzana</strong><br><small>+10 puntos</small>
          </div>
        </div>

        <div style="display:flex;gap:12px;align-items:center">
          <img src="assets/fruits/banana.png" alt="Pera / Banana" style="width:56px;height:56px;object-fit:contain;border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,0.5)"/>
          <div>
            <strong>Pera / Banana</strong><br><small>+10 puntos</small>
          </div>
        </div>

        <div style="display:flex;gap:12px;align-items:center">
          <img src="assets/fruits/orange.png" alt="Naranja" style="width:56px;height:56px;object-fit:contain;border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,0.5)"/>
          <div>
            <strong>Naranja</strong><br><small>+10 puntos</small>
          </div>
        </div>

        <div style="display:flex;gap:12px;align-items:center">
          <img src="assets/fruits/rotten.png" alt="Frutilla / podrida" style="width:56px;height:56px;object-fit:contain;border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,0.5)"/>
          <div>
            <strong>Frutilla (podrida)</strong><br><small>-15 puntos</small>
          </div>
        </div>

        <div style="display:flex;gap:12px;align-items:center">
          <img src="assets/fruits/bomb.png" alt="Bomba" style="width:56px;height:56px;object-fit:contain;border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,0.5)"/>
          <div>
            <strong>Bomba</strong><br><small>Si la cortás → perdés 1 vida</small>
          </div>
        </div>

        <div style="margin-top:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04);width:100%;font-size:14px;color:#dfeffd">
          <strong>Reglas rápidas:</strong>
          <ul style="margin:8px 0 0 18px;line-height:1.4">
            <li>Tienes <strong>3 vidas</strong>. Si llegás a 0 → Game Over.</li>
            <li>El tiempo dura <strong>1:30</strong> (90 segundos).</li>
            <li>Cortá frutas arrastrando el mouse o con el dedo (clic + arrastrar / touch).</li>
            <li>Las frutas buenas suman <strong>+10</strong>, la frutilla resta <strong>-15</strong> y la bomba te quita una vida.</li>
            <li>Intenta cortar el centro (el juego es permisivo con los cortes).</li>
          </ul>
        </div>
      </div>
    `;

    Swal.fire({
      title: '<span style="color:var(--neon1)">Cómo jugar</span>',
      html,
      width: 520,
      background: 'linear-gradient(180deg, rgba(8,10,15,0.95), rgba(8,10,15,0.92))',
      showCloseButton: true,
      confirmButtonText: '¡A jugar!',
      confirmButtonColor: '#00ffe1',
      customClass: {
        popup: 'swal-neon'
      }
    });
  } catch (err) {
    // fallback simple alert si Swal falla
    alert('Corta las frutas (clic + arrastrar). Manzana / Banana / Naranja = +10 pts. Frutilla (rotten) = -15 pts. Bomba = -1 vida. Máx 3 vidas. 1:30 tiempo.');
  }
});


// initial menu
updateMenuHighscore();
showMenu();

// -------- HUD helpers --------
function renderLives(){
  livesContainer.innerHTML = '';
  for (let i=0;i<STATE.lives;i++){
    const div = document.createElement('div');
    div.className = 'life-heart';
    div.textContent = '❤';
    livesContainer.appendChild(div);
  }
}

// -------- SOUND: audio context + music ----------
let audioCtx = null;
let musicAudio = null;
function makeAudioContextIfNeeded(){
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function playSliceSound(){
  try{
    makeAudioContextIfNeeded();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 800 + Math.random()*400;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o.start(now); o.stop(now + 0.12);
  }catch(e){ console.warn('Audio blocked or error', e); }
}
function tryPlayMusic(){
  if (!ASSETS.music) return;
  try {
    if (!musicAudio) {
      musicAudio = new Audio(ASSETS.music);
      musicAudio.loop = true;
      musicAudio.volume = 0.22;
    }
    musicAudio.play().catch(()=>{/* may be blocked if no gesture */});
  } catch(e){ /* ignore */ }
}
function stopMusic(){
  try { if (musicAudio) { musicAudio.pause(); musicAudio.currentTime = 0; } } catch(e){}
}

// -------- FRUIT CLASS --------
class Fruit {
  constructor(x,y,kind='apple'){
    this.kind = kind; // 'apple','orange','banana','rotten','bomb'
    this.radius = rand(26,42);
    this.container = new PIXI.Container();
    this.sprite = new PIXI.Sprite(loadedTextures[this.kind] || loadedTextures['apple']);
    this.sprite.anchor.set(0.5);
    const tex = loadedTextures[this.kind] || loadedTextures['apple'];
// obtener ancho de la textura (fallback a 80 si no disponible)
const texWidth = (tex && (tex.width || (tex.baseTexture && tex.baseTexture.width))) ? (tex.width || tex.baseTexture.width) : 80;

// escala deseada en base al radius
let s = (this.radius * 2) / texWidth;

// añadir pequeña variación
s *= (0.95 + Math.random() * 0.15);

// limitar la escala para que no sea ni muy pequeña ni gigante
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.15;
s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

// aplicar escala (uniforme)
this.sprite.scale.set(s);
    this.container.addChild(this.sprite);
    // spawn a bit deeper so travel path is longer
    this.container.x = x;
    this.container.y = y;
    // physics: MUCH stronger upward impulse so fruits go high
    this.vx = rand(-30,30);
    this.vy = rand(-700, -1000); // <- aumenté para que suban MUCHO
    this.rotationSpeed = rand(-0.06,0.06);
    this.alive = true;
    fruitsLayer.addChild(this.container);
    STATE.fruits.push(this);
  }
  update(dt){
    if (!this.alive) return;
    // reduce gravity a poco para que lleguen más alto antes de caer
    this.vy += 700 * dt; // <- gravedad moderada para mayor arco
    this.container.x += this.vx * dt;
    this.container.y += this.vy * dt;
    this.container.rotation += this.rotationSpeed;
    if (this.container.y - this.radius > app.screen.height + 140 || this.container.x < -200 || this.container.x > app.screen.width + 200) this.destroy();
  }
  destroy(preserve=false){
    if (!this.alive) return;
    this.alive = false;
    fruitsLayer.removeChild(this.container);
    const idx = STATE.fruits.indexOf(this);
    if (idx>=0) STATE.fruits.splice(idx,1);
    if (!preserve) createExplosion(this.container.x, this.container.y, this.kind);
  }
  intersectsSegment(p1,p2){
    const cx = this.container.x, cy = this.container.y;
    const r = this.radius * (this.sprite.scale.x || 1);
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const dx = x2-x1, dy = y2-y1;
    const l2 = dx*dx + dy*dy;
    let t = 0; if (l2>0) t = ((cx-x1)*dx + (cy-y1)*dy)/l2;
    t = clamp(t,0,1);
    const px = x1 + t*dx, py = y1 + t*dy;
    const dist2 = (cx-px)*(cx-px) + (cy-py)*(cy-py);
    return dist2 <= (r*r*1.6);
  }
}

// -------- spawn logic (good, bad, bomb) --------
function spawnOne(){
  const x = rand(80, app.screen.width - 80);
  const y = app.screen.height + 160; // spawn deeper so they travel more distance
  const r = Math.random();
  if (r < 0.70) {
    const good = ['apple','orange','banana']; new Fruit(x,y, good[Math.floor(Math.random()*good.length)]);
  } else if (r < 0.85) {
    new Fruit(x,y, 'rotten');
  } else {
    new Fruit(x,y, 'bomb');
  }
}
function spawnLoop(){
  const ms = rand(SPAWN_MIN_MS, SPAWN_MAX_MS);
  STATE.spawnTimer = setTimeout(()=> {
    if (STATE.running) spawnOne();
    if (STATE.running) spawnLoop();
  }, ms);
}
function stopSpawn(){ if (STATE.spawnTimer) { clearTimeout(STATE.spawnTimer); STATE.spawnTimer = null; } }

// -------- trail (katana) ----------
const trail = new PIXI.Graphics(); trailLayer.addChild(trail);
window.addEventListener('pointerdown', (e) => {
  pointerDown = true; STATE.swipes = []; addSwipePoint(e.clientX,e.clientY);
  try{ if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch(e){}
});
window.addEventListener('pointermove', (e) => { if (!pointerDown) return; addSwipePoint(e.clientX,e.clientY); });
window.addEventListener('pointerup', (e) => { pointerDown = false; gsap.to({}, {duration:0.25, onComplete:()=> STATE.swipes = []}); });

function addSwipePoint(x,y){
  STATE.swipes.push({x,y,t:performance.now()});
  if (STATE.swipes.length > STATE.maxSwipeLen) STATE.swipes.shift();
  drawTrail();
  checkSliceCollision();
}
function drawTrail(){
  trail.clear();
  if (STATE.swipes.length < 2) return;
  for (let i=0;i<STATE.swipes.length-1;i++){
    const p1 = STATE.swipes[i], p2 = STATE.swipes[i+1];
    const a = i/STATE.swipes.length;
    const width = 18 * (0.6 + a*0.9);
    trail.lineStyle(width, lerpColor(0x00ffe1, 0xff3ec8, a), Math.max(0.18, 0.95 - a*0.5)); // mayor opacidad en trazo
    trail.moveTo(p1.x,p1.y); trail.lineTo(p2.x,p2.y);
  }
  for (let i=0;i<STATE.swipes.length-1;i++){
    const p1 = STATE.swipes[i], p2 = STATE.swipes[i+1];
    trail.lineStyle(4, 0xffffff, 0.98); trail.moveTo(p1.x,p1.y); trail.lineTo(p2.x,p2.y);
  }
}

// -------- collision handling --------
function checkSliceCollision(){
  if (STATE.swipes.length < 2) return;
  const len = STATE.swipes.length;
  for (let i = Math.max(0,len-8); i < len-1; i++){
    const p1 = STATE.swipes[i], p2 = STATE.swipes[i+1];
    for (let j = STATE.fruits.length - 1; j >= 0; j--){
      const f = STATE.fruits[j];
      if (!f || !f.alive) continue;
      if (f.intersectsSegment(p1,p2)){
        handleFruitCut(f, p2.x, p2.y);
        break;
      }
    }
  }
}

function handleFruitCut(fruit, x, y){
  playSliceSound();
  if (fruit.kind === 'bomb'){
    fruit.destroy(true);
    playBombExplode(x,y);
    loseLife();
  } else if (fruit.kind === 'rotten'){
    fruit.destroy();
    createExplosion(x,y, 'rotten');
    awardPoints(-15);
  } else {
    fruit.destroy();
    createExplosion(x,y, fruit.kind);
    awardPoints(10);
  }
}

function createExplosion(x, y, kindOrColor = 0xffffff) {
  const color = kindToColor(kindOrColor);
  const cnt = 10;
  for (let i = 0; i < cnt; i++) {
    const p = new PIXI.Sprite(makeParticleTexture());
    p.anchor.set(0.5);
    p.tint = color;
    p.x = x; p.y = y;
    effectsLayer.addChild(p);
    const vx = rand(-220, 220), vy = rand(-260, 20);
    gsap.to(p, {
      x: p.x + vx * 0.9,
      y: p.y + vy * 0.9,
      alpha: 0,
      duration: 0.8,
      onComplete: () => { try { effectsLayer.removeChild(p); } catch(e){} }
    });
  }
}

function playBombExplode(x, y) {
  const color = kindToColor('bomb');
  const flash = new PIXI.Graphics();
  flash.beginFill(color, 0.28); // menos transparente -> más visible
  flash.drawCircle(0, 0, 140);
  flash.endFill();
  flash.x = x; flash.y = y;
  effectsLayer.addChild(flash);
  gsap.to(flash, {
    alpha: 0,
    duration: 0.36,
    onComplete: () => { try { effectsLayer.removeChild(flash); } catch(e){} }
  });
}

function makeParticleTexture(){
  const g = new PIXI.Graphics(); g.beginFill(0xffffff); g.drawCircle(0,0,4); g.endFill();
  return app.renderer.generateTexture(g);
}

// -------- scoring / lives / timer --------
function awardPoints(n){
  STATE.score += n;
  scoreDisplay.textContent = `Score: ${STATE.score}`;
}
function loseLife(){
  STATE.lives -= 1;
  renderLives();
  if (STATE.lives <= 0) endGame('lives');
}
function renderLives(){
  livesContainer.innerHTML = '';
  for (let i=0;i<STATE.lives;i++){
    const d = document.createElement('div'); d.className='life-heart'; d.textContent='❤'; livesContainer.appendChild(d);
  }
}

// -------- timer / countdown flow (with name prompt) --------
async function showCountdownThenStart(){
  // Load sweetalert and ask for name
  try {
    await loadSwal();
    const { value: name } = await Swal.fire({
      title: '¿Cómo te llamás?',
      input: 'text',
      inputPlaceholder: 'Tu nombre',
      allowOutsideClick: false,
      showCancelButton: false,
      confirmButtonText: 'Listo',
      inputValidator: (v) => v && v.trim().length > 0 ? null : 'Escribí tu nombre'
    });
    STATE.playerName = name || 'Jugador';
  } catch (e) {
    STATE.playerName = 'Jugador';
  }

  // Play music (user gesture already)
  tryPlayMusic();

  // countdown visual
  menu.classList.add('hidden');
  hudBigTimer.classList.remove('hidden'); hudBigTimer.textContent = '3';
  let num = 3;
  const cd = setInterval(()=> {
    num--;
    if (num > 0) { hudBigTimer.textContent = String(num); gsap.fromTo(hudBigTimer, {scale:1.08}, {scale:1, duration:0.22}); }
    else {
      clearInterval(cd);
      hudBigTimer.textContent = '';
      hudBigTimer.classList.add('hidden');
      startRun();
    }
  }, 700);
}

// start the run: timer + spawn
function startRun(){
  STATE.running = true; STATE.score = 0; STATE.lives = INITIAL_LIVES; STATE.timeLeft = GAME_DURATION;
  scoreDisplay.textContent = `Score: 0`; renderLives();
  spawnLoop();
  updateTimerDisplay();
  if (STATE.timerInterval) clearInterval(STATE.timerInterval);
  STATE.timerInterval = setInterval(()=> {
    STATE.timeLeft -= 1;
    updateTimerDisplay();
    if (STATE.timeLeft <= 0) endGame('time');
  }, 1000);
}

function updateTimerDisplay(){
  const mm = Math.floor(STATE.timeLeft / 60), ss = STATE.timeLeft % 60;
  scoreDisplay.textContent = `Score: ${STATE.score} • ${mm}:${String(ss).padStart(2,'0')}`;
  if (STATE.timeLeft <= 5 && STATE.timeLeft > 0){
    hudBigTimer.classList.remove('hidden'); hudBigTimer.textContent = String(STATE.timeLeft);
    gsap.to(hudBigTimer, { scale:1.3, duration:0.18, yoyo:true, repeat:1, onComplete: ()=> { hudBigTimer.classList.add('hidden'); } });
  }
}

// end game: reason = 'time' | 'lives'
function endGame(reason='time'){
  STATE.running = false;
  stopSpawn();
  if (STATE.timerInterval) { clearInterval(STATE.timerInterval); STATE.timerInterval = null; }
  for (const f of STATE.fruits.slice()) f.destroy();
  STATE.swipes = []; trail.clear();
  // save
  saveScore(STATE.score);
  // stop music
  stopMusic();

  // show modal según razón
  const player = STATE.playerName || 'Jugador';
  if (reason === 'time') {
    // finished successfully
    loadSwal().then(()=> {
      Swal.fire({
        title: `¡Felicitaciones, ${player}!`,
        text: `Obtuviste ${STATE.score} puntos.`,
        icon: 'success',
        confirmButtonText: 'Volver al menú'
      }).then(()=> { updateMenuHighscore(); menu.classList.remove('hidden'); });
    });
  } else {
    // lost by lives
    loadSwal().then(()=> {
      Swal.fire({
        title: `Game Over, ${player}`,
        text: `Puntaje: ${STATE.score}`,
        icon: 'error',
        confirmButtonText: 'Volver al menú'
      }).then(()=> { updateMenuHighscore(); menu.classList.remove('hidden'); });
    });
  }
}

// -------- spawn loop control --------
function spawnLoop(){
  const ms = rand(SPAWN_MIN_MS, SPAWN_MAX_MS);
  STATE.spawnTimer = setTimeout(()=> {
    if (STATE.running) spawnOne();
    if (STATE.running) spawnLoop();
  }, ms);
}
function stopSpawn(){ if (STATE.spawnTimer) { clearTimeout(STATE.spawnTimer); STATE.spawnTimer = null; } }

// -------- UI button wiring --------
btnPlay.addEventListener('click', ()=> {
  try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch(e){}
  showCountdownThenStart();
});
btnScores.addEventListener('click', ()=> showScores());

// -------- PIXI ticker update --------
let last = performance.now();
app.ticker.add(()=> {
  const now = performance.now();
  const dt = Math.min(0.032, (now - last)/1000);
  last = now;
  for (let i = STATE.fruits.length - 1; i >= 0; i--){
    const f = STATE.fruits[i];
    f.update(dt);
  }
  if (!pointerDown && STATE.swipes.length > 0){
    const cutoff = performance.now() - 140;
    STATE.swipes = STATE.swipes.filter(p => p.t >= cutoff);
    drawTrail();
  }
});

// -------- utils --------
function rand(min,max){ return Math.random()*(max-min)+min; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function lerpColor(a,b,t){ const ar=(a>>16)&255, ag=(a>>8)&255, ab=a&255; const br=(b>>16)&255, bg=(b>>8)&255, bb=b&255; const rr=Math.round(ar+(br-ar)*t), rg=Math.round(ag+(bg-ag)*t), rb=Math.round(ab+(bb-ab)*t); return (rr<<16)+(rg<<8)+rb; }

// -------- init visuals --------
renderLives();
scoreDisplay.textContent = `Score: 0 • 1:30`;

// trail implementation
const trailG = new PIXI.Graphics(); trailLayer.addChild(trailG);
window.addEventListener('pointerdown', (e)=> { pointerDown = true; STATE.swipes=[]; addSwipePoint(e.clientX,e.clientY); });
window.addEventListener('pointermove', (e)=> { if (!pointerDown) return; addSwipePoint(e.clientX,e.clientY); });
window.addEventListener('pointerup', (e)=> { pointerDown = false; gsap.to({}, { duration:0.2, onComplete: ()=> STATE.swipes = [] }); });

function addSwipePoint(x,y){ STATE.swipes.push({x,y,t:performance.now()}); if (STATE.swipes.length>STATE.maxSwipeLen) STATE.swipes.shift(); drawTrail(); checkSliceCollision(); }
function drawTrail(){ trailG.clear(); if (STATE.swipes.length<2) return; for (let i=0;i<STATE.swipes.length-1;i++){ const p1=STATE.swipes[i], p2=STATE.swipes[i+1]; const a=i/STATE.swipes.length; const width=18*(0.6 + a*0.9); trailG.lineStyle(width, lerpColor(0x00ffe1,0xff3ec8,a), Math.max(0.18,0.95 - a*0.5)); trailG.moveTo(p1.x,p1.y); trailG.lineTo(p2.x,p2.y); } for (let i=0;i<STATE.swipes.length-1;i++){ const p1=STATE.swipes[i], p2=STATE.swipes[i+1]; trailG.lineStyle(4,0xffffff,0.98); trailG.moveTo(p1.x,p1.y); trailG.lineTo(p2.x,p2.y); } }

// helper to spawn a single enemy or fruit
function spawnOne(){ const x=rand(80, app.screen.width - 80), y = app.screen.height + 160; const r = Math.random(); if (r<0.70){ const good = ['apple','orange','banana']; new Fruit(x,y, good[Math.floor(Math.random()*good.length)]); } else if (r<0.85){ new Fruit(x,y,'rotten'); } else { new Fruit(x,y,'bomb'); } }

// resize handling
window.addEventListener('resize', ()=> app.renderer.resize(innerWidth, innerHeight));