// ============================================================================
// inspecaoTexturas.js — Ferramentas para demonstrar o mapeamento de texturas
//   • modo grade UV (tecla U): troca os mapas de cor por uma grade rotulada;
//   • layoutUV(): desenha a malha no espaço de textura, sobre a imagem;
//   • baixarZip() (tecla X): baixa um .zip com os PNGs de todas as imagens
//     usadas como textura (cor, relevo, alfa, emissão), a grade UV e os layouts.
// ============================================================================
import * as THREE from 'three';
import { texturaGradeUV, copiarMapeamento } from './texturas.js';

const CANAIS = ['map', 'bumpMap', 'emissiveMap', 'alphaMap', 'normalMap', 'roughnessMap'];
const materiais = (o) => (Array.isArray(o.material) ? o.material : [o.material]);

// ------------------------------------------------------------ modo grade UV
// Cada material texturizado recebe a grade com o MESMO repeat/offset/rotação
// da sua textura. Como a grade é quadrada e algumas imagens não são (o papel
// de parede é 1:2), o repeat é multiplicado pela proporção da imagem original:
// assim, células quadradas na tela = textura aplicada sem distorção.
export function criarModoUV(scene) {
  const grade = texturaGradeUV();
  let originais = null;   // Map(material → estado original)
  return {
    grade,
    get ativo() { return originais !== null; },
    alternar() {
      if (originais) {
        for (const [m, o] of originais) {
          m.map = o.map; m.emissiveMap = o.emissiveMap; m.color.copy(o.cor); m.needsUpdate = true;
        }
        originais = null;
        return false;
      }
      originais = new Map();
      scene.traverse((obj) => {
        if (!obj.isMesh) return;
        for (const m of materiais(obj)) {
          if (!m.map || originais.has(m)) continue;
          originais.set(m, { map: m.map, emissiveMap: m.emissiveMap, cor: m.color.clone() });
          const g = copiarMapeamento(m.map, grade.clone());
          const { width: w, height: h } = m.map.image, menor = Math.min(w, h);
          g.repeat.x *= w / menor; g.repeat.y *= h / menor;
          g.wrapS = g.wrapT = THREE.RepeatWrapping;
          m.map = g;
          if (m.emissiveMap) m.emissiveMap = g;
          m.color.set(0xffffff);
          m.needsUpdate = true;
        }
      });
      return true;
    },
  };
}

// ------------------------------------------------------ relevo liga/desliga
// Tecla R: zera o bumpScale de todos os materiais (e restaura), para comparar
// a mesma superfície iluminada com e sem o mapa de relevo.
export function criarAlternadorRelevo(scene) {
  let escalas = null;   // Map(material → bumpScale original)
  return {
    get ativo() { return escalas === null; },
    alternar() {
      if (escalas) { for (const [m, e] of escalas) m.bumpScale = e; escalas = null; return true; }
      escalas = new Map();
      scene.traverse((obj) => {
        if (obj.isMesh) for (const m of materiais(obj)) if (m.bumpMap && !escalas.has(m)) { escalas.set(m, m.bumpScale); m.bumpScale = 0; }
      });
      return false;
    },
  };
}

// ------------------------------------------------------------- layout UV
// Desenha os triângulos da malha no espaço da textura (UV já transformada por
// repeat/offset/rotação), sobre as cópias da imagem que ela realmente recebe.
// Cada ladrilho é desenhado na proporção real da imagem: se os triângulos
// tiverem a mesma proporção da peça 3D, a textura não está distorcida.
export function layoutUV(mesh, titulo) {
  const geo = mesh.geometry, tex = materiais(mesh)[0].map, img = tex.image;
  tex.updateMatrix();
  const uv = geo.attributes.uv, p = new THREE.Vector2();
  const pts = [];
  for (let i = 0; i < uv.count; i++) pts.push(p.set(uv.getX(i), uv.getY(i)).applyMatrix3(tex.matrix).toArray());
  const us = pts.map((q) => q[0]), vs = pts.map((q) => q[1]);
  const u0 = Math.floor(Math.min(...us) + 1e-6), u1 = Math.ceil(Math.max(...us) - 1e-6);
  const v0 = Math.floor(Math.min(...vs) + 1e-6), v1 = Math.ceil(Math.max(...vs) - 1e-6);
  const nu = Math.max(1, u1 - u0), nv = Math.max(1, v1 - v0);
  const s = Math.min(1024 / (nu * img.width), 1024 / (nv * img.height));
  const tw = img.width * s, th = img.height * s, TOPO = 56;

  const c = document.createElement('canvas');
  c.width = Math.ceil(nu * tw); c.height = Math.ceil(nv * th) + TOPO;
  const g = c.getContext('2d');
  g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
  // ladrilhos da imagem (v = 0 embaixo, como no WebGL com flipY)
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const x = i * tw, y = TOPO + (nv - 1 - j) * th;
    g.globalAlpha = 0.8; g.drawImage(img, x, y, tw, th); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.setLineDash([6, 4]); g.strokeRect(x, y, tw, th); g.setLineDash([]);
  }
  // arestas dos triângulos
  const X = (q) => (q[0] - u0) * tw, Y = (q) => TOPO + (v1 - q[1]) * th;
  const ind = geo.index ? geo.index.array : [...Array(uv.count).keys()];
  g.strokeStyle = 'rgba(255,230,0,0.9)'; g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k + 2 < ind.length; k += 3) {
    const [a, b, d] = [pts[ind[k]], pts[ind[k + 1]], pts[ind[k + 2]]];
    g.moveTo(X(a), Y(a)); g.lineTo(X(b), Y(b)); g.lineTo(X(d), Y(d)); g.closePath();
  }
  g.stroke();
  // legenda
  g.fillStyle = '#f2d995'; g.font = 'bold 20px Consolas, monospace';
  g.fillText(titulo, 10, 24);
  g.font = '15px Consolas, monospace'; g.fillStyle = '#ddd';
  g.fillText(`${geo.type} · textura "${tex.name}" · repeat ${+tex.repeat.x.toFixed(2)} × ${+tex.repeat.y.toFixed(2)}` +
    ` · u ∈ [${u0}, ${u1}] · v ∈ [${v0}, ${v1}] (em ladrilhos)`, 10, 46);
  return c;
}

// --------------------------------------------------------------- exportação
// Uma entrada por imagem (texturas clonadas com outro repeat compartilham a
// mesma imagem — `source` — e são exportadas uma vez só).
export function imagensDaCena(scene) {
  const vistas = new Map();
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const m of materiais(obj)) for (const canal of CANAIS) {
      const t = m[canal];
      if (t && t.image && !vistas.has(t.source.uuid)) vistas.set(t.source.uuid, { nome: t.name || 'textura', canvas: t.image });
    }
  });
  return [...vistas.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

// Baixa tudo num único .zip (navegadores bloqueiam vários downloads seguidos).
// As pastas dentro do zip espelham o repositório: texturas/ e capturas/entrega4/.
export function baixarZip(lista, nomeZip) {
  const arquivos = lista.map(({ nome, canvas }) => ({
    caminho: (nome.startsWith('uv_') ? 'capturas/entrega4/' : 'texturas/') + nome + '.png',
    bytes: Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), (ch) => ch.charCodeAt(0)),
  }));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zipSemCompressao(arquivos));
  a.download = nomeZip;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ZIP no método "store" (sem compressão — PNG já é comprimido). Formato:
// [cabeçalho local + dados] por arquivo, diretório central, registro final.
function zipSemCompressao(arquivos) {
  const enc = new TextEncoder(), partes = [], central = [];
  let offset = 0;
  for (const { caminho, bytes } of arquivos) {
    const nome = enc.encode(caminho), crc = crc32(bytes), n = bytes.length;
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, n, 4], [22, n, 4], [26, nome.length, 2]]
      .forEach(([pos, v, t]) => (t === 4 ? local.setUint32(pos, v, true) : local.setUint16(pos, v, true)));
    const cd = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [14, 0x21, 2], [16, crc, 4], [20, n, 4], [24, n, 4], [28, nome.length, 2], [42, offset, 4]]
      .forEach(([pos, v, t]) => (t === 4 ? cd.setUint32(pos, v, true) : cd.setUint16(pos, v, true)));
    partes.push(local, nome, bytes);
    central.push(cd, nome);
    offset += 30 + nome.length + n;
  }
  const tamCentral = central.reduce((t, b) => t + b.byteLength, 0);
  const fim = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [8, arquivos.length, 2], [10, arquivos.length, 2], [12, tamCentral, 4], [16, offset, 4]]
    .forEach(([pos, v, t]) => (t === 4 ? fim.setUint32(pos, v, true) : fim.setUint16(pos, v, true)));
  return new Blob([...partes, ...central, fim], { type: 'application/zip' });
}

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
