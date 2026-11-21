// Envia a foto de um registro de produção para o SharePoint (OneDrive corporativo).
//
// O navegador nunca fala com o Microsoft Graph: ele manda a foto (já reduzida, JPEG) para cá,
// com o token da Produção. Esta função confere o login, descobre contrato/equipe/data do registro,
// grava em  <MS_PASTA_RAIZ>/<Contrato>/<Equipe>/<AAAA-MM-DD>/  na biblioteca do site e guarda o
// link em f_prod_arquivos (com o token do usuário, então vale a RLS).
//
//   POST /api/anexos-upload?registro=<id>   corpo = bytes da imagem (image/jpeg), até 4 MB
//
// Variáveis da Vercel: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (obrigatórias)
//   MS_SITE_HOST   (padrão redeforteconstrutora.sharepoint.com)
//   MS_SITE_PATH   (opcional, ex.: /sites/Producao; vazio = site raiz)
//   MS_PASTA_RAIZ  (padrão "Anexos Produção")
// Registro no Azure: app com permissão Graph de aplicativo Sites.Selected (liberada para este site).

const PRODUCAO_URL = process.env.SUPABASE_URL || 'https://giendnvcmkaqdminmeyz.supabase.co'
// chave anon é pública (também vai no bundle do app)
const PRODUCAO_ANON = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpZW5kbnZjbWthcWRtaW5tZXl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzEwNzU0MjAsImV4cCI6MjA0NjY1MTQyMH0.Ys5rggtFvbrI-YBPseR41JVRv5QI4TDHVNBChPN9GB8'

const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env
const SITE_HOST = process.env.MS_SITE_HOST || 'redeforteconstrutora.sharepoint.com'
const SITE_PATH = (process.env.MS_SITE_PATH || '').replace(/\/+$/, '')
const PASTA_RAIZ = process.env.MS_PASTA_RAIZ || 'Anexos Produção'
const LIMITE_BYTES = 4 * 1024 * 1024 // a Vercel recusa corpo acima de ~4,5 MB

let tokenGraph = null // { token, expira }

async function obterTokenGraph() {
  if (tokenGraph && tokenGraph.expira > Date.now()) return tokenGraph.token
  const r = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  if (!r.ok) throw new Error(`login Microsoft falhou (${r.status})`)
  const j = await r.json()
  tokenGraph = { token: j.access_token, expira: Date.now() + (j.expires_in - 120) * 1000 }
  return tokenGraph.token
}

// login válido + usuário ativo; devolve { id, token } ou null
async function usuarioAutorizado(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const u = await fetch(`${PRODUCAO_URL}/auth/v1/user`, { headers: { apikey: PRODUCAO_ANON, Authorization: `Bearer ${token}` } })
  if (!u.ok) return null
  const { id } = await u.json()
  const p = await fetch(`${PRODUCAO_URL}/rest/v1/d_auth_user?select=ativo&uuid=eq.${id}`, {
    headers: { apikey: PRODUCAO_ANON, Authorization: `Bearer ${token}` },
  })
  if (!p.ok) return null
  const linhas = await p.json()
  return linhas.length === 1 && linhas[0].ativo !== false ? { id, token } : null
}

// consulta o Supabase com o token do usuário (vale a RLS dele)
function supa(usuario, caminho, opcoes = {}) {
  return fetch(`${PRODUCAO_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: { apikey: PRODUCAO_ANON, Authorization: `Bearer ${usuario.token}`, 'Content-Type': 'application/json', ...opcoes.headers },
  })
}

async function lerCorpo(req) {
  const partes = []
  let total = 0
  for await (const parte of req) {
    total += parte.length
    if (total > LIMITE_BYTES) return null
    partes.push(parte)
  }
  return Buffer.concat(partes)
}

// nome seguro para pasta/arquivo no SharePoint
function limpar(nome, padrao) {
  const s = String(nome ?? '').replace(/[\\/:*?"<>|#%~&{}]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')
  return (s || padrao).slice(0, 80)
}

const eJpeg = b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' })
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) {
    return res.status(503).json({ erro: 'Integração com o SharePoint não configurada' })
  }
  try {
    const usuario = await usuarioAutorizado(req)
    if (!usuario) return res.status(401).json({ erro: 'Não autorizado' })

    const registroId = req.query.registro
    if (!/^\d+$/.test(registroId || '')) return res.status(400).json({ erro: 'Informe registro (número)' })

    const corpo = await lerCorpo(req)
    if (!corpo) return res.status(413).json({ erro: 'Foto grande demais (máx. 4 MB)' })
    if (!eJpeg(corpo)) return res.status(400).json({ erro: 'Envie a foto em JPEG' })

    // o registro precisa ser visível para o usuário (RLS) — define também a pasta
    const rReg = await supa(usuario, `f_prod_registro?select=id,data_producao,contrato_id,equipe_id&id=eq.${registroId}`)
    if (!rReg.ok) throw new Error(`consulta do registro falhou (${rReg.status})`)
    const [reg] = await rReg.json()
    if (!reg) return res.status(404).json({ erro: 'Registro não encontrado' })

    const [contrato, equipe] = await Promise.all([
      supa(usuario, `d_contratos?select=descricao&id=eq.${reg.contrato_id}`).then(r => r.ok ? r.json() : []),
      reg.equipe_id ? supa(usuario, `d_equipes?select=equipe&id=eq.${reg.equipe_id}`).then(r => r.ok ? r.json() : []) : [],
    ])
    const pasta = [
      limpar(PASTA_RAIZ, 'Anexos'),
      limpar(contrato[0]?.descricao, `Contrato ${reg.contrato_id}`),
      limpar(equipe[0]?.equipe, 'Sem equipe'),
      reg.data_producao, // AAAA-MM-DD
    ]
    const hora = new Date().toLocaleTimeString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(/:/g, '')
    const nome = `reg${reg.id}_${hora}_${Math.random().toString(36).slice(2, 7)}.jpg`
    const caminho = [...pasta, nome].map(encodeURIComponent).join('/')

    const token = await obterTokenGraph()
    const base = `https://graph.microsoft.com/v1.0/sites/${SITE_HOST}${SITE_PATH ? ':' + SITE_PATH + ':' : ''}/drive/root:/${caminho}:/content`
    const up = await fetch(`${base}?@microsoft.graph.conflictBehavior=rename`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
      body: corpo,
    })
    if (!up.ok) {
      console.error('anexos-upload graph:', up.status, (await up.text()).slice(0, 300))
      return res.status(502).json({ erro: 'Falha ao gravar no SharePoint' })
    }
    const item = await up.json()

    // f_prod_arquivos já guardava os anexos do Supabase Storage; os do SharePoint entram na mesma tabela,
    // com url = link do SharePoint (os antigos têm url de storage/v1/object/public/...)
    const caminhoSp = pasta.join('/') + '/' + item.name
    const ins = await supa(usuario, 'f_prod_arquivos', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        registro_id: reg.id,
        path: caminhoSp,
        fullpath: caminhoSp,
        name: item.name,
        size: corpo.length,
        type: 'image/jpeg',
        url: item.webUrl,
        last_modified: item.lastModifiedDateTime ?? new Date().toISOString(),
      }),
    })
    if (!ins.ok) {
      console.error('anexos-upload insert:', ins.status, (await ins.text()).slice(0, 300))
      return res.status(500).json({ erro: 'Foto enviada, mas não foi possível registrar o link' })
    }
    return res.status(200).json({ nome: item.name, web_url: item.webUrl })
  } catch (e) {
    console.error('anexos-upload:', e.message)
    return res.status(502).json({ erro: 'Falha ao enviar a foto' })
  }
}
