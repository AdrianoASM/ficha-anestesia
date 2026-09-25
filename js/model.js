// Modelo de dados da ficha, catálogos e utilidades de tempo.

export const N_MEDICAMENTOS = 12;

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
  ['cardio', 'Cardiocirculatório', [['has', 'Hipertensão Arterial'], ['angina', 'Angina / Coronariopatia'], ['arritmia', 'Arritmia']], true],
  ['renal', 'Renal', [['drc', 'Doença Renal Crônica'], ['ira', 'Insuficiência Renal Aguda']], true],
  ['infeccioso', 'Infeccioso', [['hiv', 'HIV'], ['hepatite', 'Hepatite']], true],
  ['respiratorio', 'Respiratório', [['asma', 'Asma / Bronquite'], ['dpoc', 'DPOC']], true],
  ['musculo', 'Músculo Esquelético', [['lombar', 'Dor Lombar']], true],
  ['gastro', 'Gastrointestinal', [['refluxo', 'Refluxo Gastresofágico'], ['hiato', 'Hérnia de Hiato'], ['obstrucao', 'Obstrução Intestinal']], true],
  ['endocrino', 'Endócrino', [['diabetes', 'Diabetes'], ['obesidade', 'Obesidade']], true],
  ['neuro', 'Neurológico', [['convulsoes', 'Convulsões'], ['lesaoMedular', 'Lesão Medular'], ['fraqueza', 'Fraqueza Muscular'], ['parestesias', 'Parestesias']], true],
  ['hemato', 'Hematológico', [['anemia', 'Anemia'], ['coagulopatia', 'Coagulopatia'], ['hemotransfusao', 'Hemotransfusão Prévia']], true],
  ['habitos', 'Hábitos Sociais', [['tabaco', 'Tabaco'], ['alcool', 'Álcool'], ['drogas', 'Drogas']], true],
];

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
      peso: '', jejum: '', cirurgiao: '', cirurgiaoCrm: '', aux1: '', aux2: '', intervencoes: ['', '', '', '', ''],
    },
    tempos: { inicioAnest: null, inicioCir: null, fimCir: null, fimAnest: null },
    vitais: [], // {id, t, pas, pad, fc, spo2, etco2, temp, ritmo}
    drogas: [], // {id, t, nome, dose, unid, via}
    fluidos: [], // {id, t, nome, tipo, vol}
    eventos: [], // {id, t, texto}
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
    pre: {
      diagnostico: '', procedimento: '', itens: {}, outros: {}, diabetesTipo: '', cigarros: '',
      cancerLocal: '', qt: false, rt: false, alergias: ['', '', ''], previas: ['', '', ''],
      medicamentos: Array(N_MEDICAMENTOS).fill(''), gravidez: '', dum: '', nvpo: '', histFamiliar: '',
      asa: '', emergencia: '', reservaSangue: '', mallampati: '', vad: '',
    },
    srpa: {
      admHora: '', admPas: '', admPad: '', admFc: '', admSpo2: '',
      aldrete: {}, // aldrete[tempo][criterio] = 0|1|2
      prescricao: [{ item: '', quant: '', horario: '' }, { item: '', quant: '', horario: '' }, { item: '', quant: '', horario: '' }],
      intercorrencias: '',
      altaHora: '', altaPas: '', altaPad: '', altaFc: '', altaSpo2: '', encaminhado: '',
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

// Completa fichas criadas em versões anteriores do app com os campos novos.
export function normalizarFicha(f) {
  f.pac.cirurgiaoCrm ??= '';
  while (f.pre.medicamentos.length < N_MEDICAMENTOS) f.pre.medicamentos.push('');
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
