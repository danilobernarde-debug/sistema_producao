// Anexos de um registro de produção no SharePoint (OneDrive corporativo): enviar e excluir.
//
// O navegador nunca fala com o Microsoft Graph com credencial: ele chama esta função com o token da
// Produção. Ela confere o login, descobre contrato/equipe/data do registro, grava em
//   <MS_PASTA_RAIZ>/<Contrato>/<Equipe>/<AAAA-MM-DD>/   na biblioteca do site
// e guarda uma linha em f_prod_arquivos (com o token do usuário, então vale a RLS).
//
//   POST   /api/anexos-upload?registro=<id>&nome=<arquivo>                 corpo = bytes (até 4 MB)
//   POST   /api/anexos-upload?registro=<id>&nome=<arquivo>&sessao=1        -> { uploadUrl } (arquivo > 4 MB:
//            o navegador envia em partes direto ao uploadUrl, que já vem autorizado)
//   POST   /api/anexos-upload?registro=<id>&nome=<nome no SharePoint>&concluir=1&tipo=<mime>
//            confere o arquivo enviado em partes e grava a linha em f_prod_arquivos
//   POST   /api/anexos-upload?registro=<id do f_prod_registro>&campofoto=<uuid de campo_registro_fotos>
//            ao aprovar um registro do app de campo: copia a foto do bucket campo-fotos para o SharePoint
//   DELETE /api/anexos-upload?arquivo=<id de f_prod_arquivos>              apaga do SharePoint e da tabela
//
// Variáveis da Vercel: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (obrigatórias)
//   MS_SITE_HOST   (padrão redeforteconstrutora.sharepoint.com)
//   MS_SITE_PATH   (opcional, ex.: /sites/Producao; vazio = site raiz)
//   MS_PASTA_RAIZ  (padrão "Anexos Produção")
// Registro no Azure: app com permissão Graph de aplicativo Sites.Selected (liberada para este site).
//
// f_prod_arquivos: a coluna url é GERADA pelo banco (url pública do Storage + fullpath), então o anexo do
// SharePoint é marcado por fullpath = 'sharepoint/<path>' (os antigos começam com 'f_prod_storage/') e o
// link de leitura é gerado na hora por api/anexos-fotos.js.

const PRODUCAO_URL = process.env.SUPABASE_URL || 'https://giendnvcmkaqdminmeyz.supabase.co'
// chave anon é pública (também vai no bundle do app)
const PRODUCAO_ANON = process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpZW5kbnZjbWthcWRtaW5tZXl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzEwNzU0MjAsImV4cCI6MjA0NjY1MTQyMH0.Ys5rggtFvbrI-YBPseR41JVRv5QI4TDHVNBChPN9GB8'

const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env
const SITE_HOST = process.env.MS_SITE_HOST || 'redeforteconstrutora.sharepoint.com'
const SITE_PATH = (process.env.MS_SITE_PATH || '').replace(/\/+$/, '')
const PASTA_RAIZ = process.env.MS_PASTA_RAIZ || 'Anexos Produção'
const LIMITE_BYTES = 4 * 1024 * 1024 // a Vercel recusa corpo acima de ~4,5 MB
const LIMITE_ARQUIVO = 50 * 1024 * 1024
// executáveis/scripts não entram como anexo
const EXTENSOES_BLOQUEADAS = new Set(['exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'js', 'vbs', 'ps1', 'sh', 'jar', 'dll', 'apk', 'lnk', 'reg'])

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
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    // 7000222 = segredo do cliente expirado; 7000215 = segredo inválido
    throw new Error(`${(j.error_codes || []).some(c => c === 7000222 || c === 7000215) ? 'SEGREDO_INVALIDO' : 'login Microsoft falhou'} (${r.status})`)
  }
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

// consulta o Supabase com o token do usuário (vale a RLS dele); devolve a Response
function supa(usuario, caminho, opcoes = {}) {
  return fetch(`${PRODUCAO_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: { apikey: PRODUCAO_ANON, Authorization: `Bearer ${usuario.token}`, 'Content-Type': 'application/json', ...opcoes.headers },
  })
}

async function supaJson(usuario, caminho) {
  const r = await supa(usuario, caminho)
  if (!r.ok) throw new Error(`consulta falhou (${r.status}): ${caminho.split('?')[0]}`)
  return r.json()
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

// nome do arquivo: limpa e mantém a extensão
function limparNomeArquivo(nome) {
  const bruto = String(nome ?? '').split(/[\\/]/).pop()
  const i = bruto.lastIndexOf('.')
  const ext = i > 0 ? bruto.slice(i + 1).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toLowerCase() : ''
  const base = limpar(i > 0 ? bruto.slice(0, i) : bruto, 'arquivo').slice(0, 100)
  return { nome: ext ? `${base}.${ext}` : base, ext }
}

const mimeValido = t => (/^[\w.+-]+\/[\w.+-]+$/.test(t || '') ? t : 'application/octet-stream')

// confere o conteúdo quando o tipo declarado tem assinatura conhecida
function conteudoConfere(tipo, b) {
  if (tipo === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  if (tipo === 'application/pdf') return b.length > 4 && b.subarray(0, 5).toString('latin1') === '%PDF-'
  return true
}

// registro visível ao usuário (RLS) e a pasta dele no SharePoint
async function contextoRegistro(usuario, registroId) {
  const [reg] = await supaJson(usuario, `f_prod_registro?select=id,data_producao,contrato_id,equipe_id&id=eq.${registroId}`)
  if (!reg) return null
  const [contrato, equipe] = await Promise.all([
    supaJson(usuario, `d_contratos?select=descricao&id=eq.${reg.contrato_id}`),
    reg.equipe_id ? supaJson(usuario, `d_equipes?select=equipe&id=eq.${reg.equipe_id}`) : [],
  ])
  const pasta = [
    limpar(PASTA_RAIZ, 'Anexos'),
    limpar(contrato[0]?.descricao, `Contrato ${reg.contrato_id}`),
    limpar(equipe[0]?.equipe, 'Sem equipe'),
    reg.data_producao, // AAAA-MM-DD
  ]
  return { reg, pasta }
}

const baseDrive = () => `https://graph.microsoft.com/v1.0/sites/${SITE_HOST}${SITE_PATH ? ':' + SITE_PATH + ':' : ''}/drive/root:`
const codificar = partes => partes.map(encodeURIComponent).join('/')

async function gravarLinha(usuario, regId, caminhoSp, nome, tamanho, tipo, modificado) {
  const ins = await supa(usuario, 'f_prod_arquivos', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      registro_id: regId,
      path: caminhoSp,
      fullpath: 'sharepoint/' + caminhoSp,
      name: nome,
      size: tamanho,
      type: tipo,
      last_modified: modificado ?? new Date().toISOString(),
    }),
  })
  if (!ins.ok) console.error('anexos-upload insert:', ins.status, (await ins.text()).slice(0, 300))
  return ins.ok
}

async function excluir(usuario, arquivoId, res) {
  const [a] = await supaJson(usuario, `f_prod_arquivos?select=id,registro_id,path,fullpath&id=eq.${arquivoId}`)
  if (!a) return res.status(404).json({ erro: 'Arquivo não encontrado' })
  // só mexe em anexo de registro que o usuário enxerga
  const reg = await supaJson(usuario, `f_prod_registro?select=id&id=eq.${a.registro_id}`)
  if (!reg.length) return res.status(404).json({ erro: 'Arquivo não encontrado' })

  if ((a.fullpath || '').startsWith('sharepoint/')) {
    const token = await obterTokenGraph()
    const d = await fetch(`${baseDrive()}/${codificar(a.path.split('/'))}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (!d.ok && d.status !== 404) {
      console.error('anexos-upload delete graph:', d.status)
      return res.status(502).json({ erro: 'Falha ao apagar no SharePoint' })
    }
  } else if (a.fullpath) {
    // anexo antigo (Storage do Supabase): tenta apagar o arquivo; se a policy não deixar, só a linha some
    await fetch(`${PRODUCAO_URL}/storage/v1/object/${a.fullpath.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'DELETE', headers: { apikey: PRODUCAO_ANON, Authorization: `Bearer ${usuario.token}` },
    }).catch(() => {})
  }
  const del = await supa(usuario, `f_prod_arquivos?id=eq.${a.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  if (!del.ok) {
    console.error('anexos-upload delete linha:', del.status)
    return res.status(500).json({ erro: 'Não foi possível remover o anexo' })
  }
  return res.status(200).json({ ok: true })
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ erro: 'Método não permitido' })
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) {
    return res.status(503).json({ erro: 'Integração com o SharePoint não configurada' })
  }
  try {
    const usuario = await usuarioAutorizado(req)
    if (!usuario) return res.status(401).json({ erro: 'Não autorizado' })

    if (req.method === 'DELETE') {
      if (!/^\d+$/.test(req.query.arquivo || '')) return res.status(400).json({ erro: 'Informe arquivo (número)' })
      return await excluir(usuario, req.query.arquivo, res)
    }

    const registroId = req.query.registro
    if (!/^\d+$/.test(registroId || '')) return res.status(400).json({ erro: 'Informe registro (número)' })
    const { nome, ext } = limparNomeArquivo(req.query.nome)
    if (EXTENSOES_BLOQUEADAS.has(ext)) return res.status(400).json({ erro: 'Este tipo de arquivo não é permitido' })

    const ctx = await contextoRegistro(usuario, registroId)
    if (!ctx) return res.status(404).json({ erro: 'Registro não encontrado' })
    const { reg, pasta } = ctx
    const token = await obterTokenGraph()
    const caminhoPasta = pasta.join('/')

    // --- arquivo grande: abre a sessão de envio em partes ---
    if (req.query.sessao) {
      const s = await fetch(`${baseDrive()}/${codificar([...pasta, nome])}:/createUploadSession`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
      })
      if (!s.ok) {
        console.error('anexos-upload sessao:', s.status, (await s.text()).slice(0, 300))
        return res.status(502).json({ erro: 'Falha ao iniciar o envio no SharePoint' })
      }
      const { uploadUrl } = await s.json()
      return res.status(200).json({ uploadUrl, limite: LIMITE_ARQUIVO })
    }

    // --- arquivo grande: conferir o que foi enviado em partes e gravar a linha ---
    if (req.query.concluir) {
      const g = await fetch(`${baseDrive()}/${codificar([...pasta, nome])}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!g.ok) return res.status(404).json({ erro: 'Arquivo não encontrado no SharePoint' })
      const item = await g.json()
      if (!item.size || item.size > LIMITE_ARQUIVO) return res.status(400).json({ erro: 'Arquivo inválido' })
      const ok = await gravarLinha(usuario, reg.id, `${caminhoPasta}/${item.name}`, item.name, item.size, mimeValido(req.query.tipo), item.lastModifiedDateTime)
      return ok ? res.status(200).json({ nome: item.name }) : res.status(500).json({ erro: 'Arquivo enviado, mas não foi possível registrar' })
    }

    // --- foto do app de campo: copia do bucket campo-fotos (Supabase) para o SharePoint, ao aprovar ---
    // Uma foto por chamada (a tela de aprovação repete para cada foto). Só vale se o registro de campo
    // está aprovado e aponta para este lançamento. Repetir a chamada não duplica (nome fixo por foto).
    if (req.query.campofoto) {
      if (!/^[0-9a-f-]{36}$/i.test(req.query.campofoto)) return res.status(400).json({ erro: 'Foto inválida' })
      const [foto] = await supaJson(usuario, `campo_registro_fotos?select=id,registro_id,storage_path&id=eq.${req.query.campofoto}`)
      if (!foto) return res.status(404).json({ erro: 'Foto não encontrada' })
      const [campo] = await supaJson(usuario, `campo_registros_producao?select=id,status,f_prod_registro_id&id=eq.${foto.registro_id}`)
      if (!campo || campo.status !== 'aprovado' || String(campo.f_prod_registro_id) !== String(reg.id)) {
        return res.status(400).json({ erro: 'A foto não pertence a este lançamento' })
      }
      const extFoto = (foto.storage_path.match(/\.([A-Za-z0-9]{1,5})$/) || [])[1]?.toLowerCase() || 'jpg'
      const nomeFoto = `campo_${foto.id.slice(0, 8)}.${extFoto}`
      const jaTem = await supaJson(usuario, `f_prod_arquivos?select=id&registro_id=eq.${reg.id}&name=eq.${encodeURIComponent(nomeFoto)}`)
      if (jaTem.length) return res.status(200).json({ nome: nomeFoto, jaEnviada: true })

      const dl = await fetch(`${PRODUCAO_URL}/storage/v1/object/campo-fotos/${foto.storage_path.split('/').map(encodeURIComponent).join('/')}`, {
        headers: { apikey: PRODUCAO_ANON, Authorization: `Bearer ${usuario.token}` },
      })
      if (!dl.ok) {
        console.error('anexos-upload campofoto download:', dl.status, foto.storage_path)
        return res.status(502).json({ erro: 'Foto do app de campo não encontrada no armazenamento' })
      }
      const buf = Buffer.from(await dl.arrayBuffer())
      if (!buf.length || buf.length > LIMITE_ARQUIVO) return res.status(413).json({ erro: 'Foto vazia ou grande demais' })
      let tipoFoto = mimeValido((dl.headers.get('content-type') || '').split(';')[0].trim())
      if (tipoFoto === 'application/octet-stream' && /^jpe?g$/.test(extFoto)) tipoFoto = 'image/jpeg'

      const upF = await fetch(`${baseDrive()}/${codificar([...pasta, nomeFoto])}:/content?@microsoft.graph.conflictBehavior=rename`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipoFoto }, body: buf,
      })
      if (!upF.ok) {
        console.error('anexos-upload campofoto graph:', upF.status, (await upF.text()).slice(0, 300))
        return res.status(502).json({ erro: 'Falha ao gravar no SharePoint' })
      }
      const itemF = await upF.json()
      const okF = await gravarLinha(usuario, reg.id, `${caminhoPasta}/${itemF.name}`, itemF.name, buf.length, tipoFoto, itemF.lastModifiedDateTime)
      return okF ? res.status(200).json({ nome: itemF.name }) : res.status(500).json({ erro: 'Foto enviada, mas não foi possível registrar' })
    }

    // --- arquivo pequeno: o próprio corpo da requisição ---
    const tipo = mimeValido((req.headers['content-type'] || '').split(';')[0].trim())
    const corpo = await lerCorpo(req)
    if (!corpo) return res.status(413).json({ erro: 'Arquivo grande demais para envio direto (máx. 4 MB)' })
    if (!corpo.length) return res.status(400).json({ erro: 'Arquivo vazio' })
    if (!conteudoConfere(tipo, corpo)) return res.status(400).json({ erro: 'O conteúdo não corresponde ao tipo do arquivo' })

    const up = await fetch(`${baseDrive()}/${codificar([...pasta, nome])}:/content?@microsoft.graph.conflictBehavior=rename`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipo },
      body: corpo,
    })
    if (!up.ok) {
      console.error('anexos-upload graph:', up.status, (await up.text()).slice(0, 300))
      return res.status(502).json({ erro: 'Falha ao gravar no SharePoint' })
    }
    const item = await up.json()
    const ok = await gravarLinha(usuario, reg.id, `${caminhoPasta}/${item.name}`, item.name, corpo.length, tipo, item.lastModifiedDateTime)
    return ok ? res.status(200).json({ nome: item.name }) : res.status(500).json({ erro: 'Arquivo enviado, mas não foi possível registrar' })
  } catch (e) {
    console.error('anexos-upload:', e.message)
    if (e.message.startsWith('SEGREDO_INVALIDO')) return res.status(502).json({ erro: 'O segredo do SharePoint expirou: avise o administrador para renová-lo' })
    return res.status(502).json({ erro: 'Falha ao processar o anexo' })
  }
}
