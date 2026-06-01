import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

const BUCKET = 'Metas'
const ARQUIVO = 'Metas_por_tipo_equipe_id.xlsm'

export default function Metas() {
  const navegar = useNavigate()
  const inputRef = useRef(null)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState(null) // { tipo: 'ok'|'erro', texto }

  function baixar() {
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(ARQUIVO)
    const a = document.createElement('a')
    a.href = publicUrl
    a.download = ARQUIVO
    a.click()
  }

  async function enviar(e) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setEnviando(true)
    setMensagem(null)
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ARQUIVO, arquivo, { upsert: true, contentType: arquivo.type })
    setEnviando(false)
    if (inputRef.current) inputRef.current.value = ''
    if (error) {
      setMensagem({ tipo: 'erro', texto: `Erro ao enviar: ${error.message}` })
    } else {
      setMensagem({ tipo: 'ok', texto: 'Arquivo atualizado com sucesso!' })
    }
  }

  return (
    <div className="pagina">
      <div className="pagina-header">
        <button className="btn btn-secundario" onClick={() => navegar('/configuracoes')} style={{ marginRight: 12 }}>← Voltar</button>
        <h1 className="pagina-titulo">Arquivo de Metas</h1>
      </div>

      <div className="card" style={{ maxWidth: 520 }}>
        <p style={{ marginBottom: 20, color: '#374151', fontSize: 14 }}>
          Arquivo atual: <strong>{ARQUIVO}</strong>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Baixar arquivo atual</div>
            <button className="btn btn-primario" onClick={baixar}>
              ⬇ Download
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb' }} />

          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Substituir arquivo</div>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
              Selecione o novo arquivo (.xlsm). Ele substituirá o arquivo atual imediatamente.
            </p>
            <label className="btn btn-secundario" style={{ cursor: 'pointer', display: 'inline-block' }}>
              {enviando ? 'Enviando...' : '⬆ Selecionar arquivo'}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsm,.xlsx,.xls"
                style={{ display: 'none' }}
                disabled={enviando}
                onChange={enviar}
              />
            </label>
          </div>
        </div>

        {mensagem && (
          <div style={{
            marginTop: 20,
            padding: '10px 14px',
            borderRadius: 6,
            background: mensagem.tipo === 'ok' ? '#dcfce7' : '#fee2e2',
            color: mensagem.tipo === 'ok' ? '#15803d' : '#b91c1c',
            fontSize: 14,
          }}>
            {mensagem.texto}
          </div>
        )}
      </div>
    </div>
  )
}
