# Contexto do Sistema para Chatbot — Rede Forte Produção

## O que é o sistema

Sistema de controle de produção diária de equipes de campo da empresa **Rede Forte / D B Machado LTDA**, que executa obras de construção e manutenção de redes elétricas. Cada dia de trabalho gera um **lançamento de produção** que registra quais atividades foram executadas por quais equipes, com quantidades, valores calculados e colaboradores presentes.

---

## Conexão com o Supabase

```js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

A view principal para análise é `view_powerbi_producao` — ela já une todos os dados relevantes numa única consulta.

---

## View principal: `view_powerbi_producao`

É a fonte de dados mais útil para o chatbot. Cada linha representa **uma atividade dentro de um lançamento**.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `registro_id` | int | ID do lançamento de produção |
| `data_producao` | date | Data do serviço |
| `contrato_id` | int | ID do contrato |
| `nr_obra` | text | Número da obra (ex: "001/2024") |
| `desc_contrato` | text | Nome do contrato (ex: "Gurupi") |
| `tipo_equipe_id` | int | ID do tipo de equipe |
| `desc_tipo_equipe` | text | Nome do tipo de equipe |
| `equipe_id` | int | ID da equipe |
| `desc_equipe` | text | Nome da equipe |
| `atividade_id` | int | ID da atividade |
| `desc_atividade` | text | Nome da atividade executada |
| `codigo_op` | text | Código da ordem de produção |
| `unidade` | text | Unidade de medida (m, un, m²) |
| `quantidade` | numeric | Quantidade executada |
| `upe` | numeric | UPE da atividade (fator de produção) |
| `preco_upe` | numeric | Preço da UPE no período |
| `valor_producao` | numeric | Valor total = quantidade × upe × preco_upe |
| `justificativa` | boolean | Se é uma linha de justificativa (não produção real) |
| `metadata_registro` | jsonb | Campos dinâmicos do lançamento (ex: observacoes, regional) |
| `metadata_atividades` | jsonb | Campos dinâmicos da atividade (ex: largura, comprimento) |
| `criado_por_id` | uuid | ID do usuário que fez o lançamento |
| `criado_em` | timestamptz | Quando foi lançado |

### Exemplos de consulta na view

```js
// Produção do mês atual, por contrato
const { data } = await supabase
  .from('view_powerbi_producao')
  .select('desc_contrato, valor_producao, quantidade, desc_atividade')
  .gte('data_producao', '2025-05-01')
  .lt('data_producao', '2025-06-01')
  .eq('justificativa', false)

// Top equipes do mês
const { data } = await supabase
  .from('view_powerbi_producao')
  .select('desc_equipe, valor_producao')
  .gte('data_producao', '2025-05-01')
  .lt('data_producao', '2025-06-01')
  .eq('justificativa', false)
// Agregar por desc_equipe no frontend: reduce/groupBy
```

---

## Tabelas de dimensão (cadastros)

### `d_contratos` — Contratos/obras

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | int | PK |
| `descricao` | text | Nome do contrato (ex: "Gurupi", "Palmas") |
| `nr_obra` | text | Número da obra |
| `ativo` | boolean | Se está ativo (inativos não aparecem em novos lançamentos) |

### `d_equipes` — Equipes

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | int | PK |
| `equipe` | text | Nome da equipe |
| `contrato_id` | int | FK → d_contratos |
| `tipo_equipe_id` | int | FK → d_tipo_equipe |
| `is_ativo` | boolean | Se está ativa |

### `d_tipo_equipe` — Tipos de equipe

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | int | PK |
| `descricao` | text | Nome (ex: "Eletricistas", "Construção") |
| `grupo_atividades` | int | Filtra quais atividades essa equipe pode executar |

### `d_colaboradores` — Colaboradores

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | int | PK |
| `matricula_nome` | text | "MATRÍCULA — Nome completo" |
| `equipe_id` | int | FK → d_equipes (equipe home) |
| `is_ativo` | boolean | Se está ativo |

### `d_atividades` — Catálogo de atividades

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | int | PK |
| `DESCRICAO_BASICA_SISTEMA` | text | Nome da atividade |
| `codigo_op` | text | Código OP (exibido entre colchetes) |
| `contrato_id` | int | FK → d_contratos (NULL = aparece em todos) |
| `unidade` | text | Unidade de medida |
| `tipo_upe_fixa` | text | "UPE" (preço por tabela) ou "FIXA" (valor fixo) |
| `UPE` | numeric | Valor da UPE quando FIXA |
| `tipo_lm_lv` | text | "LM" (média tensão) ou "LV" (baixa tensão) |
| `comprimento_lagura` | boolean | Se usa Comprimento × Largura para calcular quantidade |
| `tipo_equipe_id` | int | Restringe a um grupo de equipe (0 ou NULL = todos) |

### `d_contratos_preco_upe` — Preço da UPE por período

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `contrato_id` | int | FK → d_contratos |
| `upe_lm` | numeric | Preço da UPE para LM (média tensão) |
| `upe_lv` | numeric | Preço da UPE para LV (baixa tensão) |
| `vigencia_inicio` | date | Início da vigência |
| `vigencia_fim` | date | Fim da vigência (NULL = vigente até hoje) |

---

## Tabelas de fato (produção)

### `f_prod_registro` — Cabeçalho do lançamento

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | int | PK |
| `data_producao` | date | Data do serviço |
| `contrato_id` | int | FK → d_contratos |
| `tipo_equipe_id` | int | FK → d_tipo_equipe |
| `equipe_id` | int | FK → d_equipes (NULL se logica_contrato=true) |
| `obra_id` | int/text | Obra realizada |
| `encarregado_id` | int | FK → d_colaboradores |
| `regional_id` | int | FK → d_regional |
| `metadata_registro` | jsonb | Campos dinâmicos (observacoes, etc.) |
| `criado_por_id` | uuid | FK → auth.users |
| `criado_em` | timestamptz | Timestamp de criação |

### `f_prod_atividades` — Itens do lançamento

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | int | PK |
| `registro_id` | int | FK → f_prod_registro |
| `atividade_id` | int | FK → d_atividades |
| `quantidade` | numeric | Quantidade executada |
| `upe` | numeric | Valor UPE (calculado por trigger) |
| `preco_upe` | numeric | Preço UPE vigente (calculado por trigger) |
| `valor_total` | numeric | quantidade × upe × preco_upe (calculado por trigger) |
| `metadata_atividades` | jsonb | Campos dinâmicos (largura, comprimento, etc.) |

### `f_prod_colaboradores` — Presença no lançamento

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `registro_id` | int | FK → f_prod_registro |
| `colaborador_id` | int | FK → d_colaboradores |
| `equipe_id` | int | Equipe do colaborador **neste dia** (pode diferir da home) |

---

## Lógica de negócio importante

### Cálculo de valor
```
valor_producao = quantidade × upe × preco_upe
```
- `upe` vem de `d_atividades.UPE` (quando FIXA) ou da tabela `d_contratos_preco_upe` (quando UPE)
- O preço UPE é escolhido pela vigência mais recente que cobre a `data_producao`

### Justificativa
- Quando `justificativa = true`, o lançamento não é produção real (ex: chuva, falta de material)
- Deve ser **excluída** dos cálculos de valor e produtividade

### Colaboradores e equipes
- Um colaborador tem uma equipe "home" (`d_colaboradores.equipe_id`)
- Pode ser registrado em uma equipe diferente no dia (`f_prod_colaboradores.equipe_id`)
- Isso é usado para calcular divisão de valor por equipe no PowerBI

---

## Perguntas que o chatbot pode responder

### Produção e valor
- "Qual foi a produção total de maio de 2025?"
- "Quais equipes produziram mais no último mês?"
- "Qual atividade gerou mais valor no contrato de Gurupi?"
- "Quantos lançamentos foram feitos essa semana?"
- "Qual o valor médio por lançamento por equipe?"

### Colaboradores
- "Quais colaboradores estiveram presentes mais dias esse mês?"
- "Quantos colaboradores diferentes participaram de lançamentos em maio?"

### Atividades
- "Quais atividades foram mais executadas?"
- "Qual a quantidade total de metros de rede instalados?"

### Justificativas
- "Quantos dias de justificativa houve por equipe?"
- "Quais equipes tiveram mais justificativas em 2025?"

---

## Como estruturar o chatbot

### Arquitetura recomendada

1. **Frontend:** Campo de chat no sistema React existente
2. **Backend:** Função Edge do Supabase (ou API Next.js/Express) que:
   - Recebe a pergunta do usuário
   - Monta a query Supabase correspondente
   - Retorna dados formatados
3. **LLM:** Claude (Anthropic API) ou GPT para interpretar a pergunta e gerar a resposta em linguagem natural

### Fluxo sugerido
```
Usuário digita pergunta
       ↓
LLM interpreta + extrai filtros (contrato, período, equipe...)
       ↓
Backend consulta view_powerbi_producao com os filtros
       ↓
LLM formata os dados em resposta natural
       ↓
Chatbot exibe resposta
```

### System prompt sugerido para o LLM

```
Você é um assistente de análise de produção da Rede Forte. 
Você tem acesso aos dados de produção de equipes de campo que instalam e mantêm redes elétricas.

Os dados vêm da view `view_powerbi_producao` no Supabase.
Sempre exclua linhas onde `justificativa = true` ao calcular valores de produção.
Valores são em reais (R$). Quantidades variam por unidade (metros, unidades, m²).
Períodos: use o campo `data_producao` com filtros gte/lt.

Ao responder:
- Formate valores em R$ com 2 casas decimais
- Use o nome do contrato (desc_contrato), não o ID
- Agrupe por equipe (desc_equipe) quando comparar equipes
- Seja objetivo e direto, com tabelas quando houver múltiplos itens
```

### Agregações no frontend (JavaScript)

Como o Supabase não tem GROUP BY direto via SDK, faça as agregações no JS:

```js
// Agrupar por equipe
const porEquipe = dados.reduce((acc, r) => {
  const key = r.desc_equipe
  if (!acc[key]) acc[key] = { equipe: key, total: 0, registros: 0 }
  acc[key].total += r.valor_producao || 0
  acc[key].registros += 1
  return acc
}, {})
const ranking = Object.values(porEquipe).sort((a, b) => b.total - a.total)
```

---

## Filtros mais usados

```js
// Por período
.gte('data_producao', '2025-05-01').lt('data_producao', '2025-06-01')

// Excluir justificativas
.eq('justificativa', false)

// Por contrato
.eq('contrato_id', 1)

// Por equipe
.eq('desc_equipe', 'Nome da Equipe')

// Por tipo de equipe
.eq('tipo_equipe_id', 3)
```
