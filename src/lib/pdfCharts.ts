// Thin typed wrapper around the runtime JS implementation.
// This avoids pulling in Chart.js' heavy type definitions into the TS compiler.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - JS module
export { renderChartToDataUrl } from "./pdfChartsRuntime";
