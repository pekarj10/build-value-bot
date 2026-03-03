/**
 * Professional PDF Report Generator for Unit Rate
 * Supports two formats: Executive Summary (2-3 pages) and Full Report (detailed)
 * All charts drawn natively with jsPDF (no image imports).
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CostItem, Project, PROJECT_TYPE_LABELS, ProjectType } from '@/types/project';
import { formatCurrency } from '@/lib/formatters';
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
  // Fallback: format raw DB string
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

// ─── Native Chart Drawing ────────────────────────────────────────
// All charts drawn directly with jsPDF — no canvas, no images.

function drawDonutChart(
  doc: jsPDF,
  cx: number, cy: number, outerR: number, innerR: number,
  data: Array<{ label: string; value: number; color: [number, number, number] }>,
  legendX: number, legendY: number, legendMaxW: number, currency: string, fmt: (v: number) => string,
) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return;

  // Draw slices using filled arcs approximated by polygon wedges
  let startAngle = -Math.PI / 2; // start from top
  for (const slice of data) {
    const sweepAngle = (slice.value / total) * Math.PI * 2;
    const endAngle = startAngle + sweepAngle;

    // Draw wedge as a filled polygon (many small segments)
    doc.setFillColor(...slice.color);
    const points: [number, number][] = [];
    // Outer arc
    const steps = Math.max(20, Math.ceil(sweepAngle / 0.05));
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + (sweepAngle * i) / steps;
      points.push([cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR]);
    }
    // Inner arc (reverse)
    for (let i = steps; i >= 0; i--) {
      const a = startAngle + (sweepAngle * i) / steps;
      points.push([cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR]);
    }

    // Draw polygon using lines
    if (points.length > 2) {
      doc.setDrawColor(...C.white);
      doc.setLineWidth(0.5);
      // Use triangle fan approach
      const path = points.map(([x, y], i) => 
        i === 0 ? `${x.toFixed(2)} ${y.toFixed(2)} m` : `${x.toFixed(2)} ${y.toFixed(2)} l`
      ).join(' ') + ' h';
      
      // Fallback: draw using multiple triangles from center
      // jsPDF doesn't have native polygon, so use rect-based approximation
      // Actually use the triangle() method or lines
      const xCoords = points.map(p => p[0]);
      const yCoords = points.map(p => p[1]);
      doc.setFillColor(...slice.color);
      // @ts-ignore - using internal lines method
      doc.lines(
        points.slice(1).map((p, i) => [p[0] - points[i][0], p[1] - points[i][1]]),
        points[0][0], points[0][1],
        [1, 1], 'F', true
      );
    }

    startAngle = endAngle;
  }

  // Draw center hole (white circle)
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
    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.text);
    doc.text(smartTruncate(bar.label, 28), x, by + barH / 2 + 1);

    // Bar
    const barWidth = (bar.value / maxVal) * chartW;
    doc.setFillColor(...bar.color);
    doc.roundedRect(x + labelW, by, barWidth, barH, 1, 1, 'F');

    // Value
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
    doc.text('Construction Cost Analysis', M + (logoDataUrl ? 13 : 0), 19);
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

  // ── Variance Indicators ──
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
    doc.text(`${label}: ${count} items`, x + 4, iy + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(desc, x + 4, iy + 12);
  };

  drawIndicator(M, y, C.redBg, C.red, 'HIGH RISK', overrunItems.length, '>20% over benchmark');
  drawIndicator(M + indW + 4, y, C.orangeBg, C.orange, 'MODERATE', moderateItems.length, '+5% to +20% variance');
  drawIndicator(M + (indW + 4) * 2, y, C.greenBg, C.green, 'ON BUDGET', withinBudget.length, '<5% variance');

  y += 22;

  // ── Summary Bullets ──
  y = sectionTitle(y, 'Summary');

  const bullets: string[] = [];
  bullets.push(`Total project estimate: ${fmt(m.totalEstimated)} ${currency} across ${m.totalItems} line items.`);
  if (m.potentialSavings > 0) bullets.push(`Potential savings of ${fmt(m.potentialSavings)} ${currency} identified through benchmarking.`);
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
  // PAGE 2: NATIVE CHARTS + RISK MATRIX
  // ════════════════════════════════════════════════════════════════
  y = addNewPage();
  y = sectionTitle(y, 'Cost Distribution');

  // Trade breakdown data
  const topTrades = [...m.tradeBreakdown.entries()]
    .sort((a, b) => b[1].estimated - a[1].estimated)
    .slice(0, 8);

  const donutData = topTrades.map(([trade, data], i) => ({
    label: trade,
    value: data.estimated,
    color: CHART_PALETTE[i % CHART_PALETTE.length],
  }));

  // Draw donut chart — left side
  const donutAreaH = 85;
  doc.setFillColor(...C.lightGray);
  doc.setDrawColor(...C.border);
  doc.roundedRect(M, y, contentWidth, donutAreaH, 2, 2, 'FD');
  doc.setTextColor(...C.navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Cost by Trade', M + 4, y + 7);

  drawDonutChart(
    doc,
    M + 45, y + 48, 28, 16,  // center, outer, inner
    donutData,
    M + 85, y + 14, contentWidth - 90, currency, fmt,
  );

  y += donutAreaH + 5;

  // Estimate Flow — horizontal bars
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

  y += flowH + 8;

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
    doc.text(label, x + 4, iy + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.darkGray);
    doc.text(desc, x + 4, iy + 13);
  };

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

  addFooter();

  // ════════════════════════════════════════════════════════════════
  // PAGE 3: TRADE SUMMARY TABLE
  // ════════════════════════════════════════════════════════════════
  y = addNewPage();
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
  // FULL REPORT: Detailed Tables (PORTRAIT) + Analysis
  // ════════════════════════════════════════════════════════════════
  if (options.format === 'full') {
    y = addNewPage();
    y = sectionTitle(y, 'Detailed Cost Items');

    // Portrait table: Description | Qty | Unit | Orig Total | Rec Total | Var%
    // Trade column removed — it's shown in group header rows
    const sorted = [...exportItems].sort((a, b) => (a.trade || 'Uncategorized').localeCompare(b.trade || 'Uncategorized'));
    const groups = new Map<string, CostItem[]>();
    for (const it of sorted) {
      const key = it.trade?.trim() || 'Uncategorized';
      groups.set(key, [...(groups.get(key) || []), it]);
    }

    const rowTypes: Array<'group' | 'item' | 'subtotal' | 'total'> = [];
    const tableBody: string[][] = [];

    for (const [trade, groupItems] of groups.entries()) {
      // Group header
      tableBody.push([trade, '', '', '', '', '']);
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

        tableBody.push([
          smartTruncate(item.originalDescription, 55),
          item.quantity.toLocaleString(),
          item.unit,
          origT != null ? fmt(origT) : '—',
          recT != null ? fmt(recT) : '—',
          varianceStr,
        ]);
        rowTypes.push('item');
      }

      // Subtotal
      const subOrig = groupItems.reduce((s, i) => s + (i.originalUnitPrice ? i.originalUnitPrice * i.quantity : 0), 0);
      const subEst = groupItems.reduce((s, i) => { const p = getEffectivePrice(i); return s + (p != null ? p * i.quantity : 0); }, 0);
      tableBody.push([`Subtotal: ${trade}`, '', '', fmt(subOrig), fmt(subEst), '']);
      rowTypes.push('subtotal');
    }

    // Grand total
    tableBody.push([
      'GRAND TOTAL',
      exportItems.reduce((s, i) => s + i.quantity, 0).toLocaleString(),
      '',
      fmt(m.totalOriginal),
      fmt(m.totalEstimated),
      '',
    ]);
    rowTypes.push('total');

    autoTable(doc, {
      head: [['Description', 'Qty', 'Unit', `Original (${currency})`, `Estimated (${currency})`, 'Var %']],
      body: tableBody,
      startY: y,
      margin: { left: M, right: M },
      styles: { fontSize: 7, cellPadding: 2, valign: 'middle', lineWidth: 0.1, lineColor: C.border, overflow: 'linebreak' },
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: C.offWhite },
      rowPageBreak: 'avoid',
      columnStyles: {
        0: { cellWidth: 68 },
        1: { cellWidth: 18, halign: 'right' },
        2: { cellWidth: 14 },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 16, halign: 'center' },
      },
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
          // Variance color coding
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
        // Prevent orphaned group headers at bottom of page
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

    // High deviation items
    if (m.highVarianceItems.length > 0) {
      if (y > ph - 60) {
        y = addNewPage();
      }
      y = sectionTitle(y, 'Cost Deviation Analysis (>10%)');

      const devData = m.highVarianceItems.slice(0, 8).map(item => {
        const v = ((item.originalUnitPrice! - item.benchmarkTypical!) / item.benchmarkTypical!) * 100;
        return [
          smartTruncate(item.originalDescription, 50),
          fmt(item.originalUnitPrice || 0),
          fmt(item.benchmarkTypical || 0),
          `${v > 0 ? '+' : ''}${Math.abs(v).toFixed(1)}%`,
        ];
      });

      autoTable(doc, {
        head: [['Description', `Original (${currency})`, `Benchmark (${currency})`, 'Deviation']],
        body: devData,
        startY: y,
        margin: { left: M, right: M },
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: C.red, textColor: C.white, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: C.offWhite },
        columnStyles: {
          0: { cellWidth: 65 },
          1: { cellWidth: 30, halign: 'right' },
          2: { cellWidth: 30, halign: 'right' },
          3: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (data.column.index === 3 && data.section === 'body') {
            const raw = (data.cell.text?.[0] ?? '').replace(/[+\-%\s]/g, '');
            const v = Number(raw);
            if (!Number.isNaN(v)) {
              data.cell.styles.textColor = v > 20 ? C.red : C.orange;
            }
          }
        },
        didDrawPage: () => addFooter(),
      });
    }
  } // end full report

  // ── PDF Properties ──
  doc.setProperties({
    title: `Unit Rate - ${project.name} - Cost Analysis`,
    subject: `${options.format === 'executive' ? 'Executive Summary' : 'Full Report'} for ${project.name}`,
    author: 'Unit Rate',
    creator: 'Unit Rate Cost Analysis Platform',
  });

  if (previewMode) {
    return doc.output('blob');
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const formatSuffix = options.format === 'executive' ? 'Executive' : 'Full';
  const filename = `UnitRate_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_${formatSuffix}_${timestamp}.pdf`;
  doc.save(filename);
}
