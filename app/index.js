//==============================================================================

import { standaloneViewer } from '../src/main.js';

//==============================================================================

const DEBUG = false;
const MINIMAP = false; // { width: '10%', background: '#FCC' };

//const MAP_ENDPOINT = 'https://mapcore-demo.org/flatmaps/';
const MAP_ENDPOINT = 'http:localhost:8000/';
//const MAP_ENDPOINT = 'https://mapcore-demo.org/devel/flatmap/v4/';   // v4 == devel


window.onload = standaloneViewer(MAP_ENDPOINT, {
    debug: DEBUG,
    minimap: MINIMAP
});

//==============================================================================
