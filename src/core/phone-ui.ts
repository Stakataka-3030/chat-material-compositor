import { z } from "zod";
export const configurableIcons = [
  "statusSignal",
  "statusWifi",
  "statusClock",
  "statusLocation",
  "statusBattery",
  "headerLeft",
  "headerRight1",
  "headerRight2",
  "headerRight3",
  "footerLeft1",
  "footerLeft2",
  "footerLeft3",
  "footerRight1",
  "footerRight2",
] as const;
type IconRole = (typeof configurableIcons)[number];
type IconProperties = {
  [K in `${IconRole}${"X" | "Y" | "Size" | "AssetId" | "Color" | "Style" | "Stroke" | "Opacity"}`]: K extends `${string}AssetId`
    ? string | null
    : K extends `${string}Color`
      ? string
      : K extends `${string}Style`
        ? "outline" | "filled"
        : number;
};
const iconProperties = Object.fromEntries(
  configurableIcons.flatMap((role) => [
    [role + "X", -1],
    [role + "Y", -1],
    [role + "Size", -1],
    [role + "AssetId", null],
    [role + "Color", ""],
    [role + "Style", "outline"],
    [role + "Stroke", 1.8],
    [role + "Opacity", 1],
  ]),
) as IconProperties;
export const phoneDefaults = {
  ...iconProperties,
  statusX: 0,
  statusY: 0,
  statusWidth: 375,
  statusBackgroundAssetId: null as string | null,
  statusRadius: 0,
  headerX: 0,
  headerY: -1,
  headerWidth: 375,
  headerBackgroundAssetId: null as string | null,
  headerRadius: 0,
  footerX: 0,
  footerY: -1,
  footerWidth: 375,
  footerBackgroundAssetId: null as string | null,
  footerRadius: 0,
  inputVisible: true,
  inputX: -1,
  inputY: -1,
  inputWidth: -1,
  inputHeight: 31,
  inputTextColor: "",
  chatX: 0,
  chatY: -1,
  chatWidth: 375,
  chatHeight: -1,
  statusTimeX: 18,
  statusTimeY: -1,

  frameRatio: 0,
  shellPaddingX: 19,
  shellPaddingTop: 25,
  shellPaddingBottom: 23,
  cameraType: "none",
  cameraX: -1,
  cameraY: 18,
  cameraWidth: 12,
  cameraHeight: 12,
  cameraRadius: 8,
  cameraColor: "",
  cameraOpacity: 1,
  navigationMode: "none",
  navigationHeight: 22,
  navigationWidth: 110,
  navigationThickness: 4,
  navigationColor: "",
  navigationBackground: "",
  statusFontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
  statusFontAssetId: null as string | null,
  statusFontWeight: 400,
  statusSignalSymbol: "signal",
  statusWifiSymbol: "wifi",
  statusClockSymbol: "clock",
  statusLocationSymbol: "location",
  batteryPercentVisible: true,
  incomingAvatarVisible: true,
  outgoingAvatarVisible: true,
  incomingNameVisible: true,
  outgoingNameVisible: true,
  shellRadius: 45,
  screenRadius: 34,
  fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
  fontAssetId: null as string | null,
  messageCSS: "",
  mentionColor: "",
  mentionBold: true,
  mentionAllText: "@全体成员",
  fontWeight: 400,
  boldWeight: 600,
  lineHeight: 1.45,
  statusVisible: true,
  statusHeight: 34,
  statusFontSize: 11,
  signalVisible: true,
  wifiVisible: true,
  clockVisible: true,
  locationVisible: true,
  batteryVisible: true,
  headerVisible: true,
  headerHeight: 52,
  titleSize: 19,
  titleAlign: "center",
  titleOffsetX: 0,
  titleOffsetY: 0,
  iconSize: 22,
  headerLeft: "back",
  headerRight1: "phone",
  headerRight2: "menu",
  headerRight3: "none",
  headerTransparent: false,
  headerLineVisible: true,
  statusTransparent: false,
  statusIconProfile: "classic",
  batteryPercentPlacement: "outside",
  bubbleTailStyle: "point",
  nameBold: false,
  messageTimeVisible: false,
  messageTimeSize: 10,
  messageTimeColor: "",
  readCountVisible: false,
  footerVisible: true,
  footerHeight: 50,
  footerIconSize: 20,
  footerLeft1: "plus",
  footerLeft2: "camera",
  footerLeft3: "image",
  footerRight1: "smile",
  footerRight2: "mic",
  inputText: "",
  inputRadius: 16,
  avatarVisible: true,
  avatarSize: 34,
  avatarRadius: 17,
  avatarGap: 8,
  messageMargin: 13,
  messageGap: 14,
  chatTopPadding: 12,
  bubbleMaxWidth: 250,
  bubblePaddingX: 13,
  bubblePaddingY: 10,
  bubbleRadius: 15,
  cardRadius: 12,
  bubbleTail: true,
  nameSize: 12,
  nameHeight: 20,
  readSize: 9,
  readText: "已读",
  separatorRadius: 12,
  separatorOpacity: 0.75,
  background: "",
  statusBackground: "",
  headerBackground: "",
  footerBackground: "",
  textColor: "",
  incomingColor: "",
  outgoingColor: "",
  incomingText: "",
  outgoingText: "",
  mutedColor: "",
  accentColor: "",
  lineColor: "",
  titleColor: "",
  statusColor: "",
  batteryColor: "",
  inputColor: "",
  footerIconColor: "",
  separatorColor: "",
};
export type PhoneUI = Omit<
  typeof phoneDefaults,
  | "cameraType"
  | "navigationMode"
  | "statusSignalSymbol"
  | "statusWifiSymbol"
  | "statusClockSymbol"
  | "statusLocationSymbol"
  | "statusIconProfile"
  | "batteryPercentPlacement"
  | "bubbleTailStyle"
  | "titleAlign"
  | "headerLeftAssetId"
  | "headerRight1AssetId"
  | "headerRight2AssetId"
  | "footerLeft1AssetId"
  | "footerLeft2AssetId"
  | "footerLeft3AssetId"
  | "footerRight1AssetId"
  | "footerRight2AssetId"
> & {
  cameraType: "none" | "hole" | "island" | "notch";
  navigationMode: "none" | "gesture" | "buttons";
  statusSignalSymbol: string;
  statusWifiSymbol: string;
  statusClockSymbol: string;
  statusLocationSymbol: string;
  statusIconProfile: "classic" | "ios";
  batteryPercentPlacement: "outside" | "inside";
  bubbleTailStyle: "point" | "round";
  titleAlign: "left" | "center" | "right";
  headerLeftAssetId: string | null;
  headerRight1AssetId: string | null;
  headerRight2AssetId: string | null;
  footerLeft1AssetId: string | null;
  footerLeft2AssetId: string | null;
  footerLeft3AssetId: string | null;
  footerRight1AssetId: string | null;
  footerRight2AssetId: string | null;
};
export const iconNames = [
  "none",
  "back",
  "phone",
  "menu",
  "plus",
  "camera",
  "image",
  "smile",
  "mic",
  "more",
  "more-vertical",
  "voice",
  "video",
  "send",
  "search",
  "signal",
  "wifi",
  "clock",
  "location",
];
export const iconLabels = [
  "不显示",
  "返回",
  "电话",
  "菜单",
  "添加",
  "相机",
  "图片",
  "表情",
  "麦克风",
  "更多",
  "更多（竖向）",
  "语音切换",
  "视频通话",
  "发送",
  "搜索",
  "信号",
  "Wi-Fi",
  "时钟",
  "定位",
];
export const phoneGroups: {
  title: string;
  parent?: string;
  fields: [keyof PhoneUI, string][];
}[] = [
  {
    title: "比例与外壳",
    fields: [
      ["frameRatio", "手机宽高比（0跟随皮肤）"],
      ["shellRadius", "通用外壳圆角"],
      ["screenRadius", "通用屏幕圆角"],
      ["shellPaddingX", "通用外壳左右边框"],
      ["shellPaddingTop", "通用外壳上边框"],
      ["shellPaddingBottom", "通用外壳下边框"],
    ],
  },
  {
    title: "字体",
    fields: [
      ["fontFamily", "系统字体名称或字体列表"],
      ["fontAssetId", "本机字体文件"],
      ["fontWeight", "正文字重"],
      ["boldWeight", "粗体字重"],
      ["lineHeight", "正文行距倍数"],
      ["messageCSS", "正文CSS"],
      ["mentionColor", "@文字颜色"],
      ["mentionBold", "@文字加粗"],
      ["mentionAllText", "@全体成员显示文字"],
    ],
  },
  {
    title: "状态栏",
    fields: [
      ["statusVisible", "显示状态栏"],
      ["statusHeight", "状态栏高度"],
      ["statusFontSize", "状态文字大小"],
      ["statusFontFamily", "状态栏字体列表"],
      ["statusFontAssetId", "状态栏本机字体"],
      ["statusFontWeight", "状态栏字重"],
      ["statusTransparent", "状态栏背景透明"],
      ["statusIconProfile", "系统图标风格"],
      ["batteryPercentPlacement", "电量百分比位置"],
      ["batteryPercentVisible", "显示电量百分比"],
      ["signalVisible", "显示左一（默认：信号）"],
      ["wifiVisible", "显示左二（默认：Wi-Fi）"],
      ["clockVisible", "显示左三（默认：时钟）"],
      ["locationVisible", "显示左四（默认：定位）"],
      ["batteryVisible", "显示右一（默认：电池）"],
      ["statusBackground", "背景颜色"],
      ["statusColor", "文字和图标颜色"],
      ["batteryColor", "电量颜色"],
    ],
  },
  {
    title: "聊天顶栏",
    fields: [
      ["headerVisible", "显示顶栏"],
      ["headerHeight", "顶栏高度"],
      ["titleSize", "标题大小"],
      ["titleAlign", "标题对齐"],
      ["titleOffsetX", "标题水平偏移"],
      ["titleOffsetY", "标题垂直偏移"],
      ["iconSize", "图标大小"],
      ["headerLeft", "左侧图标"],
      ["headerLeftAssetId", "左侧图标素材"],
      ["headerRight1", "右侧第一个图标"],
      ["headerRight1AssetId", "右侧第一个素材"],
      ["headerRight2", "右侧第二个图标"],
      ["headerRight2AssetId", "右侧第二个素材"],
      ["headerRight3", "右侧第三个图标"],
      ["headerRight3AssetId", "右侧第三个素材"],
      ["headerTransparent", "顶栏背景透明"],
      ["headerLineVisible", "顶栏分隔线"],
      ["headerBackground", "背景颜色"],
      ["titleColor", "标题和图标颜色"],
    ],
  },
  {
    title: "消息布局",
    fields: [
      ["avatarVisible", "显示头像"],
      ["incomingAvatarVisible", "显示对方头像"],
      ["outgoingAvatarVisible", "显示我方头像"],
      ["incomingNameVisible", "显示对方昵称"],
      ["outgoingNameVisible", "显示我方昵称"],
      ["avatarSize", "头像大小"],
      ["avatarRadius", "头像圆角"],
      ["avatarGap", "头像与气泡间距"],
      ["messageMargin", "左右留白"],
      ["messageGap", "消息间距"],
      ["chatTopPadding", "消息区顶部留白"],
      ["bubbleMaxWidth", "气泡最大宽度"],
      ["bubblePaddingX", "气泡左右内边距"],
      ["bubblePaddingY", "气泡上下内边距"],
      ["bubbleRadius", "气泡圆角"],
      ["cardRadius", "卡片圆角"],
      ["bubbleTail", "气泡尖角"],
      ["bubbleTailStyle", "尖角形状"],
      ["nameBold", "昵称加粗"],
      ["messageTimeVisible", "显示消息时间"],
      ["messageTimeSize", "消息时间字号"],
      ["messageTimeColor", "消息时间颜色"],
      ["readCountVisible", "群聊已读显示人数"],
      ["nameSize", "昵称大小"],
      ["nameHeight", "昵称占用高度"],
      ["readSize", "已读文字大小"],
      ["readText", "已读文字"],
      ["separatorRadius", "时间条圆角"],
      ["separatorOpacity", "时间条透明度"],
    ],
  },
  {
    title: "消息配色",
    fields: [
      ["background", "屏幕底色"],
      ["textColor", "正文颜色"],
      ["incomingColor", "对方气泡颜色"],
      ["outgoingColor", "我方气泡颜色"],
      ["incomingText", "对方文字颜色"],
      ["outgoingText", "我方文字颜色"],
      ["mutedColor", "次级文字颜色"],
      ["accentColor", "强调颜色"],
      ["lineColor", "分隔线颜色"],
      ["separatorColor", "时间条颜色"],
    ],
  },
  {
    title: "输入栏",
    fields: [
      ["footerVisible", "显示输入栏"],
      ["footerHeight", "输入栏高度"],
      ["footerIconSize", "图标大小"],
      ["inputText", "输入框显示文字"],
      ["inputRadius", "输入框圆角"],
      ["footerLeft1", "左侧第一个图标"],
      ["footerLeft1AssetId", "左侧第一个素材"],
      ["footerLeft2", "左侧第二个图标"],
      ["footerLeft2AssetId", "左侧第二个素材"],
      ["footerLeft3", "左侧第三个图标"],
      ["footerLeft3AssetId", "左侧第三个素材"],
      ["footerRight1", "右侧第一个图标"],
      ["footerRight1AssetId", "右侧第一个素材"],
      ["footerRight2", "右侧第二个图标"],
      ["footerRight2AssetId", "右侧第二个素材"],
      ["footerBackground", "栏背景颜色"],
      ["inputColor", "输入框颜色"],
      ["footerIconColor", "图标颜色"],
    ],
  },
];
export const phoneRanges: Record<string, [number, number, number]> = {
  frameRatio: [0, 2.5, 0.01],
  shellPaddingX: [0, 80, 1],
  shellPaddingTop: [0, 100, 1],
  shellPaddingBottom: [0, 100, 1],
  cameraOpacity: [0, 1, 0.05],
  navigationHeight: [0, 100, 1],
  statusFontWeight: [100, 900, 100],
  navigationThickness: [1, 20, 1],
  fontWeight: [100, 900, 100],
  boldWeight: [100, 900, 100],
  lineHeight: [1, 2.5, 0.05],
  shellRadius: [0, 100, 1],
  screenRadius: [0, 100, 1],
  statusHeight: [20, 100, 1],
  headerHeight: [24, 150, 1],
  footerHeight: [30, 120, 1],
  statusFontSize: [6, 26, 1],
  titleSize: [8, 40, 1],
  iconSize: [8, 40, 1],
  footerIconSize: [8, 40, 1],
  titleOffsetX: [-120, 120, 1],
  titleOffsetY: [-60, 60, 1],
  avatarSize: [12, 80, 1],
  avatarRadius: [0, 80, 1],
  avatarGap: [0, 40, 1],
  messageMargin: [2, 50, 1],
  messageGap: [0, 80, 1],
  chatTopPadding: [0, 80, 1],
  bubbleMaxWidth: [60, 350, 1],
  bubblePaddingX: [0, 40, 1],
  bubblePaddingY: [0, 40, 1],
  bubbleRadius: [0, 50, 1],
  cardRadius: [0, 50, 1],
  nameSize: [6, 30, 1],
  nameHeight: [10, 50, 1],
  readSize: [6, 22, 1],
  inputRadius: [0, 50, 1],
  separatorRadius: [0, 50, 1],
  separatorOpacity: [0, 1, 0.05],
};
const iconTitles: Record<IconRole, string> = {
  statusSignal: "左一（默认：信号）",
  statusWifi: "左二（默认：Wi-Fi）",
  statusClock: "左三（默认：时钟）",
  statusLocation: "左四（默认：定位）",
  statusBattery: "右一（默认：电池）",
  headerLeft: "顶栏左图标",
  headerRight1: "顶栏右图标1",
  headerRight2: "顶栏右图标2",
  headerRight3: "顶栏右图标3",
  footerLeft1: "底栏左图标1",
  footerLeft2: "底栏左图标2",
  footerLeft3: "底栏左图标3",
  footerRight1: "底栏右图标1",
  footerRight2: "底栏右图标2",
};
for (const group of phoneGroups)
  group.fields = group.fields.filter(
    ([key]) => !configurableIcons.some((role) => key === role + "AssetId"),
  );
for (const role of configurableIcons)
  phoneGroups.push({
    title: iconTitles[role] + "：样式与位置",
    parent: role.startsWith("status")
      ? "状态栏"
      : role.startsWith("header")
        ? "聊天顶栏"
        : "输入栏",
    fields: [
      [(role + "AssetId") as keyof PhoneUI, "自定义图标素材"],
      [(role + "X") as keyof PhoneUI, "X位置（-1自动）"],
      [(role + "Y") as keyof PhoneUI, "栏内Y位置（-1自动）"],
      [(role + "Size") as keyof PhoneUI, "大小（-1自动）"],
      [(role + "Color") as keyof PhoneUI, "绘制图标颜色"],
      [(role + "Style") as keyof PhoneUI, "绘制样式"],
      [(role + "Stroke") as keyof PhoneUI, "线条粗细"],
      [(role + "Opacity") as keyof PhoneUI, "图标透明度"],
    ],
  });
const moreFields: Record<string, [keyof PhoneUI, string][]> = {
  状态栏: [
    ["statusX", "栏X"],
    ["statusY", "栏Y"],
    ["statusWidth", "栏宽度"],
    ["statusRadius", "栏圆角"],
    ["statusTimeX", "时间X"],
    ["statusTimeY", "时间Y（-1自动）"],
    ["statusBackgroundAssetId", "栏背景素材"],
  ],
  聊天顶栏: [
    ["headerX", "栏X"],
    ["headerY", "栏Y（-1自动）"],
    ["headerWidth", "栏宽度"],
    ["headerRadius", "栏圆角"],
    ["headerBackgroundAssetId", "栏背景素材"],
  ],
  输入栏: [
    ["footerX", "栏X"],
    ["footerY", "栏Y（-1自动）"],
    ["footerWidth", "栏宽度"],
    ["footerRadius", "栏圆角"],
    ["footerBackgroundAssetId", "栏背景素材"],
    ["inputVisible", "显示输入框"],
    ["inputX", "输入框X（-1自动）"],
    ["inputY", "输入框栏内Y（-1自动）"],
    ["inputWidth", "输入框宽度（-1自动）"],
    ["inputHeight", "输入框高度"],
    ["inputTextColor", "输入框文字颜色"],
  ],
  消息布局: [
    ["chatX", "消息区X"],
    ["chatY", "消息区Y（-1自动）"],
    ["chatWidth", "消息区宽度"],
    ["chatHeight", "消息区高度（-1自动）"],
  ],
};
phoneGroups.push(
  {
    title: "摄像头与挖孔",
    fields: [
      ["cameraType", "形状"],
      ["cameraX", "X（-1居中）"],
      ["cameraY", "Y"],
      ["cameraWidth", "宽度"],
      ["cameraHeight", "高度"],
      ["cameraRadius", "圆角"],
      ["cameraColor", "颜色"],
      ["cameraOpacity", "透明度"],
    ],
  },
  {
    title: "系统导航栏",
    fields: [
      ["navigationMode", "显示方式"],
      ["navigationHeight", "高度"],
      ["navigationWidth", "手势条宽度"],
      ["navigationThickness", "手势条粗细"],
      ["navigationColor", "图标颜色"],
      ["navigationBackground", "背景颜色"],
    ],
  },
);
for (const role of [
  "statusSignal",
  "statusWifi",
  "statusClock",
  "statusLocation",
] as const) {
  const group = phoneGroups.find(
    (g) => g.parent === "状态栏" && g.title.startsWith(iconTitles[role]),
  );
  group?.fields.unshift([(role + "Symbol") as keyof PhoneUI, "内置图标"]);
}
for (const group of phoneGroups)
  group.fields.push(...(moreFields[group.title] ?? []));

for (const [key, value] of Object.entries(phoneDefaults))
  if (typeof value === "number" && !phoneRanges[key]) {
    phoneRanges[key] = key.endsWith("Opacity")
      ? [0, 1, 0.05]
      : key.endsWith("Stroke")
        ? [0.2, 8, 0.1]
        : key.endsWith("Size")
          ? [-1, 100, 1]
          : key.endsWith("Radius")
            ? [0, 100, 1]
            : key.endsWith("Width") || key.endsWith("Height")
              ? [-1, 2000, 1]
              : [-1, 1000, 1];
  }
const shape: Record<string, z.ZodType> = {};
for (const [key, value] of Object.entries(phoneDefaults)) {
  let schema: z.ZodType;
  if (key.endsWith("AssetId"))
    schema = z
      .string()
      .regex(
        /FontAssetId$/i.test(key)
          ? /^font-[a-f0-9]{24}$/
          : /^(icon|image|sticker|bar-background|wallpaper)-[a-f0-9]{24}$/,
      )
      .nullable();
  else if (typeof value === "number") {
    const r = phoneRanges[key]!;
    schema = z.number().finite().min(r[0]).max(r[1]);
  } else if (typeof value === "boolean") schema = z.boolean();
  else if (key === "cameraType")
    schema = z.enum(["none", "hole", "island", "notch"]);
  else if (key === "navigationMode")
    schema = z.enum(["none", "gesture", "buttons"]);
  else if (key.endsWith("Symbol"))
    schema = z.enum(iconNames as [string, ...string[]]);
  else if (key === "statusIconProfile") schema = z.enum(["classic", "ios"]);
  else if (key === "batteryPercentPlacement")
    schema = z.enum(["outside", "inside"]);
  else if (key === "bubbleTailStyle") schema = z.enum(["point", "round"]);
  else if (key === "titleAlign") schema = z.enum(["left", "center", "right"]);
  else if (/^header(Left|Right\d)$|^footer(Left|Right)\d$/.test(key))
    schema = z.enum(iconNames as [string, ...string[]]);
  else if (key.endsWith("Style")) schema = z.enum(["outline", "filled"]);
  else if (key === "messageCSS") schema = z.string().max(4000);
  else if (value === "" && !["inputText"].includes(key))
    schema = z.string().regex(/^$|^#[\da-fA-F]{6}([\da-fA-F]{2})?$/);
  else
    schema = z
      .string()
      .max(200)
      .refine((s) => !/[\r\n]/.test(s));
  shape[key] = schema.optional();
}
export const phoneUISchema = z.object(shape).strict() as z.ZodType<
  Partial<PhoneUI>
>;
export function resolvePhoneUI(input?: Partial<PhoneUI>): PhoneUI {
  return { ...phoneDefaults, ...input } as PhoneUI;
}
