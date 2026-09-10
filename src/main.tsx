// 应用入口：将 <App/> 挂载到 #root 并引入全局样式。
// App entry point — mounts <App/> onto #root and imports global styles.
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
