// Modelo de dados da ficha, catálogos e utilidades de tempo.

export const N_MEDICAMENTOS = 7;

export const VIAS = ['IV', 'IM', 'SC', 'IT', 'PD', 'VO', 'Inal', 'Tóp', 'Perineural'];
export const UNIDADES = ['mg', 'mcg', 'g', 'ml', 'UI', '%', 'mEq'];

// Favoritos padrão: nome, unidade, via, dose sugerida, conteúdo da ampola (na unidade) para calcular Amp.
export const DROGAS_PADRAO = [
  { nome: 'Midazolam', unid: 'mg', via: 'IV', dose: 2, amp: 15 },
  { nome: 'Fentanil', unid: 'mcg', via: 'IV', dose: 100, amp: 500 },
  { nome: 'Sufentanil', unid: 'mcg', via: 'IV', dose: 10, amp: 50 },
  { nome: 'Remifentanil', unid: 'mg', via: 'IV', dose: 1, amp: 2 },
  { nome: 'Propofol', unid: 'mg', via: 'IV', dose: 150, amp: 200 },
  { nome: 'Cetamina', unid: 'mg', via: 'IV', dose: 30, amp: 500 },
  { nome: 'Etomidato', unid: 'mg', via: 'IV', dose: 20, amp: 20 },
  { nome: 'Lidocaína', unid: 'mg', via: 'IV', dose: 60, amp: 400 },
  { nome: 'Rocurônio', unid: 'mg', via: 'IV', dose: 50, amp: 50 },
  { nome: 'Cisatracúrio', unid: 'mg', via: 'IV', dose: 10, amp: 10 },
  { nome: 'Succinilcolina', unid: 'mg', via: 'IV', dose: 100, amp: 100 },
  { nome: 'Sugamadex', unid: 'mg', via: 'IV', dose: 200, amp: 200 },
  { nome: 'Neostigmina', unid: 'mg', via: 'IV', dose: 2, amp: 0.5 },
  { nome: 'Atropina', unid: 'mg', via: 'IV', dose: 0.5, amp: 0.25 },
  { nome: 'Efedrina', unid: 'mg', via: 'IV', dose: 10, amp: 50 },
  { nome: 'Fenilefrina', unid: 'mcg', via: 'IV', dose: 100, amp: 10000 },
  { nome: 'Metaraminol', unid: 'mg', via: 'IV', dose: 0.5, amp: 10 },
  { nome: 'Dexametasona', unid: 'mg', via: 'IV', dose: 10, amp: 10 },
  { nome: 'Ondansetrona', unid: 'mg', via: 'IV', dose: 8, amp: 8 },
  { nome: 'Dipirona', unid: 'g', via: 'IV', dose: 2, amp: 1 },
  { nome: 'Cetoprofeno', unid: 'mg', via: 'IV', dose: 100, amp: 100 },
  { nome: 'Tramadol', unid: 'mg', via: 'IV', dose: 100, amp: 100 },
  { nome: 'Morfina', unid: 'mg', via: 'IV', dose: 3, amp: 10 },
  { nome: 'Cefazolina', unid: 'g', via: 'IV', dose: 2, amp: 1 },
  { nome: 'Bupivacaína pesada 0,5%', unid: 'mg', via: 'IT', dose: 15, amp: 20 },
  { nome: 'Morfina (raqui)', unid: 'mcg', via: 'IT', dose: 80, amp: 200 },
  { nome: 'Ropivacaína', unid: 'mg', via: 'PD', dose: 100, amp: 150 },
  { nome: 'Sevoflurano', unid: '%', via: 'Inal', dose: 2, amp: 0 },
];

export const FLUIDOS = [
  { nome: 'Ringer lactato', tipo: 'cristaloide' },
  { nome: 'SF 0,9%', tipo: 'cristaloide' },
  { nome: 'SG 5%', tipo: 'cristaloide' },
  { nome: 'Gelatina', tipo: 'coloide' },
  { nome: 'Albumina', tipo: 'coloide' },
  { nome: 'Conc. hemácias', tipo: 'hemoderivado' },
  { nome: 'Plasma fresco', tipo: 'hemoderivado' },
  { nome: 'Plaquetas', tipo: 'hemoderivado' },
];

export const EVENTOS_RAPIDOS = [
  'Entrada em sala', 'Monitorização', 'Pré-oxigenação', 'Indução', 'Intubação',
  'Punção', 'Posicionamento', 'Incisão', 'Extubação', 'Saída de sala',
];

export const MONITORIZACAO = [
  ['cardioscopio', 'Cardioscópio'], ['oximetro', 'Oxímetro'], ['capnografo', 'Capnógrafo'],
  ['pani', 'PANI'], ['pam', 'PAM'], ['pvc', 'PVC'], ['diurese', 'Diurese'], ['bis', 'BIS'],
  ['temperatura', 'Temperatura'],
];

export const EQUIPAMENTOS = [
  ['bomba', 'Bomba Infusão'], ['sondaVesical', 'Sonda Vesical'], ['sondaGastrica', 'Sonda Gástrica'],
  ['colchao', 'Colchão Térmico'], ['manta', 'Manta Térmica'], ['desfibrilador', 'Desfibrilador'],
];

// Avaliação pré-anestésica: [chave, título, itens, tem campo "outro"]
export const PRE_GRUPOS = [
  ['cardio', 'Cardiocirculatório', [['has', 'Hipertensão'], ['angina', 'Angina / Coronariopatia'], ['iam', 'Infarto do miocárdio'],
    ['ic', 'Insuf. cardíaca'], ['valvulopatia', 'Valvulopatia'], ['arritmia', 'Arritmia'], ['angioplastia', 'Angioplastia']], true],
  ['respiratorio', 'Respiratório', [['asma', 'Asma / Bronquite'], ['dpoc', 'DPOC'], ['apneia', 'Apneia do sono'], ['ivas', 'IVAS recente'],
    ['o2', 'Dependência de O₂'], ['expectoracao', 'Expectoração'], ['tuberculose', 'Tuberculose']], true],
  ['gastro', 'Gastrointestinal/Hepático', [['refluxo', 'Refluxo gastroesofágico'], ['hiato', 'Hérnia de hiato'], ['obstrucao', 'Obstrução intestinal'],
    ['ulcera', 'Úlcera péptica'], ['vomito', 'Vômito / diarreia'], ['gastrite', 'Gastrite'], ['hepatite', 'Hepatite'], ['ictericia', 'Icterícia'], ['cirrose', 'Cirrose']], true],
  ['neuro', 'Neurológico', [['convulsoes', 'Convulsões'], ['avc', 'AVC'], ['cefaleia', 'Cefaleia'], ['lesaoMedular', 'Lesão medular'],
    ['fraqueza', 'Dormência / fraqueza'], ['parestesias', 'Parestesias']], true],
  ['renal', 'Renal', [['drc', 'Doença renal crônica'], ['ira', 'Insuf. renal aguda'], ['dialise', 'Diálise']], true],
  ['endocrino', 'Endócrino', [['diabetes', 'Diabetes'], ['obesidade', 'Obesidade'], ['tireoide', 'Patologia da tireoide']], true],
  ['infeccioso', 'Infeccioso', [['hiv', 'HIV'], ['hepatite', 'Hepatite viral']], true],
  ['habitos', 'Hábitos sociais', [['tabaco', 'Tabaco'], ['alcool', 'Álcool'], ['drogas', 'Drogas']], true],
];
// Grupos retirados da ficha (dados antigos vão para "Outros")
export const PRE_GRUPOS_ANTIGOS = [
  ['musculo', 'Músculo esquelético', [['lombar', 'Dor lombar']]],
  ['hemato', 'Hematológico', [['anemia', 'Anemia'], ['coagulopatia', 'Coagulopatia'], ['hemotransfusao', 'Hemotransfusão prévia']]],
];

// Infusões contínuas e gases. faixa = referência (Miller's Anesthesia, Stoelting, Barash; consensos usuais).
// unid: unidade da dose; tci: unidade do alvo quando usado em TCI.
export const INFUSOES = [
  { nome: 'Propofol', unid: 'mcg/kg/min', faixa: 'sedação 25–75 · anestesia 100–200', tci: 'mcg/mL', faixaTci: '2–6 mcg/mL (sedação 0,5–2)' },
  { nome: 'Remifentanil', unid: 'mcg/kg/min', faixa: '0,05–0,5 (sedação 0,025–0,1)', tci: 'ng/mL', faixaTci: '2–8 ng/mL' },
  { nome: 'Sufentanil', unid: 'mcg/kg/h', faixa: '0,1–0,5', tci: 'ng/mL', faixaTci: '0,1–0,5 ng/mL' },
  { nome: 'Fentanil', unid: 'mcg/kg/h', faixa: '0,5–3' },
  { nome: 'Dexmedetomidina', unid: 'mcg/kg/h', faixa: '0,2–0,7 (até 1,4)' },
  { nome: 'Cetamina', unid: 'mg/kg/h', faixa: 'analgesia 0,1–0,3' },
  { nome: 'Lidocaína', unid: 'mg/kg/h', faixa: '1–2' },
  { nome: 'Sulfato de magnésio', unid: 'mg/kg/h', faixa: '10–20' },
  { nome: 'Noradrenalina', unid: 'mcg/kg/min', faixa: '0,01–0,5' },
  { nome: 'Adrenalina', unid: 'mcg/kg/min', faixa: '0,01–0,5' },
  { nome: 'Dobutamina', unid: 'mcg/kg/min', faixa: '2–20' },
  { nome: 'Dopamina', unid: 'mcg/kg/min', faixa: '2–20 (1–5 dopa · 5–10 β · >10 α)' },
  { nome: 'Fenilefrina', unid: 'mcg/kg/min', faixa: '0,1–1' },
  { nome: 'Vasopressina', unid: 'UI/min', faixa: '0,01–0,04' },
  { nome: 'Nitroglicerina', unid: 'mcg/kg/min', faixa: '0,5–5' },
  { nome: 'Nitroprussiato', unid: 'mcg/kg/min', faixa: '0,3–3 (evitar >2 prolongado)' },
  { nome: 'Esmolol', unid: 'mcg/kg/min', faixa: '50–300' },
  { nome: 'Milrinona', unid: 'mcg/kg/min', faixa: '0,375–0,75' },
  { nome: 'Ocitocina', unid: 'UI/h', faixa: '2,5–10' },
  { nome: 'Rocurônio', unid: 'mg/kg/h', faixa: '0,3–0,6' },
  { nome: 'Cisatracúrio', unid: 'mcg/kg/min', faixa: '1–2' },
  { nome: 'Insulina regular', unid: 'UI/h', faixa: 'conforme glicemia' },
  { nome: 'O₂', unid: 'L/min', faixa: 'conforme fluxo', gas: true },
  { nome: 'Ar comprimido', unid: 'L/min', faixa: 'conforme fluxo', gas: true },
  { nome: 'N₂O', unid: 'L/min', faixa: 'conforme fluxo', gas: true },
  { nome: 'Sevoflurano', unid: '%', faixa: '0,5–3 (CAM ≈ 2)', gas: true },
  { nome: 'Desflurano', unid: '%', faixa: '3–8 (CAM ≈ 6)', gas: true },
  { nome: 'Isoflurano', unid: '%', faixa: '0,5–1,5 (CAM ≈ 1,15)', gas: true },
];
export const UNID_INFUSAO = ['mcg/kg/min', 'mcg/kg/h', 'mg/kg/h', 'mg/h', 'mcg/min', 'UI/min', 'UI/h', 'mL/h', 'L/min', '%'];

export const ALDRETE = [
  ['atividade', 'Atividade muscular', ['Incapaz de mover nenhum membro', 'Move 2 membros (voluntário/comando)', 'Move 4 membros (voluntário/comando)']],
  ['respiracao', 'Respiração', ['Apneia', 'Dispneia ou respiração limitada', 'Respira fundo e tosse livremente']],
  ['circulacao', 'Circulação', ['PA ± 50 do pré-anestésico', 'PA ± 20 a 50 do pré-anestésico', 'PA ± 20 do pré-anestésico']],
  ['spo2', 'SpO₂', ['< 90% com O₂', '> 90% com O₂', '> 92% em ar ambiente']],
  ['consciencia', 'Consciência', ['Não responde ao estímulo auditivo', 'Desperta quando estimulado', 'Completamente acordado']],
];
export const ALDRETE_TEMPOS = [['entrada', 'Entrada'], ['t15', "15'"], ['t30', "30'"], ['t60', "60'"], ['saida', 'Saída']];

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function pad(n) { return String(n).padStart(2, '0'); }

export function hhmm(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dataBR(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function dataHoraBR(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Converte "HH:MM" em data completa: escolhe o dia que deixa o horário mais perto de `ref`
// (cirurgias que atravessam a meia-noite).
export function horaParaISO(hm, ref = new Date()) {
  const [h, m] = hm.split(':').map(Number);
  let best = null;
  for (const delta of [-1, 0, 1]) {
    const d = new Date(ref);
    d.setDate(d.getDate() + delta);
    d.setHours(h, m, 0, 0);
    if (!best || Math.abs(d - ref) < Math.abs(best - ref)) best = d;
  }
  return best.toISOString();
}

function novaPre() {
  return {
    dataAval: hojeISO(), horaAval: '',
    diagnostico: '', procedimento: '',
    pa: '', fc: '', temp: '', fr: '', jejumSolidos: '', jejumLiquidos: '', dor: '', dorEscala: 'Adulto',
    negativos: {}, itens: {}, outros: {}, outrosGeral: '', toleranciaExercicio: '',
    diabetesTipo: '', cigarros: '', cancer: '', cancerLocal: '', qt: false, rt: false,
    gravidez: '', igSemanas: '', dum: '', nvpo: '', histFamiliar: '',
    alergiaNeg: false, alergias: [{ agente: '', reacao: '' }, { agente: '', reacao: '' }, { agente: '', reacao: '' }],
    previaNeg: false, previas: [{ cirurgia: '', anestesia: '', dados: '' }, { cirurgia: '', anestesia: '', dados: '' }, { cirurgia: '', anestesia: '', dados: '' }],
    medicamentos: Array.from({ length: N_MEDICAMENTOS }, () => ({ nome: '', dose: '', ult24: '' })),
    vad: '', pescoco: '', protrusao: '', flexao: '', previsaoVad: '', mallampati: '', viaOutros: '',
    exame: { cardiaco: '', resp: '', neuro: '', regional: '', outro: '' },
    examesPre: ['', '', '', '', '', ''],
    asa: '', emergencia: '', reservaSangue: '', hemo: { ch: '', plaq: '', plasma: '', crio: '' },
    tecProposta: '', tecAlternativa: '', uti: '', outraEspecialidade: '', liberado: '', comentarios: '',
  };
}

export function novaFicha(user) {
  return {
    id: uid(),
    userId: user.id,
    status: 'rascunho', // rascunho | finalizada | revisao
    versao: 0,
    criadaEm: new Date().toISOString(),
    atualizadaEm: new Date().toISOString(),
    finalizadaEm: null,
    auditoria: [{ em: new Date().toISOString(), acao: 'Ficha criada', por: `${user.nome} (CRM ${user.crm})` }],
    anestesista: { nome: user.nome, crm: user.crm, uf: user.uf },
    pac: {
      nome: '', idade: '', data: hojeISO(), sexo: '', convenio: '', matricula: '', carater: '',
      peso: '', altura: '', nascimento: '', jejum: '', cirurgiao: '', cirurgiaoCrm: '', aux1: '', aux2: '', intervencoes: ['', '', '', '', ''],
    },
    tempos: { inicioAnest: null, inicioCir: null, fimCir: null, fimAnest: null },
    vitais: [], // {id, t, pas, pad, fc, spo2, etco2, temp, ritmo}
    drogas: [], // {id, t, nome, dose, unid, via}
    fluidos: [], // {id, t, nome, tipo, vol}
    eventos: [], // {id, t, texto}
    infusoes: [], // {id, nome, unid, tci, gas, etapas:[{t, valor}], fim, totalManual}
    monit: {}, equip: {}, labs: ['', '', '', '', '', '', '', '', ''],
    acesso: { perifNum: '', local: '', centralVia: '', interc: '', mpa: '' },
    anest: {
      geral: false, geralIV: false, geralInal: false, geralBal: false, sedacao: false, o2: '',
      local: false, locoregional: false, peridural: false, cateter: false, cateterNum: '',
      subaracnoidea: false, agulha: '', localNeuro: '', bloqueio: false, estimulador: false,
      localBloq: '', interc: '', intercDesc: '',
    },
    vent: {
      espontanea: false, vcm: false, vcv: false, pcv: false, mascFacial: false, mascLaringea: false,
      mlNum: '', intubacao: '', tuboNum: '', dificuldade: '', interc: '', intercDesc: '',
    },
    balanco: { diurese: '', cristaloide: '', coloide: '', perdas: '', ganhos: '' },
    saida: { estado: '', destino: '' },
    anotacoes: '',
    pre: novaPre(),
    srpa: {
      admHora: '', admPas: '', admPad: '', admFc: '', admSpo2: '',
      aldrete: {}, // aldrete[tempo][criterio] = 0|1|2
      prescricao: [{ item: '', quant: '', horario: '' }, { item: '', quant: '', horario: '' }, { item: '', quant: '', horario: '' }],
      intercorrencias: '',
      altaHora: '', altaPas: '', altaPad: '', altaFc: '', altaSpo2: '', encaminhado: '',
      medicoOutro: '', medicoNome: '', medicoCrm: '', // médico da SRPA quando não é o anestesista
    },
  };
}

// Totais calculados a partir da linha do tempo.
export function calcBalanco(f) {
  const soma = (tipo) => f.fluidos.filter((x) => x.tipo === tipo).reduce((a, x) => a + (+x.vol || 0), 0);
  const cristaloide = soma('cristaloide');
  const coloide = soma('coloide');
  const hemo = soma('hemoderivado');
  const diurese = +f.balanco.diurese || 0;
  return { cristaloide, coloide, hemo, ganhos: cristaloide + coloide + hemo, diurese };
}

export function resumoDrogas(f, favoritos) {
  const map = new Map();
  for (const d of f.drogas) {
    const k = `${d.nome}|${d.unid}|${d.via}`;
    const cur = map.get(k) || { nome: d.nome, unid: d.unid, via: d.via, total: 0 };
    cur.total += +String(d.dose).replace(',', '.') || 0;
    map.set(k, cur);
  }
  return [...map.values()].map((r) => {
    const fav = (favoritos || []).find((x) => x.nome === r.nome && x.unid === r.unid);
    r.amp = fav && fav.amp > 0 ? Math.ceil(r.total / fav.amp - 1e-9) : '';
    r.total = Math.round(r.total * 100) / 100;
    return r;
  });
}

export function aldreteTotal(f, tempo) {
  const a = f.srpa.aldrete[tempo];
  if (!a) return '';
  const vals = ALDRETE.map(([k]) => a[k]).filter((v) => v !== undefined && v !== '');
  if (!vals.length) return '';
  return vals.reduce((s, v) => s + +v, 0);
}

export function num(v) {
  return String(v ?? '').replace('.', ',');
}

export function imc(f) {
  const p = +normNumero(f.pac.peso), a = +normNumero(f.pac.altura) / 100;
  if (!p || !a) return '';
  return Math.round((p / (a * a)) * 10) / 10;
}

export function normNumero(v) {
  return String(v ?? '').trim().replace(',', '.');
}

// Dose total de uma infusão contínua (soma de cada etapa: dose × peso × tempo).
// Retorna { valor, unid } ou null quando não se aplica (gases, TCI sem total informado).
export function totalInfusao(inf, peso, agora = Date.now()) {
  if (inf.tci || inf.gas) {
    if (inf.totalManual) return { valor: inf.totalManual, unid: inf.totalUnid || 'mg', manual: true };
    return null;
  }
  const fim = inf.fim ? +new Date(inf.fim) : agora;
  const kg = +normNumero(peso) || 0;
  const u = inf.unid;
  const porKg = u.includes('/kg/');
  if (porKg && !kg) return null;
  let soma = 0;
  inf.etapas.forEach((e, i) => {
    const ini = +new Date(e.t);
    const ate = i + 1 < inf.etapas.length ? +new Date(inf.etapas[i + 1].t) : fim;
    const min = Math.max(0, (ate - ini) / 60000);
    const v = +normNumero(e.valor) || 0;
    const tempo = u.endsWith('/min') ? min : min / 60;
    soma += v * tempo * (porKg ? kg : 1);
  });
  let unid = u.split('/')[0]; // mcg, mg, UI, mL
  if (unid === 'mcg' && soma >= 1000) { soma /= 1000; unid = 'mg'; }
  return { valor: Math.round(soma * 100) / 100, unid };
}

export const rotuloInfusao = (inf) => `${inf.nome} (${inf.tci ? 'TCI ' + inf.tci : inf.unid})`;

// Completa fichas criadas em versões anteriores do app com os campos novos.
export function normalizarFicha(f) {
  f.pac.cirurgiaoCrm ??= '';
  f.pac.altura ??= '';
  f.pac.nascimento ??= '';
  f.infusoes ??= [];
  f.srpa.medicoOutro ??= ''; f.srpa.medicoNome ??= ''; f.srpa.medicoCrm ??= '';
  const p = f.pre;
  const base = novaPre();
  for (const k of Object.keys(base)) if (p[k] === undefined) p[k] = base[k];
  if (p.dataAval === base.dataAval && f.pac.data) p.dataAval = f.pac.data;
  // alergias / cirurgias prévias eram linhas de texto
  p.alergias = p.alergias.map((a) => (typeof a === 'string' ? { agente: a, reacao: '' } : a));
  p.previas = p.previas.map((a) => (typeof a === 'string' ? { cirurgia: a, anestesia: '', dados: '' } : a));
  // medicamentos: eram até 12 linhas de texto; agora 7 linhas com dose e uso nas últimas 24 h
  if (p.medicamentos.some((m) => typeof m === 'string')) {
    const txt = p.medicamentos.map((m) => (typeof m === 'string' ? m : m.nome)).filter(Boolean);
    const linhas = txt.slice(0, N_MEDICAMENTOS - 1);
    if (txt.length >= N_MEDICAMENTOS) linhas.push(txt.slice(N_MEDICAMENTOS - 1).join('; '));
    p.medicamentos = linhas.map((nome) => ({ nome, dose: '', ult24: '' }));
  }
  while (p.medicamentos.length < N_MEDICAMENTOS) p.medicamentos.push({ nome: '', dose: '', ult24: '' });
  // hematológico / músculo esquelético foram retirados: o que estava marcado vai para "Outros"
  const antigos = [];
  for (const [k, , itens] of PRE_GRUPOS_ANTIGOS) {
    for (const [ik, il] of itens) if (p.itens[`${k}_${ik}`]) { antigos.push(il); delete p.itens[`${k}_${ik}`]; }
    if (p.outros[k]) { antigos.push(p.outros[k]); delete p.outros[k]; }
  }
  if (antigos.length) p.outrosGeral = [p.outrosGeral, antigos.join(', ')].filter(Boolean).join('; ');
  return f;
}

export const temTecnica = (f) => {
  const a = f.anest;
  return !!(a.na || a.geral || a.geralIV || a.geralInal || a.geralBal || a.sedacao || a.local || a.locoregional
    || a.peridural || a.cateter || a.subaracnoidea || a.bloqueio || a.estimulador);
};
export const temVentilacao = (f) => {
  const v = f.vent;
  return !!(v.na || v.espontanea || v.vcm || v.vcv || v.pcv || v.mascFacial || v.mascLaringea || v.intubacao);
};
export const temAcesso = (f) => !!(f.acesso.na || String(f.acesso.perifNum).trim() || String(f.acesso.centralVia).trim());

// Itens sem os quais a ficha não pode ser finalizada.
export function obrigatoriosFaltando(f) {
  const p = [];
  if (!temTecnica(f)) p.push('Tipo de anestesia');
  if (!temVentilacao(f)) p.push('Ventilação / via aérea');
  if (!temAcesso(f)) p.push('Acesso venoso (periférico ou central)');
  return p;
}
