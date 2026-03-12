// frontend/src/pages/KnowledgePage.tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { api, type ProjectKnowledge } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";

interface KnowledgePageProps {
  projectId: number;
  projectName?: string;
  onBack: () => void;
}

const CATEGORY_COLORS: Record<string, "danger" | "warning" | "info" | "default"> = {
  error_pattern: "danger",
  validation_fail: "warning",
  rejected_assumption: "info",
  wrong_tech_choice: "danger",
};
const CATEGORY_KEYS: Record<string, string> = {
  error_pattern: "knowledgePanel.categoryLabels.errorPattern",
  validation_fail: "knowledgePanel.categoryLabels.validationFailed",
  rejected_assumption: "knowledgePanel.categoryLabels.wrongAssumption",
  wrong_tech_choice: "knowledgePanel.categoryLabels.techMistake",
};

const STAGE_KEYS: Record<string, string> = {
  analysis: "knowledgePanel.stageLabel.analysis",
  prd: "knowledgePanel.stageLabel.prd",
  ui: "knowledgePanel.stageLabel.ui",
  plan: "knowledgePanel.stageLabel.plan",
  dev: "knowledgePanel.stageLabel.dev",
  test: "knowledgePanel.stageLabel.test",
  deploy: "knowledgePanel.stageLabel.deploy",
  monitor: "knowledgePanel.stageLabel.monitor",
};

export default function KnowledgePage({ projectId, projectName, onBack }: KnowledgePageProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ProjectKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = () => {
    setLoading(true);
    api.projects.knowledge(projectId)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId]);

  const handleDelete = async (id: number) => {
    await api.projects.deleteKnowledge(projectId, id);
    setItems(prev => prev.filter(k => k.id !== id));
  };

  const filtered = filter
    ? items.filter(k =>
        k.title.toLowerCase().includes(filter.toLowerCase()) ||
        k.content.toLowerCase().includes(filter.toLowerCase()) ||
        k.stage.includes(filter)
      )
    : items;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-app flex items-center gap-3 shrink-0">
        <button
          onClick={onBack}
          className="text-app-tertiary hover:text-app transition-colors p-1 -ml-1 rounded"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-app">{t('knowledgePanel.header.title')}</h1>
          {projectName && (
            <p className="text-[10px] text-app-tertiary mt-0.5">{projectName}</p>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-5 py-3 border-b border-app shrink-0">
        <div className="max-w-2xl">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder={t('knowledgePanel.search')}
            className="w-full bg-app-secondary border border-app rounded px-3 py-2 text-xs text-app outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="px-5 py-2 border-b border-app shrink-0 flex gap-4">
        {Object.entries(CATEGORY_KEYS).map(([cat, key]) => {
          const count = items.filter(k => k.category === cat).length;
          return count > 0 ? (
            <div key={cat} className="flex items-center gap-1.5">
              <Badge variant={CATEGORY_COLORS[cat] ?? "default"}>{t(key)}</Badge>
              <span className="text-[10px] text-app-tertiary">{count}</span>
            </div>
          ) : null;
        })}
        {items.length === 0 && !loading && (
          <span className="text-[10px] text-app-tertiary">{t('knowledgePanel.stats.noRecords')}</span>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs text-app-tertiary animate-pulse">{t('common.loading')}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className="text-xs text-app-tertiary">
                {filter ? t('knowledgePanel.empty.noMatch') : t('knowledgePanel.empty.isEmpty')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-app border border-app rounded-xl overflow-hidden">
              {filtered.map((k) => (
                <KnowledgeItem key={k.id} item={k} onDelete={() => handleDelete(k.id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-2 border-t border-app shrink-0">
        <p className="text-[10px] text-app-tertiary">
          {t('knowledgePanel.footer', { count: items.length })}
        </p>
      </div>
    </div>
  );
}

function KnowledgeItem({ item, onDelete }: { item: ProjectKnowledge; onDelete: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-4 py-3 hover:bg-app-secondary/50 group">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Badge variant={CATEGORY_COLORS[item.category] ?? "default"}>
              {CATEGORY_KEYS[item.category] ? t(CATEGORY_KEYS[item.category]) : item.category}
            </Badge>
            {item.stage && (
              <span className="text-[10px] text-app-tertiary">
                {STAGE_KEYS[item.stage] ? t(STAGE_KEYS[item.stage]) : item.stage}
              </span>
            )}
          </div>
          <p className="text-[11px] font-medium text-app truncate">{item.title}</p>
          <p className={cn(
            "text-[11px] text-app-secondary mt-0.5 leading-relaxed",
            expanded ? "" : "line-clamp-2"
          )}>
            {item.content}
          </p>
          {item.content.length > 100 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-[10px] text-accent hover:underline mt-0.5"
            >
              {expanded ? t('knowledgePanel.item.collapse') : t('knowledgePanel.item.expand')}
            </button>
          )}
          <p className="text-[9px] text-app-tertiary mt-1">
            {new Date(item.created_at).toLocaleString()}
            {item.source_task_id && ` · ${t('knowledgePanel.item.sourceTask', { id: item.source_task_id })}`}
          </p>
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-[10px] text-red-400 hover:text-red-300 transition-all px-1.5 py-0.5 rounded hover:bg-red-900/20 shrink-0"
          title={t('knowledgePanel.item.deleteHint')}
        >
          {t('knowledgePanel.item.delete')}
        </button>
      </div>
    </div>
  );
}
