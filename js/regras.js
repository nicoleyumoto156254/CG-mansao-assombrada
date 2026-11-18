// ============================================================================
// regras.js — Regras e constantes do jogo (sem Three.js: funções puras,
// independentes da renderização). Unidades: metros, segundos e radianos.
// ============================================================================

export const REGRAS = {
  // partida
  TEMPO_PARTIDA: 60,          // s
  VIDA_MAX: 100,              // HP do zelador
  LIBERACAO: [1.0, 3.5, 6.0, 8.5], // instante (s) em que cada quadro libera seu fantasma (N, L, S, O)
  ATRASO_CHEFE: 1.6,          // s entre a 4ª captura e o despertar do Chefe

  // zelador
  VELOCIDADE: 3.2,            // m/s
  FATOR_VEL_ASPIRANDO: 0.55,  // anda mais devagar enquanto segura um fantasma
  VEL_ESQUIVA: 9,             // m/s durante a esquiva
  DURACAO_ESQUIVA: 0.22,      // s (invulnerável durante a esquiva)
  RECARGA_ESQUIVA: 1.2,       // s
  INVULNERAVEL: 1.2,          // s de invulnerabilidade depois de levar dano
  EMPURRAO: 6,                // m/s de recuo ao levar dano

  // lanterna / captura (teste vetorial no plano XZ)
  DIST_MIN: 0.8,              // m
  DIST_MAX: 7.5,              // m (= alcance da SpotLight)
  ANGULO_CONE: 28 * Math.PI / 180, // = ângulo da SpotLight
  TEMPO_PARA_ATORDOAR: 0.25,  // s de exposição contínua à luz
  DURACAO_ATORDOADO: 1.2,     // s que o fantasma continua atordoado depois de sair da luz
  TAXA_SUCCAO: 0.42,          // HP/s (fantasma comum tem 1,0 de HP ⇒ ≈ 2,4 s)
  BONUS_PUXAR: 1.6,           // multiplicador da sucção ao puxar no sentido oposto ao fantasma
  REGEN_HP: 0.08,             // HP/s recuperado quando não está atordoado
  HP_FANTASMA: 1.0,           // 100 %
  HP_CHEFE: 2.0,              // 200 %

  // fantasmas
  VEL_FANTASMA: 1.5,          // m/s perseguindo
  VEL_CHEFE: 1.9,
  FUGA: 1.0,                  // m/s tentando escapar do aspirador
  FUGA_CHEFE: 1.3,
  PUXAO: 0.7,                 // m/s com que o fantasma arrasta o zelador
  PUXAO_CHEFE: 1.2,
  VEL_RECUO: 2.4,             // m/s depois de atacar
  DURACAO_RECUO: 1.4,         // s
  DIST_TOQUE: 0.8,            // m — encostou no zelador
  DIST_TOQUE_CHEFE: 1.3,
  DANO: 20,                   // HP
  DANO_CHEFE: 30,
  LIMITE_SALA: 9.2,           // fantasmas ficam dentro de |x|, |z| ≤ 9,2 m

  // investida do Chefe
  INTERVALO_INVESTIDA: [3.5, 5.0], // s entre investidas (sorteado)
  PREPARO_INVESTIDA: 0.9,     // s tremendo antes de avançar (pode ser cancelado com a luz)
  DURACAO_INVESTIDA: 0.85,    // s
  VEL_INVESTIDA: 6.5,         // m/s (não pode ser atordoado durante a investida: é preciso desviar)

  // pontuação
  PONTOS_FANTASMA: 100,
  PONTOS_CHEFE: 300,
  PONTOS_GEMA: 50,
  CURA_GEMA: 15,              // HP
  DIST_COLETA: 0.9,           // m
  BONUS_POR_SEGUNDO: 10,
};

export const COS_CONE = Math.cos(REGRAS.ANGULO_CONE);

// Teste de mira da lanterna no plano XZ.
// F = (sen yaw, cos yaw) é a direção frontal do zelador (frente = +Z local),
// D = (G − Z) / |G − Z| é a direção unitária do zelador ao fantasma.
// O fantasma está no cone se DIST_MIN ≤ d ≤ DIST_MAX e F · D = cos θ ≥ cos 28°.
export function analisarMira(zx, zz, yaw, gx, gz) {
  const dx = gx - zx, dz = gz - zz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return { d: 0, cos: 1, dentro: false };
  const cos = (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / d;   // F · D
  const dentro = d >= REGRAS.DIST_MIN && d <= REGRAS.DIST_MAX && cos >= COS_CONE;
  return { d, cos, dentro };
}

// Segundos exibidos no cronômetro (arredondados para cima: "0:01" até acabar)
export const segundosExibidos = (t) => Math.max(0, Math.ceil(t - 1e-9));

export function formatarTempo(t) {
  const s = segundosExibidos(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Placar final. O bônus de tempo só existe na vitória (capturar o Chefe).
export function placarFinal({ capturas, chefe, gemas, tempoRestante, venceu }) {
  const R = REGRAS;
  const seg = venceu ? segundosExibidos(tempoRestante) : 0;
  const itens = [
    { rotulo: 'Fantasmas capturados', conta: `${capturas} × ${R.PONTOS_FANTASMA}`, valor: capturas * R.PONTOS_FANTASMA },
    { rotulo: 'Fantasma Chefe', conta: `${chefe ? 1 : 0} × ${R.PONTOS_CHEFE}`, valor: chefe ? R.PONTOS_CHEFE : 0 },
    { rotulo: 'Gemas coletadas', conta: `${gemas} × ${R.PONTOS_GEMA}`, valor: gemas * R.PONTOS_GEMA },
    { rotulo: 'Bônus de tempo', conta: `${seg} s × ${R.BONUS_POR_SEGUNDO}`, valor: seg * R.BONUS_POR_SEGUNDO },
  ];
  return { itens, total: itens.reduce((s, i) => s + i.valor, 0) };
}
