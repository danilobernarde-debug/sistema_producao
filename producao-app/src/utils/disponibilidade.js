// ============================================================
// BLOQUEIO DISPONIBILIDADE DIA ÚNICO  (somente no front-end, NADA no banco)
//
// Regra: uma equipe só pode ter UMA atividade "paga por disponibilidade"
// (d_atividades.is_disponibilidade = true, ex.: Recolha no contrato de Mato Grosso)
// por data de produção, somando todos os registros dela naquele dia.
// Duas disponibilidades no mesmo registro também são barradas.
//
// Por que existe: o banco aceita o 2º lançamento do dia, só que ele vale R$ 0
// (ver supabase/disponibilidade_equipe_21_10_2026.sql, coluna "repeticao" em
// fn_prod_recalcular_disponibilidade). Aqui avisamos ANTES de gravar.
//
// ONDE É USADO (busque por "BLOQUEIO DISPONIBILIDADE DIA ÚNICO" para achar tudo):
//   - src/pages/Producao/NovoRegistro.jsx    -> função salvar()
//   - src/pages/Producao/EditarRegistro.jsx  -> função salvar()
//   (Disponibilidade.jsx, tela desativada, já marca dia a dia e não precisa disso)
//
// LIMITE CONHECIDO: por ser só tela, não barra importação, API ou dois operadores
// salvando exatamente ao mesmo tempo. Nesses casos o 2º continua valendo R$ 0 no banco.
//
// COMO DESFAZER: apagar este arquivo e os blocos marcados nas duas telas acima.
// ============================================================
import { supabase } from '../supabaseClient'

const fmtData = iso => iso.split('-').reverse().join('/')

/**
 * Retorna uma mensagem de erro (string) se o lançamento violar a regra, ou null se estiver ok.
 *
 * @param {object}   p
 * @param {Array}    p.itens            itens de atividade do formulário (usa item.atividade_id)
 * @param {Array}    p.atividades       lista de atividades carregada na tela (usa is_disponibilidade)
 * @param {string}   p.equipeId         equipe do registro (sem equipe não há o que checar)
 * @param {string}   p.dataProducao     'YYYY-MM-DD'
 * @param {number}   [p.registroIdIgnorar] registro em edição, para ele não contar contra si mesmo
 */
export async function verificarDiaDisponibilidade({ itens, atividades, equipeId, dataProducao, registroIdIgnorar }) {
  const ehDisp = it => atividades.find(a => String(a.id) === String(it.atividade_id))?.is_disponibilidade
  const qtdNoForm = itens.filter(ehDisp).length
  if (qtdNoForm === 0 || !equipeId || !dataProducao) return null

  if (qtdNoForm > 1) {
    return 'Disponibilidade só pode ser lançada uma vez por registro. Remova a atividade repetida.'
  }

  // Outros registros da mesma equipe no mesmo dia que já tenham atividade de disponibilidade
  const { data: dispIds, error: erDisp } = await supabase
    .from('d_atividades').select('id').eq('is_disponibilidade', true)
  if (erDisp) return null // não conseguiu conferir: não trava o lançamento por causa disso
  const ids = (dispIds || []).map(d => d.id)
  if (ids.length === 0) return null

  let q = supabase
    .from('f_prod_atividades')
    .select('id, registro_id, f_prod_registro!inner(equipe_id, data_producao)')
    .in('atividade_id', ids)
    .eq('f_prod_registro.equipe_id', Number(equipeId))
    .eq('f_prod_registro.data_producao', dataProducao)
    .limit(1)
  if (registroIdIgnorar) q = q.neq('registro_id', Number(registroIdIgnorar))

  const { data, error } = await q
  if (error) return null
  if (data && data.length > 0) {
    return `Esta equipe já tem disponibilidade lançada em ${fmtData(dataProducao)}. Cada equipe só pode ter 1 disponibilidade por dia.`
  }
  return null
}
