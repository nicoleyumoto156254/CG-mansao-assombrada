// ============================================================================
// Fantasma.js — Inimigo padrão (classe hierárquica reutilizável)
// 4 instâncias com cores distintas + 1 instância em escala 2× para o Chefe.
// Origem: centro do corpo. Frente: eixo +Z local. Altura ≈ 1,3 m (escala 1).
// ============================================================================
import * as THREE from 'three';

function malha(geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p); m.rotation.set(...r); m.scale.set(...s);
  return m;
}

// Perfil da silhueta revolucionado em torno do eixo Y (LatheGeometry)
const PERFIL = [
  [0.0, 0.62], [0.17, 0.6], [0.31, 0.52], [0.41, 0.38], [0.46, 0.18],
  [0.46, 0.0], [0.43, -0.2], [0.39, -0.36], [0.37, -0.42],
].map(([x, y]) => new THREE.Vector2(x, y));

export class Fantasma extends THREE.Group {
  constructor({ cor = 0x7cff9e, nome = 'Fantasma', chefe = false, luz = true } = {}) {
    super();
    this.name = nome;
    this.cor = new THREE.Color(cor);
    this.semente = Math.random() * 10;
    this.alturaBase = 0;

    const corpoMat = new THREE.MeshPhysicalMaterial({
      color: this.cor, emissive: this.cor, emissiveIntensity: 0.35,
      transparent: true, opacity: 0.55, roughness: 0.25, clearcoat: 0.6,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const membroMat = new THREE.MeshStandardMaterial({
      color: this.cor, emissive: this.cor, emissiveIntensity: 0.3, transparent: true, opacity: 0.8, roughness: 0.4,
    });
    const metal = new THREE.MeshStandardMaterial({ color: 0x6d6f78, metalness: 0.9, roughness: 0.35 });
    const preto = new THREE.MeshBasicMaterial({ color: 0x050208 });

    // ---- corpo ectoplásmico em dupla camada
    this.casca = malha(new THREE.LatheGeometry(PERFIL, 40), corpoMat);
    this.casca.renderOrder = 3;
    this.add(this.casca);
    this.nucleo = malha(new THREE.SphereGeometry(0.25, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: this.cor, emissiveIntensity: 2.2 }), [0, 0.08, 0]);
    this.add(this.nucleo);

    // ---- cauda com 10 pontas oscilantes
    this.pontas = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const piv = new THREE.Group();
      piv.position.set(Math.sin(a) * 0.33, -0.4, Math.cos(a) * 0.33);
      piv.rotation.y = a;
      piv.add(malha(new THREE.ConeGeometry(0.085, 0.3, 10), corpoMat, [0, -0.13, 0], [Math.PI, 0, 0]));
      this.pontas.push(piv); this.add(piv);
    }

    // ---- rosto reativo
    const rosto = this.rosto = new THREE.Group(); rosto.name = 'rosto';
    const olhoMat = new THREE.MeshBasicMaterial({ color: 0xfff6b0 });
    this.sobrancelhas = [];
    for (const s of [-1, 1]) {
      rosto.add(malha(new THREE.SphereGeometry(0.085, 18, 14), olhoMat, [s * 0.14, 0.22, 0.38], [0, 0, 0], [1, 1.25, 0.5]));
      rosto.add(malha(new THREE.SphereGeometry(0.035, 12, 10), preto, [s * 0.13, 0.2, 0.42]));
      const sob = malha(new THREE.BoxGeometry(0.15, 0.03, 0.03), preto, [s * 0.14, 0.36, 0.38], [0, 0, s * 0.4]);
      sob.userData.lado = s; this.sobrancelhas.push(sob); rosto.add(sob);
    }
    rosto.add(malha(new THREE.SphereGeometry(0.12, 20, 14), preto, [0, -0.02, 0.38], [0, 0, 0], [1.25, 0.6, 0.45])); // boca
    rosto.add(malha(new THREE.SphereGeometry(0.06, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xff5f8f }), [0, -0.06, 0.41], [0, 0, 0], [1.2, 0.5, 0.6])); // língua
    for (const s of [-1, 1]) // presas
      rosto.add(malha(new THREE.ConeGeometry(0.022, 0.07, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }),
        [s * 0.065, 0.02, 0.43], [Math.PI, 0, 0]));
    this.add(rosto);

    // ---- braços articulados com algemas e correntes
    const criaBraco = (nome, lado) => {
      const ombro = new THREE.Group(); ombro.name = nome;
      ombro.position.set(lado * 0.4, 0.1, 0.05);
      ombro.add(malha(new THREE.SphereGeometry(0.09, 14, 10), membroMat));
      ombro.add(malha(new THREE.CylinderGeometry(0.065, 0.055, 0.22, 12), membroMat, [0, -0.11, 0]));
      const cot = new THREE.Group(); cot.position.y = -0.22;
      cot.add(malha(new THREE.CylinderGeometry(0.055, 0.045, 0.2, 12), membroMat, [0, -0.1, 0]));
      const mao = new THREE.Group(); mao.position.y = -0.22;
      mao.add(malha(new THREE.SphereGeometry(0.07, 14, 10), membroMat));
      for (let d = -1; d <= 1; d++) // três dedos/garras
        mao.add(malha(new THREE.ConeGeometry(0.022, 0.11, 8), membroMat, [d * 0.04, -0.09, 0], [0, 0, d * 0.3 + Math.PI]));
      mao.add(malha(new THREE.TorusGeometry(0.06, 0.017, 8, 18), metal, [0, 0.07, 0], [Math.PI / 2, 0, 0])); // algema
      let pai = mao, y = 0.04;
      for (let k = 0; k < 3; k++) { // elos de corrente pendentes
        const elo = malha(new THREE.TorusGeometry(0.025, 0.007, 6, 12), metal, [0.07 * lado, y, 0], [0, k % 2 ? Math.PI / 2 : 0, 0]);
        pai.add(elo); y -= 0.04;
      }
      cot.add(mao); ombro.add(cot);
      ombro.rotation.set(-1.05, 0, lado * 0.45);  // braços erguidos, ameaçadores
      cot.rotation.x = -0.5;
      this.add(ombro);
      return { ombro, cot };
    };
    this.bracoEsq = criaBraco('leftArmGroup', 1);
    this.bracoDir = criaBraco('rightArmGroup', -1);

    // ---- orbes espectrais orbitantes
    this.orbes = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.orbes.add(malha(new THREE.SphereGeometry(0.045, 10, 8),
        new THREE.MeshBasicMaterial({ color: this.cor }), [Math.cos(a) * 0.72, (i - 1) * 0.18, Math.sin(a) * 0.72]));
    }
    this.add(this.orbes);

    // ---- brilho emitido nas paredes/chão próximos
    if (luz) {
      this.luz = new THREE.PointLight(this.cor, chefe ? 6 : 2.5, chefe ? 9 : 5, 2);
      this.luz.position.y = 0.1;
      this.add(this.luz);
    }

    if (chefe) this.scale.set(2, 2, 2);  // Fantasma Chefe: mesma hierarquia em escala 2×
  }

  atualizar(dt, t) {
    const k = t + this.semente;
    this.position.y = this.alturaBase + Math.sin(k * 1.6) * 0.12;   // flutuação
    const p = 0.5 + 0.5 * Math.sin(k * 3);
    this.nucleo.material.emissiveIntensity = 1.6 + p * 1.4;            // núcleo pulsante
    this.nucleo.scale.setScalar(0.9 + p * 0.15);
    this.pontas.forEach((pv, i) => { pv.rotation.x = Math.sin(k * 4 + i * 0.9) * 0.35; }); // cauda em onda senoidal
    this.orbes.rotation.y += dt * 1.4;
    this.bracoEsq.ombro.rotation.x = -1.05 + Math.sin(k * 2.2) * 0.15;
    this.bracoDir.ombro.rotation.x = -1.05 + Math.sin(k * 2.2 + 1.5) * 0.15;
  }
}
