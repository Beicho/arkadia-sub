/**
 * 分流规则数据源(Clash 与 sing-box 共用)。
 *
 * ## 为什么全部内联,不用 rule-providers / 远程 rule_set
 *
 * 远程规则集要客户端在启动时下载。拉不到的后果不是"规则少几条",
 * 而是**配置加载失败**——对付费订阅来说等于服务中断。
 * 内联规则零网络依赖、可被单测锁死、任何内核版本都不会因此起不来。
 * 代价是覆盖面不如社区规则库,但订阅每天重新生成,列表可以随时跟进。
 *
 * ## 域名列表的取舍
 *
 * 只收**高置信**条目:误判一条国内域名走代理只是慢,
 * 误判一条国外域名走直连就是打不开。所以拿不准的一律不进列表,
 * 交给兜底规则(Clash 走 GEOIP,sing-box 走 final)。
 */

/** 订阅分流模式:rules = 按规则分流(默认),global = 全量走代理(旧行为) */
export type RoutingMode = "rules" | "global";

/** 主选择组名。沿用品牌名,老用户已保存的选择不会失效。 */
export const GROUP_MAIN = "Arkadia";
export const GROUP_AUTO = "自动选择";
export const GROUP_MEDIA = "国外媒体";
export const GROUP_TELEGRAM = "电报消息";
export const GROUP_MICROSOFT = "微软服务";
export const GROUP_APPLE = "苹果服务";
export const GROUP_ADS = "广告拦截";
export const GROUP_FINAL = "漏网之鱼";

/**
 * 私有/保留地址段 → 直连。
 * 刻意**不含 198.18.0.0/15**:那是 DNS 段的 fake-ip-range,
 * 把它判直连会让 fake-ip 解析出来的连接绕过代理。
 */
export const PRIVATE_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

/** 局域网/本机域名 → 直连 */
export const PRIVATE_DOMAINS = [
  "local",
  "localhost",
  "lan",
  "home.arpa",
  "internal",
  "test",
  "invalid",
];

/**
 * 广告与追踪 → 拦截(仅 Clash;sing-box 侧见文件头说明)。
 * 刻意**不含 googletagmanager.com**:大量站点用它加载正常功能,
 * 拦了会变成"网站打不开"的客服工单。纯埋点的 google-analytics 则收。
 */
export const AD_DOMAINS = [
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
  "google-analytics.com",
  "adnxs.com",
  "adsrvr.org",
  "criteo.com",
  "criteo.net",
  "scorecardresearch.com",
  "moatads.com",
  "outbrain.com",
  "taboola.com",
  "applovin.com",
  "adcolony.com",
  "unityads.unity3d.com",
  "pangle.io",
  "pangolin-sdk-toutiao.com",
  "umeng.com",
  "umengcloud.com",
  "umeng.co",
  "mmstat.com",
  "cnzz.com",
  "talkingdata.com",
  "irs01.com",
  "miaozhen.com",
  "admaster.com.cn",
  "gridsumdissector.com",
  "acs86.com",
];

/** 电报域名 */
export const TELEGRAM_DOMAINS = [
  "telegram.org",
  "telegram.me",
  "t.me",
  "telesco.pe",
  "tdesktop.com",
  "telegra.ph",
];

/** 电报 IP 段(域名走不到时兜底) */
export const TELEGRAM_CIDRS = [
  "91.105.192.0/23",
  "91.108.4.0/22",
  "91.108.8.0/21",
  "91.108.16.0/22",
  "91.108.20.0/22",
  "91.108.56.0/22",
  "149.154.160.0/20",
  "185.76.151.0/24",
];

/** 微软服务:默认直连(国内有 CDN,走代理反而慢且易触发风控) */
export const MICROSOFT_DOMAINS = [
  "microsoft.com",
  "microsoftonline.com",
  "windows.com",
  "windowsupdate.com",
  "office.com",
  "office365.com",
  "officecdn.com",
  "live.com",
  "outlook.com",
  "msn.com",
  "bing.com",
  "azure.com",
  "azureedge.net",
  "sharepoint.com",
  "onedrive.com",
  "skype.com",
  "xbox.com",
  "visualstudio.com",
  "vscode.dev",
  "msftconnecttest.com",
  "msftncsi.com",
];

/** 苹果服务:默认直连(同上,国内有专线) */
export const APPLE_DOMAINS = [
  "apple.com",
  "apple-cloudkit.com",
  "appleiphonecell.com",
  "icloud.com",
  "icloud-content.com",
  "me.com",
  "mzstatic.com",
  "itunes.com",
  "cdn-apple.com",
  "aaplimg.com",
];

/** 国外流媒体 → 独立分组(常需要指定落地区域) */
export const MEDIA_DOMAINS = [
  "netflix.com",
  "netflix.net",
  "nflxext.com",
  "nflximg.net",
  "nflxso.net",
  "nflxvideo.net",
  "disneyplus.com",
  "disney-plus.net",
  "dssott.com",
  "bamgrid.com",
  "hbomax.com",
  "max.com",
  "hulu.com",
  "primevideo.com",
  "spotify.com",
  "scdn.co",
  "tidal.com",
  "deezer.com",
  "soundcloud.com",
  "twitch.tv",
  "ttvnw.net",
  "jtvnw.net",
  "abema.tv",
  "nicovideo.jp",
  "nimg.jp",
  "bahamut.com.tw",
  "gamer.com.tw",
  "tver.jp",
  "crunchyroll.com",
  "viu.com",
  "iq.com",
];

/**
 * 需要代理的国外站点。
 * 只收在国内确定不可直连、或直连体验明显更差的高置信条目。
 */
export const PROXY_DOMAINS = [
  // Google
  "google.com",
  "googleapis.com",
  "gstatic.com",
  "googleusercontent.com",
  "ggpht.com",
  "googlevideo.com",
  "youtube.com",
  "youtu.be",
  "ytimg.com",
  "withgoogle.com",
  "blogspot.com",
  "chromium.org",
  // 社交
  "twitter.com",
  "x.com",
  "twimg.com",
  "t.co",
  "facebook.com",
  "fbcdn.net",
  "instagram.com",
  "cdninstagram.com",
  "threads.net",
  "whatsapp.com",
  "whatsapp.net",
  "discord.com",
  "discordapp.com",
  "discordapp.net",
  "reddit.com",
  "redd.it",
  "redditstatic.com",
  "redditmedia.com",
  "pinterest.com",
  "tumblr.com",
  "quora.com",
  // 开发
  "github.com",
  "githubusercontent.com",
  "githubassets.com",
  "github.io",
  "gitlab.com",
  "sourceforge.net",
  "stackoverflow.com",
  "stackexchange.com",
  "sstatic.net",
  "npmjs.com",
  "pypi.org",
  "pythonhosted.org",
  "rubygems.org",
  "docker.com",
  "docker.io",
  "gradle.org",
  "maven.org",
  "golang.org",
  "go.dev",
  "rust-lang.org",
  "crates.io",
  "kernel.org",
  "archlinux.org",
  "vercel.app",
  "netlify.app",
  "cloudflare.com",
  "workers.dev",
  // AI
  "openai.com",
  "chatgpt.com",
  "oaistatic.com",
  "oaiusercontent.com",
  "anthropic.com",
  "claude.ai",
  "gemini.google.com",
  "perplexity.ai",
  "huggingface.co",
  "midjourney.com",
  // 知识/媒体
  "wikipedia.org",
  "wikimedia.org",
  "wikidata.org",
  "medium.com",
  "substack.com",
  "nytimes.com",
  "bbc.com",
  "bbc.co.uk",
  "reuters.com",
  "bloomberg.com",
  "economist.com",
  "ft.com",
  "wsj.com",
  // 其它
  "telegram.org",
  "pixiv.net",
  "pximg.net",
  "dlsite.com",
  "steamcommunity.com",
  "protonmail.com",
  "proton.me",
  "wireguard.com",
  "torproject.org",
  "v2ex.com",
  "duckduckgo.com",
  "startpage.com",
  "notion.so",
  "figma.com",
  "dropbox.com",
  "slack.com",
  "zoom.us",
  "patreon.com",
  "onlyfans.com",
  "archive.org",
];

/**
 * 国内直连域名。
 * `cn` 顶级域单独作为一条后缀规则,能覆盖绝大多数长尾,列表只补非 .cn 的大站。
 */
export const CN_DOMAINS = [
  "cn",
  // 腾讯
  "qq.com",
  "qcloud.com",
  "myqcloud.com",
  "gtimg.com",
  "qpic.cn",
  "weixin.qq.com",
  "wechat.com",
  "tencent.com",
  // 阿里
  "taobao.com",
  "tmall.com",
  "alipay.com",
  "alibaba.com",
  "aliyun.com",
  "aliyuncs.com",
  "alicdn.com",
  "aliexpress.com",
  "1688.com",
  "dingtalk.com",
  "youku.com",
  "ykimg.com",
  // 百度
  "baidu.com",
  "bdstatic.com",
  "bdimg.com",
  "baidupcs.com",
  "baidubce.com",
  // 字节
  "bytedance.com",
  "douyin.com",
  "toutiao.com",
  "feishu.cn",
  "byteimg.com",
  "pstatp.com",
  "snssdk.com",
  // 视频/社区
  "bilibili.com",
  "hdslb.com",
  "bilivideo.com",
  "biliapi.net",
  "acgvideo.com",
  "zhihu.com",
  "zhimg.com",
  "douban.com",
  "doubanio.com",
  "weibo.com",
  "sinaimg.cn",
  "sina.com.cn",
  "iqiyi.com",
  "qiyipic.com",
  "mgtv.com",
  "kuaishou.com",
  "yximgs.com",
  "xiaohongshu.com",
  "xhscdn.com",
  "ximalaya.com",
  // 电商/生活
  "jd.com",
  "360buyimg.com",
  "pinduoduo.com",
  "yangkeduo.com",
  "meituan.com",
  "meituan.net",
  "dianping.com",
  "ele.me",
  "ctrip.com",
  "trip.com",
  "qunar.com",
  "12306.cn",
  "lianjia.com",
  "ke.com",
  "58.com",
  "autohome.com.cn",
  // 网易
  "163.com",
  "126.com",
  "netease.com",
  "126.net",
  "ydstatic.com",
  "youdao.com",
  // 厂商
  "xiaomi.com",
  "mi.com",
  "miui.com",
  "huawei.com",
  "hicloud.com",
  "honor.com",
  "oppo.com",
  "heytapmobi.com",
  "vivo.com.cn",
  "oneplus.com",
  // 开发/其它
  "csdn.net",
  "cnblogs.com",
  "gitee.com",
  "oschina.net",
  "jianshu.com",
  "segmentfault.com",
  "juejin.cn",
  "sogou.com",
  "so.com",
  "360.cn",
  "qhimg.com",
  "unionpay.com",
  "icbc.com.cn",
  "cmbchina.com",
  "10086.cn",
  "10010.com",
  "189.cn",
];
