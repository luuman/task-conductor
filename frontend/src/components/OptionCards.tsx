import { useTranslation } from "react-i18next";
import type { AnalysisOption } from "../lib/api";

export function OptionCards({
  options,
  onSelect,
  recommended,
}: {
  options: AnalysisOption[];
  onSelect: (label: string) => void;
  recommended?: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {options.map((opt) => (
        <div
          key={opt.label}
          className={`bg-gray-800 rounded-xl p-4 space-y-3 border transition cursor-pointer
            ${opt.label === recommended
              ? "border-blue-500/60 hover:border-blue-400"
              : "border-gray-700 hover:border-gray-500"
            }
          `}
        >
          <div className="flex justify-between items-start">
            <span className="text-xl font-bold text-white">方案 {opt.label}</span>
            {opt.label === recommended && (
              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                AI 推荐
              </span>
            )}
          </div>
          <p className="font-medium text-gray-100 text-sm">{opt.title}</p>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
              工作量 {opt.effort}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                opt.risk === "低"
                  ? "bg-green-900 text-green-300"
                  : opt.risk === "中"
                  ? "bg-yellow-900 text-yellow-300"
                  : "bg-red-900 text-red-300"
              }`}
            >
              风险 {opt.risk}
            </span>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed">{opt.description}</p>
          <button
            onClick={() => {
              if (
                window.confirm(
                  `确认选择方案 ${opt.label}：${opt.title}？\n\n此操作确认后不可撤销。`
                )
              ) {
                onSelect(opt.label);
              }
            }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium transition mt-1"
          >
            选择此方案
          </button>
        </div>
      ))}
    </div>
  );
}
