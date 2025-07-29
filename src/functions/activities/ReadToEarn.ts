import { randomBytes } from 'crypto'
import { AxiosRequestConfig } from 'axios'

import { Workers } from '../Workers'

import { DashboardData } from '../../interface/DashboardData'


export class ReadToEarn extends Workers {
    public async doReadToEarn(accessToken: string, data: DashboardData) {
        this.bot.log(this.bot.isMobile, '阅读文章', '开始执行“阅读文章”任务')

        try {
            let geoLocale = data.userProfile.attributes.country
            geoLocale = (this.bot.config.searchSettings.useGeoLocaleQueries && geoLocale.length === 2) ? geoLocale.toLowerCase() : 'us'

            const userDataRequest: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Rewards-Country': geoLocale,
                    'X-Rewards-Language': 'en'
                }
            }
            const userDataResponse = await this.bot.axios.request(userDataRequest)
            const userData = (await userDataResponse.data).response
            let userBalance = userData.balance

            const jsonData = {
                amount: 1,
                country: geoLocale,
                id: '1',
                type: 101,
                attributes: {
                    offerid: 'ENUS_readarticle3_30points'
                }
            }

            const articleCount = 10
            for (let i = 0; i < articleCount; ++i) {
                jsonData.id = randomBytes(64).toString('hex')
                const claimRequest = {
                    url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'X-Rewards-Country': geoLocale,
                        'X-Rewards-Language': 'en'
                    },
                    data: JSON.stringify(jsonData)
                }

                const claimResponse = await this.bot.axios.request(claimRequest)
                const newBalance = (await claimResponse.data).response.balance

                if (newBalance == userBalance) {
                    this.bot.log(this.bot.isMobile, '阅读文章', '已阅读所有可用文章')
                    break
                } else {
                    // [核心修改] 将日志内容中文化
                    this.bot.log(this.bot.isMobile, '阅读文章', `阅读文章 ${i + 1} / ${articleCount} | 获得 ${newBalance - userBalance} 积分`)
                    userBalance = newBalance
                    await this.bot.utils.wait(Math.floor(this.bot.utils.randomNumber(this.bot.utils.stringToMs(this.bot.config.searchSettings.searchDelay.min), this.bot.utils.stringToMs(this.bot.config.searchSettings.searchDelay.max))))
                }
            }

            this.bot.log(this.bot.isMobile, '阅读文章', '已完成“阅读文章”任务')
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.bot.log(this.bot.isMobile, '阅读文章', `发生错误: ${errorMessage}`, 'error')
        }
    }
}