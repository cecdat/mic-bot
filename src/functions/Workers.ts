import { Page } from 'rebrowser-playwright'

import { DashboardData, MorePromotion, PromotionalItem, PunchCard } from '../interface/DashboardData'

import { MicrosoftRewardsBot } from '../index'

export class Workers {
    public bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    async doDailySet(page: Page, data: DashboardData) {
        const todayData = data.dailySetPromotions[this.bot.utils.getFormattedDate()]
        const activitiesUncompleted = todayData?.filter(x => !x.complete && x.pointProgressMax > 0) ?? []
        if (!activitiesUncompleted.length) {
            this.bot.log(this.bot.isMobile, '每日任务', '所有“每日任务”项已完成')
            return
        }
        this.bot.log(this.bot.isMobile, '每日任务', '开始解决“每日任务”项')
        await this.solveActivities(page, activitiesUncompleted)
        page = await this.bot.browser.utils.getLatestTab(page)
        await this.bot.browser.func.goHome(page)
        this.bot.log(this.bot.isMobile, '每日任务', '所有“每日任务”项已完成')
    }

    async doPunchCard(page: Page, data: DashboardData) {
        const punchCardsUncompleted = data.punchCards?.filter(x => x.parentPromotion && !x.parentPromotion.complete) ?? []
        if (!punchCardsUncompleted.length) {
            this.bot.log(this.bot.isMobile, '打卡任务', '所有“打卡任务”已完成')
            return
        }
        for (const punchCard of punchCardsUncompleted) {
            if (!punchCard.parentPromotion?.title) {
                this.bot.log(this.bot.isMobile, '打卡任务', `跳过打卡任务 "${punchCard.name}" | 原因: 父推广活动缺失！`, 'warn')
                continue
            }
            page = await this.bot.browser.utils.getLatestTab(page)
            const activitiesUncompleted = punchCard.childPromotions.filter(x => !x.complete)
            this.bot.log(this.bot.isMobile, '打卡任务', `开始为打卡任务解决项目: "${punchCard.parentPromotion.title}"`)
            await page.goto(punchCard.parentPromotion.destinationUrl, { referer: this.bot.config.baseURL })
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { })
            await this.solveActivities(page, activitiesUncompleted, punchCard)
            page = await this.bot.browser.utils.getLatestTab(page)
            const pages = page.context().pages()
            if (pages.length > 3) {
                await page.close()
            } else {
                await this.bot.browser.func.goHome(page)
            }
            this.bot.log(this.bot.isMobile, '打卡任务', `打卡任务的所有项目: "${punchCard.parentPromotion.title}" 已完成`)
        }
        this.bot.log(this.bot.isMobile, '打卡任务', '所有“打卡任务”项已完成')
    }

    async doMorePromotions(page: Page, data: DashboardData) {
        const morePromotions = data.morePromotions
        if (data.promotionalItem) {
            morePromotions.push(data.promotionalItem as unknown as MorePromotion)
        }
        const activitiesUncompleted = morePromotions?.filter(x => !x.complete && x.pointProgressMax > 0 && x.exclusiveLockedFeatureStatus !== 'locked') ?? []
        if (!activitiesUncompleted.length) {
            this.bot.log(this.bot.isMobile, '更多推广', '所有“更多推广”项已完成')
            return
        }
        this.bot.log(this.bot.isMobile, '更多推广', '开始解决“更多推广”项')
        page = await this.bot.browser.utils.getLatestTab(page)
        await this.solveActivities(page, activitiesUncompleted)
        page = await this.bot.browser.utils.getLatestTab(page)
        await this.bot.browser.func.goHome(page)
        this.bot.log(this.bot.isMobile, '更多推广', '所有“更多推广”项已完成')
    }

    /**
     * [最终修正] 恢复对 selector 变量的正确使用
     * @param activityPage 
     * @param activities 
     * @param punchCard 
     */
    private async solveActivities(activityPage: Page, activities: PromotionalItem[] | MorePromotion[], punchCard?: PunchCard) {
        const activityInitial = activityPage.url()

        for (const activity of activities) {
            try {
                activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                const pages = activityPage.context().pages()
                if (pages.length > 3) {
                    await activityPage.close()
                    activityPage = await this.bot.browser.utils.getLatestTab(activityPage)
                }
                await this.bot.utils.wait(1000)
                if (activityPage.url() !== activityInitial) {
                    await activityPage.goto(activityInitial)
                }

                this.bot.log(this.bot.isMobile, '活动', '正在检查并关闭可能的弹窗...');
                await this.bot.browser.utils.tryDismissAllMessages(activityPage);
                
                let selector = `[data-bi-id^="${activity.offerId}"] .pointLink:not(.contentContainer .pointLink)`
                if (punchCard) {
                    selector = await this.bot.browser.func.getPunchCardActivity(activityPage, activity)
                } else if (activity.name.toLowerCase().includes('membercenter') || activity.name.toLowerCase().includes('exploreonbing')) {
                    selector = `[data-bi-id^="${activity.name}"] .pointLink:not(.contentContainer .pointLink)`
                }

                await activityPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { })
                await this.bot.utils.wait(2000)

                // [核心修正] 在点击之后，再执行 switch 逻辑
                await activityPage.click(selector);
                activityPage = await this.bot.browser.utils.getLatestTab(activityPage);
                
                switch (activity.promotionType) {
                    case 'quiz':
                        switch (activity.pointProgressMax) {
                            case 10:
                                if (activity.destinationUrl.toLowerCase().includes('pollscenarioid')) {
                                    this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "投票" 标题: "${activity.title}"`)
                                    await this.bot.activities.doPoll(activityPage)
                                } else {
                                    this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "ABC" 标题: "${activity.title}"`)
                                    await this.bot.activities.doABC(activityPage)
                                }
                                break
                            case 50:
                                this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "ThisOrThat" 标题: "${activity.title}"`)
                                await this.bot.activities.doThisOrThat(activityPage)
                                break
                            default:
                                this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "测验" 标题: "${activity.title}"`)
                                await this.bot.activities.doQuiz(activityPage)
                                break
                        }
                        break

                    case 'urlreward':
                        if (activity.name.toLowerCase().includes('exploreonbing')) {
                            this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "在必应上搜索" 标题: "${activity.title}"`)
                            await this.bot.activities.doSearchOnBing(activityPage, activity)
                        } else {
                            this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "URL奖励" 标题: "${activity.title}"`)
                            await this.bot.activities.doUrlReward(activityPage)
                        }
                        break

                    default:
                        this.bot.log(this.bot.isMobile, '活动', `跳过活动 "${activity.title}" | 原因: 不支持的类型: "${activity.promotionType}"！`, 'warn')
                        break
                }
                await this.bot.utils.wait(2000)
            } catch (error) {
                this.bot.log(this.bot.isMobile, '活动', `发生错误: ${error}`, 'error')
            }
        }
    }
}
