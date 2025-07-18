import { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import { log } from './Logger'

// 定义一个常量，用于 "Not/A)Brand"
const NOT_A_BRAND_VERSION = '99'

/**
 * [已修改] 获取一个写在代码里的、真实的桌面端User-Agent数据
 * @returns 包含userAgent和userAgentMetadata的对象
 */
function getHardcodedDesktopUserAgent() {
    const edgeVersion = '126.0.2592.87'; // 一个真实的Edge版本
    const chromeVersion = '126.0.6478.127'; // 一个真实的Chrome版本
    const edgeMajorVersion = edgeVersion.split('.')[0]; // "126"
    const chromeMajorVersion = chromeVersion.split('.')[0]; // "126"

    const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36 Edg/${edgeVersion}`;

    const userAgentMetadata = {
        isMobile: false,
        platform: 'Windows',
        fullVersionList: [
            { brand: 'Not/A)Brand', version: `${NOT_A_BRAND_VERSION}.0.0.0` },
            { brand: 'Microsoft Edge', version: edgeVersion },
            { brand: 'Chromium', version: chromeVersion }
        ],
        brands: [
            { brand: 'Not/A)Brand', version: NOT_A_BRAND_VERSION },
            { brand: 'Microsoft Edge', version: edgeMajorVersion },
            { brand: 'Chromium', version: chromeMajorVersion }
        ],
        platformVersion: '15.0.0', // Windows 11的版本号
        architecture: 'x86',
        bitness: '64',
        model: ''
    };

    return { userAgent, userAgentMetadata, componentData: { edge_version: edgeVersion, chrome_version: chromeVersion, edge_major_version: edgeMajorVersion, chrome_major_version: chromeMajorVersion, not_a_brand_version: `${NOT_A_BRAND_VERSION}.0.0.0`, not_a_brand_major_version: NOT_A_BRAND_VERSION, chrome_reduced_version: `${chromeMajorVersion}.0.0.0` } };
}

/**
 * [已修改] 获取一个写在代码里的、真实的移动端User-Agent数据
 * @returns 包含userAgent和userAgentMetadata的对象
 */
function getHardcodedMobileUserAgent() {
    const edgeVersion = '126.0.2592.87'; // 一个真实的Edge安卓版版本
    const chromeVersion = '126.0.6478.127'; // 一个真实的Chrome安卓版版本
    const edgeMajorVersion = edgeVersion.split('.')[0]; // "126"
    const chromeMajorVersion = chromeVersion.split('.')[0]; // "126"
    
    // 一个典型的安卓User-Agent
    const userAgent = `Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Mobile Safari/537.36 EdgA/${edgeVersion}`;

    const userAgentMetadata = {
        isMobile: true,
        platform: 'Android',
        fullVersionList: [
            { brand: 'Not/A)Brand', version: `${NOT_A_BRAND_VERSION}.0.0.0` },
            { brand: 'Microsoft Edge', version: edgeVersion },
            { brand: 'Chromium', version: chromeVersion }
        ],
        brands: [
            { brand: 'Not/A)Brand', version: NOT_A_BRAND_VERSION },
            { brand: 'Microsoft Edge', version: edgeMajorVersion },
            { brand: 'Chromium', version: chromeMajorVersion }
        ],
        platformVersion: '14.0.0', // 安卓14
        architecture: '',
        bitness: '',
        model: 'Pixel 8 Pro' // 一个常见的设备型号
    };

    return { userAgent, userAgentMetadata, componentData: { edge_version: edgeVersion, chrome_version: chromeVersion, edge_major_version: edgeMajorVersion, chrome_major_version: chromeMajorVersion, not_a_brand_version: `${NOT_A_BRAND_VERSION}.0.0.0`, not_a_brand_major_version: NOT_A_BRAND_VERSION, chrome_reduced_version: `${chromeMajorVersion}.0.0.0` } };
}


/**
 * [已修改] 不再进行网络请求，而是调用新的本地函数
 * @param isMobile 
 * @returns 
 */
export async function getUserAgent(isMobile: boolean) {
    if (isMobile) {
        return getHardcodedMobileUserAgent();
    }
    return getHardcodedDesktopUserAgent();
}

/**
 * [已修改] 这个函数现在只是为了兼容性，直接从本地函数获取数据
 * @param isMobile 
 * @returns 
 */
export async function getAppComponents(isMobile: boolean) {
    if (isMobile) {
        return getHardcodedMobileUserAgent().componentData;
    }
    return getHardcodedDesktopUserAgent().componentData;
}


// [已移除] getChromeVersion 和 getEdgeVersions 函数，因为我们不再需要它们
// export async function getChromeVersion(...) { ... }
// export async function getEdgeVersions(...) { ... }


// [已保留] 这个函数现在是多余的，但在其他地方有调用，暂时保留
export function getSystemComponents(mobile: boolean): string {
    const osId: string = mobile ? 'Linux' : 'Windows NT 10.0'
    const uaPlatform: string = mobile ? 'Android 14' : 'Win64; x64'

    if (mobile) {
        return `${osId}; ${uaPlatform}; Pixel 8 Pro`
    }

    return `${osId}; ${uaPlatform}`
}

/**
 * [已修改] 使用新的本地数据来更新指纹中的User-Agent
 * @param fingerprint 
 * @param isMobile 
 * @returns 
 */
export async function updateFingerprintUserAgent(fingerprint: BrowserFingerprintWithHeaders, isMobile: boolean): Promise<BrowserFingerprintWithHeaders> {
    try {
        const { userAgent, userAgentMetadata, componentData } = await getUserAgent(isMobile);

        //@ts-expect-error Errors due it not exactly matching
        fingerprint.fingerprint.navigator.userAgentData = userAgentMetadata;
        fingerprint.fingerprint.navigator.userAgent = userAgent;
        fingerprint.fingerprint.navigator.appVersion = userAgent.replace(`${fingerprint.fingerprint.navigator.appCodeName}/`, '');

        fingerprint.headers['user-agent'] = userAgent;
        fingerprint.headers['sec-ch-ua'] = `"Not/A)Brand";v="${componentData.not_a_brand_major_version}", "Microsoft Edge";v="${componentData.edge_major_version}", "Chromium";v="${componentData.chrome_major_version}"`;
        fingerprint.headers['sec-ch-ua-full-version-list'] = `"Not/A)Brand";v="${componentData.not_a_brand_version}", "Microsoft Edge";v="${componentData.edge_version}", "Chromium";v="${componentData.chrome_version}"`;
        
        return fingerprint;
    } catch (error) {
        // [已修改] 即使出错，也要抛出一个可读的错误信息
        const errorMessage = `更新User-Agent指纹时发生错误: ${error instanceof Error ? error.message : String(error)}`;
        log(isMobile, '更新UA指纹', errorMessage, 'error');
        throw new Error(errorMessage);
    }
}
