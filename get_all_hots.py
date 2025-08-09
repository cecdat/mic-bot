import requests
from bs4 import BeautifulSoup
import os
import json
from datetime import datetime
import time
import argparse

# [核心修正] 移除所有硬编码的路径
# SEARCH_TERMS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'search_terms')

def log_with_time(message):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {message}")

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

def fetch_fallback_hots():
    log_with_time("执行备用方案：抓取百度热搜...")
    fallback_terms = []
    fallback_terms.extend(fetch_baidu_hot())
    return list(set(fallback_terms))

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

def write_terms_to_file(filepath, terms):
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            for term in terms:
                f.write(term + '\n')
        log_with_time(f"已将 {len(terms)} 条搜索词写入 {os.path.basename(filepath)}")
    except IOError as e:
        log_with_time(f"写入文件 {os.path.basename(filepath)} 时发生错误: {e}")

def main():
    # [核心修正] 使用 argparse 来接收文件路径
    parser = argparse.ArgumentParser(description='Fetch hot search terms.')
    parser.add_argument('--config_path', required=True, help='Path to the config.json file.')
    parser.add_argument('--accounts_path', required=True, help='Path to the accounts file.')
    parser.add_argument('--output_dir', required=True, help='Directory to save the search term files.')
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    
    try:
        with open(args.config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        with open(args.accounts_path, 'r', encoding='utf-8') as f:
            accounts = json.load(f)
    except Exception as e:
        log_with_time(f"读取配置文件失败: {e}")
        return
        
    api_config = config.get('hotSearchApi', {})
    api_enabled = api_config.get('enabled', False)
    api_base_url = api_config.get('baseUrl')

    fallback_terms = fetch_fallback_hots()
    if fallback_terms:
        write_terms_to_file(os.path.join(args.output_dir, 'default.txt'), fallback_terms)
    else:
        log_with_time("警告：备用热搜词也未能获取，搜索任务可能无词可用。")

    for account in accounts:
        email = account.get('email')
        endpoints = account.get('hotSearchEndpoints')
        
        if not email:
            continue

        user_file_path = os.path.join(args.output_dir, f"{email}.txt")
        
        if api_enabled and endpoints and isinstance(endpoints, list):
            all_custom_terms = []
            for endpoint in endpoints:
                custom_terms = fetch_from_api(api_base_url, endpoint)
                if custom_terms:
                    all_custom_terms.extend(custom_terms)
                time.sleep(1)
            
            if all_custom_terms:
                unique_terms = list(set(all_custom_terms))
                write_terms_to_file(user_file_path, unique_terms)
            else:
                log_with_time(f"账户 {email} 的所有API端点均获取失败，将使用通用热搜词作为备用。")
                if fallback_terms:
                    write_terms_to_file(user_file_path, fallback_terms)
        else:
            # 如果没有配置API或端点，确保没有旧的专属文件残留
            if os.path.exists(user_file_path):
                os.remove(user_file_path)

if __name__ == "__main__":
    main()