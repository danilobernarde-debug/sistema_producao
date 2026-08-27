# Contexto do Projeto — Controle de Produção

## Visão Geral

Sistema web de controle de produção diária para equipes de campo (construção e manutenção de redes elétricas). Desenvolvido com **React + Vite + Supabase**.

---

## Stack

- **Frontend:** React 18 + Vite + React Router DOM + Recharts
- **Backend:** Supabase (PostgreSQL + Auth + Storage + RLS)
- **URL Supabase:** `https://giendnvcmkaqdminmeyz.supabase.co`
- **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpZW5kbnZjbWthcWRtaW5tZXl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzEwNzU0MjAsImV4cCI6MjA0NjY1MTQyMH0.Ys5rggtFvbrI-YBPseR41JVRv5QI4TDHVNBChPN9GB8`

---

## Estrutura do Banco de Dados

### Tabelas de Dimensão (cadastro)

#### `d_contratos`
| campo | tipo | obs |
|-------|------|-----|
| id | smallint PK | |
| num_contrato | varchar | ex: "2024010501" |
| descricao | varchar | ex: "C&M Gurupi" |
| logica_contrato | boolean | true = sem campo equipe, divisão proporcional por colaborador; false = campo equipe fixo |
| referencia_codigo | text | |
| tip_equipe | jsonb | |

**Contratos existentes:**
| id | num_contrato | descricao |
|----|-------------|-----------|
| 1 | 2024010501 | C&M Gurupi |
| 2 | 2024010701 | C&M Palmas |
| 3 | 2021.0290.01 | C&M Campo Grande |
| 4 | 5000000471/2024 | Faixa GO |
| 5 | 5000000870/2025 | Faixa Goiás 2025 |
| 9 | 1 | Teste |

#### `d_tipo_equipe`
| id | descricao |
|----|-----------|
| 0 | Desativada |
| 1 | Construção |
| 2 | Manutenção Pesada |
| 3 | Limpeza de Faixa - RD (MT) |
| 4 | Limpeza de Faixa - LD (AT) |
| 5 | Manutenção Leve |
| 6 | Linha Viva |
| 7 | Poda |

Campos: `qtd_minima_colaboradores`, `grupo`, `grupo_atividades` (usado para filtrar atividades)

#### `d_equipes`
- Cada equipe pertence a um contrato (`contrato_id`) e a um tipo de equipe (`tipo_equipe_id`)
- Campos: `id, sistema_producao, equipe, contrato_id, tipo_equipe_id, is_ativo, sistema_uau, estado`
- Uma equipe nunca trabalha em dois contratos

#### `d_atividades`
- Vinculadas a `tipo_equipe_id` (não ao contrato diretamente)
- Campos relevantes: `id, codigo_op, DESCRICAO_BASICA_SISTEMA, unidade, UPE, tipo_lm_lv, tipo_upe_fixa, bonificacao, referencia_codigo`
- **`DESCRICAO_BASICA_SISTEMA` e `UPE` são case-sensitive de verdade** (criadas com aspas duplas) — em SQL cru precisam ser escritas como `"DESCRICAO_BASICA_SISTEMA"` e `"UPE"`, senão o Postgres procura a versão minúscula e dá erro `column ... does not exist`. Confirmado em 2026-08-26 ao rodar `sql_limpeza_subestacao.sql`.
- **`codigo_op` é `NOT NULL`** na tabela real, mesmo não estando marcado como obrigatório na tela de Atividades nem citado assim aqui antes. Todo INSERT direto em SQL precisa informar um valor.
- **`UPE` é `numeric(12,6)`** (alargada de `numeric(10,6)` em 2026-08-26 pra caber a atividade "Roçagem/Limpeza SE - Porte XG" = 10.522,52, que estourava o limite antigo de 9999,999999).
- `tipo_lm_lv`: LM = Linha Morta, LV = Linha Viva — definido na atividade, não no lançamento
- `tipo_upe_fixa`: 'UPE', 'FIXA' ou 'justificativa'
- `bonificacao`: boolean — usado para filtrar nas views do PowerBI
- Filtro: contrato → equipe → tipo_equipe → atividades por `tipo_equipe_id`

#### `d_colaboradores`
- `id, nome, matricula, equipe_id, is_ativo, cargo_id`
- Campo gerado: `matricula_nome`
- Um colaborador pode trabalhar em equipes diferentes (presença por registro)

#### `d_contratos_preco_upe`
- Histórico de preços UPE por contrato com vigência
- `contrato_id, vigencia_inicio, vigencia_fim, upe_lm, upe_lv`
- Trigger `atualizar_preco_upe` aplica automaticamente ao mudar contrato

#### `d_obras`
- `obra (PK), localidade, contrato_id, zona (URBANO/RURAL), polo, dth_prev_termino, previsto_orcado`

#### `d_regional`
- `id, regional`

#### `d_colaboradores_funcao`
- `id, cargo`

---

### Tabelas de Autenticação

#### `d_auth_user`
- Espelho do Supabase Auth com perfil
- `uuid (FK auth.users), role_id, nome, email, is_super_admin`

#### `d_auth_roles`
- `id, name`

#### `d_auth_contratos`
- Permissões por usuário por contrato (RLS ativo)
- `user_uuid, contrato_id, insert, read, update, delete`
- Quando tem acesso: CRUD completo
- `is_super_admin = true` tem acesso a tudo

---

### Tabelas de Fato (lançamento)

#### `f_prod_registro` — cabeçalho do lançamento diário
| campo | tipo | obs |
|-------|------|-----|
| id | bigint PK | |
| data_producao | date | |
| contrato_id | smallint FK | |
| equipe_id | integer FK | null quando logica_contrato=true |
| tipo_equipe_id | bigint FK | |
| encarregado_id | integer FK | d_colaboradores |
| obra_id | integer FK | |
| regional_id | smallint FK | |
| metadata_registro | jsonb | campos dinâmicos do cabeçalho |
| criado_por_id | uuid FK | |
| criado_em | timestamptz | |
| atualizado_em | timestamptz | trigger automático |
| atualizado_por_id | uuid | trigger automático |

**Campos do `metadata_registro`:** `placa, km_final, os, data_upload, horario_inicio, horario_fim, prefixo, url_arquivos, observacoes, regiao, cidade, modo_op_justificativa`

**Triggers:**
- `trg_auto_update_f_prod_registro` — atualiza `atualizado_em` e `atualizado_por_id`
- `trigger_atualizar_preco_upe` — atualiza preço UPE ao mudar contrato
- `audite.f_prod_id` — grava no `audit_log`

#### `f_prod_atividades` — itens do registro
| campo | tipo | obs |
|-------|------|-----|
| id | bigint PK | |
| registro_id | bigint FK | CASCADE delete |
| atividade_id | integer FK | |
| quantidade | numeric(12,6) | |
| upe | numeric(12,6) | atualizado por trigger |
| preco_upe | numeric(12,2) | atualizado por trigger |
| adicional | numeric(12,2) | |
| tipo_upe_fixa | text | 'UPE', 'FIXA', 'justificativa' |
| tipo_lm_lv | text | 'LM' ou 'LV' — vem da atividade |
| is_justificativa | boolean | atualizado por trigger |
| valor_total | numeric | GERADO: (qtd * preco_upe * upe) + adicional |
| metadata_atividades | jsonb | campos dinâmicos da atividade |

**Campos do `metadata_atividades`:** `si, poste, ose, ptp, alimentador, comprimento, largura, linha, estacao_inicial, latitude_inicial, longitude_inicial, estacao_final, latitude_final, longitude_final, cidade, anomalia, largura_comprimento`

**Triggers (4):**
- `trg_auto_update_f_prod_atividades` — auditoria
- `trigger_atualizar_is_justificativa` — define is_justificativa ao mudar atividade_id
- `trigger_atualizar_upe` — atualiza UPE ao mudar atividade_id
- `audite.f_prod_atividades` — grava no audit_log

#### `f_prod_colaboradores` — presença por registro
- `id, registro_id, colaborador_id, equipe_id`
- Unique: `(registro_id, colaborador_id)`
- Usado na lógica proporcional quando `logica_contrato = true`

#### `f_prod_arquivos` — anexos
- `id, registro_id, path, fullpath, name, size, type`
- URL gerada: `https://giendnvcmkaqdminmeyz.supabase.co/storage/v1/object/public/{fullpath}`
- `url_arquivos` no metadata é diferente — é link externo (Google Drive / OneDrive)

#### `audit_log` — log automático via trigger
- `id, table_name, operation_type, old_data (jsonb), new_data (jsonb), changed_at, changed_by, id_ref, contrato`
- Gerado automaticamente pelos triggers nas tabelas principais

---

### Tabelas de Configuração (novas — criadas neste projeto)

#### `config_campos` — catálogo global de campos dinâmicos
Colunas reais confirmadas via `information_schema` em 2026-08-26 (a lista abaixo substitui uma versão anterior que citava uma coluna `obrigatorio_padrao` que **não existe**):
| campo | tipo | obs |
|-------|------|-----|
| id | bigint PK | |
| nome | text UNIQUE, NOT NULL | chave exata salva no JSON: "ose", "cidade" |
| label | text, NOT NULL | texto no formulário: "OSE", "Cidade" |
| tipo | text, NOT NULL | 'texto', 'numero', 'decimal', 'alfanumerico', 'dropdown', 'data', 'hora', 'checkbox', 'textarea' |
| mascara | text | ex: "AAA-0000" para alfanumérico |
| tabela_ref | text | nome da tabela Supabase para dropdown |
| coluna_valor | text | coluna que será salva (ex: "id") |
| coluna_label | text | coluna exibida ao usuário (ex: "equipe") |
| placeholder | text | |
| criado_em | timestamptz | default `now()` |
| criado_por_id | uuid | default `auth.uid()` |
| secao_permitida | text | default `'ambas'` — provavelmente restringe se o campo pode ser usado na seção 'registro', 'atividade' ou ambas |
| is_coluna_real | boolean | default `false` — `false` = valor vai para `metadata_registro`/`metadata_atividades` (jsonb); `true` = campo mapeia pra uma coluna real da tabela (caso de `obra_id`, `equipe_id`) |
| opcoes | text | provavelmente lista de opções fixas quando o dropdown não usa `tabela_ref` |

**Obrigatoriedade não é definida aqui** — só em `config_campos_contrato.obrigatorio`, por contrato + tipo de equipe + seção.

**Campos cadastrados:**
`os, placa, km_final, horario_inicio, horario_fim, data_upload, prefixo, url_arquivos, regiao, cidade, observacoes, si, poste, ose, ptp, alimentador, comprimento, largura, linha, estacao_inicial, estacao_final, latitude_inicial, longitude_inicial, latitude_final, longitude_final, anomalia, largura_comprimento, modo_op_justificativa, equipe_id (dropdown → d_equipes)`

**Dropdowns disponíveis:** `d_equipes, d_obras, d_regional, d_colaboradores, d_atividades, d_contratos, d_tipo_equipe`

#### `config_campos_contrato` — vinculação campo × contrato × tipo de equipe
| campo | tipo | obs |
|-------|------|-----|
| id | bigint PK | |
| campo_id | bigint FK | config_campos |
| contrato_id | smallint FK | d_contratos |
| tipo_equipe_id | bigint FK | d_tipo_equipe |
| secao | text | 'registro' ou 'atividade' |
| obrigatorio | boolean | |
| ordem | smallint | posição no formulário |

**Unique:** `(campo_id, contrato_id, tipo_equipe_id, secao)`

---

### Views (PowerBI)

#### `view_powerbi_producao`
- Produção por atividade com divisão proporcional por equipe de colaboradores
- Usa `logica_contrato` para decidir qual equipe usar

#### `view_powerbi_producao_colab`
- Produção por colaborador com valor e quantidade por pessoa
- Filtra apenas atividades com `bonificacao = true`

---

## Regras de Negócio Principais

### Lógica do Contrato (`logica_contrato`)

```
logica_contrato = false
  → Formulário tem campo "Equipe"
  → Produção 100% para a equipe selecionada
  → equipe_id salvo em f_prod_registro

logica_contrato = true
  → SEM campo "Equipe" no formulário
  → Usuário marca apenas os colaboradores presentes
  → Sistema divide produção proporcionalmente:
     ex: 2 colabs Equipe A + 1 colab Equipe B
     → 2/3 para A, 1/3 para B
  → equipe vem do cadastro do colaborador (d_colaboradores.equipe_id)
```

### Fluxo do Formulário de Lançamento

```
1. Usuário seleciona Contrato
   → filtra equipes por contrato_id
   → verifica logica_contrato
   → filtra campos do metadata por (contrato_id + tipo_equipe_id)

2. Usuário seleciona Tipo de Equipe (1 por registro)
   → filtra atividades por tipo_equipe_id
   → carrega campos dinâmicos da seção 'registro'

3. Se logica_contrato = false → usuário escolhe Equipe
   → carrega colaboradores da equipe

4. Usuário preenche campos do cabeçalho (fixos + metadata)

5. Usuário seleciona atividades e preenche campos dinâmicos
   da seção 'atividade' para cada uma

6. Usuário marca colaboradores presentes (presença sim/não)

7. Salva:
   → f_prod_registro (cabeçalho + metadata_registro)
   → f_prod_atividades[] (uma linha por atividade + metadata_atividades)
   → f_prod_colaboradores[] (uma linha por colaborador presente)
```

### Campos Calculados pelo Banco (nunca editar no front)
- `valor_total` em f_prod_atividades — gerado automaticamente
- `upe` — atualizado por trigger ao mudar atividade_id
- `preco_upe` — atualizado por trigger ao mudar contrato_id
- `is_justificativa` — atualizado por trigger ao mudar atividade_id
- `atualizado_em` / `atualizado_por_id` — por trigger
- `matricula_nome` em d_colaboradores — gerado
- `codigo_descricao` em d_atividades — gerado
- `url` em f_prod_arquivos — gerada

### Permissões
- RLS ativo em todas as tabelas
- `d_auth_contratos` define acesso por usuário por contrato
- `is_super_admin = true` tem acesso irrestrito
- `config_campos` e `config_campos_contrato`: leitura para todos autenticados, escrita só para super admin

---

## Configuração de Campos por Contrato (resumo)

### Contratos 1, 2, 3 — C&M (Gurupi, Palmas, Campo Grande)
**Tipos:** Construção (1), Man.Pesada (2), Man.Leve (5), Linha Viva (6)
- **Registro metadata:** `placa, km_final, os`
- **Atividade metadata:** sem campos extras

### Contrato 4 — Faixa GO
**Tipo:** Limpeza MT (3)
- **Registro metadata:** `regiao, cidade, data_upload, equipe_id, placa, km_final`
- **Atividade metadata:** `si, poste, ose, alimentador, ptp`

### Contrato 5 — Faixa Goiás 2025
**Tipo 3 (MT):**
- Registro: `horario_inicio, horario_fim, placa, prefixo, url_arquivos, equipe_id, km_final`
- Atividade: `comprimento, largura, estacao_inicial, cidade, anomalia`

**Tipo 4 (AT):**
- Registro: `horario_inicio, horario_fim, placa, prefixo, url_arquivos, equipe_id, km_final`
- Atividade: `comprimento, largura, ose, linha, estacao_inicial, lat/long inicial/final, cidade, anomalia, largura_comprimento`

### Contrato 9 — Teste
**Tipo 1 (Construção):**
- Registro: `os, placa, km_final, regiao, cidade, data_upload, equipe_id, horario_inicio, horario_fim, prefixo, url_arquivos`
- Atividade: todos os campos (`si, poste, ose, ptp, alimentador, comprimento, largura, linha, estacoes, lat/long, cidade, anomalia, largura_comprimento`)

**Tipos 2, 5, 6:**
- Registro: `placa, km_final, os`
- Atividade: `si, poste, ose, alimentador, ptp`

---

## Arquivos Gerados (em /outputs/producao-app)

```
producao-app/
├── index.html
├── package.json
├── vite.config.js
├── sql_config_campos.sql          ← criar tabelas config (já rodado)
├── sql_popular_config_campos.sql  ← popular configs (já rodado)
├── sql_log_alteracoes.sql         ← tabela de log (rodar se não existir)
└── src/
    ├── main.jsx
    ├── App.jsx                    ← rotas
    ├── index.css
    ├── supabaseClient.js
    ├── hooks/
    │   └── useAuth.js
    ├── components/
    │   └── Sidebar.jsx
    └── pages/
        ├── Login.jsx
        ├── Dashboard.jsx
        ├── LogAlteracoes.jsx
        ├── Producao/
        │   ├── ListaRegistros.jsx
        │   ├── NovoRegistro.jsx   ← precisa refatorar com formulário dinâmico
        │   └── EditarRegistro.jsx ← precisa refatorar com formulário dinâmico
        └── Funcionarios/
            └── ListaFuncionarios.jsx
```

---

## O Que Falta Desenvolver

### Prioridade 1 — Formulário Dinâmico (coração do sistema)
- [ ] Hook `useCamposDinamicos(contrato_id, tipo_equipe_id, secao)` — busca campos da `config_campos_contrato`
- [ ] Componente `CampoDinamico` — renderiza o campo correto por tipo (texto, numero, dropdown, hora, etc.)
- [ ] Componente `FormularioDinamico` — monta o form completo com os campos da seção
- [ ] Refatorar `NovoRegistro.jsx` para usar formulário dinâmico
- [ ] Refatorar `EditarRegistro.jsx` para usar formulário dinâmico

### Prioridade 2 — Admin
- [ ] `Admin/ConfigCampos.jsx` — CRUD de campos (catálogo)
- [ ] `Admin/ConfigCamposContrato.jsx` — vincular campos a contrato + tipo + seção + ordem + obrigatoriedade

### Prioridade 3 — Melhorias
- [ ] Presença de colaboradores integrada ao lançamento
- [ ] Upload de arquivos (f_prod_arquivos)
- [ ] Tela de Log usando `audit_log` existente
- [ ] Dashboard com dados reais

---

## Como Instalar e Rodar

```bash
# 1. Criar projeto
npm create vite@latest producao-app -- --template react
cd producao-app

# 2. Instalar dependências
npm install @supabase/supabase-js react-router-dom recharts

# 3. Copiar os arquivos gerados para src/

# 4. Rodar
npm run dev
# Acesse: http://localhost:5173
```

---

## Observações Importantes

1. **Não editar no front:** `valor_total`, `upe`, `preco_upe`, `is_justificativa`, `atualizado_em`
2. **`url_arquivos`** no metadata é link externo (Google Drive/OneDrive) — diferente de `f_prod_arquivos` que é Storage do Supabase
3. **`logica_contrato`** é definido por contrato no banco, não pelo usuário
4. **Apenas 1 tipo de equipe por registro**
5. **Campos dinâmicos** são salvos no JSON do metadata, a chave é o `nome` do campo em `config_campos`
6. **`regiao` e `cidade`** são texto livre, sem tabela de cadastro
7. **`si`, `ose`, `ptp`, `alimentador`** são códigos de ordem de serviço e estrutura elétrica — digitados pelo usuário
8. O sistema usa o **`audit_log`** existente (trigger automático) — não precisa criar outro

---

## Estado da Implementação (atualizado 2026-05-16)

### O que foi construído

A Prioridade 1 está concluída. O sistema roda em `producao-app/` com `npm run dev`.

**Estrutura real de arquivos:**
```
producao-app/src/
├── main.jsx                          ← envolve o App com AuthProvider
├── App.jsx                           ← rotas protegidas (BrowserRouter + RotaProtegida)
├── index.css                         ← design system completo com variáveis CSS
├── supabaseClient.js                 ← cliente Supabase
├── hooks/
│   ├── useAuth.jsx                   ← ATENÇÃO: deve ser .jsx (contém JSX no AuthProvider)
│   └── useCamposDinamicos.js         ← busca config_campos_contrato por contrato+tipo+secao
├── components/
│   ├── Sidebar.jsx                   ← menu lateral fixo 240px
│   ├── CampoDinamico.jsx             ← renderiza campo por tipo (usa SelectPesquisavel para dropdown)
│   └── SelectPesquisavel.jsx         ← combobox com busca, sublabel, botão × para limpar
└── pages/
    ├── Login.jsx
    ├── Dashboard.jsx                 ← stats total/hoje/7 dias + últimos 5 registros
    └── Producao/
        ├── ListaRegistros.jsx        ← tabela com filtros de contrato e data, limite 100 registros
        ├── NovoRegistro.jsx          ← formulário completo de lançamento
        └── EditarRegistro.jsx        ← edição de registro existente (mesma lógica)
```

---

### Decisões de implementação

#### Filtro de atividades (dois níveis)
A tabela `d_atividades` é filtrada com dois critérios combinados:

1. `d_atividades.tipo_equipe_id = d_tipo_equipe.grupo_atividades` (do tipo de equipe selecionado)
   - Se `d_atividades.tipo_equipe_id = 0`, a atividade é universal e aparece para todos os tipos
2. `d_atividades.referencia_codigo = d_contratos.referencia_codigo` (do contrato selecionado)
   - **Exceção:** se `d_atividades.referencia_codigo = 'justificativa'`, aparece sempre, sem filtros

Implementado com duas queries paralelas (justificativa + normais) mescladas e ordenadas por nome.

#### Campo obra (`obra_id`)
- É FK real em `f_prod_registro`, **não** vai para `metadata_registro`
- Carregado de `d_obras` filtrado por `contrato_id`
- Só aparece no formulário se o contrato tiver obras cadastradas
- Label exibido: `obra — localidade`

#### Campo observações
- Está no catálogo `config_campos` com nome `observacoes`
- Para ativar em um contrato: inserir linha em `config_campos_contrato` com `secao = 'registro'`
- Exemplo SQL para contratos 1, 2 e 3:
```sql
INSERT INTO config_campos_contrato (contrato_id, tipo_equipe_id, campo_id, secao, ordem, obrigatorio)
SELECT c.contrato_id, c.tipo_equipe_id, cc.id, 'registro', 99, false
FROM (SELECT DISTINCT contrato_id, tipo_equipe_id FROM config_campos_contrato WHERE contrato_id IN (1,2,3)) c
CROSS JOIN config_campos cc WHERE cc.nome = 'observacoes'
ON CONFLICT DO NOTHING;
```

#### Colaboradores — `logica_contrato = false`
- Ao selecionar a equipe, **todos os colaboradores dela aparecem automaticamente** na lista
- Usuário remove quem faltou clicando "× Remover"
- Campo de busca separado para adicionar colaboradores de outras equipes do contrato
- `f_prod_colaboradores.equipe_id` = equipe home do colaborador (para PowerBI)

#### Colaboradores — `logica_contrato = true`
- **Sem campo Equipe** no formulário (a equipe vem do colaborador)
- UI: "Adicionar equipe completa" (primeiro) + "Adicionar colaborador individual"
- Cada colaborador adicionado tem seletor "Equipe no dia:" para override pontual
- `f_prod_colaboradores.equipe_id` = equipe do override se definido, senão equipe home
- PowerBI usa esse `equipe_id` para dividir produção proporcionalmente

#### Campos que o banco calcula (nunca enviar pelo frontend)
`valor_total`, `upe`, `preco_upe`, `is_justificativa`, `atualizado_em`, `atualizado_por_id`

---

### O que ainda falta desenvolver

- [ ] `Admin/ConfigCampos.jsx` — CRUD do catálogo de campos dinâmicos
- [ ] `Admin/ConfigCamposContrato.jsx` — vincular campos a contrato + tipo + seção + ordem
- [ ] Upload de arquivos (`f_prod_arquivos` + Supabase Storage)
- [ ] Dashboard com gráficos (Recharts) usando as views do PowerBI

---

## Backlog — Módulo Limpeza de Subestação (em implementação)

> Registrado em 2026-08-26 a partir da análise da planilha `LIMPEZA_DE_SUBESTAÇÃO - 2026.xlsx` (controle atual, fora do sistema, enviada pelo usuário).
>
> **Status:** módulo pertence ao contrato de Faixa, `contrato_id = 21` (confirmado pelo usuário). **`sql_limpeza_subestacao.sql` já rodou com sucesso no Supabase em 2026-08-26** — tabela `d_subestacoes`, tipo de equipe "Limpeza de Subestação", as 8 atividades e o campo dinâmico "Subestação" já existem no banco de produção (conferido consultando `d_tipo_equipe` e `d_atividades`).
> - ✅ `producao-app/sql_limpeza_subestacao.sql` — **executado**. Precisou de 3 correções sobre o que a documentação antiga dizia (ver notas em `d_atividades` e `config_campos` acima): aspas em `"DESCRICAO_BASICA_SISTEMA"`/`"UPE"`, `UPE` alargada pra `numeric(12,6)`, e `codigo_op` preenchido (é NOT NULL).
> - ✅ `producao-app/src/pages/Configuracoes/Subestacoes.jsx` — tela de cadastro (CRUD + importação em massa por XLSX), já roteada em `/configuracoes/subestacoes`. **Ainda não usável em produção** — só existe no código da branch `claude/oi-wuna1p`, que ainda não foi mesclada/deployada.
> - ✅ **As 369 subestações da planilha original já foram importadas** (2026-08-26), via `Configurações > Subestações` na prévia da branch (`sistema-producao-git-claude-oi-wuna1p-rede-forte.vercel.app` — a Vercel publica prévia automática a cada push, usando o mesmo banco Supabase de produção). Módulo pronto de ponta a ponta para uso.
> - ✅ **6 equipes internas cadastradas** (`d_equipes`, LSEGO-01/02/03/04/06/09 + encarregado) — sem isso o formulário não tinha equipe pra escolher.
> - ✅ **Atividade "Em Andamento - Sem Produção" cadastrada** (`LSE-AND`, UPE=0, `referencia_codigo='justificativa'`). Descoberto ao testar o formulário real: ele sempre exige pelo menos 1 atividade selecionada por registro (não dá pra salvar com a lista vazia), então o desenho original ("dia em andamento = registro sem nenhuma atividade") não era viável na UI. Fluxo real: dia trabalhado sem concluir → lança essa atividade (valor sempre 0, excluída dos relatórios via o mesmo mecanismo de `is_justificativa` que já existe pra chuva/falta de material). Dia que conclui → lança Roçagem e/ou Capina Química com o valor cheio.
> - ⏳ Falta (opcional, decisão do usuário): mesclar `claude/oi-wuna1p` para `main` — hoje o módulo só está acessível pela URL de prévia, não no domínio de produção (`producao2.dbmachado.com`) que a equipe usa no dia a dia.
> - ✅ **2026-08-27**: mesclado em `main`/produção; campo `superintendencia` (text, NORTE/NORDESTE/SUL/SUDOESTE/CENTRO) adicionado em `d_subestacoes` e retropreenchido nas 369 subestações (`sql_add_superintendencia_subestacoes.sql`) — faltava na modelagem original, é o campo "SUPERINTENDÊNCIA" da planilha; auto-filtro de Atividade por porte/tipo da subestação no lançamento; em andamento: relatório de exportação no formato da planilha original.

### Contexto do negócio

- Equipes de limpeza de subestação são pagas **por subestação concluída**, não por dia trabalhado — pode haver dias de trabalho sem produção lançada (o serviço leva vários dias).
- Pago pelo **tamanho/categoria da subestação** (porte), não por m² medido diretamente em cada lançamento.
- Dois serviços independentes, que podem sair juntos ou separados na mesma visita: **Roçagem/Limpeza geral** e **Capina Química**.
- Uma subestação é limpa várias vezes por ano (a planilha atual mostra de 1 a 8 visitas/ano por subestação).

### O que a planilha atual revelou

- 3 abas: `PORTE SE_PREÇOS` (tabela principal, 1.166 linhas = 1 linha por OS/visita, 370 subestações distintas, período dez/2025–dez/2026), `PREÇOS MIN_MÁX` (baremo oficial, é o que as fórmulas realmente usam), `Valores` (tabela auxiliar de equipes + uma cópia desatualizada dos preços).
- Cada OS tem `DATA INICIAL`/`DATA FINAL` mas **não existe lançamento diário** — só o resultado final. `STATUS` está sempre "FINALIZADO", inclusive em datas futuras (dez/2026) — confirma que hoje não há acompanhamento de progresso real, só o fechamento.
- O preço muda por **categoria + vigência** (3 faixas encontradas: original, 21/01/2025, 21/07/2025) — mesmo mecanismo que `d_contratos_preco_upe` já usa, só que por categoria de subestação em vez de LM/LV.
- Inconsistências encontradas na planilha atual (evidência do ganho de migrar pra um cadastro com dropdown): preços de M/G/GG trocados entre as abas "Valores" e "PREÇOS MIN_MÁX"; região "NORTE" digitada com espaço extra em algumas linhas, contando como categoria separada; equipe "LSEGO-00" usada em 79 linhas mas não cadastrada na aba de equipes; "LSEGO-06" cadastrado mas nunca usado; 1 subestação com porte inconsistente entre linhas.

### Preços atuais extraídos (vigência a partir de 21/07/2025)

**Roçagem / Limpeza de SE — por porte** (porte definido pela área em m²):

| Porte | Faixa (m²) | Valor |
|---|---|---|
| P | até 5.000 | R$ 5.261,26 |
| M | 5.001–15.000 | R$ 7.155,31 |
| G | 15.001–25.000 | R$ 7.365,77 |
| GG | 25.001–50.001 | R$ 9.891,17 |
| XG | acima de 50.001 | R$ 10.522,52 |

**Capina Química — por tipo de subestação:**

| Tipo | Valor |
|---|---|
| Chaveamento | R$ 1.052,25 |
| MT | R$ 1.578,38 |
| AT | R$ 3.314,59 |

### Modelagem decidida

1. Novo `d_tipo_equipe`: "Limpeza de Subestação".
2. Nova tabela dedicada `d_subestacoes` (decidido **não** reaproveitar `d_obras` — conceitos diferentes: obra é projeto com prazo, subestação é ativo recorrente): `id, nome, municipio, contrato_id, regional, porte (P/M/G/GG/XG), tipo (MT/AT/CHAVEAMENTO), equipe_interna_id → d_equipes, is_ativo`. Tela `Configuracoes/Subestacoes.jsx` com `TabelaCRUD` + import XLSX (igual `Atividades.jsx`) pra importar as 370 subestações da planilha de uma vez.
3. 8 `d_atividades` novas (`tipo_upe_fixa = FIXA`), valores da tabela acima (5 de Roçagem por porte + 3 de Capina Química por tipo).
4. Campo dinâmico "Subestação" (dropdown → `d_subestacoes`) na seção `registro`, via `config_campos`/`config_campos_contrato`.
5. **Lançamento diário, fecha na conclusão** (decidido, não por OS com data inicial/final): todo dia trabalhado gera um `f_prod_registro` normal (data, subestação, colaboradores presentes) sem atividade lançada; no dia da conclusão, lança a(s) atividade(s) correspondente(s) com o valor cheio. Consulta por `subestacao_id` + período mostra quantos dias/pessoas foram gastos ali antes do fechamento — sem precisar de campo extra amarrando os dias entre si.

### Em aberto (decidir antes de implementar)

- [ ] Qual `contrato_id` recebe esse tipo de equipe — contrato existente (ex: Faixa Goiás 2025) ou um novo contrato?
- [ ] Adicionar campo de frequência/meta anual esperada em `d_subestacoes` (a planilha sugere metas por porte — ex. porte P ≈ 1.025 limpezas/ano no total, ~4,2/subestação) pra relatório de cumprimento do baremo?

---

## Backlog — Preço com vigência para atividades FIXA (em implementação)

> Também registrado em 2026-08-26, motivado pela discussão do módulo acima.
>
> **Status:** escopo decidido — só as atividades FIXA do contrato de Faixa por enquanto (`contrato_id = 21`; Limpeza de Faixa + Limpeza de Subestação), não os demais contratos. **`sql_preco_fixa_vigencia.sql` (Partes 1 e 2) já rodou com sucesso no Supabase em 2026-08-26.**
> - ✅ `producao-app/sql_preco_fixa_vigencia.sql` — **executado** (tabela `d_atividades_preco_fixa` criada + vigência inicial semeada para as atividades FIXA do contrato 21, incluindo as 8 novas de Limpeza de Subestação).
> - ✅ `producao-app/src/pages/Configuracoes/AtividadesPrecoFixa.jsx` — tela de cadastro do preço por vigência, roteada em `/configuracoes/atividades-preco-fixa` (mesma ressalva de deploy do módulo acima).
> - ✅ **Mecanismo real descoberto** (2026-08-26, via `pg_get_functiondef` nos triggers de `f_prod_atividades`): o preço final **não é decidido no trigger** — é decidido no **frontend** (`NovoRegistro.jsx`/`EditarRegistro.jsx`). Pra tipo UPE, o form já resolve por vigência (`pickPrecoVigente(dataProducao)` em `d_contratos_preco_upe`). Pra tipo FIXA, o form manda `preco_upe=1` e `upe=d_atividades.UPE` (valor atual, sem olhar data). O trigger real por trás de "trigger_atualizar_upe" chama-se `atualizar_upe_f_prod_serv` e só re-sincroniza `upe` = valor atual de `d_atividades."UPE"` toda vez que `atividade_id` muda — **sobrescrevendo** qualquer valor que o frontend tivesse calculado. Por isso a correção tem que ser no trigger (não dá pra resolver só no frontend).
> - ✅ **PARTE 3 escrita** em `sql_preco_fixa_vigencia.sql`: troca `atualizar_upe_f_prod_serv` por uma versão que primeiro tenta achar o preço vigente em `d_atividades_preco_fixa` pra `data_producao` do registro; só usa isso se achar, senão cai no comportamento original exatamente como está hoje (aditivo — não afeta atividades UPE nem FIXA de outros contratos, que nunca têm linha nessa tabela).
> - ✅ **PARTE 3 executada** (2026-08-26). Os dois backlogs deste arquivo estão completos: módulo de Limpeza de Subestação com as 369 subestações reais importadas, e preço FIXA com vigência funcionando pro contrato de Faixa (21). Único item em aberto é opcional: mesclar `claude/oi-wuna1p` para `main` pra sair da URL de prévia e ir pro domínio de produção.
> - ✅ **Backfill histórico executado com sucesso** (2026-08-26): `producao-app/sql_backfill_producao_historica.sql` migrou o histórico real da planilha (992 visitas válidas, dez/2025–ago/2026) para **1.170 `f_prod_registro`** e **1.259 `f_prod_atividades`**, ~R$ 4,24 milhões em produção. Regras aplicadas: só até a data de hoje (exclui 6 linhas futuras), exclui 79 linhas com equipe "LSEGO-00" (sem encarregado real), 1 registro quando data inicial = final, 2 registros (Em Andamento na inicial + real na final) quando as datas diferem. `criado_por_id` atribuído ao usuário Danilo (`danilo@dbmachado.com`). Não populou `f_prod_colaboradores` (sem dado individual no histórico da planilha). Idempotente (marca `metadata_registro.origem_backfill_linha`).
> - ⏳ Em aberto (opcional, decisão do usuário): as 79 linhas excluídas (equipe "LSEGO-00") e as 6 linhas futuras — decidir depois se e como tratar.
> - ⚠️→✅ **Achado crítico e corrigido** (2026-08-26): a definição real do trigger (`pg_get_triggerdef`) mostrou que ele era **`AFTER UPDATE OF atividade_id`**, nunca `INSERT` — ou seja, a Parte 3 (lógica de vigência) nunca rodava no momento de criar um lançamento novo, só quando alguém editava um já existente e trocava a atividade. Isso fez o backfill sair com `upe=1` em todas as 1.259 linhas (corrigido via `sql_corrigir_upe_backfill.sql`, total final R$ 4.245.468,19 — bate com a estimativa) e significava que o próprio problema original (lançamento retroativo pegando valor errado) **não estava de fato resolvido** pra lançamentos novos. Corrigido em `sql_trigger_upe_disparar_insert.sql`: trigger agora é `AFTER INSERT OR UPDATE OF atividade_id`. Seguro pros outros contratos (a função só desvia do padrão quando existe preço em `d_atividades_preco_fixa`, hoje só as 8 atividades do contrato 21).

### Problema identificado

Hoje `d_atividades.UPE` (usado quando `tipo_upe_fixa = 'FIXA'`) guarda **um valor único**. O trigger `trigger_atualizar_upe` copia esse valor no momento do lançamento — **não é sensível à `data_producao`**. Resultado: se o usuário reajustar o valor de uma atividade e depois lançar (ou editar) uma produção com data antiga (retroativa), o registro sai com o **valor novo**, não o valor que estava vigente na época. Esse comportamento foi confirmado pelo usuário (Danilo) como o funcionamento atual do sistema. Fica ainda mais crítico no módulo de Limpeza de Subestação, cujo baremo já mudou 3x em menos de 2 anos e tem lançamento naturalmente atrasado (serviço de vários dias, fechamento tardio).

### Solução proposta

Nova tabela, mesmo espírito de `d_contratos_preco_upe` mas por atividade:

```sql
d_atividades_preco_fixa
  id               bigint PK
  atividade_id     bigint FK -> d_atividades
  valor            numeric(12,2)
  vigencia_inicio  date
  vigencia_fim     date   -- null = vigente até hoje
```

`trigger_atualizar_upe` passa a resolver `upe` (quando `tipo_upe_fixa = 'FIXA'`) por `atividade_id + data_producao` nessa tabela — mesmo padrão de lookup por vigência que já existe pra `preco_upe` (UPE por contrato+LM/LV). Não duplica a linha em `d_atividades` (mantém 1 atividade = 1 linha permanente, dropdown limpo, relatórios não fragmentam por variantes antigas).

**Migração não-destrutiva:** para cada atividade FIXA já existente, inserir 1 linha em `d_atividades_preco_fixa` com o `UPE` atual (`vigencia_inicio` antiga ou null, `vigencia_fim = null`). `d_atividades.UPE` pode continuar existindo como referência/exibição, sem função de cálculo.

### Em aberto (decidir antes de implementar)

- [ ] Aplicar só nas 8 atividades novas de Limpeza de Subestação, ou em **todas** as atividades FIXA do sistema (conserta o bug de vez, mas mexe no trigger que já roda em produção pros outros contratos)?
- [ ] Confirmar a lógica exata do trigger atual (`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'trigger_atualizar_upe';` no SQL editor do Supabase) antes de escrever a substituição.
