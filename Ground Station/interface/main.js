import { mount } from 'svelte';
import App from './src/ui.svelte';

import { Interface } from './src/interface.js';
import { DataManager } from './src/data_manager.svelte.js';
import { SocketManager } from "./src/socket_manager.js";

const dm = new DataManager();
const itf = new Interface(dm);
const socket = new SocketManager(dm);

socket.connect(dm.socketParams.url);

mount(App, {
	target: document.getElementById('app'),
	props: { dm }
});