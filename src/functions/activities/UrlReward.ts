import { Page } from 'rebrowser-playwright'

import { Workers } from '../Workers'


export class UrlReward extends Workers {

    async doUrlReward(page: Page) {
        this.bot.log(this.bot.isMobile, 'URL奖励', '尝试完成URL奖励')

        try {
            this.bot.utils.wait(2000)

            await page.close()

            this.bot.log(this.bot.isMobile, 'URL奖励', '成功完成URL奖励')
        } catch (error) {
            await page.close()
            this.bot.log(this.bot.isMobile, 'URL奖励', `发生错误: ${error}`, 'error')
        }
    }

}
