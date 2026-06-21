# Relationship Graph

一个基于 React、TypeScript 和 Vite 构建的人际关系图谱管理应用。它以可视化网络的方式组织人物、关系和互动记录，帮助用户梳理复杂的人际网络并安排后续跟进。

## 主要功能

- 创建、编辑和删除人物档案
- 建立人物之间的有向或无向关系
- 在关系图中拖动节点并保存布局
- 按关键词、标签等条件查找和筛选人物
- 记录联系时间、互动内容和下一步计划
- 查看待跟进事项与关系分析
- 导入、导出本地数据
- 使用浏览器本地存储持久化数据

## 技术栈

- React 19
- TypeScript 5
- Vite 6
- Lucide React

## 本地运行

需要预先安装 [Node.js](https://nodejs.org/)（建议使用当前 LTS 版本）。

```bash
npm install
npm run dev
```

开发服务器默认运行在 `http://127.0.0.1:5173`。

## 构建与预览

```bash
npm run build
npm run preview
```

构建结果会生成在 `dist/` 目录中。

## 数据说明

应用数据保存在当前浏览器的本地存储中，不会自动同步到服务器。清理浏览器数据或更换设备前，请先使用导出功能备份数据。

## 项目结构

```text
Relationship/
├── src/
│   ├── App.tsx       # 应用功能与界面
│   ├── main.tsx      # 应用入口
│   └── styles.css    # 全局样式
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## License

本项目暂未指定开源许可证。
