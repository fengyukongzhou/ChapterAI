# ChapterAI - epub章节分析助手

[English Version](README_EN.md)

ChapterAI 是一个epub文件分章节分析工具，它能够帮助用户快速理解和提炼文章的核心内容。通过先进的AI技术，ChapterAI可以自动分析文章结构，提取关键观点，并生成清晰的可视化图表。

![image](screenshot.png)

[效果预览](https://fengyukongzhou.github.io/2025/03/13/the-burnout-society/)

## 项目引用

特别感谢以下开源项目：
- [ePubViewer](https://github.com/pgaskin/ePubViewer) - 提供了优秀的前端界面基础
- [3mintop](https://3min.top/) - 为页面布局提供了灵感
- [hikari0511/chapterAI](https://github.com/hikari0511/chapterAI) - 本项目基于此项目进行改进和重构

## 功能特点

- 🚀 快速分析：快速完成文章内容分析
- 📊 可视化展示：自动生成思维导图和流程图
- 🎯 核心观点提取：准确识别文章重点
- 💡 智能总结：生成结构化的内容概述
- 📋 一键复制：支持AI总结的markdown文本快速复制
- 🔄 OpenAI格式API支持：兼容OpenAI接口格式的API服务

## 系统要求

- Windows 10 或更高版本
- Python 3.8 或更高版本
- 浏览器（推荐使用 Chrome 或 Edge）

## 安装说明

1. 克隆或下载本仓库：
   ```bash
   git clone https://github.com/fengyukongzhou/ChapterAI.git
   cd chapterAI
   ```

2. 安装依赖：
   ```bash
   pip install -r requirements.txt
   ```

3. 编辑配置：新建 `.env` 文件并使用文本编辑器打开，复制 `.env.example` 并配置你的API信息

## 使用方法

1. 双击运行 `start.bat`
2. 等待服务启动，浏览器会自动打开到 http://localhost:8000
3. 打开本地的epub文件
4. 点击"AI总结"按钮
5. 等待分析完成，查看结果

## 配置说明

在`api/.env`文件中，您可以配置以下选项：

```ini
# API 通用配置
API_BASE_URL=your_api_base_url_here    # API服务的基础URL
API_KEY=your_api_key_here              # 您的API密钥
MODEL_NAME=your_model_name_here        # 使用的模型名称

# API 通用设置
MAX_TOKENS=4096                        # 最大令牌数
TEMPERATURE=0.7                        # 生成文本的随机性

# 服务器设置
PORT=8000                             # 服务器端口
HOST=0.0.0.0                          # 服务器主机地址

# 开发设置
DEBUG=True                            # 调试模式
```

请注意：
- `.env` 文件包含敏感信息，不会被提交到Git仓库
- 首次设置时需要从 `.env.example` 创建您自己的 `.env` 文件
- 请妥善保管您的API密钥，不要分享给他人

## 项目结构

```
chapterAI/
├── api/                 # 后端代码
│   ├── main.py         # 主服务器代码
│   ├── config.py       # 配置管理
│   └── .env           # 环境变量
├── frontend/           # 前端静态文件
│   ├── index.html     # 主页面
│   ├── script.js      # 前端逻辑
│   └── style.css      # 样式表
├── start.bat          # 启动脚本
└── requirements.txt   # 项目依赖
```

## 常见问题

1. **Q: 启动时报端口占用错误？**  
   A: 确保8000和8001端口未被其他程序占用。可以在命令提示符中运行：
   ```bash
   netstat -ano | findstr :8000
   netstat -ano | findstr :8001
   ```
   然后使用任务管理器结束占用端口的进程。

2. **Q: 如何查看服务日志？**  
   A: 服务启动时会在命令提示符窗口显示日志信息。

3. **Q: Python未安装或版本不正确？**  
   A: 从[Python官网](https://www.python.org/downloads/)下载并安装Python 3.8或更高版本。安装时请勾选"Add Python to PATH"选项。


## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件