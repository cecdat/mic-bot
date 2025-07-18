import { Page } from 'rebrowser-playwright'
import { platform } from 'os'
import fs from 'fs' 
import path from 'path' 

import { Workers } from '../Workers'

import { Counters, DashboardData } from '../../interface/DashboardData'

export class Search extends Workers {
    private bingHome = 'https://bing.com'
    private searchPageURL = ''

    public async doSearch(page: Page, data: DashboardData) {
        this.bot.log(this.bot.isMobile, '搜索-必应', '开始必应搜索')

        page = await this.bot.browser.utils.getLatestTab(page)
        
        let searchCounters: Counters = data.userStatus.counters;
        let missingPoints = this.calculatePoints(searchCounters)

        if (missingPoints === 0) {
            this.bot.log(this.bot.isMobile, '搜索-必应', '必应搜索任务已完成')
            return
        }

        let allQueries = await this.getLocalSearchWords();
        const uniqueQueries = [...new Set(allQueries)];
        let searchQueries: string[];

        if (uniqueQueries.length > 55) {
            this.bot.log(this.bot.isMobile, '搜索-本地词库', `词库共 ${uniqueQueries.length} 个词，将随机抽取55个使用。`);
            const shuffledQueries = this.bot.utils.shuffleArray(uniqueQueries);
            searchQueries = shuffledQueries.slice(0, 55);
        } else {
            this.bot.log(this.bot.isMobile, '搜索-本地词库', `词库共 ${uniqueQueries.length} 个词，将全部使用。`);
            searchQueries = uniqueQueries;
        }
        
        if (searchQueries.length === 0) {
            this.bot.log(this.bot.isMobile, '搜索-必应', '本地搜索词文件为空或读取失败，将使用默认词条', 'warn');
            searchQueries = ['天气', '新闻', '电影', '音乐', '游戏', '购物', '旅游', '美食', '体育', '科技', '财经', '汽车', '房产', '教育', '健康'];
        }

        await page.goto(this.searchPageURL ? this.searchPageURL : this.bingHome)
        await this.bot.utils.wait(2000)
        await this.bot.browser.utils.tryDismissAllMessages(page)

        let maxLoop = 0

        for (let i = 0; i < searchQueries.length; i++) {
            const query = searchQueries[i] as string
            this.bot.log(this.bot.isMobile, '搜索-必应', `剩余 ${missingPoints} 积分 | 查询: ${query}`)
            searchCounters = await this.bingSearch(page, query)
            const newMissingPoints = this.calculatePoints(searchCounters)
            if (newMissingPoints == missingPoints) {
                maxLoop++
            } else {
                maxLoop = 0
            }
            missingPoints = newMissingPoints
            if (missingPoints === 0) break;
            if (maxLoop > 5 && this.bot.isMobile) {
                this.bot.log(this.bot.isMobile, '搜索-必应', '搜索5次未获得积分，可能User-Agent有问题', 'warn')
                break
            }
            if (maxLoop > 10) {
                this.bot.log(this.bot.isMobile, '搜索-必应', '搜索10次未获得积分，中止搜索任务', 'warn')
                maxLoop = 0 
                break
            }
        }

        if (missingPoints > 0 && this.bot.isMobile) {
            return
        }
        
        if (missingPoints > 0) {
            this.bot.log(this.bot.isMobile, '搜索-必应', `搜索完成，但仍缺少 ${missingPoints} 积分，将进行额外补充搜索`)
            let extraQueries = this.bot.utils.shuffleArray(searchQueries);
            for (const term of extraQueries) {
                this.bot.log(this.bot.isMobile, '搜索-必应-额外', `${missingPoints} 积分剩余 | 查询: ${term}`)
                searchCounters = await this.bingSearch(page, term);
                const newMissingPoints = this.calculatePoints(searchCounters);
                if (newMissingPoints === missingPoints) {
                    maxLoop++;
                } else {
                    maxLoop = 0;
                }
                missingPoints = newMissingPoints;
                if (missingPoints === 0) break;
                if (maxLoop > 5) {
                    this.bot.log(this.bot.isMobile, '搜索-必应-额外', '额外搜索5次未获得积分，中止搜索', 'warn');
                    return;
                }
            }
        }
        this.bot.log(this.bot.isMobile, '搜索-必应', '完成搜索任务')
    }

    private async bingSearch(searchPage: Page, query: string): Promise<Counters> {
        const platformControlKey = platform() === 'darwin' ? 'Meta' : 'Control'

        for (let i = 0; i < 5; i++) {
            try {
                searchPage = await this.bot.browser.utils.getLatestTab(searchPage)
                await searchPage.evaluate(() => { window.scrollTo(0, 0) })
                await this.bot.utils.wait(500)
                const searchBar = '#sb_form_q'
                await searchPage.waitForSelector(searchBar, { state: 'visible', timeout: 10000 })
                await searchPage.click(searchBar)
                await this.bot.utils.wait(500)
                await searchPage.keyboard.down(platformControlKey)
                await searchPage.keyboard.press('A')
                await searchPage.keyboard.press('Backspace')
                await searchPage.keyboard.up(platformControlKey)
                await searchPage.keyboard.type(query)
                await searchPage.keyboard.press('Enter')
                await this.bot.utils.wait(3000)

                const resultPage = await this.bot.browser.utils.getLatestTab(searchPage)
                this.searchPageURL = new URL(resultPage.url()).href
                await this.bot.browser.utils.reloadBadPage(resultPage)

                if (this.bot.config.searchSettings.scrollRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.randomScroll(resultPage)
                }
                if (this.bot.config.searchSettings.clickRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.clickRandomLink(resultPage)
                }

                await this.bot.utils.wait(Math.floor(this.bot.utils.randomNumber(this.bot.utils.stringToMs(this.bot.config.searchSettings.searchDelay.min), this.bot.utils.stringToMs(this.bot.config.searchSettings.searchDelay.max))))
                
                const latestData = await this.bot.browser.func.getDashboardData(searchPage);
                return latestData.userStatus.counters;

            } catch (error) {
                if (i === 5) {
                    this.bot.log(this.bot.isMobile, '搜索-必应', `重试5次后失败... 发生错误: ${error}`, 'error')
                    break
                }
                this.bot.log(this.bot.isMobile, '搜索-必应', `搜索失败，发生错误: ${error}`, 'error')
                const lastTab = await this.bot.browser.utils.getLatestTab(searchPage)
                await this.closeTabs(lastTab)
                await this.bot.utils.wait(4000)
            }
        }

        this.bot.log(this.bot.isMobile, '搜索-必应', '重试5次后搜索失败，结束', 'error')
        const latestData = await this.bot.browser.func.getDashboardData(searchPage);
        return latestData.userStatus.counters;
    }

    private async getLocalSearchWords(): Promise<string[]> {
        const filePath = path.join(__dirname, '..', '..', 'search_terms.txt');
        this.bot.log(this.bot.isMobile, '搜索-本地词库', `正在从 ${filePath} 读取搜索词...`);
        try {
            if (!fs.existsSync(filePath)) {
                this.bot.log(this.bot.isMobile, '搜索-本地词库', 'search_terms.txt 文件不存在', 'warn');
                return [];
            }
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const terms = fileContent.split('\n').map(term => term.trim()).filter(term => term.length > 0);
            this.bot.log(this.bot.isMobile, '搜索-本地词库', `成功读取 ${terms.length} 个搜索词`);
            return terms;
        } catch (error) {
            this.bot.log(this.bot.isMobile, '搜索-本地词库', `读取本地搜索词文件时发生错误: ${error}`, 'error');
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
            this.bot.log(this.bot.isMobile, '搜索-随机滚动', `发生错误: ${error}`, 'error')
        }
    }

    private async clickRandomLink(page: Page) {
        try {
            await page.click('#b_results .b_algo h2', { timeout: 2000 }).catch(() => { })
            await this.closeContinuePopup(page)
            await this.bot.utils.wait(10000)
            let lastTab = await this.bot.browser.utils.getLatestTab(page)
            let lastTabURL = new URL(lastTab.url())
            let i = 0
            while (lastTabURL.href !== this.searchPageURL && i < 5) {
                await this.closeTabs(lastTab)
                lastTab = await this.bot.browser.utils.getLatestTab(page)
                lastTabURL = new URL(lastTab.url())
                i++
            }
        } catch (error) {
            this.bot.log(this.bot.isMobile, '搜索-随机点击', `发生错误: ${error}`, 'error')
        }
    }

    private async closeTabs(lastTab: Page) {
        const browser = lastTab.context()
        const tabs = browser.pages()
        try {
            if (tabs.length > 2) {
                await lastTab.close()
                this.bot.log(this.bot.isMobile, '搜索-关闭标签页', `打开了超过2个标签页，已关闭最后一个: "${new URL(lastTab.url()).host}"`)
            } else if (tabs.length === 1) {
                const newPage = await browser.newPage()
                await this.bot.utils.wait(1000)
                await newPage.goto(this.bingHome)
                await this.bot.utils.wait(3000)
                this.searchPageURL = newPage.url()
                this.bot.log(this.bot.isMobile, '搜索-关闭标签页', '只打开了1个标签页，已创建一个新的')
            } else {
                lastTab = await this.bot.browser.utils.getLatestTab(lastTab)
                await lastTab.goto(this.searchPageURL ? this.searchPageURL : this.bingHome)
            }
        } catch (error) {
            this.bot.log(this.bot.isMobile, '搜索-关闭标签页', `发生错误: ${error}`, 'error')
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

    private async closeContinuePopup(page: Page) {
        try {
            await page.waitForSelector('#sacs_close', { timeout: 1000 })
            const continueButton = await page.$('#sacs_close')
            if (continueButton) {
                await continueButton.click()
            }
        } catch (error) {}
    }
}
