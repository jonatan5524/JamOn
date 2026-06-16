import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerGlobalErrorHandlers } from "./lib/global-error-handlers";

registerGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(<App />);
