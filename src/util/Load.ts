import { BrowserContext, Cookie } from 'rebrowser-playwright'
import { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { log } from './Logger'

import { Account } from '../interface/Account'
import { Config, ConfigSaveFingerprint } from '../interface/Config'

let configCache: Config;

export interface DailyPoints {
    date: string;
    initialPoints: number;
}

export interface NodeConfig {
    cron_schedule: string;
    min_sleep_minutes: number;
    max_sleep_minutes: number;
    clusters: number;
    search_delay_min: string;
    search_delay_max: string;
}

export async function loadNodeConfig(): Promise<NodeConfig | null> {
    const config = loadConfig();
    const apiConfig = config.apiServer;

    if (!apiConfig || !apiConfig.enabled || !apiConfig.updateUrl || !apiConfig.nodeName) {
        log('main', '配置加载', 'API未启用，无法从服务器加载节点配置。', 'warn');
        return null;
    }

    try {
        const apiUrl = new URL(apiConfig.updateUrl);
        apiUrl.pathname = '/bot_api/get_config';
        
        const response = await axios.get(apiUrl.toString(), {
            headers: { 'Authorization': `Bearer ${apiConfig.token}` }
        });
        
        log('main', '配置加载', '成功从服务器加载节点配置。');
        return response.data;

    } catch (error) {
        let errorMessage: string;
        if (axios.isAxiosError(error)) {
            errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        } else { errorMessage = String(error); }
        log('main', '配置加载', `从服务器加载节点配置失败: ${errorMessage}`, 'error');
        return null;
    }
}


export async function loadAccounts(): Promise<Account[]> {
    const config = loadConfig();
    const apiConfig = config.apiServer;
    
    if (!apiConfig || !apiConfig.enabled || !apiConfig.updateUrl || !apiConfig.nodeName) {
        log('main', '账户加载', 'API未启用或节点名称未配置，将从本地 accounts.json 加载账户。', 'warn');
        try {
            const accountDir = path.join(__dirname, '../', 'accounts.json');
            if (!fs.existsSync(accountDir)) {
                log('main', '账户加载', '本地 accounts.json 文件不存在，返回空账户列表。', 'error');
                return [];
            }
            const accounts = fs.readFileSync(accountDir, 'utf-8');
            return JSON.parse(accounts);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log('main', '账户加载', `读取本地 accounts.json 失败: ${errorMessage}`, 'error');
            return [];
        }
    }

    try {
        const apiUrl = new URL(apiConfig.updateUrl);
        apiUrl.pathname = '/bot_api/accounts';
        apiUrl.searchParams.set('node_name', apiConfig.nodeName);

        log('main', '账户加载', `正在从API获取分配给节点 [${apiConfig.nodeName}] 的账户...`);
        
        const response = await axios.get(apiUrl.toString(), {
            headers: { 'Authorization': `Bearer ${apiConfig.token}` }
        });
        
        log('main', '账户加载', `成功获取到 ${response.data.length} 个账户。`);
        return response.data;

    } catch (error) {
        let errorMessage: string;
        if (axios.isAxiosError(error)) {
            errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        } else { errorMessage = String(error); }
        log('main', '账户加载', `从API获取账户列表失败: ${errorMessage}`, 'error');
        return [];
    }
}

export function loadConfig(): Config {
    if (configCache) {
        return configCache;
    }
    try {
        const configDir = path.join(__dirname, '../', 'config.json');
        const config = fs.readFileSync(configDir, 'utf-8');
        configCache = JSON.parse(config);
        return configCache;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`读取 config.json 失败: ${errorMessage}`);
    }
}

export async function loadDailyPoints(sessionPath: string, email: string): Promise<DailyPoints | null> {
    try {
        const pointsFile = path.join(__dirname, '../../sessions', email, 'daily_points.json');
        if (fs.existsSync(pointsFile)) {
            const pointsData = await fs.promises.readFile(pointsFile, 'utf-8');
            return JSON.parse(pointsData);
        }
        return null;
    } catch (error) {
        return null;
    }
}

export async function saveDailyPoints(sessionPath: string, email: string, data: DailyPoints): Promise<void> {
    try {
        const sessionDir = path.join(__dirname, '../../sessions', email);
        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true });
        }
        await fs.promises.writeFile(path.join(sessionDir, 'daily_points.json'), JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Failed to save daily points for ${email}:`, error);
    }
}


export async function loadSessionData(sessionPath: string, email: string, isMobile: boolean, saveFingerprint: ConfigSaveFingerprint) {
    try {
        const cookieFile = path.join(__dirname, '../../sessions', email, `${isMobile ? 'mobile_cookies' : 'desktop_cookies'}.json`)
        let cookies: Cookie[] = []
        if (fs.existsSync(cookieFile)) {
            const cookiesData = await fs.promises.readFile(cookieFile, 'utf-8')
            cookies = JSON.parse(cookiesData)
        }

        const fingerprintFile = path.join(__dirname, '../../sessions', email, `${isMobile ? 'mobile_fingerpint' : 'desktop_fingerpint'}.json`)
        let fingerprint!: BrowserFingerprintWithHeaders
        if (((saveFingerprint.desktop && !isMobile) || (saveFingerprint.mobile && isMobile)) && fs.existsSync(fingerprintFile)) {
            const fingerprintData = await fs.promises.readFile(fingerprintFile, 'utf-8')
            fingerprint = JSON.parse(fingerprintData)
        }
        return {
            cookies: cookies,
            fingerprint: fingerprint
        }
    } catch (error) {
        throw new Error(error as string)
    }
}

export async function saveSessionData(sessionPath: string, browser: BrowserContext, email: string, isMobile: boolean): Promise<string> {
    try {
        const cookies = await browser.cookies()
        const sessionDir = path.join(__dirname, '../../sessions', email)
        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true })
        }
        await fs.promises.writeFile(path.join(sessionDir, `${isMobile ? 'mobile_cookies' : 'desktop_cookies'}.json`), JSON.stringify(cookies))
        return sessionDir
    } catch (error) {
        throw new Error(error as string)
    }
}

export async function saveFingerprintData(sessionPath: string, email: string, isMobile: boolean, fingerpint: BrowserFingerprintWithHeaders): Promise<string> {
    try {
        const sessionDir = path.join(__dirname, '../../sessions', email)
        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true })
        }
        await fs.promises.writeFile(path.join(sessionDir, `${isMobile ? 'mobile_fingerpint' : 'desktop_fingerpint'}.json`), JSON.stringify(fingerpint))
        return sessionDir
    } catch (error) {
        throw new Error(error as string)
    }
}