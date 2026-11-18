// ============================================================================
// main.js — Cena 3D: renderizador, câmeras, projeção perspectiva, luzes, entrada e laço principal
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { criarSala } from './Sala.js';
import { Zelador } from './Zelador.js';
import { Fantasma } from './Fantasma.js';
import { criarModoUV, criarAlternadorRelevo, layoutUV, imagensDaCena, baixarZip } from './inspecaoTexturas.js';
import { Jogo } from './Jogo.js';
import { paraMapa, doMapa, anguloNoMapa, pontoCardeal } from './coordenadas.js';
import { Hud } from './Hud.js';
import { Som } from './Som.js';

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

// Fantasma Chefe: mesma classe, escala 2×, vermelho. Desperta no centro do
// salão depois da 4ª captura (o Jogo controla quando ele aparece).
const chefe = new Fantasma({ cor: 0xff2a2a, nome: 'Fantasma Chefe', chefe: true });
chefe.position.set(0, 2.8, 0);
chefe.alturaBase = 2.8;
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
// Na câmera livre o botão esquerdo é do aspirador (como nos outros modos):
// girar a câmera = botão direito, zoom = roda / botão do meio.
orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
orbit.enablePan = false;            // o centro da órbita acompanha o zelador (ver laço principal)
const seguirOrbita = new THREE.Vector3();

const MODOS = ['terceira', 'topo', 'livre'];
const NOMES_MODO = { terceira: '3ª pessoa', topo: 'Vista do topo', livre: 'Livre (órbita)' };
let modo = 'terceira';
const OFFSET_3P = new THREE.Vector3(-0.85, 2.2, -3.6);   // atrás e acima do ombro direito
const alvoCam = new THREE.Vector3();
const posDesejada = new THREE.Vector3();

function definirModo(m) {
  modo = m;
  orbit.enabled = m === 'livre';
  // Vista superior: câmera bem acima do centro olhando para baixo, com o vetor "up"
  // da câmera apontando para o Norte (−Z). Assim a tela mostra o plano cartesiano do
  // mapa: +X para a direita, +Y (Norte) para cima. Os outros modos usam up = +Y.
  camera.up.set(0, 1, 0);
  if (m === 'topo') { camera.up.set(0, 0, -1); camera.position.set(0, 21, 0); camera.lookAt(0, 0, 0); }
  if (m === 'livre') {
    // Câmera no canto inferior esquerdo do mapa (X = −10, Y = −10, a sudoeste),
    // um pouco para dentro das paredes e abaixo do teto (6 m), olhando para o zelador.
    const canto = doMapa(-9.6, -9.6, 5.2);
    camera.position.set(canto.x, canto.y, canto.z);
    orbit.target.set(zelador.position.x, 1.5, zelador.position.z);
    orbit.update();
  }
  // só a 3ª pessoa trava o cursor: no topo e na livre ele é a mira
  if (m !== 'terceira' && document.pointerLockElement) { saindoDaTrava = true; document.exitPointerLock(); }
  renderer.domElement.style.cursor = m === 'terceira' ? '' : 'crosshair';
  if (jogo.jogando && m === 'topo') jogo.hud.mensagem('Vista do topo: WASD seguem a tela · mouse = mira', 2.2);
  if (jogo.jogando && m === 'livre') jogo.hud.mensagem('Câmera livre: WASD seguem a câmera · botão direito gira', 2.6);
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
  { tecla: 'Digit5', nome: 'Fantasmas (5 PointLights)',     luzes: [...fantasmas, chefe].map((f) => f.luz).filter(Boolean) },
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
// Eixos globais no sistema do MAPA (ver coordenadas.js): o AxesHelper desenha
// X vermelho, Y verde e Z azul ao longo dos seus eixos locais; makeBasis gira
// o helper para que verde aponte para o Norte (−Z do Three.js) e azul para cima.
const BASE_MAPA = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));
const eixosGlobais = new THREE.AxesHelper(3);
eixosGlobais.quaternion.setFromRotationMatrix(BASE_MAPA);
eixosGlobais.position.y = 0.03;
ajudantes.add(eixosGlobais);
function rotuloEixo(texto, cor, x, y, z) {    // letra que sempre olha para a câmera (Sprite)
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 44px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(texto, 32, 34);
  g.fillStyle = cor; g.fillText(texto, 32, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sp.position.set(x, y, z); sp.scale.setScalar(0.6); sp.renderOrder = 10;
  ajudantes.add(sp);
}
rotuloEixo('X', '#ff5555', 3.4, 0.2, 0);      // +X do mapa = Leste
rotuloEixo('Y', '#55ff55', 0, 0.2, -3.4);     // +Y do mapa = Norte (−Z do Three.js)
rotuloEixo('Z', '#5599ff', 0, 3.4, 0);        // +Z do mapa = altura
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
// Eixos locais no mesmo padrão do mapa: Y (verde) = frente do personagem,
// Z (azul) = cima, X (vermelho) = direita (X = Y × Z, sistema destro).
// No modelo do Three.js a frente é +Z local, cima +Y local e a direita −X local.
const BASE_LOCAL = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
const eixosLocais = [zelador, ...fantasmas, chefe].map((o) => {
  const a = new THREE.AxesHelper(o === zelador ? 1.2 : 0.9);
  a.quaternion.setFromRotationMatrix(BASE_LOCAL);
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
  { obj: chefe, nome: 'Fantasma Chefe' },
  ...sala.registro,
];
const fmt = (n) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2).padStart(6, ' ');
function atualizarPainel() {
  const linhas = objetosPainel.map(({ obj, nome }) => {
    // exibido no sistema do mapa: X = Leste, Y = Norte, Z = altura; ângulo 0° = Leste, 90° = Norte
    const p = paraMapa(obj.position), ang = anguloNoMapa(obj.rotation.y), s = obj.scale.x;
    return `<tr><td>${nome}</td><td>${fmt(p.x)}</td><td>${fmt(p.y)}</td><td>${fmt(p.z)}</td><td>${ang.toFixed(0)}°</td><td>${s.toFixed(1)}</td></tr>`;
  });
  document.getElementById('painel-corpo').innerHTML = linhas.join('');
}

// ---------------------------------------------- texturas: grade UV e exportação
// U: troca as texturas de cor pela grade UV (mostra as coordenadas de textura).
// R: liga/desliga os mapas de relevo (bump) para comparar o efeito da luz.
// X: baixa um .zip com os PNGs das texturas usadas + grade UV + layouts UV.
const modoUV = criarModoUV(scene);
const relevo = criarAlternadorRelevo(scene);
function atualizarHudTexturas() {
  document.getElementById('hud-texturas').textContent =
    (modoUV.ativo ? 'grade UV' : 'normais') + ' · relevo ' + (relevo.ativo ? 'ON' : 'OFF');
}
function alternarUV() { modoUV.alternar(); atualizarHudTexturas(); }
function alternarRelevo() { relevo.alternar(); atualizarHudTexturas(); }
// Malhas cujo layout UV é desenhado sobre a imagem (uma de cada tipo de geometria)
const quadroNorte = sala.grupo.getObjectByName('Quadro: I. O Conde Sombrio');
const AMOSTRAS_UV = [
  ['piso', sala.grupo.getObjectByName('Piso'), 'Piso — PlaneGeometry 20 × 20 m'],
  ['quadro_tela', quadroNorte.children[0], 'Tela do quadro Norte — PlaneGeometry 2,2 × 2,75 m'],
  ['moldura_barra', quadroNorte.children[1], 'Barra superior da moldura — BoxGeometry'],
  ['zelador_coxa', zelador.pernaEsq.quadril.children[1], 'Coxa do Zelador — CylinderGeometry (UV em metros)'],
  ['fantasma_corpo', fantasmas[0].casca, 'Corpo do Fantasma — LatheGeometry (UV em metros)'],
];
function imagensParaExportar() {
  if (modoUV.ativo) alternarUV();   // exporta as texturas reais, não a grade
  return [
    ...imagensDaCena(scene),
    { nome: 'grade_uv', canvas: modoUV.grade.image },
    ...AMOSTRAS_UV.map(([nome, malha, titulo]) => ({ nome: 'uv_' + nome, canvas: layoutUV(malha, titulo) })),
  ];
}

// ------------------------------------------------------------------ entrada
const teclas = new Set();
let pedidoEsquiva = false;
addEventListener('keydown', (e) => {
  teclas.add(e.code);
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Enter') { jogo.acaoPrincipal(); travarMouse(); }
  // Sandbox: B entra (do menu, da pausa ou do fim); J chama o Chefe; F congela os fantasmas
  if (e.code === 'KeyB' && !jogo.jogando) { jogo.iniciarSandbox(); travarMouse(); }
  if (e.code === 'KeyJ') jogo.despertarChefeAgora();
  if (e.code === 'KeyF') jogo.alternarCongelar();
  if (e.code === 'Backspace') { e.preventDefault(); if (['pausa', 'vitoria', 'derrota'].includes(jogo.estado)) jogo.voltarAoMenu(); }
  // (o Esc que solta a trava do mouse já pausou via pointerlockchange: não despausar em seguida)
  if (e.code === 'Escape' && !(jogo.estado === 'pausa' && performance.now() - jogo.pausadoEm < 400)) jogo.alternarPausa();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') pedidoEsquiva = true;
  if (e.code === 'KeyM') jogo.hud.mensagem(som.alternarMudo() ? 'Som desligado' : 'Som ligado', 1);
  if (e.code === 'KeyI') document.body.classList.toggle('sem-paineis');
  if (e.code === 'KeyC') definirModo(MODOS[(MODOS.indexOf(modo) + 1) % MODOS.length]);
  const grupo = GRUPOS_LUZ.find((g) => g.tecla === e.code);
  if (grupo) alternarLuz(grupo);
  if (e.code === 'KeyP') alternarFov();
  if (e.code === 'KeyH') alternarAjudantes();
  if (e.code === 'KeyU') alternarUV();
  if (e.code === 'KeyR') alternarRelevo();
  if (e.code === 'KeyX') baixarZip(imagensParaExportar(), 'texturas_mansao_assombrada.zip');
});
addEventListener('keyup', (e) => teclas.delete(e.code));
addEventListener('blur', () => { teclas.clear(); mouseSucao = false; });   // evita tecla "presa" ao trocar de janela

// Mouse: clique segura o aspirador; com o ponteiro travado (Pointer Lock) o
// movimento horizontal gira o zelador sem o cursor sair da janela.
let mouseSucao = false, saindoDaTrava = false;
function travarMouse() {
  if (modo !== 'terceira' || document.pointerLockElement || !jogo.jogando) return;
  try { renderer.domElement.requestPointerLock()?.catch?.(() => {}); } catch { /* navegador sem Pointer Lock */ }
}
document.addEventListener('pointerlockchange', () => {
  // perder a trava durante a partida (Esc do navegador) pausa o jogo
  if (!document.pointerLockElement && jogo.jogando && !saindoDaTrava) jogo.pausar();
  saindoDaTrava = false;
});
// pointerdown/pointerup (e não mousedown): o OrbitControls também escuta eventos de
// ponteiro no canvas, e assim nenhum dos dois "rouba" o clique do outro.
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  mouseSucao = true;
  if (modo !== 'terceira') atualizarCursor(e);
  travarMouse();
});
addEventListener('pointerup', (e) => { if (e.button === 0) mouseSucao = false; });
document.getElementById('tela').addEventListener('click', () => { jogo.acaoPrincipal(); travarMouse(); });
addEventListener('mousemove', (e) => {
  if (modo === 'terceira' && jogo.jogando) zelador.rotation.y -= e.movementX * (document.pointerLockElement ? 0.0035 : 0.006);   // mira horizontal
  if (modo !== 'terceira') atualizarCursor(e);
});

// --------------------------------- mira pelo cursor (vista do topo e câmera livre)
// O cursor vira um raio (Raycaster) que sai da câmera; o ponto onde ele cruza o
// plano horizontal na altura do bocal (y = 1,14 m) é o alvo, e o zelador gira
// para ele: yaw = atan2(Δx, Δz) (frente = +Z local). Um anel no chão marca o alvo.
const raycaster = new THREE.Raycaster();
const cursorNdc = new THREE.Vector2();
const planoMira = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.14);   // y − 1,14 = 0
const pontoMira = new THREE.Vector3();
let cursorAtivo = false;     // false depois de Q/E: a mira volta a ser manual até o mouse mexer
function atualizarCursor(e) {
  // coordenadas normalizadas do dispositivo (NDC): x, y ∈ [−1, 1], y para cima
  cursorNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  cursorAtivo = true;
}
const marcadorMira = new THREE.Mesh(
  new THREE.RingGeometry(0.22, 0.32, 32),
  new THREE.MeshBasicMaterial({ color: 0x9cff9e, transparent: true, opacity: 0.85, depthWrite: false }));
marcadorMira.name = 'Marcador da mira (cursor)';
marcadorMira.rotation.x = -Math.PI / 2;
marcadorMira.visible = false;
scene.add(marcadorMira);
function mirarNoCursor() {
  raycaster.setFromCamera(cursorNdc, camera);
  if (!raycaster.ray.intersectPlane(planoMira, pontoMira)) return false;
  marcadorMira.position.set(pontoMira.x, 0.03, pontoMira.z);
  const dx = pontoMira.x - zelador.position.x, dz = pontoMira.z - zelador.position.z;
  if (dx * dx + dz * dz > 0.09) zelador.rotation.y = Math.atan2(dx, dz);   // ignora o cursor em cima do zelador
  return true;
}

// ------------------------ movimento relativo à câmera (vista do topo e câmera livre)
// "Frente" é para onde a câmera olha, projetado no chão (y = 0) e normalizado;
// "direita" é frente × cima = (−fz, 0, fx). Assim W sempre leva o zelador para o
// alto da tela e D para a direita, qualquer que seja o ângulo da câmera.
// Na vista superior a câmera olha reto para baixo e a projeção é nula; nesse caso
// a frente é o vetor "up" da câmera, (0, 0, −1): W = Norte = +Y do mapa.
const frenteCam = new THREE.Vector3();
function direcaoRelativaACamera(frente, lado, saida) {
  camera.getWorldDirection(frenteCam);
  frenteCam.y = 0;
  // olhando exatamente para baixo (vista superior): a frente é o "up" da câmera (Norte)
  if (frenteCam.lengthSq() < 1e-12) frenteCam.copy(camera.up).setY(0);
  frenteCam.normalize();
  return saida.set(frenteCam.x * frente - frenteCam.z * lado, 0, frenteCam.z * frente + frenteCam.x * lado);
}

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

// ------------------------------------------------------------------- jogo
const som = new Som();
const nomesQuadros = ['I. O Conde Sombrio', 'II. Floresta da Lua Cheia', 'III. Memento Mori', 'IV. Castelo da Tempestade'];
const jogo = new Jogo({
  scene, zelador, fantasmas, chefe, som, hud: new Hud(), resolverColisoes,
  quadros: nomesQuadros.map((n) => sala.grupo.getObjectByName('Quadro: ' + n)),   // na ordem N, L, S, O
});

// ----------------------------------------------------------- laço principal
const mov = new THREE.Vector3();
const tremorCam = new THREE.Vector3();
let anterior = performance.now(), tempo = 0, quadros = 0, acumFps = 0;

function quadro(agora) {
  const dt = Math.min((agora - anterior) / 1000, 0.05);
  anterior = agora; tempo += dt;

  // entrada → direção de movimento no mundo, relativa à orientação do zelador (W = frente, D = direita)
  const yaw = zelador.rotation.y;
  const frente = (teclas.has('KeyW') || teclas.has('ArrowUp') ? 1 : 0) - (teclas.has('KeyS') || teclas.has('ArrowDown') ? 1 : 0);
  const lado = (teclas.has('KeyD') || teclas.has('ArrowRight') ? 1 : 0) - (teclas.has('KeyA') || teclas.has('ArrowLeft') ? 1 : 0);
  if (jogo.jogando && (teclas.has('KeyQ') || teclas.has('KeyE'))) {
    zelador.rotation.y += dt * 2.2 * ((teclas.has('KeyQ') ? 1 : 0) - (teclas.has('KeyE') ? 1 : 0));
    cursorAtivo = false;
  }
  if (modo === 'terceira') {
    // 3ª pessoa: a câmera fica atrás do zelador, então "frente" = para onde ELE olha
    mov.set(Math.sin(yaw) * frente - Math.cos(yaw) * lado, 0, Math.cos(yaw) * frente + Math.sin(yaw) * lado);
    marcadorMira.visible = false;
  } else {
    // topo e livre: a câmera não gira junto com o zelador, então os controles seguem a TELA
    // e a mira segue o cursor
    direcaoRelativaACamera(frente, lado, mov);
    marcadorMira.visible = jogo.jogando && cursorAtivo && mirarNoCursor();
  }
  if (mov.lengthSq() > 0) mov.normalize();

  // regras do jogo: movimento, fantasmas, captura, dano, pontuação, fim de partida
  jogo.atualizar(dt, tempo, { dir: mov, succao: mouseSucao || teclas.has('Space'), esquivar: pedidoEsquiva });
  pedidoEsquiva = false;

  if (jogo.estado !== 'pausa') {
    zelador.atualizar(dt, tempo);
    sala.atualizar(dt, tempo);
  }

  if (modo === 'terceira') posicionarTerceira(1 - Math.exp(-dt * 6));
  if (modo === 'livre') {
    // a câmera fica no canto e só GIRA para acompanhar o zelador (como uma câmera de
    // segurança): o centro da órbita segue o zelador; o botão direito ainda reposiciona a câmera
    seguirOrbita.set(zelador.position.x, 1.5, zelador.position.z);
    orbit.target.lerp(seguirOrbita, 1 - Math.exp(-dt * 8));
    orbit.update();
  }

  // tremor de câmera ao levar dano / despertar do Chefe (desfeito após o render)
  const forca = modo === 'livre' ? 0 : jogo.tremor * jogo.tremor * 0.18;
  tremorCam.set((Math.random() - 0.5) * forca, (Math.random() - 0.5) * forca, (Math.random() - 0.5) * forca);
  camera.position.add(tremorCam);

  renderer.render(scene, camera);   // aplica viewMatrix + projectionMatrix da câmera ativa
  camera.position.sub(tremorCam);

  // HUD
  quadros++; acumFps += dt;
  if (acumFps >= 0.5) {
    document.getElementById('hud-fps').textContent = Math.round(quadros / acumFps);
    const p = paraMapa(zelador.position), ang = anguloNoMapa(zelador.rotation.y);   // (X, Y, Z) do mapa
    document.getElementById('hud-pos').textContent =
      `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) · ${ang.toFixed(0)}° ${pontoCardeal(ang)}`;
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
atualizarHudTexturas();
requestAnimationFrame(quadro);

// Acesso pelo console do navegador (útil para depurar e gerar capturas)
// passo(n): avança n quadros manualmente (usado só para gerar capturas com o laço pausado)
function passo(n = 1, dtSimulado = 1 / 30) {
  for (let i = 0; i < n; i++) { anterior -= dtSimulado * 1000; quadro(performance.now()); }
}
window.__cena = { scene, camera, renderer, zelador, fantasmas, chefe, jogo, orbit, definirModo, alternarAjudantes, atualizarPainel, passo, alternarUV, alternarRelevo, imagensParaExportar };
