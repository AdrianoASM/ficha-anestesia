import * as store from './store.js';
import {
  VIAS, UNIDADES, DROGAS_PADRAO, FLUIDOS, EVENTOS_RAPIDOS, MONITORIZACAO, EQUIPAMENTOS,
  PRE_GRUPOS, ALDRETE, ALDRETE_TEMPOS, novaFicha, uid, hhmm, dataBR, dataHoraBR, horaParaISO,
  calcBalanco, aldreteTotal, num, pad,
} from './model.js';
import { gerarPDF } from './pdf.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = { fichas: [], f: null, aba: 'pac', logo: null, timer: null, wake: null, filtro: '' };

const ABAS = [
  ['pac', '👤', 'Paciente'], ['pre', '📋', 'Pré-anest.'], ['intra', '⏱️', 'Intraop.'],
  ['tec', '🫁', 'Técnica'], ['srpa', '🛏️', 'SRPA'], ['fim', '✅', 'Finalizar'],
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
const normNum = (v) => String(v ?? '').trim().replace(',', '.');

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
async function salvarAgora() {
  clearTimeout(saveT);
  if (!S.f) return;
  try {
    await store.salvarFicha(S.f);
    const i = S.fichas.findIndex((x) => x.id === S.f.id);
    if (i >= 0) S.fichas[i] = S.f; else S.fichas.unshift(S.f);
    const s = $('#saved');
    if (s) s.textContent = `salvo ${agoraHM()}`;
  } catch (e) {
    console.error(e);
    toast('Erro ao salvar! ' + e.message, 6000);
  }
}

// ---------------------------------------------------------------- navegação
function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
window.addEventListener('hashchange', () => render());

async function render() {
  clearInterval(S.timer);
  if (S.wake) { S.wake.release().catch(() => {}); S.wake = null; }
  await salvarAgora();
  const user = store.usuarioAtual();
  $('#tabs').hidden = true;
  if (!user) return telaLogin();
  const [, rota, id, aba] = location.hash.split('/');
  if (rota === 'ficha' && id) {
    const f = S.fichas.find((x) => x.id === id);
    if (!f) return go('#/lista');
    S.f = f;
    S.aba = aba || S.aba || 'pac';
    return telaFicha();
  }
  S.f = null;
  if (rota === 'config') return telaConfig();
  return telaLista();
}

function topbar(html) { $('#topbar').innerHTML = html; }

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
  $('#bnovo').onclick = () => telaCadastro(false);
  $('#besq').onclick = () => esqueciSenha(users, sel);
  $('#brest').onclick = () => restaurarBackup();
}

function telaCadastro(primeiro) {
  $('#app').innerHTML = `<div class="login card">
    <img class="logo" src="icons/logo.png" alt="CEA">
    <h1>${primeiro ? 'Primeiro acesso' : 'Novo usuário'}</h1>
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

async function entrar() {
  S.fichas = await store.listarFichas();
  go('#/lista');
}

// ---------------------------------------------------------------- lista
function telaLista() {
  const u = store.usuarioAtual();
  topbar(`<img src="icons/logo.png" alt=""><div class="ttl"><b>Minhas fichas</b><small>${esc(nomeUser(u))}</small></div>
    <button id="bcfg" title="Configurações" aria-label="Configurações">⚙️</button>`);
  $('#bcfg').onclick = () => go('#/config');
  const q = S.filtro.toLowerCase();
  const lista = S.fichas.filter((f) => !q || `${f.pac.nome} ${f.pac.convenio} ${f.pre.procedimento} ${f.pac.intervencoes.join(' ')}`.toLowerCase().includes(q));
  const rotulo = { rascunho: 'Em andamento', finalizada: 'Finalizada', revisao: 'Em revisão' };
  $('#app').innerHTML = `
    <div class="toolbar">
      <input type="search" id="busca" placeholder="Buscar paciente, procedimento…" value="${esc(S.filtro)}">
      <button class="btn pri big" id="bnova">＋ Nova ficha</button>
    </div>
    <div class="lista">
      ${lista.map((f) => `<button class="item" data-id="${f.id}">
          <div class="main"><b>${esc(f.pac.nome || '(paciente sem nome)')}</b>
          <div class="sub">${dataBR(f.pac.data)} · ${esc(f.pac.intervencoes[0] || f.pre.procedimento || 'procedimento não informado')}${f.pac.convenio ? ' · ' + esc(f.pac.convenio) : ''}</div></div>
          <span class="badge ${f.status}">${rotulo[f.status]}</span></button>`).join('')
        || `<div class="card muted">${S.fichas.length ? 'Nenhuma ficha encontrada.' : 'Nenhuma ficha ainda. Toque em “Nova ficha” para começar.'}</div>`}
    </div>`;
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
  if (path === 'pac.nome') { const b = $('.topbar .ttl b'); if (b) b.textContent = S.f.pac.nome || 'Nova ficha'; }
  $$('[data-calc]').forEach((el) => {
    const [tipo, arg] = el.dataset.calc.split(':');
    if (tipo === 'ald') el.textContent = aldreteTotal(S.f, arg) === '' ? '–' : aldreteTotal(S.f, arg);
  });
}

// helpers de formulário
const inp = (path, label, o = {}) => `<label class="f ${o.cls || ''}">${label}<input type="${o.type || 'text'}" data-f="${path}" ${o.im ? `inputmode="${o.im}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.list ? `list="${o.list}"` : ''} autocomplete="off"></label>`;
const chk = (path, label) => `<label class="chk"><input type="checkbox" data-f="${path}">${label}</label>`;
const chips = (path, opts) => `<div class="chips" data-f="${path}">${opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<button data-v="${esc(v)}">${esc(l)}</button>`; }).join('')}</div>`;
const linha = (label, html) => `<div class="row-l"><span class="lbl">${label}</span>${html}</div>`;
const card = (titulo, html) => `<section class="card"><h2>${titulo}</h2>${html}</section>`;
const SN = ['Sim', 'Não'];

function abaPaciente() {
  const f = S.f;
  return card('Paciente', `<div class="grid">
      ${inp('pac.nome', 'Nome', { cls: 'full' })}
      ${inp('pac.idade', 'Idade', { im: 'numeric' })}
      ${inp('pac.data', 'Data', { type: 'date' })}
      ${inp('pac.peso', 'Peso (kg)', { im: 'decimal' })}
      ${inp('pac.jejum', 'Jejum (h)', { im: 'decimal' })}
      ${inp('pac.convenio', 'Convênio')}
      ${inp('pac.matricula', 'Matrícula')}
    </div>
    ${linha('Sexo', chips('pac.sexo', [['F', 'Feminino'], ['M', 'Masculino']]))}
    ${linha('Caráter', chips('pac.carater', ['Eletivo', 'Urgência', 'Emergência']))}`)
  + card('Equipe', `<div class="grid">
      <label class="f span2">Anestesiologista<input type="text" value="${esc(`${f.anestesista.nome} — CRM ${f.anestesista.crm}/${f.anestesista.uf}`)}" disabled></label>
      ${inp('pac.cirurgiao', 'Cirurgião', { cls: 'span2' })}
      ${inp('pac.aux1', '1º Auxiliar')}
      ${inp('pac.aux2', '2º Auxiliar')}
    </div>`)
  + card('Intervenção cirúrgica realizada', `<div class="grid g2">
      ${[0, 1, 2, 3, 4].map((i) => inp(`pac.intervencoes.${i}`, `${i + 1}.`)).join('')}</div>`);
}

function abaPre() {
  const grupos = PRE_GRUPOS.map(([k, titulo, itens, outro]) => `
    <section class="card"><h3>${titulo}</h3><div class="checks">
      ${itens.map(([ik, il]) => chk(`pre.itens.${k}_${ik}`, il)).join('')}</div>
      ${k === 'endocrino' ? `<div class="grid" style="margin-top:8px">${inp('pre.diabetesTipo', 'Diabetes tipo', { im: 'numeric' })}</div>` : ''}
      ${k === 'habitos' ? `<div class="grid" style="margin-top:8px">${inp('pre.cigarros', 'Cigarros/dia', { im: 'numeric' })}</div>` : ''}
      ${outro ? `<div class="grid g2" style="margin-top:8px">${inp(`pre.outros.${k}`, 'Outro')}</div>` : ''}
    </section>`).join('');
  return card('Avaliação pré-anestésica', `<div class="grid g2">
      ${inp('pre.diagnostico', 'Diagnóstico pré-operatório')}
      ${inp('pre.procedimento', 'Cirurgia / procedimento proposto')}</div>`)
  + card('Classificação', `
      ${linha('ASA', chips('pre.asa', ['I', 'II', 'III', 'IV', 'V']))}
      ${linha('Emergência', chips('pre.emergencia', SN))}
      ${linha('Mallampati', chips('pre.mallampati', ['I', 'II', 'III', 'IV']))}
      ${linha('Hist. via aérea difícil', chips('pre.vad', SN))}
      ${linha('Reserva de sangue', chips('pre.reservaSangue', SN))}
      ${linha('Hist. NVPO', chips('pre.nvpo', SN))}
      ${linha('Hist. familiar de problemas anestésicos', chips('pre.histFamiliar', SN))}`)
  + `<p class="muted small">Marque apenas os itens pertinentes.</p><div class="cols2"><div>${grupos}</div><div>`
  + card('Câncer', `<div class="grid">${inp('pre.cancerLocal', 'Local', { cls: 'span2' })}</div><div class="checks" style="margin-top:8px">${chk('pre.qt', 'QT')}${chk('pre.rt', 'RT')}</div>`)
  + card('Gravidez', `${chips('pre.gravidez', ['Negativo', 'Positivo'])}<div class="grid" style="margin-top:8px">${inp('pre.dum', 'DUM', { type: 'date' })}</div>`)
  + card('Alergias', `<div class="grid g2">${[0, 1, 2].map((i) => inp(`pre.alergias.${i}`, `${i + 1}.`)).join('')}</div>`)
  + card('Cirurgia / anestesia prévia', `<div class="grid g2">${[0, 1, 2].map((i) => inp(`pre.previas.${i}`, `${i + 1}.`)).join('')}</div>`)
  + card('Uso de medicamentos', `<div class="grid g2">${[0, 1, 2].map((i) => inp(`pre.medicamentos.${i}`, `${i + 1}.`)).join('')}</div>`)
  + `</div></div>`;
}

function abaTecnica() {
  const calc = calcBalanco(S.f);
  return `<div class="cols2"><div>`
  + card('Anestesia', `<div class="checks">
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
  + card('Ventilação / via aérea', `<div class="checks">
      ${chk('vent.espontanea', 'Ventilação espontânea')}${chk('vent.vcm', 'VCM')}${chk('vent.vcv', 'VCV')}${chk('vent.pcv', 'PCV')}
      ${chk('vent.mascFacial', 'Máscara facial')}${chk('vent.mascLaringea', 'Máscara laríngea')}</div>
      <div class="grid" style="margin-top:10px">${inp('vent.mlNum', 'Máscara laríngea nº', { im: 'decimal' })}${inp('vent.tuboNum', 'Tubo nº', { im: 'decimal' })}</div>
      ${linha('Intubação', chips('vent.intubacao', ['Orotraqueal', 'Nasotraqueal']))}
      ${linha('Dificuldade', chips('vent.dificuldade', ['Fácil', 'Difícil']))}
      ${linha('Intercorrências', chips('vent.interc', SN))}
      <div class="grid g2">${inp('vent.intercDesc', 'Descrição da intercorrência')}</div>`)
  + card('Acesso venoso / MPA', `<div class="grid">
      ${inp('acesso.perifNum', 'Periférico nº', { ph: 'ex.: 18G' })}${inp('acesso.local', 'Local', { ph: 'ex.: MSE' })}
      ${inp('acesso.centralVia', 'Central — via')}${inp('acesso.mpa', 'MPA')}</div>
      ${linha('Intercorrências', chips('acesso.interc', SN))}`)
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
  + card('Exames laboratoriais', `<div class="grid">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => inp(`labs.${i}`, '', { ph: 'ex.: Hb 12,5' })).join('')}</div>`)
  + card('Anotações', `<textarea data-f="anotacoes" rows="5" placeholder="Observações livres (os eventos da linha do tempo já entram automaticamente)"></textarea>`)
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
  return card('Admissão na SRPA', vit('adm'))
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
      <button class="btn" data-a="dr"><span class="ic">💉</span>Droga</button>
      <button class="btn" data-a="fl"><span class="ic">💧</span>Fluido / sangue</button>
      <button class="btn" data-a="eo"><span class="ic">📝</span>Evento</button>
    </div><div class="alerta-sv" id="ultsv"></div></section>`}
    <section class="card"><h2>Gráfico</h2><div id="grafico"></div>
      <div class="leg"><span class="pas">PAS</span><span class="pad">PAD</span><span class="fc">FC</span></div></section>
    <section class="card"><h2>Linha do tempo</h2><div class="tl" id="tl"></div></section>`;
}

function iniciarIntra() {
  $$('[data-t]').forEach((b) => (b.onclick = () => marcarTempo(b.dataset.t)));
  $$('[data-a]').forEach((b) => (b.onclick = () => ({ sv: dlgVitais, dr: dlgDroga, fl: dlgFluido, eo: dlgEvento })[b.dataset.a]()));
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
  const f = S.f;
  const itens = [
    ...f.vitais.map((x) => ({ ...x, k: 'sv', txt: [x.pas || x.pad ? `PA ${x.pas || '–'}/${x.pad || '–'}` : '', x.fc ? `FC ${x.fc}` : '', x.spo2 ? `SpO₂ ${x.spo2}%` : '', x.etco2 ? `EtCO₂ ${x.etco2}` : '', x.temp ? `T ${num(x.temp)}°C` : '', x.ritmo].filter(Boolean).join(' · '), cat: 'Sinais vitais' })),
    ...f.drogas.map((x) => ({ ...x, k: 'dr', txt: `${x.nome} ${num(x.dose)} ${x.unid} ${x.via}`, cat: 'Droga' })),
    ...f.fluidos.map((x) => ({ ...x, k: 'fl', txt: `${x.nome} ${x.vol} ml`, cat: x.tipo })),
    ...f.eventos.map((x) => ({ ...x, k: 'eo', txt: x.texto, cat: 'Evento' })),
  ].sort((a, b) => (a.t > b.t ? -1 : 1));
  const lock = bloqueada();
  $('#tl').innerHTML = itens.map((i) => `<div class="ev ${i.k}"><span class="t">${hhmm(i.t)}</span>
      <span><span class="k">${esc(i.cat)}</span>${esc(i.txt)}</span>
      <span>${lock ? '' : `<button data-ed="${i.k}:${i.id}" aria-label="Editar">✏️</button><button data-del="${i.k}:${i.id}" aria-label="Excluir">🗑️</button>`}</span></div>`).join('')
    || '<p class="muted">Nada registrado ainda. Use os botões acima — o horário é preenchido automaticamente.</p>';
  const col = { sv: 'vitais', dr: 'drogas', fl: 'fluidos', eo: 'eventos' };
  $$('[data-ed]').forEach((b) => (b.onclick = () => {
    const [k, id] = b.dataset.ed.split(':');
    const item = S.f[col[k]].find((x) => x.id === id);
    ({ sv: dlgVitais, dr: dlgDroga, fl: dlgFluido, eo: dlgEvento })[k](item);
  }));
  $$('[data-del]').forEach((b) => (b.onclick = async () => {
    const [k, id] = b.dataset.del.split(':');
    if (!(await confirmar('Excluir registro', 'Excluir este registro da linha do tempo?', 'Excluir', 'bad'))) return;
    S.f[col[k]] = S.f[col[k]].filter((x) => x.id !== id);
    agendarSalvar();
    desenharIntra();
  }));
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
  telaFicha();
}

const campoHora = (t) => `<label class="f">Horário<input type="time" name="hora" value="${t ? hhmm(t) : agoraHM()}" required></label>`;

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
  const a = f.anest;
  if (!(a.geral || a.geralIV || a.geralInal || a.geralBal || a.sedacao || a.local || a.locoregional || a.peridural || a.subaracnoidea || a.bloqueio)) p.push('Técnica anestésica');
  if (!f.vitais.length) p.push('Nenhum sinal vital registrado');
  if (!f.saida.destino) p.push('Encaminhamento (destino)');
  return p;
}

function abaFim() {
  const f = S.f;
  const pend = pendencias(f);
  const acoesPdf = `<div class="btns">
      <button class="btn pri" id="bver">📄 Ver / imprimir PDF</button>
      <button class="btn" id="bshare">📤 Compartilhar</button>
      <button class="btn" id="bbaixar">💾 Salvar no aparelho</button></div>`;
  let topo;
  if (f.status === 'rascunho') {
    topo = card('Finalizar ficha', `
      ${pend.length ? `<div class="note warn"><b>Itens não preenchidos:</b><ul class="pend">${pend.map((x) => `<li>${x}</li>`).join('')}</ul>Você pode finalizar mesmo assim.</div>` : '<p class="note">Tudo pronto para finalizar.</p>'}
      <p class="small muted">Depois de finalizada, a ficha fica bloqueada. Correções só com a sua senha, e ficam registradas no histórico.</p>
      <button class="btn ok big block" id="bfin">✅ Finalizar e gerar PDF</button>`)
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
  $('#bfin')?.addEventListener('click', async () => {
    if (!(await confirmar('Finalizar ficha', 'Após finalizar, a ficha fica bloqueada para edição (correções só com senha). Confirmar?', 'Finalizar', 'ok'))) return;
    f.status = 'finalizada';
    f.finalizadaEm = new Date().toISOString();
    f.versao = 1;
    f.auditoria.push({ em: f.finalizadaEm, acao: 'Ficha finalizada', por });
    await salvarAgora();
    telaFicha();
    toast('Ficha finalizada');
    acaoPdf('baixar');
  });
  $('#bdel')?.addEventListener('click', async () => {
    if (!(await confirmar('Excluir rascunho', 'Excluir definitivamente esta ficha em andamento?', 'Excluir', 'bad'))) return;
    await store.excluirFicha(f.id);
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
  saida: 'Encaminhamento', anotacoes: 'Anotações', srpa: 'SRPA',
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

async function acaoPdf(modo) {
  await salvarAgora();
  toast('Gerando PDF…', 1500);
  try {
    const blob = await gerarPDF(S.f, { favoritos: favoritos(), logo: await carregarLogo() });
    const nome = nomeArquivo(S.f);
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
    + card('Senha', `<div class="btns"><button class="btn" id="bsenha">Trocar senha</button></div>`)
    + card('Backup', `<p class="small">O backup contém suas fichas <b>criptografadas</b>: só abre com a sua senha ou o código de recuperação.
        No Android, “Compartilhar backup” permite enviar direto para o <b>Google Drive</b> ou <b>OneDrive</b>.</p>
      <div class="btns"><button class="btn pri" id="bbk">📤 Compartilhar backup</button><button class="btn" id="bbkd">💾 Baixar backup</button>
      <button class="btn" id="brest">📥 Restaurar backup</button></div>
      <p class="small muted">Último backup: ${u.ultimoBackup ? dataHoraBR(u.ultimoBackup) : 'nunca'}</p>`)
    + card('Drogas favoritas', `<p class="small muted">Aparecem como atalho ao registrar drogas. “Ampola” é o conteúdo de 1 ampola na mesma unidade (usado para calcular a coluna Amp. do PDF).</p>
      <div class="tl" id="favlist">${favs.map((x, i) => `<div class="ev dr"><span class="t">${esc(x.via)}</span><span>${esc(x.nome)}<span class="k">${num(x.dose)} ${esc(x.unid)} · ampola ${x.amp ? num(x.amp) + ' ' + esc(x.unid) : '—'}</span></span>
        <span><button data-fe="${i}" aria-label="Editar">✏️</button><button data-fd="${i}" aria-label="Remover">🗑️</button></span></div>`).join('')}</div>
      <div class="btns" style="margin-top:10px"><button class="btn" id="bfadd">＋ Adicionar</button><button class="btn" id="bfreset">Restaurar lista padrão</button></div>`)
    + card('Sessão', `<button class="btn bad" id="bsair">Sair</button>`)
    + `<p class="small muted" style="text-align:center">Ficha de Anestesia · protótipo PWA · dados salvos apenas neste aparelho</p>`;

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
    if (modo === 'share') await compartilhar(blob, nome, 'application/json'); else baixar(blob, nome);
    u.ultimoBackup = new Date().toISOString();
    await store.salvarUsuario();
    telaConfig();
  };
  $('#bbk').onclick = () => backup('share');
  $('#bbkd').onclick = () => backup('baixar');
  $('#brest').onclick = () => restaurarBackup();
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
  $('#bsair').onclick = () => { store.sair(); S.fichas = []; go('#/'); };
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
      if (store.usuarioAtual()) { S.fichas = await store.listarFichas(); go('#/lista'); } else telaLogin();
    } catch (e) { toast('Não foi possível restaurar: ' + e.message, 5000); }
  };
  i.click();
}

// ---------------------------------------------------------------- início
window.addEventListener('visibilitychange', () => { if (document.hidden) salvarAgora(); });
window.addEventListener('pagehide', () => salvarAgora());
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
