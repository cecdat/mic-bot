import axios from 'axios';
import { log } from './Logger';

/**
 * 发送自定义推送通知
 * @param title 推送标题
 * @param content 推送内容
 */
export async function sendPush(title: string, content: string): Promise<void> {
    const pushUrl = `https://push.abc.xyz/zxc1231231/${encodeURIComponent(title)}/${encodeURIComponent(content)}`;

    try {
        await axios.get(pushUrl);
        // 为了避免在主日志中产生过多信息，推送成功后不额外输出日志
        // 如果需要调试，可以取消下面的注释
        // log('main', 'PUSH', '推送成功发送！');
    } catch (error) {
        log('main', 'PUSH', `推送发送失败: ${error}`, 'error');
    }
}
