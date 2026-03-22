import { useState } from 'react'
import { FileTreeMap } from './tabs/FileTreeMap'
import { ChatDemo } from './tabs/ChatDemo'
import {
  Icon,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconBell,
  IconSettings,
  IconMessage,
  IconPlus,
  IconFileText,
  IconLayoutGrid,
  IconX,
  IconGripHorizontal,
  IconUser,
  IconLogo,
  IconMonitor,
  IconArrowLeft,
  IconGitBranch,
  IconFolder,
  IconFolderOpen,
} from '../../ui/icon'
import { Button } from '../../ui/button/Button'
import { Toggle } from '../../ui/toggle/Toggle'
import { TagInput } from '../../ui/tag-input/TagInput'
import { JsonEditor } from '../../ui/json-editor/JsonEditor'
import { Skeleton, SkeletonCard } from '../../ui/skeleton/Skeleton'
import { EmptyState } from '../../ui/empty-state/EmptyState'
import { Modal } from '../../ui/modal/Modal'
import { RadioGroup } from '../../ui/radio-group/RadioGroup'
import styles from './dev.module.css'

// ── File Icons ─────────────────────────────────────────────
const FILE_ICONS = [
  { name: 'default', file: 'file_type_default.svg' },
  { name: 'angular', file: 'file_type_angular.svg' },
  { name: 'archive', file: 'file_type_archive@2x.png' },
  { name: 'audio', file: 'file_type_audio@2x.png' },
  { name: 'babel', file: 'file_type_babel@2x.png' },
  { name: 'binary', file: 'file_type_binary.svg' },
  { name: 'c', file: 'file_type_c.svg' },
  { name: 'cargo', file: 'file_type_cargo.svg' },
  { name: 'clojure', file: 'file_type_clojure@2x.png' },
  { name: 'coffeescript', file: 'file_type_coffeescript@2x.png' },
  { name: 'cpp', file: 'file_type_cpp.svg' },
  { name: 'csharp', file: 'file_type_csharp.svg' },
  { name: 'css', file: 'file_type_css.svg' },
  { name: 'csv', file: 'file_type_csv.svg' },
  { name: 'dart', file: 'file_type_dart.svg' },
  { name: 'docker', file: 'file_type_docker@2x.png' },
  { name: 'editorconfig', file: 'file_type_editorconfig@2x.png' },
  { name: 'elm', file: 'file_type_elm@2x.png' },
  { name: 'erlang', file: 'file_type_erlang@2x.png' },
  { name: 'eslint', file: 'file_type_eslint@2x.png' },
  { name: 'elixir', file: 'file_type_ex@2x.png' },
  { name: 'excel', file: 'file_type_excel@2x.png' },
  { name: 'font', file: 'file_type_font.svg' },
  { name: 'git', file: 'file_type_git.svg' },
  { name: 'go', file: 'file_type_go.svg' },
  { name: 'graphql', file: 'file_type_gql.svg' },
  { name: 'graphviz', file: 'file_type_graphviz.svg' },
  { name: 'groovy', file: 'file_type_groovy.svg' },
  { name: 'gruntfile', file: 'file_type_gruntfile.svg' },
  { name: 'haskell', file: 'file_type_haskell.svg' },
  { name: 'haxe', file: 'file_type_haxe.svg' },
  { name: 'html', file: 'file_type_html@2x.png' },
  { name: 'image', file: 'file_type_image.svg' },
  { name: 'java', file: 'file_type_java.svg' },
  { name: 'jest', file: 'file_type_jest@2x.png' },
  { name: 'js', file: 'file_type_js.svg' },
  { name: 'json', file: 'file_type_json.svg' },
  { name: 'jsx', file: 'file_type_jsx@2x.png' },
  { name: 'julia', file: 'file_type_julia@2x.png' },
  { name: 'jupyter', file: 'file_type_jupyter.svg' },
  { name: 'kotlin', file: 'file_type_kotlin.svg' },
  { name: 'less', file: 'file_type_less@2x.png' },
  { name: 'license', file: 'file_type_license.svg' },
  { name: 'liquid', file: 'file_type_liquid.svg' },
  { name: 'lock', file: 'file_type_lock@2x.png' },
  { name: 'log', file: 'file_type_log@2x.png' },
  { name: 'lua', file: 'file_type_lua@2x.png' },
  { name: 'markdown', file: 'file_type_markdown.svg' },
  { name: 'matlab', file: 'file_type_matlab@2x.png' },
  { name: 'nginx', file: 'file_type_nginx@2x.png' },
  { name: 'nodejs', file: 'file_type_nodejs@2x.png' },
  { name: 'note', file: 'file_type_note@2x.png' },
  { name: 'npm', file: 'file_type_npm.svg' },
  { name: 'ocaml', file: 'file_type_ocaml@2x.png' },
  { name: 'pdf', file: 'file_type_pdf@2x.png' },
  { name: 'perl', file: 'file_type_perl.svg' },
  { name: 'php', file: 'file_type_php.svg' },
  { name: 'postcss', file: 'file_type_postcss@2x.png' },
  { name: 'powerpoint', file: 'file_type_powerpoint@2x.png' },
  { name: 'powershell', file: 'file_type_powershell@2x.png' },
  { name: 'prettier', file: 'file_type_prettier.svg' },
  { name: 'procfile', file: 'file_type_procfile.svg' },
  { name: 'psd', file: 'file_type_psd@2x.png' },
  { name: 'pug', file: 'file_type_pug@2x.png' },
  { name: 'python', file: 'file_type_python.svg' },
  { name: 'R', file: 'file_type_R@2x.png' },
  { name: 'rollup', file: 'file_type_rollup.svg' },
  { name: 'ruby', file: 'file_type_ruby.svg' },
  { name: 'rust', file: 'file_type_rust.svg' },
  { name: 'sass', file: 'file_type_sass.svg' },
  { name: 'scala', file: 'file_type_scala@2x.png' },
  { name: 'scss', file: 'file_type_scss.svg' },
  { name: 'settings', file: 'file_type_settings@2x.png' },
  { name: 'shell', file: 'file_type_shell.svg' },
  { name: 'sketch', file: 'file_type_sketch.svg' },
  { name: 'source', file: 'file_type_source.svg' },
  { name: 'sql', file: 'file_type_sql@2x.png' },
  { name: 'svelte', file: 'file_type_svelte.svg' },
  { name: 'swift', file: 'file_type_swift.svg' },
  { name: 'tailwind', file: 'file_type_tailwind.svg' },
  { name: 'tex', file: 'file_type_tex@2x.png' },
  { name: 'text', file: 'file_type_text@2x.png' },
  { name: 'todo', file: 'file_type_todo@2x.png' },
  { name: 'toml', file: 'file_type_toml.svg' },
  { name: 'typescript', file: 'file_type_typescript.svg' },
  { name: 'video', file: 'file_type_video@2x.png' },
  { name: 'vim', file: 'file_type_vim@2x.png' },
  { name: 'vue', file: 'file_type_vue.svg' },
  { name: 'wasm', file: 'file_type_wasm.svg' },
  { name: 'webpack', file: 'file_type_webpack@2x.png' },
  { name: 'word', file: 'file_type_word@2x.png' },
  { name: 'yaml', file: 'file_type_yaml.svg' },
  { name: 'yarn', file: 'file_type_yarn@2x.png' },
  { name: 'folder', file: 'folder_dark@2x.png' },
  { name: 'folder open', file: 'folder_opened_dark@2x.png' },
]

// ── UI Icons ───────────────────────────────────────────────
const UI_ICONS = [
  { name: 'ChevronLeft', component: <IconChevronLeft size={20} /> },
  { name: 'ChevronRight', component: <IconChevronRight size={20} /> },
  { name: 'Search', component: <IconSearch size={20} /> },
  { name: 'Bell', component: <IconBell size={20} /> },
  { name: 'Settings', component: <IconSettings size={20} /> },
  { name: 'Message', component: <IconMessage size={20} /> },
  { name: 'Plus', component: <IconPlus size={20} /> },
  { name: 'FileText', component: <IconFileText size={20} /> },
  { name: 'LayoutGrid', component: <IconLayoutGrid size={20} /> },
  { name: 'X', component: <IconX size={20} /> },
  { name: 'GripHorizontal', component: <IconGripHorizontal size={20} /> },
  { name: 'User', component: <IconUser size={20} /> },
  { name: 'Logo', component: <IconLogo size={20} /> },
  { name: 'Monitor', component: <IconMonitor size={20} /> },
  { name: 'ArrowLeft', component: <IconArrowLeft size={20} /> },
  { name: 'GitBranch', component: <IconGitBranch size={20} /> },
  { name: 'Folder', component: <IconFolder size={20} /> },
  { name: 'FolderOpen', component: <IconFolderOpen size={20} /> },
]

// ── CSS Variable 色板 ──────────────────────────────────────
const CSS_VARS = [
  { group: 'Foreground', vars: ['--tc-foreground', '--tc-foreground-secondary'] },
  { group: 'Background', vars: ['--tc-content-bg', '--tc-sidebar-bg', '--tc-topbar-bg', '--tc-panel-bg'] },
  { group: 'Border', vars: ['--tc-border', '--tc-border-active', '--tc-focus-ring'] },
  { group: 'Sidebar', vars: ['--tc-sidebar-item-hover', '--tc-sidebar-item-active-bg', '--tc-sidebar-item-active-fg'] },
  { group: 'Semantic', vars: ['--tc-error', '--tc-warning', '--tc-success', '--tc-info'] },
]

type Tab = 'file-icons' | 'ui-icons' | 'components' | 'file-map' | 'chat-demo'

export default function DevToolsPage() {
  const [tab, setTab] = useState<Tab>('components')
  const [search, setSearch] = useState('')

  // Component demo states
  const [toggleA, setToggleA] = useState(false)
  const [toggleB, setToggleB] = useState(true)
  const [tags, setTags] = useState(['React', 'TypeScript', 'Vite'])
  const [jsonVal, setJsonVal] = useState<unknown>({ name: 'TaskConductor', version: '1.0.0', features: ['pipeline', 'observe'] })
  const [modalOpen, setModalOpen] = useState(false)
  const [radioVal, setRadioVal] = useState('dark')
  const [radioLayout, setRadioLayout] = useState<'vertical' | 'horizontal' | 'grid'>('horizontal')

  const filteredFileIcons = search
    ? FILE_ICONS.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : FILE_ICONS

  const filteredUIIcons = search
    ? UI_ICONS.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : UI_ICONS

  const componentCount = 9 // Button, Toggle, TagInput, JsonEditor, Skeleton, EmptyState, Modal, RadioGroup, Icon

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>
        Dev Tools
        <span className={styles.devBadge}>DEV ONLY</span>
      </h1>
      <p className={styles.subtitle}>
        {componentCount} components &middot; {UI_ICONS.length} UI icons &middot; {FILE_ICONS.length} file icons
      </p>

      <div className={styles.tabs}>
        <button className={styles.tab} data-active={tab === 'components'} onClick={() => setTab('components')}>
          Components ({componentCount})
        </button>
        <button className={styles.tab} data-active={tab === 'ui-icons'} onClick={() => setTab('ui-icons')}>
          UI Icons ({filteredUIIcons.length})
        </button>
        <button className={styles.tab} data-active={tab === 'file-icons'} onClick={() => setTab('file-icons')}>
          File Icons ({filteredFileIcons.length})
        </button>
        <button className={styles.tab} data-active={tab === 'file-map'} onClick={() => setTab('file-map')}>
          File Map
        </button>
        <button className={styles.tab} data-active={tab === 'chat-demo'} onClick={() => setTab('chat-demo')}>
          Chat Demo (13)
        </button>
      </div>

      {(tab === 'file-icons' || tab === 'ui-icons') && (
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Filter icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '6px 10px',
              fontSize: 13,
              background: 'var(--tc-content-bg)',
              border: '1px solid var(--tc-border)',
              borderRadius: 4,
              color: 'var(--tc-foreground)',
              outline: 'none',
              width: 240,
            }}
          />
        </div>
      )}

      {/* ── Components Tab ─────────────────────────────── */}
      {tab === 'components' && (
        <>
          {/* Button */}
          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>Button</div>
            <div className={styles.componentHint}>
              ui/button/Button.tsx &middot; variant: default | ghost | outline &middot; size: sm | md | lg | icon
            </div>
            <div className={styles.showcase}>
              <Button variant="default" size="sm">Default SM</Button>
              <Button variant="default" size="md">Default MD</Button>
              <Button variant="default" size="lg">Default LG</Button>
              <Button variant="ghost" size="md">Ghost</Button>
              <Button variant="outline" size="md">Outline</Button>
              <Button variant="default" size="icon"><IconPlus size={16} /></Button>
              <Button variant="ghost" size="icon"><IconSettings size={16} /></Button>
              <Button variant="default" size="md" disabled>Disabled</Button>
            </div>
          </div>

          {/* Toggle */}
          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>Toggle</div>
            <div className={styles.componentHint}>
              ui/toggle/Toggle.tsx &middot; role="switch" &middot; checked + onChange
            </div>
            <div className={styles.showcase}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Toggle checked={toggleA} onChange={setToggleA} />
                <span style={{ fontSize: 13, color: 'var(--tc-foreground-secondary)' }}>
                  {toggleA ? 'ON' : 'OFF'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Toggle checked={toggleB} onChange={setToggleB} />
                <span style={{ fontSize: 13, color: 'var(--tc-foreground-secondary)' }}>
                  {toggleB ? 'ON' : 'OFF'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Toggle checked={false} disabled />
                <span style={{ fontSize: 13, color: 'var(--tc-foreground-secondary)' }}>Disabled</span>
              </div>
            </div>
          </div>

          {/* TagInput */}
          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>TagInput</div>
            <div className={styles.componentHint}>
              ui/tag-input/TagInput.tsx &middot; Enter to add, Backspace to remove
            </div>
            <div className={styles.showcase} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <TagInput tags={tags} onChange={setTags} placeholder="Add a tag..." />
              <TagInput tags={['read-only']} onChange={() => {}} disabled />
            </div>
          </div>

          {/* RadioGroup */}
          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>RadioGroup</div>
            <div className={styles.componentHint}>
              ui/radio-group/RadioGroup.tsx &middot; layout: horizontal | vertical | grid &middot; size: sm | md
            </div>
            <div className={styles.showcase} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--tc-foreground-secondary)', marginBottom: 6 }}>
                  Layout switcher (horizontal):
                </div>
                <RadioGroup
                  options={[
                    { value: 'horizontal', label: 'Horizontal' },
                    { value: 'vertical', label: 'Vertical' },
                    { value: 'grid', label: 'Grid' },
                  ]}
                  value={radioLayout}
                  onChange={(v) => setRadioLayout(v as typeof radioLayout)}
                  layout="horizontal"
                  size="sm"
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--tc-foreground-secondary)', marginBottom: 6 }}>
                  Theme selector ({radioLayout}):
                </div>
                <RadioGroup
                  options={[
                    { value: 'dark', label: 'Dark+', description: 'VS Code Dark theme' },
                    { value: 'light', label: 'Light+', description: 'VS Code Light theme' },
                    { value: 'custom', label: 'Custom', description: 'User defined', disabled: true },
                  ]}
                  value={radioVal}
                  onChange={setRadioVal}
                  layout={radioLayout}
                />
              </div>
            </div>
          </div>

          {/* Modal */}
          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>Modal</div>
            <div className={styles.componentHint}>
              ui/modal/Modal.tsx &middot; Portal to body &middot; size: sm | md | lg &middot; Escape to close
            </div>
            <div className={styles.showcase}>
              <Button variant="default" size="md" onClick={() => setModalOpen(true)}>
                Open Modal
              </Button>
              <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Modal Title"
                description="This is a modal dialog component."
                size="md"
                footer={
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
                    <Button variant="default" size="sm" onClick={() => setModalOpen(false)}>Confirm</Button>
                  </div>
                }
              >
                <p style={{ color: 'var(--tc-foreground)', fontSize: 13, margin: 0 }}>
                  Modal body content goes here. Click overlay or press Escape to close.
                </p>
              </Modal>
            </div>
          </div>

          {/* EmptyState */}
          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>EmptyState</div>
            <div className={styles.componentHint}>
              ui/empty-state/EmptyState.tsx &middot; icon + title + description + primary/secondary actions
            </div>
            <div className={styles.showcase} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <EmptyState
                icon="📭"
                title="No data yet"
                description="Start by creating your first item"
                action={{ label: 'Create', onClick: () => {} }}
                secondaryAction={{ label: 'Learn more', onClick: () => {} }}
              />
            </div>
          </div>

          {/* Skeleton */}
          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>Skeleton</div>
            <div className={styles.componentHint}>
              ui/skeleton/Skeleton.tsx &middot; variant: text | rect | circle &middot; SkeletonCard wrapper
            </div>
            <div className={styles.showcase} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Skeleton variant="circle" width={40} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="40%" />
                </div>
              </div>
              <SkeletonCard>
                <Skeleton variant="rect" width="100%" height={80} />
                <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skeleton variant="text" width="80%" />
                  <Skeleton variant="text" width="50%" />
                </div>
              </SkeletonCard>
            </div>
          </div>

          {/* JsonEditor */}
          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>JsonEditor</div>
            <div className={styles.componentHint}>
              ui/json-editor/JsonEditor.tsx &middot; Pretty-print + validation + auto-save on blur
            </div>
            <div className={styles.showcase} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <JsonEditor
                value={jsonVal}
                onChange={setJsonVal}
                label="Editable JSON"
              />
              <JsonEditor
                value={{ status: 'readonly', mode: 'display' }}
                onChange={() => {}}
                readonly
                label="Read-only JSON"
              />
            </div>
          </div>

          {/* Icon (Base) */}
          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>Icon (Base)</div>
            <div className={styles.componentHint}>
              ui/icon/Icon.tsx &middot; SVG wrapper &middot; size + color props &middot; Feather style (24x24 viewBox, 2px stroke)
            </div>
            <div className={styles.showcase}>
              <Icon size={16}><circle cx="12" cy="12" r="10" /></Icon>
              <Icon size={20}><circle cx="12" cy="12" r="10" /></Icon>
              <Icon size={24}><circle cx="12" cy="12" r="10" /></Icon>
              <Icon size={24} color="var(--tc-border-active)"><circle cx="12" cy="12" r="10" /></Icon>
              <Icon size={24} color="var(--tc-error)"><circle cx="12" cy="12" r="10" /></Icon>
              <Icon size={24} color="var(--tc-success)"><circle cx="12" cy="12" r="10" /></Icon>
            </div>
          </div>

          {/* CSS Variables */}
          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>Design Tokens (CSS Variables)</div>
            <div className={styles.componentHint}>
              ui/theme/tokens.ts &middot; --tc-* prefix &middot; ThemeProvider injects to :root
            </div>
            <div className={styles.showcase} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
              {CSS_VARS.map(group => (
                <div key={group.group}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tc-foreground-secondary)', marginBottom: 6 }}>
                    {group.group}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {group.vars.map(v => (
                      <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          background: `var(${v})`,
                          border: '1px solid var(--tc-border)',
                          flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 10, color: 'var(--tc-foreground-secondary)', fontFamily: 'monospace' }}>
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── UI Icons Tab ───────────────────────────────── */}
      {tab === 'ui-icons' && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>UI Icons ({filteredUIIcons.length})</div>
          <div className={styles.uiIconGrid}>
            {filteredUIIcons.map(icon => (
              <div key={icon.name} className={styles.uiIconCard}>
                {icon.component}
                <span className={styles.uiIconCardLabel}>{icon.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── File Map Tab ───────────────────────────────── */}
      {tab === 'file-map' && <FileTreeMap />}

      {/* ── Chat Demo Tab ──────────────────────────────── */}
      {tab === 'chat-demo' && <ChatDemo />}

      {/* ── File Icons Tab ─────────────────────────────── */}
      {tab === 'file-icons' && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Ayu File Icons ({filteredFileIcons.length})</div>
          <div className={styles.iconGrid}>
            {filteredFileIcons.map(icon => (
              <div key={icon.file} className={styles.iconCard}>
                <img src={`/file-icons/${icon.file}`} alt={icon.name} />
                <span className={styles.iconCardLabel}>{icon.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
