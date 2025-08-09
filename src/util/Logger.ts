import chalk from 'chalk';
import { Webhook } from './Webhook';
import { Ntfy } from './Ntfy';
import { loadConfig } from './Load';

export async function log(isMobile: boolean | 'main', title: string, message: string, type: 'log' | 'warn' | 'error' = 'log', color?: keyof typeof chalk) {
    const configData = loadConfig();

    // [CORE FIX] Safely check if logExcludeFunc exists and is an array before using it.
    if (Array.isArray(configData.logExcludeFunc) && configData.logExcludeFunc.some((x: string) => x.toLowerCase() === title.toLowerCase())) {
        return;
    }

    const currentTime = new Date().toLocaleString();
    const platformText = isMobile === 'main' ? '主进程' : isMobile ? '移动端' : '桌面端';
    const chalkedPlatform = isMobile === 'main' ? chalk.bgCyan('主进程') : isMobile ? chalk.bgBlue('移动端') : chalk.bgMagenta('桌面端');

    const cleanStr = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${platformText} [${title}] ${message}`;

    // [CORE FIX] Safely check if webhookLogExcludeFunc exists.
    if (!Array.isArray(configData.webhookLogExcludeFunc) || !configData.webhookLogExcludeFunc.some((x: string) => x.toLowerCase() === title.toLowerCase())) {
        Webhook(configData, cleanStr);
    }
    
    // Ntfy function has its own internal safety checks.
    await Ntfy(cleanStr, type);

    const str = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${chalkedPlatform} [${title}] ${message}`;
    const applyChalk = color && typeof chalk[color] === 'function' ? chalk[color] as (msg: string) => string : null;

    switch (type) {
        case 'warn':
            applyChalk ? console.warn(applyChalk(str)) : console.warn(str);
            break;
        case 'error':
            applyChalk ? console.error(applyChalk(str)) : console.error(str);
            break;
        default:
            applyChalk ? console.log(applyChalk(str)) : console.log(str);
            break;
    }
}
