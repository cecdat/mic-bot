import fs from 'fs';
import path from 'path';
import { log } from './Logger';

// 定义账户状态的数据结构
interface AccountStatus {
    consecutiveFailures: number;
    frozenUntil?: number; // 记录熔断到的时间戳
}

// 定义状态文件的结构
interface StatusFile {
    [email: string]: AccountStatus;
}

const STATUS_FILE_PATH = path.join(__dirname, '..', 'browser', 'sessions', 'account_status.json');
const MAX_FAILURES = 3; // 连续失败3次后触发熔断
const FREEZE_DURATION_MS = 24 * 60 * 60 * 1000; // 熔断24小时

class AccountStatusManager {
    private statusData: StatusFile = {};

    constructor() {
        this.loadStatusFile();
    }

    private loadStatusFile(): void {
        try {
            if (fs.existsSync(STATUS_FILE_PATH)) {
                const fileContent = fs.readFileSync(STATUS_FILE_PATH, 'utf-8');
                this.statusData = JSON.parse(fileContent);
            }
        } catch (error) {
            log('main', '账户状态管理器', `读取状态文件失败: ${error}`, 'error');
            this.statusData = {};
        }
    }

    private saveStatusFile(): void {
        try {
            const dir = path.dirname(STATUS_FILE_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(this.statusData, null, 2));
        } catch (error) {
            log('main', '账户状态管理器', `保存状态文件失败: ${error}`, 'error');
        }
    }

    public recordSuccess(email: string): void {
        if (this.statusData[email]) {
            log('main', '账户状态管理器', `账户 ${email} 运行成功，重置失败计数。`);
            delete this.statusData[email];
            this.saveStatusFile();
        }
    }

    public recordFailure(email: string): void {
        if (!this.statusData[email]) {
            this.statusData[email] = { consecutiveFailures: 0 };
        }

        const status = this.statusData[email];
        status.consecutiveFailures++;

        log('main', '账户状态管理器', `账户 ${email} 运行失败，连续失败次数: ${status.consecutiveFailures}/${MAX_FAILURES}。`, 'warn');

        if (status.consecutiveFailures >= MAX_FAILURES) {
            status.frozenUntil = Date.now() + FREEZE_DURATION_MS;
            const frozenUntilDate = new Date(status.frozenUntil).toLocaleString('zh-CN');
            log('main', '账户状态管理器', `账户 ${email} 已被熔断，将在 ${frozenUntilDate} 后自动尝试。`, 'error');
        }

        this.saveStatusFile();
    }

    public isFrozen(email: string): boolean {
        const status = this.statusData[email];
        if (!status || !status.frozenUntil) {
            return false;
        }

        if (Date.now() > status.frozenUntil) {
            log('main', '账户状态管理器', `账户 ${email} 的熔断时间已过，将进行解封。`);
            delete this.statusData[email];
            this.saveStatusFile();
            return false;
        }

        const frozenUntilDate = new Date(status.frozenUntil).toLocaleString('zh-CN');
        log('main', '账户状态管理器', `账户 ${email} 当前处于熔断状态，将跳过本次任务 (解封时间: ${frozenUntilDate})。`, 'warn');
        return true;
    }
}

// 导出一个单例，确保整个应用中只有一个状态管理器实例
export const accountStatusManager = new AccountStatusManager();
