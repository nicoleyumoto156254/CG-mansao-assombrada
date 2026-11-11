# Mansão Assombrada 3D — Texturas e Materiais (Entrega 04)

## Relatório de evolução (Entrega 02 → Entrega 04)

Na entrega anterior o cenário já usava texturas procedurais (Canvas 2D), mas havia três lacunas em relação a esta etapa:

- **Personagens quase sem textura.** O Fantasma era só cor sólida. No Zelador, só detalhes pequenos tinham textura (emblema, manômetro, mangueira); macacão, camisa e botas eram cores lisas.
- **Nenhuma forma de mostrar as coordenadas UV** nem de verificar se havia distorção.
- **Nenhum arquivo de imagem.** As texturas só existiam em memória, durante a execução.

Nesta entrega:

| Requisito | Onde está |
|---|---|
| **Pelo menos 3 texturas** | 24 imagens de cor/alfa + 12 mapas de relevo, todas em [`texturas/`](../texturas/) (tabela abaixo). |
| **Texturas em personagens e cenário** | Zelador: `jeans`, `flanela`, `couro` (novas). Fantasmas e Chefe: `ectoplasma` (nova). Cenário: piso, papel de parede, lambril, teto, tapete, molduras, quadros, placas, relógio e teias. |
| **Texturas coerentes com o jogo** | Mansão vitoriana à noite: madeira envelhecida, papel adamascado, ouro gasto, pinturas góticas; zelador de macacão jeans e camisa de flanela; fantasmas com volutas de ectoplasma. |
| **Coordenadas UV** | Tecla **U** (grade UV sobre todas as superfícies) e layouts UV em [`capturas/entrega4/uv_*.png`](../capturas/entrega4/). |
| **Sem distorção** | Repetição proporcional ao tamanho real no cenário; **UV em metros** (`uvEmMetros`) nos personagens e nas molduras. |
| **Luzes da entrega anterior** | As 5 luzes continuam, com as mesmas teclas **1–5**. |
| **Iluminação × textura** | Materiais PBR (`MeshStandardMaterial` / `MeshPhysicalMaterial`) + **mapas de relevo** (bump map), que a tecla **R** liga e desliga. |
| **Arquivos de imagem** | [`texturas/*.png`](../texturas/): exatamente as imagens usadas pelo jogo, exportadas com a tecla **X**. |

---

## 1. Texturas utilizadas

Todas as texturas são **geradas por código** em [`js/texturas.js`](../js/texturas.js) (Canvas 2D → `THREE.CanvasTexture`), com sementes pseudoaleatórias fixas: a imagem é a mesma a cada execução. Nenhuma imagem externa é baixada. Os PNGs em `texturas/` são essas mesmas imagens, salvas pela tecla **X**; o nome do arquivo é o `texture.name` definido no código.

| Arquivo (`texturas/`) | Tamanho | Aplicada em | Uso no material |
|---|---|---|---|
| `piso.png` | 1024² | piso do salão | `map` + `bumpMap` |
| `papel_parede.png` | 512 × 1024 | parte superior das 4 paredes | `map` + `bumpMap` |
| `lambril.png` | 512 × 256 | parte inferior das paredes | `map` + `bumpMap` |
| `teto.png` | 512² | teto | `map` + `bumpMap` |
| `tapete.png` | 1024² | tapete central (rosa dos ventos) | `map` (com alfa) |
| `moldura.png` | 512 × 128 | molduras dos 4 quadros | `map` + `bumpMap` |
| `quadro_conde.png`, `quadro_floresta.png`, `quadro_memento_mori.png`, `quadro_castelo.png` | 512 × 640 | telas dos quadros N/L/S/O | `map` + `bumpMap` |
| `placa_*.png` (4) | 512 × 96 | placas com o título dos quadros | `map` |
| `mostrador_relogio.png` | 256² | relógio de pêndulo | `map` |
| `teia.png` | 512² | teias nos cantos do teto | `map` (com alfa) |
| **`jeans.png`** (nova) | 256² | Zelador: pernas, macacão, peitilho, alças, bolso | `map` + `bumpMap` |
| **`flanela.png`** (nova) | 256² | Zelador: camisa (peito, ombros, braços) | `map` + `bumpMap` |
| **`couro.png`** (nova) | 256² | Zelador: botas, cinto, faixa do boné | `map` + `bumpMap` |
| `emblema_bone.png` | 128² | Zelador: emblema do boné | `map` |
| `manometro.png` | 128² | Zelador: mostrador do manômetro | `map` |
| `mangueira_corrugada.png` | 64² | Zelador: mangueira do aspirador | `map` |
| `cone_lanterna_alfa.png` | 4 × 256 | cone volumétrico da lanterna | `alphaMap` |
| **`ectoplasma.png`** (nova) | 256² | 4 Fantasmas + Chefe: corpo, cauda, braços | `map` + `emissiveMap` |
| `*_relevo.png` (12) | iguais às de origem | mesmas superfícies acima | `bumpMap` |
| `grade_uv.png` | 1024² | modo de inspeção (tecla **U**) | `map` |

As texturas novas dos personagens são **ladrilháveis**: tudo o que cruza uma borda é redesenhado do lado oposto (função `emLaco`), então a emenda não aparece ao repetir.

A `ectoplasma.png` é em tons de cinza. O material multiplica a imagem pela cor de cada fantasma, então **uma única imagem** serve para os cinco (verde, azul, roxo, laranja e o Chefe vermelho).

Capturas: [`02_zelador_texturas.png`](../capturas/entrega4/02_zelador_texturas.png), [`03_fantasma_texturas.png`](../capturas/entrega4/03_fantasma_texturas.png), [`04_quadro_moldura.png`](../capturas/entrega4/04_quadro_moldura.png), [`01_visao_geral.png`](../capturas/entrega4/01_visao_geral.png).

---

## 2. Mapeamento de texturas (coordenadas UV)

### 2.1 Como a imagem chega à superfície

Cada vértice tem uma coordenada de textura `(u, v)`. O `(0, 0)` é o canto inferior esquerdo da imagem e o `(1, 1)` é o canto superior direito. As geometrias do Three.js já geram UVs no intervalo [0, 1] **por superfície**:

| Geometria | u | v |
|---|---|---|
| `PlaneGeometry` | largura | altura |
| `BoxGeometry` | uma imagem inteira **por face** | uma imagem inteira **por face** |
| `CylinderGeometry` / `ConeGeometry` | volta (0 → 360°) | altura; as tampas usam projeção planar |
| `SphereGeometry` | longitude | latitude |
| `LatheGeometry` | volta | índice do ponto do perfil |
| `TubeGeometry` | comprimento da curva | volta ao redor do tubo |

O shader ainda transforma a UV pela matriz da textura, montada a partir de `repeat`, `offset`, `rotation` e `center`. Com `wrapS/wrapT = RepeatWrapping`, valores acima de 1 repetem a imagem.

### 2.2 Cenário: repetição proporcional ao tamanho real

A textura só fica sem distorção se a área coberta por um ladrilho tiver a mesma proporção da imagem. Por isso o `repeat` de cada superfície é calculado a partir das dimensões reais, e não escolhido "no olho":

| Superfície | Dimensões | `repeat` | 1 ladrilho cobre | Imagem |
|---|---|---|---|---|
| Piso | 20 × 20 m | 6 × 6 | 3,33 × 3,33 m (1:1) | 1024 × 1024 (1:1) |
| Papel de parede | 20 × 4,8 m | 20/1,6 × 4,8/3,2 | 1,6 × 3,2 m (1:2) | 512 × 1024 (1:2) |
| Lambril | 20 × 1,2 m | round(20/2,5) × 1 | 2,5 × 1,2 m (≈2:1) | 512 × 256 (2:1) |
| Tela do quadro | 2,2 × 2,75 m | 1 × 1 | 2,2 × 2,75 m (0,8) | 512 × 640 (0,8) |
| Placa do título | 1,05 × 0,2 m | 1 × 1 | (5,25:1) | 512 × 96 (5,3:1) |

### 2.3 Personagens e molduras: UV em metros

Nos personagens, o mesmo tecido cobre peças de tamanhos muito diferentes: uma coxa (Ø 17 cm), um braço (Ø 12 cm), um peitilho (caixa de 25 × 22 cm). Com a UV padrão em [0, 1], cada peça receberia a imagem inteira, e a trama ficaria esticada numa e comprimida em outra.

A função **`uvEmMetros(geometria)`** ([`js/texturas.js`](../js/texturas.js)) reescala as UVs para que **1 unidade de UV = 1 metro medido sobre a superfície**:

- **cilindro e cone:** `u × (raio × ângulo)`, `v × altura`; nas tampas, `u, v × diâmetro`;
- **esfera:** `u × (raio × φ)`, `v × (raio × θ)`;
- **caixa:** cada face é escalada pelas duas dimensões que ela realmente tem (o eixo é identificado pela normal do vértice);
- **torno (`LatheGeometry`):** `u` × circunferência. O `v` é **recalculado pelo comprimento de arco do perfil**, porque o Three.js usa o índice do ponto, que não é proporcional à distância.

Depois disso basta `repeat = 1 / tamanho_do_ladrilho` (função `porMetro`), e todas as peças mostram a trama na mesma escala (densidade de texels uniforme):

| Textura | 1 ladrilho = | Onde |
|---|---|---|
| `jeans` | 12 cm | `Zelador.js` |
| `flanela` | 20 cm | `Zelador.js` |
| `couro` | 10 cm | `Zelador.js` |
| `ectoplasma` | 40 cm | `Fantasma.js` |
| `moldura` | 0,96 × 0,24 m (imagem 4:1) | `Sala.js` |

**Correção encontrada pelos layouts UV:** nas molduras, a `BoxGeometry` dava a imagem inteira para cada face. Com `repeat = 3`, as laterais de 14 cm de espessura recebiam três frisos espremidos. Com UV em metros, cada face mostra o friso no tamanho real. Nas barras verticais, a textura gira 90° (`rotation` + `center`) para o friso seguir o comprimento.

### 2.4 Como as UVs são apresentadas

**Tecla U — grade UV.** Troca o `map` de todos os materiais pela `grade_uv.png`, mantendo o `repeat`, o `offset` e a `rotation` de cada um:

- a **cor** da célula codifica a coordenada: o vermelho cresce com `u` e o verde cresce com `v`;
- o **rótulo** A1…H8 dá a posição: a letra é a coluna (`u`) e o número é a linha (`v`, contando de baixo);
- **texto espelhado** indicaria UV invertida;
- o `repeat` da grade é multiplicado pela proporção da imagem original (o papel de parede é 1:2). Assim, **células quadradas na tela = textura sem distorção**.

Capturas: [`05_grade_uv_geral.png`](../capturas/entrega4/05_grade_uv_geral.png), [`06_grade_uv_zelador.png`](../capturas/entrega4/06_grade_uv_zelador.png), [`07_grade_uv_fantasma.png`](../capturas/entrega4/07_grade_uv_fantasma.png), [`08_grade_uv_quadro.png`](../capturas/entrega4/08_grade_uv_quadro.png).

**Layouts UV.** São gerados por `layoutUV()` em [`js/inspecaoTexturas.js`](../js/inspecaoTexturas.js) e exportados junto com a tecla **X**. Cada imagem mostra:

- os triângulos da malha (amarelo) no espaço da textura, já com o `repeat` aplicado;
- por baixo, as cópias da imagem que aquela malha realmente recebe, cada ladrilho na proporção real da imagem.

| Arquivo | Malha |
|---|---|
| [`uv_piso.png`](../capturas/entrega4/uv_piso.png) | `PlaneGeometry`: 2 triângulos sobre 6 × 6 ladrilhos |
| [`uv_quadro_tela.png`](../capturas/entrega4/uv_quadro_tela.png) | `PlaneGeometry`: uma imagem inteira, sem repetição |
| [`uv_moldura_barra.png`](../capturas/entrega4/uv_moldura_barra.png) | `BoxGeometry` com UV em metros: a face frontal cobre ≈ 2,8 ladrilhos, e as laterais e o topo só uma fração |
| [`uv_zelador_coxa.png`](../capturas/entrega4/uv_zelador_coxa.png) | `CylinderGeometry` com UV em metros: a lateral é um retângulo de perímetro × altura, e as tampas são os discos |
| [`uv_fantasma_corpo.png`](../capturas/entrega4/uv_fantasma_corpo.png) | `LatheGeometry` com UV em metros: a circunferência em `u` e o perfil por comprimento de arco em `v` |

---

## 3. Integração com a iluminação

**Luzes mantidas.** As 5 luzes da Entrega 02 continuam, com as mesmas teclas **1–5**: ambiente, lustre, arandelas, lanterna e fantasmas.

**Materiais PBR.** No `MeshStandardMaterial`, a textura entra como **albedo** (`map`) e é multiplicada pela iluminação calculada para cada luz: difusa + especular, com `roughness` e `metalness` por material. Uma mesma imagem aparece, portanto, diferente sob cada fonte:

- avermelhada sob as velas;
- branca e com sombras sob a lanterna;
- tingida de verde, azul, roxo ou laranja perto de cada fantasma.

**Mapas de relevo (bump map).** `mapaRelevo()` gera, a partir da luminância de cada textura de cor, uma imagem em tons de cinza (`*_relevo.png`):

- as partes escuras (juntas do piso, frisos da moldura, vincos do couro, sulcos do lambril) viram "baixos";
- o shader inclina a normal de cada pixel pelo gradiente desse mapa;
- assim, a luz rasante cria brilho e sombra nos detalhes **sem acrescentar nenhum vértice**;
- o mapa herda o mesmo `repeat`, `offset` e `rotation` da textura de cor, para casar texel a texel.

| Material | `bumpScale` |
|---|---|
| piso, lambril, moldura | 2 |
| couro | 1,5 |
| papel de parede, teto, jeans | 1 |
| flanela | 0,6 |
| telas dos quadros (pinceladas e craquelado) | 0,5 |

A tecla **R** zera e restaura todos os `bumpScale` para comparar a mesma cena com e sem relevo.

**Fantasmas.** O `emissiveMap` faz as volutas do ectoplasma brilharem por conta própria, então os fantasmas continuam visíveis com todas as luzes apagadas. Ao mesmo tempo, a `PointLight` colorida de cada fantasma tinge as paredes e o piso texturizados próximos.

**Lanterna.** O cone volumétrico e a lente agora apagam junto com a `SpotLight` (tecla 4). Antes, o cone continuava visível com a luz desligada.

Capturas, todas com o mesmo enquadramento:

- [`09_luz_so_ambiente.png`](../capturas/entrega4/09_luz_so_ambiente.png): só a luz ambiente; quase nada aparece além do brilho dos fantasmas;
- [`10_luz_so_arandelas.png`](../capturas/entrega4/10_luz_so_arandelas.png): só as velas, que revelam o papel de parede perto de cada arandela;
- [`11_luz_so_lanterna.png`](../capturas/entrega4/11_luz_so_lanterna.png): só a lanterna, cujo cone mostra lambril, quadro e piso;
- [`12_luz_todas.png`](../capturas/entrega4/12_luz_todas.png): todas as luzes juntas;
- [`13_relevo_ligado.png`](../capturas/entrega4/13_relevo_ligado.png) × [`14_relevo_desligado.png`](../capturas/entrega4/14_relevo_desligado.png): com o relevo, os painéis do lambril ganham profundidade, a moldura mostra os frisos e as juntas do piso ficam marcadas; sem ele, as mesmas superfícies parecem pintadas.

---

## 4. Demonstração técnica

**Roteiro sugerido:**

1. Abrir o jogo e mostrar a visão geral em 3ª pessoa.
2. **C** até a câmera livre. Aproximar do Zelador (jeans, flanela xadrez, couro) e de um Fantasma (ectoplasma).
3. **U**: grade UV. Mostrar que as células são quadradas no piso, nas paredes, nos quadros e nos personagens, e que a trama tem o mesmo tamanho em todas as peças do Zelador. **U** de novo para voltar.
4. **1–5**: apagar todas as luzes e acender uma por vez, mostrando como cada uma ilumina as mesmas texturas.
5. Deixar só a lanterna (**4**), apontar para o lambril e o quadro e alternar **R** para comparar com e sem relevo.
6. **X**: baixar `texturas_mansao_assombrada.zip`, com as pastas `texturas/` e `capturas/entrega4/` (layouts UV). Os PNGs do zip são idênticos, byte a byte, aos do repositório.

**Arquivos alterados nesta entrega:**

| Arquivo | Mudança |
|---|---|
| `js/texturas.js` | Texturas novas: `jeans`, `flanela`, `couro`, `ectoplasma`, `grade_uv`. Funções `uvEmMetros`, `porMetro`, `mapaRelevo`, `materialTexturizado`, `copiarMapeamento`. Nome em cada textura. A textura da teia veio de `Sala.js` para cá. |
| `js/Zelador.js` | Jeans, flanela e couro com relevo; UV em metros nas peças texturizadas; boné com material próprio; cone da lanterna apaga com a luz. |
| `js/Fantasma.js` | Ectoplasma como `map` + `emissiveMap`, com UV em metros (incluindo o `LatheGeometry`). |
| `js/Sala.js` | Relevo no piso, teto, paredes, lambril, molduras e quadros; molduras com UV em metros. |
| `js/inspecaoTexturas.js` (novo) | Modo grade UV, liga/desliga do relevo, desenho dos layouts UV e exportação dos PNGs num `.zip`. |
| `js/main.js`, `index.html` | Teclas **U**, **R**, **X** e indicação das texturas no HUD. |
| `texturas/` (novo) | 37 PNGs: as imagens usadas como textura. |
| `capturas/entrega4/` (novo) | 14 capturas e 5 layouts UV. |

---

## Enunciado da entrega

> **Texturas e materiais**
>
> Aplicar texturas aos personagens, objetos e elementos do cenário, explorando os recursos de mapeamento de texturas na construção visual do jogo.
>
> O grupo deverá entregar:
>
> **Aplicação de múltiplas texturas**
> - Utilizar pelo menos três texturas diferentes no projeto.
> - Aplicar texturas em diferentes objetos da cena, incluindo personagens e elementos do cenário.
> - Demonstrar que as texturas estão corretamente mapeadas sobre as superfícies dos objetos.
> - As texturas devem ser coerentes com a proposta visual do jogo.
>
> **Mapeamento de texturas**
> - Apresentar as coordenadas de textura (coordenadas UV) utilizadas nos modelos.
> - Demonstrar o resultado do mapeamento nos objetos 3D.
> - Evitar aplicações em que a textura fique excessivamente distorcida ou não corresponda à geometria do objeto.
>
> **Integração com a iluminação**
> - Manter as fontes de luz implementadas na entrega anterior.
> - Demonstrar como a iluminação interage com os objetos texturizados.
> - Apresentar um resultado visual em que seja possível perceber tanto as texturas quanto os efeitos da iluminação.
>
> **Demonstração técnica**
> - Apresentar uma execução funcional do projeto.
> - Mostrar os diferentes objetos com suas respectivas texturas.
> - Entregar os arquivos-fonte atualizados e os arquivos de imagem utilizados como texturas, juntamente com um relatório comentando a evolução em comparação com a última entrega.
