import { Page } from 'rebrowser-playwright'
import fs from 'fs' 
import path from 'path' 

import { Workers } from '../Workers'
import { Counters, DashboardData } from '../../interface/DashboardData'

export class Search extends Workers {
    private bingHome = 'https://bing.com'

    // [修改] doSearch 方法现在需要接收 email
    public async doSearch(page: Page, data: DashboardData, email: string) {
        this.bot.log(this.bot.isMobile, '搜索-必应', '开始必应搜索')

        let searchCounters: Counters = data.userStatus.counters;
        let missingPoints = this.calculatePoints(searchCounters)

        if (missingPoints === 0) {
            this.bot.log(this.bot.isMobile, '搜索-必应', '必应搜索任务已完成')
            return
        }

        // [核心修改] 传入email，让脚本能找到专属的搜索词文件
        let allQueries = await this.getLocalSearchWords(email);
        const uniqueQueries = [...new Set(allQueries)];
        let searchQueries: string[];

        if (uniqueQueries.length > 0) {
            const requiredSearches = Math.ceil(missingPoints / 3) + 2;
            this.bot.log(this.bot.isMobile, '搜索-本地词库', `剩余 ${missingPoints} 积分，将从 ${uniqueQueries.length} 个词中随机抽取 ${requiredSearches} 个进行搜索。`);
            const shuffledQueries = this.bot.utils.shuffleArray(uniqueQueries);
            searchQueries = shuffledQueries.slice(0, requiredSearches);
        } else {
            this.bot.log(this.bot.isMobile, '搜索-必应', '本地搜索词文件为空或读取失败，将使用默认词条', 'warn');
            searchQueries = ['天气', '新闻', '电影', '音乐', '游戏', '购物', '旅游', '美食', '体育', '科技', '财经', '汽车', '房产', '教育', '健康'];
        }
        
        let maxLoop = 0;
        let currentQueries = [...searchQueries];

        while (missingPoints > 0 && currentQueries.length > 0 && maxLoop <= 10) {
            const query = currentQueries.shift()!;
            this.bot.log(this.bot.isMobile, '搜索-必应', `剩余 ${missingPoints} 积分 | 查询: ${query}`);

            const newCounters = await this.bingSearch(page, query);
            const newMissingPoints = this.calculatePoints(newCounters);

            if (newMissingPoints === missingPoints) {
                maxLoop++;
                this.bot.log(this.bot.isMobile, '搜索-必应', `本次搜索未获得积分，连续失败次数: ${maxLoop}/10`, 'warn');
            } else {
                maxLoop = 0;
            }

            missingPoints = newMissingPoints;
            searchCounters = newCounters;
        }

        if (missingPoints > 0) {
            this.bot.log(this.bot.isMobile, '搜索-必应', `搜索任务结束，但仍有 ${missingPoints} 积分未获取。可能是因为连续失败次数过多或搜索词已用尽。`, 'warn');
        }

        this.bot.log(this.bot.isMobile, '搜索-必应', '完成搜索任务');
    }

    private async bingSearch(page: Page, query: string): Promise<Counters> {
        try {
            await page.goto(this.bingHome, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await this.bot.browser.utils.tryDismissAllMessages(page);

            const searchBarSelector = '#sb_form_q';
            await page.waitForSelector(searchBarSelector, { state: 'visible', timeout: 15000 });
            await page.fill(searchBarSelector, query);
            await page.press(searchBarSelector, 'Enter');

            const navigationTimeoutMs = this.bot.utils.stringToMs(this.bot.config.navigationTimeout);
            await page.waitForSelector('#b_results', { timeout: navigationTimeoutMs });
            
            const resultPage = await this.bot.browser.utils.getLatestTab(page);

            if (this.bot.config.searchSettings.scrollRandomResults) {
                await this.bot.utils.wait(1000);
                await this.randomScroll(resultPage);
            }
            if (this.bot.config.searchSettings.clickRandomResults) {
                await this.bot.utils.wait(1000);
                await this.clickRandomLink(resultPage);
            }

            const delay = Math.floor(this.bot.utils.randomNumber(
                this.bot.utils.stringToMs(this.bot.config.searchSettings.searchDelay.min),
                this.bot.utils.stringToMs(this.bot.config.searchSettings.searchDelay.max)
            ));
            await this.bot.utils.wait(delay);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.bot.log(this.bot.isMobile, '搜索-必应', `单次搜索失败: ${errorMessage}`, 'error');
        }

        const latestData = await this.bot.browser.func.getDashboardData(page);
        return latestData.userStatus.counters;
    }

    // [核心修改] getLocalSearchWords 现在能智能加载专属或默认的词库
    private async getLocalSearchWords(email: string): Promise<string[]> {
        // Python脚本现在会把所有搜索词文件输出到 dist/search_terms/ 目录下
        const baseDir = path.join(__dirname, '..', '..', 'search_terms');
        const userFilePath = path.join(baseDir, `${email}.txt`);
        const defaultFilePath = path.join(baseDir, 'default.txt');
        
        let filePathToUse: string;

        if (fs.existsSync(userFilePath)) {
            // 如果存在专属文件，就用它
            this.bot.log(this.bot.isMobile, '搜索-本地词库', `发现账户 ${email} 的专属搜索词文件，正在加载...`);
            filePathToUse = userFilePath;
        } else {
            // 否则，使用通用文件
            this.bot.log(this.bot.isMobile, '搜索-本地词库', `未找到账户 ${email} 的专属搜索词文件，将使用通用热搜词。`);
            filePathToUse = defaultFilePath;
        }

        try {
            if (!fs.existsSync(filePathToUse)) {
                this.bot.log(this.bot.isMobile, '搜索-本地词库', `搜索词文件 ${path.basename(filePathToUse)} 不存在`, 'warn');
                return [];
            }
            const fileContent = fs.readFileSync(filePathToUse, 'utf-8');
            return fileContent.split('\n').map(term => term.trim()).filter(term => term.length > 0);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.bot.log(this.bot.isMobile, '搜索-本地词库', `读取搜索词文件时发生错误: ${errorMessage}`, 'error');
            return [];
        }
    }

    private async randomScroll(page: Page) {
        try {
            const viewportHeight = await page.evaluate(() => window.innerHeight)
            const totalHeight = await page.evaluate(() => document.body.scrollHeight)
            const randomScrollPosition = Math.floor(Math.random() * (totalHeight - viewportHeight))
            await page.evaluate((scrollPos) => {
                window.scrollTo(0, scrollPos)
            }, randomScrollPosition)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.bot.log(this.bot.isMobile, '搜索-随机滚动', `发生错误: ${errorMessage}`, 'error')
        }
    }

    private async clickRandomLink(page: Page) {
        try {
            const resultsContainer = page.locator('#b_results');
            const links = resultsContainer.getByRole('link');
            const count = await links.count();
            if (count > 0) {
                const clickMaxIndex = Math.min(count, 5);
                const randomIndex = Math.floor(Math.random() * clickMaxIndex);
                await links.nth(randomIndex).click({ timeout: 5000 }).catch(() => {});
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.bot.log(this.bot.isMobile, '搜索-随机点击', `发生错误: ${errorMessage}`, 'error')
        }
    }

    private calculatePoints(counters: Counters) {
        const mobileData = counters.mobileSearch?.[0]
        const genericData = counters.pcSearch?.[0]
        const edgeData = counters.pcSearch?.[1]
        const missingPoints = (this.bot.isMobile && mobileData)
            ? mobileData.pointProgressMax - mobileData.pointProgress
            : (edgeData ? edgeData.pointProgressMax - edgeData.pointProgress : 0)
            + (genericData ? genericData.pointProgressMax - genericData.pointProgress : 0)
        return missingPoints
    }
}
