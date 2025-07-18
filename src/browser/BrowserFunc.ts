import { BrowserContext, Page } from 'rebrowser-playwright'
import { CheerioAPI, load } from 'cheerio'
import { AxiosRequestConfig } from 'axios'

import { MicrosoftRewardsBot } from '../index'
import { saveSessionData } from '../util/Load'

import { DashboardData, MorePromotion, PromotionalItem } from './../interface/DashboardData'
import { QuizData } from './../interface/QuizData'
import { AppUserData } from '../interface/AppUserData'
import { EarnablePoints } from '../interface/Points'

export default class BrowserFunc {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }
    
    private async gotoWithRetry(page: Page, url: string, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const navigationTimeoutMs = this.bot.utils.stringToMs(this.bot.config.navigationTimeout);
                await page.goto(url, { timeout: navigationTimeoutMs, waitUntil: 'domcontentloaded' });
                return; 
            } catch (error) {
                this.bot.log(this.bot.isMobile, '页面导航', `导航到 ${url} 失败，尝试次数 ${i + 1}/${retries}。错误: ${error}`, 'warn');
                if (i === retries - 1) {
                    throw error;
                }
                await this.bot.utils.wait(3000);
            }
        }
    }

    async goHome(page: Page) {
        try {
            const dashboardURL = new URL(this.bot.config.baseURL)
            if (page.url() === dashboardURL.href) return;
            await this.gotoWithRetry(page, this.bot.config.baseURL);
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, '访问主页', `发生错误: ${error}`, 'error');
        }
    }

    async getDashboardData(page: Page): Promise<DashboardData> {
        try {
            this.bot.log(this.bot.isMobile, '仪表板数据', '正在获取最新的仪表板数据...');
            await this.gotoWithRetry(page, this.bot.config.baseURL);

            const scriptContent = await page.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script'));
                const targetScript = scripts.find(script => script.innerText.includes('var dashboard'));
                return targetScript?.innerText || null;
            });
            if (!scriptContent) throw new Error('在脚本中未找到仪表板数据');

            const dashboardData = await page.evaluate(scriptContent => {
                const regex = /var dashboard = (\{.*?\});/s;
                const match = regex.exec(scriptContent);
                return match?.[1] ? JSON.parse(match[1]) : null;
            }, scriptContent);

            if (!dashboardData) throw new Error('无法解析仪表板脚本');
            
            this.bot.log(this.bot.isMobile, '仪表板数据', '成功获取仪表板数据。');
            return dashboardData;
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, '获取仪表板数据', `获取仪表板数据时出错: ${error}`, 'error');
        }
    }

    getBrowserEarnablePoints(data: DashboardData): EarnablePoints {
        let desktopSearchPoints = 0, mobileSearchPoints = 0, dailySetPoints = 0, morePromotionsPoints = 0;
        if (data.userStatus.counters.pcSearch?.length) data.userStatus.counters.pcSearch.forEach(x => desktopSearchPoints += (x.pointProgressMax - x.pointProgress));
        if (data.userStatus.counters.mobileSearch?.length) data.userStatus.counters.mobileSearch.forEach(x => mobileSearchPoints += (x.pointProgressMax - x.pointProgress));
        data.dailySetPromotions[this.bot.utils.getFormattedDate()]?.forEach(x => dailySetPoints += (x.pointProgressMax - x.pointProgress));
        if (data.morePromotions?.length) data.morePromotions.forEach(x => {
            if (['quiz', 'urlreward'].includes(x.promotionType) && x.exclusiveLockedFeatureStatus !== 'locked') morePromotionsPoints += (x.pointProgressMax - x.pointProgress);
        });
        const totalEarnablePoints = desktopSearchPoints + mobileSearchPoints + dailySetPoints + morePromotionsPoints;
        return { dailySetPoints, morePromotionsPoints, desktopSearchPoints, mobileSearchPoints, totalEarnablePoints };
    }

    async getAppEarnablePoints(data: DashboardData, accessToken: string) {
        try {
            const points = { readToEarn: 0, checkIn: 0, totalEarnablePoints: 0 };
            const eligibleOffers = ['ENUS_readarticle3_30points', 'Gamification_Sapphire_DailyCheckIn'];
            let geoLocale = data.userProfile.attributes.country;
            geoLocale = (this.bot.config.searchSettings.useGeoLocaleQueries && geoLocale.length === 2) ? geoLocale.toLowerCase() : 'us';
            const userDataRequest: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613',
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Rewards-Country': geoLocale, 'X-Rewards-Language': 'en' }
            };
            const userDataResponse: AppUserData = (await this.bot.axios.request(userDataRequest)).data;
            const userData = userDataResponse.response;
            const eligibleActivities = userData.promotions.filter((x) => eligibleOffers.includes(x.attributes.offerid ?? ''));
            for (const item of eligibleActivities) {
                if (item.attributes.type === 'msnreadearn') {
                    points.readToEarn = parseInt(item.attributes.pointmax ?? '0') - parseInt(item.attributes.pointprogress ?? '0');
                } else if (item.attributes.type === 'checkin') {
                    const checkInDay = parseInt(item.attributes.progress ?? '0') % 7;
                    if (checkInDay < 6 && (new Date()).getDate() != (new Date(item.attributes.last_updated ?? '')).getDate()) {
                        points.checkIn = parseInt(item.attributes['day_' + (checkInDay + 1) + '_points'] ?? '0');
                    }
                }
            }
            points.totalEarnablePoints = points.readToEarn + points.checkIn;
            return points;
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, '获取APP可赚取点数', `发生错误: ${error}`, 'error');
        }
    }
    
    async getQuizData(page: Page): Promise<QuizData> {
        try {
            const html = await page.content()
            const $ = load(html)
            const scriptContent = $('script').filter((_, element) => $(element).text().includes('_w.rewardsQuizRenderInfo')).text()
            if (scriptContent) {
                const match = /_w\.rewardsQuizRenderInfo\s*=\s*({.*?});/s.exec(scriptContent);
                if (match?.[1]) return JSON.parse(match[1]);
            }
            throw new Error('未找到或无法解析测验数据');
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, '获取测验数据', `发生错误: ${error}`, 'error');
        }
    }

    async waitForQuizRefresh(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('span.rqMCredits', { state: 'visible', timeout: 10000 })
            await this.bot.utils.wait(2000)
            return true
        } catch (error) {
            this.bot.log(this.bot.isMobile, '测验刷新', `发生错误: ${error}`, 'error')
            return false
        }
    }

    async checkQuizCompleted(page: Page): Promise<boolean> {
        try {
            await page.waitForSelector('#quizCompleteContainer', { state: 'visible', timeout: 2000 })
            await this.bot.utils.wait(2000)
            return true
        } catch (error) {
            return false
        }
    }

    async loadInCheerio(page: Page): Promise<CheerioAPI> {
        const html = await page.content()
        return load(html)
    }

    async getPunchCardActivity(page: Page, activity: PromotionalItem | MorePromotion): Promise<string> {
        let selector = ''
        try {
            const html = await page.content()
            const $ = load(html)
            const element = $('.offer-cta').toArray().find(x => x.attribs.href?.includes(activity.offerId))
            if (element) {
                selector = `a[href*="${element.attribs.href}"]`
            }
        } catch (error) {
            this.bot.log(this.bot.isMobile, '获取打卡活动', `发生错误: ${error}`, 'error')
        }
        return selector
    }

    async closeBrowser(browser: BrowserContext, email: string) {
        try {
            await saveSessionData(this.bot.config.sessionPath, browser, email, this.bot.isMobile)
            await this.bot.utils.wait(2000)
            await browser.close()
            this.bot.log(this.bot.isMobile, '关闭浏览器', '浏览器已干净地关闭！')
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, '关闭浏览器', `发生错误: ${error}`, 'error')
        }
    }
}
