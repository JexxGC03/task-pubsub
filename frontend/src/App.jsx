import { useEffect, useState } from "react";

const API_URL = window.location.origin;

function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("TODO");
  const [eventLog, setEventLog] = useState([]); // 👈 log de eventos SSE

  // Cargar tareas iniciales
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const res = await fetch(`${API_URL}/tasks`);
        const data = await res.json();
        setTasks(data);
      } catch (err) {
        console.error("Error cargando tareas", err);
      }
    };

    loadTasks();
  }, []);

  // Conectarse al stream SSE
  useEffect(() => {
    const source = new EventSource(`${API_URL}/events`);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Evento SSE:", data);

        // 👉 Guardamos el evento crudo en el log
        setEventLog((prev) => {
          const entry = {
            ts: new Date().toLocaleTimeString(),
            raw: event.data,
          };
          // Máximo 20 eventos
          return [entry, ...prev].slice(0, 20);
        });

        if (data.type === "TASK_CREATED" || data.type === "TASK_UPDATED") {
          const task = data.task;
          setTasks((prev) => {
            const idx = prev.findIndex((t) => t.id === task.id);
            if (idx === -1) {
              return [...prev, task]; // nueva tarea
            } else {
              const copy = [...prev];
              copy[idx] = task; // actualizar
              return copy;
            }
          });
        }
      } catch (err) {
        console.error("Error procesando evento SSE", err);
      }
    };

    source.onerror = (err) => {
      console.error("SSE error:", err);
      // podrías hacer source.close() y reconectar
    };

    return () => {
      source.close();
    };
  }, []);

  // Crear una nueva tarea
  const handleCreateTask = async (e) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    try {
      await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          status,
        }),
      });

      // Esperamos al SSE, no tocamos state aquí
      setTitle("");
      setStatus("TODO");
    } catch (err) {
      console.error("Error al crear tarea", err);
    }
  };

  // Cambiar estado de una tarea
  const handleChangeStatus = async (id, newStatus) => {
    try {
      await fetch(`${API_URL}/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      // UI se actualiza por SSE
    } catch (err) {
      console.error("Error al actualizar tarea", err);
    }
  };

  return (
    // 👇 Contenedor de página para centrar todo
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>
          Demo Publish–Subscribe: Tareas en tiempo real
        </h1>

        <p style={styles.subtitle}>
          Abre esta misma URL en <strong>dos pestañas</strong>, crea o cambia
          tareas y mira cómo se sincronizan en tiempo real.
        </p>

        <form onSubmit={handleCreateTask} style={styles.form}>
          <input
            type="text"
            placeholder="Título de la tarea"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={styles.input}
            required
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={styles.select}
          >
            <option value="TODO">TODO</option>
            <option value="DOING">DOING</option>
            <option value="DONE">DONE</option>
          </select>
          <button type="submit" style={styles.button}>
            Crear
          </button>
        </form>

        <h2>Lista de tareas</h2>
        <ul style={styles.list}>
          {tasks.map((task) => (
            <li key={task.id} style={styles.listItem}>
              <div>
                <span style={styles.taskTitle}>{task.title}</span>
                <span style={styles.status}>[{task.status}]</span>
              </div>
              <select
                value={task.status}
                onChange={(e) =>
                  handleChangeStatus(task.id, e.target.value)
                }
                style={styles.select}
              >
                <option value="TODO">TODO</option>
                <option value="DOING">DOING</option>
                <option value="DONE">DONE</option>
              </select>
            </li>
          ))}
        </ul>

        {/* 👇 Log visual de eventos SSE */}
        <h2 style={{ marginTop: "24px" }}>Log de eventos SSE</h2>
        <div style={styles.logBox}>
          {eventLog.length === 0 ? (
            <p style={styles.logEmpty}>
              Aún no hay eventos... crea o modifica una tarea para verlos aquí.
            </p>
          ) : (
            <ul style={styles.logList}>
              {eventLog.map((entry, idx) => (
                <li key={idx} style={styles.logItem}>
                  <div style={styles.logHeader}>{entry.ts}</div>
                  <code style={styles.logCode}>{entry.raw}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Estilos inline
const styles = {
  // 👇 Contenedor de página para centrar todo
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center", // centra horizontal
    alignItems: "flex-start", // puedes usar "center" si quieres vertical también
    padding: "40px 16px",
    backgroundColor: "#111", // fondo oscuro
    color: "#f5f5f5",
  },
  container: {
    fontFamily: "system-ui, sans-serif",
    maxWidth: "800px",
    width: "100%",
  },
  title: {
    textAlign: "center",
    marginBottom: "8px",
  },
  subtitle: {
    textAlign: "center",
    marginBottom: "24px",
  },
  form: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
  },
  input: {
    flex: 1,
    padding: "6px 8px",
  },
  select: {
    padding: "6px 8px",
  },
  button: {
    padding: "6px 12px",
    cursor: "pointer",
  },
  list: {
    listStyle: "none",
    padding: 0,
  },
  listItem: {
    padding: "8px",
    border: "1px solid #444",
    borderRadius: "4px",
    marginBottom: "6px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1e1e1e",
  },
  taskTitle: {
    fontWeight: 600,
    marginRight: "8px",
  },
  status: {
    fontSize: "0.9rem",
    color: "#ccc",
  },
  // Estilos del log de eventos
  logBox: {
    marginTop: "8px",
    padding: "8px",
    borderRadius: "4px",
    backgroundColor: "#181818",
    border: "1px solid #333",
    maxHeight: "220px",
    overflowY: "auto",
  },
  logEmpty: {
    fontSize: "0.9rem",
    color: "#aaa",
  },
  logList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  logItem: {
    marginBottom: "6px",
    paddingBottom: "6px",
    borderBottom: "1px dashed #333",
  },
  logHeader: {
    fontSize: "0.8rem",
    color: "#999",
    marginBottom: "2px",
  },
  logCode: {
    fontFamily: "monospace",
    fontSize: "0.85rem",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
};

export default App;
