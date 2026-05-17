import TabelaCRUD from '../../components/TabelaCRUD'

const COLUNAS = [
  { nome: 'contrato_id',            label: 'Contrato',         tipo: 'select',   obrigatorio: false,
    tabela_ref: 'd_contratos', coluna_valor: 'id', coluna_label: 'descricao', pesquisavel: true,
    ajuda: 'Contrato ao qual a atividade pertence. Deixe vazio para aparecer em todos os contratos.' },
  { nome: 'DESCRICAO_BASICA_SISTEMA', label: 'Descrição',       tipo: 'texto',    obrigatorio: true,
    ajuda: 'Nome da atividade exibido no lançamento de produção' },
  { nome: 'codigo_op',              label: 'Código OP',        tipo: 'texto',
    ajuda: 'Código da ordem de produção (exibido entre colchetes no lançamento)' },
  { nome: 'unidade',                label: 'Unidade',          tipo: 'texto',
    ajuda: 'Unidade de medida da quantidade (ex: m, un, m²)' },
  { nome: 'tipo_upe_fixa',          label: 'Tipo UPE',         tipo: 'select',
    opcoes: [
      { valor: 'UPE',  label: 'UPE — usa preço por contrato/período' },
      { valor: 'FIXA', label: 'FIXA — preço fixo (UPE = 1)' },
    ],
    ajuda: 'UPE: usa tabela de preço do contrato. FIXA: valor fixo unitário.' },
  { nome: 'UPE',                    label: 'Valor UPE',        tipo: 'decimal',  ocultarLista: true,
    ajuda: 'Valor fixo da UPE (usado apenas quando Tipo UPE = FIXA)' },
  { nome: 'tipo_lm_lv',             label: 'LM / LV',          tipo: 'select',   ocultarLista: true,
    opcoes: [
      { valor: 'LM', label: 'LM — Linha de Média tensão' },
      { valor: 'LV', label: 'LV — Linha de Baixa tensão' },
    ],
    ajuda: 'Define qual preço UPE usar (LM ou LV). Relevante quando Tipo UPE = UPE.' },
  { nome: 'comprimento_lagura',     label: 'Usa C × L',        tipo: 'checkbox', ocultarLista: true,
    ajuda: 'Quando marcado, a quantidade é calculada como Comprimento × Largura' },
  { nome: 'tipo_equipe_id',         label: 'Grupo Equipe',     tipo: 'numero',   ocultarLista: true,
    ajuda: 'Código do grupo de equipe. Use 0 para aparecer para todos os tipos de equipe.' },
]

export default function Atividades() {
  return (
    <TabelaCRUD
      titulo="Atividades"
      tabela="d_atividades"
      colunas={COLUNAS}
      ordenarPor="DESCRICAO_BASICA_SISTEMA"
      buscaPor="DESCRICAO_BASICA_SISTEMA"
      voltarPara="/configuracoes"
      filtros={['contrato_id', 'tipo_upe_fixa', 'tipo_lm_lv']}
    />
  )
}
