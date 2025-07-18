import { Page } from 'rebrowser-playwright'
import { load } from 'cheerio'

import { MicrosoftRewardsBot } from '../index'


export default class BrowserUtil {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    /**
     * [最终修正] 增强弹窗处理能力
     * @param page 
     */
    async tryDismissAllMessages(page: Page): Promise<void> {
        const buttons = [
            // [新增] 专门用来关闭拦截任务点击的弹窗
            { selector: '#popUpModal [aria-label="Close"]', label: '主要弹窗关闭按钮 (Aria Label)' },
            { selector: '#popUpModal .rw_icon_close', label: '主要弹窗关闭按钮 (Icon)' },
            { selector: '#bnp_btn_accept', label: '必应Cookie横幅' },
            { selector: '#reward_pivot_earn', label: '奖励优惠券接受' },
            { selector: '#acceptButton', label: '通用接受按钮' },
            { selector: '.c-glyph.glyph-cancel', label: '移动端欢迎按钮' },
            { selector: '.maybe-later', label: '移动端App推广横幅' },
            { selector: '#iNext', label: 'iNext' },
            { selector: '#iLooksGood', label: 'iLooksGood' },
            { selector: '#idSIButton9', label: 'idSIButton9' }
        ]

        for (const button of buttons) {
            try {
                const element = page.locator(button.selector).first();
                await element.click({ timeout: 1500 }); // 使用较短的超时，避免卡住
                await page.waitForTimeout(500);
                this.bot.log(this.bot.isMobile, '关闭消息', `成功关闭了: ${button.label}`);
            } catch (error) {
                // 静默失败，因为这些元素不一定总会出现
            }
        }
    }

    async getLatestTab(page: Page): Promise<Page> {
        try {
            await this.bot.utils.wait(1000)
            const browser = page.context()
            const pages = browser.pages()
            const newTab = pages[pages.length - 1]
            if (newTab) {
                return newTab
            }
            throw this.bot.log(this.bot.isMobile, '获取新标签页', '无法获取最新的标签页', 'error')
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, '获取新标签页', `发生错误: ${error}`, 'error')
        }
    }

    async getTabs(page: Page) {
        try {
            const browser = page.context()
            const pages = browser.pages()

            const homeTab = pages[1]
            let homeTabURL: URL

            if (!homeTab) {
                throw this.bot.log(this.bot.isMobile, '获取标签页', '找不到主页标签！', 'error')
            } else {
                homeTabURL = new URL(homeTab.url())
                if (homeTabURL.hostname !== 'rewards.bing.com') {
                    throw this.bot.log(this.bot.isMobile, '获取标签页', '奖励页面主机名无效: ' + homeTabURL.host, 'error')
                }
            }

            const workerTab = pages[2]
            if (!workerTab) {
                throw this.bot.log(this.bot.isMobile, '获取标签页', '找不到工作标签！', 'error')
            }

            return {
                homeTab: homeTab,
                workerTab: workerTab
            }
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, '获取标签页', `发生错误: ${error}`, 'error')
        }
    }

    async reloadBadPage(page: Page): Promise<void> {
        try {
            const html = await page.content().catch(() => '')
            const $ = load(html)
            const isNetworkError = $('body.neterror').length
            if (isNetworkError) {
                this.bot.log(this.bot.isMobile, '重新加载坏页', '检测到坏页，正在重新加载！')
                await page.reload()
            }
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, '重新加载坏页', `发生错误: ${error}`, 'error')
        }
    }
}
