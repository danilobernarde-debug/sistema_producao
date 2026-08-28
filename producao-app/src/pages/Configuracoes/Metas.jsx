import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtData(d) {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

const MODAL_VAZIO = { id: null, tipo_equipe_id: '', meta_mensal: '', data_inicio: '', data_fim: '' }

export default function Metas() {
  const navegar = useNavigate()
  const [tiposEquipe, setTiposEquipe] = useState([])
  const [metas, setMetas]             = useState([])
  const [carregando, setCarregando]   = useState(true)
  const [modal, setModal]             = useState(null)       // null | objeto
  const [salvando, setSalvando]       = useState(false)
  const [erro, setErro]               = useState('')
  const [toast, setToast]             = useState(null)
  const [confirmarDel, setConfirmarDel] = useState(null)     // id a deletar
  const [tipoFiltro, setTipoFiltro]   = useState('todos')
  const [recalculando, setRecalculando] = useState(false)

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    setCarregando(true)
    const [{ data: tipos }, { data: metasData }] = await Promise.all([
      supabase.from('d_tipo_equipe').select('id, descricao').order('descricao'),
      supabase.from('d_metas_tipo_equipe')
        .select('*, d_tipo_equipe(descricao)')
        .order('tipo_equipe_id')
        .order('data_inicio'),
    ])
    setTiposEquipe(tipos || [])
    setMetas(metasData || [])
    setCarregando(false)
  }

  function mostrarToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function abrirAdicionar() {
    setErro('')
    setModal({ ...MODAL_VAZIO })
  }

  function abrirEditar(m) {
    setErro('')
    setModal({
      id: m.id,
      tipo_equipe_id: String(m.tipo_equipe_id),
      meta_mensal: String(m.meta_mensal),
      data_inicio: m.data_inicio,
      data_fim: m.data_fim,
    })
  }

  async function salvar() {
    if (!modal.tipo_equipe_id || !modal.meta_mensal || !modal.data_inicio || !modal.data_fim) {
      setErro('Preencha todos os campos.')
      return
    }
    if (modal.data_inicio > modal.data_fim) {
      setErro('Data início deve ser anterior à data fim.')
      return
    }
    setSalvando(true)
    setErro('')
    const payload = {
      tipo_equipe_id: Number(modal.tipo_equipe_id),
      meta_mensal:    Number(String(modal.meta_mensal).replace(',', '.')),
      data_inicio:    modal.data_inicio,
      data_fim:       modal.data_fim,
    }
    const { error } = modal.id
      ? await supabase.from('d_metas_tipo_equipe').update(payload).eq('id', modal.id)
      : await supabase.from('d_metas_tipo_equipe').insert(payload)

    setSalvando(false)
    if (error) {
      if (error.message?.includes('exclusion constraint') || error.message?.includes('conflicting')) {
        setErro('Período conflita com outro registro já cadastrado para este tipo de equipe.')
      } else {
        setErro(error.message)
      }
      return
    }
    setModal(null)
    mostrarToast(modal.id ? 'Meta atualizada' : 'Meta cadastrada')
    carregarDados()
  }

  async function recalcular() {
    setRecalculando(true)
    const { data, error } = await supabase.rpc('fn_prod_gerar_metas_diarias')
    setRecalculando(false)
    if (error) { alert('Erro ao recalcular: ' + error.message); return }
    mostrarToast(`Metas diárias geradas: ${data} registros`)
  }

  async function deletar(id) {
    const { error } = await supabase.from('d_metas_tipo_equipe').delete().eq('id', id)
    setConfirmarDel(null)
    if (error) { alert(error.message); return }
    mostrarToast('Meta removida')
    setMetas(prev => prev.filter(m => m.id !== id))
  }

  const metasFiltradas = useMemo(() =>
    tipoFiltro === 'todos' ? metas : metas.filter(m => String(m.tipo_equipe_id) === tipoFiltro),
    [metas, tipoFiltro]
  )

  const anoAtual = new Date().getFullYear()

  return (
    <div className="pagina">
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: '#166534', color: '#dcfce7', fontSize: 13, fontWeight: 500,
          padding: '10px 18px', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 8 }}>
          ✓ {toast}
        </div>
      )}

      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar('/configuracoes')}
            style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Metas por Tipo de Equipe</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secundario" onClick={() => navegar('/configuracoes/feriados')}
            style={{ padding: '8px 14px', fontSize: 13 }}>
            📅 Feriados
          </button>
          <button className="btn btn-secundario" onClick={recalcular} disabled={recalculando}
            title="Recalcula d_metas_diarias com base nas metas e feriados cadastrados">
            {recalculando ? 'Calculando...' : '⟳ Recalcular metas diárias'}
          </button>
          <button className="btn btn-primario" onClick={abrirAdicionar}>+ Adicionar meta</button>
        </div>
      </div>

      {/* Filtro por tipo */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Filtrar por tipo:
          </label>
          <select className="campo-select" value={tipoFiltro}
            onChange={e => setTipoFiltro(e.target.value)}
            style={{ width: 260, fontSize: 13 }}>
            <option value="todos">Todos</option>
            {tiposEquipe.map(t => <option key={t.id} value={String(t.id)}>{t.descricao}</option>)}
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {carregando ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            Carregando...
          </div>
        ) : metasFiltradas.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            Nenhuma meta cadastrada.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                {['Tipo de Equipe', 'Data Início', 'Data Fim', 'Meta Mensal', 'Período', ''].map((h, i) => (
                  <th key={h} style={{
                    padding: '10px 14px', fontWeight: 600, color: '#374151',
                    borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap',
                    textAlign: i >= 3 ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metasFiltradas.map((m, idx) => {
                const iniAno = Number(m.data_inicio?.slice(0, 4))
                const fimAno = Number(m.data_fim?.slice(0, 4))
                const isAtual = iniAno <= anoAtual && fimAno >= anoAtual
                const mesesCobertos = Math.round(
                  (new Date(m.data_fim) - new Date(m.data_inicio)) / (1000 * 60 * 60 * 24 * 30.44)
                ) + 1
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6',
                    background: isAtual ? '#f0f9ff' : (idx % 2 === 0 ? 'white' : '#fafafa') }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e2a3b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {m.d_tipo_equipe?.descricao || `Tipo ${m.tipo_equipe_id}`}
                        {isAtual && (
                          <span style={{ fontSize: 10, background: '#dbeafe', color: '#1d4ed8',
                            padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>
                            {anoAtual}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{fmtData(m.data_inicio)}</td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{fmtData(m.data_fim)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#1e2a3b' }}>
                      R$ {fmt(m.meta_mensal)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#6b7280', fontSize: 12 }}>
                      {mesesCobertos} {mesesCobertos === 1 ? 'mês' : 'meses'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => abrirEditar(m)}
                        style={{ marginRight: 6, padding: '3px 10px', fontSize: 12, borderRadius: 4,
                          border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', color: '#374151' }}>
                        Editar
                      </button>
                      <button onClick={() => setConfirmarDel(m.id)}
                        style={{ padding: '3px 10px', fontSize: 12, borderRadius: 4,
                          border: '1px solid #fca5a5', background: 'white', cursor: 'pointer', color: '#dc2626' }}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modal add/edit */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 460,
            maxWidth: '94vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e2a3b' }}>
                {modal.id ? 'Editar meta' : 'Nova meta'}
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none',
                fontSize: 20, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="campo-grupo" style={{ marginBottom: 0 }}>
                <label className="campo-label">Tipo de Equipe</label>
                <select className="campo-select" value={modal.tipo_equipe_id}
                  onChange={e => setModal(p => ({ ...p, tipo_equipe_id: e.target.value }))}
                  disabled={!!modal.id}>
                  <option value="">Selecione...</option>
                  {tiposEquipe.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
                </select>
              </div>

              <div className="campo-grupo" style={{ marginBottom: 0 }}>
                <label className="campo-label">Meta Mensal (R$)</label>
                <input type="number" className="campo-input" min="0" step="0.01"
                  placeholder="Ex: 160000"
                  value={modal.meta_mensal}
                  onChange={e => setModal(p => ({ ...p, meta_mensal: e.target.value }))} />
              </div>

              <div className="grid-2" style={{ gap: 12 }}>
                <div className="campo-grupo" style={{ marginBottom: 0 }}>
                  <label className="campo-label">Data Início</label>
                  <input type="date" className="campo-input" value={modal.data_inicio}
                    onChange={e => setModal(p => ({ ...p, data_inicio: e.target.value }))} />
                </div>
                <div className="campo-grupo" style={{ marginBottom: 0 }}>
                  <label className="campo-label">Data Fim</label>
                  <input type="date" className="campo-input" value={modal.data_fim}
                    onChange={e => setModal(p => ({ ...p, data_fim: e.target.value }))} />
                </div>
              </div>

              {modal.data_inicio && modal.data_fim && modal.meta_mensal && (
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
                  padding: '10px 14px', fontSize: 12, color: '#0369a1' }}>
                  Meta anual estimada: <strong>R$ {fmt(
                    Number(String(modal.meta_mensal).replace(',', '.')) *
                    (Math.round((new Date(modal.data_fim) - new Date(modal.data_inicio)) / (1000*60*60*24*30.44)) + 1)
                  )}</strong>
                </div>
              )}

              {erro && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
                  padding: '8px 12px', fontSize: 13, color: '#dc2626' }}>{erro}</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button className="btn btn-secundario" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primario" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : modal.id ? 'Salvar alterações' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {confirmarDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setConfirmarDel(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 380,
            maxWidth: '94vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e2a3b', marginBottom: 10 }}>
              Confirmar exclusão
            </div>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 20 }}>
              Esta meta será removida permanentemente. Deseja continuar?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secundario" onClick={() => setConfirmarDel(null)}>Cancelar</button>
              <button onClick={() => deletar(confirmarDel)}
                style={{ padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: '#dc2626', color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
