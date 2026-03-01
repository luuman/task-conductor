export default function TaskPipeline({
  taskId,
  onBack,
}: {
  taskId: number;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <button onClick={onBack} className="text-gray-400 mb-4">
        ← 返回
      </button>
      <h1 className="text-2xl font-bold">TaskPipeline #{taskId}（Task 12 实现）</h1>
    </div>
  );
}
