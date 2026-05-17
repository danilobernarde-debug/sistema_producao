import TabelaCRUD from '../../components/TabelaCRUD'

const COLUNAS = [
  { nome: 'num_contrato',      label: 'Nº Contrato',       tipo: 'texto',    obrigatorio: true,
    ajuda: 'Número identificador do contrato (ex: CT-2024-001)' },
  { nome: 'descricao',         label: 'Descrição',          tipo: 'texto',    obrigatorio: true,
    ajuda: 'Nome completo do contrato' },
  { nome: 'estado',            label: 'Estado',             tipo: 'texto',
    ajuda: 'Estado/UF onde o contrato é executado (ex: GO, SP)' },
  { nome: 'referencia_codigo', label: 'Referência',         tipo: 'texto',    ocultarLista: true,
    ajuda: 'Código de referência externo ou identificador em outro sistema' },
  { nome: 'logica_contrato',   label: 'Lógica Contrato',   tipo: 'checkbox',
    ajuda: 'Ativo: equipes definidas pelos colaboradores presentes no dia. Inativo: equipe fixa no registro' },
  { nome: 'ativo',             label: 'Ativo',              tipo: 'checkbox',
    ajuda: 'Contratos inativos não aparecem para lançamento de produção' },
]

export default function Contratos() {
  return <TabelaCRUD titulo="Contratos" tabela="d_contratos" colunas={COLUNAS} ordenarPor="descricao" buscaPor="descricao" voltarPara="/configuracoes" />
}
