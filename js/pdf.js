// Gera o PDF no layout da ficha em papel do CEA (A4, medidas em mm).
import {
  MONITORIZACAO, EQUIPAMENTOS, PRE_GRUPOS, ALDRETE, ALDRETE_TEMPOS,
  hhmm, dataBR, calcBalanco, resumoDrogas, aldreteTotal, num, imc, totalInfusao, N_MEDICAMENTOS,
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
  const linhas = linhasAgentes(f);
  const grupos = [];
  for (let i = 0; i < Math.max(1, linhas.length); i += N_LINHAS) grupos.push(linhas.slice(i, i + N_LINHAS));
  let folha = 1;

  janelas.forEach((inicio, i) => {
    if (i > 0) doc.addPage();
    if (i === 0) pagina1(P, f, logo, favoritos);
    else cabecalhoContinuacao(P, f, logo, ++folha, 'Registro intraoperatório — continuação da folha anterior');
    secoesTempo(P, f, inicio, grupos[0], i === 0, favoritos);
    // agentes que não couberam nas 10 linhas: folha de continuação só com a grade de agentes
    grupos.slice(1).forEach((g) => {
      doc.addPage();
      cabecalhoContinuacao(P, f, logo, ++folha, 'Agentes anestésicos — continuação (linhas além de 10)');
      gradeAgentes(P, f, inicio, g, i === 0, favoritos);
    });
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
      let str = String(s).replace(/₂/g, '2').replace(/≈/g, '~').replace(/[–]/g, '-');
      if (o.maxW) str = fit(doc, str, o.maxW);
      doc.text(str, x, y, { align: o.align || 'left', angle: o.angle || 0, baseline: o.baseline || 'alphabetic' });
      P.color();
      return P;
    },
    v(s, x, y, o = {}) { return P.t(s, x, y, { size: 8.6, ...o, ink: true }); },
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
        P.v(val, lx + 0.8, y - 0.2, { size: o.vsize ?? 8.6, maxW: x2 - lx - 1 });
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
      if (label) P.t(label, x + s + 0.8, y, { size: o.size ?? 7.5, maxW: o.maxW });
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
    ...(f.infusoes || []).flatMap((x) => [...x.etapas.map((e) => e.t), ...(x.fim ? [x.fim] : [])]),
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

const N_LINHAS = 10;

// Linhas da grade "Agente anestésico": drogas em bolus (uma linha por droga/unidade) e
// cada infusão contínua ou gás na sua própria linha, na ordem em que apareceram.
function linhasAgentes(f) {
  const out = [];
  [...f.drogas].sort((a, b) => (a.t > b.t ? 1 : -1)).forEach((d) => {
    const chave = `${d.nome} (${d.unid})`;
    if (!out.some((l) => l.chave === chave)) out.push({ tipo: 'bolus', chave, rotulo: chave, t: d.t });
  });
  for (const inf of f.infusoes || []) {
    if (!inf.etapas?.length) continue;
    out.push({ tipo: 'inf', inf, rotulo: inf.nome, t: inf.etapas[0].t });
  }
  return out.sort((a, b) => (a.t > b.t ? 1 : -1));
}

function ultimoTempo(f) {
  const ts = tudoComTempo(f);
  return ts.length ? Math.max(...ts) : Date.now();
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
  const vImc = imc(f);
  P.campo('Peso', a.peso ? `${num(a.peso)}kg` : '', 10.5, 40.6, 25, { size: 6.5, vsize: 8 });
  P.campo('Alt.', a.altura ? `${num(a.altura)}` : '', 25.8, 40.6, 37, { size: 6.5, vsize: 8, suf: 'cm' });
  P.campo('IMC', vImc ? num(vImc) : '', 10.5, 45.2, 25, { size: 6.5, vsize: 8 });
  P.campo('ASA', asa, 25.8, 45.2, 40, { size: 6.5, vsize: 8 });
  P.campo('Jejum', a.jejum, 10.5, 49.8, 38, { size: 6.5, vsize: 8, suf: 'h' });
  P.line(9, 52.3, 41, 52.3, 0.2);
  P.campo('Início', hhmm(f.tempos.inicioAnest), 10.5, 58.6, 38, { suf: 'h' });
  P.campo('Término', hhmm(f.tempos.fimAnest), 10.5, 65.4, 38, { suf: 'h' });

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
  if (ac.na) P.v('Não se aplica', 188.3, 79.6, { size: 5.8, italic: true, bold: true, align: 'center' });
  P.campo('Periférico nº', ac.perifNum, 179, 83, 198, { size: 6, vsize: 7.6 });
  P.campo('Local', ac.local, 179, 87.5, 198, { size: 6, vsize: 7.6 });
  P.campo('Central Via', ac.centralVia, 179, 93, 198, { size: 6, vsize: 7.6 });
  P.t('Intercorrências', 179, 98, { size: 6 });
  P.circ(179, 101.8, ac.interc === 'Sim', 'Sim');
  P.circ(188, 101.8, ac.interc === 'Não', 'Não');
  P.line(177.7, 103.5, 199, 103.5, 0.2);
  P.t('MPA', 179, 107.5, { size: 6 });
  P.line(179, 112, 198, 112, 0.15);
  P.v(ac.mpa, 179.3, 111.3, { size: 7.4, maxW: 19 });

  painelDireito(P, f);
  anotacoesLabs(P, f);
  tabelaDrogas(P, f, favoritos);
}

function cabecalhoContinuacao(P, f, logo, n, texto) {
  titulo(P, `FICHA DE ANESTESIA — continuação (${n})`, logo);
  P.campo('Nome:', f.pac.nome, 9, 28, 131);
  P.campo('Data', dataBR(f.pac.data), 147.5, 28, 179);
  P.t(texto, 9, 50, { size: 8, italic: true });
}

// Seções que dependem do tempo: agentes, soros/parâmetros e gráfico.
function vGradeTempo(P, y1, y2) {
  for (let c = 0; c <= G.cols; c++) P.line(G.x0 + c * G.cw, y1, G.x0 + c * G.cw, y2, c % 12 === 0 ? 0.45 : 0.12);
}

// Linha em zig-zag (infusão contínua / gás em curso).
function zigzag(doc, x1, x2, yc) {
  if (x2 - x1 < 0.4) return;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.22);
  const passo = 0.6, amp = 0.55;
  let x = x1, yAnt = yc, cima = true;
  while (x < x2 - 1e-6) {
    const nx = Math.min(x + passo, x2);
    const ny = yc + (cima ? -amp : amp);
    doc.line(x, yAnt, nx, ny);
    x = nx; yAnt = ny; cima = !cima;
  }
  doc.setDrawColor(0);
}

function gradeAgentes(P, f, inicio, linhas, primeira, favoritos) {
  const doc = P.doc;
  const col = (t) => (inicio === null ? -1 : Math.floor((new Date(t).getTime() - inicio) / (5 * MIN)));
  const noJanela = (c) => c >= 0 && c < G.cols;
  const xt = (t) => G.x0 + ((new Date(t).getTime() - inicio) / (5 * MIN)) * G.cw;
  const y0 = 69.5, yH = 73.5, yR = 77.2, yEnd = 114.3, nL = N_LINHAS, rh = (yEnd - yR) / nL;
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
  vGradeTempo(P, yR, yEnd);
  if (inicio !== null) {
    for (let c = 0; c < G.cols; c += 3) {
      if (c > 0) P.line(G.x0 + c * G.cw, yH, G.x0 + c * G.cw, yR, c % 12 === 0 ? 0.45 : 0.15);
      P.t(hhmm(new Date(inicio + c * 5 * MIN).toISOString()), G.x0 + c * G.cw + 0.4, yR - 0.9, { size: 4.6, bold: c % 12 === 0 });
    }
  }
  const resumo = resumoDrogas(f, favoritos);
  const tFim = ultimoTempo(f);
  (linhas || []).slice(0, nL).forEach((ln, i) => {
    const top = yR + i * rh;
    const y = top + rh - 0.9;
    P.v(ln.rotulo, 10, y, { size: 6.2, maxW: 19.6 });
    if (ln.tipo === 'bolus') {
      const celulas = new Map();
      for (const d of f.drogas) {
        if (`${d.nome} (${d.unid})` !== ln.chave) continue;
        const c = col(d.t);
        if (!noJanela(c)) continue;
        celulas.set(c, (celulas.get(c) || 0) + (+String(d.dose).replace(',', '.') || 0));
      }
      for (const [c, dose] of celulas) P.v(num(Math.round(dose * 100) / 100), G.x0 + c * G.cw + 0.2, y, { size: 5.6 });
      if (primeira) {
        const tot = resumo.filter((r) => `${r.nome} (${r.unid})` === ln.chave).reduce((s2, r) => s2 + r.total, 0);
        P.v(`${num(Math.round(tot * 100) / 100)}`, 171.8, y, { size: 6.2, align: 'center' });
      }
      return;
    }
    // infusão contínua / TCI / gás: zig-zag do início ao fim, com a dose no início e a cada mudança
    const inf = ln.inf;
    if (inicio !== null) {
      const tIni = +new Date(inf.etapas[0].t);
      const tAte = inf.fim ? +new Date(inf.fim) : tFim;
      const xa = Math.max(G.x0, xt(tIni)), xb = Math.min(G.x1, xt(tAte));
      const yc = top + rh * 0.72;
      if (xb > G.x0 && xa < G.x1) {
        zigzag(doc, xa, xb, yc);
        doc.setDrawColor(...INK); doc.setLineWidth(0.3);
        inf.etapas.forEach((e, k) => {
          const xe = xt(e.t);
          if (xe < G.x0 - 0.01 || xe > G.x1) return;
          doc.line(xe, yc - 0.9, xe, yc + 0.9);
          const txt = num(e.valor) + (k === 0 ? ` ${inf.tci || inf.unid}` : '');
          P.v(txt, xe + 0.3, top + 1.75, { size: 4.6 });
          doc.setDrawColor(...INK);
        });
        if (inf.fim && xt(inf.fim) <= G.x1) { doc.setLineWidth(0.45); doc.line(xb, yc - 1.1, xb, yc + 1.1); }
        doc.setDrawColor(0);
      }
    }
    if (primeira) {
      const t = totalInfusao(inf, f.pac.peso, tFim);
      if (t) P.v(`${num(t.valor)} ${t.unid}`, 171.8, y, { size: 5.4, align: 'center', maxW: 11.4 });
      else if (inf.gas) P.v(inf.unid, 171.8, y, { size: 5.4, align: 'center' });
    }
  });
}

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

  gradeAgentes(P, f, inicio, linhasDrogas, primeira, favoritos);

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
    if (ln.nome) P.v(ln.nome, 10, y, { size: 6.2, maxW: 19.6 }); else P.t(ln.rot, 10.5, y, { size: 6 });
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
    for (const [c, val] of cel) P.v(num(val), G.x0 + c * cw15 + cw15 / 2, y, { size: 7.2, align: 'center' });
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
  const cab = (t, na) => {
    P.rect(x, y, w, 4.2, { fill: [205, 205, 205], lw: 0.2 });
    P.t(t, na ? x + 1.2 : x + w / 2, y + 3.1, { size: 6.5, bold: true, align: na ? 'left' : 'center' });
    if (na) P.v('Não se aplica', x + w - 1, y + 3.1, { size: 5.5, italic: true, bold: true, align: 'right' });
    y += 4.2 + 3.6;
  };
  const nl = (d = 3.55) => { y += d; };
  const xa = x + 1.2;

  cab('ANESTESIA', an.na);
  P.t('GERAL', xa, y, { size: 5.8, bold: an.geral });
  P.circ(xa + 8, y, an.geralIV, 'IV', { size: 5.5 });
  P.circ(xa + 15, y, an.geralInal, 'Inal.', { size: 5.5 });
  P.circ(xa + 24, y, an.geralBal, 'Bal.', { size: 5.5 }); nl();
  P.t('SEDAÇÃO', xa, y, { size: 5.8, bold: an.sedacao });
  P.circ(xa + 11, y, !!an.o2, 'O2', { size: 5.5 });
  P.line(xa + 18, y + 0.5, xa + 25, y + 0.5, 0.12); P.v(an.o2, xa + 18.3, y - 0.1, { size: 6.8 });
  P.t('l/min', xa + 25.4, y, { size: 5 }); nl();
  P.circ(xa, y, an.local, 'Local', { size: 5.5 });
  P.circ(xa + 11, y, an.locoregional, 'Locoregional', { size: 5.5 }); nl();
  P.circ(xa, y, an.peridural, 'Peridural', { size: 5.5 });
  P.circ(xa + 13.5, y, an.cateter, 'C/Cateter nº', { size: 5.5 });
  P.v(an.cateterNum, xa + 29, y, { size: 6.8 }); nl();
  P.circ(xa, y, an.subaracnoidea, 'Subaracnóidea', { size: 5.5 }); nl();
  P.campo('Agulha', an.agulha, xa, y, xr - 1, { size: 5.5, vsize: 6.8 }); nl();
  P.campo('Local', an.localNeuro, xa, y, xr - 1, { size: 5.5, vsize: 6.8 }); nl();
  P.circ(xa, y, an.bloqueio, 'Bloqueio', { size: 5.5 });
  P.circ(xa + 13.5, y, an.estimulador, 'C/ Estimulador', { size: 5.5 }); nl();
  P.campo('Local', an.localBloq, xa, y, xr - 1, { size: 5.5, vsize: 6.8 }); nl();
  P.t('Intercorrências', xa, y, { size: 5.5 });
  P.circ(xa + 16, y, an.interc === 'Sim', 'Sim', { size: 5.5 });
  P.circ(xa + 24, y, an.interc === 'Não', 'Não', { size: 5.5 }); nl();
  P.line(xa, y + 0.5, xr - 1, y + 0.5, 0.12); P.v(an.intercDesc, xa + 0.3, y, { size: 6.3, maxW: w - 3 });
  y += 2.2;

  cab('VENTILAÇÃO', ve.na);
  P.circ(xa, y, ve.espontanea, 'Ventilação Espontânea', { size: 5.3 });
  P.circ(xa + 23.5, y, ve.vcm, 'VCM', { size: 5.3 }); nl();
  P.circ(xa, y, ve.vcv, 'VCV', { size: 5.5 });
  P.circ(xa + 23.5, y, ve.pcv, 'PCV', { size: 5.3 }); nl();
  P.t('Máscara', xa, y, { size: 5.8, bold: true }); nl();
  P.circ(xa, y, ve.mascFacial, 'Máscara Facial', { size: 5.5 }); nl();
  P.circ(xa, y, ve.mascLaringea, 'Máscara Laríngea nº', { size: 5.5 });
  P.v(ve.mlNum, xa + 23, y, { size: 6.8 }); nl();
  P.t('Intubação', xa, y, { size: 5.8, bold: true }); nl();
  P.circ(xa, y, ve.intubacao === 'Orotraqueal', 'Sonda Orotraqueal', { size: 5.5 });
  if (ve.intubacao === 'Orotraqueal') P.v(ve.tuboNum, xa + 22, y, { size: 6.8 });
  nl();
  P.circ(xa, y, ve.intubacao === 'Nasotraqueal', 'Sonda Nasotraqueal', { size: 5.5 });
  if (ve.intubacao === 'Nasotraqueal') P.v(ve.tuboNum, xa + 23, y, { size: 6.8 });
  nl();
  P.circ(xa, y, ve.dificuldade === 'Fácil', 'Fácil', { size: 5.5 });
  P.circ(xa + 12, y, ve.dificuldade === 'Difícil', 'Difícil', { size: 5.5 }); nl();
  P.t('Intercorrências', xa, y, { size: 5.5 });
  P.circ(xa + 16, y, ve.interc === 'Sim', 'Sim', { size: 5.5 });
  P.circ(xa + 24, y, ve.interc === 'Não', 'Não', { size: 5.5 }); nl();
  P.line(xa, y + 0.5, xr - 1, y + 0.5, 0.12); P.v(ve.intercDesc, xa + 0.3, y, { size: 6.3, maxW: w - 3 });
  y += 2.5;
  P.line(x, y, xr, y, 0.3); y += 3.8;

  const b = f.balanco, calc = calcBalanco(f);
  const val = (manual, auto) => (manual !== '' ? manual : auto ? String(auto) : '');
  P.campo('Diurese', b.diurese, xa, y, xr - 4, { size: 5.5, vsize: 7, suf: 'ml' }); nl(3.8);
  P.t('Volume', xa, y, { size: 6, bold: true }); nl(3.3);
  P.campo('Cristalóide', val(b.cristaloide, calc.cristaloide), xa, y, xr - 4, { size: 5.5, vsize: 7, suf: 'ml' }); nl(3.3);
  P.campo('Colóide', val(b.coloide, calc.coloide), xa, y, xr - 4, { size: 5.5, vsize: 7, suf: 'ml' }); nl(3.8);
  P.t('Balanço Hídrico', xa, y, { size: 6, bold: true }); nl(3.3);
  const perdasAuto = (+b.diurese || 0) || '';
  P.campo('Perdas', val(b.perdas, perdasAuto), xa, y, xr - 4, { size: 5.5, vsize: 7, suf: 'ml' }); nl(3.3);
  P.campo('Ganhos', val(b.ganhos, calc.ganhos), xa, y, xr - 4, { size: 5.5, vsize: 7, suf: 'ml' });
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
    P.v(f.labs[i], 10.7, y, { size: 6.2, maxW: 13.3 });
  }
  // Anotações
  P.rect(27, 221.5, 139, 39.5);
  P.t('ANOTAÇÕES', 30.3, 250, { size: 6.5, bold: true, angle: 90 });
  P.line(31.5, 221.5, 31.5, 261, 0.2);
  const lh = 3.5, x = 32.5, w = 132.5, fs = 7.2;
  const linhas = [];
  doc.setFont('helvetica', 'normal');
  if (f.anotacoes) linhas.push(...wrapText(doc.setFontSize(fs), 'Obs.: ' + f.anotacoes, w));
  const ev = eventosNumerados(f);
  if (ev.length) {
    linhas.push(...wrapText(doc.setFontSize(fs), ev.map((e) => `(${e.n}) ${hhmm(e.t)} ${e.texto}`).join('   '), w));
  }
  const calc = calcBalanco(f);
  if (calc.hemo) linhas.push(`Hemoderivados: ${calc.hemo} ml`);
  for (let i = 0; i < 11; i++) P.line(x, 225 + i * lh, 165, 225 + i * lh, 0.12);
  linhas.slice(0, 11).forEach((l, i) => P.v(l, x + 0.3, 224.5 + i * lh, { size: fs }));
  if (linhas.length > 11) P.t('(continua…)', 164.5, 260, { size: 5, italic: true, align: 'right' });
}

function tabelaDrogas(P, f, favoritos) {
  const y0 = 262.3, yh = 266, rh = 3.52;
  const lista = resumoDrogas(f, favoritos);
  const tFim = ultimoTempo(f);
  for (const inf of f.infusoes || []) {
    if (inf.gas || !inf.etapas?.length) continue;
    const t = totalInfusao(inf, f.pac.peso, tFim);
    lista.push({ nome: inf.nome + (inf.tci ? ' (TCI)' : ' (inf.)'), total: t ? t.valor : '', unid: t ? t.unid : 'mg', via: 'IV', amp: '' });
  }
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
        P.v(d.nome, xs[1] + 0.6, y + 2.8, { size: 7, maxW: cols[1] - 1 });
        P.v(d.total === '' ? '' : num(d.total) + (d.unid !== 'mg' ? ` ${d.unid}` : ''), xs[2] + cols[2] / 2, y + 2.8, { size: 6.4, align: 'center', maxW: cols[2] - 0.5 });
        P.v(d.via, xs[3] + cols[3] / 2, y + 2.8, { size: 6.4, align: 'center' });
        P.v(d.amp, xs[4] + cols[4] / 2, y + 2.8, { size: 6.6, align: 'center' });
      }
    }
  }
}

// ---------- página 2 ----------
// Metade de cima: avaliação pré-anestésica. Metade de baixo: cuidados na SRPA (Aldrete compacto).
const ROT_PDF = {
  'Angina / Coronariopatia': 'Angina/Coronariop.', 'Infarto do miocárdio': 'IAM', 'Insuf. cardíaca': 'Insuf. cardíaca',
  'Asma / Bronquite': 'Asma/Bronquite', 'Dependência de O₂': 'Dependência O2', 'Refluxo gastroesofágico': 'Refluxo GE',
  'Obstrução intestinal': 'Obstr. intestinal', 'Vômito / diarreia': 'Vômito/diarreia', 'Dormência / fraqueza': 'Dormência/fraqueza',
  'Doença renal crônica': 'Doença renal crônica', 'Insuf. renal aguda': 'Insuf. renal aguda', 'Patologia da tireoide': 'Tireoide',
};

const ALDRETE_LEGENDA = {
  atividade: '2: move 4 membros · 1: move 2 · 0: nenhum',
  respiracao: '2: respira fundo e tosse · 1: dispneia · 0: apneia',
  circulacao: '2: PA ±20 do pré · 1: ±20 a 50 · 0: ±50',
  spo2: '2: >92% em ar · 1: >90% com O2 · 0: <90% com O2',
  consciencia: '2: acordado · 1: desperta ao estímulo · 0: não responde',
};

function pagina2(P, f) {
  const p = f.pre;
  const X0 = 7.5, X1 = 202.5, W = X1 - X0;
  const band = (t, y) => {
    P.rect(X0, y, W, 5, { fill: GRAY, lw: 0.3 });
    P.t(t, 105, y + 3.6, { size: 8, bold: true, align: 'center' });
  };
  // célula com título e caixa "Negativo"
  const celula = (x, y, w, h, titulo, neg) => {
    P.rect(x, y, w, h, { lw: 0.25 });
    P.t(titulo.toUpperCase(), x + 1.3, y + 3, { size: 5.9, bold: true, maxW: w - (neg === undefined ? 2 : 17) });
    if (neg !== undefined) P.box(x + w - 13.2, y + 3.1, !!neg, 'Negativo', { s: 2, size: 5.4 });
  };
  const sn = (rot, v, x, y, o = {}) => {
    P.t(rot, x, y, { size: o.size ?? 6, bold: o.bold });
    P.font(o.size ?? 6, o.bold);
    const lx = x + P.doc.getTextWidth(rot) + 1;
    P.box(lx, y, v === 'Sim', 'Sim', { s: 2, size: 5.8 });
    P.box(lx + 8, y, v === 'Não', 'Não', { s: 2, size: 5.8 });
  };

  band('AVALIAÇÃO PRÉ-ANESTÉSICA', 8);
  P.t(`Data: ${dataBR(p.dataAval) || '___/___/____'}   Hora: ${p.horaAval || '__:__'}`, X1 - 1.5, 11.6, { size: 6.5, align: 'right' });
  P.campo('Diagnóstico:', p.diagnostico, X0, 17.3, 104);
  P.campo('Cirurgia/Procedimento:', p.procedimento, 105.5, 17.3, X1, { vsize: 8 });

  // ----- sinais e jejum
  const sy = 19.6, sh = 7.2;
  const vImc = imc(f);
  const sinais = [
    ['PESO (kg)', num(f.pac.peso), 15], ['ALTURA (cm)', num(f.pac.altura), 17], ['IMC', vImc ? num(vImc) : '', 12],
    ['PA (mmHg)', p.pa, 21], ['FC', p.fc, 12], ['TEMP', num(p.temp), 13], ['FR', p.fr, 12],
    ['JEJUM SÓLIDOS (h)', num(p.jejumSolidos), 25], ['JEJUM LÍQUIDOS (h)', num(p.jejumLiquidos), 25],
    [`DOR (${p.dorEscala === 'Criança' ? 'criança 0-5' : 'adulto 0-10'})`, p.dor, 0],
  ];
  let sx = X0;
  sinais.forEach(([rot, val, w], i) => {
    const cw = i === sinais.length - 1 ? X1 - sx : w;
    P.rect(sx, sy, cw, sh, { lw: 0.25 });
    P.t(rot, sx + cw / 2, sy + 2.4, { size: 5, bold: true, align: 'center', maxW: cw - 1 });
    P.v(val, sx + cw / 2, sy + 6.2, { size: 8.6, align: 'center', maxW: cw - 1 });
    sx += cw;
  });

  // ----- sistemas
  const cw4 = W / 4;
  const grp = Object.fromEntries(PRE_GRUPOS.map((g) => [g[0], g]));
  const sistema = (k, ci, y, h, extra) => {
    const [, titulo, itens] = grp[k];
    const x = X0 + ci * cw4;
    celula(x, y, cw4, h, titulo, p.negativos[k]);
    let i = 0;
    const meia = (cw4 - 2) / 2;
    const pos = () => ({ x: x + 1.3 + (i % 2) * meia, y: y + 6.4 + Math.floor(i / 2) * 2.75 });
    for (const [ik, il] of itens) {
      let lab = ROT_PDF[il] || il;
      if (ik === 'diabetes') lab = `Diabetes ${p.diabetesTipo ? 'tipo ' + p.diabetesTipo : ''}`;
      if (ik === 'tabaco') lab = `Tabaco${p.cigarros ? ' ' + p.cigarros + ' cig/d' : ''}`;
      const q = pos();
      P.box(q.x, q.y, !!p.itens[`${k}_${ik}`], lab, { s: 2, size: 5.8, maxW: meia - 3.2 });
      i++;
    }
    let ly = y + 6.4 + Math.ceil(itens.length / 2) * 2.75;
    if (extra) ly = extra(x, ly);
    if (p.outros[k] || ly < y + h - 1) P.campo('Outras:', p.outros[k], x + 1.3, Math.min(ly, y + h - 1.2), x + cw4 - 1.3, { size: 5.8, vsize: 7 });
  };
  const yA = 28.3, hA = 21.5;
  sistema('cardio', 0, yA, hA, (x, ly) => { P.campo('Toler. exercício:', p.toleranciaExercicio, x + 1.3, ly, x + cw4 - 1.3, { size: 5.8, vsize: 7 }); return ly + 2.9; });
  sistema('respiratorio', 1, yA, hA);
  sistema('gastro', 2, yA, hA);
  sistema('neuro', 3, yA, hA);
  const yB = yA + hA, hB = 13.5;
  sistema('renal', 0, yB, hB);
  sistema('endocrino', 1, yB, hB);
  sistema('infeccioso', 2, yB, hB);
  sistema('habitos', 3, yB, hB);

  // ----- câncer / gravidez / históricos / outras comorbidades
  const yC = yB + hB, hC = 12;
  {
    const x = X0;
    celula(x, yC, cw4, hC, 'Câncer', p.cancer === 'Negativo');
    P.box(x + 1.3, yC + 6.4, p.cancer === 'Positivo', 'Positivo', { s: 2, size: 5.8 });
    P.box(x + 17, yC + 6.4, p.qt, 'QT', { s: 2, size: 5.8 });
    P.box(x + 26, yC + 6.4, p.rt, 'RT', { s: 2, size: 5.8 });
    P.campo('Local:', p.cancerLocal, x + 1.3, yC + 10.3, x + cw4 - 1.3, { size: 5.8, vsize: 7 });
  }
  {
    const x = X0 + cw4;
    celula(x, yC, cw4, hC, 'Gravidez', p.gravidez === 'Negativo');
    P.box(x + 1.3, yC + 6.4, p.gravidez === 'Positivo', 'Positivo', { s: 2, size: 5.8 });
    P.campo('IG:', p.igSemanas, x + 17, yC + 6.4, x + 31, { size: 5.8, vsize: 7, suf: 'sem' });
    P.campo('DUM:', p.dum ? dataBR(p.dum) : '', x + 1.3, yC + 10.3, x + cw4 - 1.3, { size: 5.8, vsize: 7 });
  }
  {
    const x = X0 + 2 * cw4;
    P.rect(x, yC, cw4, hC, { lw: 0.25 });
    P.t('NÁUSEAS/VÔMITOS PÓS-OP.', x + 1.3, yC + 3, { size: 5.6, bold: true });
    sn('', p.nvpo, x + 1.3, yC + 5.9);
    P.t('HIST. FAMILIAR PROBL. ANESTÉSICOS', x + 1.3, yC + 8.6, { size: 5.6, bold: true, maxW: cw4 - 2 });
    sn('', p.histFamiliar, x + 1.3, yC + 11.3);
  }
  {
    const x = X0 + 3 * cw4;
    P.rect(x, yC, cw4, hC, { lw: 0.25 });
    P.t('OUTRAS COMORBIDADES', x + 1.3, yC + 3, { size: 5.9, bold: true });
    const l = wrapText(P.doc.setFontSize(7), p.outrosGeral, cw4 - 2.6);
    l.slice(0, 3).forEach((t, i) => P.v(t, x + 1.3, yC + 6.2 + i * 2.6, { size: 7 }));
  }

  // ----- alergias, cirurgias prévias (esquerda) e medicação (direita)
  const yD = yC + hC, hD = 30;
  const metade = W / 2;
  const tabela = (x, y, w, titulo, neg, cabec, larguras, linhas, rh) => {
    celula(x, y, w, 3.6 + 3 + linhas.length * rh, titulo, neg);
    let cx = x;
    const xs = larguras.map((lw) => { const a = cx; cx += lw * w; return a; });
    P.line(x, y + 3.6, x + w, y + 3.6, 0.2);
    cabec.forEach((c, i) => {
      if (i) P.line(xs[i], y + 3.6, xs[i], y + 6.6 + linhas.length * rh, 0.15);
      P.t(c, xs[i] + (larguras[i] * w) / 2, y + 5.7, { size: 5.4, bold: true, align: 'center' });
    });
    linhas.forEach((cols, r) => {
      const ly = y + 6.6 + r * rh;
      P.line(x, ly, x + w, ly, 0.12);
      cols.forEach((v, i) => P.v(v, xs[i] + 0.8, ly + rh - 0.75, { size: 7, maxW: larguras[i] * w - 1.4 }));
    });
  };
  tabela(X0, yD, metade, 'Alergias', p.alergiaNeg, ['TIPO / AGENTE', 'REAÇÃO'], [0.5, 0.5],
    p.alergias.slice(0, 3).map((a) => [a.agente, a.reacao]), 2.8);
  tabela(X0, yD + 15.1, metade, 'Cirurgia / anestesia prévia', p.previaNeg, ['CIRURGIA', 'ANESTESIA', 'DADOS RELEVANTES'], [0.36, 0.24, 0.4],
    p.previas.slice(0, 3).map((a) => [a.cirurgia, a.anestesia, a.dados]), 2.8);
  tabela(X0 + metade, yD, metade, 'Medicação em uso', undefined, ['MEDICAÇÃO', 'DOSE DIÁRIA', 'ÚLTIMAS 24 h'], [0.5, 0.3, 0.2],
    p.medicamentos.slice(0, N_MEDICAMENTOS).map((m) => [m.nome, m.dose, m.ult24]), 3.3);

  // ----- via aérea / exame físico / exames pré-operatórios
  const yE = yD + hD, hE = 24.5, w3 = W / 3;
  {
    const x = X0;
    celula(x, yE, w3, hE, 'Avaliação de via aérea');
    const l = [
      ['História de via aérea difícil:', p.vad], ['Protrusão da mandíbula normal:', p.protrusao], ['Previsão de via aérea difícil:', p.previsaoVad],
    ];
    let y = yE + 6.2;
    l.forEach(([rot, v]) => { sn(rot, v, x + 1.3, y, { size: 5.8 }); y += 2.75; });
    const op = (rot, ops, v) => {
      P.t(rot, x + 1.3, y, { size: 5.8 });
      P.font(5.8);
      let ox = x + 1.3 + P.doc.getTextWidth(rot) + 1;
      ops.forEach(([val, lab]) => { P.box(ox, y, v === val, lab, { s: 2, size: 5.6 }); P.font(5.6); ox += P.doc.getTextWidth(lab) + 4; });
      y += 2.75;
    };
    op('Pescoço:', [['Normal', 'Normal'], ['Largo', 'Largo >40cm'], ['Curto', 'Curto']], p.pescoco);
    op('Flexão/extensão:', [['Normal', 'Normal'], ['Limitada', 'Limitada']], p.flexao);
    op('Mallampati:', [['I', 'I'], ['II', 'II'], ['III', 'III'], ['IV', 'IV']], p.mallampati);
    P.campo('Outros:', p.viaOutros, x + 1.3, y + 0.4, x + w3 - 1.3, { size: 5.8, vsize: 7 });
  }
  {
    const x = X0 + w3;
    celula(x, yE, w3, hE, 'Exame físico');
    [['Cardíaco:', p.exame.cardiaco], ['Resp.:', p.exame.resp], ['Neuro:', p.exame.neuro], ['Regional:', p.exame.regional], ['Outro:', p.exame.outro]]
      .forEach(([r, v], i) => P.campo(r, v, x + 1.3, yE + 7.2 + i * 3.6, x + w3 - 1.3, { size: 6, vsize: 7.4 }));
  }
  {
    const x = X0 + 2 * w3;
    celula(x, yE, w3, hE, 'Exames pré-operatórios');
    const mw = (w3 - 2.6) / 2;
    p.examesPre.slice(0, 6).forEach((v, i) => {
      const cx = x + 1.3 + (i % 2) * mw, cy = yE + 8 + Math.floor(i / 2) * 5.2;
      P.line(cx, cy + 0.5, cx + mw - 1.5, cy + 0.5, 0.12);
      P.v(v, cx + 0.3, cy - 0.1, { size: 7.4, maxW: mw - 1.8 });
    });
  }

  // ----- ASA / reserva de sangue / planejamento / conclusão
  const yF = yE + hE, hF = 15;
  {
    const x = X0;
    P.rect(x, yF, cw4, hF, { lw: 0.25 });
    P.t('ESTADO FÍSICO ASA', x + 1.3, yF + 3, { size: 5.9, bold: true });
    ['I', 'II', 'III', 'IV', 'V'].forEach((c, i) => P.box(x + 1.3 + i * 9.4, yF + 7, p.asa === c, `P${i + 1}`, { s: 2.2, size: 6.4 }));
    sn('Emergência:', p.emergencia, x + 1.3, yF + 11.6, { size: 6 });
  }
  {
    const x = X0 + cw4;
    P.rect(x, yF, cw4, hF, { lw: 0.25 });
    P.t('RESERVA DE SANGUE', x + 1.3, yF + 3, { size: 5.9, bold: true });
    sn('', p.reservaSangue, x + 1.3, yF + 6.6);
    const h = p.hemo || {};
    const txt = [['CH', h.ch], ['Plaq', h.plaq], ['PFC', h.plasma], ['Crio', h.crio]].filter(([, v]) => v).map(([r, v]) => `${r} ${v} U`).join(', ');
    wrapText(P.doc.setFontSize(7), txt, cw4 - 2.6).slice(0, 2).forEach((t, i) => P.v(t, x + 1.3, yF + 9.9 + i * 2.8, { size: 7 }));
  }
  {
    const x = X0 + 2 * cw4;
    P.rect(x, yF, cw4, hF, { lw: 0.25 });
    P.t('PLANEJAMENTO ANESTÉSICO', x + 1.3, yF + 3, { size: 5.9, bold: true });
    P.campo('Téc. proposta:', p.tecProposta, x + 1.3, yF + 7.6, x + cw4 - 1.3, { size: 5.8, vsize: 7 });
    P.campo('Téc. alternativa:', p.tecAlternativa, x + 1.3, yF + 12.3, x + cw4 - 1.3, { size: 5.8, vsize: 7 });
  }
  {
    const x = X0 + 3 * cw4;
    P.rect(x, yF, cw4, hF, { lw: 0.25 });
    sn('UTI:', p.uti, x + 1.3, yF + 3.4, { size: 6, bold: true });
    P.campo('Outra especialidade:', p.outraEspecialidade, x + 1.3, yF + 7.6, x + cw4 - 1.3, { size: 5.8, vsize: 7 });
    sn('LIBERADO P/ CIRURGIA:', p.liberado, x + 1.3, yF + 12.3, { size: 6, bold: true });
  }
  // ----- comentários
  const yG = yF + hF;
  P.rect(X0, yG, W, 8.6, { lw: 0.25 });
  P.t('COMENTÁRIOS SOBRE OS ACHADOS', X0 + 1.3, yG + 3, { size: 5.9, bold: true });
  wrapText(P.doc.setFontSize(7.2), p.comentarios, W - 3).slice(0, 2).forEach((t, i) => P.v(t, X0 + 1.3, yG + 5.6 + i * 2.7, { size: 7.2 }));

  const ySep = yG + 10.5;
  P.line(X0, ySep, X1, ySep, 0.6);

  // ================= SRPA =================
  const s = f.srpa;
  const y0 = ySep + 1.6;
  band('CUIDADOS NA SRPA', y0);
  const barra = (rot, y, h, pas, pad, fc, spo2) => {
    P.rect(X0, y, W, 5, { fill: [240, 240, 240], lw: 0.3 });
    const by = y + 3.7;
    P.campo(rot, h, 8.5, by, 58, { size: 7.5, vsize: 8.6 });
    P.t('PA:', 64, by, { size: 7.5, bold: true });
    P.line(69, by + 0.5, 78, by + 0.5, 0.15); P.v(pas, 69.5, by - 0.1);
    P.t('x', 79, by, { size: 7.5 });
    P.line(82, by + 0.5, 90, by + 0.5, 0.15); P.v(pad, 82.5, by - 0.1);
    P.t('mmHg', 91, by, { size: 7.5 });
    P.t('FC:', 122, by, { size: 7.5, bold: true });
    P.line(127, by + 0.5, 135, by + 0.5, 0.15); P.v(fc, 127.5, by - 0.1);
    P.t('bpm', 136, by, { size: 7.5 });
    P.t('SpO2:', 162, by, { size: 7.5, bold: true });
    P.line(171, by + 0.5, 179, by + 0.5, 0.15); P.v(spo2, 171.5, by - 0.1);
    P.t('%', 180, by, { size: 7.5 });
  };
  barra('HORA DA ADMISSÃO:', y0 + 6.4, s.admHora, s.admPas, s.admPad, s.admFc, s.admSpo2);

  // Aldrete e Kroulik compacto: uma linha por critério, pontuação em cada tempo
  const ay = y0 + 13.4, ah = 4.4, arh = 3.7;
  const ax = [X0, X0 + 29, X0 + 105];
  const tw = (X1 - ax[2]) / ALDRETE_TEMPOS.length;
  const nR = ALDRETE.length;
  const aEnd = ay + ah + nR * arh + 4;
  P.rect(X0, ay, W, aEnd - ay);
  P.rect(X0, ay, ax[2] - X0, ah, { fill: GRAY, lw: 0.2 });
  P.t('ESCALA DE ALDRETE E KROULIK', ax[0] + 1.3, ay + 3.1, { size: 6.8, bold: true });
  P.t('pontuação: 2 · 1 · 0', ax[2] - 1.3, ay + 3.1, { size: 5.6, italic: true, align: 'right' });
  ALDRETE_TEMPOS.forEach(([, l], i) => {
    P.line(ax[2] + i * tw, ay, ax[2] + i * tw, aEnd, 0.2);
    P.t(l, ax[2] + i * tw + tw / 2, ay + 3.1, { size: 6.8, bold: true, align: 'center' });
  });
  P.line(X0, ay + ah, X1, ay + ah, 0.3);
  P.line(ax[1], ay + ah, ax[1], aEnd - 4, 0.15);
  ALDRETE.forEach(([k, titulo], r) => {
    const y = ay + ah + r * arh;
    if (r) P.line(X0, y, X1, y, 0.12);
    P.t(titulo.toUpperCase().replace('₂', '2'), ax[0] + 1.3, y + 2.7, { size: 6, bold: true });
    P.t(ALDRETE_LEGENDA[k], ax[1] + 1, y + 2.6, { size: 5.5, italic: true, maxW: ax[2] - ax[1] - 2 });
    ALDRETE_TEMPOS.forEach(([tk], i) => {
      const v = s.aldrete[tk]?.[k];
      if (v !== undefined && v !== '') P.v(String(v), ax[2] + i * tw + tw / 2, y + 2.9, { size: 8.6, bold: true, align: 'center' });
    });
  });
  const ty = ay + ah + nR * arh;
  P.line(X0, ty, X1, ty, 0.3);
  P.t('TOTAL', ax[0] + 1.3, ty + 2.9, { size: 6.5, bold: true });
  ALDRETE_TEMPOS.forEach(([tk], i) => P.v(aldreteTotal(f, tk), ax[2] + i * tw + tw / 2, ty + 3.1, { size: 8.6, bold: true, align: 'center' }));

  // Prescrição
  const py0 = aEnd + 2.2, prh = 4.4;
  const px = [X0, X0 + 10, X0 + 100, X0 + 117, X1];
  P.rect(px[0], py0, W, 4.5 + prh * 3);
  P.rect(px[0], py0, W, 4.5, { fill: GRAY, lw: 0.2 });
  ['ITENS', 'PRESCRIÇÃO MÉDICA', 'QUANT.', 'HORÁRIO'].forEach((h, i) => {
    P.t(h, (px[i] + px[i + 1]) / 2, py0 + 3.3, { size: 6.8, bold: true, align: 'center' });
    if (i > 0) P.line(px[i], py0, px[i], py0 + 4.5 + prh * 3, 0.2);
  });
  s.prescricao.slice(0, 3).forEach((r, i) => {
    const y = py0 + 4.5 + i * prh;
    P.line(px[0], y, px[4], y, 0.2);
    P.t(String(i + 1), (px[0] + px[1]) / 2, y + 3.2, { size: 7.5, align: 'center' });
    P.v(r.item, px[1] + 1, y + 3.3, { maxW: px[2] - px[1] - 2 });
    P.v(r.quant, (px[2] + px[3]) / 2, y + 3.3, { align: 'center', maxW: px[3] - px[2] - 1 });
    P.v(r.horario, px[3] + 1, y + 3.3, { maxW: px[4] - px[3] - 2 });
  });

  // Intercorrências
  const iy0 = py0 + 4.5 + prh * 3 + 2;
  const nIl = 3, ilh = 4;
  P.rect(X0, iy0, W, 4.5 + ilh * nIl);
  P.rect(X0, iy0, W, 4.5, { fill: GRAY, lw: 0.2 });
  P.t('INTERCORRÊNCIAS', 105, iy0 + 3.3, { size: 6.8, bold: true, align: 'center' });
  const il = wrapText(P.doc.setFontSize(8.6), s.intercorrencias, W - 2);
  for (let i = 0; i < nIl; i++) {
    const y = iy0 + 4.5 + i * ilh;
    if (i > 0) P.line(X0, y, X1, y, 0.15);
    P.v(il[i], X0 + 1, y + 3.1);
  }

  const alY = iy0 + 4.5 + ilh * nIl + 2;
  barra('HORA DA ALTA:', alY, s.altaHora, s.altaPas, s.altaPad, s.altaFc, s.altaSpo2);
  const ey = alY + 10.5;
  P.t('ENCAMINHADO:', X0, ey, { size: 8, bold: true });
  P.box(31.5, ey, s.encaminhado === 'APT', 'APT', { size: 8, s: 2.8 });
  P.box(44.5, ey, s.encaminhado === 'UTI', 'UTI', { size: 8, s: 2.8 });
  P.box(56.5, ey, s.encaminhado === 'Residência', 'Residência', { size: 8, s: 2.8 });

  // Médico responsável pela SRPA: o anestesista ou outro médico informado
  const an = f.anestesista;
  const outro = s.medicoOutro === 'Sim' && s.medicoNome;
  const nome = outro ? s.medicoNome : an.nome;
  const crm = outro ? s.medicoCrm : `${an.crm}${an.uf ? '/' + an.uf : ''}`;
  P.v(nome, 171, ey - 1, { align: 'center', maxW: 60 });
  if (crm) P.v(`CRM ${crm}`, 171, ey + 2.6, { align: 'center', size: 7.8 });
  P.line(140, ey + 3.9, 202, ey + 3.9, 0.2);
  P.t(outro ? 'MÉDICO RESPONSÁVEL PELA SRPA' : 'ANESTESIOLOGISTA', 171, ey + 7.2, { size: 7, bold: true, align: 'center' });
}

function rodape(P, f, p, total) {
  const an = f.anestesista;
  let st = 'RASCUNHO — ficha não finalizada';
  if (f.status === 'finalizada') {
    st = `Anestesiologista: ${an.nome} (CRM ${an.crm}${an.uf ? '/' + an.uf : ''})`;
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
