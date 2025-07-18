import chalk from 'chalk'
import { Webhook } from './Webhook'
import { Ntfy } from './Ntfy'
import { loadConfig } from './Load'


export async function log(isMobile: boolean | 'main', title: string, message: string, type: 'log' | 'warn' | 'error' = 'log', color?: keyof typeof chalk) {
    const configData = loadConfig()

    if (configData.logExcludeFunc.some(x => x.toLowerCase() === title.toLowerCase())) {
        return
    }

    const currentTime = new Date().toLocaleString()
    // 将平台文本标识改为中文
    const platformText = isMobile === 'main' ? '主进程' : isMobile ? '移动端' : '桌面端'
    const chalkedPlatform = isMobile === 'main' ? chalk.bgCyan('主进程') : isMobile ? chalk.bgBlue('移动端') : chalk.bgMagenta('桌面端')


    // 为Webhook准备的干净字符串 (无颜色代码)
    const cleanStr = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${platformText} [${title}] ${message}`

    // 发送到Webhook
    if (!configData.webhookLogExcludeFunc.some(x => x.toLowerCase() === title.toLowerCase())) {
        Webhook(configData, cleanStr)
    }

    // 定义发送到NTFY的条件
    const ntfyConditions = {
        log: [
            message.toLowerCase().includes('started tasks for account'), // 英文关键词保留，以兼容原有逻辑
            message.toLowerCase().includes('press the number'),
            message.toLowerCase().includes('completed tasks for account'),
            message.toLowerCase().includes('the script collected'),
            message.toLowerCase().includes('no points to earn'),
            // 添加中文关键词
            message.includes('开始执行账户任务'),
            message.includes('请输入数字'),
            message.includes('完成账户任务'),
            message.includes('脚本今天总共获取了'),
            message.includes('没有可赚取的积分'),
        ],
        error: [], 
        warn: [
            message.toLowerCase().includes('aborting'),
            message.toLowerCase().includes('didn\'t gain'),
            // 添加中文关键词
            message.includes('中止'),
            message.includes('未获得积分'),
        ] 
    }

    // 检查当前的日志类型和消息是否满足NTFY条件
    if (type in ntfyConditions && ntfyConditions[type as keyof typeof ntfyConditions].some(condition => condition))
        await Ntfy(cleanStr, type)

    // 为终端日志格式化字符串
    const str = `[${currentTime}] [PID: ${process.pid}] [${type.toUpperCase()}] ${chalkedPlatform} [${title}] ${message}`

    const applyChalk = color && typeof chalk[color] === 'function' ? chalk[color] as (msg: string) => string : null

    // 根据类型输出日志
    switch (type) {
        case 'warn':
            applyChalk ? console.warn(applyChalk(str)) : console.warn(str)
            break

        case 'error':
            applyChalk ? console.error(applyChalk(str)) : console.error(str)
            break

        default:
            applyChalk ? console.log(applyChalk(str)) : console.log(str)
            break
    }
}
