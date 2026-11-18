import { formatarTempo, segundosExibidos, REGRAS as R } from './regras.js';

const $ = (id) => document.getElementById(id);

const LOGO_PNG = null;
const logoHtml = () => LOGO_PNG
  ? `<img class="logo-img" src="${LOGO_PNG}" alt="Mansão Assombrada Computação Gráfica" />`
  : '<div class="logo"><span class="l1">Mansão</span><span class="l2">Assombrada</span><span class="l3">Computação Gráfica</span></div>';
const hex = (c) => '#' + c.getHexString();

export class Hud {
  constructor() {
    this.msgTimer = null;
    this.cache = {};
  }

  // só altera o DOM quando o valor muda
  #definir(id, prop, valor) {
    const chave = id + prop;
    if (this.cache[chave] === valor) return;
    this.cache[chave] = valor;
    const el = $(id);
    if (prop === 'text') el.textContent = valor;
    else if (prop === 'html') el.innerHTML = valor;
    else if (prop === 'width') el.style.width = valor;
    else if (prop === 'class') el.className = valor;
    else if (prop === 'opacity') el.style.opacity = valor;
  }

  atualizar(j) {
    this.#definir('hud-pontos', 'text', String(j.pontos));
    this.#definir('hud-tempo', 'text', j.sandbox ? '∞' : formatarTempo(j.tempoRestante));
    this.#definir('hud-tempo', 'class', !j.sandbox && segundosExibidos(j.tempoRestante) <= 10 && !j.chefeCapturado ? 'alerta' : '');
    this.#definir('hud-modo', 'text', j.sandbox ? `SANDBOX${j.congelado ? ' · congelado' : ''}` : '');
    const v = Math.max(0, j.vida) / R.VIDA_MAX;
    this.#definir('hud-vida', 'width', (v * 100).toFixed(1) + '%');
    this.#definir('hud-vida', 'class', v > 0.5 ? 'ok' : v > 0.25 ? 'medio' : 'critico');
    this.#definir('hud-vida-txt', 'text', `${Math.ceil(j.vida)} / ${R.VIDA_MAX}`);

    // ícones: um por fantasma (aceso = capturado) + Chefe
    const icones = j.todos.map((f) => {
      const e = f.jg.estado, preso = e === 'capturado' || e === 'contido';
      const ativo = !preso && e !== 'oculto';
      return `<span class="icone ${f.chefe ? 'chefe' : ''} ${preso ? 'preso' : ativo ? 'ativo' : ''}" style="--c:${hex(f.cor)}" title="${f.name}"></span>`;
    }).join('');
    const contagem = j.sandbox ? `${j.capturas} capturas` : `${j.capturas}/4${j.chefeCapturado ? ' + Chefe' : ''}`;
    this.#definir('hud-capturas', 'html', `${icones} <small>${contagem}</small>`);

    const pronta = j.recargaEsquiva <= 0;
    this.#definir('hud-esquiva', 'text', pronta ? 'Esquiva [Shift]: pronta' : `Esquiva [Shift]: ${j.recargaEsquiva.toFixed(1)} s`);
    this.#definir('hud-esquiva', 'class', pronta ? 'pronta' : '');

    // alvo da sucção
    if (j.alvo && j.jogando) {
      const g = j.alvo.jg, p = Math.max(0, g.hp) / g.hpMax;
      this.#definir('alvo', 'opacity', '1');
      this.#definir('alvo-nome', 'text', `${j.alvo.name}${j.puxandoContra ? ' — puxando! ×' + R.BONUS_PUXAR : ''}`);
      this.#definir('alvo-hp', 'width', (p * 100).toFixed(1) + '%');
      $('alvo-hp').style.background = hex(j.alvo.cor);
      this.#definir('alvo-txt', 'text', `${Math.ceil(Math.max(0, g.hp) * 100)}%`);
    } else this.#definir('alvo', 'opacity', '0');

    this.#definir('vinheta', 'opacity', j.flashDano.toFixed(2));
  }

  mensagem(texto, dur = 1.6, tipo = '') {
    const el = $('mensagem');
    el.textContent = texto;
    el.className = 'visivel ' + tipo;
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => (el.className = tipo), dur * 1000);
  }

  esconderTela() { $('tela').classList.remove('visivel'); }

  mostrarTela(tipo, d) {
    let html = '';
    if (tipo === 'menu') {
      html = `
        ${logoHtml()}
        <p class="sub">Você é o zelador noturno. Quatro fantasmas vão sair dos quadros amaldiçoados do salão —
        e, quando todos forem capturados, o <b>Fantasma Chefe</b> desperta.</p>
        <div class="colunas">
          <div>
            <h3>Como capturar</h3>
            <ol>
              <li><b>Mire a lanterna</b> no fantasma (cone de 28°, até 7,5 m) para <b>atordoá-lo</b>.</li>
              <li><b>Segure o aspirador</b> (clique / Espaço) enquanto ele está atordoado.</li>
              <li><b>Puxe para trás</b> (andar para longe dele) para aspirar mais rápido.</li>
              <li>Fantasmas soltam <b>gemas</b>: colete para ganhar pontos e vida.</li>
              <li>O Chefe faz <b>investidas</b>: ilumine-o enquanto treme ou <b>desvie</b> com Shift.</li>
            </ol>
          </div>
          <div>
            <h3>Controles</h3>
            <table class="teclas">
              <tr><td>W A S D</td><td>mover</td></tr>
              <tr><td>Mouse · Q E</td><td>mirar</td></tr>
              <tr><td>C</td><td>câmera (no topo: WASD = N/O/S/L, mira no cursor)</td></tr>
              <tr><td>Clique · Espaço</td><td>aspirador</td></tr>
              <tr><td>Shift</td><td>esquiva</td></tr>
              <tr><td>Esc</td><td>pausa (Backspace na pausa: menu)</td></tr>
              <tr><td>M</td><td>som on/off</td></tr>
              <tr><td>I</td><td>painéis técnicos</td></tr>
            </table>
            <h3>Pontuação</h3>
            <table class="teclas">
              <tr><td>Fantasma</td><td>+${R.PONTOS_FANTASMA}</td></tr>
              <tr><td>Chefe</td><td>+${R.PONTOS_CHEFE}</td></tr>
              <tr><td>Gema</td><td>+${R.PONTOS_GEMA} e +${R.CURA_GEMA} vida</td></tr>
              <tr><td>Bônus</td><td>segundos restantes × ${R.BONUS_POR_SEGUNDO}</td></tr>
            </table>
          </div>
        </div>
        <p class="sub">Vença capturando todos em ${R.TEMPO_PARTIDA} s. Você perde se o tempo ou a vida acabar.</p>
        ${d.recorde ? `<p class="recorde">Recorde: ${d.recorde}</p>` : ''}
        <p class="acao">Pressione <b>Enter</b> ou clique para começar</p>
        <p class="sub"><b>B</b> — modo <b>Sandbox</b>: sem cronômetro e sem dano, para explorar a cena
        (J chama o Chefe, F congela os fantasmas; H, U, R, 1–5 e C mostram os detalhes técnicos).</p>`;
    } else if (tipo === 'pausa') {
      html = `<h2>Pausado</h2><p class="acao">Pressione <b>Enter</b> ou clique para continuar</p>
        <p class="sub"><b>Backspace</b>: voltar ao menu · <b>B</b>: ${d.sandbox ? 'recomeçar o' : 'ir para o'} Sandbox</p>`;
    } else {
      const venceu = tipo === 'vitoria';
      const linhas = d.placar.itens.map((i) => `<tr><td>${i.rotulo}</td><td>${i.conta}</td><td>${i.valor}</td></tr>`).join('');
      html = `
        <h2 class="${venceu ? 'vitoria' : 'derrota'}">${venceu ? 'Vitória!' : 'Fim de jogo'}</h2>
        <p class="sub">${d.motivo}</p>
        <table class="placar">${linhas}<tr class="total"><td>Total</td><td></td><td>${d.placar.total}</td></tr></table>
        <p class="recorde">${d.novoRecorde ? 'Novo recorde!' : `Recorde: ${d.recorde}`}</p>
        <p class="acao">Pressione <b>Enter</b> ou clique para jogar de novo</p>
        <p class="sub"><b>Backspace</b>: menu · <b>B</b>: Sandbox</p>`;
    }
    $('tela-conteudo').innerHTML = html;
    $('tela').classList.add('visivel');
  }
}
