import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { Modal } from '../../components/TabelaCRUD'
import AbasAtividades from '../../components/AbasAtividades'

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtData(v) {
  if (!v) return '-'
  const [a, m, d] = v.split('-')
  return `${d}/${m}/${a}`
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function AtividadesPrecoFixa() {
  const navegar = useNavigate()
  const [contratos, setContratos]   = useState([])
  const [contratoId, setContratoId] = useState('')
  const [atividades, setAtividades] = useState([]) // [{ id, codigo_op, descricao, vigente, agendados, historico }]
  const [carregando, setCarregando] = useState(false)
  const [expandidos, setExpandidos] = useState({})
  const [modalPreco, setModalPreco] = useState(null) // { atividadeId, id, valor, vigencia_inicio }
  const [erroModal, setErroModal]   = useState('')
  const [salvando, setSalvando]     = useState(false)
  const [confirmarExcluir, setConfirmarExcluir] = useState(null) // { id }
  const [toast, setToast] = useState(null)

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao').then(({ data }) => setContratos(data || []))
  }, [])

  useEffect(() => {
    setAtividades([])
    if (!contratoId) return
    carregar()
  }, [contratoId]) // eslint-disable-line

  function mostrarToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function carregar() {
    setCarregando(true)
    const { data: ativ } = await supabase
      .from('d_atividades')
      .select('id, codigo_op, descricao')
      .eq('contrato_id', Number(contratoId))
      .eq('tipo_preco', 'fixo')
      .order('codigo_op')

    const ids = (ativ || []).map(a => a.id)
    let precos = []
    if (ids.length) {
      const { data } = await supabase
        .from('d_atividades_preco_fixa')
        .select('id, atividade_id, valor, vigencia_inicio')
        .in('atividade_id', ids)
        .order('vigencia_inicio', { ascending: false })
      precos = data || []
    }

    const hoje = hojeISO()
    setAtividades((ativ || []).map(a => {
      const lista = precos.filter(p => p.atividade_id === a.id)
      const idxVigente = lista.findIndex(p => p.vigencia_inicio <= hoje)
      return {
        id: a.id,
        codigo_op: a.codigo_op,
        descricao: a.descricao,
        vigente:   idxVigente === -1 ? null : lista[idxVigente],
        agendados: idxVigente === -1 ? lista : lista.slice(0, idxVigente),
        historico: idxVigente === -1 ? [] : lista.slice(idxVigente + 1),
      }
    }))
    setCarregando(false)
  }

  function alternarHistorico(atividadeId) {
    setExpandidos(prev => ({ ...prev, [atividadeId]: !prev[atividadeId] }))
  }

  function abrirNovoPreco(atividadeId) {
    setErroModal('')
    setModalPreco({ atividadeId, id: null, valor: '', vigencia_inicio: hojeISO() })
  }

  function abrirEditarPreco(atividadeId, row) {
    setErroModal('')
    setModalPreco({ atividadeId, id: row.id, valor: String(row.valor).replace('.', ','), vigencia_inicio: row.vigencia_inicio })
  }

  async function salvarPreco() {
    if (!modalPreco.vigencia_inicio) { setErroModal('Informe a vigência início.'); return }
    const valorNum = Number(String(modalPreco.valor).replace(',', '.'))
    if (!modalPreco.valor || Number.isNaN(valorNum) || valorNum <= 0) { setErroModal('Informe um valor válido.'); return }

    setSalvando(true)
    const payload = {
      atividade_id: modalPreco.atividadeId,
      valor: Math.round(valorNum * 100) / 100,
      vigencia_inicio: modalPreco.vigencia_inicio,
    }
    const { error } = modalPreco.id
      ? await supabase.from('d_atividades_preco_fixa').update(payload).eq('id', modalPreco.id)
      : await supabase.from('d_atividades_preco_fixa').insert(payload)
    setSalvando(false)

    if (error) {
      setErroModal(error.message.includes('duplicate key')
        ? 'Já existe um preço cadastrado com essa vigência início pra essa atividade.'
        : error.message)
      return
    }
    setModalPreco(null)
    mostrarToast(modalPreco.id ? 'Preço atualizado' : 'Preço cadastrado')
    carregar()
  }

  async function excluirPreco() {
    const { error } = await supabase.from('d_atividades_preco_fixa').delete().eq('id', confirmarExcluir.id)
    setConfirmarExcluir(null)
    if (error) { mostrarToast('Erro ao excluir'); return }
    mostrarToast('Preço excluído')
    carregar()
  }

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
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Preço Fixo por Vigência</h1>
        </div>
        <button className="btn btn-secundario" onClick={() => navegar('/configuracoes/reajuste-preco-fixa')}>
          📈 Reajuste de Preço Fixo
        </button>
      </div>

      <AbasAtividades />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="campo-grupo" style={{ marginBottom: 0, maxWidth: 320 }}>
          <label className="campo-label">Contrato</label>
          <select className="campo-select" value={contratoId} onChange={e => setContratoId(e.target.value)}>
            <option value="">Selecione...</option>
            {contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
          </select>
        </div>
      </div>

      {!contratoId ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          Selecione um contrato para ver as atividades do tipo Fixo.
        </div>
      ) : carregando ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Carregando...</div>
      ) : atividades.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          Nenhuma atividade do tipo Fixo cadastrada para este contrato.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['Código', 'Descrição', 'Valor Vigente', 'Vigência Início', 'Ações'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 12px', fontWeight: 600, color: '#374151',
                      borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap',
                      textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {atividades.flatMap((a, idx) => {
                  const fundo = idx % 2 === 0 ? 'white' : '#fafafa'
                  const linhas = [
                    <tr key={a.id} style={{ borderTop: idx === 0 ? 'none' : '2px solid #e5e7eb', background: fundo }}>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: '#1e2a3b', whiteSpace: 'nowrap' }}>{a.codigo_op}</td>
                      <td style={{ padding: '7px 12px', color: '#374151' }}>{a.descricao}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {a.vigente
                          ? <span style={{ color: '#15803d', fontWeight: 700 }}>R$ {fmt(a.vigente.valor)}</span>
                          : <span style={{ color: '#d1d5db' }}>sem preço</span>}
                        {a.agendados.map(p => (
                          <div key={p.id} style={{ fontSize: 11, marginTop: 2 }}>
                            <span className="badge badge-azul">agendado</span>{' '}R$ {fmt(p.valor)}
                          </div>
                        ))}
                      </td>
                      <td style={{ padding: '7px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {a.vigente ? fmtData(a.vigente.vigencia_inicio) : '-'}
                        {a.agendados.map(p => (
                          <div key={p.id} style={{ fontSize: 11, marginTop: 2 }}>{fmtData(p.vigencia_inicio)}</div>
                        ))}
                      </td>
                      <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {a.historico.length > 0 && (
                            <button onClick={() => alternarHistorico(a.id)}
                              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', padding: '2px 4px' }}>
                              {expandidos[a.id] ? '▾' : '▸'} {a.historico.length}
                            </button>
                          )}
                          <button className="btn btn-secundario" style={{ padding: '4px 9px', fontSize: 12 }}
                            disabled={!a.vigente} onClick={() => abrirEditarPreco(a.id, a.vigente)}>Editar</button>
                          <button className="btn btn-secundario" style={{ padding: '4px 9px', fontSize: 12, color: '#dc2626', borderColor: '#fca5a5' }}
                            disabled={!a.vigente} onClick={() => setConfirmarExcluir({ id: a.vigente.id })}>Excluir</button>
                          <button className="btn btn-primario" style={{ padding: '4px 9px', fontSize: 12 }}
                            onClick={() => abrirNovoPreco(a.id)}>+ Novo</button>
                        </div>
                      </td>
                    </tr>,
                  ]
                  if (expandidos[a.id]) {
                    a.historico.forEach(p => linhas.push(
                      <tr key={`h-${p.id}`} style={{ borderTop: '1px dashed #e5e7eb', background: fundo }}>
                        <td></td>
                        <td style={{ padding: '5px 12px', color: '#9ca3af', fontSize: 12 }}>histórico</td>
                        <td style={{ padding: '5px 12px', textAlign: 'right', color: '#6b7280', fontSize: 12 }}>R$ {fmt(p.valor)}</td>
                        <td style={{ padding: '5px 12px', color: '#6b7280', fontSize: 12 }}>{fmtData(p.vigencia_inicio)}</td>
                        <td style={{ padding: '5px 12px' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button className="btn btn-secundario" style={{ padding: '2px 8px', fontSize: 11 }}
                              onClick={() => abrirEditarPreco(a.id, p)}>Editar</button>
                            <button className="btn btn-secundario" style={{ padding: '2px 8px', fontSize: 11, color: '#dc2626', borderColor: '#fca5a5' }}
                              onClick={() => setConfirmarExcluir({ id: p.id })}>Excluir</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  }
                  return linhas
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalPreco && (
        <Modal titulo={modalPreco.id ? 'Editar preço' : 'Novo preço'} onFechar={() => setModalPreco(null)}>
          {erroModal && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
              {erroModal}
            </div>
          )}
          <div className="campo-grupo">
            <label className="campo-label">Vigência Início <span className="obrigatorio">*</span></label>
            <input type="date" className="campo-input" value={modalPreco.vigencia_inicio}
              onChange={e => setModalPreco(prev => ({ ...prev, vigencia_inicio: e.target.value }))} />
          </div>
          <div className="campo-grupo">
            <label className="campo-label">Valor <span className="obrigatorio">*</span></label>
            <input type="text" className="campo-input" placeholder="0,00" value={modalPreco.valor}
              onChange={e => setModalPreco(prev => ({ ...prev, valor: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-secundario" onClick={() => setModalPreco(null)}>Cancelar</button>
            <button className="btn btn-primario" onClick={salvarPreco} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {confirmarExcluir && (
        <Modal titulo="Confirmar exclusão" onFechar={() => setConfirmarExcluir(null)}>
          <p style={{ marginBottom: 20, color: '#374151' }}>Tem certeza que deseja excluir este preço do histórico? Esta ação não pode ser desfeita.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secundario" onClick={() => setConfirmarExcluir(null)}>Cancelar</button>
            <button className="btn btn-primario" style={{ background: '#dc2626', borderColor: '#dc2626' }} onClick={excluirPreco}>
              Excluir
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
