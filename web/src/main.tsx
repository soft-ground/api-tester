import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { LangProvider } from './i18n';
import { DialogProvider } from './components/DialogProvider';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <DialogProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DialogProvider>
    </LangProvider>
  </React.StrictMode>,
);
