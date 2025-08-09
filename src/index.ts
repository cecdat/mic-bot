import { exec, ExecException } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Page, Browser as PlaywrightBrowser } from 'rebrowser-playwright';
import Browser from './browser/Browser';
import BrowserFunc from './browser/BrowserFunc';
import BrowserUtil from './browser/BrowserUtil';
import { log } from './util/Logger';
import Util from './util/Utils';
import { loadAccounts, loadConfig, loadDailyPoints, saveDailyPoints } from './util/Load';
import { accountStatusManager } from './util/AccountStatusManager';
import { aiOrchestrator } from './util/AIOrcestrator';
import { Login } from './functions/Login';
import { Workers } from './functions/Workers';
import Activities from './functions/Activities';
import { Account } from './interface/Account';
import Axios from './util/Axios';
import axios from 'axios';

async function checkInNode() {
    const config = loadConfig();
    const apiConfig = config.apiServer;
    const utils = new Util();

    if (!apiConfig || !apiConfig.enabled || !apiConfig.updateUrl || !apiConfig.nodeName) {
        log('main', '节点管理', 'API未启用或节点名称未配置，跳过签到。', 'warn');
        return;
    }

    try {
        const checkinUrl = new URL(apiConfig.updateUrl);
        checkinUrl.pathname = '/bot_api/checkin';

        const payload: { node_name: string; heartbeat_timeout?: number } = {
            node_name: apiConfig.nodeName
        };

        if (apiConfig.heartbeatTimeout) {
            payload.heartbeat_timeout = utils.stringToMs(apiConfig.heartbeatTimeout) / 1000;
        }

        log('main', '节点管理', `向中心服务器签到/发送心跳: ${JSON.stringify(payload)}`);
        await axios.post(checkinUrl.toString(), payload, {
            headers: { 'Authorization': `Bearer ${apiConfig.token}` }
        });
        log('main', '节点管理', '节点签到/心跳成功。');
    } catch (error) {
        let errorMessage: string;
        if (axios.isAxiosError(error)) {
            errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        } else {
            errorMessage = String(error);
        }
        log('main', '节点管理', `节点签到/心跳失败: ${errorMessage}`, 'error');
    }
}

async function sendFinalUpdate(bot: MicrosoftRewardsBot, data: { email: string; total_points: number; daily_gain: number; desktop_gain: number; mobile_gain: number; }) {
    const apiConfig = bot.config.apiServer;
    if (!apiConfig || !apiConfig.enabled || !apiConfig.updateUrl || !apiConfig.token) {
        return;
    }
    
    const payload = { ...data, node_name: apiConfig.nodeName };

    try {
        log('main', '最终上报', `正在向中心API上报账户 ${data.email} 的积分数据...`);
        const updateUrl = new URL(apiConfig.updateUrl);
        updateUrl.pathname = '/bot_api/update_points';

        await bot.axios.request({
            url: updateUrl.toString(),
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiConfig.token}` },
            data: payload
        }, true);
        log('main', '最终上报', `账户 ${data.email} 的积分数据上报成功！`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('main', '最终上报', `向中心API上报积分失败: ${errorMessage}`, 'error');
    }
}

async function sendLoginStatusUpdate(bot: MicrosoftRewardsBot, type: 'pc' | 'mobile', status: boolean, code: number, message: string) {
    const apiConfig = bot.config.apiServer;
    if (!apiConfig || !apiConfig.enabled || !apiConfig.updateUrl) {
        return;
    }

    try {
        const statusUrl = new URL(apiConfig.updateUrl);
        statusUrl.pathname = '/bot_api/update_login_status';

        const payload = { email: bot.account.email, type, status, code, message };
        
        log(bot.isMobile, '状态上报', `上报登录状态: ${JSON.stringify(payload)}`);
        await axios.post(statusUrl.toString(), payload, {
            headers: { 'Authorization': `Bearer ${apiConfig.token}` }
        });

    } catch (error) {
        let errorMessage: string;
        if (axios.isAxiosError(error)) {
            errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        } else {
            errorMessage = String(error);
        }
        log(bot.isMobile, '状态上报', `上报登录状态失败: ${errorMessage}`, 'error');
    }
}

async function updateActivityStatus(status: 'Running' | 'Idle') {
    const config = loadConfig();
    const apiConfig = config.apiServer;
    if (!apiConfig || !apiConfig.enabled || !apiConfig.updateUrl) return;
    try {
        const apiUrl = new URL(apiConfig.updateUrl);
        apiUrl.pathname = '/bot_api/update_activity';
        await axios.post(apiUrl.toString(), 
            { activity_status: status },
            { headers: { 'Authorization': `Bearer ${apiConfig.token}` } }
        );
        log('main', '主流程', `向服务器报告当前状态: [${status}]`);
    } catch (error) { /* Silent fail */ }
}

async function runHotSearchScript(accounts: Account[]) {
    return new Promise<void>((resolve, reject) => {
        log('main', '热搜脚本', '开始执行 get_all_hots.py 脚本...');
        
        const baseDir = __dirname;
        const tempAccountsPath = path.join(baseDir, 'accounts.temp.json');
        const configPath = path.join(baseDir, 'config.json');
        const outputDir = path.join(baseDir, 'search_terms');

        fs.writeFileSync(tempAccountsPath, JSON.stringify(accounts, null, 2));

        const pythonCommand = `python3 get_all_hots.py --config_path "${configPath}" --accounts_path "${tempAccountsPath}" --output_dir "${outputDir}"`;
        
        exec(pythonCommand, (error: ExecException | null, stdout: string, stderr: string) => {
            fs.unlinkSync(tempAccountsPath);
            if (error) {
                log('main', '热搜脚本', `脚本执行失败: ${error.message}`, 'error');
                console.error(`stderr: ${stderr}`);
                reject(error);
                return;
            }
            log('main', '热搜脚本', `脚本执行成功。`);
            console.log(`stdout: ${stdout}`);
            resolve();
        });
    });
}

export class MicrosoftRewardsBot {
    public log: typeof log;
    public config;
    public utils: Util;
    public activities: Activities = new Activities(this);
    public browser: { func: BrowserFunc; utils: BrowserUtil; };
    public isMobile: boolean = false;
    public homePage!: Page;
    private browserFactory: Browser = new Browser(this);
    private workers: Workers;
    private login: Login;
    private accessToken: string = '';
    public axios!: Axios;
    public accountStatus: string = '未知';
    public account!: Account;
    public sendStatusUpdate: (type: 'pc' | 'mobile', status: boolean, code: number, message: string) => Promise<void>;

    constructor() {
        this.log = log;
        this.utils = new Util();
        this.workers = new Workers(this);
        this.browser = { func: new BrowserFunc(this), utils: new BrowserUtil(this) };
        this.config = loadConfig();
        this.login = new Login(this);
        this.sendStatusUpdate = (type, status, code, message) => sendLoginStatusUpdate(this, type, status, code, message);
    }
    
    private async Desktop(browser: PlaywrightBrowser, account: Account): Promise<{points: number, gain: number}> {
        this.isMobile = false;
        const context = await this.browserFactory.createContext(browser, account);
        const page = await context.newPage();
        try {
            log(this.isMobile, '主流程', `[${account.email}] 已创建桌面端上下文`);
            await this.login.login(page, account.email, account.password);
            const initialData = await this.browser.func.getDashboardData(page);
            const initialPoints = initialData.userStatus.availablePoints;
            const allTasks = aiOrchestrator.getAllIncompleteTasks(initialData);
            if (allTasks.length > 0) {
                const executionPlan = await aiOrchestrator.getTaskExecutionPlan(allTasks);
                for (const task of executionPlan) {
                    await this.workers.executeSingleTask(page, task);
                }
            }
            if (this.config.workers.doPunchCards) await this.workers.doPunchCard(page, initialData);
            const afterActivitiesData = await this.browser.func.getDashboardData(page);
            if (this.config.workers.doDesktopSearch) await this.activities.doSearch(page, afterActivitiesData, account.email);
            const finalData = await this.browser.func.getDashboardData(page);
            const finalPoints = finalData.userStatus.availablePoints;
            return { points: finalPoints, gain: finalPoints - initialPoints };
        } finally {
            await context.close();
        }
    }

    private async Mobile(browser: PlaywrightBrowser, account: Account): Promise<{points: number, gain: number}> {
        this.isMobile = true;
        const context = await this.browserFactory.createContext(browser, account);
        const page = await context.newPage();
        try {
            log(this.isMobile, '主流程', `[${account.email}] 已创建移动端上下文`);
            await this.login.login(page, account.email, account.password);
            const initialData = await this.browser.func.getDashboardData(page);
            const initialPoints = initialData.userStatus.availablePoints;
            const tokenPage = await context.newPage();
            try { this.accessToken = await this.login.getMobileAccessToken(tokenPage, account.email); }
            finally { await tokenPage.close(); }
            if (this.config.workers.doDailyCheckIn) await this.activities.doDailyCheckIn(this.accessToken, initialData);
            if (this.config.workers.doReadToEarn) await this.activities.doReadToEarn(this.accessToken, initialData);
            if (this.config.workers.doMobileSearch) {
                if (initialData.userStatus.counters.mobileSearch) {
                    await this.activities.doSearch(page, initialData, account.email);
                }
            }
            const finalData = await this.browser.func.getDashboardData(page);
            const finalPoints = finalData.userStatus.availablePoints;
            return { points: finalPoints, gain: finalPoints - initialPoints };
        } finally {
            await context.close();
        }
    }

    public async runFor(account: Account) {
        this.account = account;
        this.axios = new Axios(account.proxy);
        const browser = await this.browserFactory.launchBrowser(account);
        try {
            const todayStr = this.utils.getYYYYMMDD();
            const dailyPointsData = await loadDailyPoints(this.config.sessionPath, account.email);
            let initialPointsToday = 0;
            if (dailyPointsData && dailyPointsData.date === todayStr) {
                initialPointsToday = dailyPointsData.initialPoints;
            } else {
                const recoveryContext = await this.browserFactory.createContext(browser, account);
                const recoveryPage = await recoveryContext.newPage();
                try {
                    const data = await this.browser.func.getDashboardData(recoveryPage);
                    initialPointsToday = data.userStatus.availablePoints;
                    await saveDailyPoints(this.config.sessionPath, account.email, { date: todayStr, initialPoints: initialPointsToday });
                } finally {
                    await recoveryContext.close();
                }
            }
            
            const desktopResult = await this.Desktop(browser, account).catch(e => { log(false, 'Desktop-Error', e.message, 'error'); return {points: 0, gain: 0}});
            const mobileResult = await this.Mobile(browser, account).catch(e => { log(true, 'Mobile-Error', e.message, 'error'); return {points: 0, gain: 0}});
            
            const finalPoints = await this.browser.func.getDashboardData(await browser.newPage()).then(d => d.userStatus.availablePoints).catch(() => desktopResult.points > 0 ? desktopResult.points : 0);

            await sendFinalUpdate(this, {
                email: account.email,
                total_points: finalPoints,
                daily_gain: finalPoints - initialPointsToday,
                desktop_gain: desktopResult.gain,
                mobile_gain: mobileResult.gain
            });
        } finally {
            await browser.close();
        }
    }
}

async function runTasksForAccounts(accounts: Account[]) {
    for (const account of accounts) {
        if (accountStatusManager.isFrozen(account.email)) {
            continue; 
        }

        log('main', '主进程-WORKER', `开始为账户 ${account.email} 执行任务`);
        const bot = new MicrosoftRewardsBot();
        try {
            await bot.runFor(account);
            accountStatusManager.recordSuccess(account.email);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log('main', '主进程-WORKER', `账户 ${account.email} 的任务执行失败: ${errorMessage}`, 'error');
            accountStatusManager.recordFailure(account.email);
            await sendFinalUpdate(bot, {email: account.email, total_points: -1, daily_gain: -1, desktop_gain: 0, mobile_gain: 0});
        }
        log('main', '主进程-WORKER', `完成账户 ${account.email} 的所有任务流程。`, 'log', 'green');
    }
}

async function main() {
    log('main', '主流程', `Mic-Bot 执行节点已启动...`);
    
    const config = loadConfig();
    const utils = new Util();
    
    await checkInNode();
    const heartbeatIntervalMs = utils.stringToMs(config.apiServer?.heartbeatInterval || '5m');
    setInterval(checkInNode, heartbeatIntervalMs); 

    while (true) {
        try {
            log('main', '主流程', '正在向指挥中心请求指令 (长轮询)...');
            const commandUrl = new URL(config.apiServer.updateUrl);
            commandUrl.pathname = '/bot_api/command_poll';
            
            const response = await axios.get(commandUrl.toString(), {
                headers: { 'Authorization': `Bearer ${config.apiServer.token}` },
                timeout: 60000 
            });
            
            const command = response.data.command;

            if (command === 'RUN_TASKS') {
                log('main', '主流程', '收到 [执行任务] 指令，开始执行...');
                
                await updateActivityStatus('Running');
                
                const accounts = await loadAccounts();
                if (accounts.length > 0) {
                    await runHotSearchScript(accounts);
                    await runTasksForAccounts(accounts);
                } else {
                    log('main', '主流程', '未获取到分配的账户，本轮任务结束。');
                }
                
                await updateActivityStatus('Idle');
                log('main', '主流程', '所有任务执行完毕，返回待机状态。');

            } else {
                // No command, continue polling
            }

        } catch (error) {
            let errorMessage: string;
            if (axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
                errorMessage = '长轮询超时，正在发起下一次请求...';
            } else if (axios.isAxiosError(error)) {
                errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
            } else {
                errorMessage = String(error);
            }
            log('main', '主流程', `主循环出错: ${errorMessage}`, 'warn');
            await utils.wait(30000); 
        }
    }
}

main().catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('main', '主流程-致命错误', `运行机器人时发生致命错误: ${errorMessage}`, 'error');
    process.exit(1);
});