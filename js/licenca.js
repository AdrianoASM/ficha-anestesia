// Código de acesso: liberado pelo responsável (gerador de códigos, fora do app).
// O código é assinado (ECDSA P-256); aqui só existe a chave PÚBLICA, que apenas confere a assinatura.
const CHAVE_PUBLICA = {"key_ops":["verify"],"ext":true,"kty":"EC","x":"Lp6-sPpxzfLs_puwSDBEYbHCcA6TFfXczyihizQv7qw","y":"xaQI55U7EUgWtvMcRlKZSaFf2qyVj6rGb7-JE-gMkeQ","crv":"P-256"};
const CHAVE_LOCAL = 'licenca';
const URL_BLOQUEIOS = 'https://adrianoasm.github.io/ficha-anestesia/revogados.json';

const b64urlParaBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

let chave;
async function chavePublica() {
  chave ??= await crypto.subtle.importKey('jwk', CHAVE_PUBLICA, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return chave;
}

// Confere um código. Retorna { ok, dados: { i (id), n (nome), e (validade AAAA-MM-DD ou '') }, motivo }.
export async function verificar(codigo) {
  try {
    const [p, a] = String(codigo || '').trim().split('.');
    if (!p || !a) return { ok: false, motivo: 'Código incompleto.' };
    const valido = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await chavePublica(), b64urlParaBytes(a), b64urlParaBytes(p));
    if (!valido) return { ok: false, motivo: 'Código inválido.' };
    const dados = JSON.parse(new TextDecoder().decode(b64urlParaBytes(p)));
    const hoje = new Date().toISOString().slice(0, 10);
    if (dados.e && dados.e < hoje) return { ok: false, dados, motivo: `Código vencido em ${dados.e.split('-').reverse().join('/')}.` };
    if (bloqueados().includes(dados.i)) return { ok: false, dados, motivo: 'Este código foi bloqueado pelo responsável.' };
    return { ok: true, dados };
  } catch {
    return { ok: false, motivo: 'Código inválido.' };
  }
}

const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const bloqueados = () => { try { return JSON.parse(ler('licenca-bloqueios')) || []; } catch { return []; } };

export const codigoSalvo = () => ler(CHAVE_LOCAL);
export function salvar(codigo) { gravar(CHAVE_LOCAL, String(codigo).trim()); }
export function remover() { try { localStorage.removeItem(CHAVE_LOCAL); } catch { /* ok */ } }

// Atualiza a lista de códigos bloqueados (quando há internet). Sem internet, vale a última lista recebida.
export async function atualizarBloqueios() {
  try {
    const r = await fetch(URL_BLOQUEIOS + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const lista = await r.json();
    if (Array.isArray(lista)) gravar('licenca-bloqueios', JSON.stringify(lista.map(String)));
  } catch { /* sem internet */ }
}
