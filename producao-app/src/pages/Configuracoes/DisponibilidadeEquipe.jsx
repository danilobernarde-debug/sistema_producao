import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { Modal } from '../../components/TabelaCRUD'
import AbasAtividades from '../../components/AbasAtividades'

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDias(n) {
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function fmtMes(v) {
  if (!v) return '-'
  const [a, m] = v.split('-')
  return `${m}/${a}`
}

function mesAtualISO() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

// Aceita "75000", "75000,50", "75.000,50" e "75000.50"
function lerNumero(txt) {
  const s = String(txt).trim()
  if (!s) return NaN
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
}

function paraTexto(n) {
  return n == null ? '' : String(n).replace('.', ',')
}

export default function DisponibilidadeEquipe() {
  const navegar = useNavigate()
  const [linhas, setLinhas]         = useState([]) // view_prod_disponibilidade_mes
  const [equipes, setEquipes]       = useState([]) // [{ id, rotulo }] equipes elegíveis
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga]   = useState('')
  const [filtroEquipeId, setFiltroEquipeId] = useState('')
  const [modal, setModal]           = useState(null) // { id, equipeId, mes, dias, valor }
  const [erroModal, setErroModal]   = useState('')
  const [salvando, setSalvando]     = useState(false)
  const [confirmarExcluir, setConfirmarExcluir] = useState(null) // { id }
  const [toast, setToast]           = useState(null)

  useEffect(() => { carregar() }, [])

  function mostrarToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function carregar() {
    setCarregando(true)
    setErroCarga('')

    // Equipes elegíveis: ativas, de contratos que têm atividade "paga por disponibilidade"
    const { data: atvs, error: erAtv } = await supabase
      .from('d_atividades').select('contrato_id').eq('is_disponibilidade', true)
    if (erAtv) { setErroCarga(erAtv.message); setCarregando(false); return }
    const contratoIds = [...new Set((atvs || []).map(a => a.contrato_id).filter(c => c != null))]

    let listaEquipes = []
    if (contratoIds.length) {
      const [{ data: eqs }, { data: contratos }] = await Promise.all([
        supabase.from('d_equipes')
          .select('id, equipe, contrato_id, d_tipo_equipe(descricao)')
          .in('contrato_id', contratoIds).eq('is_ativo', true).order('equipe'),
        supabase.from('d_contratos').select('id, descricao').in('id', contratoIds),
      ])
      const nomeContrato = Object.fromEntries((contratos || []).map(c => [c.id, c.descricao]))
      listaEquipes = (eqs || []).map(e => ({
        id: e.id,
        rotulo: `${e.equipe} — ${nomeContrato[e.contrato_id] || ''}${e.d_tipo_equipe?.descricao ? ` / ${e.d_tipo_equipe.descricao}` : ''}`,
      }))
    }
    setEquipes(listaEquipes)

    const { data, error } = await supabase
      .from('view_prod_disponibilidade_mes').select('*').order('mes', { ascending: false })
    if (error) { setErroCarga(error.message); setCarregando(false); return }
    setLinhas((data || []).sort((a, b) => (a.equipe || '').localeCompare(b.equipe || '') || b.mes.localeCompare(a.mes)))
    setCarregando(false)
  }

  function abrirNovo(equipeId = '', mes = mesAtualISO()) {
    setErroModal('')
    const ultimo = linhas.find(l => String(l.equipe_id) === String(equipeId) && !l.sem_cadastro)
    setModal({
      id: null,
      equipeId: equipeId ? String(equipeId) : '',
      mes,
      dias: ultimo ? paraTexto(ultimo.dias_disponibilidade) : '',
      valor: ultimo ? paraTexto(ultimo.valor_mensal) : '',
    })
  }

  function abrirEditar(l) {
    setErroModal('')
    setModal({
      id: l.id,
      equipeId: String(l.equipe_id),
      mes: l.mes.slice(0, 7),
      dias: paraTexto(l.dias_disponibilidade),
      valor: paraTexto(l.valor_mensal),
    })
  }

  function trocarEquipeNoModal(equipeId) {
    // Em cadastro novo, sugere os valores do último mês cadastrado da equipe
    setModal(prev => {
      if (prev.id) return { ...prev, equipeId }
      const ultimo = linhas.find(l => String(l.equipe_id) === String(equipeId) && !l.sem_cadastro)
      return {
        ...prev,
        equipeId,
        dias:  prev.dias  || (ultimo ? paraTexto(ultimo.dias_disponibilidade) : ''),
        valor: prev.valor || (ultimo ? paraTexto(ultimo.valor_mensal) : ''),
      }
    })
  }

  async function salvar() {
    if (!modal.equipeId) { setErroModal('Selecione a equipe.'); return }
    if (!modal.mes) { setErroModal('Informe o mês.'); return }
    const dias  = lerNumero(modal.dias)
    const valor = lerNumero(modal.valor)
    if (Number.isNaN(dias) || dias <= 0 || dias > 31) { setErroModal('Informe os dias de disponibilidade (entre 0,5 e 31).'); return }
    if (Number.isNaN(valor) || valor < 0) { setErroModal('Informe o valor mensal.'); return }

    setSalvando(true)
    const payload = {
      equipe_id: Number(modal.equipeId),
      mes: `${modal.mes}-01`,
      dias_disponibilidade: Math.round(dias * 10) / 10,
      valor_mensal: Math.round(valor * 100) / 100,
    }
    const { data, error } = modal.id
      ? await supabase.from('d_equipes_disponibilidade').update(payload).eq('id', modal.id).select('id')
      : await supabase.from('d_equipes_disponibilidade').insert(payload).select('id')
    setSalvando(false)

    if (error) {
      setErroModal(error.message.includes('duplicate key')
        ? 'Já existe um cadastro de disponibilidade para essa equipe nesse mês.'
        : error.message)
      return
    }
    if (!data?.length) { setErroModal('Não foi possível salvar (sem permissão).'); return }
    setModal(null)
    mostrarToast('Disponibilidade salva — os dias já lançados do mês foram recalculados')
    carregar()
  }

  async function excluir() {
    const { data, error } = await supabase
      .from('d_equipes_disponibilidade').delete().eq('id', confirmarExcluir.id).select('id')
    setConfirmarExcluir(null)
    if (error || !data?.length) { mostrarToast('Erro ao excluir'); return }
    mostrarToast('Cadastro excluído')
    carregar()
  }

  const dias  = lerNumero(modal?.dias ?? '')
  const valor = lerNumero(modal?.valor ?? '')
  const valorDia = dias > 0 && !Number.isNaN(valor) ? valor / dias : null

  const visiveis = linhas.filter(l => !filtroEquipeId || String(l.equipe_id) === String(filtroEquipeId))

  return (
    <div className="pagina">
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: '#166534', color: '#dcfce7', fontSize: 13, fontWeight: 500,
          padding: '10px 18px', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          ✓ {toast}
        </div>
      )}

      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar('/configuracoes')}
            style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Disponibilidade por Equipe</h1>
        </div>
      </div>

      <AbasAtividades />

      <div className="card" style={{ marginBottom: 16, fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>
        Para equipes pagas por disponibilidade, cadastre por mês os <strong>dias de disponibilidade</strong> e o{' '}
        <strong>valor mensal</strong>. O operador só marca os dias trabalhados em Produção › Disponibilidade e o
        sistema calcula o faturamento: valor mensal ÷ dias de disponibilidade × dias trabalhados.
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="campo-grupo" style={{ marginBottom: 0, width: 320, maxWidth: '100%' }}>
          <label className="campo-label">Equipe</label>
          <select className="campo-select" value={filtroEquipeId} onChange={e => setFiltroEquipeId(e.target.value)}>
            <option value="">Todas</option>
            {equipes.map(e => <option key={e.id} value={e.id}>{e.rotulo}</option>)}
          </select>
        </div>
        <button className="btn btn-primario" onClick={() => abrirNovo(filtroEquipeId)}
          disabled={equipes.length === 0}>+ Cadastrar mês</button>
      </div>

      {erroCarga && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
          {erroCarga}
        </div>
      )}

      {carregando ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Carregando...</div>
      ) : equipes.length === 0 && !erroCarga ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
          Nenhuma equipe habilitada. Na aba <strong>Cadastro</strong>, marque "Pago por disponibilidade" na atividade
          de disponibilidade do contrato para liberar as equipes dele aqui.
        </div>
      ) : visiveis.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          Nenhum mês cadastrado ainda.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {[
                    { h: 'Equipe', align: 'left' },
                    { h: 'Mês', align: 'left' },
                    { h: 'Dias disp.', align: 'right' },
                    { h: 'Valor mensal', align: 'right' },
                    { h: 'Valor do dia', align: 'right' },
                    { h: 'Dias lançados', align: 'right' },
                    { h: 'Faturamento', align: 'right' },
                    { h: 'Ações', align: 'right' },
                  ].map((col, i) => (
                    <th key={i} style={{ padding: '8px 12px', fontWeight: 600, color: '#374151',
                      borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', textAlign: col.align }}>{col.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l, idx) => {
                  const excedeu = !l.sem_cadastro && Number(l.dias_lancados) > Number(l.dias_disponibilidade)
                  return (
                    <tr key={`${l.equipe_id}-${l.mes}`} style={{ borderTop: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: '#1e2a3b', whiteSpace: 'nowrap' }}>{l.equipe}</td>
                      <td style={{ padding: '7px 12px', color: '#374151', whiteSpace: 'nowrap' }}>{fmtMes(l.mes)}</td>
                      {l.sem_cadastro ? (
                        <td colSpan={3} style={{ padding: '7px 12px', textAlign: 'right' }}>
                          <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10 }}>
                            sem cadastro — dias lançados com valor R$ 0,00
                          </span>
                        </td>
                      ) : (
                        <>
                          <td style={{ padding: '7px 12px', textAlign: 'right' }}>{fmtDias(l.dias_disponibilidade)}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>R$ {fmt(l.valor_mensal)}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap', color: '#6b7280' }}>R$ {fmt(l.valor_dia)}</td>
                        </>
                      )}
                      <td style={{ padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {excedeu
                          ? <span style={{ color: '#c2410c', fontWeight: 700 }} title="Mais dias lançados que os dias de disponibilidade do mês">⚠ {l.dias_lancados}</span>
                          : l.dias_lancados}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#15803d', fontWeight: 700 }}>R$ {fmt(l.valor_faturado)}</span>
                      </td>
                      <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {l.sem_cadastro ? (
                            <button className="btn btn-primario" style={{ padding: '4px 9px', fontSize: 12 }}
                              onClick={() => abrirNovo(l.equipe_id, l.mes.slice(0, 7))}>Cadastrar</button>
                          ) : (
                            <>
                              <button className="btn btn-secundario" style={{ padding: '4px 9px', fontSize: 12 }}
                                onClick={() => abrirEditar(l)}>Editar</button>
                              <button className="btn btn-secundario" style={{ padding: '4px 9px', fontSize: 12, color: '#dc2626', borderColor: '#fca5a5' }}
                                onClick={() => setConfirmarExcluir({ id: l.id })}>Excluir</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <Modal titulo={modal.id ? 'Editar disponibilidade do mês' : 'Cadastrar disponibilidade do mês'} onFechar={() => setModal(null)}>
          {erroModal && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
              {erroModal}
            </div>
          )}
          <div className="campo-grupo">
            <label className="campo-label">Equipe <span className="obrigatorio">*</span></label>
            <select className="campo-select" value={modal.equipeId} disabled={!!modal.id}
              onChange={e => trocarEquipeNoModal(e.target.value)}>
              <option value="">Selecione...</option>
              {equipes.map(e => <option key={e.id} value={e.id}>{e.rotulo}</option>)}
            </select>
          </div>
          <div className="campo-grupo">
            <label className="campo-label">Mês <span className="obrigatorio">*</span></label>
            <input type="month" className="campo-input" value={modal.mes} disabled={!!modal.id}
              onChange={e => setModal(prev => ({ ...prev, mes: e.target.value }))} />
          </div>
          <div className="campo-grupo">
            <label className="campo-label">Dias de disponibilidade <span className="obrigatorio">*</span></label>
            <input type="text" inputMode="decimal" className="campo-input" placeholder="22" value={modal.dias}
              onChange={e => setModal(prev => ({ ...prev, dias: e.target.value }))} />
          </div>
          <div className="campo-grupo">
            <label className="campo-label">Valor mensal (R$) <span className="obrigatorio">*</span></label>
            <input type="text" inputMode="decimal" className="campo-input" placeholder="75.000,00" value={modal.valor}
              onChange={e => setModal(prev => ({ ...prev, valor: e.target.value }))} />
          </div>
          {valorDia != null && (
            <div style={{ fontSize: 13, color: '#374151', background: '#f1f5f9', borderRadius: 6, padding: '8px 12px' }}>
              Valor do dia: <strong>R$ {fmt(valorDia)}</strong> (valor mensal ÷ dias). Com todos os dias trabalhados o mês fecha em R$ {fmt(valor)}.
            </div>
          )}
          {modal.id && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
              Ao salvar, os dias já lançados deste mês são recalculados automaticamente.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-secundario" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-primario" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {confirmarExcluir && (
        <Modal titulo="Confirmar exclusão" onFechar={() => setConfirmarExcluir(null)}>
          <p style={{ marginBottom: 20, color: '#374151' }}>
            Excluir o cadastro deste mês? Os dias já lançados ficam com valor R$ 0,00 até o mês ser cadastrado de novo.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secundario" onClick={() => setConfirmarExcluir(null)}>Cancelar</button>
            <button className="btn btn-primario" style={{ background: '#dc2626', borderColor: '#dc2626' }} onClick={excluir}>
              Excluir
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
