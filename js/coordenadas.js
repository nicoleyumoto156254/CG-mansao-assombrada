// ============================================================================
// coordenadas.js — Conversão entre o sistema do Three.js (interno) e o sistema
// cartesiano do MAPA (exibido ao jogador: HUD, painel H e eixos globais).
//
//   Three.js (Y para cima)        Mapa (Z para cima)
//   +X = Leste                    +X = Leste  (direita na vista superior)
//   +Y = altura                   +Y = Norte  (para cima na vista superior)
//   +Z = Sul                      +Z = altura
//
//   mapa = (x, −z, y)        three = (X, Z, −Y)
//
// Os dois sistemas são destros; um é o outro girado −90° em torno do eixo X.
// Toda a lógica do jogo continua no sistema do Three.js (é o que o WebGL, as
// câmeras, os modelos e as luzes usam); a conversão só acontece na exibição.
// ============================================================================

export const paraMapa = (v) => ({ x: v.x, y: -v.z, z: v.y });
export const doMapa = (X, Y, Z = 0) => ({ x: X, y: Z, z: -Y });

// Ângulo da direção para onde o objeto olha, no mapa, em graus no sentido
// cartesiano: 0° = +X (Leste), 90° = +Y (Norte), 180° = Oeste, 270° = Sul.
// No Three.js a frente de um objeto com rotation.y = yaw é (sen yaw, 0, cos yaw);
// no mapa isso vira (sen yaw, −cos yaw).
export function anguloNoMapa(yaw) {
  const g = (Math.atan2(-Math.cos(yaw), Math.sin(yaw)) * 180) / Math.PI;
  return ((g % 360) + 360) % 360;
}

const CARDEAIS = ['L', 'NE', 'N', 'NO', 'O', 'SO', 'S', 'SE'];
export const pontoCardeal = (graus) => CARDEAIS[Math.round(graus / 45) % 8];
