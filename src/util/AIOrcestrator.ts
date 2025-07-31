import { MorePromotion, PromotionalItem, DashboardData } from '../interface/DashboardData';
import Util from './Utils';
import { log } from './Logger';

// 将所有可能的任务统一成一个类型，方便处理
export type UnifiedTask = MorePromotion | PromotionalItem;

// [新增] 创建一个常用任务标题的翻译词典
const taskTitleDictionary: { [key: string]: string } = {
    'Daily Poll': '每日投票',
    'This or That': '二选一',
    'Supersonic quiz': '超音速问答',
    'Surprise quiz': '惊喜问答',
    'Test your smarts': '知识问答',
    // 您可以根据需要，在这里继续添加其他常见任务的翻译
};

/**
 * [新增] 翻译任务标题的辅助函数
 * @param title 原始英文标题
 * @returns 翻译后的中文标题，如果词典中没有，则返回原文
 */
function translateTitle(title: string): string {
    // 尝试在词典中寻找完整的匹配
    if (taskTitleDictionary[title]) {
        return taskTitleDictionary[title];
    }
    // 您也可以在这里添加更复杂的匹配逻辑，比如检查标题是否包含某些关键词
    return title; // 如果没有找到，返回原始标题
}


class AIOrcestrator {
    private utils: Util = new Util();

    /**
     * 从 dashboardData 中提取所有未完成的任务
     * @param data 仪表板数据
     * @returns 一个包含所有可执行任务的统一列表
     */
    public getAllIncompleteTasks(data: DashboardData): UnifiedTask[] {
        const todayStr = this.utils.getFormattedDate();
        const allTasks: UnifiedTask[] = [];

        const dailySet = data.dailySetPromotions[todayStr]
            ?.filter(task => !task.complete && task.pointProgressMax > 0) || [];
        allTasks.push(...dailySet);

        const morePromotions = data.morePromotions
            ?.filter(task => !task.complete && task.pointProgressMax > 0 && task.exclusiveLockedFeatureStatus !== 'locked') || [];
        allTasks.push(...morePromotions);
        
        if (data.promotionalItem && !data.promotionalItem.complete && data.promotionalItem.pointProgressMax > 0) {
            allTasks.push(data.promotionalItem as unknown as MorePromotion);
        }
        
        log('main', 'AI指挥部', `共收集到 ${allTasks.length} 个可执行的任务。`);
        return allTasks;
    }

    /**
     * 调用AI，获取最优的任务执行计划
     * @param tasks 未排序的任务列表
     * @returns 一个经过AI优化排序的任务列表
     */
    public async getTaskExecutionPlan(tasks: UnifiedTask[]): Promise<UnifiedTask[]> {
        log('main', 'AI指挥部', '正在请求AI制定最优执行计划...');

        // **********************************************************************
        // ** 【AI集成点】 **
        // **********************************************************************
        
        const simulatedPlan = this.utils.shuffleArray(tasks);

        log('main', 'AI指挥部', 'AI已返回作战计划！将按以下顺序执行:');
        
        // [核心修改] 在打印日志时，调用翻译函数
        simulatedPlan.forEach((task, index) => {
            const translatedTitle = translateTitle(task.title); // 获取翻译后的标题
            log('main', 'AI作战计划', `  ${index + 1}. [${task.pointProgressMax}分] ${translatedTitle} (类型: ${task.promotionType})`);
        });

        return simulatedPlan;
    }
}

export const aiOrchestrator = new AIOrcestrator();
