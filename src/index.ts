import cluster from 'cluster'
import { Page, Browser as PlaywrightBrowser } from 'rebrowser-playwright'
import Browser from './browser/Browser'
import BrowserFunc from './browser/BrowserFunc'
import BrowserUtil from './browser/BrowserUtil'
import { log } from './util/Logger'
import Util from './util/Utils'
import { loadAccounts, loadConfig, loadDailyPoints, saveDailyPoints } from './util/Load'
import { sendPush } from './util/Push'
import { accountStatusManager } from './util/AccountStatusManager'
import { aiOrchestrator } from './util/AIOrcestrator'
import { Login } from './functions/Login'
import { Workers } from './functions/Workers'
import Activities from './functions/Activities'
import { Account } from './interface/Account'
import Axios from './util/Axios'

async function sendFinalUpdate(bot: MicrosoftRewardsBot, data: { email: string, total_points: number, daily_gain: number }) {
    const apiConfig = bot.config.apiServer;
    if (!apiConfig || !apiConfig.enabled || !apiConfig.updateUrl || !apiConfig.token) {
        return;
    }
    
    const payload = {
        ...data,
        status: bot.accountStatus,
        node_name: apiConfig.nodeName || '默认节点'
    };

    try {
        log('main', '最终上报', `正在向中心API上报账户 ${data.email} 的最终数据 (状态: ${payload.status}, 节点: ${payload.node_name})...`);
        await bot.axios.request({
            url: apiConfig.updateUrl,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiConfig.token}`
            },
            data: payload
        }, true);
        log('main', '最终上报', `账户 ${data.email} 的最终数据上报成功！`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('main', '最终上报', `向中心API上报最终数据失败: ${errorMessage}`, 'error');
    }
}

export class MicrosoftRewardsBot {
    public log: typeof log
    public config
    public utils: Util
    public activities: Activities = new Activities(this)
    public browser: {
        func: BrowserFunc,
        utils: BrowserUtil
    }
    public isMobile: boolean = false;
    public homePage!: Page
    private browserFactory: Browser = new Browser(this)
    private workers: Workers
    private login: Login
    private accessToken: string = ''
    public axios!: Axios
    public accountStatus: string = '未知';

    constructor() {
        this.log = log
        this.utils = new Util()
        this.workers = new Workers(this)
        this.browser = {
            func: new BrowserFunc(this),
            utils: new BrowserUtil(this)
        }
        this.config = loadConfig()
        this.login = new Login(this)
    }
    
    private async Desktop(browser: PlaywrightBrowser, account: Account): Promise<number> {
        this.isMobile = false;
        const context = await this.browserFactory.createContext(browser, account);
        const page = await context.newPage();
        
        try {
            log(this.isMobile, '主流程', `[${account.email}] 已创建桌面端上下文`);
            await this.login.login(page, account.email, account.password);
            
            const data = await this.browser.func.getDashboardData(page);
            
            // [核心修正] 使用新的、基于本地时区的日期函数
            const todayStr = this.utils.getYYYYMMDD();
            const dailyPointsData = await loadDailyPoints(this.config.sessionPath, account.email);
            let initialPointsToday: number;

            if (dailyPointsData && dailyPointsData.date === todayStr) {
                initialPointsToday = dailyPointsData.initialPoints;
                log(this.isMobile, '积分统计', `[${account.email}] 读取到今日初始积分: ${initialPointsToday}`);
            } else {
                initialPointsToday = data.userStatus.availablePoints;
                await saveDailyPoints(this.config.sessionPath, account.email, { date: todayStr, initialPoints: initialPointsToday });
                log(this.isMobile, '积分统计', `[${account.email}] 记录今日新的初始积分: ${initialPointsToday}`);
            }
            
            const allTasks = aiOrchestrator.getAllIncompleteTasks(data);
            if (allTasks.length > 0) {
                const executionPlan = await aiOrchestrator.getTaskExecutionPlan(allTasks);

                log(this.isMobile, '主流程', `[${account.email}] AI任务计划已生成，开始执行...`);
                for (const task of executionPlan) {
                    await this.workers.executeSingleTask(page, task);
                }
                log(this.isMobile, '主流程', `[${account.email}] AI任务计划执行完毕。`);
            } else {
                log(this.isMobile, '主流程', `[${account.email}] 没有可由AI调度的日常任务。`);
            }

            if (this.config.workers.doPunchCards) await this.workers.doPunchCard(page, data);
            
            const freshData = await this.browser.func.getDashboardData(page);
            if (this.config.workers.doDesktopSearch) await this.activities.doSearch(page, freshData, account.email);
            
            return initialPointsToday;
        } finally {
            await context.close();
            log(this.isMobile, '主流程', `[${account.email}] 已关闭桌面端上下文`);
        }
    }

    private async Mobile(browser: PlaywrightBrowser, account: Account, initialPointsToday: number) {
        this.isMobile = true;
        const context = await this.browserFactory.createContext(browser, account);
        const page = await context.newPage();

        try {
            log(this.isMobile, '主流程', `[${account.email}] 已创建移动端上下文`);
            await this.login.login(page, account.email, account.password);

            log(this.isMobile, '主流程', `[${account.email}] 正在打开临时页面以安全获取AccessToken...`);
            const tokenPage = await context.newPage();
            try {
                this.accessToken = await this.login.getMobileAccessToken(tokenPage, account.email);
            } finally {
                await tokenPage.close();
                log(this.isMobile, '主流程', `[${account.email}] 临时页面已关闭，返回主流程。`);
            }
            
            const data = await this.browser.func.getDashboardData(page);

            const browserEnarablePoints = this.browser.func.getBrowserEarnablePoints(data);
            const appEarnablePoints = await this.browser.func.getAppEarnablePoints(data, this.accessToken);
            const pointsCanCollect = browserEnarablePoints.mobileSearchPoints + appEarnablePoints.totalEarnablePoints;
            log(this.isMobile, '积分统计', `[${account.email}] 移动端可赚取 ${pointsCanCollect} 积分 (浏览器: ${browserEnarablePoints.mobileSearchPoints}, App: ${appEarnablePoints.totalEarnablePoints})`);

            if (!this.config.runOnZeroPoints && pointsCanCollect === 0) {
                log(this.isMobile, '主流程', `[${account.email}] 移动端无积分可赚取，跳过任务。`, 'log', 'yellow');
            } else {
                if (this.config.workers.doDailyCheckIn) await this.activities.doDailyCheckIn(this.accessToken, data);
                if (this.config.workers.doReadToEarn) await this.activities.doReadToEarn(this.accessToken, data);
                if (this.config.workers.doMobileSearch) {
                    if (data.userStatus.counters.mobileSearch) {
                        const workerPage = await context.newPage();
                        await this.browser.func.goHome(workerPage);
                        await this.activities.doSearch(workerPage, data, account.email);
                    } else {
                        log(this.isMobile, '主流程', `[${account.email}] 无法获取移动端搜索积分，您的账户可能太“新”了！`, 'warn');
                    }
                }
            }
            
            const finalData = await this.browser.func.getDashboardData(page);
            const finalPoints = finalData.userStatus.availablePoints;
            const totalPointsCollected = finalPoints - initialPointsToday;
            const summaryMessage = `账户 ${account.email} 今日共获得 ${totalPointsCollected} 积分 (初始: ${initialPointsToday}, 最终: ${finalPoints})。`;
            
            log(this.isMobile, '积分统计', summaryMessage, 'log', 'green');
            await sendPush('每日积分统计', summaryMessage);

            await sendFinalUpdate(this, {
                email: account.email,
                total_points: finalPoints,
                daily_gain: totalPointsCollected
            });

        } finally {
            await context.close();
            log(this.isMobile, '主流程', `[${account.email}] 已关闭移动端上下文`);
        }
    }

    public async runFor(account: Account) {
        this.axios = new Axios(account.proxy);
        const browser = await this.browserFactory.launchBrowser(account);
        
        try {
            let initialPointsToday = 0;
            try {
                initialPointsToday = await this.Desktop(browser, account);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                log(false, '主流程-错误', `[${account.email}] 桌面端任务执行失败: ${errorMessage}`, 'error');
                
                this.isMobile = false; 
                const recoveryContext = await this.browserFactory.createContext(browser, account);
                const recoveryPage = await recoveryContext.newPage();
                try {
                    await this.login.login(recoveryPage, account.email, account.password);
                    
                    // [核心修正] 在错误恢复流程中也使用新的日期函数
                    const todayStr = this.utils.getYYYYMMDD();
                    const dailyPointsData = await loadDailyPoints(this.config.sessionPath, account.email);
                    if (dailyPointsData && dailyPointsData.date === todayStr) {
                        initialPointsToday = dailyPointsData.initialPoints;
                    } else {
                        const data = await this.browser.func.getDashboardData(recoveryPage);
                        initialPointsToday = data.userStatus.availablePoints;
                        await saveDailyPoints(this.config.sessionPath, account.email, { date: todayStr, initialPoints: initialPointsToday });
                    }
                    log(false, '主流程-恢复', `[${account.email}] 已重新获取今日初始积分: ${initialPointsToday}，准备执行移动端任务。`);
                } catch (recoveryError) {
                    const recoveryErrorMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
                    log(false, '主流程-错误', `[${account.email}] 尝试恢复并获取初始积分失败: ${recoveryErrorMessage}，移动端任务将从0积分开始计算。`, 'error');
                } finally {
                    await recoveryContext.close();
                }
            }
            
            await this.Mobile(browser, account, initialPointsToday);

        } finally {
            await browser.close();
            log('main', '浏览器', `[${account.email}] 浏览器主进程已关闭`);
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
            await sendFinalUpdate(bot, {email: account.email, total_points: -1, daily_gain: -1});
        }
        log('main', '主进程-WORKER', `完成账户 ${account.email} 的所有任务流程。`, 'log', 'green');
    }
}

async function main() {
    log('main', '主进程', `机器人已启动`);
    const accounts = loadAccounts();
    const config = loadConfig();

    if (config.clusters > 1 && cluster.isPrimary) {
        log('main', '主进程-PRIMARY', '主进程已启动');
        const accountChunks = new Util().chunkArray(accounts, config.clusters);
        let activeWorkers = accountChunks.length;
        for (const chunk of accountChunks) {
            const worker = cluster.fork();
            worker.send({ chunk });
        }
        cluster.on('exit', (worker, code) => {
            activeWorkers--;
            log('main', '主进程-WORKER', `工作进程 ${worker.process.pid} 已销毁 | 代码: ${code} | 活跃工作进程数: ${activeWorkers}`, 'warn');
            if (activeWorkers === 0) {
                log('main', '主进程-WORKER', '所有工作进程已销毁。正在退出主进程！', 'warn');
                process.exit(0);
            }
        });
    } else if (config.clusters > 1 && cluster.isWorker) {
        log('main', '主进程-WORKER', `工作进程 ${process.pid} 已生成`);
        process.on('message', async (message: { chunk: Account[] }) => {
            await runTasksForAccounts(message.chunk);
            process.exit(0);
        });
    } else {
        await runTasksForAccounts(accounts);
        log('main', '主进程', '所有账户任务已完成！');
        process.exit(0);
    }
}

main().catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('main', '主进程-错误', `运行机器人时发生致命错误: ${errorMessage}`, 'error');
    process.exit(1);
});