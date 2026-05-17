import TabelaCRUD from '../../components/TabelaCRUD'

const COLUNAS = [
  { nome: 'equipe',           label: 'Nome da Equipe',   tipo: 'texto',
    ajuda: 'Nome de identificação da equipe para uso interno' },
  { nome: 'sistema_producao', label: 'Sistema Produção', tipo: 'texto',   obrigatorio: true,
    ajuda: 'Nome exibido nos relatórios e registros de produção' },
  { nome: 'tipo_equipe_id',   label: 'Tipo de Equipe',   tipo: 'select',  tabela_ref: 'd_tipo_equipe', coluna_valor: 'id', coluna_label: 'descricao',
    ajuda: 'Categoria da equipe (ex: Elétrica, Civil). Define as atividades disponíveis' },
  { nome: 'contrato_id',      label: 'Contrato',         tipo: 'select',  tabela_ref: 'd_contratos', coluna_valor: 'id', coluna_label: 'descricao',
    ajuda: 'Contrato ao qual esta equipe está vinculada (deixe vazio para equipe global)' },
  { nome: 'sistema_uau',      label: 'Sistema UAU',      tipo: 'texto',   ocultarLista: true,
    ajuda: 'Código ou referência da equipe no sistema UAU de gestão' },
  { nome: 'estado',           label: 'Estado',           tipo: 'texto',   ocultarLista: true,
    ajuda: 'Estado/UF onde esta equipe atua' },
  { nome: 'is_ativo',         label: 'Ativo',            tipo: 'checkbox',
    ajuda: 'Equipes inativas não aparecem para seleção em novos registros de produção' },
]

export default function Equipes() {
  return <TabelaCRUD titulo="Equipes" tabela="d_equipes" colunas={COLUNAS} ordenarPor="sistema_producao" voltarPara="/configuracoes" filtros={['equipe', 'tipo_equipe_id', 'contrato_id']} />
}
