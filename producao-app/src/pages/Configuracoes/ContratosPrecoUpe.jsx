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

export default function ContratosPrecoUpe() {
  const navegar = useNavigate()
  const [contratos, setContratos]   = useState([]) // [{ id, descricao, vigente, agendados, historico }]
  const [todosContratos, setTodosContratos] = useState([]) // [{ id, descricao }] — inclui os sem preço cadastrado
  const [carregando, setCarregando] = useState(true)
  const [filtroContratoId, setFiltroContratoId] = useState('')
  const [expandidos, setExpandidos] = useState({})
  const [modalPreco, setModalPreco] = useState(null) // { contratoId, id, vigencia_inicio, upe_lm, upe_lv }
  const [erroModal, setErroModal]   = useState('')
  const [salvando, setSalvando]     = useState(false)
  const [confirmarExcluir, setConfirmarExcluir] = useState(null) // { id }
  const [toast, setToast] = useState(null)

  useEffect(() => { carregar() }, [])

  function mostrarToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function carregar() {
    setCarregando(true)
    const { data: contratosData } = await supabase.from('d_contratos').select('id, descricao').order('descricao')
    setTodosContratos(contratosData || [])
    const { data: precosData } = await supabase
      .from('d_contratos_preco_upe')
      .select('id, contrato_id, vigencia_inicio, upe_lm, upe_lv')
      .order('vigencia_inicio', { ascending: false })

    const hoje = hojeISO()
    setContratos((contratosData || [])
      .map(c => {
        const lista = (precosData || []).filter(p => p.contrato_id === c.id)
        const idxVigente = lista.findIndex(p => p.vigencia_inicio <= hoje)
        return {
          id: c.id,
          descricao: c.descricao,
          vigente:   idxVigente === -1 ? null : lista[idxVigente],
          agendados: idxVigente === -1 ? lista : lista.slice(0, idxVigente),
          historico: idxVigente === -1 ? [] : lista.slice(idxVigente + 1),
        }
      })
      .filter(c => c.vigente || c.agendados.length > 0 || c.historico.length > 0))
    setCarregando(false)
  }

  function alternarHistorico(contratoId) {
    setExpandidos(prev => ({ ...prev, [contratoId]: !prev[contratoId] }))
  }

  function abrirNovoPreco(contrato) {
    setErroModal('')
    setModalPreco({
      contratoId: contrato.id,
      id: null,
      novoContrato: false,
      vigencia_inicio: hojeISO(),
      upe_lm: contrato.vigente?.upe_lm != null ? String(contrato.vigente.upe_lm).replace('.', ',') : '',
      upe_lv: contrato.vigente?.upe_lv != null ? String(contrato.vigente.upe_lv).replace('.', ',') : '',
    })
  }

  function abrirEditarPreco(contratoId, row) {
    setErroModal('')
    setModalPreco({
      contratoId,
      id: row.id,
      novoContrato: false,
      vigencia_inicio: row.vigencia_inicio,
      upe_lm: row.upe_lm != null ? String(row.upe_lm).replace('.', ',') : '',
      upe_lv: row.upe_lv != null ? String(row.upe_lv).replace('.', ',') : '',
    })
  }

  function abrirNovoContrato() {
    setErroModal('')
    setModalPreco({
      contratoId: '',
      id: null,
      novoContrato: true,
      vigencia_inicio: hojeISO(),
      upe_lm: '',
      upe_lv: '',
    })
  }

  async function salvarPreco() {
    if (modalPreco.novoContrato && !modalPreco.contratoId) { setErroModal('Selecione o contrato.'); return }
    if (!modalPreco.vigencia_inicio) { setErroModal('Informe a vigência início.'); return }
    const lm = modalPreco.upe_lm === '' ? null : Number(String(modalPreco.upe_lm).replace(',', '.'))
    const lv = modalPreco.upe_lv === '' ? null : Number(String(modalPreco.upe_lv).replace(',', '.'))
    if ((lm !== null && Number.isNaN(lm)) || (lv !== null && Number.isNaN(lv))) { setErroModal('Valor inválido.'); return }
    if (lm === null && lv === null) { setErroModal('Informe pelo menos um dos valores (LM ou LV).'); return }

    setSalvando(true)
    const payload = {
      contrato_id: Number(modalPreco.contratoId),
      vigencia_inicio: modalPreco.vigencia_inicio,
      upe_lm: lm === null ? null : Math.round(lm * 100) / 100,
      upe_lv: lv === null ? null : Math.round(lv * 100) / 100,
    }
    const { error } = modalPreco.id
      ? await supabase.from('d_contratos_preco_upe').update(payload).eq('id', modalPreco.id)
      : await supabase.from('d_contratos_preco_upe').insert(payload)
    setSalvando(false)

    if (error) {
      setErroModal(error.message.includes('duplicate key')
        ? 'Já existe um preço cadastrado com essa vigência início pra esse contrato.'
        : error.message)
      return
    }
    setModalPreco(null)
    mostrarToast(modalPreco.id ? 'Preço atualizado' : 'Preço cadastrado')
    carregar()
  }

  async function excluirPreco() {
    const { error } = await supabase.from('d_contratos_preco_upe').delete().eq('id', confirmarExcluir.id)
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
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Preço UPE por Contrato</h1>
        </div>
      </div>

      <AbasAtividades />

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="campo-grupo" style={{ marginBottom: 0, width: 280 }}>
          <label className="campo-label">Contrato</label>
          <select className="campo-select" value={filtroContratoId} onChange={e => setFiltroContratoId(e.target.value)}>
            <option value="">Todos</option>
            {contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
          </select>
        </div>
        <button className="btn btn-primario" onClick={abrirNovoContrato}>+ Cadastrar UPE de contrato novo</button>
      </div>

      {carregando ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Carregando...</div>
      ) : contratos.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          Nenhum contrato com preço UPE cadastrado ainda.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <colgroup>
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 260 }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {[
                    { h: 'Contrato', align: 'left' },
                    { h: 'UPE LM', align: 'right' },
                    { h: 'UPE LV', align: 'right' },
                    { h: 'Vigência Início', align: 'left' },
                    { h: 'Ações', align: 'right' },
                  ].map((col, i) => (
                    <th key={i} style={{ padding: '8px 12px', fontWeight: 600, color: '#374151',
                      borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap',
                      textAlign: col.align }}>{col.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contratos
                  .filter(c => !filtroContratoId || String(c.id) === String(filtroContratoId))
                  .flatMap((c, idx) => {
                  const fundo = idx % 2 === 0 ? 'white' : '#fafafa'
                  const linhas = [
                    <tr key={c.id} style={{ borderTop: idx === 0 ? 'none' : '2px solid #e5e7eb', background: fundo }}>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: '#1e2a3b' }}>{c.descricao}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {c.vigente?.upe_lm != null
                          ? <span style={{ color: '#15803d', fontWeight: 700 }}>R$ {fmt(c.vigente.upe_lm)}</span>
                          : <span style={{ color: '#d1d5db' }}>-</span>}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {c.vigente?.upe_lv != null
                          ? <span style={{ color: '#15803d', fontWeight: 700 }}>R$ {fmt(c.vigente.upe_lv)}</span>
                          : <span style={{ color: '#d1d5db' }}>-</span>}
                      </td>
                      <td style={{ padding: '7px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {c.vigente ? fmtData(c.vigente.vigencia_inicio) : '-'}
                        {c.agendados.map(p => (
                          <div key={p.id} style={{ fontSize: 11, marginTop: 2 }}>
                            <span className="badge badge-azul">agendado</span>{' '}{fmtData(p.vigencia_inicio)}
                          </div>
                        ))}
                      </td>
                      <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {c.historico.length > 0 && (
                            <button onClick={() => alternarHistorico(c.id)}
                              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', padding: '2px 4px' }}>
                              {expandidos[c.id] ? '▾' : '▸'} {c.historico.length}
                            </button>
                          )}
                          <button className="btn btn-secundario" style={{ padding: '4px 9px', fontSize: 12 }}
                            disabled={!c.vigente} onClick={() => abrirEditarPreco(c.id, c.vigente)}>Editar</button>
                          <button className="btn btn-secundario" style={{ padding: '4px 9px', fontSize: 12, color: '#dc2626', borderColor: '#fca5a5' }}
                            disabled={!c.vigente} onClick={() => setConfirmarExcluir({ id: c.vigente.id })}>Excluir</button>
                          <button className="btn btn-primario" style={{ padding: '4px 9px', fontSize: 12 }}
                            onClick={() => abrirNovoPreco(c)}>+ Novo</button>
                        </div>
                      </td>
                    </tr>,
                  ]
                  if (expandidos[c.id]) {
                    c.historico.forEach(p => linhas.push(
                      <tr key={`h-${p.id}`} style={{ borderTop: '1px dashed #e5e7eb', background: fundo }}>
                        <td style={{ padding: '5px 12px', color: '#9ca3af', fontSize: 12 }}>histórico</td>
                        <td style={{ padding: '5px 12px', textAlign: 'right', color: '#6b7280', fontSize: 12 }}>
                          {p.upe_lm != null ? `R$ ${fmt(p.upe_lm)}` : '-'}
                        </td>
                        <td style={{ padding: '5px 12px', textAlign: 'right', color: '#6b7280', fontSize: 12 }}>
                          {p.upe_lv != null ? `R$ ${fmt(p.upe_lv)}` : '-'}
                        </td>
                        <td style={{ padding: '5px 12px', color: '#6b7280', fontSize: 12 }}>{fmtData(p.vigencia_inicio)}</td>
                        <td style={{ padding: '5px 12px' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button className="btn btn-secundario" style={{ padding: '2px 8px', fontSize: 11 }}
                              onClick={() => abrirEditarPreco(c.id, p)}>Editar</button>
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
        <Modal titulo={modalPreco.id ? 'Editar preço UPE' : 'Novo preço UPE'} onFechar={() => setModalPreco(null)}>
          {erroModal && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
              {erroModal}
            </div>
          )}
          {modalPreco.novoContrato && (
            <div className="campo-grupo">
              <label className="campo-label">Contrato <span className="obrigatorio">*</span></label>
              <select className="campo-select" value={modalPreco.contratoId}
                onChange={e => setModalPreco(prev => ({ ...prev, contratoId: e.target.value }))}>
                <option value="">Selecione...</option>
                {todosContratos.filter(t => !contratos.some(c => c.id === t.id)).map(t => (
                  <option key={t.id} value={t.id}>{t.descricao}</option>
                ))}
              </select>
            </div>
          )}
          <div className="campo-grupo">
            <label className="campo-label">Vigência Início <span className="obrigatorio">*</span></label>
            <input type="date" className="campo-input" value={modalPreco.vigencia_inicio}
              onChange={e => setModalPreco(prev => ({ ...prev, vigencia_inicio: e.target.value }))} />
          </div>
          <div className="campo-grupo">
            <label className="campo-label">UPE LM</label>
            <input type="text" className="campo-input" placeholder="0,00" value={modalPreco.upe_lm}
              onChange={e => setModalPreco(prev => ({ ...prev, upe_lm: e.target.value }))} />
          </div>
          <div className="campo-grupo">
            <label className="campo-label">UPE LV</label>
            <input type="text" className="campo-input" placeholder="0,00" value={modalPreco.upe_lv}
              onChange={e => setModalPreco(prev => ({ ...prev, upe_lv: e.target.value }))} />
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
