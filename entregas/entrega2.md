# Mansão Assombrada 3D — Câmeras, Perspectiva e Iluminação (Entrega 02)

## Relatório de evolução (Entrega 01 → Entrega 02)

A Entrega 01 já continha a cena (salão, Zelador, 4 Fantasmas, Chefe), três câmeras e várias luzes, mas sem como inspecionar a contribuição de cada luz e sem a projeção documentada. Nesta entrega:

| Requisito | Onde está |
|---|---|
| **Cena 3D integrada** | `main.js` monta `criarSala()` + `Zelador` + 4 `Fantasma` + Chefe (tecla B). Cenário de salão de mansão coerente com o jogo. |
| **Múltiplas câmeras** | `main.js` (`definirModo`): **3ª pessoa** (segue o zelador), **vista do topo** (21 m acima) e **livre/órbita**. Tecla **C** alterna; o HUD mostra a câmera ativa. |
| **Projeção perspectiva** | `main.js`, bloco "PROJEÇÃO PERSPECTIVA": `THREE.PerspectiveCamera(fov, aspecto, near, far)` **define** a matriz; `camera.updateProjectionMatrix()` a **recalcula** (resize e troca de FOV); `renderer.render(scene, camera)` a **aplica** (`projectionMatrix * viewMatrix * modelMatrix`). Tecla **P** alterna o FOV 60° / 100° / 30°, tornando o efeito sobre objetos próximos e distantes bem visível (colunas, quadros e fantasmas). |
| **Múltiplas luzes** | 5 grupos, ligados/desligados individualmente pelas teclas **1–5** (estado no HUD inferior direito): |

| Tecla | Luz | Tipo | Papel na cena |
|---|---|---|---|
| 1 | Ambiente | `AmbientLight` violeta | só revela silhuetas, atmosfera noturna |
| 2 | Lustre | `PointLight` âmbar, com sombra | iluminação principal do salão |
| 3 | Arandelas (8) | `PointLight` laranja, com cintilação | velas nas paredes, ao lado dos quadros |
| 4 | Lanterna | `SpotLight` com sombra | cone de luz do zelador, segue a mira |
| 5 | Fantasmas (4) | `PointLight` colorida | brilho verde/azul/roxo/laranja de cada fantasma |

**Roteiro de demonstração:** (1) andar pelo salão; (2) pressionar **C** três vezes e mostrar os pontos de vista; (3) pressionar **P** perto de uma coluna e comparar a distorção; (4) apagar todas as luzes (1–5) e acender uma de cada vez para mostrar sua contribuição isolada.

Arquivos alterados: `main.js` (FOV, controle de luzes, comentários da projeção), `Sala.js` (expõe `sala.luzes`), `index.html` (HUD de luzes e FOV).

---

## Entrega 01 — Cena inicial

Tecnologia: **Three.js r186 (WebGL)**, carregado via CDN (jsDelivr) com `importmap`.
Nenhum modelo ou imagem externa: todas as malhas são primitivas do Three.js e todas as texturas são geradas em tempo de execução com Canvas 2D (`THREE.CanvasTexture`).

## Como executar

Módulos ES não abrem via `file://`, então é preciso um servidor local (e internet para baixar o Three.js do CDN):

```bash
cd mansao-assombrada
python -m http.server 8000
# abrir http://localhost:8000
```

Alternativas: extensão **Live Server** do VS Code, ou `npx serve .`

## Controles

| Tecla | Ação |
|---|---|
| W A S D / setas | mover o zelador (com colisão nas paredes e móveis) |
| Mouse (mover) / Q E | girar o zelador (mira da lanterna) |
| Clique / Espaço | aspirador ligado (turbina, núcleo e luz mudam de tom) |
| C | alterna câmera: 3ª pessoa → vista do topo → livre (órbita) |
| H | mostra grade de 1 m, eixos globais, eixos locais dos personagens, contorno dos colisores e tabela de posição/rotação/escala |
| B | prévia do Fantasma Chefe (mesma classe, escala 2×) no centro |
| 1 2 3 4 5 | liga/desliga: ambiente, lustre, arandelas, lanterna, fantasmas |
| P | alterna o FOV da projeção perspectiva: 60° → 100° → 30° |

## Estrutura

```
index.html        HUD + importmap
js/main.js        renderer, câmeras, entrada, colisões, laço principal
js/Sala.js        salão 20 × 20 × 6 m: piso, teto, paredes, quadros, porta, colunas, mobília, lustre, luzes
js/Zelador.js     personagem principal (hierarquia de THREE.Group)
js/Fantasma.js    inimigo reutilizável (4 instâncias + Chefe)
js/texturas.js    todas as texturas procedurais (Canvas 2D)
capturas/         screenshots da entrega
```

## Convenções espaciais

- 1 unidade = 1 metro. Origem no centro do piso.
- +X = Leste, −Z = Norte, +Y = cima (o tapete central tem uma rosa dos ventos N/S/L/O alinhada aos eixos).
- Todo personagem/móvel tem a origem no chão e a frente no eixo +Z local; a orientação é dada só por `rotation.y` (ou `lookAt`).
- Escalas de referência: zelador 1,86 m · porta 2,6 m · pé-direito 6 m · quadros 2,7 × 3,2 m · fantasma 1,3 m (Chefe 2,6 m).
