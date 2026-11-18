// ============================================================================
// Particulas.js — Fluxo de ectoplasma do fantasma até o bocal do aspirador.
// Um único THREE.Points com um "pool" fixo de partículas (sem alocar memória
// durante o jogo). Cada partícula percorre uma espiral que se fecha no bocal.
// ============================================================================
import * as THREE from 'three';

const N = 420;

function texturaPonto() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.name = 'particula';
  return t;
}

export class ParticulasSuccao {
  constructor(scene) {
    this.pos = new Float32Array(N * 3);
    this.cor = new Float32Array(N * 3);
    this.p = Array.from({ length: N }, () => ({ vivo: false, t: 0, dur: 1, fase: 0, raio: 0, origem: new THREE.Vector3() }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.cor, 3).setUsage(THREE.DynamicDrawUsage));
    this.pontos = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.11, map: texturaPonto(), vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.pontos.name = 'Partículas de sucção';
    this.pontos.frustumCulled = false;
    this.acumulado = new Map();
    this.limpar();
    scene.add(this.pontos);
  }

  // Emite partículas a partir do corpo do fantasma (taxa em partículas/s)
  emitir(fantasma, dt, taxa = 110) {
    const acc = (this.acumulado.get(fantasma) || 0) + taxa * dt;
    let n = Math.floor(acc);
    this.acumulado.set(fantasma, acc - n);
    const r = 0.45 * fantasma.escalaBase;
    for (let i = 0; i < N && n > 0; i++) {
      const q = this.p[i];
      if (q.vivo) continue;
      q.vivo = true; q.t = 0; q.dur = 0.35 + Math.random() * 0.3;
      q.fase = Math.random() * Math.PI * 2; q.raio = 0.15 + Math.random() * 0.25;
      q.origem.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize().multiplyScalar(r * Math.cbrt(Math.random())).add(fantasma.position);
      const c = fantasma.cor;
      const b = 0.6 + Math.random() * 0.6;
      this.cor.set([c.r * b, c.g * b, c.b * b], i * 3);
      n--;
    }
  }

  // destino: posição do bocal no mundo
  atualizar(dt, destino) {
    for (let i = 0; i < N; i++) {
      const q = this.p[i];
      if (!q.vivo) continue;
      q.t += dt;
      const k = q.t / q.dur;
      if (k >= 1) { q.vivo = false; this.pos[i * 3 + 1] = -100; continue; }
      const e = k * k;                                   // acelera ao chegar no bocal
      const espiral = (1 - k) * q.raio, ang = q.fase + k * 9;
      this.pos[i * 3] = q.origem.x + (destino.x - q.origem.x) * e + Math.cos(ang) * espiral;
      this.pos[i * 3 + 1] = q.origem.y + (destino.y - q.origem.y) * e + Math.sin(ang) * espiral;
      this.pos[i * 3 + 2] = q.origem.z + (destino.z - q.origem.z) * e + Math.sin(ang * 0.7) * espiral;
    }
    this.pontos.geometry.attributes.position.needsUpdate = true;
    this.pontos.geometry.attributes.color.needsUpdate = true;
  }

  limpar() {
    for (let i = 0; i < N; i++) { this.p[i].vivo = false; this.pos[i * 3 + 1] = -100; }
    this.acumulado.clear();
    this.pontos.geometry.attributes.position.needsUpdate = true;
  }
}
