import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell, TopBar, Sidebar, Panel } from '../layouts'
import { IconFileText, IconLayoutGrid, IconLogo } from '../ui/icon'
import sidebarStyles from '../layouts/Sidebar/sidebar.module.css'
import shellStyles from '../layouts/AppShell/app-shell.module.css'

// 当前项目的内容列表（后续从 API 动态加载）
const PROJECT_ITEMS = [
  { key: '1', label: '需求分析', icon: <IconFileText size={16} /> },
  { key: '2', label: '技术方案', icon: <IconFileText size={16} /> },
  { key: '3', label: 'UI 设计稿', icon: <IconFileText size={16} /> },
  { key: '4', label: '开发计划', icon: <IconFileText size={16} /> },
  { key: '5', label: '测试用例', icon: <IconFileText size={16} /> },
]

export function Layout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  // 从路径中提取当前 task id: /tasks/3 → "3"
  const pathParts = location.pathname.split('/')
  const activeKey = pathParts[1] === 'tasks' ? pathParts[2] ?? '' : ''

  // 根据选中项生成面包屑
  const activeItem = PROJECT_ITEMS.find((item) => item.key === activeKey)
  const breadcrumb = [
    { label: 'Demo Project' },
    ...(activeItem ? [{ label: activeItem.label }] : []),
  ]

  return (
    <AppShell>
      <TopBar
        logoIcon={<IconLogo size={22} />}
        logo="TaskConductor"
        breadcrumb={breadcrumb}
        userName="User"
      />
      <Sidebar
        items={PROJECT_ITEMS}
        activeKey={activeKey}
        onSelect={(key) => navigate(`/tasks/${key}`)}
        footer={
          <button className={sidebarStyles.footerBtn} onClick={() => navigate('/admin')}>
            <IconLayoutGrid size={16} />
            <span className={sidebarStyles.footerBtnLabel}>{t('layout.admin_console')}</span>
          </button>
        }
      />
      <div className={shellStyles.main}>
        <div className={shellStyles.content}>
          <Outlet />
        </div>
        <Panel>
          <div className={shellStyles.panelPlaceholder}>
            {t('layout.panel_placeholder')}
          </div>
        </Panel>
      </div>
    </AppShell>
  )
}
