import { Page } from 'rebrowser-playwright'
import * as crypto from 'crypto'
import { AxiosRequestConfig } from 'axios'
import fs from 'fs'
import path from 'path'

import { MicrosoftRewardsBot } from '../index'
import { saveSessionData } from '../util/Load'
import { sendPush } from '../util/Push' 
import { OAuth } from '../interface/OAuth'

export class Login {
    private bot: MicrosoftRewardsBot
    private clientId: string = '0000000040170455'
    private authBaseUrl: string = 'https://login.live.com/oauth20_authorize.srf'
    private redirectUrl: string = 'https://login.live.com/oauth20_desktop.srf'
    private tokenUrl: string = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
    private scope: string = 'service::prod.rewardsplatform.microsoft.com::MBI_SSL'

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
                if (i === retries - 1) throw error;
                await this.bot.utils.wait(3000);
            }
        }
    }

    async login(page: Page, email: string, password: string) {
        try {
            this.bot.log(this.bot.isMobile, '登录', `[${email}] 开始登录流程！`);
            await this.gotoWithRetry(page, 'https://rewards.bing.com/signin');
            await page.waitForLoadState('domcontentloaded').catch(() => { });
            await this.bot.browser.utils.reloadBadPage(page);
            await this.checkAccountLocked(page);
            const isLoggedIn = await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 10000 }).then(() => true).catch(() => false);
            if (!isLoggedIn) {
                await this.execLogin(page, email, password);
            } else {
                this.bot.log(this.bot.isMobile, '登录', `[${email}] 已经处于登录状态`);
                await this.checkAccountLocked(page);
            }
            await saveSessionData(this.bot.config.sessionPath, page.context(), email, this.bot.isMobile);
            this.bot.log(this.bot.isMobile, '登录', `[${email}] 登录成功，并已保存登录会话！`);
        } catch (error) {
            throw this.bot.log(this.bot.isMobile, '登录', `[${email}] 发生错误: ${error}`, 'error');
        }
    }

    private async execLogin(page: Page, email: string, password: string) {
        try {
            await this.enterEmail(page, email);
            await this.bot.utils.wait(2000);
            await this.bot.browser.utils.reloadBadPage(page);
            await this.bot.utils.wait(2000);
            await this.enterPassword(page, password);
            await this.checkLoggedIn(page, email);
            this.bot.log(this.bot.isMobile, '登录', `[${email}] 成功登录到微软账户`);
        } catch (error) {
            this.bot.log(this.bot.isMobile, '登录', `[${email}] 发生错误: ${error}`, 'error');
            throw error;
        }
    }

    private async enterEmail(page: Page, email: string) {
        const emailInputSelector = 'input[type="email"]';
        try {
            const emailField = await page.waitForSelector(emailInputSelector, { state: 'visible', timeout: 2000 }).catch(() => null);
            if (!emailField) {
                this.bot.log(this.bot.isMobile, '登录', `[${email}] 未找到邮箱输入框`, 'warn');
                return;
            }
            await this.bot.utils.wait(1000);
            const emailPrefilled = await page.waitForSelector('#userDisplayName', { timeout: 5000 }).catch(() => null);
            if (emailPrefilled) {
                this.bot.log(this.bot.isMobile, '登录', `[${email}] 邮箱已被微软预填`);
            } else {
                await page.fill(emailInputSelector, '');
                await this.bot.utils.wait(500);
                await page.fill(emailInputSelector, email);
                await this.bot.utils.wait(1000);
            }
            const nextButton = await page.waitForSelector('button[type="submit"]', { timeout: 2000 }).catch(() => null);
            if (nextButton) {
                await nextButton.click();
                await this.bot.utils.wait(3000);

                // [核心逻辑] 在这里处理“验证电子邮件”页面
                await this.handleVerifyEmailPage(page, email);

                this.bot.log(this.bot.isMobile, '登录', `[${email}] 邮箱输入成功`);
            } else {
                this.bot.log(this.bot.isMobile, '登录', `[${email}] 输入邮箱后未找到“下一步”按钮`, 'warn');
            }
        } catch (error) {
            this.bot.log(this.bot.isMobile, '登录', `[${email}] 邮箱输入失败: ${error}`, 'error');
        }
    }

    private async enterPassword(page: Page, password: string) {
        const passwordInputSelector = 'input[type="password"]';
        try {
            const passwordField = await page.waitForSelector(passwordInputSelector, { state: 'visible', timeout: 5000 }).catch(() => null);
            if (!passwordField) {
                this.bot.log(this.bot.isMobile, '登录', '未找到密码输入框，可能需要2FA验证。', 'warn');
                await this.handle2FA(page);
                return;
            }
            await this.bot.utils.wait(1000);
            await page.fill(passwordInputSelector, '');
            await this.bot.utils.wait(500);
            await page.fill(passwordInputSelector, password);
            await this.bot.utils.wait(1000);
            const nextButton = await page.waitForSelector('button[type="submit"]', { timeout: 2000 }).catch(() => null);
            if (nextButton) {
                await nextButton.click();
                await this.bot.utils.wait(2000);
                this.bot.log(this.bot.isMobile, '登录', '密码输入成功');
            } else {
                this.bot.log(this.bot.isMobile, '登录', '输入密码后未找到“下一步”按钮', 'warn');
            }
        } catch (error) {
            this.bot.log(this.bot.isMobile, '登录', `密码输入失败: ${error}`, 'error');
            await this.handle2FA(page);
        }
    }

    private async handle2FA(page: Page) {
        try {
            const numberToPress = await this.get2FACode(page);
            await this.authAppVerification(page, numberToPress);
        } catch (error) {
            this.bot.log(this.bot.isMobile, '登录', `2FA处理失败: ${error}`, 'error');
        }
    }

    private async get2FACode(page: Page): Promise<string | null> {
        this.bot.log(this.bot.isMobile, '登录', '正在尝试捕获无密码登录授权码...');
        try {
            const codeHandle = await page.waitForFunction(() => {
                const element = document.querySelector('[data-testid="displaySign"] span');
                if (element && element.textContent && element.textContent.trim() !== '') {
                    return element.textContent.trim();
                }
                return false;
            }, { timeout: 15000 });
            const code = await codeHandle.jsonValue() as string;
            this.bot.log(this.bot.isMobile, '登录', `成功捕获到授权码: ${code}`);
            return code;
        } catch (error) {
            this.bot.log(this.bot.isMobile, '登录', `未能自动捕获到授权码。`, 'warn');
            return null;
        }
    }
    
    private async authAppVerification(page: Page, numberToPress: string | null) {
        if (!numberToPress) {
            this.bot.log(this.bot.isMobile, '登录', '无法自动读取验证码，等待用户手动批准...', 'warn');
            await sendPush('微软账户验证', '脚本正在等待您手动批准登录。');
        } else {
            const accountEmail = await page.evaluate(() => (document.querySelector('#bannerText') as HTMLElement | null)?.innerText || '未知账号');
            const pushTitle = `微软账户授权码`;
            const pushContent = `账号: ${accountEmail}，授权码: ${numberToPress}`;
            this.bot.log(this.bot.isMobile, '登录', `请在您的 Authenticator 应用中按下数字 ${numberToPress} 以批准登录`);
            await sendPush(pushTitle, pushContent);
        }

        while (true) {
            let approvalSuccess = false;
            const startTime = Date.now();
            const timeout = 60000;

            this.bot.log(this.bot.isMobile, '登录', '正在等待应用批准... (超时时间60秒)');

            while (Date.now() - startTime < timeout) {
                if (page.url().includes('rewards.bing.com')) {
                    this.bot.log(this.bot.isMobile, '登录', '检测到URL已跳转，登录已批准！');
                    approvalSuccess = true;
                    break;
                }
                await this.bot.utils.wait(2000);
            }

            if (approvalSuccess) {
                break;
            }

            this.bot.log(this.bot.isMobile, '登录', '等待批准超时。将尝试获取新验证码...', 'warn');
            await page.click('[data-testid="viewFooter"] span').catch(() => {});
            const newNumber = await this.get2FACode(page);
            if(newNumber) {
                numberToPress = newNumber;
                const accountEmail = await page.evaluate(() => (document.querySelector('#bannerText') as HTMLElement | null)?.innerText || '未知账号');
                const pushTitle = `微软账户新授权码`;
                const pushContent = `账号: ${accountEmail}，新授权码: ${newNumber}`;
                this.bot.log(this.bot.isMobile, '登录', `新的验证码: ${newNumber}。请在应用中输入。`);
                await sendPush(pushTitle, pushContent);
            } else {
                 this.bot.log(this.bot.isMobile, '登录', '无法获取新的验证码，请检查手机或手动操作。', 'error');
                 break; 
            }
        }
    }

    async getMobileAccessToken(page: Page, email: string) {
        const authorizeUrl = new URL(this.authBaseUrl);
        authorizeUrl.searchParams.append('response_type', 'code');
        authorizeUrl.searchParams.append('client_id', this.clientId);
        authorizeUrl.searchParams.append('redirect_uri', this.redirectUrl);
        authorizeUrl.searchParams.append('scope', this.scope);
        authorizeUrl.searchParams.append('state', crypto.randomBytes(16).toString('hex'));
        authorizeUrl.searchParams.append('access_type', 'offline_access');
        authorizeUrl.searchParams.append('login_hint', email);
        
        await this.gotoWithRetry(page, authorizeUrl.href);

        let currentUrl = new URL(page.url());
        let code: string;
        this.bot.log(this.bot.isMobile, '登录-APP', '等待授权...');
        while (true) {
            if (currentUrl.hostname === 'login.live.com' && currentUrl.pathname === '/oauth20_desktop.srf') {
                code = currentUrl.searchParams.get('code')!;
                break;
            }
            currentUrl = new URL(page.url());
            await this.bot.utils.wait(5000);
        }
        const body = new URLSearchParams();
        body.append('grant_type', 'authorization_code');
        body.append('client_id', this.clientId);
        body.append('code', code);
        body.append('redirect_uri', this.redirectUrl);
        const tokenRequest: AxiosRequestConfig = {
            url: this.tokenUrl,
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: body.toString()
        };
        const tokenResponse = await this.bot.axios.request(tokenRequest);
        const tokenData: OAuth = await tokenResponse.data;
        this.bot.log(this.bot.isMobile, '登录-APP', '授权成功');
        return tokenData.access_token;
    }

    private async checkLoggedIn(page: Page, email: string) {
        this.bot.log(this.bot.isMobile, '登录', `[${email}] 正在验证登录后状态...`);
        try {
            const navigationPromise = page.waitForURL('**/rewards.bing.com/**', {
                timeout: 60000,
                waitUntil: 'domcontentloaded'
            });
    
            const intermediatePageHandler = (async () => {
                while (!page.isClosed() && !page.url().includes('rewards.bing.com')) {
                    await this.dismissLoginMessages(page, email);
                    await this.handleVerifyEmailPage(page, email);
                    await this.bot.utils.wait(1000);
                }
            })();
    
            await Promise.race([navigationPromise, intermediatePageHandler]);

            if (this.bot.config.debug) {
                await this.saveSnapshot(page, email, 'post_login_snapshot.html');
            }

            await page.waitForSelector('html[data-role-name="RewardsPortal"]', { timeout: 10000 });
            this.bot.log(this.bot.isMobile, '登录', `[${email}] 成功登录到奖励门户`);
        } catch (error) {
            this.bot.log(this.bot.isMobile, '登录', `[${email}] 验证登录状态时超时或失败: ${error}`, 'error');
            if (this.bot.config.debug) {
                await this.saveSnapshot(page, email, 'login_failure_snapshot.html');
            }
            throw new Error(`[${email}] 验证登录状态失败`);
        }
    }

    private async dismissLoginMessages(page: Page, email: string) {
        const staySignedInButton = page.locator('[data-testid="primaryButton"]');
        if (await staySignedInButton.isVisible({ timeout: 1000 })) {
            await staySignedInButton.click();
            this.bot.log(this.bot.isMobile, '关闭消息', `[${email}] 点击了“保持登录状态”弹窗中的“是”`);
            await page.waitForTimeout(500);
        }
        const usePasskeyButton = page.locator('[data-testid="secondaryButton"]');
        if (await usePasskeyButton.isVisible({ timeout: 1000 })) {
            await usePasskeyButton.click();
            this.bot.log(this.bot.isMobile, '关闭消息', `[${email}] 关闭了 "使用Passekey" 弹窗`);
            await page.waitForTimeout(500);
        }
    }
    
    private async handleVerifyEmailPage(page: Page, email: string) {
        const verifyEmailTitle = page.locator('h1:has-text("验证你的电子邮件"), h1:has-text("Verify your email")');
        const usePasswordLink = page.locator('a:has-text("使用密码"), span:has-text("Use your password")');

        if (await verifyEmailTitle.isVisible({ timeout: 2000 })) {
            this.bot.log(this.bot.isMobile, '登录', `[${email}] 检测到“验证电子邮件”页面，将选择“使用密码”登录...`);
            if (await usePasswordLink.isVisible()) {
                await usePasswordLink.click();
                await this.bot.utils.wait(2000);
            } else {
                this.bot.log(this.bot.isMobile, '登录', `[${email}] 未找到“使用密码”链接`, 'error');
            }
        }
    }

    private async saveSnapshot(page: Page, email: string, filename: string) {
        this.bot.log(this.bot.isMobile, '调试模式', `[${email}] 正在保存页面快照 (${filename})...`, 'warn');
        try {
            await this.bot.utils.wait(2000);
            const htmlContent = await page.content();
            const sessionDir = path.join(__dirname, '..', '..', this.bot.config.sessionPath, email);
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }
            const snapshotPath = path.join(sessionDir, filename);
            fs.writeFileSync(snapshotPath, htmlContent);
            this.bot.log(this.bot.isMobile, '调试模式', `页面快照已成功保存到: ${snapshotPath}`, 'log', 'green');
        } catch (e) {
            this.bot.log(this.bot.isMobile, '调试模式', `保存页面快照失败: ${e}`, 'error');
        }
    }

    private async checkAccountLocked(page: Page) {
        await this.bot.utils.wait(2000);
        const isLocked = await page.waitForSelector('#serviceAbuseLandingTitle', { state: 'visible', timeout: 1000 }).then(() => true).catch(() => false);
        if (isLocked) {
            const email = await page.evaluate(() => (document.querySelector('#i0116') as HTMLInputElement | null)?.value || '未知邮箱');
            await sendPush('微软账户异常', `账户 ${email} 已被锁定！`);
            throw this.bot.log(this.bot.isMobile, '检查锁定', '此账户已被锁定！请从 "accounts.json" 中移除该账户并重启！', 'error');
        }
    }
}
