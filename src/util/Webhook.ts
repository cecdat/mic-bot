import axios from 'axios';
import { Config } from '../interface/Config';

export async function Webhook(configData: Config, content: string) {
    const webhook = configData.webhook; // Safely access the webhook property
    if (!webhook || !webhook.enabled || !webhook.url || webhook.url.length < 10) return;

    try {
        await axios.post(webhook.url, { content: content }, { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        // Silent fail
        console.error('Failed to send webhook notification:', error);
    }
}
