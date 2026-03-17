import { useState } from 'react'
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
import styles from './dev.module.css'

// All file icons from /public/file-icons/
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
  { name: 'ex (elixir)', file: 'file_type_ex@2x.png' },
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

type Tab = 'file-icons' | 'ui-icons' | 'components'

export default function DevToolsPage() {
  const [tab, setTab] = useState<Tab>('file-icons')
  const [search, setSearch] = useState('')

  const filteredFileIcons = search
    ? FILE_ICONS.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : FILE_ICONS

  const filteredUIIcons = search
    ? UI_ICONS.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : UI_ICONS

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>
        Dev Tools
        <span className={styles.devBadge}>DEV ONLY</span>
      </h1>
      <p className={styles.subtitle}>
        {FILE_ICONS.length} file icons &middot; {UI_ICONS.length} UI icons &middot; Components
      </p>

      <div className={styles.tabs}>
        <button className={styles.tab} data-active={tab === 'file-icons'} onClick={() => setTab('file-icons')}>
          File Icons ({filteredFileIcons.length})
        </button>
        <button className={styles.tab} data-active={tab === 'ui-icons'} onClick={() => setTab('ui-icons')}>
          UI Icons ({filteredUIIcons.length})
        </button>
        <button className={styles.tab} data-active={tab === 'components'} onClick={() => setTab('components')}>
          Components
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

      {tab === 'components' && (
        <>
          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>Button</div>
            <div className={styles.componentHint}>variant: default | ghost | outline &middot; size: sm | md | lg | icon</div>
            <div className={styles.showcase}>
              <Button variant="default" size="sm">Default SM</Button>
              <Button variant="default" size="md">Default MD</Button>
              <Button variant="default" size="lg">Default LG</Button>
              <Button variant="ghost" size="md">Ghost</Button>
              <Button variant="outline" size="md">Outline</Button>
              <Button variant="default" size="icon"><IconPlus size={16} /></Button>
              <Button variant="ghost" size="icon"><IconSettings size={16} /></Button>
            </div>
          </div>

          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>Icon (Base)</div>
            <div className={styles.componentHint}>{'<Icon size={N} color="...">'} &middot; SVG wrapper &middot; Feather style</div>
            <div className={styles.showcase}>
              <Icon size={16}><circle cx="12" cy="12" r="10" /></Icon>
              <Icon size={20}><circle cx="12" cy="12" r="10" /></Icon>
              <Icon size={24}><circle cx="12" cy="12" r="10" /></Icon>
              <Icon size={24} color="var(--tc-border-active)"><circle cx="12" cy="12" r="10" /></Icon>
            </div>
          </div>

          <div className={styles.componentSection}>
            <div className={styles.componentTitle}>Colors (CSS Variables)</div>
            <div className={styles.showcase} style={{ gap: 8, flexWrap: 'wrap' }}>
              {[
                '--tc-foreground',
                '--tc-foreground-secondary',
                '--tc-content-bg',
                '--tc-sidebar-bg',
                '--tc-border',
                '--tc-border-active',
                '--tc-sidebar-item-hover',
                '--tc-sidebar-item-active-bg',
                '--tc-sidebar-item-active-fg',
                '--tc-focus-ring',
              ].map(v => (
                <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    background: `var(${v})`,
                    border: '1px solid var(--tc-border)',
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--tc-foreground-secondary)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
