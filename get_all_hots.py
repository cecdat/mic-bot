import requests
from bs4 import BeautifulSoup
import os
import json
from datetime import datetime
import time

# --- 全局变量与函数 ---
CONFIG_FILE_PATH = '/usr/src/microsoft-rewards-script/dist/config.json'
ACCOUNTS_FILE_PATH = '/usr/src/microsoft-rewards-script/dist/accounts.json'
SEARCH_TERMS_DIR = '/usr/src/microsoft-rewards-script/dist/search_terms'

def log_with_time(message):
    """一个简单的日志函数，可以在每条消息前添加时间戳。"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {message}")

# --- API热搜获取模块 ---
def fetch_from_api(base_url, endpoint):
    if not base_url or not endpoint:
        return None
    
    api_url = f"{base_url.rstrip('/')}/{endpoint}"
    log_with_time(f"正在从自定义API [{api_url}] 获取热搜词...")
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    try:
        response = requests.get(api_url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data.get('code') == 200 and 'data' in data:
            titles = [item.get('title') for item in data['data'] if item.get('title')]
            log_with_time(f"成功从API [{endpoint}] 获取 {len(titles)} 条热搜。")
            return titles
        else:
            log_with_time(f"API [{endpoint}] 返回的数据格式不正确: {data.get('message', '无错误信息')}")
            return None
    except Exception as e:
        log_with_time(f"从API [{endpoint}] 获取数据时发生错误: {e}")
        return None

# --- [核心修改] 传统热搜抓取模块 (只保留百度作为备用) ---
def fetch_fallback_hots():
    log_with_time("执行备用方案：抓取百度热搜...")
    fallback_terms = []
    fallback_terms.extend(fetch_baidu_hot())
    return list(set(fallback_terms)) # 去重

# [核心修改] 移除了 fetch_weibo_hot() 函数

def fetch_baidu_hot():
    log_with_time("正在从 百度实时热搜榜 获取数据...")
    url = "https://top.baidu.com/board?tab=realtime"
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        response.encoding = 'utf-8'
        soup = BeautifulSoup(response.text, 'html.parser')
        items = soup.find_all('div', class_='c-single-text-ellipsis')
        titles = [item.get_text(strip=True) for item in items]
        log_with_time(f"成功从 百度实时热搜榜 获取 {len(titles)} 条热搜。")
        return titles
    except Exception as e:
        log_with_time(f"处理 百度实时热搜榜 数据时发生错误: {e}")
        return []

# --- 主逻辑 ---
def write_terms_to_file(filepath, terms):
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            for term in terms:
                f.write(term + '\n')
        log_with_time(f"已将 {len(terms)} 条搜索词写入 {os.path.basename(filepath)}")
    except IOError as e:
        log_with_time(f"写入文件 {os.path.basename(filepath)} 时发生错误: {e}")

def main():
    os.makedirs(SEARCH_TERMS_DIR, exist_ok=True)
    
    try:
        with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
            config = json.load(f)
        with open(ACCOUNTS_FILE_PATH, 'r', encoding='utf-8') as f:
            accounts = json.load(f)
    except Exception as e:
        log_with_time(f"读取配置文件失败: {e}")
        return
        
    api_config = config.get('hotSearchApi', {})
    api_enabled = api_config.get('enabled', False)
    api_base_url = api_config.get('baseUrl')

    fallback_terms = fetch_fallback_hots()
    if fallback_terms:
        write_terms_to_file(os.path.join(SEARCH_TERMS_DIR, 'default.txt'), fallback_terms)
    else:
        log_with_time("警告：备用热搜词也未能获取，搜索任务可能无词可用。")

    for account in accounts:
        email = account.get('email')
        # [核心修改] 读取 hotSearchEndpoints 数组
        endpoints = account.get('hotSearchEndpoints')
        
        if not email:
            continue

        user_file_path = os.path.join(SEARCH_TERMS_DIR, f"{email}.txt")
        
        if api_enabled and endpoints and isinstance(endpoints, list):
            all_custom_terms = []
            # [核心修改] 遍历所有端点，获取数据并合并
            for endpoint in endpoints:
                custom_terms = fetch_from_api(api_base_url, endpoint)
                if custom_terms:
                    all_custom_terms.extend(custom_terms)
                time.sleep(1) # 增加延迟，避免请求过快
            
            if all_custom_terms:
                unique_terms = list(set(all_custom_terms))
                write_terms_to_file(user_file_path, unique_terms)
            else:
                log_with_time(f"账户 {email} 的所有API端点均获取失败，将使用通用热搜词作为备用。")
                if fallback_terms:
                    write_terms_to_file(user_file_path, fallback_terms)
        else:
            if os.path.exists(user_file_path):
                os.remove(user_file_path)

if __name__ == "__main__":
    main()
