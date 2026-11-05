// 浏览器里运行的一小段胶水：把 Excalidraw 骨架元素转成完整元素，再导出 SVG。
import { exportToSvg, convertToExcalidrawElements } from "@excalidraw/excalidraw";

window.renderSvg = async (skeleton, opts = {}) => {
  const elements = convertToExcalidrawElements(skeleton, { regenerateIds: false });
  const svg = await exportToSvg({
    elements,
    appState: {
      exportBackground: opts.background !== false,
      viewBackgroundColor: opts.bg || "#ffffff",
      exportWithDarkMode: false,
      exportEmbedScene: false,
    },
    files: {},
    exportPadding: opts.padding ?? 24,
  });
  return svg.outerHTML;
};
