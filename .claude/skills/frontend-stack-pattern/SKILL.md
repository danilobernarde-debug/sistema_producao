---
name: frontend-stack-pattern
description: >-
  Stack, layout de repositório, estrutura de pastas/arquivos, convenção de rotas e de idioma
  compartilhados entre os sistemas frontend da empresa do Danilo (Produção, Campo, Jurídico e
  próximos). Use sempre que for iniciar o repositório de um sistema novo, decidir onde um
  arquivo de página/hook/componente deve ficar, nomear uma rota nova, escolher entre
  português/inglês pro nome de uma variável ou função, ou quando o usuário perguntar como
  estruturar um sistema novo pra ficar parecido com os existentes. Não cobre banco de dados
  (ver supabase-schema-naming) nem visual/CSS (ver frontend-design-system).
---

# Stack e estrutura — sistemas frontend da empresa

Cada sistema novo é um repositório próprio, mas todos abrem do mesmo jeito por dentro — quem já mexeu em um acha as coisas nos mesmos lugares nos outros. As regras abaixo fixam o que deve se manter igual entre sistemas.

## Stack fixa

React (18/19) + Vite + `react-router-dom` v7 (`BrowserRouter`/`Routes`/`Route`/`Outlet`) + `@supabase/supabase-js`. `recharts` quando o sistema precisa de gráfico; `xlsx` só se precisar importar/exportar planilha. Não trocar o roteador, o client Supabase ou o bundler sem motivo forte específico do sistema novo — o ganho de manter igual (colar código de um sistema no outro sem adaptar) é maior que qualquer preferência pontual.

## Layout do repositório

```
<nome-do-sistema>/                  ← raiz do repo
├── CONTEXTO_PROJETO.md             ← modelo de dados + domínio + decisões (fonte da verdade pra quem/IA entra no projeto)
├── CHATBOT_CONTEXT.md              ← opcional: contexto pronto se o sistema for ter um chatbot de dados
├── vercel.json                     ← build apontando pra pasta do app
└── <nome-do-sistema>-app/          ← app Vite de verdade, com seu próprio package.json
    └── src/...
```

Não colocar `package.json`/código do app direto na raiz do repo — a raiz é pra documentação e config de deploy, o app fica isolado numa subpasta com o mesmo nome + `-app`.

## Estrutura de `src/`

```
src/
├── supabaseClient.js       ← client único; nada de instanciar de novo em outro arquivo
├── hooks/
│   ├── useAuth.jsx         ← .jsx porque o Provider retorna JSX
│   └── use<Dominio>.js     ← .js quando o hook não retorna JSX
├── components/              ← reutilizável entre 2+ páginas, PascalCase = nome do export default
└── pages/
    └── <Area>/              ← uma pasta por seção do menu lateral (Producao/, Relatorios/, Configuracoes/...)
        └── <Tela>.jsx
```

Regra prática: se o componente só é usado numa página, ele pode morar dentro da própria página (ou em `components/` mesmo assim, se o arquivo já está grande) — mas assim que uma segunda tela precisar dele, sobe pra `components/`.

## Convenção de rotas

Path em `kebab-case`, em português, no vocabulário do negócio: `/producao/novo`, `/configuracoes/tipos-equipe`, não `/production/new` nem `/configuracoes/tiposEquipe`. Toda rota autenticada entra dentro de uma única rota-layout (`RotaProtegida`) que resolve loading/redirect uma vez só. `App.jsx` é a lista única de rotas — um `import` + uma linha `<Route>` por tela, sem geração dinâmica; é o arquivo que qualquer pessoa abre primeiro pra saber "quais telas esse sistema tem".

## Convenção de idioma no código

- **Português**: tudo que é vocabulário do negócio ou da UI — nome de variável de estado, nome de função de ação, prop de componente, path de rota, texto de label (`usuario`, `perfil`, `carregando`, `entrar`, `sair`, `salvar`, `excluir`, `buscar`, `colaboradores`).
- **Inglês**: tudo que é idioma técnico genérico do ecossistema React/JS — prefixo `use` de hook, prefixo `handle` de handler de evento, nomes vindos de biblioteca (`children`, `onClick`).
- Não misture as duas dentro do mesmo conceito: não traduza `handleClick` pra `manipularClique`, e não escreva o nome de uma entidade de negócio em inglês (`teams` em vez de `equipes`) só porque "fica mais técnico". A mistura consistente é o padrão, não uma inconsistência a corrigir.

## Lint

Eslint flat config como ponto de partida pra copiar:
```js
extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite]
```

## Deploy (Vercel)

Um dos dois — nunca os dois competindo no mesmo repo:
- `vercel.json` **na raiz do repo**, com `buildCommand` entrando na subpasta do app (`cd <app> && npm install && npm run build`), `outputDirectory` apontando pra `<app>/dist`, e fallback de SPA (`routes: [{ "handle": "filesystem" }, { "src": "/.*", "dest": "/index.html" }]`).
- OU `vercel.json` **dentro da subpasta do app**, só com `rewrites` de SPA fallback (`{ "source": "/(.*)", "destination": "/index.html" }`), usado quando o "Root Directory" do projeto já está configurado como a subpasta direto no painel da Vercel.

## Exemplos

**Input:** "Vou começar o repo do sistema de Estoque do zero."
**Output:** Raiz com `CONTEXTO_PROJETO.md` + `vercel.json`; código em `estoque-app/` criado com `npm create vite@latest estoque-app -- --template react`; `src/supabaseClient.js`, `src/hooks/useAuth.jsx`, `src/components/`, `src/pages/<Area>/` seguindo a mesma estrutura.

**Input:** "Onde coloco um hook que busca os itens do estoque, só usado numa tela?"
**Output:** `src/hooks/useItensEstoque.js` (sem JSX, então `.js`) mesmo sendo usado só numa tela — hooks sempre em `hooks/`, a regra de "só sobe se reusar" vale pra `components/`, não pra `hooks/`.

## Nota lateral: quando divergir é certo

Nem todo sistema precisa de todas as peças (nem todo sistema vai ter gráfico, nem todo sistema precisa de exportação de planilha). Divergir da lista de dependências ou pular uma pasta que não faz sentido pro domínio é normal — o que não deve divergir sem motivo é *onde* as coisas ficam quando existem (a estrutura), não *o que* existe.
