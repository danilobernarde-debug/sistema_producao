import TabelaCRUD from '../../components/TabelaCRUD'

const COLUNAS = [
  { nome: 'contrato_id',      label: 'Contrato',          tipo: 'select',  obrigatorio: true,
    tabela_ref: 'd_contratos', coluna_valor: 'id', coluna_label: 'descricao', pesquisavel: true,
    ajuda: 'Contrato ao qual este preço de UPE se aplica' },
  { nome: 'vigencia_inicio',  label: 'Vigência Início',   tipo: 'data',    obrigatorio: true,
    ajuda: 'Data a partir da qual este preço vale. O preço vigente numa data é sempre o de maior Vigência Início que seja menor ou igual a ela.' },
  { nome: 'upe_lm',           label: 'UPE LM',            tipo: 'decimal',
    ajuda: 'Valor da UPE para Linha de Média tensão' },
  { nome: 'upe_lv',           label: 'UPE LV',            tipo: 'decimal',
    ajuda: 'Valor da UPE para Linha de Baixa tensão' },
]

export default function ContratosPrecoUpe() {
  return (
    <TabelaCRUD
      titulo="Preço UPE por Contrato"
      tabela="d_contratos_preco_upe"
      colunas={COLUNAS}
      ordenarPor={['contrato_id', 'vigencia_inicio']}
      voltarPara="/configuracoes"
      filtros={['contrato_id']}
    />
  )
}
