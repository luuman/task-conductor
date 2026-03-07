import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export function LogStream({ lines }: { lines: string[] }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={ref}
      className="bg-gray-950 border border-gray-800 rounded-xl p-4 font-mono text-xs text-green-400 h-56 overflow-y-auto"
    >
      {lines.length === 0 ? (
        <span className="text-gray-600 animate-pulse">{t('logStream.empty')}</span>
      ) : (
        lines.map((l, i) => (
          <div key={i} className="leading-5">
            {l}
          </div>
        ))
      )}
    </div>
  );
}
