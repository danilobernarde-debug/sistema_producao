import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

function fmtData(d) {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const MODAL_VAZIO = { id: null, data: '', descricao: '' }

export default function Feriados() {
  const navegar = useNavigate()
  const [feriados, setFeriados]         = useState([])
  const [carregando, setCarregando]     = useState(true)
  const [modal, setModal]               = useState(null)
  const [salvando, setSalvando]         = useState(false)
  const [erro, setErro]                 = useState('')
  const [toast, setToast]               = useState(null)
  const [confirmarDel, setConfirmarDel] = useState(null)
  const [anoFiltro, setAnoFiltro]       = useState(String(new Date().getFullYear()))

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    setCarregando(true)
    const { data } = await supabase
      .from('d_metas_feriados')
      .select('*')
      .order('data')
    setFeriados(data || [])
    setCarregando(false)
  }

  function mostrarToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function salvar() {
    if (!modal.data || !modal.descricao.trim()) {
      setErro('Preencha a data e a descrição.')
      return
    }
    setSalvando(true)
    setErro('')
    const payload = { data: modal.data, descricao: modal.descricao.trim() }
    const { error } = modal.id
      ? await supabase.from('d_metas_feriados').update(payload).eq('id', modal.id)
      : await supabase.from('d_metas_feriados').insert(payload)
    setSalvando(false)
    if (error) {
      if (error.message?.includes('unique') || error.code === '23505') {
        setErro('Já existe um feriado cadastrado nesta data.')
      } else {
        setErro(error.message)
      }
      return
    }
    setModal(null)
    mostrarToast(modal.id ? 'Feriado atualizado' : 'Feriado cadastrado')
    carregarDados()
  }

  async function deletar(id) {
    const { error } = await supabase.from('d_metas_feriados').delete().eq('id', id)
    setConfirmarDel(null)
    if (error) { alert(error.message); return }
    mostrarToast('Feriado removido')
    setFeriados(prev => prev.filter(f => f.id !== id))
  }

  const anos = useMemo(() => {
    const set = new Set(feriados.map(f => f.data?.slice(0, 4)).filter(Boolean))
    const anoAtual = String(new Date().getFullYear())
    set.add(anoAtual)
    return [...set].sort().reverse()
  }, [feriados])

  const feriadosFiltrados = useMemo(() =>
    anoFiltro === 'todos' ? feriados : feriados.filter(f => f.data?.startsWith(anoFiltro)),
    [feriados, anoFiltro]
  )

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
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Feriados Nacionais</h1>
        </div>
        <button className="btn btn-primario" onClick={() => { setErro(''); setModal({ ...MODAL_VAZIO }) }}>
          + Adicionar feriado
        </button>
      </div>

      {/* Filtro por ano */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Filtrar por ano:</span>
          {[{ v: 'todos', l: 'Todos' }, ...anos.map(a => ({ v: a, l: a }))].map(({ v, l }) => (
            <button key={v} onClick={() => setAnoFiltro(v)}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 16, cursor: 'pointer',
                border: '1px solid',
                borderColor: anoFiltro === v ? '#1a56db' : '#e5e7eb',
                background: anoFiltro === v ? '#eff6ff' : 'white',
                color: anoFiltro === v ? '#1a56db' : '#374151',
                fontWeight: anoFiltro === v ? 600 : 400,
              }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {carregando ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Carregando...</div>
        ) : feriadosFiltrados.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            Nenhum feriado cadastrado{anoFiltro !== 'todos' ? ` para ${anoFiltro}` : ''}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                {['Data', 'Dia', 'Descrição', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', fontWeight: 600, color: '#374151',
                    borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap',
                    textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {feriadosFiltrados.map((f, idx) => {
                const dow = f.data ? new Date(f.data + 'T12:00:00').getDay() : null
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f3f4f6',
                    background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e2a3b', whiteSpace: 'nowrap' }}>
                      {fmtData(f.data)}
                    </td>
                    <td style={{ padding: '10px 14px', color: dow === 0 || dow === 6 ? '#dc2626' : '#374151',
                      fontWeight: dow === 0 || dow === 6 ? 600 : 400 }}>
                      {dow !== null ? DIAS_SEMANA[dow] : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>{f.descricao}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => { setErro(''); setModal({ id: f.id, data: f.data, descricao: f.descricao }) }}
                        style={{ marginRight: 6, padding: '3px 10px', fontSize: 12, borderRadius: 4,
                          border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', color: '#374151' }}>
                        Editar
                      </button>
                      <button onClick={() => setConfirmarDel(f.id)}
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

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 420,
            maxWidth: '94vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e2a3b' }}>
                {modal.id ? 'Editar feriado' : 'Novo feriado'}
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none',
                fontSize: 20, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="campo-grupo" style={{ marginBottom: 0 }}>
                <label className="campo-label">Data</label>
                <input type="date" className="campo-input" value={modal.data}
                  onChange={e => setModal(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div className="campo-grupo" style={{ marginBottom: 0 }}>
                <label className="campo-label">Descrição</label>
                <input type="text" className="campo-input" placeholder="Ex: Natal"
                  value={modal.descricao}
                  onChange={e => setModal(p => ({ ...p, descricao: e.target.value }))} />
              </div>
              {modal.data && (
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  Dia da semana: <strong style={{
                    color: [0,6].includes(new Date(modal.data + 'T12:00:00').getDay()) ? '#dc2626' : '#1e2a3b'
                  }}>
                    {DIAS_SEMANA[new Date(modal.data + 'T12:00:00').getDay()]}
                  </strong>
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

      {confirmarDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setConfirmarDel(null)}>
          <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 360,
            maxWidth: '94vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e2a3b', marginBottom: 10 }}>
              Confirmar exclusão
            </div>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 20 }}>
              Este feriado será removido permanentemente.
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
