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
        // [修复] 确保在任务完成后，我们操作的是一个有效的页面
        const latestPage = await this.bot.browser.utils.getLatestTab(page).catch(() => page)
        await this.bot.browser.func.goHome(latestPage)
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
            let currentPage = await this.bot.browser.utils.getLatestTab(page).catch(() => page)
            const activitiesUncompleted = punchCard.childPromotions.filter(x => !x.complete)
            this.bot.log(this.bot.isMobile, '打卡任务', `开始为打卡任务解决项目: "${punchCard.parentPromotion.title}"`)
            await currentPage.goto(punchCard.parentPromotion.destinationUrl, { referer: this.bot.config.baseURL })
            await currentPage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { })
            await this.solveActivities(currentPage, activitiesUncompleted, punchCard)
            
            currentPage = await this.bot.browser.utils.getLatestTab(page).catch(() => page)
            const pages = currentPage.context().pages()
            if (pages.length > 3) {
                await currentPage.close().catch(() => {})
            } else {
                await this.bot.browser.func.goHome(currentPage)
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
        let currentPage = await this.bot.browser.utils.getLatestTab(page).catch(() => page)
        await this.solveActivities(currentPage, activitiesUncompleted)
        currentPage = await this.bot.browser.utils.getLatestTab(page).catch(() => page)
        await this.bot.browser.func.goHome(currentPage)
        this.bot.log(this.bot.isMobile, '更多推广', '所有“更多推广”项已完成')
    }

    private async solveActivities(dashboardPage: Page, activities: PromotionalItem[] | MorePromotion[], punchCard?: PunchCard) {
        const activityInitial = dashboardPage.url()

        for (const activity of activities) {
            try {
                // [修复] 始终从稳定的 dashboardPage 获取上下文，而不是依赖可能已关闭的页面
                let currentPage = await this.bot.browser.utils.getLatestTab(dashboardPage);

                const pages = currentPage.context().pages()
                if (pages.length > 3) {
                    await currentPage.close().catch(() => {}) // 安全关闭多余页面
                    currentPage = await this.bot.browser.utils.getLatestTab(dashboardPage);
                }
                await this.bot.utils.wait(1000)

                if (currentPage.url() !== activityInitial) {
                    await currentPage.goto(activityInitial)
                }

                this.bot.log(this.bot.isMobile, '活动', '正在检查并关闭可能的弹窗...');
                await this.bot.browser.utils.tryDismissAllMessages(currentPage);
                
                let selector = `[data-bi-id^="${activity.offerId}"] .pointLink:not(.contentContainer .pointLink)`
                if (punchCard) {
                    selector = await this.bot.browser.func.getPunchCardActivity(currentPage, activity)
                } else if (activity.name.toLowerCase().includes('membercenter') || activity.name.toLowerCase().includes('exploreonbing')) {
                    selector = `[data-bi-id^="${activity.name}"] .pointLink:not(.contentContainer .pointLink)`
                }

                await currentPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { })
                await this.bot.utils.wait(2000)

                await currentPage.click(selector, { force: true });
                
                // [修复] 点击后，将新打开的标签页赋值给一个局部变量
                const activityTab = await this.bot.browser.utils.getLatestTab(currentPage);
                
                switch (activity.promotionType) {
                    case 'quiz':
                        switch (activity.pointProgressMax) {
                            case 10:
                                if (activity.destinationUrl.toLowerCase().includes('pollscenarioid')) {
                                    this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "投票" 标题: "${activity.title}"`)
                                    await this.bot.activities.doPoll(activityTab)
                                } else {
                                    this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "ABC" 标题: "${activity.title}"`)
                                    await this.bot.activities.doABC(activityTab)
                                }
                                break
                            case 50:
                                this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "ThisOrThat" 标题: "${activity.title}"`)
                                await this.bot.activities.doThisOrThat(activityTab)
                                break
                            default:
                                this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "测验" 标题: "${activity.title}"`)
                                await this.bot.activities.doQuiz(activityTab)
                                break
                        }
                        break

                    case 'urlreward':
                        if (activity.name.toLowerCase().includes('exploreonbing')) {
                            this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "在必应上搜索" 标题: "${activity.title}"`)
                            await this.bot.activities.doSearchOnBing(activityTab, activity)
                        } else {
                            this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "URL奖励" 标题: "${activity.title}"`)
                            await this.bot.activities.doUrlReward(activityTab)
                        }
                        break

                    default:
                        this.bot.log(this.bot.isMobile, '活动', `跳过活动 "${activity.title}" | 原因: 不支持的类型: "${activity.promotionType}"！`, 'warn')
                        break
                }
                await this.bot.utils.wait(2000)
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.bot.log(this.bot.isMobile, '活动', `发生错误: ${errorMessage}`, 'error')
            }
        }
    }
}
