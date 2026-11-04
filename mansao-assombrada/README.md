# Mansão Assombrada 3D — Cena Inicial (Entrega 01)

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
