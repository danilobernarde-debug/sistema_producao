import TabelaCRUD from '../../components/TabelaCRUD'

const COLUNAS = [
  { nome: 'descricao',                label: 'Descrição',                 tipo: 'texto',  obrigatorio: true,
    ajuda: 'Nome do tipo de equipe (ex: Eletricista, Pedreiro, Encanador)' },
  { nome: 'qtd_minima_colaboradores', label: 'Qtd. Mínima Colaboradores', tipo: 'numero',
    ajuda: 'Número mínimo de colaboradores para esta equipe ser considerada válida em um registro' },
  { nome: 'grupo',                    label: 'Grupo',                     tipo: 'numero', ocultarLista: true,
    ajuda: 'Agrupamento numérico para organização e filtros internos' },
  { nome: 'grupo_atividades',         label: 'Grupo Atividades',          tipo: 'numero', ocultarLista: true,
    ajuda: 'Identificador do grupo de atividades permitidas para este tipo de equipe' },
]

export default function TiposEquipe() {
  return <TabelaCRUD titulo="Tipos de Equipe" tabela="d_tipo_equipe" colunas={COLUNAS} ordenarPor="descricao" buscaPor="descricao" voltarPara="/configuracoes" />
}
