import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import SingleImagePoolingPage from "./single";
import TwoImagePairPage from "./twopair";

export default function App() {
  return (
    <Router>
      <header>
        <nav>
          <Link to="/" style={{ margin: "0 10px" }}>Single Pooling</Link>
          <Link to="/pair" style={{ margin: "0 10px" }}>Two-Image Pair</Link>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<SingleImagePoolingPage />} />
          <Route
            path="/pair"
            element={<TwoImagePairPage onSubmit={() => window.location.reload()} />}
          />
        </Routes>
      </main>
    </Router>
  );
}
