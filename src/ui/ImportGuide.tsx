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
              字段可用
              text、multiline、number、select、color、asset、speaker、boolean。布局可用
              text、image、row、column、space、line、wave；行和列的子项放在
              children 中。图片节点的 asset 填素材字段的 key，例如 imageAsset。
            </p>
            <details>
              <summary>角色、事件与交互组件</summary>
              <p>
                speaker 字段从角色库选择角色。正文使用{" "}
                <code>{"{{target.name}}"}</code> 显示 target
                对应的昵称。文本编辑器的“插入
                @”会保存角色关联，改名后预览也会更新。
              </p>
              <p>
                effects 支持 group-join、group-leave 和
                avatar-shake，targetField 指定角色字段；震动可配置
                durationMs、amplitude，也可用 durationField、amplitudeField
                读取数字字段。
              </p>
              <p>
                布局可使用 button 节点，填写独立 id、text 和 actions。按钮支持
                set-field、入群、退群、头像震动；disabledWhen 可指定字段和
                equals。点击手机预览中的按钮会记录交互时间，重播与导出会自动重现。
              </p>
              <p>
                组件包使用 ZIP 或 .chatcomponent，包含 component.json
                和可选素材。导出已安装组件时会带上资产字段默认引用的素材。
              </p>
              <a
                className="text-button"
                href="/api/components/example"
                download="邀请卡片.component.json"
              >
                下载交互组件示例
              </a>
            </details>
            <p>
              文字节点可加 <code>css</code>，例如{" "}
              <code>{'"css": "color: #d34b72; font-weight: 700;"'}</code>
              ，也可写 <code>{'"css": "{{css}}"'}</code> 并在 fields 中添加 css
              编辑项。支持字体、颜色、行距、字距、对齐、装饰线、单个阴影和透明度。
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
