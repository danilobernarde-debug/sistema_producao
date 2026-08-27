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
| superintendencia | text | `NORTE`, `NORDESTE`, `SUL`, `SUDOESTE` ou `CENTRO` — campo "SUPERINTENDÊNCIA" da planilha original |
| contrato_id | smallint FK → d_contratos | sempre 21 (Faixa) |
| porte | text | `P`, `M`, `G`, `GG` ou `XG` — define o preço de Roçagem |
| tipo | text | `MT`, `AT` ou `CHAVEAMENTO` — define o preço de Capina Química |
| is_ativo | boolean | |

`regional_id` (FK → d_regional) e `equipe_interna_id` (FK → d_equipes) existiram no desenho original mas foram removidos em 2026-08-27 — nunca usados de fato: `regional_id` ficou redundante com `superintendencia`, `equipe_interna_id` era só metadado informativo nunca preenchido de forma confiável.

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
- **6 equipes internas** (`d_equipes`): LSEGO-01 (Joaquim), LSEGO-02 (Gustavo), LSEGO-03 (Ozéias), LSEGO-04 (Leonardo), LSEGO-06 (Eduardo), LSEGO-09 (Hélio). `LSEGO-00` (código genérico sem encarregado, presente na planilha original) não virou equipe. **Correção em 2026-08-27**: o roster real de RH mostrou que o código certo do Eduardo é **LSEGO-07**, não LSEGO-06 — a planilha histórica usada nesta seção tinha o código errado. Equipe renomeada (mesmo `id`, histórico já lançado preservado); ver seção 6.2.
- **20 colaboradores reais** (`d_colaboradores`) — inicialmente 6 encarregados-placeholder com matrícula fictícia (9001–9006, sem dado real de RH na planilha histórica); substituídos em 2026-08-27 pelos dados reais de RH (`Colaboradores.xlsx` fornecido pelo usuário) e complementados com os 14 trabalhadores de campo que faltavam. Ver seção 6.2.
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
| `sql_add_superintendencia_subestacoes.sql` | Adiciona `d_subestacoes.superintendencia` (text) e retropreenche as 369 subestações a partir do histórico da planilha |
| `sql_add_equipe_regional_subestacoes.sql` | **Superado** — tentativa inicial de `equipe_regional` como campo fixo em `d_subestacoes`; não rodar, ver linha abaixo |
| `sql_equipe_regional_campo_lancamento.sql` | Desfaz `d_subestacoes.equipe_regional` e cria `equipe_regional` como campo dinâmico (`config_campos`, tipo select) no lançamento — desenho correto |
| `sql_corrigir_datas_invertidas.sql` | Corrige 2 visitas do histórico com DATA INICIAL posterior à DATA FINAL na planilha original (erro de digitação) — remove o lançamento "Em Andamento" indevido de cada uma, vira visita de 1 dia só |
| `sql_remover_regional_equipe_interna_subestacoes.sql` | Remove `d_subestacoes.regional_id` e `equipe_interna_id` — nunca usados de fato |
| `sql_vincular_encarregado_limpeza_subestacao.sql` | Vincula o campo "Encarregado" (já existia no catálogo global) ao lançamento de Limpeza de Subestação — sem isso o seletor nunca aparecia |
| `sql_cadastrar_colaboradores_reais.sql` | Upsert (por pessoa, com tratamento de erro individual) das 20 pessoas do roster real de RH em `d_colaboradores`; corrige o código da equipe do Eduardo (LSEGO-06 → LSEGO-07) e a matrícula do Fagner (2803 → 2808) |
| `sql_preencher_encarregado_historico.sql` | Preenche `encarregado_id` (NULL em todos os 1.168 lançamentos históricos) com o encarregado real de cada equipe — rodar depois do script acima |
| `sql_backfill_equipe_regional.sql` | Preenche `equipe_regional` nos 1.170 lançamentos do backfill histórico, com o valor exato de cada visita da planilha original (992 chaves subestação+OS+datas) |

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

## 6.1 Relatório de exportação (2026-08-27)

Novo relatório em `/relatorios/exportacao` → "Limpeza de Subestação" (`src/pages/Relatorios/LimpezaSubestacao.jsx`), no mesmo formato de colunas da aba `PORTE SE_PREÇOS` da planilha original: SUPERINTENDÊNCIA, NOME DA SUBESTAÇÃO, MUNICÍPIO, PORTE, OS, DATA INICIAL, DATA FINAL, ROÇAGEM, CAPINA QUIMICA, TIPO DE SUBESTAÇÃO, STATUS, EQUIPE, EQUIPE INTERNO, VALOR DA CAP Q, VALOR DE LIMPEZA DE SUB.

Como o sistema lança "Em Andamento" (início) + atividade real (conclusão) em vez de 1 linha por visita, o relatório reconstrói a visita: agrupa por `registro_id` (via RPC `fn_prod_exportar`, igual aos outros relatórios de exportação), depois por subestação em ordem cronológica, casando cada conclusão com o "Em Andamento" aberto mais recente daquela subestação (ou tratando como visita de 1 dia só se não houver "Em Andamento" pendente). Só visitas **concluídas** entram no relatório — visitas ainda em andamento no período aparecem contadas num aviso na tela, não na exportação (mesmo escopo da planilha original, que só registrava trabalho finalizado).

Mapeamento das colunas sem coluna própria no lançamento:
- `EQUIPE` recebe o campo dinâmico `equipe_regional` (dropdown fixo: AT - SUD 04, CENTRO, NORDESTE, NORTE, SUL) — **campo do lançamento**, não da subestação: o usuário escolhe ao cadastrar o registro diário, igual ao campo "OS" (`config_campos`/`config_campos_contrato`, seção "registro", não obrigatório). Primeira tentativa (2026-08-27) colocou isso como atributo fixo em `d_subestacoes`, mas o histórico mostrou 21 das 369 subestações com mais de 1 valor de EQUIPE entre visitas diferentes — é atributo da visita, não da subestação; corrigido no mesmo dia (`sql_equipe_regional_campo_lancamento.sql`, que desfaz a coluna em `d_subestacoes` e cria o campo dinâmico). Lançamentos antigos (backfill histórico) foram preenchidos retroativamente em seguida (`sql_backfill_equipe_regional.sql`), com o valor exato de cada visita — mais preciso que a moda usada na primeira tentativa (em `d_subestacoes`), já que agora o campo é por visita.
- `EQUIPE INTERNO` recebe `d_equipes.equipe` (ex: "LSEGO-01 - Joaquim") via `equipe_id` do registro de conclusão.
- `STATUS` é sempre "FINALIZADO" (únicas linhas exportadas são visitas com alguma atividade concluída).

## 6.2 Campo Encarregado + roster real de colaboradores (2026-08-27)

- Campo "Encarregado" vinculado ao lançamento de Limpeza de Subestação (`sql_vincular_encarregado_limpeza_subestacao.sql`) — já existia pronto no formulário (usado por outros contratos), só faltava o vínculo em `config_campos_contrato`. Obrigatório.
- Usuário forneceu o roster real de RH (`Colaboradores.xlsx`, 20 pessoas: matrícula, nome, equipe, cargo). `sql_cadastrar_colaboradores_reais.sql`:
  - Corrige o código da equipe do Eduardo: **LSEGO-06 → LSEGO-07** (roster real não tem LSEGO-06; o encarregado "Eduardo Rodrigues dos Passos" está na LSEGO-07 — a planilha histórica usada na importação original tinha o código errado). Equipe renomeada no lugar (mesmo `id`), histórico já lançado preservado.
  - Corrige a matrícula do Fagner Cabral da Silva (já cadastrado no sistema, matrícula errada 2803 → correta 2808), liberando 2803 pro José Erivanaldo de Melo.
  - **v2 (reescrito)**: a primeira versão usava um único `UPDATE` multi-linha pros 6 encarregados — quando o Ozéias (matrícula 1542) deu conflito (já existia no banco vinculado a outra equipe, `FXGO-02`), o Postgres desfez o `UPDATE` inteiro e os 6 placeholders sumiram sem os dados reais entrarem no lugar. v2 processa as 20 pessoas uma por uma (`UPDATE` se a matrícula já existe, `INSERT` senão), com tratamento de erro individual — um conflito isolado não trava as outras 19.
  - **Achado**: 5 das 20 pessoas já existiam no banco vinculadas a outras equipes do contrato (FXGO-02, FXGO-12, FXTO-08, FXMS-02 — parecem ser as equipes originais de Roçagem de Faixa) — provavelmente remanejadas pra Limpeza de Subestação sem atualização de cadastro. O script move a `equipe_id` delas pra a LSEGO correspondente, usando a planilha do usuário como fonte da verdade atual.
  - Popula `d_colaboradores_funcao` com os 3 cargos reais (AJUDANTE DE SERVICOS GERAIS, ELETRICISTA ENCARREGADO A/B) e vincula via `cargo_id`.
  - **Achado à parte, não corrigido por este script**: os 1.170 lançamentos históricos do backfill têm `encarregado_id` órfão (não aponta pra nenhum colaborador existente) — os 6 encarregados-placeholder originais (matrícula 9001–9006) não foram encontrados no banco por nome nem por essa referência, e não há registro de quando/como sumiram. Pré-existente à importação de hoje (o script de colaboradores nunca alterou `f_prod_registro`). Decisão pendente do usuário sobre como corrigir (provavelmente: apontar `encarregado_id` de cada lançamento pro encarregado real da equipe correspondente).

## 7. Pendências opcionais (não bloqueiam o uso)

- As 79 linhas do histórico com equipe "LSEGO-00" — decidir se vale revisar e importar manualmente.
- As 6 linhas futuras excluídas do backfill.
- Vincular `equipe_interna_id` nas 369 subestações agora que as equipes já existem (hoje a maioria está em branco, é só metadado informativo).
- Aplicar o mesmo mecanismo de preço com vigência às atividades FIXA dos demais contratos (hoje escopado só ao contrato de Faixa, por decisão do usuário).
