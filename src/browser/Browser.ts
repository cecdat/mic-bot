import playwright, { BrowserContext } from 'rebrowser-playwright'

import { newInjectedContext } from 'fingerprint-injector'
import { FingerprintGenerator } from 'fingerprint-generator'

import { MicrosoftRewardsBot } from '../index'
import { loadSessionData, saveFingerprintData } from '../util/Load'
import { updateFingerprintUserAgent } from '../util/UserAgent'

import { Account } from '../interface/Account'

class Browser {
    private bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    /**
     * [最终修正] 智能选择桌面或移动端的User-Agent
     * @param account 完整的账户对象
     * @returns 
     */
    async createBrowser(account: Account): Promise<BrowserContext> {
        const proxy = account.proxy;
        const email = account.email;

        const browser = await playwright.chromium.launch({
            headless: this.bot.config.headless,
            ...(proxy.url && { proxy: { username: proxy.username, password: proxy.password, server: `${proxy.url}:${proxy.port}` } }),
            args: [
                '--no-sandbox',
                '--mute-audio',
                '--disable-setuid-sandbox',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--ignore-ssl-errors'
            ]
        })

        const sessionData = await loadSessionData(this.bot.config.sessionPath, email, this.bot.isMobile, this.bot.config.saveFingerprint)

        let fingerprint;
        
        // --- [核心修改] ---
        // 根据当前是移动端还是桌面端任务，来决定使用哪个User-Agent
        const customUserAgent = this.bot.isMobile ? account.userAgents?.mobile : account.userAgents?.desktop;

        if (customUserAgent && customUserAgent.trim() !== '') {
            this.bot.log(this.bot.isMobile, '浏览器', `[${email}] 检测到自定义User-Agent，将使用该配置。`);
            fingerprint = new FingerprintGenerator().getFingerprint({
                devices: this.bot.isMobile ? ['mobile'] : ['desktop'],
                operatingSystems: this.bot.isMobile ? ['android'] : ['windows'],
            });
            // 覆盖自动生成的UA
            fingerprint.fingerprint.navigator.userAgent = customUserAgent;
            fingerprint.headers['user-agent'] = customUserAgent;
        } else {
            this.bot.log(this.bot.isMobile, '浏览器', `[${email}] 未配置${this.bot.isMobile ? '移动端' : '桌面端'}自定义User-Agent，将自动生成。`);
            fingerprint = sessionData.fingerprint ? sessionData.fingerprint : await this.generateFingerprint();
        }
        // --- [核心修改结束] ---


        const context = await newInjectedContext(browser as any, { fingerprint: fingerprint })

        context.setDefaultTimeout(this.bot.utils.stringToMs(this.bot.config?.globalTimeout ?? 30000))

        await context.addCookies(sessionData.cookies)

        if (this.bot.config.saveFingerprint) {
            await saveFingerprintData(this.bot.config.sessionPath, email, this.bot.isMobile, fingerprint)
        }

        this.bot.log(this.bot.isMobile, '浏览器', `创建浏览器实例，User-Agent: "${fingerprint.fingerprint.navigator.userAgent}"`)

        return context as BrowserContext
    }

    async generateFingerprint() {
        const fingerPrintData = new FingerprintGenerator().getFingerprint({
            devices: this.bot.isMobile ? ['mobile'] : ['desktop'],
            operatingSystems: this.bot.isMobile ? ['android'] : ['windows'],
            browsers: [{ name: 'edge' }]
        })

        const updatedFingerPrintData = await updateFingerprintUserAgent(fingerPrintData, this.bot.isMobile)

        return updatedFingerPrintData
    }
}

export default Browser
