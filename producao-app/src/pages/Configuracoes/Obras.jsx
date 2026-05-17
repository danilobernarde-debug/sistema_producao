import TabelaCRUD from '../../components/TabelaCRUD'

const COLUNAS = [
  { nome: 'obra',             label: 'Obra',                tipo: 'numero',  obrigatorio: true,
    pesquisavel: true, tabela_ref: 'd_obras', coluna_valor: 'obra', coluna_label: 'obra',
    ajuda: 'Código ou nome da obra' },
  { nome: 'contrato_id',      label: 'Contrato',            tipo: 'select',  obrigatorio: true, tabela_ref: 'd_contratos', coluna_valor: 'id', coluna_label: 'descricao', pesquisavel: true,
    ajuda: 'Contrato ao qual esta obra está vinculada' },
  { nome: 'localidade',       label: 'Localidade',          tipo: 'texto',
    ajuda: 'Cidade ou local onde a obra está sendo executada' },
  { nome: 'zona',             label: 'Zona',                tipo: 'select',
    opcoes: [{ valor: 'URBANO', label: 'URBANO' }, { valor: 'RURAL', label: 'RURAL' }],
    ajuda: 'Classificação da área onde a obra é executada' },
  { nome: 'previsto_orcado',  label: 'Previsto Orçado',     tipo: 'decimal',
    ajuda: 'Valor total orçado para execução da obra' },
  { nome: 'polo',             label: 'Polo',                tipo: 'select',  ocultarLista: true,
    opcoes: [{ valor: 'Palmas', label: 'Palmas' }, { valor: 'Gurupi', label: 'Gurupi' }, { valor: 'Campo Grande', label: 'Campo Grande' }],
    ajuda: 'Polo regional responsável pela obra' },
  { nome: 'dth_prev_termino', label: 'Previsão de Término', tipo: 'data',    ocultarLista: true,
    ajuda: 'Data prevista para conclusão da obra' },
]

export default function Obras() {
  return (
    <TabelaCRUD
      titulo="Obras"
      tabela="d_obras"
      chavePrimaria="obra"
      colunas={COLUNAS}
      ordenarPor="obra"
      voltarPara="/configuracoes"
      filtros={['obra', 'contrato_id', 'polo', 'zona']}
    />
  )
}
