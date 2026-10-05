import * as store from './store.js';
import * as licenca from './licenca.js';
import {
  VIAS, UNIDADES, DROGAS_PADRAO, FLUIDOS, EVENTOS_RAPIDOS, MONITORIZACAO, EQUIPAMENTOS,
  PRE_GRUPOS, ALDRETE, ALDRETE_TEMPOS, novaFicha, uid, hhmm, dataBR, dataHoraBR, horaParaISO,
  calcBalanco, aldreteTotal, num, pad, N_MEDICAMENTOS, normalizarFicha, obrigatoriosFaltando,
  INFUSOES, UNID_INFUSAO, imc, totalInfusao, rotuloInfusao, normNumero,
} from './model.js';
import { gerarPDF } from './pdf.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const APP_VERSAO = '1.2.0';
const DESENVOLVEDOR = 'Adriano A S Mendonça';

// Rodando dentro do APK Android (Capacitor)?
const NATIVO = !!window.Capacitor?.isNativePlatform?.();
// Chama o plugin nativo "Arquivos" (ArquivosPlugin.java) pela ponte do Capacitor.
// Obs.: registerPlugin() só existe no pacote JS @capacitor/core; a ponte nativa oferece nativePromise().
const Arquivos = NATIVO
  ? new Proxy({}, { get: (_, metodo) => (opcoes = {}) => window.Capacitor.nativePromise('Arquivos', metodo, opcoes) })
  : null;

const S = { fichas: [], f: null, aba: 'pac', logo: null, timer: null, wake: null, filtro: '' };

const ABAS = [
  ['pac', '👤', 'Paciente'], ['pre', '📋', 'Pré-anest.'], ['intra', '⏱️', 'Intraop.'],
  ['tec', '🫁', 'Anestesia'], ['srpa', '🛏️', 'SRPA'], ['fim', '✅', 'Finalizar'],
];

// ---------------------------------------------------------------- utilidades
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function getP(o, path) {
  return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
}
function setP(o, path, v) {
  const ks = path.split('.');
  let cur = o;
  ks.slice(0, -1).forEach((k) => { if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; });
  cur[ks.at(-1)] = v;
}

const favoritos = () => store.usuarioAtual()?.favoritos || DROGAS_PADRAO;
const bloqueada = () => S.f?.status === 'finalizada';
const nomeUser = (u) => `${u.nome} — CRM ${u.crm}${u.uf ? '/' + u.uf : ''}`;
const agoraHM = () => hhmm(new Date().toISOString());
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const normNum = (v) => String(v ?? '').trim().replace(',', '.');

// No Android, o toque que fecha um diálogo pode gerar um segundo clique na tela que aparece embaixo.
let bloqueioCliqueAte = 0;
document.addEventListener('click', (e) => {
  if (Date.now() < bloqueioCliqueAte && !e.target.closest?.('dialog')) { e.stopPropagation(); e.preventDefault(); }
}, true);

function modal({ title, body, ok = 'Salvar', cancel = 'Cancelar', extra = [], onOpen, okClass = 'pri' }) {
  return new Promise((resolve) => {
    const d = $('#modal');
    d.innerHTML = `<form method="dialog">
      <div class="mh">${title}</div>
      <div class="mb">${body}</div>
      <div class="mf">
        ${extra.map((b) => `<button class="btn ${b.cls || ''}" value="${b.value}" formnovalidate>${b.label}</button>`).join('')}
        ${cancel ? `<button class="btn" value="cancel" formnovalidate>${cancel}</button>` : ''}
        ${ok ? `<button class="btn ${okClass}" value="ok">${ok}</button>` : ''}
      </div></form>`;
    const form = $('form', d);
    // chips dentro de modais escrevem num input escondido
    $$('.chips[data-name]', d).forEach((c) => {
      const inp = $(`input[name="${c.dataset.name}"]`, d);
      $$('button', c).forEach((b) => {
        b.type = 'button';
        b.setAttribute('aria-pressed', String(inp.value === b.dataset.v));
        b.onclick = () => {
          inp.value = inp.value === b.dataset.v ? '' : b.dataset.v;
          $$('button', c).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === inp.value)));
          inp.dispatchEvent(new Event('input'));
        };
      });
    });
    let feito = false;
    const fim = (v) => {
      if (feito) return;
      feito = true;
      bloqueioCliqueAte = Date.now() + 450; // evita que o toque "atravesse" para a tela de baixo
      const data = Object.fromEntries(new FormData(form));
      if (d.open) d.close();
      resolve({ v, data, el: d });
    };
    form.onsubmit = (e) => { e.preventDefault(); fim(e.submitter?.value || 'ok'); };
    d.oncancel = (e) => { e.preventDefault(); fim('cancel'); };
    d.onclose = () => fim(d.returnValue || 'cancel');
    onOpen?.(d);
    d.showModal();
    const first = $('[autofocus]', d);
    if (first) setTimeout(() => first.focus(), 50);
  });
}

async function confirmar(title, texto, ok = 'Confirmar', okClass = 'pri') {
  const r = await modal({ title, body: `<p>${texto}</p>`, ok, okClass });
  return r.v === 'ok';
}

async function pedirSenha(texto) {
  const r = await modal({
    title: 'Confirme sua senha',
    body: `<p class="small muted">${texto}</p><label class="f">Senha<input type="password" name="senha" required autofocus autocomplete="current-password"></label>`,
    ok: 'Confirmar',
  });
  if (r.v !== 'ok') return false;
  if (await store.conferirSenha(r.data.senha)) return true;
  toast('Senha incorreta');
  return false;
}

// ---------------------------------------------------------------- salvar
let saveT = null;
function agendarSalvar() {
  clearTimeout(saveT);
  saveT = setTimeout(salvarAgora, 350);
}
let envioT = null;
function agendarEnvio() {
  if (!syncAtivo()) return;
  clearTimeout(envioT);
  envioT = setTimeout(() => sincronizar(), 8000);
}

async function salvarAgora() {
  clearTimeout(saveT);
  if (!S.f) return;
  try {
    await store.salvarFicha(S.f);
    const i = S.fichas.findIndex((x) => x.id === S.f.id);
    if (i >= 0) S.fichas[i] = S.f; else S.fichas.unshift(S.f);
    const s = $('#saved');
    if (s) s.textContent = `salvo ${agoraHM()}`;
    agendarEnvio();
  } catch (e) {
    console.error(e);
    toast('Erro ao salvar! ' + e.message, 6000);
  }
}

// ---------------------------------------------------------------- navegação
function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
window.addEventListener('hashchange', () => render());

// ---------------------------------------------------------------- código de acesso
async function acessoLiberado() {
  // código recebido por link: ...#licenca=CODIGO
  if (location.hash.startsWith('#licenca=')) {
    const cod = decodeURIComponent(location.hash.slice('#licenca='.length));
    history.replaceState(null, '', location.pathname + location.search);
    const r = await licenca.verificar(cod);
    if (r.ok) { licenca.salvar(cod); S.motivoLicenca = ''; toast(`Acesso liberado para ${r.dados.n}`, 4000); } else S.motivoLicenca = r.motivo;
  }
  const salvo = licenca.codigoSalvo();
  const r = await licenca.verificar(salvo);
  S.licenca = r.ok ? r.dados : null;
  if (!r.ok && salvo) S.motivoLicenca ||= r.motivo;
  return r.ok;
}

function telaLicenca() {
  topbar(`<img src="icons/logo.png" alt=""><div class="ttl"><b>Ficha de Anestesia</b><small>CEA — Excelência em Anestesia</small></div>`);
  $('#tabs').hidden = true;
  $('#app').innerHTML = `<div class="login card">
    <img class="logo" src="icons/logo.png" alt="CEA">
    <h1>Código de acesso</h1>
    <p class="note">O uso deste app é liberado pelo responsável (${esc(DESENVOLVEDOR)}). Cole abaixo o código de acesso que você recebeu.</p>
    ${S.motivoLicenca ? `<p class="note bad">${esc(S.motivoLicenca)}</p>` : ''}
    <form id="flic">
      <label class="f">Código<textarea name="codigo" rows="4" required autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" style="font-family:ui-monospace,monospace;font-size:13px"></textarea></label>
      <p><button class="btn pri big block">Liberar</button></p>
    </form></div>`;
  $('#flic').onsubmit = async (e) => {
    e.preventDefault();
    // aceita o código sozinho, o link ou a mensagem inteira colada do WhatsApp
    const texto = e.target.codigo.value;
    const achado = texto.replace(/\s+/g, '').match(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}/);
    const cod = achado ? achado[0] : texto.replace(/\s+/g, '');
    const r = await licenca.verificar(cod);
    if (!r.ok) { S.motivoLicenca = r.motivo; return telaLicenca(); }
    licenca.salvar(cod);
    S.motivoLicenca = '';
    toast(`Acesso liberado para ${r.dados.n}`, 4000);
    render();
  };
}

async function render() {
  clearInterval(S.timer);
  if (S.wake) { S.wake.release().catch(() => {}); S.wake = null; }
  await salvarAgora();
  if (!(await acessoLiberado())) return telaLicenca();
  const user = store.usuarioAtual();
  $('#tabs').hidden = true;
  if (!user) return telaLogin();
  const [, rota, id, aba] = location.hash.split('/');
  if (rota === 'ficha' && id) {
    const f = S.fichas.find((x) => x.id === id);
    if (!f) return go('#/lista');
    S.f = normalizarFicha(f);
    S.aba = aba || S.aba || 'pac';
    return telaFicha();
  }
  S.f = null;
  if (rota === 'config') return telaConfig();
  return telaLista();
}

function topbar(html) { $('#topbar').innerHTML = html; }

// ---------------------------------------------------------------- instalação
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalar = e;
  const b = $('#instalar');
  if (b) b.outerHTML = blocoInstalar();
  ligarInstalar();
});
window.addEventListener('appinstalled', () => { promptInstalar = null; $('#instalar')?.remove(); toast('App instalado'); });

const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function blocoInstalar() {
  if (NATIVO || instalado()) return '';
  if (promptInstalar) {
    return `<div id="instalar" class="note"><b>Instale o app no aparelho</b> para usar em tela cheia e sem internet.
      <p style="margin:8px 0 0"><button class="btn pri" id="binstalar">📲 Instalar app</button></p></div>`;
  }
  if (ehIOS()) {
    return `<div id="instalar" class="note"><b>Para instalar no iPhone/iPad:</b> toque em Compartilhar
      (quadrado com seta ↑) e depois em <b>Adicionar à Tela de Início</b>.</div>`;
  }
  return `<div id="instalar" class="note small">Para instalar: no Chrome, toque no menu <b>⋮</b> → <b>Instalar app</b>
    (ou “Adicionar à tela inicial”).</div>`;
}

function ligarInstalar() {
  $('#binstalar')?.addEventListener('click', async () => {
    if (!promptInstalar) return;
    promptInstalar.prompt();
    await promptInstalar.userChoice.catch(() => {});
    promptInstalar = null;
    $('#instalar')?.remove();
  });
}

// ---------------------------------------------------------------- login
async function telaLogin() {
  const users = await store.listarUsuarios();
  topbar(`<img src="icons/logo.png" alt=""><div class="ttl"><b>Ficha de Anestesia</b><small>CEA — Excelência em Anestesia</small></div>`);
  const app = $('#app');
  if (!users.length) return telaCadastro(true);
  let sel = users.length === 1 ? users[0].id : null;
  app.innerHTML = `<div class="login card">
    <img class="logo" src="icons/logo.png" alt="CEA">
    <h1>Entrar</h1>
    ${blocoInstalar()}
    <div class="userpick">${users.map((u) => `<button type="button" data-id="${u.id}">${esc(nomeUser(u))}</button>`).join('')}</div>
    <form id="fl">
      <label class="f">Senha<input type="password" name="senha" required autocomplete="current-password"></label>
      <p><button class="btn pri big block">Entrar</button></p>
    </form>
    <div class="btns">
      <button class="btn" id="bnovo">Novo usuário</button>
      <button class="btn" id="besq">Esqueci a senha</button>
      <button class="btn" id="brest">Restaurar backup</button>
    </div></div>`;
  const marcar = () => $$('.userpick button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === sel)));
  $$('.userpick button').forEach((b) => (b.onclick = () => { sel = b.dataset.id; marcar(); $('[name=senha]').focus(); }));
  marcar();
  $('#fl').onsubmit = async (e) => {
    e.preventDefault();
    if (!sel) return toast('Escolha o usuário');
    try {
      await store.login(sel, e.target.senha.value);
      await entrar();
    } catch (err) { toast(err.message); }
  };
  ligarInstalar();
  $('#bnovo').onclick = () => telaCadastro(false);
  $('#besq').onclick = () => esqueciSenha(users, sel);
  $('#brest').onclick = () => restaurarBackup();
}

function telaCadastro(primeiro) {
  $('#app').innerHTML = `<div class="login card">
    <img class="logo" src="icons/logo.png" alt="CEA">
    <h1>${primeiro ? 'Primeiro acesso' : 'Novo usuário'}</h1>
    ${blocoInstalar()}
    <p class="note">Cada anestesista tem sua senha. Só quem criou a ficha consegue abri-la e editá-la.</p>
    <form id="fc" class="grid">
      <label class="f full">Nome completo<input type="text" name="nome" required autocomplete="name"></label>
      <label class="f">CRM<input type="text" name="crm" required inputmode="numeric"></label>
      <label class="f">UF<input type="text" name="uf" maxlength="2" required style="text-transform:uppercase"></label>
      <label class="f full">Senha (mín. 6 caracteres)<input type="password" name="senha" minlength="6" required autocomplete="new-password"></label>
      <label class="f full">Confirmar senha<input type="password" name="senha2" minlength="6" required autocomplete="new-password"></label>
      <div class="full"><button class="btn pri big block">Criar usuário</button></div>
    </form>
    <div class="btns">${primeiro ? '<button class="btn" id="brest">Restaurar backup</button>' : '<button class="btn" id="bvolta">Voltar</button>'}</div>
  </div>`;
  $('#fc').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (d.senha !== d.senha2) return toast('As senhas não conferem');
    const codigo = await store.criarUsuario({ nome: d.nome.trim(), crm: d.crm.trim(), uf: d.uf.trim().toUpperCase(), senha: d.senha });
    await modal({
      title: 'Guarde seu código de recuperação',
      body: `<p>Se você esquecer a senha, <b>só este código</b> permite recuperar suas fichas. Anote e guarde em local seguro (fora do aparelho).</p>
             <div class="code">${codigo}</div>
             <p class="small muted">Ele não será mostrado novamente.</p>`,
      ok: 'Anotei o código', cancel: '',
    });
    await entrar();
  };
  ligarInstalar();
  $('#brest')?.addEventListener('click', () => restaurarBackup());
  $('#bvolta')?.addEventListener('click', () => telaLogin());
}

async function esqueciSenha(users, sel) {
  const r = await modal({
    title: 'Recuperar acesso',
    body: `<label class="f">Usuário<select name="uid">${users.map((u) => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(nomeUser(u))}</option>`).join('')}</select></label><br>
      <label class="f">Código de recuperação<input type="text" name="cod" required autocomplete="off" style="text-transform:uppercase"></label><br>
      <label class="f">Nova senha<input type="password" name="senha" minlength="6" required autocomplete="new-password"></label>`,
    ok: 'Redefinir senha',
  });
  if (r.v !== 'ok') return;
  try {
    await store.recuperar(r.data.uid, r.data.cod, r.data.senha);
    toast('Senha redefinida');
    await entrar();
  } catch (e) { toast(e.message); }
}

// ---------------------------------------------------------------- sincronização entre aparelhos
// Cada ficha (cifrada) vira um arquivo em <pasta escolhida>/Dados/. O DriveSync (ou similar) leva a pasta
// para a nuvem e traz para o outro aparelho. Vale sempre a versão mais recente de cada ficha.
const SUB_DADOS = 'Dados';
const paraB64 = (txt) => { const b = new TextEncoder().encode(txt); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); };
const deB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
const syncAtivo = () => NATIVO && armazenamento().modo === 'pasta' && !!armazenamento().uri;

function estadoSync() {
  const k = 'sync:' + store.usuarioAtual().id;
  let st;
  try { st = JSON.parse(localStorage.getItem(k)) || {}; } catch { st = {}; }
  st.lidos ||= {}; st.enviados ||= {};
  st.gravar = () => { try { const { gravar, ...r } = st; void gravar; localStorage.setItem(k, JSON.stringify(r)); } catch { /* sem armazenamento local */ } };
  return st;
}

async function gravarJSON(nome, obj) {
  await Arquivos.salvarNaPasta({ pasta: armazenamento().uri, subpasta: SUB_DADOS, nome, mime: 'application/json', base64: paraB64(JSON.stringify(obj)) });
}

async function lerJSON(nome) {
  const r = await Arquivos.lerArquivo({ pasta: armazenamento().uri, subpasta: SUB_DADOS, nome });
  return JSON.parse(deB64(r.base64));
}

// Cadastros de outros aparelhos presentes na pasta (ignora os já substituídos numa unificação).
async function cadastrosDaPasta(arquivos, idAtual) {
  const out = [];
  for (const a of arquivos.filter((x) => ehCadastro(x.nome))) {
    try {
      const d = await lerJSON(a.nome);
      if (d?.user?.id && d.user.wPass && d.user.id !== idAtual && !out.some((u) => u.id === d.user.id)) out.push(d.user);
    } catch (e) { console.warn('sync: cadastro ilegível', a.nome, e); }
  }
  return out;
}
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const mesmoAnestesista = (a, b) => soDigitos(a.crm) && soDigitos(a.crm) === soDigitos(b.crm);
// Regra fixa para os dois aparelhos convergirem: fica sempre o cadastro mais antigo.
const maisAntigo = (a, b) => (a.criadoEm || '') < (b.criadoEm || '') || ((a.criadoEm || '') === (b.criadoEm || '') && a.id < b.id);

// Arquivo de cada ficha leva também o cadastro: dois cadastros nunca gravam o mesmo nome.
const nomeFicha = (id, uid) => `ficha-${id}.${uid}.json`;
// O cadastro é gravado só pelo próprio dono, num nome que ninguém mais usa.
const nomeCadastro = (uid) => `cadastro-${uid}.json`;
const ehFicha = (nome) => /^ficha-.+\.json$/.test(nome);
const ehCadastro = (nome) => /^(cadastro|usuario)-.+\.json$/.test(nome);

let sincronizando = null;
async function sincronizar({ silencioso = true, completa = false } = {}) {
  if (!syncAtivo()) { if (!silencioso) toast('Escolha uma pasta (Configurações) para sincronizar.'); return; }
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    const u = store.usuarioAtual();
    const st = estadoSync();
    let recebidas = 0, enviadas = 0;
    try {
      await gravarJSON(nomeCadastro(u.id), store.usuarioParaPasta());
      const { arquivos } = await Arquivos.listarArquivos({ pasta: armazenamento().uri, subpasta: SUB_DADOS });
      // pasta trocada: recomeça (lê e envia tudo de novo)
      if (st.pasta !== armazenamento().uri) { st.pasta = armazenamento().uri; st.lidos = {}; st.enviados = {}; st.conteudo = {}; }
      // sincronização completa (botão 🔄): relê tudo, sem confiar no que já foi lido
      if (completa) st.lidos = {};
      st.conteudo ||= {};
      const naPasta = new Set(arquivos.map((a) => a.nome));
      st.nFichas = arquivos.filter((a) => ehFicha(a.nome)).length;
      const outros = await cadastrosDaPasta(arquivos, u.id);
      st.nCadastros = outros.length + 1;
      // outro cadastro seu (mesmo CRM): reconhece automaticamente se a senha for a mesma e traz as fichas dele
      S.cadastroParaUnificar = null;
      S.cadastroSenhaDiferente = null;
      let novosVinculos = 0;
      for (const c of outros.filter((x) => mesmoAnestesista(x, u) && !store.conheceCadastro(x.id))) {
        if (await store.vincularCadastro(c)) novosVinculos++;
        else S.cadastroSenhaDiferente ||= c;
      }
      if (novosVinculos) st.lidos = {}; // relê tudo para trazer as fichas desse cadastro
      for (const a of arquivos) {
        if (!ehFicha(a.nome) || st.lidos[a.nome] === a.modificado) continue;
        try {
          const rec = await lerJSON(a.nome);
          st.conteudo[a.nome] = { id: rec.id, minha: store.conheceCadastro(rec.userId), excluida: !!rec.excluida };
          if (await store.importarRegistro(rec, { conferir: completa })) recebidas++;
          st.lidos[a.nome] = a.modificado;
        } catch (e) { console.warn('sync: arquivo ignorado', a.nome, e); }
      }
      for (const rec of await store.registrosDoUsuario()) {
        // reenvia se mudou OU se o arquivo não está na pasta (apagado, pasta nova, etc.)
        if (st.enviados[rec.id] === rec.atualizadaEm && naPasta.has(nomeFicha(rec.id, u.id))) continue;
        await gravarJSON(nomeFicha(rec.id, u.id), rec);
        st.enviados[rec.id] = rec.atualizadaEm;
        enviadas++;
      }
      // contagem exata: ids únicos deste cadastro na pasta (sem excluídas, sem cópias repetidas)
      for (const nome of Object.keys(st.conteudo)) if (!naPasta.has(nome)) delete st.conteudo[nome];
      const idsPasta = new Set(Object.values(st.conteudo).filter((c) => c.minha && !c.excluida).map((c) => c.id));
      const fichasAqui = (await store.listarFichas()).map((f) => f.id);
      st.contagem = {
        pasta: idsPasta.size, aqui: fichasAqui.length,
        faltamAqui: [...idsPasta].filter((id) => !fichasAqui.includes(id)).length,
        faltamNaPasta: fichasAqui.filter((id) => !idsPasta.has(id) && !naPasta.has(nomeFicha(id, u.id))).length,
        // fichas de outro cadastro que ainda não existem aqui (cópias velhas de fichas que já temos não contam)
        deOutroCadastro: new Set(Object.values(st.conteudo).filter((c) => !c.minha && !c.excluida && !fichasAqui.includes(c.id)).map((c) => c.id)).size,
      };
      st.ultima = new Date().toISOString();
      st.erro = '';
      st.gravar();
      if (recebidas) {
        S.fichas = (await store.listarFichas()).map(normalizarFicha);
        if (S.f) S.f = S.fichas.find((x) => x.id === S.f.id) || S.f;
        if (!S.f && location.hash.startsWith('#/lista')) telaLista();
      }
      if (S.cadastroSenhaDiferente && !recebidas && !S.f && location.hash.startsWith('#/lista') && !$('#bvinc')) telaLista();
      if (!silencioso || recebidas) toast(`Sincronizado: ${recebidas} recebida(s), ${enviadas} enviada(s)`, 3500);
    } catch (e) {
      st.erro = `${dataHoraBR(new Date().toISOString())}: ${e.message}`; st.gravar();
      if (!silencioso) toast('Erro ao sincronizar: ' + e.message, 6000);
      console.warn('sync', e);
    } finally {
      sincronizando = null;
    }
  })();
  return sincronizando;
}

// rascunho excluído: avisa o outro aparelho com um "registro de exclusão"
async function sincronizarExclusao(id) {
  if (!syncAtivo()) return;
  try {
    await gravarJSON(nomeFicha(id, store.usuarioAtual().id), { id, userId: store.usuarioAtual().id, atualizadaEm: new Date().toISOString(), excluida: true });
  } catch (e) { console.warn('sync exclusão', e); }
}

let ultimaSync = 0;
function sincronizarDeVezEmQuando() {
  if (!syncAtivo() || Date.now() - ultimaSync < 20000) return;
  ultimaSync = Date.now();
  sincronizar();
}

async function entrar() {
  S.fichas = (await store.listarFichas()).map(normalizarFicha);
  go('#/lista');
  ultimaSync = Date.now();
  sincronizar();
}

// ---------------------------------------------------------------- lista
function telaLista() {
  const u = store.usuarioAtual();
  topbar(`<img src="icons/logo.png" alt=""><div class="ttl"><b>Minhas fichas</b><small>${esc(nomeUser(u))}</small></div>
    ${syncAtivo() ? '<button id="bsync" title="Sincronizar agora" aria-label="Sincronizar agora">🔄</button>' : ''}
    <button id="bcfg" title="Configurações" aria-label="Configurações">⚙️</button>`);
  $('#bcfg').onclick = () => go('#/config');
  $('#bsync')?.addEventListener('click', () => sincronizar({ silencioso: false, completa: true }));
  sincronizarDeVezEmQuando();
  const q = S.filtro.toLowerCase();
  const lista = S.fichas.filter((f) => !q || `${f.pac.nome} ${f.pac.hospital || ''} ${f.pac.convenio} ${f.pre.procedimento} ${f.pac.intervencoes.join(' ')}`.toLowerCase().includes(q));
  const rotulo = { rascunho: 'Em andamento', finalizada: 'Finalizada', revisao: 'Em revisão' };
  const semPasta = NATIVO && !armazenamento().uri && !armazenamento().modo;
  const venc = S.licenca?.e ? Math.ceil((new Date(S.licenca.e + 'T23:59') - new Date()) / 86400000) : null;
  const avisoVenc = venc !== null && venc <= 10
    ? `<div class="note warn">⏳ Seu acesso vence em <b>${venc} dia(s)</b> (${dataBR(S.licenca.e)}). Peça um novo código ao responsável.</div>` : '';
  const outroCad = S.cadastroSenhaDiferente;
  $('#app').innerHTML = `${avisoVenc}${blocoInstalar()}${outroCad ? `<div class="note warn">📱 <b>Há fichas do seu outro cadastro</b> (${esc(nomeUser(outroCad))}, criado em ${dataHoraBR(outroCad.criadoEm)}) que não abrem neste aparelho.
      <div style="margin-top:8px"><button class="btn pri" id="bvinc">Trazer essas fichas</button></div></div>` : ''}${semPasta ? `<div class="note warn">📁 Escolha onde salvar os PDFs das fichas (celular ou nuvem). <button class="btn" id="birpasta" style="margin-top:6px">Configurar agora</button></div>` : ''}
    <div class="toolbar">
      <input type="search" id="busca" placeholder="Buscar paciente, procedimento…" value="${esc(S.filtro)}">
      <button class="btn pri big" id="bnova">＋ Nova ficha</button>
    </div>
    <div class="lista">
      ${lista.map((f) => `<button class="item" data-id="${f.id}">
          <div class="main"><b>${esc(f.pac.nome || '(paciente sem nome)')}</b>
          <div class="sub">${dataBR(f.pac.data)}${f.pac.hospital ? ' · ' + esc(f.pac.hospital) : ''} · ${esc(f.pac.intervencoes[0] || f.pre.procedimento || 'procedimento não informado')}${f.pac.convenio ? ' · ' + esc(f.pac.convenio) : ''}</div></div>
          <span class="badge ${f.status}">${rotulo[f.status]}</span></button>`).join('')
        || `<div class="card muted">${S.fichas.length ? 'Nenhuma ficha encontrada.' : 'Nenhuma ficha ainda. Toque em “Nova ficha” para começar.'}</div>`}
    </div>`;
  ligarInstalar();
  $('#birpasta')?.addEventListener('click', () => go('#/config'));
  $('#bvinc')?.addEventListener('click', () => vincularOutroCadastro(outroCad));
  $('#busca').oninput = (e) => { S.filtro = e.target.value; const p = e.target.selectionStart; telaLista(); const b = $('#busca'); b.focus(); b.setSelectionRange(p, p); };
  $('#bnova').onclick = async () => {
    const f = novaFicha(store.usuarioAtual());
    S.fichas.unshift(f);
    S.f = f;
    await salvarAgora();
    go(`#/ficha/${f.id}/pac`);
  };
  $$('.item').forEach((b) => (b.onclick = () => {
    const f = S.fichas.find((x) => x.id === b.dataset.id);
    const aba = f.status === 'finalizada' ? 'fim' : f.tempos.inicioAnest && !f.tempos.fimAnest ? 'intra' : 'pac';
    go(`#/ficha/${b.dataset.id}/${aba}`);
  }));
}

// ---------------------------------------------------------------- ficha
function telaFicha() {
  const f = S.f;
  const rotulo = { rascunho: 'Em andamento', finalizada: 'Finalizada 🔒', revisao: 'Em revisão' };
  topbar(`<button id="bvolta" aria-label="Voltar">←</button>
    <div class="ttl"><b>${esc(f.pac.nome || 'Nova ficha')}</b><small>${rotulo[f.status]} · <span id="saved"></span></small></div>`);
  $('#bvolta').onclick = () => go('#/lista');
  const tabs = $('#tabs');
  tabs.hidden = false;
  tabs.innerHTML = ABAS.map(([k, ic, l]) => `<button data-k="${k}" aria-current="${k === S.aba}"><span class="ic">${ic}</span>${l}</button>`).join('');
  $$('button', tabs).forEach((b) => (b.onclick = () => go(`#/ficha/${f.id}/${b.dataset.k}`)));

  const app = $('#app');
  const aviso = bloqueada()
    ? `<p class="note">🔒 Ficha finalizada — somente leitura. Para corrigir, use “Editar com senha” na aba Finalizar.</p>`
    : f.status === 'revisao' ? `<p class="note bad">✏️ Editando ficha já finalizada. Ao terminar, conclua a revisão na aba Finalizar — as alterações ficam registradas.</p>` : '';
  const telas = { pac: abaPaciente, pre: abaPre, intra: abaIntra, tec: abaTecnica, srpa: abaSrpa, fim: abaFim };
  app.innerHTML = aviso + telas[S.aba]();
  bind(app);
  window.scrollTo(0, 0);
  if (S.aba === 'intra') iniciarIntra();
  if (S.aba === 'fim') ligarFim();
}

// ----- ligação dos campos (data-f="caminho.no.objeto")
function bind(root) {
  const lock = bloqueada();
  $$('[data-f]', root).forEach((el) => {
    const path = el.dataset.f;
    const val = getP(S.f, path);
    if (el.classList.contains('chips')) {
      $$('button', el).forEach((b) => {
        b.type = 'button';
        b.disabled = lock;
        b.setAttribute('aria-pressed', String(val !== '' && val != null && String(val) === b.dataset.v));
        b.onclick = () => {
          const nv = String(getP(S.f, path) ?? '') === b.dataset.v ? '' : b.dataset.v;
          setP(S.f, path, nv);
          $$('button', el).forEach((x) => x.setAttribute('aria-pressed', String(nv !== '' && x.dataset.v === nv)));
          mudou(path);
        };
      });
    } else if (el.type === 'checkbox') {
      el.checked = !!val;
      el.disabled = lock;
      el.onchange = () => { setP(S.f, path, el.checked); mudou(path); };
    } else {
      el.value = val ?? '';
      el.disabled = lock;
      el.oninput = () => { setP(S.f, path, el.value); mudou(path); };
    }
  });
  if (lock) $$('.lock-hide', root).forEach((e) => (e.hidden = true));
}

function mudou(path) {
  agendarSalvar();
  if (path === 'pac.nascimento' && S.f.pac.nascimento) {
    const n = new Date(S.f.pac.nascimento + 'T12:00'), ref = new Date((S.f.pac.data || hojeLocal()) + 'T12:00');
    let anos = ref.getFullYear() - n.getFullYear();
    if (ref < new Date(ref.getFullYear(), n.getMonth(), n.getDate(), 12)) anos--;
    if (anos >= 0) { S.f.pac.idade = String(anos); const el = $('[data-f="pac.idade"]'); if (el) el.value = anos; }
  }
  // CRM já conhecido: completa o nome do cirurgião
  if (path === 'pac.cirurgiaoCrm') {
    const nome = crmsConhecidos().find(([crm]) => soDigitos(crm) && soDigitos(crm) === soDigitos(S.f.pac.cirurgiaoCrm))?.[1];
    if (nome && S.f.pac.cirurgiao !== nome) { S.f.pac.cirurgiao = nome; const el = $('[data-f="pac.cirurgiao"]'); if (el) el.value = nome; }
  }
  // cirurgião já conhecido: completa o CRM com o usado da última vez
  if (path === 'pac.cirurgiao' && !S.f.pac.cirurgiaoCrm) {
    const crm = crmDoCirurgiao(S.f.pac.cirurgiao);
    if (crm) { S.f.pac.cirurgiaoCrm = crm; const el = $('[data-f="pac.cirurgiaoCrm"]'); if (el) el.value = crm; }
  }
  if (path === 'pac.nome') { const b = $('.topbar .ttl b'); if (b) b.textContent = S.f.pac.nome || 'Nova ficha'; }
  $$('[data-calc]').forEach((el) => {
    const [tipo, arg] = el.dataset.calc.split(':');
    if (tipo === 'ald') el.textContent = aldreteTotal(S.f, arg) === '' ? '–' : aldreteTotal(S.f, arg);
    if (tipo === 'imc') el.textContent = imc(S.f) ? num(imc(S.f)) : '–';
  });
}

// helpers de formulário
const inp = (path, label, o = {}) => `<label class="f ${o.cls || ''}">${label}<input type="${o.type || 'text'}" data-f="${path}" ${o.im ? `inputmode="${o.im}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.list ? `list="${o.list}"` : ''} autocomplete="off"></label>`;
const naoSeAplica = (path) => `<label class="chk na"><input type="checkbox" data-f="${path}">Não se aplica</label>`;
const chk = (path, label) => `<label class="chk"><input type="checkbox" data-f="${path}">${label}</label>`;
const chips = (path, opts) => `<div class="chips" data-f="${path}">${opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<button data-v="${esc(v)}">${esc(l)}</button>`; }).join('')}</div>`;
const linha = (label, html) => `<div class="row-l"><span class="lbl">${label}</span>${html}</div>`;
const card = (titulo, html) => `<section class="card"><h2>${titulo}</h2>${html}</section>`;
const SN = ['Sim', 'Não'];

// Nomes de cirurgiões e auxiliares já usados nas fichas (para sugerir ao digitar).
function nomesEquipe() {
  const nomes = new Set();
  for (const f of S.fichas) for (const n of [f.pac.cirurgiao, f.pac.aux1, f.pac.aux2]) if (n?.trim()) nomes.add(n.trim());
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt'));
}

// CRMs de cirurgiões já usados, com o nome mais recente de cada um: [[crm, nome], ...]
function crmsConhecidos() {
  const mapa = new Map();
  [...S.fichas].filter((x) => x.id !== S.f?.id && x.pac.cirurgiaoCrm?.trim() && x.pac.cirurgiao?.trim())
    .sort((a, b) => (a.atualizadaEm > b.atualizadaEm ? 1 : -1))
    .forEach((x) => mapa.set(soDigitos(x.pac.cirurgiaoCrm) || x.pac.cirurgiaoCrm.trim(), [x.pac.cirurgiaoCrm.trim(), x.pac.cirurgiao.trim()]));
  return [...mapa.values()].sort((a, b) => a[1].localeCompare(b[1], 'pt'));
}

function crmDoCirurgiao(nome) {
  const n = String(nome || '').trim().toLowerCase();
  if (!n) return '';
  const f = [...S.fichas].filter((x) => x.id !== S.f?.id && x.pac.cirurgiao?.trim().toLowerCase() === n && x.pac.cirurgiaoCrm)
    .sort((a, b) => (a.atualizadaEm > b.atualizadaEm ? -1 : 1))[0];
  return f ? f.pac.cirurgiaoCrm : '';
}

function abaPaciente() {
  const f = S.f;
  return card('Paciente', `<div class="grid">
      ${inp('pac.nome', 'Nome', { cls: 'full' })}
      ${inp('pac.hospital', 'Hospital', { cls: 'full', list: 'hospitais' })}
      <datalist id="hospitais">${[...new Set(S.fichas.map((x) => x.pac.hospital).filter(Boolean))].sort().map((h) => `<option value="${esc(h)}">`).join('')}</datalist>
      ${inp('pac.nascimento', 'Data de nascimento', { type: 'date' })}
      ${inp('pac.idade', 'Idade', { im: 'numeric' })}
      ${inp('pac.data', 'Data da cirurgia', { type: 'date' })}
      ${inp('pac.peso', 'Peso (kg)', { im: 'decimal' })}
      ${inp('pac.altura', 'Altura (cm)', { im: 'numeric' })}
      <label class="f">IMC (kg/m²)<span class="calc" data-calc="imc">${imc(f) ? num(imc(f)) : '–'}</span></label>
      ${inp('pac.jejum', 'Jejum (h)', { im: 'decimal' })}
      ${inp('pac.convenio', 'Convênio')}
      ${inp('pac.matricula', 'Matrícula')}
    </div>
    ${linha('Sexo', chips('pac.sexo', [['F', 'Feminino'], ['M', 'Masculino']]))}
    ${linha('Caráter', chips('pac.carater', ['Eletivo', 'Urgência', 'Emergência']))}`)
  + card('Equipe', `<div class="grid">
      <label class="f span2">Anestesiologista<input type="text" value="${esc(`${f.anestesista.nome} — CRM ${f.anestesista.crm}/${f.anestesista.uf}`)}" disabled></label>
      ${inp('pac.cirurgiao', 'Cirurgião', { cls: 'span2', list: 'cirurgioes' })}
      <datalist id="cirurgioes">${nomesEquipe().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      ${inp('pac.cirurgiaoCrm', 'CRM do cirurgião', { im: 'numeric', list: 'crms' })}
      <datalist id="crms">${crmsConhecidos().map(([crm, nome]) => `<option value="${esc(crm)}" label="${esc(nome)}">${esc(nome)}</option>`).join('')}</datalist>
      ${inp('pac.aux1', '1º Auxiliar', { list: 'cirurgioes' })}
      ${inp('pac.aux2', '2º Auxiliar', { list: 'cirurgioes' })}
    </div>`)
  + card('Intervenção cirúrgica realizada', `<div class="grid g2">
      ${[0, 1, 2, 3, 4].map((i) => inp(`pac.intervencoes.${i}`, `${i + 1}.`)).join('')}</div>`);
}

function abaPre() {
  const p = S.f.pre;
  const marcados = (k, itens) => itens.filter(([ik]) => p.itens[`${k}_${ik}`]).length + (p.outros[k] ? 1 : 0);
  const extras = {
    cardio: inp('pre.toleranciaExercicio', 'Tolerância ao exercício', { cls: 'span2', ph: 'ex.: sobe 2 lances de escada' }),
    endocrino: inp('pre.diabetesTipo', 'Diabetes tipo', { im: 'numeric' }),
    habitos: inp('pre.cigarros', 'Cigarros/dia', { im: 'numeric' }),
  };
  const grupos = PRE_GRUPOS.map(([k, titulo, itens]) => {
    const n = marcados(k, itens);
    return `<details class="card sis" ${n ? 'open' : ''}>
      <summary><b>${titulo}</b><span class="sis-st">${n ? `${n} marcado(s)` : p.negativos[k] ? 'Negativo' : ''}</span></summary>
      <label class="chk na"><input type="checkbox" data-f="pre.negativos.${k}">Negativo</label>
      <div class="checks">${itens.map(([ik, il]) => chk(`pre.itens.${k}_${ik}`, il)).join('')}</div>
      <div class="grid" style="margin-top:8px">${extras[k] || ''}${inp(`pre.outros.${k}`, 'Outras', { cls: 'span2' })}</div>
    </details>`;
  }).join('');
  return card('Avaliação pré-anestésica', `<div class="grid">
      ${inp('pre.dataAval', 'Data da avaliação', { type: 'date' })}${inp('pre.horaAval', 'Hora', { type: 'time' })}
      ${inp('pre.diagnostico', 'Diagnóstico pré-operatório', { cls: 'span2' })}
      ${inp('pre.procedimento', 'Cirurgia / procedimento proposto', { cls: 'span2' })}</div>`)
  + card('Sinais e jejum', `<div class="grid">
      ${inp('pac.peso', 'Peso (kg)', { im: 'decimal' })}${inp('pac.altura', 'Altura (cm)', { im: 'numeric' })}
      <label class="f">IMC<span class="calc" data-calc="imc">${imc(S.f) ? num(imc(S.f)) : '–'}</span></label>
      ${inp('pre.pa', 'PA (mmHg)', { ph: '120/80' })}${inp('pre.fc', 'FC (bpm)', { im: 'numeric' })}
      ${inp('pre.temp', 'Temp. (°C)', { im: 'decimal' })}${inp('pre.fr', 'FR (irpm)', { im: 'numeric' })}
      ${inp('pre.jejumSolidos', 'Jejum sólidos (h)', { im: 'decimal' })}${inp('pre.jejumLiquidos', 'Jejum líquidos (h)', { im: 'decimal' })}
      ${inp('pre.dor', 'Dor (escala)', { im: 'numeric', ph: '0–10' })}</div>
      ${linha('Escala de dor', chips('pre.dorEscala', [['Adulto', 'Adulto 0–10'], ['Criança', 'Criança (faces) 0–5']]))}`)
  + `<p class="muted small" style="margin:4px 2px 10px">Sistemas: toque em “Negativo” ou abra o sistema para marcar os achados.</p>`
  + `<div class="cols2"><div>${grupos}</div><div>`
  + card('Câncer', `${chips('pre.cancer', ['Negativo', 'Positivo'])}
      <div class="grid" style="margin-top:8px">${inp('pre.cancerLocal', 'Local', { cls: 'span2' })}</div>
      <div class="checks" style="margin-top:8px">${chk('pre.qt', 'Quimioterapia')}${chk('pre.rt', 'Radioterapia')}</div>`)
  + (S.f.pac.sexo !== 'M' ? card('Gravidez', `${chips('pre.gravidez', ['Negativo', 'Positivo'])}
      <div class="grid" style="margin-top:8px">${inp('pre.igSemanas', 'Idade gestacional (sem.)', { im: 'numeric' })}${inp('pre.dum', 'DUM', { type: 'date' })}</div>`) : '')
  + card('Outras comorbidades', `<textarea data-f="pre.outrosGeral" rows="2" placeholder="Hematológicas, músculo-esqueléticas e outras"></textarea>`)
  + card('Históricos', `${linha('Náuseas / vômitos pós-op.', chips('pre.nvpo', SN))}
      ${linha('Familiar de problemas anestésicos', chips('pre.histFamiliar', SN))}`)
  + `</div></div>`
  + `<div class="cols2"><div>`
  + card('Alergias', `<label class="chk na"><input type="checkbox" data-f="pre.alergiaNeg">Negativo</label>
      ${[0, 1, 2].map((i) => `<div class="grid">${inp(`pre.alergias.${i}.agente`, `${i + 1}. Tipo / agente`)}${inp(`pre.alergias.${i}.reacao`, 'Reação')}</div>`).join('')}`)
  + card('Cirurgia / anestesia prévia', `<label class="chk na"><input type="checkbox" data-f="pre.previaNeg">Negativo</label>
      ${[0, 1, 2].map((i) => `<div class="grid">${inp(`pre.previas.${i}.cirurgia`, `${i + 1}. Cirurgia`)}${inp(`pre.previas.${i}.anestesia`, 'Anestesia')}${inp(`pre.previas.${i}.dados`, 'Dados relevantes', { cls: 'span2' })}</div>`).join('')}`)
  + `</div><div>`
  + card('Medicação em uso', [...Array(N_MEDICAMENTOS).keys()].map((i) => `<div class="grid med">
      ${inp(`pre.medicamentos.${i}.nome`, `${i + 1}. Medicação`)}${inp(`pre.medicamentos.${i}.dose`, 'Dose diária')}
      <label class="f">Últimas 24 h?${chips(`pre.medicamentos.${i}.ult24`, SN)}</label></div>`).join(''))
  + `</div></div>`
  + `<div class="cols2"><div>`
  + card('Via aérea', `${linha('História de via aérea difícil', chips('pre.vad', SN))}
      ${linha('Pescoço', chips('pre.pescoco', ['Normal', ['Largo', 'Largo (>40 cm)'], 'Curto']))}
      ${linha('Protrusão da mandíbula normal', chips('pre.protrusao', SN))}
      ${linha('Flexão / extensão do pescoço', chips('pre.flexao', ['Normal', 'Limitada']))}
      ${linha('Previsão de via aérea difícil', chips('pre.previsaoVad', SN))}
      ${linha('Mallampati', chips('pre.mallampati', ['I', 'II', 'III', 'IV']))}
      <div class="grid g2">${inp('pre.viaOutros', 'Outros')}</div>`)
  + card('Exame físico', `<div class="grid g2">${inp('pre.exame.cardiaco', 'Cardíaco')}${inp('pre.exame.resp', 'Respiratório')}
      ${inp('pre.exame.neuro', 'Neurológico')}${inp('pre.exame.regional', 'Regional')}${inp('pre.exame.outro', 'Outro')}</div>`)
  + card('Exames pré-operatórios', `<div class="grid">${[0, 1, 2, 3, 4, 5].map((i) => inp(`pre.examesPre.${i}`, '', { ph: 'ex.: Hb 12,5' })).join('')}</div>`)
  + `</div><div>`
  + card('Estado físico ASA', `${linha('ASA', chips('pre.asa', [['I', 'P1'], ['II', 'P2'], ['III', 'P3'], ['IV', 'P4'], ['V', 'P5']]))}
      ${linha('Emergência', chips('pre.emergencia', SN))}`)
  + card('Planejamento anestésico', `<div class="grid g2">${inp('pre.tecProposta', 'Técnica proposta')}${inp('pre.tecAlternativa', 'Técnica alternativa')}</div>`)
  + card('Reserva de sangue / hemocomponentes', `${chips('pre.reservaSangue', SN)}
      <div class="grid" style="margin-top:8px">${inp('pre.hemo.ch', 'Conc. hemácias (U)', { im: 'numeric' })}${inp('pre.hemo.plaq', 'Conc. plaquetas (U)', { im: 'numeric' })}
      ${inp('pre.hemo.plasma', 'Plasma fresco (U)', { im: 'numeric' })}${inp('pre.hemo.crio', 'Crioprecipitado (U)', { im: 'numeric' })}</div>`)
  + card('Conclusão', `${linha('UTI', chips('pre.uti', SN))}
      <div class="grid g2">${inp('pre.outraEspecialidade', 'Avaliação de outra especialidade')}</div>
      ${linha('Liberado para cirurgia', chips('pre.liberado', SN))}
      <label class="f">Comentários sobre os achados<textarea data-f="pre.comentarios" rows="2"></textarea></label>`)
  + `</div></div>`;
}

// Cartões de anestesia, ventilação e acesso venoso (obrigatórios para finalizar).
function cardsObrigatorios() {
  return ''
  + card('Tipo de anestesia *', `${naoSeAplica('anest.na')}<div class="checks">
      ${chk('anest.geral', '<b>Geral</b>')}${chk('anest.geralIV', 'Geral IV')}${chk('anest.geralInal', 'Geral inalatória')}${chk('anest.geralBal', 'Geral balanceada')}
      ${chk('anest.sedacao', '<b>Sedação</b>')}${chk('anest.local', 'Local')}${chk('anest.locoregional', 'Locorregional')}
      ${chk('anest.peridural', 'Peridural')}${chk('anest.cateter', 'Peridural c/ cateter')}${chk('anest.subaracnoidea', 'Subaracnóidea')}
      ${chk('anest.bloqueio', 'Bloqueio')}${chk('anest.estimulador', 'Bloqueio c/ estimulador')}</div>
      <div class="grid" style="margin-top:10px">
      ${inp('anest.o2', 'O₂ (l/min)', { im: 'decimal' })}${inp('anest.cateterNum', 'Cateter nº')}
      ${inp('anest.agulha', 'Agulha', { ph: 'ex.: Quincke 27G' })}${inp('anest.localNeuro', 'Local (neuroeixo)', { ph: 'ex.: L3-L4' })}
      ${inp('anest.localBloq', 'Local do bloqueio', { cls: 'span2' })}</div>
      ${linha('Intercorrências', chips('anest.interc', SN))}
      <div class="grid g2">${inp('anest.intercDesc', 'Descrição da intercorrência')}</div>`)
  + card('Ventilação / via aérea *', `${naoSeAplica('vent.na')}<div class="checks">
      ${chk('vent.espontanea', 'Ventilação espontânea')}${chk('vent.vcm', 'VCM')}${chk('vent.vcv', 'VCV')}${chk('vent.pcv', 'PCV')}
      ${chk('vent.mascFacial', 'Máscara facial')}${chk('vent.mascLaringea', 'Máscara laríngea')}</div>
      <div class="grid" style="margin-top:10px">${inp('vent.mlNum', 'Máscara laríngea nº', { im: 'decimal' })}${inp('vent.tuboNum', 'Tubo nº', { im: 'decimal' })}</div>
      ${linha('Intubação', chips('vent.intubacao', ['Orotraqueal', 'Nasotraqueal']))}
      ${linha('Dificuldade', chips('vent.dificuldade', ['Fácil', 'Difícil']))}
      ${linha('Intercorrências', chips('vent.interc', SN))}
      <div class="grid g2">${inp('vent.intercDesc', 'Descrição da intercorrência')}</div>`)
  + card('Acesso venoso / MPA *', `${naoSeAplica('acesso.na')}<div class="grid">
      ${inp('acesso.perifNum', 'Periférico nº', { ph: 'ex.: 18G' })}${inp('acesso.local', 'Local', { ph: 'ex.: MSE' })}
      ${inp('acesso.centralVia', 'Central — via')}${inp('acesso.mpa', 'MPA')}</div>
      ${linha('Intercorrências', chips('acesso.interc', SN))}`);
}

function abaTecnica() {
  const calc = calcBalanco(S.f);
  return `<div class="cols2"><div>`
  + cardsObrigatorios()
  + `</div><div>`
  + card('Monitorização', `<div class="checks">${MONITORIZACAO.map(([k, l]) => chk(`monit.${k}`, l)).join('')}</div>`)
  + card('Equipamentos / materiais', `<div class="checks">${EQUIPAMENTOS.map(([k, l]) => chk(`equip.${k}`, l)).join('')}</div>`)
  + card('Balanço hídrico (ml)', `<p class="small muted">Campos vazios usam o valor calculado pela linha do tempo (mostrado em cinza).</p><div class="grid">
      ${inp('balanco.diurese', 'Diurese', { im: 'numeric' })}
      ${inp('balanco.cristaloide', 'Cristaloide', { im: 'numeric', ph: String(calc.cristaloide || '') })}
      ${inp('balanco.coloide', 'Coloide', { im: 'numeric', ph: String(calc.coloide || '') })}
      ${inp('balanco.perdas', 'Perdas', { im: 'numeric', ph: 'diurese' })}
      ${inp('balanco.ganhos', 'Ganhos', { im: 'numeric', ph: String(calc.ganhos || '') })}</div>
      ${calc.hemo ? `<p class="small">Hemoderivados: ${calc.hemo} ml (incluídos nos ganhos)</p>` : ''}`)
  + card('Encaminhamento', `${linha('Estado', chips('saida.estado', ['Acordado', 'Sonolento', 'Intubado', 'Óbito']))}
      ${linha('Destino', chips('saida.destino', ['RPA', 'Leito', 'UTI', 'Ambulatorial']))}`)
  + card('Exames laboratoriais (intraoperatório)', `<div class="grid">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => inp(`labs.${i}`, '', { ph: 'ex.: gaso, glicemia' })).join('')}</div>`)
  + `</div></div>`;
}

function abaSrpa() {
  const vit = (p) => `<div class="grid">
      ${inp(`srpa.${p}Hora`, 'Hora', { type: 'time' })}${inp(`srpa.${p}Pas`, 'PAS', { im: 'numeric' })}${inp(`srpa.${p}Pad`, 'PAD', { im: 'numeric' })}
      ${inp(`srpa.${p}Fc`, 'FC (bpm)', { im: 'numeric' })}${inp(`srpa.${p}Spo2`, 'SpO₂ (%)', { im: 'numeric' })}</div>`;
  const ald = ALDRETE_TEMPOS.map(([tk, tl]) => `<details class="card ald-tempo" ${tk === 'entrada' ? 'open' : ''}>
      <summary><b>${tl}</b> — total: <span class="ald-tot" data-calc="ald:${tk}">${aldreteTotal(S.f, tk) === '' ? '–' : aldreteTotal(S.f, tk)}</span></summary>
      ${ALDRETE.map(([k, titulo, ops]) => `<div style="margin-top:10px"><div class="small muted">${titulo}</div>
        ${chips(`srpa.aldrete.${tk}.${k}`, [2, 1, 0].map((s) => [String(s), `${s} · ${ops[s]}`]))}</div>`).join('')}
    </details>`).join('');
  const an = S.f.anestesista;
  return card('Médico responsável pela SRPA', `${chips('srpa.medicoOutro', [['Não', `O mesmo anestesista (${an.nome})`], ['Sim', 'Outro médico']])}
      <div class="grid" style="margin-top:8px">${inp('srpa.medicoNome', 'Nome do médico da SRPA', { cls: 'span2' })}${inp('srpa.medicoCrm', 'CRM/UF', { ph: 'ex.: 12345/SP' })}</div>
      <p class="small muted">Preencha nome e CRM só quando a SRPA ficar com outro médico.</p>`)
  + card('Admissão na SRPA', vit('adm'))
  + `<h2 style="font-size:16px;color:var(--pri);margin:4px 2px 10px">Escala de Aldrete e Kroulik</h2>${ald}`
  + card('Prescrição médica', [0, 1, 2].map((i) => `<div class="grid" style="margin-bottom:8px">
      ${inp(`srpa.prescricao.${i}.item`, `${i + 1}. Item`, { cls: 'span2' })}${inp(`srpa.prescricao.${i}.quant`, 'Quant.')}${inp(`srpa.prescricao.${i}.horario`, 'Horário')}</div>`).join(''))
  + card('Intercorrências', `<textarea data-f="srpa.intercorrencias" rows="3"></textarea>`)
  + card('Alta da SRPA', vit('alta') + linha('Encaminhado', chips('srpa.encaminhado', ['APT', 'UTI', 'Residência'])));
}

// ---------------------------------------------------------------- intraoperatório
const TEMPOS = [['inicioAnest', 'Início anestesia'], ['inicioCir', 'Início cirurgia'], ['fimCir', 'Fim cirurgia'], ['fimAnest', 'Fim anestesia']];

function abaIntra() {
  const lock = bloqueada();
  return `<section class="card">
      <div class="clock"><span class="h" id="relogio">${agoraHM()}</span><span class="muted" id="duracao"></span></div>
      <div class="tempos">${TEMPOS.map(([k, l]) => `<button class="tempo ${S.f.tempos[k] ? 'set' : ''}" data-t="${k}" ${lock ? 'disabled' : ''}>
        <small>${l}</small><b>${S.f.tempos[k] ? hhmm(S.f.tempos[k]) : 'tocar'}</b></button>`).join('')}</div>
    </section>
    ${lock ? '' : `<section class="card"><div class="acoes">
      <button class="btn pri" data-a="sv"><span class="ic">❤️</span>Sinais vitais</button>
      <button class="btn" data-a="dr"><span class="ic">💉</span>Droga (bolus)</button>
      <button class="btn" data-a="in"><span class="ic">⏳</span>Infusão / Gás</button>
      <button class="btn" data-a="fl"><span class="ic">💧</span>Fluido / sangue</button>
      <button class="btn" data-a="eo"><span class="ic">📝</span>Evento</button>
    </div><div class="alerta-sv" id="ultsv"></div></section>`}
    <section class="card" id="emcurso" hidden><h2>Infusões e gases em curso</h2><div class="tl" id="infs"></div></section>
    <section class="card"><h2>Situações especiais / observações</h2>
      <textarea data-f="anotacoes" rows="3" placeholder="Recebimento do paciente, alterações não planejadas, intercorrências…"></textarea></section>
    <section class="card"><h2>Gráfico</h2><div id="grafico"></div>
      <div class="leg"><span class="pas">PAS</span><span class="pad">PAD</span><span class="fc">FC</span></div></section>
    <section class="card"><h2>Linha do tempo</h2><div class="tl" id="tl"></div></section>`;
}

function iniciarIntra() {
  $$('[data-t]').forEach((b) => (b.onclick = () => marcarTempo(b.dataset.t)));
  $$('[data-a]').forEach((b) => (b.onclick = () => ({ sv: dlgVitais, dr: dlgDroga, in: dlgInfusao, fl: dlgFluido, eo: dlgEvento })[b.dataset.a]()));
  desenharIntra();
  const tick = () => {
    const r = $('#relogio');
    if (!r) return;
    const d = new Date();
    r.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const ini = S.f.tempos.inicioAnest && new Date(S.f.tempos.inicioAnest);
    if (ini) {
      const fim = S.f.tempos.fimAnest ? new Date(S.f.tempos.fimAnest) : d;
      const m = Math.max(0, Math.round((fim - ini) / 60000));
      $('#duracao').textContent = `Anestesia: ${Math.floor(m / 60)}h${pad(m % 60)}`;
    }
    const u = $('#ultsv');
    if (u) {
      const ult = [...S.f.vitais].sort((a, b) => (a.t > b.t ? -1 : 1))[0];
      if (!ult) u.textContent = 'Nenhum sinal vital registrado.';
      else {
        const min = Math.max(0, Math.floor((d - new Date(ult.t)) / 60000));
        u.textContent = `Último registro de sinais vitais: há ${min} min (${hhmm(ult.t)})`;
        u.classList.toggle('late', min >= 5 && !S.f.tempos.fimAnest);
      }
    }
  };
  tick();
  S.timer = setInterval(tick, 1000);
  // mantém a tela acesa durante o ato anestésico
  if ('wakeLock' in navigator && !bloqueada()) navigator.wakeLock.request('screen').then((w) => (S.wake = w)).catch(() => {});
}

function desenharIntra() {
  const g = $('#grafico');
  g.innerHTML = svgGrafico(S.f, g.clientWidth);
  desenharEmCurso();
  const f = S.f;
  const itens = [
    ...f.vitais.map((x) => ({ ...x, k: 'sv', txt: [x.pas || x.pad ? `PA ${x.pas || '–'}/${x.pad || '–'}` : '', x.fc ? `FC ${x.fc}` : '', x.spo2 ? `SpO₂ ${x.spo2}%` : '', x.etco2 ? `EtCO₂ ${x.etco2}` : '', x.temp ? `T ${num(x.temp)}°C` : '', x.ritmo].filter(Boolean).join(' · '), cat: 'Sinais vitais' })),
    ...f.drogas.map((x) => ({ ...x, k: 'dr', txt: `${x.nome} ${num(x.dose)} ${x.unid} ${x.via}`, cat: 'Droga' })),
    ...f.fluidos.map((x) => ({ ...x, k: 'fl', txt: `${x.nome} ${x.vol} ml`, cat: x.tipo })),
    ...f.eventos.map((x) => ({ ...x, k: 'eo', txt: x.texto, cat: 'Evento' })),
    ...f.infusoes.flatMap((x) => [
      ...x.etapas.map((e, i) => ({ id: x.id, t: e.t, k: 'in', cat: x.gas ? 'Gás' : x.tci ? 'Infusão TCI' : 'Infusão contínua',
        txt: `${x.nome} ${i ? '→ ' : ''}${num(e.valor)} ${x.tci || x.unid}${i ? '' : ' (início)'}` })),
      ...(x.fim ? [{ id: x.id, t: x.fim, k: 'in', cat: 'Fim de infusão', txt: `${x.nome} — parada${textoTotal(x)}` }] : []),
    ]),
  ].sort((a, b) => (a.t > b.t ? -1 : 1));
  const lock = bloqueada();
  $('#tl').innerHTML = itens.map((i) => `<div class="ev ${i.k}"><span class="t">${hhmm(i.t)}</span>
      <span><span class="k">${esc(i.cat)}</span>${esc(i.txt)}</span>
      <span>${lock ? '' : `<button data-ed="${i.k}:${i.id}" aria-label="Editar">✏️</button><button data-del="${i.k}:${i.id}" aria-label="Excluir">🗑️</button>`}</span></div>`).join('')
    || '<p class="muted">Nada registrado ainda. Use os botões acima — o horário é preenchido automaticamente.</p>';
  const col = { sv: 'vitais', dr: 'drogas', fl: 'fluidos', eo: 'eventos', in: 'infusoes' };
  $$('[data-ed]').forEach((b) => (b.onclick = () => {
    const [k, id] = b.dataset.ed.split(':');
    const item = S.f[col[k]].find((x) => x.id === id);
    ({ sv: dlgVitais, dr: dlgDroga, fl: dlgFluido, eo: dlgEvento, in: dlgEditarInfusao })[k](item);
  }));
  $$('[data-del]').forEach((b) => (b.onclick = async () => {
    const [k, id] = b.dataset.del.split(':');
    if (!(await confirmar('Excluir registro', k === 'in' ? 'Excluir esta infusão inteira (início, mudanças de dose e fim)?' : 'Excluir este registro da linha do tempo?', 'Excluir', 'bad'))) return;
    S.f[col[k]] = S.f[col[k]].filter((x) => x.id !== id);
    agendarSalvar();
    desenharIntra();
  }));
}

const textoTotal = (inf) => {
  const t = totalInfusao(inf, S.f.pac.peso);
  return t ? ` · total ${num(t.valor)} ${t.unid}` : '';
};

function desenharEmCurso() {
  const box = $('#emcurso');
  if (!box) return;
  const ativas = S.f.infusoes.filter((x) => !x.fim);
  box.hidden = !ativas.length;
  const semPeso = !(+normNumero(S.f.pac.peso));
  $('#infs').innerHTML = ativas.map((x) => {
    const e = x.etapas.at(-1);
    return `<div class="ev in"><span class="t">${hhmm(x.etapas[0].t)}</span>
      <span><span class="k">${x.gas ? 'Gás' : x.tci ? 'TCI' : 'Infusão contínua'} · desde ${hhmm(x.etapas[0].t)}${x.etapas.length > 1 ? ` · dose atual desde ${hhmm(e.t)}` : ''}</span>
      <b>${esc(x.nome)} ${num(e.valor)} ${esc(x.tci || x.unid)}</b>${esc(textoTotal(x))}
      ${x.unid.includes('/kg/') && semPeso && !x.tci ? '<br><span class="small" style="color:var(--warn)">Informe o peso (aba Paciente) para calcular o total.</span>' : ''}</span>
      <span class="inf-bts"><button class="btn" data-alt="${x.id}">Alterar</button><button class="btn bad" data-par="${x.id}">Parar</button></span></div>`;
  }).join('');
  $$('[data-alt]').forEach((b) => (b.onclick = () => dlgAlterarInfusao(S.f.infusoes.find((x) => x.id === b.dataset.alt))));
  $$('[data-par]').forEach((b) => (b.onclick = () => dlgPararInfusao(S.f.infusoes.find((x) => x.id === b.dataset.par))));
}

async function dlgInfusao() {
  const r = await modal({
    title: 'Infusão contínua / gás',
    body: `<input type="search" id="ibusca" placeholder="Buscar…" autocomplete="off">
      <div class="small muted" style="margin-top:8px">Drogas</div><div class="chips favs" id="ifavs"></div>
      <div class="small muted" style="margin-top:8px">Gases</div><div class="chips" id="igases"></div>
      <div class="note small" id="ifaixa" style="margin-top:10px" hidden></div>
      <input type="hidden" name="modo" value="Contínua">
      <div class="chips" data-name="modo" style="margin:10px 0"><button data-v="Contínua">Contínua (dose)</button><button data-v="TCI">TCI (alvo)</button></div>
      <div class="grid">
        <label class="f span2">Droga / gás<input type="text" name="nome" required autocomplete="off"></label>
        <label class="f"><span id="ilabel">Dose</span><input type="text" inputmode="decimal" name="valor" required autocomplete="off"></label>
        <label class="f">Unidade<select name="unid"></select></label>
        ${campoHora()}
      </div>`,
    ok: 'Iniciar',
    onOpen: (d) => {
      const fm = $('form', d);
      let atual = null;
      const unidades = () => {
        const tci = fm.modo.value === 'TCI';
        const ops = tci ? ['mcg/mL', 'ng/mL'] : UNID_INFUSAO;
        const sel = tci ? (atual?.tci || 'mcg/mL') : (atual?.unid || 'mcg/kg/min');
        fm.unid.innerHTML = ops.map((u) => `<option ${u === sel ? 'selected' : ''}>${u}</option>`).join('');
        $('#ilabel', d).textContent = tci ? 'Alvo (Ce)' : 'Dose';
        const fx = $('#ifaixa', d);
        fx.hidden = !atual;
        if (atual) fx.innerHTML = `Referência: <b>${esc(tci && atual.faixaTci ? atual.faixaTci : `${atual.faixa} ${atual.unid}`)}</b><br>Faixa usual de literatura — confira sempre a indicação e o paciente.`;
      };
      const desenhar = (q = '') => {
        const n = q.toLowerCase();
        const bt = (x) => `<button type="button" data-n="${esc(x.nome)}">${esc(x.nome)}</button>`;
        $('#ifavs', d).innerHTML = INFUSOES.filter((x) => !x.gas && x.nome.toLowerCase().includes(n)).map(bt).join('');
        $('#igases', d).innerHTML = INFUSOES.filter((x) => x.gas && x.nome.toLowerCase().includes(n)).map(bt).join('');
        $$('[data-n]', d).forEach((b) => (b.onclick = () => {
          atual = INFUSOES.find((x) => x.nome === b.dataset.n);
          fm.nome.value = atual.nome;
          if (!atual.tci && fm.modo.value === 'TCI') fm.modo.value = 'Contínua';
          $$('.chips[data-name="modo"] button', d).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === fm.modo.value)));
          $$('[data-n]', d).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          unidades();
          fm.valor.focus();
        }));
      };
      desenhar();
      $('#ibusca', d).oninput = (e) => desenhar(e.target.value);
      fm.modo.addEventListener('input', unidades);
      unidades();
    },
  });
  if (r.v !== 'ok') return;
  const d = r.data;
  const cat = INFUSOES.find((x) => x.nome === d.nome.trim());
  const tci = d.modo === 'TCI';
  S.f.infusoes.push({
    id: uid(), nome: d.nome.trim(), unid: tci ? (cat?.unid || 'mcg/kg/min') : d.unid, tci: tci ? d.unid : '',
    gas: !!cat?.gas || ['L/min', '%'].includes(d.unid), etapas: [{ t: horaParaISO(d.hora), valor: normNum(d.valor) }],
    fim: null, totalManual: '', totalUnid: '',
  });
  agendarSalvar();
  desenharIntra();
  toast(`${d.nome} iniciado: ${d.valor} ${d.unid}`);
}

async function dlgAlterarInfusao(inf) {
  const r = await modal({
    title: `Alterar ${esc(inf.nome)}`,
    body: `<p class="small muted">Dose atual: <b>${num(inf.etapas.at(-1).valor)} ${esc(inf.tci || inf.unid)}</b></p>
      <div class="grid"><label class="f">Nova ${inf.tci ? 'meta (alvo)' : 'dose'} (${esc(inf.tci || inf.unid)})<input type="text" inputmode="decimal" name="valor" required autofocus autocomplete="off"></label>
      ${campoHora()}</div>`,
  });
  if (r.v !== 'ok') return;
  const t = horaParaISO(r.data.hora);
  const mesma = inf.etapas.find((e) => e.t === t);
  if (mesma) mesma.valor = normNum(r.data.valor); // mesmo minuto: corrige a dose
  else inf.etapas.push({ t, valor: normNum(r.data.valor) });
  inf.etapas.sort((a, b) => (a.t > b.t) - (a.t < b.t));
  agendarSalvar();
  desenharIntra();
}

async function dlgPararInfusao(inf, horaPadrao) {
  const pedeTotal = inf.tci;
  const r = await modal({
    title: `Parar ${esc(inf.nome)}`,
    body: `<div class="grid">${campoHora(horaPadrao)}
      ${pedeTotal ? `<label class="f">Total infundido (lido na bomba)<input type="text" inputmode="decimal" name="total" autocomplete="off"></label>
      <label class="f">Unidade<select name="tunid">${['mg', 'mcg', 'mL'].map((u) => `<option>${u}</option>`).join('')}</select></label>` : ''}</div>`,
    ok: 'Parar',
  });
  if (r.v !== 'ok') return false;
  inf.fim = horaParaISO(r.data.hora);
  if (pedeTotal) { inf.totalManual = normNum(r.data.total); inf.totalUnid = r.data.tunid; }
  agendarSalvar();
  desenharIntra();
  return true;
}

async function dlgEditarInfusao(inf) {
  const r = await modal({
    title: `Editar ${esc(inf.nome)}`,
    body: `<p class="small muted">${esc(inf.tci ? 'TCI — alvo em ' + inf.tci : inf.unid)}</p>
      ${inf.etapas.map((e, i) => `<div class="grid"><label class="f">${i ? 'Mudança ' + i : 'Início'}<input type="time" name="h${i}" value="${hhmm(e.t)}" required></label>
        <label class="f">${inf.tci ? 'Alvo' : 'Dose'}<input type="text" inputmode="decimal" name="v${i}" value="${esc(num(e.valor))}" required></label></div>`).join('')}
      <div class="grid"><label class="f">Fim (vazio = em curso)<input type="time" name="fim" value="${inf.fim ? hhmm(inf.fim) : ''}"></label>
      ${inf.tci || inf.totalManual ? `<label class="f">Total (bomba)<input type="text" inputmode="decimal" name="total" value="${esc(num(inf.totalManual))}"></label>
        <label class="f">Unidade<select name="tunid">${['mg', 'mcg', 'mL'].map((u) => `<option ${u === inf.totalUnid ? 'selected' : ''}>${u}</option>`).join('')}</select></label>` : ''}</div>`,
  });
  if (r.v !== 'ok') return;
  const d = r.data;
  inf.etapas = inf.etapas.map((_, i) => ({ t: horaParaISO(d[`h${i}`], new Date(inf.etapas[0].t)), valor: normNum(d[`v${i}`]) }))
    .sort((a, b) => (a.t > b.t) - (a.t < b.t));
  inf.fim = d.fim ? horaParaISO(d.fim, new Date(inf.etapas[0].t)) : null;
  if ('total' in d) { inf.totalManual = normNum(d.total); inf.totalUnid = d.tunid; }
  agendarSalvar();
  desenharIntra();
}

function svgGrafico(f, largura = 720) {
  const W = Math.round(Math.min(900, Math.max(320, largura || 720))), H = W < 500 ? 260 : 250, L = 34, R = 18, T = 12, B = 22;
  const vs = [...f.vitais].sort((a, b) => (a.t > b.t ? 1 : -1));
  const todos = [...vs.map((v) => v.t), ...Object.values(f.tempos).filter(Boolean)].map((t) => +new Date(t));
  if (!todos.length) return '<p class="muted">O gráfico aparece após o primeiro registro.</p>';
  let t0 = Math.min(...todos), t1 = Math.max(...todos, f.tempos.fimAnest ? 0 : Date.now());
  t0 = Math.floor(t0 / 900000) * 900000;
  t1 = Math.max(t1 + 300000, t0 + 3600000);
  const x = (t) => L + ((+new Date(t) - t0) / (t1 - t0)) * (W - L - R);
  const y = (v) => T + (1 - Math.max(0, Math.min(200, v)) / 200) * (H - T - B);
  let g = '';
  for (let v = 0; v <= 200; v += 20) g += `<line class="grid-l" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 5}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  const passo = t1 - t0 > 3 * 3600000 ? 3600000 : 900000;
  for (let t = t0; t <= t1; t += passo) g += `<line class="grid-l" x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H - B}"/><text x="${x(t)}" y="${H - 6}" text-anchor="middle">${hhmm(new Date(t).toISOString())}</text>`;
  for (const [k, l] of TEMPOS) if (f.tempos[k]) g += `<line x1="${x(f.tempos[k])}" x2="${x(f.tempos[k])}" y1="${T}" y2="${H - B}" stroke="var(--ok)" stroke-dasharray="4 3"/><text x="${x(f.tempos[k]) + 3}" y="${T + 9}" style="fill:var(--ok)">${l.replace('Início ', '▶ ').replace('Fim ', '■ ')}</text>`;
  const s = 5;
  for (const v of vs) {
    const cx = x(v.t);
    if (v.pas) g += `<path d="M${cx - s},${y(+v.pas) - 1.7 * s} L${cx + s},${y(+v.pas) - 1.7 * s} L${cx},${y(+v.pas)} Z" fill="var(--pas)"/>`;
    if (v.pad) g += `<path d="M${cx - s},${y(+v.pad) + 1.7 * s} L${cx + s},${y(+v.pad) + 1.7 * s} L${cx},${y(+v.pad)} Z" fill="var(--pad)"/>`;
    if (v.fc) g += `<circle cx="${cx}" cy="${y(+v.fc)}" r="3.6" fill="var(--fc)"/>`;
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de PA e FC">${g}</svg>`;
}

// Pede os dados obrigatórios (anestesia, ventilação, acesso venoso) num único formulário.
async function dlgObrigatorios() {
  const falta = obrigatoriosFaltando(S.f);
  await modal({
    title: 'Dados da anestesia',
    body: `<p class="note ${falta.length ? 'warn' : ''}">${falta.length
      ? `Preencha para poder finalizar a ficha: <b>${falta.join(', ')}</b>.`
      : 'Confira os dados da anestesia.'}</p>${cardsObrigatorios()}`,
    ok: 'Concluir', cancel: 'Depois',
    onOpen: (d) => bind(d),
  });
  await salvarAgora();
  const resta = obrigatoriosFaltando(S.f);
  if (resta.length) toast(`Ainda falta: ${resta.join(', ')}`, 4000);
  return !resta.length;
}

async function marcarTempo(k) {
  const l = TEMPOS.find((t) => t[0] === k)[1];
  if (!S.f.tempos[k]) {
    S.f.tempos[k] = new Date().toISOString();
    toast(`${l}: ${hhmm(S.f.tempos[k])}`);
  } else {
    const r = await modal({
      title: l,
      body: `<label class="f">Horário<input type="time" name="hora" value="${hhmm(S.f.tempos[k])}" required></label>`,
      extra: [{ label: 'Limpar', value: 'clear', cls: 'bad' }],
    });
    if (r.v === 'clear') S.f.tempos[k] = null;
    else if (r.v === 'ok') S.f.tempos[k] = horaParaISO(r.data.hora);
    else return;
  }
  await salvarAgora();
  if (k === 'fimAnest' && S.f.tempos.fimAnest) {
    const ativas = S.f.infusoes.filter((x) => !x.fim);
    if (ativas.length && await confirmar('Infusões em curso', `Parar ${ativas.map((x) => x.nome).join(', ')} às ${hhmm(S.f.tempos.fimAnest)}?`, 'Parar todas')) {
      for (const x of ativas) {
        if (x.tci) await dlgPararInfusao(x, S.f.tempos.fimAnest);
        else x.fim = S.f.tempos.fimAnest;
      }
      await salvarAgora();
    }
    if (obrigatoriosFaltando(S.f).length) await dlgObrigatorios();
  }
  telaFicha();
}

const campoHora = (t) => /* t: ISO opcional */ `<label class="f">Horário<input type="time" name="hora" value="${t ? hhmm(t) : agoraHM()}" required></label>`;

function salvarItem(colecao, item, dados) {
  const lista = S.f[colecao];
  const i = lista.findIndex((x) => x.id === item?.id);
  const novo = { id: item?.id || uid(), ...dados };
  if (i >= 0) lista[i] = novo; else lista.push(novo);
  agendarSalvar();
  desenharIntra();
}

async function dlgVitais(item) {
  const ult = [...S.f.vitais].sort((a, b) => (a.t > b.t ? -1 : 1))[0] || {};
  const campos = [['pas', 'PAS'], ['pad', 'PAD'], ['fc', 'FC'], ['spo2', 'SpO₂ %'], ['etco2', 'EtCO₂'], ['temp', 'Temp °C']];
  const r = await modal({
    title: item ? 'Editar sinais vitais' : 'Sinais vitais',
    body: `${campoHora(item?.t)}<br>
      <div class="vit">${campos.map(([k, l], i) => `<label class="f">${l}<input type="text" inputmode="decimal" name="${k}" value="${esc(num(item?.[k] ?? ''))}" placeholder="${esc(item ? '' : num(ult[k] ?? ''))}" ${i === 0 ? 'autofocus' : ''} autocomplete="off"></label>`).join('')}</div><br>
      <label class="f">Ritmo (ECG)<input type="text" name="ritmo" list="ritmos" value="${esc(item?.ritmo ?? ult.ritmo ?? 'RS')}"></label>
      <datalist id="ritmos"><option value="RS"><option value="FA"><option value="Taqui sinusal"><option value="Bradi sinusal"><option value="Marca-passo"></datalist>
      ${!item && ult.t ? '<p class="small muted">Em cinza: último valor registrado.</p>' : ''}`,
    extra: !item && ult.t ? [{ label: 'Repetir últimos', value: 'rep' }] : [],
  });
  if (r.v !== 'ok' && r.v !== 'rep') return;
  const d = r.data;
  const dados = { t: horaParaISO(d.hora), ritmo: d.ritmo };
  for (const [k] of campos) dados[k] = r.v === 'rep' ? (d[k] !== '' ? normNum(d[k]) : ult[k] ?? '') : normNum(d[k]);
  if (!campos.some(([k]) => dados[k] !== '' && dados[k] != null)) return toast('Nenhum valor informado');
  salvarItem('vitais', item, dados);
  toast('Sinais vitais registrados');
}

async function dlgDroga(item) {
  const favs = favoritos();
  const r = await modal({
    title: item ? 'Editar droga' : 'Administrar droga',
    body: `${item ? '' : `<input type="search" id="fbusca" placeholder="Buscar nos favoritos…" autocomplete="off"><div class="chips favs" id="favs" style="margin:10px 0"></div>`}
      <div class="grid">
        <label class="f span2">Droga<input type="text" name="nome" required value="${esc(item?.nome || '')}" autocomplete="off"></label>
        <label class="f">Dose<input type="text" inputmode="decimal" name="dose" required value="${esc(num(item?.dose ?? ''))}" autocomplete="off"></label>
        <label class="f">Unidade<select name="unid">${UNIDADES.map((u) => `<option ${u === (item?.unid || 'mg') ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        <label class="f">Via<select name="via">${VIAS.map((v) => `<option ${v === (item?.via || 'IV') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${campoHora(item?.t)}
      </div>`,
    onOpen: (d) => {
      const box = $('#favs', d);
      if (!box) return;
      const desenhar = (q = '') => {
        const n = q.toLowerCase();
        box.innerHTML = favs.filter((x) => x.nome.toLowerCase().includes(n))
          .map((x) => `<button type="button" data-n="${esc(x.nome)}">${esc(x.nome)}</button>`).join('') || '<span class="muted small">Nenhum favorito encontrado — digite o nome abaixo.</span>';
        $$('button', box).forEach((b) => (b.onclick = () => {
          const fv = favs.find((x) => x.nome === b.dataset.n);
          const fm = $('form', d);
          fm.nome.value = fv.nome; fm.dose.value = num(fv.dose); fm.unid.value = fv.unid; fm.via.value = fv.via;
          $$('button', box).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          fm.dose.focus(); fm.dose.select();
        }));
      };
      desenhar();
      $('#fbusca', d).oninput = (e) => desenhar(e.target.value);
    },
  });
  if (r.v !== 'ok') return;
  const d = r.data;
  salvarItem('drogas', item, { t: horaParaISO(d.hora), nome: d.nome.trim(), dose: normNum(d.dose), unid: d.unid, via: d.via });
  toast(`${d.nome} ${d.dose} ${d.unid} registrado`);
}

async function dlgFluido(item) {
  const r = await modal({
    title: item ? 'Editar fluido' : 'Fluido / hemoderivado',
    body: `<div class="chips" data-name="nome" style="margin-bottom:10px">${FLUIDOS.map((x) => `<button data-v="${esc(x.nome)}">${esc(x.nome)}</button>`).join('')}</div>
      <input type="hidden" name="nome" value="${esc(item?.nome || '')}">
      <div class="grid">
        <label class="f span2">Outro<input type="text" name="outro" autocomplete="off"></label>
        <label class="f">Tipo<select name="tipo">${['cristaloide', 'coloide', 'hemoderivado'].map((t) => `<option ${t === item?.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f">Volume (ml)<input type="text" inputmode="numeric" name="vol" required value="${esc(item?.vol || '')}"></label>
        ${campoHora(item?.t)}
      </div>
      <div class="chips" style="margin-top:10px" id="vols">${[100, 250, 500, 1000].map((v) => `<button type="button" data-vol="${v}">${v} ml</button>`).join('')}</div>`,
    onOpen: (d) => {
      const fm = $('form', d);
      fm.querySelector('[name=nome]').addEventListener('input', (e) => {
        const fl = FLUIDOS.find((x) => x.nome === e.target.value);
        if (fl) fm.tipo.value = fl.tipo;
      });
      $$('#vols button', d).forEach((b) => (b.onclick = () => { fm.vol.value = b.dataset.vol; }));
    },
  });
  if (r.v !== 'ok') return;
  const nome = r.data.outro.trim() || r.data.nome;
  if (!nome) return toast('Escolha o fluido');
  salvarItem('fluidos', item, { t: horaParaISO(r.data.hora), nome, tipo: r.data.tipo, vol: normNum(r.data.vol) });
  toast(`${nome} ${r.data.vol} ml registrado`);
}

async function dlgEvento(item) {
  const r = await modal({
    title: item ? 'Editar evento' : 'Evento',
    body: `<div class="chips" id="evr" style="margin-bottom:10px">${EVENTOS_RAPIDOS.map((e) => `<button type="button">${esc(e)}</button>`).join('')}</div>
      <label class="f">Descrição<input type="text" name="texto" required value="${esc(item?.texto || '')}" autocomplete="off"></label><br>
      ${campoHora(item?.t)}`,
    onOpen: (d) => $$('#evr button', d).forEach((b) => (b.onclick = () => { $('form', d).texto.value = b.textContent; })),
  });
  if (r.v !== 'ok') return;
  salvarItem('eventos', item, { t: horaParaISO(r.data.hora), texto: r.data.texto.trim() });
  toast('Evento registrado');
}

// ---------------------------------------------------------------- finalizar / PDF
function pendencias(f) {
  const p = [];
  if (!f.pac.nome) p.push('Nome do paciente');
  if (!f.pac.data) p.push('Data');
  if (!f.pre.asa) p.push('Classificação ASA');
  if (!f.tempos.inicioAnest) p.push('Início da anestesia');
  if (!f.tempos.fimAnest) p.push('Fim da anestesia');
  if (!f.pac.intervencoes.some(Boolean)) p.push('Intervenção cirúrgica realizada');
  if (!f.vitais.length) p.push('Nenhum sinal vital registrado');
  if (!f.saida.destino) p.push('Encaminhamento (destino)');
  return p;
}

function abaFim() {
  const f = S.f;
  const pend = pendencias(f);
  const obrig = obrigatoriosFaltando(f);
  const acoesPdf = NATIVO ? `<div class="btns">
      <button class="btn pri" id="bbaixar">💾 Salvar PDF</button>
      <button class="btn" id="bver">📄 Abrir</button>
      <button class="btn" id="bimp">🖨️ Imprimir</button>
      <button class="btn" id="bshare">📤 Compartilhar</button></div>
      <p class="small muted">${descricaoDestino()}</p>` : `<div class="btns">
      <button class="btn pri" id="bver">📄 Ver / imprimir PDF</button>
      <button class="btn" id="bshare">📤 Compartilhar</button>
      <button class="btn" id="bbaixar">💾 Salvar no aparelho</button></div>`;
  let topo;
  if (f.status === 'rascunho') {
    topo = card('Finalizar ficha', `
      ${obrig.length ? `<div class="note bad"><b>Obrigatório para finalizar:</b><ul class="pend">${obrig.map((x) => `<li>${x}</li>`).join('')}</ul>
        <button class="btn pri" id="bobrig">✏️ Preencher agora</button></div>` : ''}
      ${pend.length ? `<div class="note warn"><b>Itens não preenchidos:</b><ul class="pend">${pend.map((x) => `<li>${x}</li>`).join('')}</ul>Estes itens não impedem a finalização.</div>` : obrig.length ? '' : '<p class="note">Tudo pronto para finalizar.</p>'}
      <p class="small muted">Depois de finalizada, a ficha fica bloqueada. Correções só com a sua senha, e ficam registradas no histórico.</p>
      <button class="btn ok big block" id="bfin" ${obrig.length ? 'disabled' : ''}>✅ Finalizar e gerar PDF</button>`)
      + card('Pré-visualização', `<p class="small muted">O PDF sai com a marca “RASCUNHO” até a ficha ser finalizada.</p>${acoesPdf}`)
      + card('Excluir', `<button class="btn bad" id="bdel">🗑️ Excluir este rascunho</button>`);
  } else if (f.status === 'finalizada') {
    topo = card('Ficha finalizada 🔒', `<p>Finalizada em ${dataHoraBR(f.finalizadaEm)}${f.versao > 1 ? ` · versão ${f.versao}` : ''}.</p>${acoesPdf}`)
      + card('Correções', `<p class="small muted">Só ${esc(f.anestesista.nome)} pode editar esta ficha, com a senha. As alterações ficam registradas no histórico e no PDF.</p>
        <button class="btn" id="bedit">✏️ Editar com senha</button>`);
  } else {
    topo = card('Revisão em andamento', `<p>Você está editando uma ficha já finalizada. Ao concluir, as alterações serão registradas no histórico.</p>
      <div class="btns"><button class="btn ok big" id="bconc">✅ Concluir revisão</button>
      <button class="btn bad" id="bdesc">Descartar alterações</button></div>`)
      + card('Pré-visualização', acoesPdf);
  }
  const hist = `<section class="card"><h2>Histórico</h2><ul class="audit">${[...f.auditoria].reverse().map((a) => `<li><b>${dataHoraBR(a.em)}</b> — ${esc(a.acao)} <span class="muted">(${esc(a.por)})</span>
      ${a.alteracoes?.length ? `<ul>${a.alteracoes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ul></section>`;
  return topo + hist;
}

function ligarFim() {
  const f = S.f;
  const u = store.usuarioAtual();
  const por = `${u.nome} (CRM ${u.crm})`;
  $('#bver')?.addEventListener('click', () => acaoPdf('ver'));
  $('#bshare')?.addEventListener('click', () => acaoPdf('share'));
  $('#bbaixar')?.addEventListener('click', () => acaoPdf('baixar'));
  $('#bimp')?.addEventListener('click', () => acaoPdf('imprimir'));
  $('#bobrig')?.addEventListener('click', async () => { await dlgObrigatorios(); telaFicha(); });
  $('#bfin')?.addEventListener('click', async () => {
    if (obrigatoriosFaltando(f).length && !(await dlgObrigatorios())) return telaFicha();
    if (!(await confirmar('Finalizar ficha', 'Após finalizar, a ficha fica bloqueada para edição (correções só com senha). Confirmar?', 'Finalizar', 'ok'))) return;
    f.status = 'finalizada';
    f.finalizadaEm = new Date().toISOString();
    f.versao = 1;
    f.auditoria.push({ em: f.finalizadaEm, acao: 'Ficha finalizada', por });
    await salvarAgora();
    telaFicha();
    toast('Ficha finalizada');
    await acaoPdf('baixar');
    if (NATIVO) backupAutomatico();
  });
  $('#bdel')?.addEventListener('click', async () => {
    if (!(await confirmar('Excluir rascunho', 'Excluir definitivamente esta ficha em andamento?', 'Excluir', 'bad'))) return;
    await store.excluirFicha(f.id);
    sincronizarExclusao(f.id);
    S.fichas = S.fichas.filter((x) => x.id !== f.id);
    S.f = null;
    go('#/lista');
  });
  $('#bedit')?.addEventListener('click', async () => {
    if (f.userId !== u.id) return toast('Somente quem criou a ficha pode editá-la');
    if (!(await pedirSenha('Para editar uma ficha finalizada, confirme sua senha.'))) return;
    const { auditoria, ...base } = structuredClone(f);
    f.revisaoBase = base;
    f.status = 'revisao';
    f.auditoria.push({ em: new Date().toISOString(), acao: 'Edição iniciada (desbloqueio com senha)', por });
    await salvarAgora();
    go(`#/ficha/${f.id}/pac`);
  });
  $('#bconc')?.addEventListener('click', async () => {
    if (obrigatoriosFaltando(f).length && !(await dlgObrigatorios())) return telaFicha();
    const alt = diferencas(f.revisaoBase, f);
    delete f.revisaoBase;
    f.status = 'finalizada';
    f.versao = (f.versao || 1) + 1;
    f.editadaEm = new Date().toISOString();
    f.auditoria.push({ em: f.editadaEm, acao: `Revisão concluída — versão ${f.versao}`, por, alteracoes: alt.length ? alt : ['Nenhuma alteração'] });
    await salvarAgora();
    telaFicha();
    toast('Revisão concluída');
  });
  $('#bdesc')?.addEventListener('click', async () => {
    if (!(await confirmar('Descartar alterações', 'Voltar a ficha ao estado em que estava antes da edição?', 'Descartar', 'bad'))) return;
    const base = structuredClone(f.revisaoBase);
    const aud = f.auditoria;
    Object.keys(f).forEach((k) => delete f[k]);
    Object.assign(f, base, {
      status: 'finalizada',
      auditoria: [...aud, { em: new Date().toISOString(), acao: 'Edição descartada — ficha restaurada', por }],
    });
    await salvarAgora();
    telaFicha();
  });
}

const SECOES = {
  pac: 'Paciente', pre: 'Pré-anestésica', tempos: 'Tempos', vitais: 'Sinais vitais', drogas: 'Drogas',
  fluidos: 'Fluidos', eventos: 'Eventos', monit: 'Monitorização', equip: 'Equipamentos', labs: 'Exames',
  acesso: 'Acesso venoso', anest: 'Anestesia', vent: 'Ventilação', balanco: 'Balanço hídrico',
  saida: 'Encaminhamento', anotacoes: 'Situações especiais', srpa: 'SRPA', infusoes: 'Infusões',
};
const rotuloCaminho = (k) => {
  const [s, ...resto] = k.split('.');
  return [SECOES[s] || s, ...resto.map((p) => (/^\d+$/.test(p) ? `#${+p + 1}` : p))].join(' › ');
};

// Lista legível das diferenças entre duas versões da ficha.
function diferencas(a, b) {
  const plano = (o, pre = '', out = {}) => {
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) {
        if (['auditoria', 'revisaoBase', 'status', 'versao', 'atualizadaEm', 'editadaEm'].includes(k) && !pre) continue;
        plano(o[k], pre ? `${pre}.${k}` : k, out);
      }
    } else out[pre] = o;
    return out;
  };
  const pa = plano(a), pb = plano(b);
  const chaves = new Set([...Object.keys(pa), ...Object.keys(pb)]);
  const fmt = (v) => (v === undefined || v === null || v === '' ? '(vazio)' : v === true ? 'sim' : v === false ? 'não' : String(v).slice(0, 60));
  const out = [];
  for (const k of chaves) {
    const va = pa[k] ?? '', vb = pb[k] ?? '';
    if (String(va) === String(vb)) continue;
    if ((va === false && vb === '') || (va === '' && vb === false)) continue;
    out.push(`${rotuloCaminho(k)}: ${fmt(pa[k])} → ${fmt(pb[k])}`);
  }
  return out.slice(0, 80);
}

async function carregarLogo() {
  if (S.logo) return S.logo;
  const blob = await (await fetch('icons/logo.png')).blob();
  S.logo = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  return S.logo;
}

function nomeArquivo(f) {
  const n = (f.pac.nome || 'paciente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
  return `Anestesia_${f.pac.data || ''}_${n}${f.status === 'finalizada' ? '' : '_RASCUNHO'}.pdf`;
}

function baixar(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function compartilhar(blob, nome, tipo) {
  const file = new File([blob], nome, { type: tipo });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nome }); return true; } catch (e) { if (e.name === 'AbortError') return true; }
  }
  baixar(blob, nome);
  toast('Compartilhamento indisponível neste navegador — arquivo salvo.');
  return false;
}

// ----- arquivos no APK: pasta escolhida pelo usuário (aparelho, cartão, Drive, OneDrive…)
const armazenamento = () => store.usuarioAtual()?.armazenamento || {};

function descricaoDestino() {
  const a = armazenamento();
  if (a.modo === 'pasta' && a.uri) return `Os PDFs são salvos automaticamente em: <b>${esc(a.provedor ? a.provedor + ' › ' : '')}${esc(a.nome)}/Fichas</b>.`;
  return 'Ao salvar, o Android pergunta onde guardar (aparelho, Google Drive, OneDrive…). Configure uma pasta fixa em ⚙️ Configurações.';
}

function blobBase64(blob) {
  return new Promise((ok, erro) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1]);
    fr.onerror = () => erro(fr.error);
    fr.readAsDataURL(blob);
  });
}

// Salva no destino configurado; se não houver pasta (ou ela ficou inacessível), abre "Salvar em".
async function salvarNativo(blob, nome, mime, subpasta, { silencioso = false } = {}) {
  const a = armazenamento();
  const base64 = await blobBase64(blob);
  if (a.modo === 'pasta' && a.uri) {
    try {
      await Arquivos.salvarNaPasta({ pasta: a.uri, subpasta, nome, mime, base64 });
      if (!silencioso) toast(`Salvo em ${a.nome}/${subpasta}: ${nome}`, 3500);
      return true;
    } catch (e) {
      if (silencioso) { toast('Backup automático falhou: ' + e.message, 5000); return false; }
      toast(e.message + ' Escolha onde salvar agora.', 5000);
    }
  }
  if (silencioso) return false;
  const r = await Arquivos.salvarComo({ nome, mime, base64 });
  if (r.cancelado) { toast('Arquivo não salvo'); return false; }
  toast(`Salvo${r.provedor ? ' em ' + r.provedor : ''}: ${nome}`, 3500);
  return true;
}

async function backupAutomatico() {
  const a = armazenamento();
  if (!(a.modo === 'pasta' && a.uri && a.backupAuto)) return;
  const u = store.usuarioAtual();
  const blob = new Blob([JSON.stringify(await store.gerarBackup())], { type: 'application/json' });
  if (await salvarNativo(blob, `backup-ficha-anestesia-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', 'Backups', { silencioso: true })) {
    u.ultimoBackup = new Date().toISOString();
    await store.salvarUsuario();
  }
}

async function acaoPdf(modo) {
  await salvarAgora();
  toast('Gerando PDF…', 1500);
  try {
    const blob = await gerarPDF(S.f, { favoritos: favoritos(), logo: await carregarLogo() });
    const nome = nomeArquivo(S.f);
    if (NATIVO) {
      if (modo === 'baixar') return salvarNativo(blob, nome, 'application/pdf', 'Fichas');
      const base64 = await blobBase64(blob);
      const fn = { ver: 'abrir', share: 'compartilhar', imprimir: 'imprimir' }[modo];
      return Arquivos[fn]({ nome, mime: 'application/pdf', base64 });
    }
    if (modo === 'share') return compartilhar(blob, nome, 'application/pdf');
    if (modo === 'baixar') { baixar(blob, nome); return toast(`Salvo: ${nome}`); }
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) baixar(blob, nome);
  } catch (e) {
    console.error(e);
    toast('Erro ao gerar PDF: ' + e.message, 6000);
  }
}

// ---------------------------------------------------------------- configurações
function telaConfig() {
  const u = store.usuarioAtual();
  topbar(`<button id="bvolta" aria-label="Voltar">←</button><div class="ttl"><b>Configurações</b><small>${esc(nomeUser(u))}</small></div>`);
  $('#bvolta').onclick = () => go('#/lista');
  const favs = favoritos();
  $('#app').innerHTML =
    card('Meus dados', `<form id="fperfil" class="grid">
      <label class="f full">Nome<input type="text" name="nome" value="${esc(u.nome)}" required></label>
      <label class="f">CRM<input type="text" name="crm" value="${esc(u.crm)}" required></label>
      <label class="f">UF<input type="text" name="uf" value="${esc(u.uf)}" maxlength="2" required></label>
      <div class="full"><button class="btn pri">Salvar dados</button></div></form>
      <p class="small muted">Vale para as próximas fichas. As já criadas mantêm o nome e CRM de quando foram feitas.</p>`)
    + (NATIVO ? cardArmazenamento() + cardSync() : '')
    + card('Senha', `<div class="btns"><button class="btn" id="bsenha">Trocar senha</button></div>`)
    + card('Backup', `<p class="small">O backup contém suas fichas <b>criptografadas</b>: só abre com a sua senha ou o código de recuperação.
        No Android, “Compartilhar backup” permite enviar direto para o <b>Google Drive</b> ou <b>OneDrive</b>.</p>
      <div class="btns"><button class="btn pri" id="bbk">📤 Compartilhar backup</button><button class="btn" id="bbkd">💾 ${NATIVO ? 'Salvar' : 'Baixar'} backup</button>
      <button class="btn" id="brest">📥 Restaurar backup</button></div>
      <p class="small muted">Último backup: ${u.ultimoBackup ? dataHoraBR(u.ultimoBackup) : 'nunca'}</p>`)
    + card('Drogas favoritas', `<p class="small muted">Aparecem como atalho ao registrar drogas. “Ampola” é o conteúdo de 1 ampola na mesma unidade (usado para calcular a coluna Amp. do PDF).</p>
      <div class="tl" id="favlist">${favs.map((x, i) => `<div class="ev dr"><span class="t">${esc(x.via)}</span><span>${esc(x.nome)}<span class="k">${num(x.dose)} ${esc(x.unid)} · ampola ${x.amp ? num(x.amp) + ' ' + esc(x.unid) : '—'}</span></span>
        <span><button data-fe="${i}" aria-label="Editar">✏️</button><button data-fd="${i}" aria-label="Remover">🗑️</button></span></div>`).join('')}</div>
      <div class="btns" style="margin-top:10px"><button class="btn" id="bfadd">＋ Adicionar</button><button class="btn" id="bfreset">Restaurar lista padrão</button></div>`)
    + card('Acesso ao app', `<p>Liberado para <b>${esc(S.licenca?.n || '')}</b> · ${S.licenca?.e ? `válido até <b>${dataBR(S.licenca.e)}</b>` : '<b>sem validade</b>'}</p>
      <button class="btn" id="btrocalic">Trocar código de acesso</button>`)
    + card('Sessão', `<button class="btn bad" id="bsair">Sair</button>`)
    + card('Sobre', `<div style="display:flex;gap:14px;align-items:center">
        <img src="icons/logo.png" alt="" width="64" height="64" style="border-radius:12px;background:#fff">
        <div><b>Ficha de Anestesia</b> — versão ${APP_VERSAO} (${NATIVO ? 'app Android' : 'versão web'})<br>
        Desenvolvido por <b>${DESENVOLVEDOR}</b><br>
        <span class="small muted">CEA — Excelência em Anestesia · fichas guardadas criptografadas neste aparelho</span></div></div>`);

  $('#fperfil').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    Object.assign(u, { nome: d.nome.trim(), crm: d.crm.trim(), uf: d.uf.trim().toUpperCase() });
    await store.salvarUsuario();
    toast('Dados salvos');
    telaConfig();
  };
  $('#bsenha').onclick = async () => {
    const r = await modal({
      title: 'Trocar senha',
      body: `<label class="f">Senha atual<input type="password" name="a" required autocomplete="current-password"></label><br>
        <label class="f">Nova senha<input type="password" name="n" minlength="6" required autocomplete="new-password"></label><br>
        <label class="f">Confirmar nova senha<input type="password" name="n2" minlength="6" required autocomplete="new-password"></label>`,
    });
    if (r.v !== 'ok') return;
    if (r.data.n !== r.data.n2) return toast('As senhas não conferem');
    try { await store.trocarSenha(r.data.a, r.data.n); toast('Senha alterada'); } catch (e) { toast(e.message); }
  };
  const backup = async (modo) => {
    const data = await store.gerarBackup();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const nome = `backup-ficha-anestesia-${new Date().toISOString().slice(0, 10)}.json`;
    if (NATIVO) {
      if (modo === 'share') await Arquivos.compartilhar({ nome, mime: 'application/json', base64: await blobBase64(blob) });
      else if (!(await salvarNativo(blob, nome, 'application/json', 'Backups'))) return;
    } else if (modo === 'share') await compartilhar(blob, nome, 'application/json'); else baixar(blob, nome);
    u.ultimoBackup = new Date().toISOString();
    await store.salvarUsuario();
    telaConfig();
  };
  $('#bbk').onclick = () => backup('share');
  $('#bbkd').onclick = () => backup('baixar');
  $('#brest').onclick = () => restaurarBackup();
  if (NATIVO) { ligarArmazenamento(); ligarSync(); }
  const salvarFavs = async (lista) => { u.favoritos = lista; await store.salvarUsuario(); telaConfig(); };
  const editarFav = async (i) => {
    const x = i >= 0 ? favs[i] : { nome: '', unid: 'mg', via: 'IV', dose: '', amp: '' };
    const r = await modal({
      title: i >= 0 ? 'Editar favorito' : 'Novo favorito',
      body: `<div class="grid">
        <label class="f span2">Droga<input type="text" name="nome" value="${esc(x.nome)}" required></label>
        <label class="f">Dose padrão<input type="text" inputmode="decimal" name="dose" value="${esc(num(x.dose))}"></label>
        <label class="f">Unidade<select name="unid">${UNIDADES.map((v) => `<option ${v === x.unid ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f">Via<select name="via">${VIAS.map((v) => `<option ${v === x.via ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f">Ampola (conteúdo)<input type="text" inputmode="decimal" name="amp" value="${esc(num(x.amp))}"></label></div>`,
    });
    if (r.v !== 'ok') return;
    const novo = { nome: r.data.nome.trim(), dose: +normNum(r.data.dose) || '', unid: r.data.unid, via: r.data.via, amp: +normNum(r.data.amp) || 0 };
    const lista = [...favs];
    if (i >= 0) lista[i] = novo; else lista.push(novo);
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    salvarFavs(lista);
  };
  $$('[data-fe]').forEach((b) => (b.onclick = () => editarFav(+b.dataset.fe)));
  $$('[data-fd]').forEach((b) => (b.onclick = () => salvarFavs(favs.filter((_, i) => i !== +b.dataset.fd))));
  $('#bfadd').onclick = () => editarFav(-1);
  $('#bfreset').onclick = async () => { if (await confirmar('Lista padrão', 'Substituir seus favoritos pela lista padrão?')) salvarFavs(null); };
  $('#btrocalic').onclick = async () => {
    if (!(await confirmar('Trocar código', 'Remover o código de acesso atual e digitar outro?'))) return;
    licenca.remover(); S.motivoLicenca = ''; render();
  };
  $('#bsair').onclick = () => { store.sair(); S.fichas = []; go('#/'); };
}

function cardSync() {
  const st = store.usuarioAtual() ? estadoSync() : {};
  return card('Sincronização entre aparelhos', syncAtivo() ? `
    <p class="small">As fichas (criptografadas) ficam também em <b>${esc(armazenamento().nome)}/Dados</b>. Se essa pasta for sincronizada
      com a nuvem (ex.: DriveSync) nos dois aparelhos, cada um recebe as fichas do outro. Use o <b>mesmo cadastro</b> nos dois.</p>
    <p class="small muted">Última sincronização: ${st.ultima ? dataHoraBR(st.ultima) : 'ainda não'}
      ${st.contagem ? `<br>Suas fichas na pasta: <b>${st.contagem.pasta}</b> · neste aparelho: <b>${st.contagem.aqui}</b>
        ${st.contagem.faltamAqui ? `<br><b style="color:var(--warn)">Faltam ${st.contagem.faltamAqui} ficha(s) neste aparelho</b> — toque em “Sincronizar agora”.` : ''}` : ''}</p>
    ${st.contagem?.deOutroCadastro ? `<p class="note warn small"><b>${st.contagem.deOutroCadastro} ficha(s) na pasta pertencem a OUTRO cadastro</b> e não abrem
      neste aparelho. ${S.cadastroSenhaDiferente
        ? 'Na lista, toque em <b>“Trazer essas fichas”</b> e digite a senha do outro cadastro.'
        : 'Toque em “Sincronizar agora”. Se continuar, o arquivo do outro cadastro ainda não chegou pela nuvem — abra o app no outro aparelho, toque em 🔄 e aguarde o DriveSync.'}</p>` : ''}
    <p class="small muted">Dica: no DriveSync, a sincronização dessa pasta precisa estar <b>nos dois sentidos</b> (“Two-way” / bidirecional)
      nos dois aparelhos — se estiver só “enviar” (“Upload only”), um aparelho não recebe as fichas do outro.</p>
    <div class="btns"><button class="btn pri" id="bsyncnow">🔄 Sincronizar agora</button>
      <button class="btn" id="badotar">👥 Usar cadastro de outro aparelho</button>
      <button class="btn" id="bdiag">🔍 Diagnóstico</button></div>`
    : '<p class="small muted">Escolha uma pasta acima, com “Salvar automaticamente na pasta”, para ativar a sincronização.</p>');
}

function ligarSync() {
  $('#bsyncnow')?.addEventListener('click', async () => { await sincronizar({ silencioso: false, completa: true }); telaConfig(); });
  $('#badotar')?.addEventListener('click', () => adotarCadastro());
  $('#bdiag')?.addEventListener('click', () => diagnosticoSync());
}

// Mostra tudo o que o app enxerga na pasta Dados (para descobrir onde a sincronização trava).
async function diagnosticoSync() {
  const u = store.usuarioAtual();
  const a = armazenamento();
  const st = estadoSync();
  const curto = (id) => String(id || '').slice(-5);
  const linhas = [];
  let arquivos = [];
  try {
    arquivos = (await Arquivos.listarArquivos({ pasta: a.uri, subpasta: SUB_DADOS })).arquivos;
  } catch (e) { linhas.push(`<li style="color:var(--bad)">Erro ao listar a pasta: ${esc(e.message)}</li>`); }
  arquivos.sort((x, y) => y.modificado - x.modificado);
  let fichasMinhas = 0, fichasOutras = 0, cadOutros = 0;
  for (const arq of arquivos) {
    let desc = '';
    try {
      const d = await lerJSON(arq.nome);
      if (ehCadastro(arq.nome)) {
        if (d.substituidoPor) desc = `marca antiga (ignorada)`;
        else if (d.user?.id === u.id) desc = '<b>cadastro deste aparelho</b>';
        else { desc = `<b style="color:var(--warn)">OUTRO cadastro</b>: ${esc(d.user?.nome)} — CRM ${esc(d.user?.crm)} · criado ${dataHoraBR(d.user?.criadoEm)}`; cadOutros++; }
      } else if (ehFicha(arq.nome)) {
        if (d.userId === u.id) { desc = d.excluida ? 'ficha excluída' : 'ficha deste cadastro'; fichasMinhas++; }
        else { desc = `ficha de OUTRO cadastro (…${curto(d.userId)})`; fichasOutras++; }
      } else desc = 'outro arquivo';
    } catch (e) { desc = `<span style="color:var(--bad)">não foi possível ler: ${esc(e.message)}</span>`; }
    linhas.push(`<li><code>${esc(arq.nome)}</code><br><span class="small">${new Date(arq.modificado).toLocaleString('pt-BR')} · ${desc}</span></li>`);
  }
  await modal({
    title: 'Diagnóstico da sincronização', ok: 'Fechar', cancel: '',
    body: `<p class="small"><b>Versão:</b> ${APP_VERSAO}<br>
      <b>Cadastro deste aparelho:</b> ${esc(u.nome)} — CRM ${esc(u.crm)} · …${curto(u.id)} · criado ${dataHoraBR(u.criadoEm)}<br>
      <b>Pasta:</b> ${esc(a.provedor || '')} › ${esc(a.nome || '(nenhuma)')} · modo: ${esc(a.modo || '—')}<br>
      <span class="muted" style="word-break:break-all">${esc(a.uri || '')}</span><br>
      <b>Última sincronização:</b> ${st.ultima ? dataHoraBR(st.ultima) : 'nunca'}${st.erro ? `<br><b style="color:var(--bad)">Último erro:</b> ${esc(st.erro)}` : ''}<br>
      <b>Fichas neste aparelho:</b> ${S.fichas.length}</p>
      <p class="note small">Na pasta <b>Dados</b>: ${arquivos.length} arquivo(s) — ${fichasMinhas} ficha(s) deste cadastro,
        ${fichasOutras} de outro cadastro, ${cadOutros} outro(s) cadastro(s).</p>
      <ul class="audit" style="padding-left:18px">${linhas.join('') || '<li>Pasta Dados vazia.</li>'}</ul>
      <p class="small muted">Tire um print desta tela (role até o fim) e envie ao desenvolvedor.</p>`,
  });
}

// Pede a senha do outro cadastro (quando é diferente da deste) e traz as fichas dele.
async function vincularOutroCadastro(c) {
  const r = await modal({
    title: 'Trazer fichas do outro cadastro',
    body: `<p class="small">Digite a senha do cadastro <b>${esc(nomeUser(c))}</b> (criado em ${dataHoraBR(c.criadoEm)}), a que você usa no outro aparelho.
      As fichas dele passam a aparecer aqui também. Nada é apagado.</p>
      <label class="f">Senha desse cadastro<input type="password" name="senha" required autocomplete="current-password"></label>`,
    ok: 'Trazer fichas',
  });
  if (r.v !== 'ok') return;
  if (!(await store.vincularCadastro(c, r.data.senha))) return toast('Senha incorreta para esse cadastro', 4000);
  S.cadastroSenhaDiferente = null;
  await sincronizar({ silencioso: false, completa: true });
  if (location.hash.startsWith('#/lista')) telaLista();
}

// Usa neste aparelho o cadastro criado no outro (mesma chave = mesmas fichas) e traz para ele
// as fichas do cadastro atual deste aparelho.
async function adotarCadastro(preferido) {
  const atual = store.usuarioAtual();
  let candidatos = [];
  try {
    const { arquivos } = await Arquivos.listarArquivos({ pasta: armazenamento().uri, subpasta: SUB_DADOS });
    const todos = await cadastrosDaPasta(arquivos, atual.id);
    candidatos = todos.filter((c) => maisAntigo(c, atual))
      .sort((a, b) => (a.id === preferido ? -1 : b.id === preferido ? 1 : (mesmoAnestesista(b, atual) - mesmoAnestesista(a, atual)) || (maisAntigo(a, b) ? -1 : 1)));
    if (!candidatos.length && todos.length) {
      return modal({ title: 'Este aparelho já tem o cadastro principal', ok: 'Entendi', cancel: '',
        body: `<p>O cadastro deste aparelho (criado em ${dataHoraBR(atual.criadoEm)}) é o <b>mais antigo</b>, por isso é ele que fica.</p>
          <p>No <b>outro aparelho</b>, toque em “Unificar agora” na lista (ou Configurações → “Usar cadastro de outro aparelho”) e digite a senha deste cadastro.
          As fichas dele passam para este cadastro e os dois aparelhos ficam iguais.</p>` });
    }
  } catch (e) { return toast('Não foi possível ler a pasta: ' + e.message, 5000); }
  if (!candidatos.length) {
    return modal({ title: 'Nenhum outro cadastro encontrado', ok: 'Entendi', cancel: '',
      body: `<p>Ainda não há cadastro de outro aparelho em <b>${esc(armazenamento().nome)}/Dados</b>.</p>
        <p class="small">No outro aparelho: escolha a pasta sincronizada em Configurações e toque em “Sincronizar agora”. Espere o DriveSync copiar os arquivos e tente de novo aqui.</p>` });
  }
  const r = await modal({
    title: 'Usar cadastro de outro aparelho',
    body: `<p class="small">Escolha o cadastro e digite a <b>senha dele</b> (a senha que você usa no outro aparelho). As ${S.fichas.length} ficha(s) do cadastro atual deste aparelho
        (<b>${esc(atual.nome)}</b>) serão transferidas para ele, e o cadastro atual será removido daqui.</p>
      <input type="hidden" name="uid" value="${esc(candidatos[0].id)}">
      <div class="chips" data-name="uid" style="margin:8px 0">${candidatos.map((u) => `<button data-v="${esc(u.id)}">${esc(nomeUser(u))}</button>`).join('')}</div>
      <label class="f">Senha desse cadastro<input type="password" name="senha" required autocomplete="current-password"></label>`,
    ok: 'Usar este cadastro',
  });
  if (r.v !== 'ok') return;
  const novo = candidatos.find((u) => u.id === r.data.uid);
  try {
    await store.adotarUsuario(novo, r.data.senha);
    const fichasAntigas = (await store.listarFichas()).map((f) => ({ ...f }));
    const dadosDoAparelho = { armazenamento: atual.armazenamento, ultimoBackup: atual.ultimoBackup };
    await store.login(novo.id, r.data.senha);
    await store.unificarCadastro(fichasAntigas, atual.id, dadosDoAparelho);
    S.cadastroParaUnificar = null;
    try { localStorage.removeItem('sync:' + atual.id); } catch { /* ok */ }
    S.fichas = (await store.listarFichas()).map(normalizarFicha);
    toast(`Agora usando o cadastro de ${novo.nome}. ${fichasAntigas.length} ficha(s) transferida(s).`, 5000);
    await sincronizar({ silencioso: false, completa: true });
    go('#/lista');
  } catch (e) { toast(e.message, 5000); }
}

function cardArmazenamento() {
  const a = armazenamento();
  const modo = a.modo === 'pasta' && a.uri ? 'pasta' : 'perguntar';
  return card('Onde salvar os arquivos (PDFs e backups)', `
    <div class="note">${a.uri
      ? `Pasta escolhida: <b>${esc(a.provedor ? a.provedor + ' › ' : '')}${esc(a.nome)}</b><br><span class="small">PDFs em <b>Fichas/</b> e backups em <b>Backups/</b>.</span>`
      : 'Nenhuma pasta escolhida ainda.'}</div>
    <div class="btns"><button class="btn pri" id="bpasta">📁 ${a.uri ? 'Trocar pasta' : 'Escolher pasta'}</button></div>
    <p class="small muted">No seletor do Android, toque em <b>☰</b> para ver: memória do aparelho, cartão SD, <b>Google Drive</b>, <b>OneDrive</b>
      (se os apps estiverem instalados). Se a nuvem não aparecer ou não aceitar, use “Perguntar onde salvar”.</p>
    <div class="chips" id="modoArm" style="margin:10px 0">
      <button data-v="pasta" aria-pressed="${modo === 'pasta'}" ${a.uri ? '' : 'disabled'}>Salvar automaticamente na pasta</button>
      <button data-v="perguntar" aria-pressed="${modo === 'perguntar'}">Perguntar onde salvar a cada arquivo</button>
    </div>
    <label class="chk"><input type="checkbox" id="bkauto" ${a.backupAuto ? 'checked' : ''} ${a.uri ? '' : 'disabled'}>
      Fazer backup automático na pasta ao finalizar cada ficha</label>`);
}

function ligarArmazenamento() {
  const u = store.usuarioAtual();
  const salvar = async (mudancas) => {
    u.armazenamento = { ...armazenamento(), ...mudancas };
    await store.salvarUsuario();
    telaConfig();
  };
  $('#bpasta').onclick = async () => {
    try {
      const r = await Arquivos.escolherPasta();
      if (r.cancelado) return;
      await salvar({ uri: r.uri, nome: r.nome, provedor: r.provedor, modo: 'pasta', backupAuto: armazenamento().backupAuto ?? true });
      toast(`Pasta definida: ${r.provedor ? r.provedor + ' › ' : ''}${r.nome}`, 3500);
    } catch (e) { toast(e.message, 6000); }
  };
  $$('#modoArm button').forEach((b) => (b.onclick = () => salvar({ modo: b.dataset.v })));
  $('#bkauto').onchange = (e) => salvar({ backupAuto: e.target.checked });
}

function restaurarBackup() {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = '.json,application/json';
  i.onchange = async () => {
    try {
      const data = JSON.parse(await i.files[0].text());
      const r = await store.importarBackup(data);
      toast(`Backup de ${r.nome}: ${r.fichas} ficha(s) restaurada(s)${r.usuarioNovo ? ' — entre com a senha desse usuário' : ''}`, 5000);
      if (store.usuarioAtual()) { S.fichas = (await store.listarFichas()).map(normalizarFicha); go('#/lista'); } else telaLogin();
    } catch (e) { toast('Não foi possível restaurar: ' + e.message, 5000); }
  };
  i.click();
}

// ---------------------------------------------------------------- início
window.addEventListener('visibilitychange', () => {
  if (document.hidden) { salvarAgora().then(() => syncAtivo() && store.usuarioAtual() && sincronizar()); }
  else if (store.usuarioAtual()) sincronizarDeVezEmQuando();
});
window.addEventListener('pagehide', () => salvarAgora());
if (!NATIVO && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
licenca.atualizarBloqueios().then(async () => {
  if (S.licenca && !(await licenca.verificar(licenca.codigoSalvo())).ok) render();
});
