import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY
const MODELO = 'llama-3.3-70b-versatile'

const SUGESTOES = [
  'Qual foi o valor total produzido esse mês?',
  'Quais equipes produziram mais nos últimos 30 dias?',
  'Quais atividades geraram mais valor?',
  'Quantos registros foram lançados essa semana?',
]

async function buscarContexto() {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), 0, 1).toISOString().split('T')[0] // 1 jan do ano atual
  const fim    = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).toISOString().split('T')[0]

  // Produção
  const { data, error } = await supabase
    .from('view_powerbi_producao')
    .select('data_producao, contrato_id, desc_equipe, desc_atividade, unidade, quantidade, valor_producao, justificativa')
    .gte('data_producao', inicio)
    .lt('data_producao', fim)
    .limit(8000)

  if (error) return `Erro ao buscar dados: ${error.message}`
  const registros = (data || []).filter(r => !r.justificativa)
  if (!registros.length) return `Nenhum dado de produção encontrado entre ${inicio} e ${fim}.`

  // Colaboradores — busca registros do período e depois a presença
  const { data: regIds } = await supabase
    .from('f_prod_registro')
    .select('id')
    .gte('data_producao', inicio)
    .lt('data_producao', fim)
    .limit(2000)

  let contextoColabs = ''
  if (regIds?.length) {
    const ids = regIds.map(r => r.id)
    const { data: presenca } = await supabase
      .from('f_prod_colaboradores')
      .select('colaborador_id, registro_id, d_colaboradores(matricula_nome)')
      .in('registro_id', ids)
      .limit(5000)

    if (presenca?.length) {
      const diasPorColab = {}
      presenca.forEach(p => {
        const nome = p.d_colaboradores?.matricula_nome || `ID ${p.colaborador_id}`
        diasPorColab[nome] = (diasPorColab[nome] || new Set()).add(p.registro_id)
      })
      const rankingColabs = Object.entries(diasPorColab)
        .map(([nome, set]) => ({ nome, dias: set.size }))
        .sort((a, b) => b.dias - a.dias)
        .slice(0, 15)
        .map(c => `  - ${c.nome}: ${c.dias} registro${c.dias !== 1 ? 's' : ''}`)
        .join('\n')

      contextoColabs = `\nTotal de colaboradores com presença: ${Object.keys(diasPorColab).length}

Top 15 colaboradores por número de registros:
${rankingColabs}`
    }
  }

  // Agrega produção
  const porEquipe = {}
  const porAtividade = {}
  const porMes = {}
  const porDia = {}
  let totalGeral = 0

  registros.forEach(r => {
    const eq  = r.desc_equipe    || 'Sem equipe'
    const at  = r.desc_atividade || 'Sem atividade'
    const dia = r.data_producao  || ''
    const mes = dia.slice(0, 7)
    const val = Number(r.valor_producao) || 0

    porEquipe[eq]    = (porEquipe[eq]    || 0) + val
    porAtividade[at] = (porAtividade[at] || 0) + val
    porMes[mes]      = (porMes[mes]      || 0) + val
    porDia[dia]      = (porDia[dia]      || 0) + val
    totalGeral += val
  })

  const topEquipes = Object.entries(porEquipe)
    .sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([eq, v]) => `  - ${eq}: R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    .join('\n')

  const topAtividades = Object.entries(porAtividade)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([at, v]) => `  - ${at}: R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    .join('\n')

  const porMesStr = Object.entries(porMes)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, v]) => `  - ${m}: R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    .join('\n')

  const ultimosDias = Object.entries(porDia)
    .sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10)
    .map(([d, v]) => `  - ${d.split('-').reverse().join('/')}: R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    .join('\n')

  const nEquipes   = Object.keys(porEquipe).length
  const nRegistros = new Set(registros.map(r => r.data_producao + r.desc_equipe)).size
  const mesAtual   = hoje.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

  return `DADOS DE PRODUÇÃO — ${inicio} a ${fim} (ano atual):

Resumo geral:
  Total produzido: R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
  Equipes ativas: ${nEquipes}
  Registros: ${nRegistros}

Produção por mês:
${porMesStr}

Top 15 equipes por valor:
${topEquipes}

Top 10 atividades por valor:
${topAtividades}

Últimos 10 dias com produção:
${ultimosDias}
${contextoColabs}`
}

function systemPrompt(contexto) {
  return `Você é um assistente de análise de produção da Rede Forte, empresa que executa obras de construção e manutenção de redes elétricas.

Responda sempre em português, de forma objetiva e clara. Use formatação simples — listas e negrito quando ajudar na leitura.

Quando mostrar valores monetários, formate como R$ X.XXX,XX (padrão brasileiro).

Se a pergunta não puder ser respondida com os dados disponíveis, diga isso claramente.

${contexto}`
}

export default function Chat() {
  const [mensagens, setMensagens]   = useState([])
  const [input, setInput]           = useState('')
  const [enviando, setEnviando]     = useState(false)
  const [contexto, setContexto]     = useState('')
  const [carregandoCtx, setCarregandoCtx] = useState(true)
  const fimRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    buscarContexto().then(ctx => {
      setContexto(ctx)
      setCarregandoCtx(false)
    })
  }, [])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, enviando])

  async function enviar(texto) {
    const pergunta = (texto || input).trim()
    if (!pergunta || enviando) return

    setInput('')
    const novasMensagens = [...mensagens, { role: 'user', content: pergunta }]
    setMensagens(novasMensagens)
    setEnviando(true)

    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELO,
          temperature: 0.3,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: systemPrompt(contexto) },
            ...novasMensagens,
          ],
        }),
      })

      const json = await resp.json()
      const resposta = json.choices?.[0]?.message?.content || 'Não consegui gerar uma resposta.'
      setMensagens(prev => [...prev, { role: 'assistant', content: resposta }])
    } catch {
      setMensagens(prev => [...prev, { role: 'assistant', content: 'Erro ao conectar com a IA. Tente novamente.' }])
    } finally {
      setEnviando(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
  }

  return (
    <div className="pagina" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 32px)' }}>
      <div className="pagina-header" style={{ flexShrink: 0 }}>
        <h1 className="pagina-titulo">Assistente de Produção</h1>
        {carregandoCtx && <span style={{ fontSize: 12, color: '#6b7280' }}>Carregando dados...</span>}
      </div>

      {/* Área de mensagens */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
        padding: '4px 0 16px',
      }}>
        {mensagens.length === 0 && !carregandoCtx && (
          <div style={{ margin: 'auto', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e2a3b', marginBottom: 8 }}>
              Assistente de Produção
            </div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>
              Pergunte sobre produção, equipes, atividades e valores.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {SUGESTOES.map(s => (
                <button key={s} onClick={() => enviar(s)}
                  style={{
                    background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 20,
                    padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: '#374151',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '75%',
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: m.role === 'user' ? '#1a56db' : 'white',
              color: m.role === 'user' ? 'white' : '#1e2a3b',
              fontSize: 14,
              lineHeight: 1.6,
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              whiteSpace: 'pre-wrap',
              border: m.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {enviando && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '10px 16px', borderRadius: '16px 16px 16px 4px',
              background: 'white', border: '1px solid #e5e7eb',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              display: 'flex', gap: 4, alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: '50%', background: '#94a3b8',
                  animation: 'bounce 1.2s infinite',
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={fimRef} />
      </div>

      {/* Input */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 8, alignItems: 'flex-end',
        padding: '12px 0 0', borderTop: '1px solid #e5e7eb',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte sobre a produção... (Enter para enviar)"
          disabled={carregandoCtx || enviando}
          rows={1}
          style={{
            flex: 1, resize: 'none', border: '1px solid #d1d5db', borderRadius: 10,
            padding: '10px 14px', fontSize: 14, fontFamily: 'inherit', outline: 'none',
            lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
            background: carregandoCtx ? '#f9fafb' : 'white',
          }}
          onInput={e => {
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
        />
        <button
          onClick={() => enviar()}
          disabled={!input.trim() || enviando || carregandoCtx}
          style={{
            background: '#1a56db', color: 'white', border: 'none', borderRadius: 10,
            padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            opacity: (!input.trim() || enviando || carregandoCtx) ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          Enviar
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}
