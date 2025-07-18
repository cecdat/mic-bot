import { Page } from 'rebrowser-playwright'

import { Workers } from '../Workers'


export class ThisOrThat extends Workers {

    async doThisOrThat(page: Page) {
        this.bot.log(this.bot.isMobile, '二选一', '尝试完成二选一问答')


        try {
            // 检查测验是否已开始
            const quizNotStarted = await page.waitForSelector('#rqStartQuiz', { state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)
            if (quizNotStarted) {
                await page.click('#rqStartQuiz')
            } else {
                this.bot.log(this.bot.isMobile, '二选一', '二选一问答已开始，尝试完成它')
            }

            await this.bot.utils.wait(2000)

            // 解决
            const quizData = await this.bot.browser.func.getQuizData(page)
            const questionsRemaining = quizData.maxQuestions - (quizData.currentQuestionNumber - 1) // 剩余问题数量

            for (let question = 0; question < questionsRemaining; question++) {
                // 由于还没有解决逻辑，随机猜测以完成
                const buttonId = `#rqAnswerOption${Math.floor(this.bot.utils.randomNumber(0, 1))}`
                await page.click(buttonId)

                const refreshSuccess = await this.bot.browser.func.waitForQuizRefresh(page)
                if (!refreshSuccess) {
                    await page.close()
                    this.bot.log(this.bot.isMobile, '测验', '发生错误，刷新失败', 'error')
                    return
                }
            }

            this.bot.log(this.bot.isMobile, '二选一', '成功完成二选一问答')
        } catch (error) {
            await page.close()
            this.bot.log(this.bot.isMobile, '二选一', `发生错误: ${error}`, 'error')
        }
    }

}
