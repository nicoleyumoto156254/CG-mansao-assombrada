// ============================================================================
// Som.js — Efeitos sonoros sintetizados com a Web Audio API (nenhum arquivo
// de áudio). O contexto só é criado após um gesto do jogador (exigência dos
// navegadores). Tecla M liga/desliga o som.
//
// Música de fundo: arquivo opcional em audio/musica.mp3 (ver audio/LEIA-ME.md).
// Toca em loop durante a partida e pausa no menu, na pausa e no fim de jogo.
// Se o arquivo não existir, o jogo segue normalmente, só com os efeitos.
// ============================================================================

const ARQUIVO_MUSICA = 'audio/musica.mp3';
const VOLUME_MUSICA = 0.35;   // 0 a 1 (os efeitos ficam por cima)

export class Som {
  constructor() {
    this.ctx = null;
    this.mudo = false;
    this.musica = null;           // HTMLAudioElement (criado no primeiro play)
    this.semMusica = false;       // true se o arquivo não existe / não carrega
  }

  // ---------------------------------------------------------- música de fundo
  tocarMusica(doInicio = false) {
    if (this.semMusica) return;
    if (!this.musica) {
      this.musica = new Audio(ARQUIVO_MUSICA);
      this.musica.loop = true;
      this.musica.volume = VOLUME_MUSICA;
      this.musica.addEventListener('error', () => { this.semMusica = true; this.musica = null; });
    }
    this.musica.muted = this.mudo;
    if (doInicio) this.musica.currentTime = 0;
    // play() só funciona depois de um gesto do jogador (Enter/clique); falhas são ignoradas
    this.musica.play()?.catch?.(() => {});
  }

  pausarMusica() { this.musica?.pause(); }

  iniciar() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.mestre = this.ctx.createGain();
        this.mestre.gain.value = 0.5;
        this.mestre.connect(this.ctx.destination);
        this.#criarAspirador();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { this.ctx = null; }
  }

  alternarMudo() {
    this.mudo = !this.mudo;
    if (this.mestre) this.mestre.gain.setTargetAtTime(this.mudo ? 0 : 0.5, this.ctx.currentTime, 0.02);
    if (this.musica) this.musica.muted = this.mudo;
    return this.mudo;
  }

  // ruído contínuo filtrado (turbina) + zumbido grave; o volume acompanha o gatilho
  #criarAspirador() {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const dados = buf.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
    const ruido = c.createBufferSource(); ruido.buffer = buf; ruido.loop = true;
    this.aspFiltro = c.createBiquadFilter(); this.aspFiltro.type = 'bandpass';
    this.aspFiltro.frequency.value = 900; this.aspFiltro.Q.value = 0.8;
    this.aspOsc = c.createOscillator(); this.aspOsc.type = 'sawtooth'; this.aspOsc.frequency.value = 95;
    const passaBaixa = c.createBiquadFilter(); passaBaixa.type = 'lowpass'; passaBaixa.frequency.value = 380;
    const oscGanho = c.createGain(); oscGanho.gain.value = 0.35;
    this.aspGanho = c.createGain(); this.aspGanho.gain.value = 0;
    ruido.connect(this.aspFiltro).connect(this.aspGanho);
    this.aspOsc.connect(passaBaixa).connect(oscGanho).connect(this.aspGanho);
    this.aspGanho.connect(this.mestre);
    ruido.start(); this.aspOsc.start();
  }

  aspirador(ligado, segurando) {
    if (!this.ctx) return;
    const agora = this.ctx.currentTime;
    this.aspGanho.gain.setTargetAtTime(ligado ? (segurando ? 0.32 : 0.16) : 0, agora, 0.06);
    this.aspFiltro.frequency.setTargetAtTime(segurando ? 1700 + Math.random() * 300 : 900, agora, 0.08);
    this.aspOsc.frequency.setTargetAtTime(segurando ? 140 : 95, agora, 0.1);
  }

  // tom simples com envelope e glissando opcional
  #tom(freq, dur, { tipo = 'sine', vol = 0.25, ate = null, atraso = 0, vibrato = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + atraso;
    const o = c.createOscillator(), g = c.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t0);
    if (ate) o.frequency.exponentialRampToValueAtTime(ate, t0 + dur);
    if (vibrato) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 7; lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency); lfo.start(t0); lfo.stop(t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.mestre);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  #sequencia(notas, passo, opcoes) { notas.forEach((f, i) => this.#tom(f, passo * 1.6, { ...opcoes, atraso: i * passo })); }

  inicio()   { this.#sequencia([392, 523, 659], 0.09, { tipo: 'triangle', vol: 0.18 }); }
  surgir(chefe) {
    if (chefe) { this.#tom(90, 2.0, { tipo: 'sawtooth', vol: 0.3, ate: 40 }); this.#tom(60, 2.2, { vol: 0.35, ate: 30 }); }
    else this.#tom(720, 1.1, { vol: 0.14, ate: 260, vibrato: 25 });
  }
  atordoar() { this.#tom(1500, 0.14, { tipo: 'square', vol: 0.07, ate: 700 }); }
  captura()  { this.#sequencia([523, 659, 784, 1047], 0.07, { tipo: 'triangle', vol: 0.22 }); }
  dano()     { this.#tom(150, 0.35, { tipo: 'square', vol: 0.22, ate: 55 }); }
  gema()     { this.#tom(1319, 0.12, { tipo: 'triangle', vol: 0.2 }); this.#tom(1760, 0.22, { tipo: 'triangle', vol: 0.2, atraso: 0.08 }); }
  esquiva()  { this.#tom(380, 0.16, { vol: 0.12, ate: 900 }); }
  carga()    { this.#tom(180, 0.9, { tipo: 'sawtooth', vol: 0.12, ate: 520 }); }
  tique()    { this.#tom(1000, 0.05, { tipo: 'square', vol: 0.06 }); }
  vitoria()  { this.#sequencia([523, 659, 784, 1047, 1319, 1568], 0.11, { tipo: 'triangle', vol: 0.22 }); }
  derrota()  { this.#sequencia([392, 330, 262, 196], 0.25, { tipo: 'sawtooth', vol: 0.12 }); }
}
