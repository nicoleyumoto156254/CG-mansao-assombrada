// ============================================================================
// Zelador.js — Personagem principal (modelo hierárquico com THREE.Group)
// Origem do modelo: entre os pés, no chão (y = 0). Frente: eixo +Z local.
// Unidade: 1 unidade = 1 metro. Altura total ≈ 1,86 m (com o boné).
// ============================================================================
import * as THREE from 'three';
import {
  texturaManometro, texturaCorrugada, texturaGradienteCone, texturaEmblema,
  texturaJeans, texturaFlanela, texturaCouro, porMetro, materialTexturizado, uvEmMetros,
} from './texturas.js';

// ---------------------------------------------------------------- materiais
// Tecidos e couro: as malhas que os usam têm UV em metros (uvEmMetros), então
// o ladrilho tem o mesmo tamanho real na perna, no braço e no peitilho.
const TEX = {
  jeans:   porMetro(texturaJeans(), 0.12),    // 1 ladrilho = 12 cm
  flanela: porMetro(texturaFlanela(), 0.2),   // 1 xadrez = 20 cm
  couro:   porMetro(texturaCouro(), 0.1),
};
const M = {
  pele:     new THREE.MeshStandardMaterial({ color: 0xf0c49c, roughness: 0.65 }),
  camisa:   materialTexturizado(TEX.flanela, { roughness: 0.85, relevo: 0.6 }),
  bone:     new THREE.MeshStandardMaterial({ color: 0x2f8a3e, roughness: 0.8 }),
  jeans:    materialTexturizado(TEX.jeans, { roughness: 0.9, relevo: 1 }),
  jeansEsc: materialTexturizado(TEX.jeans, { color: 0xa0a8b8, roughness: 0.9, relevo: 1 }), // mesma trama, mais escura
  couro:    materialTexturizado(TEX.couro, { roughness: 0.55, relevo: 1.5 }),
  sola:     new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }),
  latao:    new THREE.MeshStandardMaterial({ color: 0xd4a843, metalness: 0.9, roughness: 0.3 }),
  metal:    new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.85, roughness: 0.32 }),
  metalEsc: new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.7, roughness: 0.45 }),
  vermelho: new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5 }),
  luva:     new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7 }),
  branco:   new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  iris:     new THREE.MeshStandardMaterial({ color: 0x2a6fd6, roughness: 0.3 }),
  preto:    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 }),
  brilho:   new THREE.MeshBasicMaterial({ color: 0xffffff }),
  cabelo:   new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.9 }),
  amarelo:  new THREE.MeshStandardMaterial({ color: 0xe8c020, roughness: 0.5 }),
  vidro:    new THREE.MeshPhysicalMaterial({ color: 0xbff3ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false }),
};

// Atalho: cria uma malha já posicionada e projetando sombra
function malha(geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  if (mat.map) uvEmMetros(geo);   // texturas repetidas por metro de superfície
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p); m.rotation.set(...r); m.scale.set(...s);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function grupo(nome, p = [0, 0, 0]) {
  const g = new THREE.Group(); g.name = nome; g.position.set(...p); return g;
}

export class Zelador extends THREE.Group {
  constructor() {
    super();
    this.name = 'Zelador';
    this.fase = 0;           // fase do ciclo de caminhada
    this.velocidade = 0;     // 0..1 (parado → andando)
    this.succao = false;     // gatilho do aspirador

    this.corpo = grupo('corpo');
    this.add(this.corpo);

    this.#pernas();
    this.#torso();
    this.#bracos();
    this.#cabeca();
    this.#aspirador();
    this.#bocalELanterna();
    this.#mangueira();
  }

  // ------------------------------------------------------------ pernas/botas
  #pernas() {
    const criaPerna = (nome, lado) => {
      const quadril = grupo(nome, [lado * 0.105, 0.84, 0]);
      quadril.add(malha(new THREE.SphereGeometry(0.085, 16, 12), M.jeans));
      quadril.add(malha(new THREE.CylinderGeometry(0.085, 0.075, 0.38, 16), M.jeans, [0, -0.19, 0]));

      const joelho = grupo(nome + '_joelho', [0, -0.38, 0]);
      joelho.add(malha(new THREE.SphereGeometry(0.075, 14, 10), M.jeans));
      joelho.add(malha(new THREE.CylinderGeometry(0.075, 0.07, 0.34, 16), M.jeans, [0, -0.17, 0]));
      // barra da calça dobrada
      joelho.add(malha(new THREE.CylinderGeometry(0.086, 0.086, 0.06, 16), M.jeansEsc, [0, -0.32, 0]));
      quadril.add(joelho);

      // bota de couro
      const bota = grupo(nome + '_bota', [0, -0.38, 0]);
      bota.add(malha(new THREE.CylinderGeometry(0.075, 0.08, 0.1, 16), M.couro, [0, 0.0, 0]));
      bota.add(malha(new THREE.BoxGeometry(0.14, 0.08, 0.2), M.couro, [0, -0.04, 0.05]));
      bota.add(malha(new THREE.SphereGeometry(0.07, 16, 10), M.couro, [0, -0.045, 0.15], [0, 0, 0], [1, 0.62, 1.1])); // biqueira arredondada
      bota.add(malha(new THREE.BoxGeometry(0.155, 0.03, 0.3), M.sola, [0, -0.085, 0.06]));
      for (let i = 0; i < 5; i++) // cravos da sola tratorada
        bota.add(malha(new THREE.BoxGeometry(0.15, 0.012, 0.025), M.sola, [0, -0.105, -0.07 + i * 0.065]));
      for (let i = 0; i < 3; i++) for (const lx of [-0.025, 0.025]) // ilhós metálicos
        bota.add(malha(new THREE.TorusGeometry(0.008, 0.003, 6, 10), M.latao, [lx, 0.02 - i * 0.03, 0.078]));
      joelho.add(bota);

      this.corpo.add(quadril);
      return { quadril, joelho };
    };
    this.pernaEsq = criaPerna('leftLegGroup', 1);   // frente = +Z ⇒ esquerda do personagem = +X
    this.pernaDir = criaPerna('rightLegGroup', -1);
  }

  // ---------------------------------------------------------- torso/macacão
  #torso() {
    const t = this.torso = grupo('torsoGroup', [0, 0.84, 0]);
    const achatado = [1, 1, 0.78];
    this.peito = malha(new THREE.CylinderGeometry(0.2, 0.19, 0.42, 20), M.camisa, [0, 0.38, 0], [0, 0, 0], achatado);
    t.add(this.peito);
    t.add(malha(new THREE.SphereGeometry(0.2, 20, 12), M.camisa, [0, 0.58, 0], [0, 0, 0], [1, 0.5, 0.78])); // ombros
    t.add(malha(new THREE.CylinderGeometry(0.205, 0.19, 0.32, 20), M.jeans, [0, 0.12, 0], [0, 0, 0], achatado)); // macacão (parte baixa)
    // cinto + fivela dourada
    t.add(malha(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 20), M.couro, [0, 0.2, 0], [0, 0, 0], [1, 1, 0.8]));
    t.add(malha(new THREE.BoxGeometry(0.075, 0.055, 0.02), M.latao, [0, 0.2, 0.17]));
    t.add(malha(new THREE.BoxGeometry(0.045, 0.028, 0.022), M.couro, [0, 0.2, 0.172]));
    // peitilho frontal e traseiro
    t.add(malha(new THREE.BoxGeometry(0.25, 0.22, 0.03), M.jeans, [0, 0.42, 0.155]));
    t.add(malha(new THREE.BoxGeometry(0.25, 0.22, 0.03), M.jeans, [0, 0.42, -0.155]));
    // alças sobre os ombros
    for (const x of [-0.095, 0.095]) {
      t.add(malha(new THREE.BoxGeometry(0.05, 0.14, 0.02), M.jeans, [x, 0.6, 0.15], [-0.25, 0, 0]));
      t.add(malha(new THREE.BoxGeometry(0.05, 0.02, 0.3), M.jeans, [x, 0.675, 0]));
      t.add(malha(new THREE.BoxGeometry(0.05, 0.14, 0.02), M.jeans, [x, 0.6, -0.15], [0.25, 0, 0]));
      t.add(malha(new THREE.SphereGeometry(0.02, 10, 8), M.latao, [x, 0.53, 0.175])); // botões de latão
    }
    // bolso frontal com flanela e chave de fenda
    t.add(malha(new THREE.BoxGeometry(0.13, 0.1, 0.012), M.jeansEsc, [0, 0.4, 0.175]));
    t.add(malha(new THREE.BoxGeometry(0.05, 0.07, 0.01), M.vermelho, [-0.035, 0.46, 0.178], [0, 0, 0.25]));
    t.add(malha(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), M.amarelo, [0.04, 0.47, 0.18]));
    t.add(malha(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), M.metal, [0.04, 0.52, 0.18]));
    // molho de chaves pendurado no quadril (pivô animado)
    const chaves = this.chaves = grupo('molhoDeChaves', [0.2, 0.17, 0.04]);
    chaves.add(malha(new THREE.TorusGeometry(0.03, 0.004, 6, 16), M.latao, [0, -0.03, 0], [0, Math.PI / 2, 0]));
    for (let i = 0; i < 3; i++) {
      const k = grupo('chave' + i, [0, -0.055, 0]);
      k.rotation.x = (i - 1) * 0.45;
      k.add(malha(new THREE.TorusGeometry(0.012, 0.004, 6, 10), M.latao, [0, -0.012, 0], [0, Math.PI / 2, 0]));
      k.add(malha(new THREE.BoxGeometry(0.006, 0.05, 0.012), M.metal, [0, -0.05, 0]));
      chaves.add(k);
    }
    t.add(chaves);
    this.corpo.add(t);
  }

  // ------------------------------------------------------------------ braços
  #bracos() {
    const criaBraco = (nome, lado) => {
      const ombro = grupo(nome, [lado * 0.245, 0.58, 0]);
      ombro.add(malha(new THREE.SphereGeometry(0.075, 14, 10), M.camisa));
      ombro.add(malha(new THREE.CylinderGeometry(0.068, 0.06, 0.26, 14), M.camisa, [0, -0.13, 0]));
      const cotovelo = grupo(nome + '_cotovelo', [0, -0.27, 0]);
      cotovelo.add(malha(new THREE.SphereGeometry(0.058, 12, 10), M.camisa));
      cotovelo.add(malha(new THREE.CylinderGeometry(0.055, 0.047, 0.22, 14), M.camisa, [0, -0.11, 0]));
      const mao = grupo(nome + '_mao', [0, -0.25, 0]);
      mao.add(malha(new THREE.CylinderGeometry(0.06, 0.055, 0.04, 14), M.luva, [0, 0.02, 0])); // punho da luva
      mao.add(malha(new THREE.SphereGeometry(0.058, 14, 10), M.luva, [0, -0.03, 0], [0, 0, 0], [1, 1.1, 0.8]));
      mao.add(malha(new THREE.SphereGeometry(0.022, 10, 8), M.luva, [-lado * 0.045, -0.01, 0.03])); // polegar
      cotovelo.add(mao);
      ombro.add(cotovelo);
      // pose: segurando o bocal à frente do corpo
      ombro.rotation.set(-0.55, 0, -lado * 0.32);
      cotovelo.rotation.set(-1.0, 0, lado * 0.15);
      this.torso.add(ombro);
      return { ombro, cotovelo };
    };
    this.bracoEsq = criaBraco('leftArmGroup', 1);
    this.bracoDir = criaBraco('rightArmGroup', -1);
  }

  // ------------------------------------------------------------------ cabeça
  #cabeca() {
    const h = this.cabeca = grupo('headGroup', [0, 0.66, 0]);
    h.add(malha(new THREE.CylinderGeometry(0.055, 0.062, 0.1, 14), M.pele, [0, 0.02, 0]));
    h.add(malha(new THREE.SphereGeometry(0.14, 28, 20), M.pele, [0, 0.16, 0], [0, 0, 0], [1, 1.05, 0.95]));
    for (const s of [-1, 1]) h.add(malha(new THREE.SphereGeometry(0.035, 12, 10), M.pele, [s * 0.138, 0.15, -0.005], [0, 0, 0], [0.5, 1, 0.8])); // orelhas
    h.add(malha(new THREE.SphereGeometry(0.045, 16, 12), M.pele, [0, 0.135, 0.14], [0, 0, 0], [1, 0.9, 1.15])); // nariz
    // olhos completos (esclera, íris, pupila, brilho especular)
    this.sobrancelhas = [];
    for (const s of [-1, 1]) {
      const olho = grupo('olho', [s * 0.05, 0.195, 0.115]);
      olho.add(malha(new THREE.SphereGeometry(0.032, 16, 12), M.branco, [0, 0, 0], [0, 0, 0], [0.85, 1.15, 0.6]));
      olho.add(malha(new THREE.SphereGeometry(0.016, 12, 10), M.iris, [0, 0, 0.012], [0, 0, 0], [1, 1.1, 0.6]));
      olho.add(malha(new THREE.SphereGeometry(0.008, 10, 8), M.preto, [0, 0, 0.019]));
      olho.add(malha(new THREE.SphereGeometry(0.004, 8, 6), M.brilho, [0.005, 0.007, 0.022]));
      h.add(olho);
      const sob = malha(new THREE.BoxGeometry(0.062, 0.014, 0.016), M.cabelo, [s * 0.052, 0.25, 0.125], [0, 0, s * 0.12]);
      sob.userData.lado = s;
      this.sobrancelhas.push(sob); h.add(sob);
    }
    // bigode volumoso em camadas
    for (const s of [-1, 1]) {
      h.add(malha(new THREE.SphereGeometry(0.04, 14, 10), M.cabelo, [s * 0.035, 0.095, 0.145], [0, 0, s * -0.2], [1.4, 0.6, 0.7]));
      h.add(malha(new THREE.SphereGeometry(0.035, 14, 10), M.cabelo, [s * 0.08, 0.085, 0.125], [0, s * 0.4, s * 0.35], [1.3, 0.55, 0.7]));
      h.add(malha(new THREE.SphereGeometry(0.025, 12, 8), M.cabelo, [s * 0.11, 0.098, 0.1], [0, 0, s * 0.6], [1.2, 0.5, 0.6]));
      h.add(malha(new THREE.BoxGeometry(0.02, 0.07, 0.04), M.cabelo, [s * 0.128, 0.17, 0.04])); // costeletas
    }
    this.#bone(h);
    this.torso.add(h);
  }

  #bone(cabeca) {
    const b = grupo('hatGroup', [0, 0.235, 0]);
    b.add(malha(new THREE.SphereGeometry(0.152, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.bone, [0, 0, 0], [0, 0, 0], [1, 0.72, 1]));
    b.add(malha(new THREE.CylinderGeometry(0.153, 0.153, 0.028, 28, 1, true), M.couro, [0, 0.012, 0]));
    b.add(malha(new THREE.SphereGeometry(0.018, 10, 8), M.bone, [0, 0.11, 0]));
    // aba frontal curva: meio-disco levemente inclinado
    b.add(malha(new THREE.CylinderGeometry(0.155, 0.155, 0.012, 24, 1, false, -Math.PI / 2, Math.PI), M.bone,
      [0, -0.002, 0.03], [0.14, 0, 0], [1, 1, 1.3]));
    const emb = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24),
      new THREE.MeshStandardMaterial({ map: texturaEmblema(), roughness: 0.6 }));
    emb.position.set(0, 0.052, 0.137); emb.rotation.x = -0.45;
    b.add(emb);
    cabeca.add(b);
  }

  // ------------------------------------------- aspirador "Poltergust" (costas)
  #aspirador() {
    const a = this.mochila = grupo('vacuumBackpackGroup', [0, 0.36, -0.33]);
    a.add(malha(new THREE.BoxGeometry(0.22, 0.32, 0.06), M.metalEsc, [0, 0, 0.14])); // suporte nas costas
    a.add(malha(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 24), M.metal, [0, -0.15, 0]));  // tanque inferior
    a.add(malha(new THREE.CylinderGeometry(0.14, 0.14, 0.13, 24), M.metal, [0, 0.185, 0])); // tanque superior
    a.add(malha(new THREE.SphereGeometry(0.14, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.metal, [0, 0.25, 0], [0, 0, 0], [1, 0.4, 1]));
    a.add(malha(new THREE.SphereGeometry(0.14, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.metal, [0, -0.25, 0], [0, 0, 0], [1, 0.4, 1]));
    for (const y of [-0.05, 0.12, -0.2]) a.add(malha(new THREE.TorusGeometry(0.143, 0.012, 8, 28), M.latao, [0, y, 0], [Math.PI / 2, 0, 0]));
    // câmara de vidro translúcida + núcleo de ectoplasma pulsante
    const vidro = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.17, 24, 1, true), M.vidro);
    vidro.position.y = 0.035; vidro.renderOrder = 2; a.add(vidro);
    this.nucleo = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.15, 16),
      new THREE.MeshStandardMaterial({ color: 0x9dffc0, emissive: 0x33ff88, emissiveIntensity: 1.6, roughness: 0.4 }));
    this.nucleo.position.y = 0.035; a.add(this.nucleo);
    // manômetro lateral com ponteiro animado
    const man = grupo('manometro', [0.15, 0.18, 0]);
    man.add(malha(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 20), M.latao, [0, 0, 0], [0, 0, Math.PI / 2]));
    const mostrador = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), new THREE.MeshStandardMaterial({ map: texturaManometro() }));
    mostrador.position.x = 0.0135; mostrador.rotation.y = Math.PI / 2; man.add(mostrador);
    this.ponteiro = grupo('ponteiro', [0.016, 0, 0]);
    this.ponteiro.add(malha(new THREE.BoxGeometry(0.003, 0.032, 0.004), M.vermelho, [0, 0.014, 0]));
    man.add(this.ponteiro);
    a.add(man);
    // escapamentos duplos vibratórios
    this.escapes = [];
    for (const x of [-0.07, 0.07]) {
      const e = grupo('escape', [x, 0.28, -0.03]);
      e.rotation.x = -0.35;
      e.add(malha(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 12), M.metalEsc, [0, 0.08, 0]));
      e.add(malha(new THREE.TorusGeometry(0.026, 0.008, 6, 14), M.metalEsc, [0, 0.16, 0], [Math.PI / 2, 0, 0]));
      this.escapes.push(e); a.add(e);
    }
    this.torso.add(a);
  }

  // ------------------------------------------- bocal de sucção + lanterna
  #bocalELanterna() {
    const n = this.bocal = grupo('nozzleGroup', [0, 1.14, 0.36]);
    n.add(malha(new THREE.CylinderGeometry(0.045, 0.055, 0.3, 16), M.metalEsc, [0, 0, 0.0], [Math.PI / 2, 0, 0]));
    for (const z of [-0.08, 0.06]) n.add(malha(new THREE.TorusGeometry(0.052, 0.01, 8, 18), M.latao, [0, 0, z]));
    const boca = malha(new THREE.CylinderGeometry(0.11, 0.055, 0.12, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }),
      [0, 0, 0.2], [Math.PI / 2, 0, 0]);
    n.add(boca);
    n.add(malha(new THREE.TorusGeometry(0.11, 0.013, 8, 28), M.vermelho, [0, 0, 0.26]));
    n.add(malha(new THREE.BoxGeometry(0.04, 0.09, 0.05), M.preto, [0, -0.07, -0.06])); // empunhadura
    // turbina giratória interna
    const turb = this.turbina = grupo('turbina', [0, 0, 0.17]);
    turb.add(malha(new THREE.SphereGeometry(0.02, 10, 8), M.latao));
    for (let i = 0; i < 6; i++) {
      const p = malha(new THREE.BoxGeometry(0.014, 0.07, 0.006), M.metal, [0, 0.035, 0], [0, 0.5, 0]);
      const piv = new THREE.Group(); piv.rotation.z = i * Math.PI / 3; piv.add(p); turb.add(piv);
    }
    n.add(turb);
    // lanterna acoplada (com SpotLight)
    const l = this.lanterna = grupo('lanterna', [0, 0.075, 0.02]);
    l.add(malha(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 14), M.preto, [0, 0, 0], [Math.PI / 2, 0, 0]));
    l.add(malha(new THREE.CylinderGeometry(0.042, 0.03, 0.05, 16), M.metalEsc, [0, 0, 0.1], [Math.PI / 2, 0, 0]));
    this.lente = new THREE.Mesh(new THREE.CircleGeometry(0.036, 20), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    this.lente.position.z = 0.126; l.add(this.lente);
    n.add(l);

    // Luz focal: ângulo de 28° = mesmo cone usado no teste do produto escalar
    // (cos θ ≥ cos 28°) e alcance de 7,5 m = alcance máximo de sucção.
    const ALCANCE = 7.5, ANGULO = THREE.MathUtils.degToRad(28);
    const spot = this.spot = new THREE.SpotLight(0xfff1d0, 60, ALCANCE, ANGULO, 0.35, 1.2);
    spot.position.set(0, 0, 0.13);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.1; spot.shadow.camera.far = ALCANCE;
    spot.shadow.bias = -0.0008;
    spot.target.position.set(0, 0, 3);
    l.add(spot, spot.target);

    // cone volumétrico (falso volume com blending aditivo + gradiente de alfa)
    const raio = Math.tan(ANGULO) * ALCANCE;
    this.cone = new THREE.Mesh(
      new THREE.ConeGeometry(raio, ALCANCE, 40, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff0c0, transparent: true, opacity: 0.07, alphaMap: texturaGradienteCone(),
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    this.cone.rotation.x = -Math.PI / 2;      // ponta em -Z, base em +Z
    this.cone.position.z = 0.13 + ALCANCE / 2;
    l.add(this.cone);

    this.corpo.add(n);
  }

  // ------------------------------------------- mangueira corrugada (TubeGeometry)
  #mangueira() {
    const curva = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.12, 0.98, -0.36),
      new THREE.Vector3(0.3, 0.88, -0.2),
      new THREE.Vector3(0.34, 0.92, 0.08),
      new THREE.Vector3(0.2, 1.08, 0.22),
      new THREE.Vector3(0.03, 1.14, 0.2),
    ]);
    const tex = texturaCorrugada(); tex.repeat.set(45, 1);
    const tubo = malha(new THREE.TubeGeometry(curva, 64, 0.034, 12, false),
      new THREE.MeshStandardMaterial({ map: tex, metalness: 0.4, roughness: 0.6 }));
    tubo.name = 'mangueira';
    this.corpo.add(tubo);
  }

  // ------------------------------------------------------------- animação
  atualizar(dt, t) {
    // caminhada: balanço de pernas proporcional à velocidade
    this.fase += dt * 9 * this.velocidade;
    const amp = 0.55 * this.velocidade;
    const s = Math.sin(this.fase);
    this.pernaEsq.quadril.rotation.x = s * amp;
    this.pernaDir.quadril.rotation.x = -s * amp;
    this.pernaEsq.joelho.rotation.x = Math.max(0, -s) * amp * 1.3;
    this.pernaDir.joelho.rotation.x = Math.max(0, s) * amp * 1.3;
    this.corpo.position.y = Math.abs(Math.cos(this.fase)) * 0.03 * this.velocidade;

    // respiração (só o peito, para não deformar a cabeça)
    const resp = 1 + Math.sin(t * 2.2) * 0.018;
    this.peito.scale.set(resp, 1, 0.78 * resp);
    this.cabeca.position.y = 0.66 + Math.sin(t * 2.2) * 0.004;

    // molho de chaves balançando
    this.chaves.rotation.x = Math.sin(t * 3 + this.fase) * (0.15 + 0.35 * this.velocidade);
    this.chaves.rotation.z = Math.cos(t * 2.3) * 0.1;

    // equipamento
    const pulso = 0.5 + 0.5 * Math.sin(t * (this.succao ? 14 : 4));
    this.nucleo.material.emissiveIntensity = 1.0 + pulso * (this.succao ? 3 : 1.2);
    this.nucleo.scale.setScalar(0.92 + pulso * 0.1);
    this.ponteiro.rotation.x = (this.succao ? -1.1 : 0.6) + Math.sin(t * 17) * (this.succao ? 0.12 : 0.03);
    this.turbina.rotation.z += dt * (this.succao ? 45 : 3);
    for (const [i, e] of this.escapes.entries())
      e.position.y = 0.28 + (this.succao ? Math.sin(t * 60 + i) * 0.006 : 0);

    // sobrancelhas reagem ao modo de sucção (esforço/susto)
    for (const sob of this.sobrancelhas) {
      sob.rotation.z = sob.userData.lado * (this.succao ? -0.35 : 0.12);
      sob.position.y = this.succao ? 0.258 : 0.25;
    }
    // modulação tonal da lanterna no modo de sucção; o cone volumétrico e a
    // lente só aparecem acesos quando a SpotLight está ligada (tecla 4)
    this.cone.visible = this.spot.visible;
    const cor = !this.spot.visible ? 0x222222 : this.succao ? 0xb6ffd2 : 0xfff1d0;
    this.spot.color.setHex(cor);
    this.cone.material.color.setHex(this.succao ? 0x9effc4 : 0xfff0c0);
    this.lente.material.color.setHex(cor);
  }
}
