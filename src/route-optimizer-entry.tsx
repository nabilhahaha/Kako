import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouteOptimizerApp } from './route-optimizer/components/RouteOptimizerApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouteOptimizerApp />
  </StrictMode>,
);
