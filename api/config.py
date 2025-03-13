import os
from dotenv import load_dotenv

# 加载.env文件
load_dotenv()

# API 配置
API_BASE_URL = os.getenv('API_BASE_URL')  # API服务器地址
API_KEY = os.getenv('API_KEY')            # API密钥
MODEL_NAME = os.getenv('MODEL_NAME')      # 模型名称

# API 通用设置
MAX_TOKENS = int(os.getenv('MAX_TOKENS', 4000))
TEMPERATURE = float(os.getenv('TEMPERATURE', 0.7))

# CORS配置
ALLOWED_ORIGINS = [
    "http://localhost:8080",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
] 