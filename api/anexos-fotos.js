// Lista os anexos de um registro de produção para o visualizador de fotos.
//
//   GET /api/anexos-fotos?registro=<id>  ->  [{ id, nome, tipo, url, link, quando }]
//
// Anexos do SharePoint (fullpath 'sharepoint/...') recebem em "url" um link temporário de leitura
// (@microsoft.graph.downloadUrl, vale ~1 h), que abre direto numa <img> sem login.
// Anexos antigos (Supabase Storage público) devolvem a própria url.
// Mesmas variáveis da Vercel de api/anexos-upload.js.

const PRODUCAO_URL = process.env.SUPABASE_URL || 'https://giendnvcmkaqdminmeyz.supabase.co'
// chave anon é pública (também vai no bundle do app)
const PRODUCAO_ANON = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpZW5kbnZjbWthcWRtaW5tZXl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzEwNzU0MjAsImV4cCI6MjA0NjY1MTQyMH0.Ys5rggtFvbrI-YBPseR41JVRv5QI4TDHVNBChPN9GB8'

const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env
const SITE_HOST = process.env.MS_SITE_HOST || 'redeforteconstrutora.sharepoint.com'
const SITE_PATH = (process.env.MS_SITE_PATH || '').replace(/\/+$/, '')

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

// login válido + usuário ativo; devolve { token } ou null
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
  return linhas.length === 1 && linhas[0].ativo !== false ? { token } : null
}

// anexo do SharePoint = fullpath começa com 'sharepoint/' (a coluna url é gerada e só vale para o Storage antigo)
const eSharePoint = a => (a.fullpath || '').startsWith('sharepoint/')

async function linkTemporario(graphToken, caminho) {
  const cam = caminho.split('/').map(encodeURIComponent).join('/')
  const base = `https://graph.microsoft.com/v1.0/sites/${SITE_HOST}${SITE_PATH ? ':' + SITE_PATH + ':' : ''}/drive/root:/${cam}`
  const r = await fetch(base, { headers: { Authorization: `Bearer ${graphToken}` } })
  if (!r.ok) return null
  const item = await r.json()
  return item['@microsoft.graph.downloadUrl'] || null
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' })
  try {
    const usuario = await usuarioAutorizado(req)
    if (!usuario) return res.status(401).json({ erro: 'Não autorizado' })

    const registroId = req.query.registro
    if (!/^\d+$/.test(registroId || '')) return res.status(400).json({ erro: 'Informe registro (número)' })

    // com o token do usuário: só vê anexo de registro que a RLS dele deixa ver
    const rReg = await fetch(`${PRODUCAO_URL}/rest/v1/f_prod_registro?select=id&id=eq.${registroId}`, {
      headers: { apikey: PRODUCAO_ANON, Authorization: `Bearer ${usuario.token}` },
    })
    if (!rReg.ok) throw new Error(`consulta do registro falhou (${rReg.status})`)
    if (!(await rReg.json()).length) return res.status(404).json({ erro: 'Registro não encontrado' })

    const rArq = await fetch(
      `${PRODUCAO_URL}/rest/v1/f_prod_arquivos?select=id,name,type,url,path,fullpath,data_cadastro&registro_id=eq.${registroId}&order=data_cadastro,id`,
      { headers: { apikey: PRODUCAO_ANON, Authorization: `Bearer ${usuario.token}` } },
    )
    if (!rArq.ok) throw new Error(`consulta dos anexos falhou (${rArq.status})`)
    const arquivos = await rArq.json()

    const temSharePoint = arquivos.some(eSharePoint)
    const graphToken = temSharePoint && MS_TENANT_ID && MS_CLIENT_ID && MS_CLIENT_SECRET ? await obterTokenGraph() : null

    const saida = await Promise.all(arquivos.map(async a => {
      const sp = eSharePoint(a)
      const url = sp ? (graphToken ? await linkTemporario(graphToken, a.path).catch(() => null) : null) : a.url
      return { id: a.id, nome: a.name, tipo: a.type, url, link: url, quando: a.data_cadastro }
    }))
    return res.status(200).json(saida)
  } catch (e) {
    console.error('anexos-fotos:', e.message)
    return res.status(502).json({ erro: 'Falha ao carregar as fotos' })
  }
}
