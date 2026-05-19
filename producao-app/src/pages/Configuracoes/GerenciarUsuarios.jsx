import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { Modal } from '../../components/TabelaCRUD'

export default function GerenciarUsuarios() {
  const navegar = useNavigate()
  const [usuarios, setUsuarios]               = useState([])
  const [selecionado, setSelecionado]         = useState(null)
  const [form, setForm]                       = useState({ nome: '', role_id: '' })
  const [roles, setRoles]                     = useState([])
  const [todosContratos, setTodosContratos]   = useState([])
  const [contratosUsuario, setContratosUsuario] = useState([])
  const [carregando, setCarregando]           = useState(true)
  const [salvando, setSalvando]               = useState(false)
  const [erro, setErro]                       = useState('')
  const [sucesso, setSucesso]                 = useState('')
  const [modalNovo, setModalNovo]             = useState(false)
  const [modalSenha, setModalSenha]           = useState(false)
  const [formNovo, setFormNovo]               = useState({ email: '', senha: '', confirmar: '', nome: '', role_id: '' })
  const [formSenha, setFormSenha]             = useState({ senha: '', confirmar: '' })
  const fileInputRef                          = useRef(null)

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    const [{ data: uData }, { data: rData }, { data: cData }] = await Promise.all([
      supabase.from('d_auth_user').select('*, d_auth_roles(name)').order('nome'),
      supabase.from('d_auth_roles').select('*').order('name'),
      supabase.from('d_contratos').select('id, descricao').order('descricao'),
    ])
    setUsuarios(uData || [])
    setRoles(rData || [])
    setTodosContratos(cData || [])
    setCarregando(false)
  }

  async function selecionarUsuario(u) {
    setSelecionado(u)
    setForm({ nome: u.nome || '', role_id: u.role_id || '' })
    setErro('')
    setSucesso('')
    const { data } = await supabase.from('d_auth_contratos').select('contrato_id').eq('user_uuid', u.uuid)
    setContratosUsuario((data || []).map(c => c.contrato_id))
  }

  async function salvarPerfil() {
    setSalvando(true)
    setErro('')
    setSucesso('')
    const { error } = await supabase.from('d_auth_user')
      .update({ nome: form.nome, role_id: form.role_id || null })
      .eq('uuid', selecionado.uuid)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setSucesso('Perfil salvo.')
    await carregarDados()
    setSelecionado(prev => ({ ...prev, nome: form.nome, role_id: form.role_id }))
  }

  async function toggleContrato(contratoId) {
    const temAcesso = contratosUsuario.includes(contratoId)
    if (temAcesso) {
      const { error } = await supabase.from('d_auth_contratos')
        .delete().eq('user_uuid', selecionado.uuid).eq('contrato_id', contratoId)
      if (!error) setContratosUsuario(prev => prev.filter(c => c !== contratoId))
    } else {
      const { error } = await supabase.from('d_auth_contratos')
        .insert({ user_uuid: selecionado.uuid, contrato_id: contratoId, read: true })
      if (!error) setContratosUsuario(prev => [...prev, contratoId])
    }
  }

  async function criarUsuario() {
    setErro('')
    if (!formNovo.email || !formNovo.senha || !formNovo.nome) {
      setErro('Preencha e-mail, nome e senha.'); return
    }
    if (!formNovo.role_id) {
      setErro('Selecione um perfil de acesso.'); return
    }
    if (formNovo.senha !== formNovo.confirmar) {
      setErro('As senhas não coincidem.'); return
    }
    if (formNovo.senha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.'); return
    }
    setSalvando(true)
    const { error: errRpc } = await supabase.rpc('criar_usuario_auth', {
      p_email: formNovo.email,
      p_password: formNovo.senha,
      p_nome: formNovo.nome,
      p_role_id: formNovo.role_id,
    })
    setSalvando(false)
    if (errRpc) { setErro(errRpc.message); return }
    setModalNovo(false)
    setFormNovo({ email: '', senha: '', confirmar: '', nome: '', role_id: '' })
    await carregarDados()
  }

  async function alterarSenha() {
    setErro('')
    if (!formSenha.senha) { setErro('Digite a nova senha.'); return }
    if (formSenha.senha !== formSenha.confirmar) { setErro('As senhas não coincidem.'); return }
    if (formSenha.senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
    setSalvando(true)
    const { error } = await supabase.rpc('alterar_senha_usuario', {
      p_uuid: selecionado.uuid,
      p_senha: formSenha.senha,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setModalSenha(false)
    setFormSenha({ senha: '', confirmar: '' })
    setSucesso('Senha alterada com sucesso.')
  }

  async function handleFotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    if (file.size > 3 * 1024 * 1024) { setErro('A imagem deve ter no máximo 3 MB.'); return }
    setSalvando(true)
    setErro('')
    setSucesso('')
    const ext = file.name.split('.').pop()
    const path = `${selecionado.uuid}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('user_photos').upload(path, file, { upsert: true })
    if (uploadErr) { setErro(uploadErr.message); setSalvando(false); return }
    const { data: urlData } = supabase.storage.from('user_photos').getPublicUrl(path)
    const foto_url = urlData.publicUrl
    const { error: updateErr } = await supabase.from('d_auth_user').update({ foto_url }).eq('uuid', selecionado.uuid)
    setSalvando(false)
    if (updateErr) { setErro(updateErr.message); return }
    setSelecionado(prev => ({ ...prev, foto_url }))
    setUsuarios(prev => prev.map(u => u.uuid === selecionado.uuid ? { ...u, foto_url } : u))
    setSucesso('Foto atualizada.')
  }

  const [busca, setBusca] = useState('')
  const usuariosFiltrados = usuarios.filter(u =>
    !busca.trim() ||
    u.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    u.email?.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="pagina">
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar('/configuracoes')}
            style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Usuários</h1>
        </div>
        <button className="btn btn-primario" onClick={() => { setErro(''); setModalNovo(true) }}>+ Novo Usuário</button>
      </div>

      {carregando ? (
        <div className="loading"><div className="spinner" /> Carregando...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>

          {/* Lista de usuários */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: 16 }}>
            <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #f3f4f6' }}>
              <input
                className="campo-input"
                style={{ margin: 0 }}
                placeholder="Pesquisar usuário..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
              {usuariosFiltrados.length === 0 ? (
                <div className="vazio" style={{ padding: 24 }}>Nenhum usuário encontrado.</div>
              ) : usuariosFiltrados.map(u => (
              <div
                key={u.uuid}
                onClick={() => selecionarUsuario(u)}
                style={{
                  padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                  background: selecionado?.uuid === u.uuid ? '#eff6ff' : 'white',
                  borderLeft: selecionado?.uuid === u.uuid ? '3px solid #2563eb' : '3px solid transparent',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1e2a3b' }}>{u.nome || '(sem nome)'}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{u.email}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{u.d_auth_roles?.name || 'Sem perfil'}</div>
              </div>
            ))}
            </div>{/* fim scroll */}
          </div>{/* fim card */}

          {/* Painel de detalhes */}
          {selecionado ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Perfil */}
              <div className="card">
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16, color: '#1e2a3b' }}>Perfil</div>

                {/* Avatar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                  <div
                    onClick={() => fileInputRef.current.click()}
                    title="Clique para alterar a foto"
                    style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
                  >
                    {selecionado.foto_url ? (
                      <img src={selecionado.foto_url} alt="avatar"
                        style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }} />
                    ) : (
                      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1a56db', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700 }}>
                        {(selecionado.nome || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ position: 'absolute', bottom: 0, right: 0, background: '#2563eb', borderRadius: '50%',
                      width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                      border: '2px solid white' }}>
                      📷
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1e2a3b' }}>{selecionado.nome || '(sem nome)'}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{selecionado.email}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Clique na foto para alterar</div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoChange} />
                </div>

                <div className="campos-grid">
                  <div className="campo-grupo">
                    <label className="campo-label">Nome <span className="obrigatorio">*</span></label>
                    <input className="campo-input" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} />
                  </div>
                  <div className="campo-grupo">
                    <label className="campo-label">E-mail</label>
                    <input className="campo-input" value={selecionado.email} disabled style={{ background: '#f9fafb', color: '#9ca3af' }} />
                  </div>
                  <div className="campo-grupo">
                    <label className="campo-label">Perfil de Acesso</label>
                    <select className="campo-select" value={form.role_id} onChange={e => setForm(p => ({ ...p, role_id: e.target.value }))}>
                      <option value="">Sem perfil</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>

                {erro && <div className="erro-mensagem" style={{ marginTop: 12 }}>{erro}</div>}
                {sucesso && <div style={{ marginTop: 12, color: '#16a34a', fontSize: 13 }}>{sucesso}</div>}

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-primario" onClick={salvarPerfil} disabled={salvando}>
                    {salvando ? 'Salvando...' : 'Salvar Perfil'}
                  </button>
                  <button className="btn btn-secundario" onClick={() => { setErro(''); setFormSenha({ senha: '', confirmar: '' }); setModalSenha(true) }}>
                    🔑 Alterar Senha
                  </button>
                </div>
              </div>

              {/* Contratos */}
              <div className="card">
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, color: '#1e2a3b' }}>Contratos com Acesso</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                  Marque os contratos que este usuário pode visualizar.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {todosContratos.map(c => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                      <input
                        type="checkbox"
                        checked={contratosUsuario.includes(c.id)}
                        onChange={() => toggleContrato(c.id)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                      {c.descricao}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: '#9ca3af' }}>
              Selecione um usuário para editar
            </div>
          )}
        </div>
      )}

      {/* Modal: Novo Usuário */}
      {modalNovo && (
        <Modal titulo="Novo Usuário" onFechar={() => { setModalNovo(false); setErro('') }}>
          <div className="campos-grid">
            <div className="campo-grupo">
              <label className="campo-label">Nome <span className="obrigatorio">*</span></label>
              <input className="campo-input" value={formNovo.nome} onChange={e => setFormNovo(p => ({ ...p, nome: e.target.value }))} />
            </div>
            <div className="campo-grupo">
              <label className="campo-label">E-mail <span className="obrigatorio">*</span></label>
              <input className="campo-input" type="email" value={formNovo.email} onChange={e => setFormNovo(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="campo-grupo">
              <label className="campo-label">Perfil de Acesso <span className="obrigatorio">*</span></label>
              <select className="campo-select" value={formNovo.role_id} onChange={e => setFormNovo(p => ({ ...p, role_id: e.target.value }))}>
                <option value="">Sem perfil</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="campo-grupo">
              <label className="campo-label">Senha <span className="obrigatorio">*</span></label>
              <input className="campo-input" type="password" value={formNovo.senha} onChange={e => setFormNovo(p => ({ ...p, senha: e.target.value }))} />
            </div>
            <div className="campo-grupo">
              <label className="campo-label">Confirmar Senha <span className="obrigatorio">*</span></label>
              <input className="campo-input" type="password" value={formNovo.confirmar} onChange={e => setFormNovo(p => ({ ...p, confirmar: e.target.value }))} />
            </div>
          </div>
          {erro && <div className="erro-mensagem" style={{ marginTop: 8 }}>{erro}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-secundario" onClick={() => { setModalNovo(false); setErro('') }}>Cancelar</button>
            <button className="btn btn-primario" onClick={criarUsuario} disabled={salvando}>
              {salvando ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Alterar Senha */}
      {modalSenha && (
        <Modal titulo={`Alterar Senha — ${selecionado?.nome}`} onFechar={() => { setModalSenha(false); setErro('') }}>
          <div className="campos-grid">
            <div className="campo-grupo">
              <label className="campo-label">Nova Senha <span className="obrigatorio">*</span></label>
              <input className="campo-input" type="password" value={formSenha.senha} onChange={e => setFormSenha(p => ({ ...p, senha: e.target.value }))} />
            </div>
            <div className="campo-grupo">
              <label className="campo-label">Confirmar Senha <span className="obrigatorio">*</span></label>
              <input className="campo-input" type="password" value={formSenha.confirmar} onChange={e => setFormSenha(p => ({ ...p, confirmar: e.target.value }))} />
            </div>
          </div>
          {erro && <div className="erro-mensagem" style={{ marginTop: 8 }}>{erro}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-secundario" onClick={() => { setModalSenha(false); setErro('') }}>Cancelar</button>
            <button className="btn btn-primario" onClick={alterarSenha} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Senha'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
