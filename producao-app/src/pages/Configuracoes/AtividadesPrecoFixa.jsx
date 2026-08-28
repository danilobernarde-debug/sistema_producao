import { useNavigate } from 'react-router-dom'
import TabelaCRUD from '../../components/TabelaCRUD'

const COLUNAS = [
  { nome: 'contrato_filtro',  label: 'Contrato',          tipo: 'select',  somenteLeitura: true, ocultarLista: true,
    tabela_ref: 'd_contratos', coluna_valor: 'id', coluna_label: 'descricao',
    filtroVia: { colunaLocal: 'atividade_id', tabelaVia: 'd_atividades', colunaViaFiltro: 'contrato_id' },
    ajuda: 'Filtra pelas atividades do contrato selecionado' },
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
  const navegar = useNavigate()

  const botoesExtra = (
    <button className="btn btn-secundario" onClick={() => navegar('/configuracoes/reajuste-preco-fixa')}>
      📈 Reajuste de Preço Fixa
    </button>
  )

  return (
    <TabelaCRUD
      titulo="Preço Fixa por Vigência"
      tabela="d_atividades_preco_fixa"
      colunas={COLUNAS}
      ordenarPor={['atividade_id', 'vigencia_inicio']}
      voltarPara="/configuracoes"
      filtros={['contrato_filtro', 'atividade_id']}
      botoesExtra={botoesExtra}
    />
  )
}
