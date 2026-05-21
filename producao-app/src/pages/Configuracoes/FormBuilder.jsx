import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

function PainelInfo({ aberto, onFechar }) {
  if (!aberto) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onFechar}>
      <div style={{ background: 'white', borderRadius: 12, padding: 28, width: 520, maxWidth: '94vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e2a3b' }}>Como funciona o Editor de Formulário</div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 16px' }}>
            <strong style={{ color: '#0369a1' }}>Como funciona:</strong> cada formulário de lançamento é definido pela combinação de <strong>Contrato + Tipo de Equipe</strong>. Isso significa que equipes diferentes, mesmo dentro do mesmo contrato, podem ter campos diferentes — e contratos diferentes também têm suas próprias configurações independentes.
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e2a3b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>📄</span> Contrato
            </div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, background: '#f9fafb', borderRadius: 8, padding: '10px 14px' }}>
              Para um contrato aparecer no formulário de lançamento de produção, ele precisa estar marcado como <strong>ativo</strong>.<br />
              Contratos inativos ainda aparecem aqui no editor para configuração, mas não ficam disponíveis para lançamento.
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e2a3b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>👷</span> Tipo de Equipe
            </div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, background: '#f9fafb', borderRadius: 8, padding: '10px 14px' }}>
              O tipo de equipe só aparece no formulário de lançamento se houver <strong>pelo menos uma equipe ativa</strong> cadastrada neste contrato com esse tipo.<br />
              Se o tipo não aparecer no lançamento, verifique em <strong>Configurações → Equipes</strong> se existe uma equipe ativa vinculada ao contrato e ao tipo desejado.
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e2a3b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>🗃️</span> Tipos de armazenamento dos campos
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ fontWeight: 700, color: '#c2410c' }}>Coluna real</span> — o valor é salvo diretamente em uma coluna da tabela do banco de dados. Isso acontece com campos que referenciam outros cadastros, como Obra, Encarregado e Regional. Esses campos permitem filtros e relatórios mais eficientes. <em>Aparecem apenas na seção Registro.</em>
              </div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ fontWeight: 700, color: '#7c3aed' }}>Metadado</span> — o valor é salvo dentro de um campo JSON da tabela. É o tipo usado para campos livres (texto, número, data, etc.) que não precisam de referência a outro cadastro. Flexível e não exige alteração no banco para adicionar novos campos.
              </div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ fontWeight: 700, color: '#0369a1' }}>Fixo</span> — campos sempre presentes, independente de configuração (Data, Contrato, Tipo de Equipe, Atividade, Quantidade). Não podem ser removidos.
              </div>
            </div>
          </div>

        </div>

        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primario" onClick={onFechar}>Entendi</button>
        </div>
      </div>
    </div>
  )
}

const TIPO_ICONE = {
  texto: '📝', numero: '🔢', decimal: '🔣', alfanumerico: '🔤',
  dropdown: '📋', data: '📅', hora: '🕐', checkbox: '☑️', textarea: '📄',
}

function ehColunaReal(campo, secao) {
  return secao === 'registro' && !!campo?.is_coluna_real
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
  const isColuna = ehColunaReal(f.config_campos, secao)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: `1px solid ${isColuna ? '#fed7aa' : '#e5e7eb'}`, borderRadius: 8, padding: '8px 12px' }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{TIPO_ICONE[f.config_campos?.tipo] || '📝'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {f.config_campos?.label}
          </span>
          {isColuna
            ? <span style={{ fontSize: 10, fontWeight: 600, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>coluna real</span>
            : <span style={{ fontSize: 10, fontWeight: 600, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>metadado</span>
          }
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
  const [toast, setToast] = useState(null)
  const [painelInfo, setPainelInfo] = useState(false)
  const [semEquipesNoTipo, setSemEquipesNoTipo] = useState(false)
  const toastTimer = useRef(null)

  function mostrarToast(msg) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao, ativo').order('descricao').then(({ data }) => setContratos(data || []))
    supabase.from('d_tipo_equipe').select('id, descricao').order('descricao').then(({ data }) => setTiposEquipe(data || []))
    supabase.from('config_campos').select('id, label, nome, tipo, is_coluna_real, secao_permitida').order('label').then(({ data }) => setCampos(data || []))
  }, [])

  useEffect(() => {
    setSemEquipesNoTipo(false)
    if (!contratoId || !tipoEquipeId) { setRegistroFields([]); setAtividadeFields([]); return }
    carregarConfig()
    supabase
      .from('d_equipes').select('id', { count: 'exact', head: true })
      .eq('contrato_id', contratoId).eq('tipo_equipe_id', tipoEquipeId).eq('is_ativo', true)
      .then(({ count }) => setSemEquipesNoTipo((count ?? 0) === 0))
  }, [contratoId, tipoEquipeId])

  async function carregarConfig() {
    setCarregando(true)
    const { data } = await supabase
      .from('config_campos_contrato')
      .select('*, config_campos(id, label, nome, tipo, is_coluna_real, secao_permitida)')
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
    mostrarToast('Campo adicionado')
  }

  async function removerCampo(id, secao) {
    const { error } = await supabase.from('config_campos_contrato').delete().eq('id', id)
    if (error) { alert(error.message); return }
    if (secao === 'registro') setRegistroFields(prev => prev.filter(r => r.id !== id))
    else setAtividadeFields(prev => prev.filter(r => r.id !== id))
    mostrarToast('Campo removido')
  }

  async function toggleObrigatorio(id, current, secao) {
    const { error } = await supabase.from('config_campos_contrato').update({ obrigatorio: !current }).eq('id', id)
    if (error) { alert(error.message); return }
    const upd = prev => prev.map(r => r.id === id ? { ...r, obrigatorio: !current } : r)
    if (secao === 'registro') setRegistroFields(upd)
    else setAtividadeFields(upd)
    mostrarToast(!current ? 'Campo marcado como obrigatório' : 'Campo marcado como opcional')
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
    mostrarToast('Ordem atualizada')
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
          campos={campos.filter(c => !c.secao_permitida || c.secao_permitida === 'ambas' || c.secao_permitida === secao)}
          jaAdicionados={secao === 'registro' ? camposNoRegistro : camposNaAtividade}
          onAdicionar={id => adicionarCampo(id, secao)}
          ativo={ativo}
        />
      </div>
    )
  }

  return (
    <div className="pagina">
      <PainelInfo aberto={painelInfo} onFechar={() => setPainelInfo(false)} />

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          background: '#166534', color: '#dcfce7', fontSize: 13, fontWeight: 500,
          padding: '10px 18px', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'fadeInUp 0.2s ease',
        }}>
          <span>✓</span> {toast}
        </div>
      )}

      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="pagina-titulo">Editor de Formulário</h1>
          <button
            onClick={() => setPainelInfo(true)}
            title="Como funciona"
            style={{ background: 'none', border: '1.5px solid #60a5fa', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 13, color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, lineHeight: 1 }}
          >ℹ</button>
        </div>
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

        {contratoDesativado && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 14, padding: '8px 12px', background: '#fefce8', border: '1px solid #fde047', borderRadius: 6, fontSize: 13, color: '#854d0e', lineHeight: 1.6 }}>
            <span style={{ flexShrink: 0 }}>⚠️</span>
            <span>O contrato selecionado está <strong>inativo</strong> e não aparecerá no formulário de lançamento de produção.</span>
          </div>
        )}
        {semEquipesNoTipo && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: contratoDesativado ? 6 : 14, padding: '8px 12px', background: '#fefce8', border: '1px solid #fde047', borderRadius: 6, fontSize: 13, color: '#854d0e', lineHeight: 1.6 }}>
            <span style={{ flexShrink: 0 }}>⚠️</span>
            <span>Nenhuma equipe ativa com este tipo está vinculada ao contrato. Este tipo de equipe <strong>não aparecerá</strong> no formulário de lançamento.</span>
          </div>
        )}
      </div>

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
