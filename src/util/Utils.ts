import ms from 'ms'
import { Locator } from 'rebrowser-playwright'

export default class Util {

    async wait(ms: number): Promise<void> {
        return new Promise<void>((resolve) => {
            setTimeout(resolve, ms)
        })
    }

    // [新增] 模拟真人点击的函数
    async humanClick(locator: Locator): Promise<void> {
        // 模拟鼠标移动到元素上
        await locator.hover({ timeout: 10000 });
        // 模拟点击前的短暂思考
        await this.wait(this.randomNumber(50, 200));
        // 模拟鼠标按下
        await locator.dispatchEvent('mousedown');
        // 模拟按下的持续时间
        await this.wait(this.randomNumber(30, 100));
        // 模拟鼠标松开，完成点击
        await locator.dispatchEvent('mouseup');
        // 触发click事件确保兼容性
        await locator.click({ force: true, timeout: 5000 });
    }

    getFormattedDate(ms = Date.now()): string {
        const today = new Date(ms)
        const month = String(today.getMonth() + 1).padStart(2, '0')  // January is 0
        const day = String(today.getDate()).padStart(2, '0')
        const year = today.getFullYear()

        return `${month}/${day}/${year}`
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
            throw new Error('The string provided cannot be parsed to a valid time! Use a format like "1 min", "1m" or "1 minutes"')
        }
        return milisec
    }

}
