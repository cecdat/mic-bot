export interface ConfigApiServer {
    enabled: boolean;
    updateUrl: string;
    token: string;
    nodeName: string;
    heartbeatInterval?: string | number;
    heartbeatTimeout?: string | number;
}

export interface ConfigHotSearchApi {
    enabled: boolean;
    baseUrl: string;
}

export interface ConfigSearchDelay {
    min: number | string;
    max: number | string;
}

export interface ConfigSearchSettings {
    useGeoLocaleQueries: boolean;
    scrollRandomResults: boolean;
    clickRandomResults: boolean;
    searchDelay: ConfigSearchDelay;
    retryMobileSearchAmount: number;
}

export interface ConfigWebhook {
    enabled: boolean;
    url: string;
}

export interface ConfigNtfy {
    enabled: boolean;
    url: string;
    topic: string;
    authToken?: string;
}

export interface ConfigProxy {
    proxyGoogleTrends: boolean;
    proxyBingTerms: boolean;
}

export interface ConfigWorkers {
    doDailySet: boolean;
    doMorePromotions: boolean;
    doPunchCards: boolean;
    doDesktopSearch: boolean;
    doMobileSearch: boolean;
    doDailyCheckIn: boolean;
    doReadToEarn: boolean;
}

export interface ConfigSaveFingerprint {
    mobile: boolean;
    desktop: boolean;
}

export interface Config {
    baseURL: string;
    sessionPath: string;
    headless: boolean;
    parallel: boolean;
    runOnZeroPoints: boolean;
    debug: boolean;
    saveFingerprint: ConfigSaveFingerprint;
    workers: ConfigWorkers;
    searchOnBingLocalQueries: boolean;
    globalTimeout: number | string;
    navigationTimeout: number | string;
    searchSettings: ConfigSearchSettings;
    logExcludeFunc: string[];
    webhookLogExcludeFunc: string[];
    proxy: ConfigProxy;
    webhook: ConfigWebhook;
    ntfy: ConfigNtfy;
    apiServer: ConfigApiServer;
    hotSearchApi: ConfigHotSearchApi;
}
