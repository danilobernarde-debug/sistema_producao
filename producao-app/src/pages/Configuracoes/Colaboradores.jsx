import TabelaCRUD from '../../components/TabelaCRUD'

const COLUNAS = [
  { nome: 'matricula_nome', label: 'Matrícula / Nome', tipo: 'texto',   somenteLeitura: true, ocultarLista: true,
    ajuda: 'Gerado automaticamente pelo sistema ao salvar (matrícula + nome)' },
  { nome: 'matricula',      label: 'Matrícula',        tipo: 'numero',  obrigatorio: true,
    ajuda: 'Número de matrícula único do colaborador na empresa' },
  { nome: 'nome',           label: 'Nome',             tipo: 'texto',   obrigatorio: true,
    ajuda: 'Nome completo do colaborador' },
  { nome: 'equipe_id',      label: 'Equipe',           tipo: 'select',  tabela_ref: 'd_equipes', coluna_valor: 'id', coluna_label: 'sistema_producao', pesquisavel: true,
    ajuda: 'Equipe padrão do colaborador (pode ser alterada no registro de produção)' },
  { nome: 'cargo_id',       label: 'Cargo',            tipo: 'select',  tabela_ref: 'd_colaboradores_funcao', coluna_valor: 'id', coluna_label: 'cargo',
    ajuda: 'Cargo/função do colaborador' },
  { nome: 'is_ativo',       label: 'Ativo',            tipo: 'checkbox',
    ajuda: 'Colaboradores inativos não aparecem para seleção em novos registros' },
]

export default function Colaboradores() {
  return <TabelaCRUD titulo="Colaboradores" tabela="d_colaboradores" colunas={COLUNAS} ordenarPor="nome" voltarPara="/configuracoes" filtros={['matricula', 'nome', 'equipe_id', 'cargo_id', 'is_ativo']} />
}
