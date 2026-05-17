import TabelaCRUD from '../../components/TabelaCRUD'

const COLUNAS = [
  { nome: 'contrato_id',    label: 'Contrato',    tipo: 'select',   obrigatorio: true, tabela_ref: 'd_contratos',   coluna_valor: 'id', coluna_label: 'descricao',
    ajuda: 'Contrato ao qual este campo será associado. Cada contrato pode ter um conjunto diferente de campos dinâmicos' },
  { nome: 'tipo_equipe_id', label: 'Tipo Equipe', tipo: 'select',   obrigatorio: true, tabela_ref: 'd_tipo_equipe', coluna_valor: 'id', coluna_label: 'descricao',
    ajuda: 'Tipo de equipe que verá este campo no formulário de lançamento. Permite configurar campos específicos por tipo de serviço' },
  { nome: 'campo_id',       label: 'Campo',       tipo: 'select',   obrigatorio: true, tabela_ref: 'config_campos', coluna_valor: 'id', coluna_label: 'label',
    ajuda: 'Campo dinâmico (cadastrado em Configuração de Campos) que será exibido no formulário de lançamento desta combinação contrato/equipe' },
  { nome: 'secao',          label: 'Seção',       tipo: 'texto',    obrigatorio: true,
    ajuda: 'Grupo/seção onde o campo aparecerá no formulário (ex: "Dados Gerais", "Informações Técnicas"). Campos com a mesma seção ficam agrupados' },
  { nome: 'ordem',          label: 'Ordem',       tipo: 'numero',
    ajuda: 'Posição do campo dentro da seção — número menor aparece primeiro. Use múltiplos de 10 (10, 20, 30) para facilitar reordenação futura' },
  { nome: 'obrigatorio',    label: 'Obrigatório', tipo: 'checkbox',
    ajuda: 'Se marcado, o preenchimento deste campo será obrigatório no lançamento para este contrato e tipo de equipe' },
]

export default function ConfigCamposContrato() {
  return (
    <TabelaCRUD
      titulo="Campos por Contrato / Equipe"
      tabela="config_campos_contrato"
      colunas={COLUNAS}
      ordenarPor="ordem"
      voltarPara="/configuracoes"
    />
  )
}
