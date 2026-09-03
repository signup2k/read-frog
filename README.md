# Read Frog (Personal Edition)

基于 [read-frog](https://github.com/mengxi-ream/read-frog) 精简的个人自用 Chrome 扩展。

## 功能

- **整页翻译**：双语对照 / 仅译文两种模式，支持悬浮按钮、快捷键、右键菜单、自动翻译规则
- **视频字幕翻译**：YouTube 等平台的实时字幕翻译，支持 AI 分段
- **翻译渠道**：OpenAI 兼容接口（自定义 baseURL / API Key / 模型）、DeepL、DeepLX、Google 翻译、微软翻译

已移除原版的划词翻译、输入框翻译、TTS、侧边栏、统计遥测、云同步等功能。

## 开发

```bash
pnpm install
pnpm dev        # 开发模式
pnpm build      # 构建 chrome-mv3
pnpm zip        # 打包
```

## 配置

安装后打开扩展设置页，在「API 提供商」中配置 OpenAI 兼容接口的 baseURL、API Key 与模型即可。
