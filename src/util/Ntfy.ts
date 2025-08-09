import { loadConfig } from './Load';
import axios from 'axios';

const NOTIFICATION_TYPES = {
    error: { priority: 'max', tags: 'rotating_light' },
    warn: { priority: 'high', tags: 'warning' },
    log: { priority: 'default', tags: 'medal_sports' }
};

export async function Ntfy(message: string, type: keyof typeof NOTIFICATION_TYPES = 'log'): Promise<void> {
    const config = loadConfig().ntfy; // Safely access the ntfy property
    if (!config || !config.enabled || !config.url || !config.topic) return;

    try {
        const { priority, tags } = NOTIFICATION_TYPES[type];
        const headers: Record<string, string> = {
            Title: 'Microsoft Rewards Script',
            Priority: priority,
            Tags: tags,
        };
        if (config.authToken) {
            headers['Authorization'] = `Bearer ${config.authToken}`;
        }

        await axios.post(`${config.url}/${config.topic}`, message, { headers });
    } catch (error) {
        // Silent fail to prevent crashing the main app
        console.error('Failed to send NTFY notification:', error);
    }
}
