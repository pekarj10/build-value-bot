/**
 * Professional PDF Report Generator for Unit Rate
 * Supports two formats: Executive Summary (2-3 pages) and Full Report (detailed)
 * All charts drawn natively with jsPDF (no image imports).
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CostItem, Project, PROJECT_TYPE_LABELS, ProjectType } from '@/types/project';
import { formatCurrency } from '@/lib/formatters';
import { inferTddCategory, TDD_CATEGORIES, TDD_CATEGORY_COLORS, type TddCategory } from '@/lib/tddCategories';
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
  clientName?: string;
  contractorName?: string;
  coverNotes?: string;
  includeAIReasoning?: boolean;
  includeExcludedItems?: boolean;
  includeVisualCharts?: boolean;
  excludedIds?: Set<string>;
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

const CHART_PALETTE: [number, number, number][] = [
  [30, 58, 95],    // navy
  [37, 99, 235],   // blue
  [14, 165, 233],  // sky
  [22, 163, 74],   // green
  [245, 158, 11],  // amber
  [220, 38, 38],   // red
  [139, 92, 246],  // violet
  [236, 72, 153],  // pink
];

/** TDD category colors as RGB tuples for PDF */
const TDD_PALETTE: Record<TddCategory, [number, number, number]> = {
  Structural: [42, 72, 107],
  Facade: [56, 107, 133],
  Roof: [54, 128, 118],
  'Interior Finishes': [178, 130, 50],
  'MEP / HVAC': [107, 78, 148],
  'Site Works': [56, 128, 82],
  Other: [115, 122, 137],
};

// ─── Smart Description Truncation ────────────────────────────────
const FILLER_WORDS = new Set([
  'and', 'the', 'for', 'with', 'including', 'incl', 'of', 'to', 'in', 'on',
  'all', 'as', 'per', 'etc', 'various', 'general', 'complete', 'full',
  'supply', 'provision', 'installation', 'works', 'work',
]);

function smartTruncate(text: string, maxLen: number): string {
  if (!text) return '—';
  if (text.length <= maxLen) return text;

  // Remove content in parentheses
  let shortened = text.replace(/\s*\([^)]*\)/g, '');
  if (shortened.length <= maxLen) return shortened;

  // Remove filler words
  const words = shortened.split(/\s+/);
  const important = words.filter(w => !FILLER_WORDS.has(w.toLowerCase()));
  shortened = important.join(' ');
  if (shortened.length <= maxLen) return shortened;

  // Remove em-dashes and content after them if still too long
  const dashIdx = shortened.indexOf('—');
  if (dashIdx > 10 && dashIdx < shortened.length - 5) {
    const beforeDash = shortened.substring(0, dashIdx).trim();
    if (beforeDash.length <= maxLen) return beforeDash;
    shortened = beforeDash;
  }

  // Truncate at word boundary
  const cut = shortened.substring(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.4 ? cut.substring(0, lastSpace) : cut) + '…';
}

/** Format unknown project type strings nicely */
function formatProjectType(project: Project): string {
  const label = PROJECT_TYPE_LABELS[project.projectType as ProjectType];
  if (label) return label;
  return project.projectType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

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
  tddBreakdown: Map<TddCategory, { estimated: number; count: number }>;
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

  // TDD Category breakdown
  const tddBreakdown = new Map<TddCategory, { estimated: number; count: number }>();
  for (const item of items) {
    const cat = inferTddCategory(null, item.trade, item.originalDescription);
    const existing = tddBreakdown.get(cat) || { estimated: 0, count: 0 };
    const p = getEffectivePrice(item);
    existing.estimated += p != null ? p * item.quantity : 0;
    existing.count++;
    tddBreakdown.set(cat, existing);
  }

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
    tddBreakdown,
  };
}

// ─── Native Chart Drawing ────────────────────────────────────────

function drawDonutChart(
  doc: jsPDF,
  cx: number, cy: number, outerR: number, innerR: number,
  data: Array<{ label: string; value: number; color: [number, number, number] }>,
  legendX: number, legendY: number, legendMaxW: number, currency: string, fmt: (v: number) => string,
) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return;

  let startAngle = -Math.PI / 2;
  for (const slice of data) {
    const sweepAngle = (slice.value / total) * Math.PI * 2;
    const endAngle = startAngle + sweepAngle;

    doc.setFillColor(...slice.color);
    const points: [number, number][] = [];
    const steps = Math.max(20, Math.ceil(sweepAngle / 0.05));
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + (sweepAngle * i) / steps;
      points.push([cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR]);
    }
    for (let i = steps; i >= 0; i--) {
      const a = startAngle + (sweepAngle * i) / steps;
      points.push([cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR]);
    }

    if (points.length > 2) {
      doc.setDrawColor(...C.white);
      doc.setLineWidth(0.5);
      doc.setFillColor(...slice.color);
      // @ts-ignore
      doc.lines(
        points.slice(1).map((p, i) => [p[0] - points[i][0], p[1] - points[i][1]]),
        points[0][0], points[0][1],
        [1, 1], 'F', true
      );
    }

    startAngle = endAngle;
  }

  // Center hole
  doc.setFillColor(...C.white);
  doc.circle(cx, cy, innerR, 'F');

  // Center text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.navy);
  doc.text(fmt(total), cx, cy + 1, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...C.textMuted);
  doc.text('Total', cx, cy + 5, { align: 'center' });

  // Legend
  let ly = legendY;
  doc.setFontSize(6.5);
  for (const slice of data) {
    const pct = ((slice.value / total) * 100).toFixed(0);
    doc.setFillColor(...slice.color);
    doc.rect(legendX, ly - 2.5, 3, 3, 'F');
    doc.setTextColor(...C.text);
    doc.setFont('helvetica', 'normal');
    const legendLabel = smartTruncate(slice.label, 22);
    doc.text(`${legendLabel} (${pct}%)`, legendX + 5, ly);
    doc.setTextColor(...C.textMuted);
    doc.text(fmt(slice.value), legendX + 5, ly + 3.5);
    ly += 9;
  }
}

function drawHorizontalBarChart(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  bars: Array<{ label: string; value: number; color: [number, number, number] }>,
  fmt: (v: number) => string,
) {
  const maxVal = Math.max(...bars.map(b => b.value), 1);
  const barH = Math.min(12, (h - 10) / bars.length - 2);
  const labelW = 55;
  const chartW = w - labelW - 25;

  let by = y + 5;
  for (const bar of bars) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.text);
    doc.text(smartTruncate(bar.label, 28), x, by + barH / 2 + 1);

    const barWidth = (bar.value / maxVal) * chartW;
    doc.setFillColor(...bar.color);
    doc.roundedRect(x + labelW, by, barWidth, barH, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textMuted);
    doc.text(fmt(bar.value), x + labelW + barWidth + 2, by + barH / 2 + 1);

    by += barH + 3;
  }
}

// ─── PDF Builder ─────────────────────────────────────────────────

export async function generatePdfReport(
  items: CostItem[],
  project: Project,
  options: PdfExportOptions,
  previewMode: boolean = false,
): Promise<Blob | void> {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pw = 210;
  const ph = 297;
  const M = 18;
  const contentWidth = pw - 2 * M;
  let pageNum = 0;

  const includeCharts = options.includeVisualCharts !== false;
  const includeAIReasoning = options.includeAIReasoning === true;

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
  } catch { /* fallback: no logo */ }

  // ── Helpers ──
  const addHeader = () => {
    doc.setFillColor(...C.navy);
    doc.rect(0, 0, pw, 3, 'F');
    if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', M, 8, 10, 10);
    doc.setTextColor(...C.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Unit Rate', M + (logoDataUrl ? 13 : 0), 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.textMuted);
    doc.text('TDD / Renovation Estimate Report', M + (logoDataUrl ? 13 : 0), 19);
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.text(dateStr, pw - M, 12, { align: 'right' });
    doc.text(options.format === 'executive' ? 'Executive Summary' : 'Full Report', pw - M, 17, { align: 'right' });
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
    doc.text(project.name, pw / 2, footerY + 5, { align: 'center' });
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

  const formatStatus = (s: string) => {
    const sl = s.toLowerCase();
    if (sl === 'ok') return 'OK';
    if (sl === 'review' || sl === 'underpriced') return 'Review';
    if (sl === 'clarification') return 'Clarify';
    if (sl === 'actual') return 'Actual';
    return s;
  };

  // ════════════════════════════════════════════════════════════════
  // PAGE 1: COVER + EXECUTIVE SUMMARY
  // ════════════════════════════════════════════════════════════════
  let y = addHeader();

  doc.setTextColor(...C.navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('TDD / Renovation Estimate Report', M, y + 8);
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
    const lines = doc.splitTextToSize(value, mw) as string[];
    doc.text(lines[0], x, iy + 5);
  };

  infoLabel(M + 5, y + 7, 'Country', project.country);
  infoLabel(M + 5, y + 19, 'Currency', project.currency);
  infoLabel(M + colW / 2, y + 7, 'Project Type', formatProjectType(project));
  infoLabel(M + colW / 2, y + 19, 'Total Items', String(exportItems.length));

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  infoLabel(M + colW + 11, y + 7, 'Report Date', dateStr);
  infoLabel(M + colW + 11, y + 19, 'Report Type', options.format === 'executive' ? 'Executive Summary' : 'Full Report');
  infoLabel(M + colW + 6 + colW / 2, y + 7, options.clientName ? 'Client' : 'Status', options.clientName || `${m.okCount} OK / ${m.reviewCount + m.clarificationCount} Flagged`);
  infoLabel(M + colW + 6 + colW / 2, y + 19, options.contractorName ? 'Contractor' : 'Total Value', options.contractorName || fmt(m.totalEstimated));

  y += 34;

  // Cover notes
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

  // ── Total Estimated CAPEX Hero Card ──
  const heroH = 24;
  doc.setFillColor(...C.navy);
  doc.roundedRect(M, y, contentWidth, heroH, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 195, 220);
  doc.text('TOTAL ESTIMATED CAPEX', M + 8, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...C.white);
  const capexStr = `${fmt(m.totalEstimated)} ${currency}`;
  doc.text(capexStr, M + 8, y + 18);
  // Items count on right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 195, 220);
  doc.text(`${m.totalItems} line items`, pw - M - 8, y + 10, { align: 'right' });
  doc.text(`${m.reviewCount + m.clarificationCount} flagged`, pw - M - 8, y + 17, { align: 'right' });

  y += heroH + 6;

  // ── KPI Cards ──
  y = sectionTitle(y, 'Key Metrics');

  const kpiCardW = (contentWidth - 9) / 4;
  const kpiCardH = 28;
  const kpiTextW = kpiCardW - 9;

  const drawKpiCard = (x: number, iy: number, accentColor: [number, number, number], label: string, value: string, subtitle?: string) => {
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.border);
    doc.roundedRect(x, iy, kpiCardW, kpiCardH, 2, 2, 'FD');
    doc.setFillColor(...accentColor);
    doc.rect(x, iy + 2, 2.5, kpiCardH - 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textMuted);
    doc.text(label.toUpperCase(), x + 6, iy + 7);
    doc.setFont('helvetica', 'bold');
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
  const deltaLabel = delta >= 0 ? `+${fmt(Math.abs(delta))} vs original` : `-${fmt(Math.abs(delta))} vs original`;
  const varianceColor: [number, number, number] = Math.abs(m.avgVariance) <= 5 ? C.green : Math.abs(m.avgVariance) <= 20 ? C.orange : C.red;

  drawKpiCard(M, y, C.blue, `Project Estimate (${currency})`, fmt(m.totalEstimated), deltaLabel);
  drawKpiCard(M + kpiCardW + 3, y, C.orange, 'Items Flagged', `${m.reviewCount + m.clarificationCount + m.underpricedCount}`, `${m.reviewCount} Review · ${m.clarificationCount} Clarify`);
  drawKpiCard(M + (kpiCardW + 3) * 2, y, C.green, `Potential Savings (${currency})`, fmt(m.potentialSavings), 'vs original estimate');
  drawKpiCard(M + (kpiCardW + 3) * 3, y, varianceColor, 'Avg Variance', `${m.avgVariance >= 0 ? '+' : ''}${m.avgVariance.toFixed(1)}%`, 'Original vs benchmark');

  y += kpiCardH + 6;

  // ── Summary Bullets ──
  y = sectionTitle(y, 'Summary');

  const bullets: string[] = [];
  bullets.push(`Total project estimate: ${fmt(m.totalEstimated)} ${currency} across ${m.totalItems} line items.`);
  if (m.potentialSavings > 0) bullets.push(`Potential savings of ${fmt(m.potentialSavings)} ${currency} identified through benchmarking.`);
  const overrunItems = items.filter(i => {
    if (!i.originalUnitPrice || !i.benchmarkTypical || i.benchmarkTypical === 0) return false;
    return ((i.originalUnitPrice - i.benchmarkTypical) / i.benchmarkTypical) * 100 > 20;
  });
  if (overrunItems.length > 0) bullets.push(`${overrunItems.length} item(s) priced >20% above market benchmarks — recommend re-quoting.`);
  if (m.underpricedRisk > 0) bullets.push(`Underpriced risk exposure of ${fmt(m.underpricedRisk)} ${currency} identified.`);
  if (m.reviewCount + m.clarificationCount > 0) bullets.push(`${m.reviewCount + m.clarificationCount} items require attention (review or clarification).`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.text);
  for (const bullet of bullets) {
    const wrapped = doc.splitTextToSize(`•  ${bullet}`, contentWidth - 8) as string[];
    for (const line of wrapped) {
      doc.text(line, M + 3, y);
      y += 4.5;
    }
    y += 1;
  }

  addFooter();

  // ════════════════════════════════════════════════════════════════
  // PAGE 2: TDD CATEGORY CHART + COST DISTRIBUTION
  // ════════════════════════════════════════════════════════════════
  if (includeCharts) {
    y = addNewPage();
    y = sectionTitle(y, 'Budget by TDD Category');

    // TDD category donut
    const tddData = [...m.tddBreakdown.entries()]
      .filter(([, d]) => d.estimated > 0)
      .sort((a, b) => b[1].estimated - a[1].estimated)
      .map(([cat, data]) => ({
        label: cat,
        value: data.estimated,
        color: TDD_PALETTE[cat] || TDD_PALETTE.Other,
      }));

    const donutAreaH = 85;
    doc.setFillColor(...C.lightGray);
    doc.setDrawColor(...C.border);
    doc.roundedRect(M, y, contentWidth, donutAreaH, 2, 2, 'FD');
    doc.setTextColor(...C.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('CAPEX Distribution by Category', M + 4, y + 7);

    drawDonutChart(
      doc,
      M + 45, y + 48, 28, 16,
      tddData,
      M + 85, y + 14, contentWidth - 90, currency, fmt,
    );

    y += donutAreaH + 5;

    // Trade breakdown chart (original)
    const topTrades = [...m.tradeBreakdown.entries()]
      .sort((a, b) => b[1].estimated - a[1].estimated)
      .slice(0, 8);

    const tradeDonutData = topTrades.map(([trade, data], i) => ({
      label: trade,
      value: data.estimated,
      color: CHART_PALETTE[i % CHART_PALETTE.length],
    }));

    const tradeDonutH = 85;
    doc.setFillColor(...C.lightGray);
    doc.setDrawColor(...C.border);
    doc.roundedRect(M, y, contentWidth, tradeDonutH, 2, 2, 'FD');
    doc.setTextColor(...C.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Cost by Trade', M + 4, y + 7);

    drawDonutChart(
      doc,
      M + 45, y + 48, 28, 16,
      tradeDonutData,
      M + 85, y + 14, contentWidth - 90, currency, fmt,
    );

    y += tradeDonutH + 5;

    // Estimate Flow
    const flowH = 50;
    doc.setFillColor(...C.lightGray);
    doc.setDrawColor(...C.border);
    doc.roundedRect(M, y, contentWidth, flowH, 2, 2, 'FD');
    doc.setTextColor(...C.navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Estimate Flow', M + 4, y + 7);

    const adjustmentValue = m.totalEstimated - m.totalOriginal;
    drawHorizontalBarChart(
      doc, M + 4, y + 10, contentWidth - 8, flowH - 15,
      [
        { label: 'Original Estimate', value: m.totalOriginal, color: C.navy },
        { label: `Adjustments (${adjustmentValue >= 0 ? '+' : ''}${fmt(adjustmentValue)})`, value: Math.abs(adjustmentValue), color: adjustmentValue >= 0 ? C.red : C.green },
        { label: 'Final Estimate', value: m.totalEstimated, color: C.blue },
      ],
      fmt,
    );

    y += flowH + 5;

    addFooter();
  }

  // ════════════════════════════════════════════════════════════════
  // PAGE 3: TDD CATEGORY SUMMARY TABLE
  // ════════════════════════════════════════════════════════════════
  y = addNewPage();
  y = sectionTitle(y, 'TDD Category Summary');

  const tddSummaryData = [...m.tddBreakdown.entries()]
    .sort((a, b) => b[1].estimated - a[1].estimated)
    .map(([cat, data]) => {
      const pct = m.totalEstimated > 0 ? ((data.estimated / m.totalEstimated) * 100).toFixed(1) : '0';
      return [cat, String(data.count), fmt(data.estimated), `${pct}%`];
    });

  autoTable(doc, {
    head: [['TDD Category', 'Items', `Estimated (${currency})`, '% of CAPEX']],
    body: tddSummaryData,
    startY: y,
    margin: { left: M, right: M },
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.offWhite },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 40 },
      3: { halign: 'center', cellWidth: 25 },
    },
    didDrawPage: () => addFooter(),
  });

  y = (doc as any).lastAutoTable?.finalY + 8 || y + 40;

  // Trade Summary
  if (y > ph - 80) {
    y = addNewPage();
  }
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
    didDrawPage: () => addFooter(),
  });

  // ════════════════════════════════════════════════════════════════
  // FULL REPORT: Detailed Tables + Analysis
  // ════════════════════════════════════════════════════════════════
  if (options.format === 'full') {
    y = addNewPage();
    y = sectionTitle(y, 'Itemized Breakdown');

    const sorted = [...exportItems].sort((a, b) => (a.trade || 'Uncategorized').localeCompare(b.trade || 'Uncategorized'));
    const groups = new Map<string, CostItem[]>();
    for (const it of sorted) {
      const key = it.trade?.trim() || 'Uncategorized';
      groups.set(key, [...(groups.get(key) || []), it]);
    }

    const rowTypes: Array<'group' | 'item' | 'subtotal' | 'total'> = [];
    const tableBody: string[][] = [];

    // Determine columns based on includeAIReasoning
    const hasAICol = includeAIReasoning;

    for (const [trade, groupItems] of groups.entries()) {
      const colCount = hasAICol ? 7 : 6;
      tableBody.push([trade, ...Array(colCount - 1).fill('')]);
      rowTypes.push('group');

      for (const item of groupItems) {
        const ep = getEffectivePrice(item);
        const origT = item.originalUnitPrice ? item.originalUnitPrice * item.quantity : null;
        const recT = ep != null ? ep * item.quantity : null;
        let varianceStr = '—';
        if (item.originalUnitPrice && item.benchmarkTypical && item.benchmarkTypical !== 0) {
          const v = ((item.originalUnitPrice - item.benchmarkTypical) / item.benchmarkTypical) * 100;
          varianceStr = `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
        }

        const row = [
          smartTruncate(item.originalDescription, hasAICol ? 40 : 55),
          item.quantity.toLocaleString(),
          item.unit,
          origT != null ? fmt(origT) : '—',
          recT != null ? fmt(recT) : '—',
          varianceStr,
        ];
        if (hasAICol) {
          row.push(smartTruncate(item.aiComment || item.matchReasoning || '—', 45));
        }
        tableBody.push(row);
        rowTypes.push('item');
      }

      // Subtotal
      const subOrig = groupItems.reduce((s, i) => s + (i.originalUnitPrice ? i.originalUnitPrice * i.quantity : 0), 0);
      const subEst = groupItems.reduce((s, i) => { const p = getEffectivePrice(i); return s + (p != null ? p * i.quantity : 0); }, 0);
      const subRow = [`Subtotal: ${trade}`, '', '', fmt(subOrig), fmt(subEst), ''];
      if (hasAICol) subRow.push('');
      tableBody.push(subRow);
      rowTypes.push('subtotal');
    }

    // Grand total
    const totalRow = [
      'GRAND TOTAL',
      exportItems.reduce((s, i) => s + i.quantity, 0).toLocaleString(),
      '',
      fmt(m.totalOriginal),
      fmt(m.totalEstimated),
      '',
    ];
    if (hasAICol) totalRow.push('');
    tableBody.push(totalRow);
    rowTypes.push('total');

    const headRow = ['Description', 'Qty', 'Unit', `Original (${currency})`, `Estimated (${currency})`, 'Var %'];
    if (hasAICol) headRow.push('AI Reasoning');

    const colStyles: Record<number, any> = {
      0: { cellWidth: hasAICol ? 45 : 68 },
      1: { cellWidth: 18, halign: 'right' },
      2: { cellWidth: 14 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 16, halign: 'center' },
    };
    if (hasAICol) {
      colStyles[6] = { cellWidth: 25 };
    }

    autoTable(doc, {
      head: [headRow],
      body: tableBody,
      startY: y,
      margin: { left: M, right: M },
      styles: { fontSize: 7, cellPadding: 2, valign: 'middle', lineWidth: 0.1, lineColor: C.border, overflow: 'linebreak' },
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: C.offWhite },
      rowPageBreak: 'avoid',
      columnStyles: colStyles,
      didParseCell: (data) => {
        const t = rowTypes[data.row.index];
        if (!t) return;

        if (t === 'group') {
          data.cell.styles.fillColor = C.lightGray;
          data.cell.styles.textColor = C.navy;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 7.5;
          if (data.column.index !== 0) data.cell.text = [''];
        }
        if (t === 'subtotal') {
          data.cell.styles.fillColor = [235, 240, 248];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 7;
        }
        if (t === 'total') {
          data.cell.styles.fillColor = C.navy;
          data.cell.styles.textColor = C.white;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 7.5;
        }
        if (t === 'item') {
          if (data.column.index === 5) {
            const raw = (data.cell.text?.[0] ?? '').replace(/[+\-%\s]/g, '');
            const v = Number(raw);
            if (!Number.isNaN(v)) {
              data.cell.styles.fontStyle = 'bold';
              if (v > 20) data.cell.styles.textColor = C.red;
              else if (v > 5) data.cell.styles.textColor = C.orange;
              else data.cell.styles.textColor = C.green;
            }
          }
        }
      },
      willDrawCell: (data) => {
        if (data.section === 'body') {
          const t = rowTypes[data.row.index];
          if (t === 'group' && data.column.index === 0) {
            const remainingPageSpace = ph - 18 - data.cell.y;
            if (remainingPageSpace < 25) {
              doc.addPage();
              addHeader();
              data.cell.y = 32;
            }
          }
        }
      },
      didDrawPage: () => addFooter(),
    });

    // ── Analysis Section ──
    y = addNewPage();
    y = sectionTitle(y, 'Analysis & Recommendations');

    if (m.topFlaggedItems.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.navy);
      doc.text('Top Flagged Items', M, y);
      y += 5;

      const flaggedData = m.topFlaggedItems.slice(0, 8).map(item => {
        const total = (getEffectivePrice(item) ?? 0) * item.quantity;
        return [
          smartTruncate(item.originalDescription, 45),
          formatStatus(item.status),
          fmt(total),
          item.aiComment || '—',
        ];
      });

      autoTable(doc, {
        head: [['Description', 'Status', `Value (${currency})`, 'AI Comment / Recommendation']],
        body: flaggedData,
        startY: y,
        margin: { left: M, right: M },
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: C.offWhite },
        columnStyles: {
          0: { cellWidth: 42 },
          1: { cellWidth: 14, halign: 'center' },
          2: { cellWidth: 25, halign: 'right' },
          3: { cellWidth: 93 },
        },
        didParseCell: (data) => {
          if (data.column.index === 1 && data.section === 'body') {
            const s = (data.cell.text?.[0] ?? '').toUpperCase();
            data.cell.styles.fontStyle = 'bold';
            if (s.includes('REVIEW')) data.cell.styles.textColor = C.orange;
            else if (s.includes('CLARIFY')) data.cell.styles.textColor = C.blue;
          }
        },
        didDrawPage: () => addFooter(),
      });

      y = (doc as any).lastAutoTable?.finalY + 8 || y + 40;
    }

    // Savings opportunities
    if (m.savingsOpportunities.length > 0) {
      if (y > ph - 60) {
        y = addNewPage();
      }
      y = sectionTitle(y, 'Savings Opportunities');

      const savingsData = m.savingsOpportunities.slice(0, 8).map(({ item, savings }) => [
        smartTruncate(item.originalDescription, 45),
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
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: C.green, textColor: C.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: C.offWhite },
        columnStyles: {
          0: { cellWidth: 48 },
          1: { cellWidth: 35 },
          2: { cellWidth: 28, halign: 'right' },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
        },
        didDrawPage: () => addFooter(),
      });

      y = (doc as any).lastAutoTable?.finalY + 8 || y + 40;
    }
  } // end full report

  // ════════════════════════════════════════════════════════════════
  // FINAL PAGE: ASSUMPTIONS & LIMITATIONS
  // ════════════════════════════════════════════════════════════════
  if (y > ph - 90) {
    y = addNewPage();
  } else {
    y += 5;
  }

  y = sectionTitle(y, 'Assumptions & Limitations');

  const disclaimers = [
    'This report has been prepared using AI-assisted benchmark matching. Unit prices are estimated based on available market data and may not reflect actual contractor pricing in your region or project conditions.',
    'Benchmark data is sourced from publicly available databases and proprietary datasets. Coverage may vary by country, trade, and construction type. Some items may lack reliable benchmark references.',
    'All estimates are indicative and should not be used as a substitute for formal contractor quotations. Actual costs may vary due to site conditions, material availability, labor markets, and project-specific requirements.',
    'The AI matching engine assigns confidence scores to each benchmark match. Items with low confidence or missing benchmarks are flagged for manual review. Users should verify all flagged items before relying on the estimates.',
    'This document is intended for internal decision-making and due diligence purposes only. It does not constitute a binding offer, warranty, or guarantee of construction costs.',
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.darkGray);

  for (let i = 0; i < disclaimers.length; i++) {
    const text = `${i + 1}.  ${disclaimers[i]}`;
    const wrapped = doc.splitTextToSize(text, contentWidth - 6) as string[];
    
    // Check if we need a new page
    if (y + wrapped.length * 4 > ph - 20) {
      addFooter();
      y = addNewPage();
      if (i === 0) y = sectionTitle(y, 'Assumptions & Limitations');
    }

    for (const line of wrapped) {
      doc.text(line, M + 3, y);
      y += 3.8;
    }
    y += 2;
  }

  // Signature line
  y += 6;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(M, y, M + 70, y);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(...C.textMuted);
  doc.text('Report prepared by Unit Rate — AI-Powered Cost Intelligence', M, y + 5);
  doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), M, y + 9);

  addFooter();

  // ── PDF Properties ──
  doc.setProperties({
    title: `Unit Rate - ${project.name} - TDD Estimate Report`,
    subject: `${options.format === 'executive' ? 'Executive Summary' : 'Full Report'} for ${project.name}`,
    author: 'Unit Rate',
    creator: 'Unit Rate Cost Analysis Platform',
  });

  if (previewMode) {
    return doc.output('blob');
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const formatSuffix = options.format === 'executive' ? 'Executive' : 'Full';
  const filename = `UnitRate_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_TDD_${formatSuffix}_${timestamp}.pdf`;
  doc.save(filename);
}
