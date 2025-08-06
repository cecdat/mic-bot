import ms from 'ms'
import { Locator } from 'rebrowser-playwright'

export default class Util {

    async wait(ms: number): Promise<void> {
        return new Promise<void>((resolve) => {
            setTimeout(resolve, ms)
        })
    }

    async humanClick(locator: Locator): Promise<void> {
        await locator.hover({ timeout: 10000 });
        await this.wait(this.randomNumber(50, 200));
        await locator.dispatchEvent('mousedown');
        await this.wait(this.randomNumber(30, 100));
        await locator.dispatchEvent('mouseup');
        await locator.click({ force: true, timeout: 5000 });
    }

    getFormattedDate(ms = Date.now()): string {
        const today = new Date(ms)
        const month = String(today.getMonth() + 1).padStart(2, '0')
        const day = String(today.getDate()).padStart(2, '0')
        const year = today.getFullYear()

        return `${month}/${day}/${year}`
    }
    
    getYYYYMMDD(date = new Date()): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }


    shuffleArray<T>(array: T[]): T[] {
        return array.map(value => ({ value, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ value }) => value)
    }

    randomNumber(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    chunkArray<T>(arr: T[], numChunks: number): T[][] {
        const chunkSize = Math.ceil(arr.length / numChunks)
        const chunks: T[][] = []

        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize)
            chunks.push(chunk)
        }

        return chunks
    }

    stringToMs(input: string | number): number {
        const milisec = ms(input.toString())
        if (!milisec) {
            // [核心修改] 将错误信息中文化
            throw new Error('提供的时间字符串无法被正确解析！请使用类似 "1 min", "1m" 或 "1 minutes" 的格式。')
        }
        return milisec
    }

}