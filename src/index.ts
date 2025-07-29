import cluster from 'cluster'
import { Page } from 'rebrowser-playwright'

import Browser from './browser/Browser'
import BrowserFunc from './browser/BrowserFunc'
import BrowserUtil from './browser/BrowserUtil'

import { log } from './util/Logger'
import Util from './util/Utils'
import { loadAccounts, loadConfig, loadDailyPoints, saveDailyPoints } from './util/Load'
import { sendPush } from './util/Push'

import { Login } from './functions/Login'
import { Workers } from './functions/Workers'
import Activities from './functions/Activities'

import { Account } from './interface/Account'
import Axios from './util/Axios'

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
    private login = new Login(this)
    private accessToken: string = ''

    public axios!: Axios

    constructor() {
        this.log = log
        this.utils = new Util()
        this.workers = new Workers(this)
        this.browser = {
            func: new BrowserFunc(this),
            utils: new BrowserUtil(this)
        }
        this.config = loadConfig()
    }
    
    private async Desktop(account: Account): Promise<number> {
        this.isMobile = false;
        const browser = await this.browserFactory.createBrowser(account)
        const page = await browser.newPage()
        log(this.isMobile, '主流程', `[${account.email}] 启动桌面端浏览器`)

        await this.login.login(page, account.email, account.password)
        
        const data = await this.browser.func.getDashboardData(page);
        
        // [核心修改] 每日积分记录逻辑
        const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const dailyPointsData = await loadDailyPoints(this.config.sessionPath, account.email);
        let initialPointsToday: number;

        if (dailyPointsData && dailyPointsData.date === todayStr) {
            // 如果是今天，直接使用记录的初始积分
            initialPointsToday = dailyPointsData.initialPoints;
            log(this.isMobile, '积分统计', `[${account.email}] 读取到今日初始积分: ${initialPointsToday}`);
        } else {
            // 如果是新的一天或没有记录，记录新的初始积分
            initialPointsToday = data.userStatus.availablePoints;
            await saveDailyPoints(this.config.sessionPath, account.email, { date: todayStr, initialPoints: initialPointsToday });
            log(this.isMobile, '积分统计', `[${account.email}] 记录今日新的初始积分: ${initialPointsToday}`);
        }
        
        const browserEnarablePoints = this.browser.func.getBrowserEarnablePoints(data);
        const pointsCanCollect = browserEnarablePoints.dailySetPoints + browserEnarablePoints.desktopSearchPoints + browserEnarablePoints.morePromotionsPoints
        log(this.isMobile, '积分统计', `[${account.email}] 桌面端可赚取 ${pointsCanCollect} 积分`)

        if (!this.config.runOnZeroPoints && pointsCanCollect === 0) {
            log(this.isMobile, '主流程', `[${account.email}] 桌面端无积分可赚取，跳过任务。`, 'log', 'yellow')
        } else {
            const workerPage = await browser.newPage()
            await this.browser.func.goHome(workerPage)
            if (this.config.workers.doDailySet) await this.workers.doDailySet(workerPage, data)
            if (this.config.workers.doMorePromotions) await this.workers.doMorePromotions(workerPage, data)
            if (this.config.workers.doPunchCards) await this.workers.doPunchCard(workerPage, data)
            if (this.config.workers.doDesktopSearch) await this.activities.doSearch(workerPage, data)
        }
        
        await this.browser.func.closeBrowser(browser, account.email)
        return initialPointsToday; // 返回今天的初始积分
    }

    private async Mobile(account: Account, initialPointsToday: number) {
        this.isMobile = true;
        const browser = await this.browserFactory.createBrowser(account)
        const page = await browser.newPage()
        log(this.isMobile, '主流程', `[${account.email}] 启动移动端浏览器`)

        await this.login.login(page, account.email, account.password)

        log(this.isMobile, '主流程', `[${account.email}] 正在打开临时页面以安全获取AccessToken...`);
        const tokenPage = await browser.newPage();
        try {
            this.accessToken = await this.login.getMobileAccessToken(tokenPage, account.email);
        } finally {
            await tokenPage.close();
            log(this.isMobile, '主流程', `[${account.email}] 临时页面已关闭，返回主流程。`);
        }
        
        const data = await this.browser.func.getDashboardData(page);

        const browserEnarablePoints = this.browser.func.getBrowserEarnablePoints(data);
        const appEarnablePoints = await this.browser.func.getAppEarnablePoints(data, this.accessToken);
        const pointsCanCollect = browserEnarablePoints.mobileSearchPoints + appEarnablePoints.totalEarnablePoints
        log(this.isMobile, '积分统计', `[${account.email}] 移动端可赚取 ${pointsCanCollect} 积分 (浏览器: ${browserEnarablePoints.mobileSearchPoints}, App: ${appEarnablePoints.totalEarnablePoints})`)

        if (!this.config.runOnZeroPoints && pointsCanCollect === 0) {
            log(this.isMobile, '主流程', `[${account.email}] 移动端无积分可赚取，跳过任务。`, 'log', 'yellow')
        } else {
            if (this.config.workers.doDailyCheckIn) await this.activities.doDailyCheckIn(this.accessToken, data)
            if (this.config.workers.doReadToEarn) await this.activities.doReadToEarn(this.accessToken, data)
            if (this.config.workers.doMobileSearch) {
                if (data.userStatus.counters.mobileSearch) {
                    const workerPage = await browser.newPage()
                    await this.browser.func.goHome(workerPage)
                    await this.activities.doSearch(workerPage, data)
                } else {
                    log(this.isMobile, '主流程', `[${account.email}] 无法获取移动端搜索积分，您的账户可能太“新”了！`, 'warn')
                }
            }
        }
        
        const finalData = await this.browser.func.getDashboardData(page);
        const finalPoints = finalData.userStatus.availablePoints;
        
        // [核心修改] 使用今天的初始积分进行计算
        const totalPointsCollected = finalPoints - initialPointsToday;
        const summaryMessage = `账户 ${account.email} 今日共获得 ${totalPointsCollected} 积分 (初始: ${initialPointsToday}, 最终: ${finalPoints})。`;
        
        log(this.isMobile, '积分统计', summaryMessage, 'log', 'green');
        await sendPush('每日积分统计', summaryMessage);

        await this.browser.func.closeBrowser(browser, account.email)
    }

    public async runFor(account: Account) {
        this.axios = new Axios(account.proxy);
        let initialPointsToday = 0;

        try {
            initialPointsToday = await this.Desktop(account);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(false, '主流程-错误', `[${account.email}] 桌面端任务执行失败: ${errorMessage}`, 'error');
            try {
                // [核心修改] 即使桌面端失败，也要确保能正确获取或记录当日初始积分
                this.isMobile = false;
                const browser = await this.browserFactory.createBrowser(account);
                const page = await browser.newPage();
                await this.login.login(page, account.email, account.password);
                
                const todayStr = new Date().toISOString().slice(0, 10);
                const dailyPointsData = await loadDailyPoints(this.config.sessionPath, account.email);
                if (dailyPointsData && dailyPointsData.date === todayStr) {
                    initialPointsToday = dailyPointsData.initialPoints;
                } else {
                    const data = await this.browser.func.getDashboardData(page);
                    initialPointsToday = data.userStatus.availablePoints;
                    await saveDailyPoints(this.config.sessionPath, account.email, { date: todayStr, initialPoints: initialPointsToday });
                }
                
                await this.browser.func.closeBrowser(browser, account.email);
                log(false, '主流程-恢复', `[${account.email}] 已重新获取今日初始积分: ${initialPointsToday}，准备执行移动端任务。`);
            } catch (recoveryError) {
                const recoveryErrorMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
                log(false, '主流程-错误', `[${account.email}] 尝试恢复并获取初始积分失败: ${recoveryErrorMessage}，移动端任务将从0积分开始计算。`, 'error');
            }
        }
        
        await this.Mobile(account, initialPointsToday);
    }
}

async function runTasksForAccounts(accounts: Account[]) {
    for (const account of accounts) {
        log('main', '主进程-WORKER', `开始为账户 ${account.email} 执行任务`);
        try {
            const bot = new MicrosoftRewardsBot();
            await bot.runFor(account);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log('main', '主进程-WORKER', `账户 ${account.email} 的任务执行失败: ${errorMessage}`, 'error');
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
