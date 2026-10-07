// Planilha anual de anestesias (.xlsx) — edição de uso pessoal.
// Uma linha por ficha finalizada; o arquivo do ano é refeito inteiro a partir das fichas do aparelho.
import { PRE_GRUPOS, imc } from './model.js';

export const COLUNAS = [
  ['Data', 11], ['Anestesista', 11], ['Paciente', 10], ['Procedimento cirúrgico', 38], ['Sexo', 6], ['Faixa etária', 11],
  ['ASA', 6], ['Comorbidades', 40], ['Elegível protocolo de glicemia', 14], ['Técnica anestésica', 28],
  ['Eventos', 40], ['Óbito ou transferência para UTI relacionado à anestesia', 18],
];

const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'd']);
export const iniciais = (nome, max = 99) => String(nome || '').trim().split(/[\s.]+/)
  .filter((w) => w && !PARTICULAS.has(w.toLowerCase().replace(/[’']$/, '')))
  .slice(0, max).map((w) => w[0].toUpperCase()).join('');

export function faixaEtaria(idade) {
  const n = parseInt(idade, 10);
  if (Number.isNaN(n)) return '';
  return n <= 13 ? '0-13' : n <= 17 ? '14-17' : n <= 64 ? '18-64' : '65 ou mais';
}

const rotulo = (k, ik) => PRE_GRUPOS.find(([g]) => g === k)?.[2].find(([i]) => i === ik)?.[1] || ik;

export function comorbidades(f) {
  const p = f.pre, it = p.itens || {}, out = p.outros || {};
  const tem = (k, ...iks) => iks.some((ik) => it[`${k}_${ik}`]);
  const usados = new Set();
  const marca = (k, iks) => iks.forEach((ik) => usados.add(`${k}_${ik}`));
  const lista = [];
  const add = (nome, cond, k, iks) => { if (cond) lista.push(nome); if (k) marca(k, iks); };
  add('DM', tem('endocrino', 'diabetes'), 'endocrino', ['diabetes']);
  add('HAS', tem('cardio', 'has'), 'cardio', ['has']);
  add('Tireoide', tem('endocrino', 'tireoide'), 'endocrino', ['tireoide']);
  const renal = ['drc', 'ira', 'dialise'];
  add('Renal', tem('renal', ...renal) || out.renal, 'renal', renal);
  const cardio = ['angina', 'iam', 'ic', 'valvulopatia', 'arritmia', 'angioplastia'];
  add('Cardiopatia', tem('cardio', ...cardio) || out.cardio, 'cardio', cardio);
  add('Obesidade', tem('endocrino', 'obesidade') || +imc(f) >= 30, 'endocrino', ['obesidade']);
  add('Gestante', p.gravidez === 'Positivo');
  add('Tabagismo', tem('habitos', 'tabaco'), 'habitos', ['tabaco']);
  add('Etilismo', tem('habitos', 'alcool'), 'habitos', ['alcool']);
  add('Usuário de drogas', tem('habitos', 'drogas'), 'habitos', ['drogas']);
  const psiq = ['fobia', 'esquizofrenia', 'depressao', 'ansiedade', 'demencia'];
  add('Transtorno psiquiátrico', tem('psiquiatrico', ...psiq) || out.psiquiatrico, 'psiquiatrico', psiq);
  add('AVC', tem('neuro', 'avc'), 'neuro', ['avc']);
  const pneumo = ['asma', 'dpoc', 'apneia', 'o2', 'tuberculose'];
  add('Pneumopatia', tem('respiratorio', ...pneumo) || out.respiratorio, 'respiratorio', pneumo);
  // Outros: demais itens marcados e textos livres que não entraram acima
  const outros = Object.keys(it).filter((c) => it[c] && !usados.has(c)).map((c) => { const [k, ik] = c.split('_'); return rotulo(k, ik); });
  for (const [k, v] of Object.entries(out)) if (v && !['renal', 'cardio', 'psiquiatrico', 'respiratorio'].includes(k)) outros.push(v);
  if (p.cancer === 'Positivo') outros.push('Câncer' + (p.cancerLocal ? ` (${p.cancerLocal})` : ''));
  if (p.outrosGeral) outros.push(p.outrosGeral);
  if (outros.length) lista.push('Outro: ' + outros.join(', '));
  return lista.join(', ') || 'Nenhuma';
}

// Glicemia > 180 mg/dL anotada nos exames pré-operatórios ou nos laboratoriais do intraoperatório
export function glicemiaAlta(f) {
  const textos = [...(f.pre.examesPre || []), ...(f.labs || [])].map(String);
  return textos.some((t) => [...t.matchAll(/gli[a-zç]*\.?\s*[:=]?\s*(\d{2,3})/gi)].some((m) => +m[1] > 180));
}

// Categorias do formulário de qualidade: Local, Sedação, Geral, Raqui, Peri, Bloqueio troncular, Bloqueio peribulbar…
export function tecnica(f) {
  const a = f.anest;
  if (a.na) return 'Não se aplica';
  const peribulbar = /peri.?bulbar|retro.?bulbar|sub.?tenon/i.test(`${a.localBloq} ${a.localNeuro}`);
  const t = [];
  if (a.local) t.push('Local');
  if (a.sedacao) t.push('Sedação');
  if (a.geral || a.geralBal || a.geralIV || a.geralInal) t.push('Geral');
  if (a.subaracnoidea) t.push('Raqui');
  if (a.peridural || a.cateter) t.push('Peri');
  if (a.bloqueio) t.push(peribulbar ? 'Bloqueio peribulbar' : 'Bloqueio troncular');
  if (a.locoregional && !t.some((x) => /Raqui|Peri|Bloqueio/.test(x))) t.push('Bloqueio troncular');
  return t.join(' + ');
}

// Eventos no padrão do formulário de qualidade: classificados pelas intercorrências descritas na ficha
// e por dados objetivos (dor na SRPA >= 4, ida para UTI, óbito, via aérea difícil).
const CATEGORIAS = [
  ['Mudança de técnica anestésica', /mudan[cç]a de t[eé]cnica|convers[aã]o (para|p\/) geral/i],
  ['Anafilaxia', /anafila/i],
  ['Reação alérgica', /al[eé]rgi|urtic[aá]ria|rash|broncoespasmo al/i],
  ['VAD', /via a[eé]rea dif|\bvad\b|intuba[cç][aã]o dif|tentativas|troca (de|do) (tubo|dispositivo|m[aá]scara)/i],
  ['Náusea e vômito', /n[aá]usea|v[oô]mito|nvpo/i],
  ['Hipotensão', /hipotens/i],
  ['Dessaturação', /dessatura|hipox|spo2? ?(<|baix)/i],
  ['Agitação', /agita|delirium/i],
  ['Hipotermia', /hipotermia/i],
  ['Intoxicação por anestésico local', /intoxica|last\b|toxicidade (sist[eê]mica )?(por|do|de) anest/i],
  ['Hipertermia maligna', /hipertermia maligna/i],
  ['PCR', /\bpcr\b|parada card/i],
  ['Falha do bloqueio', /falha (do |de |no )?bloq|bloqueio (falho|insuficiente|parcial)|falha (da |de )?raqui/i],
];

export function eventos(f) {
  const textos = [];
  if (f.anest.interc === 'Sim') textos.push(f.anest.intercDesc || 'Intercorrência na anestesia');
  if (f.vent.interc === 'Sim') textos.push(f.vent.intercDesc || 'Intercorrência na via aérea');
  if (f.acesso.interc === 'Sim') textos.push('Intercorrência no acesso venoso');
  if (String(f.srpa.intercorrencias || '').trim()) textos.push(f.srpa.intercorrencias.trim());
  const ev = new Set(), outros = [];
  for (const t of textos) {
    const achou = CATEGORIAS.filter(([, re]) => re.test(t)).map(([n]) => n);
    achou.forEach((n) => ev.add(n));
    if (!achou.length) outros.push(t);
  }
  if (ev.has('Anafilaxia')) ev.delete('Reação alérgica');
  if (f.vent.dificuldade === 'Difícil' && f.pre.previsaoVad !== 'Sim') ev.add('VAD');
  if (+f.srpa.admDor >= 4 || +f.srpa.altaDor >= 4) ev.add('Dor aguda (score ≥ 4)');
  if (uti(f)) ev.add('Transferência para UTI');
  if (f.saida?.estado === 'Óbito') ev.add('Óbito');
  const ordem = [...CATEGORIAS.map(([n]) => n), 'Dor aguda (score ≥ 4)', 'Transferência para UTI', 'Óbito'];
  const lista = ordem.filter((n) => ev.has(n));
  if (outros.length) lista.push('Outro: ' + outros.join('; '));
  return lista.join(', ') || 'Sem evento';
}

const uti = (f) => f.saida?.destino === 'UTI' || f.srpa.encaminhado === 'UTI';

// Óbito, ou UTI não prevista na avaliação pré-anestésica → "Necessário investigação" (a relação com a anestesia é julgada depois)
export function obitoOuUti(f) {
  if (f.saida?.estado === 'Óbito') return 'Necessário investigação';
  if (uti(f) && f.pre.uti !== 'Sim') return 'Necessário investigação';
  return 'Não';
}

// Ficha como entra na planilha (a finalizada; em revisão, a versão finalizada anterior)
const versaoFinal = (f) => (f.status === 'finalizada' ? f : f.status === 'revisao' && f.revisaoBase ? { ...f, ...f.revisaoBase } : null);

export function linha(f, iniciaisAnest) {
  const p = f.pre;
  return [
    { data: f.pac.data },
    iniciaisAnest,
    iniciais(f.pac.nome),
    f.pac.intervencoes?.[0] || p.procedimento || '',
    f.pac.sexo || '',
    faixaEtaria(f.pac.idade),
    p.asa ? p.asa + (p.emergencia === 'Sim' ? 'E' : '') : '',
    comorbidades(f),
    p.itens?.endocrino_diabetes || glicemiaAlta(f) ? 'Sim' : 'Não',
    tecnica(f),
    eventos(f),
    obitoOuUti(f),
  ];
}

export function anosComFichas(fichas) {
  return [...new Set(fichas.map(versaoFinal).filter(Boolean).map((f) => (f.pac.data || '').slice(0, 4)).filter(Boolean))].sort().reverse();
}

export function linhasDoAno(fichas, ano, iniciaisAnest) {
  return fichas.map(versaoFinal).filter((f) => f && (f.pac.data || '').startsWith(ano))
    .sort((a, b) => `${a.pac.data}${a.tempos.inicioAnest || ''}`.localeCompare(`${b.pac.data}${b.tempos.inicioAnest || ''}`))
    .map((f) => linha(f, iniciaisAnest));
}

// ---------------------------------------------------------------- .xlsx (zip sem compressão)
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const col = (i) => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const serialData = (iso) => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };

function folha(linhas) {
  const cab = `<row r="1">${COLUNAS.map(([t], i) => `<c r="${col(i)}1" t="inlineStr" s="1"><is><t>${xml(t)}</t></is></c>`).join('')}</row>`;
  const corpo = linhas.map((ln, r) => `<row r="${r + 2}">${ln.map((v, i) => {
    const ref = `${col(i)}${r + 2}`;
    if (v && typeof v === 'object') return /^\d{4}-\d{2}-\d{2}$/.test(v.data || '') ? `<c r="${ref}" s="2"><v>${serialData(v.data)}</v></c>` : `<c r="${ref}"/>`;
    return `<c r="${ref}" t="inlineStr" s="3"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const ult = `${col(COLUNAS.length - 1)}${Math.max(1, linhas.length + 1)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${COLUNAS.map(([, w], i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${cab}${corpo}</sheetData>
<autoFilter ref="A1:${ult}"/>
</worksheet>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D5A86"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="4"><xf/>
<xf fontId="1" fillId="2" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="14" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function arquivosXlsx(linhas, nomeAba) {
  return {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(nomeAba)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(nomeAba)}'!$A$1:$${col(COLUNAS.length - 1)}$${Math.max(1, linhas.length + 1)}</definedName></definedNames></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': ESTILOS,
    'xl/worksheets/sheet1.xml': folha(linhas),
  };
}

const TAB_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TAB_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(arquivos) {
  const enc = new TextEncoder(), partes = [], central = [];
  let pos = 0;
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const n = enc.encode(nome), d = enc.encode(conteudo), crc = crc32(d);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
    loc.setUint32(14, crc, true); loc.setUint32(18, d.length, true); loc.setUint32(22, d.length, true); loc.setUint16(26, n.length, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, d.length, true); cen.setUint32(24, d.length, true); cen.setUint16(28, n.length, true);
    cen.setUint32(42, pos, true);
    partes.push(new Uint8Array(loc.buffer), n, d); central.push(new Uint8Array(cen.buffer), n);
    pos += 30 + n.length + d.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, central.length / 2, true); fim.setUint16(10, central.length / 2, true);
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const nomePlanilha = (ano) => `Anestesias ${ano}.xlsx`;
export const gerarPlanilha = (fichas, ano, iniciaisAnest) => zip(arquivosXlsx(linhasDoAno(fichas, ano, iniciaisAnest), `Anestesias ${ano}`));
