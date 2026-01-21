import Chart from "chart.js/auto";

/**
 * Runtime-only chart rendering helper.
 * Kept as JS to avoid heavy Chart.js type definitions impacting TS typechecking.
 */
export async function renderChartToDataUrl(config, widthPx, heightPx) {
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create canvas context for chart rendering");

  const chart = new Chart(ctx, {
    ...config,
    options: {
      ...(config.options ?? {}),
      animation: false,
    },
  });

  await new Promise((resolve) => requestAnimationFrame(resolve));

  const dataUrl = canvas.toDataURL("image/png", 1.0);
  chart.destroy();
  return dataUrl;
}
