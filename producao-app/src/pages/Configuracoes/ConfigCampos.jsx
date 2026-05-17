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

const COLUNAS = [
  { nome: 'nome',              label: 'Nome (chave)',       tipo: 'texto',    obrigatorio: true,
    ajuda: 'Identificador único do campo, sem espaços ou caracteres especiais (ex: data_inicio, qtd_horas). Usado internamente para salvar o valor' },
  { nome: 'label',             label: 'Label exibido',      tipo: 'texto',    obrigatorio: true,
    ajuda: 'Texto que aparece para o usuário no formulário de lançamento' },
  { nome: 'tipo',              label: 'Tipo',               tipo: 'select',   obrigatorio: true, opcoes: TIPOS_CAMPO,
    ajuda: 'Define o controle exibido: Texto (campo livre), Número, Data, Dropdown (lista de opções de outra tabela), Checkbox (Sim/Não), etc.' },
  { nome: 'obrigatorio_padrao',label: 'Obrigatório padrão', tipo: 'checkbox',
    ajuda: 'Se marcado, este campo será obrigatório por padrão ao ser adicionado a um contrato' },
  { nome: 'mascara',           label: 'Máscara',            tipo: 'texto',    ocultarLista: true,
    ajuda: 'Formato de entrada usando 9 para dígito e A para letra. Exemplos: 99/99/9999 (data), (99) 99999-9999 (telefone), AAA-9999 (placa)' },
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
