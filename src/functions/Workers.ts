import { Page } from 'rebrowser-playwright'
// [FIX] Removed unused imports for MorePromotion, PromotionalItem, and PunchCard
import { DashboardData } from '../interface/DashboardData'
import { UnifiedTask } from '../util/AIOrcestrator'
import { MicrosoftRewardsBot } from '../index'

export class Workers {
    public bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    /**
     * [新增] 执行由AI调度器派发的单个任务
     * @param dashboardPage 仪表盘主页面
     * @param task 要执行的单个任务对象
     */
    async executeSingleTask(dashboardPage: Page, task: UnifiedTask) {
        const activityInitial = dashboardPage.url();
        
        try {
            let currentPage = await this.bot.browser.utils.getLatestTab(dashboardPage);
            const pages = currentPage.context().pages();
            if (pages.length > 2) { // 保持主页面和工作页面
                await currentPage.close().catch(() => {});
                currentPage = await this.bot.browser.utils.getLatestTab(dashboardPage);
            }

            if (currentPage.url() !== activityInitial) {
                await currentPage.goto(activityInitial);
            }

            this.bot.log(this.bot.isMobile, '活动执行', `正在检查并关闭可能的弹窗...`);
            await this.bot.browser.utils.tryDismissAllMessages(currentPage);
            
            const selector = `[data-bi-id^="${task.offerId}"] .pointLink:not(.contentContainer .pointLink)`;

            await currentPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            await this.bot.utils.wait(2000);

            const activityLocator = currentPage.locator(selector);
            await this.bot.utils.humanClick(activityLocator);
            
            const activityTab = await this.bot.browser.utils.getLatestTab(currentPage);
            
            await this.routeTaskToSolver(activityTab, task);
            
            await this.bot.utils.wait(2000);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.bot.log(this.bot.isMobile, '活动执行', `执行任务 "${task.title}" 时发生错误: ${errorMessage}`, 'error');
        }
    }
    
    private async routeTaskToSolver(activityPage: Page, activity: UnifiedTask) {
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
                break;
            case 'urlreward':
                if (activity.name.toLowerCase().includes('exploreonbing')) {
                    this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "在必应上搜索" 标题: "${activity.title}"`)
                    await this.bot.activities.doSearchOnBing(activityPage, activity)
                } else {
                    this.bot.log(this.bot.isMobile, '活动', `发现活动类型: "URL奖励" 标题: "${activity.title}"`)
                    await this.bot.activities.doUrlReward(activityPage)
                }
                break;
            default:
                this.bot.log(this.bot.isMobile, '活动', `跳过活动 "${activity.title}" | 原因: 不支持的类型: "${activity.promotionType}"！`, 'warn')
                break;
        }
    }

    async doPunchCard(page: Page, data: DashboardData) {
        const punchCardsUncompleted = data.punchCards?.filter(x => x.parentPromotion && !x.parentPromotion.complete) ?? [];
        if (!punchCardsUncompleted.length) {
            this.bot.log(this.bot.isMobile, '打卡任务', '所有“打卡任务”已完成');
            return;
        }
        for (const punchCard of punchCardsUncompleted) {
            if (!punchCard.parentPromotion?.title) {
                this.bot.log(this.bot.isMobile, '打卡任务', `跳过打卡任务 "${punchCard.name}" | 原因: 父推广活动缺失！`, 'warn');
                continue;
            }
            let currentPage = await this.bot.browser.utils.getLatestTab(page).catch(() => page);
            const activitiesUncompleted = punchCard.childPromotions.filter(x => !x.complete);
            this.bot.log(this.bot.isMobile, '打卡任务', `开始为打卡任务解决项目: "${punchCard.parentPromotion.title}"`);
            await currentPage.goto(punchCard.parentPromotion.destinationUrl, { referer: this.bot.config.baseURL });
            await currentPage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

            for (const activity of activitiesUncompleted) {
                await this.executeSingleTask(currentPage, activity);
            }
            
            currentPage = await this.bot.browser.utils.getLatestTab(page).catch(() => page);
            const pages = currentPage.context().pages();
            if (pages.length > 2) {
                await currentPage.close().catch(() => {});
            } else {
                await this.bot.browser.func.goHome(currentPage);
            }
            this.bot.log(this.bot.isMobile, '打卡任务', `打卡任务的所有项目: "${punchCard.parentPromotion.title}" 已完成`);
        }
        this.bot.log(this.bot.isMobile, '打卡任务', '所有“打卡任务”项已完成');
    }
}
