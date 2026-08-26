# Implementação — Módulo Limpeza de Subestação

Registro completo de tudo que foi criado/alterado para colocar o serviço de Limpeza de Subestação dentro do `sistema_producao`. Implementado e publicado em produção em 2026-08-26, na branch `claude/oi-wuna1p` (mesclada em `main`).

## Contexto do negócio

Equipes de limpeza de subestação são pagas **por subestação concluída**, não por dia trabalhado, e **pelo tamanho (porte)** da subestação. Dois serviços independentes: **Roçagem/Limpeza geral** e **Capina Química**. O controle era feito só em planilha (`LIMPEZA_DE_SUBESTAÇÃO - 2026.xlsx`), sem acompanhamento diário e sem preço sensível à data do reajuste.

---

## 1. Banco de dados (Supabase)

### 1.1 Tabelas novas

**`d_subestacoes`** — cadastro das subestações atendidas.
| campo | tipo | obs |
|---|---|---|
| id | bigint PK | |
| nome | text | prefixado com o porte, ex: `[P] SE ABADIANIA` |
| municipio | text | |
| contrato_id | smallint FK → d_contratos | sempre 21 (Faixa) |
| regional_id | smallint FK → d_regional | |
| porte | text | `P`, `M`, `G`, `GG` ou `XG` — define o preço de Roçagem |
| tipo | text | `MT`, `AT` ou `CHAVEAMENTO` — define o preço de Capina Química |
| equipe_interna_id | integer FK → d_equipes | metadado informativo |
| is_ativo | boolean | |

RLS: leitura/escrita seguindo o mesmo padrão de `d_obras` (super admin ou permissão do contrato em `d_auth_contratos`).

**`d_atividades_preco_fixa`** — histórico de preço por vigência para atividades do tipo FIXA (equivalente a `d_contratos_preco_upe`, só que por atividade em vez de contrato+LM/LV).
| campo | tipo | obs |
|---|---|---|
| id | bigint PK | |
| atividade_id | integer FK → d_atividades | |
| valor | numeric(12,2) | |
| vigencia_inicio | date | |
| vigencia_fim | date | null = vigente até hoje |

RLS: leitura para autenticados, escrita só super admin (padrão de `config_campos`).

### 1.2 Novos cadastros (dados)

- **Tipo de equipe**: "Limpeza de Subestação" (`d_tipo_equipe`), com `grupo_atividades` auto-referenciado.
- **8 atividades** (`d_atividades`, `tipo_upe_fixa = FIXA`, contrato 21), preços na vigência 21/07/2025:

  | código | descrição | valor |
  |---|---|---|
  | LSE-P | Roçagem/Limpeza SE - Porte P | R$ 5.261,26 |
  | LSE-M | Roçagem/Limpeza SE - Porte M | R$ 7.155,31 |
  | LSE-G | Roçagem/Limpeza SE - Porte G | R$ 7.365,77 |
  | LSE-GG | Roçagem/Limpeza SE - Porte GG | R$ 9.891,17 |
  | LSE-XG | Roçagem/Limpeza SE - Porte XG | R$ 10.522,52 |
  | CQ-CHAV | Capina Química SE - Chaveamento | R$ 1.052,25 |
  | CQ-MT | Capina Química SE - MT | R$ 1.578,38 |
  | CQ-AT | Capina Química SE - AT | R$ 3.314,59 |

- **1 atividade "Em Andamento"** (`LSE-AND`, UPE=0, `referencia_codigo='justificativa'`) — usada nos dias trabalhados sem conclusão (ver seção 4).
- **6 equipes internas** (`d_equipes`): LSEGO-01 (Joaquim), LSEGO-02 (Gustavo), LSEGO-03 (Ozéias), LSEGO-04 (Leonardo), LSEGO-06 (Eduardo), LSEGO-09 (Hélio). `LSEGO-00` (código genérico sem encarregado, presente na planilha original) não virou equipe.
- **6 colaboradores/encarregados** (`d_colaboradores`), um por equipe acima, matrículas placeholder 9001–9006 (não havia matrícula real de RH na planilha).
- **Campo dinâmico "Subestação"** (`config_campos` + `config_campos_contrato`, dropdown → `d_subestacoes`, seção "registro").
- **Campo "OS"**: já existia no catálogo global (usado por outros contratos) — só vinculado ao novo tipo de equipe.
- **369 subestações** importadas (dados reais extraídos da planilha, deduplicados por nome — o "porte"/"tipo" foi resolvido por moda quando havia divergência entre linhas da mesma subestação).

### 1.3 Alterações em schema existente

- **`d_atividades."UPE"`**: coluna alargada de `numeric(10,6)` para `numeric(12,6)` — o valor da Roçagem Porte XG (R$ 10.522,52) estourava o limite antigo (máx. R$ 9.999,999999).
- **`trigger_atualizar_upe`** (função real: `atualizar_upe_f_prod_serv`, tabela `f_prod_atividades`):
  - **Lógica reescrita**: antes só copiava `d_atividades."UPE"` (valor atual) pra `upe`, sem olhar a data do lançamento. Agora primeiro tenta achar um preço vigente em `d_atividades_preco_fixa` pra `data_producao` do registro; só usa isso se achar (ou seja, só afeta as 8 atividades acima). Pra tudo mais, comportamento idêntico ao original.
  - **Evento estendido**: o trigger só disparava em `AFTER UPDATE OF atividade_id` — nunca em `INSERT`. Isso foi descoberto depois que o backfill histórico saiu com `upe=1` em todas as linhas (trigger nunca rodou). Corrigido para `AFTER INSERT OR UPDATE OF atividade_id`, o que também corrige o problema original (lançamento retroativo pegando o valor atual em vez do histórico).

### 1.4 Bug de preço corrigido (motivação da vigência)

Antes desta implementação, atividades do tipo `FIXA` usavam sempre o valor **atual** de `d_atividades.UPE`, mesmo para lançamentos com `data_producao` retroativa — ou seja, reajustar o preço de uma atividade alterava silenciosamente o valor de lançamentos antigos feitos depois do reajuste. Corrigido **apenas para as atividades FIXA do contrato de Faixa (21)** — decisão explícita do usuário, para não alterar o comportamento dos demais contratos agora.

---

## 2. Aplicação (React — `producao-app/`)

### Arquivos novos
- `src/pages/Configuracoes/Subestacoes.jsx` — CRUD de subestações (via `TabelaCRUD`) + importação em massa por XLSX.
- `src/pages/Configuracoes/AtividadesPrecoFixa.jsx` — CRUD do preço por vigência (via `TabelaCRUD`).

### Arquivos alterados
- `src/App.jsx` — rotas `/configuracoes/subestacoes` e `/configuracoes/atividades-preco-fixa`.
- `src/pages/Configuracoes/index.jsx` — entradas "Subestações" e "Preço Fixa por Vigência" no menu.

Nenhuma alteração no formulário de lançamento (`NovoRegistro.jsx`/`EditarRegistro.jsx`) — o campo "Subestação" usa o mecanismo de campos dinâmicos já existente (`config_campos`), sem precisar mexer nesses arquivos.

---

## 3. Scripts SQL gerados (`producao-app/*.sql`)

Todos idempotentes (seguros pra rodar de novo) e resolvem as chaves estrangeiras por nome via subconsulta, não por id fixo.

| arquivo | conteúdo |
|---|---|
| `sql_limpeza_subestacao.sql` | Tabela `d_subestacoes` + RLS; tipo de equipe; 8 atividades; equipes internas; encarregados; campo "Subestação"; vínculo do campo "OS"; atividade "Em Andamento" |
| `sql_preco_fixa_vigencia.sql` | Tabela `d_atividades_preco_fixa` + RLS; seed de vigência inicial; substituição da função do trigger (Parte 3) |
| `sql_trigger_upe_disparar_insert.sql` | Estende o trigger para também disparar em `INSERT` (achado durante a correção do backfill) |
| `sql_prefixar_porte_subestacoes.sql` | Prefixa o nome das subestações com o porte (`[P] SE ...`), pedido para o dropdown do lançamento |
| `sql_backfill_producao_historica.sql` | Migração dos lançamentos históricos da planilha (ver seção 4) |
| `sql_corrigir_upe_backfill.sql` | Correção pontual do `upe`/`valor_total` das linhas do backfill (efeito do achado do trigger) |

---

## 4. Migração de dados históricos

`sql_backfill_producao_historica.sql` migrou o histórico real da planilha (dez/2025–ago/2026) para o sistema.

**Regras aplicadas** (combinadas com o usuário):
- Só visitas com `DATA FINAL` até a data da migração (26/08/2026) — 6 linhas futuras excluídas.
- Linhas com `EQUIPE INTERNO = LSEGO-00` excluídas (79 linhas) — sem equipe/encarregado real.
- Uma "visita" = mesma OS + mesma subestação + mesmo intervalo de datas (a OS se repete entre subestações diferentes e até entre visitas separadas da mesma subestação, então não dá pra agrupar só por OS).
- `DATA INICIAL = DATA FINAL`: 1 lançamento na data, com a(s) atividade(s) real(is).
- `DATA INICIAL ≠ DATA FINAL`: 2 lançamentos — "Em Andamento" na data inicial, atividade(s) real(is) na data final.
- Presença de colaboradores (`f_prod_colaboradores`) não populada — não existe esse dado individual no histórico da planilha.

**Resultado**: 992 visitas válidas → **1.170 lançamentos** (`f_prod_registro`) e **1.259 linhas de atividade** (`f_prod_atividades`), totalizando **R$ 4.245.468,19** em produção histórica.

---

## 5. Regras de negócio do módulo

1. **Pago por subestação, não por dia**: lançamento diário normal (data, colaboradores presentes, subestação em atendimento) sem atividade nos dias sem conclusão; a atividade com valor cheio só é lançada no dia em que o serviço termina.
2. **Dia trabalhado sem conclusão**: usa a atividade "Em Andamento - Sem Produção" (valor zero, marcada como `justificativa` — mesmo mecanismo que já existia pra chuva/falta de material, exclui dos relatórios de produção real).
3. **Preço por porte/tipo**: Roçagem precificada pelo porte da subestação (P/M/G/GG/XG); Capina Química pelo tipo (MT/AT/Chaveamento) — ambos atributos fixos da subestação, cadastrados uma vez.
4. **Reajuste de preço**: em vez de editar o valor da atividade (o que afetaria só lançamentos futuros com o valor errado retroativamente), insere uma nova linha em `d_atividades_preco_fixa` com a nova vigência.

---

## 6. Deploy

- Desenvolvido na branch `claude/oi-wuna1p`, com prévia automática da Vercel a cada push (mesmo banco Supabase de produção).
- Mesclada em `main` em 2026-08-26 (fast-forward, sem conflito) — publicado no domínio de produção (`producao2.dbmachado.com`).

---

## 7. Pendências opcionais (não bloqueiam o uso)

- As 79 linhas do histórico com equipe "LSEGO-00" — decidir se vale revisar e importar manualmente.
- As 6 linhas futuras excluídas do backfill.
- Vincular `equipe_interna_id` nas 369 subestações agora que as equipes já existem (hoje a maioria está em branco, é só metadado informativo).
- Aplicar o mesmo mecanismo de preço com vigência às atividades FIXA dos demais contratos (hoje escopado só ao contrato de Faixa, por decisão do usuário).
