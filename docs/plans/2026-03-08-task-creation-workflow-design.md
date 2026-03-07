# 任务创建工作流重构设计

> 日期: 2026-03-08
> 参考: cc-wf-studio (breaking-brake/cc-wf-studio)
> 状态: 已确认

## 1. 概述

重构 TaskConductor 的任务创建流程，从简单的"标题+描述"表单升级为 AI 驱动的智能任务创建工作流。

**核心流程**：
```
用户提交需求（文字/语音）
  -> AI 评估生成需求文档
  -> 用户审阅（内联编辑 + 对话修改）
  -> 确认后 AI 生成多执行方案
  -> 用户选择方案 + Workflow 预览
  -> 自动入队执行
```

## 2. 整体架构：双模式任务创建面板

### 方案选择：混合式（方案C）

- **快速模式（默认）**：标题 + 描述 + 模板选择 + 依赖选择 -> 直接创建
- **AI辅助模式**：点击"AI辅助"或描述超过100字自动切换 -> 对话式完善需求

### 状态流转

```
QUICK_INPUT -> (点击AI辅助) -> AI_REFINING -> (确认需求) -> PLAN_SELECTION -> (选择方案) -> EXECUTING
     |                          ^    |                      ^
  (直接创建)                (驳回修改)  (微调文档)          (返回修改)
     |
  创建任务(stage=input, status=pending)
```

### 面板布局

**快速模式**：
- 模板卡片选择栏（可选）
- 标题输入 + 描述文本框（含语音录入按钮）
- 依赖任务多选
- 操作栏：[取消] [AI辅助] [创建]

**AI辅助模式（左右分栏）**：
- 左侧对话区：AI 引导 + 消息列表 + 输入框（含语音）
- 右侧需求文档：Markdown 实时预览，支持内联编辑
- 操作栏：[取消] [驳回修改] [确认需求 -> 选方案]

**方案选择阶段**：
- 2-3 个方案卡片（复杂度 + 技术栈 + 阶段数 + 优缺点）
- 选中方案后展示 Workflow 流程图预览
- 操作栏：[返回修改] [开始执行]

## 3. 后端 API 与数据模型

### 新增 API 端点

```
POST /api/tasks/evaluate
  Body: { project_id, description, template_id? }
  Response: { requirement_doc, suggested_template, confidence }

POST /api/tasks/refine
  Body: { project_id, current_doc, feedback }
  Response: { requirement_doc, changes_summary }

POST /api/tasks/generate-plans
  Body: { project_id, requirement_doc }
  Response: { plans: [{ id, name, complexity_level, tech_stack, estimated_stages, stage_details, pros, cons }] }

POST /api/tasks/create-with-plan
  Body: { project_id, requirement_doc, selected_plan_id, auto_start: bool }
  Response: TaskOut

GET  /api/templates
GET  /api/templates/suggest?project_id
POST /api/templates

POST /api/voice/transcribe
  Body: FormData(audio_file)
  Response: { text }
```

### 需求文档结构（requirement_doc）

```json
{
  "title": "任务标题",
  "features": ["功能点1", "功能点2"],
  "tech_approach": "技术方案描述",
  "acceptance_criteria": ["验收标准1", "验收标准2"],
  "risks": ["风险1"],
  "dependencies": [1, 2],
  "file_changes": [{"path": "src/xxx.tsx", "action": "create/modify", "description": "..."}],
  "test_strategy": "测试策略描述"
}
```

### 数据模型变更

**新增 TaskTemplate 表**：
```python
class TaskTemplate(Base):
    __tablename__ = "task_templates"
    id: Mapped[int]                       # 主键
    name: Mapped[str]                     # "全栈功能"
    category: Mapped[str]                 # feature | bugfix | api | ui | refactor | custom
    description: Mapped[str]              # 模板描述
    stage_config: Mapped[str]             # JSON: 阶段配置
    prompt_hints: Mapped[str]             # JSON: 引导问题
    is_builtin: Mapped[bool]              # 内置 vs 学习生成
    learned_from_task_id: Mapped[int|None]
    project_id: Mapped[int|None]          # null=全局
    use_count: Mapped[int]
    created_at: Mapped[str]
```

**Task 模型扩展**：
```python
# 新增字段
template_id: Mapped[int|None]             # 使用的模板
requirement_doc: Mapped[str|None]         # JSON: 完整需求文档
selected_plan: Mapped[str|None]           # JSON: 选择的执行方案
creation_mode: Mapped[str]                # "quick" | "ai_assisted"
```

## 4. 前端组件结构

```
TaskCreationPanel (全屏 Modal)
+-- TaskCreationHeader (标题 + [快速|AI辅助] Tab)
|
+-- QuickMode
|   +-- TemplateSelector -> TemplateCard x N
|   +-- TaskQuickForm (标题/描述/依赖)
|   |   +-- VoiceInputButton
|   |   +-- DependencyPicker
|   +-- ActionBar
|
+-- AIAssistedMode
|   +-- SplitPane (左右分栏, 可拖拽)
|   |   +-- ChatPane (消息列表 + ChatInputMini + 语音)
|   |   +-- RequirementDocPane (Markdown 编辑/预览)
|   +-- ActionBar
|
+-- PlanSelectionMode
|   +-- PlanCards -> PlanCard x 2-3
|   +-- WorkflowPreview (交互式流程图)
|   +-- ActionBar
|
+-- VoiceWakeup (全局组件, 挂载在 App.tsx)
```

### 交互细节

- 快速模式描述超过100字 -> 提示切换AI辅助
- 切换时已输入内容自动作为AI对话首条消息
- AI引导：读取用户描述 + 项目上下文 + 模板 -> 生成初版文档 -> 逐一追问 -> 实时更新右侧文档
- 方案选择：点击卡片展开Workflow预览，标注审批节点，平滑过渡

## 5. Workflow 流程图（全新交互式）

替换现有 TaskWorkflow.tsx 蛇形布局，采用 cc-wf-studio 风格画布。

### 节点类型

| 类型 | 颜色 | 说明 |
|------|------|------|
| requirement | 蓝色 | 需求确认（起点） |
| analysis | 紫色 | 需求分析 |
| prd | 紫色 | PRD 文档 |
| design | 青色 | UI/架构设计 |
| plan | 青色 | 实施计划 |
| dev | 绿色 | 开发实现 |
| test | 黄色 | 测试验证 |
| deploy | 橙色 | 部署上线 |
| monitor | 灰色 | 监控（终点） |
| approval | 黄色边框 | 审批叠加层 |

### 节点卡片内容

- 阶段名 + 复杂度星级
- 状态标识（pending/running/done/approval）
- 预估时间
- 技术栈标签（可展开）
- 文件变更数
- 审批标记 + 查看详情按钮

### 交互行为

- 悬停：Tooltip 显示阶段描述/预估/依赖
- 点击：侧面板展示产物/日志/审批
- 点击审批节点：弹出审批操作
- 执行中：脉冲动画 + 进度条 + 实时日志
- 已完成：绿色边框 + 查看产物
- 画布：缩放/平移/适应屏幕/小地图

### 布局

- dagre 自动布局（LR方向）
- 审批节点显示条件分支
- 并行阶段并排显示
- 节点间距自适应，连线带箭头 + 状态颜色

### 复用场景

- 任务创建 -> 方案选择阶段（只读预览）
- TaskPipeline 页面 -> 可交互（审批/日志），WebSocket 实时更新

## 6. 模板系统

### 内置模板（6个）

| 模板 | category | 默认阶段 | 引导问题 |
|------|----------|---------|---------|
| 全栈功能 | feature | analysis->prd->design->plan->dev->test->deploy | 前后端比重？新建表？ |
| Bug 修复 | bugfix | analysis->plan->dev->test | 可复现？报错日志？影响范围？ |
| API 开发 | api | analysis->prd->plan->dev->test->deploy | REST/GraphQL？鉴权？ |
| UI 组件 | ui | analysis->design->dev->test | 设计稿？响应式？主题？ |
| 重构优化 | refactor | analysis->plan->dev->test | 性能/结构？影响模块？ |
| 自定义 | custom | 用户自选 | 需要哪些阶段？ |

### 学习机制

```
任务完成(done) -> 分析执行数据（阶段/耗时/重试/评分）
  -> 与现有模板对比
  -> 匹配度 > 80%: 更新模板权重
  -> 匹配度 < 80%: 标记候选
  -> 同 pattern 出现 3次+: 自动创建新模板(is_builtin=False, project_id=当前项目)
```

### 推荐排序

1. 项目专属学习模板（最近使用优先）
2. 全局学习模板
3. 内置模板（use_count 排序）

## 7. 语音系统

### 双层架构

1. **前端 Web Speech API**（实时、免费）：语音唤醒 + 实时转写
2. **后端 Whisper 兜底**：MediaRecorder 录音 -> POST /api/voice/transcribe

### 全局语音唤醒

- VoiceWakeup 组件挂载在 App.tsx
- 设置页开启（默认关闭）
- SpeechRecognition continuous 模式监听关键词
- 检测 "新建任务"/"创建任务"/"new task"
- 唤醒后：提示音 -> 打开 TaskCreationPanel(AI辅助模式) -> 继续录音转文字
- 停顿2秒自动发送

### 面板内语音录入

- VoiceInputButton：输入框右侧麦克风图标
- 点击录音，再次点击停止
- 波形动画 + 时长显示
- 实时转写（Web Speech API）或录完转写（Whisper）
- 结果追加到输入框

### 设置项

- 全局语音唤醒开关（默认关）
- 自定义唤醒词
- 语音识别引擎选择
- Whisper 模型选择（base/small/medium）
- 自动发送延迟（默认2秒）

## 8. 关键文件变更清单

### 后端新增

```
backend/app/routers/task_creation.py    # evaluate/refine/generate-plans/create-with-plan
backend/app/routers/templates.py        # 模板 CRUD + 推荐
backend/app/routers/voice.py            # 语音转文字
backend/app/pipeline/template_learner.py # 模板学习引擎
backend/app/schemas.py                  # 扩展: RequirementDoc/PlanOutput/TaskTemplate 等
```

### 后端修改

```
backend/app/models.py                   # 新增 TaskTemplate, Task 扩展字段
backend/app/main.py                     # 注册新路由
backend/app/pipeline/runner.py          # on_task_complete 触发模板学习
backend/app/database.py                 # 迁移
```

### 前端新增

```
frontend/src/components/TaskCreationPanel.tsx      # 主面板
frontend/src/components/TaskCreationHeader.tsx      # 头部 Tab
frontend/src/components/QuickMode.tsx               # 快速创建
frontend/src/components/AIAssistedMode.tsx           # AI辅助
frontend/src/components/PlanSelectionMode.tsx        # 方案选择
frontend/src/components/TemplateSelector.tsx         # 模板选择器
frontend/src/components/TemplateCard.tsx             # 模板卡片
frontend/src/components/DependencyPicker.tsx         # 依赖选择
frontend/src/components/RequirementDocPane.tsx       # 需求文档编辑/预览
frontend/src/components/PlanCard.tsx                 # 方案卡片
frontend/src/components/WorkflowCanvas.tsx           # 全新交互式流程图
frontend/src/components/WorkflowNode.tsx             # 自定义节点
frontend/src/components/VoiceInputButton.tsx         # 语音录入
frontend/src/components/VoiceWakeup.tsx              # 全局语音唤醒
frontend/src/hooks/useVoiceInput.ts                  # 语音录入 hook
frontend/src/hooks/useVoiceWakeup.ts                 # 语音唤醒 hook
```

### 前端修改

```
frontend/src/pages/Dashboard.tsx        # NewTaskButton -> TaskCreationPanel
frontend/src/pages/TaskPipeline.tsx     # 替换 TaskWorkflow 为 WorkflowCanvas
frontend/src/components/AppShell.tsx    # VoiceWakeup 全局挂载
frontend/src/App.tsx                    # VoiceWakeup 状态管理
frontend/src/lib/api.ts                # 新增 API 接口定义
frontend/src/pages/Settings.tsx        # 语音设置项
```
