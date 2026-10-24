// Posição e trajeto dos veículos rastreados (Frotas -> mapa do Planejamento).
//
// O Frotas roda em outro Supabase (supabase.dbmachado.com). Os usuários do
// Planejamento não têm sessão lá, então o navegador nunca fala com o Frotas:
// ele chama esta função com o token da Produção; ela confere o login aqui e
// consulta o Frotas com um usuário dedicado, só de leitura (papel MOTORISTA,
// que não enxerga d_colaboradores nem RH). As credenciais ficam nas variáveis
// de ambiente da Vercel (FROTA_*).
//
//   GET /api/frota-veiculos                          -> última posição de cada veículo
//   GET /api/frota-veiculos?rastreador=ID&dia=AAAA-MM-DD -> trajeto do dia (America/Sao_Paulo)

const PRODUCAO_URL = process.env.SUPABASE_URL || 'https://giendnvcmkaqdminmeyz.supabase.co'
// chave anon é pública (também vai no bundle do app)
const PRODUCAO_ANON = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpZW5kbnZjbWthcWRtaW5tZXl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzEwNzU0MjAsImV4cCI6MjA0NjY1MTQyMH0.Ys5rggtFvbrI-YBPseR41JVRv5QI4TDHVNBChPN9GB8'

const { FROTA_SUPABASE_URL, FROTA_SUPABASE_ANON_KEY, FROTA_USER_EMAIL, FROTA_USER_PASSWORD } = process.env

// só os veículos dessas regionais do Frotas (frota_regionais.id; 1 = Goiás). Outras, por ex. 6 = Goianésia,
// podem ser liberadas com FROTA_REGIONAIS=1,6 na Vercel
const REGIONAIS = (process.env.FROTA_REGIONAIS || '1').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s))
const FILTRO_REGIONAL = `regional_id=in.(${REGIONAIS.join(',')})`

const TTL_POSICOES_MS = 10_000
let sessaoFrota = null // { token, expira }
let cachePosicoes = null // { em, dados }

async function loginFrota() {
  const r = await fetch(`${FROTA_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: FROTA_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FROTA_USER_EMAIL, password: FROTA_USER_PASSWORD }),
  })
  if (!r.ok) throw new Error(`login no Frotas falhou (${r.status})`)
  const j = await r.json()
  sessaoFrota = { token: j.access_token, expira: Date.now() + (j.expires_in - 120) * 1000 }
  return sessaoFrota.token
}

async function tokenFrota() {
  return sessaoFrota && sessaoFrota.expira > Date.now() ? sessaoFrota.token : loginFrota()
}

// chama o Frotas; se o token tiver sido recusado, entra de novo uma vez
async function frota(caminho, opcoes = {}, tentouDeNovo = false) {
  const token = await tokenFrota()
  const r = await fetch(`${FROTA_SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: { apikey: FROTA_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opcoes.headers },
  })
  if (r.status === 401 && !tentouDeNovo) {
    sessaoFrota = null
    return frota(caminho, opcoes, true)
  }
  if (!r.ok) throw new Error(`Frotas respondeu ${r.status}`)
  return r.json()
}

// só entra quem tem login válido na Produção e está ativo em d_auth_user
async function usuarioAutorizado(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  const u = await fetch(`${PRODUCAO_URL}/auth/v1/user`, { headers: { apikey: PRODUCAO_ANON, Authorization: `Bearer ${token}` } })
  if (!u.ok) return false
  const { id } = await u.json()
  const p = await fetch(`${PRODUCAO_URL}/rest/v1/d_auth_user?select=ativo&uuid=eq.${id}`, {
    headers: { apikey: PRODUCAO_ANON, Authorization: `Bearer ${token}` },
  })
  if (!p.ok) return false
  const linhas = await p.json()
  return linhas.length === 1 && linhas[0].ativo !== false
}

async function posicoes() {
  if (cachePosicoes && Date.now() - cachePosicoes.em < TTL_POSICOES_MS) return cachePosicoes.dados
  const [rastreadores, gps] = await Promise.all([
    frota(
      'frota_rastreadores?select=id,nome,icone_mapa,online,ultima_lat,ultima_lon,ultima_velocidade,ultimo_sinal_em,ultima_ignicao,'
      + `veiculo:frota_veiculos(placa,modelo,equipe,operacao,motorista_atual:frota_motoristas!frota_veiculos_motorista_atual_id_fkey(nome))&${FILTRO_REGIONAL}&order=nome`,
    ),
    frota('frota_vw_gps_atual?select=id,gps_lat,gps_lon,gps_velocidade,gps_posicao_em,gps_estado,gps_parado_desde'),
  ])
  const porId = new Map(gps.map(g => [g.id, g]))
  const dados = rastreadores
    .map(r => {
      const g = porId.get(r.id)
      // posição tratada (sem deriva do GPS parado) quando existir; senão a última bruta
      const lat = g?.gps_lat ?? r.ultima_lat
      const lon = g?.gps_lon ?? r.ultima_lon
      if (lat == null || lon == null) return null
      return {
        id: r.id,
        nome: r.nome,
        placa: r.veiculo?.placa ?? null,
        modelo: r.veiculo?.modelo ?? null,
        equipe: r.veiculo?.equipe ?? null,
        operacao: r.veiculo?.operacao ?? null,
        motorista: r.veiculo?.motorista_atual?.nome ?? null,
        icone: r.icone_mapa ?? null,
        lat,
        lon,
        velocidade: g?.gps_velocidade ?? r.ultima_velocidade ?? 0,
        estado: g?.gps_estado ?? null,
        parado_desde: g?.gps_parado_desde ?? null,
        ignicao: r.ultima_ignicao ?? null,
        posicao_em: g?.gps_posicao_em ?? null,
        sinal_em: r.ultimo_sinal_em,
      }
    })
    .filter(Boolean)
  cachePosicoes = { em: Date.now(), dados }
  return dados
}

// ---- Paradas: mesma regra do Frotas (frotas-web/src/lib/gps-trajeto.ts) ----------------------------
// O banco (frota_trajeto) já entrega as paradas pela regra de GPS de cada rastreador (raio de parada,
// lacuna, deriva). O Frotas ainda reconstrói paradas a partir dos pontos (a limpeza noturna deixa 1 ponto
// a cada 1 h 30) e funde paradas vizinhas; sem isso o tempo parado não bate com o do Frotas.
const PARADA_DOS_PONTOS = { raioM: 150, folgaMaxMs: 2 * 3600e3, duracaoMinMs: 2 * 60e3 }
const FUSAO_PARADAS = { raioM: 150, folgaMaxMs: 2 * 3600e3, velocidadeMax: 10, excursaoM: 200 }

function distanciaM(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

// pontos parados seguidos, no mesmo lugar, sem ponto de movimento no meio (pontos em ordem de horário)
function derivarParadasDosPontos(pontos, o = PARADA_DOS_PONTOS) {
  const saida = []
  let corrida = []
  const fechar = () => {
    if (corrida.length >= 2) {
      const inicio = Date.parse(corrida[0].tempo), fim = Date.parse(corrida[corrida.length - 1].tempo)
      if (fim - inicio >= o.duracaoMinMs) {
        saida.push({
          inicio: corrida[0].tempo,
          fim: corrida[corrida.length - 1].tempo,
          lat: corrida.reduce((s, p) => s + p.lat, 0) / corrida.length,
          lon: corrida.reduce((s, p) => s + p.lon, 0) / corrida.length,
        })
      }
    }
    corrida = []
  }
  for (const p of pontos) {
    if (p.qualidade !== 'valida' || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue
    // o ponto de chegada vem com velocidade 0 mas já marcado como "movimento": conta como parado pela velocidade
    const parado = p.estado === 'parado' || p.estado === 'confirmando_parada' || (p.velocidade_bruta ?? Infinity) <= 3
    if (!parado) { fechar(); continue }
    const ultimo = corrida[corrida.length - 1]
    if (ultimo && (Date.parse(p.tempo) - Date.parse(ultimo.tempo) > o.folgaMaxMs
        || distanciaM(corrida[0].lat, corrida[0].lon, p.lat, p.lon) > o.raioM)) fechar()
    corrida.push(p)
  }
  fechar()
  return saida
}

// paradas seguidas, no mesmo local e sem movimento de verdade entre elas, voltam a ser uma só
function fundirParadasProximas(paradas, pontos, o = FUSAO_PARADAS) {
  const saida = []
  for (const proxima of [...paradas].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))) {
    const atual = saida[saida.length - 1]
    if (atual) {
      const fimAtual = Date.parse(atual.fim), inicioProxima = Date.parse(proxima.inicio)
      const mesmoLocal = distanciaM(atual.lat, atual.lon, proxima.lat, proxima.lon) <= o.raioM
      if (mesmoLocal && inicioProxima - fimAtual <= o.folgaMaxMs) {
        const houveMovimento = pontos.some(p => {
          const t = Date.parse(p.tempo)
          if (t <= fimAtual || t >= inicioProxima) return false
          if (p.qualidade === 'duplicada' || p.qualidade === 'invalida') return false
          return (p.velocidade_bruta ?? 0) > o.velocidadeMax || distanciaM(atual.lat, atual.lon, p.lat_bruta, p.lon_bruta) > o.excursaoM
        })
        if (!houveMovimento) {
          // o local da parada junta é a média dos locais, pesada pelo tempo parado
          const pesoA = Math.max(1000, fimAtual - Date.parse(atual.inicio)), pesoB = Math.max(1000, Date.parse(proxima.fim) - inicioProxima)
          saida[saida.length - 1] = {
            ...atual,
            fim: Date.parse(proxima.fim) > fimAtual ? proxima.fim : atual.fim,
            lat: (atual.lat * pesoA + proxima.lat * pesoB) / (pesoA + pesoB),
            lon: (atual.lon * pesoA + proxima.lon * pesoB) / (pesoA + pesoB),
          }
          continue
        }
      }
    }
    saida.push({ ...proxima })
  }
  return saida
}

function paradasDoDia(j) {
  const pontos = (j.pontos || []).slice().sort((a, b) => Date.parse(a.tempo) - Date.parse(b.tempo) || a.id - b.id)
  // paradas do banco + as reconstruídas dos pontos; as que se tocam viram uma (a arquivada é a mais completa)
  const todas = [...(j.paradas || []), ...derivarParadasDosPontos(pontos)].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
  const unicas = []
  for (const p of todas) {
    const outra = unicas.find(x => Date.parse(x.inicio) <= Date.parse(p.fim) && Date.parse(x.fim) >= Date.parse(p.inicio))
    if (outra) {
      if (Date.parse(p.inicio) < Date.parse(outra.inicio)) outra.inicio = p.inicio
      if (Date.parse(p.fim) > Date.parse(outra.fim)) outra.fim = p.fim
    } else unicas.push({ ...p })
  }
  return fundirParadasProximas(unicas, pontos)
}

async function trajeto(rastreador, dia) {
  const permitido = await frota(`frota_rastreadores?select=id&id=eq.${rastreador}&${FILTRO_REGIONAL}`)
  if (!permitido.length) return null
  // dia civil em Brasília (UTC-3, sem horário de verão desde 2019)
  const de = new Date(`${dia}T00:00:00-03:00`)
  const ate = new Date(de.getTime() + 24 * 3600 * 1000)
  const j = await frota('rpc/frota_trajeto', {
    method: 'POST',
    body: JSON.stringify({ p_rastreador_id: rastreador, p_de: de.toISOString(), p_ate: ate.toISOString() }),
  })
  return {
    // só pontos válidos e só o que o mapa usa
    pontos: (j.pontos || [])
      .filter(p => p.qualidade === 'valida')
      .map(p => ({ t: p.tempo, lat: p.lat, lon: p.lon, v: p.velocidade, trecho: p.trecho })),
    paradas: paradasDoDia(j).map(p => ({ inicio: p.inicio, fim: p.fim, lat: p.lat, lon: p.lon })),
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' })
  if (!FROTA_SUPABASE_URL || !FROTA_SUPABASE_ANON_KEY || !FROTA_USER_EMAIL || !FROTA_USER_PASSWORD) {
    return res.status(503).json({ erro: 'Integração com o Frotas não configurada' })
  }
  try {
    if (!(await usuarioAutorizado(req))) return res.status(401).json({ erro: 'Não autorizado' })

    const { rastreador, dia } = req.query
    if (rastreador !== undefined || dia !== undefined) {
      if (!/^\d+$/.test(rastreador || '') || !/^\d{4}-\d{2}-\d{2}$/.test(dia || '')) {
        return res.status(400).json({ erro: 'Informe rastreador (número) e dia (AAAA-MM-DD)' })
      }
      const j = await trajeto(Number(rastreador), dia)
      return j ? res.status(200).json(j) : res.status(404).json({ erro: 'Veículo não encontrado' })
    }
    return res.status(200).json({ atualizado_em: new Date().toISOString(), veiculos: await posicoes() })
  } catch (e) {
    console.error('frota-veiculos:', e.message)
    return res.status(502).json({ erro: 'Falha ao consultar o Frotas' })
  }
}
