// Gera o PDF no layout da ficha em papel do CEA (A4, medidas em mm).
import {
  MONITORIZACAO, EQUIPAMENTOS, PRE_GRUPOS, ALDRETE, ALDRETE_TEMPOS,
  hhmm, dataBR, dataHoraBR, calcBalanco, resumoDrogas, aldreteTotal, num,
} from './model.js';

const INK = [18, 45, 130]; // cor do "preenchimento" (dados), como caneta azul
const GRAY = [225, 225, 225];
const MIN = 60000;
const JANELA = 4 * 60 * MIN; // cada página do gráfico cobre 4 horas
const G = { x0: 30, x1: 166, cols: 48 }; // grade de tempo: 48 colunas de 5 min
G.cw = (G.x1 - G.x0) / G.cols;

export async function gerarPDF(f, { favoritos, logo } = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const P = pen(doc);

  const janelas = calcJanelas(f);
  const linhasDrogas = ordemDrogas(f);

  janelas.forEach((inicio, i) => {
    if (i > 0) doc.addPage();
    if (i === 0) pagina1(P, f, logo, favoritos);
    else cabecalhoContinuacao(P, f, logo, i + 1);
    secoesTempo(P, f, inicio, linhasDrogas, i === 0, favoritos);
  });

  doc.addPage();
  pagina2(P, f);

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    rodape(P, f, p, total);
  }
  return doc.output('blob');
}

// ---------- utilitários de desenho ----------
function pen(doc) {
  const P = {
    doc,
    font(size, bold = false, italic = false) {
      doc.setFont('helvetica', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal');
      doc.setFontSize(size);
      return P;
    },
    color(c = [0, 0, 0]) { doc.setTextColor(...c); return P; },
    t(s, x, y, o = {}) {
      if (s === undefined || s === null || s === '') return P;
      P.font(o.size ?? 7, o.bold, o.italic).color(o.ink ? INK : o.color || [0, 0, 0]);
      let str = String(s);
      if (o.maxW) str = fit(doc, str, o.maxW);
      doc.text(str, x, y, { align: o.align || 'left', angle: o.angle || 0, baseline: o.baseline || 'alphabetic' });
      P.color();
      return P;
    },
    v(s, x, y, o = {}) { return P.t(s, x, y, { size: 7.5, ...o, ink: true }); },
    line(x1, y1, x2, y2, w = 0.2) { doc.setLineWidth(w); doc.setDrawColor(0); doc.line(x1, y1, x2, y2); return P; },
    rect(x, y, w, h, o = {}) {
      doc.setLineWidth(o.lw ?? 0.3);
      doc.setDrawColor(0);
      if (o.fill) { doc.setFillColor(...o.fill); doc.rect(x, y, w, h, o.noStroke ? 'F' : 'FD'); } else doc.rect(x, y, w, h);
      return P;
    },
    // campo "Rótulo ______" com o valor escrito sobre a linha
    campo(rot, val, x, y, x2, o = {}) {
      P.t(rot, x, y, { size: o.size ?? 7 });
      P.font(o.size ?? 7);
      const lx = x + doc.getTextWidth(rot) + 0.8;
      P.line(lx, y + 0.6, x2, y + 0.6, 0.15);
      if (val !== '' && val !== undefined && val !== null) {
        P.v(val, lx + 0.8, y - 0.2, { size: o.vsize ?? 7.5, maxW: x2 - lx - 1 });
      }
      if (o.suf) P.t(o.suf, x2 + 0.5, y, { size: o.size ?? 7 });
      return P;
    },
    circ(x, y, on, label, o = {}) {
      const r = o.r ?? 1.1;
      doc.setLineWidth(0.2); doc.setDrawColor(0);
      doc.circle(x + r, y - r * 0.8, r);
      if (on) { doc.setFillColor(...INK); doc.circle(x + r, y - r * 0.8, r * 0.6, 'F'); }
      if (label) P.t(label, x + 2 * r + 0.6, y, { size: o.size ?? 6 });
      return P;
    },
    box(x, y, on, label, o = {}) {
      const s = o.s ?? 2.4;
      doc.setLineWidth(0.2); doc.setDrawColor(0);
      doc.rect(x, y - s + 0.3, s, s);
      if (on) {
        doc.setDrawColor(...INK); doc.setLineWidth(0.4);
        doc.line(x + 0.4, y - s + 0.7, x + s - 0.4, y - 0.1);
        doc.line(x + s - 0.4, y - s + 0.7, x + 0.4, y - 0.1);
        doc.setDrawColor(0);
      }
      if (label) P.t(label, x + s + 0.8, y, { size: o.size ?? 7.5 });
      return P;
    },
  };
  return P;
}

function fit(doc, s, w) {
  if (doc.getTextWidth(s) <= w) return s;
  while (s.length > 1 && doc.getTextWidth(s + '…') > w) s = s.slice(0, -1);
  return s + '…';
}

function wrapText(doc, s, w) {
  return doc.splitTextToSize(String(s || ''), w);
}

// ---------- linha do tempo ----------
function tudoComTempo(f) {
  const ts = [
    ...Object.values(f.tempos).filter(Boolean),
    ...f.vitais.map((x) => x.t), ...f.drogas.map((x) => x.t),
    ...f.fluidos.map((x) => x.t), ...f.eventos.map((x) => x.t),
  ].map((t) => new Date(t).getTime());
  return ts;
}

function calcJanelas(f) {
  const ts = tudoComTempo(f);
  if (!ts.length) return [null];
  const q = 15 * MIN;
  const ini = Math.floor(Math.min(...ts) / q) * q;
  const fim = Math.max(...ts);
  const n = Math.max(1, Math.ceil((fim - ini + 1) / JANELA));
  return Array.from({ length: n }, (_, i) => ini + i * JANELA);
}

function ordemDrogas(f) {
  const vistos = [];
  [...f.drogas].sort((a, b) => (a.t > b.t ? 1 : -1)).forEach((d) => {
    const k = `${d.nome} (${d.unid})`;
    if (!vistos.includes(k)) vistos.push(k);
  });
  return vistos;
}

function eventosNumerados(f) {
  const auto = [
    ['inicioAnest', 'Início da anestesia'], ['inicioCir', 'Início da cirurgia'],
    ['fimCir', 'Fim da cirurgia'], ['fimAnest', 'Fim da anestesia'],
  ].filter(([k]) => f.tempos[k]).map(([k, texto]) => ({ t: f.tempos[k], texto }));
  return [...auto, ...f.eventos].sort((a, b) => (a.t > b.t ? 1 : -1)).map((e, i) => ({ ...e, n: i + 1 }));
}

// ---------- página 1 ----------
function titulo(P, texto, logo) {
  P.t(texto, 99, 16, { size: 15, bold: true, align: 'center' });
  if (logo) P.doc.addImage(logo, 'PNG', 181, 4, 16, 16);
}

function pagina1(P, f, logo, favoritos) {
  const a = f.pac;
  titulo(P, 'FICHA DE ANESTESIA', logo);

  // Identificação
  P.campo('Nome:', a.nome, 9, 28, 131);
  P.campo('Idade', a.idade, 132, 28, 146);
  P.campo('Data', dataBR(a.data), 147.5, 28, 179);
  P.t('Sexo', 181, 28);
  P.circ(188, 28, a.sexo === 'F', 'F', { size: 7 });
  P.circ(194, 28, a.sexo === 'M', 'M', { size: 7 });
  P.campo('Convênio', a.convenio, 9, 33.6, 51);
  P.campo('Matrícula', a.matricula, 52, 33.6, 146);
  P.t('Caráter:', 148, 33.6);
  P.circ(158.5, 33.6, a.carater === 'Eletivo', 'Eletivo');
  P.circ(171, 33.6, a.carater === 'Urgência', 'Urgência');
  P.circ(185, 33.6, a.carater === 'Emergência', 'Emergência');

  // Caixa A
  P.rect(9, 36, 32, 32.5);
  const asa = f.pre.asa ? f.pre.asa + (f.pre.emergencia === 'Sim' ? ' E' : '') : '';
  P.campo('Peso', a.peso ? `${num(a.peso)} kg` : '', 11, 41.5, 39);
  P.campo('ASA', asa, 11, 46.5, 39);
  P.campo('Jejum', a.jejum, 11, 51.5, 38, { suf: 'h' });
  P.line(9, 53.5, 41, 53.5, 0.2);
  P.campo('Início', hhmm(f.tempos.inicioAnest), 11, 61, 38, { suf: 'h' });
  P.campo('Término', hhmm(f.tempos.fimAnest), 11, 66, 38, { suf: 'h' });

  // Caixa B: equipe
  P.rect(43, 36, 56.6, 32.5);
  const an = f.anestesista;
  P.v(an.nome, 71.3, 42.2, { align: 'center', size: 7.5, maxW: 53 });
  P.v(`CRM ${an.crm}${an.uf ? '/' + an.uf : ''}`, 71.3, 45.6, { align: 'center', size: 7 });
  P.line(45, 46.8, 97.5, 46.8, 0.15);
  P.t('Anestesiologista', 71.3, 50, { size: 6.5, align: 'center' });
  P.campo('Cirurgião', a.cirurgiao, 45, 56, 79.5, { size: 6.5 });
  P.campo('CRM', a.cirurgiaoCrm, 80.5, 56, 97.5, { size: 6.5 });
  P.campo('1º Auxiliar', a.aux1, 45, 61, 97.5, { size: 6.5 });
  P.campo('2º Auxiliar', a.aux2, 45, 66, 97.5, { size: 6.5 });

  // Caixa C: intervenções
  P.rect(100.6, 36, 98.4, 32.5);
  P.t('INTERVENÇÃO CIRÚRGICA REALIZADA', 149.8, 40, { size: 7, bold: true, align: 'center' });
  for (let i = 0; i < 5; i++) {
    const y = 41.5 + i * 5.4;
    P.line(100.6, y, 199, y, 0.2);
    P.t(`${i + 1}.`, 102, y + 3.8, { size: 6.5 });
    P.v(a.intervencoes[i], 106, y + 3.8, { maxW: 92 });
  }

  // Acesso venoso (lateral da seção de agentes)
  const ac = f.acesso;
  P.campo('Periférico nº', ac.perifNum, 179, 82, 198, { size: 6 });
  P.campo('Local', ac.local, 179, 87.5, 198, { size: 6 });
  P.campo('Central Via', ac.centralVia, 179, 93, 198, { size: 6 });
  P.t('Intercorrências', 179, 98, { size: 6 });
  P.circ(179, 101.8, ac.interc === 'Sim', 'Sim');
  P.circ(188, 101.8, ac.interc === 'Não', 'Não');
  P.line(177.7, 103.5, 199, 103.5, 0.2);
  P.t('MPA', 179, 107.5, { size: 6 });
  P.line(179, 112, 198, 112, 0.15);
  P.v(ac.mpa, 179.3, 111.3, { size: 6.5, maxW: 19 });

  painelDireito(P, f);
  anotacoesLabs(P, f);
  tabelaDrogas(P, f, favoritos);
}

function cabecalhoContinuacao(P, f, logo, n) {
  titulo(P, `FICHA DE ANESTESIA — continuação (${n})`, logo);
  P.campo('Nome:', f.pac.nome, 9, 28, 131);
  P.campo('Data', dataBR(f.pac.data), 147.5, 28, 179);
  P.t('Registro intraoperatório — continuação da folha anterior', 9, 50, { size: 8, italic: true });
}

// Seções que dependem do tempo: agentes, soros/parâmetros e gráfico.
function secoesTempo(P, f, inicio, linhasDrogas, primeira, favoritos) {
  const doc = P.doc;
  const col = (t) => (inicio === null ? -1 : Math.floor((new Date(t).getTime() - inicio) / (5 * MIN)));
  const noJanela = (c) => c >= 0 && c < G.cols;

  const vGrid = (y1, y2, passo) => {
    for (let c = 0; c <= G.cols; c += passo) {
      const hora = c % 12 === 0;
      P.line(G.x0 + c * G.cw, y1, G.x0 + c * G.cw, y2, hora ? 0.45 : 0.12);
    }
  };

  // ----- Agentes anestésicos -----
  const y0 = 69.5, yH = 73.5, yR = 77.2, yEnd = 114.3, nL = 10, rh = (yEnd - yR) / nL;
  P.rect(9, y0, 190, yEnd - y0);
  P.rect(G.x0, y0, G.x1 - G.x0, yH - y0, { fill: GRAY, lw: 0.2 });
  P.t('AGENTE', 19.5, 72.8, { size: 6.5, bold: true, align: 'center' });
  P.t('ANESTÉSICO', 19.5, 76.3, { size: 6.5, bold: true, align: 'center' });
  P.t('HORÁRIO', (G.x0 + G.x1) / 2, 72.6, { size: 7, bold: true, align: 'center' });
  P.t('TOTAL', 171.8, 72.4, { size: 6, bold: true, align: 'center' });
  P.t('ACESSO', 188.3, 72.8, { size: 6.5, bold: true, align: 'center' });
  P.t('VENOSO', 188.3, 76.3, { size: 6.5, bold: true, align: 'center' });
  P.line(G.x0, y0, G.x0, yEnd, 0.3);
  P.line(G.x1, y0, G.x1, yEnd, 0.3);
  P.line(177.7, y0, 177.7, yEnd, 0.3);
  P.line(G.x0, yH, 177.7, yH, 0.2);
  P.line(9, yR, 177.7, yR, 0.3);
  for (let i = 1; i < nL; i++) P.line(9, yR + i * rh, 177.7, yR + i * rh, 0.12);
  vGrid(yR, yEnd, 1);
  // rótulos de horário a cada 15 min
  if (inicio !== null) {
    for (let c = 0; c < G.cols; c += 3) {
      if (c > 0) P.line(G.x0 + c * G.cw, yH, G.x0 + c * G.cw, yR, c % 12 === 0 ? 0.45 : 0.15);
      P.t(hhmm(new Date(inicio + c * 5 * MIN).toISOString()), G.x0 + c * G.cw + 0.4, yR - 0.9, {
        size: 4.6, bold: c % 12 === 0,
      });
    }
  }
  const resumo = resumoDrogas(f, favoritos);
  linhasDrogas.slice(0, nL).forEach((nomeU, i) => {
    const y = yR + i * rh + rh - 1;
    P.v(nomeU, 10, y, { size: 5.8, maxW: 19.6 });
    const celulas = new Map();
    for (const d of f.drogas) {
      if (`${d.nome} (${d.unid})` !== nomeU) continue;
      const c = col(d.t);
      if (!noJanela(c)) continue;
      celulas.set(c, (celulas.get(c) || 0) + (+String(d.dose).replace(',', '.') || 0));
    }
    for (const [c, dose] of celulas) {
      P.v(num(Math.round(dose * 100) / 100), G.x0 + c * G.cw + 0.2, y, { size: 4.6 });
    }
    if (primeira) {
      const tot = resumo.filter((r) => `${r.nome} (${r.unid})` === nomeU).reduce((s, r) => s + r.total, 0);
      P.v(`${num(Math.round(tot * 100) / 100)}`, 171.8, y, { size: 5.5, align: 'center' });
    }
  });

  // ----- Soros / ECG / SatO2 / ETCO2 -----
  const m0 = 116.6, mEnd = 143.5, mR = 7, mh = (mEnd - m0) / mR;
  const cw15 = G.cw * 3;
  P.rect(9, m0, G.x1 - 9, mEnd - m0);
  P.line(G.x0, m0, G.x0, mEnd, 0.3);
  for (let i = 1; i < mR; i++) P.line(9, m0 + i * mh, G.x1, m0 + i * mh, 0.12);
  for (let c = 1; c < 16; c++) P.line(G.x0 + c * cw15, m0, G.x0 + c * cw15, mEnd, c % 4 === 0 ? 0.45 : 0.12);
  const col15 = (t) => (inicio === null ? -1 : Math.floor((new Date(t).getTime() - inicio) / (15 * MIN)));
  const tiposSoro = [...new Set(f.fluidos.map((x) => x.nome))];
  const linhasMeio = [
    ...[0, 1, 2].map((i) => ({ rot: tiposSoro[i] ? '' : i < 2 ? 'Soro......' : '', nome: tiposSoro[i], soro: true })),
    { rot: 'ECG.........', campo: 'ritmo' },
    { rot: 'SatO2.......', campo: 'spo2' },
    { rot: 'ETCO2......', campo: 'etco2' },
    { rot: 'Temp. °C...', campo: 'temp' },
  ];
  linhasMeio.forEach((ln, i) => {
    const y = m0 + i * mh + mh - 1;
    if (ln.nome) P.v(ln.nome, 10, y, { size: 5.8, maxW: 19.6 }); else P.t(ln.rot, 10.5, y, { size: 6 });
    const cel = new Map();
    if (ln.soro && ln.nome) {
      f.fluidos.filter((x) => x.nome === ln.nome).forEach((x) => {
        const c = col15(x.t);
        if (c >= 0 && c < 16) cel.set(c, (cel.get(c) || 0) + (+x.vol || 0));
      });
    } else if (ln.campo) {
      [...f.vitais].sort((a, b) => (a.t > b.t ? 1 : -1)).forEach((v) => {
        const c = col15(v.t);
        const val = v[ln.campo];
        if (c >= 0 && c < 16 && val !== '' && val !== undefined && val !== null) cel.set(c, val);
      });
    }
    for (const [c, val] of cel) P.v(num(val), G.x0 + c * cw15 + cw15 / 2, y, { size: 6, align: 'center' });
  });

  // ----- Gráfico -----
  const c0 = 144.5, top = 146.2, bot = 219.7, cEnd = 220.7;
  const H = bot - top;
  const yv = (v) => bot - (Math.max(0, Math.min(200, v)) / 200) * H;
  P.rect(9, c0, G.x1 - 9, cEnd - c0);
  P.line(25, c0, 25, cEnd, 0.3);
  P.line(G.x0, c0, G.x0, cEnd, 0.3);
  for (let v = 0; v <= 200; v += 10) {
    const y = yv(v);
    P.line(G.x0, y, G.x1, y, v % 50 === 0 ? 0.3 : 0.12);
    if (v % 20 === 0) P.t(String(v), 29.4, y + 1, { size: 5.5, bold: true, align: 'right' });
  }
  vGrid(c0, cEnd, 1);

  // Monitorização / Equipamentos (coluna esquerda)
  const itens = [
    ['h', 'Monitorização'], ...MONITORIZACAO.map(([k, l]) => ['m', l, f.monit[k]]), ['s'],
    ['h', 'Equip./Mat.'], ...EQUIPAMENTOS.map(([k, l]) => ['m', l, f.equip[k]]), ['s'], ['leg'],
  ];
  const ih = (cEnd - c0) / itens.length;
  itens.forEach((it, i) => {
    const y = c0 + i * ih;
    if (i > 0) P.line(9, y, 25, y, 0.12);
    if (it[0] === 'h') P.t(it[1], 17, y + ih - 1, { size: 5.8, bold: true, align: 'center' });
    if (it[0] === 'm') {
      P.line(12, y, 12, y + ih, 0.12);
      if (it[2]) P.v('X', 10.5, y + ih - 1, { size: 6.5, align: 'center', bold: true });
      P.t(it[1], 12.6, y + ih - 1.1, { size: 5, maxW: 12.2 });
    }
  });
  // legenda
  const ly = cEnd - ih / 2 + 0.8;
  simbolo(P.doc, 'pas', 10.3, ly - 0.2); P.t('PAS', 11.5, ly, { size: 3.8 });
  simbolo(P.doc, 'pad', 15.8, ly - 1.6); P.t('PAD', 17, ly, { size: 3.8 });
  simbolo(P.doc, 'fc', 21.4, ly - 0.9); P.t('FC', 22.3, ly, { size: 3.8 });

  // pontos
  for (const v of f.vitais) {
    const c = col(v.t);
    if (!noJanela(c)) continue;
    const x = G.x0 + c * G.cw + G.cw / 2;
    if (v.pas !== '' && v.pas != null) simbolo(doc, 'pas', x, yv(+v.pas));
    if (v.pad !== '' && v.pad != null) simbolo(doc, 'pad', x, yv(+v.pad));
    if (v.fc !== '' && v.fc != null) simbolo(doc, 'fc', x, yv(+v.fc));
  }
  // eventos numerados no topo do gráfico
  for (const e of eventosNumerados(f)) {
    const c = col(e.t);
    if (!noJanela(c)) continue;
    const x = G.x0 + c * G.cw + G.cw / 2;
    doc.setFillColor(255, 255, 255); doc.setDrawColor(...INK); doc.setLineWidth(0.25);
    doc.circle(x, top + 1.6, 1.35, 'FD');
    doc.setDrawColor(0);
    P.v(String(e.n), x, top + 2.4, { size: 4.8, align: 'center', bold: true });
  }
}

function simbolo(doc, tipo, x, y) {
  const s = 1.1;
  doc.setFillColor(...INK); doc.setDrawColor(...INK); doc.setLineWidth(0.1);
  if (tipo === 'pas') doc.triangle(x - s, y - 1.8 * s, x + s, y - 1.8 * s, x, y, 'F');
  if (tipo === 'pad') doc.triangle(x - s, y + 1.8 * s, x + s, y + 1.8 * s, x, y, 'F');
  if (tipo === 'fc') doc.circle(x, y, 0.75, 'F');
  doc.setDrawColor(0);
}

function painelDireito(P, f) {
  const x = 166, w = 33, xr = x + w;
  const an = f.anest, ve = f.vent;
  P.rect(x, 116.6, w, 144.4, { fill: [238, 238, 238] });
  let y = 116.6;
  const cab = (t) => {
    P.rect(x, y, w, 4.2, { fill: [205, 205, 205], lw: 0.2 });
    P.t(t, x + w / 2, y + 3.1, { size: 6.5, bold: true, align: 'center' });
    y += 4.2 + 3.6;
  };
  const nl = (d = 3.55) => { y += d; };
  const xa = x + 1.2;

  cab('ANESTESIA');
  P.t('GERAL', xa, y, { size: 5.8, bold: an.geral });
  P.circ(xa + 8, y, an.geralIV, 'IV', { size: 5.5 });
  P.circ(xa + 15, y, an.geralInal, 'Inal.', { size: 5.5 });
  P.circ(xa + 24, y, an.geralBal, 'Bal.', { size: 5.5 }); nl();
  P.t('SEDAÇÃO', xa, y, { size: 5.8, bold: an.sedacao });
  P.circ(xa + 11, y, !!an.o2, 'O2', { size: 5.5 });
  P.line(xa + 18, y + 0.5, xa + 25, y + 0.5, 0.12); P.v(an.o2, xa + 18.3, y - 0.1, { size: 5.8 });
  P.t('l/min', xa + 25.4, y, { size: 5 }); nl();
  P.circ(xa, y, an.local, 'Local', { size: 5.5 });
  P.circ(xa + 11, y, an.locoregional, 'Locoregional', { size: 5.5 }); nl();
  P.circ(xa, y, an.peridural, 'Peridural', { size: 5.5 });
  P.circ(xa + 13.5, y, an.cateter, 'C/Cateter nº', { size: 5.5 });
  P.v(an.cateterNum, xa + 29, y, { size: 5.8 }); nl();
  P.circ(xa, y, an.subaracnoidea, 'Subaracnóidea', { size: 5.5 }); nl();
  P.campo('Agulha', an.agulha, xa, y, xr - 1, { size: 5.5, vsize: 5.8 }); nl();
  P.campo('Local', an.localNeuro, xa, y, xr - 1, { size: 5.5, vsize: 5.8 }); nl();
  P.circ(xa, y, an.bloqueio, 'Bloqueio', { size: 5.5 });
  P.circ(xa + 13.5, y, an.estimulador, 'C/ Estimulador', { size: 5.5 }); nl();
  P.campo('Local', an.localBloq, xa, y, xr - 1, { size: 5.5, vsize: 5.8 }); nl();
  P.t('Intercorrências', xa, y, { size: 5.5 });
  P.circ(xa + 16, y, an.interc === 'Sim', 'Sim', { size: 5.5 });
  P.circ(xa + 24, y, an.interc === 'Não', 'Não', { size: 5.5 }); nl();
  P.line(xa, y + 0.5, xr - 1, y + 0.5, 0.12); P.v(an.intercDesc, xa + 0.3, y, { size: 5.5, maxW: w - 3 });
  y += 2.2;

  cab('VENTILAÇÃO');
  P.circ(xa, y, ve.espontanea, 'Ventilação Espontânea', { size: 5.3 });
  P.circ(xa + 23.5, y, ve.vcm, 'VCM', { size: 5.3 }); nl();
  P.circ(xa, y, ve.vcv, 'VCV', { size: 5.5 });
  P.circ(xa + 23.5, y, ve.pcv, 'PCV', { size: 5.3 }); nl();
  P.t('Máscara', xa, y, { size: 5.8, bold: true }); nl();
  P.circ(xa, y, ve.mascFacial, 'Máscara Facial', { size: 5.5 }); nl();
  P.circ(xa, y, ve.mascLaringea, 'Máscara Laríngea nº', { size: 5.5 });
  P.v(ve.mlNum, xa + 23, y, { size: 5.8 }); nl();
  P.t('Intubação', xa, y, { size: 5.8, bold: true }); nl();
  P.circ(xa, y, ve.intubacao === 'Orotraqueal', 'Sonda Orotraqueal', { size: 5.5 });
  if (ve.intubacao === 'Orotraqueal') P.v(ve.tuboNum, xa + 22, y, { size: 5.8 });
  nl();
  P.circ(xa, y, ve.intubacao === 'Nasotraqueal', 'Sonda Nasotraqueal', { size: 5.5 });
  if (ve.intubacao === 'Nasotraqueal') P.v(ve.tuboNum, xa + 23, y, { size: 5.8 });
  nl();
  P.circ(xa, y, ve.dificuldade === 'Fácil', 'Fácil', { size: 5.5 });
  P.circ(xa + 12, y, ve.dificuldade === 'Difícil', 'Difícil', { size: 5.5 }); nl();
  P.t('Intercorrências', xa, y, { size: 5.5 });
  P.circ(xa + 16, y, ve.interc === 'Sim', 'Sim', { size: 5.5 });
  P.circ(xa + 24, y, ve.interc === 'Não', 'Não', { size: 5.5 }); nl();
  P.line(xa, y + 0.5, xr - 1, y + 0.5, 0.12); P.v(ve.intercDesc, xa + 0.3, y, { size: 5.5, maxW: w - 3 });
  y += 2.5;
  P.line(x, y, xr, y, 0.3); y += 3.8;

  const b = f.balanco, calc = calcBalanco(f);
  const val = (manual, auto) => (manual !== '' ? manual : auto ? String(auto) : '');
  P.campo('Diurese', b.diurese, xa, y, xr - 4, { size: 5.5, vsize: 6, suf: 'ml' }); nl(3.8);
  P.t('Volume', xa, y, { size: 6, bold: true }); nl(3.3);
  P.campo('Cristalóide', val(b.cristaloide, calc.cristaloide), xa, y, xr - 4, { size: 5.5, vsize: 6, suf: 'ml' }); nl(3.3);
  P.campo('Colóide', val(b.coloide, calc.coloide), xa, y, xr - 4, { size: 5.5, vsize: 6, suf: 'ml' }); nl(3.8);
  P.t('Balanço Hídrico', xa, y, { size: 6, bold: true }); nl(3.3);
  const perdasAuto = (+b.diurese || 0) || '';
  P.campo('Perdas', val(b.perdas, perdasAuto), xa, y, xr - 4, { size: 5.5, vsize: 6, suf: 'ml' }); nl(3.3);
  P.campo('Ganhos', val(b.ganhos, calc.ganhos), xa, y, xr - 4, { size: 5.5, vsize: 6, suf: 'ml' });
  y = 237.2;

  P.rect(x, y, w, 4.2, { fill: [205, 205, 205], lw: 0.2 });
  P.t('ENCAMINHAMENTO', x + w / 2, y + 3.1, { size: 6, bold: true, align: 'center' });
  y += 6.8;
  const s = f.saida;
  P.circ(xa + 1, y, s.estado === 'Acordado', 'Acordado', { size: 5.5 });
  P.circ(xa + 17, y, s.estado === 'Intubado', 'Intubado', { size: 5.5 }); y += 3.1;
  P.circ(xa + 1, y, s.estado === 'Sonolento', 'Sonolento', { size: 5.5 });
  P.circ(xa + 17, y, s.estado === 'Óbito', 'Óbito', { size: 5.5 }); y += 1.2;
  P.rect(x, y, w, 4.2, { fill: [205, 205, 205], lw: 0.2 });
  P.t('ENCAMINHAMENTO', x + w / 2, y + 3.1, { size: 6, bold: true, align: 'center' });
  y += 6.8;
  P.circ(xa + 1, y, s.destino === 'RPA', 'RPA', { size: 5.5 });
  P.circ(xa + 17, y, s.destino === 'Leito', 'Leito', { size: 5.5 }); y += 3.1;
  P.circ(xa + 1, y, s.destino === 'UTI', 'UTI', { size: 5.5 });
  P.circ(xa + 17, y, s.destino === 'Ambulatorial', 'Ambulatorial', { size: 5.5 });
}

function anotacoesLabs(P, f) {
  const doc = P.doc;
  // Exames laboratoriais
  P.rect(9, 221.5, 16.5, 39.5);
  P.t('Ex. Laboratoriais', 17.2, 224.5, { size: 5, bold: true, align: 'center' });
  P.line(9, 225.8, 25.5, 225.8, 0.2);
  for (let i = 0; i < 9; i++) {
    const y = 229.8 + i * 3.6;
    P.line(10.5, y + 0.5, 24, y + 0.5, 0.12);
    P.v(f.labs[i], 10.7, y, { size: 5.2, maxW: 13.3 });
  }
  // Anotações
  P.rect(27, 221.5, 139, 39.5);
  P.t('ANOTAÇÕES', 30.3, 250, { size: 6.5, bold: true, angle: 90 });
  P.line(31.5, 221.5, 31.5, 261, 0.2);
  const lh = 3.5, x = 32.5, w = 132.5;
  const linhas = [];
  const ev = eventosNumerados(f);
  if (ev.length) {
    linhas.push(...wrapText(doc.setFontSize(6.2), ev.map((e) => `(${e.n}) ${hhmm(e.t)} ${e.texto}`).join('   '), w));
  }
  const calc = calcBalanco(f);
  if (calc.hemo) linhas.push(`Hemoderivados: ${calc.hemo} ml`);
  if (f.anotacoes) linhas.push(...wrapText(doc.setFontSize(6.2), f.anotacoes, w));
  for (let i = 0; i < 11; i++) P.line(x, 225 + i * lh, 165, 225 + i * lh, 0.12);
  linhas.slice(0, 11).forEach((l, i) => P.v(l, x + 0.3, 224.5 + i * lh, { size: 6.2 }));
  if (linhas.length > 11) P.t('(continua…)', 164.5, 260, { size: 5, italic: true, align: 'right' });
}

function tabelaDrogas(P, f, favoritos) {
  const y0 = 262.3, yh = 266, rh = 3.52;
  const lista = resumoDrogas(f, favoritos);
  const cols = [5, 30, 11, 8, 9.5];
  for (let b = 0; b < 3; b++) {
    const bx = 9 + b * 63.5;
    P.rect(bx, y0, 63.5, yh - y0 + rh * 5);
    let cx = bx;
    const xs = cols.map((w) => { const s = cx; cx += w; return s; });
    ['', 'AGENTE', 'mg', 'Via', 'Amp.'].forEach((h, i) => {
      if (i > 0) P.line(xs[i], y0, xs[i], yh + rh * 5, 0.2);
      P.t(h, xs[i] + cols[i] / 2, y0 + 2.8, { size: 6, bold: true, align: 'center' });
    });
    for (let r = 0; r < 5; r++) {
      const y = yh + r * rh;
      P.line(bx, y, bx + 63.5, y, 0.2);
      const n = b * 5 + r;
      P.t(`${n + 1}.`, bx + 0.8, y + 2.6, { size: 5.2, bold: true });
      const d = lista[n];
      if (d) {
        P.v(d.nome, xs[1] + 0.6, y + 2.7, { size: 6, maxW: cols[1] - 1 });
        P.v(num(d.total) + (d.unid !== 'mg' ? ` ${d.unid}` : ''), xs[2] + cols[2] / 2, y + 2.7, { size: 5.5, align: 'center', maxW: cols[2] - 0.5 });
        P.v(d.via, xs[3] + cols[3] / 2, y + 2.7, { size: 5.5, align: 'center' });
        P.v(d.amp, xs[4] + cols[4] / 2, y + 2.7, { size: 5.8, align: 'center' });
      }
    }
  }
}

// ---------- página 2 ----------
function pagina2(P, f) {
  const p = f.pre;
  const band = (t, y) => {
    P.rect(7, y, 196, 5, { fill: GRAY, lw: 0.3 });
    P.t(t, 105, y + 3.6, { size: 8, bold: true, align: 'center' });
  };
  band('AVALIAÇÃO PRÉ-ANESTÉSICA', 8);
  P.campo('Diagnóstico Pré-Operatório:', p.diagnostico, 7.5, 18.5, 202);
  P.campo('Cirurgia / Procedimento Proposto:', p.procedimento, 7.5, 24, 202);
  P.t('MARCAR APENAS OS ITENS PERTINENTES', 105, 30, { size: 6.5, bold: true, align: 'center' });

  const X = [7.5, 52.2, 95.3, 153.4, 202.3];
  const Y = [34.3, 53.5, 69.5, 92.3, 118.4, 131];
  P.rect(X[0], Y[0], X[4] - X[0], Y[5] - Y[0]);
  for (let i = 1; i < 5; i++) P.line(X[0], Y[i], X[3], Y[i], 0.25);
  P.line(X[3], Y[1], X[4], Y[1], 0.25);
  P.line(X[3], Y[2], X[4], Y[2], 0.25);
  P.line(X[3], Y[3], X[4], Y[3], 0.25);
  P.line(X[3], 111.5, X[4], 111.5, 0.25);
  for (let i = 1; i < 4; i++) P.line(X[i], Y[0], X[i], Y[5], 0.25);

  const grp = Object.fromEntries(PRE_GRUPOS.map((g) => [g[0], g]));
  const bloco = (key, ci, ri, extra) => {
    const [k, titulo, itens, outro] = grp[key];
    const x = X[ci] + 1.8, cx = (X[ci] + X[ci + 1]) / 2;
    let y = Y[ri] + 3.3;
    P.t(titulo.toUpperCase(), cx, y, { size: 6.3, bold: true, align: 'center' });
    y += 4.5;
    for (const [ik, il] of itens) {
      let label = il;
      if (ik === 'diabetes') label = `Diabetes tipo ${p.diabetesTipo || '___'}`;
      if (ik === 'tabaco') label = `Tabaco ${p.cigarros || '___'} cigarros/dia`;
      P.box(x, y, !!p.itens[`${k}_${ik}`], label, { size: 7 });
      y += 3.4;
    }
    if (extra) y = extra(x, y);
    if (outro) {
      P.box(x, y, !!p.outros[k], '', { size: 7 });
      P.line(x + 3.5, y + 0.3, X[ci + 1] - 3, y + 0.3, 0.12);
      P.v(p.outros[k], x + 3.8, y - 0.2, { size: 6.8, maxW: X[ci + 1] - x - 7 });
    }
  };
  const linhas3 = (titulo, arr, ci, ri) => {
    const cx = (X[ci] + X[ci + 1]) / 2;
    P.t(titulo.toUpperCase(), cx, Y[ri] + 3.3, { size: 6.3, bold: true, align: 'center' });
    arr.forEach((v, i) => {
      const y = Y[ri] + 7.6 + i * 3.6;
      P.line(X[ci] + 3, y + 0.5, X[ci + 1] - 3, y + 0.5, 0.12);
      P.v(v, X[ci] + 3.3, y, { size: 6.8, maxW: X[ci + 1] - X[ci] - 7 });
    });
  };

  bloco('cardio', 0, 0); bloco('renal', 1, 0); bloco('infeccioso', 2, 0);
  linhas3('Alergias', p.alergias, 3, 0);
  bloco('respiratorio', 0, 1); bloco('musculo', 1, 1);
  // Câncer
  {
    const x = X[2] + 1.8;
    P.t('CÂNCER', (X[2] + X[3]) / 2, Y[1] + 3.3, { size: 6.3, bold: true, align: 'center' });
    P.campo('Local:', p.cancerLocal, x, Y[1] + 7.8, X[3] - 5, { size: 7 });
    P.box(x, Y[1] + 11.4, p.qt, 'QT', { size: 7 });
    P.box(x, Y[1] + 14.8, p.rt, 'RT', { size: 7 });
  }
  linhas3('Cirurgia / Anestesia Prévia', p.previas, 3, 1);
  bloco('gastro', 0, 2); bloco('endocrino', 1, 2);
  {
    const x = X[2] + 1.8;
    P.t('GRAVIDEZ', (X[2] + X[3]) / 2, Y[2] + 3.3, { size: 6.3, bold: true, align: 'center' });
    P.box(x, Y[2] + 7.8, p.gravidez === 'Negativo', 'Negativo', { size: 7 });
    P.box(x, Y[2] + 11.2, p.gravidez === 'Positivo', 'Positivo', { size: 7 });
    P.campo('DUM', p.dum ? dataBR(p.dum) : '', x, Y[2] + 14.8, x + 26, { size: 7 });
  }
  {
    P.t('USO DE MEDICAMENTOS', (X[3] + X[4]) / 2, Y[2] + 3.3, { size: 6.3, bold: true, align: 'center' });
    // duas colunas de 6 linhas
    const cw = (X[4] - X[3]) / 2;
    p.medicamentos.slice(0, 12).forEach((m, i) => {
      const cx = X[3] + (i < 6 ? 0 : cw);
      const y = Y[2] + 6.9 + (i % 6) * 2.75;
      P.t(String(i + 1), cx + 1, y, { size: 5 });
      P.line(cx + 4, y + 0.4, cx + cw - 1, y + 0.4, 0.1);
      P.v(m, cx + 4.2, y - 0.1, { size: 5, maxW: cw - 5.5 });
    });
  }
  bloco('neuro', 0, 3); bloco('hemato', 1, 3); bloco('habitos', 2, 3);
  const simNao = (titulo, v, y0, y1) => {
    P.t(titulo[0], X[3] + 2, y0 + 3.5, { size: 6.2, bold: true });
    P.t(titulo[1], X[3] + 2, y0 + 6.5, { size: 6.2, bold: true });
    const y = y0 + (y1 - y0) / 2 + 4.8;
    P.box(X[3] + 17, y, v === 'Sim', 'Sim', { size: 7 });
    P.box(X[3] + 27, y, v === 'Não', 'Não', { size: 7 });
  };
  simNao(['HISTÓRICO DE NÁUSEAS E VÔMITOS', 'PÓS-OPERATÓRIO'], p.nvpo, Y[3], 111.5);
  simNao(['HISTÓRICO FAMILIAR DE PROBLEMAS', 'ANESTÉSICOS'], p.histFamiliar, 111.5, Y[5]);

  // ASA / Reserva / Mallampati
  {
    const y = Y[4] + 3.3;
    P.t('AVALIAÇÃO ASA', (X[0] + X[1]) / 2, y, { size: 6.3, bold: true, align: 'center' });
    ['I', 'II', 'III', 'IV', 'V'].forEach((c, i) => P.box(X[0] + 7 + i * 6.8, y + 4.5, p.asa === c, c, { size: 7 }));
    P.t('Emergência:', X[0] + 1.5, y + 8.5, { size: 7 });
    P.box(X[0] + 17, y + 8.5, p.emergencia === 'Sim', 'Sim', { size: 7 });
    P.box(X[0] + 27, y + 8.5, p.emergencia === 'Não', 'Não', { size: 7 });
    P.t('RESERVA SANGUE', (X[1] + X[2]) / 2, y, { size: 6.3, bold: true, align: 'center' });
    P.box(X[1] + 10, y + 5.5, p.reservaSangue === 'Sim', 'Sim', { size: 7 });
    P.box(X[1] + 23, y + 5.5, p.reservaSangue === 'Não', 'Não', { size: 7 });
    P.t('AVALIAÇÃO MALLAMPATI', (X[2] + X[3]) / 2, y, { size: 6.3, bold: true, align: 'center' });
    ['I', 'II', 'III', 'IV'].forEach((c, i) => P.box(X[2] + 16 + i * 6.8, y + 4.5, p.mallampati === c, c, { size: 7 }));
    P.t('História de via aérea difícil:', X[2] + 1.5, y + 8.5, { size: 7 });
    P.box(X[2] + 35.5, y + 8.5, p.vad === 'Sim', 'Sim', { size: 7 });
    P.box(X[2] + 45.5, y + 8.5, p.vad === 'Não', 'Não', { size: 7 });
  }

  P.line(7, 135.5, 203, 135.5, 0.6);

  // ----- SRPA -----
  const s = f.srpa;
  band('CUIDADOS NA SRPA', 138.5);
  const barra = (rot, y, h, pas, pad, fc, spo2) => {
    P.rect(7, y, 196, 4.8, { fill: [240, 240, 240], lw: 0.3 });
    const by = y + 3.6;
    P.campo(rot, h, 8.5, by, 58, { size: 8 });
    P.t('PA:', 64, by, { size: 8, bold: true });
    P.line(69, by + 0.5, 78, by + 0.5, 0.15); P.v(pas, 69.5, by - 0.1, { size: 8 });
    P.t('x', 79, by, { size: 8 });
    P.line(82, by + 0.5, 90, by + 0.5, 0.15); P.v(pad, 82.5, by - 0.1, { size: 8 });
    P.t('mmHg', 91, by, { size: 8 });
    P.t('FC:', 122, by, { size: 8, bold: true });
    P.line(127, by + 0.5, 135, by + 0.5, 0.15); P.v(fc, 127.5, by - 0.1, { size: 8 });
    P.t('bpm', 136, by, { size: 8 });
    P.t('SpO2:', 162, by, { size: 8, bold: true });
    P.line(171, by + 0.5, 179, by + 0.5, 0.15); P.v(spo2, 171.5, by - 0.1, { size: 8 });
    P.t('%', 180, by, { size: 8 });
  };
  barra('HORA DA ADMISSÃO:', 147.6, s.admHora, s.admPas, s.admPad, s.admFc, s.admSpo2);

  // Aldrete
  const ax = [20, 54.5, 136, 142, 155, 162, 169, 177, 190];
  const ay0 = 156.5, ayH = 162.5, arh = 3.5;
  const nRows = ALDRETE.length * 3;
  const ayEnd = ayH + nRows * arh + 4;
  P.rect(ax[0], ay0, ax[8] - ax[0], ayEnd - ay0);
  P.rect(ax[0], ay0, ax[3] - ax[0], ayH - ay0, { fill: GRAY, lw: 0.2 });
  P.t('ESCALA DE ALDRETE E KROULIK', (ax[0] + ax[2]) / 2, ay0 + 4, { size: 7, bold: true, align: 'center' });
  ALDRETE_TEMPOS.forEach(([, l], i) => P.t(l, (ax[3 + i] + ax[4 + i]) / 2, ay0 + 4, { size: 6.5, align: 'center' }));
  for (let i = 3; i < 8; i++) P.line(ax[i], ay0, ax[i], ayEnd, 0.2);
  P.line(ax[2], ay0, ax[2], ayEnd, 0.2);
  P.line(ax[1], ayH, ax[1], ayEnd, 0.2);
  P.line(ax[0], ayH, ax[8], ayH, 0.3);
  ALDRETE.forEach(([k, titulo, opcoes], gi) => {
    const gy = ayH + gi * 3 * arh;
    P.line(ax[0], gy, ax[8], gy, 0.3);
    P.t(titulo.toUpperCase().replace('₂', '2'), (ax[0] + ax[1]) / 2, gy + 1.5 * arh + 1, { size: 6.5, bold: true, align: 'center' });
    [2, 1, 0].forEach((score, j) => {
      const y = gy + j * arh;
      if (j > 0) P.line(ax[1], y, ax[8], y, 0.12);
      P.t(opcoes[score].replace(/₂/g, '2'), (ax[1] + ax[2]) / 2, y + 2.6, { size: 6, italic: true, align: 'center' });
      P.t(String(score), (ax[2] + ax[3]) / 2, y + 2.6, { size: 6.5, align: 'center' });
      ALDRETE_TEMPOS.forEach(([tk], ti) => {
        const v = s.aldrete[tk]?.[k];
        if (v !== undefined && v !== '' && +v === score) {
          P.v('X', (ax[3 + ti] + ax[4 + ti]) / 2, y + 2.7, { size: 7, bold: true, align: 'center' });
        }
      });
    });
  });
  const ty = ayH + nRows * arh;
  P.line(ax[0], ty, ax[8], ty, 0.3);
  P.t('TOTAL', (ax[0] + ax[1]) / 2, ty + 3, { size: 6.5, italic: true, align: 'center' });
  ALDRETE_TEMPOS.forEach(([tk], ti) => P.v(aldreteTotal(f, tk), (ax[3 + ti] + ax[4 + ti]) / 2, ty + 3.1, { size: 7.5, bold: true, align: 'center' }));

  // Prescrição
  const py0 = ayEnd + 3.5, prh = 4.3;
  const px = [7.5, 18, 105, 120.5, 202.3];
  P.rect(px[0], py0, px[4] - px[0], 4.5 + prh * 3);
  P.rect(px[0], py0, px[4] - px[0], 4.5, { fill: GRAY, lw: 0.2 });
  ['ITENS', 'PRESCRIÇÃO MÉDICA', 'QUANT.', 'HORÁRIO'].forEach((h, i) => {
    P.t(h, (px[i] + px[i + 1]) / 2, py0 + 3.3, { size: 7, bold: true, align: 'center' });
    if (i > 0) P.line(px[i], py0, px[i], py0 + 4.5 + prh * 3, 0.2);
  });
  s.prescricao.slice(0, 3).forEach((r, i) => {
    const y = py0 + 4.5 + i * prh;
    P.line(px[0], y, px[4], y, 0.2);
    P.t(String(i + 1), (px[0] + px[1]) / 2, y + 3.2, { size: 8, align: 'center' });
    P.v(r.item, px[1] + 1, y + 3.2, { size: 7, maxW: px[2] - px[1] - 2 });
    P.v(r.quant, (px[2] + px[3]) / 2, y + 3.2, { size: 7, align: 'center' });
    P.v(r.horario, px[3] + 1, y + 3.2, { size: 7, maxW: px[4] - px[3] - 2 });
  });

  // Intercorrências
  const iy0 = py0 + 4.5 + prh * 3 + 2.5;
  P.rect(px[0], iy0, px[4] - px[0], 4.5 + 4.2 * 3);
  P.rect(px[0], iy0, px[4] - px[0], 4.5, { fill: GRAY, lw: 0.2 });
  P.t('INTERCORRÊNCIAS', 105, iy0 + 3.3, { size: 7, bold: true, align: 'center' });
  const il = wrapText(P.doc.setFontSize(7), s.intercorrencias, 192);
  for (let i = 0; i < 3; i++) {
    const y = iy0 + 4.5 + i * 4.2;
    if (i > 0) P.line(px[0], y, px[4], y, 0.15);
    P.v(il[i], px[0] + 1, y + 3.1, { size: 7 });
  }

  const alY = iy0 + 4.5 + 4.2 * 3 + 3.5;
  barra('HORA DA ALTA:', alY, s.altaHora, s.altaPas, s.altaPad, s.altaFc, s.altaSpo2);
  const ey = alY + 11;
  P.t('ENCAMINHADO:', 7.5, ey, { size: 8, bold: true });
  P.box(31.5, ey, s.encaminhado === 'APT', 'APT', { size: 8, s: 2.8 });
  P.box(44.5, ey, s.encaminhado === 'UTI', 'UTI', { size: 8, s: 2.8 });
  P.box(56.5, ey, s.encaminhado === 'Residência', 'Residência', { size: 8, s: 2.8 });

  const an = f.anestesista;
  P.v(an.nome, 171, ey + 2, { align: 'center', size: 8, maxW: 60 });
  P.v(`CRM ${an.crm}${an.uf ? '/' + an.uf : ''}`, 171, ey + 5.3, { align: 'center', size: 7.5 });
  P.line(140, ey + 6.5, 202, ey + 6.5, 0.2);
  P.t('ANESTESIOLOGISTA', 171, ey + 10, { size: 7.5, bold: true, align: 'center' });
}

function rodape(P, f, p, total) {
  const an = f.anestesista;
  let st = 'RASCUNHO — ficha não finalizada';
  if (f.status === 'finalizada') {
    st = `Finalizada em ${dataHoraBR(f.finalizadaEm)} por ${an.nome} (CRM ${an.crm}${an.uf ? '/' + an.uf : ''})`;
    if (f.versao > 1) st += ` — versão ${f.versao}, editada após finalização`;
  } else if (f.status === 'revisao') {
    st = 'EM REVISÃO — edição após finalização ainda não concluída';
  }
  P.t(st, 9, 292.5, { size: 5.8, color: f.status === 'finalizada' ? [90, 90, 90] : [190, 30, 30] });
  P.t(`Página ${p}/${total}`, 199, 292.5, { size: 5.8, align: 'right', color: [90, 90, 90] });
  if (f.status !== 'finalizada') {
    const doc = P.doc;
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.12 }));
    P.t('RASCUNHO', 60, 190, { size: 80, bold: true, angle: 35, color: [200, 0, 0] });
    doc.restoreGraphicsState();
  }
}
