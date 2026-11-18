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

**Jogo**

| Tecla | Ação |
|---|---|
| Enter / clique na tela | começar, continuar (pausa) ou jogar de novo |
| W A S D / setas | mover o zelador (com colisão nas paredes e móveis) |
| Mouse / Q E | girar o zelador (mira da lanterna); o clique trava o cursor (Pointer Lock) |
| Clique / Espaço (segurar) | aspirador: suga o fantasma atordoado que estiver no cone da lanterna |
| Shift | esquiva rápida (invulnerável por 0,22 s; recarga de 1,2 s) |
| Esc | pausa |
| C (topo e livre) | os controles passam a ser relativos à **tela**: W leva para o alto da tela, D para a direita; o zelador mira no cursor (anel verde no chão); Q/E giram manualmente até o mouse mexer de novo. Na câmera livre: botão direito gira a câmera, roda = zoom |
| B | **modo Sandbox** (do menu, da pausa ou do fim): sem cronômetro, sem perder vida e sem fim de jogo; fantasmas capturados voltam aos quadros |
| J / F (Sandbox) | chama o Fantasma Chefe / congela o movimento dos fantasmas |
| Backspace (pausa ou fim) | volta ao menu |
| M | liga/desliga o som |
| I | oculta/mostra os painéis técnicos (bom para gravar o vídeo) |

**Inspeção técnica (entregas anteriores)**

| Tecla | Ação |
|---|---|
| C | alterna câmera: 3ª pessoa → vista do topo → livre (órbita) |
| P | alterna o FOV da câmera: 60° / 100° / 30° |
| 1 – 5 | liga/desliga cada grupo de luz (ver [Iluminação](#iluminação)) |
| H | grade de 1 m, eixos (X vermelho = Leste, Y verde = Norte, Z azul = altura), colisores e tabela de posição/direção/escala no sistema do mapa |
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

Na **vista do topo** e na **câmera livre** a mira deixa de ser feita pelo giro do mouse: o cursor é convertido em coordenadas normalizadas (NDC), um `Raycaster` lança um raio da câmera por esse ponto e a interseção com o plano `y = 1,14 m` (altura do bocal) define o alvo; o zelador gira com `yaw = atan2(Δx, Δz)`. O movimento passa a ser relativo à câmera: a direção de visão projetada no chão é a "frente" e `frente × cima` é a "direita". Na câmera livre o centro da órbita acompanha o zelador.

### Interface e fontes

Logo e títulos em **Creepster**; placar, mensagens e botões em **Luckiest Guy** (reserva: **Bangers**), todas do Google Fonts (licença SIL OFL). O logo do menu é texto; para usar uma imagem própria, defina `LOGO_PNG` em [`js/Hud.js`](js/Hud.js).

### Iluminação

| Tecla | Luz | Tipo | Papel |
|---|---|---|---|
| 1 | Ambiente | `AmbientLight` violeta | visibilidade mínima das silhuetas |
| 2 | Lustre | `PointLight` âmbar, com sombra | iluminação principal |
| 3 | Arandelas (8) | `PointLight` laranja com cintilação | velas nas paredes |
| 4 | Lanterna | `SpotLight` com sombra | cone de luz do zelador; muda de tom ao aspirar |
| 5 | Fantasmas (4 + Chefe) | `PointLight` colorida | brilho de cada fantasma |

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

## Jogabilidade

Implementada em [`js/Jogo.js`](js/Jogo.js) (estados e regras) e [`js/regras.js`](js/regras.js) (constantes e cálculo vetorial do cone da lanterna). Detalhes e mapeamento dos requisitos em [Entrega 05](entregas/entrega5.md).

**Partida:** cada quadro brilha e libera seu fantasma (Norte em 1 s, Leste em 3,5 s, Sul em 6 s, Oeste em 8,5 s). Os fantasmas perseguem o zelador e descem até a altura dele ao se aproximar. Depois da 4ª captura, o **Fantasma Chefe** sobe do tapete central.

**Captura vetorial**, calculada no plano XZ a cada quadro:

- distância zelador → fantasma: `0,8 m ≤ d ≤ 7,5 m`;
- ângulo: `F · D = cos θ ≥ cos 28°`, com `F` a direção frontal do zelador e `D` a direção ao fantasma (ambos unitários);
- 0,25 s dentro do cone **atordoa** o fantasma (rosto assustado, estrelas, corpo piscando); ele fica atordoado por mais 1,2 s depois de sair da luz e não se move nem causa dano;
- com o aspirador ligado, o HP do fantasma atordoado cai 42 %/s (100 % no comum, 200 % no Chefe), com partículas fluindo até o bocal. Ele foge em zigue-zague e arrasta o zelador; **andar para longe dele** (`direção · D < −0,5`) multiplica a sucção por 1,6;
- sem estar atordoado, o fantasma recupera 8 %/s de HP.

**Vida do zelador:** 100 HP; um fantasma não atordoado que encosta nele (`d < 0,8 m`, Chefe `1,3 m`) tira 20 HP (Chefe 30), empurra o zelador e recua. Depois do dano há 1,2 s de invulnerabilidade (o zelador pisca).

**Chefe:** mais rápido e com investidas: treme por 0,9 s (a lanterna cancela a investida nesse momento) e avança a 6,5 m/s em linha reta, sem poder ser atordoado — é preciso **desviar** (Shift).

**Coleta:** cada fantasma capturado deixa cair uma **gema** da sua cor; passar por ela dá +50 pontos e +15 HP.

**Pontuação:** +100 por fantasma, +300 pelo Chefe, +50 por gema e bônus de `segundos restantes × 10` na vitória. O placar fica no topo da tela; o recorde é guardado no navegador.

**Fim de jogo:** vitória ao capturar os 4 fantasmas e o Chefe dentro dos 60 s; derrota se o tempo ou a vida acabar. A tela final mostra o placar detalhado; **Enter** reinicia.

**Áudio:** aspirador, surgimento, atordoamento, captura, dano, gema, investida, tique-taque nos últimos 10 s, vitória e derrota, todos sintetizados com a Web Audio API ([`js/Som.js`](js/Som.js)). Música de fundo opcional: coloque um arquivo em `audio/musica.mp3` (instruções e fontes de músicas liberadas em [`audio/LEIA-ME.md`](audio/LEIA-ME.md)).

## Estrutura

```
index.html          HUD + importmap do Three.js
js/main.js          renderizador, câmeras, projeção, luzes, entrada, colisões, laço principal
js/Jogo.js          jogabilidade: estados da partida, comportamento dos fantasmas, captura, dano, gemas, pontuação, vitória/derrota
js/coordenadas.js   conversão Three.js (Y para cima) ⇄ mapa (X Leste, Y Norte, Z altura)
js/regras.js        constantes do jogo, teste do cone (produto escalar) e placar final (sem Three.js)
js/Particulas.js    partículas de ectoplasma do fantasma até o bocal (THREE.Points)
js/Hud.js           placar, cronômetro, vida, alvo da sucção, mensagens e telas de menu/pausa/fim
js/Som.js           efeitos sonoros sintetizados (Web Audio API)
js/Sala.js          salão: piso, teto, paredes, quadros, porta, colunas, mobília, lustre, luzes
js/Zelador.js       personagem principal
js/Fantasma.js      inimigo reutilizável (4 instâncias + Chefe)
js/texturas.js      texturas procedurais (Canvas 2D), UV em metros e mapas de relevo
js/inspecaoTexturas.js  grade UV, liga/desliga do relevo, layouts UV e exportação (.zip)
texturas/           imagens usadas como textura (PNG exportado pela tecla X)
capturas/           capturas de tela por entrega (entrega2/: cena, câmeras e luzes; entrega4/: texturas, grade UV, relevo e layouts UV)
entregas/           relatórios de cada entrega
```

## Convenções espaciais

- 1 unidade = 1 metro; origem no centro do piso.
- **Sistema do mapa** (o que aparece no HUD, no painel H e nos eixos globais): **+X = Leste, +Y = Norte, +Z = altura**. A sala vai de −10 a +10 m em X e Y; o canto inferior esquerdo (sudoeste) é (−10, −10). Na vista superior, +X fica para a direita e +Y para cima. Direções em graus: 0° = Leste, 90° = Norte.
- **Sistema interno do Three.js** (usado no código): +X = Leste, +Y = cima, +Z = Sul (o tapete central tem uma rosa dos ventos alinhada aos eixos). Conversão em [`js/coordenadas.js`](js/coordenadas.js): `mapa = (x, −z, y)`. Os dois sistemas são destros: um é o outro girado −90° em torno de X.
- Personagens e móveis têm a origem no chão e a frente no +Z local; a orientação vem só de `rotation.y` (ou `lookAt`).
- Escalas de referência: zelador 1,86 m · porta 2,6 m · pé-direito 6 m · quadros 2,7 × 3,2 m · fantasma 1,3 m (Chefe 2,6 m).

## Entregas

- [Entrega 02 — Câmeras, perspectiva e iluminação](entregas/entrega2.md)
- [Entrega 04 — Texturas e materiais](entregas/entrega4.md)
- [Entrega 05 — Jogabilidade, interação e pontuação](entregas/entrega5.md)
