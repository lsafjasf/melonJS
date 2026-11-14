# 冰崖 · WebGL2 程序生成冰体

纯 WebGL2 演示：不依赖 Three.js、不加载任何模型或贴图，冰体、气泡、霜纹、
水波、星空全部程序化生成。

## 运行

静态文件，无构建步骤。任意静态服务器指向本目录即可：

```bash
npx serve ice-cliff        # 或 python3 -m http.server -d ice-cliff
```

打开 `http://localhost:3000/?seed=ice-7`（`seed` 可换成任意字符串，
同一 seed 生成逐字节相同的冰体；也可用页面里的种子输入框重新生成）。

## 交互

- 鼠标拖动：环绕观察；滚轮：缩放
- 滑杆：太阳高度（2°–60°，颜色随高度由橙转白）、雾浓度、剖切平面
  （缓慢切掉前半块冰体，露出内部深蓝冰层与气泡）
- 夜间模式：压暗环境光，保留并增强菲涅尔边缘高光与星空
- 录制 正午→黄昏：10 秒延时动画并用 MediaRecorder 导出 webm
- 截图：导出当前画面 PNG；面板实时显示 FPS 与相机方位/俯仰角

## 实现要点

- `js/rng.js`：mulberry32 + 整数格点哈希值噪声/fbm，全部确定性
- `js/geometry.js`：盒体六个面按世界坐标采样 fbm 位移（棱边连续不裂缝），
  三角形绕序按几何法线校正；气泡部分沿水平冻结层分布
- `js/shaders.js`：霜纹/层理/水线/水波/星空均为 GLSL 程序噪声；
  剖切用片元 `discard`（平面方程），冰体只测深度不写深度，
  按 背面→气泡→正面 顺序混合，剖切移动时无 z-fighting
- 绘制顺序：天空 → 水面（写深度）→ 冰内表面 → 气泡 → 冰外表面

## 测试

`test/verify.mjs` 用 Playwright（SwiftShader 软渲染 WebGL2）验证：
同一 seed 两次加载画面逐字节一致、不同 seed 不同、剖切推进画面持续变化、
剖切静止时两帧一致（无深度闪烁）、剖切后内部结构可见，并录制
正午→黄昏 webm。截图与录像写入输出目录（默认 `../../artifacts`）。

```bash
npm i playwright && npx playwright install chromium
node test/verify.mjs [输出目录]
```
