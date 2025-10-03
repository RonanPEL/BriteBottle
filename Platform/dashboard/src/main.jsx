import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import ErrorBoundary from "./ErrorBoundary";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import "./index.css";

function Splash(){
  return (
    <div style={{minHeight:"100vh", display:"grid", placeItems:"center"}}>
      <div style={{color:"#64748b"}}>Loading…</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<Splash />}>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);
