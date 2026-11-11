// ============================================================================
// texturas.js — Texturas procedurais geradas em tempo de execução (Canvas 2D)
// Nenhuma imagem externa é carregada: tudo vira THREE.CanvasTexture.
// ============================================================================
import * as THREE from 'three';

// Gerador pseudoaleatório com semente fixa → texturas idênticas a cada execução
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function criarCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// `nome` identifica a imagem: é o nome do arquivo PNG na exportação (tecla X)
function paraTextura(canvas, { nome, repetir = false, cor = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.name = nome;
  if (cor) t.colorSpace = THREE.SRGBColorSpace;
  if (repetir) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Clona a textura com repetição própria (compartilha a mesma imagem na GPU)
export function comRepeticao(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

// Repetição para geometrias com UV em metros: um ladrilho da imagem cobre
// `ladrilho` metros da superfície (ver uvEmMetros abaixo)
export function porMetro(tex, ladrilho) {
  return comRepeticao(tex, 1 / ladrilho, 1 / ladrilho);
}

// ===========================================================================
// MAPEAMENTO UV EM METROS
// As geometrias do Three.js geram UVs no intervalo [0, 1] por superfície: um
// cilindro fino e um grosso recebem a textura inteira, então o mesmo tecido
// ficaria esticado num e comprimido no outro. uvEmMetros() reescala as UVs
// para que 1 unidade de UV = 1 metro medido sobre a superfície. Assim, com
// repeat = 1 / tamanho_do_ladrilho, todas as peças de um personagem mostram a
// trama na mesma escala (densidade de texels uniforme, sem distorção).
// ===========================================================================
export function uvEmMetros(geo) {
  const uv = geo.attributes.uv, p = geo.parameters;
  const escala = (i, su, sv) => uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  switch (geo.type) {
    case 'ConeGeometry':      // cone = cilindro com raio do topo 0
    case 'CylinderGeometry': {
      const rTopo = p.radiusTop ?? 0, rBase = p.radiusBottom ?? p.radius;
      // lateral: u percorre o arco (raio × ângulo), v percorre a altura
      const nLado = (p.radialSegments + 1) * (p.heightSegments + 1);
      const arco = Math.max(rTopo, rBase) * p.thetaLength;
      for (let i = 0; i < nLado; i++) escala(i, arco, p.height);
      // tampas: UV planar no intervalo [0, 1] sobre o diâmetro
      let i = nLado;
      for (const r of [rTopo, rBase]) {
        if (p.openEnded || r <= 0) continue;
        for (let k = 0; k < 2 * p.radialSegments + 1; k++, i++) escala(i, 2 * r, 2 * r);
      }
      break;
    }
    case 'SphereGeometry': // u: longitude (raio × φ); v: latitude (raio × θ)
      for (let i = 0; i < uv.count; i++) escala(i, p.radius * p.phiLength, p.radius * p.thetaLength);
      break;
    case 'BoxGeometry': { // cada face usa as duas dimensões que ela realmente tem
      const n = geo.attributes.normal, { width: w, height: h, depth: d } = p;
      for (let i = 0; i < uv.count; i++) {
        if (Math.abs(n.getX(i)) > 0.5) escala(i, d, h);
        else if (Math.abs(n.getY(i)) > 0.5) escala(i, w, d);
        else escala(i, w, h);
      }
      break;
    }
    case 'LatheGeometry': {
      // u: circunferência no maior raio; v: comprimento de arco do perfil
      // (o Three.js usa v = índice do ponto, que não é proporcional ao arco)
      const pts = p.points, arcos = [0];
      for (let j = 1; j < pts.length; j++) arcos.push(arcos[j - 1] + pts[j].distanceTo(pts[j - 1]));
      const rMax = Math.max(...pts.map((v) => v.x));
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rMax * p.phiLength, arcos[i % pts.length]);
      break;
    }
    default:
      return geo; // demais geometrias mantêm as UVs originais
  }
  uv.needsUpdate = true;
  return geo;
}

// ===========================================================================
// MAPA DE RELEVO (bump map)
// Derivado da luminância da própria textura de cor: regiões escuras (juntas
// do piso, frisos, vincos do couro) viram "baixos" e as claras viram "altos".
// O shader perturba a normal pelo gradiente desse mapa, então a luz rasante da
// lanterna e das velas revela o relevo sem acrescentar nenhum vértice.
// A imagem em tons de cinza é gerada uma vez por textura de origem; as cópias
// herdam repeat / offset / rotação, para casar texel a texel com o `map`.
// ===========================================================================
const relevos = new WeakMap();
export function mapaRelevo(tex) {
  let base = relevos.get(tex.source);
  if (!base) {
    const img = tex.image, W = img.width, H = img.height;
    const [c, g] = criarCanvas(W, H);
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H), px = d.data;
    let min = 255, max = 0;
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = l; min = Math.min(min, l); max = Math.max(max, l);
    }
    const k = 255 / Math.max(1, max - min);  // normaliza para usar toda a faixa 0–255
    for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = (px[i] - min) * k;
    g.putImageData(d, 0, 0);
    base = paraTextura(c, { nome: tex.name + '_relevo', cor: false });
    relevos.set(tex.source, base);
  }
  return copiarMapeamento(tex, base.clone());
}

// Copia de `de` para `para` tudo o que define onde a imagem cai sobre as UVs
export function copiarMapeamento(de, para) {
  para.wrapS = de.wrapS; para.wrapT = de.wrapT;
  para.repeat.copy(de.repeat); para.offset.copy(de.offset);
  para.center.copy(de.center); para.rotation = de.rotation;
  return para;
}

// Material PBR com textura de cor e, opcionalmente, relevo (`relevo` = bumpScale)
export function materialTexturizado(tex, { relevo = 0, ...props } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex, ...props });
  if (relevo > 0) { m.bumpMap = mapaRelevo(tex); m.bumpScale = relevo; }
  return m;
}

// ---------------------------------------------------------------------------
// PISO — tábuas de madeira envelhecida com veios, juntas e pregos
// ---------------------------------------------------------------------------
export function texturaPiso() {
  const S = 1024, TABUAS = 8;
  const [c, g] = criarCanvas(S, S);
  const r = rng(11);
  const larg = S / TABUAS;
  for (let i = 0; i < TABUAS; i++) {
    const x0 = i * larg;
    // cada tábua é cortada em 2 peças com junta desencontrada
    const corte = (0.3 + r() * 0.4) * S;
    const pecas = [[0, corte], [corte, S]];
    for (const [y0, y1] of pecas) {
      const base = 0.75 + r() * 0.35;
      const R = 92 * base, G = 58 * base, B = 34 * base;
      g.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
      g.fillRect(x0, y0, larg, y1 - y0);
      // veios ondulados
      for (let v = 0; v < 14; v++) {
        const xv = x0 + 4 + r() * (larg - 8);
        const amp = 2 + r() * 5, freq = 0.01 + r() * 0.02, fase = r() * 6;
        g.strokeStyle = `rgba(${r() < 0.5 ? '30,16,8' : '140,96,60'},${0.15 + r() * 0.25})`;
        g.lineWidth = 0.6 + r() * 1.6;
        g.beginPath();
        for (let y = y0; y <= y1; y += 6) {
          const x = xv + Math.sin(y * freq + fase) * amp;
          y === y0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      }
      // nós da madeira
      if (r() < 0.6) {
        const nx = x0 + larg * (0.3 + r() * 0.4), ny = y0 + (y1 - y0) * r();
        const grd = g.createRadialGradient(nx, ny, 1, nx, ny, 10 + r() * 8);
        grd.addColorStop(0, 'rgba(25,12,5,0.9)');
        grd.addColorStop(1, 'rgba(25,12,5,0)');
        g.fillStyle = grd;
        g.beginPath(); g.ellipse(nx, ny, 9, 18, 0, 0, Math.PI * 2); g.fill();
      }
      // desgaste / manchas
      for (let m = 0; m < 6; m++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
        g.fillRect(x0 + r() * larg, y0 + r() * (y1 - y0), 10 + r() * 40, 30 + r() * 120);
      }
      // junta de topo + pregos
      g.fillStyle = 'rgba(15,8,4,0.95)';
      g.fillRect(x0, y0, larg, 3);
      g.fillStyle = '#1b1b1d';
      for (const yy of [y0 + 12, y1 - 12]) {
        for (const xx of [x0 + 14, x0 + larg - 14]) {
          g.beginPath(); g.arc(xx, yy, 3.2, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(200,200,210,0.35)';
          g.beginPath(); g.arc(xx - 1, yy - 1, 1.2, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#1b1b1d';
        }
      }
    }
    // divisória lateral entre réguas
    g.fillStyle = 'rgba(10,5,2,1)';
    g.fillRect(x0, 0, 3, S);
  }
  return paraTextura(c, { nome: 'piso', repetir: true });
}

// ---------------------------------------------------------------------------
// PAPEL DE PAREDE vitoriano — listras escuras + padrão adamascado
// ---------------------------------------------------------------------------
export function texturaPapelParede() {
  const W = 512, H = 1024;
  const [c, g] = criarCanvas(W, H);
  g.fillStyle = '#2a0f17';
  g.fillRect(0, 0, W, H);
  // listras verticais
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 ? '#24101a' : '#331421';
    g.fillRect(i * 128, 0, 128, H);
    g.fillStyle = 'rgba(176,132,64,0.35)';
    g.fillRect(i * 128, 0, 3, H);
  }
  // motivo adamascado (simétrico) desenhado com curvas de Bézier
  function damasco(cx, cy, s) {
    g.save(); g.translate(cx, cy); g.scale(s, s);
    g.fillStyle = 'rgba(120,52,70,0.55)';
    g.strokeStyle = 'rgba(190,140,80,0.35)';
    g.lineWidth = 1.5;
    for (const lado of [1, -1]) {
      g.save(); g.scale(lado, 1);
      g.beginPath();
      g.moveTo(0, -70);
      g.bezierCurveTo(30, -50, 45, -20, 20, 0);
      g.bezierCurveTo(50, 10, 40, 50, 0, 70);
      g.lineTo(0, -70);
      g.fill(); g.stroke();
      // folhas laterais
      g.beginPath();
      g.moveTo(10, -10);
      g.bezierCurveTo(50, -40, 60, -10, 42, 12);
      g.bezierCurveTo(35, 0, 25, -2, 10, -10);
      g.fill(); g.stroke();
      g.restore();
    }
    g.fillStyle = 'rgba(200,150,90,0.45)';
    g.beginPath(); g.arc(0, -6, 7, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 4; col++) {
      const off = row % 2 ? 64 : 0;
      damasco(col * 128 + 64 + off, row * 180 + 90, 0.62);
    }
  }
  // envelhecimento: manchas e vinheta vertical
  const r = rng(7);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
    g.beginPath();
    g.ellipse(r() * W, r() * H, 20 + r() * 60, 20 + r() * 90, 0, 0, Math.PI * 2);
    g.fill();
  }
  return paraTextura(c, { nome: 'papel_parede', repetir: true });
}

// ---------------------------------------------------------------------------
// LAMBRIL — painéis de madeira entalhada da parte inferior da parede
// ---------------------------------------------------------------------------
export function texturaLambril() {
  const W = 512, H = 256;
  const [c, g] = criarCanvas(W, H);
  const fundo = g.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, '#3b2213'); fundo.addColorStop(1, '#2a170c');
  g.fillStyle = fundo; g.fillRect(0, 0, W, H);
  const r = rng(3);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${r() < .5 ? '15,7,2' : '90,55,30'},${0.2 + r() * 0.2})`;
    g.lineWidth = 1;
    const y = r() * H;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 2);
    g.stroke();
  }
  // dois painéis almofadados (bevel simulado com gradientes claro/escuro)
  for (let p = 0; p < 2; p++) {
    const x = p * 256 + 28, y = 36, w = 200, h = 184;
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(160,110,60,0.25)'; g.fillRect(x + 6, y + 6, w - 6, h - 6);
    g.fillStyle = '#331c0f'; g.fillRect(x + 12, y + 12, w - 24, h - 24);
    g.strokeStyle = 'rgba(200,150,80,0.35)'; g.lineWidth = 2;
    g.strokeRect(x + 22, y + 22, w - 44, h - 44);
  }
  return paraTextura(c, { nome: 'lambril', repetir: true });
}

// ---------------------------------------------------------------------------
// MOLDURA — madeira dourada envelhecida com frisos ornamentais
// ---------------------------------------------------------------------------
export function texturaMoldura() {
  const W = 512, H = 128;
  const [c, g] = criarCanvas(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0.00, '#5a3d12');
  grd.addColorStop(0.20, '#d9b25a');
  grd.addColorStop(0.45, '#8a6420');
  grd.addColorStop(0.60, '#f0cf7a');
  grd.addColorStop(0.85, '#7a561a');
  grd.addColorStop(1.00, '#3f2a0b');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // contas / pérolas em relevo
  for (let x = 8; x < W; x += 16) {
    const gb = g.createRadialGradient(x - 2, 20, 1, x, 22, 7);
    gb.addColorStop(0, '#fff2bf'); gb.addColorStop(1, '#6b4a13');
    g.fillStyle = gb; g.beginPath(); g.arc(x, 22, 6, 0, Math.PI * 2); g.fill();
  }
  // folhas de acanto estilizadas
  g.strokeStyle = 'rgba(60,35,5,0.7)'; g.lineWidth = 2;
  for (let x = 0; x < W; x += 32) {
    g.beginPath();
    g.moveTo(x, 90); g.quadraticCurveTo(x + 16, 60, x + 32, 90);
    g.moveTo(x + 16, 74); g.quadraticCurveTo(x + 20, 90, x + 16, 104);
    g.stroke();
  }
  // pátina escura
  const r = rng(5);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(30,20,5,${r() * 0.25})`;
    g.fillRect(r() * W, r() * H, 2 + r() * 10, 1 + r() * 4);
  }
  return paraTextura(c, { nome: 'moldura', repetir: true });
}

// ---------------------------------------------------------------------------
// TETO — caixotões de madeira escura
// ---------------------------------------------------------------------------
export function texturaTeto() {
  const S = 512;
  const [c, g] = criarCanvas(S, S);
  g.fillStyle = '#1a0f0a'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#26160d'; g.fillRect(40, 40, S - 80, S - 80);
  g.strokeStyle = 'rgba(160,110,50,0.4)'; g.lineWidth = 4;
  g.strokeRect(60, 60, S - 120, S - 120);
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(40, 40, S - 80, 10); g.fillRect(40, 40, 10, S - 80);
  return paraTextura(c, { nome: 'teto', repetir: true });
}

// ---------------------------------------------------------------------------
// TAPETE CENTRAL — rosa dos ventos ornamental (N / L / S / O) que marca o
// ponto de aparição do Fantasma Chefe e serve de referência de orientação.
// ---------------------------------------------------------------------------
export function texturaTapete() {
  const S = 1024, C = S / 2;
  const [c, g] = criarCanvas(S, S);
  g.clearRect(0, 0, S, S);
  const aneis = [[500, '#3d0b12'], [470, '#b08a3a'], [455, '#5c121c'], [330, '#2b0a10'], [318, '#b08a3a'], [305, '#4a0f18']];
  for (const [rad, cor] of aneis) { g.fillStyle = cor; g.beginPath(); g.arc(C, C, rad, 0, Math.PI * 2); g.fill(); }
  // franja ornamental entre os anéis
  g.save(); g.translate(C, C);
  for (let i = 0; i < 48; i++) {
    g.rotate(Math.PI * 2 / 48);
    g.fillStyle = i % 2 ? '#c9a24a' : '#7b1a24';
    g.beginPath(); g.moveTo(0, -440); g.lineTo(14, -390); g.lineTo(0, -345); g.lineTo(-14, -390); g.closePath(); g.fill();
  }
  // rosa dos ventos: 8 pontas
  for (let i = 0; i < 8; i++) {
    g.save(); g.rotate(i * Math.PI / 4);
    const longa = i % 2 === 0;
    const comp = longa ? 280 : 170, larg = longa ? 40 : 26;
    g.fillStyle = '#d8b45e';
    g.beginPath(); g.moveTo(0, -comp); g.lineTo(larg, 0); g.lineTo(0, 0); g.closePath(); g.fill();
    g.fillStyle = '#8a6420';
    g.beginPath(); g.moveTo(0, -comp); g.lineTo(-larg, 0); g.lineTo(0, 0); g.closePath(); g.fill();
    g.restore();
  }
  g.fillStyle = '#5c121c'; g.beginPath(); g.arc(0, 0, 36, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d8b45e'; g.lineWidth = 6; g.stroke();
  // letras cardeais (Norte para cima da textura = -Z no mundo)
  g.fillStyle = '#f2d995'; g.font = 'bold 64px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', 0, -400); g.fillText('S', 0, 400); g.fillText('L', 400, 0); g.fillText('O', -400, 0);
  g.restore();
  return paraTextura(c, { nome: 'tapete' });
}

// ---------------------------------------------------------------------------
// QUADROS — 4 pinturas exclusivas (uma por parede)
// ---------------------------------------------------------------------------
function ceuNoturno(g, W, H, topo, base) {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, topo); grd.addColorStop(1, base);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
}
function craquelado(g, W, H, seed) { // verniz rachado de pintura antiga
  const r = rng(seed);
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.7;
  for (let i = 0; i < 160; i++) {
    let x = r() * W, y = r() * H;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  const v = g.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, W * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// I. O Conde Sombrio — retrato gótico vampírico
export function quadroConde() {
  const W = 512, H = 640;
  const [c, g] = criarCanvas(W, H);
  ceuNoturno(g, W, H, '#1b0d1f', '#07040a');
  // capa com gola alta
  g.fillStyle = '#0c0a10';
  g.beginPath(); g.moveTo(40, H); g.lineTo(110, 330); g.lineTo(256, 400); g.lineTo(402, 330); g.lineTo(472, H); g.fill();
  g.fillStyle = '#5e0b14'; // forro vermelho da gola
  g.beginPath(); g.moveTo(110, 330); g.lineTo(70, 180); g.lineTo(200, 360); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(402, 330); g.lineTo(442, 180); g.lineTo(312, 360); g.closePath(); g.fill();
  // camisa / medalhão
  g.fillStyle = '#d8d2c4';
  g.beginPath(); g.moveTo(206, 380); g.lineTo(256, 520); g.lineTo(306, 380); g.fill();
  g.fillStyle = '#b8902e'; g.beginPath(); g.arc(256, 450, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#7a0f1a'; g.beginPath(); g.arc(256, 450, 8, 0, Math.PI * 2); g.fill();
  // pescoço e rosto pálido
  g.fillStyle = '#b9b4b8'; g.fillRect(226, 300, 60, 80);
  const pele = g.createRadialGradient(240, 220, 10, 256, 240, 110);
  pele.addColorStop(0, '#e6e1e3'); pele.addColorStop(1, '#8c8590');
  g.fillStyle = pele; g.beginPath(); g.ellipse(256, 235, 78, 100, 0, 0, Math.PI * 2); g.fill();
  // cabelo com bico de viúva
  g.fillStyle = '#0a0a0c';
  g.beginPath(); g.moveTo(176, 230); g.quadraticCurveTo(170, 120, 256, 118); g.quadraticCurveTo(342, 120, 336, 230);
  g.lineTo(320, 170); g.lineTo(256, 205); g.lineTo(192, 170); g.closePath(); g.fill();
  // olhos vermelhos brilhantes
  for (const x of [226, 286]) {
    const gl = g.createRadialGradient(x, 240, 1, x, 240, 18);
    gl.addColorStop(0, '#ffdddd'); gl.addColorStop(0.3, '#ff2020'); gl.addColorStop(1, 'rgba(120,0,0,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(x, 240, 18, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#000'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(205, 222); g.lineTo(245, 230); g.moveTo(307, 222); g.lineTo(267, 230); g.stroke();
  // boca com presas
  g.strokeStyle = '#3a0a10'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(228, 296); g.quadraticCurveTo(256, 306, 284, 296); g.stroke();
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(238, 298); g.lineTo(242, 314); g.lineTo(246, 299); g.fill();
  g.beginPath(); g.moveTo(266, 299); g.lineTo(270, 314); g.lineTo(274, 298); g.fill();
  craquelado(g, W, H, 21);
  return paraTextura(c, { nome: 'quadro_conde' });
}

// II. Floresta da Lua Cheia — paisagem noturna com árvores retorcidas
export function quadroFloresta() {
  const W = 512, H = 640;
  const [c, g] = criarCanvas(W, H);
  ceuNoturno(g, W, H, '#0d1a33', '#2b3a4a');
  const lua = g.createRadialGradient(330, 180, 10, 330, 180, 160);
  lua.addColorStop(0, 'rgba(255,250,215,1)'); lua.addColorStop(0.45, 'rgba(255,240,190,1)');
  lua.addColorStop(0.5, 'rgba(255,230,170,0.35)'); lua.addColorStop(1, 'rgba(255,230,170,0)');
  g.fillStyle = lua; g.beginPath(); g.arc(330, 180, 160, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(180,170,140,0.35)';
  g.beginPath(); g.arc(305, 165, 14, 0, 7); g.arc(350, 200, 10, 0, 7); g.fill();
  // colinas
  g.fillStyle = '#0e1418';
  g.beginPath(); g.moveTo(0, 470); g.quadraticCurveTo(150, 400, 300, 460); g.quadraticCurveTo(420, 500, 512, 440); g.lineTo(512, H); g.lineTo(0, H); g.fill();
  // árvores retorcidas (galhos recursivos)
  const r = rng(42);
  function galho(x, y, ang, comp, esp, nivel) {
    const x2 = x + Math.cos(ang) * comp, y2 = y + Math.sin(ang) * comp;
    g.strokeStyle = '#06080a'; g.lineWidth = esp; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo((x + x2) / 2 + (r() - 0.5) * comp * 0.5, (y + y2) / 2 + (r() - 0.5) * comp * 0.3, x2, y2);
    g.stroke();
    if (nivel > 0) {
      const n = 2 + (r() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) galho(x2, y2, ang + (r() - 0.5) * 1.6, comp * (0.6 + r() * 0.2), esp * 0.62, nivel - 1);
    }
  }
  galho(90, 640, -Math.PI / 2 - 0.1, 150, 26, 6);
  galho(450, 640, -Math.PI / 2 + 0.15, 130, 22, 6);
  galho(250, 640, -Math.PI / 2, 60, 12, 4);
  // névoa rasteira
  for (let i = 0; i < 6; i++) {
    const ng = g.createLinearGradient(0, 480 + i * 20, 0, 560 + i * 20);
    ng.addColorStop(0, 'rgba(160,180,200,0)'); ng.addColorStop(0.5, 'rgba(160,180,200,0.08)'); ng.addColorStop(1, 'rgba(160,180,200,0)');
    g.fillStyle = ng; g.fillRect(0, 480 + i * 20, W, 80);
  }
  // morcegos
  g.fillStyle = '#05060a';
  for (const [bx, by, s] of [[150, 130, 1], [210, 95, 0.7], [420, 330, 0.8]]) {
    g.save(); g.translate(bx, by); g.scale(s, s);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-12, -10, -26, -4); g.quadraticCurveTo(-18, 0, -14, 6);
    g.quadraticCurveTo(-6, 2, 0, 6); g.quadraticCurveTo(6, 2, 14, 6); g.quadraticCurveTo(18, 0, 26, -4); g.quadraticCurveTo(12, -10, 0, 0); g.fill();
    g.restore();
  }
  craquelado(g, W, H, 22);
  return paraTextura(c, { nome: 'quadro_floresta' });
}

// III. Memento Mori — natureza-morta sombria com crânio e vela
export function quadroMementoMori() {
  const W = 512, H = 640;
  const [c, g] = criarCanvas(W, H);
  ceuNoturno(g, W, H, '#140d08', '#050302');
  // halo da vela
  const halo = g.createRadialGradient(370, 250, 5, 370, 250, 260);
  halo.addColorStop(0, 'rgba(255,190,90,0.55)'); halo.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = halo; g.fillRect(0, 0, W, H);
  // mesa
  g.fillStyle = '#2b1709'; g.fillRect(0, 470, W, 170);
  g.fillStyle = '#45250f'; g.fillRect(0, 462, W, 12);
  // livros empilhados
  const livros = [['#4a1414', 60, 430, 190, 34], ['#1d2c1c', 75, 398, 170, 32], ['#3b2a14', 66, 370, 160, 28]];
  for (const [cor, x, y, w, h] of livros) {
    g.fillStyle = cor; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(220,190,120,0.6)'; g.fillRect(x + 8, y + h / 2 - 2, w - 16, 3);
    g.fillStyle = '#d7c8a2'; g.fillRect(x + w - 6, y + 3, 6, h - 6);
  }
  // crânio sobre os livros
  const osso = g.createRadialGradient(180, 300, 10, 160, 310, 90);
  osso.addColorStop(0, '#efe4c9'); osso.addColorStop(1, '#8a7a5a');
  g.fillStyle = osso;
  g.beginPath(); g.ellipse(160, 300, 72, 64, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.roundRect(118, 320, 84, 50, 14); g.fill();
  g.fillStyle = '#120a05';
  g.beginPath(); g.ellipse(132, 305, 18, 21, 0.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(188, 305, 18, 21, -0.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(160, 325); g.lineTo(152, 345); g.lineTo(168, 345); g.fill();
  for (let i = 0; i < 6; i++) g.fillRect(128 + i * 12, 354, 2, 14);
  // vela + castiçal
  g.fillStyle = '#9c7a2c'; g.fillRect(340, 450, 60, 14); g.fillRect(362, 360, 16, 92);
  g.fillStyle = '#e8dcc0'; g.fillRect(356, 280, 28, 84);
  g.fillStyle = '#d9cdb0'; g.beginPath(); g.ellipse(370, 280, 14, 5, 0, 0, 7); g.fill();
  const chama = g.createRadialGradient(370, 250, 2, 370, 255, 22);
  chama.addColorStop(0, '#fffbe0'); chama.addColorStop(0.5, '#ffb43a'); chama.addColorStop(1, 'rgba(255,100,0,0)');
  g.fillStyle = chama; g.beginPath(); g.ellipse(370, 252, 10, 24, 0, 0, 7); g.fill();
  // ampulheta
  g.strokeStyle = '#8a6a2a'; g.lineWidth = 6;
  g.strokeRect(250, 360, 60, 104);
  g.fillStyle = 'rgba(200,220,230,0.25)';
  g.beginPath(); g.moveTo(256, 366); g.lineTo(304, 366); g.lineTo(280, 412); g.lineTo(304, 458); g.lineTo(256, 458); g.lineTo(280, 412); g.fill();
  g.fillStyle = '#c9a25a';
  g.beginPath(); g.moveTo(262, 458); g.lineTo(298, 458); g.lineTo(280, 438); g.fill();
  craquelado(g, W, H, 23);
  return paraTextura(c, { nome: 'quadro_memento_mori' });
}

// IV. Castelo da Tempestade — fortaleza sob raios na montanha
export function quadroCastelo() {
  const W = 512, H = 640;
  const [c, g] = criarCanvas(W, H);
  ceuNoturno(g, W, H, '#1c1f2e', '#3d3f52');
  const r = rng(77);
  // nuvens carregadas
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${20 + r() * 30},${22 + r() * 30},${35 + r() * 30},0.6)`;
    g.beginPath(); g.ellipse(r() * W, r() * 260, 40 + r() * 80, 20 + r() * 30, 0, 0, 7); g.fill();
  }
  // relâmpago
  function raio(x, y, nivel, esp) {
    g.strokeStyle = 'rgba(235,240,255,0.95)'; g.lineWidth = esp;
    g.shadowColor = '#9fb4ff'; g.shadowBlur = 18;
    g.beginPath(); g.moveTo(x, y);
    let cx = x, cy = y;
    for (let i = 0; i < 9; i++) {
      cx += (r() - 0.5) * 50; cy += 22 + r() * 18; g.lineTo(cx, cy);
      if (nivel > 0 && r() < 0.25) { g.stroke(); raio(cx, cy, nivel - 1, esp * 0.5); g.beginPath(); g.moveTo(cx, cy); }
    }
    g.stroke(); g.shadowBlur = 0;
  }
  raio(380, 0, 2, 4);
  // montanha
  g.fillStyle = '#121219';
  g.beginPath(); g.moveTo(0, 640); g.lineTo(0, 470); g.lineTo(120, 380); g.lineTo(200, 300); g.lineTo(260, 320);
  g.lineTo(340, 360); g.lineTo(512, 480); g.lineTo(512, 640); g.fill();
  // castelo
  g.fillStyle = '#08080d';
  g.fillRect(150, 230, 150, 100);
  const torres = [[140, 170, 34, 160], [215, 130, 40, 200], [292, 190, 30, 140]];
  for (const [x, y, w, h] of torres) {
    g.fillRect(x, y, w, h);
    g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + w / 2, y - 50); g.lineTo(x + w + 6, y); g.fill();
  }
  for (let x = 150; x < 300; x += 14) g.fillRect(x, 222, 8, 10); // ameias
  // janelas acesas
  g.fillStyle = '#ffc04a';
  for (const [x, y] of [[230, 170], [158, 210], [300, 230], [200, 270], [250, 290]]) g.fillRect(x, y, 6, 12);
  // chuva
  g.strokeStyle = 'rgba(180,190,220,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = r() * H;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6, y + 18); g.stroke();
  }
  craquelado(g, W, H, 24);
  return paraTextura(c, { nome: 'quadro_castelo' });
}

// Placa de título dourada abaixo de cada quadro
export function texturaPlaca(texto) {
  const [c, g] = criarCanvas(512, 96);
  const grd = g.createLinearGradient(0, 0, 0, 96);
  grd.addColorStop(0, '#d6b05a'); grd.addColorStop(0.5, '#8d6620'); grd.addColorStop(1, '#5a3f10');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#1a1206'; g.fillRect(8, 8, 496, 80);
  g.fillStyle = '#e8cb84'; g.font = 'italic bold 36px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(texto, 256, 50);
  return paraTextura(c, { nome: 'placa_' + slug(texto) });
}

// Mostrador de relógio (algarismos romanos)
export function texturaMostrador() {
  const S = 256, C = 128;
  const [c, g] = criarCanvas(S, S);
  g.fillStyle = '#e9dfc4'; g.beginPath(); g.arc(C, C, 126, 0, 7); g.fill();
  g.strokeStyle = '#6b4c1a'; g.lineWidth = 6; g.stroke();
  const rom = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  g.fillStyle = '#1c140a'; g.font = 'bold 22px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  rom.forEach((t, i) => {
    const a = i * Math.PI / 6 - Math.PI / 2;
    g.fillText(t, C + Math.cos(a) * 98, C + Math.sin(a) * 98);
  });
  return paraTextura(c, { nome: 'mostrador_relogio' });
}

// Manômetro do aspirador
export function texturaManometro() {
  const S = 128, C = 64;
  const [c, g] = criarCanvas(S, S);
  g.fillStyle = '#f2efe6'; g.beginPath(); g.arc(C, C, 62, 0, 7); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 2;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + i * (Math.PI * 1.5 / 10);
    g.beginPath(); g.moveTo(C + Math.cos(a) * 46, C + Math.sin(a) * 46); g.lineTo(C + Math.cos(a) * 56, C + Math.sin(a) * 56); g.stroke();
  }
  g.strokeStyle = '#c0261f'; g.lineWidth = 5;
  g.beginPath(); g.arc(C, C, 52, Math.PI * 1.85, Math.PI * 2.25); g.stroke();
  return paraTextura(c, { nome: 'manometro' });
}

// Faixas da mangueira corrugada
export function texturaCorrugada() {
  const [c, g] = criarCanvas(64, 64);
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, '#2a2d33'); grd.addColorStop(0.5, '#6c717c'); grd.addColorStop(1, '#2a2d33');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return paraTextura(c, { nome: 'mangueira_corrugada', repetir: true });
}

// Gradiente de alfa para o cone volumétrico da lanterna
export function texturaGradienteCone() {
  const [c, g] = criarCanvas(4, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  // alphaMap usa o canal verde: branco = opaco (ponta do cone), preto = transparente (base)
  grd.addColorStop(0, '#fff');
  grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  return paraTextura(c, { nome: 'cone_lanterna_alfa', cor: false });
}

// Emblema do boné do zelador
export function texturaEmblema() {
  const [c, g] = criarCanvas(128, 128);
  g.fillStyle = '#f4f0e0'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.strokeStyle = '#1f5e2c'; g.lineWidth = 8; g.stroke();
  g.fillStyle = '#1f5e2c'; g.font = 'bold 76px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('Z', 64, 70);
  return paraTextura(c, { nome: 'emblema_bone' });
}

// Teia de aranha (cantos do teto) — fundo transparente
export function texturaTeia() {
  const S = 512;
  const [c, g] = criarCanvas(S, S);
  g.strokeStyle = 'rgba(230,230,240,0.85)'; g.lineWidth = 1.4;
  const cx = S / 2, cy = 0; // ancorada na borda superior (canto do teto)
  const raios = 11;
  for (let i = 0; i <= raios; i++) {
    const a = Math.PI * (i / raios);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * S * 0.7, cy + Math.sin(a) * S * 0.7); g.stroke();
  }
  g.lineWidth = 1;
  for (let k = 1; k < 9; k++) {
    const rr = k * 30 + k * k * 1.5;
    g.beginPath();
    for (let i = 0; i <= raios; i++) {
      const a = Math.PI * (i / raios), sag = 0.92;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else { const am = Math.PI * ((i - 0.5) / raios); g.quadraticCurveTo(cx + Math.cos(am) * rr * sag, cy + Math.sin(am) * rr * sag, x, y); }
    }
    g.stroke();
  }
  return paraTextura(c, { nome: 'teia' });
}

// ===========================================================================
// TEXTURAS DOS PERSONAGENS — todas são ladrilháveis (as bordas se encaixam),
// porque são repetidas sobre as UVs em metros (ver uvEmMetros).
// ===========================================================================

// Desenha `fn` também deslocado de ±W/±H para que formas que cruzam a borda
// reapareçam do outro lado (textura sem emenda visível ao repetir).
function emLaco(W, H, fn) {
  for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) fn(dx, dy);
}

// JEANS — sarja diagonal (trama 3×1) com fios claros da trama e desbotado
export function texturaJeans() {
  const S = 256;
  const [c, g] = criarCanvas(S, S);
  const r = rng(41);
  g.fillStyle = '#2b4c82'; g.fillRect(0, 0, S, S);
  // manchas suaves de desbotado
  for (let i = 0; i < 18; i++) {
    const x = r() * S, y = r() * S, raio = 20 + r() * 50, a = 0.05 + r() * 0.08;
    emLaco(S, S, (dx, dy) => {
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, raio);
      grd.addColorStop(0, `rgba(170,195,230,${a})`); grd.addColorStop(1, 'rgba(170,195,230,0)');
      g.fillStyle = grd; g.fillRect(x + dx - raio, y + dy - raio, raio * 2, raio * 2);
    });
  }
  // sarja: diagonais a 45° com período 8 px (divide 256 ⇒ ladrilhável)
  g.lineWidth = 2.2;
  for (let k = -S; k < 2 * S; k += 8) {
    g.strokeStyle = 'rgba(12,24,52,0.55)';
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
    g.strokeStyle = 'rgba(120,150,200,0.25)';
    g.beginPath(); g.moveTo(k + 3, 0); g.lineTo(k + 3 + S, S); g.stroke();
  }
  // fios brancos da trama aparecendo
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(220,230,245,${0.08 + r() * 0.18})`;
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1);
  }
  return paraTextura(c, { nome: 'jeans', repetir: true });
}

// FLANELA — xadrez verde (camisa do zelador) com textura de fibra
export function texturaFlanela() {
  const S = 256;
  const [c, g] = criarCanvas(S, S);
  const r = rng(77);
  g.fillStyle = '#2f8a3e'; g.fillRect(0, 0, S, S);
  // faixas (largura, posição, cor) repetidas na horizontal e na vertical
  const faixas = [[64, 0, 'rgba(12,45,20,0.55)'], [18, 96, 'rgba(10,20,12,0.6)'], [6, 140, 'rgba(240,215,120,0.55)'],
    [30, 176, 'rgba(12,45,20,0.45)'], [4, 224, 'rgba(10,20,12,0.7)']];
  for (const [w, p, cor] of faixas) {
    g.fillStyle = cor;
    g.fillRect(p, 0, w, S);   // verticais
    g.fillRect(0, p, S, w);   // horizontais (o cruzamento escurece, como no tecido)
  }
  // fibras felpudas
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 2 + r() * 4;
    g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return paraTextura(c, { nome: 'flanela', repetir: true });
}

// COURO — grão irregular, vincos e arranhões (botas e cinto)
export function texturaCouro() {
  const S = 256;
  const [c, g] = criarCanvas(S, S);
  const r = rng(5);
  g.fillStyle = '#4a2a14'; g.fillRect(0, 0, S, S);
  // poros do grão: pequenas células claras e escuras
  for (let i = 0; i < 900; i++) {
    // sorteios fora de emLaco: as cópias nas bordas precisam ser idênticas
    const x = r() * S, y = r() * S, raio = 2 + r() * 5, achat = 0.5 + r() * 0.5, giro = r() * 3;
    g.fillStyle = r() < 0.5 ? `rgba(120,75,40,${0.15 + r() * 0.2})` : `rgba(20,8,2,${0.2 + r() * 0.25})`;
    emLaco(S, S, (dx, dy) => {
      g.beginPath(); g.ellipse(x + dx, y + dy, raio, raio * achat, giro, 0, 7); g.fill();
    });
  }
  // vincos (linhas escuras sinuosas) e arranhões claros
  for (let i = 0; i < 26; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 20 + r() * 60, vinco = i < 16;
    emLaco(S, S, (dx, dy) => {
      g.strokeStyle = vinco ? 'rgba(15,6,1,0.5)' : 'rgba(170,120,80,0.35)';
      g.lineWidth = vinco ? 1.6 : 1;
      g.beginPath(); g.moveTo(x + dx, y + dy);
      g.quadraticCurveTo(x + dx + Math.cos(a + 0.6) * l * 0.5, y + dy + Math.sin(a + 0.6) * l * 0.5,
        x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
      g.stroke();
    });
  }
  return paraTextura(c, { nome: 'couro', repetir: true });
}

// ECTOPLASMA — volutas em tons de cinza; o material multiplica pela cor de
// cada fantasma, então uma única imagem serve para os 4 fantasmas e o Chefe
export function texturaEctoplasma() {
  const S = 256;
  const [c, g] = criarCanvas(S, S);
  const r = rng(99);
  g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, S, S);
  // névoa: bolhas claras e escuras sobrepostas
  for (let i = 0; i < 60; i++) {
    const x = r() * S, y = r() * S, raio = 12 + r() * 40, claro = r() < 0.6, a = 0.15 + r() * 0.25;
    emLaco(S, S, (dx, dy) => {
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, raio);
      grd.addColorStop(0, claro ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
      grd.addColorStop(1, 'rgba(128,128,128,0)');
      g.fillStyle = grd; g.fillRect(x + dx - raio, y + dy - raio, raio * 2, raio * 2);
    });
  }
  // volutas: espirais brilhantes
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const x = r() * S, y = r() * S, giro = r() < 0.5 ? 1 : -1, R = 10 + r() * 22;
    g.strokeStyle = `rgba(255,255,255,${0.35 + r() * 0.3})`; g.lineWidth = 1.5 + r() * 2;
    emLaco(S, S, (dx, dy) => {
      g.beginPath();
      for (let k = 0; k <= 40; k++) {
        const a = giro * k * 0.25, rr = R * (1 - k / 48);
        const px = x + dx + Math.cos(a) * rr, py = y + dy + Math.sin(a) * rr;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
    });
  }
  return paraTextura(c, { nome: 'ectoplasma', repetir: true });
}

// ===========================================================================
// GRADE UV (tecla U) — substitui temporariamente os mapas de cor para mostrar
// as coordenadas de textura de cada superfície:
//   • cor da célula: vermelho cresce com u, verde cresce com v;
//   • rótulo A1…H8: coluna (letra) = u, linha (número) = v, contando de baixo;
//   • texto espelhado = UV invertida; quadrados viram retângulos = distorção.
// ===========================================================================
export function texturaGradeUV() {
  const S = 1024, N = 8, cel = S / N;
  const [c, g] = criarCanvas(S, S);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u = (i + 0.5) / N, v = (j + 0.5) / N, escuro = (i + j) % 2 ? 0.75 : 1;
    const y = S - (j + 1) * cel;     // v = 0 na base da imagem (flipY do WebGL)
    g.fillStyle = `rgb(${(40 + u * 215) * escuro | 0},${(40 + v * 215) * escuro | 0},${150 * escuro | 0})`;
    g.fillRect(i * cel, y, cel, cel);
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.font = 'bold 44px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ABCDEFGH'[i] + (j + 1), i * cel + cel / 2, y + cel / 2);
  }
  // linhas finas a cada 1/32 e grossas a cada 1/8
  for (let k = 0; k <= 32; k++) {
    g.strokeStyle = k % 4 ? 'rgba(255,255,255,0.25)' : '#fff';
    g.lineWidth = k % 4 ? 1 : 4;
    const p = k * S / 32;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  // origem (0,0) e sentido dos eixos
  g.fillStyle = '#fff'; g.font = 'bold 30px Consolas, monospace'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText('(0,0)  u →', 10, S - 12);
  g.save(); g.translate(30, S - 60); g.rotate(-Math.PI / 2); g.fillText('v →', 0, 0); g.restore();
  return paraTextura(c, { nome: 'grade_uv', repetir: true });
}
