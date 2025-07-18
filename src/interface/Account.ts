export interface Account {
    email: string;
    password: string;
    proxy: AccountProxy;
    userAgents?: { // <--- 将 "userAgent" 修改为 "userAgents" 对象
        desktop?: string; // <--- 桌面端UA
        mobile?: string;  // <--- 移动端UA
    };
}

export interface AccountProxy {
    proxyAxios: boolean;
    url: string;
    port: number;
    password: string;
    username: string;
}
