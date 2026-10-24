// Camada "Veículos" dos mapas de Planejamento (RMB, RIP, MEC).
// Mostra a última posição dos veículos rastreados no Frotas e desenha o trajeto do dia.
// Os dados vêm de /api/frota-veiculos, que confere o login da Produção (token no localStorage,
// o mesmo do app que hospeda este iframe) -- o navegador nunca fala direto com o Frotas.
//
// Uso nos HTMLs: <script src="/frota-veiculos.js"></script> e, depois de criar o mapa,
//   FrotaVeiculos.iniciar(map)
(function () {
  const API = '/api/frota-veiculos'
  const INTERVALO_MS = 30000
  const SEM_SINAL_MS = 30 * 60 * 1000 // sem pacote há mais que isso = sem sinal
  const EMOJI = { CARRO: '🚗', PICAPE_LEVE: '🛻', CAMIONETE: '🛻', CAMINHAO: '🚚', MUNCK: '🏗', PRANCHA: '🚛', TRITURADOR: '⚙️' }
  const COR = { movimento: '#00ff87', parado: '#ffe23d', semSinal: '#8896b3' }

  let map, camadaVeiculos, camadaTrajeto, camadaBandeiras, botao, chip
  let ligado = true
  let temporizador = null
  const marcadores = new Map() // id -> L.marker
  let ultimaLista = []

  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  function token() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (/^sb-.+-auth-token$/.test(k)) return JSON.parse(localStorage.getItem(k))?.access_token || null
      }
    } catch (_) { /* storage indisponível */ }
    return null
  }

  // lembra se o usuário deixou os veículos ligados ou desligados (por usuário, neste navegador)
  function chavePreferencia() {
    let uid = 'anon'
    try { uid = JSON.parse(atob(token().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || uid } catch (_) { /* sem token */ }
    return 'frota-veiculos-ligado:' + uid
  }
  function lerPreferencia() {
    try { return localStorage.getItem(chavePreferencia()) !== '0' } catch (_) { return true }
  }
  function salvarPreferencia(valor) {
    try { localStorage.setItem(chavePreferencia(), valor ? '1' : '0') } catch (_) { /* storage indisponível */ }
  }

  async function chamar(consulta) {
    const t = token()
    if (!t) throw new Error('Sem login ativo')
    const r = await fetch(API + (consulta ? '?' + consulta : ''), { headers: { Authorization: 'Bearer ' + t } })
    if (!r.ok) throw new Error(r.status === 401 ? 'Sessão expirada' : r.status === 503 ? 'Integração não configurada' : 'Falha ao buscar veículos')
    return r.json()
  }

  function aviso(msg) {
    if (typeof notify === 'function') notify(msg)
  }

  function hojeBrasilia() {
    return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  }

  function fmtData(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  }

  function fmtHora(iso) {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  }

  function ha(iso) {
    if (!iso) return 'sem registro'
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (min < 1) return 'agora'
    if (min < 60) return `há ${min} min`
    if (min < 1440) return `há ${Math.floor(min / 60)} h`
    return `há ${Math.floor(min / 1440)} d`
  }

  function situacao(v) {
    const semSinal = !v.sinal_em || Date.now() - new Date(v.sinal_em).getTime() > SEM_SINAL_MS
    if (semSinal) return { chave: 'semSinal', texto: 'Sem sinal', cor: COR.semSinal }
    if (v.velocidade > 3 || v.estado === 'movimento') return { chave: 'movimento', texto: 'Em movimento', cor: COR.movimento }
    return { chave: 'parado', texto: 'Parado', cor: COR.parado }
  }

  function icone(v) {
    const s = situacao(v)
    return L.divIcon({
      className: '',
      iconSize: [0, 0],
      html: `<div class="fv-pino" style="--fv:${s.cor}"><span class="fv-bolha">${EMOJI[v.icone] || '🚚'}</span></div>`,
    })
  }

  function popup(v) {
    const s = situacao(v)
    const linhas = [
      ['Situação', `<b style="color:${s.cor}">${s.texto}</b>${s.chave === 'movimento' ? ` · ${v.velocidade} km/h` : ''}`],
      ['Último sinal', `${fmtData(v.sinal_em)} (${ha(v.sinal_em)})`],
      v.modelo && ['Veículo', esc(v.modelo)],
      v.motorista && ['Motorista', esc(v.motorista)],
      v.equipe && ['Equipe', esc(v.equipe)],
      v.operacao && ['Operação', esc(v.operacao)],
      v.parado_desde && s.chave === 'parado' && ['Parado desde', fmtData(v.parado_desde)],
    ].filter(Boolean)
    return `<div class="fv-pop">
      <div class="fv-pop-t">${EMOJI[v.icone] || '🚚'} ${esc(v.placa || v.nome)}</div>
      ${linhas.map(([k, val]) => `<div class="fv-l"><span>${k}</span><span>${val}</span></div>`).join('')}
      <div class="fv-acoes">
        <input type="date" id="fv-dia-${v.id}" value="${hojeBrasilia()}" max="${hojeBrasilia()}">
        <button onclick="FrotaVeiculos.verTrajeto(${v.id})">Ver trajeto</button>
      </div>
    </div>`
  }

  function desenhar(lista) {
    ultimaLista = lista
    const ids = new Set(lista.map((v) => v.id))
    for (const [id, m] of marcadores) {
      if (!ids.has(id)) { camadaVeiculos.removeLayer(m); marcadores.delete(id) }
    }
    for (const v of lista) {
      let m = marcadores.get(v.id)
      if (!m) {
        m = L.marker([v.lat, v.lon], { icon: icone(v), zIndexOffset: 2000 }).addTo(camadaVeiculos)
        m.bindPopup('', { maxWidth: 270 })
        marcadores.set(v.id, m)
      } else {
        m.setLatLng([v.lat, v.lon])
        m.setIcon(icone(v))
      }
      m.setPopupContent(popup(v))
    }
  }

  // indicador fixo no mapa: quantos veículos, clique enquadra; em erro mostra o motivo
  function indicador(texto, erro) {
    if (!chip) return
    chip.title = texto + ' — clique para desligar'
    chip.classList.toggle('fv-erro', !!erro)
    chip.classList.remove('fv-off')
  }

  async function atualizar(silencioso) {
    if (!ligado || document.hidden) return
    try {
      const j = await chamar()
      if (!ligado) return // foi desligado enquanto buscava
      desenhar(j.veiculos)
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      indicador(j.veiculos.length ? `🚚 ${j.veiculos.length} veículo${j.veiculos.length > 1 ? 's' : ''} · ${hora}` : '🚚 Nenhum veículo para mostrar', !j.veiculos.length)
    } catch (e) {
      if (!ligado) return
      indicador('🚚 ' + e.message, true)
      if (!silencioso) aviso('🚚 ' + e.message)
    }
  }

  function ajustarParaVeiculos() {
    const pts = ultimaLista.map((v) => [v.lat, v.lon])
    if (pts.length) map.fitBounds(pts, { padding: [60, 60], maxZoom: 13 })
  }

  // ---- Bandeiras de parada: igual ao Frotas (lib/paradas-mapa.ts e lib/rastreamento-icones.ts) ----
  const RAIO_AGRUPAR_PX = 30 // paradas a menos disso na tela viram um ícone só
  const RAIO_AGRUPAR_M = 200 // ... ou a menos disso no chão, em qualquer zoom
  const EM_ANDAMENTO_MS = 10 * 60 * 1000 // terminou há menos disso: ainda pode estar parado
  let paradasAtuais = []
  const bandeiras = new Map() // chave do grupo -> { marcador, balao }

  function distanciaM(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
    return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
  }

  // 45 s -> "menos de 1 min", 47 min -> "47 min", 80 min -> "1 h 20 min", 30 h -> "1 d 6 h"
  function duracaoDetalhada(ms) {
    const minutos = Math.floor(ms / 60000)
    if (minutos < 1) return 'menos de 1 min'
    if (minutos < 60) return `${minutos} min`
    const horas = Math.floor(minutos / 60)
    if (horas < 24) return minutos % 60 ? `${horas} h ${minutos % 60} min` : `${horas} h`
    const dias = Math.floor(horas / 24)
    return horas % 24 ? `${dias} d ${horas % 24} h` : `${dias} d`
  }

  function iconeBandeira(texto, varias) {
    const cor = varias ? '#9a3412' : '#ea580c'
    return L.divIcon({
      className: '',
      iconSize: [30, 34],
      iconAnchor: [6, 33],
      popupAnchor: [10, -30],
      html: `<svg width="30" height="34" viewBox="0 0 30 34" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="6" y1="3" x2="6" y2="33" stroke="#334155" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M6 3 H28 L24 9.5 L28 16 H6 Z" fill="${cor}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
        <text x="15.5" y="12.6" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff" font-family="system-ui,sans-serif">${esc(texto)}</text>
      </svg>`,
    })
  }

  // junta paradas próximas (guloso, em ordem de horário); a numeração é a posição na lista
  function agruparParadas(paradas) {
    const zoom = map.getZoom()
    const grupos = []
    paradas.forEach((parada, i) => {
      if (!Number.isFinite(parada.lat) || !Number.isFinite(parada.lon)) return
      const q = map.project([parada.lat, parada.lon], zoom)
      const grupo = grupos.find((g) => Math.hypot(g.ancora.x - q.x, g.ancora.y - q.y) < RAIO_AGRUPAR_PX
        || distanciaM(g.lat, g.lon, parada.lat, parada.lon) < RAIO_AGRUPAR_M)
      if (grupo) grupo.itens.push({ numero: i + 1, parada })
      else grupos.push({ ancora: q, lat: parada.lat, lon: parada.lon, itens: [{ numero: i + 1, parada }] })
    })
    return grupos.map((g) => ({
      itens: g.itens,
      lat: g.itens.reduce((s, i) => s + i.parada.lat, 0) / g.itens.length,
      lon: g.itens.reduce((s, i) => s + i.parada.lon, 0) / g.itens.length,
    }))
  }

  function coordenadasHtml(lat, lon) {
    const texto = `${lat.toFixed(6)},${lon.toFixed(6)}`
    return `<a href="https://www.google.com/maps/search/?api=1&query=${texto}" target="_blank" rel="noopener noreferrer">${texto.replace(',', ', ')}</a>`
  }

  function textosParada(grupo) {
    const tempo = (p) => Date.parse(p.fim) - Date.parse(p.inicio)
    const emAndamento = (p) => Date.now() - Date.parse(p.fim) < EM_ANDAMENTO_MS
    const coordenadas = coordenadasHtml(grupo.lat, grupo.lon)
    if (grupo.itens.length === 1) {
      const { numero, parada } = grupo.itens[0]
      return {
        icone: String(numero),
        balao: `<div class="fv-pop"><strong>Parada ${numero}</strong><br/>Parado por <strong>${duracaoDetalhada(tempo(parada))}</strong>${emAndamento(parada) ? ' (até agora)' : ''}<br/>${fmtHora(parada.inicio)} → ${fmtHora(parada.fim)}<br/>${coordenadas}</div>`,
      }
    }
    const total = grupo.itens.reduce((soma, i) => soma + tempo(i.parada), 0)
    const linhas = grupo.itens
      .map(({ numero, parada }) => `<div><strong>#${numero}</strong> · ${fmtHora(parada.inicio)} → ${fmtHora(parada.fim)} · ${duracaoDetalhada(tempo(parada))}${emAndamento(parada) ? ' (até agora)' : ''}</div>`)
      .join('')
    return {
      icone: `×${grupo.itens.length}`,
      balao: `<div class="fv-pop"><strong>${grupo.itens.length} paradas neste local</strong><br/>Total parado: <strong>${duracaoDetalhada(total)}</strong><div style="margin:6px 0;font-size:12px;line-height:1.55">${linhas}</div>${coordenadas}</div>`,
    }
  }

  // só acrescenta/tira o que mudou, para o zoom não fechar o balão que a pessoa está lendo
  function redesenharBandeiras() {
    if (!camadaBandeiras) return
    const querem = new Map()
    for (const g of agruparParadas(paradasAtuais)) querem.set(g.itens.map((i) => i.numero).join(','), g)
    for (const [chave, b] of bandeiras) {
      if (!querem.has(chave)) { camadaBandeiras.removeLayer(b.marcador); bandeiras.delete(chave) }
    }
    for (const [chave, g] of querem) {
      if (bandeiras.has(chave)) continue
      const textos = textosParada(g)
      const marcador = L.marker([g.lat, g.lon], { icon: iconeBandeira(textos.icone, g.itens.length > 1), zIndexOffset: 500 })
        .bindPopup(textos.balao, { maxHeight: 220, minWidth: 190 })
      camadaBandeiras.addLayer(marcador)
      bandeiras.set(chave, { marcador, balao: textos.balao })
    }
  }

  function limparBandeiras() {
    paradasAtuais = []
    bandeiras.clear()
    if (camadaBandeiras) camadaBandeiras.clearLayers()
  }

  async function verTrajeto(id) {
    const campo = document.getElementById('fv-dia-' + id)
    const dia = campo?.value || hojeBrasilia()
    const v = ultimaLista.find((x) => x.id === id)
    try {
      const j = await chamar(`rastreador=${id}&dia=${dia}`)
      camadaTrajeto.clearLayers()
      limparBandeiras()
      if (!j.pontos.length) { aviso(`🚚 ${v?.placa || 'Veículo'} sem trajeto em ${dia.split('-').reverse().join('/')}`); return }
      // um traçado por trecho: lacunas de sinal não viram linha reta
      const trechos = new Map()
      for (const p of j.pontos) {
        if (!trechos.has(p.trecho)) trechos.set(p.trecho, [])
        trechos.get(p.trecho).push([p.lat, p.lon])
      }
      const todos = []
      for (const pts of trechos.values()) {
        todos.push(...pts)
        L.polyline(pts, { color: '#ff2fd0', weight: 4, opacity: 0.85 }).addTo(camadaTrajeto)
      }
      const ini = j.pontos[0], fim = j.pontos[j.pontos.length - 1]
      L.circleMarker([ini.lat, ini.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#00ff87', fillOpacity: 1 })
        .bindTooltip(`Início · ${fmtHora(ini.t)}`).addTo(camadaTrajeto)
      L.circleMarker([fim.lat, fim.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#e53935', fillOpacity: 1 })
        .bindTooltip(`Último ponto · ${fmtHora(fim.t)}`).addTo(camadaTrajeto)
      paradasAtuais = j.paradas
      redesenharBandeiras()
      map.closePopup()
      map.fitBounds(todos, { padding: [60, 60] })
      mostrarBarraTrajeto(v, dia, j)
    } catch (e) {
      aviso('🚚 ' + e.message)
    }
  }

  function mostrarBarraTrajeto(v, dia, j) {
    let barra = document.getElementById('fv-barra')
    if (!barra) {
      barra = document.createElement('div')
      barra.id = 'fv-barra'
      document.getElementById('map').parentElement.appendChild(barra)
    }
    barra.innerHTML = `<span>🚚 <b>${esc(v?.placa || v?.nome || '')}</b> · ${dia.split('-').reverse().join('/')} · ${j.pontos.length} pontos · ${j.paradas.length} paradas${j.paradas.length ? ' · ' + duracaoDetalhada(j.paradas.reduce((s, p) => s + Date.parse(p.fim) - Date.parse(p.inicio), 0)) + ' parado' : ''}</span><button onclick="FrotaVeiculos.limparTrajeto()">Limpar</button>`
    barra.style.display = 'flex'
  }

  function limparTrajeto() {
    camadaTrajeto.clearLayers()
    limparBandeiras()
    const barra = document.getElementById('fv-barra')
    if (barra) barra.style.display = 'none'
  }

  function alternar() {
    definirLigado(!ligado, { salvar: true, enquadrar: true })
  }

  // liga/desliga a camada; o clique do usuário salva e enquadra, a abertura do mapa e a sincronia entre abas não
  function definirLigado(valor, { salvar, enquadrar }) {
    ligado = valor
    if (salvar) salvarPreferencia(ligado)
    if (botao) botao.classList.toggle('active', ligado)
    if (ligado) {
      indicador('🚚 Carregando veículos…')
      camadaVeiculos.addTo(map)
      atualizar(false).then(() => { if (enquadrar) ajustarParaVeiculos() })
    } else {
      map.removeLayer(camadaVeiculos)
      limparTrajeto()
      chip.title = 'Veículos desligados — clique para ligar'
      chip.classList.remove('fv-erro')
      chip.classList.add('fv-off')
    }
  }

  function css() {
    const el = document.createElement('style')
    el.textContent = `
      .fv-pino{display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer}
      .fv-bolha{width:30px;height:30px;border-radius:50%;background:#07090f;border:3px solid var(--fv);display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 0 12px var(--fv),0 2px 6px rgba(0,0,0,.7)}
      .fv-pop{min-width:210px;font-family:"DM Sans",sans-serif;font-size:12px;color:#dde3f0}
      .fv-pop a{color:#60a5fa}
      .fv-pop strong{color:#fff}
      .fv-pop-t{font:700 14px "Syne",sans-serif;margin-bottom:8px}
      .fv-l{display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-bottom:1px solid #232b3e}
      .fv-l span:first-child{color:#8896b3}
      .fv-l span:last-child{text-align:right}
      .fv-acoes{display:flex;gap:6px;margin-top:10px}
      .fv-acoes input{flex:1;min-width:0;background:#141824;border:1px solid #2d3852;color:#dde3f0;border-radius:6px;padding:5px 6px;font-size:12px;color-scheme:dark}
      .fv-acoes button,#fv-barra button{background:#ff5722;border:none;color:#fff;font:700 11px "Syne",sans-serif;border-radius:6px;padding:6px 10px;cursor:pointer}
      #fv-chip{top:52px;right:10px;z-index:800;width:36px;height:36px;border-radius:8px;background:rgba(7,9,15,.92);border:1px solid #00ff87;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.5);position:absolute}
      #fv-chip:hover{background:rgba(0,255,135,.12)}
      #fv-chip.fv-off{border-color:#2d3852;opacity:.7;filter:grayscale(1)}
      #fv-chip.fv-off::after{content:"";position:absolute;left:6px;right:6px;top:50%;border-top:2px solid #e53935;transform:rotate(-45deg)}
      #fv-chip.fv-erro{border-color:#e53935;background:rgba(229,57,53,.15)}
      #fv-barra{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:900;display:none;align-items:center;gap:12px;background:rgba(7,9,15,.94);border:1px solid #ff2fd0;border-radius:10px;padding:8px 12px;color:#dde3f0;font-size:12px;max-width:calc(100% - 24px)}
    `
    document.head.appendChild(el)
  }

  function iniciar(mapa) {
    if (map) return
    map = mapa
    css()
    camadaTrajeto = L.layerGroup().addTo(map)
    camadaBandeiras = L.layerGroup().addTo(map)
    map.on('zoomend', redesenharBandeiras)
    camadaVeiculos = L.layerGroup().addTo(map)

    // botão no menu de camadas, depois de "+ Divisas"
    const menu = document.getElementById('layer-options')
    if (menu) {
      const sep = document.createElement('div')
      sep.style.cssText = 'height:1px;background:var(--border2);margin:2px 0'
      botao = document.createElement('button')
      botao.className = 'layer-btn'
      botao.id = 'lb-veiculos'
      botao.textContent = '🚚 Veículos'
      botao.onclick = alternar
      menu.append(sep, botao)
    }

    chip = document.createElement('div')
    chip.id = 'fv-chip'
    chip.className = 'map-ov click'
    chip.title = 'Carregando veículos…'
    chip.textContent = '🚚'
    chip.onclick = alternar
    document.getElementById('map').parentElement.appendChild(chip)

    // abre como o usuário deixou da última vez (padrão: ligado); não mexe no enquadramento do mapa
    definirLigado(lerPreferencia(), { salvar: false, enquadrar: false })
    // as 3 abas (RMB/RIP/MEC) carregam juntas: mudar numa muda nas outras
    window.addEventListener('storage', (e) => {
      if (e.key === chavePreferencia() && (e.newValue !== '0') !== ligado) definirLigado(e.newValue !== '0', { salvar: false, enquadrar: false })
    })
    temporizador = setInterval(() => atualizar(true), INTERVALO_MS)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizar(true) })
  }

  window.FrotaVeiculos = { iniciar, verTrajeto, limparTrajeto }
})()
