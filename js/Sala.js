// ============================================================================
// Sala.js — Cenário: salão vitoriano fechado (20 m × 20 m × 6 m)
//
// Convenção de eixos (mão direita, padrão Three.js) — 1 unidade = 1 metro
//   +X = Leste   -X = Oeste   +Y = cima   -Z = Norte   +Z = Sul
//   Origem (0,0,0) = centro do piso (ponto de aparição do Fantasma Chefe).
// ============================================================================
import * as THREE from 'three';
import * as T from './texturas.js';

export const LARGURA = 20;      // eixo X
export const PROFUNDIDADE = 20; // eixo Z
export const ALTURA = 6;        // eixo Y
const MEIA_L = LARGURA / 2, MEIA_P = PROFUNDIDADE / 2;

function malha(geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], sombra = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p); m.rotation.set(...r); m.scale.set(...s);
  m.castShadow = sombra; m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- materiais
const madeiraEscura = new THREE.MeshStandardMaterial({ color: 0x2e1a0e, roughness: 0.6 });
const madeiraMedia  = new THREE.MeshStandardMaterial({ color: 0x4a2c16, roughness: 0.55 });
const latao   = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3 });
const marmore = new THREE.MeshStandardMaterial({ color: 0x4b4350, roughness: 0.35, metalness: 0.05 });
const veludo  = new THREE.MeshStandardMaterial({ color: 0x5a0f1c, roughness: 0.95 });
const vela    = new THREE.MeshStandardMaterial({ color: 0xeee3c8, roughness: 0.8, emissive: 0x3a2a10, emissiveIntensity: 0.4 });
const chamaMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
const cristal = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0, metalness: 0.1, clearcoat: 1 });

export function criarSala() {
  const sala = new THREE.Group();
  sala.name = 'Salao';
  const colisores = [];     // { tipo:'circulo', x, z, r } | { tipo:'caixa', minX, maxX, minZ, maxZ }
  const animaveis = [];     // funções (dt, t) chamadas a cada quadro
  const registro = [];      // objetos listados no painel de inspeção de transformações
  const luzesVela = [];     // luzes com oscilação (flicker)

  const tex = {
    piso: T.texturaPiso(), papel: T.texturaPapelParede(), lambril: T.texturaLambril(),
    moldura: T.texturaMoldura(), teto: T.texturaTeto(),
  };

  // =============================================================== PISO/TETO
  const piso = malha(new THREE.PlaneGeometry(LARGURA, PROFUNDIDADE),
    T.materialTexturizado(T.comRepeticao(tex.piso, 6, 6), { roughness: 0.78, relevo: 2 }),
    [0, 0, 0], [-Math.PI / 2, 0, 0], [1, 1, 1], false);
  piso.name = 'Piso';
  sala.add(piso);

  const teto = malha(new THREE.PlaneGeometry(LARGURA, PROFUNDIDADE),
    T.materialTexturizado(T.comRepeticao(tex.teto, 5, 5), { roughness: 0.9, relevo: 1 }),
    [0, ALTURA, 0], [Math.PI / 2, 0, 0], [1, 1, 1], false);
  teto.name = 'Teto';
  sala.add(teto);

  // tapete central com rosa dos ventos (marca o ponto de aparição do Chefe)
  const tapete = malha(new THREE.CircleGeometry(3.2, 64),
    new THREE.MeshStandardMaterial({ map: T.texturaTapete(), roughness: 1, transparent: true }),
    [0, 0.012, 0], [-Math.PI / 2, 0, 0], [1, 1, 1], false);
  tapete.name = 'Tapete (rosa dos ventos)';
  sala.add(tapete);

  // =============================================================== PAREDES
  // Cada parede é montada num grupo local (plano XY, voltada para +Z) e depois
  // posicionada/rotacionada para ficar de frente para o centro da sala.
  const quadros = [
    { nome: 'Norte', pos: [0, 0, -MEIA_P], rotY: 0,            titulo: 'I. O Conde Sombrio',        pintura: T.quadroConde },
    { nome: 'Leste', pos: [MEIA_L, 0, 0],  rotY: -Math.PI / 2, titulo: 'II. Floresta da Lua Cheia', pintura: T.quadroFloresta },
    { nome: 'Sul',   pos: [0, 0, MEIA_P],  rotY: Math.PI,      titulo: 'III. Memento Mori',         pintura: T.quadroMementoMori },
    { nome: 'Oeste', pos: [-MEIA_L, 0, 0], rotY: Math.PI / 2,  titulo: 'IV. Castelo da Tempestade', pintura: T.quadroCastelo },
  ];
  const paredes = {};
  for (const q of quadros) {
    const comp = q.nome === 'Norte' || q.nome === 'Sul' ? LARGURA : PROFUNDIDADE;
    const parede = criarParede(comp, tex);
    parede.name = 'Parede ' + q.nome;
    parede.position.set(...q.pos);
    parede.rotation.y = q.rotY;
    parede.add(criarQuadro(q.titulo, q.pintura(), tex.moldura));
    for (const x of [-2.1, 2.1]) {
      const { grupo, luz } = criarArandela();
      grupo.position.set(x, 3.3, 0);
      parede.add(grupo);
      luzesVela.push({ luz, base: luz.intensity, fase: Math.random() * 100 });
    }
    sala.add(parede);
    paredes[q.nome] = parede;
    registro.push({ obj: parede, nome: parede.name });
  }

  // porta dupla na parede Sul (x local = 5,5 ⇒ x mundial = -5,5 por causa da rotação de 180°)
  const porta = criarPorta();
  porta.position.set(5.5, 0, 0);
  paredes['Sul'].add(porta);
  registro.push({ obj: porta, nome: 'Porta dupla (Sul)' });

  // =============================================================== COLUNAS
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
    const c = criarColuna();
    c.position.set(x, 0, z);
    sala.add(c);
    colisores.push({ tipo: 'circulo', x, z, r: 0.55 });
    registro.push({ obj: c, nome: `Coluna (${x}, ${z})` });
  }

  // =============================================================== MOBÍLIA
  // Relógio de pêndulo no canto Nordeste, girado para olhar o centro (-45°)
  const relogio = criarRelogio(animaveis);
  relogio.position.set(8.9, 0, -8.9);
  relogio.rotation.y = Math.atan2(-relogio.position.x, -relogio.position.z); // aponta +Z local para (0,0,0)
  sala.add(relogio);
  colisores.push({ tipo: 'circulo', x: 8.9, z: -8.9, r: 0.65 });
  registro.push({ obj: relogio, nome: 'Relógio de pêndulo' });

  // Sofá encostado na parede Oeste (frente para Leste: +90°)
  const sofa = criarSofa();
  sofa.position.set(-9.15, 0, -5.4);
  sofa.rotation.y = Math.PI / 2;
  sala.add(sofa);
  colisores.push(caixaRotacionada(sofa, 2.4, 1.0));
  registro.push({ obj: sofa, nome: 'Sofá Chesterfield' });

  // Duas poltronas + mesa de chá no lado Norte-Oeste
  const mesaCha = criarMesaRedonda(0.55, 0.7);
  mesaCha.position.set(-3.6, 0, -8.2);
  sala.add(mesaCha);
  colisores.push({ tipo: 'circulo', x: -3.6, z: -8.2, r: 0.6 });
  for (const [x, ang] of [[-4.9, 0.6], [-2.3, -0.6]]) {
    const p = criarPoltrona();
    p.position.set(x, 0, -8.6);
    p.rotation.y = ang;
    sala.add(p);
    colisores.push({ tipo: 'circulo', x, z: -8.6, r: 0.6 });
    registro.push({ obj: p, nome: 'Poltrona' });
  }

  // Estante de livros na parede Leste, lado Sul (frente para Oeste: -90°)
  const estante = criarEstante();
  estante.position.set(9.72, 0, 6.6);
  estante.rotation.y = -Math.PI / 2;
  sala.add(estante);
  colisores.push(caixaRotacionada(estante, 2.2, 0.5));
  registro.push({ obj: estante, nome: 'Estante de livros' });

  // Aparador com candelabro no canto Sudoeste
  const aparador = criarMesaRedonda(0.5, 0.95, true);
  aparador.position.set(-8.4, 0, 8.4);
  sala.add(aparador);
  colisores.push({ tipo: 'circulo', x: -8.4, z: 8.4, r: 0.55 });
  registro.push({ obj: aparador, nome: 'Aparador c/ candelabro' });

  // Móveis cobertos por lençóis (clima de mansão abandonada)
  for (const [x, z, s, r] of [[7.6, -3.2, 1.0, 0.3], [3.4, 8.7, 1.25, -0.1]]) {
    const m = criarMovelCoberto();
    m.position.set(x, 0, z); m.rotation.y = r; m.scale.setScalar(s);
    sala.add(m);
    colisores.push({ tipo: 'circulo', x, z, r: 0.75 * s });
    registro.push({ obj: m, nome: 'Móvel coberto' });
  }

  // Teias de aranha nos 4 cantos superiores
  const teiaTex = T.texturaTeia();
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const teia = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8),
      new THREE.MeshBasicMaterial({ map: teiaTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    teia.position.set(x * (MEIA_L - 0.64), ALTURA - 0.9, z * (MEIA_P - 0.64));
    teia.lookAt(0, ALTURA - 0.9, 0);
    sala.add(teia);
  }

  // =============================================================== LUSTRE
  const lustre = criarLustre(luzesVela);
  lustre.position.set(0, ALTURA, 0);
  sala.add(lustre);
  registro.push({ obj: lustre, nome: 'Lustre (luz pontual)' });

  // =============================================================== LUZES
  // 1) Ambiente: azulada/violeta escura, só para revelar silhuetas
  const ambiente = new THREE.AmbientLight(0x4a3c8c, 0.55);
  sala.add(ambiente);

  // oscilação procedural das chamas (flicker)
  animaveis.push((dt, t) => {
    for (const l of luzesVela) {
      const f = Math.sin(t * 9 + l.fase) * 0.08 + Math.sin(t * 23 + l.fase * 2) * 0.05 + (Math.random() - 0.5) * 0.08;
      l.luz.intensity = l.base * (1 + f);
    }
  });

  return {
    grupo: sala, colisores, registro,
    // luzes expostas para liga/desliga individual (Entrega 02)
    luzes: {
      ambiente,
      lustre: lustre.userData.luz,
      arandelas: luzesVela.map((l) => l.luz).filter((l) => l !== lustre.userData.luz),
    },
    limites: { minX: -MEIA_L, maxX: MEIA_L, minZ: -MEIA_P, maxZ: MEIA_P },
    atualizar(dt, t) { for (const f of animaveis) f(dt, t); },
  };
}

// ---------------------------------------------------------------------------
// AABB no plano XZ de um móvel retangular (largura ao longo de X local,
// profundidade ao longo de Z local), já considerando a rotação em Y.
function caixaRotacionada(obj, larg, prof) {
  const c = Math.abs(Math.cos(obj.rotation.y)), s = Math.abs(Math.sin(obj.rotation.y));
  const hx = (larg * c + prof * s) / 2, hz = (larg * s + prof * c) / 2;
  return { tipo: 'caixa', minX: obj.position.x - hx, maxX: obj.position.x + hx, minZ: obj.position.z - hz, maxZ: obj.position.z + hz };
}

// =================================================================== PAREDE
function criarParede(comp, tex) {
  const g = new THREE.Group();
  const ALT_LAMBRIL = 1.2;
  // papel de parede (parte superior) — repetição proporcional ao tamanho real
  const papel = malha(new THREE.PlaneGeometry(comp, ALTURA - ALT_LAMBRIL),
    T.materialTexturizado(T.comRepeticao(tex.papel, comp / 1.6, (ALTURA - ALT_LAMBRIL) / 3.2), { roughness: 0.85, relevo: 1 }),
    [0, ALT_LAMBRIL + (ALTURA - ALT_LAMBRIL) / 2, 0], [0, 0, 0], [1, 1, 1], false);
  g.add(papel);
  // lambril de madeira entalhada (parte inferior)
  g.add(malha(new THREE.PlaneGeometry(comp, ALT_LAMBRIL),
    T.materialTexturizado(T.comRepeticao(tex.lambril, Math.round(comp / 2.5), 1), { roughness: 0.6, relevo: 2 }),
    [0, ALT_LAMBRIL / 2, 0.03], [0, 0, 0], [1, 1, 1], false));
  // rodapé, guarnição do lambril e sanca (molduras em caixa)
  g.add(malha(new THREE.BoxGeometry(comp, 0.18, 0.06), madeiraEscura, [0, 0.09, 0.05], [0, 0, 0], [1, 1, 1], false));
  g.add(malha(new THREE.BoxGeometry(comp, 0.07, 0.07), madeiraMedia, [0, ALT_LAMBRIL, 0.05], [0, 0, 0], [1, 1, 1], false));
  g.add(malha(new THREE.BoxGeometry(comp, 0.22, 0.2), madeiraEscura, [0, ALTURA - 0.11, 0.1], [0, 0, 0], [1, 1, 1], false));
  g.add(malha(new THREE.BoxGeometry(comp, 0.06, 0.08), latao, [0, ALTURA - 0.25, 0.04], [0, 0, 0], [1, 1, 1], false));
  return g;
}

// =================================================================== QUADRO
function criarQuadro(titulo, texPintura, texMoldura) {
  const g = new THREE.Group();
  g.name = 'Quadro: ' + titulo;
  const W = 2.2, H = 2.75, B = 0.24, D = 0.14, CY = 3.25;
  g.position.set(0, CY, 0);
  // tela (relevo leve: pinceladas e craquelado do verniz reagem à luz)
  g.add(malha(new THREE.PlaneGeometry(W, H), T.materialTexturizado(texPintura, { roughness: 0.55, relevo: 0.5 }), [0, 0, 0.035], [0, 0, 0], [1, 1, 1], false));
  // moldura dourada: 4 barras com a mesma textura. As UVs das caixas ficam em
  // metros (uvEmMetros), então cada face — inclusive as laterais finas — mostra
  // o friso no tamanho real: 1 ladrilho = B × 4B (a imagem é 4:1). Nas barras
  // verticais a textura gira 90° para o friso acompanhar o comprimento.
  const tH = T.comRepeticao(texMoldura, 1 / (4 * B), 1 / B);
  const tV = T.comRepeticao(texMoldura, 1 / (4 * B), 1 / B); tV.center.set(0.5, 0.5); tV.rotation = Math.PI / 2;
  const matH = T.materialTexturizado(tH, { metalness: 0.75, roughness: 0.35, relevo: 2 });
  const matV = T.materialTexturizado(tV, { metalness: 0.75, roughness: 0.35, relevo: 2 });
  const barra = (w, h) => T.uvEmMetros(new THREE.BoxGeometry(w, h, D));
  g.add(malha(barra(W + 2 * B, B), matH, [0, H / 2 + B / 2, D / 2]));
  g.add(malha(barra(W + 2 * B, B), matH, [0, -H / 2 - B / 2, D / 2]));
  g.add(malha(barra(B, H), matV, [-W / 2 - B / 2, 0, D / 2]));
  g.add(malha(barra(B, H), matV, [W / 2 + B / 2, 0, D / 2]));
  // filete interno escuro (dá profundidade à moldura)
  const fil = new THREE.MeshStandardMaterial({ color: 0x2a1c08, metalness: 0.6, roughness: 0.5 });
  for (const [w, h, x, y] of [[W, 0.04, 0, H / 2], [W, 0.04, 0, -H / 2], [0.04, H, -W / 2, 0], [0.04, H, W / 2, 0]])
    g.add(malha(new THREE.BoxGeometry(w, h, 0.06), fil, [x, y, 0.06], [0, 0, 0], [1, 1, 1], false));
  // ornamentos dos cantos (esferas douradas)
  for (const sx of [-1, 1]) for (const sy of [-1, 1])
    g.add(malha(new THREE.SphereGeometry(0.13, 16, 12), latao, [sx * (W / 2 + B / 2), sy * (H / 2 + B / 2), D + 0.02], [0, 0, 0], [1, 1, 0.5]));
  // placa com o título
  g.add(malha(new THREE.BoxGeometry(1.05, 0.2, 0.03), new THREE.MeshStandardMaterial({ map: T.texturaPlaca(titulo), metalness: 0.5, roughness: 0.4 }),
    [0, -H / 2 - B - 0.25, 0.03], [0, 0, 0], [1, 1, 1], false));
  return g;
}

// =================================================================== ARANDELA
function criarArandela() {
  const g = new THREE.Group(); g.name = 'Arandela';
  g.add(malha(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 18), latao, [0, 0, 0.015], [Math.PI / 2, 0, 0]));
  g.add(malha(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 8), latao, [0, 0.06, 0.13], [-0.9, 0, 0]));
  g.add(malha(new THREE.CylinderGeometry(0.06, 0.035, 0.05, 14), latao, [0, 0.16, 0.24]));
  g.add(malha(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 10), vela, [0, 0.26, 0.24]));
  const chama = malha(new THREE.SphereGeometry(0.025, 10, 8), chamaMat, [0, 0.365, 0.24], [0, 0, 0], [0.6, 1.4, 0.6], false);
  g.add(chama);
  g.add(malha(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 14, 1, true), cristal, [0, 0.34, 0.24], [0, 0, 0], [1, 1, 1], false));
  const luz = new THREE.PointLight(0xff9a3c, 3.2, 9, 2);
  luz.position.set(0, 0.38, 0.3);
  g.add(luz);
  return { grupo: g, luz };
}

// =================================================================== PORTA
function criarPorta() {
  const g = new THREE.Group(); g.name = 'Porta dupla';
  const L = 0.8, H = 2.6;
  for (const s of [-1, 1]) {
    const folha = new THREE.Group();
    folha.position.set(s * L / 2, H / 2, 0.06);
    folha.add(malha(new THREE.BoxGeometry(L - 0.02, H, 0.07), madeiraMedia));
    for (const [y, h] of [[0.55, 1.0], [-0.6, 0.9]]) // almofadas da porta
      folha.add(malha(new THREE.BoxGeometry(L - 0.24, h, 0.03), madeiraEscura, [0, y, 0.045]));
    folha.add(malha(new THREE.SphereGeometry(0.045, 12, 10), latao, [-s * (L / 2 - 0.1), -0.1, 0.09]));
    g.add(folha);
  }
  // batentes e frontão
  g.add(malha(new THREE.BoxGeometry(0.16, H + 0.1, 0.16), madeiraEscura, [-L - 0.08, (H + 0.1) / 2, 0.08]));
  g.add(malha(new THREE.BoxGeometry(0.16, H + 0.1, 0.16), madeiraEscura, [L + 0.08, (H + 0.1) / 2, 0.08]));
  g.add(malha(new THREE.BoxGeometry(2 * L + 0.6, 0.22, 0.22), madeiraEscura, [0, H + 0.16, 0.1]));
  g.add(malha(new THREE.CylinderGeometry(0.95, 0.95, 0.18, 32, 1, false, Math.PI / 2, Math.PI), madeiraMedia,
    [0, H + 0.27, 0.08], [Math.PI / 2, 0, 0], [1, 1, 0.45])); // arco semicircular sobre a porta
  return g;
}

// =================================================================== COLUNA
function criarColuna() {
  const g = new THREE.Group(); g.name = 'Coluna';
  g.add(malha(new THREE.BoxGeometry(1.0, 0.3, 1.0), marmore, [0, 0.15, 0]));
  g.add(malha(new THREE.TorusGeometry(0.38, 0.06, 10, 28), marmore, [0, 0.36, 0], [Math.PI / 2, 0, 0]));
  g.add(malha(new THREE.CylinderGeometry(0.32, 0.36, 4.9, 24), marmore, [0, 2.85, 0]));
  for (let i = 0; i < 12; i++) { // caneluras (ranhuras verticais)
    const a = (i / 12) * Math.PI * 2;
    g.add(malha(new THREE.BoxGeometry(0.03, 4.6, 0.03), new THREE.MeshStandardMaterial({ color: 0x2c2630, roughness: 0.6 }),
      [Math.cos(a) * 0.335, 2.85, Math.sin(a) * 0.335], [0, -a, 0], [1, 1, 1], false));
  }
  g.add(malha(new THREE.TorusGeometry(0.34, 0.05, 10, 28), latao, [0, 5.32, 0], [Math.PI / 2, 0, 0]));
  g.add(malha(new THREE.CylinderGeometry(0.55, 0.36, 0.35, 24), marmore, [0, 5.55, 0]));
  g.add(malha(new THREE.BoxGeometry(1.0, 0.28, 1.0), marmore, [0, 5.86, 0]));
  return g;
}

// =================================================================== RELÓGIO
function criarRelogio(animaveis) {
  const g = new THREE.Group(); g.name = 'Relógio de pêndulo';
  g.add(malha(new THREE.BoxGeometry(0.7, 0.25, 0.5), madeiraEscura, [0, 0.125, 0]));      // base
  g.add(malha(new THREE.BoxGeometry(0.55, 1.5, 0.4), madeiraMedia, [0, 1.0, 0]));          // caixa do pêndulo
  g.add(malha(new THREE.BoxGeometry(0.4, 1.1, 0.02), cristal, [0, 1.0, 0.205], [0, 0, 0], [1, 1, 1], false)); // vidro
  g.add(malha(new THREE.BoxGeometry(0.7, 0.75, 0.48), madeiraEscura, [0, 2.12, 0]));       // capelo
  g.add(malha(new THREE.CylinderGeometry(0.42, 0.42, 0.46, 24, 1, false, Math.PI / 2, Math.PI), madeiraEscura,
    [0, 2.5, 0], [Math.PI / 2, 0, 0], [1, 1, 0.55])); // topo arredondado
  for (const x of [-0.25, 0, 0.25]) g.add(malha(new THREE.SphereGeometry(0.05, 10, 8), latao, [x, x === 0 ? 2.78 : 2.6, 0]));
  const mostrador = new THREE.Mesh(new THREE.CircleGeometry(0.26, 32), new THREE.MeshStandardMaterial({ map: T.texturaMostrador() }));
  mostrador.position.set(0, 2.12, 0.245); g.add(mostrador);
  const ponteiroH = malha(new THREE.BoxGeometry(0.02, 0.15, 0.01), new THREE.MeshBasicMaterial({ color: 0x111111 }), [0, 0.06, 0], [0, 0, 0], [1, 1, 1], false);
  const ponteiroM = malha(new THREE.BoxGeometry(0.012, 0.22, 0.01), new THREE.MeshBasicMaterial({ color: 0x111111 }), [0, 0.09, 0], [0, 0, 0], [1, 1, 1], false);
  const pH = new THREE.Group(), pM = new THREE.Group();
  pH.add(ponteiroH); pM.add(ponteiroM);
  pH.position.set(0, 2.12, 0.255); pM.position.set(0, 2.12, 0.26);
  pH.rotation.z = -Math.PI * 0.75; // ≈ meia-noite e meia ;)
  g.add(pH, pM);
  // pêndulo (pivô no topo da caixa)
  const pendulo = new THREE.Group(); pendulo.position.set(0, 1.62, 0.05);
  pendulo.add(malha(new THREE.BoxGeometry(0.02, 0.8, 0.01), latao, [0, -0.4, 0]));
  pendulo.add(malha(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24), latao, [0, -0.85, 0], [Math.PI / 2, 0, 0]));
  g.add(pendulo);
  animaveis.push((dt, t) => {
    pendulo.rotation.z = Math.sin(t * Math.PI) * 0.22; // período de 2 s
    pM.rotation.z = -t * 0.3;
  });
  return g;
}

// =================================================================== SOFÁ
function criarSofa() {
  const g = new THREE.Group(); g.name = 'Sofá';
  g.add(malha(new THREE.BoxGeometry(2.2, 0.35, 0.9), veludo, [0, 0.38, 0]));            // assento
  g.add(malha(new THREE.BoxGeometry(2.2, 0.75, 0.22), veludo, [0, 0.82, -0.36]));       // encosto
  for (const s of [-1, 1]) {                                                             // braços enrolados
    g.add(malha(new THREE.BoxGeometry(0.22, 0.45, 0.9), veludo, [s * 1.1, 0.6, 0]));
    g.add(malha(new THREE.CylinderGeometry(0.15, 0.15, 0.95, 16), veludo, [s * 1.12, 0.84, 0], [Math.PI / 2, 0, 0]));
  }
  for (let i = 0; i < 3; i++) // almofadas
    g.add(malha(new THREE.BoxGeometry(0.66, 0.12, 0.72), veludo, [-0.7 + i * 0.7, 0.61, 0.06], [0, 0, 0], [1, 1, 1]));
  for (let i = 0; i < 9; i++) // botões capitonê
    g.add(malha(new THREE.SphereGeometry(0.02, 8, 6), latao, [-0.9 + i * 0.225, 0.9 + (i % 2) * 0.15, -0.245], [0, 0, 0], [1, 1, 1], false));
  for (const x of [-1.05, 1.05]) for (const z of [-0.35, 0.35])
    g.add(malha(new THREE.CylinderGeometry(0.04, 0.03, 0.2, 8), madeiraEscura, [x, 0.1, z]));
  return g;
}

// =================================================================== POLTRONA
function criarPoltrona() {
  const g = new THREE.Group(); g.name = 'Poltrona';
  g.add(malha(new THREE.BoxGeometry(0.85, 0.3, 0.8), veludo, [0, 0.4, 0]));
  g.add(malha(new THREE.BoxGeometry(0.85, 0.95, 0.18), veludo, [0, 0.9, -0.33]));
  g.add(malha(new THREE.SphereGeometry(0.43, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), veludo, [0, 1.36, -0.33], [0, 0, 0], [1, 0.5, 0.22])); // topo em arco
  for (const s of [-1, 1]) g.add(malha(new THREE.BoxGeometry(0.14, 0.32, 0.75), veludo, [s * 0.43, 0.68, 0]));
  for (const x of [-0.35, 0.35]) for (const z of [-0.32, 0.32])
    g.add(malha(new THREE.CylinderGeometry(0.035, 0.025, 0.26, 8), madeiraEscura, [x, 0.13, z]));
  return g;
}

// =================================================================== MESA
function criarMesaRedonda(raio, altura, comCandelabro = false) {
  const g = new THREE.Group(); g.name = 'Mesa';
  g.add(malha(new THREE.CylinderGeometry(raio, raio, 0.05, 28), madeiraMedia, [0, altura, 0]));
  g.add(malha(new THREE.CylinderGeometry(0.05, 0.08, altura - 0.08, 12), madeiraEscura, [0, altura / 2, 0]));
  for (let i = 0; i < 3; i++) { // pés em tripé
    const a = (i / 3) * Math.PI * 2;
    g.add(malha(new THREE.BoxGeometry(0.06, 0.06, raio * 0.8), madeiraEscura, [Math.sin(a) * raio * 0.38, 0.06, Math.cos(a) * raio * 0.38], [0, a, 0]));
  }
  if (comCandelabro) {
    const c = new THREE.Group(); c.position.y = altura + 0.025;
    c.add(malha(new THREE.CylinderGeometry(0.1, 0.13, 0.04, 16), latao));
    c.add(malha(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8), latao, [0, 0.2, 0]));
    c.add(malha(new THREE.TorusGeometry(0.16, 0.012, 8, 20, Math.PI), latao, [0, 0.36, 0], [0, 0, Math.PI]));
    for (const x of [-0.16, 0, 0.16]) {
      const y = x === 0 ? 0.4 : 0.36;
      c.add(malha(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 10), vela, [x, y + 0.07, 0]));
      c.add(malha(new THREE.SphereGeometry(0.02, 8, 6), chamaMat, [x, y + 0.165, 0], [0, 0, 0], [0.6, 1.4, 0.6], false));
    }
    g.add(c);
  }
  return g;
}

// =================================================================== ESTANTE
function criarEstante() {
  const g = new THREE.Group(); g.name = 'Estante';
  const W = 2.2, H = 2.8, D = 0.45;
  g.add(malha(new THREE.BoxGeometry(W, H, 0.04), madeiraEscura, [0, H / 2, -D / 2 + 0.02]));    // fundo
  for (const s of [-1, 1]) g.add(malha(new THREE.BoxGeometry(0.06, H, D), madeiraMedia, [s * (W / 2 - 0.03), H / 2, 0]));
  g.add(malha(new THREE.BoxGeometry(W + 0.1, 0.1, D + 0.06), madeiraMedia, [0, H + 0.05, 0]));
  const cores = [0x5b1a1a, 0x1e3a24, 0x2a2350, 0x6b4a1a, 0x3b1f2e, 0x40382a, 0x1a2e3a];
  let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let p = 0; p < 5; p++) {
    const y = 0.1 + p * 0.55;
    g.add(malha(new THREE.BoxGeometry(W - 0.12, 0.04, D - 0.04), madeiraMedia, [0, y, 0]));
    let x = -W / 2 + 0.12;
    while (x < W / 2 - 0.25) { // livros com alturas, espessuras e inclinações variadas
      const esp = 0.04 + r() * 0.05, alt = 0.28 + r() * 0.16;
      const inclinado = r() < 0.08;
      g.add(malha(new THREE.BoxGeometry(esp, alt, 0.26 + r() * 0.06),
        new THREE.MeshStandardMaterial({ color: cores[Math.floor(r() * cores.length)], roughness: 0.8 }),
        [x + esp / 2, y + 0.02 + alt / 2, 0.02], [0, 0, inclinado ? 0.3 : 0]));
      x += esp + 0.004 + (inclinado ? 0.08 : 0);
      if (r() < 0.06) x += 0.15; // espaço vazio na prateleira
    }
  }
  return g;
}

// =================================================================== MÓVEL COBERTO
function criarMovelCoberto() {
  const g = new THREE.Group(); g.name = 'Móvel coberto';
  const geo = new THREE.SphereGeometry(0.75, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.62);
  // deforma o lençol para parecer tecido caído sobre uma poltrona
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ang = Math.atan2(v.z, v.x);
    v.x *= 1.0 + 0.06 * Math.sin(ang * 7);
    v.z *= 0.85 + 0.06 * Math.sin(ang * 5);
    v.y = v.y * 1.35 + (v.z < 0 ? 0.25 * (-v.z) : 0); // encosto mais alto atrás
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const lencol = malha(geo, new THREE.MeshStandardMaterial({ color: 0xb8b3a8, roughness: 1, side: THREE.DoubleSide }), [0, -0.2, 0]);
  g.add(lencol);
  return g;
}

// =================================================================== LUSTRE
function criarLustre(luzesVela) {
  const g = new THREE.Group(); g.name = 'Lustre';
  // corrente (elos alternados)
  for (let i = 0; i < 8; i++)
    g.add(malha(new THREE.TorusGeometry(0.05, 0.012, 6, 12), latao, [0, -0.06 - i * 0.085, 0], [0, i % 2 ? Math.PI / 2 : 0, 0], [1, 1.4, 1], false));
  g.add(malha(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 12), latao, [0, -1.0, 0], [0, 0, 0], [1, 1, 1], false));
  g.add(malha(new THREE.SphereGeometry(0.22, 20, 14), latao, [0, -1.35, 0], [0, 0, 0], [1, 0.7, 1], false));
  const R = 1.1, Y = -1.45;
  g.add(malha(new THREE.TorusGeometry(R, 0.04, 10, 48), latao, [0, Y, 0], [Math.PI / 2, 0, 0], [1, 1, 1], false));
  g.add(malha(new THREE.TorusGeometry(R * 0.55, 0.03, 8, 36), latao, [0, Y - 0.15, 0], [Math.PI / 2, 0, 0], [1, 1, 1], false));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
    const braco = malha(new THREE.CylinderGeometry(0.02, 0.02, R, 8), latao, [x / 2, Y + 0.03, z / 2], [0, 0, Math.PI / 2], [1, 1, 1], false);
    braco.rotation.set(0, -a, Math.PI / 2);
    g.add(braco);
    g.add(malha(new THREE.CylinderGeometry(0.06, 0.04, 0.05, 12), latao, [x, Y + 0.05, z], [0, 0, 0], [1, 1, 1], false));
    g.add(malha(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 10), vela, [x, Y + 0.17, z], [0, 0, 0], [1, 1, 1], false));
    g.add(malha(new THREE.SphereGeometry(0.025, 8, 6), chamaMat, [x, Y + 0.3, z], [0, 0, 0], [0.6, 1.5, 0.6], false));
  }
  for (let i = 0; i < 16; i++) { // cristais pendentes
    const a = (i / 16) * Math.PI * 2;
    g.add(malha(new THREE.OctahedronGeometry(0.05), cristal, [Math.cos(a) * R, Y - 0.12, Math.sin(a) * R], [0, 0, 0], [0.7, 1.6, 0.7], false));
  }
  // luz pontual principal do salão (com sombras)
  const luz = new THREE.PointLight(0xffa04a, 38, 22, 1.6);
  luz.position.set(0, Y + 0.05, 0);
  luz.castShadow = true;
  luz.shadow.mapSize.set(1024, 1024);
  luz.shadow.camera.near = 0.3; luz.shadow.camera.far = 22;
  luz.shadow.bias = -0.002;
  g.add(luz);
  luzesVela.push({ luz, base: luz.intensity, fase: 0 });
  g.userData.luz = luz;   // referência para o controle de luzes (main.js)
  return g;
}
