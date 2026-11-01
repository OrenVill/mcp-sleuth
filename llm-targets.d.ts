export declare const ALLOWED_PATHS: Record<string, RegExp[]>;
export declare function isKnownProvider(provider: string): boolean;
export declare function isAllowedTarget(provider: string, targetUrl: URL): boolean;
export declare function requireAllowedTarget(provider: string, url: string): URL;
