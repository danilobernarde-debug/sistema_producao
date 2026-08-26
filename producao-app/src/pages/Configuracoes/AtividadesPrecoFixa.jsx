import TabelaCRUD from '../../components/TabelaCRUD'

const COLUNAS = [
  { nome: 'atividade_id',     label: 'Atividade',         tipo: 'select',  obrigatorio: true,
    tabela_ref: 'd_atividades', coluna_valor: 'id', coluna_label: 'DESCRICAO_BASICA_SISTEMA', pesquisavel: true,
    ajuda: 'Atividade (tipo UPE = FIXA) à qual este preço se aplica' },
  { nome: 'vigencia_inicio',  label: 'Vigência Início',   tipo: 'data',    obrigatorio: true,
    ajuda: 'Data de início da validade deste preço' },
  { nome: 'vigencia_fim',     label: 'Vigência Fim',      tipo: 'data',
    ajuda: 'Data de término da validade (deixe vazio para vigência aberta)' },
  { nome: 'valor',            label: 'Valor',             tipo: 'decimal', obrigatorio: true,
    ajuda: 'Valor da atividade nesse período' },
]

export default function AtividadesPrecoFixa() {
  return (
    <TabelaCRUD
      titulo="Preço Fixa por Vigência"
      tabela="d_atividades_preco_fixa"
      colunas={COLUNAS}
      ordenarPor={['atividade_id', 'vigencia_inicio']}
      voltarPara="/configuracoes"
      filtros={['atividade_id']}
    />
  )
}
