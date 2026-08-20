---
name: new-system-standards-checklist
description: >-
  Checklist de entrada pra começar um sistema novo que vai compartilhar o mesmo projeto
  Supabase da empresa do Danilo (Projeto-produção, ref giendnvcmkaqdminmeyz) e precisa
  integrar bem com Produção, Campo, Jurídico e os próximos sistemas. Use sempre que o
  usuário disser que vai começar um sistema novo, perguntar "como monto um sistema igual
  aos outros" ou "quais padrões eu sigo antes de escrever a primeira linha" de um sistema
  novo. Esta skill não define regra nenhuma sozinha — ela aponta, na ordem certa, pra qual
  das outras skills de padrão usar em cada etapa.
---

# Começando um sistema novo — checklist

Este projeto Supabase é compartilhado por vários sistemas da mesma empresa. Cada peça do padrão (nome de tabela, auth, estrutura de código, visual, auditoria) vive na sua própria skill — esta aqui é só o mapa de qual usar em qual momento, pra nenhuma etapa ficar esquecida quando alguém começa um sistema do zero.

## Ordem recomendada

1. **Nome e prefixo do sistema** → skill `supabase-schema-naming`. Primeira coisa a decidir, antes de criar qualquer tabela — registre o prefixo novo na tabela de registro daquela skill.
2. **Repositório e stack** → skill `frontend-stack-pattern`. Layout do repo, pastas de `src/`, convenção de rota e de idioma, deploy.
3. **Login e permissões** → skill `supabase-auth-pattern`. O sistema novo reaproveita a identidade compartilhada (Supabase Auth + perfil espelho) e cria só a tabela de permissão fina dele.
4. **Cada tabela nova, à medida que for criando** → skill `supabase-schema-naming` (nome) + skill `supabase-audit-log-pattern` (colunas de auditoria, trigger, se entra no `audit_log` compartilhado).
5. **Visual** → skill `frontend-design-system`. Tokens de cor, vocabulário de classes, componentes genéricos (`TabelaCRUD`, `SelectPesquisavel`, `Modal`, `CampoDinamico`) antes de estilizar telas na mão.

## Por que isso existe

Sistemas separados que seguem o mesmo padrão custam menos pra integrar depois — um relatório cruzando dados de dois sistemas, um chatbot que lê de vários, ou só uma pessoa que troca de projeto e já sabe onde tudo fica. É o mesmo raciocínio da skill de nomenclatura de tabela aplicado a todo o resto do sistema, não só ao banco.

## Levando as skills pro repositório do sistema novo

Essas skills (incluindo esta) vivem em `.claude/skills/` neste repositório (`sistema_producao`). Um sistema novo é um repositório separado — copie as pastas de skill relevantes pra dentro do `.claude/skills/` dele (ou importe os arquivos `.skill` equivalentes) pra que fiquem disponíveis também nas sessões daquele projeto, em vez de depender de lembrar as regras de cabeça.

## Quando divergir é certo

Nem tudo precisa ser compartilhado. A pergunta chave (já em `supabase-schema-naming`) vale pro resto também: "se um sistema novo surgisse amanhã, ele plausivelmente reaproveitaria essa peça?" Se a resposta é claramente não — é uma tela, uma lógica ou uma tabela que só faz sentido nesse sistema — construa específico, sem generalizar por antecipação. O padrão existe pra reduzir custo de integração, não pra forçar todo sistema a parecer idêntico em tudo.

## Exemplo

**Input:** "Vou começar o sistema de Estoque. Por onde eu começo?"
**Output:** 1) escolher prefixo `estoque_` e registrar na skill de nomenclatura; 2) criar o repo com `CONTEXTO_PROJETO.md` + `vercel.json` + `estoque-app/` na estrutura padrão; 3) plugar login na identidade compartilhada e criar `estoque_usuarios_permissoes`; 4) ao criar `estoque_itens`, `estoque_movimentacoes` etc., seguir nomenclatura + colunas de auditoria; 5) copiar `index.css` de outro sistema como ponto de partida e trocar só as cores.
