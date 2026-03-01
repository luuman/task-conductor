export default function Dashboard({
  onOpenTask,
}: {
  onOpenTask: (id: number) => void;
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <h1 className="text-2xl font-bold">Dashboard（Task 11 实现）</h1>
    </div>
  );
}
