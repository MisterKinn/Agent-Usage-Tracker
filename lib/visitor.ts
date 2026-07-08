export type VisitorEnvironment = {
    browser: string;
    deviceType: string;
    os: string;
};

export function detectVisitorEnvironment(userAgent: string) {
    const ua = userAgent.toLowerCase();

    let os = "other";
    if (ua.includes("android")) {
        os = "android";
    } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) {
        os = "ios";
    } else if (ua.includes("windows")) {
        os = "windows";
    } else if (ua.includes("mac os") || ua.includes("macintosh")) {
        os = "macos";
    } else if (ua.includes("linux")) {
        os = "linux";
    }

    let browser = "other";
    if (ua.includes("edg/")) {
        browser = "edge";
    } else if (ua.includes("chrome/") && !ua.includes("edg/")) {
        browser = "chrome";
    } else if (ua.includes("safari/") && !ua.includes("chrome/")) {
        browser = "safari";
    } else if (ua.includes("firefox/")) {
        browser = "firefox";
    }

    let deviceType = "desktop";
    if (ua.includes("ipad") || ua.includes("tablet")) {
        deviceType = "tablet";
    } else if (
        ua.includes("iphone") ||
        ua.includes("android") ||
        ua.includes("mobile")
    ) {
        deviceType = "mobile";
    }

    return { browser, deviceType, os } satisfies VisitorEnvironment;
}

export function makeDateKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

export function slugifySegment(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "root";
}
