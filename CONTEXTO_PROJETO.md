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
| campo | tipo | obs |
|-------|------|-----|
| id | bigint PK | |
| nome | text UNIQUE | chave exata salva no JSON: "ose", "cidade" |
| label | text | texto no formulário: "OSE", "Cidade" |
| tipo | text | 'texto', 'numero', 'decimal', 'alfanumerico', 'dropdown', 'data', 'hora', 'checkbox', 'textarea' |
| mascara | text | ex: "AAA-0000" para alfanumérico |
| tabela_ref | text | nome da tabela Supabase para dropdown |
| coluna_valor | text | coluna que será salva (ex: "id") |
| coluna_label | text | coluna exibida ao usuário (ex: "equipe") |
| placeholder | text | |
| obrigatorio_padrao | boolean | |

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
