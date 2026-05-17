import TabelaCRUD from '../../components/TabelaCRUD'

const COLUNAS = [
  { nome: 'matricula_nome', label: 'Matrícula / Nome', tipo: 'texto',    somenteLeitura: true,
    ajuda: 'Gerado automaticamente pelo sistema ao salvar (matrícula + nome)' },
  { nome: 'nome',           label: 'Nome',             tipo: 'texto',    obrigatorio: true,
    ajuda: 'Nome completo do colaborador' },
  { nome: 'matricula',      label: 'Matrícula',        tipo: 'numero',   obrigatorio: true,
    ajuda: 'Número de matrícula único do colaborador na empresa' },
  { nome: 'equipe_id',      label: 'Equipe',           tipo: 'select',   tabela_ref: 'd_equipes', coluna_valor: 'id', coluna_label: 'sistema_producao', ocultarLista: true,
    ajuda: 'Equipe padrão do colaborador (pode ser alterada no registro de produção)' },
  { nome: 'cargo_id',       label: 'Cargo',            tipo: 'numero',   ocultarLista: true,
    ajuda: 'ID do cargo do colaborador (referência à tabela de cargos)' },
  { nome: 'is_ativo',       label: 'Ativo',            tipo: 'checkbox',
    ajuda: 'Colaboradores inativos não aparecem para seleção em novos registros' },
]

export default function Colaboradores() {
  return <TabelaCRUD titulo="Colaboradores" tabela="d_colaboradores" colunas={COLUNAS} ordenarPor="nome" buscaPor="nome" voltarPara="/configuracoes" />
}
