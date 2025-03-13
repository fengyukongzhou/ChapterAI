@echo off
chcp 65001 >nul
set "MSG_START=正在启动 ChapterAI 服务..."
set "MSG_CHECK_DEP=正在检查依赖..."
set "MSG_NO_PYTHON=错误: 未找到Python，请先安装Python 3.8+"
set "MSG_START_BACKEND=正在启动后端服务..."
set "MSG_START_FRONTEND=正在启动前端服务..."
set "MSG_OPEN_BROWSER=正在打开浏览器..."
set "MSG_STARTED=ChapterAI 服务已启动！"
set "MSG_PRESS_KEY=按任意键停止服务..."
set "MSG_STOPPED=服务已停止"

echo %MSG_START%

REM 检查Python是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo %MSG_NO_PYTHON%
    pause
    exit /b 1
)

REM 检查依赖是否安装
echo %MSG_CHECK_DEP%
pip install -r requirements.txt >nul 2>&1

REM 启动后端服务
echo %MSG_START_BACKEND%
start /b python api/main.py

REM 等待后端服务启动
timeout /t 2 /nobreak >nul

REM 启动前端服务
echo %MSG_START_FRONTEND%
start /b python -m http.server 8000

REM 等待前端服务启动
timeout /t 2 /nobreak >nul

REM 打开浏览器
echo %MSG_OPEN_BROWSER%
start http://localhost:8000

echo %MSG_STARTED%
echo %MSG_PRESS_KEY%
pause >nul

REM 结束进程
taskkill /f /im python.exe >nul 2>&1
echo %MSG_STOPPED% 