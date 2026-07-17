# Schematic Viewer

在浏览器中解析并预览 WorldEdit / Sponge `.schem` v2、v3 文件。渲染器直接使用项目内 Minecraft 1.21.11 客户端的方块状态、模型与纹理资源。

## 开发

```powershell
npm install
npm run assets
npm run dev
```

`npm run assets` 会从 `.minecraft/versions/1.21.11/1.21.11.jar` 提取原版资源到 `public/minecraft`。生成目录不会提交到 Git。

## 测试样例

运行 `npm run samples` 可重新生成并校验 `samples/` 中的三个小型结构文件：单方块 v2、含多种材质的 v2 棋盘，以及含方块状态的 v3 小型结构。

## 功能

- 浏览器本地解析 gzip、zlib 或未压缩 NBT
- 支持 Sponge Schematic v2 与 v3 的调色板和 VarInt 方块数据
- 解析原版 blockstate variants、multipart、模型继承、元素旋转和透明材质
- 自由视角、预设视角、方块拾取、垂直剖切与截图
- 所有结构文件只在本地处理，不会上传
