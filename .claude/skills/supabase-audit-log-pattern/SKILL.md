---
name: supabase-audit-log-pattern
description: >-
  Padrão de auditoria e histórico de alteração compartilhado entre os sistemas da empresa
  do Danilo no mesmo projeto Supabase (Projeto-produção, ref giendnvcmkaqdminmeyz). Cobre as
  colunas de auditoria que toda tabela transacional nova deve ter, o trigger que as
  preenche sozinho, a tabela única audit_log compartilhada entre todos os sistemas, e
  colunas geradas pra valor calculado. Use esta skill sempre que criar uma tabela nova que
  vai ser editada depois de criada (não é só cadastro estático), sempre que adicionar uma
  coluna calculada, ou quando o usuário perguntar como registrar quem alterou um registro
  ou como dar histórico/log pra uma tabela nova.
---

# Auditoria de alterações — Supabase compartilhado

Quem mudou esse registro, quando, e o que era antes? Em vez de cada sistema inventar seu próprio log, o projeto tem uma única tabela `audit_log` alimentada por trigger — qualquer sistema novo entra nesse mesmo mecanismo em vez de criar um paralelo.

## O que toda tabela transacional nova leva

Colunas fixas, sempre preenchidas por trigger, nunca pelo valor que o frontend manda:

| Coluna | Tipo | Preenchida por |
|---|---|---|
| `criado_em` | timestamptz | default `now()` |
| `criado_por_id` | uuid (FK auth.users) | valor enviado no insert (é o único momento em que vem do client, porque é o próprio usuário logado criando) |
| `atualizado_em` | timestamptz | trigger `BEFORE UPDATE` |
| `atualizado_por_id` | uuid | trigger `BEFORE UPDATE`, via `auth.uid()` |

Se o frontend mandar `atualizado_em`/`atualizado_por_id` no payload de um update, ignore/sobrescreva — quem garante que esses dois campos são verdade é sempre o trigger, nunca o cliente.

Trigger padrão (nome: `trg_auto_update_<tabela>`):
```sql
create trigger trg_auto_update_<tabela>
before update on <tabela>
for each row execute function auto_update_auditoria();
```

## A tabela `audit_log` — uma só pra todos os sistemas

```
audit_log (id, table_name, operation_type, old_data jsonb, new_data jsonb, changed_at, changed_by, id_ref, contrato)
```

- É infraestrutura, não dado de negócio de um sistema — por isso não leva prefixo de sistema (mesma lógica de `cad_`/`auth_` na skill supabase-schema-naming: existe pra todos, então fica neutra).
- Um sistema novo **não cria seu próprio `audit_log`** — as tabelas dele que precisam de histórico ganham um trigger `audite.<tabela>` que grava nessa mesma tabela compartilhada, diferenciando pela coluna `table_name`.
- `old_data`/`new_data` guardam a linha inteira em jsonb (via `to_jsonb(old)`/`to_jsonb(new)`) — não colunas específicas, então o trigger não precisa mudar se a tabela ganhar uma coluna nova depois.
- Consultar auditoria de uma tabela do sistema novo: `select * from audit_log where table_name = '<tabela>' order by changed_at desc`.

## Colunas geradas — valor que o banco calcula, não o frontend

Quando um valor é sempre derivado de outras colunas da mesma linha, prefira `generated always as (...) stored` a confiar que o frontend calcula certo:

```sql
valor_total numeric generated always as (quantidade * preco_upe * upe + adicional) stored
```

Mantenha uma lista visível (no README/CONTEXTO do sistema novo, do jeito que este projeto mantém em `CONTEXTO_PROJETO.md`) de quais campos são "não editar no front" — toda coluna gerada ou atualizada por trigger entra nessa lista, pra quem mexe no formulário saber que não precisa (e não deve) mandar esse campo no payload.

## Passo a passo pra tabela nova

1. A tabela é editada depois de criada (não é só cadastro que praticamente não muda)? Se sim, leva as 4 colunas de auditoria da tabela acima.
2. Precisa de histórico completo de alteração (não só "quando/quem foi a última vez")? Adiciona o trigger `audite.<tabela>` apontando pro `audit_log` compartilhado — não cria tabela de log própria.
3. Algum campo é sempre derivado de outros campos da mesma linha? Vira coluna `generated always as`, não campo editável.
4. Documenta a lista de "não editar no front" no doc do sistema novo.

## Exemplos

**Input:** "Tabela nova `estoque_movimentacoes` pro sistema de Estoque — precisa saber quem mexeu."
**Output:** Adiciona `criado_em, criado_por_id, atualizado_em, atualizado_por_id` + trigger `trg_auto_update_estoque_movimentacoes`; se quiser histórico completo de old/new, adiciona `audite.estoque_movimentacoes` gravando no `audit_log` já existente — não cria `estoque_audit_log`.

**Input:** "Quero um campo `saldo_final` que é sempre `saldo_inicial + entradas - saidas`."
**Output:** Coluna `generated always as (saldo_inicial + entradas - saidas) stored` — nunca aceitar esse valor vindo do formulário.

## Nota lateral: `audit_log` compartilhado tem trade-off

Como é uma tabela só pra todos os sistemas, ela cresce rápido e não tem prefixo — não dá pra aplicar RLS por sistema nela do mesmo jeito que numa tabela `cad_`/de sistema. Se um sistema novo precisar que usuários comuns (não super admin) consultem o próprio histórico, filtre por `table_name` + confira se a policy de leitura do `audit_log` já cobre esse caso antes de assumir que cobre.

## Nota lateral: banco separado ainda cria `audit_log` com a mesma estrutura

Se o sistema novo estiver num projeto Supabase separado (sem acesso ao `audit_log` compartilhado), crie um `audit_log` local com exatamente as mesmas colunas (`id, table_name, operation_type, old_data, new_data, changed_at, changed_by, id_ref, contrato`) e o mesmo mecanismo de trigger `audite.<tabela>`. Isso não junta os dados agora, mas garante que uma unificação futura seja um `insert ... select` direto de uma tabela pra outra, sem precisar remapear coluna nem reescrever os triggers que alimentam o log.
