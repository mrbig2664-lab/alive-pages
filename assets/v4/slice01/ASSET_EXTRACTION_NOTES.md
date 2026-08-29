# ALIVE V4 · Slice 01 Master Art Asset Extraction

## 状态

这是一次独立的资产抽取与 Cleanup Pass 预览，不接入当前网站，不修改 V4 逻辑，不部署。

## 来源

五张母版原图已原样归档在 `masters/`：

- `alive_01.png`
- `alive_02.png`
- `alive_03.png`
- `alive_04.png`
- `alive_05.png`

## 处理原则

- 优先从母版中裁切，不重新设计角色。
- 使用透明化处理移除纸张底色；没有把母版 Cream 背景烘焙进透明资产。
- 预览中的 Room Zero composition 保持母版裁切，用于验收布局，不作为网站背景。
- 没有使用 Emoji、generic avatar 或 CSS 角色替代母版角色。

## 已生成目录

```text
assets/v4/slice01/
├── characters/
│   ├── zhanzhan/
│   └── smoke-beast/
├── room/
├── world/
├── ui/
├── preview/
└── masters/
```

## 预览方式

打开：`preview/ALIVE_V4_SLICE01_ASSET_PREVIEW_GALLERY.html`

图库包含：詹詹 4 状态、烟雾兽 4 状态、Room Zero 物件、蛋/植物/窗外早期状态、UI 微资产、统一地平线比例测试，以及 Folded-like / Unfolded-like / Master Room Zero 裁切。

## 本次 Cleanup Pass

已修复并重新检查：

- `smoke_beast_full`：独立完整烟雾兽，移除场景、纸条与边缘残片。
- `smoke_beast_eating`：移除卡片边框与相邻内容。
- `window_early`：仅保留窗框与窗外早期内容。
- `tape_yellow`、`note_paper`、`smoke_icon`：移除邻接标题、箭头与杂点，只保留元素本体。
- `zhanzhan_tired`、`egg_still`：清理相邻角色、标签与下方说明。
- `bed`、`table`：复查透明边缘，无明显残留碎片。

## 本轮明确不做

- 不替换当前网站 placeholder visuals。
- 不修改 `index.html`、`app.js`、`styles.css` 或 V4 domain / persistence。
- 不重新部署现有 production 或 V4 preview。
- 不生成完整角色宇宙、动画或 Post-MVP 资产。
