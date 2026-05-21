import TabelaCRUD from '../../components/TabelaCRUD'

const TIPOS_CAMPO = [
  { valor: 'texto',        label: 'Texto' },
  { valor: 'alfanumerico', label: 'Alfanumérico' },
  { valor: 'numero',       label: 'Número inteiro' },
  { valor: 'decimal',      label: 'Decimal' },
  { valor: 'data',         label: 'Data' },
  { valor: 'hora',         label: 'Hora' },
  { valor: 'textarea',     label: 'Texto longo' },
  { valor: 'checkbox',     label: 'Checkbox (Sim/Não)' },
  { valor: 'dropdown',     label: 'Dropdown (tabela)' },
]

const SECOES_PERMITIDAS = [
  { valor: 'ambas',     label: 'Ambas as seções' },
  { valor: 'registro',  label: 'Somente Registro' },
  { valor: 'atividade', label: 'Somente Atividade' },
]

const COLUNAS = [
  { nome: 'nome',              label: 'Nome (chave)',       tipo: 'texto',    obrigatorio: true,
    ajuda: 'Identificador único do campo, sem espaços ou caracteres especiais (ex: data_inicio, qtd_horas). Usado internamente para salvar o valor' },
  { nome: 'label',             label: 'Label exibido',      tipo: 'texto',    obrigatorio: true,
    ajuda: 'Texto que aparece para o usuário no formulário de lançamento' },
  { nome: 'tipo',              label: 'Tipo',               tipo: 'select',   obrigatorio: true, opcoes: TIPOS_CAMPO,
    ajuda: 'Define o controle exibido: Texto (campo livre), Número, Data, Dropdown (lista de opções de outra tabela), Checkbox (Sim/Não), etc.' },
  { nome: 'secao_permitida',   label: 'Seção permitida',    tipo: 'select',   obrigatorio: true, opcoes: SECOES_PERMITIDAS,
    ajuda: 'Define em qual seção do formulário este campo pode ser adicionado. Campos de coluna real devem ser "Somente Registro", pois não existem como coluna na seção de Atividade.' },
  { nome: 'is_coluna_real',    label: 'Coluna real',        tipo: 'checkbox', ocultarLista: false,
    ajuda: 'Marque se este campo é salvo em uma coluna dedicada da tabela (ex: obra_id, encarregado_id). Deixe desmarcado se o valor vai para o campo metadata JSON. Isso afeta como o campo é exibido no Editor de Formulário.' },
  { nome: 'mascara',           label: 'Máscara',            tipo: 'texto',    ocultarLista: true,
    ajuda: 'Formato usando: 9 = dígito, a = letra, * = letra ou número. Exemplos: 99/99/9999 (data), (99) 99999-9999 (telefone), AAA-9999 (placa antiga), AAA-9*99 (placa Mercosul)' },
  { nome: 'placeholder',       label: 'Placeholder',        tipo: 'texto',    ocultarLista: true,
    ajuda: 'Texto de exemplo exibido dentro do campo quando está vazio, orientando o usuário sobre o formato esperado' },
  { nome: 'tabela_ref',        label: 'Tabela ref.',        tipo: 'texto',    ocultarLista: true,
    ajuda: 'Usado apenas para tipo Dropdown. Nome da tabela no banco de dados de onde serão carregadas as opções (ex: d_colaboradores)' },
  { nome: 'coluna_valor',      label: 'Coluna valor',       tipo: 'texto',    ocultarLista: true,
    ajuda: 'Usado apenas para tipo Dropdown. Nome da coluna cujo valor será salvo ao selecionar uma opção (geralmente id)' },
  { nome: 'coluna_label',      label: 'Coluna label',       tipo: 'texto',    ocultarLista: true,
    ajuda: 'Usado apenas para tipo Dropdown. Nome da coluna que será exibida ao usuário na lista de opções (ex: nome, descricao)' },
]

export default function ConfigCampos() {
  return <TabelaCRUD titulo="Configuração de Campos" tabela="config_campos" colunas={COLUNAS} ordenarPor="label" buscaPor="label" voltarPara="/configuracoes" />
}
