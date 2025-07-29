import { Page } from 'rebrowser-playwright'

import { Workers } from '../Workers'


export class Quiz extends Workers {

    async doQuiz(page: Page) {
        this.bot.log(this.bot.isMobile, '测验', '尝试完成测验')

        try {
            // 检查测验是否已开始
            const quizNotStarted = await page.waitForSelector('#rqStartQuiz', { state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)
            if (quizNotStarted) {
                await page.click('#rqStartQuiz')
            } else {
                this.bot.log(this.bot.isMobile, '测验', '测验已开始，尝试完成它')
            }

            await this.bot.utils.wait(2000)

            let quizData = await this.bot.browser.func.getQuizData(page)
            const questionsRemaining = quizData.maxQuestions - quizData.CorrectlyAnsweredQuestionCount // 剩余问题数量

            // 所有问题
            for (let question = 0; question < questionsRemaining; question++) {

                if (quizData.numberOfOptions === 8) {
                    const answers: string[] = []

                    for (let i = 0; i < quizData.numberOfOptions; i++) {
                        const answerSelector = await page.waitForSelector(`#rqAnswerOption${i}`, { state: 'visible', timeout: 10000 })
                        const answerAttribute = await answerSelector?.evaluate(el => el.getAttribute('iscorrectoption'))

                        if (answerAttribute && answerAttribute.toLowerCase() === 'true') {
                            answers.push(`#rqAnswerOption${i}`)
                        }
                    }

                    // 点击答案
                    for (const answer of answers) {
                        await page.waitForSelector(answer, { state: 'visible', timeout: 2000 })

                        // 在页面上点击答案
                        await page.click(answer)

                        const refreshSuccess = await this.bot.browser.func.waitForQuizRefresh(page)
                        if (!refreshSuccess) {
                            await page.close()
                            this.bot.log(this.bot.isMobile, '测验', '发生错误，刷新失败', 'error')
                            return
                        }
                    }

                    // 其他类型的测验，例如光速问答
                } else if ([2, 3, 4].includes(quizData.numberOfOptions)) {
                    quizData = await this.bot.browser.func.getQuizData(page) // 刷新测验数据
                    const correctOption = quizData.correctAnswer

                    for (let i = 0; i < quizData.numberOfOptions; i++) {

                        const answerSelector = await page.waitForSelector(`#rqAnswerOption${i}`, { state: 'visible', timeout: 10000 })
                        const dataOption = await answerSelector?.evaluate(el => el.getAttribute('data-option'))

                        if (dataOption === correctOption) {
                            // 在页面上点击答案
                            await page.click(`#rqAnswerOption${i}`)

                            const refreshSuccess = await this.bot.browser.func.waitForQuizRefresh(page)
                            if (!refreshSuccess) {
                                await page.close()
                                this.bot.log(this.bot.isMobile, '测验', '发生错误，刷新失败', 'error')
                                return
                            }
                        }
                    }
                    await this.bot.utils.wait(2000)
                }
            }

            // 完成
            await this.bot.utils.wait(2000)
            await page.close()

            this.bot.log(this.bot.isMobile, '测验', '成功完成测验')
        } catch (error) {
            await page.close()
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.bot.log(this.bot.isMobile, '测验', `发生错误: ${errorMessage}`, 'error')
        }
    }

}
