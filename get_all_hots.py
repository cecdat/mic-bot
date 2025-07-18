import requests
from bs4 import BeautifulSoup
import os

def fetch_weibo_hot():
    """
    从微博官方接口获取热搜数据。
    """
    print("正在从 微博官方接口 获取数据...")
    url = "https://weibo.com/ajax/side/hotSearch"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        realtime_data = data.get('data', {}).get('realtime', [])
        if not realtime_data:
            print("未能从微博接口返回的数据中找到 'realtime' 列表。")
            return []
        titles = [item.get('word') for item in realtime_data if item.get('word')]
        print(f"成功从 微博官方接口 获取 {len(titles)} 条热搜。")
        return titles
    except Exception as e:
        print(f"处理 微博官方接口 数据时发生错误: {e}")
        return []

def fetch_baidu_hot():
    """
    抓取并解析百度实时热搜榜的HTML页面。
    """
    print("正在从 百度实时热搜榜 获取数据...")
    url = "https://top.baidu.com/board?tab=realtime"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'}
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        response.encoding = 'utf-8'
        soup = BeautifulSoup(response.text, 'html.parser')
        hot_items = soup.find_all('div', class_='c-single-text-ellipsis')
        titles = [item.get_text(strip=True) for item in hot_items]
        print(f"成功从 百度实时热搜榜 获取 {len(titles)} 条热搜。")
        return titles
    except Exception as e:
        print(f"处理 百度实时热搜榜 数据时发生错误: {e}")
        return []

def main():
    """
    主函数，整合所有来源并写入文件。
    """
    # [核心修改] 将输出路径指向容器内的项目根目录
    OUTPUT_FILEPATH = '/usr/src/microsoft-rewards-script/src/search_terms.txt'
    
    all_hot_terms = []
    all_hot_terms.extend(fetch_weibo_hot())
    all_hot_terms.extend(fetch_baidu_hot())
    
    if not all_hot_terms:
        print("\n未能从任何来源获取到热搜词，程序退出。")
        return
        
    try:
        with open(OUTPUT_FILEPATH, 'w', encoding='utf-8') as f:
            for term in all_hot_terms:
                f.write(term + '\n')
        
        print(f"\n任务完成！总共 {len(all_hot_terms)} 条热搜词已覆盖写入到 {OUTPUT_FILEPATH}")
    except IOError as e:
        print(f"\n写入文件时发生错误: {e}")

if __name__ == "__main__":
    main()
