# 课程图表：Excalidraw 手绘风格

各章 `images/*.svg` 由这里的 `sources/*.json` 渲染而来。源文件是 Excalidraw 的元素列表，SVG 是产物；要改图，改源文件再重新渲染，不要直接改 SVG。

## 重新渲染

```sh
cd diagrams
npm install
npx playwright install chromium   # 只需一次
node render.js                    # 全部
node render.js s03-permission-pipeline   # 只渲染一张
```

渲染用的是 Excalidraw 官方包的导出功能，手写字体（英文 Excalifont、中文小赖字体）按用到的字符子集嵌进 SVG，读者电脑上不需要装任何字体。一张图通常 50～70 KB。

## 源文件格式

```json
{
  "out": "s01_agent_loop/images/agent-loop.svg",
  "opts": { "padding": 28 },
  "elements": [
    { "type": "text", "id": "title", "x": 40, "y": 0, "text": "标题", "fontSize": 22 },
    { "type": "rectangle", "id": "a", "x": 40, "y": 56, "width": 180, "height": 62,
      "roundness": { "type": 3 }, "backgroundColor": "#a5d8ff", "fillStyle": "solid",
      "label": { "text": "你说一句话", "fontSize": 20 } },
    { "type": "arrow", "id": "a1", "x": 130, "y": 118, "width": 0, "height": 40,
      "points": [[0, 0], [0, 40]], "endArrowhead": "arrow" }
  ]
}
```

`elements` 就是 Excalidraw 的「骨架」格式：`rectangle`、`diamond`、`ellipse` 可以带 `label` 自动居中文字；`arrow` 用 `points` 给相对坐标；`text` 是独立文字。这套格式和 Excalidraw 画板、Claude 的 Excalidraw 工具通用，可以把 `elements` 直接粘过去预览和手调，再粘回来。

## 画图约定

写给零基础读者看的图，和 README 的人话层同一套规矩：

- 文字用人话，技术词放在括号里，比如「记录本 (messages)」。
- 上一章保留的部分用普通线框；本章新增的部分用红色虚线框，标题写「（sXX 新增）」。
- 箭头旁的说明用独立 `text` 元素放在箭头旁边，不用箭头自带的 `label`，否则会压在线上。
- 颜色固定：你 / 输入 `#a5d8ff`，记录本和判断 `#fff3bf`，大模型 `#d0bfff`，执行 `#ffd8a8`，结束 `#b2f2bb`，拒绝和新增区 `#ffc9c9`。
- 字号：标题 22，框内 15～20，箭头说明 13～14，底部一句话总结 15～16。
- 每张图底部留一句话总结，说清这一章改了什么、没改什么。
