import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import SingleImagePoolingPage from "./pages/SingleImagePoolingPage";
import TwoImagePairPage from "./pages/TwoImagePairPage";

console.log({
  Login,
  SingleImagePoolingPage,
  TwoImagePairPage,
  Navbar,
  ProtectedRoute,
});


function App() {
  return (
    <AuthProvider>
      <Router>
        <Navbar />
        <main style={{ padding: 16 }}>
          <Routes>
            <Route index element={<Login />} />
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />

            <Route
              path="/single"
              element={
                <ProtectedRoute>
                  <SingleImagePoolingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pair"
              element={
                <ProtectedRoute>
                  <TwoImagePairPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </Router>
    </AuthProvider>
  );
}

export default App;
