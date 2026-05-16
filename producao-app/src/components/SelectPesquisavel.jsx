import { useState, useRef, useEffect } from 'react'

/**
 * Select com campo de pesquisa integrado.
 * Props:
 *   opcoes    — array de { valor, label, sublabel? }
 *   valor     — valor selecionado atualmente
 *   onChange  — fn(valor) chamada ao selecionar
 *   placeholder, disabled, erro
 */
export default function SelectPesquisavel({ opcoes = [], valor, onChange, placeholder = 'Pesquise...', disabled = false, erro }) {
  const [aberto, setAberto] = useState(false)
  const [pesquisa, setPesquisa] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const opcaoAtual = opcoes.find(o => String(o.valor) === String(valor))

  useEffect(() => {
    function fechar(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setAberto(false)
        setPesquisa('')
      }
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  const opcoesFiltradas = pesquisa.trim()
    ? opcoes.filter(o => o.label.toLowerCase().includes(pesquisa.toLowerCase()))
    : opcoes

  function selecionar(op) {
    onChange(String(op.valor))
    setAberto(false)
    setPesquisa('')
  }

  function handleFocus() {
    if (!disabled) { setAberto(true); setPesquisa('') }
  }

  function handleChange(e) {
    setPesquisa(e.target.value)
    setAberto(true)
  }

  const textoExibido = aberto ? pesquisa : (opcaoAtual?.label || '')

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          className={`campo-input${erro ? ' erro' : ''}`}
          style={{ paddingRight: valor ? 28 : 12 }}
          value={textoExibido}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder={disabled ? '' : placeholder}
          disabled={disabled}
          autoComplete="off"
        />
        {valor && !disabled && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(''); setPesquisa(''); setAberto(false) }}
            style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, lineHeight: 1, padding: 2 }}
            title="Limpar"
          >×</button>
        )}
      </div>

      {aberto && !disabled && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
          background: 'white', border: '1px solid var(--cor-borda)', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 1000,
          maxHeight: 260, overflowY: 'auto',
        }}>
          {opcoesFiltradas.length === 0 ? (
            <div style={{ padding: '10px 12px', color: '#6b7280', fontSize: 13 }}>
              {pesquisa ? `Nenhum resultado para "${pesquisa}"` : 'Sem opções'}
            </div>
          ) : (
            opcoesFiltradas.map(op => {
              const ativo = String(op.valor) === String(valor)
              return (
                <div
                  key={op.valor}
                  onMouseDown={e => { e.preventDefault(); selecionar(op) }}
                  style={{
                    padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                    background: ativo ? '#eff6ff' : 'white',
                    color: ativo ? '#1d4ed8' : '#111827',
                    borderBottom: '1px solid #f9fafb',
                  }}
                  onMouseEnter={e => { if (!ativo) e.currentTarget.style.background = '#f3f4f6' }}
                  onMouseLeave={e => { e.currentTarget.style.background = ativo ? '#eff6ff' : 'white' }}
                >
                  {op.label}
                  {op.sublabel && (
                    <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>— {op.sublabel}</span>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
      {erro && <div className="campo-erro-msg">{erro}</div>}
    </div>
  )
}
