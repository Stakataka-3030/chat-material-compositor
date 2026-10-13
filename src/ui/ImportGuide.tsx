const example = {
  id: "notice-card",
  version: "1.0.0",
  name: "通知",
  description: "标题与正文组成的通知卡片",
  icon: "file",
  enabled: true,
  fields: [
    {
      key: "title",
      label: "标题",
      type: "text",
      default: "排练通知",
      required: true,
    },
    {
      key: "body",
      label: "正文",
      type: "multiline",
      default: "周六下午三点，老地方见。",
    },
  ],
  layout: {
    variant: "card",
    width: 240,
    nodes: [
      { type: "text", text: "{{title}}", size: 18, bold: true },
      { type: "line" },
      { type: "text", text: "{{body}}", size: 16, color: "$text" },
    ],
  },
};

export function ImportGuide({
  kind,
  showStyles,
}: {
  kind: "project" | "style";
  showStyles?: () => void;
}) {
  return (
    <details className="import-guide">
      <summary>{kind === "style" ? "自定义说明" : "工程包说明"}</summary>
      <div className="import-guide-content">
        {kind === "project" ? (
          <>
            <p>
              工程包保存聊天内容、角色、使用过的素材和消息配置。点击“打开工程包”后，可以继续编辑。支持
              .chatproj 工程包、旧版工程包和 ZIP 工程包。
            </p>
            <p>添加新的消息类型时，在“样式”页导入 JSON 配置文件。</p>
            <button className="text-button" onClick={showStyles}>
              查看新消息类型的配置方法
            </button>
          </>
        ) : (
          <>
            <p>
              新消息类型用 JSON
              配置。可以从示例开始，修改名称、编辑字段和排版，再点击“导入配置”。
            </p>
            <ol>
              <li>
                <code>id</code> 是独立标识，使用字母、数字或连字符；
                <code>name</code> 是显示名称，<code>version</code> 记录版本。
              </li>
              <li>
                <code>fields</code> 定义编辑项。每项填写 <code>key</code>、
                <code>label</code>、<code>type</code> 和 <code>default</code>；
                <code>required</code> 可设为必填。
              </li>
              <li>
                <code>layout</code> 定义气泡或卡片，<code>nodes</code>{" "}
                按顺序排正文；文字中的 <code>{"{{字段名}}"}</code>{" "}
                会替换成输入内容。
              </li>
            </ol>
            <p>
              字段可用 text、multiline、number、select、color、asset。布局可用
              text、image、row、column、space、line、wave；行和列的子项放在
              children 中。图片节点的 asset 填素材字段的 key，例如 imageAsset。
            </p>
            <details>
              <summary>查看通知卡片的完整配置</summary>
              <pre>{JSON.stringify(example, null, 2)}</pre>
            </details>
            <a
              className="text-button"
              href="/api/plugins/example"
              download="订单.style.json"
            >
              下载订单卡片示例
            </a>
            <p className="muted">
              导入后，消息类型列表会出现新选项。再次导入相同 id
              可以更新配置；已有工程保留使用过的配置版本。
            </p>
          </>
        )}
      </div>
    </details>
  );
}
