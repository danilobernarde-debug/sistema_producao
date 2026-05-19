import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

const TIPO_ICONE = {
  texto: '📝', numero: '🔢', decimal: '🔣', alfanumerico: '🔤',
  dropdown: '📋', data: '📅', hora: '🕐', checkbox: '☑️', textarea: '📄',
}

const CAMPOS_FIXOS_REGISTRO = [
  { label: 'Data', tipo: 'data' },
]

const CAMPOS_FIXOS_ATIVIDADE = [
  { label: 'Atividade', tipo: 'dropdown' },
  { label: 'Quantidade', tipo: 'numero' },
]

function CampoFixo({ label, tipo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 12px' }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{TIPO_ICONE[tipo] || '📝'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0369a1' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#7dd3fc' }}>{tipo}</div>
      </div>
      <span style={{ fontSize: 11, color: '#7dd3fc', background: '#e0f2fe', padding: '2px 8px', borderRadius: 10 }}>fixo · obrigatório</span>
    </div>
  )
}

function CampoCard({ f, idx, total, secao, onToggle, onMover, onRemover }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px' }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{TIPO_ICONE[f.config_campos?.tipo] || '📝'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {f.config_campos?.label}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{f.config_campos?.nome} · {f.config_campos?.tipo}</div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6b7280', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}>
        <input type="checkbox" checked={f.obrigatorio} onChange={() => onToggle(f.id, f.obrigatorio)} />
        Obrig.
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        <button onClick={() => onMover(f.id, 'up')} disabled={idx === 0}
          style={{ padding: '0 5px', lineHeight: '14px', fontSize: 10, background: 'none', border: '1px solid #e5e7eb', borderRadius: 3, cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
        <button onClick={() => onMover(f.id, 'down')} disabled={idx === total - 1}
          style={{ padding: '0 5px', lineHeight: '14px', fontSize: 10, background: 'none', border: '1px solid #e5e7eb', borderRadius: 3, cursor: idx === total - 1 ? 'default' : 'pointer', opacity: idx === total - 1 ? 0.3 : 1 }}>▼</button>
      </div>
      <button onClick={() => onRemover(f.id)}
        style={{ flexShrink: 0, background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, padding: '2px 8px', fontSize: 13, cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>
  )
}

function BotaoAdicionarCampo({ campos, jaAdicionados, onAdicionar, ativo }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    if (aberto) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aberto])

  const disponiveis = useMemo(() =>
    campos
      .filter(c => !jaAdicionados.has(c.id))
      .filter(c =>
        !busca ||
        c.label.toLowerCase().includes(busca.toLowerCase()) ||
        c.nome.toLowerCase().includes(busca.toLowerCase())
      ),
    [campos, jaAdicionados, busca]
  )

  function selecionar(campoId) {
    onAdicionar(campoId)
    setAberto(false)
    setBusca('')
  }

  return (
    <div ref={ref} style={{ position: 'relative', marginTop: 8 }}>
      <button
        disabled={!ativo}
        onClick={() => { setAberto(a => !a); setBusca('') }}
        style={{
          width: '100%', padding: '7px 12px', fontSize: 13, background: 'none',
          border: '1px dashed #d1d5db', borderRadius: 8, color: '#6b7280',
          cursor: ativo ? 'pointer' : 'default', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 6, transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { if (ativo) { e.currentTarget.style.borderColor = '#1a56db'; e.currentTarget.style.color = '#1a56db' } }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280' }}
      >
        + Adicionar campo
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
            <input
              autoFocus
              type="text"
              className="campo-input"
              placeholder="Buscar campo..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {disponiveis.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
                {busca ? 'Nenhum campo encontrado' : 'Todos os campos já foram adicionados'}
              </div>
            ) : disponiveis.map(c => (
              <div key={c.id}
                onClick={() => selecionar(c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', fontSize: 13 }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f7ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span>{TIPO_ICONE[c.tipo] || '📝'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, color: '#111827' }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{c.tipo}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FormBuilder() {
  const navegar = useNavigate()
  const [contratos, setContratos] = useState([])
  const [tiposEquipe, setTiposEquipe] = useState([])
  const [campos, setCampos] = useState([])
  const [contratoId, setContratoId] = useState('')
  const [tipoEquipeId, setTipoEquipeId] = useState('')
  const [registroFields, setRegistroFields] = useState([])
  const [atividadeFields, setAtividadeFields] = useState([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao, ativo').order('descricao').then(({ data }) => setContratos(data || []))
    supabase.from('d_tipo_equipe').select('id, descricao').order('descricao').then(({ data }) => setTiposEquipe(data || []))
    supabase.from('config_campos').select('*').order('label').then(({ data }) => setCampos(data || []))
  }, [])

  useEffect(() => {
    if (!contratoId || !tipoEquipeId) { setRegistroFields([]); setAtividadeFields([]); return }
    carregarConfig()
  }, [contratoId, tipoEquipeId])

  async function carregarConfig() {
    setCarregando(true)
    const { data } = await supabase
      .from('config_campos_contrato')
      .select('*, config_campos(id, label, nome, tipo)')
      .eq('contrato_id', contratoId)
      .eq('tipo_equipe_id', tipoEquipeId)
      .order('ordem')
    const rows = data || []
    setRegistroFields(rows.filter(r => r.secao === 'registro'))
    setAtividadeFields(rows.filter(r => r.secao === 'atividade'))
    setCarregando(false)
  }

  const contratoSelecionado = useMemo(() => contratos.find(c => String(c.id) === String(contratoId)), [contratos, contratoId])
  const contratoDesativado = contratoSelecionado && contratoSelecionado.ativo === false

  const camposNoRegistro = useMemo(() => new Set(registroFields.map(r => r.campo_id)), [registroFields])
  const camposNaAtividade = useMemo(() => new Set(atividadeFields.map(r => r.campo_id)), [atividadeFields])
  const ativo = !!(contratoId && tipoEquipeId)

  async function adicionarCampo(campoId, secao) {
    const lista = secao === 'registro' ? registroFields : atividadeFields
    const ordem = lista.length > 0 ? Math.max(...lista.map(r => r.ordem)) + 10 : 10
    const { data, error } = await supabase.from('config_campos_contrato').insert({
      campo_id: campoId,
      contrato_id: Number(contratoId),
      tipo_equipe_id: Number(tipoEquipeId),
      secao,
      obrigatorio: false,
      ordem,
    }).select('*, config_campos(id, label, nome, tipo)').single()
    if (error) { alert(error.message); return }
    if (secao === 'registro') setRegistroFields(prev => [...prev, data])
    else setAtividadeFields(prev => [...prev, data])
  }

  async function removerCampo(id, secao) {
    const { error } = await supabase.from('config_campos_contrato').delete().eq('id', id)
    if (error) { alert(error.message); return }
    if (secao === 'registro') setRegistroFields(prev => prev.filter(r => r.id !== id))
    else setAtividadeFields(prev => prev.filter(r => r.id !== id))
  }

  async function toggleObrigatorio(id, current, secao) {
    const { error } = await supabase.from('config_campos_contrato').update({ obrigatorio: !current }).eq('id', id)
    if (error) { alert(error.message); return }
    const upd = prev => prev.map(r => r.id === id ? { ...r, obrigatorio: !current } : r)
    if (secao === 'registro') setRegistroFields(upd)
    else setAtividadeFields(upd)
  }

  async function mover(id, direcao, secao) {
    const lista = secao === 'registro' ? registroFields : atividadeFields
    const idx = lista.findIndex(r => r.id === id)
    const swapIdx = direcao === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= lista.length) return
    const nova = [...lista]
    const ordemA = nova[idx].ordem
    const ordemB = nova[swapIdx].ordem
    ;[nova[idx], nova[swapIdx]] = [nova[swapIdx], nova[idx]]
    nova[idx] = { ...nova[idx], ordem: ordemA }
    nova[swapIdx] = { ...nova[swapIdx], ordem: ordemB }
    await Promise.all([
      supabase.from('config_campos_contrato').update({ ordem: ordemA }).eq('id', nova[idx].id),
      supabase.from('config_campos_contrato').update({ ordem: ordemB }).eq('id', nova[swapIdx].id),
    ])
    if (secao === 'registro') setRegistroFields(nova)
    else setAtividadeFields(nova)
  }

  function SecaoForm({ titulo, descricao, cor, fields, secao, fixos }) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e2a3b' }}>{titulo}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{descricao}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fixos?.map(f => <CampoFixo key={f.label} label={f.label} tipo={f.tipo} />)}

          {fields.map((f, idx) => (
            <CampoCard key={f.id} f={f} idx={idx} total={fields.length} secao={secao}
              onToggle={(id, val) => toggleObrigatorio(id, val, secao)}
              onMover={(id, dir) => mover(id, dir, secao)}
              onRemover={(id) => removerCampo(id, secao)} />
          ))}

          {!ativo && fields.length === 0 && !fixos?.length && (
            <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>
              Selecione contrato e tipo de equipe para configurar
            </div>
          )}
        </div>

        <BotaoAdicionarCampo
          campos={campos}
          jaAdicionados={secao === 'registro' ? camposNoRegistro : camposNaAtividade}
          onAdicionar={id => adicionarCampo(id, secao)}
          ativo={ativo}
        />
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Editor de Formulário</h1>
        {carregando && <span style={{ fontSize: 13, color: '#9ca3af' }}>Carregando...</span>}
      </div>

      {/* Seletores */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 220 }}>
            <label className="campo-label">Contrato</label>
            <select className="campo-select" value={contratoId}
              onChange={e => { setContratoId(e.target.value); setTipoEquipeId('') }}>
              <option value="">Selecione...</option>
              {contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0, minWidth: 200 }}>
            <label className="campo-label">Tipo de Equipe</label>
            <select className="campo-select" value={tipoEquipeId}
              onChange={e => setTipoEquipeId(e.target.value)} disabled={!contratoId}>
              <option value="">Selecione...</option>
              {tiposEquipe.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Biblioteca</label>
            <button className="btn btn-secundario" onClick={() => navegar('/configuracoes/config-campos')} style={{ fontSize: 13 }}>
              🔧 Gerenciar campos
            </button>
          </div>
        </div>
      </div>

      {/* Aviso contrato desativado */}
      {contratoDesativado && (
        <div className="alerta alerta-erro" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <strong>Contrato desativado</strong> — este formulário não será exibido para lançamento de produção enquanto o contrato estiver inativo.
          </div>
        </div>
      )}

      {/* Seção Registro */}
      <SecaoForm
        titulo="Seção: Registro"
        descricao="Campos gerais do lançamento — preenchidos uma vez por dia"
        cor="#1a56db"
        fields={registroFields}
        secao="registro"
        fixos={CAMPOS_FIXOS_REGISTRO}
      />

      {/* Seção Atividade */}
      <SecaoForm
        titulo="Seção: Atividade"
        descricao="Campos repetidos por linha de serviço — preenchidos em cada atividade"
        cor="#7c3aed"
        fields={atividadeFields}
        secao="atividade"
        fixos={CAMPOS_FIXOS_ATIVIDADE}
      />

      {/* Seção Colaboradores — preview fixo */}
      <div className="card" style={{ opacity: 0.65 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e2a3b' }}>Seção: Colaboradores</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Gerado automaticamente pela equipe — não configurável</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[['👤', 'Colaborador', 'lista'], ['✅', 'Presente', 'checkbox'], ['🏷️', 'Função / Equipe', 'texto']].map(([ico, label, tipo]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: 8, padding: '8px 12px' }}>
              <span style={{ fontSize: 15 }}>{ico}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>{label}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{tipo}</div>
              </div>
              <span style={{ fontSize: 10, color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 10 }}>automático</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
