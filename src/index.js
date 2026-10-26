import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import Root from './Root';
import { LanguageProvider } from './LanguageContext';
import { ThemeProvider } from './ThemeContext';
import { initTheme } from './themes';
import reportWebVitals from './reportWebVitals';

// El tema (colores y fuentes) se aplica antes del primer render, así la
// primera pantalla ya sale con él — ver ThemeContext.jsx.
initTheme();

// Los proveedores que solo sirven con sesión (usuarios, bloqueos,
// momentos, sonidos) los monta Root.jsx junto con la app.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <Root />
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
