import playwright, { Browser as PlaywrightBrowser, BrowserContext } from 'rebrowser-playwright'
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

    async launchBrowser(account: Account): Promise<PlaywrightBrowser> {
        const proxy = account.proxy;
        const browser = await playwright.chromium.launch({
            headless: this.bot.config.headless,
            ...(proxy.url && { proxy: { username: proxy.username, password: proxy.password, server: `${proxy.url}:${proxy.port}` } }),
            args: [
                '--no-sandbox',
                '--mute-audio',
                '--disable-setuid-sandbox',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--ignore-ssl-errors',
                // [新增] 尝试禁用HTTP/2协议，回退到HTTP/1.1，可能会解决协议错误
                '--disable-http2',
                // [新增] 禁用GPU硬件加速，可以减少资源占用并避免一些兼容性问题
                '--disable-gpu'
            ]
        });
        return browser;
    }

    async createContext(browser: PlaywrightBrowser, account: Account): Promise<BrowserContext> {
        const email = account.email;
        const sessionData = await loadSessionData(this.bot.config.sessionPath, email, this.bot.isMobile, this.bot.config.saveFingerprint);

        let fingerprint;
        const customUserAgent = this.bot.isMobile ? account.userAgents?.mobile : account.userAgents?.desktop;

        if (customUserAgent && customUserAgent.trim() !== '') {
            this.bot.log(this.bot.isMobile, '浏览器', `[${email}] 检测到自定义User-Agent，将使用该配置。`);
            fingerprint = new FingerprintGenerator().getFingerprint({
                devices: this.bot.isMobile ? ['mobile'] : ['desktop'],
                operatingSystems: this.bot.isMobile ? ['android'] : ['windows'],
            });
            fingerprint.fingerprint.navigator.userAgent = customUserAgent;
            fingerprint.headers['user-agent'] = customUserAgent;
        } else {
            this.bot.log(this.bot.isMobile, '浏览器', `[${email}] 未配置${this.bot.isMobile ? '移动端' : '桌面端'}自定义User-Agent，将自动生成。`);
            fingerprint = sessionData.fingerprint ? sessionData.fingerprint : await this.generateFingerprint();
        }

        const context = await newInjectedContext(browser, { fingerprint: fingerprint });

        context.setDefaultTimeout(this.bot.utils.stringToMs(this.bot.config?.globalTimeout ?? 30000));
        await context.addCookies(sessionData.cookies);

        if (this.bot.config.saveFingerprint) {
            await saveFingerprintData(this.bot.config.sessionPath, email, this.bot.isMobile, fingerprint);
        }

        this.bot.log(this.bot.isMobile, '浏览器', `创建浏览器上下文，User-Agent: "${fingerprint.fingerprint.navigator.userAgent}"`);

        return context as BrowserContext;
    }

    async generateFingerprint() {
        const fingerPrintData = new FingerprintGenerator().getFingerprint({
            devices: this.bot.isMobile ? ['mobile'] : ['desktop'],
            operatingSystems: this.bot.isMobile ? ['android'] : ['windows'],
            browsers: [{ name: 'edge' }]
        });
        return await updateFingerprintUserAgent(fingerPrintData, this.bot.isMobile);
    }
}

export default Browser;
