// ============================================================================
// main.js — Cena 3D: renderizador, câmeras, projeção perspectiva, luzes, entrada e laço principal
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { criarSala } from './Sala.js';
import { Zelador } from './Zelador.js';
import { Fantasma } from './Fantasma.js';

// ------------------------------------------------------------- renderizador
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // no r186 o PCF já é filtrado (PCFSoftShadowMap foi removido)
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
document.getElementById('app').appendChild(renderer.domElement);

// ------------------------------------------------------------------- cena
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05030a);
scene.fog = new THREE.FogExp2(0x0b0814, 0.022);

const sala = criarSala();
scene.add(sala.grupo);

// ------------------------------------------------------------- personagem
const zelador = new Zelador();
zelador.position.set(0, 0, 3);
zelador.rotation.y = Math.PI;          // começa olhando para o Norte (-Z)
scene.add(zelador);

// ------------------------------------------------------------- fantasmas
// Um à frente de cada quadro, girado para encarar o centro do salão.
const DIST_PAREDE = 8.2, ALT_FANTASMA = 2.2;
const fantasmas = [
  { nome: 'Fantasma Norte (Conde)',     cor: 0x7cff9e, pos: [0, ALT_FANTASMA, -DIST_PAREDE] },
  { nome: 'Fantasma Leste (Floresta)',  cor: 0x6fb6ff, pos: [DIST_PAREDE, ALT_FANTASMA, 0] },
  { nome: 'Fantasma Sul (Memento)',     cor: 0xc47bff, pos: [0, ALT_FANTASMA, DIST_PAREDE] },
  { nome: 'Fantasma Oeste (Castelo)',   cor: 0xffa04d, pos: [-DIST_PAREDE, ALT_FANTASMA, 0] },
].map(({ nome, cor, pos }) => {
  const f = new Fantasma({ cor, nome });
  f.position.set(...pos);
  f.alturaBase = pos[1];
  f.lookAt(0, pos[1], 0);              // +Z local apontando para o centro
  scene.add(f);
  return f;
});

// Prévia do Fantasma Chefe (tecla B): mesma classe, escala 2×, vermelho
const chefe = new Fantasma({ cor: 0xff2a2a, nome: 'Fantasma Chefe', chefe: true });
chefe.position.set(0, 2.6, 0);
chefe.alturaBase = 2.6;
chefe.visible = false;
scene.add(chefe);

// ---------------------------------------------------------------- câmeras
// PROJEÇÃO PERSPECTIVA — a matriz de projeção é DEFINIDA aqui, pelos parâmetros
// (fov vertical, aspecto, near, far) do THREE.PerspectiveCamera. Objetos distantes
// ficam menores (divisão por w no vertex shader). Ela é RECALCULADA em
// camera.updateProjectionMatrix() (resize e troca de FOV) e APLICADA a cada
// renderer.render(scene, camera): gl_Position = projectionMatrix * viewMatrix * modelMatrix * vértice.
const FOVS = [60, 100, 30];                 // normal, grande-angular (perspectiva exagerada), tele
let fovIdx = 0;
const camera = new THREE.PerspectiveCamera(FOVS[0], window.innerWidth / window.innerHeight, 0.1, 100);
function alternarFov() {
  fovIdx = (fovIdx + 1) % FOVS.length;
  camera.fov = FOVS[fovIdx];
  camera.updateProjectionMatrix();          // reconstrói a matriz de projeção com o novo FOV
  document.getElementById('hud-fov').textContent = FOVS[fovIdx] + '°';
}
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.5, 0);
orbit.enableDamping = true;
orbit.maxDistance = 40;
orbit.enabled = false;

const MODOS = ['terceira', 'topo', 'livre'];
const NOMES_MODO = { terceira: '3ª pessoa', topo: 'Vista do topo', livre: 'Livre (órbita)' };
let modo = 'terceira';
const OFFSET_3P = new THREE.Vector3(-0.85, 2.2, -3.6);   // atrás e acima do ombro direito
const alvoCam = new THREE.Vector3();
const posDesejada = new THREE.Vector3();

function definirModo(m) {
  modo = m;
  orbit.enabled = m === 'livre';
  if (m === 'topo') { camera.position.set(0, 21, 0.01); camera.lookAt(0, 0, 0); }
  if (m === 'livre') { camera.position.set(-2.5, 5.4, 9.6); orbit.target.set(0, 1.5, 0); orbit.update(); }
  if (m === 'terceira') posicionarTerceira(1);
  document.getElementById('hud-camera').textContent = NOMES_MODO[m];
}

function posicionarTerceira(fator) {
  posDesejada.copy(OFFSET_3P).applyAxisAngle(THREE.Object3D.DEFAULT_UP, zelador.rotation.y).add(zelador.position);
  posDesejada.x = THREE.MathUtils.clamp(posDesejada.x, -9.6, 9.6);
  posDesejada.z = THREE.MathUtils.clamp(posDesejada.z, -9.6, 9.6);
  camera.position.lerp(posDesejada, fator);
  const yaw = zelador.rotation.y;
  const frente = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const direita = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
  alvoCam.copy(zelador.position).addScaledVector(frente, 3).addScaledVector(direita, 0.7).setY(1.3);
  camera.lookAt(alvoCam);
}

// ------------------------------------------------------------------ luzes
// Cada grupo pode ser ligado/desligado individualmente (teclas 1–5) para
// mostrar a contribuição de cada fonte para a iluminação da cena.
const GRUPOS_LUZ = [
  { tecla: 'Digit1', nome: 'Ambiente (AmbientLight)',       luzes: [sala.luzes.ambiente] },
  { tecla: 'Digit2', nome: 'Lustre (PointLight + sombra)',  luzes: [sala.luzes.lustre] },
  { tecla: 'Digit3', nome: 'Arandelas (8 PointLights)',     luzes: sala.luzes.arandelas },
  { tecla: 'Digit4', nome: 'Lanterna (SpotLight + sombra)', luzes: [zelador.spot] },
  { tecla: 'Digit5', nome: 'Fantasmas (4 PointLights)',     luzes: fantasmas.map((f) => f.luz).filter(Boolean) },
];
function atualizarHudLuzes() {
  document.getElementById('hud-luzes').innerHTML = GRUPOS_LUZ.map((g, i) =>
    `<span class="${g.luzes[0].visible ? 'on' : 'off'}">[${i + 1}] ${g.nome}: ${g.luzes[0].visible ? 'ON' : 'OFF'}</span>`).join('<br />');
}
function alternarLuz(g) { const v = !g.luzes[0].visible; g.luzes.forEach((l) => (l.visible = v)); atualizarHudLuzes(); }

// --------------------------------------------------- auxiliares de inspeção
// Grade 1 m, eixos globais e eixos locais de cada personagem (tecla H)
const ajudantes = new THREE.Group();
ajudantes.add(new THREE.GridHelper(20, 20, 0xffd27a, 0x6a5a40));
ajudantes.children[0].position.y = 0.02;
const eixosGlobais = new THREE.AxesHelper(3); eixosGlobais.position.y = 0.03; ajudantes.add(eixosGlobais);
for (const c of sala.colisores) {             // contorno dos colisores no chão
  let geo;
  if (c.tipo === 'circulo') {
    geo = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 33 }, (_, i) => new THREE.Vector3(c.x + Math.cos(i / 16 * Math.PI) * c.r, 0.04, c.z + Math.sin(i / 16 * Math.PI) * c.r)));
  } else {
    geo = new THREE.BufferGeometry().setFromPoints([[c.minX, c.minZ], [c.maxX, c.minZ], [c.maxX, c.maxZ], [c.minX, c.maxZ], [c.minX, c.minZ]]
      .map(([x, z]) => new THREE.Vector3(x, 0.04, z)));
  }
  ajudantes.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff5050 })));
}
ajudantes.visible = false;
scene.add(ajudantes);
const eixosLocais = [zelador, ...fantasmas, chefe].map((o) => {
  const a = new THREE.AxesHelper(o === zelador ? 1.2 : 0.9);
  a.visible = false; o.add(a); return a;
});
function alternarAjudantes(v = !ajudantes.visible) {
  ajudantes.visible = v;
  eixosLocais.forEach((a) => (a.visible = v));
  document.getElementById('painel').classList.toggle('visivel', v);
}

// Painel com posição / rotação / escala dos objetos da cena
const objetosPainel = [
  { obj: zelador, nome: 'Zelador' },
  ...fantasmas.map((f) => ({ obj: f, nome: f.name })),
  { obj: chefe, nome: 'Fantasma Chefe (prévia)' },
  ...sala.registro,
];
const fmt = (n) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2).padStart(6, ' ');
function atualizarPainel() {
  const linhas = objetosPainel.map(({ obj, nome }) => {
    const p = obj.position, ry = THREE.MathUtils.radToDeg(obj.rotation.y), s = obj.scale.x;
    return `<tr><td>${nome}</td><td>${fmt(p.x)}</td><td>${fmt(p.y)}</td><td>${fmt(p.z)}</td><td>${ry.toFixed(0)}°</td><td>${s.toFixed(1)}</td></tr>`;
  });
  document.getElementById('painel-corpo').innerHTML = linhas.join('');
}

// ------------------------------------------------------------------ entrada
const teclas = new Set();
addEventListener('keydown', (e) => {
  teclas.add(e.code);
  if (e.code === 'KeyC') definirModo(MODOS[(MODOS.indexOf(modo) + 1) % MODOS.length]);
  const grupo = GRUPOS_LUZ.find((g) => g.tecla === e.code);
  if (grupo) alternarLuz(grupo);
  if (e.code === 'KeyP') alternarFov();
  if (e.code === 'KeyH') alternarAjudantes();
  if (e.code === 'KeyB') chefe.visible = !chefe.visible;
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => teclas.delete(e.code));
let mouseSucao = false;
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 0 && modo !== 'livre') mouseSucao = true; });
addEventListener('mouseup', () => (mouseSucao = false));
renderer.domElement.addEventListener('mousemove', (e) => {
  if (modo !== 'livre') zelador.rotation.y -= e.movementX * 0.006;   // mira horizontal
});

// --------------------------------------------------------------- colisões
const RAIO_ZELADOR = 0.35;
function resolverColisoes(p) {
  const L = sala.limites, m = RAIO_ZELADOR + 0.08;
  p.x = THREE.MathUtils.clamp(p.x, L.minX + m, L.maxX - m);
  p.z = THREE.MathUtils.clamp(p.z, L.minZ + m, L.maxZ - m);
  for (const c of sala.colisores) {
    if (c.tipo === 'circulo') {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + RAIO_ZELADOR;
      if (d < min && d > 1e-6) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
    } else {
      const qx = THREE.MathUtils.clamp(p.x, c.minX, c.maxX), qz = THREE.MathUtils.clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
      if (d < RAIO_ZELADOR && d > 1e-6) { p.x = qx + (dx / d) * RAIO_ZELADOR; p.z = qz + (dz / d) * RAIO_ZELADOR; }
    }
  }
}

// ----------------------------------------------------------- laço principal
const VELOCIDADE = 3.2; // m/s
const mov = new THREE.Vector3();
let anterior = performance.now(), tempo = 0, quadros = 0, acumFps = 0;

function quadro(agora) {
  const dt = Math.min((agora - anterior) / 1000, 0.05);
  anterior = agora; tempo += dt;

  // movimento relativo à orientação do zelador (W = frente, D = direita)
  const yaw = zelador.rotation.y;
  const frente = (teclas.has('KeyW') || teclas.has('ArrowUp') ? 1 : 0) - (teclas.has('KeyS') || teclas.has('ArrowDown') ? 1 : 0);
  const lado = (teclas.has('KeyD') || teclas.has('ArrowRight') ? 1 : 0) - (teclas.has('KeyA') || teclas.has('ArrowLeft') ? 1 : 0);
  if (teclas.has('KeyQ')) zelador.rotation.y += dt * 2.2;
  if (teclas.has('KeyE')) zelador.rotation.y -= dt * 2.2;
  mov.set(Math.sin(yaw) * frente - Math.cos(yaw) * lado, 0, Math.cos(yaw) * frente + Math.sin(yaw) * lado);
  const andando = mov.lengthSq() > 0;
  if (andando) {
    mov.normalize().multiplyScalar(VELOCIDADE * dt);
    zelador.position.add(mov);
    resolverColisoes(zelador.position);
  }
  zelador.velocidade = THREE.MathUtils.damp(zelador.velocidade, andando ? 1 : 0, 10, dt);
  zelador.succao = mouseSucao || teclas.has('Space');

  zelador.atualizar(dt, tempo);
  fantasmas.forEach((f) => f.atualizar(dt, tempo));
  if (chefe.visible) chefe.atualizar(dt, tempo);
  sala.atualizar(dt, tempo);

  if (modo === 'terceira') posicionarTerceira(1 - Math.exp(-dt * 6));
  if (modo === 'livre') orbit.update();

  renderer.render(scene, camera);   // aplica viewMatrix + projectionMatrix da câmera ativa

  // HUD
  quadros++; acumFps += dt;
  if (acumFps >= 0.5) {
    document.getElementById('hud-fps').textContent = Math.round(quadros / acumFps);
    const p = zelador.position;
    document.getElementById('hud-pos').textContent =
      `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) · ${((THREE.MathUtils.radToDeg(yaw) % 360 + 360) % 360).toFixed(0)}°`;
    if (ajudantes.visible) atualizarPainel();
    quadros = 0; acumFps = 0;
  }
  if (!window.__PAUSA) requestAnimationFrame(quadro);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

definirModo('terceira');
atualizarHudLuzes();
requestAnimationFrame(quadro);

// Acesso pelo console do navegador (útil para depurar e gerar capturas)
// passo(n): avança n quadros manualmente (usado só para gerar capturas com o laço pausado)
function passo(n = 1, dtSimulado = 1 / 30) {
  for (let i = 0; i < n; i++) { anterior -= dtSimulado * 1000; quadro(performance.now()); }
}
window.__cena = { scene, camera, renderer, zelador, fantasmas, chefe, orbit, definirModo, alternarAjudantes, atualizarPainel, passo };
