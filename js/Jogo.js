// ============================================================================
// Jogo.js — Jogabilidade: estados da partida, movimento do zelador,
// comportamento dos fantasmas, atordoamento/captura, dano, coleta de gemas, pontuação,
// condições de vitória/derrota e reinício.
//
// Estados da partida:  menu → jogando ⇄ pausa → vitoria | derrota → (Enter) jogando
// Modo Sandbox (tecla B): mesma partida, mas sem cronômetro, sem perder vida e
// sem fim de jogo; fantasmas capturados voltam aos quadros. Serve para demonstrar
// mecânicas, iluminação e modelagem com calma.
// Estados de cada fantasma:
//   oculto → surgindo → cacando ⇄ recuando → capturado → contido
//   (só o Chefe)        cacando → preparando → investida → cacando
//   "atordoado" é um temporizador paralelo: enquanto > 0 o fantasma não se move
//   nem causa dano, e pode ser aspirado.
// ============================================================================
import * as THREE from 'three';
import { REGRAS as R, analisarMira, placarFinal, segundosExibidos } from './regras.js';
import { ParticulasSuccao } from './Particulas.js';

const { damp, smoothstep, lerp, clamp } = THREE.MathUtils;
const ATIVOS = new Set(['cacando', 'recuando', 'preparando', 'investida']);
const _bocal = new THREE.Vector3();
const GEO_GEMA = new THREE.OctahedronGeometry(0.17);

function lerRecorde() {
  try { return Number(localStorage.getItem('mansao_recorde')) || 0; } catch { return 0; }
}
function salvarRecorde(v) {
  try { localStorage.setItem('mansao_recorde', String(v)); } catch { /* sem armazenamento */ }
}

export class Jogo {
  constructor({ scene, zelador, fantasmas, chefe, quadros, resolverColisoes, hud, som }) {
    Object.assign(this, { scene, zelador, fantasmas, chefe, quadros, resolverColisoes, hud, som });
    this.todos = [...fantasmas, chefe];

    // Rota de cada fantasma: sai de dentro do quadro (na parede) e para a 8,2 m do centro.
    fantasmas.forEach((f, i) => {
      const saida = f.position.clone();
      const origem = saida.clone().setY(0).setLength(9.75).setY(3.25);   // centro da tela do quadro
      f.jg = { origem, saida, liberarEm: R.LIBERACAO[i], quadro: quadros[i] };
    });
    chefe.jg = { origem: new THREE.Vector3(0, -1.2, 0), saida: new THREE.Vector3(0, 2.8, 0), liberarEm: Infinity, quadro: null };

    // malhas do zelador que piscam durante a invulnerabilidade (o cone de luz fica de fora)
    this.malhasZelador = [];
    zelador.traverse((o) => { if (o.isMesh && o !== zelador.cone) this.malhasZelador.push(o); });

    this.particulas = new ParticulasSuccao(scene);
    this.gemas = [];
    this.empurrao = new THREE.Vector3();
    this.puxao = new THREE.Vector3();
    this.dirEsquiva = new THREE.Vector3();
    this.recorde = lerRecorde();
    this.sandbox = false;
    this.congelado = false;         // Sandbox: fantasmas param de se mover (tecla F)

    this.#resetar();
    this.estado = 'menu';
    this.hud.mostrarTela('menu', { recorde: this.recorde });
    this.hud.atualizar(this);
  }

  // ------------------------------------------------------------ partida
  get jogando() { return this.estado === 'jogando'; }

  // Enter / clique na tela: começa, continua ou reinicia
  acaoPrincipal() {
    this.som.iniciar();
    if (this.estado === 'menu' || this.estado === 'vitoria' || this.estado === 'derrota') this.reiniciar();
    else if (this.estado === 'pausa') this.continuar();
  }

  reiniciar() {
    this.sandbox = false;
    this.#resetar();
    this.estado = 'jogando';
    this.hud.esconderTela();
    this.hud.mensagem('Capture os 4 fantasmas dos quadros!', 2.2);
    this.som.inicio();
    this.som.tocarMusica(true);
  }

  // ------------------------------------------------------------ sandbox
  iniciarSandbox() {
    this.som.iniciar();
    this.sandbox = true;
    this.#resetar();
    this.estado = 'jogando';
    this.hud.esconderTela();
    this.hud.mensagem('Sandbox: sem tempo e sem dano · J = Chefe · F = congelar', 3);
    this.som.inicio();
    this.som.tocarMusica(true);
  }

  voltarAoMenu() {
    this.sandbox = false;
    this.#resetar();
    this.estado = 'menu';
    this.hud.mostrarTela('menu', { recorde: this.recorde });
    this.hud.atualizar(this);
    this.som.pausarMusica();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // Sandbox: chama o Chefe a qualquer momento (J)
  despertarChefeAgora() {
    if (!this.sandbox || !this.jogando) return;
    const e = this.chefe.jg.estado;
    if (e !== 'oculto' && e !== 'contido') return;   // já está em cena
    this.#reporFantasma(this.chefe, Infinity);
    this.#despertarChefe();
  }

  // Sandbox: congela/descongela o movimento dos fantasmas (F)
  alternarCongelar() {
    if (!this.sandbox || !this.jogando) return;
    this.congelado = !this.congelado;
    this.hud.mensagem(this.congelado ? 'Fantasmas congelados' : 'Fantasmas livres', 1.2);
  }

  pausar() {
    if (!this.jogando) return;
    this.estado = 'pausa';
    this.pausadoEm = performance.now();
    this.zelador.succao = false;
    this.som.aspirador(false, false);
    this.som.pausarMusica();
    this.hud.mostrarTela('pausa', { sandbox: this.sandbox });
  }

  continuar() {
    if (this.estado !== 'pausa') return;
    this.estado = 'jogando';
    this.hud.esconderTela();
    this.som.tocarMusica();
  }

  alternarPausa() { if (this.jogando) this.pausar(); else this.continuar(); }

  // devolve um fantasma ao quadro (ou ao chão, o Chefe), pronto para surgir em `liberarEm`
  #reporFantasma(f, liberarEm) {
    const g = f.jg;
    Object.assign(g, { estado: 'oculto', t: 0, hp: f.chefe ? R.HP_CHEFE : R.HP_FANTASMA, exposicao: 0, atordoado: 0, ataque: 4, liberarEm });
    g.hpMax = g.hp;
    f.position.copy(g.origem);
    f.alturaBase = g.origem.y;
    f.scale.setScalar(0.001);
    f.atordoado = 0; f.aspirado = false;
    f.mostrarCorpo(false);
    if (f.luz) f.luz.intensity = 0;
    this.#brilhoQuadro(f, 0);
  }

  #resetar() {
    const z = this.zelador;
    this.congelado = false;
    this.tempoRestante = R.TEMPO_PARTIDA;
    this.relogio = 0;                 // s desde o início da partida
    this.vida = R.VIDA_MAX;
    this.pontos = 0;
    this.capturas = 0;
    this.gemasColetadas = 0;
    this.chefeCapturado = false;
    this.chefeEm = Infinity;          // relógio em que o Chefe desperta
    this.fimEm = Infinity;            // relógio em que a vitória é declarada (após a animação)
    this.invulneravel = 0;
    this.esquiva = 0;
    this.recargaEsquiva = 0;
    this.tremor = 0;                  // tremor de câmera (0..1)
    this.flashDano = 0;               // vinheta vermelha (0..1)
    this.alvo = null;                 // fantasma sendo aspirado (para o HUD)
    this.ultimoTique = Infinity;
    this.empurrao.set(0, 0, 0);
    this.puxao.set(0, 0, 0);

    z.position.set(0, 0, 3);
    z.rotation.y = Math.PI;           // olhando para o Norte
    z.succao = false;
    z.velocidade = 0;
    this.malhasZelador.forEach((m) => (m.visible = true));

    this.fantasmas.forEach((f, i) => { f.jg.dir = new THREE.Vector3(); this.#reporFantasma(f, R.LIBERACAO[i]); });
    this.chefe.jg.dir = new THREE.Vector3();
    this.#reporFantasma(this.chefe, Infinity);
    for (const gm of this.gemas) this.scene.remove(gm.malha);
    this.gemas = [];
    this.particulas.limpar();
    this.som.aspirador(false, false);
  }

  #fim(venceu, motivo) {
    this.estado = venceu ? 'vitoria' : 'derrota';
    this.zelador.succao = false;
    this.alvo = null;
    this.som.aspirador(false, false);
    for (const f of this.todos) f.aspirado = false;
    const placar = placarFinal({
      capturas: this.capturas, chefe: this.chefeCapturado, gemas: this.gemasColetadas,
      tempoRestante: this.tempoRestante, venceu,
    });
    this.pontos = placar.total;
    const novoRecorde = placar.total > this.recorde;
    if (novoRecorde) { this.recorde = placar.total; salvarRecorde(placar.total); }
    this.som.pausarMusica();
    venceu ? this.som.vitoria() : this.som.derrota();
    this.hud.mostrarTela(this.estado, { placar, motivo, recorde: this.recorde, novoRecorde });
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ------------------------------------------------------------ laço
  // entrada: { dir: Vector3 unitário (ou zero) no plano XZ, succao: bool, esquivar: bool }
  atualizar(dt, t, entrada) {
    if (this.estado === 'pausa') return;           // tudo congelado

    if (!this.jogando) {                            // menu / fim: só animações ociosas
      this.zelador.succao = false;
      this.zelador.velocidade = damp(this.zelador.velocidade, 0, 10, dt);
      for (const f of this.todos) if (f.corpoVisivel) f.atualizar(dt, t);
      this.#atualizarGemas(dt, t, false);
      this.particulas.atualizar(dt, this.#posBocal());
      this.tremor = Math.max(0, this.tremor - dt * 2);
      this.flashDano = Math.max(0, this.flashDano - dt * 2);
      return;
    }

    this.relogio += dt;
    if (!this.chefeCapturado && !this.sandbox) this.tempoRestante -= dt;
    this.invulneravel = Math.max(0, this.invulneravel - dt);
    this.tremor = Math.max(0, this.tremor - dt * 2.2);
    this.flashDano = Math.max(0, this.flashDano - dt * 1.8);

    this.#moverZelador(dt, entrada);
    this.zelador.succao = entrada.succao;

    // fantasmas
    this.alvo = null;
    this.puxao.set(0, 0, 0);
    this.puxandoContra = false;
    for (const f of this.todos) this.#atualizarFantasma(f, dt, t, entrada);
    this.#separarFantasmas();
    if (this.relogio >= this.chefeEm) { this.chefeEm = Infinity; this.#despertarChefe(); }

    this.#atualizarGemas(dt, t, true);
    this.particulas.atualizar(dt, this.#posBocal());
    this.som.aspirador(entrada.succao, !!this.alvo);

    // pisca o zelador durante a invulnerabilidade
    const piscando = this.invulneravel > 0 && Math.floor(this.invulneravel * 16) % 2 === 0;
    this.malhasZelador.forEach((m) => (m.visible = !piscando));

    // tique-taque nos últimos 10 s
    const s = segundosExibidos(this.tempoRestante);
    if (s <= 10 && s < this.ultimoTique && !this.chefeCapturado) { this.ultimoTique = s; if (s > 0) this.som.tique(); }

    // fim de jogo (não existe no Sandbox)
    if (this.sandbox) { /* sem vitória nem derrota */ }
    else if (this.relogio >= this.fimEm) this.#fim(true, 'Todos os fantasmas foram capturados!');
    else if (this.vida <= 0) this.#fim(false, 'O zelador desmaiou de susto — a vida chegou a zero.');
    else if (this.tempoRestante <= 0) { this.tempoRestante = 0; this.#fim(false, 'O tempo acabou — os fantasmas dominaram a mansão.'); }

    this.hud.atualizar(this);
  }

  // ------------------------------------------------------------ zelador
  #moverZelador(dt, e) {
    const z = this.zelador;
    this.recargaEsquiva = Math.max(0, this.recargaEsquiva - dt);
    if (e.esquivar && this.recargaEsquiva <= 0) {
      this.esquiva = R.DURACAO_ESQUIVA;
      this.recargaEsquiva = R.RECARGA_ESQUIVA;
      // esquiva na direção do movimento; parado, recua (para trás)
      if (e.dir.lengthSq() > 0) this.dirEsquiva.copy(e.dir);
      else this.dirEsquiva.set(-Math.sin(z.rotation.y), 0, -Math.cos(z.rotation.y));
      this.som.esquiva();
    }

    const desloc = new THREE.Vector3();
    if (this.esquiva > 0) {
      this.esquiva -= dt;
      desloc.copy(this.dirEsquiva).multiplyScalar(R.VEL_ESQUIVA * dt);
    } else {
      const fator = this.alvo ? R.FATOR_VEL_ASPIRANDO : 1;   // alvo do quadro anterior
      desloc.copy(e.dir).multiplyScalar(R.VELOCIDADE * fator * dt);
    }
    desloc.addScaledVector(this.empurrao, dt).addScaledVector(this.puxao, dt);
    this.empurrao.multiplyScalar(Math.exp(-dt * 6));

    if (desloc.lengthSq() > 0) {
      z.position.add(desloc);
      this.resolverColisoes(z.position);
    }
    const andando = e.dir.lengthSq() > 0 || this.esquiva > 0;
    z.velocidade = damp(z.velocidade, andando ? 1 : 0, 10, dt);
  }

  #levarDano(f, ux, uz) {
    const g = f.jg;
    const dano = f.chefe ? R.DANO_CHEFE : R.DANO;
    if (!this.sandbox) this.vida = Math.max(0, this.vida - dano);   // no Sandbox só o efeito visual
    this.invulneravel = R.INVULNERAVEL;
    this.empurrao.set(-ux, 0, -uz).multiplyScalar(R.EMPURRAO);   // empurra para longe do fantasma
    this.tremor = 1;
    this.flashDano = 1;
    g.estado = 'recuando'; g.t = 0;
    this.som.dano();
    this.hud.mensagem(this.sandbox ? `Acertou! (−${dano} fora do Sandbox)` : `−${dano} de vida!`, 1, 'dano');
  }

  // ------------------------------------------------------------ fantasmas
  #iniciarSurgimento(f) {
    const g = f.jg;
    g.estado = 'surgindo'; g.t = 0;
    f.mostrarCorpo(true);
    this.som.surgir(f.chefe);
  }

  #despertarChefe() {
    this.chefe.jg.liberarEm = this.relogio;
    this.tremor = 0.9;
    this.hud.mensagem('O FANTASMA CHEFE DESPERTOU!', 2.6, 'chefe');
  }

  #capturar(f) {
    const g = f.jg;
    g.estado = 'capturado'; g.t = 0;
    g.posCaptura = f.position.clone();
    f.aspirado = false;
    this.som.captura();
    if (f.chefe) {
      this.chefeCapturado = !this.sandbox;          // no Sandbox o Chefe pode ser chamado de novo (J)
      this.pontos += R.PONTOS_CHEFE;
      if (!this.sandbox) this.fimEm = this.relogio + 1.0;
      this.hud.mensagem(`Chefe capturado! +${R.PONTOS_CHEFE}`, 1.5, 'pontos');
    } else {
      this.capturas++;
      this.pontos += R.PONTOS_FANTASMA;
      this.#criarGema(f);
      this.hud.mensagem(`${f.name} capturado! +${R.PONTOS_FANTASMA}`, 1.6, 'pontos');
      if (this.capturas === this.fantasmas.length && this.chefe.jg.estado === 'oculto') {
        this.chefeEm = this.relogio + R.ATRASO_CHEFE;
        setTimeout(() => this.jogando && this.hud.mensagem('Algo desperta no centro do salão...', 1.6), 500);
      }
    }
  }

  #brilhoQuadro(f, k) {
    const tela = f.jg.quadro?.children[0];
    if (!tela) return;
    tela.material.emissive.copy(f.cor);
    tela.material.emissiveIntensity = k;
  }

  #atualizarFantasma(f, dt, t, e) {
    const g = f.jg, z = this.zelador;
    g.t += dt;

    switch (g.estado) {
      case 'oculto':
        // o quadro brilha 1 s antes de liberar o fantasma (aviso ao jogador)
        if (g.liberarEm - this.relogio < 1) this.#brilhoQuadro(f, 0.6 * (0.5 + 0.5 * Math.sin(this.relogio * 18)));
        if (this.relogio >= g.liberarEm) this.#iniciarSurgimento(f);
        return;

      case 'surgindo': {   // sai da tela do quadro (ou do chão, no caso do Chefe) crescendo
        const dur = f.chefe ? 2.0 : 1.3;
        const k = Math.min(g.t / dur, 1), s = smoothstep(k, 0, 1);
        f.atualizar(dt, t);
        f.position.lerpVectors(g.origem, g.saida, s);
        f.alturaBase = f.position.y;
        f.scale.setScalar(f.escalaBase * Math.max(0.02, s));
        if (f.luz) f.luz.intensity = f.luzBase * s;
        f.lookAt(z.position.x, f.position.y, z.position.z);
        this.#brilhoQuadro(f, 0.8 * (1 - k));
        if (k >= 1) { g.estado = 'cacando'; g.t = 0; g.ataque = 3; }
        return;
      }

      case 'capturado': {  // encolhe e voa para dentro do bocal
        const k = Math.min(g.t / 0.55, 1);
        f.atualizar(dt, t);
        f.position.lerpVectors(g.posCaptura, this.#posBocal(), k * k);
        f.scale.setScalar(f.escalaBase * (1 - k) + 0.001);
        f.rotation.y += dt * 18;
        if (f.luz) f.luz.intensity = f.luzBase * (1 - k);
        f.atordoado = 1;
        if (k >= 1) { g.estado = 'contido'; f.mostrarCorpo(false); if (f.luz) f.luz.intensity = 0; }
        return;
      }

      case 'contido':
        // Sandbox: o fantasma volta ao quadro 4 s depois de capturado
        if (this.sandbox && !f.chefe && g.t > 4) this.#reporFantasma(f, this.relogio + 1);
        return;
    }

    // ---------------- estados ativos: teste da lanterna (produto escalar)
    const mira = analisarMira(z.position.x, z.position.z, z.rotation.y, f.position.x, f.position.z);
    const naLuz = z.spot.visible && mira.dentro && g.estado !== 'investida';
    g.exposicao = naLuz ? g.exposicao + dt : Math.max(0, g.exposicao - dt * 2);
    if (g.exposicao >= R.TEMPO_PARA_ATORDOAR) {
      if (g.atordoado <= 0) {
        this.som.atordoar();
        if (g.estado === 'preparando') { g.estado = 'cacando'; g.ataque = 2.5; }   // a luz cancela a investida
      }
      g.atordoado = R.DURACAO_ATORDOADO;
    } else {
      g.atordoado = Math.max(0, g.atordoado - dt);
    }
    const atordoado = g.atordoado > 0;
    const aspirado = atordoado && naLuz && e.succao;
    f.aspirado = aspirado;
    f.atordoado = damp(f.atordoado, atordoado ? 1 : 0, 8, dt);

    // vetor unitário zelador → fantasma (plano XZ)
    const dx = f.position.x - z.position.x, dz = f.position.z - z.position.z;
    const d = Math.hypot(dx, dz) || 1e-6, ux = dx / d, uz = dz / d;

    if (aspirado) {
      // HP cai; puxar no sentido oposto (dir · u < −0,5) acelera a sucção
      let taxa = R.TAXA_SUCCAO;
      if (e.dir.lengthSq() > 0 && e.dir.x * ux + e.dir.z * uz < -0.5) { taxa *= R.BONUS_PUXAR; this.puxandoContra = true; }
      g.hp -= taxa * dt;
      if (!this.alvo || g.hp / g.hpMax < this.alvo.jg.hp / this.alvo.jg.hpMax) this.alvo = f;
      // o fantasma tenta fugir em zigue-zague e arrasta o zelador
      const fuga = f.chefe ? R.FUGA_CHEFE : R.FUGA, lat = Math.sin(t * 3 + f.semente * 5) * 1.3;
      f.position.x += (ux * fuga - uz * lat) * dt;
      f.position.z += (uz * fuga + ux * lat) * dt;
      this.puxao.x += ux * (f.chefe ? R.PUXAO_CHEFE : R.PUXAO);
      this.puxao.z += uz * (f.chefe ? R.PUXAO_CHEFE : R.PUXAO);
      this.particulas.emitir(f, dt, f.chefe ? 170 : 110);
      if (g.hp <= 0) { this.#capturar(f); return; }
    } else if (!atordoado) {
      g.hp = Math.min(g.hpMax, g.hp + R.REGEN_HP * dt);
      if (!this.congelado) this.#mover(f, g, dt, t, ux, uz, d);
    }

    // altura: desce para a altura do zelador ao se aproximar
    const perto = f.chefe ? 2.0 : 1.25, longe = f.chefe ? 2.8 : 2.2;
    const alvoY = g.estado === 'recuando' ? longe : lerp(perto, longe, smoothstep(d, 1.5, 5));
    f.alturaBase = damp(f.alturaBase, alvoY, 3, dt);
    const lim = R.LIMITE_SALA - (f.chefe ? 0.6 : 0);
    f.position.x = clamp(f.position.x, -lim, lim);
    f.position.z = clamp(f.position.z, -lim, lim);

    f.atualizar(dt, t);
    f.lookAt(z.position.x, f.position.y, z.position.z);
    if (f.luz) f.luz.intensity = f.luzBase * (1 + f.atordoado * 0.8 * (0.5 + 0.5 * Math.sin(t * 25)));

    // contato com o zelador (proximidade), exceto atordoado / esquivando / invulnerável
    const toque = f.chefe ? R.DIST_TOQUE_CHEFE : R.DIST_TOQUE;
    if (!atordoado && !this.congelado && g.estado !== 'recuando' && d < toque && this.invulneravel <= 0 && this.esquiva <= 0)
      this.#levarDano(f, ux, uz);
  }

  #mover(f, g, dt, t, ux, uz, d) {
    switch (g.estado) {
      case 'cacando': {
        // persegue o zelador (−u) com uma leve ondulação lateral
        const v = f.chefe ? R.VEL_CHEFE : R.VEL_FANTASMA, lat = Math.sin(t * 1.7 + f.semente * 3) * 0.45;
        f.position.x += (-ux - uz * lat) * v * dt;
        f.position.z += (-uz + ux * lat) * v * dt;
        if (f.chefe) {
          g.ataque -= dt;
          if (g.ataque <= 0 && d < 9 && d > 2) { g.estado = 'preparando'; g.t = 0; this.som.carga(); }
        }
        break;
      }
      case 'recuando':
        f.position.x += ux * R.VEL_RECUO * dt;
        f.position.z += uz * R.VEL_RECUO * dt;
        if (g.t > R.DURACAO_RECUO) { g.estado = 'cacando'; g.t = 0; }
        break;
      case 'preparando':    // Chefe treme parado, depois avança em linha reta
        f.position.x += (Math.random() - 0.5) * 0.06;
        f.position.z += (Math.random() - 0.5) * 0.06;
        if (g.t > R.PREPARO_INVESTIDA) { g.estado = 'investida'; g.t = 0; g.dir.set(-ux, 0, -uz); }
        break;
      case 'investida':
        f.position.addScaledVector(g.dir, R.VEL_INVESTIDA * dt);
        if (g.t > R.DURACAO_INVESTIDA) {
          const [a, b] = R.INTERVALO_INVESTIDA;
          g.estado = 'cacando'; g.t = 0; g.ataque = a + Math.random() * (b - a);
        }
        break;
    }
  }

  // repulsão simples entre fantasmas ativos para não se sobreporem
  #separarFantasmas() {
    const ativos = this.todos.filter((f) => ATIVOS.has(f.jg.estado));
    for (let i = 0; i < ativos.length; i++) for (let j = i + 1; j < ativos.length; j++) {
      const a = ativos[i], b = ativos[j];
      const min = 0.55 * (a.escalaBase + b.escalaBase);
      const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z, d = Math.hypot(dx, dz);
      if (d < min && d > 1e-6) {
        const k = (min - d) / d / 2;
        a.position.x -= dx * k; a.position.z -= dz * k;
        b.position.x += dx * k; b.position.z += dz * k;
      }
    }
  }

  #posBocal() {
    return this.zelador.bocal.localToWorld(_bocal.set(0, 0, 0.26));
  }

  // ------------------------------------------------------------ gemas (coleta)
  #criarGema(f) {
    const malha = new THREE.Mesh(GEO_GEMA, new THREE.MeshStandardMaterial({
      color: f.cor, emissive: f.cor, emissiveIntensity: 1.1, metalness: 0.3, roughness: 0.15,
    }));
    malha.name = 'Gema';
    malha.position.copy(f.position);
    malha.castShadow = true;
    this.scene.add(malha);
    this.gemas.push({ malha, t: 0, y0: f.position.y, cor: f.cor });
  }

  #atualizarGemas(dt, t, coletar) {
    const z = this.zelador.position;
    for (let i = this.gemas.length - 1; i >= 0; i--) {
      const gm = this.gemas[i], m = gm.malha;
      gm.t += dt;
      const queda = Math.min(gm.t / 0.7, 1);
      m.position.y = lerp(gm.y0, 0.5, queda * queda) + (queda >= 1 ? Math.sin(t * 3 + i) * 0.08 : 0);
      m.rotation.y += dt * 2.5;
      if (coletar && queda >= 1 && Math.hypot(m.position.x - z.x, m.position.z - z.z) < R.DIST_COLETA) {
        this.scene.remove(m);
        m.material.dispose();
        this.gemas.splice(i, 1);
        this.gemasColetadas++;
        this.pontos += R.PONTOS_GEMA;
        this.vida = Math.min(R.VIDA_MAX, this.vida + R.CURA_GEMA);
        this.som.gema();
        this.hud.mensagem(`Gema! +${R.PONTOS_GEMA} pontos · +${R.CURA_GEMA} vida`, 1.4, 'pontos');
      }
    }
  }
}
