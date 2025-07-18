import requests
from bs4 import BeautifulSoup

def fetch_json_api(api_url, source_name):
    """
    从指定的JSON API获取热搜列表。

    Args:
        api_url (str): API的URL地址。
        source_name (str): 数据来源的名称，用于打印日志。

    Returns:
        list: 包含热搜词标题的列表，失败则返回空列表。
    """
    print(f"正在从 {source_name} 获取数据...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    }
    try:
        response = requests.get(api_url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # 提取 'data' 列表中的 'title'
        titles = [item.get('title') for item in data.get('data', []) if item.get('title')]
        print(f"成功从 {source_name} 获取 {len(titles)} 条热搜。")
        return titles
    except requests.exceptions.RequestException as e:
        print(f"从 {source_name} 获取数据失败: {e}")
        return []
    except Exception as e:
        print(f"处理 {source_name} 数据时发生错误: {e}")
        return []

def fetch_baidu_hot():
    """
    抓取并解析百度实时热搜榜的HTML页面。

    Returns:
        list: 包含热搜词的列表，失败则返回空列表。
    """
    print("正在从 百度实时热搜榜 获取数据...")
    url = "https://top.baidu.com/board?tab=realtime"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    }
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        response.encoding = 'utf-8'
        soup = BeautifulSoup(response.text, 'html.parser')
        
        hot_items = soup.find_all('div', class_='c-single-text-ellipsis')
        titles = [item.get_text(strip=True) for item in hot_items]
        print(f"成功从 百度实时热搜榜 获取 {len(titles)} 条热搜。")
        return titles
    except requests.exceptions.RequestException as e:
        print(f"从 百度实时热搜榜 获取数据失败: {e}")
        return []
    except Exception as e:
        print(f"处理 百度实时热搜榜 数据时发生错误: {e}")
        return []

def main():
    """
    主函数，整合所有来源并写入文件。
    """
    # 定义所有API来源
    api_sources = {
        '微博热搜': 'https://api.vvhan.com/api/hotlist/wbHot',
        '今日头条': 'https://api.vvhan.com/api/hotlist/toutiao'
    }
    
    all_hot_terms = []

    # 依次从各API获取数据
    for name, url in api_sources.items():
        terms = fetch_json_api(url, name)
        all_hot_terms.extend(terms)

    # 获取百度热搜数据
    baidu_terms = fetch_baidu_hot()
    all_hot_terms.extend(baidu_terms)
    
    # 检查是否获取到了任何数据
    if not all_hot_terms:
        print("\n未能从任何来源获取到热搜词，程序退出。")
        return
        
    # 将所有热搜词写入文件（覆盖模式）
    output_filename = 'search_terms.txt'
    try:
        with open(output_filename, 'w', encoding='utf-8') as f:
            for term in all_hot_terms:
                f.write(term + '\n')
        
        print(f"\n任务完成！总共 {len(all_hot_terms)} 条热搜词已覆盖写入到 {output_filename}")
    except IOError as e:
        print(f"\n写入文件时发生错误: {e}")


if __name__ == "__main__":
    main()
