# Mansão Assombrada 3D

Jogo 3D para navegador desenvolvido para a disciplina de **Computação Gráfica** (2026-2), com **Three.js r186 (WebGL)**.

**Equipe**

- Dante Tsubono — 163667
- Otávio Novais — 163962
- Nicole Yumoto — 156254

## Conceito

Releitura simplificada inspirada na franquia *Luigi's Mansion*. O jogador controla um **zelador noturno** equipado com uma lanterna e um aspirador de ectoplasma. Num salão vitoriano fechado há **4 quadros amaldiçoados** (Norte, Sul, Leste e Oeste); de cada um sai um fantasma que flutua em direção ao jogador para atacá-lo. Depois de capturar os 4, o **Fantasma Chefe** desperta no centro do salão.

O objetivo é **iluminar (atordoar) e aspirar** os 4 fantasmas e o Chefe antes que o cronômetro de 60 s chegue a zero ou que a vida do zelador acabe.

| Pilar | Decisão |
|---|---|
| Ambiente | Sala única (salão 20 × 20 × 6 m) com iluminação dinâmica |
| Inimigos | Uma classe composta (`Fantasma`) instanciada 4× com cores distintas + Chefe em escala 2× e com o dobro de HP |
| Interação | Captura e dano por distância euclidiana e produto escalar, sem motor de física |

## Como executar

Módulos ES não abrem via `file://`; é preciso um servidor local (e internet para baixar o Three.js do CDN). Na raiz do repositório:

```bash
python -m http.server 8000
# abrir http://localhost:8000
```

Alternativas: extensão **Live Server** do VS Code ou `npx serve .`

## Controles

| Tecla | Ação |
|---|---|
| W A S D / setas | mover o zelador (com colisão nas paredes e móveis) |
| Mouse / Q E | girar o zelador (mira da lanterna) |
| Clique / Espaço | liga o aspirador (turbina, núcleo e luz mudam de tom) |
| C | alterna câmera: 3ª pessoa → vista do topo → livre (órbita) |
| P | alterna o FOV da câmera: 60° / 100° / 30° |
| 1 – 5 | liga/desliga cada grupo de luz (ver [Iluminação](#iluminação)) |
| H | grade de 1 m, eixos globais e locais, colisores e tabela de posição/rotação/escala |
| B | mostra/oculta o Fantasma Chefe no centro do salão |
| U | grade UV: mostra as coordenadas de textura de todas as superfícies |
| R | liga/desliga os mapas de relevo (bump map) |
| X | baixa um `.zip` com os PNGs das texturas usadas e os layouts UV |

## Técnicas de Computação Gráfica

### Modelagem hierárquica

Personagens montados como hierarquias de `THREE.Group` com primitivas (`Cylinder`, `Sphere`, `Box`, `Torus`, `Lathe`, `Tube`) e animações locais independentes.

- **Zelador** (`js/Zelador.js`): pernas articuladas com botas, torso com macacão, cinto e molho de chaves que balança, cabeça com olhos, sobrancelhas móveis e bigode, boné, e o aspirador nas costas (tanque com núcleo de ectoplasma pulsante, manômetro, escapamentos, mangueira em `TubeGeometry` e bocal com turbina giratória e lanterna acoplada).
- **Fantasma** (`js/Fantasma.js`): corpo em dupla camada (casca translúcida em `LatheGeometry` + núcleo brilhante), cauda de 10 pontas em onda senoidal, orbes orbitantes, rosto reativo e braços articulados com algemas e correntes. O **Chefe** é a mesma classe com `scale.set(2, 2, 2)` e cor vermelha.

### Câmeras e projeção perspectiva

`THREE.PerspectiveCamera` (FOV 60°, near 0,1, far 100). Três modos, alternados com **C**:

- **3ª pessoa** — atrás e acima do ombro do zelador, seguindo-o com interpolação suave (`lerp`).
- **Vista do topo** — 21 m acima, olhando para o centro do salão.
- **Livre** — órbita (`OrbitControls`) para inspecionar a cena.

A matriz de projeção é definida no construtor, recalculada por `updateProjectionMatrix()` (redimensionamento e troca de FOV com **P**) e aplicada em `renderer.render(scene, camera)`.

### Iluminação

| Tecla | Luz | Tipo | Papel |
|---|---|---|---|
| 1 | Ambiente | `AmbientLight` violeta | visibilidade mínima das silhuetas |
| 2 | Lustre | `PointLight` âmbar, com sombra | iluminação principal |
| 3 | Arandelas (8) | `PointLight` laranja com cintilação | velas nas paredes |
| 4 | Lanterna | `SpotLight` com sombra | cone de luz do zelador; muda de tom ao aspirar |
| 5 | Fantasmas (4) | `PointLight` colorida | brilho de cada fantasma |

Sombras com `PCFShadowMap` (no r186 o PCF já é filtrado), tone mapping ACES e neblina exponencial.

### Texturas e mapeamento UV

Nenhuma imagem externa é carregada: todas as texturas são geradas em tempo de execução com Canvas 2D (`THREE.CanvasTexture`, em `js/texturas.js`), com sementes fixas. As mesmas imagens estão salvas em [`texturas/`](texturas/), exportadas pela tecla **X**.

- **Cenário:** piso de tábuas envelhecidas, papel de parede vitoriano, lambril, teto, tapete, molduras douradas, placas, relógio, teias e os quatro quadros. Em cada superfície, o `repeat` é calculado pelas dimensões reais, para manter a proporção da imagem.
- **Personagens:** o Zelador usa jeans, flanela xadrez e couro; os Fantasmas usam ectoplasma (uma imagem em tons de cinza multiplicada pela cor de cada um e usada também como `emissiveMap`).
- **UV em metros:** `uvEmMetros()` reescala as UVs de cilindros, cones, esferas, caixas e tornos para que 1 unidade de UV = 1 m de superfície. Assim, a trama tem o mesmo tamanho em todas as peças, sem esticar.
- **Relevo:** `mapaRelevo()` gera um bump map a partir da luminância de cada textura (juntas, frisos, vincos), que reage à lanterna e às velas sem adicionar vértices.
- **Inspeção:** a tecla **U** troca as texturas por uma grade UV rotulada (células quadradas = sem distorção), e `js/inspecaoTexturas.js` desenha os layouts UV das malhas.

| Parede | Quadro |
|---|---|
| Norte | I. O Conde Sombrio |
| Leste | II. Floresta da Lua Cheia |
| Sul | III. Memento Mori |
| Oeste | IV. Castelo da Tempestade |

## Jogabilidade (planejada)

As regras abaixo fazem parte do projeto do jogo e **ainda não estão implementadas** no código atual.

**Captura vetorial**, calculada no plano XZ a cada quadro:

- distância zelador → fantasma: `0,8 m ≤ d ≤ 7,5 m`;
- ângulo: `F · D = cos θ ≥ cos 28°`, com `F` a direção frontal do zelador e `D` a direção ao fantasma (ambos unitários);
- fantasma dentro do cone fica atordoado; com o aspirador ligado, seu HP cai de 100% a 0% (200% no Chefe), com partículas fluindo para o bocal.

**Vida do zelador:** 100 HP; perde vida quando um fantasma não contido encosta nele (`d < 0,8 m`).

**Pontuação:** +100 por fantasma comum, +300 pelo Chefe e bônus de `segundos restantes × 10` ao capturar o Chefe.

**Fim de jogo:** vitória ao capturar os 4 fantasmas e o Chefe dentro dos 60 s com vida acima de zero (placar com capturas, bônus e total); derrota se o tempo ou a vida acabar, com opção de reiniciar.

**Áudio:** sons do aspirador, alertas, captura e dano sintetizados com a Web Audio API.

## Estrutura

```
index.html          HUD + importmap do Three.js
js/main.js          renderizador, câmeras, projeção, luzes, entrada, colisões, laço principal
js/Sala.js          salão: piso, teto, paredes, quadros, porta, colunas, mobília, lustre, luzes
js/Zelador.js       personagem principal
js/Fantasma.js      inimigo reutilizável (4 instâncias + Chefe)
js/texturas.js      texturas procedurais (Canvas 2D), UV em metros e mapas de relevo
js/inspecaoTexturas.js  grade UV, liga/desliga do relevo, layouts UV e exportação (.zip)
texturas/           imagens usadas como textura (PNG exportado pela tecla X)
capturas/           capturas de tela (entrega4/: texturas, grade UV, luzes, relevo e layouts UV)
entregas/           relatórios de cada entrega
```

## Convenções espaciais

- 1 unidade = 1 metro; origem no centro do piso.
- +X = Leste, −Z = Norte, +Y = cima (o tapete central tem uma rosa dos ventos alinhada aos eixos).
- Personagens e móveis têm a origem no chão e a frente no +Z local; a orientação vem só de `rotation.y` (ou `lookAt`).
- Escalas de referência: zelador 1,86 m · porta 2,6 m · pé-direito 6 m · quadros 2,7 × 3,2 m · fantasma 1,3 m (Chefe 2,6 m).

## Entregas

- [Entrega 02 — Câmeras, perspectiva e iluminação](entregas/entrega2.md)
- [Entrega 04 — Texturas e materiais](entregas/entrega4.md)
