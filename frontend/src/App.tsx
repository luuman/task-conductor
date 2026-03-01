import { useState } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import TaskPipeline from "./pages/TaskPipeline";

type Page =
  | { name: "dashboard" }
  | { name: "task"; taskId: number };

export default function App() {
  const [authed, setAuthed] = useState(
    () => !!localStorage.getItem("tc_token")
  );
  const [page, setPage] = useState<Page>({ name: "dashboard" });

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  if (page.name === "task") {
    return (
      <TaskPipeline
        taskId={page.taskId}
        onBack={() => setPage({ name: "dashboard" })}
      />
    );
  }

  return (
    <Dashboard
      onOpenTask={(id) => setPage({ name: "task", taskId: id })}
    />
  );
}
