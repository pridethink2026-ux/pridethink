import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { LanguageProvider } from './LanguageContext';
import { BlocksProvider } from './BlocksContext';
import { AllUsersProvider } from './AllUsersContext';
import { SoundProvider } from './SoundContext';
import { MomentsProvider } from './MomentsContext';
import { ThemeProvider } from './ThemeContext';
import { initTheme } from './themes';
import reportWebVitals from './reportWebVitals';

// El tema (colores y fuentes) se aplica antes del primer render, así la
// primera pantalla ya sale con él — ver ThemeContext.jsx.
initTheme();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <AllUsersProvider>
          <BlocksProvider>
            <MomentsProvider>
              <SoundProvider>
                <App />
              </SoundProvider>
            </MomentsProvider>
          </BlocksProvider>
        </AllUsersProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
