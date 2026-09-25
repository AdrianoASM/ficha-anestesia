// Armazenamento local (IndexedDB) com criptografia AES-GCM.
// Cada usuário tem uma chave de dados aleatória, guardada "embrulhada" pela senha
// e por um código de recuperação. As fichas só são legíveis com uma das duas.

const DB_NAME = 'fichaAnestesia';
const ITER = 250000;
const enc = new TextEncoder();
const dec = new TextDecoder();

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('users', { keyPath: 'id' });
      const f = d.createObjectStore('fichas', { keyPath: 'id' });
      f.createIndex('userId', 'userId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

async function deriveKey(secret, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

async function wrap(raw, secret) {
  const salt = rand(16), iv = rand(12);
  const k = await deriveKey(secret, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, raw);
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

async function unwrap(w, secret) {
  const k = await deriveKey(secret, unb64(w.salt));
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) }, k, unb64(w.ct)));
}

function codigoRecuperacao() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = rand(20);
  let s = '';
  for (let i = 0; i < 20; i++) s += abc[r[i] % abc.length] + (i % 5 === 4 && i < 19 ? '-' : '');
  return s;
}

const normRec = (c) => c.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{5})(?=.)/g, '$1-');

// Sessão em memória: some ao fechar/recarregar o app.
let sessao = null; // { user, key(CryptoKey), raw }

export function usuarioAtual() { return sessao?.user || null; }

export async function listarUsuarios() {
  return tx('users', 'readonly', (s) => s.getAll());
}

export async function criarUsuario({ nome, crm, uf, senha }) {
  const raw = rand(32);
  const recuperacao = codigoRecuperacao();
  const user = {
    id: Date.now().toString(36) + b64(rand(4)).replace(/\W/g, ''),
    nome, crm, uf,
    criadoEm: new Date().toISOString(),
    wPass: await wrap(raw, senha),
    wRec: await wrap(raw, recuperacao),
    favoritos: null,
  };
  await tx('users', 'readwrite', (s) => s.put(user));
  await abrirSessao(user, raw);
  return recuperacao;
}

async function abrirSessao(user, raw) {
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  sessao = { user, key, raw };
}

export async function login(userId, senha) {
  const user = await tx('users', 'readonly', (s) => s.get(userId));
  let raw;
  try { raw = await unwrap(user.wPass, senha); } catch { throw new Error('Senha incorreta'); }
  await abrirSessao(user, raw);
  return user;
}

export async function recuperar(userId, codigo, novaSenha) {
  const user = await tx('users', 'readonly', (s) => s.get(userId));
  let raw;
  try { raw = await unwrap(user.wRec, normRec(codigo)); } catch { throw new Error('Código de recuperação inválido'); }
  user.wPass = await wrap(raw, novaSenha);
  await tx('users', 'readwrite', (s) => s.put(user));
  await abrirSessao(user, raw);
}

export async function conferirSenha(senha) {
  try { await unwrap(sessao.user.wPass, senha); return true; } catch { return false; }
}

export async function trocarSenha(atual, nova) {
  if (!(await conferirSenha(atual))) throw new Error('Senha atual incorreta');
  sessao.user.wPass = await wrap(sessao.raw, nova);
  await salvarUsuario();
}

export async function salvarUsuario() {
  await tx('users', 'readwrite', (s) => s.put(sessao.user));
}

export function sair() { sessao = null; }

async function cifrar(obj) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessao.key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}

async function decifrar(rec) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, sessao.key, unb64(rec.ct));
  return JSON.parse(dec.decode(pt));
}

export async function salvarFicha(f) {
  f.atualizadaEm = new Date().toISOString();
  const c = await cifrar(f);
  await tx('fichas', 'readwrite', (s) => s.put({ id: f.id, userId: f.userId, atualizadaEm: f.atualizadaEm, ...c }));
}

export async function listarFichas() {
  const recs = await tx('fichas', 'readonly', (s) => s.index('userId').getAll(sessao.user.id));
  const out = [];
  for (const r of recs) {
    try { out.push(await decifrar(r)); } catch { /* registro de outra chave: ignora */ }
  }
  return out.sort((a, b) => (b.criadaEm > a.criadaEm ? 1 : -1));
}

export async function excluirFicha(id) {
  await tx('fichas', 'readwrite', (s) => s.delete(id));
}

// Backup: arquivo com o usuário (chaves embrulhadas) e as fichas ainda cifradas.
// Só abre com a senha (ou o código de recuperação) do próprio usuário.
export async function gerarBackup() {
  const fichas = await tx('fichas', 'readonly', (s) => s.index('userId').getAll(sessao.user.id));
  return {
    app: 'ficha-anestesia', formato: 1, exportadoEm: new Date().toISOString(),
    user: sessao.user, fichas,
  };
}

export async function importarBackup(data) {
  if (data?.app !== 'ficha-anestesia' || !data.user || !Array.isArray(data.fichas)) {
    throw new Error('Arquivo de backup inválido');
  }
  const existente = await tx('users', 'readonly', (s) => s.get(data.user.id));
  if (!existente) await tx('users', 'readwrite', (s) => s.put(data.user));
  let novas = 0;
  for (const r of data.fichas) {
    const cur = await tx('fichas', 'readonly', (s) => s.get(r.id));
    if (!cur || cur.atualizadaEm < r.atualizadaEm) {
      await tx('fichas', 'readwrite', (s) => s.put(r));
      novas++;
    }
  }
  return { usuarioNovo: !existente, nome: data.user.nome, fichas: novas };
}
