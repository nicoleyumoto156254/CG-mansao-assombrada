# Mansão Assombrada 3D — Jogabilidade, interação e pontuação (Entrega 05)

## Relatório de evolução (Entrega 04 → Entrega 05)

Até a entrega anterior, o projeto era uma **cena navegável**: o zelador andava e girava, o aspirador mudava de cor ao ser acionado e os fantasmas só flutuavam diante dos quadros. As regras do jogo estavam descritas no README, mas nenhuma estava implementada: não havia captura, dano, pontuação, cronômetro nem fim de partida.

Nesta entrega o projeto virou um **jogo completo**, do menu à tela de placar:

| Requisito | Onde está |
|---|---|
| **Controles e movimentação** | `W A S D` (movimento relativo à mira), mouse com Pointer Lock ou `Q E` (mira), clique/`Espaço` (aspirador), `Shift` (esquiva), `Esc` (pausa), `Enter` (começar/reiniciar). Movimento em [`Jogo.js` → `#moverZelador`](../js/Jogo.js). |
| **Ações do jogo** | iluminar (atordoar), aspirar, puxar, desviar e coletar gemas. |
| **Resposta dos controles** | movimento por `dt` (independente do FPS), animação de caminhada e do aspirador ligadas à entrada, reação imediata (som, partículas, HUD) a cada ação. |
| **Interações personagem × cenário** | quadros brilham e liberam os fantasmas; colisão do zelador com paredes e móveis; fantasmas atravessam móveis mas ficam dentro do salão; Chefe sobe do tapete central. |
| **Colisão / proximidade** | cone da lanterna (produto escalar), contato fantasma → zelador (distância), coleta de gemas (distância), separação entre fantasmas, colisão com paredes e móveis. |
| **Regras e consequências** | atordoamento, sucção com fuga e arrasto, regeneração de HP, dano com empurrão e invulnerabilidade, investida do Chefe, cronômetro. |
| **Pontuação visível** | placar no topo da tela (pontos, tempo, vida, fantasmas), barra de HP do alvo, mensagens de pontos (+100, +50…), placar detalhado no fim. |
| **Vitória / derrota / reinício** | vitória ao capturar os 4 fantasmas e o Chefe; derrota se o tempo ou a vida acabar; `Enter` ou clique reinicia. |

Arquivos novos: [`js/Jogo.js`](../js/Jogo.js), [`js/regras.js`](../js/regras.js), [`js/Particulas.js`](../js/Particulas.js), [`js/Hud.js`](../js/Hud.js), [`js/Som.js`](../js/Som.js), [`js/coordenadas.js`](../js/coordenadas.js) e [`audio/`](../audio/) (música de fundo opcional). Alterados: [`js/main.js`](../js/main.js) (entrada, integração e tremor de câmera), [`js/Fantasma.js`](../js/Fantasma.js) (expressões de atordoado/aspirado) e [`index.html`](../index.html) (HUD e telas).

---

## 1. Movimentação e controles

| Tecla | Ação |
|---|---|
| `Enter` / clique | começar, continuar (pausa) ou jogar de novo |
| `W A S D` / setas | mover (frente = direção da lanterna) |
| Mouse / `Q E` | mirar; o clique trava o cursor (Pointer Lock), então o giro não para na borda da tela |
| Clique / `Espaço` (segurar) | aspirador |
| `Shift` | esquiva: 0,22 s a 9 m/s, invulnerável; recarga de 1,2 s (indicada no HUD) |
| `Esc` | pausa (sair do Pointer Lock também pausa) |
| `M` / `I` | som on/off · ocultar painéis técnicos |
| `C` → topo / livre | controles relativos à **tela**: `W` leva para o alto da tela, `D` para a direita; o zelador **mira no cursor** (anel verde no chão); `Q E` giram manualmente até o mouse mexer de novo. Na livre: botão direito gira a câmera, roda = zoom |
| `B` | **modo Sandbox** (ver seção 5) |

**Vista do topo e câmera livre.** Na 3ª pessoa, "frente" é para onde o zelador olha, e a câmera está atrás dele. Nas outras câmeras isso confunde: vista de cima, W pode levar o personagem para baixo na tela; na órbita, a câmera pode estar de frente para ele, e aí W anda na direção do jogador. Por isso, nessas duas câmeras os controles seguem a **câmera**:

```
f = direção da câmera com y = 0, normalizada  frente na tela (topo: (0, 0, −1) = Norte)
r = f × cima = (−f.z, 0, f.x)                 direita na tela
mov = normalizar(f · (W − S) + r · (D − A))
NDC = (2·x/largura − 1, −2·y/altura + 1)      posição do cursor
raio = Raycaster.setFromCamera(NDC, câmera)
P = raio ∩ plano y = 1,14 m                altura do bocal
yaw = atan2(P.x − Z.x, P.z − Z.z)
```

O Pointer Lock só é usado na 3ª pessoa (no topo e na livre o cursor precisa aparecer). Na câmera livre o `OrbitControls` foi remapeado (botão esquerdo = aspirador, direito = girar, roda = zoom) e o centro da órbita é deslocado a cada quadro junto com o zelador, para a câmera acompanhá-lo.
A direção de movimento é calculada a partir do `yaw` do zelador:

```
frente  = (sen yaw, 0, cos yaw)
direita = (−cos yaw, 0, sen yaw)
dir     = normalizar(frente · (W − S) + direita · (D − A))
```

Cada quadro desloca `dir × 3,2 m/s × dt` (× 0,55 enquanto segura um fantasma), soma o empurrão do dano e o arrasto do fantasma, e passa pela mesma resolução de colisões das entregas anteriores (paredes como limites; móveis como círculos e caixas).

### Sistema de coordenadas do mapa

O Three.js usa **Y para cima** (+X Leste, +Y altura, +Z Sul). Para quem lê o HUD isso parecia "X, Z, Y": a altura do zelador aparecia no meio e andar para o Norte diminuía o último número. Por isso tudo o que é **exibido** (HUD, painel `H`, eixos globais com rótulos) usa o sistema cartesiano do mapa:

```
mapa  = (X, Y, Z) = (x, −z, y)     +X = Leste, +Y = Norte, +Z = altura
three = (x, y, z) = (X, Z, −Y)
```

É uma rotação de −90° em torno de X (os dois sistemas são destros). A lógica do jogo continua no sistema do Three.js, que é o que as câmeras, modelos e luzes usam; a conversão fica em [`coordenadas.js`](../js/coordenadas.js). Os eixos do `AxesHelper` foram girados com `Matrix4.makeBasis` para seguir o mesmo padrão (verde = Norte, azul = altura).

A **vista superior** mostra exatamente esse plano: o vetor `up` da câmera aponta para o Norte, então +X fica à direita e +Y para cima, e `W A S D` andam em +Y, −X, −Y e +X. A **câmera livre** começa no canto inferior esquerdo do mapa, (X, Y) = (−10, −10) (a 0,4 m das paredes e a 5,2 m de altura), e gira para acompanhar o zelador.

---

## 2. Interações e regras

### 2.1 Estados

```
Partida:   menu → jogando ⇄ pausa → vitoria | derrota → (Enter) jogando

Fantasma:  oculto → surgindo → cacando ⇄ recuando → capturado → contido
Chefe:     ... cacando → preparando → investida → cacando ...
```

`atordoado` é um temporizador paralelo: enquanto for positivo o fantasma não se move nem causa dano, e pode ser aspirado.

- **oculto → surgindo:** cada quadro brilha (emissivo pulsante) durante 1 s e libera seu fantasma aos 1 s (Norte), 3,5 s (Leste), 6 s (Sul) e 8,5 s (Oeste). O fantasma sai do centro da tela do quadro e cresce de 2 % a 100 % em 1,3 s.
- **cacando:** persegue o zelador a 1,5 m/s (Chefe 1,9 m/s) com uma ondulação lateral, descendo de 2,2 m até 1,25 m de altura ao se aproximar.
- **recuando:** depois de atacar, afasta-se a 2,4 m/s por 1,4 s.
- **capturado:** encolhe e voa até o bocal em 0,55 s; deixa uma gema.

### 2.2 Lanterna e captura (produto escalar)

A cada quadro, para cada fantasma ativo, no plano XZ ([`regras.js` → `analisarMira`](../js/regras.js)):

```
D = (G − Z) / |G − Z|        direção zelador → fantasma
F = (sen yaw, cos yaw)       direção da lanterna
no cone ⇔ 0,8 m ≤ |G − Z| ≤ 7,5 m  e  F · D ≥ cos 28°
```

O ângulo de 28° e o alcance de 7,5 m são os mesmos da `SpotLight`: o que o jogador vê iluminado é exatamente o que conta para a regra.

- 0,25 s seguidos no cone ⇒ **atordoado** por 1,2 s (renovado enquanto continuar no cone). Visual: sobrancelhas de susto, estrelas girando, corpo piscando em branco, luz do fantasma pulsando.
- Atordoado + no cone + aspirador ligado ⇒ HP cai 0,42/s (fantasma 1,0; Chefe 2,0). O fantasma **foge** em zigue-zague (1,0 m/s) e **arrasta** o zelador (0,7 m/s; Chefe 1,2 m/s). Se sair do cone, para de perder HP.
- **Puxar:** se o jogador anda para longe do fantasma (`dir · D < −0,5`), a sucção fica 1,6× mais rápida (o HUD mostra “puxando! ×1.6”).
- Fora do atordoamento, o fantasma regenera 0,08 HP/s.
- Lanterna desligada (tecla `4`) ⇒ nada é atordoado.

### 2.3 Contato e dano (proximidade)

Fantasma não atordoado a menos de 0,8 m do zelador (Chefe 1,3 m), sem invulnerabilidade nem esquiva ativa:

- −20 HP (Chefe −30), empurrão de 6 m/s para longe do fantasma;
- 1,2 s de invulnerabilidade (o zelador pisca), tremor de câmera, vinheta vermelha e som;
- o fantasma passa a **recuar**.

### 2.4 Fantasma Chefe

Desperta 1,6 s depois da 4ª captura, subindo do tapete central (2 s), com tremor de câmera e aviso na tela. Além de mais HP e dano, faz **investidas** a cada 3,5–5 s:

1. **preparando** (0,9 s): treme parado. Iluminá-lo agora **cancela** a investida.
2. **investida** (0,85 s): avança em linha reta a 6,5 m/s e **não pode ser atordoado** — é preciso desviar com `Shift`.

### 2.5 Coleta

Cada fantasma comum capturado deixa cair uma gema (octaedro emissivo na cor dele). Passar a menos de 0,9 m dá **+50 pontos e +15 HP** (máx. 100).

### 2.6 Partículas e desempenho

- A sucção usa um único `THREE.Points` com 420 partículas pré-alocadas (sem criar objetos durante o jogo); cada uma percorre uma espiral que se fecha no bocal.
- As `PointLight` dos fantasmas **nunca são removidas nem escondidas** durante a partida: só a intensidade vai a zero. Mudar a quantidade de luzes faria o WebGL recompilar todos os shaders (travada perceptível).

---

## 3. Pontuação

| Evento | Pontos |
|---|---|
| Fantasma capturado | +100 |
| Fantasma Chefe capturado | +300 |
| Gema coletada | +50 (e +15 HP) |
| Bônus de vitória | segundos restantes × 10 |

O HUD mostra, durante a partida: pontos, cronômetro (vermelho e piscando nos últimos 10 s, com tique-taque), barra de vida, ícones dos fantasmas (apagado = no quadro, contorno aceso = solto, preenchido = capturado), recarga da esquiva e, durante a sucção, nome e HP do alvo. O recorde fica salvo no navegador (`localStorage`).

---

## 4. Objetivo e conclusão

- **Vitória:** capturar os 4 fantasmas e o Chefe com tempo e vida restantes. O cronômetro congela na captura do Chefe e a tela de vitória aparece após a animação.
- **Derrota:** tempo chega a 0:00 ou vida chega a 0, cada um com sua mensagem.
- **Tela final:** placar detalhado (capturas, Chefe, gemas, bônus, total) e recorde; `Enter` ou clique reinicia tudo (posições, fantasmas, gemas, partículas, tempo, vida e pontos).

---

## 5. Modo Sandbox (demonstração)

Tecla `B` no menu, na pausa ou na tela final. É a mesma partida, com as regras de fim desligadas, para apresentar a cena e as mecânicas sem pressa:

- cronômetro parado (o HUD mostra **∞** e a etiqueta **SANDBOX**);
- os fantasmas continuam acertando o zelador (empurrão, tremor e vinheta), mas a vida não diminui;
- não há vitória nem derrota; fantasmas capturados voltam ao quadro 4 s depois;
- `J` chama o Chefe a qualquer momento; `F` congela o movimento dos fantasmas (bom para mostrar a modelagem com `H`, o `U` da grade UV e as luzes `1–5`);
- `Esc` → `Backspace` volta ao menu.

Implementação: flag `sandbox` em [`Jogo.js`](../js/Jogo.js), verificada em quatro pontos (cronômetro, dano, fim de jogo e captura do Chefe), mais o reaparecimento no estado `contido`.

---

## 6. Roteiro do vídeo (≈ 3 min)

Sugestão: gravar em 1920 × 1080, com `I` para ocultar os painéis técnicos (manter só o placar). Vale mostrar uma captura na vista do topo (`C`), com a mira seguindo o cursor.

1. **Menu (0:00–0:15).** Mostrar a tela inicial com objetivo, controles e pontuação. `Enter`.
2. **Controles (0:15–0:35).** Andar com `W A S D`, mirar com o mouse, ligar o aspirador no vazio, usar a esquiva (`Shift`) e mostrar a recarga no HUD.
3. **Surgimento (0:35–0:45).** O quadro Norte brilha e libera o fantasma.
4. **Captura (0:45–1:10).** Iluminar → estrelas/rosto assustado → aspirar → partículas e barra de HP → **puxar para trás** (“×1.6”) → captura e **+100** no placar.
5. **Dano (1:10–1:25).** Deixar um fantasma encostar: vinheta vermelha, tremor, −20 de vida, empurrão, zelador piscando.
6. **Coleta (1:25–1:35).** Pegar uma gema: +50 pontos e a barra de vida subindo.
7. **Chefe (1:35–2:15).** Despertar no tapete; uma investida desviada com `Shift`; uma investida cancelada com a lanterna; captura (+300).
8. **Vitória (2:15–2:30).** Placar detalhado com o bônus de tempo. `Enter` para reiniciar.
9. **Derrota (2:30–2:50).** Nova partida, ficar parado até a vida zerar (ou esperar o tempo): tela de fim de jogo e reinício.
10. **(Opcional) Técnica no Sandbox (2:50–3:20).** `B` para o Sandbox, `F` para congelar os fantasmas e então `H` (eixos e colisores), `U` (grade UV), `1–5` (luzes) e `C` (as três câmeras, com os controles seguindo a tela no topo e na livre).
