import { mount } from 'svelte';
import App from './src/ui.svelte';

import { Visualizer } from './src/visualizer.js';
import { DataManager } from './src/data_manager.svelte.js';
import { SocketManager } from "./src/socket_manager.js";
import { RunManager } from './src/run_manager.svelte.js';

const dm = new DataManager();
const viz = new Visualizer(dm);
const socket = new SocketManager(dm, viz);
const rm = new RunManager(dm,viz);

socket.connect(dm.socketParams.url);

mount(App, {
	target: document.getElementById('app'),
	props: { dm, rm }
});