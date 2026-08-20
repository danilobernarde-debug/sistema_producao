---
name: frontend-design-system
description: >-
  Linguagem visual e componentes de UI reutilizáveis compartilhados entre os sistemas
  frontend da empresa do Danilo — tokens de CSS, vocabulário de classes globais num único
  index.css, e componentes genéricos (tabela CRUD, select pesquisável, modal, campo dinâmico
  por tipo). Use ao montar o CSS de um sistema novo, ao criar uma tela de lista/formulário
  de cadastro, ou quando o usuário perguntar como manter a cara de um sistema novo parecida
  com os existentes. Não cobre estrutura de pastas/rotas (ver frontend-stack-pattern).
---

# Design system — sistemas frontend da empresa

Um `index.css` global por sistema, sem CSS-in-JS, sem Tailwind, sem styled-components — classe utilitária reaproveitada entre telas, `style={}` inline só pra ajuste específico de uma tela. Isso mantém qualquer tela colável de um sistema pro outro sem trocar de paradigma de estilo no meio do caminho.

## Tokens (`:root`)

Reaproveite o **nome** da variável entre sistemas — o valor hex pode mudar pra dar identidade própria a cada sistema, mas o nome não muda, senão nenhum trecho de CSS copia de um sistema pro outro sem editar:

```css
--cor-primaria       /* cor de ação/destaque, ex: botão primário, item ativo do menu */
--cor-primaria-escura
--cor-fundo           /* fundo da área de conteúdo */
--cor-sidebar         /* fundo do menu lateral, geralmente escuro mesmo com tema claro */
--cor-sidebar-texto
--cor-branco
--cor-borda
--cor-texto
--cor-texto-suave     /* texto secundário, legenda, contagem */
--cor-erro
--cor-sucesso
--largura-sidebar     /* 240px */
```

## Vocabulário de classes globais

| Grupo | Classes |
|---|---|
| Layout | `.layout`, `.layout-conteudo`, `.pagina`, `.pagina-header`, `.pagina-titulo` |
| Cartão | `.card`, `.card-titulo` |
| Botão | `.btn`, `.btn-primario`, `.btn-secundario`, `.btn-perigo`, `.btn-sucesso` |
| Formulário | `.campo-grupo`, `.campo-label`, `.campo-input`, `.campo-select`, `.campo-textarea`, `.campo-erro-msg`, `.checkbox-grupo` |
| Tabela | `.tabela`, `.tabela-container` |
| Feedback | `.badge`, `.badge-azul`/`.badge-verde`/`.badge-cinza`, `.alerta`, `.alerta-erro`/`.alerta-info`/`.alerta-sucesso`, `.loading`, `.spinner`, `.vazio`, `.vazio-icone` |

Uma tela nova primeiro tenta se montar só com essas classes; só cria classe nova (ainda dentro do `index.css`, não um arquivo `.css` por componente) quando nada da lista serve.

## Shell de layout

Sidebar fixa de `--largura-sidebar` (240px), fundo escuro (`--cor-sidebar`) independente do resto ser claro; `.layout-conteudo` desloca com `margin-left: var(--largura-sidebar)`. No mobile, a sidebar vira off-canvas: classe `sidebar-nav-aberta` no `<aside>` pra deslizar pra dentro, `.sidebar-overlay` clicável atrás pra fechar, botão `.btn-menu-mobile` (☰) que só aparece em telas estreitas.

## Componentes genéricos — portar em vez de reescrever

- **`TabelaCRUD`** — tela inteira de lista + criar + editar + excluir orientada por um array `colunas` (cada coluna descreve `nome`, `label`, `tipo`, se é `obrigatorio`, se referencia outra tabela via `tabela_ref`/`coluna_valor`/`coluna_label`). Pra qualquer cadastro simples novo (tipo "tabela de domínio com uns campos"), configure essa tabela em vez de escrever uma tela do zero.
- **`SelectPesquisavel`** — combobox com busca embutida; troque o `<select>` nativo por esse sempre que a lista de opções passar de ~15 itens.
- **`Modal`** — overlay central simples (`titulo`, `onFechar`, `children`); toda confirmação/formulário em popup usa esse componente, não um overlay construído na mão de novo.
- **`CampoDinamico`** — renderiza o campo certo a partir de um `tipo` (`texto`, `numero`, `decimal`, `alfanumerico`, `dropdown`, `data`, `hora`, `checkbox`, `textarea`) — o padrão pra formulário cujos campos vêm de configuração (tabela de catálogo) em vez de estarem fixos no JSX.

## Erro do Postgres → mensagem em português

Nunca mostre a mensagem crua do Supabase pro usuário final. Traduza pelos padrões mais comuns antes de exibir:

| Mensagem crua contém | Mostrar |
|---|---|
| `null value in column "X"` | "O campo (label de X) é obrigatório e não pode ficar vazio." |
| `duplicate key value` | "Já existe um registro com esses dados (valor duplicado)." |
| `foreign key constraint` + `delete` | "Não é possível excluir: existem outros registros vinculados a este." |
| `foreign key constraint` | "O valor informado não existe na tabela relacionada." |
| `violates check constraint` | "O valor informado não é permitido para este campo." |

## Ícones

Emoji direto no JSX (`📊`, `⚙️`, `🔑`...) pros ícones de menu/ação — decisão deliberada de não depender de biblioteca de ícone. Mantenha esse padrão num sistema novo em vez de introduzir uma lib de ícone só porque parece "mais profissional"; o objetivo é zero dependência extra pra isso.

## Exemplos

**Input:** "Preciso de uma tela de cadastro simples de 'Fornecedores' no sistema de Estoque: nome, CNPJ, ativo."
**Output:** Não escrever tela nova — configurar `<TabelaCRUD titulo="Fornecedores" tabela="estoque_fornecedores" colunas={[...]} />` com as 3 colunas descritas.

**Input:** "O Supabase retornou 'duplicate key value violates unique constraint' e quero mostrar isso pro usuário."
**Output:** Passar a mensagem pela mesma função `traduzirErro` (ou uma cópia dela no sistema novo) e mostrar "Já existe um registro com esses dados (valor duplicado)." em vez do texto técnico.

## Nota lateral: reidentidade visual por sistema

Trocar `--cor-primaria`/`--cor-sidebar` pra dar uma cor própria a cada sistema é esperado e não quebra o padrão — o que quebra é trocar o *nome* da variável ou o *nome* da classe, porque aí nenhum CSS copia entre sistemas sem find-and-replace.
