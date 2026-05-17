import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const POR_PAGINA = 30

/**
 * Props:
 *   titulo        — título da página
 *   tabela        — nome da tabela no Supabase
 *   colunas       — array de { nome, label, tipo, obrigatorio, ocultarLista, tabela_ref, coluna_valor, coluna_label, opcoes }
 *   ordenarPor    — coluna para ordenação padrão
 *   chavePrimaria — nome da PK (padrão: 'id')
 *   buscaPor      — campo para filtro de busca textual (opcional)
 *   voltarPara    — rota para o botão Voltar (opcional)
 */
export default function TabelaCRUD({
  titulo,
  tabela,
  colunas,
  ordenarPor = 'id',
  chavePrimaria = 'id',
  buscaPor,
  voltarPara,
}) {
  const navegar = useNavigate()
  const [registros, setRegistros]         = useState([])
  const [total, setTotal]                 = useState(0)
  const [pagina, setPagina]               = useState(1)
  const [carregando, setCarregando]       = useState(true)
  const [busca, setBusca]                 = useState('')
  const [modal, setModal]                 = useState(null)   // null | { modo: 'novo'|'editar', id? }
  const [form, setForm]                   = useState({})
  const [erros, setErros]                 = useState({})
  const [salvando, setSalvando]           = useState(false)
  const [confirmarExcluir, setConfirmarExcluir] = useState(null)
  const [opcoesSelect, setOpcoesSelect]   = useState({})

  // Carrega opções de selects relacionais
  useEffect(() => {
    colunas.filter(c => c.tipo === 'select' && c.tabela_ref).forEach(c => {
      supabase.from(c.tabela_ref).select(`${c.coluna_valor}, ${c.coluna_label}`).order(c.coluna_label)
        .then(({ data }) => {
          setOpcoesSelect(prev => ({
            ...prev,
            [c.nome]: (data || []).map(op => ({ valor: op[c.coluna_valor], label: op[c.coluna_label] })),
          }))
        })
    })
    // Opções fixas
    colunas.filter(c => c.tipo === 'select' && c.opcoes).forEach(c => {
      setOpcoesSelect(prev => ({ ...prev, [c.nome]: c.opcoes }))
    })
  }, []) // eslint-disable-line

  async function buscar(pag = 1) {
    setCarregando(true)
    const from = (pag - 1) * POR_PAGINA
    const to   = from + POR_PAGINA - 1

    let q = supabase.from(tabela).select('*', { count: 'exact' }).order(ordenarPor).range(from, to)
    if (buscaPor && busca.trim()) q = q.ilike(buscaPor, `%${busca.trim()}%`)

    const { data, count } = await q
    setRegistros(data || [])
    setTotal(count || 0)
    setCarregando(false)
  }

  useEffect(() => { buscar(pagina) }, [pagina])  // eslint-disable-line

  function filtrar() {
    if (pagina === 1) buscar(1)
    else setPagina(1)
  }

  function abrirNovo() {
    const inicial = {}
    colunas.forEach(c => { inicial[c.nome] = c.tipo === 'checkbox' ? false : '' })
    setForm(inicial)
    setErros({})
    setModal({ modo: 'novo' })
  }

  function abrirEditar(reg) {
    const dados = {}
    colunas.forEach(c => { dados[c.nome] = reg[c.nome] ?? (c.tipo === 'checkbox' ? false : '') })
    setForm(dados)
    setErros({})
    setModal({ modo: 'editar', id: reg[chavePrimaria] })
  }

  function validar() {
    const e = {}
    colunas.filter(c => c.obrigatorio).forEach(c => {
      const v = form[c.nome]
      if (v === '' || v === null || v === undefined) e[c.nome] = 'Campo obrigatório'
    })
    return e
  }

  async function salvar() {
    const e = validar()
    if (Object.keys(e).length) { setErros(e); return }
    setSalvando(true)

    const payload = {}
    colunas.filter(c => !c.somenteLeitura).forEach(c => {
      payload[c.nome] = form[c.nome] === '' ? null : form[c.nome]
    })

    let error
    if (modal.modo === 'novo') {
      ;({ error } = await supabase.from(tabela).insert(payload))
    } else {
      ;({ error } = await supabase.from(tabela).update(payload).eq(chavePrimaria, modal.id))
    }

    setSalvando(false)
    if (error) { setErros({ _geral: error.message }); return }

    setModal(null)
    if (modal.modo === 'novo') { setPagina(1); buscar(1) } else buscar(pagina)
  }

  async function excluir(id) {
    const { error } = await supabase.from(tabela).delete().eq(chavePrimaria, id)
    if (error) { alert(error.message); return }
    setConfirmarExcluir(null)
    buscar(pagina)
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA)
  const colunasTabela = colunas.filter(c => !c.ocultarLista)

  function exibirValor(col, reg) {
    const v = reg[col.nome]
    if (col.tipo === 'checkbox') return v ? 'Sim' : 'Não'
    if (col.tipo === 'select') {
      const opts = opcoesSelect[col.nome] || []
      return opts.find(o => String(o.valor) === String(v))?.label ?? v ?? '-'
    }
    return v ?? '-'
  }

  return (
    <div className="pagina">
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {voltarPara && (
            <button className="btn btn-secundario" onClick={() => navegar(voltarPara)}
              style={{ padding: '6px 12px', fontSize: 13 }}>
              ← Voltar
            </button>
          )}
          <h1 className="pagina-titulo" style={{ margin: 0 }}>{titulo}</h1>
        </div>
        <button className="btn btn-primario" onClick={abrirNovo}>+ Novo</button>
      </div>

      {buscaPor && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="campo-input" style={{ flex: 1 }}
              placeholder="Buscar..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && filtrar()}
            />
            <button className="btn btn-primario" onClick={filtrar}>Buscar</button>
            {busca && <button className="btn btn-secundario" onClick={() => { setBusca(''); if (pagina === 1) buscar(1); else setPagina(1) }}>Limpar</button>}
          </div>
        </div>
      )}

      <div className="card">
        {carregando ? (
          <div className="loading"><div className="spinner" /> Carregando...</div>
        ) : registros.length === 0 ? (
          <div className="vazio"><div className="vazio-icone">📋</div>Nenhum registro encontrado.</div>
        ) : (
          <>
            <div className="tabela-container">
              <table className="tabela">
                <thead>
                  <tr>
                    {colunasTabela.map(c => <th key={c.nome}>{c.label}</th>)}
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r[chavePrimaria]}>
                      {colunasTabela.map(c => <td key={c.nome}>{exibirValor(c, r)}</td>)}
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secundario" style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => abrirEditar(r)}>Editar</button>
                          <button className="btn btn-secundario" style={{ padding: '4px 10px', fontSize: 12, color: '#dc2626', borderColor: '#fca5a5' }}
                            onClick={() => setConfirmarExcluir(r[chavePrimaria])}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                {total} registro{total !== 1 ? 's' : ''} — página {pagina} de {totalPaginas}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }} onClick={() => setPagina(1)}           disabled={pagina === 1}>«</button>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }} onClick={() => setPagina(p => p - 1)} disabled={pagina === 1}>‹</button>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }} onClick={() => setPagina(p => p + 1)} disabled={pagina >= totalPaginas}>›</button>
                <button className="btn btn-secundario" style={{ padding: '4px 12px' }} onClick={() => setPagina(totalPaginas)} disabled={pagina >= totalPaginas}>»</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal criar/editar */}
      {modal && (
        <Modal
          titulo={modal.modo === 'novo' ? `Novo — ${titulo}` : `Editar — ${titulo}`}
          onFechar={() => setModal(null)}
        >
          {erros._geral && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
              {erros._geral}
            </div>
          )}
          {colunas.filter(c => !c.somenteLeitura).map(c => (
            <CampoForm
              key={c.nome}
              campo={c}
              valor={form[c.nome]}
              erro={erros[c.nome]}
              opcoes={opcoesSelect[c.nome] || []}
              onChange={v => setForm(prev => ({ ...prev, [c.nome]: v }))}
            />
          ))}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-secundario" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-primario" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Confirmação de exclusão */}
      {confirmarExcluir !== null && (
        <Modal titulo="Confirmar exclusão" onFechar={() => setConfirmarExcluir(null)}>
          <p style={{ marginBottom: 20, color: '#374151' }}>Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secundario" onClick={() => setConfirmarExcluir(null)}>Cancelar</button>
            <button
              className="btn btn-primario"
              style={{ background: '#dc2626', borderColor: '#dc2626' }}
              onClick={() => excluir(confirmarExcluir)}
            >
              Excluir
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const TOOLTIP_W = 220

function InfoTooltip({ texto }) {
  const [pos, setPos] = useState(null)
  const iconeRef = useRef(null)

  function mostrar() {
    const rect = iconeRef.current.getBoundingClientRect()
    const iconCX = rect.left + rect.width / 2
    let left = iconCX - TOOLTIP_W / 2
    left = Math.max(8, Math.min(left, window.innerWidth - TOOLTIP_W - 8))
    const arrowLeft = Math.max(10, Math.min(iconCX - left, TOOLTIP_W - 10))
    setPos({ left, top: rect.top - 8, arrowLeft })
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 5 }}>
      <span
        ref={iconeRef}
        onMouseEnter={mostrar}
        onMouseLeave={() => setPos(null)}
        style={{ cursor: 'help', color: '#9ca3af', fontSize: 13, userSelect: 'none', lineHeight: 1 }}
      >ⓘ</span>
      {pos && (
        <div style={{
          position: 'fixed', left: pos.left, top: pos.top,
          transform: 'translateY(-100%)',
          background: '#1e2a3b', color: 'white', borderRadius: 6,
          padding: '7px 11px', fontSize: 12, zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          width: TOOLTIP_W, whiteSpace: 'normal', lineHeight: 1.5,
          pointerEvents: 'none',
        }}>
          {texto}
          <div style={{
            position: 'absolute', left: pos.arrowLeft, top: '100%',
            transform: 'translateX(-50%)',
            borderWidth: 5, borderStyle: 'solid',
            borderColor: '#1e2a3b transparent transparent transparent',
          }} />
        </div>
      )}
    </span>
  )
}

function LabelCampo({ campo }) {
  return (
    <label className="campo-label">
      {campo.label}
      {campo.obrigatorio && <span className="obrigatorio"> *</span>}
      {campo.ajuda && <InfoTooltip texto={campo.ajuda} />}
    </label>
  )
}

function CampoForm({ campo, valor, erro, opcoes, onChange }) {
  const classeInput  = `campo-input${erro ? ' erro' : ''}`
  const classeSelect = `campo-select${erro ? ' erro' : ''}`

  if (campo.tipo === 'select') {
    return (
      <div className="campo-grupo">
        <LabelCampo campo={campo} />
        <select className={classeSelect} value={valor ?? ''} onChange={e => onChange(e.target.value)}>
          <option value="">Selecione...</option>
          {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
        </select>
        {erro && <div className="campo-erro-msg">{erro}</div>}
      </div>
    )
  }

  if (campo.tipo === 'checkbox') {
    return (
      <div className="campo-grupo">
        <label className="checkbox-grupo">
          <input type="checkbox" checked={!!valor} onChange={e => onChange(e.target.checked)} />
          {campo.label}
          {campo.ajuda && <InfoTooltip texto={campo.ajuda} />}
        </label>
      </div>
    )
  }

  if (campo.tipo === 'textarea') {
    return (
      <div className="campo-grupo">
        <LabelCampo campo={campo} />
        <textarea className={`campo-textarea${erro ? ' erro' : ''}`} value={valor ?? ''} rows={3}
          onChange={e => onChange(e.target.value)} />
        {erro && <div className="campo-erro-msg">{erro}</div>}
      </div>
    )
  }

  const tipoHtml = { numero: 'number', decimal: 'number', data: 'date' }[campo.tipo] || 'text'

  return (
    <div className="campo-grupo">
      <LabelCampo campo={campo} />
      <input type={tipoHtml} className={classeInput} value={valor ?? ''} onChange={e => onChange(e.target.value)} />
      {erro && <div className="campo-erro-msg">{erro}</div>}
    </div>
  )
}

export function Modal({ titulo, onFechar, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 10, width: '100%', maxWidth: 500,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1e2a3b' }}>{titulo}</h2>
          <button onClick={onFechar}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#9ca3af', lineHeight: 1, padding: '0 2px' }}>
            ×
          </button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
