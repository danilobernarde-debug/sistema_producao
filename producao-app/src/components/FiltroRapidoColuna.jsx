import { useState, useEffect, useRef } from 'react'
import SelectPesquisavel from './SelectPesquisavel'

// Janela do botão direito no título de uma coluna: "Filtro rápido para X" + "Classificar os dados em ordem".
// Padrão: sem filtro e "Manter a ordem atual". Ok aplica os dois; Cancelar/Esc/clique fora fecha sem mudar nada.
//   tipo: 'texto' | 'numero' | 'data' | 'lista' (select) | 'pesquisavel' (select com busca)
//   ops: [{ value, label }] — o seletor de operador só aparece em 'data' e 'numero' com mais de um operador
//   opcoes: [{ valor, label }] para 'lista' e 'pesquisavel'
//   rotulos: [crescente, decrescente] ou null quando a coluna não ordena
//   filtroAtual: { operador, valor } | undefined      ordemAtual: 'asc' | 'desc' | 'atual'
//   onOk(operador, valor, dir): valor '' = sem filtro nessa coluna; dir: 'asc' | 'desc' | 'atual'
export default function FiltroRapidoColuna({ titulo, tipo, ops, opcoes = [], placeholder, textoTodos = 'Todos', rotulos, filtroAtual, ordemAtual, onOk, onCancelar }) {
  const [operador, setOperador] = useState(filtroAtual?.operador || ops[0].value)
  const [valor, setValor] = useState(filtroAtual?.valor ?? '')
  const [dir, setDir] = useState(ordemAtual)
  const ok = () => onOk(operador, valor, dir)
  const okRef = useRef(ok); okRef.current = ok

  useEffect(() => {
    const tecla = e => { if (e.key === 'Escape') onCancelar(); else if (e.key === 'Enter') okRef.current() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [onCancelar])

  const campo = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, background: 'white', color: '#1e2a3b', height: 40, width: '100%', boxSizing: 'border-box' }
  const comOperador = (tipo === 'data' || tipo === 'numero') && ops.length > 1

  let entrada
  if (tipo === 'lista') entrada = (
    <select value={valor} onChange={e => setValor(e.target.value)} style={campo} autoFocus>
      <option value="">{textoTodos}</option>
      {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
    </select>)
  else if (tipo === 'pesquisavel') entrada = (
    <SelectPesquisavel opcoes={opcoes} valor={valor} onChange={setValor} placeholder={placeholder || 'Pesquisar...'} />)
  else entrada = (
    <input autoFocus type={tipo === 'data' ? 'date' : tipo === 'numero' ? 'number' : 'text'}
      value={valor} onChange={e => setValor(e.target.value)} placeholder={placeholder || (tipo === 'texto' ? 'Contém...' : 'Digite...')} style={campo} />)

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onCancelar() }} onContextMenu={e => e.preventDefault()}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.25)', padding: 20, width: 440, maxWidth: '100%', color: '#1e2a3b' }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Filtro rápido para {titulo}:</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {comOperador && (
              <select value={operador} onChange={e => setOperador(e.target.value)} style={campo}>
                {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
            {entrada}
            {rotulos && (
              <fieldset style={{ border: '1px solid #d1d5db', borderRadius: 6, margin: '8px 0 0', padding: '4px 12px 10px' }}>
                <legend style={{ fontSize: 12, color: '#6b7280', padding: '0 4px' }}>Classificar os dados em ordem:</legend>
                {[['asc', rotulos[0]], ['desc', rotulos[1]], ['atual', 'Manter a ordem atual']].map(([v, rotulo]) => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 14 }}>
                    <input type="radio" name="ordem-coluna" checked={dir === v} onChange={() => setDir(v)} />
                    {rotulo}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 110 }}>
            <button className="btn btn-primario" onClick={ok} style={{ height: 40 }}>Ok</button>
            <button className="btn btn-secundario" onClick={onCancelar} style={{ height: 40 }}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
