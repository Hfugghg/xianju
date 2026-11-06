import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import './shared/styles.css';
import { App } from './app/App';
const theme = createTheme({primaryColor:'forest',colors:{forest:['#edf5ef','#d5e7dc','#aecdbb','#85b29b','#629a80','#49896c','#35765a','#24644a','#18543d','#104530']},fontFamily:'"Microsoft YaHei", "PingFang SC", sans-serif',defaultRadius:'md'});
createRoot(document.getElementById('root')!).render(<React.StrictMode><MantineProvider theme={theme}><App/></MantineProvider></React.StrictMode>);
