/**
 * Professional PDF Report Generator for Unit Rate
 * Supports two formats: Executive Summary (2-3 pages) and Full Report (detailed)
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CostItem, Project, PROJECT_TYPE_LABELS, ProjectType } from '@/types/project';
import { formatCurrency } from '@/lib/formatters';
import { renderChartToDataUrl } from '@/lib/pdfCharts';
import logoImg from '@/assets/logo-new.png';

export type ReportFormat = 'executive' | 'full';

export interface PdfExportOptions {
  format: ReportFormat;
  includeDescription: boolean;
  includeTrade: boolean;
  includeQuantity: boolean;
  includeUnit: boolean;
  includeOriginalPrice: boolean;
  includeOriginalTotal: boolean;
  includeRecommendedPrice: boolean;
  includeRecommendedTotal: boolean;
  includeVariance: boolean;
  includeStatus: boolean;
  onlyFlagged: boolean;
  // Cover page fields
  clientName?: string;
  contractorName?: string;
  coverNotes?: string;
}

// ─── Colors ──────────────────────────────────────────────────────
const C = {
  navy:       [30, 58, 95]   as [number, number, number],
  navyLight:  [45, 78, 120]  as [number, number, number],
  white:      [255, 255, 255] as [number, number, number],
  offWhite:   [248, 250, 252] as [number, number, number],
  lightGray:  [240, 244, 248] as [number, number, number],
  midGray:    [148, 163, 184] as [number, number, number],
  darkGray:   [51, 65, 85]   as [number, number, number],
  text:       [30, 41, 59]   as [number, number, number],
  textMuted:  [100, 116, 139] as [number, number, number],
  green:      [22, 163, 74]  as [number, number, number],
  greenBg:    [220, 252, 231] as [number, number, number],
  orange:     [234, 120, 15]  as [number, number, number],
  orangeBg:   [255, 237, 213] as [number, number, number],
  red:        [220, 38, 38]  as [number, number, number],
  redBg:      [254, 226, 226] as [number, number, number],
  blue:       [37, 99, 235]  as [number, number, number],
  blueBg:     [219, 234, 254] as [number, number, number],
  border:     [226, 232, 240] as [number, number, number],
};

// ─── Metric Helpers ──────────────────────────────────────────────

function getEffectivePrice(item: CostItem): number | null {
  return item.userOverridePrice ?? item.recommendedUnitPrice ?? item.originalUnitPrice ?? null;
}

interface Metrics {
  totalItems: number;
  totalOriginal: number;
  totalEstimated: number;
  potentialSavings: number;
  underpricedRisk: number;
  avgVariance: number;
  okCount: number;
  reviewCount: number;
  clarificationCount: number;
  underpricedCount: number;
  highVarianceItems: CostItem[];
  topFlaggedItems: CostItem[];
  tradeBreakdown: Map<string, { original: number; estimated: number; count: number }>;
  savingsOpportunities: Array<{ item: CostItem; savings: number }>;
}

function computeMetrics(items: CostItem[]): Metrics {
  const totalOriginal = items.reduce((s, i) => s + (i.originalUnitPrice ? i.originalUnitPrice * i.quantity : 0), 0);
  const totalEstimated = items.reduce((s, i) => {
    const p = getEffectivePrice(i);
    return s + (p != null ? p * i.quantity : 0);
  }, 0);

  const potentialSavings = items.reduce((s, item) => {
    const recPrice = item.userOverridePrice || item.recommendedUnitPrice;
    if (item.originalUnitPrice && recPrice && item.originalUnitPrice > recPrice) {
      return s + (item.originalUnitPrice - recPrice) * item.quantity;
    }
    return s;
  }, 0);

  const underpricedRisk = items.reduce((s, item) => {
    if (item.originalUnitPrice && item.benchmarkMin && item.originalUnitPrice < item.benchmarkMin) {
      return s + (item.benchmarkMin - item.originalUnitPrice) * item.quantity;
    }
    return s;
  }, 0);

  const withVariance = items.filter(i => i.originalUnitPrice && i.benchmarkTypical && i.benchmarkTypical !== 0);
  const avgVariance = withVariance.length > 0
    ? withVariance.reduce((s, i) => s + ((i.originalUnitPrice! - i.benchmarkTypical!) / i.benchmarkTypical!) * 100, 0) / withVariance.length
    : 0;

  const highVarianceItems = items
    .filter(i => i.originalUnitPrice && i.benchmarkTypical && i.benchmarkTypical !== 0)
    .map(i => ({ item: i, variance: Math.abs(((i.originalUnitPrice! - i.benchmarkTypical!) / i.benchmarkTypical!) * 100) }))
    .filter(x => x.variance > 10)
    .sort((a, b) => b.variance - a.variance)
    .map(x => x.item);

  const topFlaggedItems = items
    .filter(i => i.status === 'review' || i.status === 'clarification' || i.status === 'underpriced')
    .sort((a, b) => {
      const aTotal = (getEffectivePrice(a) ?? 0) * a.quantity;
      const bTotal = (getEffectivePrice(b) ?? 0) * b.quantity;
      return bTotal - aTotal;
    })
    .slice(0, 10);

  const tradeBreakdown = new Map<string, { original: number; estimated: number; count: number }>();
  for (const item of items) {
    const trade = item.trade?.trim() || 'Uncategorized';
    const existing = tradeBreakdown.get(trade) || { original: 0, estimated: 0, count: 0 };
    existing.original += item.originalUnitPrice ? item.originalUnitPrice * item.quantity : 0;
    const p = getEffectivePrice(item);
    existing.estimated += p != null ? p * item.quantity : 0;
    existing.count++;
    tradeBreakdown.set(trade, existing);
  }

  const savingsOpportunities = items
    .filter(i => {
      const rec = i.userOverridePrice || i.recommendedUnitPrice;
      return i.originalUnitPrice && rec && i.originalUnitPrice > rec;
    })
    .map(i => ({
      item: i,
      savings: (i.originalUnitPrice! - (i.userOverridePrice || i.recommendedUnitPrice)!) * i.quantity,
    }))
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 10);

  return {
    totalItems: items.length,
    totalOriginal,
    totalEstimated,
    potentialSavings,
    underpricedRisk,
    avgVariance,
    okCount: items.filter(i => i.status === 'ok').length,
    reviewCount: items.filter(i => i.status === 'review').length,
    clarificationCount: items.filter(i => i.status === 'clarification').length,
    underpricedCount: items.filter(i => i.status === 'underpriced').length,
    highVarianceItems,
    topFlaggedItems,
    tradeBreakdown,
    savingsOpportunities,
  };
}

// ─── PDF Builder ─────────────────────────────────────────────────

export async function generatePdfReport(
  items: CostItem[],
  project: Project,
  options: PdfExportOptions,
  previewMode: boolean = false,
): Promise<Blob | void> {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();  // 210
  const ph = doc.internal.pageSize.getHeight(); // 297
  const M = 20; // margin
  const contentWidth = pw - 2 * M;
  let pageNum = 0;

  // Filter items
  let exportItems = [...items];
  if (options.onlyFlagged) {
    exportItems = exportItems.filter(i => i.status === 'review' || i.status === 'clarification');
  }

  const m = computeMetrics(exportItems);
  const currency = project.currency;
  const fmt = (v: number) => formatCurrency(v, currency);

  // ── Logo loading ──
  let logoDataUrl: string | null = null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = logoImg;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(img, 0, 0);
    logoDataUrl = canvas.toDataURL('image/png');
  } catch {
    // fallback: no logo
  }

  // ── Helpers ──
  const addHeader = () => {
    // Top accent bar
    doc.setFillColor(...C.navy);
    doc.rect(0, 0, pw, 3, 'F');

    // Logo
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', M, 8, 10, 10);
    }
    doc.setTextColor(...C.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Unit Rate', M + (logoDataUrl ? 13 : 0), 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.textMuted);
    doc.text('Construction Cost Analysis', M + (logoDataUrl ? 13 : 0), 19);

    // Right side: date
    doc.setFontSize(8);
    doc.setTextColor(...C.textMuted);
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.text(dateStr, pw - M, 12, { align: 'right' });
    doc.text(options.format === 'executive' ? 'Executive Summary' : 'Full Report', pw - M, 17, { align: 'right' });

    // Divider
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(M, 23, pw - M, 23);

    return 28;
  };

  const addFooter = () => {
    pageNum++;
    const footerY = ph - 12;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(M, footerY, pw - M, footerY);

    doc.setFontSize(7);
    doc.setTextColor(...C.textMuted);
    doc.text('Generated by Unit Rate', M, footerY + 5);
    doc.text(`${project.name}`, pw / 2, footerY + 5, { align: 'center' });
    doc.text(`Page ${pageNum}`, pw - M, footerY + 5, { align: 'right' });
  };

  const addNewPage = () => {
    doc.addPage();
    return addHeader();
  };

  const sectionTitle = (y: number, title: string) => {
    doc.setFillColor(...C.navy);
    doc.rect(M, y, 3, 6, 'F');
    doc.setTextColor(...C.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(title, M + 6, y + 5);
    return y + 10;
  };

  // ════════════════════════════════════════════════════════════════
  // PAGE 1: COVER + EXECUTIVE SUMMARY
  // ════════════════════════════════════════════════════════════════
  let y = addHeader();

  // Project title block
  doc.setTextColor(...C.navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Cost Analysis Report', M, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...C.darkGray);
  doc.text(project.name, M, y + 16);

  y += 22;

  // Two-column project info
  const colW = contentWidth / 2 - 3;
  const infoBoxH = 28;
  doc.setFillColor(...C.lightGray);
  doc.roundedRect(M, y, colW, infoBoxH, 2, 2, 'F');
  doc.roundedRect(M + colW + 6, y, colW, infoBoxH, 2, 2, 'F');

  // Half-column width for each info cell (minus internal padding)
  const cellW = colW / 2 - 8;

  const infoLabel = (x: number, iy: number, label: string, value: string, maxW?: number) => {
    const mw = maxW || cellW;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.textMuted);
    doc.text(label.toUpperCase(), x, iy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.text);
    // Wrap or truncate long values to fit within the cell
    const lines = doc.splitTextToSize(value, mw) as string[];
    doc.text(lines[0], x, iy + 5);
    if (lines.length > 1) {
      doc.setFontSize(7.5);
      doc.text(lines[1], x, iy + 9);
    }
  };

  infoLabel(M + 5, y + 7, 'Country', project.country);
  infoLabel(M + 5, y + 19, 'Currency', project.currency);
  infoLabel(M + colW / 2, y + 7, 'Project Type', PROJECT_TYPE_LABELS[project.projectType as ProjectType] || project.projectType);
  infoLabel(M + colW / 2, y + 19, 'Total Items', String(exportItems.length));

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  infoLabel(M + colW + 11, y + 7, 'Report Date', dateStr);
  infoLabel(M + colW + 11, y + 19, 'Report Type', options.format === 'executive' ? 'Executive Summary' : 'Full Detailed Report');
  infoLabel(M + colW + 6 + colW / 2, y + 7, options.clientName ? 'Client' : 'Status', options.clientName || `${m.okCount} OK / ${m.reviewCount + m.clarificationCount} Flagged`);
  infoLabel(M + colW + 6 + colW / 2, y + 19, options.contractorName ? 'Contractor' : 'Project ID', options.contractorName || project.id.substring(0, 8) + '...');

  y += 34;

  // Cover page notes
  if (options.coverNotes) {
    doc.setFillColor(...C.offWhite);
    doc.roundedRect(M, y, contentWidth, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...C.textMuted);
    const noteLines = doc.splitTextToSize(options.coverNotes, contentWidth - 10);
    doc.text(noteLines.slice(0, 3), M + 5, y + 6);
    y += 20;
  }

  // ── KPI Cards ──
  y = sectionTitle(y, 'Key Metrics');

  const kpiCardW = (contentWidth - 9) / 4;
  const kpiCardH = 28;

  const kpiTextW = kpiCardW - 9; // available text width inside card

  const drawKpiCard = (x: number, iy: number, accentColor: [number, number, number], label: string, value: string, subtitle?: string) => {
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.border);
    doc.roundedRect(x, iy, kpiCardW, kpiCardH, 2, 2, 'FD');

    // Left accent
    doc.setFillColor(...accentColor);
    doc.rect(x, iy + 2, 2.5, kpiCardH - 4, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textMuted);
    const labelLines = doc.splitTextToSize(label.toUpperCase(), kpiTextW) as string[];
    doc.text(labelLines[0], x + 6, iy + 7);

    doc.setFont('helvetica', 'bold');
    // Auto-shrink value font if it doesn't fit
    let valueFontSize = 13;
    doc.setFontSize(valueFontSize);
    while (doc.getTextWidth(value) > kpiTextW && valueFontSize > 8) {
      valueFontSize -= 0.5;
      doc.setFontSize(valueFontSize);
    }
    doc.setTextColor(...C.text);
    doc.text(value, x + 6, iy + 16);

    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.textMuted);
      const subLines = doc.splitTextToSize(subtitle, kpiTextW) as string[];
      doc.text(subLines[0], x + 6, iy + 22);
    }
  };

  const delta = m.totalEstimated - m.totalOriginal;
  const deltaLabel = delta >= 0
    ? `+${fmt(Math.abs(delta))} vs original`
    : `-${fmt(Math.abs(delta))} vs original`;

  const varianceColor: [number, number, number] = Math.abs(m.avgVariance) <= 5
    ? C.green : Math.abs(m.avgVariance) <= 20 ? C.orange : C.red;

  drawKpiCard(M, y, C.blue, `Project Estimate (${currency})`, fmt(m.totalEstimated), deltaLabel);
  drawKpiCard(M + kpiCardW + 3, y, C.orange, 'Items Flagged', `${m.reviewCount + m.clarificationCount + m.underpricedCount}`, `${m.reviewCount} Review · ${m.clarificationCount} Clarify`);
  drawKpiCard(M + (kpiCardW + 3) * 2, y, C.green, `Potential Savings (${currency})`, fmt(m.potentialSavings), 'vs original estimate');
  drawKpiCard(M + (kpiCardW + 3) * 3, y, varianceColor, 'Avg Variance', `${m.avgVariance >= 0 ? '+' : ''}${m.avgVariance.toFixed(1)}%`, 'Original vs benchmark');

  y += kpiCardH + 6;

  // ── Variance Visual Indicators ──
  y = sectionTitle(y, 'Variance Assessment');

  const overrunItems = items.filter(i => {
    if (!i.originalUnitPrice || !i.benchmarkTypical || i.benchmarkTypical === 0) return false;
    return ((i.originalUnitPrice - i.benchmarkTypical) / i.benchmarkTypical) * 100 > 20;
  });
  const moderateItems = items.filter(i => {
    if (!i.originalUnitPrice || !i.benchmarkTypical || i.benchmarkTypical === 0) return false;
    const v = ((i.originalUnitPrice - i.benchmarkTypical) / i.benchmarkTypical) * 100;
    return v > 5 && v <= 20;
  });
  const withinBudget = items.filter(i => {
    if (!i.originalUnitPrice || !i.benchmarkTypical || i.benchmarkTypical === 0) return false;
    return ((i.originalUnitPrice - i.benchmarkTypical) / i.benchmarkTypical) * 100 <= 5;
  });

  const indW = contentWidth / 3 - 3;
  const drawIndicator = (x: number, iy: number, bg: [number, number, number], fg: [number, number, number], label: string, count: number, desc: string) => {
    doc.setFillColor(...bg);
    doc.roundedRect(x, iy, indW, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...fg);
    const indLabel = doc.splitTextToSize(`${label}: ${count} items`, indW - 8) as string[];
    doc.text(indLabel[0], x + 4, iy + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const indDesc = doc.splitTextToSize(desc, indW - 8) as string[];
    doc.text(indDesc[0], x + 4, iy + 12);
  };

  drawIndicator(M, y, C.redBg, C.red, 'HIGH RISK', overrunItems.length, '>20% over benchmark');
  drawIndicator(M + indW + 4, y, C.orangeBg, C.orange, 'MODERATE', moderateItems.length, '+5% to +20% variance');
  drawIndicator(M + (indW + 4) * 2, y, C.greenBg, C.green, 'ON BUDGET', withinBudget.length, '≤5% variance');

  y += 22;

  // ── TL;DR Bullets ──
  y = sectionTitle(y, 'TL;DR for Stakeholders');

  const bullets: string[] = [];
  bullets.push(`Total project estimate: ${fmt(m.totalEstimated)} ${currency} across ${m.totalItems} line items.`);
  if (m.potentialSavings > 0) bullets.push(`Potential savings of ${fmt(m.potentialSavings)} ${currency} identified through benchmarking.`);
  if (overrunItems.length > 0) bullets.push(`${overrunItems.length} item(s) priced >20% above market benchmarks — recommend re-quoting.`);
  if (m.underpricedRisk > 0) bullets.push(`Underpriced risk exposure of ${fmt(m.underpricedRisk)} ${currency} identified.`);
  if (m.reviewCount + m.clarificationCount > 0) bullets.push(`${m.reviewCount + m.clarificationCount} items require attention (review or clarification).`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.text);
  const bulletMaxW = contentWidth - 8;
  for (const bullet of bullets) {
    const wrapped = doc.splitTextToSize(`•  ${bullet}`, bulletMaxW) as string[];
    for (const line of wrapped) {
      doc.text(line, M + 3, y);
      y += 4.5;
    }
    y += 1;
  }

  addFooter();

  // ════════════════════════════════════════════════════════════════
  // PAGE 2: CHARTS + RISK MATRIX
  // ════════════════════════════════════════════════════════════════
  y = addNewPage();
  y = sectionTitle(y, 'Cost Distribution');

  // Trade breakdown chart (donut)
  const topTrades = [...m.tradeBreakdown.entries()]
    .sort((a, b) => b[1].estimated - a[1].estimated)
    .slice(0, 6);

  const chartColors = ['#1e3a5f', '#2563eb', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444'];

  const donutUrl = await renderChartToDataUrl({
    type: 'doughnut',
    data: {
      labels: topTrades.map(([t]) => t),
      datasets: [{
        data: topTrades.map(([, v]) => Math.round(v.estimated)),
        backgroundColor: chartColors.slice(0, topTrades.length),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { font: { size: 10 }, padding: 8 } },
      },
      cutout: '60%',
    },
  }, 500, 280);

  // Waterfall-style bar chart: Original → Adjustments → Final
  const adjustmentValue = m.totalEstimated - m.totalOriginal;
  const waterfallUrl = await renderChartToDataUrl({
    type: 'bar',
    data: {
      labels: ['Original Estimate', 'Adjustments', 'Final Estimate'],
      datasets: [{
        data: [m.totalOriginal, Math.abs(adjustmentValue), m.totalEstimated],
        backgroundColor: [
          '#1e3a5f',
          adjustmentValue >= 0 ? '#ef4444' : '#22c55e',
          '#2563eb',
        ],
        borderRadius: 4,
      }],
    },
    options: {
      responsive: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 9 } }, grid: { color: '#e2e8f0' } },
        y: { ticks: { font: { size: 10 } }, grid: { display: false } },
      },
    },
  }, 500, 200);

  // Status distribution pie
  const statusPieUrl = await renderChartToDataUrl({
    type: 'pie',
    data: {
      labels: ['OK', 'Review', 'Clarification', 'Under-Priced'],
      datasets: [{
        data: [m.okCount, m.reviewCount, m.clarificationCount, m.underpricedCount],
        backgroundColor: ['#22c55e', '#f59e0b', '#0ea5e9', '#ef4444'],
        borderWidth: 1,
        borderColor: '#ffffff',
      }],
    },
    options: {
      responsive: false,
      plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 9 }, padding: 6 } } },
    },
  }, 300, 280);

  // Place charts side-by-side
  const chartH = 52;
  const chartDonutW = 82;
  const chartPieW = 52;
  const chartWaterfallW = contentWidth - chartDonutW - chartPieW - 8;

  // Donut card
  doc.setFillColor(...C.lightGray);
  doc.setDrawColor(...C.border);
  doc.roundedRect(M, y, chartDonutW, chartH, 2, 2, 'FD');
  doc.setTextColor(...C.navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Cost by Trade', M + 4, y + 6);
  doc.addImage(donutUrl, 'PNG', M + 2, y + 8, chartDonutW - 4, chartH - 11);

  // Waterfall card
  const wxStart = M + chartDonutW + 4;
  doc.setFillColor(...C.lightGray);
  doc.roundedRect(wxStart, y, chartWaterfallW, chartH, 2, 2, 'FD');
  doc.setTextColor(...C.navy);
  doc.text('Estimate Flow', wxStart + 4, y + 6);
  doc.addImage(waterfallUrl, 'PNG', wxStart + 2, y + 8, chartWaterfallW - 4, chartH - 11);

  // Status pie card
  const pxStart = wxStart + chartWaterfallW + 4;
  doc.setFillColor(...C.lightGray);
  doc.roundedRect(pxStart, y, chartPieW, chartH, 2, 2, 'FD');
  doc.setTextColor(...C.navy);
  doc.text('Status Split', pxStart + 4, y + 6);
  doc.addImage(statusPieUrl, 'PNG', pxStart + 2, y + 8, chartPieW - 4, chartH - 11);

  y += chartH + 8;

  // ── Risk Matrix (2x2) ──
  y = sectionTitle(y, 'Risk Matrix');

  const rmW = contentWidth / 2 - 2;
  const rmH = 18;
  const drawRmCell = (x: number, iy: number, bg: [number, number, number], fg: [number, number, number], label: string, desc: string) => {
    doc.setFillColor(...bg);
    doc.setDrawColor(...C.border);
    doc.roundedRect(x, iy, rmW, rmH, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...fg);
    const labelLines = doc.splitTextToSize(label, rmW - 8) as string[];
    doc.text(labelLines[0], x + 4, iy + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.darkGray);
    const descLines = doc.splitTextToSize(desc, rmW - 8) as string[];
    doc.text(descLines[0], x + 4, iy + 13);
  };

  // Axis labels
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.textMuted);
  doc.text('HIGH VARIANCE →', M, y - 2);
  doc.text('LOW VARIANCE →', M + rmW + 4, y - 2);

  // High variance, high cost
  const hvhcItems = exportItems.filter(i => {
    if (!i.originalUnitPrice || !i.benchmarkTypical || i.benchmarkTypical === 0) return false;
    const v = Math.abs(((i.originalUnitPrice - i.benchmarkTypical) / i.benchmarkTypical) * 100);
    const total = (getEffectivePrice(i) ?? 0) * i.quantity;
    return v > 15 && total > m.totalEstimated * 0.05;
  });
  const hvlcItems = exportItems.filter(i => {
    if (!i.originalUnitPrice || !i.benchmarkTypical || i.benchmarkTypical === 0) return false;
    const v = Math.abs(((i.originalUnitPrice - i.benchmarkTypical) / i.benchmarkTypical) * 100);
    const total = (getEffectivePrice(i) ?? 0) * i.quantity;
    return v > 15 && total <= m.totalEstimated * 0.05;
  });
  const lvhcItems = exportItems.filter(i => {
    if (!i.originalUnitPrice || !i.benchmarkTypical || i.benchmarkTypical === 0) return false;
    const v = Math.abs(((i.originalUnitPrice - i.benchmarkTypical) / i.benchmarkTypical) * 100);
    const total = (getEffectivePrice(i) ?? 0) * i.quantity;
    return v <= 15 && total > m.totalEstimated * 0.05;
  });
  const lvlcItems = exportItems.filter(i => {
    if (!i.originalUnitPrice || !i.benchmarkTypical || i.benchmarkTypical === 0) return false;
    const v = Math.abs(((i.originalUnitPrice - i.benchmarkTypical) / i.benchmarkTypical) * 100);
    const total = (getEffectivePrice(i) ?? 0) * i.quantity;
    return v <= 15 && total <= m.totalEstimated * 0.05;
  });

  drawRmCell(M, y, C.redBg, C.red, `Critical: ${hvhcItems.length} items`, 'High variance + High cost — Immediate attention');
  drawRmCell(M + rmW + 4, y, C.greenBg, C.green, `Low Risk: ${lvhcItems.length} items`, 'Low variance + High cost — Monitor');
  drawRmCell(M, y + rmH + 2, C.orangeBg, C.orange, `Investigate: ${hvlcItems.length} items`, 'High variance + Low cost — Check pricing');
  drawRmCell(M + rmW + 4, y + rmH + 2, C.blueBg, C.blue, `Acceptable: ${lvlcItems.length} items`, 'Low variance + Low cost — No action');

  y += rmH * 2 + 8;

  // ── Trade Summary Table ──
  y = sectionTitle(y, 'Trade Summary');

  const tradeSummaryData = [...m.tradeBreakdown.entries()]
    .sort((a, b) => b[1].estimated - a[1].estimated)
    .map(([trade, data]) => {
      const variance = data.original > 0 ? ((data.estimated - data.original) / data.original * 100).toFixed(1) : '—';
      return [trade, String(data.count), fmt(data.original), fmt(data.estimated), typeof variance === 'string' ? `${variance}%` : '—'];
    });

  autoTable(doc, {
    head: [['Trade Category', 'Items', `Original (${currency})`, `Estimated (${currency})`, 'Variance']],
    body: tradeSummaryData,
    startY: y,
    margin: { left: M, right: M },
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.offWhite },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 35 },
      3: { halign: 'right', cellWidth: 35 },
      4: { halign: 'center', cellWidth: 22 },
    },
  });

  addFooter();

  // ════════════════════════════════════════════════════════════════
  // FULL REPORT ONLY: Table of Contents + Detailed tables + Analysis
  // ════════════════════════════════════════════════════════════════
  if (options.format === 'full') {
    // ── Table of Contents ──
    y = addNewPage();
    y = sectionTitle(y, 'Table of Contents');

    const tocEntries = [
      { label: 'Executive Summary & Key Metrics', page: '1' },
      { label: 'Cost Distribution & Risk Matrix', page: '2' },
      { label: 'Table of Contents', page: '3' },
      { label: 'Detailed Cost Items', page: '3' },
      { label: 'Analysis & Recommendations', page: '4+' },
    ];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const entry of tocEntries) {
      doc.setTextColor(...C.text);
      doc.text(entry.label, M + 6, y);
      doc.setTextColor(...C.textMuted);
      // Dotted line
      const labelWidth = doc.getTextWidth(entry.label);
      const pageWidth = doc.getTextWidth(entry.page);
      const dotsStart = M + 6 + labelWidth + 2;
      const dotsEnd = pw - M - pageWidth - 2;
      let dx = dotsStart;
      while (dx < dotsEnd) {
        doc.text('.', dx, y);
        dx += 2;
      }
      doc.text(entry.page, pw - M, y, { align: 'right' });
      y += 6;
    }

    y += 6;

    // ── Cost Items Detail Table ──
    y = sectionTitle(y, 'Detailed Cost Items');

    const colIndex: Record<string, number> = {};
    const headers: string[] = [];
    const pushCol = (key: string, label: string) => { colIndex[key] = headers.length; headers.push(label); };
    if (options.includeDescription) pushCol('desc', 'Description');
    if (options.includeTrade) pushCol('trade', 'Trade');
    if (options.includeQuantity) pushCol('qty', 'Qty');
    if (options.includeUnit) pushCol('unit', 'Unit');
    if (options.includeOriginalPrice) pushCol('origP', `Orig. (${currency})`);
    if (options.includeOriginalTotal) pushCol('origT', `Orig. Total`);
    if (options.includeRecommendedPrice) pushCol('recP', `Rec. (${currency})`);
    if (options.includeRecommendedTotal) pushCol('recT', `Rec. Total`);
    if (options.includeVariance) pushCol('var', 'Var %');
    if (options.includeStatus) pushCol('status', 'Status');

    const formatStatus = (s: string) => {
      const sl = s.toLowerCase();
      if (sl === 'ok') return '✓ OK';
      if (sl === 'review' || sl === 'underpriced') return '⚠ Review';
      if (sl === 'clarification') return '❓ Clarify';
      if (sl === 'actual') return '● Actual';
      return s;
    };

    const rowTypes: Array<'group' | 'item' | 'subtotal' | 'total'> = [];
    const tableBody: string[][] = [];

    // Group by trade
    const sorted = [...exportItems].sort((a, b) => (a.trade || 'Uncategorized').localeCompare(b.trade || 'Uncategorized'));
    const groups = new Map<string, CostItem[]>();
    for (const it of sorted) {
      const key = it.trade?.trim() || 'Uncategorized';
      groups.set(key, [...(groups.get(key) || []), it]);
    }

    for (const [trade, groupItems] of groups.entries()) {
      const groupRow = new Array(headers.length).fill('');
      groupRow[0] = `▸ ${trade}`;
      tableBody.push(groupRow);
      rowTypes.push('group');

      for (const item of groupItems) {
        const row: string[] = [];
        const ep = getEffectivePrice(item);
        const origT = item.originalUnitPrice ? item.originalUnitPrice * item.quantity : null;
        const recT = ep != null ? ep * item.quantity : null;

        if (options.includeDescription) row.push(item.originalDescription.substring(0, 55) + (item.originalDescription.length > 55 ? '…' : ''));
        if (options.includeTrade) row.push(item.trade || '—');
        if (options.includeQuantity) row.push(item.quantity.toLocaleString());
        if (options.includeUnit) row.push(item.unit);
        if (options.includeOriginalPrice) row.push(item.originalUnitPrice != null ? fmt(item.originalUnitPrice) : '—');
        if (options.includeOriginalTotal) row.push(origT != null ? fmt(origT) : '—');
        if (options.includeRecommendedPrice) row.push(ep != null ? fmt(ep) : '—');
        if (options.includeRecommendedTotal) row.push(recT != null ? fmt(recT) : '—');
        if (options.includeVariance) {
          if (item.originalUnitPrice && item.benchmarkTypical && item.benchmarkTypical !== 0) {
            const v = ((item.originalUnitPrice - item.benchmarkTypical) / item.benchmarkTypical) * 100;
            row.push(`${v > 0 ? '↑' : '↓'} ${Math.abs(v).toFixed(0)}%`);
          } else {
            row.push('—');
          }
        }
        if (options.includeStatus) row.push(formatStatus(item.status));
        tableBody.push(row);
        rowTypes.push('item');
      }

      // Subtotal
      const subOrig = groupItems.reduce((s, i) => s + (i.originalUnitPrice ? i.originalUnitPrice * i.quantity : 0), 0);
      const subEst = groupItems.reduce((s, i) => { const p = getEffectivePrice(i); return s + (p != null ? p * i.quantity : 0); }, 0);
      const subRow = new Array(headers.length).fill('');
      subRow[0] = `Subtotal: ${trade}`;
      if (options.includeOriginalTotal && colIndex.origT != null) subRow[colIndex.origT] = fmt(subOrig);
      if (options.includeRecommendedTotal && colIndex.recT != null) subRow[colIndex.recT] = fmt(subEst);
      tableBody.push(subRow);
      rowTypes.push('subtotal');
    }

    // Grand total
    const totalRow = new Array(headers.length).fill('');
    totalRow[0] = 'GRAND TOTAL';
    if (options.includeQuantity && colIndex.qty != null) totalRow[colIndex.qty] = exportItems.reduce((s, i) => s + i.quantity, 0).toLocaleString();
    if (options.includeOriginalTotal && colIndex.origT != null) totalRow[colIndex.origT] = fmt(m.totalOriginal);
    if (options.includeRecommendedTotal && colIndex.recT != null) totalRow[colIndex.recT] = fmt(m.totalEstimated);
    tableBody.push(totalRow);
    rowTypes.push('total');

    autoTable(doc, {
      head: [headers],
      body: tableBody,
      startY: y,
      margin: { left: M, right: M },
      styles: { fontSize: 6.5, cellPadding: 1.8, valign: 'middle', lineWidth: 0.1, lineColor: C.border },
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: C.offWhite },
      columnStyles: {
        ...(options.includeDescription ? { [colIndex.desc]: { cellWidth: 58 } } : {}),
        ...(options.includeTrade ? { [colIndex.trade]: { cellWidth: 22 } } : {}),
        ...(options.includeQuantity ? { [colIndex.qty]: { cellWidth: 14, halign: 'right' } } : {}),
        ...(options.includeUnit ? { [colIndex.unit]: { cellWidth: 12 } } : {}),
        ...(options.includeOriginalPrice ? { [colIndex.origP]: { cellWidth: 18, halign: 'right' } } : {}),
        ...(options.includeOriginalTotal ? { [colIndex.origT]: { cellWidth: 22, halign: 'right' } } : {}),
        ...(options.includeRecommendedPrice ? { [colIndex.recP]: { cellWidth: 18, halign: 'right' } } : {}),
        ...(options.includeRecommendedTotal ? { [colIndex.recT]: { cellWidth: 22, halign: 'right' } } : {}),
        ...(options.includeVariance ? { [colIndex.var]: { cellWidth: 14, halign: 'center' } } : {}),
        ...(options.includeStatus ? { [colIndex.status]: { cellWidth: 16, halign: 'center' } } : {}),
      },
      didParseCell: (data) => {
        const t = rowTypes[data.row.index];
        if (!t) return;

        if (t === 'group') {
          data.cell.styles.fillColor = C.lightGray;
          data.cell.styles.textColor = C.navy;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 7;
          if (data.column.index !== 0) data.cell.text = [''];
        }
        if (t === 'subtotal') {
          data.cell.styles.fillColor = [235, 240, 248];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 6.5;
        }
        if (t === 'total') {
          data.cell.styles.fillColor = C.navy;
          data.cell.styles.textColor = C.white;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 7;
        }
        if (t === 'item') {
          // Variance color coding
          if (options.includeVariance && data.column.index === colIndex.var) {
            const raw = (data.cell.text?.[0] ?? '').replace(/[↑↓%\s]/g, '');
            const v = Number(raw);
            if (!Number.isNaN(v)) {
              data.cell.styles.fontStyle = 'bold';
              if (v > 20) {
                data.cell.styles.textColor = C.red;
              } else if (v > 5) {
                data.cell.styles.textColor = C.orange;
              } else {
                data.cell.styles.textColor = C.green;
              }
            }
          }
          // Status badges
          if (options.includeStatus && data.column.index === colIndex.status) {
            const s = (data.cell.text?.[0] ?? '').toUpperCase();
            data.cell.styles.fontStyle = 'bold';
            if (s.includes('OK')) {
              data.cell.styles.fillColor = C.greenBg;
              data.cell.styles.textColor = C.green;
            } else if (s.includes('REVIEW')) {
              data.cell.styles.fillColor = C.orangeBg;
              data.cell.styles.textColor = C.orange;
            } else if (s.includes('CLARIFY')) {
              data.cell.styles.fillColor = C.blueBg;
              data.cell.styles.textColor = C.blue;
            }
          }
        }
      },
      didDrawPage: () => addFooter(),
    });

    // ── Analysis Section ──
    y = addNewPage();
    y = sectionTitle(y, 'Analysis & Recommendations');

    // Top flagged items
    if (m.topFlaggedItems.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.navy);
      doc.text('Top Flagged Items', M, y);
      y += 5;

      const flaggedData = m.topFlaggedItems.slice(0, 8).map(item => {
        const total = (getEffectivePrice(item) ?? 0) * item.quantity;
        return [
          item.originalDescription.substring(0, 45) + (item.originalDescription.length > 45 ? '…' : ''),
          formatStatus(item.status),
          fmt(total),
          item.aiComment?.substring(0, 60) || '—',
        ];
      });

      autoTable(doc, {
        head: [['Description', 'Status', `Value (${currency})`, 'AI Comment / Recommendation']],
        body: flaggedData,
        startY: y,
        margin: { left: M, right: M },
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: C.offWhite },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 28, halign: 'right' },
          3: { cellWidth: 70 },
        },
        didParseCell: (data) => {
          if (data.column.index === 1 && data.section === 'body') {
            const s = (data.cell.text?.[0] ?? '').toUpperCase();
            data.cell.styles.fontStyle = 'bold';
            if (s.includes('REVIEW')) { data.cell.styles.textColor = C.orange; }
            else if (s.includes('CLARIFY')) { data.cell.styles.textColor = C.blue; }
          }
        },
      });

      y = (doc as any).lastAutoTable?.finalY + 8 || y + 40;
    }

    // Savings opportunities
    if (m.savingsOpportunities.length > 0) {
      y = sectionTitle(y, 'Savings Opportunities');

      const savingsData = m.savingsOpportunities.slice(0, 8).map(({ item, savings }) => [
        item.originalDescription.substring(0, 45) + (item.originalDescription.length > 45 ? '…' : ''),
        item.trade || '—',
        fmt(item.originalUnitPrice || 0),
        fmt(item.userOverridePrice || item.recommendedUnitPrice || 0),
        fmt(savings),
      ]);

      autoTable(doc, {
        head: [['Description', 'Trade', `Original (${currency})`, `Recommended (${currency})`, `Savings (${currency})`]],
        body: savingsData,
        startY: y,
        margin: { left: M, right: M },
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: C.green, textColor: C.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: C.offWhite },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 25 },
          2: { cellWidth: 28, halign: 'right' },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        },
      });

      y = (doc as any).lastAutoTable?.finalY + 8 || y + 40;
    }

    // High deviation items
    if (m.highVarianceItems.length > 0 && y < ph - 60) {
      y = sectionTitle(y, 'Cost Deviation Analysis (>10%)');

      const devData = m.highVarianceItems.slice(0, 8).map(item => {
        const v = ((item.originalUnitPrice! - item.benchmarkTypical!) / item.benchmarkTypical!) * 100;
        return [
          item.originalDescription.substring(0, 45) + (item.originalDescription.length > 45 ? '…' : ''),
          fmt(item.originalUnitPrice || 0),
          fmt(item.benchmarkTypical || 0),
          `${v > 0 ? '↑' : '↓'} ${Math.abs(v).toFixed(1)}%`,
        ];
      });

      autoTable(doc, {
        head: [['Description', `Original (${currency})`, `Benchmark (${currency})`, 'Deviation']],
        body: devData,
        startY: y,
        margin: { left: M, right: M },
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: C.red, textColor: C.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: C.offWhite },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 30, halign: 'right' },
          2: { cellWidth: 30, halign: 'right' },
          3: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (data.column.index === 3 && data.section === 'body') {
            const raw = (data.cell.text?.[0] ?? '').replace(/[↑↓%\s]/g, '');
            const v = Number(raw);
            if (!Number.isNaN(v)) {
              data.cell.styles.textColor = v > 20 ? C.red : C.orange;
            }
          }
        },
      });
    }

    addFooter();
  } // end full report

  // ── PDF Properties ──
  doc.setProperties({
    title: `Unit Rate - ${project.name} - Cost Analysis`,
    subject: `${options.format === 'executive' ? 'Executive Summary' : 'Full Report'} for ${project.name}`,
    author: 'Unit Rate',
    creator: 'Unit Rate Cost Analysis Platform',
  });

  // Preview mode: return blob instead of downloading
  if (previewMode) {
    return doc.output('blob');
  }

  // Download
  const timestamp = new Date().toISOString().split('T')[0];
  const formatSuffix = options.format === 'executive' ? 'Executive' : 'Full';
  const filename = `UnitRate_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_${formatSuffix}_${timestamp}.pdf`;
  doc.save(filename);
}
