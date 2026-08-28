# Sistema Produção — Guia para IA

## Stack
React 18 + Vite + Supabase (PostgreSQL + Auth + RLS)

---

## Convenção de nomes — Supabase (schema public)

### Tabelas
| Prefixo | Domínio | Exemplos |
|---|---|---|
| `d_` | Dimensão (cadastros) | `d_contratos`, `d_equipes`, `d_colaboradores` |
| `d_auth_` | Autenticação/usuários | `d_auth_user`, `d_auth_roles` |
| `f_prod_` | Fato produção | `f_prod_registro`, `f_prod_atividades` |
| `config_` | Configurações do sistema | `config_campos`, `config_campos_contrato` |

### Views
Sempre usar prefixo `view_prod_` para views do domínio de produção.
Exemplos: `view_prod_registro`, `view_prod_relatorio_equipes`, `view_prod_relatorio_colaborador`

### Funções (RPC)
Sempre usar prefixo `fn_prod_` para funções do domínio de produção.
Exemplos: `fn_prod_exportar`, `fn_prod_dados_anuais`

> Ao sugerir ou criar qualquer view ou função nova, seguir esses prefixos obrigatoriamente.

---

## Equipes Faixa TO
- Contratos 17, 18 e 19 são todos "Faixa Tocantins"
- Equipes ficam em `d_equipes` com `contrato_id = 17`
- Busca de equipes sempre usa `contrato_id = 17` para os três contratos

## Coluna `origem`
Valores possíveis: `'sistema-claude'` | `'sistema-weweb'` | `'Coletum'`
Novos registros sempre recebem `origem: 'sistema-claude'`

## Paginação SQL
Queries paginadas exigem ORDER BY com: `registro_id`, `f_prod_atividade_id`, `equipe_id`

## Deploy
`cd producao-app && vercel deploy --prod`
URL produção: https://www.producao.dbmachado.com

> Deploy é feito direto do disco local via CLI — não depende de commit/push no Git.
> Antes de publicar, sempre commitar e dar `git push` primeiro, pra disco/GitHub/produção não ficarem dessincronizados.

## Changelog (Atualizações)
Toda mudança relevante publicada em produção deve ganhar uma entrada em
`producao-app/src/pages/Configuracoes/Atualizacoes.jsx` (array `VERSOES`):
hash do commit, data e resumo em tópicos do que mudou. A tela fica em
Configurações → Atualizações, visível só para `danilo@dbmachado.com`.
