---
name: supabase-auth-pattern
description: >-
  Padrão de autenticação e permissões compartilhado entre os sistemas da empresa do Danilo
  que rodam sobre o mesmo projeto Supabase (Projeto-produção, ref giendnvcmkaqdminmeyz —
  hoje Produção, Campo e Jurídico). Cobre a relação entre o Supabase Auth, o perfil
  espelhado compartilhado, o papel global do usuário e a permissão fina de cada sistema, além
  do contrato do AuthProvider/useAuth em React. Use esta skill sempre que for implementar
  login num sistema novo, decidir como checar se um usuário pode ver/editar algo, criar uma
  policy de RLS numa tabela nova, criar tela de administração de usuários, ou quando o
  usuário perguntar como replicar o login/permissões de um sistema existente num sistema
  novo. Para saber como nomear as tabelas envolvidas, use junto a skill supabase-schema-naming.
---

# Padrão de autenticação e permissões — Supabase compartilhado

Todos os sistemas da empresa autenticam contra o **mesmo** Supabase Auth — a mesma pessoa usa o mesmo e-mail/senha em Produção, Campo, Jurídico ou num sistema novo. O que muda de sistema pra sistema é só a permissão fina (o que essa pessoa pode ver/editar *dentro* daquele sistema). As regras abaixo definem como isso se organiza em camadas, pra um sistema novo plugar na identidade existente sem reinventar login nem vazar acesso.

## As quatro camadas

| Camada | Onde mora | O que responde |
|---|---|---|
| 1. Auth nativo | `auth.users` (gerenciado pelo Supabase) | "essa credencial é válida?" |
| 2. Perfil espelho compartilhado | tabela `auth_` (legado: `d_auth_user`) | "quem é essa pessoa, ela é super admin?" |
| 3. Papel global | tabela `auth_` (legado: `d_auth_roles`) | "qual o papel amplo dela na empresa?" |
| 4. Permissão fina | tabela própria do sistema (`<prefixo>_usuarios_permissoes`) | "o que ela pode fazer *neste* sistema?" |

Nunca pule a camada 2/3 pra colocar permissão fina direto em `auth_` — isso já é regra da skill supabase-schema-naming (seção 3), repetida aqui porque é o erro mais comum ao montar auth de um sistema novo.

## Passo a passo pra montar auth num sistema novo

**1. Login** — sempre `supabase.auth.signInWithPassword({ email, password })`. Nunca criar tabela própria de senha; nunca reimplementar hash/sessão manualmente.

**2. Buscar perfil ao logar** — uma query só, com o join do papel:
```js
const { data } = await supabase
  .from('d_auth_user') // ou auth_user, se o sistema recriar do zero
  .select('*, d_auth_roles(name)')
  .eq('uuid', session.user.id)
  .single()
```

**3. Permissão fina** — criar UMA tabela nova do sistema (nome pela regra 3 da skill supabase-schema-naming: `<prefixo>_usuarios_permissoes`), tipicamente `user_uuid + <recurso>_id + flags (read/insert/update/delete)` — copie o formato de `d_auth_contratos` (`user_uuid, contrato_id, insert, read, update, delete`) trocando `contrato_id` pelo recurso que faz sentido pro sistema novo.

**4. RLS em toda tabela do sistema novo** — a policy sempre precisa checar o bypass de super admin OU a permissão fina, nessa ordem:
```sql
using (
  exists (select 1 from d_auth_user u where u.uuid = auth.uid() and u.is_super_admin)
  or exists (select 1 from <prefixo>_usuarios_permissoes p where p.user_uuid = auth.uid() and p.<recurso>_id = <tabela>.<recurso>_id and p.read)
)
```
Esquecer o bypass de super admin é o bug mais comum ao copiar isso pra um sistema novo — sem ele, o super admin fica travado igual um usuário comum.

**5. Criar usuário novo** — nunca pelo client com a service role key (isso exigiria expor a service key no frontend). Sempre por uma function `SECURITY DEFINER` chamada via RPC:
```js
await supabase.rpc('criar_usuario_auth', { p_email, p_senha, p_nome, p_role_id })
```
Um sistema novo pode reusar a mesma RPC (é compartilhada, cria em `auth.users` + no perfil espelho) ou criar a sua só se precisar de campos extras que a RPC atual não aceita.

## Contrato do React — AuthProvider/useAuth

Replique literalmente essa interface em qualquer sistema novo, mesmo trocando detalhes de backend — é o que permite copiar telas/hooks de um sistema pro outro sem adaptar nomes:

```js
const { usuario, perfil, carregando, entrar, sair, atualizarPerfil } = useAuth()
```

- `usuario` — objeto cru do `supabase.auth` (sessão). `perfil` — a linha da tabela de perfil espelho + role. `carregando` — true até a primeira checagem de sessão resolver.
- `entrar(email, senha)` — chama `signInWithPassword`, retorna o `error` (não lança exceção). Se quiser log de login, insira uma linha na tabela de log (legado: `d_login_log`) só quando o login der certo.
- `sair()` — `supabase.auth.signOut()`.
- `atualizarPerfil(dados)` — merge otimista no estado local depois de um update na tabela de perfil (evita reconsultar o banco só pra refletir um campo que acabou de salvar).
- Montagem: `supabase.auth.getSession()` uma vez + assinar `onAuthStateChange` pra manter sincronizado entre abas; sempre desinscrever no cleanup do `useEffect`.

## Guarda de rota

- `RotaProtegida` — componente de layout: `carregando` → spinner; sem `usuario` → `<Navigate to="/login" />`; senão renderiza o shell (sidebar + `<Outlet />`).
- `RotaSuperAdmin` / `Rota<Papel>` — wrapper que redireciona se `perfil?.<tabela_roles>?.name` não bater com o esperado. Use isso pra qualquer rota restrita por papel.
- Restrição por e-mail específico direto no código (`usuario?.email !== 'fulano@empresa.com'`) é um escape hatch aceitável só pra caso pontual de uma pessoa (ex: uma tela de auditoria interna só do dono do sistema) — não é o mecanismo geral, que é sempre papel/permissão.

## Outras peças do padrão

- **Troca de senha**: direto do client, sem endpoint próprio — `supabase.auth.updateUser({ password: novaSenha })`.
- **Foto de perfil**: bucket do Storage `user_photos`, path `${uuid}.${extensao}`, upload com `upsert: true`, salva `getPublicUrl(...).publicUrl` de volta na coluna `foto_url` do perfil.

## Sistema com banco Supabase separado (ainda fora do compartilhado)

Se o sistema novo não entrar no mesmo projeto Supabase (`giendnvcmkaqdminmeyz`) — banco/projeto próprio, por exemplo por isolamento de dados —, ele não tem acesso ao `auth.users` nem ao perfil espelho compartilhados. Mesmo assim, **crie as tabelas equivalentes localmente com a mesma estrutura**, não um formato próprio:

- Perfil: mesmos nomes/tipos de coluna do `d_auth_user` (`uuid, role_id, nome, email, is_super_admin, foto_url`).
- Papel: mesmos nomes/tipos do `d_auth_roles` (`id, name`).

O objetivo não é economizar trabalho agora — é que, se um dia esse banco for unificado com o compartilhado, a tabela já bate estrutura com estrutura: a migração vira um `insert`/`union` direto, em vez de remapear coluna por coluna. Documente a decisão de manter banco separado (não é o padrão default) no `CONTEXTO_PROJETO.md` do sistema novo, pra quem entrar depois entender que foi escolha, não esquecimento.

O que não dá pra replicar só copiando a estrutura: login deixa de ser automático entre sistemas (cada projeto Supabase tem seu próprio `auth.users`), então a mesma pessoa provavelmente vai ter um `uuid` diferente em cada banco. Ao unificar, isso precisa ser resolvido explicitamente (ex: casar contas por `email` e escolher um `uuid` canônico) — não é algo que a estrutura igual resolve sozinha.

## Exemplos

**Input:** "Sistema novo de Estoque vai ter login — como monto isso?"
**Output:** Login pela mesma `signInWithPassword` compartilhada; ao logar, busca o perfil em `d_auth_user` (mesma tabela de todos os sistemas); cria `estoque_usuarios_permissoes` pra controlar o que cada usuário vê dentro do Estoque; toda policy de RLS do Estoque checa `is_super_admin` OU essa tabela nova.

**Input:** "Como faço a tela de admin criar um usuário novo pro sistema de Estoque?"
**Output:** Não chamar API admin do Supabase pelo client. Usar/reaproveitar a RPC `criar_usuario_auth` (ou criar uma nova `SECURITY DEFINER` só se precisar de campos que ela não cobre), chamada via `supabase.rpc(...)`.

## Nota lateral: RLS não é opcional

Nenhuma tabela nova — nem `cad_`, nem `auth_`, nem de um sistema só — deve ficar sem RLS habilitado esperando que o frontend "só não mostre" o dado. A permissão real é sempre policy no banco; o frontend só reflete o que a policy já deixaria passar.
