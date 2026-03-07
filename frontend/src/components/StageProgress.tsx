import { useTranslation } from "react-i18next";

const STAGE_KEYS = ["input", "analysis", "prd", "ui", "plan", "dev", "test", "deploy", "monitor"];

export function StageProgress({
  currentStage,
  status,
}: {
  currentStage: string;
  status: string;
}) {
  const { t } = useTranslation();
  const STAGES = STAGE_KEYS.map(key => ({ key, label: t(`stageProgress.labels.${key}`) }));
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto py-2 px-1">
      {STAGES.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const isRunning = active && status === "running";

        return (
          <div key={s.key} className="flex items-center">
            <div className="flex flex-col items-center min-w-[52px]">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${done ? "bg-green-500 text-white" : ""}
                  ${active && !isRunning ? "bg-blue-500 text-white ring-2 ring-blue-300 ring-offset-1 ring-offset-gray-900" : ""}
                  ${isRunning ? "bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-1 ring-offset-gray-900 animate-pulse" : ""}
                  ${!done && !active ? "bg-gray-700 text-gray-500" : ""}
                `}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={`text-[10px] mt-1 text-center leading-tight
                  ${active ? "text-blue-400 font-medium" : done ? "text-green-400" : "text-gray-600"}
                `}
              >
                {s.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div
                className={`h-0.5 w-3 mx-0.5 shrink-0 rounded-full
                  ${i < currentIdx ? "bg-green-500" : "bg-gray-700"}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
