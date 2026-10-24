import { useNavigate } from 'react-router-dom'

// Cada entrada é uma versão publicada. Mais recente primeiro.
// Ao fazer uma mudança relevante no sistema, adicionar uma entrada nova aqui.
const VERSOES = [
  {
    versao: 'a7ba821',
    data: '2026-10-24',
    resumo: 'Planejamento: o mapa mostra só os veículos da regional Goiás',
    itens: [
      'A camada "Veículos" dos mapas RMB, RIP e MEC passou a listar apenas os rastreadores da regional Goiás do Frotas (hoje 3 veículos). O filtro é feito na função api/frota-veiculos.js, então veículos de outras regionais nem chegam ao navegador; o trajeto de um veículo de outra regional é recusado',
      'Para incluir outras regionais (ex.: Goianésia, id 6), definir FROTA_REGIONAIS=1,6 nas variáveis da Vercel e publicar de novo',
    ],
  },
  {
    versao: 'ca59208',
    data: '2026-10-24',
    resumo: 'Planejamento: veículos rastreados (Frotas) no mapa, com posição ao vivo e trajeto do dia',
    itens: [
      'Os mapas RMB, RIP e MEC ganharam a camada "🚚 Veículos" (menu de camadas, canto superior direito, ligada por padrão): mostra a última posição de cada veículo rastreado do sistema Frotas, com a placa e a cor da situação (verde em movimento, amarelo parado, cinza sem sinal há mais de 30 min). A posição atualiza sozinha a cada 30 segundos',
      'Clicar no veículo abre situação, velocidade, último sinal, modelo, motorista, equipe e operação. Escolhendo um dia e clicando em "Ver trajeto", o mapa desenha o percurso do dia, com início, último ponto e as paradas (com o tempo parado); o botão "Limpar" remove o trajeto',
      'Os dados vêm do Supabase do Frotas (outro banco). O navegador não fala direto com ele: a função api/frota-veiculos.js confere o login da Produção (usuário ativo) e consulta o Frotas com um usuário dedicado, somente leitura (mapa-planejamento@dbmachado.com, papel MOTORISTA, sem acesso a colaboradores/RH). IMEI e telefone dos rastreadores não são enviados à tela',
      'Vercel: variáveis FROTA_SUPABASE_URL, FROTA_SUPABASE_ANON_KEY, FROTA_USER_EMAIL e FROTA_USER_PASSWORD. Código da camada em public/frota-veiculos.js, compartilhado pelos três mapas',
    ],
  },
  {
    versao: 'eb7dff9',
    data: '2026-10-21',
    resumo: 'Pagamento por disponibilidade: cadastro mensal por equipe e calendário de dias trabalhados',
    itens: [
      'Configurações → Atividades ganhou a aba "Disponibilidade": por equipe e mês, o Super Admin cadastra os dias de disponibilidade e o valor mensal (ex.: Recolha Poda e Faixa MT, R$ 75.000,00). A tabela mostra valor do dia, dias lançados e faturamento de cada mês, com aviso de mês sem cadastro e de dias a mais que o previsto',
      'Nova tela Produção → Disponibilidade (botão na lista de Registros): o operador escolhe a equipe e o mês, marca os dias trabalhados no calendário e salva. Cada dia vira um registro normal com a atividade de disponibilidade; desmarcar apaga o dia. Dia futuro não pode ser marcado',
      'Valor do dia = valor mensal ÷ dias de disponibilidade, calculado no banco com os centavos distribuídos: o mês completo fecha exatamente no valor mensal e dias faltantes descontam só o próprio dia. Editar o cadastro do mês recalcula os dias já lançados',
      'Mais dias que o previsto: o sistema avisa mas permite. Mês sem cadastro: permite marcar, o valor fica R$ 0,00 até o cadastro existir',
      'Atividades: novo campo "Pago por disponibilidade" marca a atividade que usa esse cálculo (atividade 4842 Disponibilidade, contrato Poda e Faixa MT)',
      'Banco: tabela d_equipes_disponibilidade, view view_prod_disponibilidade_mes, funções fn_prod_*disponibilidade* e triggers trg_prod_disp_*. Script aplicado: supabase/disponibilidade_equipe_21_10_2026.sql',
    ],
  },
  {
    versao: '9ee98bf',
    data: '2026-10-16',
    resumo: 'Usuários: botão Ativar/Desativar e bloqueio de login para usuário inativo',
    itens: [
      'Configurações → Usuários ganhou o botão "Desativar Usuário" / "Ativar Usuário" (pede confirmação ao desativar); a lista mostra a etiqueta "Inativo" e esmaece a linha. O botão fica bloqueado no próprio usuário logado',
      'Usa a função definir_status_usuario do banco, que marca d_auth_user.ativo e também bane a conta no Supabase Auth, bloqueando o login até por chamada direta à API',
      'Tela de Login: conta bloqueada mostra "Usuário desativado. Procure o administrador do sistema." em vez de "E-mail ou senha incorretos"',
      'Quem já estava logado e tem ativo = false é desconectado ao carregar o perfil',
      'Usuários que já estavam marcados como inativos sem bloqueio no Auth passam a ser barrados pelo app via ativo = false; para banir também no Auth, usar Ativar e depois Desativar neles em Configurações → Usuários',
    ],
  },
  {
    versao: '18e027b',
    data: '2026-10-16',
    resumo: 'Permissões: Super Admin passa a ser decidido só pelo perfil, não pela coluna is_super_admin',
    itens: [
      'Corrige o erro de política de segurança em nível de linha ao cadastrar subestação: parte dos Super Admins tinha a coluna is_super_admin nula e era bloqueada',
      'Policies e funções do banco passaram a reconhecer Super Admin só pelo perfil (d_auth_roles.name); a coluna is_super_admin é ignorada em todo o banco',
      'Vale para as tabelas de cadastro e configuração (subestações, campos, preço fixo) e para os módulos de obra e judicial: o acesso de Super Admin passa a seguir o perfil',
      'Scripts aplicados: supabase/remover_is_super_admin_producao_16_10_2026.sql e supabase/remover_is_super_admin_campo_judicial_16_10_2026.sql',
    ],
  },
  {
    versao: '9201c1e',
    data: '2026-10-02',
    resumo: 'Atividades: opção "Todas" fixa no Grupo Equipe e correção do erro ao salvar sem grupo',
    itens: [
      'Campo "Grupo Equipe (opcional)" ganhou a opção "Todas", fixa na primeira linha da lista mesmo ao rolar ou pesquisar',
      '"Todas" grava 0, valor que Novo Registro e Editar Registro já tratam como "aparece para todos os tipos de equipe"; o item "Desativada" (id 0) saiu da lista para não duplicar',
      'Corrige erro 400 ao salvar atividade com o grupo vazio (a coluna tipo_equipe_id não aceita vazio); atividade nova já começa com "Todas"',
      'Importação XLSX: tipo_equipe_id em branco passa a gravar 0 (Todas) em vez de falhar',
    ],
  },
  {
    versao: '2827a11',
    data: '2026-10-02',
    resumo: 'Dashboard: Análise Mensal com cabeçalho dos meses fixo e tela cheia sem rolar a página',
    itens: [
      'Na aba Análise Mensal, a linha dos meses fica fixa no topo e a barra de rolagem horizontal fica sempre visível: a tabela tem a altura da tela e rola por dentro',
      'Em tela cheia, a página ocupa exatamente a tela: cabeçalho, filtros e abas ficam fixos e só o conteúdo da aba rola (na Análise Mensal, só a tabela)',
    ],
  },
  {
    versao: 'd972b29',
    data: '2026-10-02',
    resumo: 'Novo relatório "Colaboradores por Equipe" na Exportação de Dados',
    itens: [
      'Relatórios → Exportação ganhou o card "Colaboradores por Equipe": colunas Data, Equipe, Matrícula, Nome e Valor Produção, 1 linha por colaborador por dia por equipe',
      'Valor Produção vem do valor_por_colaborador da view_prod_relatorio_colaborador (via fn_prod_relatorio_colaboradores): só atividades com bonificação, dividido pelos colaboradores do registro; soma quando há mais de um registro no dia/equipe',
      'Filtros de período e contrato, mais filtros dinâmicos iguais ao Relatório Geral (Equipe, Matrícula, Nome, Valor Produção), aplicados sem recarregar',
      'Exportação em XLSX com a data em formato de data e o valor como número',
    ],
  },
  {
    versao: 'd665d6c',
    data: '2026-09-29',
    resumo: 'Corrige R$ 1,00 indevido nas justificativas e remove o trigger de UPE',
    itens: [
      'Justificativas apareciam com R$ 1,00 no Dashboard e nos registros: o UPE delas estava NULL no cadastro e a fórmula de valor_total trata UPE NULL como 1',
      'As 32 atividades de justificativa passaram a ter UPE = 0 em d_atividades, e nenhum lançamento de justificativa ficou com valor diferente de 0',
      'Removido o trigger trigger_atualizar_upe de f_prod_atividades: Novo Registro e Editar Registro já gravam upe e preco_upe calculados (preço fixo por vigência, justificativa 0, tipo UPE pelo cadastro)',
      'Após a correção, clicar em Atualizar no Dashboard para renovar o cache',
    ],
  },
  {
    versao: '71a6cc6',
    data: '2026-09-29',
    resumo: 'UPE exibido com até 6 casas decimais nos registros de produção',
    itens: [
      'Novo Registro e Editar Registro passam a mostrar o UPE com até 6 casas (mínimo de 2), em vez de 4, refletindo o valor real gravado em f_prod_atividades.upe',
    ],
  },
  {
    versao: '82a1e33',
    data: '2026-09-29',
    resumo: 'Preço fixo por atividade aceita até 6 casas decimais',
    itens: [
      'Tela Configurações → Atividades → Preço Fixa deixa de arredondar o valor em 2 casas: grava e exibe até 6 casas (mínimo de 2 na exibição)',
      'Coluna valor de d_atividades_preco_fixo alargada de numeric(12,2) para numeric(12,6), igual à coluna upe de f_prod_atividades',
    ],
  },
  {
    versao: 'dashboard-v9',
    data: '2026-09-16',
    resumo: 'Corrige valores e cache do Dashboard de Produção',
    itens: [
      'Valores monetários do Dashboard agora usam o valor_producao oficial retornado pelo banco, corrigindo diferenças causadas pelo recálculo de UPE × preço × quantidade',
      'A auditoria por mês e equipe confirmou todos os 11.311 itens de atividade de 2026 e corrigiu uma diferença total de R$ 118,69',
      'O cache não expira mais automaticamente depois de 3 horas: permanece salvo por ano até o usuário clicar em Atualizar',
      'Cache migrado para IndexedDB e atualizado para a versão v9: o volume anual ocupa cerca de 9 MB e excedia o limite do localStorage, fazendo os dados serem baixados novamente a cada abertura',
    ],
  },
  {
    versao: '939043e',
    data: '2026-09-16',
    resumo: 'Corrige Dashboard sem dados (Painel Principal / Análise Mensal)',
    itens: [
      'A view materializada por trás da função fn_prod_dados_anuais parou de ser atualizada em 18/06/2026 — as abas Painel Principal e Análise Mensal do Dashboard vinham mostrando zero produção pra qualquer período, não só setembro',
      'Fonte de dados trocada pra fn_prod_relatorio_equipes (mesma função em tempo real já usada na aba Produção Detalhada)',
      'Cache do navegador (sessionStorage) invalidado pra quem já tinha o resultado vazio salvo como se fosse válido',
    ],
  },
  {
    versao: '24d0c57',
    data: '2026-09-12',
    resumo: 'Libera campo UPE da atividade, só pra Tipo = UPE',
    itens: [
      'd_atividades.upe estava marcado como somente leitura, o que o excluía do formulário e do que era salvo — não dava pra cadastrar esse valor pra nenhuma atividade, nem as do Tipo UPE, que dependem dele pra calcular o valor do lançamento',
      'Campo "UPE da atividade" agora aparece no formulário só quando Tipo = UPE, e é obrigatório nesse caso',
      'Tooltip de ajuda dos campos passa a respeitar quebras de linha no texto',
    ],
  },
  {
    versao: '10599aa',
    data: '2026-09-12',
    resumo: 'Corrige erro de permissão em Bonificações',
    itens: [
      'Bonificações consultava a view_prod_relatorio_colaborador diretamente, cujo acesso foi revogado numa migração de segurança anterior — passou a dar "permission denied for view" pra qualquer usuário',
      'Agora usa a função fn_prod_relatorio_colaboradores (mesma RPC segura que o Painel de Equipes já usa)',
    ],
  },
  {
    versao: 'b69d715',
    data: '2026-09-12',
    resumo: 'Ícone de ajuda no Painel de Equipes',
    itens: [
      'Explica como PARADO e PARALISADA são calculados, as faixas de cor por % da meta, o período padrão e os ícones de cada card',
    ],
  },
  {
    versao: '03a3b56',
    data: '2026-09-12',
    resumo: 'Grupo Equipe vira select e Contrato obrigatório condicional em Atividades',
    itens: [
      'Campo "Grupo Equipe (opcional)" deixa de ser número livre e passa a ser select pesquisável com as opções de d_tipo_equipe',
      'Contrato passa a ser obrigatório ao cadastrar/editar atividade, exceto quando Tipo = Justificativa',
      'Importação por XLSX aplica a mesma regra: bloqueia o import inteiro e lista as linhas sem contrato quando tipo_preco é upe ou fixo',
    ],
  },
  {
    versao: '985beff',
    data: '2026-09-12',
    resumo: 'Mantém contrato selecionado ao ir de Preço Fixo pra Reajuste',
    itens: [
      'Botão "Reajuste de Preço Fixo" leva o contrato selecionado via query string, que a tela de Reajuste já lê na inicialização',
      'Ícone de ajuda ao lado do título de Reajuste de Preço Fixo, abrindo modal com a explicação — substitui o card de aviso fixo abaixo do título',
    ],
  },
  {
    versao: 'a7edff8',
    data: '2026-09-12',
    resumo: 'Resumo em PDF/imagem no lançamento e correção da impressão',
    itens: [
      'Ações "Resumo (PDF)" e "Resumo (imagem)" em cada lançamento de produção, substituindo a antiga ação "Imprimir"',
      'A impressão (window.print) tinha um bug de paginação: containers flex não quebram entre páginas, jogando todo o conteúdo pra folha 2',
      'Mantido fix de @media print (display:block nesses containers) pra impressão manual via Ctrl+P',
    ],
  },
  {
    versao: '15c80b7',
    data: '2026-09-12',
    resumo: 'Restaura Painel de Equipes e enriquece Produção Detalhada no Dashboard',
    itens: [
      'Nova tela /relatorios/painel: status de cada equipe (parada, paralisada, % da meta) no período, com colaboradores e justificativas/observações',
      'Aba "Produção Detalhada" do Dashboard: agrupamento por contrato, dias trabalhados, encarregado, meta e % de atingimento por equipe, colaboradores expansíveis',
    ],
  },
  {
    versao: 'd5906d1',
    data: '2026-09-04',
    resumo: 'Tabela renomeada: d_atividades_preco_fixa → d_atividades_preco_fixo',
    itens: [
      'Renomeação aplicada direto no banco (com correção da função do trigger que resolve o preço vigente no lançamento)',
      'Sem impacto visível pra quem usa o sistema — só organização interna do banco',
    ],
  },
  {
    versao: '60c57f3',
    data: '2026-09-04',
    resumo: 'Trava no banco contra cadastro errado de Tipo e LM/LV em Atividades',
    itens: [
      'd_atividades.tipo_preco só aceita upe, fixo ou justificativa; tipo_lm_lv só aceita LM ou LV',
      'Protege principalmente a importação por XLSX, que aceitava qualquer texto nessas colunas — agora um erro de digitação é barrado na hora em vez de entrar errado silenciosamente',
    ],
  },
  {
    versao: 'f561f46',
    data: '2026-09-04',
    resumo: 'Correção crítica: lançamento de produção estava salvando sem atividade',
    itens: [
      'Um trigger do banco (atualizar_is_justificativa) ainda dependia da coluna d_atividades.referencia_codigo, removida anteriormente — isso bloqueava toda inserção de atividade em Novo Registro/Editar Registro, silenciosamente',
      'Corrigido o trigger direto no banco (sql_corrigir_trigger_is_justificativa.sql) pra usar tipo_preco no lugar',
      'Novo Registro e Editar Registro agora verificam erro ao salvar as atividades do registro — se algo falhar, mostra aviso em vez de salvar o registro incompleto sem avisar',
    ],
  },
  {
    versao: '5d16489',
    data: '2026-09-04',
    resumo: 'Coluna tipo_upe_fixa renomeada para tipo_preco',
    itens: [
      'Nome mais claro pro que a coluna representa hoje (3 valores: upe, fixo, justificativa — não só upe/fixa como antes)',
      'Requer rodar sql_renomear_tipo_upe_fixa.sql no Supabase',
    ],
  },
  {
    versao: '25f2cc1',
    data: '2026-09-04',
    resumo: 'Telas dedicadas de Preço Fixo/UPE, abas de navegação e renomeação de colunas em Atividades',
    itens: [
      'Preço Fixo e Preço UPE viraram telas dedicadas (agrupadas por atividade/contrato, preço vigente em destaque, agendados e histórico recolhível), no lugar da tabela genérica de antes',
      'Abas de navegação (Cadastro / Preço Fixo / Preço UPE) compartilhadas entre as telas de Atividades — removidas dos cards separados em Configurações',
      'Novo Registro/Editar Registro passam a resolver o preço Fixo pela vigência cadastrada (igual já fazia com UPE), em vez de sempre usar o valor estático da atividade',
      'Migrado o conceito de "atividade de justificativa" (antes na coluna removida referencia_codigo) para tipo_preco = \'justificativa\'; código da atividade "Em Andamento" da Limpeza de Subestação virou jus.232',
      'Tabelas com ordenação por cabeçalho agora têm desempate estável (evita linha repetida/sumida ao paginar) e suporte a largura máxima de coluna',
      'Renomeadas as colunas de d_atividades: DESCRICAO_BASICA_SISTEMA → descricao, UPE → upe, ADICIONAL_30 → adicional_30, e os valores FIXA → fixo / UPE → upe',
      'Requer ter rodado sql_renomear_colunas_atividades.sql (e sql_migrar_justificativa_para_tipo_upe_fixa.sql) no Supabase',
    ],
  },
  {
    versao: '633c5c4',
    data: '2026-08-28',
    resumo: 'Limpeza de Subestação: Data Início da Visita digitada direto no lançamento',
    itens: [
      'Novo campo "Data Início da Visita" no lançamento de Limpeza de Subestação — dá pra digitar o início da visita direto no registro de conclusão, sem precisar criar um lançamento separado de "Em Andamento" só pra marcar quando começou',
      'Elimina a ambiguidade de casar visitas pelo número da OS: o relatório de exportação passa a usar essa data quando preenchida, mantendo o pareamento antigo (por subestação + "Em Andamento" mais recente) só pros lançamentos que já existem',
      'Requer rodar sql_campo_data_inicio_visita.sql no Supabase pra cadastrar o campo',
    ],
  },
  {
    versao: 'ad1c54d',
    data: '2026-08-28',
    resumo: 'Ordenação por clique no cabeçalho das listagens',
    itens: [
      'Clicar no título de qualquer coluna (Contrato, Vigência Início, etc.) ordena a lista por ela — clicar de novo inverte crescente/decrescente',
      'Vale pra todas as telas que usam listagem em tabela (Preço UPE, Preço Fixa, Atividades, etc.)',
    ],
  },
  {
    versao: 'bff33ad',
    data: '2026-08-28',
    resumo: 'Preço UPE por Contrato também simplificado: só Vigência Início',
    itens: [
      'Mesma lógica do Preço Fixa aplicada ao Preço UPE — sem precisar fechar vigência ao cadastrar um novo preço',
      'Diferente do Preço Fixa, essa resolução acontece no front-end (Novo Registro / Editar Registro), não em trigger do banco — não precisou de SQL manual desta vez',
      'Tela "Preço UPE por Contrato": campo Vigência Fim removido',
    ],
  },
  {
    versao: '7491ff6',
    data: '2026-08-28',
    resumo: 'Preço Fixa simplificado: só Vigência Início, sem Vigência Fim',
    itens: [
      'O preço vigente numa data é sempre o de maior Vigência Início que seja menor ou igual a ela — não precisa mais fechar o preço anterior ao cadastrar um novo',
      'Reajuste de Preço Fixa e Preço Fixa por Vigência: campo Vigência Fim removido da tela',
      'Requer rodar sql_preco_fixa_sem_vigencia_fim.sql no Supabase (atualiza o trigger que resolve o preço no lançamento)',
    ],
  },
  {
    versao: 'c66aeed',
    data: '2026-08-28',
    resumo: 'Reajuste de Preço Fixa por contrato',
    itens: [
      'Nova tela (Atividades → "Reajuste de Preço Fixa"): escolhe o contrato, lista as atividades tipo FIXA com o preço vigente, aplica um percentual geral (recalcula todas de uma vez, ainda editável linha a linha) ou digita o valor manualmente',
      'Ao salvar, encerra o preço atual e cria um novo a partir da data do reajuste — mantém o histórico completo em d_atividades_preco_fixa',
      'Página de Atualizações (esta aqui): histórico de versões publicadas, visível só para danilo@dbmachado.com',
    ],
  },
  {
    versao: '60f2a2b',
    data: '2026-08-28',
    resumo: 'Sincronização com o histórico principal (GitHub) e novo cadastro de Metas',
    itens: [
      'Metas: substitui upload/download de planilha Excel por cadastro direto de meta mensal por tipo de equipe e período',
      'Feriados: nova tela de cadastro de feriados nacionais, usados no cálculo da meta diária (desconta domingos e feriados, sábado conta meio dia)',
      'Limpeza de Subestação: novo módulo — cadastro de subestações, atividade "Em Andamento", preço FIXA por vigência, relatório de exportação próprio',
      'Editor de Formulário: campo Equipe virou configurável (dá pra remover por tipo de equipe) e parou de aparecer/obrigar indevidamente em contratos de presença',
      'Dashboard de Análise: navegação simplificada, um só botão "Voltar" no topo',
      'Planejamento: camada de rodovias e divisas estaduais sobreposta ao mapa de satélite; correções de zoom e camadas do CARTO',
      'Log de acesso migrado de d_login_log para d_pageview_log',
      'Colaboradores: novo filtro por contrato na listagem',
    ],
  },
]

function fmtData(d) {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

export default function Atualizacoes() {
  const navegar = useNavigate()

  return (
    <div className="pagina">
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar('/configuracoes')}
            style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Atualizações do Sistema</h1>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {VERSOES.map(v => (
          <div key={v.versao} className="card">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{
                fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#1a56db',
                background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 8px',
              }}>{v.versao}</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{fmtData(v.data)}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e2a3b', marginBottom: 10 }}>{v.resumo}</div>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {v.itens.map((item, i) => (
                <li key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
