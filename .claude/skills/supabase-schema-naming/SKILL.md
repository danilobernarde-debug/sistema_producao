---
name: supabase-schema-naming
description: >-
  Convenção de nomenclatura de tabelas e views do Supabase compartilhado entre os sistemas
  da empresa do Danilo (projeto Projeto-produção, ref giendnvcmkaqdminmeyz, hoje usado por
  Produção, Campo e Jurídico). Use esta skill sempre que for criar, nomear ou revisar uma
  tabela, view ou coluna nova nesse banco, decidir se um dado é cadastro compartilhado ou
  específico de um sistema, planejar um sistema novo ainda não criado que vai rodar sobre
  esse mesmo Supabase, ou quando o usuário perguntar como nomear uma tabela, se algo deveria
  ser cad_ ou só de um sistema, ou qual prefixo usar num sistema novo. Não se aplica a outros
  projetos Supabase do Danilo fora desse grupo de sistemas, por exemplo projetos de outra
  organização como o projeto Frotas.
---

# Nomenclatura de tabelas — Supabase compartilhado

Vários sistemas da mesma empresa rodam sobre um único projeto Supabase (`Projeto-produção`, ref `giendnvcmkaqdminmeyz`). Cada tabela tem um prefixo que diz de cara a quem ela pertence — isso existe porque, sem prefixo, fica impossível saber só pelo nome se uma tabela é segura pra outro sistema reaproveitar ou se é interna de um só. As regras abaixo definem qual prefixo uma tabela nova deve levar.

## Registro de prefixos em uso

Antes de inventar um prefixo novo, confira se já não existe um pra esse sistema. Mantenha esta lista atualizada sempre que um sistema novo entrar:

| Prefixo | Escopo | Sistema |
|---|---|---|
| `cad_` | compartilhado (2+ sistemas) | cadastro/dado mestre da empresa |
| `auth_` | compartilhado (todos os sistemas) | identidade e papel global de usuário |
| `prod_` | próprio | sistema web de Produção |
| `campo_` | próprio | app mobile de campo |
| `jud_` | próprio | sistema Jurídico |
| *(novo)* | próprio | *(adicione aqui quando criar o próximo sistema)* |

Prefixo de sistema novo: curto (3-5 letras), minúsculo, sem acento, que não colida com nenhum da tabela acima nem seja prefixo/sufixo de outro já existente.

## Passo a passo pra nomear uma tabela nova

**1. É reaproveitável por 2+ sistemas, ou é específica de um só?**

Pergunta chave: se um sistema novo surgisse amanhã, ele plausivelmente consultaria essa tabela? Se sim (mesmo que hoje só um sistema use), ela é candidata a `cad_`. Se o dado só faz sentido dentro do fluxo/tela de um sistema específico, mesmo que o nome pareça genérico, mantém o prefixo daquele sistema — não generalize por antecipação sem necessidade real.

- **`cad_`** → cadastro/dado mestre do negócio, não é log nem transação (ex: `cad_colaboradores`, `cad_equipes`, `cad_contratos`, `cad_obras`, `cad_atividades`, `cad_regional`, `cad_tipo_equipe`).
- **`auth_`** → só pra identidade e papel *global* do usuário (quem é a pessoa, ela é super admin ou não). Não é o lugar pra permissão fina — ver regra 3.
- **prefixo do sistema** → tudo que só aquele sistema usa: dado transacional, configuração de UI, log específico, etc.

**2. Duas tabelas com o mesmo "nome de conceito" em domínios diferentes?**

Às vezes um catálogo/dimensão (`cad_atividades`) e um registro de uso daquele catálogo (`prod_atividades`, o que foi de fato executado) coexistem — são coisas diferentes, cada um no seu grupo. Não force as duas pro mesmo prefixo só porque a palavra é parecida; se colidirem depois de aplicar o prefixo, escolha um nome mais específico pra uma delas (ex: sufixo `_catalogo` ou `_execucoes`) em vez de inventar uma exceção à regra.

**3. Tabela de permissão/acesso fino — nunca vai em `auth_`**

"O que o usuário X pode ver/fazer *dentro* do sistema Y" é sempre uma tabela própria do sistema Y, não uma extensão de `auth_`. Padrão já usado: `jud_user_permissoes`, `prod_usuarios_permissoes`. Pro próximo sistema, siga o mesmo formato: `<prefixo_do_sistema>_usuarios_permissoes` (ou nome equivalente, adaptando ao que a permissão de fato controla).

Por quê: `auth_` representa "quem é essa pessoa" — um conceito que todo sistema entende igual. Permissão fina é regra de negócio específica de cada sistema (no Jurídico é tipo de processo, na Produção é contrato) — misturar isso em `auth_` faria uma tabela compartilhada carregar lógica que só um sistema entende, e qualquer sistema novo teria que aprender a ignorar colunas que não são dele.

**4. Tabela de relacionamento entre `cad_`/`auth_` e um sistema específico**

Leva o prefixo do sistema "dono" da relação (quem decidiu que esse vínculo existe), não `cad_`/`auth_`. Exemplo: uma tabela ligando `cad_obras` a itens de um sistema de Estoque (hipotético) fica `estoque_obras_itens`, não `cad_obras_itens`.

**5. Views**

Mesmo prefixo de sistema do dado que ela representa, com `view` *depois* do prefixo, não antes: `prod_view_relatorio_mensal`, não `view_prod_relatorio_mensal`. Isso mantém a view agrupada com o resto do sistema dela na lista alfabética do Table Editor — o objetivo é achar tudo de um sistema junto, e "é view" já aparece pelo ícone diferente no próprio Supabase.

**6. Estilo**

`snake_case`, substantivo no plural pra tabela de entidade (`cad_colaboradores`, não `cad_colaborador`), sem abreviação inconsistente (não abrevie "colaboradores" pra "colabs" numa tabela e escreva por extenso em outra).

## Exemplos

**Input:** "Vou criar uma tabela pra guardar tipos de documento aceitos — o Jurídico usa, e um RH que a gente ainda vai construir também vai precisar."
**Output:** `cad_tipos_documento` — reaproveitável por 2+ sistemas (inclusive um que nem existe ainda), então é cadastro compartilhado.

**Input:** "Preciso de uma tabela só pro sistema novo de Estoque guardar os itens do inventário."
**Output:** Sistema novo, prefixo ainda não registrado → escolher um prefixo curto (ex: `estoque_`), adicionar na tabela de registro deste arquivo, e criar `estoque_itens`.

**Input:** "Quero controlar o que cada usuário pode ver dentro do sistema de Estoque, parecido com o jud_user_permissoes."
**Output:** `estoque_usuarios_permissoes` — permissão fina é sempre do sistema, nunca `auth_`.

**Input:** "View com o relatório mensal de produção pra exportar."
**Output:** `prod_view_relatorio_mensal` — prefixo do sistema primeiro, `view` depois.

## Nota lateral: sistema novo com banco Supabase separado

Se o sistema novo for rodar num projeto Supabase diferente do compartilhado (banco isolado), ainda siga este mesmo padrão de prefixo pras tabelas que representam um conceito compartilhado (`cad_`, `auth_`) — mesmo sem risco de colisão de nome hoje, já que o projeto é isolado. Crie a tabela já com a mesma estrutura de colunas da equivalente compartilhada, não só o mesmo nome. Motivo: se um dia esse banco for unificado com o compartilhado, o que já nasceu com nome e estrutura certos encaixa direto (vira `insert`/`union`); o que nasceu diferente exige rename e remapeamento manual antes de unificar, com os cuidados da nota abaixo.

Isso vale pra `auth_` (ver estrutura detalhada na skill supabase-auth-pattern) e também pras tabelas `cad_` — mas só crie, no banco separado, a(s) que o sistema novo realmente for consultar; não replique a lista inteira por precaução. Estrutura de cada `cad_` hoje (nome legado `d_` entre parênteses):

| Tabela (`cad_`) | Colunas principais |
|---|---|
| `cad_contratos` (`d_contratos`) | `id smallint PK, num_contrato varchar, descricao varchar, logica_contrato boolean, referencia_codigo text, tip_equipe jsonb` |
| `cad_tipo_equipe` (`d_tipo_equipe`) | `id, descricao, qtd_minima_colaboradores, grupo, grupo_atividades` |
| `cad_equipes` (`d_equipes`) | `id, equipe, contrato_id FK, tipo_equipe_id FK, is_ativo` |
| `cad_colaboradores` (`d_colaboradores`) | `id, nome, matricula, equipe_id FK, is_ativo, cargo_id` (+ `matricula_nome` gerado) |
| `cad_atividades` (`d_atividades`) | `id, codigo_op, descricao, unidade, tipo_lm_lv, tipo_upe_fixa, referencia_codigo, tipo_equipe_id` |
| `cad_obras` (`d_obras`) | `obra PK, localidade, contrato_id FK, zona, polo, dth_prev_termino, previsto_orcado` |
| `cad_regional` (`d_regional`) | `id, regional` |

Se o sistema novo precisar de um cadastro que não está nessa lista, ele provavelmente ainda não existe como `cad_` em lugar nenhum — antes de criar do zero, confirme com quem mantém o banco compartilhado se aquele dado já existe com nome legado (`d_...`) pra não nascer com estrutura diferente da mesma coisa.

## Nota lateral: renomear tabela existente

Se um dia for preciso renomear uma tabela que já existe (não é o caso comum — essa skill é pra nomear certo desde o início), lembre que `ALTER TABLE ... RENAME` atualiza sozinho FKs, índices, RLS policies e views (Postgres rastreia por OID, não por nome), mas **não** atualiza o corpo de functions PL/pgSQL/SQL que citam o nome da tabela como texto — essas precisam ser reescritas manualmente (`CREATE OR REPLACE FUNCTION` com o nome novo). Se o front-end usa embed do PostgREST (`.select('tabela(...)')`), a chave do JSON retornado muda junto com o nome da tabela — todo lugar que lê essa chave no código precisa mudar também.
